import { createHash, randomBytes } from "node:crypto";
import { ImmutableAuditLog, toCsv, toSyslog, type AuditAction, type AuditEvent } from "@blakid/audit";
import type { AuthentikUser, OidcApplication, SamlApplication } from "@blakid/authentik";
import {
  authorize,
  ForbiddenError,
  type Permission,
  type Principal,
  type Role,
} from "@blakid/authz";
import {
  DEFAULT_REGION,
  DEFAULT_REGION_LABEL,
  PASSKEY_ENROL_SLUG,
  RETENTION,
  TENANT_HOST_SUFFIX,
  type HostingModel,
} from "@blakid/config";
import {
  evaluateAssertions,
  generateFederationKeypair,
  peekFederationIssuer,
  signFederationAssertion,
  verifyFederationAssertion,
} from "@blakid/federation";
import {
  assertNotIndigenousIdentityClaim,
  transition,
  type AttributeAssertion,
  type IdentityKind,
  type UserState,
} from "@blakid/identity";
import { catalogueApplyPlan, type CatalogueApplyInput } from "@blakid/integrations";
import { mcpTool, writeRequiresApproval } from "@blakid/mcp";
import { applyScimUser, type ScimOperation, type ScimUserResource } from "@blakid/scim";
import {
  AUDIT_TO_WEBHOOK,
  deliverOnce,
  type WebhookEndpoint,
  type WebhookEventName,
} from "@blakid/webhooks";
import {
  approveSupport,
  denySupport,
  expireOrEnd,
  isExpired,
  requestSupport,
  reviewSupport,
  startSupport,
  type SupportAccessRequest,
} from "@blakid/support-access";
import type {
  AccessRequest,
  AgentAction,
  BlakIDStore,
  Organisation,
  ProvisionInput,
  RequestContext,
  TenantRuntime,
} from "./types.ts";

