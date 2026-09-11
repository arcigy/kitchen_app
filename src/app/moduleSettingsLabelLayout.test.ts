import { describe, expect, it } from "vitest";
import { placeModuleDimensionLabel, type ModuleDimensionLabelBox } from "./moduleSettingsLabelLayout";

describe("projected module dimension captions", () => {
  it("keeps a dense set of captions separated and outside the model", () => {
    const occupied: ModuleDimensionLabelBox[] = [];
    const viewport = { width: 808, height: 360 };
    const model = { min: { x: 310, y: 70 }, max: { x: 510, y: 270 } };
    for (let index = 0; index < 12; index++) {
      const box = placeModuleDimensionLabel({ viewport, model, occupied,
        width: index === 1 ? 350 : 200, preferred: { x: 400, y: index < 6 ? 46 : 294 } });
      expect(box.x - box.width / 2).toBeGreaterThanOrEqual(6);
      expect(box.x + box.width / 2).toBeLessThanOrEqual(viewport.width - 6);
      expect(box.y).toBeGreaterThanOrEqual(18);
      expect(box.y).toBeLessThanOrEqual(viewport.height - 18);
      expect(box.x + box.width / 2 <= model.min.x || box.x - box.width / 2 >= model.max.x || box.y + 14 <= model.min.y || box.y - 14 >= model.max.y).toBe(true);
      expect(occupied.every((other) => Math.abs(box.y - other.y) >= 30 || Math.abs(box.x - other.x) >= (box.width + other.width) / 2 + 8)).toBe(true);
      occupied.push(box);
    }
  });
});
