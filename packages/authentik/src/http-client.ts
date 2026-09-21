import type { UserState } from "@blakid/identity";
import { authentikUserRefs } from "./user-refs.ts";
import {
  AuthentikApiError,
  type AuthentikClient,
  type AuthentikGroup,
  type AuthentikSession,
  type AuthentikUser,
  type CreateFederationSourceInput,
  type CreateOidcAppInput,
  type CreateSamlAppInput,
  type CreateScimProviderInput,
  type CreateUserInput,
  type FederationSource,
  type FederationSourceType,
  type OidcApplication,
  type OidcDiscovery,
  type SamlApplication,
  type ScimProvider,
  type UserAuthenticators,
} from "./types.ts";

type Json = Record<string, unknown>;

function asString(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

export class HttpAuthentikClient implements AuthentikClient {
  constructor(
    readonly baseUrl: string,
    private readonly token: string,
    private readonly version: string,
  ) {}

  private async request(path: string, init: RequestInit = {}): Promise<unknown> {
    const url = `${this.baseUrl.replace(/\/$/, "")}${path}`;
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${this.token}`);
    headers.set("Accept", "application/json");
    if (init.body && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json");
    }
    const response = await fetch(url, { ...init, headers });
    if (!response.ok) {
      const text = await response.text();
      throw new AuthentikApiError(response.status, `authentik ${path} ${response.status}: ${text.slice(0, 400)}`);
    }
    if (response.status === 204) return null;
    const contentType = response.headers.get("content-type") ?? "";
    if (!contentType.includes("json")) return null;
    return response.json();
  }

  async health(): Promise<{ live: boolean; ready: boolean; version: string }> {
    try {
      const liveRes = await fetch(`${this.baseUrl.replace(/\/$/, "")}/-/health/live/`);
      const readyRes = await fetch(`${this.baseUrl.replace(/\/$/, "")}/-/health/ready/`);
      return {
        live: liveRes.ok,
        ready: readyRes.ok,
        version: this.version,
      };
    } catch {
      return { live: false, ready: false, version: this.version };
    }
  }

  async createUser(input: CreateUserInput): Promise<AuthentikUser> {
    const body = {
      username: input.username,
      name: input.name,
      email: input.email,
      is_active: input.state !== "SUSPENDED" && input.state !== "ARCHIVED" && input.state !== "DELETED",
      attributes: {
        blakid_state: input.state ?? "INVITED",
        blakid_kind: input.kind ?? "person",
        blakid_assertions: input.assertions ?? [],
        ...(input.attributes ?? {}),
      },
    };
    const created = (await this.request("/api/v3/core/users/", {
      method: "POST",
      body: JSON.stringify(body),
    })) as Json;
    if (input.password) {
      const pk = asNumber(created.pk) ?? asString(created.pk);
      await this.request(`/api/v3/core/users/${pk}/set_password/`, {
        method: "POST",
        body: JSON.stringify({ password: input.password }),
      });
    }
    return this.mapUser(created);
  }

  async updateUser(id: string, patch: Partial<AuthentikUser> & { password?: string }): Promise<AuthentikUser> {
    const body: Json = {};
    if (patch.name) body.name = patch.name;
    if (patch.email) body.email = patch.email;
    if (patch.username) body.username = patch.username;
    if (patch.isActive !== undefined) body.is_active = patch.isActive;
    if (patch.state || patch.kind || patch.assertions || patch.attributes) {
      body.attributes = {
        ...(patch.attributes ?? {}),
        ...(patch.state ? { blakid_state: patch.state } : {}),
        ...(patch.kind ? { blakid_kind: patch.kind } : {}),
        ...(patch.assertions ? { blakid_assertions: patch.assertions } : {}),
      };
    }
    const updated = (await this.request(`/api/v3/core/users/${id}/`, {
      method: "PATCH",
      body: JSON.stringify(body),
    })) as Json;
    if (patch.password) {
      await this.request(`/api/v3/core/users/${id}/set_password/`, {
        method: "POST",
        body: JSON.stringify({ password: patch.password }),
      });
    }
    return this.mapUser(updated);
  }

  async getUser(id: string): Promise<AuthentikUser> {
    const raw = (await this.request(`/api/v3/core/users/${id}/`)) as Json;
    return this.mapUser(raw);
  }

  async findUserByEmail(email: string): Promise<AuthentikUser | null> {
    const raw = (await this.request(`/api/v3/core/users/?email=${encodeURIComponent(email)}`)) as Json;
    const results = (raw.results as Json[] | undefined) ?? [];
    const match = results.find((u) => asString(u.email).toLowerCase() === email.toLowerCase());
    return match ? this.mapUser(match) : null;
  }

  async listUsers(): Promise<AuthentikUser[]> {
    const raw = (await this.request("/api/v3/core/users/?page_size=200")) as Json;
    const results = (raw.results as Json[] | undefined) ?? [];
    return results.map((u) => this.mapUser(u));
  }

  async createGroup(name: string): Promise<AuthentikGroup> {
    const raw = (await this.request("/api/v3/core/groups/", {
      method: "POST",
      body: JSON.stringify({ name }),
    })) as Json;
    return {
      id: String(raw.pk ?? raw.uuid),
      name: asString(raw.name, name),
      memberIds: [],
    };
  }

  async listGroups(): Promise<AuthentikGroup[]> {
    const raw = (await this.request("/api/v3/core/groups/?page_size=200")) as Json;
    const results = (raw.results as Json[] | undefined) ?? [];
    return results.map((g) => ({
      id: String(g.pk ?? g.uuid),
      name: asString(g.name),
      memberIds: Array.isArray(g.users) ? g.users.map(String) : [],
    }));
  }

  async addGroupMember(groupId: string, userId: string): Promise<void> {
    const group = (await this.request(`/api/v3/core/groups/${groupId}/`)) as Json;
    const users = Array.isArray(group.users) ? group.users.map(String) : [];
    if (!users.includes(userId)) users.push(userId);
    await this.request(`/api/v3/core/groups/${groupId}/`, {
      method: "PATCH",
      body: JSON.stringify({ users: authentikUserRefs(users) }),
    });
  }

  async removeGroupMember(groupId: string, userId: string): Promise<void> {
    const group = (await this.request(`/api/v3/core/groups/${groupId}/`)) as Json;
    const users = (Array.isArray(group.users) ? group.users.map(String) : []).filter((id) => id !== userId);
    await this.request(`/api/v3/core/groups/${groupId}/`, {
      method: "PATCH",
      body: JSON.stringify({ users: authentikUserRefs(users) }),
    });
  }

  async listSessions(userId?: string): Promise<AuthentikSession[]> {
    const qs = userId ? `?user=${encodeURIComponent(userId)}` : "";
    const raw = (await this.request(`/api/v3/core/authenticated_sessions/${qs}`)) as Json;
    const results = (raw.results as Json[] | undefined) ?? [];
    return results.map((s) => ({
      id: asString(s.uuid ?? s.pk),
      userId: String(s.user ?? ""),
      createdAt: asString(s.last_ip ? s.last_used : s.expires),
      lastUsedAt: asString(s.last_used ?? s.expires),
      userAgent: asString(s.user_agent) || null,
      sourceIp: asString(s.last_ip) || null,
    }));
  }

  async createSession(): Promise<AuthentikSession> {
    throw new AuthentikApiError(405, "Sessions are created by authentik during login");
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.request(`/api/v3/core/authenticated_sessions/${sessionId}/`, { method: "DELETE" });
  }

  async revokeAllSessions(userId: string): Promise<void> {
    const sessions = await this.listSessions(userId);
    for (const session of sessions) {
      await this.revokeSession(session.id);
    }
    await this.request("/api/v3/oauth2/refresh_tokens/?user=" + encodeURIComponent(userId)).catch(() => null);
    const tokens = (await this.request(`/api/v3/oauth2/refresh_tokens/?user=${encodeURIComponent(userId)}`).catch(
      () => ({ results: [] }),
    )) as Json;
    const results = (tokens.results as Json[] | undefined) ?? [];
    for (const token of results) {
      const id = token.pk ?? token.id;
      if (id) {
        await this.request(`/api/v3/oauth2/refresh_tokens/${id}/`, { method: "DELETE" }).catch(() => null);
      }
    }
  }

  private async locateFlows(): Promise<{ authorization: Json; invalidation: Json; authentication: Json | null; enrollment: Json | null }> {
    const flows = (await this.request("/api/v3/flows/instances/?page_size=100")) as Json;
    const flowList = (flows.results as Json[] | undefined) ?? [];
    const authorization =
      flowList.find((f) => asString(f.slug).includes("implicit-consent")) ??
      flowList.find((f) => asString(f.designation) === "authorization") ??
      flowList.find((f) => asString(f.slug).includes("authorization"));
    const invalidation =
      flowList.find((f) => asString(f.slug).includes("provider-invalidation")) ??
      flowList.find((f) => asString(f.designation) === "invalidation") ??
      flowList.find((f) => asString(f.slug).includes("invalidation"));
    if (!authorization || !invalidation) {
      throw new AuthentikApiError(500, "Could not locate authentik authorization/invalidation flows");
    }
    const authentication =
      flowList.find((f) => asString(f.designation) === "authentication") ??
      flowList.find((f) => asString(f.slug).includes("authentication")) ??
      null;
    const enrollment =
      flowList.find((f) => asString(f.designation) === "enrollment") ??
      flowList.find((f) => asString(f.slug).includes("enrollment")) ??
      null;
    return { authorization, invalidation, authentication, enrollment };
  }

  private async signingKeyPk(): Promise<string | null> {
    const certs = (await this.request("/api/v3/crypto/certificatekeypairs/?page_size=50")) as Json;
    const certList = (certs.results as Json[] | undefined) ?? [];
    const signingKey = certList.find((c) => asString(c.name).toLowerCase().includes("authentik")) ?? certList[0];
    return signingKey?.pk ? String(signingKey.pk) : null;
  }

  async createOidcApplication(input: CreateOidcAppInput): Promise<OidcApplication> {
    const { authorization, invalidation } = await this.locateFlows();

    const scopes = (await this.request("/api/v3/propertymappings/provider/scope/?page_size=100")) as Json;
    const scopeList = (scopes.results as Json[] | undefined) ?? [];
    const wanted = new Set(input.scopes ?? ["openid", "profile", "email", "offline_access"]);
    const propertyMappings = scopeList
      .filter((s) => wanted.has(asString(s.scope_name)))
      .map((s) => s.pk);

    const signingKey = await this.signingKeyPk();

    const provider = (await this.request("/api/v3/providers/oauth2/", {
      method: "POST",
      body: JSON.stringify({
        name: `${input.name} OIDC`,
        authorization_flow: authorization.pk,
        invalidation_flow: invalidation.pk,
        client_type: "confidential",
        redirect_uris: input.redirectUris.map((url) => ({ matching_mode: "strict", url })),
        include_claims_in_id_token: true,
        issuer_mode: "per_provider",
        sub_mode: "user_email",
        grant_types: ["authorization_code", "refresh_token", "client_credentials"],
        access_code_validity: "minutes=1",
        access_token_validity: "minutes=10",
        refresh_token_validity: "hours=24",
        property_mappings: propertyMappings,
        ...(signingKey ? { signing_key: signingKey } : {}),
      }),
    })) as Json;

    const application = (await this.request("/api/v3/core/applications/", {
      method: "POST",
      body: JSON.stringify({
        name: input.name,
        slug: input.slug,
        provider: provider.pk,
        meta_launch_url: input.redirectUris[0] ?? "",
      }),
    })) as Json;

    return this.composeOidc(input, provider, application);
  }

  async getOidcApplication(id: string): Promise<OidcApplication> {
    const application = (await this.request(`/api/v3/core/applications/${id}/`)) as Json;
    const providerPk = application.provider;
    const provider = (await this.request(`/api/v3/providers/oauth2/${providerPk}/`)) as Json;
    return this.composeOidc(
      {
        name: asString(application.name),
        slug: asString(application.slug),
        redirectUris: this.redirectsFrom(provider),
        logoutUri: asString(application.meta_launch_url) || undefined,
      },
      provider,
      application,
    );
  }

  async listOidcApplications(): Promise<OidcApplication[]> {
    const raw = (await this.request("/api/v3/core/applications/?page_size=200")) as Json;
    const results = (raw.results as Json[] | undefined) ?? [];
    const apps: OidcApplication[] = [];
    for (const application of results) {
      if (!application.provider) continue;
      try {
        apps.push(await this.getOidcApplication(asString(application.pk ?? application.slug)));
      } catch {
        // skip non-oauth providers
      }
    }
    return apps;
  }

  async getOidcDiscovery(slug: string): Promise<OidcDiscovery> {
    const url = `${this.baseUrl.replace(/\/$/, "")}/application/o/${slug}/.well-known/openid-configuration`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new AuthentikApiError(response.status, `OIDC discovery failed for ${slug}`);
    }
    return (await response.json()) as OidcDiscovery;
  }

  async getJwks(slug: string): Promise<{ keys: Record<string, unknown>[] }> {
    const discovery = await this.getOidcDiscovery(slug);
    const response = await fetch(discovery.jwks_uri);
    if (!response.ok) throw new AuthentikApiError(response.status, "JWKS fetch failed");
    return (await response.json()) as { keys: Record<string, unknown>[] };
  }

  async createSamlApplication(input: CreateSamlAppInput): Promise<SamlApplication> {
    const { authorization, invalidation } = await this.locateFlows();
    const signing = await this.signingKeyPk();
    let acsUrl = input.acsUrl;
    if (input.metadataXml) {
      const acs = input.metadataXml.match(/AssertionConsumerService[^>]*Location="([^"]+)"/i);
      if (acs) acsUrl = acs[1];
    }
    const provider = (await this.request("/api/v3/providers/saml/", {
      method: "POST",
      body: JSON.stringify({
        name: `${input.name} SAML`,
        authorization_flow: authorization.pk,
        invalidation_flow: invalidation.pk,
        acs_url: acsUrl,
        issuer: input.entityId ?? input.slug,
        audience: input.audience ?? acsUrl,
        sp_binding: "post",
        sign_assertion: true,
        sign_response: true,
        ...(signing ? { signing_kp: signing } : {}),
      }),
    })) as Json;
    const application = (await this.request("/api/v3/core/applications/", {
      method: "POST",
      body: JSON.stringify({
        name: input.name,
        slug: input.slug,
        provider: provider.pk,
      }),
    })) as Json;
    const app = this.composeSaml(input, provider, application, acsUrl);
    app.metadataXml = await this.fetchSamlMetadata(String(provider.pk), app.slug);
    app.metadataUrl = `${this.baseUrl.replace(/\/$/, "")}/application/saml/${app.slug}/metadata/`;
    return app;
  }

  async getSamlApplication(id: string): Promise<SamlApplication> {
    const application = (await this.request(`/api/v3/core/applications/${id}/`)) as Json;
    const provider = (await this.request(`/api/v3/providers/saml/${application.provider}/`)) as Json;
    const app = this.composeSaml(
      {
        name: asString(application.name),
        slug: asString(application.slug),
        acsUrl: asString(provider.acs_url),
        audience: asString(provider.audience),
        entityId: asString(provider.issuer),
      },
      provider,
      application,
      asString(provider.acs_url),
    );
    app.metadataXml = await this.fetchSamlMetadata(String(provider.pk), app.slug);
    return app;
  }

  async listSamlApplications(): Promise<SamlApplication[]> {
    const raw = (await this.request("/api/v3/core/applications/?page_size=200")) as Json;
    const results = (raw.results as Json[] | undefined) ?? [];
    const apps: SamlApplication[] = [];
    for (const application of results) {
      if (!application.provider) continue;
      try {
        apps.push(await this.getSamlApplication(asString(application.pk ?? application.slug)));
      } catch {
        // skip non-SAML providers
      }
    }
    return apps;
  }

  async createFederationSource(input: CreateFederationSourceInput): Promise<FederationSource> {
    const flows = await this.locateFlows();
    const providerType =
      input.type === "entra" ? "azuread" : input.type === "google" ? "google" : input.type === "oidc" ? "openidconnect" : null;
    if (input.type === "saml") {
      const created = (await this.request("/api/v3/sources/saml/", {
        method: "POST",
        body: JSON.stringify({
          name: input.name,
          slug: input.slug,
          sso_url: input.ssoUrl,
          issuer: input.entityId ?? input.slug,
          pre_authentication_flow: flows.authentication?.pk,
        }),
      })) as Json;
      return this.mapSource(created, "saml");
    }
    const created = (await this.request("/api/v3/sources/oauth/", {
      method: "POST",
      body: JSON.stringify({
        name: input.name,
        slug: input.slug,
        provider_type: providerType,
        consumer_key: input.clientId,
        consumer_secret: input.clientSecret,
        oidc_well_known_url: input.wellKnownUrl,
        authentication_flow: flows.authentication?.pk,
        enrollment_flow: flows.enrollment?.pk,
        user_matching_mode: "email_link",
        enabled: true,
      }),
    })) as Json;
    return this.mapSource(created, input.type);
  }

  async listFederationSources(): Promise<FederationSource[]> {
    const raw = (await this.request("/api/v3/sources/all/?page_size=100").catch(() => ({ results: [] }))) as Json;
    const results = (raw.results as Json[] | undefined) ?? [];
    return results.map((row) => this.mapSource(row, this.guessSourceType(row)));
  }

  async createScimProvider(input: CreateScimProviderInput): Promise<ScimProvider> {
    const created = (await this.request("/api/v3/providers/scim/", {
      method: "POST",
      body: JSON.stringify({
        name: input.name,
        url: input.url,
        token: input.token,
        auth_mode: "token",
      }),
    })) as Json;
    await this.request("/api/v3/core/applications/", {
      method: "POST",
      body: JSON.stringify({
        name: input.name,
        slug: input.slug,
        provider: created.pk,
      }),
    }).catch(() => null);
    return {
      id: String(created.pk ?? input.slug),
      name: input.name,
      slug: input.slug,
      url: input.url,
      direction: "outbound",
    };
  }

  async listScimProviders(): Promise<ScimProvider[]> {
    const raw = (await this.request("/api/v3/providers/scim/?page_size=100").catch(() => ({ results: [] }))) as Json;
    const results = (raw.results as Json[] | undefined) ?? [];
    return results.map((row) => ({
      id: String(row.pk ?? row.name),
      name: asString(row.name),
      slug: asString(row.name).toLowerCase().replace(/\s+/g, "-"),
      url: asString(row.url),
      direction: "outbound" as const,
    }));
  }

  async listUserAuthenticators(userId: string): Promise<UserAuthenticators> {
    const count = async (path: string) => {
      const raw = (await this.request(`${path}?user=${encodeURIComponent(userId)}&page_size=100`).catch(() => ({
        results: [],
      }))) as Json;
      return ((raw.results as Json[] | undefined) ?? []).length;
    };
    const webauthn =
      (await count("/api/v3/authenticators/admin/webauthn/")) || (await count("/api/v3/authenticators/webauthn/"));
    const totp = (await count("/api/v3/authenticators/admin/totp/")) || (await count("/api/v3/authenticators/totp/"));
    return { userId, webauthn, totp };
  }

  private async fetchSamlMetadata(providerPk: string, slug: string): Promise<string> {
    const origin = this.baseUrl.replace(/\/$/, "");
    const urls = [
      `${origin}/api/v3/providers/saml/${providerPk}/metadata/`,
      `${origin}/application/saml/${slug}/metadata/`,
    ];
    for (const url of urls) {
      const response = await fetch(url, { headers: { Authorization: `Bearer ${this.token}` } });
      if (response.ok) return await response.text();
    }
    return "";
  }

  private composeSaml(input: CreateSamlAppInput, provider: Json, application: Json, acsUrl: string): SamlApplication {
    const slug = asString(application.slug, input.slug);
    const origin = this.baseUrl.replace(/\/$/, "");
    const entityId = asString(provider.issuer, input.entityId ?? `${origin}/application/saml/${slug}/`);
    return {
      id: String(application.pk ?? slug),
      name: asString(application.name, input.name),
      slug,
      protocol: "saml",
      acsUrl,
      audience: asString(provider.audience, input.audience ?? acsUrl),
      entityId,
      metadataUrl: `${origin}/api/v3/providers/saml/${provider.pk}/metadata/`,
      metadataXml: "",
      nameId: input.nameId ?? "email",
    };
  }

  private mapSource(raw: Json, type: FederationSourceType): FederationSource {
    return {
      id: String(raw.pk ?? raw.slug),
      name: asString(raw.name),
      slug: asString(raw.slug),
      type,
      clientId: asString(raw.consumer_key) || null,
      wellKnownUrl: asString(raw.oidc_well_known_url) || null,
      ssoUrl: asString(raw.sso_url) || null,
      entityId: asString(raw.issuer) || null,
    };
  }

  private guessSourceType(raw: Json): FederationSourceType {
    const provider = asString(raw.provider_type).toLowerCase();
    if (provider.includes("azure") || provider.includes("entra")) return "entra";
    if (provider.includes("google")) return "google";
    if (asString(raw.sso_url) || asString(raw.component).includes("saml")) return "saml";
    return "oidc";
  }

  private redirectsFrom(provider: Json): string[] {
    const uris = provider.redirect_uris;
    if (Array.isArray(uris)) {
      return uris.map((u) => (typeof u === "string" ? u : asString((u as Json).url))).filter(Boolean);
    }
    if (typeof uris === "string") return uris.split("\n").map((s) => s.trim()).filter(Boolean);
    return [];
  }

  private composeOidc(input: CreateOidcAppInput, provider: Json, application: Json): OidcApplication {
    const slug = asString(application.slug, input.slug);
    const origin = this.baseUrl.replace(/\/$/, "");
    const issuerUrl = `${origin}/application/o/${slug}/`;
    return {
      id: String(application.pk ?? slug),
      name: asString(application.name, input.name),
      slug,
      protocol: "oidc",
      clientId: asString(provider.client_id),
      clientSecret: asString(provider.client_secret),
      issuerUrl,
      discoveryUrl: `${origin}/application/o/${slug}/.well-known/openid-configuration`,
      jwksUrl: `${origin}/application/o/${slug}/jwks/`,
      authorizationUrl: `${origin}/application/o/authorize/`,
      tokenUrl: `${origin}/application/o/token/`,
      userinfoUrl: `${origin}/application/o/userinfo/`,
      redirectUris: input.redirectUris.length ? input.redirectUris : this.redirectsFrom(provider),
      logoutUri: input.logoutUri ?? `${origin}/application/o/${slug}/end-session/`,
      scopes: input.scopes ?? ["openid", "profile", "email", "offline_access"],
    };
  }

  private mapUser(raw: Json): AuthentikUser {
    const attributes = (raw.attributes as Json | undefined) ?? {};
    const state = (asString(attributes.blakid_state, raw.is_active ? "ACTIVE" : "SUSPENDED") as UserState) || "ACTIVE";
    return {
      id: String(raw.pk ?? raw.uuid),
      username: asString(raw.username),
      email: asString(raw.email),
      name: asString(raw.name),
      isActive: Boolean(raw.is_active),
      state,
      kind: (asString(attributes.blakid_kind, "person") as AuthentikUser["kind"]) || "person",
      groups: Array.isArray(raw.groups) ? raw.groups.map(String) : [],
      assertions: Array.isArray(attributes.blakid_assertions)
        ? (attributes.blakid_assertions as AuthentikUser["assertions"])
        : [],
      attributes,
      createdAt: asString(raw.date_joined, new Date().toISOString()),
      lastLoginAt: asString(raw.last_login) || null,
    };
  }
}
