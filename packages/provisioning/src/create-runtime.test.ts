import { describe, expect, it } from "vitest";
import { MemoryTenantRuntime } from "@blakid/control-plane";
import { ComposeTenantRuntime } from "./compose-runtime.ts";
import { createTenantRuntime, runtimeKindFromEnv } from "./create-runtime.ts";

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
});
