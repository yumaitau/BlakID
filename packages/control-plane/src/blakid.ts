import { createHash, randomBytes } from "node:crypto";
import { ImmutableAuditLog, toCsv, type AuditAction, type AuditEvent } from "@blakid/audit";
import type { AuthentikUser, OidcApplication } from "@blakid/authentik";
import {
  authorize,
  ForbiddenError,
  type Permission,
  type Principal,
} from "@blakid/authz";
import {
  DEFAULT_REGION,
  DEFAULT_REGION_LABEL,
  RETENTION,
  TENANT_HOST_SUFFIX,
  type HostingModel,
} from "@blakid/config";
import {
  assertNotIndigenousIdentityClaim,
  transition,
  type AttributeAssertion,
  type IdentityKind,
  type UserState,
} from "@blakid/identity";
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

  constructor(options: BlakIDOptions) {
    this.store = options.store;
    this.runtime = options.runtime;
    this.ids = options.ids ?? (() => randomBytes(16).toString("hex"));
    this.now = options.now ?? (() => new Date());
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
    action: AuditAction,
    targetType: string,
    targetId: string,
    result: AuditEvent["result"],
    ctx: RequestContext | undefined,
    metadata: Record<string, unknown> = {},
  ) {
    return this.audit.record({
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
    return this.client(organisationId).listOidcApplications();
  }

  async getApplication(actor: Principal, organisationId: string, id: string) {
    authorize(actor, "applications.read", organisationId);
    return this.client(organisationId).getOidcApplication(id);
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

  async exportEvents(actor: Principal, organisationId: string, format: "json" | "csv") {
    authorize(actor, "audit.export", organisationId);
    const events = await this.store.listAudit(organisationId);
    if (format === "csv") return toCsv(events);
    return JSON.stringify(events, null, 2);
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
    return this.store.insertAccessRequest(request);
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
    return this.store.updateAccessRequest(next);
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
}
