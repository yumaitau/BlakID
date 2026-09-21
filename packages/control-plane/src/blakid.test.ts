import { describe, expect, it } from "vitest";
import { ForbiddenError, TenantIsolationError } from "@blakid/authz";
import { InvalidTransitionError } from "@blakid/identity";
import { BlakID } from "./blakid.ts";
import { MemoryStore } from "./memory-store.ts";
import { MemoryTenantRuntime } from "./memory-runtime.ts";
import { createTestPrincipal } from "./test-principal.ts";

function system() {
  let n = 0;
  const ids = () => {
    n += 1;
    return `id-${n}`;
  };
  const now = () => new Date("2026-09-22T05:00:00.000Z");
  const store = new MemoryStore();
  const runtime = new MemoryTenantRuntime(ids, now);
  const app = new BlakID({ store, runtime, ids, now });
  return { app, runtime, store };
}

describe("BlakID control plane vertical slice", () => {
  it("provisions isolated organisations, manages lifecycle, OIDC, audit, and support access", async () => {
    const { app, runtime } = system();
    const operator = createTestPrincipal({ role: "YUMA_PLATFORM_OPERATOR", organisationId: null });

    const communityA = await app.provisionOrganisation(operator, {
      name: "Community A",
      slug: "community-a",
      adminEmail: "owner-a@community-a.test",
      adminName: "Owner A",
    });
    const communityB = await app.provisionOrganisation(operator, {
      name: "Community B",
      slug: "community-b",
      adminEmail: "owner-b@community-b.test",
      adminName: "Owner B",
    });

    expect(communityA.organisation.hostname).toBe("community-a.id.blakid.au");
    expect(communityA.organisation.region).toBe("ap-southeast-2");
    expect(communityA.organisation.hostingModel).toBe("blakid_australian_cloud");
    expect(communityA.organisation.status).toBe("ready");

    const ownerA = createTestPrincipal({
      role: "ORGANISATION_OWNER",
      organisationId: communityA.organisation.id,
      actorId: communityA.invitation.userId,
      email: "owner-a@community-a.test",
    });
    const ownerB = createTestPrincipal({
      role: "ORGANISATION_OWNER",
      organisationId: communityB.organisation.id,
      actorId: communityB.invitation.userId,
      email: "owner-b@community-b.test",
    });

    const enrol = await app.passkeyEnrolment(ownerA, communityA.organisation.id);
    expect(enrol.engine).toBe("authentik");
    expect(enrol.url).toContain("/if/flow/blakid-passkey-enrol/");
    expect(enrol.totpUrl).toContain("/if/flow/blakid-totp-enrol/");
    const dump = await app.backup(operator, communityA.organisation.id);
    expect(dump.engine).toBe("directory_export");
    expect(dump.bytes).toBeGreaterThan(10);
    expect(dump.path).toBeTruthy();
    const restore = await app.restoreTest(operator, communityA.organisation.id);
    expect(restore.status).toBe("PASS");

    await expect(app.inviteUser(operator, communityA.organisation.id, {
      email: "josh@community-a.test",
      name: "Josh",
    })).rejects.toThrow(TenantIsolationError);

    const josh = await app.inviteUser(ownerA, communityA.organisation.id, {
      email: "josh@community-a.test",
      name: "Josh",
      password: "correct-horse-battery",
      assertions: [
        {
          attribute: "community_member",
          value: true,
          issuer: "Community A",
          issued_at: "2026-09-22T05:00:00.000Z",
          expires_at: null,
          assurance: "organisation_verified",
        },
      ],
    });
    expect(josh.state).toBe("INVITED");

    const activated = await app.activateUser(ownerA, communityA.organisation.id, josh.id);
    expect(activated.state).toBe("ACTIVE");

    const memory = runtime.memory(communityA.organisation.id);
    const loggedIn = await app.loginWithPassword(communityA.organisation.id, "josh@community-a.test", "correct-horse-battery", {
      sourceIp: "203.0.113.10",
      userAgent: "vitest",
      requestId: "req-login",
    });
    expect(loggedIn.session.userId).toBe(josh.id);
    expect((await memory.listSessions(josh.id)).map((s) => s.id)).toContain(loggedIn.session.id);

    const oidc = await app.createOidcApplication(ownerA, communityA.organisation.id, {
      name: "RangerOS",
      slug: "rangeros",
      redirectUris: ["https://app.rangeros.com.au/auth/callback"],
      logoutUri: "https://app.rangeros.com.au/auth/logout",
    });
    expect(oidc.clientId).toBeTruthy();
    expect(oidc.clientSecret).toBeTruthy();
    expect(oidc.issuerUrl).toContain("/application/o/rangeros/");
    expect(oidc.discoveryUrl).toContain("/.well-known/openid-configuration");
    expect(oidc.redirectUris).toContain("https://app.rangeros.com.au/auth/callback");
    expect(oidc.logoutUri).toBe("https://app.rangeros.com.au/auth/logout");

    const discovery = await memory.getOidcDiscovery("rangeros");
    expect(discovery.issuer).toBe(oidc.issuerUrl);
    expect(discovery.code_challenge_methods_supported).toContain("S256");
    expect(discovery.grant_types_supported).toContain("authorization_code");
    expect(discovery.grant_types_supported).toContain("refresh_token");
    expect(discovery.grant_types_supported).toContain("client_credentials");
    expect(discovery.jwks_uri).toBeTruthy();
    const jwks = await memory.getJwks("rangeros");
    expect(jwks.keys.length).toBeGreaterThan(0);

    await expect(app.listUsers(ownerA, communityB.organisation.id)).rejects.toThrow(TenantIsolationError);
    await expect(app.getUser(ownerB, communityA.organisation.id, josh.id)).rejects.toThrow(TenantIsolationError);

    const suspended = await app.suspendUser(ownerA, communityA.organisation.id, josh.id);
    expect(suspended.state).toBe("SUSPENDED");
    expect(suspended.isActive).toBe(false);
    expect(await memory.listSessions(josh.id)).toEqual([]);
    await expect(memory.createSession({ userId: josh.id })).rejects.toThrow(/not active/);
    await expect(
      app.loginWithPassword(communityA.organisation.id, "josh@community-a.test", "correct-horse-battery"),
    ).rejects.toThrow(/not active/);

    const restored = await app.restoreUser(ownerA, communityA.organisation.id, josh.id);
    expect(restored.state).toBe("ACTIVE");
    await expect(
      app.purgeUser(ownerA, communityA.organisation.id, josh.id),
    ).rejects.toThrow(/archived before deletion/);
    const archived = await app.terminateUser(ownerA, communityA.organisation.id, josh.id);
    expect(archived.state).toBe("ARCHIVED");
    const deleted = await app.purgeUser(ownerA, communityA.organisation.id, josh.id);
    expect(deleted.state).toBe("DELETED");

    const events = await app.listEvents(ownerA, communityA.organisation.id);
    const actions = events.map((e) => e.action);
    expect(actions).toContain("identity.created");
    expect(actions).toContain("identity.suspended");
    expect(actions).toContain("identity.login.success");
    expect(actions).toContain("identity.login.failed");
    expect(actions).toContain("application.created");
    expect(actions).toContain("session.revoked");
    for (const event of events) {
      expect(event.event_id).toBeTruthy();
      expect(event.timestamp).toBeTruthy();
      expect(event.organisation_id).toBe(communityA.organisation.id);
      expect(event.actor_id).toBeTruthy();
      expect(event.actor_type).toBeTruthy();
      expect(event.action).toBeTruthy();
      expect(event.target_type).toBeTruthy();
      expect(event.target_id).toBeTruthy();
      expect(event.result).toBeTruthy();
    }

    const bEvents = await app.listEvents(ownerB, communityB.organisation.id);
    expect(bEvents.some((e) => e.organisation_id === communityA.organisation.id)).toBe(false);

    const support = await app.requestSupportAccess(operator, communityA.organisation.id, {
      reason: "Customer asked Yuma to inspect failed RangerOS logins",
      scopes: ["identity.users.read", "audit.read"],
    });
    await expect(app.startSupportAccess(operator, support.id)).rejects.toThrow();
    const approved = await app.approveSupportAccess(ownerA, support.id);
    expect(approved.status).toBe("approved");
    const started = await app.startSupportAccess(operator, support.id);
    expect(started.request.status).toBe("active");
    const grantedUsers = await app.listUsers(started.principal, communityA.organisation.id);
    expect(grantedUsers.some((u) => u.email === "josh@community-a.test")).toBe(true);
    await expect(
      app.inviteUser(started.principal, communityA.organisation.id, {
        email: "intruder@community-a.test",
        name: "Intruder",
      }),
    ).rejects.toThrow(ForbiddenError);
    const ended = await app.endSupportAccess(operator, support.id);
    expect(ended.status).toBe("ended");

    const csv = await app.exportEvents(ownerA, communityA.organisation.id, "csv");
    expect(csv.split("\n")[0]).toContain("event_id");
    expect(csv).toContain("support.access.approved");
  });

  it("does not let operators impersonate or read credentials", async () => {
    const { app } = system();
    const operator = createTestPrincipal({ role: "YUMA_PLATFORM_OPERATOR", organisationId: null });
    const provisioned = await app.provisionOrganisation(operator, {
      name: "Community A",
      slug: "community-a",
      adminEmail: "owner@a.test",
      adminName: "Owner",
    });
    await expect(app.listUsers(operator, provisioned.organisation.id)).rejects.toThrow();
    await expect(
      app.suspendUser(operator, provisioned.organisation.id, "nope"),
    ).rejects.toThrow();
  });
});
