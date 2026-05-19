import type {
  ApproxFurnitureModule,
  ApproxFurnitureModuleBaseCategory,
  AssociatedFurnitureCategory,
  AssociatedFurnitureItem,
  AssociatedFurnitureRelation,
  DetailedFurnitureItem,
  FurnitureGroup,
  FurnitureGroupBaseCategory,
  FurnitureGroupCategory,
  FurnitureStructureCandidate,
  ProjectContext,
  RoomDetailExtraction,
  RoomFurnitureInventory,
  RoomFurnitureStructure,
  RoomType,
  StandaloneFurnitureCategory,
  StandaloneFurnitureItem
} from "./types";

interface BuildRoomFurnitureStructureInput {
  roomDetailExtraction: RoomDetailExtraction;
  roomInventory?: RoomFurnitureInventory;
  projectContext?: ProjectContext;
}

const GROUPABLE_PRIMARY = new Set<string>([
  "wardrobe",
  "built_in_cabinet",
  "cabinet",
  "shelves",
  "kitchen",
  "desk",
  "tv_unit",
  "vanity",
  "wall_panel",
  "countertop"
]);

const STANDALONE_CATEGORIES = new Set<string>([
  "bench",
  "table",
  "chair",
  "sofa",
  "bed",
  "armchair"
]);

const ASSOCIATED_CATEGORIES = new Set<string>([
  "mirror",
  "appliance",
  "sink",
  "toilet",
  "bathtub",
  "shower"
]);

export function buildRoomFurnitureStructure(input: BuildRoomFurnitureStructureInput): RoomFurnitureStructure {
  const extraction = input.roomDetailExtraction;
  const usableItems = extraction.items.filter((item) => item.category !== "unknown" || item.importance !== "unknown");
  const groupedItems = usableItems.filter((item) => shouldUseInGroup(item, extraction.roomType));
  const standaloneItems = usableItems.filter((item) => shouldUseAsStandalone(item));
  const associatedCandidates = usableItems.filter((item) => shouldUseAsAssociated(item) && !standaloneItems.includes(item));
  const groups = createGroups(extraction, groupedItems, associatedCandidates);
  const groupedItemIds = new Set(groups.flatMap((group) => [
    ...group.modules.map((module) => module.moduleId.replace(/_module_\d+$/u, "")),
    ...group.associatedItems.map((item) => item.itemId)
  ]));
  const standalone = standaloneItems.map(toStandaloneItem);
  const standaloneItemIds = new Set(standalone.map((item) => item.itemId));
  const unassignedCandidates = extraction.items
    .filter((item) => !groupedItemIds.has(item.itemId) && !standaloneItemIds.has(item.itemId) && item.category === "unknown")
    .map(toUnassignedCandidate);
  const warnings = createStructureWarnings(extraction, groups, standalone, unassignedCandidates);

  return {
    fileName: extraction.fileName,
    roomId: extraction.roomId,
    roomType: extraction.roomType,
    roomNameOriginal: extraction.roomNameOriginal,
    sourcePageNumbers: uniqueNumbers(extraction.sourcePageNumbers),
    furnitureGroups: groups,
    standaloneItems: standalone,
    unassignedCandidates,
    warnings,
    confidence: round(confidenceForStructure(extraction, groups, standalone, unassignedCandidates, warnings))
  };
}

export function parseRoomFurnitureStructureJson(value: string): RoomFurnitureStructure {
  const parsed = JSON.parse(value) as Partial<RoomFurnitureStructure>;
  if (!parsed || typeof parsed !== "object") throw new Error("Expected Room Furniture Structure JSON object.");
  if (typeof parsed.fileName !== "string") throw new Error("Room Furniture Structure must include fileName.");
  if (typeof parsed.roomId !== "string") throw new Error("Room Furniture Structure must include roomId.");
  if (!Array.isArray(parsed.furnitureGroups)) throw new Error("Room Furniture Structure must include furnitureGroups.");
  if (!Array.isArray(parsed.standaloneItems)) throw new Error("Room Furniture Structure must include standaloneItems.");
  if (!Array.isArray(parsed.unassignedCandidates)) throw new Error("Room Furniture Structure must include unassignedCandidates.");
  return parsed as RoomFurnitureStructure;
}

