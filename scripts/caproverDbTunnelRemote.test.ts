import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("CapRover database tunnel", () => {
  it("uses the timeout only for authentication and keeps verified pool sockets alive", async () => {
    const source = await readFile(
      path.join(process.cwd(), "scripts", "caproverDbTunnelRemote.mjs"),
      "utf-8"
    );
    const tokenCheck = source.indexOf('header !== `TOKEN ${token}`');
    const clearAuthenticationTimeout = source.indexOf("client.setTimeout(0)");
    const connectToDatabase = source.indexOf("const db = net.connect", clearAuthenticationTimeout);

    expect(tokenCheck).toBeGreaterThan(-1);
    expect(clearAuthenticationTimeout).toBeGreaterThan(tokenCheck);
    expect(connectToDatabase).toBeGreaterThan(clearAuthenticationTimeout);
    expect(source).toContain("client.setKeepAlive(true, 10_000)");
    expect(source).toContain("db.setKeepAlive(true, 10_000)");
  });
});
