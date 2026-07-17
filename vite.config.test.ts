import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { afterEach, describe, expect, it } from "vitest";
import {
  APP_CHUNK_WARNING_LIMIT_KB,
  createPrecompressedBuildAsset,
  PRECOMPRESSED_ASSET_MIN_BYTES,
  resolveManualChunk,
  writePrecompressedBuildAssets
} from "./vite.config";

const tempRoots: string[] = [];

afterEach(async () => {
  await Promise.all(tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("Vite chunk ownership", () => {
  it("keeps application modules under Rollup ownership to avoid circular feature chunks", () => {
    expect(resolveManualChunk("C:/repo/src/core/catalog/catalog-service.ts")).toBeUndefined();
    expect(resolveManualChunk("C:/repo/src/modules/runtime/runtime.ts")).toBeUndefined();
    expect(resolveManualChunk("C:/repo/src/ui/project/projectManager.ts")).toBeUndefined();
  });

  it("still isolates stable heavyweight vendor packages", () => {
    expect(resolveManualChunk("C:/repo/node_modules/three/build/three.module.js")).toBe("vendor-three");
    expect(resolveManualChunk("C:/repo/node_modules/pdf-lib/es/index.js")).toBe("vendor-pdf");
    expect(resolveManualChunk("C:/repo/node_modules/xlsx/xlsx.mjs")).toBe("vendor-xlsx");
  });

  it("keeps the editor bundle under an explicit audited size budget", () => {
    expect(APP_CHUNK_WARNING_LIMIT_KB).toBe(2100);
  });

  it("precompresses large textual build assets without changing their bytes", () => {
    const source = "export const arcigy = 'kitchen';\n".repeat(500);
    const compressed = createPrecompressedBuildAsset("assets/app.js", source);

    expect(compressed).not.toBeNull();
    expect(compressed!.byteLength).toBeLessThan(Buffer.byteLength(source));
    expect(gunzipSync(compressed!).toString("utf-8")).toBe(source);
    expect(createPrecompressedBuildAsset("assets/pdf.worker.mjs", source)).not.toBeNull();
  });

  it("does not create gzip sidecars for small or already-compressed assets", () => {
    expect(createPrecompressedBuildAsset("assets/small.js", "x".repeat(PRECOMPRESSED_ASSET_MIN_BYTES - 1))).toBeNull();
    expect(createPrecompressedBuildAsset("assets/material.webp", new Uint8Array(PRECOMPRESSED_ASSET_MIN_BYTES * 2))).toBeNull();
  });

  it("writes sidecars from the final on-disk build bytes", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "arcigy-vite-gzip-"));
    tempRoots.push(root);
    const assetDir = path.join(root, "assets");
    await mkdir(assetDir, { recursive: true });
    const source = Buffer.from("export const finalHash = 'resolved';\n".repeat(500), "utf-8");
    await writeFile(path.join(assetDir, "app-final.js"), source);

    expect(await writePrecompressedBuildAssets(root, ["assets/app-final.js"])).toBe(1);
    expect(gunzipSync(await readFile(path.join(assetDir, "app-final.js.gz")))).toEqual(source);
  });
});
