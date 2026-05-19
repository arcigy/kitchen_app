import { FURNITURE_ENTRIES, ROOM_ENTRIES } from "./dictionaries";
import { normalizeText } from "./normalization";
import type {
  ContextFloor,
  ContextFurniture,
  ContextRoom,
  FurnitureType,
  PageReviewItem,
  ProjectContext,
  RoomType
} from "./types";

type RoomFunction = Exclude<RoomType, "unknown">;

interface BuildProjectContextInput {
  pages: PageReviewItem[];
  roomOverrides?: Record<string, Partial<Pick<ContextRoom, "type" | "functions" | "roomNumber" | "nameOriginal" | "floorId" | "area">>>;
  furnitureOverrides?: Record<string, Partial<Pick<ContextFurniture, "type" | "roomId" | "pageNumber">>>;
  pageRoomOverrides?: Record<number, string | string[] | undefined>;
}

interface RoomTableRow {
  roomNumber: string;
  nameOriginal: string;
  area: number;
  confidence?: number;
  reasons?: string[];
}

export interface ExtractedRoomTableRoom {
  roomNumber: string;
  nameOriginal: string;
  nameNormalized: RoomType;
  areaM2: number;
  confidence: number;
  reasons: string[];
}

export interface RoomTableExtractionResult {
  rooms: ExtractedRoomTableRoom[];
  confidence: number;
  formatDetected: "row" | "column_block" | "mixed" | "none";
  warnings: string[];
}

const ROOM_TABLE_ROW_RE = /^(\d{2})\s+(.+?)\s+(\d{1,3}(?:[\.,]\d{1,2})?)\s*(?:m2|m\u00b2|\u043c2|\u043c\u00b2)?$/iu;
const EMBEDDED_ROOM_TABLE_ROW_RE = /(?:^|[^\p{L}\p{N}])(\d{2})\s+([^\d\n]+?)\s+(\d{1,3}(?:[\.,]\d{1,2})?)(?=$|[^\p{L}\p{N}])/giu;
const FLOOR_RE = /(?:^|\s)([0-9]+)\s*(?:\.|-?\s*\u0439)?\s*(np|og|floor|\u044d\u0442\u0430\u0436)(?=\s|$)/giu;
const FLOOR_PREFIX_RE = /(?:^|\s)(?:floor|\u044d\u0442\u0430\u0436)\s*([0-9]+)(?=\s|$)/giu;

