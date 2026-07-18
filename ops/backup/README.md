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
At the time of the first deployment, verify both the retention period and the
mode in the provider UI or API; a displayed day count alone does not prove that
the bucket is in Compliance mode. The worker intentionally has no delete
capability; lifecycle/retention changes are a separate, approval-required
administrator operation.

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

## Google Drive filesystem target

When B2 is unavailable, `filesystem-backup-runner.mjs` provides an additive
off-host target for a locally synchronized Google Drive directory. It connects
to the fixed production PostgreSQL service over host-key-pinned SSH, runs a
schema-only `prod` custom-format dump, and encrypts the stream directly into a
new `.pgdump.arcigy` file. No plaintext dump is written locally or into Drive.

Required environment (keep the passphrase outside both Git and Drive):

```text
ARCIGY_BACKUP_OFFSITE_ACK=true
ARCIGY_BACKUP_TARGET_ROOT=<absolute synchronized Google Drive directory>
ARCIGY_BACKUP_ENCRYPTION_PASSPHRASE=<at least 24 bytes>
ARCIGY_BACKUP_SSH_HOST=<pinned CapRover host>
ARCIGY_BACKUP_SSH_USER=root
ARCIGY_BACKUP_SSH_KNOWN_HOSTS=<absolute reviewed known-hosts file>
ARCIGY_BACKUP_INTERVAL_HOURS=24
```

Run one backup with `npm run backup:filesystem`. The runner uses exclusive
creation plus a random encrypted partial name and atomically renames only after
the SSH dump, AES-256-GCM tag, file sync, and SHA-256 accounting succeed.

For a real restore drill, additionally select one contained artifact and set:

```text
ARCIGY_RESTORE_ISOLATED=true
ARCIGY_RESTORE_FILE=<absolute .pgdump.arcigy artifact under the target root>
```

For a recurring verification task, set `ARCIGY_RESTORE_LATEST=true` instead of
`ARCIGY_RESTORE_FILE`; exactly one selection mode is required. Latest selection
walks only the configured target, rejects symbolic links, ignores partial files,
and chooses the timestamp-sortable newest completed database artifact.

`npm run restore:filesystem` authenticates and decrypts the artifact as a
stream into a new, unnetworked, labelled PostgreSQL 16 container on the
CapRover host. It checks the restored `prod` schema, migrations, constraints,
and indexes, reports aggregate evidence and RTO, and removes the isolated
container in a trap. It cannot target the production database and never writes
a plaintext dump file.

Current operator policy uses the company ArciGy shared Drive rather than a
personal My Drive: daily full backup at 03:30, weekly isolated restore on Sunday
at 05:00, `StartWhenAvailable`, `IgnoreNew`, two-hour execution limit, RPO 24
hours, RTO 4 hours, and at least 90 daily artifacts. No automatic deletion is
enabled. The passphrase file must remain outside both Git and Drive.
