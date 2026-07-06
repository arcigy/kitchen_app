import { defineConfig } from "vite";

const workerPort = process.env.BLENDER_WORKER_PORT || "5191";

export default defineConfig({
  clearScreen: false,
  build: {
    chunkSizeWarningLimit: 1300,
    rollupOptions: {
      output: {
        manualChunks(id) {
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
          if (normalized.includes("/src/modules/runtime/")) return "feature-module-runtime";
          if (normalized.includes("/src/modules/drawerLow/")) return "feature-module-drawer-low";
          if (normalized.includes("/src/modules/swingShelvesLow/")) return "feature-module-swing-shelves";
          if (normalized.includes("/src/modules/flapShelvesLow/")) return "feature-module-flap-shelves";
          if (normalized.includes("/src/modules/fridgeTall/")) return "feature-module-fridge-tall";
          if (normalized.includes("/src/modules/cornerShelfLower/")) return "feature-module-corner-shelf";
          if (normalized.includes("/src/modules/") || normalized.includes("/src/geometry/")) return "feature-modules";
          if (normalized.includes("/src/materials/") || normalized.includes("/src/data/pricing/")) return "feature-materials";
          if (normalized.includes("/src/app/customFurnitureController") || normalized.includes("/src/layout/customFurniture")) return "feature-custom-furniture";
          if (
            normalized.includes("/src/app/pointerInputHandlers") ||
            normalized.includes("/src/app/keyboardInputHandlers") ||
            normalized.includes("/src/app/transformController") ||
            normalized.includes("/src/app/wallController") ||
            normalized.includes("/src/app/worktopController") ||
            normalized.includes("/src/app/floorBoundary") ||
            normalized.includes("/src/app/sectionDrawController")
          ) {
            return "feature-editor-tools";
          }
          if (normalized.includes("/src/ui/bomDevPanel") || normalized.includes("/src/layout/bom/")) return "feature-bom";
          if (normalized.includes("/src/app/materialProofMode")) return "feature-material-proof";
          if (normalized.includes("/src/app/project/") || normalized.includes("/src/ui/project/") || normalized.includes("/src/core/project")) return "feature-project";
          if (normalized.includes("/src/core/scene") || normalized.includes("/src/core/exportScene") || normalized.includes("/src/rendering/")) return "feature-scene";
          if (normalized.includes("/src/system/catalog-templates/") || normalized.includes("/src/core/catalog/")) return "feature-catalog";
          if (
            normalized.includes("/src/ui/") ||
            normalized.includes("/src/app/bootstrap") ||
            normalized.includes("/src/app/classicTopbarController") ||
            normalized.includes("/src/app/viewNavigation") ||
            normalized.includes("/src/app/viewDisplayController") ||
            normalized.includes("/src/app/viewModeController") ||
            normalized.includes("/src/app/viewerToolModeController")
          ) {
            return "feature-ui-shell";
          }
          return undefined;
        }
      }
    }
  },
  server: {
    host: "127.0.0.1",
    port: 5180,
    strictPort: false,
    proxy: {
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
