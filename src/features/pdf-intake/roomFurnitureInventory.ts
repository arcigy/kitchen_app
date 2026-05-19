import { normalizeText } from "./normalization";
import { detectFurniture, detectRoomFunctions } from "./projectContextBuilder";
import type {
  ContextRoom,
  FurnitureCategory,
  FurnitureImportance,
  FurnitureInventoryItem,
  FurnitureInventoryStatus,
  InventoryCleanupReview,
  InventoryDuplicateGroupStatus,
  InventoryRoomCleanupStatus,
  PageReviewItem,
  ProjectContext,
  RoomFurnitureInventory,
  RoomFurnitureInventoryEvaluationReport
} from "./types";

interface BuildRoomFurnitureInventoryInput {
  fileName: string;
  context: ProjectContext;
  pages: PageReviewItem[];
  itemOverrides?: Record<string, Partial<Pick<FurnitureInventoryItem, "category" | "importance" | "roomId" | "status">>>;
  manualItems?: FurnitureInventoryItem[];
  deletedItemIds?: Set<string>;
}

export const PRIMARY_FURNITURE: FurnitureCategory[] = [
  "kitchen",
  "wardrobe",
  "cabinet",
  "built_in_cabinet",
  "shelves",
  "tv_unit",
  "vanity",
  "desk",
  "bench",
  "dresser",
  "wall_panel",
  "laundry_cabinet",
  "partition",
  "island",
  "countertop"
];

export const SECONDARY_FURNITURE: FurnitureCategory[] = [
  "mirror",
  "tv",
  "sofa",
  "table",
  "chair",
  "armchair",
  "rug",
  "lighting",
  "appliance",
  "sink",
  "toilet",
  "bathtub",
  "shower",
  "decor",
  "drying_rack",
  "picture",
  "air_conditioner",
  "bed"
];

export function getFurnitureImportance(category: FurnitureCategory): FurnitureImportance {
  if (PRIMARY_FURNITURE.includes(category)) return "primary";
  if (SECONDARY_FURNITURE.includes(category)) return "secondary";
  if (category === "unknown") return "unknown";
  return "unknown";
}

export function buildRoomFurnitureInventory(input: BuildRoomFurnitureInventoryInput): RoomFurnitureInventory {
  const detectedItems = detectInventoryItems(input.context, input.pages);
  const itemIdsToDelete = input.deletedItemIds ?? new Set<string>();
  const overriddenItems = [...detectedItems, ...(input.manualItems ?? [])]
    .filter((item) => !itemIdsToDelete.has(item.itemId))
    .map((item) => applyInventoryOverride(item, input.itemOverrides?.[item.itemId]));
  const dedupedItems = dedupeInventoryItems(overriddenItems);
  const rooms = input.context.rooms.map((room) => {
    const items = dedupedItems.filter((item) => item.roomId === room.id);
    return {
      roomId: room.id,
      roomNumber: room.roomNumber,
      roomNameOriginal: room.nameOriginal,
      roomType: room.type,
      floorId: room.floorId,
      items,
      sourcePageNumbers: Array.from(new Set([...room.pageNumbers, ...items.flatMap((item) => item.sourcePageNumbers)])).sort(numberSort),
      confidence: items.length > 0 ? average(items.map((item) => item.confidence)) : room.confidence,
      warnings: items.length === 0 ? ["No furniture detected for this room."] : []
    };
  });
  const unassignedItems = dedupedItems.filter((item) => !item.roomId);
  const totalPrimaryItems = dedupedItems.filter((item) => item.importance === "primary" && item.status !== "ignored").length;
  const totalSecondaryItems = dedupedItems.filter((item) => item.importance === "secondary" && item.status !== "ignored").length;

  return {
    fileName: input.fileName,
    rooms,
    unassignedItems,
    summary: {
      totalRooms: rooms.length,
      totalPrimaryItems,
      totalSecondaryItems,
      totalUnassignedItems: unassignedItems.length,
      roomsWithoutFurniture: rooms.filter((room) => room.items.filter((item) => item.status !== "ignored").length === 0).length
    }
  };
}

