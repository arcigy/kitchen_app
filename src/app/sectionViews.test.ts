import { describe, expect, it } from "vitest";
import { cloneSectionParams } from "./sectionViews";
import type { SectionParams } from "./localTypes";

describe("sectionViews", () => {
  it("clones section params without sharing endpoint objects", () => {
    const section: SectionParams = {
      name: "Section 1",
      aMm: { x: 0, z: 0 },
      bMm: { x: 1000, z: 500 },
      mirrored: true
    };

    const clone = cloneSectionParams(section);

    expect(clone).toEqual(section);
    expect(clone).not.toBe(section);
    expect(clone.aMm).not.toBe(section.aMm);
    expect(clone.bMm).not.toBe(section.bMm);
  });
});
