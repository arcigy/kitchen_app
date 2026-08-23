# Incident response

Canonical runbook: `INCIDENT_RESPONSE.md`.

## Immediate sequence

1. Assign an incident owner and preserve request IDs, timestamps and relevant
   tenant identifiers without copying secrets or raw project data.
2. Contain safely: disable the affected integration or revoke the compromised
   credential. Do not delete evidence or customer data as a first response.
3. Determine impact using tenant-aware evidence and independent operator
   access; escalate privacy/legal notification decisions to the controller.
4. Recover via a verified deployment or isolated restore, validate health,
   readiness and tenant boundaries, then obtain explicit cutover approval.
5. Publish a blameless post-incident report and add a regression test for the
   root cause.

Use the detailed playbooks in `INCIDENT_RESPONSE.md` for leaked credentials,
cross-tenant access, bad deployment and data loss/corruption.
