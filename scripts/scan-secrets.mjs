#!/usr/bin/env node
import { execSync } from "node:child_process";

const patterns = [
  "AUTHENTIK_BOOTSTRAP_TOKEN=",
  "BEGIN PRIVATE KEY",
  "BEGIN RSA PRIVATE KEY",
  "AWS_SECRET_ACCESS_KEY",
  "client_secret:\\s*[\"'](?!.*csecret)",
];

const history = process.argv.includes("--history");
const files = execSync("git ls-files", { encoding: "utf8" })
  .trim()
  .split("\n")
  .filter((f) => f && !f.endsWith(".example") && !f.includes("scan-secrets"));

let failed = false;
for (const file of files) {
  let content;
  try {
    content = execSync(`git show :"${file}"`, { encoding: "utf8", maxBuffer: 10_000_000 });
  } catch {
    continue;
  }
  if (file.endsWith(".env") && !file.endsWith(".env.example")) {
    console.error(`committed env file: ${file}`);
    failed = true;
  }
  for (const pattern of patterns) {
    if (!new RegExp(pattern).test(content)) continue;
    if (content.includes("change-me") || content.includes("not-for-production")) continue;
    if (pattern === "AUTHENTIK_BOOTSTRAP_TOKEN=" && /AUTHENTIK_BOOTSTRAP_TOKEN=\$\{/.test(content)) continue;
    console.error(`possible secret in ${file} matching ${pattern}`);
    failed = true;
  }
}

if (history) {
  let revs = "";
  try {
    revs = execSync("git rev-list --all", { encoding: "utf8" }).trim().split("\n").filter(Boolean).join(" ");
  } catch {
    revs = "";
  }
  if (revs) {
    for (const pattern of ["BEGIN PRIVATE KEY", "BEGIN RSA PRIVATE KEY", "AWS_SECRET_ACCESS_KEY"]) {
      try {
        const hits = execSync(`git grep -I -n -e ${JSON.stringify(pattern)} ${revs}`, {
          encoding: "utf8",
          maxBuffer: 20_000_000,
        });
        const lines = hits.split("\n").filter((line) => {
          if (!line) return false;
          if (line.includes("scan-secrets.mjs")) return false;
          if (line.includes("change-me") || line.includes("not-for-production")) return false;
          return true;
        });
        if (lines.length) {
          console.error(`history match for ${pattern}: ${lines.slice(0, 5).join(" | ")}`);
          failed = true;
        }
      } catch {
        // git grep exits 1 when nothing matches
      }
    }
  }
}

if (failed) process.exit(1);
console.log(history ? "secret scan clean (tree and history)" : "secret scan clean");
