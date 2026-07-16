import { describe, expect, it } from "vitest";
import { mapWithConcurrency } from "./materialProofSampling";

describe("material proof sampling", () => {
  it("keeps result order while bounding concurrent image work", async () => {
    let active = 0;
    let peak = 0;
    const result = await mapWithConcurrency([1, 2, 3, 4, 5, 6, 7, 8], 3, async (value) => {
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 2));
      active -= 1;
      return value * 10;
    });

    expect(peak).toBe(3);
    expect(result).toEqual([10, 20, 30, 40, 50, 60, 70, 80]);
  });

  it("rejects an invalid concurrency limit", async () => {
    await expect(mapWithConcurrency([1], 0, async (value) => value)).rejects.toThrow("positive integer");
  });
});
