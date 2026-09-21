import { describe, expect, it } from "vitest";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ComposeTenantRuntime, isUsablePgDump } from "./compose-runtime.ts";
import { writeTenantEnv } from "./tenant-files.ts";

describe("ComposeTenantRuntime backups", () => {
  it("runs pg_dump via docker compose exec and restore-tests the SQL dump", async () => {
    const root = mkdtempSync(join(tmpdir(), "blakid-backup-"));
    writeTenantEnv({
      root,
      slug: "community-a",
      httpPort: 9100,
      pgPass: "pg",
      secretKey: "secret",
      bootstrapEmail: "a@internal",
      bootstrapPassword: "pw",
      bootstrapToken: "token",
    });
    const calls: string[][] = [];
    const dump = `--\n-- PostgreSQL database dump\n--\nCREATE TABLE core_user (id integer);\n`;
    const runtime = new ComposeTenantRuntime({
      tenantsRoot: root,
      composeFile: join(root, "compose.yaml"),
      ids: () => "id",
      now: () => new Date("2026-09-22T01:00:00Z"),
      exec: async (_file, args, opts) => {
        calls.push(args);
        if (args.includes("pg_dump")) return { stdout: dump, stderr: "" };
        if (args.includes("psql") && opts?.input) {
          expect(opts.input).toContain("PostgreSQL database dump");
          return { stdout: "RESTORE_OK", stderr: "" };
        }
        return { stdout: "", stderr: "" };
      },
    });
    runtime.registerTenant({
      organisationId: "org-a",
      slug: "community-a",
      project: "blakid-community-a",
      envFile: join(root, "community-a", ".env"),
      httpPort: 9100,
      url: "http://127.0.0.1:9100",
      token: "token",
    });
    const backup = await runtime.backup("org-a");
    expect(backup.engine).toBe("pg_dump");
    expect(backup.status).toBe("healthy");
    expect(backup.bytes).toBe(dump.length);
    expect(backup.region).toBe("ap-southeast-2");
    expect(calls.some((a) => a.includes("pg_dump") && a.includes("exec"))).toBe(true);
    expect(readFileSync(backup.path!, "utf8")).toContain("PostgreSQL database dump");

    const restore = await runtime.restoreTest("org-a");
    expect(restore.status).toBe("PASS");
    expect(restore.engine).toBe("pg_dump");
    expect(calls.some((a) => a.includes("CREATE DATABASE authentik_restore_test;"))).toBe(true);
    expect(calls.some((a) => a.includes("DROP DATABASE authentik_restore_test;"))).toBe(true);
  });

  it("rejects dumps that lack a PostgreSQL header even when the payload is long", async () => {
    expect(isUsablePgDump("x".repeat(200))).toBe(false);
    expect(isUsablePgDump("--\n-- PostgreSQL database dump\n--\n")).toBe(true);
    const root = mkdtempSync(join(tmpdir(), "blakid-bad-dump-"));
    writeTenantEnv({
      root,
      slug: "community-a",
      httpPort: 9100,
      pgPass: "pg",
      secretKey: "secret",
      bootstrapEmail: "a@internal",
      bootstrapPassword: "pw",
      bootstrapToken: "token",
    });
    const runtime = new ComposeTenantRuntime({
      tenantsRoot: root,
      composeFile: join(root, "compose.yaml"),
      ids: () => "id",
      now: () => new Date("2026-09-22T01:00:00Z"),
      exec: async () => ({ stdout: "garbage ".repeat(40), stderr: "" }),
    });
    runtime.registerTenant({
      organisationId: "org-a",
      slug: "community-a",
      project: "blakid-community-a",
      envFile: join(root, "community-a", ".env"),
      httpPort: 9100,
      url: "http://127.0.0.1:9100",
      token: "token",
    });
    await expect(runtime.backup("org-a")).rejects.toThrow(/unusable output/);
  });

  it("copies blueprints to a user-writable path on ssh docker hosts", async () => {
    const root = mkdtempSync(join(tmpdir(), "blakid-bp-"));
    const composeFile = join(root, "authentik-tenant.yaml");
    const bp = join(root, "blueprints");
    mkdirSync(bp, { recursive: true });
    writeFileSync(join(bp, "blakid-baseline.yaml"), "version: 1\n");
    writeFileSync(composeFile, "name: t\n");
    const calls: string[][] = [];
    const runtime = new ComposeTenantRuntime({
      tenantsRoot: root,
      composeFile,
      dockerHost: "ssh://justinmiddler@homelab",
      ids: () => "id",
      now: () => new Date("2026-09-22T01:00:00Z"),
      exec: async (file, args) => {
        calls.push([file, ...args]);
        if (file === "ssh" && args.includes("HOME")) return { stdout: "/home/justinmiddler\n", stderr: "" };
        return { stdout: "", stderr: "" };
      },
    });
    const dir = await runtime.resolveBlueprintsDir();
    expect(dir).toBe("/home/justinmiddler/blakid/blueprints");
    expect(dir.startsWith("/var/lib/")).toBe(false);
    expect(calls.some((c) => c[0] === "ssh" && c.includes("mkdir") && c.includes("/home/justinmiddler/blakid/blueprints"))).toBe(true);
    expect(calls.some((c) => c[0] === "scp" && c.at(-1) === "justinmiddler@homelab:/home/justinmiddler/blakid/blueprints/")).toBe(true);
  });

  it("tears down the dedicated compose project", async () => {
    const root = mkdtempSync(join(tmpdir(), "blakid-down-"));
    writeTenantEnv({
      root,
      slug: "community-a",
      httpPort: 9100,
      pgPass: "pg",
      secretKey: "secret",
      bootstrapEmail: "a@internal",
      bootstrapPassword: "pw",
      bootstrapToken: "token",
    });
    const calls: string[][] = [];
    const runtime = new ComposeTenantRuntime({
      tenantsRoot: root,
      composeFile: join(root, "compose.yaml"),
      ids: () => "id",
      now: () => new Date("2026-09-22T01:00:00Z"),
      exec: async (_file, args) => {
        calls.push(args);
        return { stdout: "", stderr: "" };
      },
    });
    runtime.registerTenant({
      organisationId: "org-a",
      slug: "community-a",
      project: "blakid-community-a",
      envFile: join(root, "community-a", ".env"),
      httpPort: 9100,
      url: "http://127.0.0.1:9100",
      token: "token",
    });
    await runtime.teardown("org-a");
    expect(calls.some((a) => a.includes("down") && a.includes("-v") && a.includes("blakid-community-a"))).toBe(true);
  });

  it("fails provision when authentik reports no passkey enrolment flow", async () => {
    const { createServer } = await import("node:http");
    const requested: string[] = [];
    const server = createServer((req, res) => {
      requested.push(req.url ?? "");
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ results: [{ pk: "other", slug: "default-authentication-flow" }] }));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("no listen port");
    const port = address.port;
    const root = mkdtempSync(join(tmpdir(), "blakid-flow-missing-"));
    const runtime = new ComposeTenantRuntime({
      tenantsRoot: root,
      composeFile: join(root, "compose.yaml"),
      tenantHost: "127.0.0.1",
      startingHttpPort: port,
      ids: () => "id",
      now: () => new Date("2026-09-22T01:00:00Z"),
      exec: async () => ({ stdout: "", stderr: "" }),
      waitReady: async () => {},
      enrol: async () => ({ passkeyUrl: `http://127.0.0.1:${port}/if/flow/blakid-passkey-enrol/` }),
    });
    try {
      await expect(
        runtime.provision({
          id: "org-a",
          name: "Community A",
          slug: "community-a",
          hostname: "community-a.id.blakid.au",
          customDomain: null,
          hostingModel: "blakid_australian_cloud",
          region: "ap-southeast-2",
          regionLabel: "Australia — Sydney",
          status: "provisioning",
          existingIdp: null,
          createdAt: "2026-09-22T01:00:00Z",
        }),
      ).rejects.toThrow(/blakid-passkey-enrol is not present/);
      expect(requested.some((url) => url.includes("slug=blakid-passkey-enrol"))).toBe(true);
    } finally {
      server.close();
    }
  });

  it("fails provision when authentik enrolment cannot be applied", async () => {
    const root = mkdtempSync(join(tmpdir(), "blakid-enrol-"));
    const runtime = new ComposeTenantRuntime({
      tenantsRoot: root,
      composeFile: join(root, "compose.yaml"),
      ids: () => "id",
      now: () => new Date("2026-09-22T01:00:00Z"),
      exec: async () => ({ stdout: "", stderr: "" }),
      waitReady: async () => {},
      enrol: async () => {
        throw new Error("enrolment failed");
      },
    });
    await expect(
      runtime.provision({
        id: "org-a",
        name: "Community A",
        slug: "community-a",
        hostname: "community-a.id.blakid.au",
        customDomain: null,
        hostingModel: "blakid_australian_cloud",
        region: "ap-southeast-2",
        regionLabel: "Australia — Sydney",
        status: "provisioning",
        existingIdp: null,
        createdAt: "2026-09-22T01:00:00Z",
      }),
    ).rejects.toThrow(/enrolment failed/);
  });
});
