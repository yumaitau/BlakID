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
- Identity engine image pin: `ghcr.io/goauthentik/server@sha256:602227a86455d6772e3d16b7d852713c4f864f40df5df894abd1285bb53979a5` (tag 2026.8.5) in `packages/config`.
- Local runtime may use in-memory authentik stand-ins for unit tests; Compose dedicated stacks for integration.
