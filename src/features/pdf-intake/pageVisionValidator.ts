import type { PageVisionValidationInput, PageVisionValidationResult } from "./types";

export interface PageVisionValidatorProvider {
  validatePages(input: PageVisionValidationInput[], prompt: string): Promise<{ json: string; modelName?: string }>;
}

export interface PageVisionValidationRun {
  modelName?: string;
  results: PageVisionValidationResult[];
}

const PAGE_KINDS = new Set([
  "furniture_floor_plan",
  "measurement_floor_plan",
  "technical_floor_plan",
  "furniture_technical_sheet",
  "visualization",
  "irrelevant",
  "unknown"
]);

const WALL_VISIBILITY = new Set(["high", "medium", "low", "none", "unknown"]);

export async function runPageVisionValidation(input: {
  pages: PageVisionValidationInput[];
  provider: PageVisionValidatorProvider;
}): Promise<PageVisionValidationRun> {
  const prompt = createPageVisionValidatorPrompt(input.pages);
  const response = await input.provider.validatePages(input.pages, prompt);
  return {
    modelName: response.modelName,
    results: parsePageVisionValidationJson(response.json)
  };
}

export function createPageVisionValidatorPrompt(pages: PageVisionValidationInput[]): string {
  const pageSummary = pages.map((page) => `- page ${page.pageNumber}: title="${page.title ?? ""}", textPreview="${page.extractedText.replace(/\s+/g, " ").slice(0, 500)}"`).join("\n");

  return `
You are validating architecture PDF page thumbnails for a woodworking document pipeline.

Task:
For each page image, decide whether it is:
- furniture_floor_plan: a floor plan with visible furniture layout or furniture symbols
- measurement_floor_plan: a clean measured/as-built floor plan where the main visible content is walls, openings, and dimension lines, with no meaningful furniture
- technical_floor_plan: electrical, lighting, plumbing, heating, sockets, switches, ventilation, demolition, installation, ceiling, flooring, doors, sections
- furniture_technical_sheet: detailed furniture sheet/elevation/technical scheme for one room or furniture assembly
- visualization: render or interior perspective
- irrelevant: title page, legend, report, index, or not useful
- unknown: uncertain

Important:
- Do not infer from text only; use the image.
- If furniture is visible in a floor plan, do not classify it as measurement_floor_plan.
- A page can have walls and dimensions but still be technical_floor_plan if it is mainly electrical/plumbing/etc.
- Prefer unknown over guessing.
- Return JSON only.

Pages:
${pageSummary}

Return this strict JSON shape:
{
  "results": [
    {
      "pageNumber": 1,
      "pageKind": "measurement_floor_plan",
      "hasWalls": true,
      "hasDimensionLines": true,
      "hasFurniture": false,
      "hasTechnicalSymbols": false,
      "wallVisibility": "high",
      "confidence": 0.91,
      "reason": "Visible wall layout and dimension lines, no furniture objects detected."
    }
  ]
}
`.trim();
}

export function parsePageVisionValidationJson(value: string): PageVisionValidationResult[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("Page vision validator response must be valid JSON.");
  }

  if (!parsed || typeof parsed !== "object") throw new Error("Page vision validator response must be an object.");
  const candidate = parsed as { results?: unknown };
  if (!Array.isArray(candidate.results)) throw new Error("Page vision validator response must include results array.");

  return candidate.results.map(parseResult);
}

function parseResult(value: unknown): PageVisionValidationResult {
  if (!value || typeof value !== "object") throw new Error("Each page vision result must be an object.");
  const item = value as Partial<PageVisionValidationResult>;

  if (typeof item.pageNumber !== "number" || !Number.isInteger(item.pageNumber)) throw new Error("Page vision result must include integer pageNumber.");
  if (typeof item.pageKind !== "string" || !PAGE_KINDS.has(item.pageKind)) throw new Error(`Invalid pageKind for page ${item.pageNumber}.`);
  if (typeof item.hasWalls !== "boolean") throw new Error(`Page ${item.pageNumber} must include hasWalls.`);
  if (typeof item.hasDimensionLines !== "boolean") throw new Error(`Page ${item.pageNumber} must include hasDimensionLines.`);
  if (typeof item.hasFurniture !== "boolean") throw new Error(`Page ${item.pageNumber} must include hasFurniture.`);
  if (typeof item.hasTechnicalSymbols !== "boolean") throw new Error(`Page ${item.pageNumber} must include hasTechnicalSymbols.`);
  if (typeof item.wallVisibility !== "string" || !WALL_VISIBILITY.has(item.wallVisibility)) throw new Error(`Invalid wallVisibility for page ${item.pageNumber}.`);
  if (typeof item.confidence !== "number") throw new Error(`Page ${item.pageNumber} must include confidence.`);
  if (typeof item.reason !== "string") throw new Error(`Page ${item.pageNumber} must include reason.`);

  return {
    pageNumber: item.pageNumber,
    pageKind: item.pageKind,
    hasWalls: item.hasWalls,
    hasDimensionLines: item.hasDimensionLines,
    hasFurniture: item.hasFurniture,
    hasTechnicalSymbols: item.hasTechnicalSymbols,
    wallVisibility: item.wallVisibility,
    confidence: clamp01(item.confidence),
    reason: item.reason
  };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
