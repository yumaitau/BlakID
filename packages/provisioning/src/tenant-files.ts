import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { AUTHENTIK_IMAGE, POSTGRES_IMAGE, REDIS_IMAGE } from "@blakid/config";

export function tenantDir(root: string, slug: string): string {
  return join(root, slug);
}

export function allocateHttpPort(used: Set<number>, start = 9100): number {
  let port = start;
  while (used.has(port)) port += 1;
  used.add(port);
  return port;
}

export function writeTenantEnv(input: {
  root: string;
  slug: string;
  httpPort: number;
  pgPass: string;
  secretKey: string;
  bootstrapEmail: string;
  bootstrapPassword: string;
  bootstrapToken: string;
}): string {
  const dir = tenantDir(input.root, input.slug);
  mkdirSync(dir, { recursive: true });
  const envPath = join(dir, ".env");
  const contents = [
    `COMPOSE_PROJECT_NAME=blakid-${input.slug}`,
    `PG_USER=authentik`,
    `PG_DB=authentik`,
    `PG_PASS=${input.pgPass}`,
    `AUTHENTIK_SECRET_KEY=${input.secretKey}`,
    `AUTHENTIK_IMAGE=${AUTHENTIK_IMAGE}`,
    `POSTGRES_IMAGE=${POSTGRES_IMAGE}`,
    `REDIS_IMAGE=${REDIS_IMAGE}`,
    `COMPOSE_PORT_HTTP=${input.httpPort}`,
    `AUTHENTIK_BOOTSTRAP_EMAIL=${input.bootstrapEmail}`,
    `AUTHENTIK_BOOTSTRAP_PASSWORD=${input.bootstrapPassword}`,
    `AUTHENTIK_BOOTSTRAP_TOKEN=${input.bootstrapToken}`,
    `BACKUP_REGION=ap-southeast-2`,
  ].join("\n");
  writeFileSync(envPath, contents, { mode: 0o600 });
  return envPath;
}

export function readHttpPort(root: string, slug: string): number | null {
  const envPath = join(tenantDir(root, slug), ".env");
  if (!existsSync(envPath)) return null;
  const match = readFileSync(envPath, "utf8").match(/COMPOSE_PORT_HTTP=(\d+)/);
  return match ? Number(match[1]) : null;
}
