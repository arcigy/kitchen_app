import { ROOM_ENTRIES } from "./dictionaries";
import { normalizeText } from "./normalization";
import { detectRoomFunctions, extractRoomTable, normalizeRoom } from "./projectContextBuilder";
import type {
  DocumentMap,
  DocumentMapDocumentKind,
  DocumentMapPage,
  DocumentMapPageType,
  DocumentMapRoom,
  DocumentMapTechnicalSubtype,
  ExtraExtractedParameter,
  PageReviewItem,
  RoomPageLink,
  RoomTableFormat
} from "./types";

export const DOCUMENT_MAP_PAGE_TYPES: DocumentMapPageType[] = [
  "furniture_floor_plan",
  "measurement_floor_plan",
  "technical_floor_plan",
  "furniture_technical_sheet",
  "visualization",
  "irrelevant",
  "unknown"
];

export interface DocumentMapOverrides {
  pageOverrides?: Record<number, Partial<Pick<DocumentMapPage, "pageType" | "floorId" | "isPrimaryFurniturePlan">>>;
  roomOverrides?: Record<string, Partial<Pick<DocumentMapRoom, "roomType">>>;
  pageRoomOverrides?: Record<number, string | null | undefined>;
}

type DocumentMapPageOverride = Partial<Pick<DocumentMapPage, "pageType" | "floorId" | "isPrimaryFurniturePlan">>;

interface BuildDocumentMapInput extends DocumentMapOverrides {
  fileName: string;
  pages: PageReviewItem[];
}

interface PageClassificationResult {
  pageType: DocumentMapPageType;
  documentKind: DocumentMapDocumentKind;
  technicalSubtype: DocumentMapTechnicalSubtype | null;
  confidence: number;
  reasons: string[];
  excludeReason?: string | null;
}

interface FloorDetection {
  floorId: string | null;
  floorOriginal: string | null;
  confidence: number;
  reason: string;
}

const TECHNICAL_RULES: Array<{ subtype: DocumentMapTechnicalSubtype; kind: DocumentMapDocumentKind; patterns: RegExp[] }> = [
  { subtype: "plumbing", kind: "plumbing_plan", patterns: [/zti/u, /santechnik/u, /sanitar/u, /сантех/u, /plumbing/u, /voda/u, /kanaliz/u] },
  { subtype: "heating", kind: "heating_plan", patterns: [/kureni/u, /kurenie/u, /heating/u, /heizung/u, /отоплен/u] },
  { subtype: "sockets", kind: "sockets_plan", patterns: [/zasuv/u, /rozet/u, /розет/u, /steckdos/u] },
  { subtype: "switches", kind: "switches_plan", patterns: [/vypinac/u, /vypinace/u, /выключател/u, /schalter/u] },
  { subtype: "lighting", kind: "lighting_plan", patterns: [/osvetlen/u, /освещ/u, /lighting/u, /beleucht/u] },
  { subtype: "electrical", kind: "electrical_plan", patterns: [/elektro/u, /electrical/u, /электр/u, /elektrovyvod/u] },
  { subtype: "ventilation", kind: "ventilation_plan", patterns: [/vetran/u, /ventilation/u, /вентиляц/u] },
  { subtype: "demolition", kind: "demolition_plan", patterns: [/buracie/u, /demolition/u, /демонтаж/u] },
  { subtype: "installation", kind: "installation_plan", patterns: [/montaz/u, /montaz/u, /installation/u, /монтаж/u] },
  { subtype: "wall_finish", kind: "wall_finish_plan", patterns: [/plan obklad/u, /obklady stien/u, /wall finish plan/u, /отделка стен/u] },
  { subtype: "flooring", kind: "flooring_plan", patterns: [/plan podlah/u, /podlahy plan/u, /flooring plan/u, /наполь/u] },
  { subtype: "ceiling", kind: "ceiling_plan", patterns: [/strop/u, /ceiling/u, /потол/u] },
  { subtype: "doors", kind: "door_plan", patterns: [/dvere/u, /doors/u, /двер/u] },
  { subtype: "sections", kind: "sections", patterns: [/rezy/u, /section/u, /schnitt/u, /разрез/u] }
];

