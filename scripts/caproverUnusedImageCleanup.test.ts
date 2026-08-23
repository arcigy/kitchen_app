import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { inspectCapRoverUnusedImageInventory } from "./caproverUnusedImageCleanup";

const imageId = (digit: string) => `sha256:${digit.repeat(64)}`;

describe("CapRover unused image capacity inspection", () => {
  it("reports only a validated count from CapRover's unused image inventory", () => {
    expect(inspectCapRoverUnusedImageInventory({
      unusedImages: [
        { id: imageId("a"), tags: ["img-captain-old:1"] },
        { id: imageId("b"), tags: [] }
      ]
    })).toEqual({ candidateCount: 2 });
  });

  it("accepts direct CLI data and wrapped API data", () => {
    expect(inspectCapRoverUnusedImageInventory({
      unusedImages: []
    })).toEqual({ candidateCount: 0 });
    expect(inspectCapRoverUnusedImageInventory({
      status: 100,
      data: { unusedImages: [{ id: imageId("d") }] }
    })).toEqual({ candidateCount: 1 });
  });

  it("refuses failed, malformed, duplicate, and non-full image IDs", () => {
    expect(() => inspectCapRoverUnusedImageInventory({ status: 111, data: { unusedImages: [] } }))
      .toThrow("does not report success");
    expect(() => inspectCapRoverUnusedImageInventory({}))
      .toThrow("unusedImages inventory");
    expect(() => inspectCapRoverUnusedImageInventory({
      unusedImages: [{ id: "abc" }]
    })).toThrow("full Docker image ID");
    expect(() => inspectCapRoverUnusedImageInventory({
      unusedImages: [{ id: imageId("c") }, { id: imageId("c") }]
    })).toThrow("duplicate image IDs");
  });

  it("contains no write or delete execution path", async () => {
    const source = await readFile(path.join(process.cwd(), "scripts", "caproverUnusedImageCleanup.ts"), "utf8");
    expect(source).not.toMatch(/writeFile|deleteImages|node:child_process|docker\s+(?:image\s+rm|system\s+prune|image\s+prune)/u);
    expect(source).toContain("permanently read-only");
  });
});
