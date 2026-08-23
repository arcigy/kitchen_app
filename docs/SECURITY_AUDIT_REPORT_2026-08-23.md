# Security audit report — 2026-08-23

Scope: source tree on branch `codex/full-audit-hardening`, local test runtime,
CI and CapRover workflow configuration. No production data was changed and no
external credential was rotated.

## Evidence collected

- `npm ci`, `npm run typecheck`, `npm run lint`, `npm test`, `npm run build`
  and `npm run test:ui-regression` passed locally. The full test suite reported
  357 files, 2,215 tests passed and one skipped test.
- The local UI suite exercised project save/load, FQP round-trip, materials,
  pricing, accessibility and locale paths with zero browser console errors.
- `npm audit --audit-level=low`, `npm run security:dependencies` and
  `npm run security:secrets` passed.
- Trivy filesystem scan (vulnerability, misconfiguration and secret scanners;
  HIGH/CRITICAL) returned no findings.
- Semgrep returned two review items: trusted reverse-proxy host reconstruction
  in `deploy/nginx.conf` and a local-only Python CLI subprocess with argument
  array and `shell=False`. Semgrep also timed out on selected large legacy
  module files, so it is supporting—not complete—evidence.
- Gitleaks returned 507 `generic-api-key` heuristic matches in 33 files. 498
  are generated catalog/module data, eight are tests and one is a historical
  deleted filename. No current runtime secret was confirmed by this scan.

## Remediated finding

**P1 — automatic deploy-time image deletion.** The CapRover deploy workflow
queried `unusedImages` and then posted to `deleteImages`. The workflow and its
helper now only validate and report the candidate count. The helper contains no
write, Docker command or delete endpoint path. Focused regression tests protect
this invariant.

## Current disposition

No confirmed critical source-level vulnerability was found in the reviewed
scope. The following remain open because they require authority or evidence
outside this repository:

1. provider-side revoke/rotation for historic GitHub secret alerts;
   read-only GitHub evidence on 2026-08-23: three open Google API Key alerts
   with unknown validity;
2. database RLS/least-privilege verification against the live deployment
   topology;
3. proven encrypted off-host backups, PITR and a timed restore;
4. centralized observability retention and an exercised paging path;
5. MFA/SSO and shared rate limiting decisions.

The administrator-bypass finding was closed on 2026-08-23: `develop` now
enforces administrators while retaining strict `verify` and `CodeQL` status
checks, PR protection, disabled force-pushes and disabled deletions.

Do not close these as accepted risks without a named owner, due date and
evidence link. See `SECURITY_THREAT_MODEL.md`, `PRIVACY_REVIEW.md`,
`BACKUP_AND_RESTORE.md` and `INCIDENT_RESPONSE.md`.
