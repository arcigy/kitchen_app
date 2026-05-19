import { describe, expect, it } from "vitest";
import { createProjectContextExport } from "./projectContextExport";
import { evaluateProjectContext } from "./projectContextEvaluation";
import type { ProjectContext, ProjectContextExport } from "./types";

describe("ProjectContext evaluation", () => {
  it("matches expected floors", () => {
    const report = evaluateProjectContext(exported(context({ floors: ["floor_1"] })), exported(context({ floors: ["floor_1", "floor_2"] })));

    expect(report.floorDetection.found).toBe(1);
    expect(report.floorDetection.missing).toEqual(["floor_2"]);
    expect(report.floorDetection.accuracy).toBe(0.5);
  });

  it("reports rooms found and missing", () => {
    const report = evaluateProjectContext(
      exported(context({ rooms: [{ id: "room_01", type: "kitchen", name: "Kitchen", area: 12.5, pages: [1] }] })),
      exported(context({
        rooms: [
          { id: "room_01", type: "kitchen", name: "Kitchen", area: 12.5, pages: [1] },
          { id: "room_02", type: "bedroom", name: "Bedroom", area: 9.8, pages: [1] }
        ]
      }))
    );

    expect(report.roomDetection.found).toBe(1);
    expect(report.roomDetection.missing).toEqual(["Bedroom"]);
  });

  it("uses area tolerance of plus minus 0.2 m2", () => {
    const expected = exported(context({ rooms: [{ id: "room_01", type: "kitchen", name: "Kitchen", area: 12.5, pages: [1] }] }));
    const insideTolerance = evaluateProjectContext(
      exported(context({ rooms: [{ id: "room_01", type: "kitchen", name: "Kitchen", area: 12.68, pages: [1] }] })),
      expected
    );
    const outsideTolerance = evaluateProjectContext(
      exported(context({ rooms: [{ id: "room_01", type: "kitchen", name: "Kitchen", area: 12.8, pages: [1] }] })),
      expected
    );

    expect(insideTolerance.roomDetection.areaMatches).toBe(1);
    expect(outsideTolerance.roomDetection.areaMatches).toBe(0);
  });

  it("reports furniture found and missing", () => {
    const report = evaluateProjectContext(
      exported(context({ furniture: [{ id: "f1", type: "wardrobe", roomId: "room_01", page: 2 }] })),
      exported(context({
        furniture: [
          { id: "f1", type: "wardrobe", roomId: "room_01", page: 2 },
          { id: "f2", type: "bed", roomId: "room_02", page: 3 }
        ]
      }))
    );

    expect(report.furnitureDetection.found).toBe(1);
    expect(report.furnitureDetection.missing).toEqual(["f2"]);
  });

  it("detects wrong furniture room assignment", () => {
    const report = evaluateProjectContext(
      exported(context({ furniture: [{ id: "f1", type: "wardrobe", roomId: "room_wrong", page: 2 }] })),
      exported(context({ furniture: [{ id: "f1", type: "wardrobe", roomId: "room_01", page: 2 }] }))
    );

    expect(report.furnitureDetection.wrongRoomAssignments).toEqual([
      { expectedFurnitureId: "f1", expectedRoomId: "room_01", actualRoomId: "room_wrong" }
    ]);
  });

  it("checks related page assignment", () => {
    const report = evaluateProjectContext(
      exported(context({ rooms: [{ id: "room_01", type: "kitchen", name: "Kitchen", area: 12.5, pages: [2] }] })),
      exported(context({ rooms: [{ id: "room_01", type: "kitchen", name: "Kitchen", area: 12.5, pages: [1] }] }))
    );

    expect(report.relatedPageAssignment.correct).toBe(0);
    expect(report.relatedPageAssignment.wrong).toBe(1);
    expect(report.relatedPageAssignment.mistakes[0]).toEqual({ expectedOwnerId: "room_01", pageNumber: 1, status: "wrong" });
  });

  it("exports current context as expected context shape", () => {
    const payload = exported(context({
      floors: ["floor_1"],
      rooms: [{ id: "room_01", type: "kitchen", name: "Kitchen", area: 12.5, pages: [1] }],
      furniture: [{ id: "f1", type: "wardrobe", roomId: "room_01", page: 2 }]
    }));

    expect(payload.fileName).toBe("project.pdf");
    expect(payload.rooms[0].nameNormalized).toBe("kitchen");
    expect(payload.rooms[0].areaM2).toBe(12.5);
    expect(payload.detectedFurniture[0].typeNormalized).toBe("wardrobe");
    expect(payload.relatedPages.map((page) => page.pageNumber)).toEqual([1, 2]);
  });
});

function exported(contextValue: ProjectContext): ProjectContextExport {
  return createProjectContextExport({ fileName: "project.pdf", context: contextValue });
}

function context(input: {
  floors?: string[];
  rooms?: Array<{ id: string; type: ProjectContext["rooms"][number]["type"]; name: string; area: number; pages: number[] }>;
  furniture?: Array<{ id: string; type: ProjectContext["furniture"][number]["type"]; roomId?: string; page: number }>;
}): ProjectContext {
  return {
    floors: (input.floors ?? []).map((id) => ({ id, label: id, pageNumbers: [1], confidence: 0.8, reasons: [] })),
    rooms: (input.rooms ?? []).map((room) => ({
      id: room.id,
      type: room.type,
      nameOriginal: room.name,
      area: room.area,
      pageNumbers: room.pages,
      confidence: 0.8,
      reasons: []
    })),
    furniture: (input.furniture ?? []).map((item) => ({
      id: item.id,
      type: item.type,
      roomId: item.roomId,
      pageNumber: item.page,
      confidence: 0.8,
      reasons: []
    })),
    unassignedPages: []
  };
}
