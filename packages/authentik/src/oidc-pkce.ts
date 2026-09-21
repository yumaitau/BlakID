import { createHash, randomBytes } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, decodeJwt, type JWTPayload } from "jose";
import type { OidcDiscovery } from "./types.ts";

export type PkcePair = { verifier: string; challenge: string };

export function createPkcePair(): PkcePair {
  const verifier = randomBytes(32).toString("base64url");
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function verifyPkceChallenge(pair: PkcePair): boolean {
  return createHash("sha256").update(pair.verifier).digest("base64url") === pair.challenge;
}

type CookieJar = Map<string, string>;

function cookieHeader(jar: CookieJar): string {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

function storeCookies(jar: CookieJar, response: Response) {
  const headers = "getSetCookie" in response.headers ? response.headers.getSetCookie() : [];
  const fallback = response.headers.get("set-cookie");
  const lines = headers.length ? headers : fallback ? [fallback] : [];
  for (const line of lines) {
    const pair = line.split(";")[0];
    if (!pair) continue;
    const eq = pair.indexOf("=");
    if (eq <= 0) continue;
    jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
}

async function request(
  url: string,
  jar: CookieJar,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  const cookie = cookieHeader(jar);
  if (cookie) headers.set("Cookie", cookie);
  const csrf = jar.get("authentik_csrf");
  if (csrf && !headers.has("X-authentik-CSRF")) headers.set("X-authentik-CSRF", csrf);
  const response = await fetch(url, { ...init, headers, redirect: "manual" });
  storeCookies(jar, response);
  return response;
}

function locationOf(response: Response): string | null {
  return response.headers.get("location");
}

function resolveUrl(base: string, location: string): string {
  return new URL(location, base).toString();
}

async function completeFlow(
  origin: string,
  jar: CookieJar,
  flowSlug: string,
  query: string,
  username: string,
  password: string,
): Promise<string | null> {
  let executor = `${origin}/api/v3/flows/executor/${flowSlug}/?query=${encodeURIComponent(query)}`;
  for (let i = 0; i < 12; i += 1) {
    const getRes = await request(executor, jar);
    if (getRes.status >= 300 && getRes.status < 400) {
      const loc = locationOf(getRes);
      if (loc) return resolveUrl(executor, loc);
    }
    const body = (await getRes.json().catch(() => ({}))) as Record<string, unknown>;
    if (process.env.BLAKID_PKCE_DEBUG) {
      console.error(
        "flow GET result",
        JSON.stringify({
          status: getRes.status,
          location: getRes.headers.get("location"),
          component: body.component,
          type: body.type,
          to: body.to,
          password_fields: body.password_fields,
          response_errors: body.response_errors,
        }),
      );
    }
    if (typeof body.to === "string") return resolveUrl(origin, body.to);
    const component = String(body.component ?? "");
    let payload: Record<string, unknown> | null = null;
    if (component.includes("identification")) {
      payload = body.password_fields
        ? { component, uid_field: username, password }
        : { component, uid_field: username };
    } else if (component.includes("password")) {
      payload = { component, password };
    } else if (component.includes("consent") || component.includes("ak-stage-consent")) {
      payload = { component, redirect_uri: body.redirect_uri };
    } else if (body.flow_info && body.type === "redirect") {
      return String(body.to ?? "");
    } else if (component.includes("ak-stage-empty") || body.type === "empty") {
      payload = { component };
    }
    if (!payload) {
      throw new Error(`Unhandled authentik stage ${component}: ${JSON.stringify(body).slice(0, 400)}`);
    }
    if (process.env.BLAKID_PKCE_DEBUG) {
      console.error("flow POST payload", payload, "cookies", [...jar.keys()]);
    }
    let postRes: Response;
    try {
      postRes = await request(executor, jar, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (error) {
      if (process.env.BLAKID_PKCE_DEBUG) {
        console.error("flow POST throw", error);
      }
      throw error;
    }
    if (process.env.BLAKID_PKCE_DEBUG) {
      console.error("flow POST status", postRes.status, "location", postRes.headers.get("location"));
    }
    if (postRes.status >= 300 && postRes.status < 400) {
      const loc = locationOf(postRes);
      if (loc) {
        const abs = resolveUrl(executor, loc);
        if (abs.includes("error=")) throw new Error(`Authorization error: ${abs}`);
        if (abs.includes("code=") && !abs.includes("executor")) return abs;
        if (abs.includes("/application/o/authorize")) return abs;
        const follow = await request(abs, jar);
        if (process.env.BLAKID_PKCE_DEBUG) {
          console.error("flow FOLLOW", follow.status, follow.headers.get("location"));
        }
        if (follow.status >= 300 && follow.status < 400) {
          const loc2 = locationOf(follow);
          if (loc2) {
            const abs2 = resolveUrl(abs, loc2);
            if (abs2.includes("error=")) throw new Error(`Authorization error: ${abs2}`);
            if (abs2.includes("code=") || abs2.includes("/application/o/authorize")) return abs2;
          }
        }
        const followed = (await follow.json().catch(() => ({}))) as Record<string, unknown>;
        if (process.env.BLAKID_PKCE_DEBUG) {
          console.error("flow FOLLOW body", followed.component, followed.to, followed.type);
        }
        if (typeof followed.to === "string" && String(followed.component ?? "").includes("redirect")) {
          return resolveUrl(origin, followed.to);
        }
        continue;
      }
    }
    const posted = (await postRes.json().catch(() => ({}))) as Record<string, unknown>;
    if (process.env.BLAKID_PKCE_DEBUG) {
      const slim = JSON.stringify({
        status: postRes.status,
        location: postRes.headers.get("location"),
        type: posted.type,
        component: posted.component,
        to: posted.to,
        response_errors: posted.response_errors,
        keys: Object.keys(posted),
      });
      console.error("flow POST result", slim);
    }
    if (typeof posted.to === "string") return resolveUrl(origin, posted.to);
    if (String(posted.component ?? "").includes("redirect") && typeof posted.to === "string") {
      return resolveUrl(origin, posted.to);
    }
    if (posted.component && posted.component !== component) {
      continue;
    }
  }
  throw new Error("authentik authorization flow did not return an authorization code");
}

export type AuthorizationCodeResult = {
  access_token: string;
  id_token: string;
  token_type: string;
  claims: JWTPayload;
};

export async function authorizationCodePkceLogin(input: {
  origin: string;
  discovery: OidcDiscovery;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  username: string;
  password: string;
  scopes?: string;
}): Promise<AuthorizationCodeResult> {
  const pkce = createPkcePair();
  const state = randomBytes(12).toString("hex");
  const authorize = new URL(input.discovery.authorization_endpoint);
  authorize.searchParams.set("client_id", input.clientId);
  authorize.searchParams.set("redirect_uri", input.redirectUri);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("scope", input.scopes ?? "openid profile email offline_access");
  authorize.searchParams.set("state", state);
  authorize.searchParams.set("code_challenge", pkce.challenge);
  authorize.searchParams.set("code_challenge_method", "S256");

  const jar: CookieJar = new Map();
  let current = authorize.toString();
  let code: string | null = null;
  for (let hop = 0; hop < 8 && !code; hop += 1) {
    const response = await request(current, jar);
    const loc = locationOf(response);
    if (response.url && (response.url.includes("code=") || response.url.includes("error="))) {
      if (response.url.includes("error=")) throw new Error(`Authorization error: ${response.url}`);
      code = new URL(response.url).searchParams.get("code");
      break;
    }
    if (!loc) {
      if (current.includes("/if/flow/") || current.includes("/flows/executor/")) {
        const flowUrl = new URL(current);
        const slug =
          flowUrl.pathname.split("/").filter(Boolean).at(-1) ?? "default-authentication-flow";
        const finished = await completeFlow(
          input.origin.replace(/\/$/, ""),
          jar,
          slug,
          flowUrl.searchParams.toString() || flowUrl.search.slice(1),
          input.username,
          input.password,
        );
        if (finished?.includes("error=")) throw new Error(`Authorization error: ${finished}`);
        if (finished?.includes("code=")) {
          code = new URL(finished).searchParams.get("code");
          break;
        }
        current = finished ?? current;
        continue;
      }
      const text = await response.text();
      throw new Error(`Authorization stopped at ${current} status ${response.status}: ${text.slice(0, 200)}`);
    }
    const abs = resolveUrl(current, loc);
    if (abs.includes("error=")) throw new Error(`Authorization error: ${abs}`);
    if (abs.includes("code=") && !abs.includes("/if/flow/")) {
      code = new URL(abs).searchParams.get("code");
      break;
    }
    if (abs.includes("/if/flow/") || abs.includes("/flows/executor/")) {
      const flowUrl = new URL(abs);
      const slug = flowUrl.pathname.split("/").filter(Boolean).at(-1) ?? "default-authentication-flow";
      const finished = await completeFlow(input.origin.replace(/\/$/, ""), jar, slug, flowUrl.searchParams.toString() || flowUrl.search.slice(1), input.username, input.password);
      if (finished?.includes("error=")) throw new Error(`Authorization error: ${finished}`);
      if (finished?.includes("code=")) {
        code = new URL(finished).searchParams.get("code");
        break;
      }
      current = finished ?? abs;
      continue;
    }
    current = abs;
  }
  if (!code) throw new Error("No authorization code returned from authentik");

  const tokenRes = await fetch(input.discovery.token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: input.redirectUri,
      client_id: input.clientId,
      client_secret: input.clientSecret,
      code_verifier: pkce.verifier,
    }),
  });
  if (!tokenRes.ok) {
    throw new Error(`Token exchange failed ${tokenRes.status}: ${(await tokenRes.text()).slice(0, 400)}`);
  }
  const tokens = (await tokenRes.json()) as { access_token?: string; id_token?: string; token_type?: string };
  if (!tokens.access_token || !tokens.id_token) {
    throw new Error("Token response missing access_token or id_token");
  }
  const jwks = createRemoteJWKSet(new URL(input.discovery.jwks_uri));
  const { payload } = await jwtVerify(tokens.id_token, jwks, {
    issuer: input.discovery.issuer,
    audience: input.clientId,
  });
  return {
    access_token: tokens.access_token,
    id_token: tokens.id_token,
    token_type: tokens.token_type ?? "Bearer",
    claims: payload,
  };
}

export function peekJwt(token: string): JWTPayload {
  return decodeJwt(token);
}
