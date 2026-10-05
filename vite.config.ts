import { execFileSync } from "node:child_process";
import { defineConfig } from "vite";

function appVersion(): string {
  if (process.env.VITE_APP_VERSION) return process.env.VITE_APP_VERSION;
  try { return execFileSync("git", ["rev-parse", "--short=12", "HEAD"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); }
  catch { return `build-${new Date().toISOString()}`; }
}

const workerPort = process.env.BLENDER_WORKER_PORT || "5191";
export const APP_CHUNK_WARNING_LIMIT_KB = 2100;

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
  define: { "import.meta.env.VITE_APP_VERSION": JSON.stringify(appVersion()) },
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
