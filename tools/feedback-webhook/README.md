# Arcigy feedback events

This implementation captures new complete Odoo reports and delivers identifiers
through a durable local webhook, server spool, outbound SSH tunnel and Mac inbox.
Transport retries, SSE keepalives and inbox recovery do not invoke an LLM.
The existing Codex heartbeat stays paused.

Automatic native execution is **inactive**. The desktop's shared live control
transport has not been proven. An independent `codex app-server --listen stdio://`
can read saved desktop history but returned `notLoaded` while the desktop master
was active. It must never resume that master or another desktop task. The
production daemon therefore constructs `AppServerAdapter` without a verifier.
No configuration boolean enables wake. A supported shared runtime integration
and an authorized native fixture E2E must supply the verifier before activation.
Fake-runtime tests prove dispatch guards; they do not prove desktop wake.

## Components

- Odoo `models/webhook_outbox.py` captures a `received` event in the same
  transaction, after attachment validation. A post-commit attempt and a
  deterministic cron retry send its immutable body through a Unix socket.
- `server.py` verifies HMAC over signing time and exact bytes, enforces source,
  tenant, project and cutover allowlists, and commits SQLite before acknowledging.
  It binds SSE/ACK only to `127.0.0.1`. The notification endpoint exists only on
  the Unix socket. No public port or endpoint is required.
- `feedback_daemon.py` opens an outbound SSH tunnel, stores exact bytes before
  ACK, rereads source authority, and registers one coordinator task per report.
  The native runtime gate runs before claim, model selection or wake.
- `feedback_authorization.py` evaluates a concrete paths/operations manifest
  against a human-granted policy. The decision records the current plan hash and
  policy hash. It never fabricates human approval of future plans. Revocation
  blocks new work and records that an active native turn still needs stopping.

## Deployment preparation, not an installation command

Deployment requires a separate instruction. Nothing here is installed or enabled
by importing the code or committing it. Preserve the deployed backup and review
the baseline/implementation SHA before deploying the addon, connector and
coordinator together. Do not update the plugin cache instead of its source.

1. Create a dedicated receiver account and a persistent private directory for
   SQLite. Provision two private key-ring files containing the same key bytes,
   one owned by the receiver and one owned by the Odoo container UID. Keep each
   file mode 0600. Credentials never belong in this repository.
2. Review `deploy/arcigy-feedback-webhook.service` and `receiver.example.json`.
   Mount the **socket directory**, not the socket inode, into Odoo at
   `/run/arcigy-feedback-webhook`. Grant only the required shared socket group.
   Mount the private signer directory read-only at
   `/etc/arcigy-feedback-webhook`, containing `signing-keys.json`.
   Receiver keys live separately. Container UID/GID and mount permissions must
   be checked on the actual host before restart. No existing container is
   recreated by this repository.
3. Upgrade the addon in an isolated fixture first, then through the approved
   Odoo deployment procedure. `data/webhook.xml` installs one disabled cutover
   row. Activation and received events lock this row with `FOR UPDATE` and read
   it directly, avoiding stale worker-local parameter caches. PostgreSQL retries
   a stale concurrent transaction rather than silently missing cutover.
4. Install matching coordinator and connector source commits. On the Mac, review
   the LaunchAgent template, private config and SSH forwarding account. Use
   `StrictHostKeyChecking=yes`; the remote account should permit only forwarding
   to the receiver's loopback port, without a shell or unrelated forwarding.
   No app-server port is forwarded or exposed.
5. Provision a stream token of at least 32 random characters. Receiver and Mac
   private JSON files must be owned regular mode-0600 files. Do not use example
   files directly. Configure exact source/tenant/project/epoch tuples on both
   sides. Capture must be enabled before dispatch to retain activation backlog.
6. An Odoo manager may call `arcigy_activate_webhook(source_id, epoch, key_id)`.
   This is an explicit deployment/data configuration action, not performed by
   this change. Epoch/source are immutable after initial activation. The observed
   historical cursor 158 is not a cutover watermark and does not trigger backfill.
   `arcigy_deactivate_webhook()` stops new capture; already committed outbox rows
   remain deliverable. Imported/historical reports never enter the live outbox.
7. Grant a bounded standing policy only with actual human evidence using
   `coordinator.py grant-feedback-policy --file POLICY --evidence-file EVIDENCE`.
   Policies expire, cannot be edited in place, and allow only edit/test/commit
   within named application paths. Automation infrastructure, private files,
   deploy and data migrations always need explicit human approval.
   Planning saves `--scope-file` with `paths` and `operations`; out-of-scope plans
   remain awaiting approval. `revoke-feedback-policy --policy ID --reason TEXT`
   invalidates pending approvals. Active native turns require observed stopping.
8. Prove a supported shared native control connection and exact thread activity.
   After model policy selection, an authorized synthetic native turn must prove
   one notification produces one correct task, worktree and model/effort. Until
   then only transport/inbox/task registration can be enabled. Do not substitute
   a standalone CLI worker or an independent app-server without a contract change.

## Recovery and limits

The server replays all unacknowledged deliveries, including holes. The Mac ACKs
only after local SQLite commit. Unacknowledged bodies never expire. A 100,000-row
or 1 GiB pending limit returns an error and leaves the source outbox pending.
Acknowledged bodies can be collected after 90 days; identifiers and checksums
remain indefinitely. Same identity with different bytes goes to quarantine.
Backups must include the SQLite database and WAL consistently.

The systemd unit preserves the socket directory across stops and restarts so
Odoo's directory mount remains valid. A lifetime file lock prevents two
receivers from owning it. Startup replaces only an owned socket that no longer
accepts connections, recovering after a crash without removing a live listener
or an unrelated file.

On macOS, a LaunchAgent may need permission to access a coordinator located in
Documents. A foreground test launched by Codex does not prove that permission.
Check the actual LaunchAgent error log and verify its startup independently.

A crash after `turn/start` can leave an unknown result. Persisted prepared/sending
dispatches are never resent automatically. Reconcile the dispatch marker with
the exact shared native thread. A missing or ambiguous result needs review.
Never use a JSON-RPC request ID as a runtime idempotency guarantee.

For key rotation, first provision old and new receiver keys and restart the
receiver safely, then add the new signer key and change the active key ID using
the same source/epoch activation. Keep the old verification key during the
overlap. Each retry uses a fresh signing timestamp; event occurrence time and
body stay unchanged. Remove the old key only after pending retries are covered.

## Verification

`python3 -m unittest discover -s tools/feedback-webhook -p 'test_*.py'` exercises
real local sockets, signing, spool, SSE, offline delivery, inbox commit and ACK.
`python3 -m unittest discover -s .codex-orchestrator -p 'test_*.py'` covers the
coordinator, policy, planner and fake native runtime gates, without LLM calls.
Odoo integration tests live in `odoo-addons/arcigy_feedback/tests` and run only
in a disposable Odoo 19/PostgreSQL fixture. Never point them at customer data.

The manual founder path is a synthetic new complete report, Mac disconnected,
reconnection, one registered task, duplicate delivery and policy revocation.
Native automatic repair remains unverified until the shared-runtime fixture
test passes. Required application checks and exact-SHA evidence are recorded
in ARC-003's coordinator artifacts, including failures or checks not run.
