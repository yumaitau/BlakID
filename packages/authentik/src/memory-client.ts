import { generateKeyPair, exportJWK, SignJWT, type JWK } from "jose";
import {
  assertNotIndigenousIdentityClaim,
  transition,
  type UserState,
} from "@blakid/identity";
import {
  AuthentikApiError,
  type AuthentikClient,
  type AuthentikGroup,
  type AuthentikSession,
  type AuthentikUser,
  type CreateOidcAppInput,
  type CreateUserInput,
  type OidcApplication,
  type OidcDiscovery,
} from "./types.ts";

type MemoryUser = AuthentikUser & { password?: string };

export class InMemoryAuthentik implements AuthentikClient {
  readonly users = new Map<string, MemoryUser>();
  readonly groups = new Map<string, AuthentikGroup>();
  readonly sessions = new Map<string, AuthentikSession>();
  readonly applications = new Map<string, OidcApplication>();
  private signingKey: { privateKey: CryptoKey; jwk: JWK } | null = null;
  private seq = 1;

  constructor(
    readonly baseUrl: string,
    readonly version: string,
    private readonly ids: () => string,
    private readonly now: () => Date,
  ) {}

  private nextId(prefix: string): string {
    this.seq += 1;
    return `${prefix}-${this.ids()}-${this.seq}`;
  }

  async readyKeys() {
    if (this.signingKey) return this.signingKey;
    const pair = await generateKeyPair("RS256", { extractable: true });
    const jwk = await exportJWK(pair.publicKey);
    jwk.kid = "blakid-memory-1";
    jwk.use = "sig";
    jwk.alg = "RS256";
    this.signingKey = { privateKey: pair.privateKey, jwk };
    return this.signingKey;
  }

  async health() {
    return { live: true, ready: true, version: this.version };
  }

  async createUser(input: CreateUserInput): Promise<AuthentikUser> {
    assertNotIndigenousIdentityClaim(input.assertions ?? []);
    const id = this.nextId("user");
    const user: MemoryUser = {
      id,
      username: input.username,
      email: input.email.toLowerCase(),
      name: input.name,
      isActive: (input.state ?? "INVITED") === "ACTIVE" || (input.state ?? "INVITED") === "INVITED",
      state: input.state ?? "INVITED",
      kind: input.kind ?? "person",
      groups: [],
      assertions: input.assertions ?? [],
      attributes: {
        blakid_state: input.state ?? "INVITED",
        blakid_kind: input.kind ?? "person",
        ...(input.attributes ?? {}),
      },
      createdAt: this.now().toISOString(),
      password: input.password,
    };
    if (user.state === "SUSPENDED" || user.state === "ARCHIVED" || user.state === "DELETED") {
      user.isActive = false;
    }
    this.users.set(id, user);
    return this.publicUser(user);
  }

  async updateUser(id: string, patch: Partial<AuthentikUser> & { password?: string }): Promise<AuthentikUser> {
    const user = this.users.get(id);
    if (!user) throw new AuthentikApiError(404, `User ${id} not found`);
    if (patch.state && patch.state !== user.state) {
      user.state = transition(user.state, patch.state);
    }
    if (patch.name) user.name = patch.name;
    if (patch.email) user.email = patch.email.toLowerCase();
    if (patch.username) user.username = patch.username;
    if (patch.kind) user.kind = patch.kind;
    if (patch.assertions) {
      assertNotIndigenousIdentityClaim(patch.assertions);
      user.assertions = patch.assertions;
    }
    if (patch.attributes) user.attributes = { ...user.attributes, ...patch.attributes };
    if (patch.password) user.password = patch.password;
    if (patch.isActive !== undefined) user.isActive = patch.isActive;
    user.attributes.blakid_state = user.state;
    if (user.state === "SUSPENDED" || user.state === "ARCHIVED" || user.state === "DELETED" || user.state === "LOCKED") {
      user.isActive = false;
    }
    if (user.state === "ACTIVE") user.isActive = true;
    return this.publicUser(user);
  }

  async getUser(id: string): Promise<AuthentikUser> {
    const user = this.users.get(id);
    if (!user) throw new AuthentikApiError(404, `User ${id} not found`);
    return this.publicUser(user);
  }

  async findUserByEmail(email: string): Promise<AuthentikUser | null> {
    const found = [...this.users.values()].find((u) => u.email === email.toLowerCase());
    return found ? this.publicUser(found) : null;
  }

  async listUsers(): Promise<AuthentikUser[]> {
    return [...this.users.values()].map((u) => this.publicUser(u));
  }

  async createGroup(name: string): Promise<AuthentikGroup> {
    const group: AuthentikGroup = { id: this.nextId("group"), name, memberIds: [] };
    this.groups.set(group.id, group);
    return group;
  }

  async listGroups(): Promise<AuthentikGroup[]> {
    return [...this.groups.values()].map((g) => ({ ...g, memberIds: [...g.memberIds] }));
  }

  async addGroupMember(groupId: string, userId: string): Promise<void> {
    const group = this.groups.get(groupId);
    const user = this.users.get(userId);
    if (!group || !user) throw new AuthentikApiError(404, "Group or user not found");
    if (!group.memberIds.includes(userId)) group.memberIds.push(userId);
    if (!user.groups.includes(groupId)) user.groups.push(groupId);
  }

  async removeGroupMember(groupId: string, userId: string): Promise<void> {
    const group = this.groups.get(groupId);
    const user = this.users.get(userId);
    if (!group || !user) throw new AuthentikApiError(404, "Group or user not found");
    group.memberIds = group.memberIds.filter((id) => id !== userId);
    user.groups = user.groups.filter((id) => id !== groupId);
  }

