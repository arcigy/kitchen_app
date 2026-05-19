import type {
  ContextRoom,
  FurnitureInventoryItem,
  PageReviewItem,
  ProjectContext,
  RoomDetailExtraction,
  RoomFurnitureInventory
} from "./types";

export interface RoomDetailVisionInput {
  room: {
    roomId: string;
    roomType: string;
    roomNameOriginal?: string;
    sourcePageNumbers: number[];
  };
  sourcePages: Array<{
    pageNumber: number;
    finalType: PageReviewItem["finalType"];
    imageDataUrl: string;
    extractedText: string;
    title: string;
  }>;
  inventoryItems: FurnitureInventoryItem[];
  relatedPages: Array<{
    pageNumber: number;
    finalType: PageReviewItem["finalType"];
    title: string;
  }>;
}

export interface RoomDetailVisionExtractor {
  extractRoomDetail(input: RoomDetailVisionInput, prompt: string, existingTextExtraction?: RoomDetailExtraction): Promise<{ json: string; modelName?: string }>;
}

export interface RoomDetailVisionResult {
  extraction: RoomDetailExtraction;
  rawVisionResponse: RoomDetailExtraction;
  modelName?: string;
  prompt: string;
}

export function shouldRunVisionFallback(extraction: RoomDetailExtraction): boolean {
  const activeItems = extraction.items.filter((item) => item.importance !== "unknown" || item.category !== "unknown");
  const primaryCount = extraction.items.filter((item) => item.importance === "primary").length;
  return (
    primaryCount === 0 ||
    extraction.items.some((item) => item.category === "unknown") ||
    (activeItems.length > 0 && activeItems.every((item) => item.needsHumanReview))
  );
}

export function getConfiguredRoomDetailVisionExtractor(): RoomDetailVisionExtractor | undefined {
  if (typeof window === "undefined") return undefined;
  return backendRoomDetailVisionExtractor;
}

export function buildRoomDetailVisionInput(input: {
  room: ContextRoom;
  textExtraction: RoomDetailExtraction;
  inventory: RoomFurnitureInventory;
  pages: PageReviewItem[];
  context: ProjectContext;
}): RoomDetailVisionInput {
  const sourcePageSet = new Set(input.textExtraction.sourcePageNumbers);
  const sourcePages = input.pages
    .filter((page) => sourcePageSet.has(page.pageNumber))
    .map((page) => ({
      pageNumber: page.pageNumber,
      finalType: page.finalType,
      imageDataUrl: page.thumbnailDataUrl,
      extractedText: page.extractedText,
      title: pageTitle(page)
    }));
  const roomInventory = input.inventory.rooms.find((room) => room.roomId === input.room.id);

  return {
    room: {
      roomId: input.room.id,
      roomType: input.room.type,
      roomNameOriginal: input.room.nameOriginal,
      sourcePageNumbers: input.textExtraction.sourcePageNumbers
    },
    sourcePages,
    inventoryItems: [
      ...(roomInventory?.items ?? []),
      ...input.inventory.unassignedItems.filter((item) =>
        item.sourcePageNumbers.some((pageNumber) => sourcePageSet.has(pageNumber))
      )
    ],
    relatedPages: input.pages
      .filter((page) => input.context.rooms.some((room) => room.id === input.room.id && room.pageNumbers.includes(page.pageNumber)))
      .map((page) => ({
        pageNumber: page.pageNumber,
        finalType: page.finalType,
        title: pageTitle(page)
      }))
  };
}

