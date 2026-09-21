import { MemoryTenantRuntime, type TenantRuntime } from "@blakid/control-plane";
import { ComposeTenantRuntime, defaultComposeFile, tenantHostFromDocker } from "./compose-runtime.ts";
import { join } from "node:path";

export type RuntimeKind = "memory" | "compose";

export function runtimeKindFromEnv(env: NodeJS.ProcessEnv = process.env): RuntimeKind {
  return env.BLAKID_RUNTIME === "compose" ? "compose" : "memory";
}

export function assertProductionRuntime(env: NodeJS.ProcessEnv = process.env): void {
  if (env.BLAKID_ENV === "production" && runtimeKindFromEnv(env) !== "compose") {
    throw new Error("Production refuses the memory identity engine. Set BLAKID_RUNTIME=compose.");
  }
  if (env.BLAKID_ENV === "production" && env.BLAKID_DEFAULT_REGION && env.BLAKID_DEFAULT_REGION !== "ap-southeast-2") {
    throw new Error("Production default region must be ap-southeast-2 unless a customer hosting model overrides it.");
  }
}

export function createTenantRuntime(input: {
  env?: NodeJS.ProcessEnv;
  ids: () => string;
  now: () => Date;
  tenantsRoot?: string;
  composeFile?: string;
}): { kind: RuntimeKind; runtime: TenantRuntime } {
  const env = input.env ?? process.env;
  assertProductionRuntime(env);
  const kind = runtimeKindFromEnv(env);
  if (kind === "compose") {
    const dockerHost = env.BLAKID_DOCKER_HOST || env.DOCKER_HOST || undefined;
    return {
      kind,
      runtime: new ComposeTenantRuntime({
        tenantsRoot: input.tenantsRoot ?? env.BLAKID_TENANTS_ROOT ?? join(process.cwd(), "infrastructure/docker/tenants"),
        composeFile: input.composeFile ?? env.BLAKID_COMPOSE_FILE ?? defaultComposeFile,
        dockerHost,
        tenantHost: env.BLAKID_TENANT_HOST ?? tenantHostFromDocker(dockerHost),
        ids: input.ids,
        now: input.now,
      }),
    };
  }
  return {
    kind,
    runtime: new MemoryTenantRuntime(input.ids, input.now, env.BLAKID_MEMORY_BACKUP_ROOT),
  };
}
