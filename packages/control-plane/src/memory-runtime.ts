import { writeFileSync, mkdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { InMemoryAuthentik, type AuthentikClient } from "@blakid/authentik";
import { AUTHENTIK_VERSION, DEFAULT_REGION, PASSKEY_ENROL_SLUG, TOTP_ENROL_SLUG, authentikFlowUrl } from "@blakid/config";
import type { BackupResult, Organisation, TenantRuntime } from "./types.ts";

export class MemoryTenantRuntime implements TenantRuntime {
  readonly clients = new Map<string, InMemoryAuthentik>();
  readonly lastDump = new Map<string, { path: string; bytes: number }>();
  private backupRoot: string | null;

  constructor(
    private readonly ids: () => string,
    private readonly now: () => Date,
    backupRoot?: string,
  ) {
    this.backupRoot = backupRoot ?? null;
  }

  async provision(organisation: Organisation) {
    const baseUrl = `https://${organisation.hostname}`;
    const client = new InMemoryAuthentik(baseUrl, AUTHENTIK_VERSION, this.ids, this.now);
    this.clients.set(organisation.id, client);
    return {
      client,
      deployment: {
        authentikUrl: baseUrl,
        authentikVersion: AUTHENTIK_VERSION,
        postgresName: `blakid_${organisation.slug}_identity`,
        composeProject: `blakid-${organisation.slug}`,
        status: "healthy" as const,
        lastBackupAt: null,
        lastBackupStatus: null,
        lastRestoreTestAt: null,
        lastRestoreTestStatus: null,
        signingKeyCreatedAt: this.now().toISOString(),
        certificateExpiresAt: new Date(this.now().getTime() + 1000 * 60 * 60 * 24 * 90).toISOString(),
        httpPort: null,
      },
    };
  }

  clientFor(organisationId: string): AuthentikClient {
    const client = this.clients.get(organisationId);
    if (!client) throw new Error(`No identity stack for organisation ${organisationId}`);
    return client;
  }

  memory(organisationId: string): InMemoryAuthentik {
    const client = this.clients.get(organisationId);
    if (!client) throw new Error(`No identity stack for organisation ${organisationId}`);
    return client;
  }

  passkeyEnrolmentUrl(organisationId: string): string {
    return authentikFlowUrl(this.clientFor(organisationId).baseUrl, PASSKEY_ENROL_SLUG);
  }

  totpEnrolmentUrl(organisationId: string): string {
    return authentikFlowUrl(this.clientFor(organisationId).baseUrl, TOTP_ENROL_SLUG);
  }

  async backup(organisationId: string): Promise<BackupResult> {
    const client = this.memory(organisationId);
    const users = await client.listUsers();
    const payload = JSON.stringify({ organisationId, users, at: this.now().toISOString() }, null, 2);
    const dir = join(this.backupRoot ?? join(process.cwd(), "data", "memory-backups"), organisationId);
    mkdirSync(dir, { recursive: true });
    const path = join(dir, `${this.now().toISOString().replaceAll(":", "-")}.json`);
    writeFileSync(path, payload);
    this.lastDump.set(organisationId, { path, bytes: payload.length });
    return {
      at: this.now().toISOString(),
      status: "healthy",
      region: DEFAULT_REGION,
      engine: "directory_export",
      bytes: payload.length,
      path,
    };
  }

  async restoreTest(organisationId: string) {
    const dump = this.lastDump.get(organisationId);
    if (!dump || !existsSync(dump.path) || dump.bytes < 2) {
      const result = await this.backup(organisationId);
      const parsed = JSON.parse(readFileSync(result.path!, "utf8")) as { users: unknown[] };
      if (!Array.isArray(parsed.users)) throw new Error("directory export restore test failed");
      return { at: this.now().toISOString(), status: "PASS" as const, engine: "directory_export" };
    }
    const parsed = JSON.parse(readFileSync(dump.path, "utf8")) as { users: unknown[] };
    if (!Array.isArray(parsed.users)) {
      return { at: this.now().toISOString(), status: "FAIL" as const, engine: "directory_export" };
    }
    return { at: this.now().toISOString(), status: "PASS" as const, engine: "directory_export" };
  }

  async health(organisationId: string) {
    return this.clientFor(organisationId).health();
  }
}
