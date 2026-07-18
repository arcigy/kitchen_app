import { gzipSync, gunzipSync } from "node:zlib";
import type http from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { sendStaticAppFile } from "./staticAppResponse";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function createResponseHarness() {
  const headers = new Map<string, string | number | readonly string[]>();
  let endedBody = Buffer.alloc(0);
  const response = {
    getHeader: (name: string) => headers.get(name.toLowerCase()),
    setHeader: (name: string, value: string | number | readonly string[]) => headers.set(name.toLowerCase(), value),
    removeHeader: (name: string) => headers.delete(name.toLowerCase()),
    end: (body?: string | Uint8Array) => {
      endedBody = body == null ? Buffer.alloc(0) : Buffer.from(body);
      return response;
    }
  } as unknown as http.ServerResponse;
  return { response, headers, readBody: () => endedBody };
}

async function createFixture(): Promise<{ filePath: string; source: Buffer; compressed: Buffer }> {
  const root = await mkdtemp(path.join(os.tmpdir(), "arcigy-static-"));
  tempRoots.push(root);
  const filePath = path.join(root, "app.js");
  const source = Buffer.from("export const project = 'preserved';\n".repeat(500), "utf-8");
  const compressed = gzipSync(source, { level: 9 });
  await writeFile(filePath, source);
  await writeFile(`${filePath}.gz`, compressed);
  return { filePath, source, compressed };
}

describe("static app response", () => {
  it("serves the exact build-time gzip sidecar when the browser accepts gzip", async () => {
    const fixture = await createFixture();
    const { response, headers, readBody } = createResponseHarness();
    const request = { headers: { "accept-encoding": "br, gzip" } } as http.IncomingMessage;

    const source = await sendStaticAppFile(request, response, fixture.filePath, "text/javascript; charset=utf-8");

    expect(source).toBe("precompressed");
    expect(headers.get("content-encoding")).toBe("gzip");
    expect(headers.get("vary")).toContain("Accept-Encoding");
    expect(readBody()).toEqual(fixture.compressed);
    expect(gunzipSync(readBody())).toEqual(fixture.source);
  });

  it("preserves the identity response for clients that disable gzip", async () => {
    const fixture = await createFixture();
    const { response, headers, readBody } = createResponseHarness();
    const request = { headers: { "accept-encoding": "gzip;q=0" } } as http.IncomingMessage;

    const source = await sendStaticAppFile(request, response, fixture.filePath, "text/javascript; charset=utf-8");

    expect(source).toBe("runtime");
    expect(headers.has("content-encoding")).toBe(false);
    expect(readBody()).toEqual(fixture.source);
  });
});
