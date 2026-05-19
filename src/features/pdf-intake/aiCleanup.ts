import type {
  CleanupActionAudit,
  ContextRoom,
  InventoryCleanupReview,
  PageReviewItem,
  ProjectContext
} from "./types";

export interface AiCleanupInput {
  rooms: Array<{
    roomId: string;
    roomNumber?: string;
    roomNameOriginal: string;
    roomType: string;
    relatedPageNumbers: number[];
  }>;
  relatedPages: Array<{
    pageNumber: number;
    finalType: PageReviewItem["finalType"];
    title: string;
    assignedRoomIds: string[];
  }>;
  unresolved: {
    unassignedPrimaryItems: Array<{
      itemId: string;
      category: string;
      sourceText: string;
      sourcePageNumbers: number[];
      existingSuggestedRoomId?: string;
      confidence: number;
    }>;
    duplicateGroups: Array<{
      groupId: string;
      category: string;
      roomId?: string;
      itemIds: string[];
      sourcePageNumbers: number[];
      sourceTexts: string[];
    }>;
    roomsWithoutPrimary: Array<{
      roomId: string;
      roomType: string;
      relatedPageNumbers: number[];
    }>;
  };
}

export interface AiCleanupResponse {
  assignments: Array<{
    itemId: string;
    suggestedRoomId: string;
    confidence: number;
    reason: string;
  }>;
  duplicates: Array<{
    itemIds: string[];
    action: "merge" | "keep_separate";
    confidence: number;
    reason: string;
  }>;
  roomStatuses: Array<{
    roomId: string;
    status: "has_custom_furniture" | "no_custom_furniture" | "needs_review";
    confidence: number;
    reason: string;
  }>;
}

export interface AiCleanupSuggestion {
  id: string;
  kind: "assignment" | "duplicate" | "room_status";
  label: string;
  confidence: number;
  tier: "high" | "review" | "weak";
  reason: string;
  itemId?: string;
  suggestedRoomId?: string;
  itemIds?: string[];
  duplicateAction?: "merge" | "keep_separate";
  roomId?: string;
  roomStatus?: "has_custom_furniture" | "no_custom_furniture" | "needs_review";
  modelName?: string;
  inputSummary: string;
}

export interface AiCleanupGeneration {
  input: AiCleanupInput;
  response: AiCleanupResponse;
  suggestions: AiCleanupSuggestion[];
  modelName: string;
}

export type AiCleanupProvider = (input: AiCleanupInput) => Promise<{ json: string; modelName?: string }>;

export function buildAiCleanupInput(cleanup: InventoryCleanupReview, context: ProjectContext, pages: PageReviewItem[]): AiCleanupInput {
  return {
    rooms: context.rooms.map((room) => ({
      roomId: room.id,
      roomNumber: room.roomNumber,
      roomNameOriginal: room.nameOriginal,
      roomType: room.type,
      relatedPageNumbers: room.pageNumbers
    })),
    relatedPages: pages
      .filter((page) => page.finalType !== "irrelevant")
      .map((page) => ({
        pageNumber: page.pageNumber,
        finalType: page.finalType,
        title: pageTitle(page),
        assignedRoomIds: context.rooms.filter((room) => room.pageNumbers.includes(page.pageNumber)).map((room) => room.id)
      })),
    unresolved: {
      unassignedPrimaryItems: cleanup.unassignedPrimaryItems.map((entry) => ({
        itemId: entry.item.itemId,
        category: entry.item.category,
        sourceText: entry.item.sourceTexts.join(" / ").slice(0, 500),
        sourcePageNumbers: entry.item.sourcePageNumbers,
        existingSuggestedRoomId: entry.suggestedRoomId,
        confidence: entry.item.confidence
      })),
      duplicateGroups: cleanup.duplicateGroups
        .filter((group) => group.status === "open")
        .map((group) => ({
          groupId: group.groupId,
          category: group.category,
          roomId: group.roomId,
          itemIds: group.items.map((item) => item.itemId),
          sourcePageNumbers: group.sourcePageNumbers,
          sourceTexts: group.items.map((item) => item.sourceTexts.join(" / ").slice(0, 220))
        })),
      roomsWithoutPrimary: cleanup.roomsWithoutPrimary
        .filter((room) => room.status === "open")
        .map((room) => ({
          roomId: room.roomId,
          roomType: room.roomType,
          relatedPageNumbers: room.relatedPageNumbers
        }))
    }
  };
}

export async function generateAiCleanupSuggestions(input: AiCleanupInput, provider: AiCleanupProvider = localAiCleanupProvider): Promise<AiCleanupGeneration> {
  const provided = await provider(input);
  const response = parseAiCleanupResponseJson(provided.json);
  const modelName = provided.modelName ?? "local-ai-cleanup-mock";

  return {
    input,
    response,
    suggestions: createAiCleanupSuggestions(response, input, modelName),
    modelName
  };
}

