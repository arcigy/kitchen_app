import { describe, expect, test } from "vitest";
import polygonClipping from "polygon-clipping";
import { solveWallNetwork } from "./solver";
import type { Wall } from "./model";

const P = (x: number, z: number) => ({ x, z });

function wall(id: string, a: { x: number; z: number }, b: { x: number; z: number }, tMm = 150): Wall {
  return { id, a, b, thicknessM: tMm / 1000, justification: "center", exteriorSign: 1 };
}

const normalizedFootprint = (res: ReturnType<typeof solveWallNetwork>) =>
  res.footprint
    .flatMap((polygon) =>
      polygon.map((ring) =>
        (ring.length > 1 ? ring.slice(0, -1) : ring)
          .map(([x, z]) => [Number(x.toFixed(4)), Number(z.toFixed(4))])
          .sort((a, b) => a[0] - b[0] || a[1] - b[1])
      )
    )
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));

const totalRingCount = (res: ReturnType<typeof solveWallNetwork>) =>
  res.footprint.reduce((sum, polygon) => sum + polygon.length, 0);

type PolygonRing = Array<[number, number]>;
type WallPlanPolygon = PolygonRing[];
type WallPlanMultiPolygon = WallPlanPolygon[];
type PolygonClipper = {
  intersection: (...polygons: WallPlanMultiPolygon[]) => WallPlanMultiPolygon;
};

const clipper = polygonClipping as PolygonClipper;

const outlineMultiPolygon = (points: Array<{ x: number; z: number }>): WallPlanMultiPolygon => {
  const ring = points.map((point) => [point.x, point.z] as [number, number]);
  if (ring.length > 0) ring.push(ring[0]!);
  return [[ring]];
};

const ringArea = (ring: PolygonRing) => {
  let area = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const a = ring[index]!;
    const b = ring[index + 1]!;
    area += a[0] * b[1] - b[0] * a[1];
  }
  return area / 2;
};

const multiPolygonArea = (multi: WallPlanMultiPolygon) =>
  Math.abs(multi.reduce((sum, polygon) => sum + polygon.reduce((polySum, ring) => polySum + ringArea(ring), 0), 0));

const outlineArea = (outline: Array<{ x: number; z: number }>) => {
  let area = 0;
  for (let index = 0; index < outline.length; index += 1) {
    const a = outline[index]!;
    const b = outline[(index + 1) % outline.length]!;
    area += a.x * b.z - b.x * a.z;
  }
  return Math.abs(area / 2);
};

const isFinitePoint = (point: { x: number; z: number }) => Number.isFinite(point.x) && Number.isFinite(point.z);

const expectNoWallOutlineOverlap = (res: ReturnType<typeof solveWallNetwork>) => {
  for (let i = 0; i < res.walls.length; i += 1) {
    for (let j = i + 1; j < res.walls.length; j += 1) {
      const a = res.walls[i]!;
      const b = res.walls[j]!;
      const overlap = clipper.intersection(outlineMultiPolygon(a.outline), outlineMultiPolygon(b.outline));
      expect(multiPolygonArea(overlap), `${a.id} overlaps ${b.id}`).toBeLessThan(1e-8);
    }
  }
};

const expectValidSolvedOutlines = (res: ReturnType<typeof solveWallNetwork>) => {
  for (const wallItem of res.walls) {
    expect(wallItem.outline.length, `${wallItem.id} outline point count`).toBeGreaterThanOrEqual(4);
    expect(wallItem.outline.every(isFinitePoint), `${wallItem.id} finite outline`).toBe(true);
    expect(outlineArea(wallItem.outline), `${wallItem.id} non-zero area`).toBeGreaterThan(1e-8);
    expect(isFinitePoint(wallItem.a.left) && isFinitePoint(wallItem.a.right), `${wallItem.id} start cap points`).toBe(true);
    expect(isFinitePoint(wallItem.b.left) && isFinitePoint(wallItem.b.right), `${wallItem.id} end cap points`).toBe(true);
    expect(Math.hypot(wallItem.a.left.x - wallItem.a.right.x, wallItem.a.left.z - wallItem.a.right.z), `${wallItem.id} start cap length`).toBeGreaterThan(1e-8);
    expect(Math.hypot(wallItem.b.left.x - wallItem.b.right.x, wallItem.b.left.z - wallItem.b.right.z), `${wallItem.id} end cap length`).toBeGreaterThan(1e-8);
    const closedRing = [...wallItem.outline, wallItem.outline[0]!];
    expect(closedRing[0]).toEqual(closedRing[closedRing.length - 1]);
  }
  expect(res.debug.solvedCaps).toHaveLength(res.walls.length * 2);
};

const edgeLength = (edge: { a: { x: number; z: number }; b: { x: number; z: number } }) =>
  Math.hypot(edge.a.x - edge.b.x, edge.a.z - edge.b.z);

