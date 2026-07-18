import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("online PostgreSQL development tunnel", () => {
  it("compresses large tenant catalog responses over SSH", async () => {
    const source = await readFile(
      path.join(process.cwd(), "scripts", "devOnlinePostgres.ts"),
      "utf-8"
    );
    const tunnelSpawn = source.indexOf('const sshTunnel = spawn("ssh"');
    const compressionFlag = source.indexOf('"-C"', tunnelSpawn);
    const forwardingFlag = source.indexOf('"-L"', tunnelSpawn);

    expect(tunnelSpawn).toBeGreaterThan(-1);
    expect(compressionFlag).toBeGreaterThan(tunnelSpawn);
    expect(compressionFlag).toBeLessThan(forwardingFlag);
  });

  it("requires an explicit local approval before copying production data into dev", async () => {
    const source = await readFile(
      path.join(process.cwd(), "scripts", "devOnlinePostgres.ts"),
      "utf-8"
    );
    expect(source).toContain('process.argv.includes("--snapshot-prod-to-dev")');
    expect(source).toContain('ARCIGY_APPROVE_PRODUCTION_SNAPSHOT !== "true"');
    expect(source).toContain('scripts/dbMigrate.ts", "--schema", "dev", "--app-env", "dev"');
    expect(source).toContain("snapshotProductionToDev(verification)");
    expect(source).toContain("stopTunnel();");
  });
});
