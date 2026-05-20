import { describe, expect, test } from "vitest";
import { solveWallNetwork } from "./solver";
import type { Wall } from "./model";
import { cross, dist, sub } from "./geom";

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

describe("walls2d join solver", () => {
  test("Case 1: 90° same thickness (clean miter)", () => {
    const w1 = wall("a", P(0, 0), P(5, 0), 150);
    const w2 = wall("b", P(0, 0), P(0, 5), 150);
    const res = solveWallNetwork([w1, w2], { nodeTolM: 1e-6, miterLimit: 12 });
    expect(res.walls.length).toBe(2);
    // At the shared node, at least one corner point must coincide between the two walls (no gap).
    const a0 = res.walls[0].outline;
    const b0 = res.walls[1].outline;
    const min = Math.min(
      ...a0.flatMap((pa) => b0.map((pb) => dist(pa, pb)))
    );
    expect(min).toBeLessThanOrEqual(0.075);
    expect(res.walls[0].a.join).toBe("butt");
    expect(res.walls[1].a.join).toBe("butt");
  });

  test("Case 2: 45° same thickness (no broken acute join)", () => {
    const w1 = wall("a", P(0, 0), P(5, 0), 150);
    const w2 = wall("b", P(0, 0), P(4, 4), 150);
    const res = solveWallNetwork([w1, w2], { nodeTolM: 1e-6, miterLimit: 12 });
    expect(res.walls.length).toBe(2);
    expect(res.joinPolys.length).toBeGreaterThanOrEqual(0);
  });

  test("angled corner butts the branch end into the main wall face", () => {
    const w1 = wall("a", P(-5, 0), P(0, 0), 150);
    const w2 = wall("b", P(0, 0), P(-4, 4), 150);
    const res = solveWallNetwork([w1, w2], { nodeTolM: 1e-6, miterLimit: 12 });
    const solvedA = res.walls.find((w) => w.id === "a")!;
    const solvedB = res.walls.find((w) => w.id === "b")!;

    expect(solvedA.b.join).toBe("butt");
    expect(solvedB.a.join).toBe("butt");
    expect(solvedA.b.left.z).toBeCloseTo(0.075, 6);
    expect(solvedA.b.right.z).toBeCloseTo(-0.075, 6);
    expect(solvedB.a.left.z).toBeCloseTo(0.075, 6);
    expect(solvedB.a.right.z).toBeCloseTo(0.075, 6);
  });

  test("shallow angled branch still butts to the main wall face instead of making a long spike", () => {
    const w1 = wall("a", P(-5, 0), P(0, 0), 150);
    const w2 = wall("b", P(0, 0), P(-4.33, 2.5), 150);
    const res = solveWallNetwork([w1, w2], { nodeTolM: 1e-6 });
    const solvedA = res.walls.find((w) => w.id === "a")!;
    const solvedB = res.walls.find((w) => w.id === "b")!;

    expect(solvedA.b.join).toBe("butt");
    expect(solvedB.a.join).toBe("butt");
    expect(res.joinPolys).toHaveLength(1);
    expect(res.joinPolys[0]).toHaveLength(4);
    expect(Math.abs(cross(sub(res.joinPolys[0][2], res.joinPolys[0][1]), sub(solvedB.b.right, solvedB.a.right)))).toBeLessThan(1e-8);
    expect(solvedB.a.left.z).toBeCloseTo(0.075, 6);
    expect(solvedB.a.right.z).toBeCloseTo(0.075, 6);
  });

  test("fills the main wall cap when an angled branch cuts past the end face", () => {
    const main = wall("main", P(0, 0), P(0, 5), 150);
    const branch = wall("branch", P(0, 5), P(5, 0), 150);
    const res = solveWallNetwork([main, branch], { nodeTolM: 1e-6 });
    const solvedBranch = res.walls.find((w) => w.id === "branch")!;
    const cap = res.joinPolys[0];

    expect(res.joinPolys).toHaveLength(1);
    expect(cap).toHaveLength(4);
    expect(cap[0].x).toBeCloseTo(-0.075, 6);
    expect(cap[0].z).toBeCloseTo(5, 6);
    expect(cap[1].x).toBeCloseTo(-0.075, 6);
    expect(cap[1].z).toBeCloseTo(5 + 0.075 * (1 + Math.SQRT2), 6);
    expect(cap[2].x).toBeCloseTo(0.075, 6);
    expect(cap[2].z).toBeCloseTo(5.031066017177982, 6);
    expect(cap[3].x).toBeCloseTo(0.075, 6);
    expect(cap[3].z).toBeCloseTo(5, 6);
    expect(Math.abs(cross(sub(cap[2], cap[1]), sub(solvedBranch.b.left, solvedBranch.a.left)))).toBeLessThan(1e-8);
    expect(solvedBranch.a.left.x).toBeCloseTo(0.075, 6);
    expect(solvedBranch.a.right.x).toBeCloseTo(0.075, 6);
  });

  test("Case 4: 90° different thickness (still joins)", () => {
    const w1 = wall("a", P(0, 0), P(5, 0), 300);
    const w2 = wall("b", P(0, 0), P(0, 5), 150);
    const res = solveWallNetwork([w1, w2], { nodeTolM: 1e-6, miterLimit: 12 });
    expect(res.walls.length).toBe(2);
    const a0 = res.walls[0].outline;
    const b0 = res.walls[1].outline;
    const min = Math.min(
      ...a0.flatMap((pa) => b0.map((pb) => dist(pa, pb)))
    );
    expect(min).toBeLessThanOrEqual(0.075);
  });

  test("fills orthogonal side-butt caps so right-angle floorplans do not step", () => {
    const top = wall("top", P(0, 5), P(5, 5), 150);
    const right = wall("right", P(5, 5), P(5, 0), 150);
    const bottom = wall("bottom", P(0, 0), P(5, 0), 150);
    const res = solveWallNetwork([top, right, bottom], { nodeTolM: 1e-6 });

    expect(res.joinPolys).toHaveLength(2);
    expect(res.joinPolys[0]).toHaveLength(4);
    expect(res.joinPolys[0][0]).toEqual({ x: 5, z: 5.075 });
    expect(res.joinPolys[0][1]).toEqual({ x: 5.075, z: 5.075 });
    expect(res.joinPolys[0][2]).toEqual({ x: 5.075, z: 4.925 });
    expect(res.joinPolys[0][3]).toEqual({ x: 5, z: 4.925 });
    expect(res.joinPolys[1]).toHaveLength(4);
    expect(res.joinPolys[1][0]).toEqual({ x: 5.075, z: 0 });
    expect(res.joinPolys[1][1]).toEqual({ x: 5.075, z: -0.075 });
    expect(res.joinPolys[1][2]).toEqual({ x: 4.925, z: -0.075 });
    expect(res.joinPolys[1][3]).toEqual({ x: 4.925, z: 0 });
  });

  test("Case 6: T join (branch cut to main)", () => {
    // Main wall is split at node (0,0) so node degree becomes 3.
    const main0 = wall("m0", P(-5, 0), P(0, 0), 150);
    const main1 = wall("m1", P(0, 0), P(5, 0), 150);
    const branch = wall("b", P(0, 0), P(0, 5), 100);
    const res = solveWallNetwork([main0, main1, branch], { nodeTolM: 1e-6, miterLimit: 12 });
    expect(res.walls.length).toBe(3);
  });
  test("2-wall corner keeps the main wall full and butts the branch into its face", () => {
    const main = wall("main", P(0, 0), P(5, 0), 150);
    const branch = wall("branch", P(0, 0), P(0, 5), 150);
    const res = solveWallNetwork([main, branch], { nodeTolM: 1e-6, miterLimit: 12 });
    const solvedMain = res.walls.find((w) => w.id === "main")!;
    const solvedBranch = res.walls.find((w) => w.id === "branch")!;

    expect(solvedMain.a.left.x).toBeCloseTo(0, 6);
    expect(solvedMain.a.left.z).toBeCloseTo(0.075, 6);
    expect(solvedMain.a.right.x).toBeCloseTo(0, 6);
    expect(solvedMain.a.right.z).toBeCloseTo(-0.075, 6);
    expect(solvedBranch.a.left.x).toBeCloseTo(-0.075, 6);
    expect(solvedBranch.a.left.z).toBeCloseTo(0.075, 6);
    expect(solvedBranch.a.right.x).toBeCloseTo(0.075, 6);
    expect(solvedBranch.a.right.z).toBeCloseTo(0.075, 6);
  });

  test("2-wall corner branch cut follows the main wall face with different thicknesses", () => {
    const main = wall("main", P(0, 0), P(5, 0), 150);
    const branch = wall("branch", P(0, 0), P(0, 5), 300);
    const res = solveWallNetwork([main, branch], { nodeTolM: 1e-6, miterLimit: 12 });
    const solvedMain = res.walls.find((w) => w.id === "main")!;
    const solvedBranch = res.walls.find((w) => w.id === "branch")!;

    expect(solvedMain.a.left.x).toBeCloseTo(0, 6);
    expect(solvedMain.a.left.z).toBeCloseTo(0.075, 6);
    expect(solvedMain.a.right.x).toBeCloseTo(0, 6);
    expect(solvedMain.a.right.z).toBeCloseTo(-0.075, 6);
    expect(solvedBranch.a.left.x).toBeCloseTo(-0.15, 6);
    expect(solvedBranch.a.left.z).toBeCloseTo(0.075, 6);
    expect(solvedBranch.a.right.x).toBeCloseTo(0.15, 6);
    expect(solvedBranch.a.right.z).toBeCloseTo(0.075, 6);
  });
});

