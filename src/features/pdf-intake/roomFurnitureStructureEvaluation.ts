import { normalizeText } from "./normalization";
import type {
  FurnitureGroup,
  RoomFurnitureStructure,
  RoomFurnitureStructureEvaluationReport
} from "./types";

const MODULE_COUNT_TOLERANCE = 1;

export function evaluateRoomFurnitureStructure(
  generated: RoomFurnitureStructure,
  expected: RoomFurnitureStructure
): RoomFurnitureStructureEvaluationReport {
  const groupMatches = expected.furnitureGroups.map((expectedGroup) => ({
    expected: expectedGroup,
    actual: findMatchingGroup(generated.furnitureGroups, expectedGroup)
  }));
  const missingGroups = groupMatches
    .filter((match) => !match.actual)
    .map((match) => groupKey(match.expected));
  const wrongCategory = groupMatches
    .filter((match) => match.actual && match.actual.groupCategory !== match.expected.groupCategory)
    .map((match) => ({
      expectedGroupId: match.expected.groupId,
      actualGroupId: match.actual?.groupId,
      expectedCategory: match.expected.groupCategory,
      actualCategory: match.actual?.groupCategory
    }));
  const moduleCountDifferences = groupMatches
    .filter((match) => match.actual)
    .map((match) => {
      const expectedCount = normalizeModuleCount(match.expected.approximateModuleCount ?? match.expected.modules.length);
      const actualCount = normalizeModuleCount(match.actual?.approximateModuleCount ?? match.actual?.modules.length ?? null);
      return {
        expectedGroupId: match.expected.groupId,
        actualGroupId: match.actual?.groupId,
        expectedCount,
        actualCount,
        withinTolerance: expectedCount === null || actualCount === null
          ? expectedCount === actualCount
          : Math.abs(expectedCount - actualCount) <= MODULE_COUNT_TOLERANCE
      };
    })
    .filter((difference) => !difference.withinTolerance);
  const duplicateGroupCount = countDuplicateGroups(generated);
  const expectedStandalone = expected.standaloneItems.map((item) => item.category);
  const foundStandalone = expectedStandalone.filter((category) =>
    generated.standaloneItems.some((item) => item.category === category)
  );
  const expectedAssociated = expected.furnitureGroups.flatMap((group) =>
    group.associatedItems.map((item) => `${item.category}:${item.relation}`)
  );
  const generatedAssociated = new Set(generated.furnitureGroups.flatMap((group) =>
    group.associatedItems.map((item) => `${item.category}:${item.relation}`)
  ));
  const foundAssociated = expectedAssociated.filter((key) => generatedAssociated.has(key));
  const expectedMaterials = materialKeys(expected);
  const generatedMaterials = materialKeys(generated);
  const foundMaterials = expectedMaterials.filter((material) =>
    generatedMaterials.some((candidate) => candidate.includes(material) || material.includes(candidate))
  );
  const readiness = getReadiness({
    missingGroups,
    wrongCategoryCount: wrongCategory.length,
    moduleCountDifferenceCount: moduleCountDifferences.length,
    missingStandaloneCount: expectedStandalone.length - foundStandalone.length,
    missingAssociatedCount: expectedAssociated.length - foundAssociated.length,
    missingMaterialCount: expectedMaterials.length - foundMaterials.length,
    duplicateGroupCount
  });

  return {
    fileName: generated.fileName,
    roomId: generated.roomId,
    groups: {
      expected: expected.furnitureGroups.length,
      found: groupMatches.filter((match) => match.actual).length,
      missing: missingGroups,
      wrongCategory,
      moduleCountDifferences,
      duplicateGroupCount
    },
    standaloneItems: {
      expected: expectedStandalone.length,
      found: foundStandalone.length,
      missing: expectedStandalone.filter((category) => !foundStandalone.includes(category))
    },
    associatedItems: {
      expected: expectedAssociated.length,
      found: foundAssociated.length,
      missing: expectedAssociated.filter((key) => !foundAssociated.includes(key))
    },
    materials: {
      expected: expectedMaterials.length,
      found: foundMaterials.length,
      missing: expectedMaterials.filter((material) => !foundMaterials.includes(material))
    },
    readinessForDeepExtraction: readiness
  };
}

function findMatchingGroup(groups: FurnitureGroup[], expected: FurnitureGroup): FurnitureGroup | undefined {
  return groups.find((group) => group.groupId === expected.groupId)
    ?? groups.find((group) => group.roomId === expected.roomId && group.groupCategory === expected.groupCategory && group.baseCategory === expected.baseCategory)
    ?? groups.find((group) => group.roomId === expected.roomId && group.baseCategory === expected.baseCategory);
}

function groupKey(group: FurnitureGroup): string {
  return `${group.groupCategory}:${group.baseCategory}:${group.sourcePageNumbers.join(",")}`;
}

function normalizeModuleCount(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function countDuplicateGroups(structure: RoomFurnitureStructure): number {
  const counts = new Map<string, number>();
  for (const group of structure.furnitureGroups) {
    const key = `${group.roomId}:${group.groupCategory}:${group.baseCategory}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Array.from(counts.values()).filter((count) => count > 1).reduce((sum, count) => sum + count - 1, 0);
}

function materialKeys(structure: RoomFurnitureStructure): string[] {
  return Array.from(new Set(structure.furnitureGroups.flatMap((group) =>
    group.materials.map((material) => normalizeMaterial(material.code || material.rawText))
  ).filter(Boolean)));
}

function normalizeMaterial(value: string | undefined): string {
  if (!value) return "";
  return normalizeText(value).replace(/[^a-z0-9]+/gu, "");
}

function getReadiness(input: {
  missingGroups: string[];
  wrongCategoryCount: number;
  moduleCountDifferenceCount: number;
  missingStandaloneCount: number;
  missingAssociatedCount: number;
  missingMaterialCount: number;
  duplicateGroupCount: number;
}): RoomFurnitureStructureEvaluationReport["readinessForDeepExtraction"] {
  const blockers: string[] = [];
  const warnings: string[] = [];
  if (input.missingGroups.length > 0) blockers.push("missing furniture group");
  if (input.wrongCategoryCount > 0) blockers.push("wrong group category");
  if (input.duplicateGroupCount > 0) blockers.push("duplicate groups");
  if (input.moduleCountDifferenceCount > 0) warnings.push("module count outside tolerance");
  if (input.missingStandaloneCount > 0) warnings.push("missing standalone item");
  if (input.missingAssociatedCount > 0) warnings.push("missing associated item");
  if (input.missingMaterialCount > 0) warnings.push("missing material");
  if (blockers.length > 0) return { level: "red", reasons: blockers };
  if (warnings.length > 0) return { level: "yellow", reasons: warnings };
  return { level: "green", reasons: ["structure matches expected baseline"] };
}
