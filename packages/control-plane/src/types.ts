import type { AuditEvent } from "@blakid/audit";
import type { AuthentikClient, OidcApplication } from "@blakid/authentik";
import type { Principal, Role } from "@blakid/authz";
import type { HostingModel } from "@blakid/config";
import type { FederationKeypair, TrustPolicy } from "@blakid/federation";
import type { SupportAccessRequest } from "@blakid/support-access";
import type { WebhookDelivery, WebhookEndpoint } from "@blakid/webhooks";

export type OrganisationStatus = "provisioning" | "ready" | "degraded" | "suspended";

export type Organisation = {
  id: string;
  name: string;
  slug: string;
  hostname: string;
  customDomain: string | null;
  hostingModel: HostingModel;
  region: string;
  regionLabel: string;
  status: OrganisationStatus;
  existingIdp: string | null;
  createdAt: string;
};

export type Deployment = {
  id: string;
  organisationId: string;
  authentikUrl: string;
  authentikVersion: string;
  postgresName: string;
  composeProject: string;
  status: "starting" | "healthy" | "unhealthy" | "stopped";
  lastBackupAt: string | null;
  lastBackupStatus: string | null;
  lastRestoreTestAt: string | null;
  lastRestoreTestStatus: string | null;
  signingKeyCreatedAt: string | null;
  certificateExpiresAt: string | null;
  httpPort: string | null;
};

export type AccessRequest = {
  id: string;
  organisationId: string;
  requesterId: string;
  applicationId: string;
  requestedRole: string;
  justification: string;
  status: "pending" | "approved" | "denied";
  approverId: string | null;
  decidedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
};

export type ControlPlaneMember = {
  id: string;
  organisationId: string;
  email: string;
  name: string;
  role: Role;
  authentikUserId: string | null;
  createdAt: string;
};

export type AgentAction = {
  id: string;
  organisationId: string;
  tool: string;
  arguments: Record<string, unknown>;
  status: "pending" | "approved" | "denied" | "executed";
  requesterId: string;
  approverId: string | null;
  createdAt: string;
  decidedAt: string | null;
  result: Record<string, unknown> | null;
};

export type InboundScimCredential = {
  id: string;
  organisationId: string;
  tokenHash: string;
  tokenHint: string;
  createdAt: string;
};

export type Invitation = {
  id: string;
  organisationId: string;
  email: string;
  name: string;
  role: Role;
  token: string;
  tokenHash: string;
  expiresAt: string;
  acceptedAt: string | null;
};

export type RequestContext = {
  sourceIp: string | null;
  userAgent: string | null;
  requestId: string | null;
};

export type TenantHandle = {
  organisationId: string;
  client: AuthentikClient;
};

export type BackupResult = {
  at: string;
  status: "healthy" | "failed";
  region: string;
  engine: "pg_dump" | "directory_export";
  bytes: number;
  path?: string;
};

export interface TenantRuntime {
  provision(organisation: Organisation): Promise<{
    client: AuthentikClient;
    deployment: Omit<Deployment, "id" | "organisationId">;
  }>;
  clientFor(organisationId: string): AuthentikClient;
  backup(organisationId: string): Promise<BackupResult>;
  restoreTest(organisationId: string): Promise<{ at: string; status: "PASS" | "FAIL"; engine: string }>;
  health(organisationId: string): Promise<{ live: boolean; ready: boolean; version: string }>;
  passkeyEnrolmentUrl(organisationId: string): string;
  totpEnrolmentUrl(organisationId: string): string;
}

export interface BlakIDStore {
  insertOrganisation(org: Organisation): Promise<Organisation>;
  getOrganisation(id: string): Promise<Organisation | null>;
  getOrganisationBySlug(slug: string): Promise<Organisation | null>;
  listOrganisations(): Promise<Organisation[]>;
  updateOrganisation(id: string, patch: Partial<Organisation>): Promise<Organisation>;
  insertDeployment(deployment: Deployment): Promise<Deployment>;
  getDeployment(organisationId: string): Promise<Deployment | null>;
  updateDeployment(organisationId: string, patch: Partial<Deployment>): Promise<Deployment>;
  insertMember(member: ControlPlaneMember): Promise<ControlPlaneMember>;
  listMembers(organisationId: string): Promise<ControlPlaneMember[]>;
  updateMember(member: ControlPlaneMember): Promise<ControlPlaneMember>;
  insertInvitation(invitation: Invitation): Promise<Invitation>;
  getInvitationByTokenHash(hash: string): Promise<Invitation | null>;
  insertSupport(request: SupportAccessRequest): Promise<SupportAccessRequest>;
  getSupport(id: string): Promise<SupportAccessRequest | null>;
  listSupport(organisationId: string): Promise<SupportAccessRequest[]>;
  updateSupport(request: SupportAccessRequest): Promise<SupportAccessRequest>;
  insertAccessRequest(request: AccessRequest): Promise<AccessRequest>;
  listAccessRequests(organisationId: string): Promise<AccessRequest[]>;
  updateAccessRequest(request: AccessRequest): Promise<AccessRequest>;
  appendAudit(event: AuditEvent): Promise<AuditEvent>;
  listAudit(organisationId: string): Promise<AuditEvent[]>;
  insertWebhook(endpoint: WebhookEndpoint): Promise<WebhookEndpoint>;
  listWebhooks(organisationId: string): Promise<WebhookEndpoint[]>;
  insertDelivery(delivery: WebhookDelivery): Promise<WebhookDelivery>;
  listDeliveries(organisationId: string): Promise<WebhookDelivery[]>;
  updateDelivery(delivery: WebhookDelivery): Promise<WebhookDelivery>;
  insertTrust(policy: TrustPolicy): Promise<TrustPolicy>;
  listTrusts(organisationId: string): Promise<TrustPolicy[]>;
  getTrust(organisationId: string, peerOrganisationId: string): Promise<TrustPolicy | null>;
  insertAgentAction(action: AgentAction): Promise<AgentAction>;
  getAgentAction(id: string): Promise<AgentAction | null>;
  listAgentActions(organisationId: string): Promise<AgentAction[]>;
  updateAgentAction(action: AgentAction): Promise<AgentAction>;
  insertScimCredential(credential: InboundScimCredential): Promise<InboundScimCredential>;
  getScimCredentialByTokenHash(hash: string): Promise<InboundScimCredential | null>;
  listScimCredentials(organisationId: string): Promise<InboundScimCredential[]>;
  upsertFederationKey(key: FederationKeypair): Promise<FederationKeypair>;
  getFederationKey(organisationId: string): Promise<FederationKeypair | null>;
}

export type ProvisionInput = {
  name: string;
  slug: string;
  customDomain?: string | null;
  hostingModel?: HostingModel;
  existingIdp?: string | null;
  adminEmail: string;
  adminName: string;
};

export type OidcCreateResult = OidcApplication;
