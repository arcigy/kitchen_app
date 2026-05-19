import type { Wall } from "./wallBuilder";

export function deduplicateWalls(walls: Wall[]): Wall[] {
  const parents = walls.map((_, index) => index);

  for (let leftIndex = 0; leftIndex < walls.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < walls.length; rightIndex += 1) {
      const left = walls[leftIndex];
      const right = walls[rightIndex];
      if (!shareSourceSegment(left, right)) continue;
      if (boundingBoxOverlapRatio(left, right) <= 0.85) continue;
      union(parents, leftIndex, rightIndex);
    }
  }

  const duplicateGroups = new Map<number, number[]>();
  for (let index = 0; index < walls.length; index += 1) {
    const root = find(parents, index);
    const group = duplicateGroups.get(root) ?? [];
    group.push(index);
    duplicateGroups.set(root, group);
  }

  const suppressedById = new Map<string, string>();
  for (const group of duplicateGroups.values()) {
    if (group.length < 2) continue;
    const keep = group.map((index) => walls[index]).reduce(preferredWall);
    for (const index of group) {
      const wall = walls[index];
      if (wall.id !== keep.id) suppressedById.set(wall.id, keep.id);
    }
  }

  return walls.map((wall) => {
    const keptWallId = suppressedById.get(wall.id);
    if (!keptWallId) return wall;
    return {
      ...wall,
      validationStatus: "suspicious",
      validationFlags: [
        ...wall.validationFlags,
        {
          code: "duplicate_suppressed",
          severity: "error",
          message: "Wall overlaps another wall with shared source segments and was suppressed as a duplicate.",
          values: { deduplicatedAgainstWallId: keptWallId }
        }
      ]
    };
  });
}

function preferredWall(left: Wall, right: Wall): Wall {
  if (left.confidence !== right.confidence) return left.confidence > right.confidence ? left : right;
  return left.sourceSegmentIds.length >= right.sourceSegmentIds.length ? left : right;
}

function shareSourceSegment(left: Wall, right: Wall): boolean {
  const rightIds = new Set(right.sourceSegmentIds);
  return left.sourceSegmentIds.some((segmentId) => rightIds.has(segmentId));
}

function boundingBoxOverlapRatio(left: Wall, right: Wall): number {
  const leftBox = boundingBox(left);
  const rightBox = boundingBox(right);
  const intersectionWidth = Math.max(0, Math.min(leftBox.xMax, rightBox.xMax) - Math.max(leftBox.xMin, rightBox.xMin));
  const intersectionHeight = Math.max(0, Math.min(leftBox.yMax, rightBox.yMax) - Math.max(leftBox.yMin, rightBox.yMin));
  const intersectionArea = intersectionWidth * intersectionHeight;
  const unionArea = boxArea(leftBox) + boxArea(rightBox) - intersectionArea;
  return unionArea <= 0 ? 0 : intersectionArea / unionArea;
}

function boundingBox(wall: Wall): { xMin: number; yMin: number; xMax: number; yMax: number } {
  const xs = wall.footprint.map((point) => point.x);
  const ys = wall.footprint.map((point) => point.y);
  return {
    xMin: Math.min(...xs),
    yMin: Math.min(...ys),
    xMax: Math.max(...xs),
    yMax: Math.max(...ys)
  };
}

function boxArea(box: { xMin: number; yMin: number; xMax: number; yMax: number }): number {
  return Math.max(0, box.xMax - box.xMin) * Math.max(0, box.yMax - box.yMin);
}

function union(parents: number[], left: number, right: number): void {
  const leftRoot = find(parents, left);
  const rightRoot = find(parents, right);
  if (leftRoot !== rightRoot) parents[rightRoot] = leftRoot;
}

function find(parents: number[], index: number): number {
  let root = index;
  while (parents[root] !== root) root = parents[root];
  while (parents[index] !== index) {
    const parent = parents[index];
    parents[index] = root;
    index = parent;
  }
  return root;
}
