# Backup and recovery

Each organisation identity stack has its own PostgreSQL volume.

- Backup: `pg_dump` of the tenant database plus authentik configuration, stored in the sovereignty region (`ap-southeast-2` by default).
- Status is exposed on the organisation environment panel: last backup time, healthy/failed, last restore test.
- Point-in-time recovery is the managed Postgres PITR path in AWS; locally, volume snapshots plus dump files under the gitignored tenant directory.
- Restore tests write `PASS` / `FAIL` onto the deployment record. Do not ship backups out of Australia unless the customer explicitly configures another region.