export function parseRoomFurnitureInventoryJson(value: string): RoomFurnitureInventory {
  const parsed = JSON.parse(value) as Partial<RoomFurnitureInventory>;
  if (!parsed || typeof parsed !== "object") throw new Error("Expected Room Furniture Inventory JSON object.");
  if (typeof parsed.fileName !== "string") throw new Error("Expected inventory must include fileName.");
  if (!Array.isArray(parsed.rooms)) throw new Error("Expected inventory must include rooms array.");
  if (!parsed.summary || typeof parsed.summary !== "object") throw new Error("Expected inventory must include summary.");

  return {
    fileName: parsed.fileName,
    rooms: parsed.rooms,
    unassignedItems: Array.isArray(parsed.unassignedItems) ? parsed.unassignedItems : [],
    summary: parsed.summary
  } as RoomFurnitureInventory;
}

export function evaluateRoomFurnitureInventory(
  generated: RoomFurnitureInventory,
  expected: RoomFurnitureInventory
): RoomFurnitureInventoryEvaluationReport {
  const generatedItems = flattenInventoryItems(generated);
  const expectedItems = flattenInventoryItems(expected);
  const matches = expectedItems.map((expectedItem) => ({
    expected: expectedItem,
    actual: findInventoryItemMatch(generatedItems, expectedItem)
  }));
  const expectedPrimary = expectedItems.filter((item) => item.importance === "primary");
  const foundPrimary = matches.filter((match) => match.expected.importance === "primary" && match.actual).length;
  const primaryReadiness = expectedPrimary.length > 0 ? round(foundPrimary / expectedPrimary.length) : (generated.summary.totalPrimaryItems > 0 ? 1 : 0);
  const unassignedPrimaryItems = generatedItems.filter((item) => item.importance === "primary" && !item.roomId && item.status !== "ignored");
  const lowConfidencePrimaryItems = generatedItems.filter((item) => item.importance === "primary" && item.confidence < 0.55 && item.status !== "ignored");
  const level = getReadinessLevel(primaryReadiness, generated.summary.totalPrimaryItems, unassignedPrimaryItems.length);

  return {
    fileName: generated.fileName,
    roomsWithFurnitureFound: generated.rooms.filter((room) => room.items.some((item) => item.status !== "ignored")).length,
    primaryItems: {
      expected: expectedPrimary.length,
      found: foundPrimary,
      missing: matches.filter((match) => match.expected.importance === "primary" && !match.actual).map((match) => match.expected.itemId)
    },
    secondaryItems: {
      expected: expectedItems.filter((item) => item.importance === "secondary").length,
      found: matches.filter((match) => match.expected.importance === "secondary" && match.actual).length,
      missing: matches.filter((match) => match.expected.importance === "secondary" && !match.actual).map((match) => match.expected.itemId)
    },
    wrongCategory: matches
      .filter((match) => match.actual && match.actual.category !== match.expected.category)
      .map((match) => ({
        expectedItemId: match.expected.itemId,
        actualItemId: match.actual?.itemId,
        expectedCategory: match.expected.category,
        actualCategory: match.actual?.category
      })),
    wrongImportance: matches
      .filter((match) => match.actual && match.actual.importance !== match.expected.importance)
      .map((match) => ({
        expectedItemId: match.expected.itemId,
        actualItemId: match.actual?.itemId,
        expectedImportance: match.expected.importance,
        actualImportance: match.actual?.importance
      })),
    wrongRoomAssignments: matches
      .filter((match) => match.actual && match.expected.roomId && match.actual.roomId !== match.expected.roomId)
      .map((match) => ({
        expectedItemId: match.expected.itemId,
        actualItemId: match.actual?.itemId,
        expectedRoomId: match.expected.roomId,
        actualRoomId: match.actual?.roomId
      })),
    unassignedPrimaryItems,
    lowConfidencePrimaryItems,
    readiness: {
      level,
      primaryReadiness,
      reasons: readinessReasons(level, primaryReadiness, generated.summary.totalPrimaryItems, unassignedPrimaryItems.length)
    }
  };
}

export function flattenInventoryItems(inventory: RoomFurnitureInventory): FurnitureInventoryItem[] {
  return [
    ...inventory.rooms.flatMap((room) => room.items),
    ...inventory.unassignedItems
  ];
}

