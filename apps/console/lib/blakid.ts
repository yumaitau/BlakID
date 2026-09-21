import { BlakID, MemoryStore, MemoryTenantRuntime } from "@blakid/control-plane";
import { AUTHENTIK_VERSION } from "@blakid/config";
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
    const store = new MemoryStore();
    const runtime = new MemoryTenantRuntime(ids, () => new Date());
    g.__blakid = new BlakID({ store, runtime, ids });
  }
  return g.__blakid;
}

export function resetBlakIDForTests(): BlakID {
  g.__blakid = undefined;
  return getBlakID();
}

export const runtimeName = process.env.BLAKID_RUNTIME ?? "memory";
export const authentikVersion = AUTHENTIK_VERSION;
