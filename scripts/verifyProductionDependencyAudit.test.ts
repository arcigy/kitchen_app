import { describe, expect, it } from "vitest";
import { evaluateProductionDependencyAudit } from "./verifyProductionDependencyAudit";

function report(vulnerabilities: Record<string, unknown>) {
  return { vulnerabilities };
}

function xlsxVulnerability(overrides: Record<string, unknown> = {}) {
  return {
    name: "xlsx",
    severity: "high",
    isDirect: true,
    fixAvailable: false,
    via: [
      { source: 1108110, severity: "high" },
      { source: 1108111, severity: "high" },
    ],
    ...overrides,
  };
}

describe("production dependency audit policy", () => {
  it("accepts only the two reviewed direct xlsx advisories while no fix exists", () => {
    const result = evaluateProductionDependencyAudit(
      report({ xlsx: xlsxVulnerability() }),
    );

    expect(result.blocked).toEqual([]);
    expect(result.accepted.map((finding) => finding.advisoryId)).toEqual([
      "1108110",
      "1108111",
    ]);
  });

  it("blocks every other high or critical production advisory", () => {
    const result = evaluateProductionDependencyAudit(
      report({
        xlsx: xlsxVulnerability(),
        unsafe: {
          severity: "critical",
          isDirect: false,
          fixAvailable: true,
          via: [{ source: 9999999, severity: "critical" }],
        },
      }),
    );

    expect(result.blocked).toEqual([
      expect.objectContaining({
        packageName: "unsafe",
        advisoryId: "9999999",
        severity: "critical",
      }),
    ]);
  });

  it("requires review as soon as an accepted xlsx advisory gets a fix", () => {
    const result = evaluateProductionDependencyAudit(
      report({
        xlsx: xlsxVulnerability({
          fixAvailable: {
            name: "xlsx",
            version: "0.20.2",
            isSemVerMajor: true,
          },
        }),
      }),
    );

    expect(result.accepted).toEqual([]);
    expect(result.blocked).toHaveLength(2);
    expect(
      result.blocked.every((finding) => finding.reason.includes("remediation")),
    ).toBe(true);
  });

  it("fails closed for unidentified or malformed high-risk records", () => {
    expect(
      evaluateProductionDependencyAudit(
        report({ indirect: { severity: "high", via: ["root-package"] } }),
      ).blocked,
    ).toEqual([
      expect.objectContaining({ advisoryId: "indirect:root-package" }),
    ]);
    expect(() => evaluateProductionDependencyAudit({ metadata: {} })).toThrow(
      "invalid vulnerabilities payload",
    );
  });
});
