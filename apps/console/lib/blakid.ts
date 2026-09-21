import { BlakID, MemoryStore } from "@blakid/control-plane";
import { AUTHENTIK_VERSION } from "@blakid/config";
import { createTenantRuntime, runtimeKindFromEnv } from "@blakid/provisioning";
import { randomBytes } from "node:crypto";

type GlobalBlak = {
  __blakid?: BlakID;
};

const g = globalThis as typeof globalThis & GlobalBlak;

function ids() {
  return randomBytes(16).toString("hex");
}

export function getBlakID(): BlakID {
  if (!g.__blakid) {
    const { runtime } = createTenantRuntime({ ids, now: () => new Date() });
    g.__blakid = new BlakID({ store: new MemoryStore(), runtime, ids });
  }
  return g.__blakid;
}

export function resetBlakIDForTests(): BlakID {
  g.__blakid = undefined;
  return getBlakID();
}

export const runtimeName = runtimeKindFromEnv();
export const authentikVersion = AUTHENTIK_VERSION;
