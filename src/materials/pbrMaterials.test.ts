import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearPbrCachesForTests,
  getCachedPbrTextureSet,
  getPbrCacheStats,
  getPbrMaterial,
  loadPbrTextureSet,
  PBR_MATERIAL_CACHE_LIMIT,
  PBR_TEXTURE_CACHE_LIMIT,
  recoverPbrTextureSet,
  type PbrMaterialId
} from "./pbrMaterials";

describe("PBR texture recovery", () => {
  beforeEach(() => clearPbrCachesForTests());

  it("turns a TextureLoader Event rejection into the existing fallback material path", async () => {
    const failedLoad = recoverPbrTextureSet(() => Promise.reject(new Event("error")));

    await expect(failedLoad).resolves.toBeNull();
  });

  it("never rejects when deployed PBR image files are unavailable", async () => {
    const requested: string[] = [];
    const result = loadPbrTextureSet("wood_veneer_oak_7760_1k", (url, _onLoad, onError) => {
      requested.push(url);
      onError();
    });

    await expect(result).resolves.toBeNull();
    expect(requested).toEqual([
      "/materials/wood_veneer_oak_7760_1k/BaseColor.jpg",
      "/materials/wood_veneer_oak_7760_1k/Normal.png",
      "/materials/wood_veneer_oak_7760_1k/Roughness.jpg"
    ]);
  });

  it("coalesces concurrent loads but removes a failed entry so it can retry", async () => {
    const load = vi.fn(async () => null);
    const first = getCachedPbrTextureSet("wood_veneer_oak_7760_1k", load);
    const second = getCachedPbrTextureSet("wood_veneer_oak_7760_1k", load);

    expect(first).toBe(second);
    await expect(first).resolves.toBeNull();
    await Promise.resolve();
    await expect(getCachedPbrTextureSet("wood_veneer_oak_7760_1k", load)).resolves.toBeNull();
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("bounds texture and material cache ownership", () => {
    const never = () => new Promise<null>(() => undefined);
    for (let index = 0; index < PBR_TEXTURE_CACHE_LIMIT + 3; index += 1) {
      getCachedPbrTextureSet(`test_texture_${index}` as PbrMaterialId, never);
    }
    const sharedTexturePromise = new Promise<null>(() => undefined);
    getCachedPbrTextureSet("wood_veneer_oak_7760_1k", () => sharedTexturePromise);
    for (let index = 0; index < PBR_MATERIAL_CACHE_LIMIT + 3; index += 1) {
      getPbrMaterial({
        fallbackColor: "#ffffff",
        ref: {
          id: "wood_veneer_oak_7760_1k",
          tintColor: `#${index.toString(16).padStart(6, "0")}`,
          tintStrength: 1
        }
      });
    }

    expect(getPbrCacheStats()).toMatchObject({
      materials: PBR_MATERIAL_CACHE_LIMIT,
      textures: PBR_TEXTURE_CACHE_LIMIT,
      materialEvictions: 3,
      textureEvictions: 4
    });
  });
});
