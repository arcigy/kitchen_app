import { normalizeText } from "./normalization";
import type {
  ContextRoom,
  DetailedFurnitureCategory,
  DetailedFurnitureComponent,
  DetailedFurnitureImportance,
  DetailedFurnitureItem,
  FurnitureCategory,
  FurnitureInventoryItem,
  PageReviewItem,
  ProjectContext,
  RoomDetailExtraction,
  RoomFurnitureInventory,
  RoomType
} from "./types";

interface BuildRoomDetailExtractionInput {
  fileName: string;
  context: ProjectContext;
  inventory: RoomFurnitureInventory;
  pages: PageReviewItem[];
  roomId?: string;
  roomType?: RoomType;
}

const DETAIL_CATEGORIES: DetailedFurnitureCategory[] = [
  "wardrobe",
  "built_in_cabinet",
  "cabinet",
  "shelves",
  "bench",
  "mirror",
  "wall_panel",
  "kitchen",
  "desk",
  "tv_unit",
  "vanity",
  "countertop",
  "appliance",
  "sink",
  "toilet",
  "bathtub",
  "shower",
  "bed",
  "chair",
  "table",
  "sofa",
  "armchair",
  "unknown"
];

export function buildRoomDetailExtraction(input: BuildRoomDetailExtractionInput): RoomDetailExtraction {
  const room = selectRoom(input.context.rooms, input.roomId, input.roomType ?? "entry_hall");
  if (!room) {
    return {
      fileName: input.fileName,
      roomId: input.roomId ?? input.roomType ?? "entry_hall",
      roomType: input.roomType ?? "entry_hall",
      sourcePageNumbers: [],
      items: [],
      warnings: ["Selected room was not found in Project Context."],
      confidence: 0
    };
  }

  const roomInventory = input.inventory.rooms.find((candidate) => candidate.roomId === room.id);
  const directItems = roomInventory?.items.filter((item) => item.status !== "ignored") ?? [];
  const roomSpecificUnassignedItems = input.inventory.unassignedItems.filter((item) =>
    item.status !== "ignored" && isRoomSpecificUnassignedItem(item, room, input.pages)
  );
  const detailSourceItems = dedupeSourceItems([...directItems, ...roomSpecificUnassignedItems]);
  const relatedPageNumbers = new Set([
    ...room.pageNumbers,
    ...(roomInventory?.sourcePageNumbers ?? []),
    ...detailSourceItems.flatMap((item) => item.sourcePageNumbers)
  ]);
  const pageTextByNumber = new Map(input.pages.map((page) => [page.pageNumber, page.extractedText]));
  const roomSpecificPages = input.pages.filter((page) => isRoomSpecificPage(page, room));
  const items = [
    ...detailSourceItems.map((item) => toDetailedFurnitureItem(item, room, pageTextByNumber)),
    ...createUnknownTechnicalSheetItems(room, roomSpecificPages, detailSourceItems)
  ];
  const warnings = createRoomDetailWarnings(room, items, Array.from(relatedPageNumbers));

  return {
    fileName: input.fileName,
    roomId: room.id,
    roomType: room.type,
    roomNameOriginal: room.nameOriginal,
    sourcePageNumbers: Array.from(relatedPageNumbers).sort(numberSort),
    items,
    warnings,
    confidence: round(confidenceForExtraction(room, items, warnings))
  };
}

export function parseRoomDetailExtractionJson(value: string): RoomDetailExtraction {
  const parsed = JSON.parse(value) as Partial<RoomDetailExtraction>;
  if (!parsed || typeof parsed !== "object") throw new Error("Expected Room Detail Extraction JSON object.");
  if (typeof parsed.fileName !== "string") throw new Error("Room Detail Extraction must include fileName.");
  if (typeof parsed.roomId !== "string") throw new Error("Room Detail Extraction must include roomId.");
  if (!Array.isArray(parsed.items)) throw new Error("Room Detail Extraction must include items array.");
  return parsed as RoomDetailExtraction;
}

function selectRoom(rooms: ContextRoom[], roomId: string | undefined, roomType: RoomType): ContextRoom | undefined {
  if (roomId) return rooms.find((room) => room.id === roomId);
  return rooms.find((room) => room.type === roomType || (room.functions ?? []).includes(roomType as Exclude<RoomType, "unknown">));
}

