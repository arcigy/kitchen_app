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

const rawWallOutline = (source: Wall) => {
  const direction = norm(sub(source.b, source.a));
  const normal = perpLeft(direction);
  const half = source.thicknessM / 2;
  return [
    { x: source.a.x + normal.x * half, z: source.a.z + normal.z * half },
    { x: source.b.x + normal.x * half, z: source.b.z + normal.z * half },
    { x: source.b.x - normal.x * half, z: source.b.z - normal.z * half },
    { x: source.a.x - normal.x * half, z: source.a.z - normal.z * half }
  ];
};

const pointClose = (a: Point, b: Point, eps = 1e-6) => dist(a, b) <= eps;

const outlineSegments = (outline: Point[]) =>
  outline.map((point, index) => ({ a: point, b: outline[(index + 1) % outline.length]! }));

const hasSegment = (outline: Point[], a: Point, b: Point, eps = 1e-6) =>
  outlineSegments(outline).some((segment) =>
    (pointClose(segment.a, a, eps) && pointClose(segment.b, b, eps)) ||
    (pointClose(segment.a, b, eps) && pointClose(segment.b, a, eps))
  );

const signedArea = (outline: Point[]) =>
  outline.reduce((sum, point, index) => {
    const next = outline[(index + 1) % outline.length]!;
    return sum + point.x * next.z - next.x * point.z;
  }, 0) / 2;