export function buildProjectContext(input: BuildProjectContextInput): ProjectContext {
  const floorsById = new Map<string, ContextFloor>();
  const rooms: ContextRoom[] = [];
  const furniture: ContextFurniture[] = [];
  const pageToRooms = new Map<number, Set<string>>();
  const floorPlanPages = input.pages.filter((page) => isPlanPage(page));
  const furnitureSourcePages = input.pages.filter((page) => page.finalType === "furniture_schedule" || page.finalType === "visualization");

  for (const page of floorPlanPages) {
    const normalized = normalizeText(page.extractedText);
    const floors = detectFloors(normalized, page.pageNumber);
    for (const floor of floors) mergeFloor(floorsById, floor);

    const extraction = extractRoomTable(page.extractedText);
    for (const row of extraction.rooms) {
      const room = roomFromTableRow({
        roomNumber: row.roomNumber,
        nameOriginal: row.nameOriginal,
        area: row.areaM2,
        confidence: row.confidence,
        reasons: row.reasons
      }, page.pageNumber, floors[0]?.id);
      mergeRoom(rooms, room);
    }
  }

  for (const page of input.pages.filter((item) => item.finalType !== "irrelevant")) {
    const normalized = normalizeText(page.extractedText);
    const detectedRoomIds =
      isPlanPage(page)
        ? rooms.filter((room) => room.pageNumbers.includes(page.pageNumber)).map((room) => room.id)
        : [findBestRoomForText(rooms, normalized)?.id].filter((roomId): roomId is string => Boolean(roomId));
    const roomIds = normalizeRoomOverride(input.pageRoomOverrides?.[page.pageNumber]) ?? detectedRoomIds;

    if (roomIds.length > 0) {
      pageToRooms.set(page.pageNumber, new Set(roomIds));
      for (const roomId of roomIds) {
        const room = rooms.find((item) => item.id === roomId);
        if (room && !room.pageNumbers.includes(page.pageNumber)) room.pageNumbers.push(page.pageNumber);
      }
    }
  }

  for (const page of furnitureSourcePages) {
    const roomIds = Array.from(pageToRooms.get(page.pageNumber) ?? []);
    const roomId = isPlanPage(page) ? undefined : roomIds[0];

    const detectedFurniture = detectFurniture(page.extractedText).map((item, index) => ({
      id: `furniture_${page.pageNumber}_${index + 1}_${item.type}`,
      type: item.type,
      roomId,
      pageNumber: page.pageNumber,
      confidence: item.confidence,
      reasons: item.reasons
    }));
    furniture.push(...detectedFurniture);
  }

  for (const room of rooms) {
    const override = input.roomOverrides?.[room.id];
    if (override?.type) room.type = override.type;
    if (override?.functions) room.functions = override.functions;
    if (override?.roomNumber !== undefined) room.roomNumber = override.roomNumber || undefined;
    if (override?.nameOriginal !== undefined) room.nameOriginal = override.nameOriginal;
    if (override?.floorId !== undefined) room.floorId = override.floorId || undefined;
    if (override?.area !== undefined) room.area = override.area;
  }

  for (const item of furniture) {
    const override = input.furnitureOverrides?.[item.id];
    if (override?.type) item.type = override.type;
    if (override?.roomId !== undefined) item.roomId = override.roomId || undefined;
    if (override?.pageNumber !== undefined) item.pageNumber = override.pageNumber;
  }

  return {
    floors: Array.from(floorsById.values()).sort((left, right) => left.id.localeCompare(right.id)),
    rooms,
    furniture,
    unassignedPages: input.pages
      .filter((page) => !pageToRooms.has(page.pageNumber) && page.finalType !== "irrelevant")
      .map((page) => page.pageNumber)
  };
}

function isPlanPage(page: PageReviewItem): boolean {
  return page.finalType === "floor_plan" || page.finalType === "measurement_floor_plan";
}

export function normalizeRoom(name: string): RoomType {
  return detectRoomFunctions(name)[0] ?? "unknown";
}

export function detectRoomFunctions(name: string): RoomFunction[] {
  const normalized = normalizeText(name);
  const normalizedSpaced = normalizeLooseText(name);
  const functions: RoomFunction[] = [];

  for (const [type, entry] of Object.entries(ROOM_ENTRIES) as Array<[RoomFunction, typeof ROOM_ENTRIES[RoomFunction]]>) {
    if (entry.synonyms.some((synonym) => normalized.includes(synonym) || normalizedSpaced.includes(normalizeLooseText(synonym)))) functions.push(type);
  }

  if (/\bprac/.test(normalized)) {
    const officeIndex = functions.indexOf("office");
    if (officeIndex >= 0) functions.splice(officeIndex, 1);
    if (!functions.includes("laundry_room")) functions.push("laundry_room");
  }

  if (/\bprad/i.test(normalized) && !functions.includes("laundry_room")) {
    functions.push("laundry_room");
  }

  return functions;
}

