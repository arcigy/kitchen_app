import { describe, expect, it } from "vitest";
import {
  createAiCleanupAudit,
  generateAiCleanupSuggestions,
  parseAiCleanupResponseJson,
  type AiCleanupInput
} from "./aiCleanup";

describe("AI cleanup suggestions", () => {
  it("accepts high confidence assignment suggestions", async () => {
    const generation = await generateAiCleanupSuggestions(inputFixture(), async () => ({
      modelName: "mock-model",
      json: JSON.stringify({
        assignments: [{ itemId: "item_1", suggestedRoomId: "room_1", confidence: 0.94, reason: "clear room title" }],
        duplicates: [],
        roomStatuses: []
      })
    }));

    expect(generation.suggestions[0]).toMatchObject({
      kind: "assignment",
      tier: "high",
      itemId: "item_1",
      suggestedRoomId: "room_1"
    });
    expect(createAiCleanupAudit(generation.suggestions[0])).toMatchObject({
      source: "ai",
      actionType: "assign_room",
      modelName: "mock-model",
      confidence: 0.94
    });
  });

  it("keeps low confidence assignments out of high confidence apply", async () => {
    const generation = await generateAiCleanupSuggestions(inputFixture(), async () => ({
      json: JSON.stringify({
        assignments: [{ itemId: "item_1", suggestedRoomId: "room_1", confidence: 0.74, reason: "weak" }],
        duplicates: [],
        roomStatuses: []
      })
    }));

    expect(generation.suggestions[0].tier).toBe("weak");
  });

  it("parses duplicate merge suggestions", async () => {
    const generation = await generateAiCleanupSuggestions(inputFixture(), async () => ({
      json: JSON.stringify({
        assignments: [],
        duplicates: [{ itemIds: ["item_1", "item_2"], action: "merge", confidence: 0.91, reason: "same source text" }],
        roomStatuses: []
      })
    }));

    expect(generation.suggestions[0]).toMatchObject({
      kind: "duplicate",
      tier: "high",
      duplicateAction: "merge",
      itemIds: ["item_1", "item_2"]
    });
  });

  it("parses room no_custom_furniture suggestions", async () => {
    const generation = await generateAiCleanupSuggestions(inputFixture(), async () => ({
      json: JSON.stringify({
        assignments: [],
        duplicates: [],
        roomStatuses: [{ roomId: "room_1", status: "no_custom_furniture", confidence: 0.93, reason: "technical room only" }]
      })
    }));

    expect(generation.suggestions[0]).toMatchObject({
      kind: "room_status",
      tier: "high",
      roomStatus: "no_custom_furniture"
    });
  });

  it("rejects invalid AI JSON safely", () => {
    expect(() => parseAiCleanupResponseJson("{bad json")).toThrow("AI cleanup response must be valid JSON.");
    expect(() => parseAiCleanupResponseJson(JSON.stringify({ assignments: [] }))).toThrow("AI cleanup response must include duplicates array.");
    expect(() => parseAiCleanupResponseJson(JSON.stringify({
      assignments: [{ itemId: "x", suggestedRoomId: "r", confidence: 2, reason: "" }],
      duplicates: [],
      roomStatuses: []
    }))).toThrow("AI confidence must be a number from 0 to 1.");
  });
});

function inputFixture(): AiCleanupInput {
  return {
    rooms: [
      {
        roomId: "room_1",
        roomNumber: "01",
        roomNameOriginal: "Entry Hall",
        roomType: "entry_hall",
        relatedPageNumbers: [2]
      }
    ],
    relatedPages: [
      {
        pageNumber: 2,
        finalType: "furniture_schedule",
        title: "SCHEME ENTRY HALL",
        assignedRoomIds: ["room_1"]
      }
    ],
    unresolved: {
      unassignedPrimaryItems: [
        {
          itemId: "item_1",
          category: "wardrobe",
          sourceText: "SCHEME ENTRY HALL wardrobe",
          sourcePageNumbers: [2],
          confidence: 0.8
        }
      ],
      duplicateGroups: [],
      roomsWithoutPrimary: []
    }
  };
}
