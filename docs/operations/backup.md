# Backup and recovery

Each organisation identity stack has its own PostgreSQL volume.

- Backup: `docker compose exec postgresql pg_dump -U authentik authentik` of the dedicated tenant database, written under the gitignored tenant directory. Restore test creates `authentik_restore_test`, applies the dump with `ON_ERROR_STOP`, then drops it.
- Status is exposed on the organisation environment panel: last backup time, healthy/failed, last restore test.
- Point-in-time recovery is the managed Postgres PITR path in AWS; locally, volume snapshots plus dump files under the gitignored tenant directory.
- Restore tests write `PASS` / `FAIL` onto the deployment record. Do not ship backups out of Australia unless the customer explicitly configures another region.