export function createInventoryCleanupReview(input: {
  inventory: RoomFurnitureInventory;
  context: ProjectContext;
  pages: PageReviewItem[];
  duplicateGroupStatuses?: Record<string, InventoryDuplicateGroupStatus>;
  roomCleanupStatuses?: Record<string, InventoryRoomCleanupStatus>;
}): InventoryCleanupReview {
  const allItems = flattenInventoryItems(input.inventory);
  const unassignedPrimaryItems = allItems
    .filter((item) => item.importance === "primary" && !item.roomId && item.status !== "ignored")
    .map((item) => {
      const suggestedRoom = suggestRoomForItem(item, input.context, input.pages);
      return {
        item,
        suggestedRoomId: suggestedRoom?.id,
        suggestedRoomLabel: suggestedRoom ? roomLabel(suggestedRoom) : undefined,
        reasons: suggestedRoom ? [`suggested from related page/title: ${suggestedRoom.nameOriginal}`] : ["no reliable room suggestion"]
      };
    });
  const duplicateGroups = detectDuplicateGroups(allItems, input.duplicateGroupStatuses ?? {});
  const roomsWithoutPrimary = input.inventory.rooms
    .filter((room) => !room.items.some((item) => item.importance === "primary" && item.status !== "ignored"))
    .map((room) => ({
      roomId: room.roomId,
      roomLabel: `${room.roomNumber ? `${room.roomNumber} ` : ""}${room.roomNameOriginal ?? room.roomType}`,
      roomType: room.roomType,
      relatedPageNumbers: room.sourcePageNumbers,
      status: input.roomCleanupStatuses?.[room.roomId] ?? "open"
    }));
  const unresolvedDuplicateGroups = duplicateGroups.filter((group) => group.status === "open");
  const unresolvedRoomsWithoutPrimary = roomsWithoutPrimary.filter((room) => room.status !== "no_custom_furniture");

  return {
    unassignedPrimaryItems,
    duplicateGroups,
    roomsWithoutPrimary,
    readiness: {
      unassignedPrimaryCount: unassignedPrimaryItems.length,
      duplicateGroupCount: unresolvedDuplicateGroups.length,
      roomsWithoutPrimaryCount: unresolvedRoomsWithoutPrimary.length,
      readyForDetailedExtraction: unassignedPrimaryItems.length === 0 && unresolvedDuplicateGroups.length === 0 && unresolvedRoomsWithoutPrimary.length === 0
    }
  };
}

function detectInventoryItems(context: ProjectContext, pages: PageReviewItem[]): FurnitureInventoryItem[] {
  const rawItems: Array<Omit<FurnitureInventoryItem, "itemId" | "displayName">> = [];

  for (const page of pages.filter((item) => item.finalType !== "irrelevant")) {
    const pageRooms = roomsForPage(context, page);
    const titleRoom = findRoomByTitle(context.rooms, pageTitle(page));
    const targetRoom =
      titleRoom ??
      (page.finalType === "furniture_schedule" && pageRooms.length === 1 ? pageRooms[0] : undefined) ??
      (page.finalType === "visualization" && pageRooms.length === 1 ? pageRooms[0] : undefined);
    const detections = detectFurniture(page.extractedText);

    for (const detection of detections) {
      const roomId = page.finalType === "floor_plan" || page.finalType === "measurement_floor_plan" ? undefined : targetRoom?.id;
      rawItems.push({
        category: detection.type,
        importance: getFurnitureImportance(detection.type),
        roomId,
        floorId: targetRoom?.floorId,
        sourcePageNumbers: [page.pageNumber],
        sourceTexts: [sourceTextPreview(page, detection.reasons[0] ?? pageTitle(page))],
        confidence: detection.confidence,
        reasons: [
          ...detection.reasons,
          roomId ? `room assignment: ${targetRoom?.nameOriginal ?? roomId}` : "room assignment: unassigned"
        ],
        status: "detected"
      });
    }
  }

  return assignStableNames(rawItems, context.rooms);
}

function assignStableNames(
  items: Array<Omit<FurnitureInventoryItem, "itemId" | "displayName">>,
  rooms: ContextRoom[]
): FurnitureInventoryItem[] {
  const counters = new Map<string, number>();

  return items.map((item) => {
    const room = rooms.find((candidate) => candidate.id === item.roomId);
    const roomKey = room ? roomKeyForItem(room) : "unassigned";
    const base = `${roomKey}_${item.category}`;
    const index = (counters.get(base) ?? 0) + 1;
    counters.set(base, index);
    const itemId = `${base}_${index}`;

    return {
      ...item,
      itemId,
      displayName: titleize(itemId)
    };
  });
}