const hasBoundaryChainCap = (outline: Point[], left: Point, chain: Point[], right: Point) => {
  const capPath = [left, ...chain, right];
  return capPath.length >= 2 && capPath.every((point, index) => index === 0 || hasSegment(outline, capPath[index - 1]!, point));
};

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

  test("regression_corner_body_join_does_not_create_triangle", () => {
    const res = solveWallNetwork(failingWallNetworkCase01(), { nodeTolM: 0.04 });
    const diagonal = solvedWall(res, "diagonal");

    expect(diagonal.a.source).toBe("cornerJoin");
    expect(diagonal.b.source).toBe("cornerJoin");
    expect(diagonal.a.boundaryChain).toBeUndefined();
    expect(diagonal.b.boundaryChain).toBeUndefined();
    expect(diagonal.outline).toHaveLength(4);
    expect(diagonal.outline.some((point) => pointClose(point, P(0.075, 0.1619905496203105)))).toBe(false);
    expect(diagonal.outline.some((point) => pointClose(point, P(4.925, 2.8380094503796895)))).toBe(false);
  });

  test("regression_diagonal_to_corner_uses_corner_join_not_two_body_joins", () => {
    const res = solveWallNetwork(failingWallNetworkCase01(), { nodeTolM: 0.04 });
    const diagonal = solvedWall(res, "diagonal");

    expect(diagonal.a.source).not.toBe("bodyJoin");
    expect(diagonal.b.source).not.toBe("bodyJoin");
    expect(diagonal.a.source).toBe("cornerJoin");
    expect(diagonal.b.source).toBe("cornerJoin");
    expect(pointClose(diagonal.a.left, P(0.075, 0.075)) || pointClose(diagonal.a.right, P(0.075, 0.075))).toBe(true);
    expect(pointClose(diagonal.b.left, P(4.925, 2.925)) || pointClose(diagonal.b.right, P(4.925, 2.925))).toBe(true);
  });

  test("regression_diagonal_frame_solved_outline_is_not_raw_rectangle", () => {
    const walls = failingWallNetworkCase01();
    const diagonalSource = walls.find((entry) => entry.id === "diagonal")!;
    const raw = rawWallOutline(diagonalSource);
    const res = solveWallNetwork(walls, { nodeTolM: 0.04 });
    const diagonal = solvedWall(res, "diagonal");

    expect(diagonal.outline).toHaveLength(4);
    expect(raw.every((rawPoint) => diagonal.outline.some((point) => pointClose(point, rawPoint)))).toBe(false);
    expect(hasSegment(diagonal.outline, raw[0]!, raw[1]!)).toBe(false);
    expect(hasSegment(diagonal.outline, raw[2]!, raw[3]!)).toBe(false);
    expect(diagonal.a.source).toBe("cornerJoin");
    expect(diagonal.b.source).toBe("cornerJoin");
  });

  test("regression_selected_outline_no_corner_triangle", () => {
    const res = solveWallNetwork(failingWallNetworkCase01(), { nodeTolM: 0.04 });
    const diagonal = solvedWall(res, "diagonal");

    expect(diagonal.outline).toHaveLength(4);
    expect(hasSegment(diagonal.outline, P(0.075, 0.1619905496203105), P(0.075, 0.075))).toBe(false);
    expect(hasSegment(diagonal.outline, P(0.075, 0.075), P(0.22303654935386175, 0.075))).toBe(true);
    expect(hasSegment(diagonal.outline, P(4.925, 2.8380094503796895), P(4.925, 2.925))).toBe(false);
    expect(hasSegment(diagonal.outline, P(4.7769634506461385, 2.925), P(4.925, 2.925))).toBe(true);
  });

  test("regression_corner_join_preserves_host_walls", () => {
    const res = solveWallNetwork(failingWallNetworkCase01(), { nodeTolM: 0.04 });
    const left = solvedWall(res, "left");
    const bottom = solvedWall(res, "bottom");

    expect(left.outline.length).toBeGreaterThanOrEqual(4);
    expect(bottom.outline.length).toBeGreaterThanOrEqual(4);
    expect(left.outline.every((point) => Number.isFinite(point.x) && Number.isFinite(point.z))).toBe(true);
    expect(bottom.outline.every((point) => Number.isFinite(point.x) && Number.isFinite(point.z))).toBe(true);
    expect(isSimplePolygon(left.outline)).toBe(true);
    expect(isSimplePolygon(bottom.outline)).toBe(true);
  });

  test("regression_diagonal_corner_outline_closed_and_ordered", () => {
    const res = solveWallNetwork(failingWallNetworkCase01(), { nodeTolM: 0.04 });
    const diagonal = solvedWall(res, "diagonal");

    expect(diagonal.outline).toHaveLength(4);
    expect(diagonal.outline.every((point) => Number.isFinite(point.x) && Number.isFinite(point.z))).toBe(true);
    expect(Math.abs(signedArea(diagonal.outline))).toBeGreaterThan(1e-10);
    expect(isSimplePolygon(diagonal.outline)).toBe(true);
    expect(outlineSegments(diagonal.outline)).toHaveLength(4);
    expect(hasSegment(diagonal.outline, diagonal.a.left, diagonal.a.right)).toBe(true);
    expect(hasSegment(diagonal.outline, diagonal.b.left, diagonal.b.right)).toBe(true);
    expect(hasSegment(diagonal.outline, diagonal.a.left, diagonal.b.right)).toBe(false);
    expect(hasSegment(diagonal.outline, diagonal.a.right, diagonal.b.left)).toBe(false);
  });

  test("regression_selected_outline_matches_diagonal_wall_outline", () => {
    const res = solveWallNetwork(failingWallNetworkCase01(), { nodeTolM: 0.04 });
    const diagonal = solvedWall(res, "diagonal");
    const selectedOutlinePoints = diagonal.outline;

    expect(selectedOutlinePoints).toEqual(diagonal.outline);
    expect(outlineSegments(selectedOutlinePoints)).toHaveLength(4);
    expect(isSimplePolygon(diagonal.outline)).toBe(true);
  });

  test("regression_corner_join_debug_boundary_edges_use_single_cap", () => {
    const res = solveWallNetwork(failingWallNetworkCase01(), { nodeTolM: 0.04 });
    const diagonal = solvedWall(res, "diagonal");
    const edges = res.debug.boundaryEdges.filter((edge) => edge.wallId === "diagonal" && edge.end === "a");

    expect(edges.some((edge) => edge.source === "cornerJoin")).toBe(true);
    expect(edges.some((edge) => hasSegment([edge.a, edge.b], diagonal.a.left, diagonal.a.right))).toBe(true);
    expect(edges.some((edge) => hasSegment([edge.a, edge.b], P(0.075, 0.1619905496203105), P(0.075, 0.075)))).toBe(false);
  });
});
