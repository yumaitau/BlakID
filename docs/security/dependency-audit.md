# Dependency security gates

Run `pnpm audit --audit-level=high` after dependency changes. The root
`package.json` contains targeted overrides for source-map-js 1.2.2 and sharp
0.35.5, the first patched versions for their audit findings. Vitest 4.1.11
removes the vulnerable tinypool dependency and fixes the mocker advisory;
Vitest 3 has no patched release. Next.js and eslint-config-next stay aligned
at the patched 16.3.8 release.

## Temporary audit exception

Reviewed on 2026-10-15: [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
(CVE-2026-93687) affects braces through 3.0.3. No fixed version is published
(the registry's patched range is `<0.0.0`). The dependency path is
`eslint-config-next > @next/eslint-plugin-next > fast-glob > micromatch > braces`;
the current upstream ESLint plugin still uses this chain.

The root `pnpm.auditConfig.ignoreGhsas` excludes only this advisory. Deeply
nested brace patterns can exhaust the stack; here the dependency is used by
development lint tooling. Remove the exception once a patched braces release
or an upstream dependency update removes the affected code. No other npm
advisories are ignored; the remaining moderate esbuild finding in drizzle-kit
does not fail the high-severity gate.

## Authentik image verification

The 2026.8.4 multi-architecture index digest was obtained from GHCR's manifest
endpoint and is shared by the config and tenant Compose file. Trivy 0.76.0
on linux/amd64 found PyJWT 2.15.1 and anyio 4.14.2 in this image, so the old
anyio exception was removed from `.trivyignore`. CVE-2026-102268 is absent.
The CI-equivalent CRITICAL scan with `--ignore-unfixed` passes; an unfixed
libxml2 CVE remains excluded by that existing gate policy.