function applyInventoryOverride(
  item: FurnitureInventoryItem,
  override: Partial<Pick<FurnitureInventoryItem, "category" | "importance" | "roomId" | "status">> | undefined
): FurnitureInventoryItem {
  if (!override) return item;
  const category = override.category ?? item.category;
  return {
    ...item,
    ...override,
    category,
    importance: override.importance ?? (override.category ? getFurnitureImportance(category) : item.importance)
  };
}

function dedupeInventoryItems(items: FurnitureInventoryItem[]): FurnitureInventoryItem[] {
  const byKey = new Map<string, FurnitureInventoryItem>();

  for (const item of items) {
    const key = `${item.category}|${item.roomId ?? "unassigned"}|${item.sourcePageNumbers.join(",")}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, item);
      continue;
    }

    existing.sourceTexts = Array.from(new Set([...existing.sourceTexts, ...item.sourceTexts]));
    existing.reasons = Array.from(new Set([...existing.reasons, ...item.reasons]));
    existing.confidence = Math.max(existing.confidence, item.confidence);
  }

  return Array.from(byKey.values());
}

function roomsForPage(context: ProjectContext, page: PageReviewItem): ContextRoom[] {
  return context.rooms.filter((room) => room.pageNumbers.includes(page.pageNumber));
}

function findRoomByTitle(rooms: ContextRoom[], title: string): ContextRoom | undefined {
  const titleFunctions = detectRoomFunctions(title);
  const normalizedTitle = normalizeText(title);
  return rooms.find((room) => {
    if (normalizeText(room.nameOriginal) && normalizedTitle.includes(normalizeText(room.nameOriginal))) return true;
    if (titleFunctions.includes(room.type as Exclude<typeof room.type, "unknown">)) return true;
    return (room.functions ?? []).some((roomFunction) => titleFunctions.includes(roomFunction));
  });
}

function suggestRoomForItem(item: FurnitureInventoryItem, context: ProjectContext, pages: PageReviewItem[]): ContextRoom | undefined {
  const sourcePages = pages.filter((page) => item.sourcePageNumbers.includes(page.pageNumber));
  const pageRooms = uniqueBy(
    sourcePages.flatMap((page) => context.rooms.filter((room) => room.pageNumbers.includes(page.pageNumber))),
    (room) => room.id
  );
  if (pageRooms.length === 1) return pageRooms[0];

  const categoryRoom = findRoomByFurnitureCategory(pageRooms, item.category);
  if (categoryRoom) return categoryRoom;

  for (const page of sourcePages) {
    const titleRoom = findRoomByTitle(context.rooms, pageTitle(page));
    if (titleRoom) return titleRoom;
  }

  return undefined;
}

function findRoomByFurnitureCategory(rooms: ContextRoom[], category: FurnitureCategory): ContextRoom | undefined {
  const preferredRoomTypes = roomTypesForFurnitureCategory(category);
  if (preferredRoomTypes.length === 0) return undefined;

  return rooms.find((room) =>
    preferredRoomTypes.includes(room.type) ||
    (room.functions ?? []).some((roomFunction) => preferredRoomTypes.includes(roomFunction))
  );
}

function roomTypesForFurnitureCategory(category: FurnitureCategory): Array<ContextRoom["type"]> {
  if (category === "kitchen" || category === "island" || category === "countertop") return ["kitchen_living_room", "kitchen"];
  if (category === "tv_unit") return ["kitchen_living_room", "living_room"];
  if (category === "toilet") return ["guest_wc", "wc", "bathroom"];
  if (category === "sink" || category === "vanity" || category === "shower" || category === "bathtub") return ["bathroom", "guest_wc", "wc"];
  if (category === "desk") return ["office", "children_room", "bedroom"];
  if (category === "bed") return ["bedroom", "children_room"];
  if (category === "laundry_cabinet" || category === "appliance") return ["utility_laundry", "laundry", "laundry_room", "kitchen_living_room", "kitchen"];
  return [];
}

function detectDuplicateGroups(
  items: FurnitureInventoryItem[],
  statuses: Record<string, InventoryDuplicateGroupStatus>
): InventoryCleanupReview["duplicateGroups"] {
  const buckets = new Map<string, FurnitureInventoryItem[]>();
  for (const item of items.filter((candidate) => candidate.status !== "ignored")) {
    const key = `${item.category}|${item.roomId ?? "unassigned"}`;
    buckets.set(key, [...(buckets.get(key) ?? []), item]);
  }

  const groups: InventoryCleanupReview["duplicateGroups"] = [];
  for (const bucketItems of buckets.values()) {
    const duplicateItems = bucketItems.filter((item, index) =>
      bucketItems.some((other, otherIndex) => index !== otherIndex && arePossibleDuplicates(item, other))
    );
    if (duplicateItems.length < 2) continue;

    const itemsById = [...duplicateItems].sort((left, right) => left.itemId.localeCompare(right.itemId));
    const category = itemsById[0].category;
    const roomId = itemsById[0].roomId;
    const groupId = `duplicate_${category}_${roomId ?? "unassigned"}_${itemsById.map((item) => item.itemId).join("_")}`;
    groups.push({
      groupId,
      category,
      roomId,
      sourcePageNumbers: Array.from(new Set(itemsById.flatMap((item) => item.sourcePageNumbers))).sort(numberSort),
      items: itemsById,
      status: statuses[groupId] ?? "open",
      reasons: ["same category and room with similar source text or nearby source pages"]
    });
  }

  return groups;
}

function arePossibleDuplicates(left: FurnitureInventoryItem, right: FurnitureInventoryItem): boolean {
  if (left.category !== right.category) return false;
  if ((left.roomId ?? "") !== (right.roomId ?? "")) return false;

  const leftPages = left.sourcePageNumbers;
  const rightPages = right.sourcePageNumbers;
  const nearbyPages = leftPages.some((leftPage) => rightPages.some((rightPage) => Math.abs(leftPage - rightPage) <= 1));
  return nearbyPages || sourceTextSimilarity(left.sourceTexts.join(" "), right.sourceTexts.join(" ")) >= 0.55;
}

function sourceTextSimilarity(left: string, right: string): number {
  const leftTokens = tokenSet(left);
  const rightTokens = tokenSet(right);
  if (leftTokens.size === 0 || rightTokens.size === 0) return 0;

  let intersection = 0;
  for (const token of leftTokens) {
    if (rightTokens.has(token)) intersection += 1;
  }
  const union = new Set([...leftTokens, ...rightTokens]).size;
  return union > 0 ? intersection / union : 0;
}

function tokenSet(value: string): Set<string> {
  return new Set(
    normalizeText(value)
      .split(/[^\p{L}\p{N}]+/u)
      .filter((token) => token.length > 2)
  );
}

function roomLabel(room: ContextRoom): string {
  return `${room.roomNumber ? `${room.roomNumber} ` : ""}${room.nameOriginal || room.type}`;
}

function pageTitle(page: PageReviewItem): string {
  return page.extractedText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) ?? page.extractedTextPreview;
}

function sourceTextPreview(page: PageReviewItem, fallback: string): string {
  return page.extractedTextPreview || pageTitle(page) || fallback;
}

function roomKeyForItem(room: ContextRoom): string {
  if (room.type !== "unknown") return room.type;
  if (room.roomNumber) return `room_${normalizeText(room.roomNumber).replace(/[^a-z0-9]+/g, "_")}`;
  return "room_unknown";
}

function titleize(value: string): string {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function findInventoryItemMatch(
  generatedItems: FurnitureInventoryItem[],
  expectedItem: FurnitureInventoryItem
): FurnitureInventoryItem | undefined {
  return generatedItems.find((item) => {
    if (item.itemId === expectedItem.itemId) return true;
    if (item.category !== expectedItem.category) return false;
    if (expectedItem.roomId && item.roomId !== expectedItem.roomId) return false;
    return true;
  });
}

function getReadinessLevel(primaryReadiness: number, totalPrimaryItems: number, unassignedPrimaryCount: number): "green" | "yellow" | "red" {
  if (totalPrimaryItems === 0 || primaryReadiness < 0.5) return "red";
  if (primaryReadiness >= 0.8 && unassignedPrimaryCount === 0) return "green";
  return "yellow";
}

function readinessReasons(level: "green" | "yellow" | "red", readiness: number, primaryCount: number, unassignedCount: number): string[] {
  if (level === "green") return ["Primary inventory is ready."];
  const reasons: string[] = [];
  if (primaryCount === 0) reasons.push("No primary furniture detected.");
  if (readiness < 0.8) reasons.push(`Primary readiness is ${Math.round(readiness * 100)}%.`);
  if (unassignedCount > 0) reasons.push(`${unassignedCount} primary items are unassigned.`);
  return reasons;
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}

function numberSort(left: number, right: number): number {
  return left - right;
}

function uniqueBy<T>(items: T[], getKey: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = getKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
