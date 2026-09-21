import { InMemoryAuthentik, type AuthentikClient } from "@blakid/authentik";
import { AUTHENTIK_VERSION, DEFAULT_REGION } from "@blakid/config";
import type { Organisation, TenantRuntime } from "./types.ts";

export class MemoryTenantRuntime implements TenantRuntime {
  readonly clients = new Map<string, InMemoryAuthentik>();

  constructor(
    private readonly ids: () => string,
    private readonly now: () => Date,
  ) {}

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
        lastBackupAt: this.now().toISOString(),
        lastBackupStatus: "healthy",
        lastRestoreTestAt: this.now().toISOString(),
        lastRestoreTestStatus: "PASS",
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

  async backup(organisationId: string) {
    this.clientFor(organisationId);
    return { at: this.now().toISOString(), status: "healthy" as const, region: DEFAULT_REGION };
  }

  async restoreTest(organisationId: string) {
    this.clientFor(organisationId);
    return { at: this.now().toISOString(), status: "PASS" as const };
  }

  async health(organisationId: string) {
    return this.clientFor(organisationId).health();
  }
}