function toDetailedFurnitureItem(
  item: FurnitureInventoryItem,
  room: ContextRoom,
  pageTextByNumber: Map<number, string>
): DetailedFurnitureItem {
  const fullSourceTexts = item.sourcePageNumbers
    .map((pageNumber) => pageTextByNumber.get(pageNumber))
    .filter((text): text is string => Boolean(text));
  const sourceTexts = fullSourceTexts.length > 0 ? fullSourceTexts : item.sourceTexts;
  const dimensions = extractDimensions(sourceTexts.join("\n"));
  const category = normalizeDetailCategory(item.category);
  const importance = normalizeDetailImportance(item.importance);
  const components = detectComponents(category, sourceTexts.join("\n"));
  const materials = extractMaterials(sourceTexts.join("\n"));
  const reasons = [
    `inventory item: ${item.itemId}`,
    `room: ${room.nameOriginal}`,
    ...item.reasons,
    ...dimensions.rawDimensionTexts.map((text) => `dimension text: ${text}`),
    ...materials.map((material) => `material text: ${material.rawText}`)
  ];
  const needsHumanReview = shouldReviewItem(category, importance, dimensions.rawDimensionTexts.length, materials.length, item.confidence);

  return {
    itemId: item.itemId,
    displayName: item.displayName,
    category,
    importance,
    dimensions,
    components,
    materials,
    sourcePageNumbers: item.sourcePageNumbers,
    sourceTexts: item.sourceTexts,
    confidence: round(Math.min(0.92, item.confidence + (dimensions.rawDimensionTexts.length > 0 ? 0.08 : 0) + (materials.length > 0 ? 0.04 : 0))),
    needsHumanReview,
    reasons: needsHumanReview ? [...reasons, "human review required"] : reasons
  };
}

function isRoomSpecificUnassignedItem(item: FurnitureInventoryItem, room: ContextRoom, pages: PageReviewItem[]): boolean {
  const sourcePages = pages.filter((page) => item.sourcePageNumbers.includes(page.pageNumber));
  if (sourcePages.length === 0) return false;
  if (sourcePages.some((page) => page.finalType === "floor_plan" || page.finalType === "measurement_floor_plan")) return false;
  if (!sourcePages.some((page) => room.pageNumbers.includes(page.pageNumber))) return false;

  return sourcePages.some((page) => pageTitleMatchesRoom(page, room));
}

function isRoomSpecificPage(page: PageReviewItem, room: ContextRoom): boolean {
  if (page.finalType === "floor_plan" || page.finalType === "measurement_floor_plan" || page.finalType === "irrelevant") return false;
  if (!room.pageNumbers.includes(page.pageNumber)) return false;
  return pageTitleMatchesRoom(page, room);
}

function createUnknownTechnicalSheetItems(
  room: ContextRoom,
  pages: PageReviewItem[],
  sourceItems: FurnitureInventoryItem[]
): DetailedFurnitureItem[] {
  const hasPrimaryItem = sourceItems.some((item) => getInventoryImportance(item.category) === "primary");
  if (hasPrimaryItem || pages.length === 0) return [];

  const text = pages.map((page) => page.extractedText).join("\n");
  const dimensions = extractDimensions(text);
  const materials = extractMaterials(text);
  if (dimensions.rawDimensionTexts.length === 0 && materials.length === 0) return [];

  return [{
    itemId: `${room.type === "unknown" ? "room" : room.type}_unknown_technical_sheet_1`,
    displayName: `${titleize(room.type === "unknown" ? "Room" : room.type)} Unknown Technical Sheet 1`,
    category: "unknown",
    importance: "unknown",
    dimensions,
    components: ["unknown"],
    materials,
    sourcePageNumbers: pages.map((page) => page.pageNumber).sort(numberSort),
    sourceTexts: pages.map((page) => page.extractedTextPreview || page.extractedText.slice(0, 220)),
    confidence: 0.42,
    needsHumanReview: true,
    reasons: [
      "room-specific technical sheet has dimensions/materials but no reliable primary furniture keyword",
      "human review required"
    ]
  }];
}