const TITLE_PRIORITY_PATTERNS = [
  /план мебели/iu,
  /обмерный план/iu,
  /план\s+(?:сантехники|розеток|выключателей|освещения)/iu,
  /схема мебели/iu,
  /визуализац/iu,
  /furniture\s+(?:layout|plan|detail|technical sheet)/iu,
  /measurement\s+plan/iu,
  /measured\s+floor\s+plan/iu,
  /m[oö]belplan/iu,
  /m[oö]bel\s+schema/iu,
  /visualisierung/iu,
  /vizualiz/u,
  /render/u,
  /plan nabytku/u,
  /schema nabytku/u,
  /p[oôu]dorys/u,
  /grundriss/u
];

const MEASUREMENT_FLOOR_PLAN_KEYWORDS = [
  "obmerny plan",
  "obmerny podorys",
  "obmerovy plan",
  "obmerovy podorys",
  "obmer",
  "zameranie",
  "zamereni",
  "zamerovaci plan",
  "zameriavaci plan",
  "pasport",
  "pasportizacia",
  "pasportizace",
  "povodny stav",
  "existujuci stav",
  "stavebny stav",
  "stavebni stav",
  "skutkovy stav",
  "stav pred upravou",
  "stav pred rekonstrukciou",
  "stav pred rekonstrukci",
  "measurement plan",
  "measured floor plan",
  "measured plan",
  "measurement floor plan",
  "as built plan",
  "as-built plan",
  "existing plan",
  "existing floor plan",
  "existing conditions",
  "survey plan",
  "building survey",
  "measured survey",
  "dimension plan",
  "walls and dimensions",
  "dimensioned plan",
  "grundriss",
  "bestandsplan",
  "bestand",
  "aufmass",
  "aufmassplan",
  "vermassung",
  "vermasster grundriss",
  "podorys",
  "pudorys",
  "floor plan",
  "обмерный план",
  "обмер",
  "план обмера",
  "план замера",
  "замерный план",
  "исходный план",
  "существующий план",
  "план существующего положения",
  "план до демонтажа"
];

const TECHNICAL_FLOOR_PLAN_KEYWORDS: Array<{ subtype: DocumentMapTechnicalSubtype; kind: DocumentMapDocumentKind; keywords: string[] }> = [
  { subtype: "plumbing", kind: "plumbing_plan", keywords: ["zti", "zdravotechnika", "santechnika", "sanitar", "plumbing", "voda", "kanalizacia", "сантехника"] },
  { subtype: "heating", kind: "heating_plan", keywords: ["kurenie", "kureni", "heating", "heizung", "отопление"] },
  { subtype: "sockets", kind: "sockets_plan", keywords: ["zasuvky", "zasuvka", "rozet", "steckdos", "розетки"] },
  { subtype: "switches", kind: "switches_plan", keywords: ["vypinace", "vypinac", "schalter", "выключатели"] },
  { subtype: "lighting", kind: "lighting_plan", keywords: ["osvetlenie", "lighting", "beleuchtung", "освещение"] },
  { subtype: "electrical", kind: "electrical_plan", keywords: ["elektro", "elektroinstalacia", "electrical", "электро"] },
  { subtype: "ventilation", kind: "ventilation_plan", keywords: ["vetranie", "ventilation", "вентиляция"] },
  { subtype: "demolition", kind: "demolition_plan", keywords: ["buracie", "demolition", "demontaz", "демонтаж"] },
  { subtype: "installation", kind: "installation_plan", keywords: ["montaz", "plan montaze", "installation", "монтаж", "план монтажа"] },
  { subtype: "wall_finish", kind: "wall_finish_plan", keywords: ["obklady stien", "wall finish", "отделка стен"] },
  { subtype: "flooring", kind: "flooring_plan", keywords: ["plan podlah", "flooring plan", "напольное покрытие"] },
  { subtype: "ceiling", kind: "ceiling_plan", keywords: ["strop", "ceiling", "потолок"] },
  { subtype: "doors", kind: "door_plan", keywords: ["dvere", "doors", "двери"] },
  { subtype: "sections", kind: "sections", keywords: ["rezy", "section", "schnitt", "разрез"] }
];

