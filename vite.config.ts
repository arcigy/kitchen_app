import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { defineConfig, type Plugin } from "vite";

const workerPort = process.env.BLENDER_WORKER_PORT || "5191";
export const APP_CHUNK_WARNING_LIMIT_KB = 2100;
export const PRECOMPRESSED_ASSET_MIN_BYTES = 1_024;

const PRECOMPRESSIBLE_BUILD_ASSET = /\.(?:css|html|js|json|mjs|svg)$/i;

export function createPrecompressedBuildAsset(fileName: string, source: string | Uint8Array): Uint8Array | null {
  if (!PRECOMPRESSIBLE_BUILD_ASSET.test(fileName)) return null;
  const raw = typeof source === "string" ? Buffer.from(source, "utf-8") : Buffer.from(source);
  if (raw.byteLength < PRECOMPRESSED_ASSET_MIN_BYTES) return null;
  const compressed = gzipSync(raw, { level: 9 });
  return compressed.byteLength < raw.byteLength ? compressed : null;
}

export async function writePrecompressedBuildAssets(outputRoot: string, fileNames: Iterable<string>): Promise<number> {
  const resolvedRoot = path.resolve(outputRoot);
  let written = 0;
  await Promise.all([...new Set(fileNames)].map(async (fileName) => {
    const filePath = path.resolve(resolvedRoot, fileName);
    if (!filePath.startsWith(`${resolvedRoot}${path.sep}`)) return;
    const source = await readFile(filePath);
    const compressed = createPrecompressedBuildAsset(fileName, source);
    if (!compressed) return;
    await writeFile(`${filePath}.gz`, compressed);
    written += 1;
  }));
  return written;
}

export function createPrecompressedAssetsPlugin(): Plugin {
  return {
    name: "arcigy-precompress-static-assets",
    apply: "build",
    async writeBundle(options, bundle) {
      const outputRoot = options.dir ?? path.dirname(options.file ?? "dist/index.html");
      await writePrecompressedBuildAssets(outputRoot, Object.values(bundle).map((entry) => entry.fileName));
    }
  };
}

export function resolveManualChunk(id: string): string | undefined {
  const normalized = id.replace(/\\/g, "/");
  if (normalized.includes("/node_modules/three/")) return "vendor-three";
  if (
    normalized.includes("/node_modules/postprocessing/") ||
    normalized.includes("/node_modules/realism-effects/") ||
    normalized.includes("/node_modules/three-gpu-pathtracer/") ||
    normalized.includes("/node_modules/three-mesh-bvh/")
  ) {
    return "vendor-rendering";
  }
  if (normalized.includes("/node_modules/pdfjs-dist/") || normalized.includes("/node_modules/pdf-lib/")) return "vendor-pdf";
  if (normalized.includes("/node_modules/xlsx/")) return "vendor-xlsx";
  return undefined;
}

export default defineConfig({
  clearScreen: false,
  plugins: [createPrecompressedAssetsPlugin()],
  build: {
    // The authenticated 3D editor is one cohesive runtime. Keep a tight budget while
    // lazy local catalog data and independently cached vendor libraries stay separate.
    chunkSizeWarningLimit: APP_CHUNK_WARNING_LIMIT_KB,
    rollupOptions: {
      output: {
        manualChunks: resolveManualChunk
      }
    }
  },
  server: {
    host: "127.0.0.1",
    port: 5180,
    strictPort: false,
    proxy: {
      "/health": {
        target: `http://127.0.0.1:${workerPort}`,
        changeOrigin: true
      },
      "/ready": {
        target: `http://127.0.0.1:${workerPort}`,
        changeOrigin: true
      },
      "/api": {
        target: `http://127.0.0.1:${workerPort}`,
        changeOrigin: true
      },
      "/storage": {
        target: `http://127.0.0.1:${workerPort}`,
        changeOrigin: true
      }
    }
  }
});
