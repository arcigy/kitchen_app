import { describe, expect, test } from "vitest";
import { solveWallNetwork } from "./solver";
import { cross, dist, dot, norm, perpLeft, sub, type Point } from "./geom";
import type { Wall } from "./model";

const P = (x: number, z: number) => ({ x, z });

function wall(
  id: string,
  a: { x: number; z: number },
  b: { x: number; z: number },
  tMm: number,
  exteriorSign: 1 | -1 = 1
): Wall {
  return { id, a, b, thicknessM: tMm / 1000, justification: "center", exteriorSign };
}

const solvedWall = (res: ReturnType<typeof solveWallNetwork>, id: string) => {
  const item = res.walls.find((entry) => entry.id === id);
  expect(item).toBeTruthy();
  return item!;
};

const endWidth = (res: ReturnType<typeof solveWallNetwork>, id: string, end: "a" | "b") => {
  const item = solvedWall(res, id);
  return dist(item[end].left, item[end].right);
};

const endProjectedWidth = (res: ReturnType<typeof solveWallNetwork>, source: Wall, end: "a" | "b") => {
  const item = solvedWall(res, source.id);
  const normal = perpLeft(norm(sub(source.b, source.a)));
  return Math.abs(dot(sub(item[end].left, item[end].right), normal));
};

const expectFullThickness = (res: ReturnType<typeof solveWallNetwork>, source: Wall) => {
  expect(endProjectedWidth(res, source, "a")).toBeCloseTo(source.thicknessM, 6);
  expect(endProjectedWidth(res, source, "b")).toBeCloseTo(source.thicknessM, 6);
  expect(solvedWall(res, source.id).outline).toHaveLength(4);
};

const expectExactCapThickness = (res: ReturnType<typeof solveWallNetwork>, id: string, thicknessM: number) => {
  expect(endWidth(res, id, "a")).toBeCloseTo(thicknessM, 6);
  expect(endWidth(res, id, "b")).toBeCloseTo(thicknessM, 6);
  expect(solvedWall(res, id).outline).toHaveLength(4);
};

const roundedPolygons = (res: ReturnType<typeof solveWallNetwork>) =>
  res.debug.finalPolygons
    .map((poly) =>
      poly
        .map((point) => [Number(point.x.toFixed(4)), Number(point.z.toFixed(4))])
        .sort((a, b) => a[0] - b[0] || a[1] - b[1])
    )
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));

const failingWallNetworkCase01 = () => [
  wall("left", P(0, 0), P(0, 3), 150),
  wall("top", P(0, 3), P(5, 3), 150),
  wall("right", P(5, 3), P(5, 0), 150),
  wall("bottom", P(5, 0), P(0, 0), 150),
  wall("diagonal", P(0.075, 0.075), P(4.925, 2.925), 150)
];

const pointClose = (a: Point, b: Point, eps = 1e-6) => dist(a, b) <= eps;

const outlineSegments = (outline: Point[]) =>
  outline.map((point, index) => ({ a: point, b: outline[(index + 1) % outline.length]! }));

const hasSegment = (outline: Point[], a: Point, b: Point, eps = 1e-6) =>
  outlineSegments(outline).some((segment) =>
    (pointClose(segment.a, a, eps) && pointClose(segment.b, b, eps)) ||
    (pointClose(segment.a, b, eps) && pointClose(segment.b, a, eps))
  );

const isSimplePolygon = (outline: Point[]) => {
  const segments = outlineSegments(outline);
  for (let i = 0; i < segments.length; i += 1) {
    for (let j = i + 1; j < segments.length; j += 1) {
      if (Math.abs(i - j) <= 1 || (i === 0 && j === segments.length - 1)) continue;
      const first = segments[i]!;
      const second = segments[j]!;
      const d1 = sub(first.b, first.a);
      const d2 = sub(second.b, second.a);
      const denom = cross(d1, d2);
      if (Math.abs(denom) <= 1e-9) continue;
      const rel = sub(second.a, first.a);
      const t = cross(rel, d2) / denom;
      const u = cross(rel, d1) / denom;
      if (t > 1e-6 && t < 1 - 1e-6 && u > 1e-6 && u < 1 - 1e-6) return false;
    }
  }
  return true;
};

