import type {
  CustomFurnitureBoardParams,
  CustomFurnitureParams,
  CustomFurnitureSnapshotItem
} from "./customFurnitureTypes";

export type CabinetAttachmentFrame = {
  cabinetId: string;
  minMm: { x: number; y: number; z: number };
  maxMm: { x: number; y: number; z: number };
};

type ProfileBounds = { minX: number; maxX: number; minY: number; maxY: number };

function profileBounds(board: CustomFurnitureBoardParams): ProfileBounds {
  const values = board.profile.length > 0 ? board.profile : [{ x: 0, y: 0 }, { x: 1, y: 1 }];
  return {
    minX: Math.min(...values.map((point) => point.x)),
    maxX: Math.max(...values.map((point) => point.x)),
    minY: Math.min(...values.map((point) => point.y)),
    maxY: Math.max(...values.map((point) => point.y))
  };
}

function scale(value: number, fromStart: number, fromEnd: number, toStart: number, toEnd: number): number {
  const span = fromEnd - fromStart;
  if (Math.abs(span) < 0.001) return toStart;
  return toStart + ((value - fromStart) / span) * (toEnd - toStart);
}

function updateVerticalProfile(board: CustomFurnitureBoardParams, lengthMm: number, bottomMm: number, topMm: number): void {
  const bounds = profileBounds(board);
  board.profile = board.profile.map((point) => ({
    x: scale(point.x, bounds.minX, bounds.maxX, 0, Math.max(1, lengthMm)),
    y: scale(point.y, bounds.minY, bounds.maxY, bottomMm, topMm)
  }));
}

function updateHorizontalProfile(board: CustomFurnitureBoardParams, minX: number, maxX: number, minZ: number, maxZ: number): void {
  const bounds = profileBounds(board);
  board.profile = board.profile.map((point) => ({
    x: scale(point.x, bounds.minX, bounds.maxX, minX, maxX),
    y: scale(point.y, bounds.minY, bounds.maxY, minZ, maxZ)
  }));
}

/**
 * Updates an explicitly attached addition from the cabinet's actual world box.
 * Only selected dimensions are rescaled; all attached boards still follow a
 * moved cabinet by their chosen side and offset.
 */
export function syncCustomFurnitureBoardAttachment(board: CustomFurnitureBoardParams, frame: CabinetAttachmentFrame): boolean {
  const attachment = board.cabinetAttachment;
  if (!attachment || attachment.cabinetId !== frame.cabinetId) return false;
  const follows = new Set(attachment.followDimensions);
  const width = Math.max(1, frame.maxMm.x - frame.minMm.x);
  const height = Math.max(1, frame.maxMm.y - frame.minMm.y);
  const depth = Math.max(1, frame.maxMm.z - frame.minMm.z);
  const oldBounds = profileBounds(board);
  const oldLength = Math.max(1, oldBounds.maxX - oldBounds.minX);
  const oldHeight = Math.max(1, oldBounds.maxY - oldBounds.minY);
  const bottom = follows.has("height") ? frame.minMm.y : oldBounds.minY;
  const top = bottom + (follows.has("height") ? height : oldHeight);
  const offset = attachment.offsetMm;

  if (attachment.side === "top" || attachment.side === "bottom") {
    const minX = frame.minMm.x - attachment.startOverhangMm;
    const maxX = minX + (follows.has("width") ? width + attachment.startOverhangMm + attachment.endOverhangMm : Math.max(1, oldBounds.maxX - oldBounds.minX));
    const minZ = frame.minMm.z - attachment.startOverhangMm;
    const maxZ = minZ + (follows.has("depth") ? depth + attachment.startOverhangMm + attachment.endOverhangMm : Math.max(1, oldBounds.maxY - oldBounds.minY));
    if (board.workplane.type !== "horizontal") return false;
    board.workplane.elevationMm = attachment.side === "top" ? frame.maxMm.y + offset : frame.minMm.y - offset;
    updateHorizontalProfile(board, minX, maxX, minZ, maxZ);
    return true;
  }

  if (board.workplane.type !== "vertical") return false;
  const alongDepth = attachment.side === "left" || attachment.side === "right";
  const followsLength = follows.has(alongDepth ? "depth" : "width");
  const length = followsLength
    ? (alongDepth ? depth : width) + attachment.startOverhangMm + attachment.endOverhangMm
    : oldLength;
  if (alongDepth) {
    const x = attachment.side === "left" ? frame.minMm.x - offset : frame.maxMm.x + offset;
    const z = frame.minMm.z - attachment.startOverhangMm;
    board.workplane = { type: "vertical", aMm: { x, z }, bMm: { x, z: z + length }, mirrored: attachment.side === "right" };
  } else {
    const z = attachment.side === "front" ? frame.minMm.z - offset : frame.maxMm.z + offset;
    const x = frame.minMm.x - attachment.startOverhangMm;
    board.workplane = { type: "vertical", aMm: { x, z }, bMm: { x: x + length, z }, mirrored: attachment.side === "back" };
  }
  updateVerticalProfile(board, length, bottom, top);
  return true;
}

