import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  resolveCapRoverDeployExpectation,
  validateCapRoverDeployPreflight,
  type CapRoverDeployExpectation
} from "./validateCapRoverDeployPreflight";

const expected: CapRoverDeployExpectation = {
  appName: "arcigy-kitchen-develop",
  appEnv: "dev",
  databaseSchema: "dev",
  objectStoragePrefix: "dev",
  storageContainerPath: "/app/storage",
  publicUrl: "https://arcigy-kitchen-develop.example.test/"
};

function validPayload(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      rootDomain: "example.test",
      appDefinitions: [{
        appName: expected.appName,
        hasPersistentData: true,
        instanceCount: 1,
        serviceUpdateOverride: "",
        customDomain: [],
        volumes: [{ containerPath: "/app/storage/", volumeName: "arcigy-kitchen-develop-storage", mode: "rw" }],
        envVars: [
          { key: "APP_ENV", value: "dev" },
          { key: "DATABASE_SCHEMA", value: "dev" },
          { key: "ARCIGY_OBJECT_STORAGE_PREFIX", value: "dev" },
          { key: "KITCHEN_PROJECT_STORAGE", value: "postgres" },
          { key: "DATABASE_URL", value: "postgresql://user:very-secret@example/db" }
        ],
        ...overrides
      }]
    }
  };
}