export function createRoomDetailVisionPrompt(input: RoomDetailVisionInput): string {
  return [
    "Analyze only the selected room.",
    `Room: ${input.room.roomType} ${input.room.roomNameOriginal ?? ""}`.trim(),
    "Use only provided source page images/thumbnails and extracted text.",
    "Identify main custom furniture from technical sheets.",
    "Think in furniture structure terms: assembly/group vs standalone item vs integrated accessory.",
    "Do not extract deep module parameters or exact shelf/door/drawer counts.",
    "Do not invent dimensions.",
    "If dimensions are visible, store them as rawDimensionTexts; map widthMm/heightMm/depthMm only when clear.",
    "Return strict JSON matching RoomDetailExtraction schema.",
    "Every item must include confidence, reasons, and needsHumanReview.",
    `Source pages: ${input.room.sourcePageNumbers.join(", ")}`
  ].join("\n");
}

export async function runRoomDetailVisionExtraction(input: {
  textExtraction: RoomDetailExtraction;
  visionInput: RoomDetailVisionInput;
  provider?: RoomDetailVisionExtractor;
}): Promise<RoomDetailVisionResult | null> {
  const provider = input.provider ?? getConfiguredRoomDetailVisionExtractor();
  if (!provider) return null;

  const prompt = createRoomDetailVisionPrompt(input.visionInput);
  const response = await provider.extractRoomDetail(input.visionInput, prompt, input.textExtraction);
  const visionExtraction = parseRoomDetailVisionJson(response.json);

  return {
    extraction: mergeRoomDetailExtractions(input.textExtraction, visionExtraction),
    rawVisionResponse: visionExtraction,
    modelName: response.modelName,
    prompt
  };
}

const backendRoomDetailVisionExtractor: RoomDetailVisionExtractor = {
  async extractRoomDetail(input, _prompt, existingTextExtraction) {
    const response = await fetch("/api/room-detail-vision", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        room: input.room,
        sourcePages: input.sourcePages.map((page) => ({
          pageNumber: page.pageNumber,
          imageDataUrl: page.imageDataUrl,
          extractedText: page.extractedText,
          title: page.title
        })),
        existingTextExtraction
      })
    });
    const data = await response.json() as { ok?: boolean; error?: string; extraction?: RoomDetailExtraction; modelName?: string };
    if (!response.ok || data.ok === false) throw new Error(data.error || `Vision request failed: HTTP ${response.status}`);
    if (!data.extraction) throw new Error("Vision response did not include extraction.");
    return {
      json: JSON.stringify(data.extraction),
      modelName: data.modelName
    };
  }
};

export function parseRoomDetailVisionJson(value: string): RoomDetailExtraction {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    throw new Error("Vision room detail response must be valid JSON.");
  }

  if (!parsed || typeof parsed !== "object") throw new Error("Vision room detail response must be an object.");
  const candidate = parsed as Partial<RoomDetailExtraction>;
  if (typeof candidate.fileName !== "string") throw new Error("Vision room detail response must include fileName.");
  if (typeof candidate.roomId !== "string") throw new Error("Vision room detail response must include roomId.");
  if (typeof candidate.roomType !== "string") throw new Error("Vision room detail response must include roomType.");
  if (!Array.isArray(candidate.sourcePageNumbers)) throw new Error("Vision room detail response must include sourcePageNumbers.");
  if (!Array.isArray(candidate.items)) throw new Error("Vision room detail response must include items.");
  if (!Array.isArray(candidate.warnings)) throw new Error("Vision room detail response must include warnings.");
  if (typeof candidate.confidence !== "number") throw new Error("Vision room detail response must include confidence.");

  for (const item of candidate.items) validateVisionItem(item);
  return candidate as RoomDetailExtraction;
}

