import { describe, expect, it, vi } from "vitest";
import { extendedFurnitureModulePackages } from "../../../system/module-packages/extendedFurniture";
import { createModulePreviewCache, modulePresetPreviewParameters } from "./modulePresetPreview";

describe("preset preview jobs", () => {
  it("deduplicates pending jobs, yields between renders and bounds finished images by recent use", async () => {
    const render = vi.fn(async (value: number) => `image-${value}`);
    const schedule = vi.fn(async () => undefined);
    const request = createModulePreviewCache(render, 2, schedule);
    const first = request("a", 1);
    expect(request("a", 1)).toBe(first);
    expect(render).not.toHaveBeenCalled();
    await first;
    await request("b", 2);
    await request("a", 1);
    await request("c", 3);
    await request("a", 1);
    expect(render).toHaveBeenCalledTimes(3);
    await request("b", 2);
    expect(render).toHaveBeenCalledTimes(4);
    expect(schedule).toHaveBeenCalledTimes(4);
  });

  it("does not poison the queue or cache when one preview fails", async () => {
    const render = vi.fn().mockRejectedValueOnce(new Error("render failed")).mockResolvedValue("recovered");
    const request = createModulePreviewCache(render, 2, async () => undefined);
    await expect(request("a", 1)).rejects.toThrow("render failed");
    await expect(request("a", 1)).resolves.toBe("recovered");
    expect(render).toHaveBeenCalledTimes(2);
  });

  it("uses applied preset geometry while preserving current dimensions, materials and false", () => {
    const modulePackage = structuredClone(extendedFurnitureModulePackages.find(item => item.module.moduleType === "fwm_catalog_base_doors")!);
    modulePackage.parameterPresets = {
      freeParameterKeys: ["width", "height", "depth", "frontMaterialId"],
      presets: [{ presetId: "open", label: "Open", note: "", parameterValues: { hasDoors: false, doorCount: 2, width: 600, frontMaterialId: "preset-material" } }]
    };
    const current = { width: 915, height: 822, depth: 570, frontMaterialId: "selected-material", hasDoors: true, doorCount: 1, materialAssignments: { front: "selected-material" } };
    const rendered = modulePresetPreviewParameters(modulePackage, current, "open");
    expect(rendered).toMatchObject({ width: 915, height: 822, depth: 570, frontMaterialId: "selected-material", hasDoors: false, doorCount: 2 });
    expect(current.hasDoors).toBe(true);
    expect(rendered.materialAssignments).not.toBe(current.materialAssignments);
  });
});