export function parseAiCleanupResponseJson(value: string): AiCleanupResponse {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch {
    throw new Error("AI cleanup response must be valid JSON.");
  }

  if (!parsed || typeof parsed !== "object") throw new Error("AI cleanup response must be an object.");
  const candidate = parsed as Partial<AiCleanupResponse>;
  if (!Array.isArray(candidate.assignments)) throw new Error("AI cleanup response must include assignments array.");
  if (!Array.isArray(candidate.duplicates)) throw new Error("AI cleanup response must include duplicates array.");
  if (!Array.isArray(candidate.roomStatuses)) throw new Error("AI cleanup response must include roomStatuses array.");

  return {
    assignments: candidate.assignments.map(parseAssignment),
    duplicates: candidate.duplicates.map(parseDuplicate),
    roomStatuses: candidate.roomStatuses.map(parseRoomStatus)
  };
}

export function createAiCleanupAudit(suggestion: AiCleanupSuggestion): CleanupActionAudit {
  return {
    actionId: suggestion.id,
    source: "ai",
    actionType: suggestion.kind === "assignment" ? "assign_room" : suggestion.kind === "duplicate" ? suggestion.duplicateAction === "keep_separate" ? "keep_separate" : "merge_duplicate" : "room_status",
    modelName: suggestion.modelName,
    inputSummary: suggestion.inputSummary,
    confidence: suggestion.confidence,
    reason: suggestion.reason,
    itemIds: suggestion.itemIds ?? (suggestion.itemId ? [suggestion.itemId] : undefined),
    roomId: suggestion.suggestedRoomId ?? suggestion.roomId,
    status: suggestion.roomStatus ?? suggestion.duplicateAction
  };
}

function createAiCleanupSuggestions(response: AiCleanupResponse, input: AiCleanupInput, modelName: string): AiCleanupSuggestion[] {
  const roomsById = new Map(input.rooms.map((room) => [room.roomId, room]));
  const inputSummary = summarizeAiInput(input);

  return [
    ...response.assignments.map((assignment) => ({
      id: `ai_assign_${assignment.itemId}_${assignment.suggestedRoomId}`,
      kind: "assignment" as const,
      label: `Assign ${assignment.itemId} to ${roomsById.get(assignment.suggestedRoomId)?.roomNameOriginal ?? assignment.suggestedRoomId}`,
      confidence: clampConfidence(assignment.confidence),
      tier: confidenceTier(assignment.confidence),
      reason: assignment.reason,
      itemId: assignment.itemId,
      suggestedRoomId: assignment.suggestedRoomId,
      modelName,
      inputSummary
    })),
    ...response.duplicates.map((duplicate, index) => ({
      id: `ai_duplicate_${index}_${duplicate.itemIds.join("_")}`,
      kind: "duplicate" as const,
      label: `${duplicate.action === "merge" ? "Merge" : "Keep separate"} ${duplicate.itemIds.join(", ")}`,
      confidence: clampConfidence(duplicate.confidence),
      tier: confidenceTier(duplicate.confidence),
      reason: duplicate.reason,
      itemIds: duplicate.itemIds,
      duplicateAction: duplicate.action,
      modelName,
      inputSummary
    })),
    ...response.roomStatuses.map((roomStatus) => ({
      id: `ai_room_status_${roomStatus.roomId}_${roomStatus.status}`,
      kind: "room_status" as const,
      label: `${roomsById.get(roomStatus.roomId)?.roomNameOriginal ?? roomStatus.roomId}: ${roomStatus.status}`,
      confidence: clampConfidence(roomStatus.confidence),
      tier: confidenceTier(roomStatus.confidence),
      reason: roomStatus.reason,
      roomId: roomStatus.roomId,
      roomStatus: roomStatus.status,
      modelName,
      inputSummary
    }))
  ];
}

