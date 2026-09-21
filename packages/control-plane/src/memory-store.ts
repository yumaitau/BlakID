import type { AuditEvent } from "@blakid/audit";
import type { FederationKeypair, TrustPolicy } from "@blakid/federation";
import type { SupportAccessRequest } from "@blakid/support-access";
import type { WebhookDelivery, WebhookEndpoint } from "@blakid/webhooks";
import type {
  AccessRequest,
  AgentAction,
  BlakIDStore,
  ControlPlaneMember,
  Deployment,
  InboundScimCredential,
  Invitation,
  Organisation,
} from "./types.ts";

export class MemoryStore implements BlakIDStore {
  organisations = new Map<string, Organisation>();
  deployments = new Map<string, Deployment>();
  members = new Map<string, ControlPlaneMember>();
  invitations = new Map<string, Invitation>();
  support = new Map<string, SupportAccessRequest>();
  accessRequests = new Map<string, AccessRequest>();
  audit: AuditEvent[] = [];
  webhooks = new Map<string, WebhookEndpoint>();
  deliveries = new Map<string, WebhookDelivery>();
  trusts = new Map<string, TrustPolicy>();
  agentActions = new Map<string, AgentAction>();
  scimCredentials = new Map<string, InboundScimCredential>();
  federationKeys = new Map<string, FederationKeypair>();

  async insertOrganisation(org: Organisation) {
    if ([...this.organisations.values()].some((o) => o.slug === org.slug)) {
      throw new Error(`Organisation slug ${org.slug} already exists`);
    }
    this.organisations.set(org.id, org);
    return org;
  }
  async getOrganisation(id: string) {
    return this.organisations.get(id) ?? null;
  }
  async getOrganisationBySlug(slug: string) {
    return [...this.organisations.values()].find((o) => o.slug === slug) ?? null;
  }
  async listOrganisations() {
    return [...this.organisations.values()];
  }
  async updateOrganisation(id: string, patch: Partial<Organisation>) {
    const current = this.organisations.get(id);
    if (!current) throw new Error("Organisation not found");
    const next = { ...current, ...patch, id: current.id };
    this.organisations.set(id, next);
    return next;
  }
  async insertDeployment(deployment: Deployment) {
    this.deployments.set(deployment.organisationId, deployment);
    return deployment;
  }
  async getDeployment(organisationId: string) {
    return this.deployments.get(organisationId) ?? null;
  }
  async updateDeployment(organisationId: string, patch: Partial<Deployment>) {
    const current = this.deployments.get(organisationId);
    if (!current) throw new Error("Deployment not found");
    const next = { ...current, ...patch, id: current.id, organisationId };
    this.deployments.set(organisationId, next);
    return next;
  }
  async insertMember(member: ControlPlaneMember) {
    this.members.set(member.id, member);
    return member;
  }
  async listMembers(organisationId: string) {
    return [...this.members.values()].filter((m) => m.organisationId === organisationId);
  }
  async updateMember(member: ControlPlaneMember) {
    this.members.set(member.id, member);
    return member;
  }
  async insertInvitation(invitation: Invitation) {
    this.invitations.set(invitation.id, invitation);
    return invitation;
  }
  async getInvitationByTokenHash(hash: string) {
    return [...this.invitations.values()].find((i) => i.tokenHash === hash) ?? null;
  }
  async insertSupport(request: SupportAccessRequest) {
    this.support.set(request.id, request);
    return request;
  }
  async getSupport(id: string) {
    return this.support.get(id) ?? null;
  }
  async listSupport(organisationId: string) {
    return [...this.support.values()].filter((s) => s.organisationId === organisationId);
  }
  async updateSupport(request: SupportAccessRequest) {
    this.support.set(request.id, request);
    return request;
  }
  async insertAccessRequest(request: AccessRequest) {
    this.accessRequests.set(request.id, request);
    return request;
  }
  async listAccessRequests(organisationId: string) {
    return [...this.accessRequests.values()].filter((r) => r.organisationId === organisationId);
  }
  async updateAccessRequest(request: AccessRequest) {
    this.accessRequests.set(request.id, request);
    return request;
  }
  async appendAudit(event: AuditEvent) {
    if (this.audit.some((e) => e.event_id === event.event_id)) {
      throw new Error("Audit events are immutable; duplicate event_id");
    }
    this.audit.push(Object.freeze({ ...event, metadata: Object.freeze({ ...event.metadata }) }));
    return event;
  }
  async listAudit(organisationId: string) {
    return this.audit.filter((e) => e.organisation_id === organisationId);
  }
  async insertWebhook(endpoint: WebhookEndpoint) {
    this.webhooks.set(endpoint.id, endpoint);
    return endpoint;
  }
  async listWebhooks(organisationId: string) {
    return [...this.webhooks.values()].filter((w) => w.organisationId === organisationId);
  }
  async insertDelivery(delivery: WebhookDelivery) {
    this.deliveries.set(delivery.id, delivery);
    return delivery;
  }
  async listDeliveries(organisationId: string) {
    const hooks = new Set((await this.listWebhooks(organisationId)).map((w) => w.id));
    return [...this.deliveries.values()].filter((d) => hooks.has(d.webhookId));
  }
  async updateDelivery(delivery: WebhookDelivery) {
    this.deliveries.set(delivery.id, delivery);
    return delivery;
  }
  async insertTrust(policy: TrustPolicy) {
    this.trusts.set(policy.id, policy);
    return policy;
  }
  async listTrusts(organisationId: string) {
    return [...this.trusts.values()].filter((t) => t.organisationId === organisationId);
  }
  async getTrust(organisationId: string, peerOrganisationId: string) {
    return (
      [...this.trusts.values()].find(
        (t) => t.organisationId === organisationId && t.peerOrganisationId === peerOrganisationId,
      ) ?? null
    );
  }
  async insertAgentAction(action: AgentAction) {
    this.agentActions.set(action.id, action);
    return action;
  }
  async getAgentAction(id: string) {
    return this.agentActions.get(id) ?? null;
  }
  async listAgentActions(organisationId: string) {
    return [...this.agentActions.values()].filter((a) => a.organisationId === organisationId);
  }
  async updateAgentAction(action: AgentAction) {
    this.agentActions.set(action.id, action);
    return action;
  }
  async insertScimCredential(credential: InboundScimCredential) {
    this.scimCredentials.set(credential.id, credential);
    return credential;
  }
  async getScimCredentialByTokenHash(hash: string) {
    return [...this.scimCredentials.values()].find((c) => c.tokenHash === hash) ?? null;
  }
  async listScimCredentials(organisationId: string) {
    return [...this.scimCredentials.values()].filter((c) => c.organisationId === organisationId);
  }
  async upsertFederationKey(key: FederationKeypair) {
    this.federationKeys.set(key.organisationId, key);
    return key;
  }
  async getFederationKey(organisationId: string) {
    return this.federationKeys.get(organisationId) ?? null;
  }
}