export type BlakIDOptions = {
  store: BlakIDStore;
  runtime: TenantRuntime;
  ids?: () => string;
  now?: () => Date;
  fetch?: typeof fetch;
};

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export class BlakID {
  readonly store: BlakIDStore;
  readonly runtime: TenantRuntime;
  readonly ids: () => string;
  readonly now: () => Date;
  readonly audit: ImmutableAuditLog;
  readonly fetch: typeof fetch;

  constructor(options: BlakIDOptions) {
    this.store = options.store;
    this.runtime = options.runtime;
    this.ids = options.ids ?? (() => randomBytes(16).toString("hex"));
    this.now = options.now ?? (() => new Date());
    this.fetch = options.fetch ?? fetch;
    this.audit = new ImmutableAuditLog(
      {
        append: (event) => this.store.appendAudit(event),
        list: (orgId) => this.store.listAudit(orgId),
        get: async () => null,
      },
      this.ids,
      this.now,
    );
  }

  private async record(
    actor: Principal,
    organisationId: string,
    action: AuditAction | string,
    targetType: string,
    targetId: string,
    result: AuditEvent["result"],
    ctx: RequestContext | undefined,
    metadata: Record<string, unknown> = {},
  ) {
    const event = await this.audit.record({
      organisation_id: organisationId,
      actor_id: actor.actorId,
      actor_type: actor.actorType,
      action,
      target_type: targetType,
      target_id: targetId,
      source_ip: ctx?.sourceIp ?? null,
      user_agent: ctx?.userAgent ?? null,
      session_id: actor.sessionId,
      request_id: ctx?.requestId ?? null,
      result,
      metadata,
    });
    await this.dispatchWebhooks(event).catch(() => undefined);
    return event;
  }

  private client(organisationId: string) {
    return this.runtime.clientFor(organisationId);
  }

  async provisionOrganisation(actor: Principal, input: ProvisionInput, ctx?: RequestContext) {
    authorize(actor, "platform.organisations.provision", null);
    const slug = input.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
    const hostname = `${slug}.${TENANT_HOST_SUFFIX}`;
    const hostingModel: HostingModel = input.hostingModel ?? "blakid_australian_cloud";
    const org: Organisation = {
      id: this.ids(),
      name: input.name.trim(),
      slug,
      hostname,
      customDomain: input.customDomain?.trim() || null,
      hostingModel,
      region: DEFAULT_REGION,
      regionLabel: DEFAULT_REGION_LABEL,
      status: "provisioning",
      existingIdp: input.existingIdp ?? null,
      createdAt: this.now().toISOString(),
    };
    await this.store.insertOrganisation(org);
    const provisioned = await this.runtime.provision(org);
    await this.store.insertDeployment({
      id: this.ids(),
      organisationId: org.id,
      ...provisioned.deployment,
    });
    const ready = await this.store.updateOrganisation(org.id, { status: "ready" });
    const invitation = await this.inviteOrganisationAdmin(
      actor,
      ready.id,
      { email: input.adminEmail, name: input.adminName, role: "ORGANISATION_OWNER" },
      ctx,
    );
    await this.record(actor, org.id, "organisation.provisioned", "organisation", org.id, "success", ctx, {
      hostname,
      hostingModel,
      region: DEFAULT_REGION,
    });
    return { organisation: ready, invitation };
  }

  async listOrganisations(actor: Principal) {
    authorize(actor, "platform.organisations.read", null);
    return this.store.listOrganisations();
  }

  async getOrganisation(actor: Principal, organisationId: string) {
    const org = await this.store.getOrganisation(organisationId);
    if (!org) throw new Error("Organisation not found");
    if (actor.role === "YUMA_PLATFORM_OPERATOR") {
      authorize(actor, "platform.organisations.read", null);
    } else {
      authorize(actor, "organisation.settings.write", organisationId);
    }
    return org;
  }

  async sovereignty(actor: Principal, organisationId: string) {
    const org = await this.requireOrgRead(actor, organisationId);
    const deployment = await this.store.getDeployment(organisationId);
    return {
      organisation: org.name,
      region: org.regionLabel,
      regionCode: org.region,
      deployment: "Dedicated",
      database: "Dedicated PostgreSQL",
      encryption: "Customer environment key",
      backups: org.regionLabel.startsWith("Australia") ? "Australia" : org.regionLabel,
      authentikVersion: deployment?.authentikVersion,
      lastBackup: deployment?.lastBackupAt,
      lastBackupStatus: deployment?.lastBackupStatus,
      restoreTest: deployment?.lastRestoreTestStatus,
      lastRestoreTest: deployment?.lastRestoreTestAt,
      hostname: org.customDomain ?? org.hostname,
      hostingModel: org.hostingModel,
      byoc: org.hostingModel === "customer_aws" || org.hostingModel === "self_hosted"
        ? this.byocManifest(org)
        : null,
    };
  }

  private async requireOrgRead(actor: Principal, organisationId: string) {
    if (actor.role === "YUMA_PLATFORM_OPERATOR") {
      authorize(actor, "platform.organisations.read", null);
    } else {
      authorize(actor, "identity.users.read", organisationId);
    }
    const org = await this.store.getOrganisation(organisationId);
    if (!org) throw new Error("Organisation not found");
    return org;
  }

  async inviteOrganisationAdmin(
    actor: Principal,
    organisationId: string,
    input: { email: string; name: string; role: Principal["role"] },
    ctx?: RequestContext,
  ) {
    if (actor.role === "YUMA_PLATFORM_OPERATOR") {
      authorize(actor, "platform.organisations.provision", null);
    } else {
      authorize(actor, "identity.users.write", organisationId);
    }
    const token = this.ids() + this.ids();
    const invitation = await this.store.insertInvitation({
      id: this.ids(),
      organisationId,
      email: input.email.toLowerCase(),
      name: input.name,
      role: input.role,
      token,
      tokenHash: hashToken(token),
      expiresAt: new Date(this.now().getTime() + RETENTION.invitationDays * 86400000).toISOString(),
      acceptedAt: null,
    });
    const client = this.client(organisationId);
    const user = await client.createUser({
      username: input.email.toLowerCase(),
      email: input.email.toLowerCase(),
      name: input.name,
      state: "INVITED",
      kind: "person",
    });
    await this.store.insertMember({
      id: this.ids(),
      organisationId,
      email: input.email.toLowerCase(),
      name: input.name,
      role: input.role,
      authentikUserId: user.id,
      createdAt: this.now().toISOString(),
    });
    await this.record(actor, organisationId, "identity.invited", "identity", user.id, "success", ctx, {
      email: input.email,
      role: input.role,
    });
    return { ...invitation, userId: user.id };
  }

  async acceptInvitation(token: string, password: string) {
    const hashed = hashToken(token);
    const invitation = await this.store.getInvitationByTokenHash(hashed);
    if (!invitation) throw new Error("Invitation not found");
    if (new Date(invitation.expiresAt).getTime() <= this.now().getTime()) {
      throw new Error("Invitation expired");
    }
    const client = this.client(invitation.organisationId);
    const user = await client.findUserByEmail(invitation.email);
    if (!user) throw new Error("Invited identity missing from organisation directory");
    const nextState = user.state === "INVITED" ? transition(user.state, "ACTIVE") : user.state;
    const updated = await client.updateUser(user.id, { password, state: nextState, isActive: true });
    invitation.acceptedAt = this.now().toISOString();
    return { invitation, user: updated };
  }

  async inviteUser(
    actor: Principal,
    organisationId: string,
    input: {
      email: string;
      name: string;
      kind?: IdentityKind;
      assertions?: AttributeAssertion[];
      password?: string;
    },
    ctx?: RequestContext,
  ) {
    authorize(actor, "identity.users.write", organisationId);
    if (input.assertions) assertNotIndigenousIdentityClaim(input.assertions);
    const client = this.client(organisationId);
    const user = await client.createUser({
      username: input.email.toLowerCase(),
      email: input.email.toLowerCase(),
      name: input.name,
      state: "INVITED",
      kind: input.kind ?? "person",
      assertions: input.assertions,
      password: input.password,
    });
    await this.record(actor, organisationId, "identity.created", "identity", user.id, "success", ctx, {
      email: input.email,
      kind: user.kind,
      state: user.state,
    });
    return user;
  }

  async activateUser(actor: Principal, organisationId: string, userId: string, ctx?: RequestContext) {
    authorize(actor, "identity.users.write", organisationId);
    return this.setState(actor, organisationId, userId, "ACTIVE", "identity.activated", ctx);
  }

  async suspendUser(actor: Principal, organisationId: string, userId: string, ctx?: RequestContext) {
    authorize(actor, "identity.users.suspend", organisationId);
    const updated = await this.setState(actor, organisationId, userId, "SUSPENDED", "identity.suspended", ctx);
    await this.client(organisationId).revokeAllSessions(userId);
    await this.record(actor, organisationId, "session.revoked", "identity", userId, "success", ctx, {
      scope: "all_sessions",
    });
    return updated;
  }

  async restoreUser(actor: Principal, organisationId: string, userId: string, ctx?: RequestContext) {
    authorize(actor, "identity.users.write", organisationId);
    return this.setState(actor, organisationId, userId, "ACTIVE", "identity.restored", ctx);
  }

  async lockUser(actor: Principal, organisationId: string, userId: string, ctx?: RequestContext) {
    authorize(actor, "identity.users.suspend", organisationId);
    const updated = await this.setState(actor, organisationId, userId, "LOCKED", "identity.locked", ctx);
    await this.client(organisationId).revokeAllSessions(userId);
    return updated;
  }

  async terminateUser(actor: Principal, organisationId: string, userId: string, ctx?: RequestContext) {
    authorize(actor, "identity.users.terminate", organisationId);
    const updated = await this.setState(actor, organisationId, userId, "ARCHIVED", "identity.archived", ctx);
    await this.client(organisationId).revokeAllSessions(userId);
    await this.record(actor, organisationId, "session.revoked", "identity", userId, "success", ctx, {
      scope: "all_sessions",
      reason: "terminate",
    });
    return updated;
  }

  async purgeUser(actor: Principal, organisationId: string, userId: string, ctx?: RequestContext) {
    authorize(actor, "identity.users.terminate", organisationId);
    const user = await this.client(organisationId).getUser(userId);
    if (user.state !== "ARCHIVED") {
      throw new Error("Identities must be archived before deletion after retention");
    }
    return this.setState(actor, organisationId, userId, "DELETED", "identity.deleted", ctx);
  }

  private async setState(
    actor: Principal,
    organisationId: string,
    userId: string,
    to: UserState,
    action: AuditAction,
    ctx?: RequestContext,
  ) {
    const client = this.client(organisationId);
    const user = await client.getUser(userId);
    const next = transition(user.state, to);
    const updated = await client.updateUser(userId, {
      state: next,
      isActive: next === "ACTIVE" || next === "INVITED",
    });
    await this.record(actor, organisationId, action, "identity", userId, "success", ctx, {
      from: user.state,
      to: next,
    });
    return updated;
  }

  async listUsers(actor: Principal, organisationId: string) {
    authorize(actor, "identity.users.read", organisationId);
    return this.client(organisationId).listUsers();
  }

  async getUser(actor: Principal, organisationId: string, userId: string) {
    authorize(actor, "identity.users.read", organisationId);
    return this.client(organisationId).getUser(userId);
  }

  async revokeSessions(actor: Principal, organisationId: string, userId: string, ctx?: RequestContext) {
    if (actor.actorId !== userId) {
      authorize(actor, "identity.sessions.revoke", organisationId);
    } else {
      authorize(actor, "applications.read", organisationId);
    }
    await this.client(organisationId).revokeAllSessions(userId);
    await this.record(actor, organisationId, "session.revoked", "identity", userId, "success", ctx, {
      scope: "all_sessions",
    });
  }

  async revokeSession(
    actor: Principal,
    organisationId: string,
    sessionId: string,
    ctx?: RequestContext,
  ) {
    authorize(actor, "identity.sessions.revoke", organisationId);
    await this.client(organisationId).revokeSession(sessionId);
    await this.record(actor, organisationId, "session.revoked", "session", sessionId, "success", ctx, {});
  }

  async listSessions(actor: Principal, organisationId: string, userId?: string) {
    if (userId && actor.actorId === userId) {
      authorize(actor, "applications.read", organisationId);
    } else {
      authorize(actor, "identity.users.read", organisationId);
    }
    return this.client(organisationId).listSessions(userId);
  }

  async createOidcApplication(
    actor: Principal,
    organisationId: string,
    input: { name: string; slug: string; redirectUris: string[]; logoutUri?: string },
    ctx?: RequestContext,
  ): Promise<OidcApplication> {
    authorize(actor, "applications.write", organisationId);
    const app = await this.client(organisationId).createOidcApplication({
      name: input.name,
      slug: input.slug,
      redirectUris: input.redirectUris,
      logoutUri: input.logoutUri,
      scopes: ["openid", "profile", "email", "offline_access"],
    });
    await this.record(actor, organisationId, "application.created", "application", app.id, "success", ctx, {
      protocol: "oidc",
      slug: app.slug,
    });
    return app;
  }

  async listApplications(actor: Principal, organisationId: string) {
    authorize(actor, "applications.read", organisationId);
    const [oidc, saml] = await Promise.all([
      this.client(organisationId).listOidcApplications(),
      this.client(organisationId).listSamlApplications(),
    ]);
    return [...oidc, ...saml];
  }

  async getApplication(actor: Principal, organisationId: string, id: string) {
    authorize(actor, "applications.read", organisationId);
    try {
      return await this.client(organisationId).getOidcApplication(id);
    } catch {
      return this.client(organisationId).getSamlApplication(id);
    }
  }

  async createGroup(actor: Principal, organisationId: string, name: string, ctx?: RequestContext) {
    authorize(actor, "identity.memberships.write", organisationId);
    const group = await this.client(organisationId).createGroup(name);
    await this.record(actor, organisationId, "group.member.added", "group", group.id, "success", ctx, {
      name,
    });
    return group;
  }

  async listGroups(actor: Principal, organisationId: string) {
    authorize(actor, "identity.users.read", organisationId);
    return this.client(organisationId).listGroups();
  }

  async addGroupMember(
    actor: Principal,
    organisationId: string,
    groupId: string,
    userId: string,
    ctx?: RequestContext,
  ) {
    authorize(actor, "identity.memberships.write", organisationId);
    await this.client(organisationId).addGroupMember(groupId, userId);
    await this.record(actor, organisationId, "group.member.added", "group", groupId, "success", ctx, { userId });
  }

  async removeGroupMember(
    actor: Principal,
    organisationId: string,
    groupId: string,
    userId: string,
    ctx?: RequestContext,
  ) {
    authorize(actor, "identity.memberships.write", organisationId);
    await this.client(organisationId).removeGroupMember(groupId, userId);
    await this.record(actor, organisationId, "group.member.removed", "group", groupId, "success", ctx, { userId });
  }

  async listEvents(actor: Principal, organisationId: string) {
    if (actor.role === "USER") {
      authorize(actor, "applications.read", organisationId);
      const events = await this.store.listAudit(organisationId);
      return events.filter((event) => event.actor_id === actor.actorId);
    }
    authorize(actor, "audit.read", organisationId);
    return this.store.listAudit(organisationId);
  }

  async exportEvents(actor: Principal, organisationId: string, format: "json" | "csv" | "syslog") {
    authorize(actor, "audit.export", organisationId);
    const events = await this.store.listAudit(organisationId);
    if (format === "csv") return toCsv(events);
    if (format === "syslog") return toSyslog(events);
    return JSON.stringify(events, null, 2);
  }

  async listSupportAccess(actor: Principal, organisationId: string) {
    if (actor.role === "YUMA_PLATFORM_OPERATOR") {
      authorize(actor, "support.request", null);
    } else {
      authorize(actor, "support.approve", organisationId);
    }
    return this.store.listSupport(organisationId);
  }

  async requestSupportAccess(
    actor: Principal,
    organisationId: string,
    input: { reason: string; scopes: Permission[]; breakGlass?: boolean },
    ctx?: RequestContext,
  ) {
    authorize(actor, "support.request", null);
    const request = requestSupport({
      id: this.ids(),
      organisationId,
      requesterId: actor.actorId,
      requesterEmail: actor.email,
      reason: input.reason,
      scopes: input.scopes,
      breakGlass: input.breakGlass,
      now: this.now(),
    });
    await this.store.insertSupport(request);
    await this.record(
      actor,
      organisationId,
      "support.access.requested",
      "support_access",
      request.id,
      "success",
      ctx,
      { reason: input.reason, breakGlass: Boolean(input.breakGlass) },
    );
    return request;
  }

  async approveSupportAccess(actor: Principal, requestId: string, ctx?: RequestContext) {
    const request = await this.requireSupport(requestId);
    authorize(actor, "support.approve", request.organisationId);
    const next = approveSupport(request, actor.actorId, this.now(), RETENTION.supportSessionMinutes);
    await this.store.updateSupport(next);
    await this.record(
      actor,
      request.organisationId,
      "support.access.approved",
      "support_access",
      request.id,
      "success",
      ctx,
      { expiresAt: next.expiresAt },
    );
    return next;
  }

  async denySupportAccess(actor: Principal, requestId: string, ctx?: RequestContext) {
    const request = await this.requireSupport(requestId);
    authorize(actor, "support.approve", request.organisationId);
    const next = denySupport(request, actor.actorId, this.now());
    await this.store.updateSupport(next);
    await this.record(
      actor,
      request.organisationId,
      "support.access.denied",
      "support_access",
      request.id,
      "success",
      ctx,
      {},
    );
    return next;
  }

  async startSupportAccess(actor: Principal, requestId: string, ctx?: RequestContext): Promise<{
    request: SupportAccessRequest;
    principal: Principal;
  }> {
    const request = await this.requireSupport(requestId);
    if (request.requesterId !== actor.actorId) {
      throw new ForbiddenError("Only the requesting operator may start the support session");
    }
    const started = startSupport(request, this.now());
    await this.store.updateSupport(started);
    await this.record(
      actor,
      request.organisationId,
      "support.access.started",
      "support_access",
      request.id,
      "success",
      ctx,
      { scopes: started.scopes },
    );
    const principal: Principal = {
      ...actor,
      supportGrant: {
        requestId: started.id,
        organisationId: started.organisationId,
        scopes: started.scopes,
        expiresAt: started.expiresAt ?? this.now().toISOString(),
      },
    };
    return { request: started, principal };
  }

  async endSupportAccess(actor: Principal, requestId: string, ctx?: RequestContext) {
    const request = await this.requireSupport(requestId);
    const next = expireOrEnd(request, this.now(), "ended");
    await this.store.updateSupport(next);
    await this.record(
      actor,
      request.organisationId,
      "support.access.ended",
      "support_access",
      request.id,
      "success",
      ctx,
      {},
    );
    return next;
  }

  async reviewSupportAccess(actor: Principal, requestId: string, notes: string) {
    const request = await this.requireSupport(requestId);
    authorize(actor, "support.approve", request.organisationId);
    const next = reviewSupport(request, notes);
    return this.store.updateSupport(next);
  }

  async tickSupportExpiry() {
    const orgs = await this.store.listOrganisations();
    for (const org of orgs) {
      const requests = await this.store.listSupport(org.id);
      for (const request of requests) {
        if ((request.status === "active" || request.status === "approved") && isExpired(request, this.now())) {
          const next = expireOrEnd(request, this.now(), "expired");
          await this.store.updateSupport(next);
        }
      }
    }
  }

  private async requireSupport(id: string) {
    const request = await this.store.getSupport(id);
    if (!request) throw new Error("Support request not found");
    return request;
  }

  async createAccessRequest(
    actor: Principal,
    organisationId: string,
    input: { applicationId: string; requestedRole: string; justification: string; expiresAt?: string | null },
  ) {
    authorize(actor, "applications.read", organisationId);
    const request: AccessRequest = {
      id: this.ids(),
      organisationId,
      requesterId: actor.actorId,
      applicationId: input.applicationId,
      requestedRole: input.requestedRole,
      justification: input.justification,
      status: "pending",
      approverId: null,
      decidedAt: null,
      expiresAt: input.expiresAt ?? null,
      createdAt: this.now().toISOString(),
    };
    const created = await this.store.insertAccessRequest(request);
    await this.record(actor, organisationId, "application.access.requested", "access_request", created.id, "success", undefined, {
      applicationId: input.applicationId,
      requestedRole: input.requestedRole,
    });
    return created;
  }

  async decideAccessRequest(actor: Principal, organisationId: string, id: string, decision: "approved" | "denied") {
    authorize(actor, "applications.access.grant", organisationId);
    const requests = await this.store.listAccessRequests(organisationId);
    const current = requests.find((r) => r.id === id);
    if (!current) throw new Error("Access request not found");
    const next: AccessRequest = {
      ...current,
      status: decision,
      approverId: actor.actorId,
      decidedAt: this.now().toISOString(),
    };
    const saved = await this.store.updateAccessRequest(next);
    if (decision === "approved") {
      const groups = await this.client(organisationId).listGroups();
      let group = groups.find((g) => g.name === current.requestedRole);
      if (!group) group = await this.client(organisationId).createGroup(current.requestedRole);
      await this.client(organisationId).addGroupMember(group.id, current.requesterId);
      await this.record(actor, organisationId, "application.access.granted", "access_request", id, "success", undefined, {
        applicationId: current.applicationId,
        expiresAt: current.expiresAt,
      });
    } else {
      await this.record(actor, organisationId, "application.access.denied", "access_request", id, "success", undefined, {});
    }
    return saved;
  }

  async tickAccessExpiry() {
    const orgs = await this.store.listOrganisations();
    for (const org of orgs) {
      const requests = await this.store.listAccessRequests(org.id);
      for (const request of requests) {
        if (request.status !== "approved" || !request.expiresAt) continue;
        if (new Date(request.expiresAt).getTime() > this.now().getTime()) continue;
        const groups = await this.client(org.id).listGroups();
        const group = groups.find((g) => g.name === request.requestedRole);
        if (group) {
          await this.client(org.id).removeGroupMember(group.id, request.requesterId).catch(() => undefined);
        }
        await this.store.updateAccessRequest({ ...request, status: "denied" });
        const actor: Principal = {
          actorId: "system",
          actorType: "system",
          role: "AUDITOR",
          email: "system@blakid",
          name: "BlakID",
          organisationId: org.id,
          sessionId: "tick",
        };
        await this.record(actor, org.id, "application.access.revoked", "access_request", request.id, "success", undefined, {
          reason: "expired",
        });
      }
    }
  }

  async listAccessRequests(actor: Principal, organisationId: string) {
    authorize(actor, "applications.read", organisationId);
    return this.store.listAccessRequests(organisationId);
  }

  async listRoles(actor: Principal, organisationId: string) {
    authorize(actor, "identity.users.read", organisationId);
    return [
      { id: "ORGANISATION_OWNER", name: "Organisation Owner" },
      { id: "IDENTITY_ADMINISTRATOR", name: "Identity Administrator" },
      { id: "APPLICATION_ADMINISTRATOR", name: "Application Administrator" },
      { id: "SECURITY_ADMINISTRATOR", name: "Security Administrator" },
      { id: "HELPDESK_ADMINISTRATOR", name: "Helpdesk Administrator" },
      { id: "AUDITOR", name: "Auditor" },
      { id: "USER", name: "User" },
    ];
  }

  async listServiceAccounts(actor: Principal, organisationId: string) {
    authorize(actor, "identity.users.read", organisationId);
    const users = await this.client(organisationId).listUsers();
    return users.filter((u) => u.kind !== "person");
  }

  async loginWithPassword(
    organisationId: string,
    email: string,
    password: string,
    ctx?: RequestContext,
  ) {
    const client = this.client(organisationId);
    const authenticator = client as {
      authenticatePassword?: (email: string, password: string) => Promise<AuthentikUser>;
    };
    if (typeof authenticator.authenticatePassword !== "function") {
      throw new Error("Password login is completed inside authentik; use the organisation OIDC authorization endpoint");
    }
    const existing = await client.findUserByEmail(email);
    try {
      const user = await authenticator.authenticatePassword(email, password);
      await this.recordLogin(organisationId, user, "success", ctx);
      const session = await client.createSession({
        userId: user.id,
        userAgent: ctx?.userAgent,
        sourceIp: ctx?.sourceIp,
      });
      return { user, session };
    } catch (error) {
      if (existing) await this.recordLogin(organisationId, existing, "failure", ctx);
      throw error;
    }
  }

  async recordLogin(
    organisationId: string,
    user: AuthentikUser,
    result: "success" | "failure",
    ctx?: RequestContext,
  ) {
    const actor: Principal = {
      actorId: user.id,
      actorType: "human",
      role: "USER",
      email: user.email,
      name: user.name,
      organisationId,
      sessionId: ctx?.requestId ?? "login",
    };
    await this.record(
      actor,
      organisationId,
      result === "success" ? "identity.login.success" : "identity.login.failed",
      "identity",
      user.id,
      result === "success" ? "success" : "failure",
      ctx,
      { email: user.email },
    );
  }

  async passkeyEnrolment(actor: Principal, organisationId: string) {
    authorize(actor, "applications.read", organisationId);
    return {
      engine: "authentik" as const,
      flow: PASSKEY_ENROL_SLUG,
      url: this.runtime.passkeyEnrolmentUrl(organisationId),
      totpUrl: this.runtime.totpEnrolmentUrl(organisationId),
    };
  }

  async backup(actor: Principal, organisationId: string) {
    authorize(actor, "platform.backups.manage", null);
    const result = await this.runtime.backup(organisationId);
    await this.store.updateDeployment(organisationId, {
      lastBackupAt: result.at,
      lastBackupStatus: result.status,
    });
    return result;
  }

  async restoreTest(actor: Principal, organisationId: string) {
    authorize(actor, "platform.backups.manage", null);
    const result = await this.runtime.restoreTest(organisationId);
    await this.store.updateDeployment(organisationId, {
      lastRestoreTestAt: result.at,
      lastRestoreTestStatus: result.status,
    });
    return result;
  }

  async health() {
    const orgs = await this.store.listOrganisations();
    const tenants = [];
    for (const org of orgs) {
      try {
        const h = await this.runtime.health(org.id);
        tenants.push({ organisationId: org.id, slug: org.slug, ...h });
      } catch (error) {
        tenants.push({
          organisationId: org.id,
          slug: org.slug,
          live: false,
          ready: false,
          version: "unknown",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return {
      status: "ok" as const,
      service: "blakid-control-plane",
      tenants,
    };
  }

  async ready() {
    const health = await this.health();
    const allReady = health.tenants.every((t) => t.ready);
    return {
      status: allReady || health.tenants.length === 0 ? ("ready" as const) : ("degraded" as const),
      tenants: health.tenants,
    };
  }

  dashboard(users: AuthentikUser[]) {
    const people = users.filter((u) => u.kind === "person");
    const privileged = people.filter((u) =>
      u.groups.some((g) => /admin|owner|security/i.test(g)),
    );
    const suspended = people.filter((u) => u.state === "SUSPENDED");
    const services = users.filter((u) => u.kind !== "person");
    return {
      users: people.length,
      privilegedAccounts: privileged.length,
      passkeyAdoption: people.length === 0 ? 0 : 0,
      mfaCoverage: people.length === 0 ? 0 : 0,
      dormantAccounts: 0,
      suspendedUsers: suspended.length,
      serviceAccounts: services.length,
    };
  }

  async createSamlApplication(
    actor: Principal,
    organisationId: string,
    input: { name: string; slug: string; acsUrl: string; audience?: string; metadataXml?: string },
    ctx?: RequestContext,
  ): Promise<SamlApplication> {
    authorize(actor, "applications.write", organisationId);
    const app = await this.client(organisationId).createSamlApplication(input);
    await this.record(actor, organisationId, "application.created", "application", app.id, "success", ctx, {
      protocol: "saml",
      slug: app.slug,
    });
    return app;
  }

  async applyCatalogue(actor: Principal, organisationId: string, input: CatalogueApplyInput, ctx?: RequestContext) {
    authorize(actor, "applications.write", organisationId);
    const plan = catalogueApplyPlan(input);
    if (plan.ldapLegacy) {
      throw new Error("LDAP is a legacy integration. Prefer OpenID Connect or SAML.");
    }
    let oidc: OidcApplication | null = null;
    let saml: SamlApplication | null = null;
    let scim = null;
    if (plan.createOidc) {
      if (!input.redirectUris?.length) throw new Error("OIDC catalogue items need redirectUris");
      oidc = await this.createOidcApplication(
        actor,
        organisationId,
        {
          name: plan.name,
          slug: plan.slug,
          redirectUris: input.redirectUris,
          logoutUri: input.logoutUri,
        },
        ctx,
      );
    }
    if (plan.createSaml) {
      if (!input.acsUrl && !input.redirectUris?.[0]) throw new Error("SAML catalogue items need acsUrl");
      saml = await this.createSamlApplication(
        actor,
        organisationId,
        {
          name: plan.name,
          slug: `${plan.slug}-saml`,
          acsUrl: input.acsUrl ?? input.redirectUris![0],
          audience: input.audience,
        },
        ctx,
      );
    }
    if (plan.createScim && input.scimUrl && input.scimToken) {
      scim = await this.createOutboundScim(actor, organisationId, {
        name: `${plan.name} SCIM`,
        slug: `${plan.slug}-scim`,
        url: input.scimUrl,
        token: input.scimToken,
      });
    }
    return { plan, oidc, saml, scim };
  }

  async createFederationSource(
    actor: Principal,
    organisationId: string,
    input: {
      name: string;
      slug: string;
      type: "entra" | "google" | "oidc" | "saml";
      clientId?: string;
      clientSecret?: string;
      wellKnownUrl?: string;
      ssoUrl?: string;
      entityId?: string;
      metadataXml?: string;
    },
    ctx?: RequestContext,
  ) {
    authorize(actor, "organisation.settings.write", organisationId);
    const source = await this.client(organisationId).createFederationSource(input);
    await this.record(actor, organisationId, "federation.source.created", "federation_source", source.id, "success", ctx, {
      type: input.type,
      slug: input.slug,
    });
    return source;
  }

  async listFederationSources(actor: Principal, organisationId: string) {
    authorize(actor, "applications.read", organisationId);
    return this.client(organisationId).listFederationSources();
  }

  async createOutboundScim(
    actor: Principal,
    organisationId: string,
    input: { name: string; slug: string; url: string; token: string },
  ) {
    authorize(actor, "applications.write", organisationId);
    return this.client(organisationId).createScimProvider(input);
  }

  async createInboundScimToken(actor: Principal, organisationId: string) {
    authorize(actor, "organisation.settings.write", organisationId);
    const token = this.ids() + this.ids();
    await this.store.insertScimCredential({
      id: this.ids(),
      organisationId,
      tokenHash: hashToken(token),
      tokenHint: token.slice(-6),
      createdAt: this.now().toISOString(),
    });
    return { token, hint: token.slice(-6) };
  }

  async scimUsers(token: string) {
    const credential = await this.store.getScimCredentialByTokenHash(hashToken(token));
    if (!credential) throw new Error("Invalid SCIM token");
    const users = await this.client(credential.organisationId).listUsers();
    return users.filter((u) => u.kind === "person");
  }

  async handleInboundScim(token: string, op: ScimOperation, resource: ScimUserResource) {
    const credential = await this.store.getScimCredentialByTokenHash(hashToken(token));
    if (!credential) throw new Error("Invalid SCIM token");
    const organisationId = credential.organisationId;
    const client = this.client(organisationId);
    const result = await applyScimUser(
      {
        findByEmail: (email) => client.findUserByEmail(email),
        get: (id) => client.getUser(id),
        list: () => client.listUsers(),
        create: async (input) =>
          client.createUser({
            username: input.email,
            email: input.email,
            name: input.name,
            state: "INVITED",
            kind: "person",
          }),
        setState: async (id, to) => {
          const user = await client.getUser(id);
          const next = transition(user.state, to);
          const updated = await client.updateUser(id, {
            state: next,
            isActive: next === "ACTIVE" || next === "INVITED",
          });
          if (next === "SUSPENDED" || next === "ARCHIVED") {
            await client.revokeAllSessions(id);
          }
          return updated;
        },
      },
      op,
      resource,
    );
    const actor: Principal = {
      actorId: "scim",
      actorType: "system",
      role: "IDENTITY_ADMINISTRATOR",
      email: "scim@blakid",
      name: "SCIM",
      organisationId,
      sessionId: "scim",
    };
    await this.record(actor, organisationId, `identity.${result.action === "created" ? "created" : result.action === "suspended" ? "suspended" : result.action === "archived" ? "archived" : "updated"}`, "identity", result.user.id, "success", undefined, {
      source: "scim",
    });
    return result;
  }

  async listAdministrators(actor: Principal, organisationId: string) {
    authorize(actor, "identity.users.read", organisationId);
    const members = await this.store.listMembers(organisationId);
    return members.filter((m) => m.role !== "USER");
  }

  async assignAdministrator(
    actor: Principal,
    organisationId: string,
    memberId: string,
    role: Role,
    ctx?: RequestContext,
  ) {
    authorize(actor, "identity.memberships.write", organisationId);
    if (role === "YUMA_PLATFORM_OPERATOR") {
      throw new ForbiddenError("Organisation members cannot hold the Yuma platform operator role");
    }
    const members = await this.store.listMembers(organisationId);
    const member = members.find((m) => m.id === memberId);
    if (!member) throw new Error("Administrator not found");
    const next = await this.store.updateMember({ ...member, role });
    await this.record(actor, organisationId, "role.assigned", "member", memberId, "success", ctx, { role });
    return next;
  }

  async createServiceIdentity(
    actor: Principal,
    organisationId: string,
    input: {
      kind: IdentityKind;
      email: string;
      name: string;
      ownerId: string;
      purpose: string;
      expiresAt?: string | null;
      permittedApplications?: string[];
      modelProvider?: string | null;
    },
    ctx?: RequestContext,
  ) {
    authorize(actor, "identity.users.write", organisationId);
    if (input.kind === "person") throw new Error("Service identities cannot be people");
    const user = await this.client(organisationId).createUser({
      username: input.email.toLowerCase(),
      email: input.email.toLowerCase(),
      name: input.name,
      state: "ACTIVE",
      kind: input.kind,
      attributes: {
        blakid_owner: input.ownerId,
        blakid_purpose: input.purpose,
        blakid_expires_at: input.expiresAt ?? null,
        blakid_permitted_apps: input.permittedApplications ?? [],
        blakid_model_provider: input.modelProvider ?? null,
      },
    });
    await this.record(actor, organisationId, "identity.created", "service_identity", user.id, "success", ctx, {
      kind: input.kind,
      ownerId: input.ownerId,
      purpose: input.purpose,
    });
    return user;
  }

  async createHermesAgent(
    actor: Principal,
    organisationId: string,
    input: {
      name: string;
      email: string;
      ownerId: string;
      purpose: string;
      modelProvider: string;
      permittedApplications: string[];
      allowedActions: string[];
      expiresAt?: string | null;
    },
    ctx?: RequestContext,
  ) {
    const agent = await this.createServiceIdentity(
      actor,
      organisationId,
      {
        kind: "ai_agent",
        email: input.email,
        name: input.name,
        ownerId: input.ownerId,
        purpose: input.purpose,
        expiresAt: input.expiresAt,
        permittedApplications: input.permittedApplications,
        modelProvider: input.modelProvider,
      },
      ctx,
    );
    await this.client(organisationId).updateUser(agent.id, {
      attributes: {
        ...agent.attributes,
        blakid_inherit_human_credentials: false,
        blakid_allowed_actions: input.allowedActions,
        blakid_delegated_from: input.ownerId,
      },
    });
    const slug = `hermes-${this.ids().slice(0, 10).toLowerCase()}`;
    const oidc = await this.createOidcApplication(
      actor,
      organisationId,
      {
        name: `${input.name} client`,
        slug,
        redirectUris: ["https://hermes.blakid.internal/callback"],
      },
      ctx,
    );
    const refreshed = await this.client(organisationId).getUser(agent.id);
    return {
      agent: refreshed,
      credentials: {
        clientId: oidc.clientId,
        clientSecret: oidc.clientSecret,
        tokenUrl: oidc.tokenUrl,
        grant: "client_credentials",
      },
    };
  }

  async securityDashboard(actor: Principal, organisationId: string) {
    authorize(actor, "audit.read", organisationId);
    const users = await this.client(organisationId).listUsers();
    const members = await this.store.listMembers(organisationId);
    const people = users.filter((u) => u.kind === "person");
    const privilegedIds = new Set(
      members.filter((m) => m.role !== "USER" && m.authentikUserId).map((m) => m.authentikUserId as string),
    );
    const authenticators = await Promise.all(people.map((u) => this.client(organisationId).listUserAuthenticators(u.id)));
    const byUser = new Map(authenticators.map((a) => [a.userId, a]));
    const withPasskey = people.filter((u) => (byUser.get(u.id)?.webauthn ?? 0) > 0).length;
    const withMfa = people.filter((u) => {
      const a = byUser.get(u.id);
      return (a?.webauthn ?? 0) > 0 || (a?.totp ?? 0) > 0;
    }).length;
    const now = this.now().getTime();
    const dormant = people.filter((u) => {
      if (u.state !== "ACTIVE") return false;
      if (!u.lastLoginAt) return true;
      return now - new Date(u.lastLoginAt).getTime() > 120 * 86400000;
    });
    const services = users.filter((u) => u.kind !== "person");
    const expiring = services.filter((u) => {
      const expires = u.attributes.blakid_expires_at;
      if (typeof expires !== "string" || !expires) return false;
      const t = new Date(expires).getTime();
      return t > now && t < now + 14 * 86400000;
    });
    const noMfa = people.filter((u) => {
      const a = byUser.get(u.id);
      return (a?.webauthn ?? 0) === 0 && (a?.totp ?? 0) === 0;
    });
    const privilegedWeak = people.filter((u) => {
      if (!privilegedIds.has(u.id)) return false;
      const a = byUser.get(u.id);
      return (a?.webauthn ?? 0) === 0;
    });
    const findings: string[] = [];
    if (noMfa.length) findings.push(`${noMfa.length} users do not have MFA`);
    if (privilegedWeak.length) {
      findings.push(
        `${privilegedWeak.length} privileged accounts use password + TOTP rather than phishing-resistant MFA`,
      );
    }
    if (expiring.length) findings.push(`${expiring.length} service credentials expire within 14 days`);
    if (dormant.length) findings.push(`${dormant.length} accounts have not authenticated in 120 days`);
    const adminsWithoutPasskey = privilegedWeak.length;
    if (adminsWithoutPasskey) findings.push(`${adminsWithoutPasskey} administrator accounts have never registered a passkey`);
    return {
      users: people.length,
      privilegedAccounts: privilegedIds.size,
      passkeyAdoption: people.length === 0 ? 0 : Math.round((withPasskey / people.length) * 100),
      mfaCoverage: people.length === 0 ? 0 : Math.round((withMfa / people.length) * 100),
      dormantAccounts: dormant.length,
      suspendedUsers: people.filter((u) => u.state === "SUSPENDED").length,
      applications: (await this.client(organisationId).listOidcApplications()).length +
        (await this.client(organisationId).listSamlApplications()).length,
      serviceAccounts: services.length,
      expiringCredentials: expiring.length,
      findings,
    };
  }

  async createWebhook(
    actor: Principal,
    organisationId: string,
    input: { url: string; secret: string; events: WebhookEventName[] },
  ) {
    authorize(actor, "organisation.settings.write", organisationId);
    return this.store.insertWebhook({
      id: this.ids(),
      organisationId,
      url: input.url,
      secret: input.secret,
      events: input.events,
      createdAt: this.now().toISOString(),
    });
  }

  async listWebhooks(actor: Principal, organisationId: string) {
    authorize(actor, "audit.read", organisationId);
    return this.store.listWebhooks(organisationId);
  }

  async listWebhookDeliveries(actor: Principal, organisationId: string) {
    authorize(actor, "audit.read", organisationId);
    return this.store.listDeliveries(organisationId);
  }

  private async dispatchWebhooks(event: AuditEvent) {
    const name = AUDIT_TO_WEBHOOK[event.action];
    if (!name) return;
    const endpoints = await this.store.listWebhooks(event.organisation_id);
    const payload = JSON.stringify({
      event: name,
      event_id: event.event_id,
      organisation_id: event.organisation_id,
      timestamp: event.timestamp,
      metadata: event.metadata,
    });
    for (const endpoint of endpoints) {
      if (!endpoint.events.includes(name)) continue;
      let delivery = await this.store.insertDelivery({
        id: this.ids(),
        webhookId: endpoint.id,
        eventId: event.event_id,
        event: name,
        status: "pending",
        attempts: 0,
        lastError: null,
        payload,
        createdAt: event.timestamp,
      });
      delivery = await deliverOnce(endpoint, delivery, event.timestamp, this.fetch);
      await this.store.updateDelivery(delivery);
    }
  }

  async createTrust(
    actor: Principal,
    organisationId: string,
    input: { peerOrganisationId: string; peerName: string; acceptAttributes: string[]; rejectAttributes: string[] },
    ctx?: RequestContext,
  ) {
    authorize(actor, "organisation.settings.write", organisationId);
    if (input.peerOrganisationId === organisationId) {
      throw new Error("An organisation cannot create a universal trust with itself as global authority");
    }
    if (input.peerOrganisationId === "*" || input.peerOrganisationId === "global") {
      throw new Error("There is no universal global trust relationship");
    }
    const policy = await this.store.insertTrust({
      id: this.ids(),
      organisationId,
      peerOrganisationId: input.peerOrganisationId,
      peerName: input.peerName,
      acceptAttributes: input.acceptAttributes,
      rejectAttributes: input.rejectAttributes,
      createdAt: this.now().toISOString(),
    });
    await this.record(actor, organisationId, "federation.trust.created", "trust", policy.id, "success", ctx, {
      peerOrganisationId: input.peerOrganisationId,
    });
    return policy;
  }

  async evaluateFederatedAssertions(
    actor: Principal,
    organisationId: string,
    peerOrganisationId: string,
    assertions: AttributeAssertion[],
  ) {
    authorize(actor, "identity.users.read", organisationId);
    const policy = await this.store.getTrust(organisationId, peerOrganisationId);
    return evaluateAssertions(policy, assertions);
  }

  async listTrusts(actor: Principal, organisationId: string) {
    authorize(actor, "identity.users.read", organisationId);
    return this.store.listTrusts(organisationId);
  }

  async ensureFederationKey(organisationId: string) {
    const existing = await this.store.getFederationKey(organisationId);
    if (existing) return existing;
    const generated = await generateFederationKeypair(organisationId, this.now().toISOString());
    return this.store.upsertFederationKey(generated);
  }

  async federationJwks(actor: Principal, organisationId: string) {
    authorize(actor, "applications.read", organisationId);
    const key = await this.ensureFederationKey(organisationId);
    return { keys: [key.publicJwk] };
  }

  async issueFederationAssertion(
    actor: Principal,
    organisationId: string,
    input: { audienceOrgId: string; subject: string; name?: string; attributes: AttributeAssertion[] },
    ctx?: RequestContext,
  ) {
    authorize(actor, "identity.users.read", organisationId);
    const key = await this.ensureFederationKey(organisationId);
    const token = await signFederationAssertion(key, {
      audienceOrgId: input.audienceOrgId,
      subject: input.subject,
      name: input.name,
      attributes: input.attributes,
      now: this.now(),
    });
    await this.record(actor, organisationId, "federation.assertion.issued", "identity", input.subject, "success", ctx, {
      audienceOrgId: input.audienceOrgId,
    });
    return { token, issuer: organisationId, audience: input.audienceOrgId };
  }

  async consumeFederationAssertion(actor: Principal, organisationId: string, token: string) {
    authorize(actor, "identity.users.read", organisationId);
    const issuer = peekFederationIssuer(token);
    if (issuer === organisationId) {
      throw new Error("Federation assertions are for peer organisations");
    }
    const policy = await this.store.getTrust(organisationId, issuer);
    if (!policy) {
      throw new Error("No explicit trust relationship with the issuing organisation");
    }
    const issuerKey = await this.store.getFederationKey(issuer);
    if (!issuerKey) throw new Error("Issuing organisation has no federation signing key");
    const payload = await verifyFederationAssertion(token, organisationId, issuerKey);
    const decisions = evaluateAssertions(policy, payload.attributes);
    await this.record(actor, organisationId, "federation.assertion.consumed", "identity", payload.sub, "success", undefined, {
      issuer,
      accepted: decisions.filter((d) => d.accepted).map((d) => d.attribute),
      rejected: decisions.filter((d) => !d.accepted).map((d) => d.attribute),
    });
    return { payload, decisions };
  }

  async createAgentAction(
    actor: Principal,
    organisationId: string,
    input: { tool: string; arguments: Record<string, unknown> },
  ): Promise<AgentAction> {
    const tool = mcpTool(input.tool);
    if (!tool) throw new Error(`Unknown MCP tool ${input.tool}`);
    if (tool.write) authorize(actor, "identity.users.read", organisationId);
    else authorize(actor, "applications.read", organisationId);
    const action = await this.store.insertAgentAction({
      id: this.ids(),
      organisationId,
      tool: input.tool,
      arguments: input.arguments,
      status: tool.requiresApproval ? "pending" : "approved",
      requesterId: actor.actorId,
      approverId: tool.requiresApproval ? null : actor.actorId,
      createdAt: this.now().toISOString(),
      decidedAt: tool.requiresApproval ? null : this.now().toISOString(),
      result: null,
    });
    return action;
  }

  async decideAgentAction(actor: Principal, organisationId: string, id: string, decision: "approved" | "denied") {
    authorize(actor, "applications.access.grant", organisationId);
    const action = await this.store.getAgentAction(id);
    if (!action || action.organisationId !== organisationId) throw new Error("Agent action not found");
    const next: AgentAction = {
      ...action,
      status: decision,
      approverId: actor.actorId,
      decidedAt: this.now().toISOString(),
    };
    return this.store.updateAgentAction(next);
  }

  async executeAgentAction(actor: Principal, organisationId: string, id: string) {
    const action = await this.store.getAgentAction(id);
    if (!action || action.organisationId !== organisationId) throw new Error("Agent action not found");
    if (writeRequiresApproval(action.tool) && action.status !== "approved") {
      throw new Error("High-impact MCP actions require human approval");
    }
    const args = action.arguments;
    let result: Record<string, unknown> = {};
    if (action.tool === "blakid_suspend_user") {
      const user = await this.suspendUser(actor, organisationId, String(args.userId));
      result = { userId: user.id, state: user.state };
    } else if (action.tool === "blakid_invite_user") {
      const user = await this.inviteUser(actor, organisationId, {
        email: String(args.email),
        name: String(args.name),
      });
      result = { userId: user.id };
    } else if (action.tool === "blakid_add_group_member") {
      await this.addGroupMember(actor, organisationId, String(args.groupId), String(args.userId));
      result = { ok: true };
    } else if (action.tool === "blakid_remove_group_member") {
      await this.removeGroupMember(actor, organisationId, String(args.groupId), String(args.userId));
      result = { ok: true };
    } else if (action.tool === "blakid_revoke_session") {
      await this.revokeSessions(actor, organisationId, String(args.userId));
      result = { ok: true };
    } else {
      throw new Error(`Cannot execute ${action.tool}`);
    }
    return this.store.updateAgentAction({
      ...action,
      status: "executed",
      result,
    });
  }

  async invokeMcp(actor: Principal, organisationId: string, tool: string, args: Record<string, unknown>) {
    const spec = mcpTool(tool);
    if (!spec) throw new Error(`Unknown MCP tool ${tool}`);
    if (spec.requiresApproval) {
      return this.createAgentAction(actor, organisationId, { tool, arguments: args });
    }
    if (tool === "blakid_list_users") return this.listUsers(actor, organisationId);
    if (tool === "blakid_get_user") return this.getUser(actor, organisationId, String(args.userId));
    if (tool === "blakid_list_groups") return this.listGroups(actor, organisationId);
    if (tool === "blakid_get_group") {
      const groups = await this.listGroups(actor, organisationId);
      return groups.find((g) => g.id === args.groupId) ?? null;
    }
    if (tool === "blakid_list_applications") return this.listApplications(actor, organisationId);
    if (tool === "blakid_get_audit_events") return this.listEvents(actor, organisationId);
    if (tool === "blakid_list_security_findings" || tool === "blakid_get_identity_risk") {
      return this.securityDashboard(actor, organisationId);
    }
    throw new Error(`Unhandled MCP tool ${tool}`);
  }

  byocManifest(organisation: Organisation) {
    return {
      hostingModel: organisation.hostingModel,
      region: organisation.region,
      yumaRole: "BlakIDYumaManagement",
      terraform: "infrastructure/terraform/byoc",
      customerOwns: ["BlakID control plane", "authentik", "PostgreSQL", "KMS", "logs"],
      yumaAccess: "narrowly scoped cross-account role",
    };
  }
}
