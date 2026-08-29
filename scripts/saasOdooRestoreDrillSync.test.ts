import { describe, expect, it } from "vitest";
import { buildRestoreOperationalPayload, parseRestoreDrillOutput } from "./saasOdooRestoreDrillSync";

const evidence = {
  event: "arcigy_postgres_restore_drill",
  outcome: "passed",
  runtime: "portable",
  postgresVersion: "postgres (PostgreSQL) 16.14",
  backupSha256: "a".repeat(64),
  migrationCount: 4,
  tableCount: 24,
  rowCount: 32,
  constraintCount: 49,
  indexCount: 45,
  achievedRpoSeconds: 0,
  achievedRtoSeconds: 1.694
};

describe("Odoo restore-drill evidence sync", () => {
  it("parses only a passed bounded restore evidence line", () => {
    expect(parseRestoreDrillOutput(`progress\n${JSON.stringify(evidence)}\n`)).toMatchObject({
      outcome: "passed",
      backupSha256: "a".repeat(64),
      achievedRtoSeconds: 1.694
    });
    expect(() => parseRestoreDrillOutput(JSON.stringify({ ...evidence, outcome: "failed" }))).toThrow(/did not emit/);
    expect(() => parseRestoreDrillOutput(JSON.stringify({ ...evidence, backupSha256: "bad" }))).toThrow(/SHA-256/);
  });

  it("always classifies the synthetic drill as Develop and not Main", () => {
    const parsed = parseRestoreDrillOutput(JSON.stringify(evidence));
    const payload = buildRestoreOperationalPayload(parsed, "2026-07-16T12:00:00.000Z");
    expect(payload.payload.environment).toBe("develop");
    expect(payload.payload.items[0]).toMatchObject({
      external_key: `develop:synthetic-restore:${"a".repeat(64)}`,
      checksum_valid: true,
      application_smoke_passed: false,
      tenant_isolation_passed: true
    });
  });
});
