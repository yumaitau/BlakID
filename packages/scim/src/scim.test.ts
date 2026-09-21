import { describe, expect, it } from "vitest";
import { applyScimUser, nextStateFromScim, type DirectoryUser, type ScimDirectory } from "./index.ts";
import { transition, type UserState } from "@blakid/identity";

class MemoryDirectory implements ScimDirectory {
  users = new Map<string, DirectoryUser>();
  n = 0;
  async findByEmail(email: string) {
    return [...this.users.values()].find((u) => u.email === email.toLowerCase()) ?? null;
  }
  async get(id: string) {
    return this.users.get(id) ?? null;
  }
  async list() {
    return [...this.users.values()];
  }
  async create(input: { email: string; name: string }) {
    this.n += 1;
    const user: DirectoryUser = {
      id: `u-${this.n}`,
      email: input.email.toLowerCase(),
      name: input.name,
      state: "INVITED",
      isActive: true,
    };
    this.users.set(user.id, user);
    return user;
  }
  async setState(id: string, to: UserState) {
    const user = this.users.get(id);
    if (!user) throw new Error("missing");
    user.state = transition(user.state, to);
    user.isActive = user.state === "ACTIVE" || user.state === "INVITED";
    return user;
  }
}

describe("SCIM inbound lifecycle", () => {
  it("creates, suspends, and archives instead of deleting", async () => {
    const directory = new MemoryDirectory();
    const created = await applyScimUser(directory, "create", {
      userName: "sarah@a.test",
      displayName: "Sarah",
      active: true,
    });
    expect(created.action).toBe("created");
    expect(created.user.state).toBe("ACTIVE");

    const suspended = await applyScimUser(directory, "patch", {
      id: created.user.id,
      userName: "sarah@a.test",
      active: false,
    });
    expect(suspended.action).toBe("suspended");
    expect(suspended.user.state).toBe("SUSPENDED");
    expect(suspended.user.isActive).toBe(false);

    const removed = await applyScimUser(directory, "delete", { id: created.user.id });
    expect(removed.action).toBe("archived");
    expect(removed.user.state).toBe("ARCHIVED");
    expect(removed.user.state).not.toBe("DELETED");
    expect(directory.users.has(created.user.id)).toBe(true);
  });

  it("never maps a SCIM DELETE onto DELETED", () => {
    expect(nextStateFromScim("ACTIVE", "delete")).toBe("SUSPENDED");
    expect(nextStateFromScim("SUSPENDED", "delete")).toBe("ARCHIVED");
    expect(nextStateFromScim("ARCHIVED", "delete")).toBe("ARCHIVED");
  });
});
