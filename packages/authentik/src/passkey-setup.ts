import { PASSKEY_ENROL_SLUG, TOTP_ENROL_SLUG, authentikFlowUrl } from "@blakid/config";
import { AuthentikApiError } from "./types.ts";

type Json = Record<string, unknown>;

export { PASSKEY_ENROL_SLUG, TOTP_ENROL_SLUG, authentikFlowUrl };

async function request(
  baseUrl: string,
  token: string,
  path: string,
  init: RequestInit = {},
): Promise<unknown> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Accept", "application/json");
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}${path}`, { ...init, headers });
  if (!response.ok) {
    const text = await response.text();
    throw new AuthentikApiError(response.status, `authentik ${path} ${response.status}: ${text.slice(0, 400)}`);
  }
  if (response.status === 204) return null;
  return response.json();
}

async function findByName(baseUrl: string, token: string, path: string, name: string): Promise<Json | null> {
  const raw = (await request(baseUrl, token, path)) as Json;
  const results = (raw.results as Json[] | undefined) ?? [];
  return results.find((row) => row.name === name || row.slug === name) ?? null;
}

/** Create authentik WebAuthn + TOTP enrolment flows via API (no fork, no bind-mount required). */
export async function ensureAuthenticatorEnrolment(baseUrl: string, token: string): Promise<{
  passkeyUrl: string;
  totpUrl: string;
}> {
  let webauthn = await findByName(baseUrl, token, "/api/v3/stages/authenticator/webauthn/?page_size=100", "blakid-webauthn-setup");
  if (!webauthn) {
    webauthn = (await request(baseUrl, token, "/api/v3/stages/authenticator/webauthn/", {
      method: "POST",
      body: JSON.stringify({
        name: "blakid-webauthn-setup",
        friendly_name: "Passkey",
        user_verification: "required",
        resident_key_requirement: "required",
      }),
    })) as Json;
  }

  let totp = await findByName(baseUrl, token, "/api/v3/stages/authenticator/totp/?page_size=100", "blakid-totp-setup");
  if (!totp) {
    totp = (await request(baseUrl, token, "/api/v3/stages/authenticator/totp/", {
      method: "POST",
      body: JSON.stringify({
        name: "blakid-totp-setup",
        friendly_name: "Authenticator app",
        digits: 6,
      }),
    })) as Json;
  }

  const passkeyFlow = await ensureFlow(baseUrl, token, PASSKEY_ENROL_SLUG, "BlakID passkey enrolment", "Register a passkey");
  const totpFlow = await ensureFlow(baseUrl, token, TOTP_ENROL_SLUG, "BlakID TOTP enrolment", "Register an authenticator app");
  await ensureBinding(baseUrl, token, String(passkeyFlow.pk), String(webauthn.pk));
  await ensureBinding(baseUrl, token, String(totpFlow.pk), String(totp.pk));
  return {
    passkeyUrl: authentikFlowUrl(baseUrl, PASSKEY_ENROL_SLUG),
    totpUrl: authentikFlowUrl(baseUrl, TOTP_ENROL_SLUG),
  };
}

async function ensureFlow(baseUrl: string, token: string, slug: string, name: string, title: string): Promise<Json> {
  const existing = await findByName(baseUrl, token, "/api/v3/flows/instances/?page_size=100", slug);
  if (existing) return existing;
  return (await request(baseUrl, token, "/api/v3/flows/instances/", {
    method: "POST",
    body: JSON.stringify({
      name,
      slug,
      title,
      designation: "stage_configuration",
      authentication: "require_authenticated",
    }),
  })) as Json;
}

async function ensureBinding(baseUrl: string, token: string, flowPk: string, stagePk: string): Promise<void> {
  const raw = (await request(baseUrl, token, `/api/v3/flows/bindings/?target=${encodeURIComponent(flowPk)}`)) as Json;
  const results = (raw.results as Json[] | undefined) ?? [];
  if (results.some((row) => String(row.stage) === stagePk)) return;
  await request(baseUrl, token, "/api/v3/flows/bindings/", {
    method: "POST",
    body: JSON.stringify({ target: flowPk, stage: stagePk, order: 0 }),
  });
}
