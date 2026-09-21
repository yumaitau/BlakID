import { MemoryTenantRuntime, type TenantRuntime } from "@blakid/control-plane";
import { ComposeTenantRuntime, defaultComposeFile, tenantHostFromDocker } from "./compose-runtime.ts";
import { join } from "node:path";

export type RuntimeKind = "memory" | "compose";

export function runtimeKindFromEnv(env: NodeJS.ProcessEnv = process.env): RuntimeKind {
  return env.BLAKID_RUNTIME === "compose" ? "compose" : "memory";
}

export function createTenantRuntime(input: {
  env?: NodeJS.ProcessEnv;
  ids: () => string;
  now: () => Date;
  tenantsRoot?: string;
  composeFile?: string;
}): { kind: RuntimeKind; runtime: TenantRuntime } {
  const env = input.env ?? process.env;
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