export function extractRoomTable(text: string): RoomTableExtractionResult {
  const rowRooms = detectRoomTableRows(text).map((row) => toExtractedRoom(row, 0.95, ["room table: row format"]));
  const embeddedRows = detectEmbeddedRoomTableRows(text).map((row) => toExtractedRoom(row, 0.86, ["room table: embedded row format"]));
  const columnRooms = detectColumnBlockRoomTable(text);
  const mixedRooms = detectMixedRoomTable(text);
  const candidates = [
    { rooms: rowRooms, formatDetected: "row" as const, warnings: [] as string[] },
    { rooms: embeddedRows, formatDetected: "mixed" as const, warnings: ["Room table included rows with dimension text before room number."] },
    { rooms: columnRooms, formatDetected: "column_block" as const, warnings: [] as string[] },
    { rooms: mixedRooms, formatDetected: "mixed" as const, warnings: ["Room table was reconstructed from mixed line order."] }
  ].filter((candidate) => candidate.rooms.length > 0);

  const best = candidates.sort((left, right) =>
    right.rooms.length - left.rooms.length ||
    averageConfidence(right.rooms) - averageConfidence(left.rooms)
  )[0];

  if (best) {
    return {
      rooms: best.rooms,
      confidence: averageConfidence(best.rooms),
      formatDetected: best.formatDetected,
      warnings: best.warnings
    };
  }

  return {
    rooms: [],
    confidence: 0,
    formatDetected: "none",
    warnings: ["No room table detected."]
  };
}

export function detectFurniture(text: string): Array<{ type: Exclude<FurnitureType, "unknown">; confidence: number; reasons: string[] }> {
  const normalized = normalizeText(text);
  const results: Array<{ type: Exclude<FurnitureType, "unknown">; confidence: number; reasons: string[] }> = [];

  for (const [type, entry] of Object.entries(FURNITURE_ENTRIES) as Array<[Exclude<FurnitureType, "unknown">, typeof FURNITURE_ENTRIES[Exclude<FurnitureType, "unknown">]]>) {
    const matches = entry.synonyms.filter((synonym) => containsTerm(normalized, synonym));
    if (matches.length === 0) continue;

    results.push({
      type,
      confidence: Math.min(0.3 + (matches.length > 1 ? 0.2 : 0), 0.8),
      reasons: matches.map((match) => `dictionary: ${match}`)
    });
  }

  return results;
}

export function detectFloors(text: string, pageNumber = 0): ContextFloor[] {
  const floors: ContextFloor[] = [];
  const normalized = normalizeText(text);

  for (const match of normalized.matchAll(FLOOR_RE)) {
    const floorNumber = Number(match[1]);
    if (!Number.isFinite(floorNumber)) continue;

    floors.push({
      id: `floor_${floorNumber}`,
      label: `floor_${floorNumber}`,
      pageNumbers: pageNumber > 0 ? [pageNumber] : [],
      confidence: 0.82,
      reasons: [`pattern: ${match[0]}`]
    });
  }

  for (const match of normalized.matchAll(FLOOR_PREFIX_RE)) {
    const floorNumber = Number(match[1]);
    if (!Number.isFinite(floorNumber)) continue;

    floors.push({
      id: `floor_${floorNumber}`,
      label: `floor_${floorNumber}`,
      pageNumbers: pageNumber > 0 ? [pageNumber] : [],
      confidence: 0.82,
      reasons: [`pattern: ${match[0].trim()}`]
    });
  }

  return uniqueBy(floors, (floor) => floor.id);
}

export function detectRoomTableRows(text: string): RoomTableRow[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .map((line) => ROOM_TABLE_ROW_RE.exec(line))
    .filter((match): match is RegExpExecArray => Boolean(match))
    .map((match) => ({
      roomNumber: match[1],
      nameOriginal: match[2].trim(),
      area: Number(match[3].replace(",", "."))
    }))
    .filter(isLikelyRoomTableRow);
}

function detectEmbeddedRoomTableRows(text: string): RoomTableRow[] {
  const rows: RoomTableRow[] = [];

  for (const line of text.split(/\r?\n/)) {
    for (const match of line.matchAll(EMBEDDED_ROOM_TABLE_ROW_RE)) {
      const row = {
        roomNumber: match[1],
        nameOriginal: match[2].trim(),
        area: Number(match[3].replace(",", "."))
      };
      if (isLikelyRoomTableRow(row)) rows.push(row);
    }
  }

  return uniqueBy(rows, (row) => `${row.roomNumber}|${normalizeText(row.nameOriginal)}|${row.area}`);
}

