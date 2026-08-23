# Backup and restore control record

The CI pipeline runs an isolated PostgreSQL backup/restore drill. This proves
the repository scripts can exercise a disposable database; it does **not**
prove production backup frequency, off-host replication, encryption, PITR or
RPO/RTO.

## Required operating standard

| Control | Required evidence | Status in this audit |
| --- | --- | --- |
| Encrypted off-host database backup | Provider configuration and successful scheduled job | Unverified externally |
| Point-in-time recovery | WAL/archive or managed-service configuration and drill | Unverified externally |
| Object/file storage backup | Tenant object inventory and restore sample | Unverified externally |
| Restore drill | Isolated restore, integrity/tenant check and measured elapsed time | CI disposable drill verified; production drill unverified |
| RPO/RTO | Owner-approved target and recorded actual test result | Unverified externally |

## Safe restore procedure

1. Freeze writes and record the incident time and selected recovery point.
2. Restore only to an isolated target—not over production.
3. Verify schema version, row counts, representative tenant project access and
   cross-tenant denial.
4. Measure restore duration and compare it with the approved RTO.
5. Obtain named operational approval for cutover; retain the original system
   until validation completes.

Never run a destructive restore, cleanup or credential rotation from a code
change without the required operations approval.
