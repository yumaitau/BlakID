import { readFileSync } from "node:fs";

const config = readFileSync(new URL("../packages/config/src/index.ts", import.meta.url), "utf8");
const digest = config.match(/sha256:[a-f0-9]{64}/)?.[0];
if (!digest) {
  console.error("authentik image digest missing from packages/config");
  process.exit(1);
}
const compose = readFileSync(new URL("../infrastructure/docker/authentik-tenant.yaml", import.meta.url), "utf8");
if (!compose.includes(digest)) {
  console.error("tenant compose is not pinned to the config digest");
  process.exit(1);
}
if (compose.includes("goauthentik/server:latest") || /goauthentik\/server:\d/.test(compose) && !compose.includes(`@${digest}`)) {
  console.error("tenant compose still floats an authentik tag");
  process.exit(1);
}
console.log(`authentik pin ok ${digest}`);
