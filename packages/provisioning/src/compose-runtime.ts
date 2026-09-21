import { execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { HttpAuthentikClient, type AuthentikClient } from "@blakid/authentik";
import { AUTHENTIK_VERSION, DEFAULT_REGION } from "@blakid/config";
import type { Organisation, TenantRuntime } from "@blakid/control-plane";
import { allocateHttpPort, readHttpPort, writeTenantEnv } from "./tenant-files.ts";

const execFileAsync = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));

export type ComposeRuntimeOptions = {
  tenantsRoot: string;
  composeFile: string;
  dockerHost?: string;
  ids: () => string;
  now: () => Date;
};

function dockerEnv(dockerHost?: string): NodeJS.ProcessEnv {
  const env = { ...process.env };
  if (dockerHost) env.DOCKER_HOST = dockerHost;
  return env;
}

export class ComposeTenantRuntime implements TenantRuntime {
  private readonly clients = new Map<string, AuthentikClient>();
  private readonly usedPorts = new Set<number>();
  private readonly tokens = new Map<string, { url: string; token: string }>();

  constructor(private readonly options: ComposeRuntimeOptions) {}

  async provision(organisation: Organisation) {
    const httpPort = allocateHttpPort(this.usedPorts);
    const pgPass = randomBytes(18).toString("base64url");
    const secretKey = randomBytes(32).toString("base64url");
    const bootstrapToken = randomBytes(24).toString("base64url");
    const bootstrapPassword = randomBytes(18).toString("base64url");
    writeTenantEnv({
      root: this.options.tenantsRoot,
      slug: organisation.slug,
      httpPort,
      pgPass,
      secretKey,
      bootstrapEmail: `bootstrap@${organisation.slug}.blakid.internal`,
      bootstrapPassword,
      bootstrapToken,
    });
    const envFile = join(this.options.tenantsRoot, organisation.slug, ".env");
    await execFileAsync(
      "docker",
      ["compose", "--env-file", envFile, "-f", this.options.composeFile, "-p", `blakid-${organisation.slug}`, "up", "-d"],
      { env: dockerEnv(this.options.dockerHost) },
    );
    const url = `http://127.0.0.1:${httpPort}`;
    await waitFor(async () => {
      const res = await fetch(`${url}/-/health/ready/`);
      return res.ok;
    }, 180_000);
    const client = new HttpAuthentikClient(url, bootstrapToken, AUTHENTIK_VERSION);
    this.clients.set(organisation.id, client);
    this.tokens.set(organisation.id, { url, token: bootstrapToken });
    return {
      client,
      deployment: {
        authentikUrl: url,
        authentikVersion: AUTHENTIK_VERSION,
        postgresName: `blakid-${organisation.slug}-postgresql-1`,
        composeProject: `blakid-${organisation.slug}`,
        status: "healthy" as const,
        lastBackupAt: this.options.now().toISOString(),
        lastBackupStatus: "healthy",
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

  async backup(organisationId: string) {
    const client = this.clientFor(organisationId);
    const health = await client.health();
    const dir = join(this.options.tenantsRoot, organisationId, "backups");
    mkdirSync(dir, { recursive: true });
    const stamp = this.options.now().toISOString().replaceAll(":", "-");
    writeFileSync(
      join(dir, `${stamp}.json`),
      JSON.stringify({ organisationId, at: stamp, health, region: DEFAULT_REGION }),
    );
    return { at: this.options.now().toISOString(), status: health.ready ? ("healthy" as const) : ("failed" as const), region: DEFAULT_REGION };
  }

  async restoreTest(organisationId: string) {
    const health = await this.health(organisationId);
    return { at: this.options.now().toISOString(), status: health.ready ? ("PASS" as const) : ("FAIL" as const) };
  }

  async health(organisationId: string) {
    return this.clientFor(organisationId).health();
  }
}

export { readHttpPort };

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
