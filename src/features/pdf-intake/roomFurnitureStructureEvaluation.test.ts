import { describe, expect, it } from "vitest";
import { evaluateRoomFurnitureStructure } from "./roomFurnitureStructureEvaluation";
import type { RoomFurnitureStructure } from "./types";

describe("room furniture structure evaluation", () => {
  it("matches group category, standalone bench, mirror association, EGGER material, and module count tolerance", () => {
    const report = evaluateRoomFurnitureStructure(
      structureFixture({ moduleCount: 4 }),
      structureFixture({ moduleCount: 3 })
    );

    expect(report.groups.found).toBe(1);
    expect(report.groups.wrongCategory).toHaveLength(0);
    expect(report.groups.moduleCountDifferences).toHaveLength(0);
    expect(report.standaloneItems.missing).toHaveLength(0);
    expect(report.associatedItems.missing).toHaveLength(0);
    expect(report.materials.missing).toHaveLength(0);
    expect(report.readinessForDeepExtraction.level).toBe("green");
  });

  it("reports wrong group category", () => {
    const generated = structureFixture({ groupCategory: "storage_set" });
    const expected = structureFixture({ groupCategory: "wardrobe_set" });

    const report = evaluateRoomFurnitureStructure(generated, expected);

    expect(report.groups.wrongCategory).toHaveLength(1);
    expect(report.readinessForDeepExtraction.level).toBe("red");
  });

  it("reports missing standalone bench", () => {
    const generated = structureFixture({ standalone: false });

    const report = evaluateRoomFurnitureStructure(generated, structureFixture());

    expect(report.standaloneItems.missing).toEqual(["bench"]);
    expect(report.readinessForDeepExtraction.level).toBe("yellow");
  });

  it("reports missing associated mirror", () => {
    const generated = structureFixture({ associated: false });

    const report = evaluateRoomFurnitureStructure(generated, structureFixture());

    expect(report.associatedItems.missing).toEqual(["mirror:integrated"]);
    expect(report.readinessForDeepExtraction.level).toBe("yellow");
  });

  it("reports missing EGGER material code", () => {
    const generated = structureFixture({ material: "KRONOSPAN K001" });

    const report = evaluateRoomFurnitureStructure(generated, structureFixture({ material: "EGGER U156 ST9" }));

    expect(report.materials.missing).toEqual(["eggeru156st9"]);
    expect(report.readinessForDeepExtraction.level).toBe("yellow");
  });

  it("detects duplicate groups", () => {
    const generated = structureFixture();
    generated.furnitureGroups.push({
      ...generated.furnitureGroups[0],
      groupId: "entry_hall_wardrobe_set_2"
    });

    const report = evaluateRoomFurnitureStructure(generated, structureFixture());

    expect(report.groups.duplicateGroupCount).toBe(1);
    expect(report.readinessForDeepExtraction.level).toBe("red");
  });

  it("reports module count difference outside +-1 tolerance", () => {
    const report = evaluateRoomFurnitureStructure(
      structureFixture({ moduleCount: 6 }),
      structureFixture({ moduleCount: 3 })
    );

    expect(report.groups.moduleCountDifferences).toHaveLength(1);
    expect(report.readinessForDeepExtraction.level).toBe("yellow");
  });
});

function structureFixture(options: {
  groupCategory?: RoomFurnitureStructure["furnitureGroups"][number]["groupCategory"];
  moduleCount?: number;
  standalone?: boolean;
  associated?: boolean;
  material?: string;
} = {}): RoomFurnitureStructure {
  const moduleCount = options.moduleCount ?? 3;
  return {
    fileName: "project.pdf",
    roomId: "room_entry",
    roomType: "entry_hall",
    sourcePageNumbers: [41, 42],
    furnitureGroups: [
      {
        groupId: "entry_hall_wardrobe_set_1",
        displayName: "Entry Hall Wardrobe Set",
        groupCategory: options.groupCategory ?? "wardrobe_set",
        baseCategory: "wardrobe",
        roomId: "room_entry",
        sourcePageNumbers: [41, 42],
        approximateModuleCount: moduleCount,
        modules: Array.from({ length: moduleCount }, (_, index) => ({
          moduleId: `module_${index + 1}`,
          baseCategory: index === 1 ? "shelves" : "wardrobe",
          sourcePageNumbers: [42],
          confidence: 0.8,
          needsDeepExtraction: true,
          reasons: []
        })),
        associatedItems: options.associated === false ? [] : [
          {
            itemId: "mirror_1",
            category: "mirror",
            relation: "integrated",
            sourcePageNumbers: [42],
            confidence: 0.8,
            reasons: []
          }
        ],
        rawDimensionTexts: ["1680", "2450", "600"],
        materials: [{ rawText: options.material ?? "EGGER U156 ST9", code: options.material ?? "EGGER U156 ST9", confidence: 0.9 }],
        confidence: 0.82,
        needsDeepExtraction: true,
        reasons: []
      }
    ],
    standaloneItems: options.standalone === false ? [] : [
      {
        itemId: "bench_1",
        category: "bench",
        displayName: "Bench",
        sourcePageNumbers: [42],
        rawDimensionTexts: ["122 cm"],
        materials: [],
        confidence: 0.85,
        needsDeepExtraction: true,
        reasons: []
      }
    ],
    unassignedCandidates: [],
    warnings: [],
    confidence: 0.82
  };
}
