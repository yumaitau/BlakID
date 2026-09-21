import type { UserState } from "@blakid/identity";

export type ScimUserResource = {
  id?: string;
  userName?: string;
  displayName?: string;
  active?: boolean;
  emails?: Array<{ value: string; primary?: boolean }>;
  name?: { formatted?: string; givenName?: string; familyName?: string };
};

export type ScimOperation = "create" | "replace" | "patch" | "delete" | "get" | "list";

export type DirectoryUser = {
  id: string;
  email: string;
  name: string;
  state: UserState;
  isActive: boolean;
};

export type ScimDirectory = {
  findByEmail(email: string): Promise<DirectoryUser | null>;
  get(id: string): Promise<DirectoryUser | null>;
  list(): Promise<DirectoryUser[]>;
  create(input: { email: string; name: string }): Promise<DirectoryUser>;
  setState(id: string, to: UserState): Promise<DirectoryUser>;
};

export function emailFrom(resource: ScimUserResource): string {
  const fromEmails = resource.emails?.find((e) => e.primary)?.value ?? resource.emails?.[0]?.value;
  return (fromEmails ?? resource.userName ?? "").toLowerCase();
}

export function nameFrom(resource: ScimUserResource): string {
  return (
    resource.displayName ??
    resource.name?.formatted ??
    [resource.name?.givenName, resource.name?.familyName].filter(Boolean).join(" ") ??
    emailFrom(resource)
  );
}

/** Map SCIM mutations onto BlakID lifecycle. Upstream removal never deletes. */
export function nextStateFromScim(current: UserState | null, op: ScimOperation, active?: boolean): UserState {
  if (op === "delete") {
    if (current === "SUSPENDED") return "ARCHIVED";
    if (current === "ARCHIVED" || current === "DELETED") return current;
    if (current === "INVITED") return "ARCHIVED";
    return "SUSPENDED";
  }
  if (active === false) {
    if (current === "INVITED") return "ARCHIVED";
    if (!current || current === "ACTIVE" || current === "LOCKED") return "SUSPENDED";
    return current;
  }
  if (active === true) {
    if (current === "SUSPENDED" || current === "LOCKED" || current === "ARCHIVED") return "ACTIVE";
    if (!current) return "ACTIVE";
    return current === "INVITED" ? "ACTIVE" : current;
  }
  if (op === "create") return current ?? "INVITED";
  return current ?? "INVITED";
}

export async function applyScimUser(directory: ScimDirectory, op: ScimOperation, resource: ScimUserResource): Promise<{
  user: DirectoryUser;
  action: "created" | "updated" | "suspended" | "archived" | "restored";
}> {
  const email = emailFrom(resource);
  const name = nameFrom(resource) || email;
  if (op === "delete") {
    const existing = resource.id ? await directory.get(resource.id) : await directory.findByEmail(email);
    if (!existing) throw new Error("SCIM user not found");
    const to = nextStateFromScim(existing.state, "delete");
    const user = await directory.setState(existing.id, to);
    return { user, action: to === "ARCHIVED" ? "archived" : "suspended" };
  }

  const existing = resource.id
    ? await directory.get(resource.id)
    : email
      ? await directory.findByEmail(email)
      : null;

  if (!existing) {
    const created = await directory.create({ email, name });
    if (resource.active === false) {
      const to = nextStateFromScim(created.state, "patch", false);
      const user = await directory.setState(created.id, to);
      return { user, action: to === "ARCHIVED" ? "archived" : "suspended" };
    }
    if (resource.active === true && created.state === "INVITED") {
      return { user: await directory.setState(created.id, "ACTIVE"), action: "created" };
    }
    return { user: created, action: "created" };
  }

  if (resource.active === false) {
    const to = nextStateFromScim(existing.state, "patch", false);
    if (to !== existing.state) {
      const user = await directory.setState(existing.id, to);
      return { user, action: to === "ARCHIVED" ? "archived" : "suspended" };
    }
  }
  if (resource.active === true && (existing.state === "SUSPENDED" || existing.state === "ARCHIVED" || existing.state === "LOCKED")) {
    const user = await directory.setState(existing.id, "ACTIVE");
    return { user, action: "restored" };
  }
  return { user: existing, action: "updated" };
}

export function scimUserToResource(user: DirectoryUser): Record<string, unknown> {
  return {
    schemas: ["urn:ietf:params:scim:schemas:core:2.0:User"],
    id: user.id,
    userName: user.email,
    displayName: user.name,
    active: user.isActive && user.state === "ACTIVE",
    emails: [{ value: user.email, primary: true }],
    "urn:ietf:params:scim:schemas:extension:blakid:2.0:User": {
      state: user.state,
    },
  };
}
