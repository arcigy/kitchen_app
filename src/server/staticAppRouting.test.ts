import http from "node:http";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { shouldServeSpaIndex, staticCacheControl, streamStaticFile } from "./staticAppRouting";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("static app routing", () => {
  it("returns a real missing-asset response instead of HTML for removed build chunks", () => {
    expect(shouldServeSpaIndex("/assets/app-old.js")).toBe(false);
    expect(shouldServeSpaIndex("/assets/styles-old.css")).toBe(false);
    expect(shouldServeSpaIndex("/manifest.webmanifest")).toBe(false);
  });

  it("keeps extensionless application routes on the SPA index", () => {
    expect(shouldServeSpaIndex("/material-proof")).toBe(true);
    expect(shouldServeSpaIndex("/projects/example")).toBe(true);
  });

  it("never stores HTML while keeping hashed assets immutable", () => {
    expect(staticCacheControl("/app/dist/index.html")).toBe("no-store");
    expect(staticCacheControl("/app/dist/assets/app-D8k3mP2q.js")).toBe("public, max-age=31536000, immutable");
    expect(staticCacheControl("/app/dist/assets/app-current.js")).toBe("public, max-age=0, must-revalidate");
    expect(staticCacheControl("/app/public/sw.js")).toBe("public, max-age=0, must-revalidate");
  });

  it("streams a large JavaScript asset without truncating its response", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "arcigy-static-"));
    tempRoots.push(root);
    const filePath = path.join(root, "app-large.js");
    const body = Buffer.alloc(2_500_000, "a");
    await writeFile(filePath, body);

    const server = http.createServer((req, res) => {
      void streamStaticFile(req, res, filePath, "text/javascript; charset=utf-8");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Static test server did not bind a TCP port.");

    try {
      const response = await fetch(`http://127.0.0.1:${address.port}/assets/app-large.js`);
      const received = Buffer.from(await response.arrayBuffer());
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toBe("text/javascript; charset=utf-8");
      expect(response.headers.get("content-length")).toBe(String(body.length));
      expect(received.length).toBe(body.length);
      expect(received.equals(body)).toBe(true);
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });

  it("supports ETag revalidation without streaming the body again", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "arcigy-static-etag-"));
    tempRoots.push(root);
    const filePath = path.join(root, "app-current.js");
    await writeFile(filePath, "console.log('current');");
    const server = http.createServer((req, res) => {
      void streamStaticFile(req, res, filePath, "text/javascript; charset=utf-8");
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Static test server did not bind a TCP port.");
    try {
      const first = await fetch(`http://127.0.0.1:${address.port}/assets/app-current.js`);
      const etag = first.headers.get("etag");
      expect(etag).toBeTruthy();
      const second = await fetch(`http://127.0.0.1:${address.port}/assets/app-current.js`, {
        headers: { "If-None-Match": etag! }
      });
      expect(second.status).toBe(304);
      expect(await second.text()).toBe("");
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });
});