function detectColumnBlockRoomTable(text: string): ExtractedRoomTableRoom[] {
  const lines = cleanedLines(text);
  const numberHeaderIndex = lines.findIndex(isRoomNumberHeader);
  const nameHeaderIndex = lines.findIndex(isRoomNameHeader);
  const areaHeaderIndex = lines.findIndex(isAreaHeader);

  if (numberHeaderIndex < 0 || nameHeaderIndex < 0 || areaHeaderIndex < 0) return [];
  if (!(numberHeaderIndex < nameHeaderIndex && nameHeaderIndex < areaHeaderIndex)) return [];

  const numbers = lines.slice(numberHeaderIndex + 1, nameHeaderIndex).filter(isRoomNumberToken);
  const names = lines.slice(nameHeaderIndex + 1, areaHeaderIndex).filter(isLikelyRoomNameLine);
  const areas = lines.slice(areaHeaderIndex + 1).map(parseAreaToken).filter((area): area is number => area !== undefined);
  const count = Math.min(numbers.length, names.length, areas.length);

  if (count === 0) return [];

  return Array.from({ length: count }, (_, index) => toExtractedRoom({
    roomNumber: numbers[index],
    nameOriginal: names[index],
    area: areas[index]
  }, 0.95, ["room table: column block format"]));
}

function detectMixedRoomTable(text: string): ExtractedRoomTableRoom[] {
  const lines = cleanedLines(text);
  const numbers = lines.filter(isRoomNumberToken);
  const names = lines.filter(isLikelyRoomNameLine);
  const areas = lines.map(parseAreaToken).filter((area): area is number => area !== undefined);
  const count = Math.min(numbers.length, names.length, areas.length);

  if (count < 2) return [];

  return Array.from({ length: count }, (_, index) => toExtractedRoom({
    roomNumber: numbers[index],
    nameOriginal: names[index],
    area: areas[index]
  }, 0.68, ["room table: mixed format"]));
}

function toExtractedRoom(row: RoomTableRow, confidence: number, reasons: string[]): ExtractedRoomTableRoom {
  return {
    roomNumber: row.roomNumber,
    nameOriginal: row.nameOriginal,
    nameNormalized: normalizeRoom(row.nameOriginal),
    areaM2: row.area,
    confidence,
    reasons
  };
}

function roomFromTableRow(row: RoomTableRow, pageNumber: number, floorId: string | undefined): ContextRoom {
  const roomFunctions = detectRoomFunctions(row.nameOriginal);
  const roomType: RoomType = roomFunctions.length > 0 ? roomFunctions[0] : "unknown";

  return {
    id: `room_${floorId ?? "floor_unknown"}_${row.roomNumber}_${normalizeText(row.nameOriginal).replace(/[^\p{L}\p{N}]+/gu, "_")}_${Math.round(row.area * 100)}`,
    type: roomType,
    functions: roomFunctions,
    roomNumber: row.roomNumber,
    nameOriginal: row.nameOriginal,
    area: row.area,
    floorId,
    pageNumbers: [pageNumber],
    confidence: row.confidence ?? (roomType === "unknown" ? 0.45 : 0.78),
    reasons: [
      `room table row: ${row.roomNumber}`,
      roomType === "unknown" ? "room dictionary: unknown" : `room dictionary: ${roomType}`,
      ...(row.reasons ?? [])
    ]
  };
}

function cleanedLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function isRoomNumberHeader(line: string): boolean {
  const normalized = normalizeText(line);
  return normalized === "no" || normalized === "n" || line === "\u2116" || normalized.includes("room no");
}

function isRoomNameHeader(line: string): boolean {
  const normalized = normalizeText(line);
  return normalized.includes("naimenovanie") || normalized.includes("\u043d\u0430\u0438\u043c\u0435\u043d\u043e\u0432\u0430\u043d\u0438\u0435") || normalized.includes("name") || normalized.includes("nazov") || normalized.includes("miestnost");
}

function isAreaHeader(line: string): boolean {
  const normalized = normalizeText(line);
  const lower = line.toLowerCase();
  return normalized === "m2" || normalized.includes("m2") || lower.includes("m\u00b2") || lower.includes("\u043c\u00b2");
}