export function buildDocumentMap(input: BuildDocumentMapInput): DocumentMap {
  const mapPages = input.pages.map((page) => buildDocumentMapPage(page, input.pageOverrides?.[page.pageNumber]));
  const rooms = mergeRooms(mapPages.flatMap((page) => page.roomsDetected), input.roomOverrides);
  const pagesWithPrimary = selectPrimaryPlans(mapPages);
  const roomPageLinks = buildRoomPageLinks(pagesWithPrimary, rooms, input.pageRoomOverrides);
  const floors = buildFloors(pagesWithPrimary, rooms);
  const warnings = [
    ...pagesWithPrimary.flatMap((page) => page.warnings.map((warning) => `page ${page.pageNumber}: ${warning}`)),
    ...floors.flatMap((floor) => floor.warnings.map((warning) => `${floor.floorId}: ${warning}`))
  ];
  const confidences = [
    ...pagesWithPrimary.map((page) => page.confidence),
    ...rooms.map((room) => room.confidence),
    ...roomPageLinks.map((link) => link.confidence)
  ];

  return {
    fileName: input.fileName,
    documentMapVersion: "1.0",
    pages: pagesWithPrimary,
    floors,
    roomPageLinks,
    warnings,
    confidence: confidences.length > 0 ? round(average(confidences)) : 0
  };
}

export function parseDocumentMapJson(value: string): DocumentMap {
  const parsed = JSON.parse(value) as Partial<DocumentMap>;
  if (!parsed || typeof parsed !== "object") throw new Error("Expected Document Map JSON object.");
  if (typeof parsed.fileName !== "string") throw new Error("Expected Document Map must include fileName.");
  if (!Array.isArray(parsed.pages)) throw new Error("Expected Document Map must include pages array.");
  if (!Array.isArray(parsed.floors)) throw new Error("Expected Document Map must include floors array.");
  if (!Array.isArray(parsed.roomPageLinks)) throw new Error("Expected Document Map must include roomPageLinks array.");

  return {
    fileName: parsed.fileName,
    documentMapVersion: "1.0",
    pages: parsed.pages,
    floors: parsed.floors,
    roomPageLinks: parsed.roomPageLinks,
    warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
    confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0
  };
}

export function extractPageTitle(text: string): string | null {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 2)
    .filter((line) => !isMetadataLine(line));

  const priority = lines.find((line) => TITLE_PRIORITY_PATTERNS.some((pattern) => pattern.test(line)));
  if (priority) return priority.slice(0, 160);

  const readable = lines.find((line) => {
    const letters = line.match(/\p{L}/gu) ?? [];
    return letters.length >= 4 && line.length <= 120;
  });

  return readable?.slice(0, 160) ?? null;
}

