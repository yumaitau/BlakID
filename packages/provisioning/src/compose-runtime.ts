import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync, readdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  ensureAuthenticatorEnrolment,
  requireEnrolmentFlow,
  HttpAuthentikClient,
  type AuthentikClient,
} from "@blakid/authentik";
import {
  AUTHENTIK_VERSION,
  DEFAULT_REGION,
  PASSKEY_ENROL_SLUG,
  TOTP_ENROL_SLUG,
  authentikFlowUrl,
} from "@blakid/config";
import type { BackupResult, Organisation, TenantRuntime } from "@blakid/control-plane";
import { allocateHttpPort, tenantDir, writeTenantEnv } from "./tenant-files.ts";

const here = dirname(fileURLToPath(import.meta.url));

export type ExecResult = { stdout: string; stderr: string };
export type ComposeExec = (
  file: string,
  args: string[],
  opts?: { env?: NodeJS.ProcessEnv; input?: string },
) => Promise<ExecResult>;

export type TenantRecord = {
  organisationId: string;
  slug: string;
  project: string;
  envFile: string;
  httpPort: number;
  url: string;
  token: string;
};

export type ComposeRuntimeOptions = {
  tenantsRoot: string;
  composeFile: string;
  dockerHost?: string;
  tenantHost?: string;
  ids: () => string;
  now: () => Date;
  exec?: ComposeExec;
  enrol?: (url: string, token: string) => Promise<unknown>;
  waitReady?: (url: string, token: string) => Promise<void>;
  startingHttpPort?: number;
};

function dockerEnv(dockerHost?: string): NodeJS.ProcessEnv {
  const env = { ...process.env };
  if (dockerHost) env.DOCKER_HOST = dockerHost;
  return env;
}

export function tenantHostFromDocker(dockerHost?: string, explicit?: string): string {
  if (explicit) return explicit;
  if (dockerHost?.startsWith("ssh://")) {
    try {
      return new URL(dockerHost).hostname;
    } catch {
      return "127.0.0.1";
    }
  }
  return "127.0.0.1";
}

