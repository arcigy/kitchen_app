import { describe, expect, it } from "vitest";
import {
  detachCustomFurnitureAttachments,
  duplicateAttachedCustomFurnitureParams,
  syncCustomFurnitureAttachments
} from "./customFurnitureAttachments";
import type { CustomFurnitureParams } from "./customFurnitureTypes";

function params(): CustomFurnitureParams {
  return {
    name: "Cover side",
    baseConstraint: "projectBase", baseOffsetMm: 0, topConstraint: "absolute", topOffsetMm: 720,
    boundary: [{ x: 0, z: 0 }, { x: 100, z: 0 }, { x: 100, z: 30 }],
    boards: [{
      id: "cover", name: "Cover", kind: "vertical", workplane: { type: "vertical", aMm: { x: 0, z: 0 }, bMm: { x: 100, z: 0 }, mirrored: false },
      profile: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 720 }], thicknessMm: 18, materialId: "board",
      baseConstraint: "projectBase", baseOffsetMm: 0, topConstraint: "absolute", topOffsetMm: 720, justification: "center", edgeBanding: [], additionKind: "cover_side",
      cabinetAttachment: { cabinetId: "cabinet-a", side: "left", offsetMm: 0, startOverhangMm: 5, endOverhangMm: 5, followDimensions: ["height"] }
    }]
  };
}

describe("custom furniture cabinet attachments", () => {
  it("detaches an addition at its current position when its cabinet is removed", () => {
    const item = { params: params() };
    expect(detachCustomFurnitureAttachments([item], "cabinet-a")).toBe(1);
    expect(item.params.boards[0]!.cabinetAttachment).toBeUndefined();
  });

  it("duplicates an attached addition with a fresh cabinet reference and translated geometry", () => {
    const copies = duplicateAttachedCustomFurnitureParams([{ id: "furniture-a", params: params() }], "cabinet-a", "cabinet-b", { x: 200, z: 300 });
    expect(copies).toHaveLength(1);
    expect(copies[0]!.boards[0]).toMatchObject({ id: "cover-copy-1", cabinetAttachment: { cabinetId: "cabinet-b" } });
    expect(copies[0]!.boundary[0]).toEqual({ x: 200, z: 300 });
    expect(copies[0]!.boards[0]!.workplane).toMatchObject({ aMm: { x: 200, z: 300 } });
  });

  it("tracks the selected cabinet dimensions and keeps an explicit overhang", () => {
    const item = { params: params() };
    const board = item.params.boards[0]!;
    board.cabinetAttachment!.followDimensions = ["height", "depth"];
    expect(syncCustomFurnitureAttachments([item], {
      cabinetId: "cabinet-a",
      minMm: { x: 100, y: 150, z: 200 },
      maxMm: { x: 700, y: 950, z: 600 }
    })).toBe(1);
    expect(board.workplane).toMatchObject({ aMm: { x: 100, z: 195 }, bMm: { x: 100, z: 605 } });
    expect(board.profile.map((point) => point.y)).toEqual(expect.arrayContaining([150, 950]));
  });
});
