import type { AttributeAssertion, IdentityKind, UserState } from "@blakid/identity";

export type AuthentikUser = {
  id: string;
  username: string;
  email: string;
  name: string;
  isActive: boolean;
  state: UserState;
  kind: IdentityKind;
  groups: string[];
  assertions: AttributeAssertion[];
  attributes: Record<string, unknown>;
  createdAt: string;
};

export type AuthentikGroup = {
  id: string;
  name: string;
  memberIds: string[];
};

export type AuthentikSession = {
  id: string;
  userId: string;
  createdAt: string;
  lastUsedAt: string;
  userAgent: string | null;
  sourceIp: string | null;
};

export type OidcApplication = {
  id: string;
  name: string;
  slug: string;
  protocol: "oidc";
  clientId: string;
  clientSecret: string;
  issuerUrl: string;
  discoveryUrl: string;
  jwksUrl: string;
  authorizationUrl: string;
  tokenUrl: string;
  userinfoUrl: string;
  redirectUris: string[];
  logoutUri: string;
  scopes: string[];
};

export type CreateUserInput = {
  username: string;
  email: string;
  name: string;
  kind?: IdentityKind;
  state?: UserState;
  password?: string;
  assertions?: AttributeAssertion[];
  attributes?: Record<string, unknown>;
};

export type CreateOidcAppInput = {
  name: string;
  slug: string;
  redirectUris: string[];
  logoutUri?: string;
  scopes?: string[];
};

export type OidcDiscovery = {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
  jwks_uri: string;
  revocation_endpoint?: string;
  end_session_endpoint?: string;
  scopes_supported: string[];
  response_types_supported: string[];
  grant_types_supported: string[];
  code_challenge_methods_supported: string[];
  subject_types_supported: string[];
  id_token_signing_alg_values_supported: string[];
};

export interface AuthentikClient {
  readonly baseUrl: string;
  health(): Promise<{ live: boolean; ready: boolean; version: string }>;
  createUser(input: CreateUserInput): Promise<AuthentikUser>;
  updateUser(id: string, patch: Partial<AuthentikUser> & { password?: string }): Promise<AuthentikUser>;
  getUser(id: string): Promise<AuthentikUser>;
  findUserByEmail(email: string): Promise<AuthentikUser | null>;
  listUsers(): Promise<AuthentikUser[]>;
  createGroup(name: string): Promise<AuthentikGroup>;
  listGroups(): Promise<AuthentikGroup[]>;
  addGroupMember(groupId: string, userId: string): Promise<void>;
  removeGroupMember(groupId: string, userId: string): Promise<void>;
  listSessions(userId?: string): Promise<AuthentikSession[]>;
  createSession(input: {
    userId: string;
    userAgent?: string | null;
    sourceIp?: string | null;
  }): Promise<AuthentikSession>;
  revokeSession(sessionId: string): Promise<void>;
  revokeAllSessions(userId: string): Promise<void>;
  createOidcApplication(input: CreateOidcAppInput): Promise<OidcApplication>;
  getOidcApplication(id: string): Promise<OidcApplication>;
  listOidcApplications(): Promise<OidcApplication[]>;
  getOidcDiscovery(slug: string): Promise<OidcDiscovery>;
  getJwks(slug: string): Promise<{ keys: Record<string, unknown>[] }>;
}

export class AuthentikApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "AuthentikApiError";
  }
}
