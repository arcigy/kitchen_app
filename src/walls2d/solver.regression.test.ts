import { describe, expect, test } from "vitest";
import polygonClipping from "polygon-clipping";
import { solveWallNetwork } from "./solver";
import type { Wall } from "./model";

const P = (x: number, z: number) => ({ x, z });

const wall = (id: string, a: { x: number; z: number }, b: { x: number; z: number }, tMm = 150): Wall => ({
  id,
  a,
  b,
  thicknessM: tMm / 1000,
  justification: "center",
  exteriorSign: 1
});

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

const pointFinite = (point: { x: number; z: number } | undefined) =>
  !!point && Number.isFinite(point.x) && Number.isFinite(point.z);

const segmentLength = (edge: { a: { x: number; z: number }; b: { x: number; z: number } }) =>
  Math.hypot(edge.a.x - edge.b.x, edge.a.z - edge.b.z);

const close = (actual: number, expected: number, digits = 5) => expect(actual).toBeCloseTo(expected, digits);

const networkCase = () => [
  wall("left", P(0, 0), P(0, 3)),
  wall("top", P(0, 3), P(5, 3)),
  wall("right", P(5, 3), P(5, 0)),
  wall("bottom", P(5, 0), P(0, 0)),
  wall("diagonal", P(0.8, 0.075), P(4.7, 2.925))
];

const rectangularLoop = () => [
  wall("left", P(0, 0), P(0, 3)),
  wall("top", P(0, 3), P(5, 3)),
  wall("right", P(5, 3), P(5, 0)),
  wall("bottom", P(5, 0), P(0, 0))
];

const reversedRectangularLoop = () => [
  wall("bottom", P(0, 0), P(5, 0)),
  wall("right", P(5, 0), P(5, 3)),
  wall("top", P(5, 3), P(0, 3)),
  wall("left", P(0, 3), P(0, 0))
];

const attachedDiagonalCorner = () => [...rectangularLoop(), wall("diagonal", P(0, 0), P(5, 3))];

const attachedDiagonalNearCorner = () => [...rectangularLoop(), wall("diagonal", P(0.8, 0.075), P(4.925, 2.925))];

const attachedDiagonalInnerCorner = () => [...rectangularLoop(), wall("diagonal", P(0.075, 0.075), P(4.925, 2.925))];

const failingWallNetworkCase01 = () => [
  ...attachedDiagonalInnerCorner(),
  wall("rightSkew", P(5, 0), P(6.2, 0.775))
];

const normalizedBoundaryEdges = (res: ReturnType<typeof solveWallNetwork>) =>
  res.debug.boundaryEdges
    .map((edge) => {
      const endpoints = [
        [Number(edge.a.x.toFixed(4)), Number(edge.a.z.toFixed(4))],
        [Number(edge.b.x.toFixed(4)), Number(edge.b.z.toFixed(4))]
      ].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
      return {
        kind: edge.kind,
        wallId: edge.wallId ?? "",
        side: edge.side ?? "",
        end: edge.end ?? "",
        source: edge.source ?? "",
        endpoints
      };
    })
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));

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

