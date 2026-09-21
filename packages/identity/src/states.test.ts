import { describe, expect, it } from "vitest";
import {
  assertNotIndigenousIdentityClaim,
  InvalidTransitionError,
  transition,
  USER_STATES,
} from "./states.ts";

describe("identity lifecycle", () => {
  it("exposes the required user states", () => {
    expect(USER_STATES).toEqual(["INVITED", "ACTIVE", "SUSPENDED", "LOCKED", "ARCHIVED", "DELETED"]);
  });

  it("allows invite → activate → suspend → restore → terminate → delete", () => {
    expect(transition("INVITED", "ACTIVE")).toBe("ACTIVE");
    expect(transition("ACTIVE", "SUSPENDED")).toBe("SUSPENDED");
    expect(transition("SUSPENDED", "ACTIVE")).toBe("ACTIVE");
    expect(transition("ACTIVE", "ARCHIVED")).toBe("ARCHIVED");
    expect(transition("ARCHIVED", "DELETED")).toBe("DELETED");
  });

  it("refuses skipping archive on the way to deletion", () => {
    expect(() => transition("ACTIVE", "DELETED")).toThrow(InvalidTransitionError);
    expect(() => transition("SUSPENDED", "DELETED")).toThrow(InvalidTransitionError);
  });

  it("refuses platform-level Indigenous identity claims", () => {
    expect(() =>
      assertNotIndigenousIdentityClaim([
        {
          attribute: "is_indigenous",
          value: true,
          issuer: "BlakID",
          issued_at: new Date().toISOString(),
          expires_at: null,
          assurance: "organisation_verified",
        },
      ]),
    ).toThrow(/never assert/);
  });

  it("allows organisation-defined membership provenance", () => {
    expect(() =>
      assertNotIndigenousIdentityClaim([
        {
          attribute: "community_member",
          value: true,
          issuer: "Example Aboriginal Corporation",
          issued_at: new Date().toISOString(),
          expires_at: null,
          assurance: "organisation_verified",
        },
      ]),
    ).not.toThrow();
  });
});
