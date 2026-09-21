import { describe, expect, it } from "vitest";
import { TenantIsolationError } from "../../packages/authz/src/index.ts";
import { BlakID, createTestPrincipal, MemoryStore, MemoryTenantRuntime } from "../../packages/control-plane/src/index.ts";

describe("tenant isolation release blocker", () => {
  it("org A cannot read org B users, applications, or audit", async () => {
    let n = 0;
    const ids = () => `t-${++n}`;
    const now = () => new Date("2026-09-22T08:00:00Z");
    const app = new BlakID({ store: new MemoryStore(), runtime: new MemoryTenantRuntime(ids, now), ids, now });
    const operator = createTestPrincipal({ role: "YUMA_PLATFORM_OPERATOR", organisationId: null });
    const a = await app.provisionOrganisation(operator, {
      name: "A",
      slug: "org-a",
      adminEmail: "a@a.test",
      adminName: "A",
    });
    const b = await app.provisionOrganisation(operator, {
      name: "B",
      slug: "org-b",
      adminEmail: "b@b.test",
      adminName: "B",
    });
    const ownerA = createTestPrincipal({ role: "ORGANISATION_OWNER", organisationId: a.organisation.id });
    const ownerB = createTestPrincipal({ role: "ORGANISATION_OWNER", organisationId: b.organisation.id });
    const user = await app.inviteUser(ownerA, a.organisation.id, { email: "josh@a.test", name: "Josh" });
    await expect(app.getUser(ownerB, a.organisation.id, user.id)).rejects.toThrow(TenantIsolationError);
    await expect(app.listUsers(ownerA, b.organisation.id)).rejects.toThrow(TenantIsolationError);
    await expect(app.listApplications(ownerB, a.organisation.id)).rejects.toThrow(TenantIsolationError);
    await expect(app.listEvents(ownerB, a.organisation.id)).rejects.toThrow(TenantIsolationError);
  });
});