const normalizedSolvedOutlines = (res: ReturnType<typeof solveWallNetwork>) =>
  res.walls
    .map((wallItem) => ({
      id: wallItem.id,
      outline: wallItem.outline
        .map((point) => [Number(point.x.toFixed(4)), Number(point.z.toFixed(4))])
        .sort((a, b) => a[0] - b[0] || a[1] - b[1])
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

const normalizedSolvedOutlinesFor = (res: ReturnType<typeof solveWallNetwork>, ids: string[]) =>
  normalizedSolvedOutlines(res).filter((entry) => ids.includes(entry.id));

const ringPoints = (res: ReturnType<typeof solveWallNetwork>, ringIndex: number) => {
  const ring = res.footprint[0]?.[ringIndex] ?? [];
  return (ring.length > 1 ? ring.slice(0, -1) : ring)
    .map(([x, z]) => [Number(x.toFixed(4)), Number(z.toFixed(4))] as [number, number])
    .sort((a, b) => a[0] - b[0] || a[1] - b[1]);
};

const expectRingCorners = (actual: Array<[number, number]>, expected: Array<[number, number]>) => {
  expect(actual).toHaveLength(expected.length);
  expect(actual).toEqual(expected.map(([x, z]) => [Number(x.toFixed(4)), Number(z.toFixed(4))]).sort((a, b) => a[0] - b[0] || a[1] - b[1]));
};

const expectValidSolvedOutlines = (res: ReturnType<typeof solveWallNetwork>) => {
  for (const solvedWall of res.walls) {
    expect(solvedWall.outline.length, `${solvedWall.id} outline point count`).toBeGreaterThanOrEqual(4);
    expect(solvedWall.outline.every(pointFinite), `${solvedWall.id} finite outline`).toBe(true);
    expect(outlineArea(solvedWall.outline), `${solvedWall.id} non-zero area`).toBeGreaterThan(1e-8);
    expect(
      Math.hypot(
        solvedWall.outline[0]!.x - solvedWall.outline[solvedWall.outline.length - 1]!.x,
        solvedWall.outline[0]!.z - solvedWall.outline[solvedWall.outline.length - 1]!.z
      ),
      `${solvedWall.id} implicit closing edge`
    ).toBeGreaterThan(1e-8);
    expect(pointFinite(solvedWall.a.left), `${solvedWall.id} start left`).toBe(true);
    expect(pointFinite(solvedWall.a.right), `${solvedWall.id} start right`).toBe(true);
    expect(pointFinite(solvedWall.b.left), `${solvedWall.id} end left`).toBe(true);
    expect(pointFinite(solvedWall.b.right), `${solvedWall.id} end right`).toBe(true);
    expect(Math.hypot(solvedWall.a.left.x - solvedWall.a.right.x, solvedWall.a.left.z - solvedWall.a.right.z)).toBeGreaterThan(1e-8);
    expect(Math.hypot(solvedWall.b.left.x - solvedWall.b.right.x, solvedWall.b.left.z - solvedWall.b.right.z)).toBeGreaterThan(1e-8);
  }
};

const expectAxisAlignedWallOutlines = (res: ReturnType<typeof solveWallNetwork>) => {
  for (const wallItem of res.walls) {
    for (let index = 0; index < wallItem.outline.length; index += 1) {
      const a = wallItem.outline[index]!;
      const b = wallItem.outline[(index + 1) % wallItem.outline.length]!;
      const dx = Math.abs(a.x - b.x);
      const dz = Math.abs(a.z - b.z);
      expect(dx < 1e-8 || dz < 1e-8, `${wallItem.id} has diagonal edge ${JSON.stringify(a)} -> ${JSON.stringify(b)}`).toBe(true);
    }
  }
};

const expectCleanRectangularLoop = (res: ReturnType<typeof solveWallNetwork>) => {
  expectValidSolvedOutlines(res);
  expectNoWallOutlineOverlap(res);
  expectAxisAlignedWallOutlines(res);
  expect(res.footprint).toHaveLength(1);
  expect(res.footprint[0]).toHaveLength(2);
  expectRingCorners(ringPoints(res, 0), [
    [-0.075, -0.075],
    [5.075, -0.075],
    [5.075, 3.075],
    [-0.075, 3.075]
  ]);
  expectRingCorners(ringPoints(res, 1), [
    [0.075, 0.075],
    [4.925, 0.075],
    [4.925, 2.925],
    [0.075, 2.925]
  ]);
};

const expectNoTinyFootprintRings = (res: ReturnType<typeof solveWallNetwork>) => {
  for (const polygon of res.footprint) {
    for (const ring of polygon) {
      expect(Math.abs(ringArea(ring))).toBeGreaterThan(1e-5);
    }
  }
};

const expectCase01BottomRightJoinResolved = (res: ReturnType<typeof solveWallNetwork>) => {
  const bottom = res.walls.find((item) => item.id === "bottom")!;
  const right = res.walls.find((item) => item.id === "right")!;
  const rightSkew = res.walls.find((item) => item.id === "rightSkew")!;
  close(bottom.a.left.x, rightSkew.a.right.x);
  close(bottom.a.left.z, rightSkew.a.right.z);
  close(right.b.left.x, rightSkew.a.left.x);
  close(right.b.left.z, rightSkew.a.left.z);
  close(bottom.a.right.x, right.b.right.x);
  close(bottom.a.right.z, right.b.right.z);
};

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

const outlineSegments = (outline: Array<{ x: number; z: number }>) =>
  outline.map((point, index) => [point, outline[(index + 1) % outline.length]!] as const);

const properSegmentIntersection = (
  a: { x: number; z: number },
  b: { x: number; z: number },
  c: { x: number; z: number },
  d: { x: number; z: number },
  eps = 1e-8
) => {
  const orient = (p: { x: number; z: number }, q: { x: number; z: number }, r: { x: number; z: number }) =>
    (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x);
  const o1 = orient(a, b, c);
  const o2 = orient(a, b, d);
  const o3 = orient(c, d, a);
  const o4 = orient(c, d, b);
  return o1 * o2 < -eps && o3 * o4 < -eps;
};

const outlineHasProperSelfIntersection = (outline: Array<{ x: number; z: number }>) => {
  const segments = outlineSegments(outline);
  for (let i = 0; i < segments.length; i += 1) {
    for (let j = i + 1; j < segments.length; j += 1) {
      if (Math.abs(i - j) <= 1 || (i === 0 && j === segments.length - 1)) continue;
      if (properSegmentIntersection(segments[i]![0], segments[i]![1], segments[j]![0], segments[j]![1])) return true;
    }
  }
  return false;
};

const expectSimpleSolvedOutlines = (res: ReturnType<typeof solveWallNetwork>) => {
  expectValidSolvedOutlines(res);
  for (const solvedWall of res.walls) {
    expect(outlineHasProperSelfIntersection(solvedWall.outline), `${solvedWall.id} self-intersects`).toBe(false);
  }
};

const outlineHasPoint = (outline: Array<{ x: number; z: number }>, expected: { x: number; z: number }, eps = 1e-6) =>
  outline.some((point) => Math.abs(point.x - expected.x) <= eps && Math.abs(point.z - expected.z) <= eps);

const edgesFor = (res: ReturnType<typeof solveWallNetwork>, wallId: string, kind?: string) =>
  res.debug.boundaryEdges.filter((edge) => edge.wallId === wallId && (!kind || edge.kind === kind));

describe("wall join regression coverage", () => {
  test("regression_rectangular_loop_stays_clean", () => {
    expectCleanRectangularLoop(solveWallNetwork(rectangularLoop(), { nodeTolM: 1e-6 }));
  });

  test("regression_rectangular_loop_clean_outer_corners", () => {
    const res = solveWallNetwork(rectangularLoop(), { nodeTolM: 1e-6 });

    expectCleanRectangularLoop(res);
    expect(res.debug.boundaryEdges.filter((edge) => edge.kind === "outer")).toHaveLength(4);
  });

  test("regression_rectangular_loop_clean_inner_corners", () => {
    const res = solveWallNetwork(rectangularLoop(), { nodeTolM: 1e-6 });

    expectCleanRectangularLoop(res);
    expect(res.debug.boundaryEdges.filter((edge) => edge.kind === "inner")).toHaveLength(4);
  });

  test("regression_two_wall_l_corner_exact_join", () => {
    const res = solveWallNetwork([
      wall("east", P(0, 0), P(4, 0)),
      wall("north", P(0, 0), P(0, 4))
    ], { nodeTolM: 1e-6 });
    const east = res.walls.find((entry) => entry.id === "east")!;
    const north = res.walls.find((entry) => entry.id === "north")!;

    expectValidSolvedOutlines(res);
    expectNoWallOutlineOverlap(res);
    expectAxisAlignedWallOutlines(res);
    expect(east.a.left).toEqual(P(-0.075, 0.075));
    expect(east.a.right).toEqual(P(-0.075, -0.075));
    expect(north.a.left).toEqual(P(-0.075, 0.075));
    expect(north.a.right).toEqual(P(0.075, 0.075));
  });

  test("regression_two_wall_l_corner_reversed_order", () => {
    const walls = [
      wall("east", P(0, 0), P(4, 0)),
      wall("north", P(0, 0), P(0, 4))
    ];
    const normal = solveWallNetwork(walls, { nodeTolM: 1e-6 });
    const reversed = solveWallNetwork([walls[1]!, walls[0]!], { nodeTolM: 1e-6 });

    expect(normalizedSolvedOutlines(reversed)).toEqual(normalizedSolvedOutlines(normal));
    expect(normalizedFootprint(reversed)).toEqual(normalizedFootprint(normal));
  });

  test("regression_rectangular_loop_reversed_draw_order", () => {
    const normal = solveWallNetwork(rectangularLoop(), { nodeTolM: 1e-6 });
    const reversed = solveWallNetwork(reversedRectangularLoop(), { nodeTolM: 1e-6 });

    expectCleanRectangularLoop(normal);
    expectCleanRectangularLoop(reversed);
    expect(normalizedSolvedOutlines(reversed)).toEqual(normalizedSolvedOutlines(normal));
    expect(normalizedFootprint(reversed)).toEqual(normalizedFootprint(normal));
  });

  test("regression_no_overlap_at_rectangular_loop_corners", () => {
    const res = solveWallNetwork(rectangularLoop(), { nodeTolM: 1e-6 });

    expectCleanRectangularLoop(res);
    expect(res.debug.nodes).toHaveLength(4);
    expect(res.debug.nodes.every((node) => node.incident.length === 2)).toBe(true);
  });

  test("regression_no_missing_outer_boundary_after_join", () => {
    const res = solveWallNetwork(attachedDiagonalNearCorner(), { nodeTolM: 1e-6 });

    expectValidSolvedOutlines(res);
    expectNoWallOutlineOverlap(res);
    expect(res.debug.boundaryEdges.filter((edge) => edge.kind === "outer")).toHaveLength(4);
    expect(res.debug.boundaryEdges.filter((edge) => edge.kind === "outer").every((edge) => segmentLength(edge) > 0.15)).toBe(true);
  });

  test("regression_attached_diagonal_does_not_break_loop", () => {
    const cleanLoop = solveWallNetwork(rectangularLoop(), { nodeTolM: 1e-6 });
    const withDiagonal = solveWallNetwork(attachedDiagonalCorner(), { nodeTolM: 1e-6 });

    expectValidSolvedOutlines(withDiagonal);
    expectNoWallOutlineOverlap(withDiagonal);
    expect(normalizedSolvedOutlinesFor(withDiagonal, ["left", "top", "right", "bottom"])).toEqual(
      normalizedSolvedOutlinesFor(cleanLoop, ["left", "top", "right", "bottom"])
    );
    expect(withDiagonal.debug.nodes.filter((node) => node.incident.length === 3)).toHaveLength(2);
  });

  test("regression_attached_corner_wall_recomputes_network", () => {
    const cleanLoop = solveWallNetwork(rectangularLoop(), { nodeTolM: 1e-6 });
    const withCornerBranch = solveWallNetwork([...rectangularLoop(), wall("cornerBranch", P(0, 0), P(1.2, 0.8))], {
      nodeTolM: 1e-6
    });

    expectValidSolvedOutlines(withCornerBranch);
    expectNoWallOutlineOverlap(withCornerBranch);
    expect(normalizedSolvedOutlinesFor(withCornerBranch, ["left", "top", "right", "bottom"])).toEqual(
      normalizedSolvedOutlinesFor(cleanLoop, ["left", "top", "right", "bottom"])
    );
    expect(withCornerBranch.walls.find((entry) => entry.id === "cornerBranch")?.a.source).toBe("join");
  });

  test("regression_snap_to_corner_creates_resolved_join", () => {
    const cleanLoop = solveWallNetwork(rectangularLoop(), { nodeTolM: 1e-6 });
    const snappedNearCorner = solveWallNetwork(attachedDiagonalCorner(), { nodeTolM: 1e-6 });

    expectValidSolvedOutlines(snappedNearCorner);
    expectNoWallOutlineOverlap(snappedNearCorner);
    expect(snappedNearCorner.debug.nodes.some((node) => node.incident.length === 3 && Math.abs(node.p.x - 5) < 1e-8 && Math.abs(node.p.z - 3) < 1e-8)).toBe(true);
    expect(normalizedSolvedOutlinesFor(snappedNearCorner, ["left", "top", "right", "bottom"])).toEqual(
      normalizedSolvedOutlinesFor(cleanLoop, ["left", "top", "right", "bottom"])
    );
  });

  test("regression_snap_to_edge_creates_intersection_node", () => {
    const res = solveWallNetwork([
      wall("host", P(0, 0), P(5, 0)),
      wall("branch", P(2.5, 2), P(2.5, 0.075))
    ], { nodeTolM: 1e-6 });
    const branch = res.walls.find((entry) => entry.id === "branch")!;

    expectValidSolvedOutlines(res);
    expectNoWallOutlineOverlap(res);
    expect(branch.b.source).toBe("bodyJoin");
    expect(edgesFor(res, "branch", "join").some((edge) => edge.end === "b" && segmentLength(edge) > 0.1)).toBe(true);
  });

  test("regression_save_load_preserves_rectangular_loop_corners", () => {
    const walls = rectangularLoop();
    const loaded = JSON.parse(JSON.stringify(walls)) as Wall[];
    const normal = solveWallNetwork(walls, { nodeTolM: 1e-6 });
    const restored = solveWallNetwork(loaded, { nodeTolM: 1e-6 });

    expectCleanRectangularLoop(restored);
    expect(normalizedSolvedOutlines(restored)).toEqual(normalizedSolvedOutlines(normal));
    expect(normalizedFootprint(restored)).toEqual(normalizedFootprint(normal));
  });

  test("regression_basic_l_corner_no_notch", () => {
    const res = solveWallNetwork([wall("bottom", P(0, 0), P(4, 0)), wall("left", P(0, 0), P(0, 3))], { nodeTolM: 1e-6 });

    expectValidSolvedOutlines(res);
    expectNoWallOutlineOverlap(res);
    expect(res.debug.boundaryEdges.filter((edge) => edge.kind === "outer")).toHaveLength(6);
    expect(res.debug.boundaryEdges.filter((edge) => edge.kind === "outer").every((edge) => segmentLength(edge) >= 0.15 - 1e-8)).toBe(true);
    expect(res.debug.boundaryEdges.some((edge) => edge.kind === "wallFace" && edge.wallId === "bottom")).toBe(true);
    expect(res.debug.boundaryEdges.some((edge) => edge.kind === "wallFace" && edge.wallId === "left")).toBe(true);
  });

  test("regression_bottom_left_diagonal_connection_has_boundary", () => {
    const res = solveWallNetwork(networkCase(), { nodeTolM: 1e-6 });

    expectValidSolvedOutlines(res);
    expectNoWallOutlineOverlap(res);
    expect(edgesFor(res, "diagonal", "wallFace").filter((edge) => edge.side === "left").reduce((sum, edge) => sum + segmentLength(edge), 0)).toBeGreaterThan(4);
    expect(edgesFor(res, "diagonal", "wallFace").filter((edge) => edge.side === "right").reduce((sum, edge) => sum + segmentLength(edge), 0)).toBeGreaterThan(4);
    expect(edgesFor(res, "diagonal", "join").some((edge) => edge.end === "a" && segmentLength(edge) > 0.2)).toBe(true);
    expect(edgesFor(res, "bottom", "wallFace").length).toBeGreaterThanOrEqual(2);
    expect(edgesFor(res, "left", "wallFace").length).toBeGreaterThanOrEqual(2);
  });

  test("regression_top_right_diagonal_join_no_overlap", () => {
    const res = solveWallNetwork(networkCase(), { nodeTolM: 1e-6 });
    const diagonal = res.walls.find((entry) => entry.id === "diagonal")!;

    expectValidSolvedOutlines(res);
    expectNoWallOutlineOverlap(res);
    expect(diagonal.b.source).toBe("bodyJoin");
    expect(edgesFor(res, "diagonal", "join").some((edge) => edge.end === "b" && segmentLength(edge) > 0.2)).toBe(true);
    expect(edgesFor(res, "top", "wallFace").length).toBeGreaterThanOrEqual(2);
    expect(edgesFor(res, "right", "wallFace").length).toBeGreaterThanOrEqual(2);
  });

  test("regression_diagonal_wall_clipped_between_parallel_walls", () => {
    const res = solveWallNetwork([
      wall("bottom", P(0, 0), P(5, 0)),
      wall("top", P(0, 3), P(5, 3)),
      wall("diagonal", P(0.8, 0.075), P(4.2, 2.925))
    ], { nodeTolM: 1e-6 });
    const diagonal = res.walls.find((entry) => entry.id === "diagonal")!;

    expectValidSolvedOutlines(res);
    expectNoWallOutlineOverlap(res);
    expect(diagonal.a.source).toBe("bodyJoin");
    expect(diagonal.b.source).toBe("bodyJoin");
    expect(diagonal.a.left.z).toBeCloseTo(0.075, 6);
    expect(diagonal.a.right.z).toBeCloseTo(0.075, 6);
    expect(diagonal.b.left.z).toBeCloseTo(2.925, 6);
    expect(diagonal.b.right.z).toBeCloseTo(2.925, 6);
    expect(diagonal.outline.filter((point) => Math.abs(point.z - 0.075) < 1e-6)).toHaveLength(2);
    expect(diagonal.outline.filter((point) => Math.abs(point.z - 2.925) < 1e-6)).toHaveLength(2);
  });

  test("regression_diagonal_wall_near_corner_uses_clipped_body_join", () => {
    const res = solveWallNetwork(attachedDiagonalNearCorner(), { nodeTolM: 1e-6 });
    const diagonal = res.walls.find((entry) => entry.id === "diagonal")!;

    expectValidSolvedOutlines(res);
    expectNoWallOutlineOverlap(res);
    expect(diagonal.a.source).toBe("bodyJoin");
    expect(diagonal.b.source).toBe("bodyJoin");
    expect(diagonal.outline.some((point) => Math.abs(point.x - 4.925) < 1e-6 && Math.abs(point.z - 2.925) < 1e-6)).toBe(true);
    expect(res.debug.nodes.some((node) => node.incident.length >= 2 && node.incident.some((incident) => incident.wall.id === "diagonal"))).toBe(false);
  });

  test("regression_no_hole_at_corner_after_diagonal_join", () => {
    const res = solveWallNetwork(attachedDiagonalInnerCorner(), { nodeTolM: 1e-6 });
    const diagonal = res.walls.find((entry) => entry.id === "diagonal")!;

    expectSimpleSolvedOutlines(res);
    expectNoWallOutlineOverlap(res);
    expect(diagonal.a.source).toBe("bodyJoin");
    expect(diagonal.b.source).toBe("bodyJoin");
    expect(outlineHasPoint(diagonal.outline, P(0.075, 0.075))).toBe(true);
    expect(outlineHasPoint(diagonal.outline, P(4.925, 2.925))).toBe(true);
    expect(diagonal.outline.filter((point) => Math.abs(point.x - 0.075) < 1e-6)).toHaveLength(2);
    expect(diagonal.outline.filter((point) => Math.abs(point.z - 0.075) < 1e-6)).toHaveLength(2);
  });

  test("regression_wall_outline_has_no_false_closing_segment", () => {
    const res = solveWallNetwork(attachedDiagonalInnerCorner(), { nodeTolM: 1e-6 });
    const diagonal = res.walls.find((entry) => entry.id === "diagonal")!;
    const closing = outlineSegments(diagonal.outline).at(-1)!;

    expectSimpleSolvedOutlines(res);
    expect(properSegmentIntersection(closing[0], closing[1], diagonal.outline[1]!, diagonal.outline[2]!)).toBe(false);
    expect(outlineHasPoint(diagonal.outline, P(0.075, 0.075))).toBe(true);
    expect(outlineHasPoint(diagonal.outline, P(4.925, 2.925))).toBe(true);
  });

  test("regression_clipped_diagonal_outline_points_are_ordered", () => {
    const res = solveWallNetwork(attachedDiagonalInnerCorner(), { nodeTolM: 1e-6 });
    const diagonal = res.walls.find((entry) => entry.id === "diagonal")!;

    expect(diagonal.outline).toHaveLength(6);
    expect(outlineHasProperSelfIntersection(diagonal.outline)).toBe(false);
    expect(outlineArea(diagonal.outline)).toBeGreaterThan(0.5);
    expect(diagonal.outline.map((point) => `${point.x.toFixed(3)},${point.z.toFixed(3)}`)).toEqual([
      "0.075,0.162",
      "0.075,0.075",
      "0.223,0.075",
      "4.925,2.838",
      "4.925,2.925",
      "4.777,2.925"
    ]);
  });

  test("regression_no_open_wall_polygons", () => {
    const res = solveWallNetwork([
      ...attachedDiagonalInnerCorner(),
      wall("branch", P(2.5, 2.925), P(2.5, 1.2)),
      wall("skew", P(0.075, 2.925), P(2.2, 1.1))
    ], { nodeTolM: 1e-6 });

    expectSimpleSolvedOutlines(res);
    for (const solvedWall of res.walls) {
      expect(solvedWall.outline.length, solvedWall.id).toBeGreaterThanOrEqual(4);
      expect(solvedWall.outline.every(pointFinite), solvedWall.id).toBe(true);
      expect(outlineArea(solvedWall.outline), solvedWall.id).toBeGreaterThan(1e-8);
    }
  });

  test("regression_diagonal_join_does_not_create_gap", () => {
    const res = solveWallNetwork(attachedDiagonalInnerCorner(), { nodeTolM: 1e-6 });
    const diagonal = res.walls.find((entry) => entry.id === "diagonal")!;

    expectSimpleSolvedOutlines(res);
    expectNoWallOutlineOverlap(res);
    expect(outlineSegments(diagonal.outline).some(([a, b]) => Math.abs(a.x - 0.075) < 1e-6 && Math.abs(b.x - 0.075) < 1e-6)).toBe(true);
    expect(outlineSegments(diagonal.outline).some(([a, b]) => Math.abs(a.z - 0.075) < 1e-6 && Math.abs(b.z - 0.075) < 1e-6)).toBe(true);
    expect(outlineSegments(diagonal.outline).some(([a, b]) => Math.abs(a.x - 4.925) < 1e-6 && Math.abs(b.x - 4.925) < 1e-6)).toBe(true);
    expect(outlineSegments(diagonal.outline).some(([a, b]) => Math.abs(a.z - 2.925) < 1e-6 && Math.abs(b.z - 2.925) < 1e-6)).toBe(true);
  });

  test("regression_recompute_after_snap_keeps_closed_geometry", () => {
    const before = solveWallNetwork([...rectangularLoop(), wall("diagonal", P(0.2, 0.075), P(4.925, 2.925))], { nodeTolM: 1e-6 });
    const snapped = solveWallNetwork(attachedDiagonalInnerCorner(), { nodeTolM: 1e-6 });

    expectSimpleSolvedOutlines(before);
    expectSimpleSolvedOutlines(snapped);
    expectNoWallOutlineOverlap(snapped);
    expect(outlineHasPoint(snapped.walls.find((entry) => entry.id === "diagonal")!.outline, P(0.075, 0.075))).toBe(true);
  });

  test("regression_rectangular_loop_preserves_inner_outer_edges", () => {
    const res = solveWallNetwork([
      wall("left", P(0, 0), P(0, 3)),
      wall("top", P(0, 3), P(5, 3)),
      wall("right", P(5, 3), P(5, 0)),
      wall("bottom", P(5, 0), P(0, 0))
    ], { nodeTolM: 1e-6 });

    expectValidSolvedOutlines(res);
    expectNoWallOutlineOverlap(res);
    expect(res.debug.boundaryEdges.filter((edge) => edge.kind === "outer")).toHaveLength(4);
    expect(res.debug.boundaryEdges.filter((edge) => edge.kind === "inner")).toHaveLength(4);
    close(Math.max(...res.debug.boundaryEdges.filter((edge) => edge.kind === "outer").map(segmentLength)), 5.15, 2);
    close(Math.max(...res.debug.boundaryEdges.filter((edge) => edge.kind === "inner").map(segmentLength)), 4.85, 2);
  });

  test("regression_three_wall_join_clean_boundaries", () => {
    const res = solveWallNetwork([
      wall("east", P(0, 0), P(4, 0)),
      wall("north", P(0, 0), P(0, 4)),
      wall("diagonal", P(0, 0), P(3, 2))
    ], { nodeTolM: 1e-6 });

    expectValidSolvedOutlines(res);
    expectNoWallOutlineOverlap(res);
    expect(res.debug.nodes.some((node) => node.incident.length === 3)).toBe(true);
    expect(res.debug.boundaryEdges.filter((edge) => edge.kind === "wallFace").length).toBeGreaterThanOrEqual(6);
    expect(res.debug.boundaryEdges.every((edge) => segmentLength(edge) > 1e-8)).toBe(true);
  });

  test("regression_four_wall_join_clean_boundaries", () => {
    const walls = [
      wall("east", P(0, 0), P(4, 0)),
      wall("north", P(0, 0), P(0, 4)),
      wall("west", P(0, 0), P(-4, 0)),
      wall("south", P(0, 0), P(0, -4))
    ];
    const normal = solveWallNetwork(walls, { nodeTolM: 1e-6 });
    const shuffled = solveWallNetwork([walls[3]!, walls[1]!, walls[0]!, walls[2]!], { nodeTolM: 1e-6 });

    expectValidSolvedOutlines(normal);
    expectNoWallOutlineOverlap(normal);
    expect(normal.debug.nodes.some((node) => node.incident.length === 4)).toBe(true);
    expect(normal.debug.boundaryEdges.filter((edge) => edge.kind === "wallFace").length).toBeGreaterThanOrEqual(8);
    expect(normalizedBoundaryEdges(shuffled)).toEqual(normalizedBoundaryEdges(normal));
  });

  test("regression_reversed_draw_order_same_geometry", () => {
    const walls = networkCase();
    const normal = solveWallNetwork(walls, { nodeTolM: 1e-6 });
    const reversed = solveWallNetwork([...walls].reverse(), { nodeTolM: 1e-6 });

    expect(normalizedFootprint(reversed)).toEqual(normalizedFootprint(normal));
    expect(normalizedBoundaryEdges(reversed)).toEqual(normalizedBoundaryEdges(normal));
  });

  test("regression_save_load_preserves_wall_boundaries", () => {
    const walls = networkCase();
    const loaded = JSON.parse(JSON.stringify(walls)) as Wall[];
    const normal = solveWallNetwork(walls, { nodeTolM: 1e-6 });
    const restored = solveWallNetwork(loaded, { nodeTolM: 1e-6 });

    expect(normalizedFootprint(restored)).toEqual(normalizedFootprint(normal));
    expect(normalizedBoundaryEdges(restored)).toEqual(normalizedBoundaryEdges(normal));
    expect(restored.debug.boundaryEdges.some((edge) => edge.kind === "join" && edge.wallId === "diagonal")).toBe(true);
  });

  test("regression_save_load_preserves_attached_wall_network", () => {
    const walls = attachedDiagonalNearCorner();
    const loaded = JSON.parse(JSON.stringify(walls)) as Wall[];
    const normal = solveWallNetwork(walls, { nodeTolM: 1e-6 });
    const restored = solveWallNetwork(loaded, { nodeTolM: 1e-6 });

    expectValidSolvedOutlines(restored);
    expectNoWallOutlineOverlap(restored);
    expect(normalizedSolvedOutlines(restored)).toEqual(normalizedSolvedOutlines(normal));
    expect(normalizedFootprint(restored)).toEqual(normalizedFootprint(normal));
    expect(normalizedBoundaryEdges(restored)).toEqual(normalizedBoundaryEdges(normal));
  });

  test("regression_failing_wall_network_case01_no_holes", () => {
    const res = solveWallNetwork(failingWallNetworkCase01(), { nodeTolM: 1e-6 });

    expectSimpleSolvedOutlines(res);
    expectNoTinyFootprintRings(res);
  });

  test("regression_failing_wall_network_case01_no_overlaps", () => {
    const res = solveWallNetwork(failingWallNetworkCase01(), { nodeTolM: 1e-6 });

    expectNoWallOutlineOverlap(res);
  });

  test("regression_failing_wall_network_case01_clean_top_right_join", () => {
    const res = solveWallNetwork(failingWallNetworkCase01(), { nodeTolM: 1e-6 });
    const diagonal = res.walls.find((item) => item.id === "diagonal")!;

    expect(diagonal.b.source).toBe("bodyJoin");
    expect(outlineHasPoint(diagonal.outline, P(4.925, 2.925))).toBe(true);
    expectNoWallOutlineOverlap(res);
  });

  test("regression_failing_wall_network_case01_clean_bottom_right_join", () => {
    const res = solveWallNetwork(failingWallNetworkCase01(), { nodeTolM: 1e-6 });
    const bottomRightNode = res.debug.nodes.find((node) =>
      node.incident.some((item) => item.wall.id === "bottom") &&
      node.incident.some((item) => item.wall.id === "right") &&
      node.incident.some((item) => item.wall.id === "rightSkew")
    );

    expect(bottomRightNode?.incident).toHaveLength(3);
    expect(bottomRightNode?.intersections).toHaveLength(3);
    expectCase01BottomRightJoinResolved(res);
    expectNoWallOutlineOverlap(res);
  });

  test("regression_failing_wall_network_case01_all_wall_outlines_valid", () => {
    const res = solveWallNetwork(failingWallNetworkCase01(), { nodeTolM: 1e-6 });

    expectSimpleSolvedOutlines(res);
  });

  test("regression_failing_wall_network_case01_reversed_draw_order_same_result", () => {
    const walls = failingWallNetworkCase01();
    const normal = solveWallNetwork(walls, { nodeTolM: 1e-6 });
    const reversed = solveWallNetwork([...walls].reverse(), { nodeTolM: 1e-6 });

    expect(normalizedSolvedOutlines(reversed)).toEqual(normalizedSolvedOutlines(normal));
    expect(normalizedFootprint(reversed)).toEqual(normalizedFootprint(normal));
    expect(normalizedBoundaryEdges(reversed)).toEqual(normalizedBoundaryEdges(normal));
  });

  test("regression_failing_wall_network_case01_save_load_same_result", () => {
    const walls = failingWallNetworkCase01();
    const loaded = JSON.parse(JSON.stringify(walls)) as Wall[];
    const normal = solveWallNetwork(walls, { nodeTolM: 1e-6 });
    const restored = solveWallNetwork(loaded, { nodeTolM: 1e-6 });

    expect(normalizedSolvedOutlines(restored)).toEqual(normalizedSolvedOutlines(normal));
    expect(normalizedFootprint(restored)).toEqual(normalizedFootprint(normal));
    expect(normalizedBoundaryEdges(restored)).toEqual(normalizedBoundaryEdges(normal));
  });

  test("regression_no_invalid_wall_outline", () => {
    const res = solveWallNetwork([
      ...networkCase(),
      wall("threeA", P(7, 0), P(9, 0)),
      wall("threeB", P(7, 0), P(7, 2)),
      wall("threeC", P(7, 0), P(9, 1.4)),
      wall("fourA", P(12, 0), P(14, 0)),
      wall("fourB", P(12, 0), P(12, 2)),
      wall("fourC", P(12, 0), P(10, 0)),
      wall("fourD", P(12, 0), P(12, -2))
    ], { nodeTolM: 1e-6 });

    expectValidSolvedOutlines(res);
    expect(res.debug.solvedCaps).toHaveLength(res.walls.length * 2);
  });
});
