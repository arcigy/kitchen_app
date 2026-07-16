import { spawnSync } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";

type Severity = "info" | "low" | "moderate" | "high" | "critical";

type AuditFinding = {
  packageName: string;
  advisoryId: string;
  severity: "high" | "critical";
  reason: string;
};

export type ProductionAuditEvaluation = {
  accepted: AuditFinding[];
  blocked: AuditFinding[];
};

const ACCEPTED_ADVISORIES = new Set(["xlsx:1108110", "xlsx:1108111"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeSeverity(value: unknown): Severity | null {
  return value === "info" ||
    value === "low" ||
    value === "moderate" ||
    value === "high" ||
    value === "critical"
    ? value
    : null;
}

function isBlockingSeverity(
  value: Severity | null,
): value is "high" | "critical" {
  return value === "high" || value === "critical";
}

export function evaluateProductionDependencyAudit(
  report: unknown,
): ProductionAuditEvaluation {
  if (!isRecord(report) || !isRecord(report.vulnerabilities)) {
    throw new Error("npm audit returned an invalid vulnerabilities payload");
  }

  const accepted: AuditFinding[] = [];
  const blocked: AuditFinding[] = [];

  for (const [packageName, rawVulnerability] of Object.entries(
    report.vulnerabilities,
  )) {
    if (!isRecord(rawVulnerability)) {
      blocked.push({
        packageName,
        advisoryId: "unknown",
        severity: "high",
        reason: "invalid vulnerability record",
      });
      continue;
    }

    const packageSeverity = normalizeSeverity(rawVulnerability.severity);
    if (!isBlockingSeverity(packageSeverity)) continue;

    const via = rawVulnerability.via;
    if (!Array.isArray(via) || via.length === 0) {
      blocked.push({
        packageName,
        advisoryId: "unknown",
        severity: packageSeverity,
        reason: "missing advisory identity",
      });
      continue;
    }

    let identifiedBlockingFinding = false;
    for (const rawVia of via) {
      if (typeof rawVia === "string") {
        identifiedBlockingFinding = true;
        blocked.push({
          packageName,
          advisoryId: `indirect:${rawVia}`,
          severity: packageSeverity,
          reason: "indirect high-risk dependency is not allowlisted",
        });
        continue;
      }
      if (!isRecord(rawVia)) {
        identifiedBlockingFinding = true;
        blocked.push({
          packageName,
          advisoryId: "unknown",
          severity: packageSeverity,
          reason: "invalid advisory record",
        });
        continue;
      }

      const advisorySeverity =
        normalizeSeverity(rawVia.severity) ?? packageSeverity;
      if (!isBlockingSeverity(advisorySeverity)) continue;
      identifiedBlockingFinding = true;
      const advisoryId =
        typeof rawVia.source === "number" || typeof rawVia.source === "string"
          ? String(rawVia.source)
          : "unknown";
      const key = `${packageName}:${advisoryId}`;
      const isAccepted =
        ACCEPTED_ADVISORIES.has(key) &&
        advisorySeverity === "high" &&
        rawVulnerability.isDirect === true &&
        rawVulnerability.fixAvailable === false;

      const finding: AuditFinding = {
        packageName,
        advisoryId,
        severity: advisorySeverity,
        reason: isAccepted
          ? "reviewed export-only xlsx advisory with no available fix"
          : ACCEPTED_ADVISORIES.has(key) &&
              rawVulnerability.fixAvailable !== false
            ? "an accepted advisory now has a remediation and requires review"
            : "high-risk production advisory is not allowlisted",
      };
      (isAccepted ? accepted : blocked).push(finding);
    }

    if (!identifiedBlockingFinding) {
      blocked.push({
        packageName,
        advisoryId: "unknown",
        severity: packageSeverity,
        reason: "high-risk package has no identifiable advisory",
      });
    }
  }

  return { accepted, blocked };
}

function readProductionAudit(): unknown {
  const npmExecPath = process.env.npm_execpath;
  if (!npmExecPath) {
    throw new Error(
      "npm executable path is unavailable; run this policy through npm run security:dependencies",
    );
  }
  const result = spawnSync(
    process.execPath,
    [npmExecPath, "audit", "--omit=dev", "--json"],
    {
      cwd: process.cwd(),
      encoding: "utf-8",
      maxBuffer: 16 * 1024 * 1024,
      windowsHide: true,
    },
  );
  if (result.error) throw result.error;
  if (result.status !== 0 && result.status !== 1) {
    throw new Error(
      `npm audit failed before producing a trustworthy report (exit ${String(result.status)})`,
    );
  }
  if (!result.stdout.trim())
    throw new Error("npm audit returned an empty report");
  try {
    return JSON.parse(result.stdout) as unknown;
  } catch {
    throw new Error("npm audit returned invalid JSON");
  }
}

function main(): void {
  try {
    const evaluation = evaluateProductionDependencyAudit(readProductionAudit());
    if (evaluation.blocked.length > 0) {
      console.error(
        `Production dependency audit failed with ${evaluation.blocked.length} blocking finding(s).`,
      );
      for (const finding of evaluation.blocked) {
        console.error(
          `- ${finding.packageName} advisory ${finding.advisoryId} [${finding.severity}]: ${finding.reason}`,
        );
      }
      process.exitCode = 1;
      return;
    }

    console.log(
      `Production dependency audit passed (${evaluation.accepted.length} explicitly reviewed xlsx advisory exception(s)).`,
    );
  } catch (error) {
    console.error(
      `Production dependency audit could not be verified: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  }
}

const isMain =
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (isMain) main();