function createGroups(
  extraction: RoomDetailExtraction,
  groupedItems: DetailedFurnitureItem[],
  associatedCandidates: DetailedFurnitureItem[]
): FurnitureGroup[] {
  if (groupedItems.length === 0) return [];

  const groupCategory = inferGroupCategory(extraction.roomType, groupedItems);
  const baseCategory = inferBaseCategory(groupCategory, groupedItems);
  const groupSourcePages = uniqueNumbers([
    ...groupedItems.flatMap((item) => item.sourcePageNumbers),
    ...associatedCandidates.flatMap((item) => item.sourcePageNumbers)
  ]);
  const sameSheetAssociated = associatedCandidates.filter((item) => overlaps(item.sourcePageNumbers, groupSourcePages));
  const modules = createApproxModules(groupedItems);
  const associatedItems = [
    ...sameSheetAssociated.map((item) => toAssociatedItem(item, relationForAssociatedItem(item, groupCategory))),
    ...extractMaterialReferenceItems(groupedItems)
  ];
  const rawDimensionTexts = uniqueStrings(groupedItems.flatMap((item) => item.dimensions.rawDimensionTexts));
  const materials = mergeMaterials(groupedItems.flatMap((item) => item.materials));
  const needsDeepExtraction = modules.length > 0 || groupedItems.some((item) => item.needsHumanReview);

  return [{
    groupId: `${extraction.roomType || "room"}_${groupCategory}_1`,
    displayName: titleize(`${extraction.roomType || "room"} ${groupCategory}`),
    groupCategory,
    baseCategory,
    roomId: extraction.roomId,
    sourcePageNumbers: groupSourcePages,
    approximateModuleCount: modules.length || null,
    modules,
    associatedItems,
    rawDimensionTexts,
    materials,
    confidence: round(average([...groupedItems, ...sameSheetAssociated].map((item) => item.confidence), extraction.confidence)),
    needsDeepExtraction,
    reasons: [
      "grouped from room detail items",
      `group category inferred as ${groupCategory}`,
      sameSheetAssociated.length > 0 ? "associated items share source pages with the group" : "no associated items on same source pages"
    ]
  }];
}

function shouldUseInGroup(item: DetailedFurnitureItem, roomType: string): boolean {
  if (item.importance === "unknown" || item.category === "unknown") return false;
  if (GROUPABLE_PRIMARY.has(item.category)) return true;
  if (roomType === "bathroom" && (item.category === "sink" || item.category === "mirror")) return true;
  return false;
}

function shouldUseAsStandalone(item: DetailedFurnitureItem): boolean {
  if (!STANDALONE_CATEGORIES.has(item.category)) return false;
  const text = item.sourceTexts.join(" ").toLowerCase();
  if (item.category === "bench" && /floriana|lavice|bench|bank/u.test(text)) return true;
  return item.category !== "bench" || item.confidence < 0.9 || !item.components.includes("bench");
}

function shouldUseAsAssociated(item: DetailedFurnitureItem): boolean {
  return ASSOCIATED_CATEGORIES.has(item.category) || item.components.some((component) => component === "mirror" || component === "wall_panel");
}

function inferGroupCategory(roomType: string, items: DetailedFurnitureItem[]): FurnitureGroupCategory {
  const categories = new Set(items.map((item) => item.category));
  if (categories.has("kitchen") || categories.has("countertop")) return "kitchen_set";
  if (roomType === "bathroom" || roomType === "wc" || roomType === "guest_wc" || categories.has("vanity") || categories.has("sink")) return "bathroom_set";
  if (roomType === "office" || categories.has("desk")) return "office_set";
  if (roomType === "children_room") return "children_room_set";
  if (categories.has("wall_panel")) return "wall_panel_set";
  if (roomType === "utility_laundry" || roomType === "laundry" || roomType === "laundry_room") return "laundry_set";
  if (categories.has("wardrobe") || categories.has("built_in_cabinet")) return "wardrobe_set";
  if (categories.has("cabinet") || categories.has("shelves")) return "storage_set";
  return "unknown_set";
}