export function classifyDocumentMapPage(text: string, title = extractPageTitle(text)): PageClassificationResult {
  const haystack = normalizeText(`${title ?? ""}\n${text}`);
  const titleText = normalizeText(title ?? "");

  if (containsAny(haystack, ["schema mebeli", "схема мебели", "schema nabytku", "vykres nabytku", "furniture technical sheet", "furniture detail", "mobel schema", "möbel schema", "3d schema", "korpus nabytku", "skrinka", "skrina", "polica"])) {
    return {
      pageType: "furniture_technical_sheet",
      documentKind: "furniture_technical_sheet",
      technicalSubtype: null,
      confidence: 0.9,
      reasons: ["title keyword: furniture technical sheet"]
    };
  }

  if (containsAny(haystack, ["vizualizacia", "vizualizace", "visualization", "visualisierung", "визуализация", "render"]) || /^визуализац/iu.test(titleText)) {
    return {
      pageType: "visualization",
      documentKind: "room_visualization",
      technicalSubtype: null,
      confidence: 0.88,
      reasons: ["title keyword: visualization"]
    };
  }

  if (containsAny(haystack, ["plan mebeli", "план мебели", "furniture layout", "furniture plan", "mobelplan", "möbelplan", "plan nabytku", "podorys nabytku", "pudorys nabytku", "dispozicia nabytku"])) {
    return {
      pageType: "furniture_floor_plan",
      documentKind: "furniture_plan",
      technicalSubtype: null,
      confidence: 0.88,
      reasons: ["title keyword: furniture floor plan"]
    };
  }

  const technical = findTechnicalRule(haystack) ?? findTechnicalKeywordRule(haystack);
  if (!technical && containsAny(haystack, MEASUREMENT_FLOOR_PLAN_KEYWORDS)) {
    return {
      pageType: "measurement_floor_plan",
      documentKind: "measurement_plan",
      technicalSubtype: null,
      confidence: 0.8,
      reasons: ["title keyword: measurement floor plan"]
    };
  }

  if (technical) {
    return {
      pageType: "technical_floor_plan",
      documentKind: technical.kind,
      technicalSubtype: technical.subtype,
      confidence: 0.9,
      reasons: [`technical subtype: ${technical.subtype}`],
      excludeReason: "technical floor plan"
    };
  }

  if (containsAny(haystack, ["obmerny plan", "обмерный план", "measurement plan", "measured floor plan", "zameranie", "grundriss", "podorys", "pudorys", "floor plan"])) {
    return {
      pageType: "measurement_floor_plan",
      documentKind: "measurement_plan",
      technicalSubtype: null,
      confidence: 0.78,
      reasons: ["title keyword: measurement floor plan"]
    };
  }

  if (containsAny(haystack, ["technicka sprava", "technical report", "technische beschreibung", "gspublisherversion", "zoznam vykresov"])) {
    return {
      pageType: "irrelevant",
      documentKind: "technical_report",
      technicalSubtype: null,
      confidence: 0.76,
      reasons: ["irrelevant metadata/report keyword"],
      excludeReason: "technical report or metadata"
    };
  }

  return {
    pageType: "unknown",
    documentKind: "unknown",
    technicalSubtype: null,
    confidence: 0.25,
    reasons: ["no reliable text-only document map keyword"],
    excludeReason: "unknown document kind"
  };
}

export function normalizeFloorLabel(text: string): FloorDetection {
  const normalized = normalizeText(text);
  const direct = /(?:^|[^\p{L}\p{N}])([1-9]\d*)\s*\.?\s*(?:np|этаж|etaz)(?=$|[^\p{L}\p{N}])/u.exec(normalized)
    ?? /(?:^|[^\p{L}\p{N}])(?:floor|этаж|etaz)\s*([1-9]\d*)(?=$|[^\p{L}\p{N}])/u.exec(normalized);
  if (direct) {
    return {
      floorId: `floor_${Number(direct[1])}`,
      floorOriginal: direct[0].trim(),
      confidence: 0.88,
      reason: `floor pattern: ${direct[0].trim()}`
    };
  }

  const second = /(?:^|[^\p{L}\p{N}])(2nd|2\s*og|2\.?\s*og|2\s*floor|obergeschoss)(?=$|[^\p{L}\p{N}])/u.exec(normalized);
  if (second) return { floorId: "floor_2", floorOriginal: second[0].trim(), confidence: 0.8, reason: `floor pattern: ${second[0].trim()}` };

  const firstOg = /(?:^|[^\p{L}\p{N}])(1\s*og|1\.?\s*og|1st floor)(?=$|[^\p{L}\p{N}])/u.exec(normalized);
  if (firstOg) return { floorId: "floor_2", floorOriginal: firstOg[0].trim(), confidence: 0.68, reason: `European upper floor pattern: ${firstOg[0].trim()}` };

  const ground = /(?:^|[^\p{L}\p{N}])(eg|erdgeschoss|ground floor|prizemie|prizemi)(?=$|[^\p{L}\p{N}])/u.exec(normalized);
  if (ground) return { floorId: "floor_1", floorOriginal: ground[0].trim(), confidence: 0.82, reason: `ground floor pattern: ${ground[0].trim()}` };

  return { floorId: null, floorOriginal: null, confidence: 0, reason: "no floor detected" };
}

