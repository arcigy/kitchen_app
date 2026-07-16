import { spawnSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { fetchExternalText } from "../src/server/external-http";

export type RestoreDrillResult = {
  event: "arcigy_postgres_restore_drill";
  outcome: "passed";
  runtime: "portable" | "docker";
  postgresVersion: string;
  backupSha256: string;
  migrationCount: number;
  tableCount: number;
  rowCount: number;
  constraintCount: number;
  indexCount: number;
  achievedRpoSeconds: number;
  achievedRtoSeconds: number;
};

function finiteNonNegative(value: unknown, field: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${field} must be a finite non-negative number.`);
  }
  return value;
}

export function parseRestoreDrillOutput(output: string): RestoreDrillResult {
  const candidates = output.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.startsWith("{"));
  for (const candidate of candidates.reverse()) {
    let value: unknown;
    try {
      value = JSON.parse(candidate) as unknown;
    } catch {
      continue;
    }
    if (!value || typeof value !== "object") continue;
    const record = value as Record<string, unknown>;
    if (record.event !== "arcigy_postgres_restore_drill" || record.outcome !== "passed") continue;
    if (record.runtime !== "portable" && record.runtime !== "docker") {
      throw new Error("Restore drill runtime is invalid.");
    }
    if (typeof record.postgresVersion !== "string" || record.postgresVersion.length > 200) {
      throw new Error("Restore drill PostgreSQL version is invalid.");
    }
    if (typeof record.backupSha256 !== "string" || !/^[a-f0-9]{64}$/i.test(record.backupSha256)) {
      throw new Error("Restore drill backup SHA-256 is invalid.");
    }
    return {
      event: record.event,
      outcome: record.outcome,
      runtime: record.runtime,
      postgresVersion: record.postgresVersion,
      backupSha256: record.backupSha256.toLowerCase(),
      migrationCount: finiteNonNegative(record.migrationCount, "migrationCount"),
      tableCount: finiteNonNegative(record.tableCount, "tableCount"),
      rowCount: finiteNonNegative(record.rowCount, "rowCount"),
      constraintCount: finiteNonNegative(record.constraintCount, "constraintCount"),
      indexCount: finiteNonNegative(record.indexCount, "indexCount"),
      achievedRpoSeconds: finiteNonNegative(record.achievedRpoSeconds, "achievedRpoSeconds"),
      achievedRtoSeconds: finiteNonNegative(record.achievedRtoSeconds, "achievedRtoSeconds")
    };
  }
  throw new Error("Portable restore drill did not emit a passed evidence record.");
}

function requiredEnv(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function secureBaseUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) {
    throw new Error("ARCIGY_ODOO_URL must use HTTPS except on loopback.");
  }
  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

export function buildRestoreOperationalPayload(result: RestoreDrillResult, measuredAt: string) {
  const finishedAt = new Date(measuredAt);
  if (!Number.isFinite(finishedAt.getTime())) throw new Error("measuredAt must be an ISO timestamp.");
  const startedAt = new Date(finishedAt.getTime() - result.achievedRtoSeconds * 1000).toISOString();
  return {
    payload: {
      // This drill is synthetic and must never be represented as a Main/prod backup restore.
      environment: "develop" as const,
      source_updated_at: measuredAt,
      items: [{
        external_key: `develop:synthetic-restore:${result.backupSha256}`,
        name: `Synthetic Arcigy PostgreSQL restore (${result.runtime})`,
        started_at: startedAt,
        finished_at: measuredAt,
        status: "success",
        actual_rpo_seconds: result.achievedRpoSeconds,
        actual_rto_seconds: result.achievedRtoSeconds,
        checksum_valid: true,
        application_smoke_passed: false,
        tenant_isolation_passed: true
      }]
    }
  };
}

export async function runRestoreDrillAndSync(env: NodeJS.ProcessEnv = process.env) {
  const tsxCli = path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
  const childEnv = { ...env };
  delete childEnv.ARCIGY_ODOO_URL;
  delete childEnv.ARCIGY_ODOO_DATABASE;
  delete childEnv.ARCIGY_ODOO_API_KEY;
  const result = spawnSync(
    process.execPath,
    [tsxCli, "scripts/runPortablePostgresRestoreDrill.ts"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
      env: childEnv,
      windowsHide: true,
      timeout: 15 * 60_000,
      maxBuffer: 10 * 1024 * 1024
    }
  );
  if (result.error) throw new Error(`Restore drill could not run: ${result.error.message}`);
  if (result.status !== 0) throw new Error("Restore drill failed; Odoo evidence was not written.");
  const evidence = parseRestoreDrillOutput(result.stdout);
  const odooUrl = secureBaseUrl(requiredEnv(env, "ARCIGY_ODOO_URL"));
  const headers: Record<string, string> = {
    Authorization: `Bearer ${requiredEnv(env, "ARCIGY_ODOO_API_KEY")}`,
    "Content-Type": "application/json; charset=utf-8",
    "User-Agent": "Arcigy-Restore-Drill-Sync/1.0"
  };
  const database = env.ARCIGY_ODOO_DATABASE?.trim();
  if (database) headers["X-Odoo-Database"] = database;
  const { response, text } = await fetchExternalText(
    `${odooUrl}/json/2/saas.restore.test/ingest_operational_batch`,
    { method: "POST", headers, body: JSON.stringify(buildRestoreOperationalPayload(evidence, new Date().toISOString())) },
    { timeoutMs: 15_000, maxBytes: 1024 * 1024 }
  );
  if (!response.ok) throw new Error(`Odoo restore evidence ingest returned ${response.status}: ${text.slice(0, 500)}`);
  return { evidence, odoo: JSON.parse(text) as unknown };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await runRestoreDrillAndSync();
  console.log(JSON.stringify({ ok: true, result }, null, 2));
}