function inferBaseCategory(groupCategory: FurnitureGroupCategory, items: DetailedFurnitureItem[]): FurnitureGroupBaseCategory {
  const categories = new Set(items.map((item) => item.category));
  if (groupCategory === "kitchen_set") return "kitchen";
  if (groupCategory === "bathroom_set") return categories.has("vanity") ? "vanity" : "cabinet";
  if (groupCategory === "office_set") return categories.has("desk") ? "desk" : "cabinet";
  if (groupCategory === "wall_panel_set") return "wall_panel";
  if (categories.has("wardrobe") || categories.has("built_in_cabinet")) return "wardrobe";
  if (categories.has("cabinet")) return "cabinet";
  if (categories.has("shelves")) return "shelves";
  return groupCategory === "storage_set" ? "storage" : "unknown";
}

function createApproxModules(items: DetailedFurnitureItem[]): ApproxFurnitureModule[] {
  const modules: ApproxFurnitureModule[] = [];
  let index = 1;
  const seen = new Set<string>();

  for (const item of items) {
    for (const category of moduleCategoriesForItem(item)) {
      const key = `${item.itemId}:${category}`;
      if (seen.has(key)) continue;
      seen.add(key);
      modules.push({
        moduleId: `${item.itemId}_module_${index}`,
        baseCategory: category,
        label: titleize(category),
        sourcePageNumbers: uniqueNumbers(item.sourcePageNumbers),
        confidence: item.confidence,
        needsDeepExtraction: true,
        reasons: [`approximate module from ${item.itemId}`, ...item.reasons.slice(0, 3)]
      });
      index += 1;
    }
  }

  return modules;
}

function moduleCategoriesForItem(item: DetailedFurnitureItem): ApproxFurnitureModuleBaseCategory[] {
  const categories = new Set<ApproxFurnitureModuleBaseCategory>();
  if (item.category === "wardrobe" || item.category === "built_in_cabinet") categories.add("wardrobe");
  if (item.category === "cabinet" || item.category === "vanity" || item.category === "kitchen" || item.category === "tv_unit") categories.add("cabinet");
  if (item.category === "shelves" || item.components.includes("open_shelves")) categories.add("shelves");
  if (item.components.includes("drawers")) categories.add("drawer_unit");
  if (item.category === "bench" || item.components.includes("bench")) categories.add("bench");
  if (item.category === "wall_panel" || item.components.includes("wall_panel")) categories.add("panel");
  if (item.category === "countertop") categories.add("countertop");
  if (item.category === "appliance") categories.add("appliance_tower");
  return categories.size > 0 ? Array.from(categories) : ["unknown"];
}

function toAssociatedItem(item: DetailedFurnitureItem, relation: AssociatedFurnitureRelation): AssociatedFurnitureItem {
  return {
    itemId: item.itemId,
    category: associatedCategory(item.category),
    relation,
    sourcePageNumbers: uniqueNumbers(item.sourcePageNumbers),
    confidence: item.confidence,
    reasons: [`associated from ${item.category}`, ...item.reasons.slice(0, 3)]
  };
}

function associatedCategory(category: string): AssociatedFurnitureCategory {
  if (category === "mirror" || category === "appliance" || category === "sink") return category;
  if (category === "toilet" || category === "bathtub" || category === "shower") return "decor";
  return "unknown";
}

function relationForAssociatedItem(item: DetailedFurnitureItem, groupCategory: FurnitureGroupCategory): AssociatedFurnitureRelation {
  if (item.category === "mirror" && (groupCategory === "wardrobe_set" || groupCategory === "bathroom_set")) return "integrated";
  if (item.category === "sink" && (groupCategory === "kitchen_set" || groupCategory === "bathroom_set")) return "integrated";
  if (item.category === "appliance" && groupCategory === "kitchen_set") return "integrated";
  return "context";
}

