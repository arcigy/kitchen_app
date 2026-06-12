import { describe, expect, test } from "vitest";
import { solveWallNetwork } from "./solver";
import { dist, type Point } from "./geom";
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

const closePoint = (actual: Point, expected: Point, digits = 6) => {
  expect(actual.x).toBeCloseTo(expected.x, digits);
  expect(actual.z).toBeCloseTo(expected.z, digits);
};

const roundedSolved = (res: ReturnType<typeof solveWallNetwork>) =>
  res.walls
    .map((wallItem) => ({
      id: wallItem.id,
      a: {
        left: [Number(wallItem.a.left.x.toFixed(4)), Number(wallItem.a.left.z.toFixed(4))],
        right: [Number(wallItem.a.right.x.toFixed(4)), Number(wallItem.a.right.z.toFixed(4))]
      },
      b: {
        left: [Number(wallItem.b.left.x.toFixed(4)), Number(wallItem.b.left.z.toFixed(4))],
        right: [Number(wallItem.b.right.x.toFixed(4)), Number(wallItem.b.right.z.toFixed(4))]
      },
      outline: wallItem.outline
        .map((point) => [Number(point.x.toFixed(4)), Number(point.z.toFixed(4))])
        .sort((a, b) => a[0] - b[0] || a[1] - b[1])
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

const roundedGeometry = (res: ReturnType<typeof solveWallNetwork>) =>
  res.walls
    .map((wallItem) => ({
      id: wallItem.id,
      outline: wallItem.outline
        .map((point) => [Number(point.x.toFixed(4)), Number(point.z.toFixed(4))])
        .sort((a, b) => a[0] - b[0] || a[1] - b[1])
    }))
    .sort((a, b) => a.id.localeCompare(b.id));

describe("walls2d basic corner joins", () => {
  test("solves a 90 degree L-corner as a deterministic butt/through join", () => {
    const res = solveWallNetwork([
      wall("east", P(0, 0), P(4, 0), 150),
      wall("north", P(0, 0), P(0, 4), 150)
    ], { nodeTolM: 1e-6 });

    const east = solvedWall(res, "east");
    const north = solvedWall(res, "north");
    closePoint(east.a.left, P(-0.075, 0.075));
    closePoint(east.a.right, P(-0.075, -0.075));
    closePoint(north.a.left, P(-0.075, 0.075));
    closePoint(north.a.right, P(0.075, 0.075));
  });

  test("keeps the same corner when wall draw order is reversed", () => {
    const walls = [
      wall("east", P(0, 0), P(4, 0), 150),
      wall("north", P(0, 0), P(0, 4), 150)
    ];
    const normal = solveWallNetwork(walls, { nodeTolM: 1e-6 });
    const reversed = solveWallNetwork([walls[1]!, walls[0]!], { nodeTolM: 1e-6 });

    expect(roundedSolved(reversed)).toEqual(roundedSolved(normal));
  });

  test("keeps the same corner when both wall directions are reversed", () => {
    const normal = solveWallNetwork([
      wall("east", P(0, 0), P(4, 0), 150),
      wall("north", P(0, 0), P(0, 4), 150)
    ], { nodeTolM: 1e-6 });
    const reversedDirections = solveWallNetwork([
      wall("east", P(4, 0), P(0, 0), 150),
      wall("north", P(0, 4), P(0, 0), 150)
    ], { nodeTolM: 1e-6 });

    expect(roundedGeometry(reversedDirections)).toEqual(roundedGeometry(normal));
  });

  test("solves an angled L-corner by sharing the two computed intersection points", () => {
    const res = solveWallNetwork([
      wall("east", P(0, 0), P(4, 0), 150),
      wall("angled", P(0, 0), P(3, 2), 150)
    ], { nodeTolM: 1e-6 });
    const east = solvedWall(res, "east");
    const angled = solvedWall(res, "angled");
    const hits = res.debug.nodes.find((node) => node.incident.length === 2)?.intersections.map((hit) => hit.point) ?? [];

    expect(hits).toHaveLength(2);
    for (const point of [east.a.left, east.a.right]) {
      expect(hits.some((hit) => dist(hit, point) < 1e-6)).toBe(true);
    }
    for (const point of [angled.a.left, angled.a.right]) {
      expect(hits.some((hit) => dist(hit, point) < 1e-6)).toBe(true);
    }
  });

  test("solves a different-thickness perpendicular corner without overlap", () => {
    const res = solveWallNetwork([
      wall("thick", P(0, 0), P(4, 0), 300),
      wall("thin", P(0, 0), P(0, 4), 100)
    ], { nodeTolM: 1e-6 });
    const thick = solvedWall(res, "thick");
    const thin = solvedWall(res, "thin");

    closePoint(thick.a.left, P(-0.05, 0.15));
    closePoint(thick.a.right, P(-0.05, -0.15));
    closePoint(thin.a.left, P(-0.05, 0.15));
    closePoint(thin.a.right, P(0.05, 0.15));
  });

  test("recomputes cleanly when an endpoint is moved after creation", () => {
    const moved = solveWallNetwork([
      wall("east", P(1, 2), P(5, 2), 150),
      wall("north", P(1, 2), P(1, 6), 150)
    ], { nodeTolM: 1e-6 });
    const east = solvedWall(moved, "east");
    const north = solvedWall(moved, "north");

    closePoint(east.a.left, P(0.925, 2.075));
    closePoint(east.a.right, P(0.925, 1.925));
    closePoint(north.a.left, P(0.925, 2.075));
    closePoint(north.a.right, P(1.075, 2.075));
  });

  test("keeps a saved and loaded corner identical", () => {
    const walls = [
      wall("east", P(0, 0), P(4, 0), 150),
      wall("north", P(0, 0), P(0, 4), 150)
    ];
    const saved = JSON.stringify(walls);
    const loaded = JSON.parse(saved) as Wall[];

    expect(roundedSolved(solveWallNetwork(loaded, { nodeTolM: 1e-6 }))).toEqual(
      roundedSolved(solveWallNetwork(walls, { nodeTolM: 1e-6 }))
    );
  });
});