function buildDocumentMapPage(page: PageReviewItem, override?: DocumentMapPageOverride): DocumentMapPage {
  const title = extractPageTitle(page.extractedText);
  const classification = classifyDocumentMapPage(page.extractedText, title);
  const floor = normalizeFloorLabel(`${title ?? ""}\n${page.extractedText}`);
  const roomTable = extractRoomTable(page.extractedText);
  const floorId = override?.floorId !== undefined ? override.floorId : floor.floorId;
  const roomHints = detectRoomFunctions(`${title ?? ""}\n${page.extractedText}`);
  const pageType = override?.pageType ?? pageReviewTypeToDocumentMapPageType(page.finalType) ?? classification.pageType;
  const isRoomLegend = isRoomLegendPage(`${title ?? ""}\n${page.extractedText}`);
  const canExtractRooms = ((pageType === "furniture_floor_plan" || pageType === "measurement_floor_plan") || isRoomLegend) && roomTable.confidence >= 0.85;
  const roomTableWarnings = pageType === "furniture_floor_plan" || pageType === "measurement_floor_plan" || isRoomLegend
    ? roomTable.warnings
    : roomTable.rooms.length > 0
      ? ["room table ignored: non-floor-plan page"]
      : [];
  const roomsDetected = canExtractRooms ? roomTable.rooms.map((room) => ({
    roomId: `${floorId ?? "floor_unknown"}_room_${room.roomNumber}`,
    roomNumber: room.roomNumber,
    nameOriginal: room.nameOriginal,
    roomType: room.nameNormalized,
    floorId: floorId ?? "floor_unknown",
    knownParameters: { areaM2: room.areaM2 },
    extraParameters: extractExtraParameters(page.extractedText, page.pageNumber),
    sourcePageNumbers: [page.pageNumber],
    confidence: room.confidence,
    warnings: room.nameNormalized === "unknown" ? ["room type unknown"] : []
  } satisfies DocumentMapRoom)) : [];
  const confidence = override ? Math.max(classification.confidence, 0.82) : classification.confidence;
  const warnings = [
    ...roomTableWarnings,
    ...(classification.pageType === "unknown" ? ["page type unknown"] : []),
    ...(!floorId && pageType !== "irrelevant" && pageType !== "unknown" ? ["floor unknown"] : [])
  ];

  return {
    pageNumber: page.pageNumber,
    pageTitleOriginal: title,
    pageTitleNormalized: title ? normalizeText(title) : null,
    pageType,
    documentKind: override?.pageType || pageReviewTypeToDocumentMapPageType(page.finalType) ? documentKindForPageType(pageType, classification.documentKind) : classification.documentKind,
    technicalSubtype: classification.technicalSubtype,
    floorId,
    floorOriginal: floor.floorOriginal,
    roomHints,
    roomNameOriginalHints: roomHints.length > 0 ? extractRoomNameHints(title ?? page.extractedText) : [],
    isPrimaryFurniturePlan: override?.isPrimaryFurniturePlan ?? false,
    isFallbackMeasurementPlan: false,
    roomsDetected,
    roomTableDetected: roomTable.rooms.length > 0,
    roomTableFormat: roomTable.formatDetected,
    roomTableConfidence: roomTable.confidence,
    excludeReason: classification.excludeReason ?? null,
    confidence,
    needsReview: confidence < 0.65 || warnings.length > 0,
    reasons: [
      ...classification.reasons,
      ...(floor.floorId ? [floor.reason] : []),
      ...(roomTable.rooms.length > 0 ? [`room table: ${roomTable.formatDetected}`] : [])
    ],
    warnings
  };
}

function selectPrimaryPlans(pages: DocumentMapPage[]): DocumentMapPage[] {
  const pagesByFloor = groupBy(pages.filter((page) => page.floorId), (page) => page.floorId ?? "");
  const primaryPages = new Set<number>();
  const fallbackPages = new Set<number>();

  for (const floorPages of pagesByFloor.values()) {
    const furniturePlans = floorPages.filter((page) => page.pageType === "furniture_floor_plan").sort((left, right) => right.confidence - left.confidence);
    const measurementPlans = floorPages.filter((page) => page.pageType === "measurement_floor_plan").sort((left, right) => right.confidence - left.confidence);
    if (furniturePlans.length > 0) primaryPages.add(furniturePlans[0].pageNumber);
    if (furniturePlans.length === 0 && measurementPlans.length > 0) fallbackPages.add(measurementPlans[0].pageNumber);
  }

  return pages.map((page) => ({
    ...page,
    isPrimaryFurniturePlan: page.isPrimaryFurniturePlan || primaryPages.has(page.pageNumber),
    isFallbackMeasurementPlan: fallbackPages.has(page.pageNumber)
  }));
}