function extractMaterialReferenceItems(items: DetailedFurnitureItem[]): AssociatedFurnitureItem[] {
  const hasPlinth = items.some((item) => item.materials.some((material) => /sokl|plinth|ap38/iu.test(material.rawText)));
  return hasPlinth
    ? [{
      itemId: "material_reference_plinth_1",
      category: "plinth",
      relation: "material_reference",
      sourcePageNumbers: uniqueNumbers(items.flatMap((item) => item.sourcePageNumbers)),
      confidence: 0.68,
      reasons: ["plinth/sokel material reference found in materials"]
    }]
    : [];
}

function toStandaloneItem(item: DetailedFurnitureItem): StandaloneFurnitureItem {
  return {
    itemId: item.itemId,
    category: standaloneCategory(item.category),
    displayName: item.displayName,
    sourcePageNumbers: uniqueNumbers(item.sourcePageNumbers),
    rawDimensionTexts: uniqueStrings(item.dimensions.rawDimensionTexts),
    materials: item.materials,
    confidence: item.confidence,
    needsDeepExtraction: item.needsHumanReview || item.category === "bench",
    reasons: [`standalone ${item.category}`, ...item.reasons.slice(0, 4)]
  };
}

function standaloneCategory(category: string): StandaloneFurnitureCategory {
  if (category === "bench" || category === "table" || category === "chair" || category === "sofa" || category === "bed" || category === "armchair" || category === "appliance") return category;
  if (category === "cabinet") return "loose_cabinet";
  return "unknown";
}

function toUnassignedCandidate(item: DetailedFurnitureItem): FurnitureStructureCandidate {
  return {
    candidateId: item.itemId,
    category: item.category,
    sourcePageNumbers: uniqueNumbers(item.sourcePageNumbers),
    sourceTexts: item.sourceTexts,
    reason: "item is uncertain and should not be aggressively grouped",
    confidence: item.confidence
  };
}

function createStructureWarnings(
  extraction: RoomDetailExtraction,
  groups: FurnitureGroup[],
  standalone: StandaloneFurnitureItem[],
  candidates: FurnitureStructureCandidate[]
): string[] {
  const warnings = [...extraction.warnings];
  if (groups.length === 0 && standalone.length === 0) warnings.push("No custom furniture structure found for this room.");
  if (groups.length === 0 && extraction.items.some((item) => item.category === "mirror")) warnings.push("Only mirror/context items found; no furniture group was inferred.");
  if (candidates.length > 0) warnings.push(`${candidates.length} uncertain candidates need review.`);
  for (const group of groups) {
    if (group.needsDeepExtraction) warnings.push(`${group.displayName} needs Deep Module Extraction.`);
  }
  return uniqueStrings(warnings);
}

function confidenceForStructure(
  extraction: RoomDetailExtraction,
  groups: FurnitureGroup[],
  standalone: StandaloneFurnitureItem[],
  candidates: FurnitureStructureCandidate[],
  warnings: string[]
): number {
  if (groups.length === 0 && standalone.length === 0) return Math.min(0.45, extraction.confidence);
  const groupConfidence = average(groups.map((group) => group.confidence), extraction.confidence);
  const standaloneConfidence = standalone.length > 0 ? average(standalone.map((item) => item.confidence), groupConfidence) : groupConfidence;
  return Math.max(0, Math.min(1, standaloneConfidence - candidates.length * 0.04 - warnings.length * 0.015));
}

function overlaps(left: number[], right: number[]): boolean {
  const rightSet = new Set(right);
  return left.some((value) => rightSet.has(value));
}

function uniqueNumbers(values: number[]): number[] {
  return Array.from(new Set(values)).sort((left, right) => left - right);
}

function uniqueStrings<T extends string>(values: T[]): T[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function mergeMaterials(materials: DetailedFurnitureItem["materials"]): DetailedFurnitureItem["materials"] {
  const byText = new Map<string, DetailedFurnitureItem["materials"][number]>();
  for (const material of materials) {
    const key = material.rawText.toLowerCase();
    const existing = byText.get(key);
    byText.set(key, existing ? { ...existing, ...material, confidence: Math.max(existing.confidence, material.confidence) } : material);
  }
  return Array.from(byText.values());
}

function average(values: number[], fallback: number): number {
  if (values.length === 0) return fallback;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function titleize(value: string): string {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}