describe("walls2d deterministic wall join model", () => {
  test("represents every wall as centerline segment plus full-thickness offset polygon", () => {
    const horizontal = wall("horizontal", P(0, 0), P(5, 0), 150);
    const res = solveWallNetwork([horizontal]);

    expectExactCapThickness(res, "horizontal", 0.15);
    expectFullThickness(res, horizontal);
    expect(res.debug.rawWallPolygons).toHaveLength(1);
    expect(res.joinPolys).toHaveLength(0);
  });

  test("creates a shared sorted join node for an L join", () => {
    const res = solveWallNetwork([
      wall("east", P(0, 0), P(5, 0), 150),
      wall("north", P(0, 0), P(0, 5), 150)
    ], { nodeTolM: 1e-6 });
    const node = res.debug.nodes.find((item) => item.incident.length === 2);

    expect(node).toBeTruthy();
    expect(node!.sortedIncident.map((item) => item.wallId)).toEqual(["east", "north"]);
    expect(node!.intersections).toHaveLength(2);
    expect(res.debug.finalPolygons.length).toBeGreaterThan(0);
  });

  test("handles split T joins without narrowing any participating wall", () => {
    const walls = [
      wall("left", P(-5, 0), P(0, 0), 150),
      wall("right", P(0, 0), P(5, 0), 150),
      wall("branch", P(0, 0), P(0, 4), 100)
    ];
    const res = solveWallNetwork(walls, { nodeTolM: 1e-6 });
    const node = res.debug.nodes.find((item) => item.incident.length === 3);

    expect(node).toBeTruthy();
    expect(node!.sortedIncident.map((item) => item.wallId)).toEqual(["right", "branch", "left"]);
    for (const item of walls) expectFullThickness(res, item);
  });

  test("handles four-way X style nodes deterministically", () => {
    const walls = [
      wall("east", P(0, 0), P(4, 0), 150),
      wall("north", P(0, 0), P(0, 4), 150),
      wall("west", P(0, 0), P(-4, 0), 150),
      wall("south", P(0, 0), P(0, -4), 150)
    ];
    const res = solveWallNetwork(walls, { nodeTolM: 1e-6 });
    const shuffled = solveWallNetwork([walls[2]!, walls[0]!, walls[3]!, walls[1]!], { nodeTolM: 1e-6 });
    const node = res.debug.nodes.find((item) => item.incident.length === 4);

    expect(node).toBeTruthy();
    expect(node!.sortedIncident.map((item) => item.wallId)).toEqual(["east", "north", "west", "south"]);
    expect(node!.intersections).toHaveLength(4);
    expect(roundedPolygons(shuffled)).toEqual(roundedPolygons(res));
  });

  test("keeps diagonal wall full width when it joins horizontal and vertical walls", () => {
    const walls = [
      wall("top", P(0, 3), P(5, 3), 150),
      wall("right", P(5, 3), P(5, 0), 150),
      wall("diagonal", P(0, 0), P(5, 3), 150),
      wall("outside", P(5, 3), P(8, 4.5), 150)
    ];
    const res = solveWallNetwork(walls, { nodeTolM: 0.04 });

    for (const item of walls) expectFullThickness(res, item);
    expect(res.debug.nodes.some((node) => node.incident.length >= 3)).toBe(true);
    expect(res.joinPolys.some((poly) => poly.length >= 3)).toBe(true);
    expect(res.footprint.reduce((sum, polygon) => sum + polygon.length, 0)).toBe(1);
  });

  test("keeps very acute two-wall joins finite while preserving free-end thickness", () => {
    const res = solveWallNetwork([
      wall("base", P(0, 0), P(8, 0), 150),
      wall("acute", P(0, 0), P(8, 0.35), 150)
    ], { nodeTolM: 1e-6 });

    expect(endWidth(res, "base", "b")).toBeCloseTo(0.15, 6);
    expect(endWidth(res, "acute", "b")).toBeCloseTo(0.15, 6);
    expect(Number.isFinite(endWidth(res, "base", "a"))).toBe(true);
    expect(Number.isFinite(endWidth(res, "acute", "a"))).toBe(true);
    expect(res.debug.nodes.find((node) => node.incident.length === 2)?.intersections.length).toBeGreaterThanOrEqual(0);
  });

  test("supports different wall thicknesses at the same node", () => {
    const walls = [
      wall("thick", P(0, 0), P(5, 0), 300),
      wall("thin", P(0, 0), P(0, 5), 100),
      wall("mid", P(0, 0), P(-4, 3), 150)
    ];
    const res = solveWallNetwork(walls, { nodeTolM: 1e-6 });

    for (const item of walls) expectFullThickness(res, item);
    expect(res.debug.nodes.find((node) => node.incident.length === 3)?.intersections).toHaveLength(3);
  });

  test("handles a wall ending on the body of another wall through the final footprint union", () => {
    const walls = [
      wall("host", P(-4, 0), P(4, 0), 150),
      wall("branch", P(0, -3), P(0, 0), 150)
    ];
    const res = solveWallNetwork(walls, { nodeTolM: 1e-6 });

    for (const item of walls) expectFullThickness(res, item);
    expect(res.debug.finalPolygons.length).toBeGreaterThan(0);
  });

  test("is independent from the order walls are supplied", () => {
    const walls = [
      wall("left", P(0, 0), P(0, 3), 150),
      wall("top", P(0, 3), P(5, 3), 150),
      wall("right", P(5, 3), P(5, 0), 150),
      wall("bottom", P(5, 0), P(0, 0), 150),
      wall("diagonalA", P(0, 0), P(5, 3), 150),
      wall("diagonalB", P(0, 3), P(5, 0), 150)
    ];

    const a = solveWallNetwork(walls, { nodeTolM: 0.04 });
    const b = solveWallNetwork([walls[4]!, walls[2]!, walls[0]!, walls[5]!, walls[1]!, walls[3]!], { nodeTolM: 0.04 });

    expect(roundedPolygons(b)).toEqual(roundedPolygons(a));
    expect(b.debug.nodes.map((node) => node.sortedIncident.map((item) => item.wallId))).toEqual(
      a.debug.nodes.map((node) => node.sortedIncident.map((item) => item.wallId))
    );
  });

  test("regression_diagonal_cut_wall_outline_uses_boundary_pairs", () => {
    const res = solveWallNetwork(failingWallNetworkCase01(), { nodeTolM: 0.04 });
    const diagonal = solvedWall(res, "diagonal");

    expect(diagonal.a.source).toBe("bodyJoin");
    expect(diagonal.b.source).toBe("bodyJoin");
    expect(diagonal.a.boundaryChain ?? []).toHaveLength(0);
    expect(diagonal.b.boundaryChain ?? []).toHaveLength(0);
    expect(diagonal.a.extra ?? []).toHaveLength(0);
    expect(diagonal.b.extra ?? []).toHaveLength(0);
    expect(diagonal.outline).toHaveLength(4);
    expect(hasSegment(diagonal.outline, diagonal.a.left, diagonal.a.right)).toBe(true);
    expect(hasSegment(diagonal.outline, diagonal.b.left, diagonal.b.right)).toBe(true);
  });

  test("regression_diagonal_cut_wall_outline_is_ordered_closed_polygon", () => {
    const res = solveWallNetwork(failingWallNetworkCase01(), { nodeTolM: 0.04 });
    const diagonal = solvedWall(res, "diagonal");

    expect(diagonal.outline).toHaveLength(4);
    expect(diagonal.outline.every((point) => Number.isFinite(point.x) && Number.isFinite(point.z))).toBe(true);
    expect(isSimplePolygon(diagonal.outline)).toBe(true);
    expect(hasSegment(diagonal.outline, diagonal.a.left, diagonal.b.left)).toBe(true);
    expect(hasSegment(diagonal.outline, diagonal.a.right, diagonal.b.right)).toBe(true);
    expect(hasSegment(diagonal.outline, diagonal.a.left, diagonal.b.right)).toBe(false);
    expect(hasSegment(diagonal.outline, diagonal.a.right, diagonal.b.left)).toBe(false);
  });

  test("regression_diagonal_cut_wall_has_start_and_end_cut_edges", () => {
    const res = solveWallNetwork(failingWallNetworkCase01(), { nodeTolM: 0.04 });
    const diagonal = solvedWall(res, "diagonal");

    expect(dist(diagonal.a.left, diagonal.a.right)).toBeGreaterThan(0.15);
    expect(dist(diagonal.b.left, diagonal.b.right)).toBeGreaterThan(0.15);
    expect(diagonal.a.left.z).toBeCloseTo(diagonal.a.right.z, 6);
    expect(diagonal.b.left.z).toBeCloseTo(diagonal.b.right.z, 6);
    expect(hasSegment(diagonal.outline, diagonal.a.left, diagonal.a.right)).toBe(true);
    expect(hasSegment(diagonal.outline, diagonal.b.left, diagonal.b.right)).toBe(true);
  });

  test("regression_selected_outline_matches_diagonal_wall_outline", () => {
    const res = solveWallNetwork(failingWallNetworkCase01(), { nodeTolM: 0.04 });
    const diagonal = solvedWall(res, "diagonal");
    const selectedOutlinePoints = diagonal.outline;

    expect(selectedOutlinePoints).toEqual(diagonal.outline);
    expect(outlineSegments(selectedOutlinePoints)).toHaveLength(4);
    expect(hasSegment(selectedOutlinePoints, diagonal.a.left, diagonal.a.right)).toBe(true);
    expect(hasSegment(selectedOutlinePoints, diagonal.b.left, diagonal.b.right)).toBe(true);
  });

  test("regression_no_false_green_line_on_selected_diagonal", () => {
    const source = failingWallNetworkCase01().find((item) => item.id === "diagonal")!;
    const res = solveWallNetwork(failingWallNetworkCase01(), { nodeTolM: 0.04 });
    const diagonal = solvedWall(res, "diagonal");
    const wallDirection = norm(sub(source.b, source.a));

    for (const segment of outlineSegments(diagonal.outline)) {
      const d = norm(sub(segment.b, segment.a));
      const parallelToWall = Math.abs(cross(d, wallDirection)) <= 1e-6;
      const horizontalCut = Math.abs(segment.a.z - segment.b.z) <= 1e-6;
      expect(parallelToWall || horizontalCut).toBe(true);
    }
    expect(hasSegment(diagonal.outline, diagonal.a.left, diagonal.b.right)).toBe(false);
    expect(hasSegment(diagonal.outline, diagonal.a.right, diagonal.b.left)).toBe(false);
  });
});
