import { describe, expect, it } from "vitest";
import { scanTextForSecrets } from "./scanTrackedSecrets";

describe("tracked secret scanning", () => {
  it("detects credential formats without retaining their values", () => {
    const githubToken = ["ghp_", "A".repeat(36)].join("");
    const privateKeyHeader = ["-----BEGIN ", "PRIVATE KEY-----"].join("");
    const connectionString = ["postgresql://user:", "V3ryLongDatabasePassword!", "@db.example/app"].join("");
    const source = [
      `const token = "${githubToken}";`,
      privateKeyHeader,
      `DATABASE_URL=${connectionString}`
    ].join("\n");

    const findings = scanTextForSecrets("example.ts", source);

    expect(findings.map((finding) => finding.ruleId)).toEqual(expect.arrayContaining([
      "github-token",
      "private-key",
      "connection-string-credential"
    ]));
    expect(JSON.stringify(findings)).not.toContain(githubToken);
    expect(JSON.stringify(findings)).not.toContain("V3ryLongDatabasePassword!");
  });

  it("detects long literal secrets assigned to sensitive names", () => {
    const literal = ["Q7", "x9".repeat(16), "Z3"].join("");

    expect(scanTextForSecrets("config.ts", `client_secret = "${literal}"`)).toEqual([
      { filePath: "config.ts", line: 1, ruleId: "generic-secret-assignment" }
    ]);
  });

  it("allows explicit placeholders and reviewed fixture markers", () => {
    const fixture = ["ghp_", "B".repeat(36)].join("");
    const source = [
      "client_secret=replace_me_with_real_secret",
      `const fixture = "${fixture}"; // secret-scan: allow synthetic format regression`
    ].join("\n");

    expect(scanTextForSecrets("fixture.ts", source)).toEqual([]);
  });
});
