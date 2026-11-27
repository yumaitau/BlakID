# Architecture

```
BlakID control plane + console + portal
        │
        ├── organisation A ── authentik + Postgres + Redis
        ├── organisation B ── authentik + Postgres + Redis
        └── organisation C ── authentik + Postgres + Redis
```

- Control plane metadata database is not a user directory.
- Public API: `/api/v1/*`, `/api/health`, `/api/ready`.
- Identity engine image pin: `ghcr.io/goauthentik/server@sha256:1675a017c46ba7f4f15333aeafeeb64538c581673bcbcd36af872cdf7de4e7f7` (tag 2026.8.7) in `packages/config`.
- Local runtime may use in-memory authentik stand-ins for unit tests; Compose dedicated stacks for integration.
