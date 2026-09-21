import { describe, expect, it } from "vitest";
import { MemoryTenantRuntime } from "@blakid/control-plane";
import { ComposeTenantRuntime } from "./compose-runtime.ts";
import { assertProductionRuntime, createTenantRuntime, runtimeKindFromEnv } from "./create-runtime.ts";

describe("createTenantRuntime", () => {
  const ids = () => "id";
  const now = () => new Date("2026-09-22T00:00:00Z");

  it("defaults to memory and uses compose when BLAKID_RUNTIME=compose", () => {
    expect(runtimeKindFromEnv({})).toBe("memory");
    expect(runtimeKindFromEnv({ BLAKID_RUNTIME: "memory" })).toBe("memory");
    expect(runtimeKindFromEnv({ BLAKID_RUNTIME: "compose" })).toBe("compose");
    const memory = createTenantRuntime({ env: {}, ids, now });
    expect(memory.kind).toBe("memory");
    expect(memory.runtime).toBeInstanceOf(MemoryTenantRuntime);
    const compose = createTenantRuntime({
      env: { BLAKID_RUNTIME: "compose", BLAKID_TENANTS_ROOT: "/tmp/blakid-tenants-test" },
      ids,
      now,
    });
    expect(compose.kind).toBe("compose");
    expect(compose.runtime).toBeInstanceOf(ComposeTenantRuntime);
  });

  it("refuses the memory engine in production", () => {
    expect(() => assertProductionRuntime({ BLAKID_ENV: "production", BLAKID_RUNTIME: "memory" })).toThrow(
      /memory identity engine/,
    );
    expect(() =>
      assertProductionRuntime({ BLAKID_ENV: "production", BLAKID_RUNTIME: "compose", BLAKID_DEFAULT_REGION: "us-east-1" }),
    ).toThrow(/ap-southeast-2/);
    expect(() =>
      assertProductionRuntime({ BLAKID_ENV: "production", BLAKID_RUNTIME: "compose", BLAKID_DEFAULT_REGION: "ap-southeast-2" }),
    ).not.toThrow();
  });
});
