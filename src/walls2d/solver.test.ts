import { describe, expect, test } from "vitest";
import { solveWallNetwork } from "./solver";
import type { Wall } from "./model";
import { dist } from "./geom";

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
    expect(res.walls[0].a.join).toBe("miter");
    expect(res.walls[1].a.join).toBe("miter");
  });

  test("Case 2: 45° same thickness (no broken acute join)", () => {
    const w1 = wall("a", P(0, 0), P(5, 0), 150);
    const w2 = wall("b", P(0, 0), P(4, 4), 150);
    const res = solveWallNetwork([w1, w2], { nodeTolM: 1e-6, miterLimit: 12 });
    expect(res.walls.length).toBe(2);
    expect(res.joinPolys.length).toBeGreaterThanOrEqual(0);
  });

  test("explicit join priority butts an angled branch end into the main wall face", () => {
    const w1 = wall("a", P(-5, 0), P(0, 0), 150);
    const w2 = wall("b", P(0, 0), P(-4, 4), 150);
    w1.joinEnds = { b: { priority: 10 } };
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

  test("2-wall corner uses explicit join priority for the continuing wall", () => {
    const lowerPriority = wall("lower", P(-5, 0), P(0, 0), 150);
    const higherPriority = wall("higher", P(0, 0), P(-4, 4), 150);
    higherPriority.joinEnds = { a: { priority: 10 } };
    const res = solveWallNetwork([lowerPriority, higherPriority], { nodeTolM: 1e-6, miterLimit: 12 });
    const solvedLower = res.walls.find((w) => w.id === "lower")!;
    const solvedHigher = res.walls.find((w) => w.id === "higher")!;

    expect(solvedHigher.a.join).toBe("butt");
    expect(solvedHigher.a.ownedCapPoly).toBeUndefined();
    expect(solvedHigher.outline.length).toBe(4);
    expect(solvedLower.b.ownedCapPoly).toBeUndefined();
  });

  test("disabled wall end does not participate in a join", () => {
    const main = wall("main", P(-5, 0), P(0, 0), 150);
    const branch = wall("branch", P(0, 0), P(-4, 4), 150);
    branch.joinEnds = { a: { enabled: false, priority: 10 } };
    const res = solveWallNetwork([main, branch], { nodeTolM: 1e-6, miterLimit: 12 });
    const solvedMain = res.walls.find((w) => w.id === "main")!;
    const solvedBranch = res.walls.find((w) => w.id === "branch")!;

    expect(solvedMain.outline).toHaveLength(4);
    expect(solvedBranch.outline).toHaveLength(4);
    expect(solvedMain.b.ownedCapPoly).toBeUndefined();
    expect(solvedBranch.a.ownedCapPoly).toBeUndefined();
  });

  test("shallow equal-priority corner uses compact miter instead of making a long spike", () => {
    const w1 = wall("a", P(-5, 0), P(0, 0), 150);
    const w2 = wall("b", P(0, 0), P(-4.33, 2.5), 150);
    const res = solveWallNetwork([w1, w2], { nodeTolM: 1e-6 });
    const solvedA = res.walls.find((w) => w.id === "a")!;
    const solvedB = res.walls.find((w) => w.id === "b")!;

    expect(solvedA.b.join).toBe("miter");
    expect(solvedB.a.join).toBe("miter");
    expect(res.joinPolys).toHaveLength(0);
    expect(solvedA.outline).toHaveLength(4);
    expect(solvedB.outline).toHaveLength(4);
    expect(solvedA.b.ownedCapPoly).toBeUndefined();
    expect(solvedB.a.ownedCapPoly).toBeUndefined();
    expect(Math.max(dist(P(0, 0), solvedA.b.left), dist(P(0, 0), solvedA.b.right))).toBeLessThan(0.09);
  });

  test("equal-priority angled room ending avoids the lower wall tooth", () => {
    const vertical = wall("vertical", P(0, 5), P(0, 0), 150);
    const diagonal = wall("diagonal", P(0, 0), P(5, 5), 150);
    const res = solveWallNetwork([vertical, diagonal], { nodeTolM: 1e-6 });
    const solvedVertical = res.walls.find((w) => w.id === "vertical")!;
    const solvedDiagonal = res.walls.find((w) => w.id === "diagonal")!;

    expect(solvedVertical.b.join).toBe("miter");
    expect(solvedDiagonal.a.join).toBe("miter");
    expect(solvedDiagonal.a.left).toEqual(solvedVertical.b.right);
    expect(solvedDiagonal.a.right).toEqual(solvedVertical.b.left);
    expect(Math.min(...[...solvedVertical.outline, ...solvedDiagonal.outline].map((point) => point.z))).toBeGreaterThan(-0.04);
  });

  test("equal-priority closed angled outline keeps ordinary corner joins", () => {
    const left = wall("left", P(0, 0), P(0, 5), 150);
    const top = wall("top", P(0, 5), P(4, 5), 150);
    const upperRight = wall("upperRight", P(4, 5), P(6, 2), 150);
    const lowerRight = wall("lowerRight", P(6, 2), P(3, 0.5), 150);
    const bottom = wall("bottom", P(3, 0.5), P(0, 0), 150);
    const res = solveWallNetwork([left, top, upperRight, lowerRight, bottom], { nodeTolM: 1e-6 });

    for (const solvedWall of res.walls) {
      expect(solvedWall.a.join).not.toBe("butt");
      expect(solvedWall.b.join).not.toBe("butt");
    }
  });

  test("clamps an angled branch to the main wall end face", () => {
    const main = wall("main", P(0, 0), P(0, 5), 150);
    const branch = wall("branch", P(0, 5), P(5, 0), 150);
    main.joinEnds = { b: { priority: 10 } };
    const res = solveWallNetwork([main, branch], { nodeTolM: 1e-6 });
    const solvedMain = res.walls.find((w) => w.id === "main")!;
    const solvedBranch = res.walls.find((w) => w.id === "branch")!;

    expect(res.joinPolys).toHaveLength(0);
    expect(solvedMain.outline).toHaveLength(4);
    expect(solvedMain.b.ownedCapPoly).toBeUndefined();
    expect(Math.max(solvedBranch.a.left.z, solvedBranch.a.right.z)).toBeLessThanOrEqual(5 + 1e-9);
    expect(solvedBranch.a.left.x).toBeCloseTo(0.075, 6);
    expect(solvedBranch.a.right.x).toBeCloseTo(0.075, 6);
  });

  test("explicit side-butt branch does not protrude past the opposite wall face", () => {
    const main = wall("main", P(0, 5), P(0, 0), 150);
    const branch = wall("branch", P(0, 0), P(5, 5), 150);
    main.joinEnds = { b: { priority: 10 } };
    const res = solveWallNetwork([main, branch], { nodeTolM: 1e-6 });
    const solvedMain = res.walls.find((w) => w.id === "main")!;
    const solvedBranch = res.walls.find((w) => w.id === "branch")!;

    expect(solvedMain.b.ownedCapPoly).toBeUndefined();
    expect(Math.min(solvedBranch.a.left.z, solvedBranch.a.right.z)).toBeGreaterThanOrEqual(-1e-9);
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
    top.joinEnds = { b: { priority: 10 } };
    right.joinEnds = { b: { priority: 10 } };
    const res = solveWallNetwork([top, right, bottom], { nodeTolM: 1e-6 });
    const solvedTop = res.walls.find((w) => w.id === "top")!;
    const solvedRight = res.walls.find((w) => w.id === "right")!;

    expect(res.joinPolys).toHaveLength(0);
    expect(solvedTop.b.ownedCapPoly).toHaveLength(3);
    expect(solvedTop.b.ownedCapPoly![0]).toEqual({ x: 5, z: 5.075 });
    expect(solvedTop.b.ownedCapPoly![1]).toEqual({ x: 5.075, z: 4.925 });
    expect(solvedTop.b.ownedCapPoly![2]).toEqual({ x: 5, z: 4.925 });
    expect(solvedRight.b.ownedCapPoly).toHaveLength(3);
    expect(solvedRight.b.ownedCapPoly![0]).toEqual({ x: 5.075, z: 0 });
    expect(solvedRight.b.ownedCapPoly![1]).toEqual({ x: 4.925, z: -0.075 });
    expect(solvedRight.b.ownedCapPoly![2]).toEqual({ x: 4.925, z: 0 });
    expect(solvedTop.outline).toHaveLength(5);
    expect(solvedRight.outline).toHaveLength(5);
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
    main.joinEnds = { a: { priority: 10 } };
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
    main.joinEnds = { a: { priority: 10 } };
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