export function mergeRoomDetailExtractions(text: RoomDetailExtraction, vision: RoomDetailExtraction): RoomDetailExtraction {
  const itemsByKey = new Map<string, RoomDetailExtraction["items"][number]>();
  for (const item of text.items) itemsByKey.set(item.itemId, item);

  for (const item of vision.items) {
    const existing = itemsByKey.get(item.itemId) ?? itemsByKey.get(`${text.roomType}_${item.category}_1`);
    if (!existing) {
      itemsByKey.set(item.itemId, item);
      continue;
    }

    itemsByKey.set(existing.itemId, {
      ...existing,
      ...item,
      itemId: existing.itemId,
      sourcePageNumbers: uniqueNumbers([...existing.sourcePageNumbers, ...item.sourcePageNumbers]),
      sourceTexts: uniqueStrings([...existing.sourceTexts, ...item.sourceTexts]),
      dimensions: {
        widthMm: existing.dimensions.widthMm ?? item.dimensions.widthMm ?? null,
        heightMm: existing.dimensions.heightMm ?? item.dimensions.heightMm ?? null,
        depthMm: existing.dimensions.depthMm ?? item.dimensions.depthMm ?? null,
        rawDimensionTexts: uniqueStrings([...existing.dimensions.rawDimensionTexts, ...item.dimensions.rawDimensionTexts])
      },
      components: uniqueStrings([...existing.components, ...item.components]) as typeof existing.components,
      materials: mergeMaterials(existing.materials, item.materials),
      confidence: Math.max(existing.confidence, item.confidence),
      needsHumanReview: existing.needsHumanReview || item.needsHumanReview,
      reasons: uniqueStrings([...existing.reasons, ...item.reasons, "merged vision detail"])
    });
  }

  const items = Array.from(itemsByKey.values());
  return {
    ...text,
    sourcePageNumbers: uniqueNumbers([...text.sourcePageNumbers, ...vision.sourcePageNumbers]),
    items,
    warnings: uniqueStrings([...text.warnings, ...vision.warnings]),
    confidence: Math.max(text.confidence, vision.confidence)
  };
}

function validateVisionItem(value: unknown): void {
  const item = value as Partial<RoomDetailExtraction["items"][number]>;
  if (typeof item.itemId !== "string") throw new Error("Vision item must include itemId.");
  if (typeof item.displayName !== "string") throw new Error("Vision item must include displayName.");
  if (typeof item.category !== "string") throw new Error("Vision item must include category.");
  if (item.importance !== "primary" && item.importance !== "secondary" && item.importance !== "unknown") throw new Error("Vision item must include valid importance.");
  if (!item.dimensions || !Array.isArray(item.dimensions.rawDimensionTexts)) throw new Error("Vision item must include dimensions.rawDimensionTexts.");
  if (!Array.isArray(item.components)) throw new Error("Vision item must include components.");
  if (!Array.isArray(item.materials)) throw new Error("Vision item must include materials.");
  if (!Array.isArray(item.sourcePageNumbers)) throw new Error("Vision item must include sourcePageNumbers.");
  if (!Array.isArray(item.sourceTexts)) throw new Error("Vision item must include sourceTexts.");
  if (typeof item.confidence !== "number") throw new Error("Vision item must include confidence.");
  if (typeof item.needsHumanReview !== "boolean") throw new Error("Vision item must include needsHumanReview.");
  if (!Array.isArray(item.reasons)) throw new Error("Vision item must include reasons.");
}

function mergeMaterials(
  left: RoomDetailExtraction["items"][number]["materials"],
  right: RoomDetailExtraction["items"][number]["materials"]
): RoomDetailExtraction["items"][number]["materials"] {
  const byText = new Map<string, RoomDetailExtraction["items"][number]["materials"][number]>();
  for (const material of [...left, ...right]) {
    const key = material.rawText.toLowerCase();
    const existing = byText.get(key);
    byText.set(key, existing ? { ...existing, ...material, confidence: Math.max(existing.confidence, material.confidence) } : material);
  }
  return Array.from(byText.values());
}

function uniqueNumbers(values: number[]): number[] {
  return Array.from(new Set(values)).sort((left, right) => left - right);
}

function uniqueStrings<T extends string>(values: T[]): T[] {
  return Array.from(new Set(values));
}

function pageTitle(page: PageReviewItem): string {
  return page.extractedText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) ?? page.extractedTextPreview;
}
