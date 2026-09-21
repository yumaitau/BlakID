import { describe, expect, it } from "vitest";
import { ForbiddenError } from "@blakid/authz";
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
  const deliveries: Array<{ url: string; body: string; signature: string }> = [];
  const app = new BlakID({
    store,
    runtime,
    ids,
    now,
    fetch: async (url, init) => {
      deliveries.push({
        url: String(url),
        body: String(init?.body ?? ""),
        signature: String((init?.headers as Record<string, string>)?.["x-blakid-signature"] ?? ""),
      });
      return new Response("ok", { status: 200 });
    },
  });
  return { app, runtime, store, deliveries };
}

async function org() {
  const ctx = system();
  const operator = createTestPrincipal({ role: "YUMA_PLATFORM_OPERATOR", organisationId: null });
  const provisioned = await ctx.app.provisionOrganisation(operator, {
    name: "Community A",
    slug: "community-a",
    adminEmail: "owner@a.test",
    adminName: "Owner",
  });
  const owner = createTestPrincipal({
    role: "ORGANISATION_OWNER",
    organisationId: provisioned.organisation.id,
    actorId: provisioned.invitation.userId,
    email: "owner@a.test",
  });
  return { ...ctx, operator, owner, orgId: provisioned.organisation.id };
}

describe("Milestone 2-4 control plane", () => {
  it("creates SAML apps with IdP metadata", async () => {
    const { app, owner, orgId } = await org();
    const saml = await app.createSamlApplication(owner, orgId, {
      name: "Microsoft 365",
      slug: "m365",
      acsUrl: "https://login.microsoftonline.com/example/saml",
    });
    expect(saml.protocol).toBe("saml");
    expect(saml.metadataXml).toContain("EntityDescriptor");
    expect(saml.metadataUrl).toContain("/application/saml/m365/metadata/");
  });

  it("applies the GitHub catalogue template as OIDC plus SCIM", async () => {
    const { app, owner, orgId } = await org();
    const applied = await app.applyCatalogue(owner, orgId, {
      catalogueId: "github",
      protocol: "oidc",
      redirectUris: ["https://github.com/orgs/example/sso/callback"],
      scimUrl: "https://api.github.com/scim/v2/organizations/example",
      scimToken: "scim-token",
    });
    expect(applied.oidc?.clientId).toBeTruthy();
    expect(applied.scim?.direction).toBe("outbound");
    await expect(app.applyCatalogue(owner, orgId, { catalogueId: "nextcloud", protocol: "ldap" })).rejects.toThrow(
      /legacy/,
    );
  });

  it("registers Entra and Google federation sources", async () => {
    const { app, owner, orgId } = await org();
    const entra = await app.createFederationSource(owner, orgId, {
      name: "Microsoft Entra ID",
      slug: "entra",
      type: "entra",
      clientId: "app-id",
      clientSecret: "app-secret",
    });
    const google = await app.createFederationSource(owner, orgId, {
      name: "Google Workspace",
      slug: "google",
      type: "google",
      clientId: "google-id",
      clientSecret: "google-secret",
    });
    const listed = await app.listFederationSources(owner, orgId);
    expect(listed.map((s) => s.type).sort()).toEqual(["entra", "google"]);
    expect(entra.slug).toBe("entra");
    expect(google.slug).toBe("google");
  });

  it("never silently deletes on inbound SCIM", async () => {
    const { app, owner, orgId } = await org();
    const { token } = await app.createInboundScimToken(owner, orgId);
    const created = await app.handleInboundScim(token, "create", {
      userName: "sarah@a.test",
      displayName: "Sarah",
      active: true,
    });
    expect(created.user.state).toBe("ACTIVE");
    const suspended = await app.handleInboundScim(token, "patch", { id: created.user.id, active: false });
    expect(suspended.user.state).toBe("SUSPENDED");
    const archived = await app.handleInboundScim(token, "delete", { id: created.user.id });
    expect(archived.user.state).toBe("ARCHIVED");
    expect(archived.user.state).not.toBe("DELETED");
  });

  it("assigns delegated administrators without granting Yuma operator", async () => {
    const { app, owner, orgId, store } = await org();
    const members = await store.listMembers(orgId);
    const member = members[0];
    const assigned = await app.assignAdministrator(owner, orgId, member.id, "SECURITY_ADMINISTRATOR");
    expect(assigned.role).toBe("SECURITY_ADMINISTRATOR");
    await expect(app.assignAdministrator(owner, orgId, member.id, "YUMA_PLATFORM_OPERATOR")).rejects.toThrow(
      ForbiddenError,
    );
    const admins = await app.listAdministrators(owner, orgId);
    expect(admins.some((a) => a.role === "SECURITY_ADMINISTRATOR")).toBe(true);
  });

  it("surfaces identity security findings", async () => {
    const { app, owner, orgId, runtime } = await org();
    const josh = await app.inviteUser(owner, orgId, { email: "josh@a.test", name: "Josh" });
    await app.activateUser(owner, orgId, josh.id);
    const memory = runtime.memory(orgId);
    await memory.registerAuthenticator(josh.id, "webauthn");
    const dash = await app.securityDashboard(owner, orgId);
    expect(dash.users).toBeGreaterThan(0);
    expect(dash.passkeyAdoption).toBeGreaterThan(0);
    expect(dash.mfaCoverage).toBeGreaterThan(0);
    expect(dash.findings.some((f) => f.includes("MFA") || f.includes("passkey") || f.includes("dormant"))).toBe(true);
  });

  it("grants and expires temporary access", async () => {
    const { app, owner, orgId } = await org();
    const josh = await app.inviteUser(owner, orgId, { email: "josh@a.test", name: "Josh" });
    await app.activateUser(owner, orgId, josh.id);
    const oidc = await app.createOidcApplication(owner, orgId, {
      name: "Finance Portal",
      slug: "finance",
      redirectUris: ["https://finance.example/callback"],
    });
    const requester = createTestPrincipal({
      role: "USER",
      organisationId: orgId,
      actorId: josh.id,
      email: "josh@a.test",
    });
    const request = await app.createAccessRequest(requester, orgId, {
      applicationId: oidc.id,
      requestedRole: "Finance Manager",
      justification: "Need access for quarterly reporting.",
      expiresAt: "2026-09-22T04:00:00.000Z",
    });
    const approved = await app.decideAccessRequest(owner, orgId, request.id, "approved");
    expect(approved.status).toBe("approved");
    const groups = await app.listGroups(owner, orgId);
    expect(groups.some((g) => g.name === "Finance Manager" && g.memberIds.includes(josh.id))).toBe(true);
    await app.tickAccessExpiry();
    const groupsAfter = await app.listGroups(owner, orgId);
    const finance = groupsAfter.find((g) => g.name === "Finance Manager");
    expect(finance?.memberIds.includes(josh.id)).toBe(false);
  });

  it("keeps service and AI agent identities out of the people list", async () => {
    const { app, owner, orgId } = await org();
    const agent = await app.createServiceIdentity(owner, orgId, {
      kind: "ai_agent",
      email: "hermes@a.test",
      name: "Hermes Agent",
      ownerId: owner.actorId,
      purpose: "RangerOS automation",
      modelProvider: "grok",
      expiresAt: "2026-10-01T00:00:00.000Z",
      permittedApplications: ["rangeros"],
    });
    expect(agent.kind).toBe("ai_agent");
    const people = (await app.listUsers(owner, orgId)).filter((u) => u.kind === "person");
    expect(people.some((u) => u.id === agent.id)).toBe(false);
    const services = await app.listServiceAccounts(owner, orgId);
    expect(services.some((u) => u.id === agent.id)).toBe(true);
  });

  it("delivers signed webhooks for identity events", async () => {
    const { app, owner, orgId, deliveries } = await org();
    await app.createWebhook(owner, orgId, {
      url: "https://siem.example/blakid",
      secret: "hook-secret",
      events: ["user.created", "user.suspended"],
    });
    await app.inviteUser(owner, orgId, { email: "sarah@a.test", name: "Sarah" });
    expect(deliveries.some((d) => d.url === "https://siem.example/blakid" && d.body.includes("user.created"))).toBe(true);
    expect(deliveries[0]?.signature).toBeTruthy();
  });

  it("requires approval before MCP suspend executes", async () => {
    const { app, owner, orgId } = await org();
    const sarah = await app.inviteUser(owner, orgId, { email: "sarah@a.test", name: "Sarah" });
    await app.activateUser(owner, orgId, sarah.id);
    const pending = await app.invokeMcp(owner, orgId, "blakid_suspend_user", { userId: sarah.id });
    expect((pending as { status: string }).status).toBe("pending");
    await expect(app.executeAgentAction(owner, orgId, (pending as { id: string }).id)).rejects.toThrow(/approval/);
    await app.decideAgentAction(owner, orgId, (pending as { id: string }).id, "approved");
    const executed = await app.executeAgentAction(owner, orgId, (pending as { id: string }).id);
    expect(executed.status).toBe("executed");
    expect((await app.getUser(owner, orgId, sarah.id)).state).toBe("SUSPENDED");
  });

  it("evaluates pairwise federation trust", async () => {
    const { app, owner, orgId } = await org();
    await app.createTrust(owner, orgId, {
      peerOrganisationId: "org-wiradjuri",
      peerName: "Wiradjuri Example Corporation",
      acceptAttributes: ["identity", "email", "organisation_membership"],
      rejectAttributes: ["administrator_role", "financial_authority"],
    });
    const decisions = await app.evaluateFederatedAssertions(owner, orgId, "org-wiradjuri", [
      {
        attribute: "email",
        value: true,
        issuer: "Wiradjuri Example Corporation",
        issued_at: "2026-09-22T00:00:00Z",
        expires_at: null,
        assurance: "organisation_verified",
      },
      {
        attribute: "administrator_role",
        value: true,
        issuer: "Wiradjuri Example Corporation",
        issued_at: "2026-09-22T00:00:00Z",
        expires_at: null,
        assurance: "organisation_verified",
      },
    ]);
    expect(decisions[0]?.accepted).toBe(true);
    expect(decisions[1]?.accepted).toBe(false);
    const unknown = await app.evaluateFederatedAssertions(owner, orgId, "org-stranger", [
      {
        attribute: "email",
        value: true,
        issuer: "Stranger",
        issued_at: "2026-09-22T00:00:00Z",
        expires_at: null,
        assurance: "federated",
      },
    ]);
    expect(unknown[0]?.accepted).toBe(false);
  });
});