const defaultExec: ComposeExec = (file, args, opts) =>
  new Promise((resolve, reject) => {
    const child = spawn(file, args, { env: opts?.env });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${file} ${args.join(" ")} exited ${code}: ${stderr.slice(0, 400)}`));
    });
    if (opts?.input) child.stdin.end(opts.input);
    else child.stdin.end();
  });

export class ComposeTenantRuntime implements TenantRuntime {
  private readonly clients = new Map<string, AuthentikClient>();
  private readonly tenants = new Map<string, TenantRecord>();
  private readonly usedPorts = new Set<number>();
  private readonly exec: ComposeExec;

  constructor(private readonly options: ComposeRuntimeOptions) {
    this.exec = options.exec ?? defaultExec;
  }

  registerTenant(record: TenantRecord, client?: AuthentikClient) {
    this.tenants.set(record.organisationId, record);
    this.usedPorts.add(record.httpPort);
    if (client) this.clients.set(record.organisationId, client);
  }

  tenant(organisationId: string): TenantRecord {
    const rec = this.tenants.get(organisationId);
    if (!rec) throw new Error(`No identity stack for organisation ${organisationId}`);
    return rec;
  }

  async provision(organisation: Organisation) {
    const httpPort = allocateHttpPort(this.usedPorts, this.options.startingHttpPort ?? 19100);
    const pgPass = randomBytes(18).toString("base64url");
    const secretKey = randomBytes(32).toString("base64url");
    const bootstrapToken = randomBytes(24).toString("base64url");
    const bootstrapPassword = randomBytes(18).toString("base64url");
    const blueprintsDir = await this.resolveBlueprintsDir();
    writeTenantEnv({
      root: this.options.tenantsRoot,
      slug: organisation.slug,
      httpPort,
      pgPass,
      secretKey,
      bootstrapEmail: `bootstrap@${organisation.slug}.blakid.internal`,
      bootstrapPassword,
      bootstrapToken,
      blueprintsDir,
    });
    const envFile = join(this.options.tenantsRoot, organisation.slug, ".env");
    await this.exec(
      "docker",
      ["compose", "--env-file", envFile, "-f", this.options.composeFile, "-p", `blakid-${organisation.slug}`, "up", "-d"],
      { env: dockerEnv(this.options.dockerHost) },
    );
    const host = tenantHostFromDocker(this.options.dockerHost, this.options.tenantHost);
    const url = `http://${host}:${httpPort}`;
    const waitReady =
      this.options.waitReady ??
      (async (readyUrl: string, token: string) => {
        await waitFor(async () => {
          const res = await fetch(`${readyUrl}/-/health/ready/`);
          return res.ok;
        }, 180_000);
        await waitFor(async () => {
          const res = await fetch(`${readyUrl}/api/v3/core/users/me/`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          return res.ok;
        }, 120_000);
      });
    await waitReady(url, bootstrapToken);
    const client = new HttpAuthentikClient(url, bootstrapToken, AUTHENTIK_VERSION);
    const enrol = this.options.enrol ?? ensureAuthenticatorEnrolment;
    await enrol(url, bootstrapToken);
    await requireEnrolmentFlow(url, bootstrapToken);
    const record: TenantRecord = {
      organisationId: organisation.id,
      slug: organisation.slug,
      project: `blakid-${organisation.slug}`,
      envFile,
      httpPort,
      url,
      token: bootstrapToken,
    };
    this.registerTenant(record, client);
    return {
      client,
      deployment: {
        authentikUrl: url,
        authentikVersion: AUTHENTIK_VERSION,
        postgresName: `blakid-${organisation.slug}-postgresql-1`,
        composeProject: record.project,
        status: "healthy" as const,
        lastBackupAt: null,
        lastBackupStatus: null,
        lastRestoreTestAt: null,
        lastRestoreTestStatus: null,
        signingKeyCreatedAt: this.options.now().toISOString(),
        certificateExpiresAt: new Date(this.options.now().getTime() + 90 * 86400000).toISOString(),
        httpPort: String(httpPort),
      },
    };
  }

  clientFor(organisationId: string): AuthentikClient {
    const client = this.clients.get(organisationId);
    if (!client) throw new Error(`No identity stack for organisation ${organisationId}`);
    return client;
  }

  registerClient(organisationId: string, client: AuthentikClient) {
    this.clients.set(organisationId, client);
  }

  passkeyEnrolmentUrl(organisationId: string): string {
    return authentikFlowUrl(this.tenant(organisationId).url, PASSKEY_ENROL_SLUG);
  }

  totpEnrolmentUrl(organisationId: string): string {
    return authentikFlowUrl(this.tenant(organisationId).url, TOTP_ENROL_SLUG);
  }

  async resolveBlueprintsDir(): Promise<string> {
    const local = join(dirname(this.options.composeFile), "blueprints");
    const dockerHost = this.options.dockerHost;
    if (!dockerHost?.startsWith("ssh://")) return local;
    const parsed = new URL(dockerHost);
    const dest = parsed.username ? `${parsed.username}@${parsed.hostname}` : parsed.hostname;
    const home = (await this.exec("ssh", [dest, "printenv", "HOME"])).stdout.trim();
    if (!home) throw new Error(`remote docker host ${dest} has no HOME`);
    const remote = `${home}/blakid/blueprints`;
    await this.exec("ssh", [dest, "mkdir", "-p", remote]);
    const files = existsSync(local)
      ? readdirSync(local).filter((name) => name.endsWith(".yaml")).map((name) => join(local, name))
      : [];
    if (files.length > 0) {
      await this.exec("scp", [...files, `${dest}:${remote}/`]);
    }
    return remote;
  }

  composeArgs(rec: TenantRecord, extra: string[]): string[] {
    return ["compose", "--env-file", rec.envFile, "-f", this.options.composeFile, "-p", rec.project, ...extra];
  }

  async backup(organisationId: string): Promise<BackupResult> {
    const rec = this.tenant(organisationId);
    const dump = await this.exec("docker", this.composeArgs(rec, ["exec", "-T", "postgresql", "pg_dump", "-U", "authentik", "--no-owner", "authentik"]), {
      env: dockerEnv(this.options.dockerHost),
    });
    if (!isUsablePgDump(dump.stdout)) {
      throw new Error(`pg_dump produced unusable output (${dump.stdout.length} bytes) ${dump.stderr.slice(0, 200)}`);
    }
    const dir = join(tenantDir(this.options.tenantsRoot, rec.slug), "backups");
    mkdirSync(dir, { recursive: true });
    const stamp = this.options.now().toISOString().replaceAll(":", "-");
    const path = join(dir, `${stamp}.sql`);
    writeFileSync(path, dump.stdout);
    return {
      at: this.options.now().toISOString(),
      status: "healthy",
      region: DEFAULT_REGION,
      engine: "pg_dump",
      bytes: dump.stdout.length,
      path,
    };
  }

  async restoreTest(organisationId: string) {
    const rec = this.tenant(organisationId);
    const dir = join(tenantDir(this.options.tenantsRoot, rec.slug), "backups");
    if (!existsSync(dir)) await this.backup(organisationId);
    const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".sql")).sort() : [];
    const latest = files.at(-1);
    if (!latest) {
      return { at: this.options.now().toISOString(), status: "FAIL" as const, engine: "pg_dump" };
    }
    const sql = readFileSync(join(dir, latest), "utf8");
    const db = "authentik_restore_test";
    const env = dockerEnv(this.options.dockerHost);
    await this.exec("docker", this.composeArgs(rec, ["exec", "-T", "postgresql", "psql", "-U", "authentik", "-d", "postgres", "-c", `DROP DATABASE IF EXISTS ${db};`]), { env }).catch(() => ({ stdout: "", stderr: "" }));
    await this.exec("docker", this.composeArgs(rec, ["exec", "-T", "postgresql", "psql", "-U", "authentik", "-d", "postgres", "-c", `CREATE DATABASE ${db};`]), { env });
    await this.exec("docker", this.composeArgs(rec, ["exec", "-T", "postgresql", "psql", "-U", "authentik", "-d", db, "-v", "ON_ERROR_STOP=1"]), { env, input: sql });
    await this.exec("docker", this.composeArgs(rec, ["exec", "-T", "postgresql", "psql", "-U", "authentik", "-d", "postgres", "-c", `DROP DATABASE ${db};`]), { env });
    return { at: this.options.now().toISOString(), status: "PASS" as const, engine: "pg_dump" };
  }

  async health(organisationId: string) {
    return this.clientFor(organisationId).health();
  }

  async teardown(organisationId: string) {
    const rec = this.tenant(organisationId);
    await this.exec("docker", this.composeArgs(rec, ["down", "-v", "--remove-orphans"]), {
      env: dockerEnv(this.options.dockerHost),
    });
  }
}

export { readHttpPort } from "./tenant-files.ts";

/** A healthy tenant dump must be a real pg_dump, not an arbitrary long string. */
export function isUsablePgDump(stdout: string): boolean {
  return stdout.includes("PostgreSQL database dump");
}

async function waitFor(check: () => Promise<boolean>, timeoutMs: number) {
  const start = Date.now();
  let lastError: unknown;
  while (Date.now() - start < timeoutMs) {
    try {
      if (await check()) return;
    } catch (error) {
      lastError = error;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`Timed out waiting for authentik to become ready: ${lastError instanceof Error ? lastError.message : ""}`);
}

export const defaultComposeFile = join(here, "../../../infrastructure/docker/authentik-tenant.yaml");
