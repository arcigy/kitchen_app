# Security report

Canonical detailed evidence: `SECURITY_AUDIT_REPORT_2026-08-23.md` and
`SECURITY_THREAT_MODEL.md`.

| Severity | Finding | Location | Impact | Root cause | Fix / current state | Regression evidence |
| --- | --- | --- | --- | --- | --- | --- |
| Closed P1 | Automatic deploy-time image deletion | `deploy-caprover.yml` | A deployment could remove rollback images without fresh operator approval | The workflow posted the CapRover `deleteImages` request automatically | Replaced by validated read-only capacity inspection | `caproverUnusedImageCleanup.test.ts`; deploy CI green |
| Closed P2 | JSON parser detail exposed | Worker error pipeline | Parser implementation detail appeared in malformed-request responses | `SyntaxError` message was returned for HTTP 400 | Generic `Malformed JSON request body.` response | `server-error-response.test.ts`, `workerRequestPipeline.test.ts` |
| Closed P1 | Closed worker caches retained global references | Catalog exact-lookup registry | Long-running test/runtime process could retain tenant catalog copies after server close | Strong global cache registry had no disposal path | Server close disposes lookup cache and clears response caches | `catalog-exact-lookup.test.ts`, 49-worker authorization suite |
| Closed P1 | Administrator bypass on `develop` | GitHub branch protection | Required PR/CI controls could be bypassed by administrators | `enforce_admins=false` | GitHub protection updated and re-read as `true` | GitHub API verification 2026-08-23 |
| Open P1 | Historic provider secrets | GitHub secret-scanning alerts | Potential external API-key misuse if still valid | Historic committed keys require provider-side action | Three alerts remain open with unknown validity; do not resolve before real revoke/rotation | GitHub API inventory 2026-08-23 |
| Open P1 | Database/data-plane operational proof | Database, backup and telemetry operations | RLS, PITR, restore and alerting cannot be proven from repository code alone | Required provider/operator evidence unavailable to source audit | See backup, incident and privacy records | Isolated CI restore drill only |

No Critical source-level finding was confirmed in the authorized repository and
local test scope. “Open” means not accepted or silently suppressed.