const roundedBoundaryEdges = (res: ReturnType<typeof solveWallNetwork>) =>
  res.debug.boundaryEdges
    .map((edge) => ({
      kind: edge.kind,
      wallId: edge.wallId ?? "",
      side: edge.side ?? "",
      end: edge.end ?? "",
      source: edge.source ?? "",
      a: [Number(edge.a.x.toFixed(4)), Number(edge.a.z.toFixed(4))].sort((a, b) => a - b),
      b: [Number(edge.b.x.toFixed(4)), Number(edge.b.z.toFixed(4))].sort((a, b) => a - b)
    }))
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));

const rectangleWithFaceDiagonal = () => [
  wall("left", P(0, 0), P(0, 3)),
  wall("top", P(0, 3), P(5, 3)),
  wall("right", P(5, 3), P(5, 0)),
  wall("bottom", P(5, 0), P(0, 0)),
  wall("diagonal", P(0.8, 0.075), P(4.7, 2.925))
];

describe("walls2d multi-wall union joins", () => {
  test("keeps a bottom-left L corner footprint clean without a notch", () => {
    const res = solveWallNetwork([
      wall("bottom", P(0, 0), P(4, 0)),
      wall("left", P(0, 0), P(0, 3))
    ], { nodeTolM: 1e-6 });

    expectNoWallOutlineOverlap(res);
    expectValidSolvedOutlines(res);
    expect(totalRingCount(res)).toBe(1);
    expect(res.debug.finalPolygons).toHaveLength(1);
  });

  test("keeps a three-wall same-endpoint join as one deterministic footprint", () => {
    const walls = [
      wall("east", P(0, 0), P(4, 0)),
      wall("north", P(0, 0), P(0, 4)),
      wall("diagonal", P(0, 0), P(3, 2))
    ];

    const normal = solveWallNetwork(walls, { nodeTolM: 1e-6 });
    const reversed = solveWallNetwork([walls[2]!, walls[0]!, walls[1]!], { nodeTolM: 1e-6 });

    expect(normal.debug.nodes.find((node) => node.incident.length === 3)).toBeTruthy();
    expectNoWallOutlineOverlap(normal);
    expectValidSolvedOutlines(normal);
    expect(normal.joinPolys).toHaveLength(1);
    expect(totalRingCount(normal)).toBe(1);
    expect(normalizedFootprint(reversed)).toEqual(normalizedFootprint(normal));
  });

  test("keeps a four-wall star node deterministic regardless of draw order", () => {
    const walls = [
      wall("east", P(0, 0), P(4, 0)),
      wall("north", P(0, 0), P(0, 4)),
      wall("west", P(0, 0), P(-4, 0)),
      wall("south", P(0, 0), P(0, -4))
    ];

    const normal = solveWallNetwork(walls, { nodeTolM: 1e-6 });
    const shuffled = solveWallNetwork([walls[3]!, walls[1]!, walls[0]!, walls[2]!], { nodeTolM: 1e-6 });

    expect(normal.debug.nodes.find((node) => node.incident.length === 4)).toBeTruthy();
    expectNoWallOutlineOverlap(normal);
    expectValidSolvedOutlines(normal);
    expect(normal.joinPolys).toHaveLength(1);
    expect(totalRingCount(normal)).toBe(1);
    expect(normalizedFootprint(shuffled)).toEqual(normalizedFootprint(normal));
  });

  test("handles an angled wall entering an existing corner through the final footprint", () => {
    const res = solveWallNetwork([
      wall("top", P(0, 3), P(5, 3)),
      wall("right", P(5, 3), P(5, 0)),
      wall("angled", P(0, 0), P(5, 3)),
      wall("outside", P(5, 3), P(8, 4.5))
    ], { nodeTolM: 0.04 });

    expect(res.debug.nodes.some((node) => node.incident.length >= 3)).toBe(true);
    expectNoWallOutlineOverlap(res);
    expectValidSolvedOutlines(res);
    expect(totalRingCount(res)).toBe(1);
    expect(res.footprint.flat().flat().every(([x, z]) => Number.isFinite(x) && Number.isFinite(z))).toBe(true);
  });

  test("keeps a T-join footprint stable when a wall ends on another wall body", () => {
    const walls = [
      wall("host", P(-4, 0), P(4, 0)),
      wall("branch", P(0, -3), P(0, 0))
    ];

    const normal = solveWallNetwork(walls, { nodeTolM: 1e-6 });
    const reversed = solveWallNetwork([walls[1]!, walls[0]!], { nodeTolM: 1e-6 });

    expectNoWallOutlineOverlap(normal);
    expectValidSolvedOutlines(normal);
    expect(totalRingCount(normal)).toBe(1);
    expect(normalizedFootprint(reversed)).toEqual(normalizedFootprint(normal));
  });

  test("keeps a saved and loaded multi-join footprint identical", () => {
    const walls = [
      wall("east", P(0, 0), P(4, 0)),
      wall("north", P(0, 0), P(0, 4)),
      wall("diagonal", P(0, 0), P(3, 2)),
      wall("thick", P(0, 0), P(-3, 2), 250)
    ];
    const loaded = JSON.parse(JSON.stringify(walls)) as Wall[];

    expect(normalizedFootprint(solveWallNetwork(loaded, { nodeTolM: 1e-6 }))).toEqual(
      normalizedFootprint(solveWallNetwork(walls, { nodeTolM: 1e-6 }))
    );
  });

  test("keeps host wall start and end caps valid when a diagonal wall dies into its face", () => {
    const res = solveWallNetwork([
      wall("left", P(0, 0), P(0, 3)),
      wall("bottom", P(0, 0), P(5, 0)),
      wall("right", P(5, 0), P(5, 3)),
      wall("diagonal", P(0.6, 2.4), P(1.45, 0))
    ], { nodeTolM: 1e-6 });
    const bottom = res.walls.find((entry) => entry.id === "bottom")!;

    expectValidSolvedOutlines(res);
    expect(bottom.a.source).toBe("join");
    expect(bottom.b.source).toBe("join");
    expect(Math.hypot(bottom.a.left.x - bottom.a.right.x, bottom.a.left.z - bottom.a.right.z)).toBeGreaterThan(0.1);
    expect(Math.hypot(bottom.b.left.x - bottom.b.right.x, bottom.b.left.z - bottom.b.right.z)).toBeGreaterThan(0.1);
  });

  test("exposes clean outer and inner boundary loops for a rectangular wall loop", () => {
    const res = solveWallNetwork([
      wall("left", P(0, 0), P(0, 3)),
      wall("top", P(0, 3), P(5, 3)),
      wall("right", P(5, 3), P(5, 0)),
      wall("bottom", P(5, 0), P(0, 0))
    ], { nodeTolM: 1e-6 });

    expectValidSolvedOutlines(res);
    expect(res.debug.boundaryEdges.filter((edge) => edge.kind === "outer")).toHaveLength(4);
    expect(res.debug.boundaryEdges.filter((edge) => edge.kind === "inner")).toHaveLength(4);
    expect(res.debug.boundaryEdges.filter((edge) => edge.kind === "wallFace").length).toBeGreaterThanOrEqual(8);
  });

  test("keeps both diagonal wall face boundaries when it terminates on wall faces", () => {
    const res = solveWallNetwork(rectangleWithFaceDiagonal(), { nodeTolM: 1e-6 });
    const diagonal = res.walls.find((entry) => entry.id === "diagonal")!;
    const diagonalFaceEdges = res.debug.boundaryEdges.filter((edge) => edge.kind === "wallFace" && edge.wallId === "diagonal");
    const diagonalJoinEdges = res.debug.boundaryEdges.filter((edge) => edge.kind === "join" && edge.wallId === "diagonal");

    expectValidSolvedOutlines(res);
    expectNoWallOutlineOverlap(res);
    expect(diagonal.a.source).toBe("bodyJoin");
    expect(diagonal.b.source).toBe("bodyJoin");
    expect(diagonalFaceEdges.filter((edge) => edge.side === "left").reduce((sum, edge) => sum + edgeLength(edge), 0)).toBeGreaterThan(4);
    expect(diagonalFaceEdges.filter((edge) => edge.side === "right").reduce((sum, edge) => sum + edgeLength(edge), 0)).toBeGreaterThan(4);
    expect(diagonalJoinEdges).toHaveLength(2);
  });

  test("keeps a visible boundary at the bottom-left diagonal connection", () => {
    const res = solveWallNetwork(rectangleWithFaceDiagonal(), { nodeTolM: 1e-6 });
    const startJoin = res.debug.boundaryEdges.find(
      (edge) =>
        edge.kind === "join" &&
        edge.wallId === "diagonal" &&
        edge.end === "a" &&
        Math.abs(edge.a.z - 0.075) < 1e-6 &&
        Math.abs(edge.b.z - 0.075) < 1e-6
    );

    expect(startJoin).toBeTruthy();
    expect(edgeLength(startJoin!)).toBeGreaterThan(0.2);
  });

  test("keeps boundary edges deterministic when the wall draw order is reversed", () => {
    const walls = rectangleWithFaceDiagonal();
    const normal = solveWallNetwork(walls, { nodeTolM: 1e-6 });
    const reversed = solveWallNetwork([...walls].reverse(), { nodeTolM: 1e-6 });

    expect(roundedBoundaryEdges(reversed)).toEqual(roundedBoundaryEdges(normal));
    expect(normalizedFootprint(reversed)).toEqual(normalizedFootprint(normal));
  });
});