function isRoomNumberToken(line: string): boolean {
  return /^\d{2}$/.test(line.trim());
}

function isLikelyRoomNameLine(line: string): boolean {
  if (isRoomNumberToken(line) || parseAreaToken(line) !== undefined) return false;
  if (isRoomNumberHeader(line) || isRoomNameHeader(line) || isAreaHeader(line)) return false;

  const letters = line.match(/\p{L}/gu) ?? [];
  return letters.length >= 2;
}

function parseAreaToken(line: string): number | undefined {
  const trimmed = line.trim();
  const match = /^(\d{1,3}(?:[\.,]\d{1,2})?)\s*(?:m2|m\u00b2|\u043c2|\u043c\u00b2)?$/iu.exec(trimmed);
  if (!match) return undefined;

  const value = Number(match[1].replace(",", "."));
  if (!Number.isFinite(value) || value < 0.5 || value > 250) return undefined;
  return value;
}

function averageConfidence(rooms: Array<{ confidence: number }>): number {
  if (rooms.length === 0) return 0;
  return Math.round((rooms.reduce((sum, room) => sum + room.confidence, 0) / rooms.length) * 10000) / 10000;
}

function isLikelyRoomTableRow(row: RoomTableRow): boolean {
  if (!Number.isFinite(row.area) || row.area < 0.5 || row.area > 250) return false;

  const letterMatches = row.nameOriginal.match(/\p{L}/gu) ?? [];
  if (letterMatches.length < 2) return false;

  const digitMatches = row.nameOriginal.match(/\p{N}/gu) ?? [];
  return digitMatches.length <= letterMatches.length;
}

function findBestRoomForText(rooms: ContextRoom[], normalizedText: string): ContextRoom | undefined {
  let best: { room: ContextRoom; score: number } | undefined;

  for (const room of rooms) {
    const normalizedName = normalizeText(room.nameOriginal);
    const score = [
      normalizedName && normalizedText.includes(normalizedName) ? 2 : 0,
      room.roomNumber && normalizedText.includes(room.roomNumber) ? 1 : 0,
      room.type !== "unknown" && ROOM_ENTRIES[room.type]?.synonyms.some((synonym) => containsTerm(normalizedText, synonym)) ? 1 : 0
    ].reduce((sum, value) => sum + value, 0);

    if (score > 0 && (!best || score > best.score)) best = { room, score };
  }

  return best?.room;
}

function normalizeRoomOverride(value: string | string[] | undefined): string[] | undefined {
  if (value === undefined) return undefined;
  return (Array.isArray(value) ? value : [value]).filter(Boolean);
}

function containsTerm(text: string, term: string): boolean {
  if (!term) return false;
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, "u").test(text);
}

function mergeFloor(floorsById: Map<string, ContextFloor>, floor: ContextFloor): void {
  const existing = floorsById.get(floor.id);
  if (!existing) {
    floorsById.set(floor.id, floor);
    return;
  }

  for (const pageNumber of floor.pageNumbers) {
    if (!existing.pageNumbers.includes(pageNumber)) existing.pageNumbers.push(pageNumber);
  }
  existing.reasons.push(...floor.reasons);
  existing.confidence = Math.max(existing.confidence, floor.confidence);
}

function mergeRoom(rooms: ContextRoom[], room: ContextRoom): void {
  const existing = rooms.find((item) => item.id === room.id);
  if (!existing) {
    rooms.push(room);
    return;
  }

  for (const pageNumber of room.pageNumbers) {
    if (!existing.pageNumbers.includes(pageNumber)) existing.pageNumbers.push(pageNumber);
  }

  if (!existing.floorId && room.floorId) existing.floorId = room.floorId;
  existing.confidence = Math.max(existing.confidence, room.confidence);
  existing.reasons = Array.from(new Set([...existing.reasons, ...room.reasons]));
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

function normalizeLooseText(value: string): string {
  return normalizeText(value)
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}
