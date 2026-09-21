import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { authorizationCodePkceLogin, HttpAuthentikClient, requireEnrolmentFlow } from "../../packages/authentik/src/index.ts";
import { PASSKEY_ENROL_SLUG } from "../../packages/config/src/index.ts";
import { AUTHENTIK_VERSION } from "../../packages/config/src/index.ts";
import { BlakID, createTestPrincipal, MemoryStore } from "../../packages/control-plane/src/index.ts";
import { ComposeTenantRuntime, defaultComposeFile } from "../../packages/provisioning/src/compose-runtime.ts";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

async function probeDocker(): Promise<{ host?: string; ok: boolean; detail: string }> {
  const candidates = [
    process.env.BLAKID_DOCKER_HOST,
    process.env.DOCKER_HOST,
    "ssh://justinmiddler@homelab",
    "ssh://justinmiddler@100.89.92.86",
    undefined,
  ].filter((v, i, a) => a.indexOf(v) === i);
  const { spawn } = await import("node:child_process");
  for (const host of candidates) {
    const args = host ? ["-H", host, "info", "--format", "{{.ServerVersion}}"] : ["info", "--format", "{{.ServerVersion}}"];
    const version = await new Promise<string | null>((resolve) => {
      const child = spawn("docker", args, { env: process.env });
      let out = "";
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        resolve(null);
      }, 20_000);
      child.stdout.on("data", (c) => {
        out += c.toString();
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        resolve(code === 0 ? out.trim() : null);
      });
      child.on("error", () => {
        clearTimeout(timer);
        resolve(null);
      });
    });
    if (version) return { host, ok: true, detail: version };
  }
  return { ok: false, detail: "no docker engine answered" };
}

const docker = await probeDocker();

describe.skipIf(!docker.ok)("authentik dedicated stacks", () => {
  it("provisions two organisations, completes authorization-code+PKCE, and isolates tenants", async () => {
    const ids = () => randomBytes(8).toString("hex");
    const now = () => new Date();
    const root = join(repoRoot, "infrastructure/docker/tenants", `it-${ids()}`);
    mkdirSync(root, { recursive: true });
    const runtime = new ComposeTenantRuntime({
      tenantsRoot: root,
      composeFile: defaultComposeFile,
      dockerHost: docker.host,
      ids,
      now,
    });
    const app = new BlakID({ store: new MemoryStore(), runtime, ids, now });
    const operator = createTestPrincipal({ role: "YUMA_PLATFORM_OPERATOR", organisationId: null });

    let a: Awaited<ReturnType<typeof app.provisionOrganisation>> | undefined;
    let b: Awaited<ReturnType<typeof app.provisionOrganisation>> | undefined;
    try {
    a = await app.provisionOrganisation(operator, {
      name: "Community A",
      slug: `ca${ids().slice(0, 6)}`.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 10),
      adminEmail: "owner-a@a.test",
      adminName: "Owner A",
    });
    b = await app.provisionOrganisation(operator, {
      name: "Community B",
      slug: `cb${ids().slice(0, 6)}`.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 10),
      adminEmail: "owner-b@b.test",
      adminName: "Owner B",
    });

    const ownerA = createTestPrincipal({
      role: "ORGANISATION_OWNER",
      organisationId: a.organisation.id,
      actorId: a.invitation.userId,
    });
    const ownerB = createTestPrincipal({
      role: "ORGANISATION_OWNER",
      organisationId: b.organisation.id,
      actorId: b.invitation.userId,
    });

    const enrol = await app.passkeyEnrolment(ownerA, a.organisation.id);
    expect(enrol.url).toContain(`/if/flow/${PASSKEY_ENROL_SLUG}/`);
    const recA = runtime.tenant(a.organisation.id);
    const liveFlow = await requireEnrolmentFlow(recA.url, recA.token);
    expect(liveFlow.slug).toBe(PASSKEY_ENROL_SLUG);

    const oidc = await app.createOidcApplication(ownerA, a.organisation.id, {
      name: "RangerOS",
      slug: "rangeros",
      redirectUris: ["http://127.0.0.1/callback"],
      logoutUri: "http://127.0.0.1/logout",
    });
    expect(oidc.clientId).toBeTruthy();
    expect(oidc.clientSecret).toBeTruthy();

    const clientA = runtime.clientFor(a.organisation.id) as HttpAuthentikClient;
    const discovery = await clientA.getOidcDiscovery("rangeros");
    expect(discovery.issuer).toContain("/application/o/rangeros/");
    expect(discovery.code_challenge_methods_supported).toContain("S256");
    expect(discovery.grant_types_supported).toEqual(expect.arrayContaining(["authorization_code", "refresh_token"]));
    const jwks = await clientA.getJwks("rangeros");
    expect(jwks.keys.length).toBeGreaterThan(0);

    const user = await app.inviteUser(ownerA, a.organisation.id, {
      email: "josh@a.test",
      name: "Josh",
      password: "a-very-long-passphrase",
    });
    await app.activateUser(ownerA, a.organisation.id, user.id);

    const login = await authorizationCodePkceLogin({
      origin: runtime.tenant(a.organisation.id).url,
      discovery,
      clientId: oidc.clientId,
      clientSecret: oidc.clientSecret,
      redirectUri: "http://127.0.0.1/callback",
      username: "josh@a.test",
      password: "a-very-long-passphrase",
    });
    expect(login.access_token).toBeTruthy();
    expect(login.claims.email ?? login.claims.sub).toBeTruthy();
    expect(String(login.claims.email ?? login.claims.preferred_username ?? login.claims.sub).toLowerCase()).toContain("josh");

    const evidence = {
      discovery,
      claims: login.claims,
      authentik: AUTHENTIK_VERSION,
      docker: docker.detail,
    };
    writeFileSync(join(root, "oidc-evidence.json"), JSON.stringify(evidence, null, 2));
    const evidenceDir = process.env.BLAKID_EVIDENCE_DIR;
    if (evidenceDir) {
      mkdirSync(evidenceDir, { recursive: true });
      writeFileSync(join(evidenceDir, "oidc-discovery.json"), JSON.stringify(discovery, null, 2));
      writeFileSync(join(evidenceDir, "oidc-claims.json"), JSON.stringify(login.claims, null, 2));
    }

    await app.suspendUser(ownerA, a.organisation.id, user.id);
    await expect(
      authorizationCodePkceLogin({
        origin: runtime.tenant(a.organisation.id).url,
        discovery,
        clientId: oidc.clientId,
        clientSecret: oidc.clientSecret,
        redirectUri: "http://127.0.0.1/callback",
        username: "josh@a.test",
        password: "a-very-long-passphrase",
      }),
    ).rejects.toThrow();

    await expect(app.listUsers(ownerA, b.organisation.id)).rejects.toThrow();
    await expect(app.listUsers(ownerB, a.organisation.id)).rejects.toThrow();

    const backup = await app.backup(operator, a.organisation.id);
    expect(backup.engine).toBe("pg_dump");
    expect(backup.bytes).toBeGreaterThan(64);
    const restore = await app.restoreTest(operator, a.organisation.id);
    expect(restore.status).toBe("PASS");
    } finally {
      for (const org of [a, b]) {
        if (!org) continue;
        await runtime.teardown(org.organisation.id).catch(() => undefined);
      }
    }
  }, 300_000);
});
