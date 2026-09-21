import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ComposeTenantRuntime } from "./compose-runtime.ts";
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
});
