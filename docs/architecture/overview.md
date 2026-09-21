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
- Identity engine image pin: `ghcr.io/goauthentik/server@sha256:ab9b4e8cc4ab3f8d1198d2db6aeea66bafea1963b3f2843589e0d163f97d9849` (tag 2026.8.3) in `packages/config`.
- Local runtime may use in-memory authentik stand-ins for unit tests; Compose dedicated stacks for integration.
