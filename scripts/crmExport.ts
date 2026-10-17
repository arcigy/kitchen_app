/**
 * Manual CRM export (docs/CRM_CLIENT_METRICS.md).
 *
 *   npm run crm:export -- --dry-run --from 2026-10-01 --to 2026-10-16   # print the batch JSON
 *   npm run crm:export -- --from 2026-09-01 --to 2026-10-16             # store and deliver a backfill
 *   npm run crm:export                                                  # one scheduler tick now
 */
import { addDays, localDate } from "../src/core/crm-export/crm-export-aggregation";
import { resolveCrmExportConfig } from "../src/core/crm-export/crm-export-config";
import { createPostgresCrmExportOutbox, createPostgresCrmExportSource } from "../src/core/crm-export/crm-export-postgres";
import { buildCrmBatch } from "../src/core/crm-export/crm-export-runner";
import { payloadSha256 } from "../src/core/crm-export/crm-export-aggregation";
import { resolveDatabaseConfig } from "../src/core/database/database-config";
import { runLockedCrmExport } from "../src/server/crmExportScheduler";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const config = resolveCrmExportConfig(process.env);
if (!config) throw new Error("Set ARCIGY_CRM_EXPORT_ENABLED=true and the ARCIGY_CRM_* variables.");
const database = resolveDatabaseConfig();
if (!database) throw new Error("The CRM export needs the PostgreSQL project database.");

const from = argument("--from");
const to = argument("--to");
const dryRun = process.argv.includes("--dry-run");
const now = new Date();

if (!from && !to && !dryRun) {
  console.log(JSON.stringify(await runLockedCrmExport(config, now) ?? { skipped: "another export holds the lock" }, null, 2));
  process.exit(0);
}

const dateTo = to ?? addDays(localDate(now.toISOString()), -1);
const dateFrom = from ?? addDays(dateTo, -6);
if (!DATE_RE.test(dateFrom) || !DATE_RE.test(dateTo) || dateFrom > dateTo) throw new Error("--from/--to must be YYYY-MM-DD with from <= to.");
if (addDays(dateFrom, 400) < dateTo) throw new Error("A single batch covers at most 400 days.");

const payload = await buildCrmBatch({
  environment: config.environment,
  clientKeys: config.clientKeys,
  source: createPostgresCrmExportSource(database)
}, dateFrom, dateTo, now);

if (dryRun) {
  console.log(JSON.stringify(payload, null, 2));
  process.exit(0);
}
await createPostgresCrmExportOutbox(database).store(payload, payloadSha256(payload));
console.log(`[crm:export] stored ${payload.batch_id}; delivering pending batches`);
console.log(JSON.stringify(await runLockedCrmExport(config, now), null, 2));
process.exit(0);