function pageTitleMatchesRoom(page: PageReviewItem, room: ContextRoom): boolean {
  const title = page.extractedText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) ?? page.extractedTextPreview;
  const normalizedTitle = normalizeText(title);
  const normalizedName = normalizeText(room.nameOriginal);
  if (normalizedName && normalizedTitle.includes(normalizedName)) return true;
  if (room.type !== "unknown" && normalizedTitle.includes(normalizeText(room.type))) return true;
  return (room.functions ?? []).some((roomFunction) => normalizedTitle.includes(normalizeText(roomFunction)));
}

function dedupeSourceItems(items: FurnitureInventoryItem[]): FurnitureInventoryItem[] {
  const byId = new Map<string, FurnitureInventoryItem>();
  for (const item of items) byId.set(item.itemId, item);
  return Array.from(byId.values());
}

function normalizeDetailCategory(category: FurnitureCategory): DetailedFurnitureCategory {
  return DETAIL_CATEGORIES.includes(category as DetailedFurnitureCategory) ? category as DetailedFurnitureCategory : "unknown";
}

function normalizeDetailImportance(importance: string): DetailedFurnitureImportance {
  if (importance === "primary" || importance === "secondary") return importance;
  return "unknown";
}

export function extractDimensions(text: string): DetailedFurnitureItem["dimensions"] {
  const rawDimensionTexts = new Set<string>();
  let widthMm: number | null | undefined;
  let heightMm: number | null | undefined;
  let depthMm: number | null | undefined;

  for (const match of text.matchAll(/\b(\d{2,4})\s*(?:x|×|х)\s*(\d{2,4})\s*(?:x|×|х)\s*(\d{2,4})\b/giu)) {
    const values = [Number(match[1]), Number(match[2]), Number(match[3])].filter(isLikelyMillimeterValue);
    if (values.length !== 3) continue;
    rawDimensionTexts.add(match[0].trim());
    widthMm ??= values[0];
    depthMm ??= values[1];
    heightMm ??= values[2];
  }

  for (const match of text.matchAll(/(?:width|sirka|šírka|breite|ширина)\D{0,16}(\d{2,4})/giu)) {
    const value = Number(match[1]);
    if (!isLikelyMillimeterValue(value)) continue;
    rawDimensionTexts.add(match[0].trim());
    widthMm ??= value;
  }

  for (const match of text.matchAll(/(?:height|vyska|výška|hoehe|höhe|высота)\D{0,16}(\d{2,4})/giu)) {
    const value = Number(match[1]);
    if (!isLikelyMillimeterValue(value)) continue;
    rawDimensionTexts.add(match[0].trim());
    heightMm ??= value;
  }

  for (const match of text.matchAll(/(?:depth|hlbka|hĺbka|tiefe|глубина)\D{0,16}(\d{2,4})/giu)) {
    const value = Number(match[1]);
    if (!isLikelyMillimeterValue(value)) continue;
    rawDimensionTexts.add(match[0].trim());
    depthMm ??= value;
  }

  const dimensionNumbers = Array.from(text.matchAll(/\b(?:\d\s?\d{3}|[3-9]\d{2})\b/gu))
    .map((match) => match[0].replace(/\s+/g, ""))
    .map(Number)
    .filter(isLikelyMillimeterValue);
  if (rawDimensionTexts.size === 0 && dimensionNumbers.length >= 3) {
    rawDimensionTexts.add(`dimension numbers: ${dimensionNumbers.slice(0, 12).join(", ")}`);
  }

  return {
    widthMm: widthMm ?? null,
    heightMm: heightMm ?? null,
    depthMm: depthMm ?? null,
    rawDimensionTexts: Array.from(rawDimensionTexts).slice(0, 12)
  };
}