describe("CapRover deployment preflight", () => {
  it("accepts an isolated develop app with one durable storage mount", () => {
    expect(validateCapRoverDeployPreflight(validPayload(), expected)).toEqual({
      appName: expected.appName,
      appEnv: "dev",
      databaseSchema: "dev",
      objectStoragePrefix: "dev",
      storageContainerPath: "/app/storage",
      publicHost: "arcigy-kitchen-develop.example.test",
      instanceCount: 1
    });
  });

  it("refuses to create a missing deployment target implicitly", () => {
    expect(() => validateCapRoverDeployPreflight({ data: { rootDomain: "example.test", appDefinitions: [] } }, expected))
      .toThrow("automatic creation is disabled");
  });

  it("rejects develop cross-wired to the production namespace", () => {
    const payload = validPayload({
      envVars: [
        { key: "APP_ENV", value: "prod" },
        { key: "DATABASE_SCHEMA", value: "prod" },
        { key: "ARCIGY_OBJECT_STORAGE_PREFIX", value: "prod" },
        { key: "KITCHEN_PROJECT_STORAGE", value: "postgres" },
        { key: "DATABASE_URL", value: "postgresql://user:very-secret@example/db" }
      ]
    });
    expect(() => validateCapRoverDeployPreflight(payload, expected)).toThrow("APP_ENV");
  });

  it("rejects ephemeral, missing, read-only, and unprovable storage", () => {
    expect(() => validateCapRoverDeployPreflight(validPayload({ hasPersistentData: false }), expected)).toThrow("not marked as persistent");
    expect(() => validateCapRoverDeployPreflight(validPayload({ volumes: [] }), expected)).toThrow("no persistent mount");
    expect(() => validateCapRoverDeployPreflight(validPayload({
      volumes: [{ containerPath: "/app/storage", volumeName: "storage", mode: "ro" }]
    }), expected)).toThrow("read-only");
    expect(() => validateCapRoverDeployPreflight(validPayload({
      serviceUpdateOverride: "services:\n  app:\n    volumes:\n      - other:/app/storage"
    }), expected)).toThrow("cannot be proven safely");
  });

  it("requires one replica while runtime files use a local persistent volume", () => {
    expect(() => validateCapRoverDeployPreflight(validPayload({ instanceCount: 2 }), expected)).toThrow("exactly one");
  });

  it("binds post-deploy health checks to the selected app origin", () => {
    expect(() => validateCapRoverDeployPreflight(validPayload(), {
      ...expected,
      publicUrl: "https://unrelated.example.test/"
    })).toThrow("does not belong");
    expect(validateCapRoverDeployPreflight(validPayload({
      customDomain: [{ publicDomain: "develop.arcigy.test", hasSsl: true }]
    }), {
      ...expected,
      publicUrl: "https://develop.arcigy.test/"
    }).publicHost).toBe("develop.arcigy.test");
  });

  it("never includes a database credential in validation errors", () => {
    const payload = validPayload({ volumes: [] });
    try {
      validateCapRoverDeployPreflight(payload, expected);
      throw new Error("expected validation to fail");
    } catch (error) {
      expect(String(error)).not.toContain("very-secret");
    }
  });

  it("defaults the develop workflow expectation without reading secrets", () => {
    expect(resolveCapRoverDeployExpectation({
      CAPROVER_APP_URL: expected.publicUrl
    })).toEqual(expected);
  });

  it("wires the preflight before deploy and fails on missing readiness evidence", async () => {
    const workflow = await readFile(path.join(process.cwd(), ".github", "workflows", "deploy-caprover.yml"), "utf-8");
    const preflight = workflow.indexOf("scripts/validateCapRoverDeployPreflight.ts");
    const deploy = workflow.indexOf("name: Deploy\n");

    expect(preflight).toBeGreaterThan(-1);
    expect(deploy).toBeGreaterThan(preflight);
    expect(workflow).not.toContain("/user/apps/appDefinitions/register");
    expect(workflow).toContain("CAPROVER_APP_URL is required");
    expect(workflow).toContain("steps.readiness.outcome != 'success'");
    expect(workflow).toContain("actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5");
    expect(workflow).toContain("actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020");
    expect(workflow).toContain("npm run security:dependencies");
    expect(workflow).not.toContain("npm audit --omit=dev --audit-level=critical");
    expect(workflow).not.toMatch(/uses:\s+actions\/(?:checkout|setup-node)@v\d+/);
  });

  it("runs CI for pull requests and direct protected-branch updates", async () => {
    const workflow = await readFile(path.join(process.cwd(), ".github", "workflows", "ci.yml"), "utf-8");

    expect(workflow).toContain("pull_request:");
    expect(workflow).toContain("push:");
    expect(workflow).toMatch(/push:\s+branches:\s+- develop\s+- main/m);
    expect(workflow).toContain("npm run security:secrets");
    expect(workflow).toContain("npm run security:dependencies");
    expect(workflow).toContain("name: PostgreSQL backup and restore drill");
    expect(workflow).toContain('ARCIGY_RESTORE_DRILL_ISOLATED: "true"');
    expect(workflow).toContain("npm run test:db-restore-drill");
    expect(workflow).not.toContain("npm audit --omit=dev --audit-level=critical");
    expect(workflow).toContain("actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5");
    expect(workflow).toContain("actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020");
    expect(workflow).toContain("github/codeql-action/init@02c5e83432fe5497fd85b873b6c9f16a8578e1d9");
    expect(workflow).toContain("github/codeql-action/analyze@02c5e83432fe5497fd85b873b6c9f16a8578e1d9");
    expect(workflow).toContain("actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02");
    expect(workflow).toContain("security-events: write");
    expect(workflow).toContain("npm sbom --omit=dev --sbom-format=cyclonedx > sbom.cdx.json");
    expect(workflow).toContain("if-no-files-found: error");
    expect(workflow).toContain("npx playwright install --with-deps chromium");
    expect(workflow).toContain("KITCHEN_PROJECT_STORAGE: file");
    expect(workflow).toContain("APP_ENV: dev");
    expect(workflow).toContain("DATABASE_SCHEMA: dev");
    expect(workflow).toContain("ARCIGY_OBJECT_STORAGE_PREFIX: dev");
    expect(workflow).toContain("setsid node node_modules/tsx/dist/cli.mjs scripts/devLocal.ts");
    expect(workflow).toContain("curl --fail --silent --show-error http://127.0.0.1:5180/ready");
    expect(workflow).toContain("npm run test:ui-regression");
    expect(workflow).toContain("name: Stop isolated UI runtime\n        if: always()");
    expect(workflow).toContain('kill -TERM -- "-${ARCIGY_UI_PID}"');
    expect(workflow).toContain("name: Upload failed UI runtime log\n        if: failure()");
    expect(workflow).not.toContain("KITCHEN_PROJECT_STORAGE: postgres");
    expect(workflow).not.toContain("DATABASE_URL:");
    expect(workflow).not.toMatch(/uses:\s+actions\/(?:checkout|setup-node)@v\d+/);
    expect(workflow).not.toMatch(/uses:\s+actions\/upload-artifact@v\d+/);
    expect(workflow).not.toMatch(/uses:\s+github\/codeql-action\/[^@]+@v\d+/);
  });

  it("opens bounded reviewed dependency updates against develop", async () => {
    const config = await readFile(path.join(process.cwd(), ".github", "dependabot.yml"), "utf-8");

    expect(config).toMatch(/^version:\s*2/m);
    expect(config).toMatch(/package-ecosystem:\s*npm/);
    expect(config).toMatch(/package-ecosystem:\s*github-actions/);
    expect(config.match(/target-branch:\s*develop/g)).toHaveLength(2);
    expect(config.match(/interval:\s*weekly/g)).toHaveLength(2);
    expect(config).toContain("timezone: Europe/Bratislava");
    expect(config).toContain("open-pull-requests-limit: 5");
    expect(config).toContain("open-pull-requests-limit: 3");
    expect(config).toContain("dependency-type: production");
    expect(config).toContain("dependency-type: development");
    expect(config).toContain("versioning-strategy: increase-if-necessary");
    expect(config).not.toMatch(/auto-?merge/i);
  });

  it("keeps dependency diff review opt-in until GitHub Dependency graph is enabled", async () => {
    const workflow = await readFile(path.join(process.cwd(), ".github", "workflows", "ci.yml"), "utf-8");

    expect(workflow).toContain("name: Review dependency changes");
    expect(workflow).toContain(
      "if: github.event_name == 'pull_request' && vars.ARCIGY_DEPENDENCY_GRAPH_ENABLED == 'true'",
    );
    expect(workflow).toContain(
      "actions/dependency-review-action@a1d282b36b6f3519aa1f3fc636f609c47dddb294",
    );
    expect(workflow).toContain("fail-on-severity: high");
    expect(workflow).toContain("fail-on-scopes: runtime, development, unknown");
    expect(workflow).toContain("warn-only: false");
    expect(workflow).toContain("comment-summary-in-pr: never");
    expect(workflow).not.toContain("pull-requests: write");
    expect(workflow).not.toMatch(/uses:\s+actions\/dependency-review-action@v\d+/);
  });
});
