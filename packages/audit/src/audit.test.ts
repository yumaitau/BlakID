import { describe, expect, it } from "vitest";
import { ImmutableAuditLog, MemoryAuditStore, toCsv, toSyslog } from "./index.ts";

describe("immutable audit log", () => {
  it("persists required fields and refuses duplicates", async () => {
    const store = new MemoryAuditStore();
    const log = new ImmutableAuditLog(store, () => "evt-1", () => new Date("2026-09-22T00:00:00Z"));
    const event = await log.record({
      organisation_id: "org-a",
      actor_id: "actor-1",
      actor_type: "human",
      action: "identity.suspended",
      target_type: "identity",
      target_id: "user-1",
      source_ip: "203.0.113.9",
      user_agent: "vitest",
      session_id: "sess-1",
      request_id: "req-1",
      result: "success",
      metadata: { from: "ACTIVE", to: "SUSPENDED" },
    });
    expect(event.event_id).toBe("evt-1");
    expect(event.timestamp).toBe("2026-09-22T00:00:00.000Z");
    expect(event.organisation_id).toBe("org-a");
    expect(event.actor_id).toBe("actor-1");
    expect(event.actor_type).toBe("human");
    expect(event.action).toBe("identity.suspended");
    expect(event.target_type).toBe("identity");
    expect(event.target_id).toBe("user-1");
    expect(event.result).toBe("success");
    await expect(log.record({ ...event })).rejects.toThrow(/immutable/);
    expect(toCsv([event])).toContain("identity.suspended");
    expect(toSyslog([event])).toContain('org="org-a"');
    expect(toSyslog([event])).toContain("identity.suspended");
  });
});
