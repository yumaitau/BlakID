import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { allocateHttpPort, writeTenantEnv } from "./tenant-files.ts";

describe("tenant files", () => {
  it("allocates unique HTTP ports and writes gitignored env without sharing secrets across tenants", () => {
    const used = new Set<number>();
    const a = allocateHttpPort(used, 9100);
    const b = allocateHttpPort(used, 9100);
    expect(a).toBe(9100);
    expect(b).toBe(9101);
    const root = mkdtempSync(join(tmpdir(), "blakid-"));
    writeTenantEnv({
      root,
      slug: "community-a",
      httpPort: a,
      pgPass: "pg-a",
      secretKey: "secret-a",
      bootstrapEmail: "a@internal",
      bootstrapPassword: "pw-a",
      bootstrapToken: "token-a",
    });
    const env = readFileSync(join(root, "community-a", ".env"), "utf8");
    expect(env).toContain("COMPOSE_PORT_HTTP=9100");
    expect(env).toContain("ghcr.io/goauthentik/server:2026.8.3");
    expect(env).toContain("BACKUP_REGION=ap-southeast-2");
    expect(env).toContain("BLAKID_SUBNET=10.201.");
    expect(env).toContain("BLAKID_BLUEPRINTS_DIR=./blueprints");
  });
});