  async listSessions(userId?: string): Promise<AuthentikSession[]> {
    return [...this.sessions.values()].filter((s) => (userId ? s.userId === userId : true));
  }

  async createSession(input: {
    userId: string;
    userAgent?: string | null;
    sourceIp?: string | null;
  }): Promise<AuthentikSession> {
    const user = this.users.get(input.userId);
    if (!user) throw new AuthentikApiError(404, "User not found");
    if (!user.isActive || user.state !== "ACTIVE") {
      throw new AuthentikApiError(403, "Identity is not active");
    }
    const session: AuthentikSession = {
      id: this.nextId("sess"),
      userId: input.userId,
      createdAt: this.now().toISOString(),
      lastUsedAt: this.now().toISOString(),
      userAgent: input.userAgent ?? null,
      sourceIp: input.sourceIp ?? null,
    };
    this.sessions.set(session.id, session);
    return session;
  }

  async revokeSession(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }

  async revokeAllSessions(userId: string): Promise<void> {
    for (const [id, session] of this.sessions) {
      if (session.userId === userId) this.sessions.delete(id);
    }
  }

  async createOidcApplication(input: CreateOidcAppInput): Promise<OidcApplication> {
    const slug = input.slug;
    const origin = this.baseUrl.replace(/\/$/, "");
    const app: OidcApplication = {
      id: this.nextId("app"),
      name: input.name,
      slug,
      protocol: "oidc",
      clientId: this.nextId("cid"),
      clientSecret: this.nextId("csecret"),
      issuerUrl: `${origin}/application/o/${slug}/`,
      discoveryUrl: `${origin}/application/o/${slug}/.well-known/openid-configuration`,
      jwksUrl: `${origin}/application/o/${slug}/jwks/`,
      authorizationUrl: `${origin}/application/o/authorize/`,
      tokenUrl: `${origin}/application/o/token/`,
      userinfoUrl: `${origin}/application/o/userinfo/`,
      redirectUris: [...input.redirectUris],
      logoutUri: input.logoutUri ?? `${origin}/application/o/${slug}/end-session/`,
      scopes: input.scopes ?? ["openid", "profile", "email", "offline_access"],
    };
    this.applications.set(app.id, app);
    return { ...app, redirectUris: [...app.redirectUris], scopes: [...app.scopes] };
  }

  async getOidcApplication(id: string): Promise<OidcApplication> {
    const app = this.applications.get(id) ?? [...this.applications.values()].find((a) => a.slug === id);
    if (!app) throw new AuthentikApiError(404, "Application not found");
    return { ...app, redirectUris: [...app.redirectUris], scopes: [...app.scopes] };
  }

  async listOidcApplications(): Promise<OidcApplication[]> {
    return [...this.applications.values()].map((a) => ({
      ...a,
      redirectUris: [...a.redirectUris],
      scopes: [...a.scopes],
    }));
  }

  async getOidcDiscovery(slug: string): Promise<OidcDiscovery> {
    const app = [...this.applications.values()].find((a) => a.slug === slug);
    if (!app) throw new AuthentikApiError(404, "Unknown application");
    const origin = this.baseUrl.replace(/\/$/, "");
    return {
      issuer: app.issuerUrl,
      authorization_endpoint: app.authorizationUrl,
      token_endpoint: app.tokenUrl,
      userinfo_endpoint: app.userinfoUrl,
      jwks_uri: app.jwksUrl,
      revocation_endpoint: `${origin}/application/o/revoke/`,
      end_session_endpoint: app.logoutUri,
      scopes_supported: app.scopes,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token", "client_credentials"],
      code_challenge_methods_supported: ["S256"],
      subject_types_supported: ["public"],
      id_token_signing_alg_values_supported: ["RS256"],
    };
  }

  async getJwks(slug: string): Promise<{ keys: Record<string, unknown>[] }> {
    await this.getOidcDiscovery(slug);
    const keys = await this.readyKeys();
    return { keys: [keys.jwk as Record<string, unknown>] };
  }

  async authenticatePassword(email: string, password: string): Promise<AuthentikUser> {
    const user = [...this.users.values()].find((u) => u.email === email.toLowerCase());
    if (!user || !user.password || user.password !== password) {
      throw new AuthentikApiError(401, "Invalid credentials");
    }
    if (!user.isActive || user.state === "SUSPENDED" || user.state === "LOCKED" || user.state === "ARCHIVED" || user.state === "DELETED") {
      throw new AuthentikApiError(403, "Identity is not active");
    }
    if (user.state === "INVITED") {
      user.state = "ACTIVE" as UserState;
      user.attributes.blakid_state = "ACTIVE";
    }
    return this.publicUser(user);
  }

  async signIdToken(app: OidcApplication, user: AuthentikUser): Promise<string> {
    const keys = await this.readyKeys();
    return new SignJWT({
      email: user.email,
      name: user.name,
      preferred_username: user.username,
      blakid_kind: user.kind,
      blakid_state: user.state,
      groups: user.groups,
    })
      .setProtectedHeader({ alg: "RS256", kid: "blakid-memory-1" })
      .setIssuer(app.issuerUrl)
      .setAudience(app.clientId)
      .setSubject(user.email)
      .setIssuedAt()
      .setExpirationTime("10m")
      .sign(keys.privateKey);
  }

  private publicUser(user: MemoryUser): AuthentikUser {
    const { password: _password, ...rest } = user;
    return {
      ...rest,
      groups: [...rest.groups],
      assertions: rest.assertions.map((a) => ({ ...a })),
      attributes: { ...rest.attributes },
    };
  }
}
