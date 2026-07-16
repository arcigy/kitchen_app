# Arcigy PostgreSQL off-host backup worker

This is a dedicated, single-replica CapRover worker. It runs `pg_dump` in
custom format, encrypts the stream with AES-256-GCM and a scrypt-derived key,
and uploads it as a Backblaze B2 large file. It does not write local dump files,
does not delete remote objects, and uses a PostgreSQL advisory lock so a restart
cannot overlap two backups.

## Required runtime secrets

Set these only in the CapRover secret store, never in the repository or image:

- `DATABASE_URL` — a dedicated read-only backup role, restricted to the Arcigy database;
- `ARCIGY_BACKUP_B2_KEY_ID` and `ARCIGY_BACKUP_B2_APPLICATION_KEY`;
- `ARCIGY_BACKUP_ENCRYPTION_PASSPHRASE`.

The B2 key must be restricted to the Arcigy backup bucket and `arcigy/prod/`
prefix, with exactly `listFiles`, `readFiles`, and `writeFiles`. The worker
fails closed when the key can delete files or manage keys, buckets, retention,
or legal holds.

## Non-secret configuration

```text
ARCIGY_BACKUP_B2_BUCKET=arcigy-kitchen-backup-2026
ARCIGY_BACKUP_OBJECT_PREFIX=arcigy/prod/postgres
ARCIGY_BACKUP_INTERVAL_MINUTES=360
ARCIGY_BACKUP_PART_BYTES=10485760
```

The bucket must already have default **Compliance** Object Lock retention.
The worker intentionally has no delete capability; lifecycle/retention changes
are a separate, approval-required administrator operation.

## Restore proof

`restore-runner.mjs` downloads one explicit object, decrypts it into a protected
temporary directory, and runs `pg_restore --list`. This default mode makes no
database write. To run `pg_restore`, it additionally requires all of:

```text
ARCIGY_RESTORE_EXECUTE=true
ARCIGY_RESTORE_ISOLATED=true
ARCIGY_RESTORE_TARGET_DATABASE_URL=postgresql://...@127.0.0.1:5432/arcigy_restore_<new-name>
ARCIGY_RESTORE_OBJECT_KEY=arcigy/prod/postgres/.../selected.pgdump.arcigy
```

The target must be a newly created loopback database named `arcigy_restore_*`;
the command cannot accept a private CapRover hostname or the production database
name. Compare migrations, tenant counts, representative project opening,
catalog, BOM, and asset references before recording RPO/RTO.

## Deployment boundary

Package this folder as the root of a separate CapRover app, for example
`arcigy-kitchen-backup`, with one replica and no public domain. Do not mount it
into application storage and do not point it at the `dev` schema. Production
provisioning, B2 retention changes, creating the backup database role, and the
first production backup/restore are approval-required external changes.
