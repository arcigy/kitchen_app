import { describe, expect, it } from "vitest";

import { loadPbrTextureSet, recoverPbrTextureSet } from "./pbrMaterials";

describe("PBR texture recovery", () => {
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
});
