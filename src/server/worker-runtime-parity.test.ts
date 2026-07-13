import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("runtime and injectable worker parity", () => {
  it("keeps the critical database failure boundary in both worker entrypoints", async () => {
    const files = await Promise.all([
      readFile(path.join(process.cwd(), "server", "workerServer.ts"), "utf-8"),
      readFile(path.join(process.cwd(), "src", "server", "workerServer.ts"), "utf-8")
    ]);

    for (const source of files) {
      expect(source).toContain('url.pathname === "/api/auth/session") return await handleAuthSession');
      expect(source).toContain('url.pathname === "/ready"');
      expect(source).toContain("databaseUnavailableStatus(error)");
      expect(source).toContain('res.setHeader("Retry-After", "2")');
    }
  });
});
