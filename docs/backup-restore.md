# Backup and restore

Canonical operating record: `BACKUP_AND_RESTORE.md` and
`SAAS_OPERATIONS_RUNBOOK.md`.

## Verified repository controls

- CI runs a disposable PostgreSQL backup-and-restore drill.
- Deploy preflight requires durable storage evidence for the selected develop
  CapRover target.
- Restore guidance requires an isolated target, tenant isolation checks and
  explicit cutover approval.

## Evidence still required from operations

| Control | Required proof | Current state |
| --- | --- | --- |
| Backup frequency and encryption | Provider configuration and successful scheduled execution | Not source-verifiable |
| Off-host retention | Backup location, access boundary and expiry policy | Not source-verifiable |
| PITR | WAL/archive or managed service configuration with recovery test | Not source-verifiable |
| Recovery objective | Approved RPO/RTO and measured restore duration | Not source-verifiable |
| Production restore drill | Isolated restore evidence plus tenant authorization checks | Not source-verifiable |

Do not replace an unverified operational control with a documentation claim.
