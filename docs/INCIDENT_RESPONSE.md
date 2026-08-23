# Incident response runbook

## Severity and first response

| Severity | Examples | Target response |
| --- | --- | --- |
| SEV-1 | Confirmed tenant data exposure, credential compromise, production outage | Start incident bridge immediately; contain before feature work. |
| SEV-2 | Authorization bypass attempt, sustained service degradation, backup failure | Triage within one hour and assign an incident owner. |
| SEV-3 | Isolated failed job, non-sensitive client error regression | Create a tracked corrective action within one business day. |

1. Preserve timestamps, request IDs, affected tenant identifiers and evidence.
   Never paste credentials, raw customer projects or access tokens into tickets.
2. Contain safely: disable the affected route/integration or revoke the
   compromised credential. Do not delete data or logs as a first response.
3. Validate scope using tenant-aware audit data and independent operator access.
4. Notify the designated product/security owner; legal/privacy notification
   timing is their decision based on verified impact.
5. Recover from a known-good deployment or an isolated restore; verify tenant
   isolation, health and readiness before reopening access.
6. Produce a blameless post-incident report: timeline, root cause, affected
   data, mitigation, owner and regression test.

## Scenario playbooks

- **Suspected leaked secret:** revoke at provider, rotate dependent runtime
  secret, invalidate sessions if applicable, scan history and verify the new
  credential is not logged.
- **Cross-tenant access:** preserve proof, block the affected account/route,
  inspect all resources reachable with the same path, add a regression test
  before restoring service.
- **Bad deployment:** halt rollout, choose a retained verified image or commit,
  run health/ready checks, then confirm a representative tenant flow. Image
  deletion is never part of the recovery procedure.
- **Data loss/corruption:** stop writes, select an isolated restore target,
  verify timestamp/RPO, restore, validate access boundaries, then plan the
  controlled cutover.