async function localAiCleanupProvider(input: AiCleanupInput): Promise<{ json: string; modelName: string }> {
  const assignments = input.unresolved.unassignedPrimaryItems
    .map((item) => {
      const roomId = item.existingSuggestedRoomId ?? inferRoomForItem(item.category, item.sourceText, input.rooms);
      if (!roomId) return undefined;
      return {
        itemId: item.itemId,
        suggestedRoomId: roomId,
        confidence: item.existingSuggestedRoomId ? 0.92 : 0.82,
        reason: item.existingSuggestedRoomId ? "Existing deterministic room suggestion is available." : "Room inferred from item category and room list."
      };
    })
    .filter((item): item is AiCleanupResponse["assignments"][number] => Boolean(item));
  const duplicates = input.unresolved.duplicateGroups.map((group) => ({
    itemIds: group.itemIds,
    action: "keep_separate" as const,
    confidence: 0.78,
    reason: "Similar items exist, but source pages differ; keep for manual review."
  }));
  const roomStatuses = input.unresolved.roomsWithoutPrimary.map((room) => {
    if (isSafeNoCustomFurnitureRoom(room.roomType)) {
      return {
        roomId: room.roomId,
        status: "no_custom_furniture" as const,
        confidence: 0.92,
        reason: "Circulation or stair room has no text evidence for custom furniture."
      };
    }

    return {
      roomId: room.roomId,
      status: "needs_review" as const,
      confidence: 0.7,
      reason: "No primary furniture evidence in text-only context."
    };
  });

  return {
    json: JSON.stringify({ assignments, duplicates, roomStatuses }),
    modelName: "local-ai-cleanup-mock"
  };
}

function inferRoomForItem(category: string, sourceText: string, rooms: AiCleanupInput["rooms"]): string | undefined {
  const normalized = `${category} ${sourceText}`.toLowerCase();
  const preferredRoomTypes = category === "kitchen"
    ? ["kitchen_living_room", "kitchen"]
    : category === "desk"
      ? ["office", "children_room"]
      : category === "sink" || category === "toilet" || category === "shower" || category === "bathtub"
        ? ["bathroom", "guest_wc", "wc"]
        : category === "appliance"
          ? ["utility_laundry", "kitchen_living_room", "kitchen"]
          : [];
  if (preferredRoomTypes.length === 0) return undefined;

  const byType = rooms.find((room) => preferredRoomTypes.includes(room.roomType));
  if (byType && normalized.includes(category)) return byType.roomId;

  return undefined;
}

function isSafeNoCustomFurnitureRoom(roomType: string): boolean {
  return roomType === "corridor_stairs";
}

function parseAssignment(value: unknown): AiCleanupResponse["assignments"][number] {
  const candidate = value as Partial<AiCleanupResponse["assignments"][number]>;
  if (typeof candidate.itemId !== "string" || typeof candidate.suggestedRoomId !== "string") throw new Error("Invalid AI assignment suggestion.");
  return {
    itemId: candidate.itemId,
    suggestedRoomId: candidate.suggestedRoomId,
    confidence: parseConfidence(candidate.confidence),
    reason: typeof candidate.reason === "string" ? candidate.reason : ""
  };
}

function parseDuplicate(value: unknown): AiCleanupResponse["duplicates"][number] {
  const candidate = value as Partial<AiCleanupResponse["duplicates"][number]>;
  if (!Array.isArray(candidate.itemIds) || !candidate.itemIds.every((itemId) => typeof itemId === "string")) throw new Error("Invalid AI duplicate suggestion.");
  if (candidate.action !== "merge" && candidate.action !== "keep_separate") throw new Error("Invalid AI duplicate action.");
  return {
    itemIds: candidate.itemIds,
    action: candidate.action,
    confidence: parseConfidence(candidate.confidence),
    reason: typeof candidate.reason === "string" ? candidate.reason : ""
  };
}

function parseRoomStatus(value: unknown): AiCleanupResponse["roomStatuses"][number] {
  const candidate = value as Partial<AiCleanupResponse["roomStatuses"][number]>;
  if (typeof candidate.roomId !== "string") throw new Error("Invalid AI room status suggestion.");
  if (candidate.status !== "has_custom_furniture" && candidate.status !== "no_custom_furniture" && candidate.status !== "needs_review") throw new Error("Invalid AI room status.");
  return {
    roomId: candidate.roomId,
    status: candidate.status,
    confidence: parseConfidence(candidate.confidence),
    reason: typeof candidate.reason === "string" ? candidate.reason : ""
  };
}

function parseConfidence(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) throw new Error("AI confidence must be a number from 0 to 1.");
  return value;
}

function clampConfidence(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function confidenceTier(confidence: number): AiCleanupSuggestion["tier"] {
  if (confidence >= 0.9) return "high";
  if (confidence >= 0.75) return "review";
  return "weak";
}

function summarizeAiInput(input: AiCleanupInput): string {
  return `${input.rooms.length} rooms, ${input.relatedPages.length} related pages, ${input.unresolved.unassignedPrimaryItems.length} unassigned primary, ${input.unresolved.duplicateGroups.length} duplicate groups, ${input.unresolved.roomsWithoutPrimary.length} rooms without primary`;
}

function pageTitle(page: PageReviewItem): string {
  return page.extractedText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) ?? page.extractedTextPreview;
}