export function syncCustomFurnitureAttachments(items: readonly { params: CustomFurnitureParams }[], frame: CabinetAttachmentFrame): number {
  let synchronized = 0;
  for (const item of items) {
    for (const board of item.params.boards) {
      if (syncCustomFurnitureBoardAttachment(board, frame)) synchronized += 1;
    }
  }
  return synchronized;
}

/** Removing a cabinet never removes production additions; it only freezes their last valid position. */
export function detachCustomFurnitureAttachments(items: readonly { params: CustomFurnitureParams }[], cabinetId: string): number {
  let detached = 0;
  for (const item of items) {
    for (const board of item.params.boards) {
      if (board.cabinetAttachment?.cabinetId !== cabinetId) continue;
      delete board.cabinetAttachment;
      detached += 1;
    }
  }
  return detached;
}

function translateParams(params: CustomFurnitureParams, xMm: number, zMm: number): CustomFurnitureParams {
  const next = structuredClone(params);
  next.boundary = next.boundary.map((point) => ({ x: point.x + xMm, z: point.z + zMm }));
  next.boundarySegments = next.boundarySegments?.map((segment) => ({
    ...segment,
    a: { x: segment.a.x + xMm, z: segment.a.z + zMm },
    b: { x: segment.b.x + xMm, z: segment.b.z + zMm },
    ...(segment.arcPoints ? { arcPoints: segment.arcPoints.map((point) => ({ x: point.x + xMm, z: point.z + zMm })) } : {})
  }));
  for (const board of next.boards) {
    if (board.workplane.type === "horizontal") {
      board.profile = board.profile.map((point) => ({ x: point.x + xMm, y: point.y + zMm }));
    } else {
      board.workplane = {
        ...board.workplane,
        aMm: { x: board.workplane.aMm.x + xMm, z: board.workplane.aMm.z + zMm },
        bMm: { x: board.workplane.bMm.x + xMm, z: board.workplane.bMm.z + zMm },
        ...(board.workplane.pathMm ? { pathMm: board.workplane.pathMm.map((point) => ({ x: point.x + xMm, z: point.z + zMm })) } : {})
      };
    }
  }
  return next;
}

/** Creates independent copies so an attached addition follows the duplicated cabinet, not its source. */
export function duplicateAttachedCustomFurnitureParams(
  items: readonly CustomFurnitureSnapshotItem[],
  sourceCabinetId: string,
  targetCabinetId: string,
  translationMm: { x: number; z: number }
): CustomFurnitureParams[] {
  return items.flatMap((item) => {
    const attachedBoards = item.params.boards.filter((board) => board.cabinetAttachment?.cabinetId === sourceCabinetId);
    if (attachedBoards.length === 0) return [];
    const next = translateParams({ ...item.params, boards: attachedBoards }, translationMm.x, translationMm.z);
    next.boards = next.boards.map((board, index) => ({
      ...board,
      id: `${board.id}-copy-${index + 1}`,
      cabinetAttachment: board.cabinetAttachment ? { ...board.cabinetAttachment, cabinetId: targetCabinetId } : undefined
    }));
    next.name = `${next.name} copy`;
    return [next];
  });
}
