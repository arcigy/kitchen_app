import { describe, expect, it } from "vitest";

import { recoverPbrTextureSet } from "./pbrMaterials";

describe("PBR texture recovery", () => {
  it("turns a TextureLoader Event rejection into the existing fallback material path", async () => {
    const failedLoad = recoverPbrTextureSet(() => Promise.reject(new Event("error")));

    await expect(failedLoad).resolves.toBeNull();
  });
});