function mergeRooms(rooms: DocumentMapRoom[], overrides?: DocumentMapOverrides["roomOverrides"]): DocumentMapRoom[] {
  const byKey = new Map<string, DocumentMapRoom>();
  for (const room of rooms) {
    const key = `${room.floorId}:${room.roomNumber ?? ""}:${room.roomType}:${room.knownParameters.areaM2 ?? ""}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, room);
      continue;
    }

    existing.sourcePageNumbers = uniqueNumbers([...existing.sourcePageNumbers, ...room.sourcePageNumbers]);
    existing.confidence = Math.max(existing.confidence, room.confidence);
    existing.warnings = Array.from(new Set([...existing.warnings, ...room.warnings]));
    existing.extraParameters = mergeParameters([...existing.extraParameters, ...room.extraParameters]);
  }

  return Array.from(byKey.values())
    .map((room) => ({ ...room, ...(overrides?.[room.roomId] ?? {}) }))
    .sort((left, right) => left.floorId.localeCompare(right.floorId) || String(left.roomNumber ?? "").localeCompare(String(right.roomNumber ?? "")));
}

function buildFloors(pages: DocumentMapPage[], rooms: DocumentMapRoom[]): DocumentMap["floors"] {
  const floorIds = Array.from(new Set([
    ...pages.map((page) => page.floorId).filter((floorId): floorId is string => Boolean(floorId)),
    ...rooms.map((room) => room.floorId)
  ])).sort();

  return floorIds.map((floorId) => {
    const floorPages = pages.filter((page) => page.floorId === floorId);
    const primaryFurniturePlanPages = floorPages.filter((page) => page.isPrimaryFurniturePlan && page.pageType === "furniture_floor_plan").map((page) => page.pageNumber);
    const fallbackMeasurementPlanPages = floorPages.filter((page) => page.isFallbackMeasurementPlan).map((page) => page.pageNumber);
    const warnings: string[] = [];
    if (primaryFurniturePlanPages.length === 0 && fallbackMeasurementPlanPages.length === 0) warnings.push("no primary furniture or fallback measurement plan");
    if (primaryFurniturePlanPages.length > 1) warnings.push("multiple primary furniture plan candidates");
    return {
      floorId,
      floorOriginalLabels: Array.from(new Set(floorPages.map((page) => page.floorOriginal).filter((label): label is string => Boolean(label)))),
      primaryFurniturePlanPages,
      fallbackMeasurementPlanPages,
      technicalPlanPages: floorPages.filter((page) => page.pageType === "technical_floor_plan").map((page) => page.pageNumber),
      rooms: rooms.filter((room) => room.floorId === floorId),
      confidence: floorPages.length > 0 ? round(average(floorPages.map((page) => page.confidence))) : 0.5,
      warnings
    };
  });
}

function buildRoomPageLinks(
  pages: DocumentMapPage[],
  rooms: DocumentMapRoom[],
  overrides?: DocumentMapOverrides["pageRoomOverrides"]
): RoomPageLink[] {
  const links = new Map<string, RoomPageLink>();

  for (const page of pages) {
    const linkType = linkTypeForPage(page);
    if (!linkType) continue;

    const overrideRoomId = overrides?.[page.pageNumber];
    const matchedRooms = overrideRoomId !== undefined
      ? rooms.filter((room) => room.roomId === overrideRoomId)
      : findMatchingRoomsForPage(page, rooms);

    if (matchedRooms.length === 0) {
      const key = `unassigned:${page.pageNumber}`;
      links.set(key, {
        roomId: null,
        roomType: page.roomHints[0] ?? null,
        roomNameOriginal: page.roomNameOriginalHints[0] ?? null,
        floorId: page.floorId ?? null,
        pageNumbers: [page.pageNumber],
        linkTypes: [linkType],
        confidence: 0.3,
        reasons: ["no safe room match"]
      });
      continue;
    }

    for (const room of matchedRooms) {
      const key = `${room.roomId}:${linkType}`;
      const existing = links.get(key);
      if (existing) {
        existing.pageNumbers = uniqueNumbers([...existing.pageNumbers, page.pageNumber]);
        existing.confidence = Math.max(existing.confidence, linkConfidence(page, room));
        continue;
      }

      links.set(key, {
        roomId: room.roomId,
        roomType: room.roomType,
        roomNameOriginal: room.nameOriginal ?? null,
        floorId: room.floorId,
        pageNumbers: [page.pageNumber],
        linkTypes: [linkType],
        confidence: linkConfidence(page, room),
        reasons: [`${linkType} matched to ${room.roomType}`]
      });
    }
  }

  return Array.from(links.values()).sort((left, right) => (left.roomId ?? "").localeCompare(right.roomId ?? "") || left.pageNumbers[0] - right.pageNumbers[0]);
}

function findMatchingRoomsForPage(page: DocumentMapPage, rooms: DocumentMapRoom[]): DocumentMapRoom[] {
  if (page.pageType === "furniture_floor_plan" || page.pageType === "measurement_floor_plan") {
    return rooms.filter((room) => room.floorId === page.floorId && room.sourcePageNumbers.includes(page.pageNumber));
  }

  const text = normalizeText([
    page.pageTitleOriginal,
    page.pageTitleNormalized,
    page.roomHints.join(" "),
    page.roomNameOriginalHints.join(" ")
  ].filter(Boolean).join(" "));
  const sameFloorRooms = page.floorId ? rooms.filter((room) => room.floorId === page.floorId) : rooms;

  return sameFloorRooms.filter((room) => roomMatchesText(room, text));
}

function roomMatchesText(room: DocumentMapRoom, normalizedText: string): boolean {
  if (!normalizedText) return false;
  const roomName = normalizeText(room.nameOriginal ?? "");
  if (roomName && (normalizedText.includes(roomName) || roomName.includes(normalizedText))) return true;
  const parts = roomName.split(/[^a-z0-9а-яё]+/iu).filter((part) => part.length >= 4);
  if (parts.some((part) => normalizedText.includes(part))) return true;
  return Boolean(ROOM_ENTRIES[room.roomType as keyof typeof ROOM_ENTRIES]?.synonyms.some((synonym) => normalizedText.includes(synonym)));
}

function extractRoomNameHints(text: string): string[] {
  const cleaned = text.replace(/\s+/g, " ").trim();
  const match = /(?:схема мебели|визуализация|furniture detail|furniture technical sheet|visualization|visualisierung|schema nabytku|vizualizacia)\s+(.{2,80})/iu.exec(cleaned);
  return match ? [match[1].trim()] : [];
}

function isRoomLegendPage(text: string): boolean {
  const normalized = normalizeText(text);
  return normalized.includes("legenda miestnosti")
    || normalized.includes("legend miestnosti")
    || normalized.includes("legenda mistnosti")
    || normalized.includes("room legend")
    || normalized.includes("легенда помещений")
    || normalized.includes("naimenovanie");
}

function extractExtraParameters(text: string, sourcePageNumber: number): ExtraExtractedParameter[] {
  const parameters: ExtraExtractedParameter[] = [];
  const patterns: Array<{ key: keyof DocumentMapRoom["knownParameters"] | "extra"; keyNormalized: string; regex: RegExp }> = [
    { key: "floorFinish", keyNormalized: "floor_finish", regex: /(material podlahy|podlaha|floor material|floor finish|покрытие пола)\s*[:\-]\s*(.+)/iu },
    { key: "wallFinish", keyNormalized: "wall_finish", regex: /(material stien|steny|wall material|wall finish|отделка стен)\s*[:\-]\s*(.+)/iu },
    { key: "ceilingFinish", keyNormalized: "ceiling_finish", regex: /(strop|ceiling|потолок)\s*[:\-]\s*(.+)/iu },
    { key: "extra", keyNormalized: "material", regex: /(egger|kronospan|dtd|mdf|lamino)\s+(.+)/iu }
  ];

  for (const line of text.split(/\r?\n/).map((item) => item.trim()).filter(Boolean)) {
    for (const pattern of patterns) {
      const match = pattern.regex.exec(line);
      if (!match) continue;
      parameters.push({
        keyOriginal: match[1],
        keyNormalized: pattern.keyNormalized,
        valueOriginal: match[2]?.trim() || match[0],
        valueNormalized: normalizeText(match[2]?.trim() || match[0]),
        unit: null,
        sourcePageNumber,
        confidence: 0.72,
        reason: pattern.key === "extra" ? "Detected material-like value." : `Detected ${pattern.keyNormalized}.`
      });
    }
  }

  return mergeParameters(parameters);
}

function findTechnicalRule(text: string): { subtype: DocumentMapTechnicalSubtype; kind: DocumentMapDocumentKind } | undefined {
  return TECHNICAL_RULES.find((rule) => rule.patterns.some((pattern) => pattern.test(text)));
}

function findTechnicalKeywordRule(text: string): { subtype: DocumentMapTechnicalSubtype; kind: DocumentMapDocumentKind } | undefined {
  const rule = TECHNICAL_FLOOR_PLAN_KEYWORDS.find((item) => containsAny(text, item.keywords));
  return rule ? { subtype: rule.subtype, kind: rule.kind } : undefined;
}

function documentKindForPageType(pageType: DocumentMapPageType, fallback: DocumentMapDocumentKind): DocumentMapDocumentKind {
  if (pageType === "furniture_floor_plan") return "furniture_plan";
  if (pageType === "measurement_floor_plan") return "measurement_plan";
  if (pageType === "furniture_technical_sheet") return "furniture_technical_sheet";
  if (pageType === "visualization") return "room_visualization";
  if (pageType === "technical_floor_plan") return fallback === "unknown" ? "installation_plan" : fallback;
  return fallback;
}

function pageReviewTypeToDocumentMapPageType(pageType: PageReviewItem["finalType"]): DocumentMapPageType | null {
  if (pageType === "measurement_floor_plan") return "measurement_floor_plan";
  return null;
}

function linkTypeForPage(page: DocumentMapPage): RoomPageLink["linkTypes"][number] | null {
  if (page.pageType === "furniture_technical_sheet") return "furniture_technical_sheet";
  if (page.pageType === "visualization") return "visualization";
  if (page.pageType === "furniture_floor_plan") return "furniture_floor_plan";
  if (page.pageType === "measurement_floor_plan") return "measurement_floor_plan";
  if (page.pageType === "technical_floor_plan") return "technical_context";
  return null;
}

function linkConfidence(page: DocumentMapPage, room: DocumentMapRoom): number {
  const normalized = normalizeText(`${page.pageTitleOriginal ?? ""} ${page.roomHints.join(" ")} ${page.roomNameOriginalHints.join(" ")}`);
  if (room.nameOriginal && normalized.includes(normalizeText(room.nameOriginal))) return 0.9;
  if (roomMatchesText(room, normalized)) return 0.78;
  return 0.5;
}

function containsAny(text: string, needles: string[]): boolean {
  return needles.some((needle) => text.includes(normalizeText(needle)));
}

function isMetadataLine(line: string): boolean {
  const normalized = normalizeText(line);
  return normalized.includes("gspublisherversion")
    || /^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/.test(normalized)
    || normalized.includes("datum")
    || normalized.includes("architekt")
    || normalized.includes("client")
    || normalized.includes("mierka")
    || normalized.includes("scale");
}

function groupBy<T>(items: T[], getKey: (item: T) => string): Map<string, T[]> {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = getKey(item);
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return groups;
}

function uniqueNumbers(values: number[]): number[] {
  return Array.from(new Set(values)).sort((left, right) => left - right);
}

function mergeParameters(parameters: ExtraExtractedParameter[]): ExtraExtractedParameter[] {
  const seen = new Set<string>();
  return parameters.filter((parameter) => {
    const key = `${parameter.keyNormalized}:${parameter.valueNormalized}:${parameter.sourcePageNumber}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}
