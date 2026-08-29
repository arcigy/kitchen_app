import { describe, expect, it } from "vitest";
import { APP_CHUNK_WARNING_LIMIT_KB, resolveManualChunk } from "./vite.config";

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
});
