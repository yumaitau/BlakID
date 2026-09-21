import { describe, expect, it } from "vitest";
import { RateLimiter, StepUpRequired, assertStepUp, privilegedAction, stepUpFresh } from "./index.ts";

describe("passkey step-up", () => {
  const now = new Date("2026-09-22T05:00:00.000Z");

  it("names privileged console actions", () => {
    expect(privilegedAction({ resource: "users", extra: "suspend", method: "POST" })).toBe("users.suspend");
    expect(privilegedAction({ resource: "applications", method: "POST" })).toBe("applications.create");
    expect(privilegedAction({ resource: "support-access", extra: "approve", method: "POST" })).toBe("support.approve");
    expect(privilegedAction({ resource: "federation", id: "assertions", method: "POST" })).toBe("federation.issue");
    expect(privilegedAction({ resource: "users", method: "GET" })).toBeNull();
  });

  it("rejects a privileged call without a fresh passkey", () => {
    expect(stepUpFresh(undefined, now)).toBe(false);
    expect(stepUpFresh("2026-09-22T04:00:00.000Z", now)).toBe(false);
    expect(stepUpFresh("2026-09-22T05:10:00.000Z", now)).toBe(true);
    expect(() => assertStepUp("users.suspend", null, now)).toThrow(StepUpRequired);
    expect(() => assertStepUp("users.suspend", "2026-09-22T05:10:00.000Z", now)).not.toThrow();
    expect(() => assertStepUp(null, null, now)).not.toThrow();
  });
});

describe("rate limiter", () => {
  it("locks a key after the window fills", () => {
    const limiter = new RateLimiter(2, 60_000);
    expect(limiter.hit("login:1", 0).ok).toBe(true);
    expect(limiter.hit("login:1", 1).ok).toBe(true);
    const blocked = limiter.hit("login:1", 2);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
    expect(limiter.hit("login:2", 2).ok).toBe(true);
  });
});
