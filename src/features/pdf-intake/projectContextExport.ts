import { normalizeText } from "./normalization";
import type { ProjectContext, ProjectContextExport } from "./types";

interface CreateProjectContextExportInput {
  fileName: string;
  context: ProjectContext;
}

export function createProjectContextExport(input: CreateProjectContextExportInput): ProjectContextExport {
  const relatedPages = Array.from(
    new Set([
      ...input.context.floors.flatMap((floor) => floor.pageNumbers),
      ...input.context.rooms.flatMap((room) => room.pageNumbers),
      ...input.context.furniture.map((item) => item.pageNumber),
      ...input.context.unassignedPages
    ])
  )
    .sort((left, right) => left - right)
    .map((pageNumber) => ({
      pageNumber,
      floorIds: input.context.floors.filter((floor) => floor.pageNumbers.includes(pageNumber)).map((floor) => floor.id),
      roomIds: input.context.rooms.filter((room) => room.pageNumbers.includes(pageNumber)).map((room) => room.id),
      furnitureIds: input.context.furniture.filter((item) => item.pageNumber === pageNumber).map((item) => item.id)
    }));

  const confidences = [
    ...input.context.floors.map((floor) => floor.confidence),
    ...input.context.rooms.map((room) => room.confidence),
    ...input.context.furniture.map((item) => item.confidence)
  ];

  return {
    fileName: input.fileName,
    floors: input.context.floors.map((floor) => ({
      ...floor,
      relatedPages: floor.pageNumbers
    })),
    rooms: input.context.rooms.map((room) => ({
      ...room,
      nameNormalized: room.type,
      functions: room.functions ?? (room.type === "unknown" ? [] : [room.type]),
      areaM2: room.area,
      relatedPages: room.pageNumbers
    })),
    detectedFurniture: input.context.furniture.map((item) => ({
      ...item,
      typeNormalized: item.type,
      relatedPages: [item.pageNumber]
    })),
    relatedPages,
    unassignedPages: input.context.unassignedPages,
    confidence: confidences.length > 0 ? round(confidences.reduce((sum, value) => sum + value, 0) / confidences.length) : 0,
    reasons: [
      "language-agnostic patterns",
      "multi-language dictionaries",
      "manual review overrides included"
    ]
  };
}

export function parseProjectContextJson(value: string): ProjectContextExport {
  const parsed = JSON.parse(value) as unknown;
  if (!parsed || typeof parsed !== "object") throw new Error("Expected project context JSON object.");

  const candidate = parsed as Partial<ProjectContextExport>;
  if (typeof candidate.fileName !== "string") throw new Error("Expected project context must include fileName.");
  if (!Array.isArray(candidate.floors)) throw new Error("Expected project context must include floors array.");
  if (!Array.isArray(candidate.rooms)) throw new Error("Expected project context must include rooms array.");
  if (!Array.isArray(candidate.detectedFurniture)) throw new Error("Expected project context must include detectedFurniture array.");

  return {
    fileName: candidate.fileName,
    floors: candidate.floors,
    rooms: candidate.rooms,
    detectedFurniture: candidate.detectedFurniture,
    relatedPages: Array.isArray(candidate.relatedPages) ? candidate.relatedPages : [],
    unassignedPages: Array.isArray(candidate.unassignedPages) ? candidate.unassignedPages : [],
    confidence: typeof candidate.confidence === "number" ? candidate.confidence : 0,
    reasons: Array.isArray(candidate.reasons) ? candidate.reasons : []
  };
}

export function projectContextFileStem(fileName: string): string {
  return normalizeText(fileName.replace(/\.pdf$/i, "")).replace(/[^a-z0-9а-яёіїєґ]+/giu, "-") || "project";
}

function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}