function detectComponents(category: DetailedFurnitureCategory, text: string): DetailedFurnitureComponent[] {
  const normalized = normalizeText(text);
  const components = new Set<DetailedFurnitureComponent>();

  if (category === "wardrobe" || category === "built_in_cabinet" || category === "cabinet") components.add("closed_cabinet");
  if (category === "shelves" || containsAny(normalized, ["polki", "police", "shelves", "regal", "полки", "полка"])) components.add("open_shelves");
  if (category === "bench" || containsAny(normalized, ["lavica", "bench", "bank", "лавка", "скамья"])) components.add("bench");
  if (category === "mirror" || containsAny(normalized, ["zrkadlo", "mirror", "spiegel", "зеркало"])) components.add("mirror");
  if (category === "wall_panel" || containsAny(normalized, ["panel", "obklad", "wandpaneel", "панел"])) components.add("wall_panel");
  if (containsAny(normalized, ["vesiak", "hanger", "kleiderstange", "вешал", "штанга"])) components.add("hanger_section");
  if (containsAny(normalized, ["zasuv", "drawer", "schublade", "ящик", "выдвиж"])) components.add("drawers");

  return components.size > 0 ? Array.from(components) : ["unknown"];
}

export function extractMaterials(text: string): DetailedFurnitureItem["materials"] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && isMaterialLine(line))
    .slice(0, 12)
    .map((line) => ({
      rawText: line,
      brand: extractBrand(line),
      code: extractMaterialCode(line),
      decorName: extractDecorName(line),
      confidence: extractBrand(line) || extractMaterialCode(line) ? 0.78 : 0.58
    }));
}

function isMaterialLine(line: string): boolean {
  const normalized = normalizeText(line);
  return containsAny(normalized, [
    "material",
    "materialy",
    "mat",
    "decor",
    "dekor",
    "egger",
    "kronospan",
    "blum",
    "laminat",
    "ldsp",
    "mdf",
    "материал",
    "декор",
    "лдсп",
    "мдф"
  ]);
}

function extractBrand(line: string): string | undefined {
  const match = /(egger|kronospan|blum|hafele|hettich)/iu.exec(line);
  return match?.[1];
}

function extractMaterialCode(line: string): string | undefined {
  const match = /\b[A-ZА-Я]{1,4}\s?-?\s?\d{2,5}\b/iu.exec(line);
  return match?.[0]?.replace(/\s+/g, " ").trim();
}

function extractDecorName(line: string): string | undefined {
  const normalized = line.replace(/\s+/g, " ").trim();
  if (normalized.length < 4) return undefined;
  return normalized.slice(0, 120);
}

function shouldReviewItem(
  category: DetailedFurnitureCategory,
  importance: DetailedFurnitureImportance,
  dimensionCount: number,
  materialCount: number,
  confidence: number
): boolean {
  if (category === "unknown" || importance === "unknown") return true;
  if (confidence < 0.65) return true;
  if (importance === "primary" && dimensionCount === 0) return true;
  if (importance === "primary" && materialCount === 0) return true;
  return false;
}

function getInventoryImportance(category: FurnitureCategory): "primary" | "secondary" | "unknown" {
  if ([
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
  ].includes(category)) return "primary";
  if (category === "unknown") return "unknown";
  return "secondary";
}

function titleize(value: string): string {
  return value
    .split("_")
    .filter(Boolean)
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function createRoomDetailWarnings(room: ContextRoom, items: DetailedFurnitureItem[], sourcePageNumbers: number[]): string[] {
  const warnings: string[] = [];
  if (sourcePageNumbers.length === 0) warnings.push("No source pages assigned to this room.");
  if (items.length === 0) warnings.push("No inventory items assigned to this room.");
  for (const item of items) {
    if (item.needsHumanReview) warnings.push(`${item.displayName} needs human review.`);
  }
  if (room.confidence < 0.7) warnings.push("Room detection confidence is low.");
  return Array.from(new Set(warnings));
}

function confidenceForExtraction(room: ContextRoom, items: DetailedFurnitureItem[], warnings: string[]): number {
  if (items.length === 0) return Math.min(room.confidence, 0.45);
  const itemAverage = items.reduce((sum, item) => sum + item.confidence, 0) / items.length;
  return Math.max(0, Math.min(1, (itemAverage + room.confidence) / 2 - warnings.length * 0.03));
}

function containsAny(text: string, terms: string[]): boolean {
  return terms.some((term) => text.includes(normalizeText(term)));
}

function isLikelyMillimeterValue(value: number): boolean {
  return Number.isFinite(value) && value >= 50 && value <= 5000;
}

function numberSort(left: number, right: number): number {
  return left - right;
}

function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}
