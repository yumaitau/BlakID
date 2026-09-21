import { describe, expect, it } from "vitest";
import { authentikUserRef, authentikUserRefs } from "./user-refs.ts";

describe("authentikUserRef", () => {
  it("keeps integer primary keys as numbers so group PATCH does not send NaN", () => {
    expect(authentikUserRef("42")).toBe(42);
    expect(authentikUserRefs(["1", "2", "abc"])).toEqual([1, 2, "abc"]);
  });

  it("leaves uuid-style ids as strings and never emits NaN", () => {
    const refs = authentikUserRefs(["user-9f", "abc"]);
    expect(refs).toEqual(["user-9f", "abc"]);
    expect(refs.some((v) => typeof v === "number" && Number.isNaN(v))).toBe(false);
  });
});
