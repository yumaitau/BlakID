import { describe, expect, it } from "vitest";
import {
  approveSupport,
  denySupport,
  expireOrEnd,
  requestSupport,
  reviewSupport,
  startSupport,
  SupportAccessError,
} from "./index.ts";

const now = new Date("2026-09-22T04:00:00Z");

describe("support access workflow", () => {
  it("requires a reason and refuses impersonation scopes", () => {
    expect(() =>
      requestSupport({
        id: "s1",
        organisationId: "org-a",
        requesterId: "op-1",
        requesterEmail: "op@yuma.test",
        reason: "short",
        scopes: ["identity.users.read"],
        now,
      }),
    ).toThrow(SupportAccessError);

    expect(() =>
      requestSupport({
        id: "s1",
        organisationId: "org-a",
        requesterId: "op-1",
        requesterEmail: "op@yuma.test",
        reason: "Investigate login failures for ranger devices",
        scopes: ["identity.impersonate"],
        now,
      }),
    ).toThrow(/not permitted/);
  });

  it("walks request → approve → start → expire → review", () => {
    const requested = requestSupport({
      id: "s1",
      organisationId: "org-a",
      requesterId: "op-1",
      requesterEmail: "op@yuma.test",
      reason: "Investigate login failures for ranger devices",
      scopes: ["identity.users.read", "identity.sessions.revoke"],
      breakGlass: true,
      now,
    });
    expect(requested.status).toBe("requested");
    expect(requested.alerted).toBe(true);

    const first = approveSupport(requested, "owner-1", now, 60);
    expect(first.status).toBe("pending_second");
    expect(() => approveSupport(first, "owner-1", now, 60)).toThrow(/second person/);
    const approved = approveSupport(first, "owner-2", now, 60);
    expect(approved.status).toBe("approved");
    expect(approved.expiresAt).toBeTruthy();

    const started = startSupport(approved, now);
    expect(started.status).toBe("active");

    const ended = expireOrEnd(started, new Date(now.getTime() + 61 * 60_000), "expired");
    expect(ended.status).toBe("expired");

    const reviewed = reviewSupport(ended, "Access was limited to session revoke as requested");
    expect(reviewed.status).toBe("reviewed");
    expect(reviewed.reviewNotes).toContain("session revoke");
  });

  it("cannot start a denied request", () => {
    const requested = requestSupport({
      id: "s1",
      organisationId: "org-a",
      requesterId: "op-1",
      requesterEmail: "op@yuma.test",
      reason: "Investigate login failures for ranger devices",
      scopes: ["audit.read"],
      now,
    });
    const denied = denySupport(requested, "owner-1", now);
    expect(() => startSupport(denied, now)).toThrow(SupportAccessError);
  });
});
