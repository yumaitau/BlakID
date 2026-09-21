import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { HttpAuthentikClient } from "../../packages/authentik/src/index.ts";
import { AUTHENTIK_VERSION } from "../../packages/config/src/index.ts";
import { BlakID, createTestPrincipal } from "../../packages/control-plane/src/index.ts";
import { MemoryStore } from "../../packages/control-plane/src/memory-store.ts";
import { ComposeTenantRuntime } from "../../packages/provisioning/src/compose-runtime.ts";

const dockerOk = process.env.BLAKID_INTEGRATION === "1";

describe.skipIf(!dockerOk)("authentik dedicated stacks", () => {
  it("provisions two organisations, completes OIDC discovery, and isolates tenants", async () => {
    const ids = () => randomBytes(8).toString("hex");
    const now = () => new Date();
    const root = join(tmpdir(), "blakid-tenants", ids());
    mkdirSync(root, { recursive: true });
    const runtime = new ComposeTenantRuntime({
      tenantsRoot: root,
      composeFile: join(process.cwd(), "infrastructure/docker/authentik-tenant.yaml"),
      dockerHost: process.env.BLAKID_DOCKER_HOST,
      ids,
      now,
    });
    const app = new BlakID({ store: new MemoryStore(), runtime, ids, now });
    const operator = createTestPrincipal({ role: "YUMA_PLATFORM_OPERATOR", organisationId: null });

    const a = await app.provisionOrganisation(operator, {
      name: "Community A",
      slug: `ca${ids().slice(0, 6)}`,
      adminEmail: "owner-a@a.test",
      adminName: "Owner A",
    });
    const b = await app.provisionOrganisation(operator, {
      name: "Community B",
      slug: `cb${ids().slice(0, 6)}`,
      adminEmail: "owner-b@b.test",
      adminName: "Owner B",
    });

    const ownerA = createTestPrincipal({
      role: "ORGANISATION_OWNER",
      organisationId: a.organisation.id,
      actorId: a.invitation.userId,
    });
    const ownerB = createTestPrincipal({
      role: "ORGANISATION_OWNER",
      organisationId: b.organisation.id,
      actorId: b.invitation.userId,
    });

    const oidc = await app.createOidcApplication(ownerA, a.organisation.id, {
      name: "RangerOS",
      slug: "rangeros",
      redirectUris: ["https://app.rangeros.com.au/auth/callback"],
      logoutUri: "https://app.rangeros.com.au/logout",
    });
    expect(oidc.clientId).toBeTruthy();
    expect(oidc.clientSecret).toBeTruthy();

    const clientA = runtime.clientFor(a.organisation.id) as HttpAuthentikClient;
    const discovery = await clientA.getOidcDiscovery("rangeros");
    expect(discovery.issuer).toContain("/application/o/rangeros/");
    expect(discovery.code_challenge_methods_supported).toContain("S256");
    expect(discovery.grant_types_supported).toEqual(expect.arrayContaining(["authorization_code", "refresh_token"]));
    const jwks = await clientA.getJwks("rangeros");
    expect(jwks.keys.length).toBeGreaterThan(0);

    const tokenRes = await fetch(discovery.token_endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: oidc.clientId,
        client_secret: oidc.clientSecret,
        scope: "openid",
      }),
    });
    expect(tokenRes.ok).toBe(true);
    const tokenJson = (await tokenRes.json()) as { access_token?: string };
    expect(tokenJson.access_token).toBeTruthy();

    const user = await app.inviteUser(ownerA, a.organisation.id, {
      email: "josh@a.test",
      name: "Josh",
      password: "a-very-long-passphrase",
    });
    await app.activateUser(ownerA, a.organisation.id, user.id);
    await app.suspendUser(ownerA, a.organisation.id, user.id);
    const sessions = await app.listSessions(ownerA, a.organisation.id, user.id);
    expect(sessions).toEqual([]);

    await expect(app.listUsers(ownerA, b.organisation.id)).rejects.toThrow();
    await expect(app.listUsers(ownerB, a.organisation.id)).rejects.toThrow();
    expect(AUTHENTIK_VERSION).toBe("2026.8.3");
  }, 300_000);
});
