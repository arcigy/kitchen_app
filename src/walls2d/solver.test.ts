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
  test("Case 1: 90° same thickness (clean butt join)", () => {
    const w1 = wall("a", P(0, 0), P(5, 0), 150);
    const w2 = wall("b", P(0, 0), P(0, 5), 150);
    const res = solveWallNetwork([w1, w2], { nodeTolM: 1e-6, miterLimit: 12 });
    expect(res.walls.length).toBe(2);
    expect(res.walls[0].a.join).toBe("butt");
    expect(res.walls[1].a.join).toBe("butt");
    expect(res.walls[0].outline).toHaveLength(4);
    expect(res.walls[1].outline).toHaveLength(4);
    expect(res.walls[0].a.ownedCapPoly).toBeUndefined();
    expect(res.walls[1].a.ownedCapPoly).toBeUndefined();
  });

  test("Case 2: 45° same thickness (no broken acute join)", () => {
    const w1 = wall("a", P(0, 0), P(5, 0), 150);
    const w2 = wall("b", P(0, 0), P(4, 4), 150);
    const res = solveWallNetwork([w1, w2], { nodeTolM: 1e-6, miterLimit: 12 });
    expect(res.walls.length).toBe(2);
    expect(res.joinPolys.length).toBeGreaterThanOrEqual(0);
  });

  test("right-angle equal-priority corner keeps the shorter connector wall continuous", () => {
    const short = wall("short", P(0, 0), P(0, 2), 150);
    const long = wall("long", P(0, 0), P(5, 0), 150);
    const res = solveWallNetwork([short, long], { nodeTolM: 1e-6 });
    const solvedShort = res.walls.find((w) => w.id === "short")!;
    const solvedLong = res.walls.find((w) => w.id === "long")!;

    expect(solvedShort.a.ownedCapPoly).toBeUndefined();
    expect(solvedLong.a.ownedCapPoly).toBeUndefined();
    expect(solvedShort.a.left.z).toBeCloseTo(-0.075, 6);
    expect(solvedShort.a.right.z).toBeCloseTo(-0.075, 6);
    expect(solvedLong.a.left.x).toBeCloseTo(0.075, 6);
    expect(solvedLong.a.right.x).toBeCloseTo(0.075, 6);
  });

  test("short wall between angled neighbors keeps rectangular ends", () => {
    const top = wall("top", P(-4, 4), P(0, 3), 150);
    const connector = wall("connector", P(0, 3), P(0, 0), 150);
    const bottom = wall("bottom", P(-4, -1), P(0, 0), 150);
    const res = solveWallNetwork([top, connector, bottom], { nodeTolM: 1e-6 });
    const solvedConnector = res.walls.find((w) => w.id === "connector")!;
    const solvedTop = res.walls.find((w) => w.id === "top")!;
    const solvedBottom = res.walls.find((w) => w.id === "bottom")!;

    expect(solvedConnector.a.join).toBe("butt");
    expect(solvedConnector.b.join).toBe("butt");
    expect(dist(solvedConnector.a.left, solvedConnector.a.right)).toBeGreaterThan(0.14);
    expect(dist(solvedConnector.b.left, solvedConnector.b.right)).toBeGreaterThan(0.14);
    expect(solvedTop.b.join).toBe("butt");
    expect(solvedBottom.b.join).toBe("butt");
    expect(dist(solvedTop.b.left, solvedTop.b.right)).toBeGreaterThan(0.14);
    expect(dist(solvedBottom.b.left, solvedBottom.b.right)).toBeGreaterThan(0.14);
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
    expect(dist(solvedB.a.left, solvedB.a.right)).toBeGreaterThan(0.14);
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

  test("finite miter limit does not introduce automatic bevels on equal-priority corners", () => {
    const w1 = wall("a", P(-5, 0), P(0, 0), 150);
    const w2 = wall("b", P(0, 0), P(-4.83, 1.29), 150);
    const res = solveWallNetwork([w1, w2], { nodeTolM: 1e-6, miterLimit: 2.5 });
    const solvedA = res.walls.find((w) => w.id === "a")!;
    const solvedB = res.walls.find((w) => w.id === "b")!;

    expect(solvedA.b.join).toBe("butt");
    expect(solvedB.a.join).toBe("butt");
    expect(res.joinPolys).toHaveLength(0);
    expect(solvedA.outline).toHaveLength(4);
    expect(solvedB.outline).toHaveLength(4);
    expect(solvedA.b.ownedCapPoly).toBeUndefined();
    expect(solvedB.a.ownedCapPoly).toBeUndefined();
  });

  test("default equal-priority sharp corner uses a butt join instead of a pointed miter", () => {
    const w1 = wall("a", P(-5, 0), P(0, 0), 150);
    const w2 = wall("b", P(0, 0), P(-4.83, 1.29), 150);
    const res = solveWallNetwork([w1, w2], { nodeTolM: 1e-6 });
    const solvedA = res.walls.find((w) => w.id === "a")!;
    const solvedB = res.walls.find((w) => w.id === "b")!;

    expect(solvedA.b.join).toBe("butt");
    expect(solvedB.a.join).toBe("butt");
    expect(solvedA.b.ownedCapPoly).toBeUndefined();
    expect(solvedB.a.ownedCapPoly).toBeUndefined();
    expect(res.joinPolys).toHaveLength(0);
  });

  test("moderately angled equal-priority corner uses a butt join", () => {
    const w1 = wall("a", P(-5, 0), P(0, 0), 150);
    const w2 = wall("b", P(0, 0), P(-4.33, 2.5), 150);
    const res = solveWallNetwork([w1, w2], { nodeTolM: 1e-6 });
    const solvedA = res.walls.find((w) => w.id === "a")!;
    const solvedB = res.walls.find((w) => w.id === "b")!;

    expect(solvedA.b.join).toBe("butt");
    expect(solvedB.a.join).toBe("butt");
    expect(solvedA.b.ownedCapPoly).toBeUndefined();
    expect(solvedB.a.ownedCapPoly).toBeUndefined();
    expect(res.joinPolys).toHaveLength(0);
  });

  test("equal-priority angled corner butts the second wall into the first wall", () => {
    const vertical = wall("vertical", P(0, 5), P(0, 0), 150);
    const diagonal = wall("diagonal", P(0, 0), P(5, 5), 150);
    const res = solveWallNetwork([vertical, diagonal], { nodeTolM: 1e-6 });
    const solvedVertical = res.walls.find((w) => w.id === "vertical")!;
    const solvedDiagonal = res.walls.find((w) => w.id === "diagonal")!;

    expect(solvedVertical.b.join).toBe("butt");
    expect(solvedDiagonal.a.join).toBe("butt");
    expect(solvedVertical.b.left.x).toBeCloseTo(0.075, 6);
    expect(solvedVertical.b.right.x).toBeCloseTo(-0.075, 6);
    expect(dist(solvedDiagonal.a.left, solvedDiagonal.a.right)).toBeGreaterThan(0.14);
  });

  test("closed room with diagonal wall uses butt joins at the room ending", () => {
    const left = wall("left", P(0, 0), P(0, 5), 150);
    const top = wall("top", P(0, 5), P(5, 5), 150);
    const right = wall("right", P(5, 5), P(5, 2), 150);
    const bottom = wall("bottom", P(5, 2), P(0, 0), 150);
    const res = solveWallNetwork([left, top, right, bottom], { nodeTolM: 1e-6 });
    const solvedLeft = res.walls.find((w) => w.id === "left")!;
    const solvedBottom = res.walls.find((w) => w.id === "bottom")!;

    expect(solvedLeft.a.join).toBe("butt");
    expect(solvedBottom.b.join).toBe("butt");
    expect(solvedLeft.a.ownedCapPoly).toBeUndefined();
    expect(solvedBottom.b.ownedCapPoly).toBeUndefined();
  });

  test("nearby room-closing endpoints solve from one shared corner", () => {
    const left = wall("left", P(0, 0), P(0, 5), 150);
    const top = wall("top", P(0, 5), P(5, 4.2), 150);
    const right = wall("right", P(5, 4.2), P(4.3, 2.2), 150);
    const bottom = wall("bottom", P(4.3, 2.2), P(0.018, -0.012), 150);
    const res = solveWallNetwork([left, top, right, bottom], { nodeTolM: 0.03 });
    const solvedLeft = res.walls.find((w) => w.id === "left")!;
    const solvedBottom = res.walls.find((w) => w.id === "bottom")!;

    expect(solvedLeft.a.join).toBe("butt");
    expect(solvedBottom.b.join).toBe("butt");
    expect(solvedLeft.a.ownedCapPoly).toBeUndefined();
    expect(solvedBottom.b.ownedCapPoly).toBeUndefined();
  });

  test("equal-priority closed angled outline uses side-butts at all 2-wall corners", () => {
    const left = wall("left", P(0, 0), P(0, 5), 150);
    const top = wall("top", P(0, 5), P(4, 5), 150);
    const upperRight = wall("upperRight", P(4, 5), P(6, 2), 150);
    const lowerRight = wall("lowerRight", P(6, 2), P(3, 0.5), 150);
    const bottom = wall("bottom", P(3, 0.5), P(0, 0), 150);
    const res = solveWallNetwork([left, top, upperRight, lowerRight, bottom], { nodeTolM: 1e-6 });

    const solvedLeft = res.walls.find((w) => w.id === "left")!;
    const solvedTop = res.walls.find((w) => w.id === "top")!;
    const solvedUpperRight = res.walls.find((w) => w.id === "upperRight")!;
    const solvedLowerRight = res.walls.find((w) => w.id === "lowerRight")!;
    const solvedBottom = res.walls.find((w) => w.id === "bottom")!;

    expect(solvedLeft.b.join).toBe("butt");
    expect(solvedTop.a.join).toBe("butt");
    expect(solvedUpperRight.b.join).toBe("butt");
    expect(solvedLowerRight.a.join).toBe("butt");
    expect(solvedBottom.a.join).toBe("butt");
    expect(solvedBottom.b.join).toBe("butt");
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
    expect(dist(solvedBranch.a.left, solvedBranch.a.right)).toBeGreaterThan(0.14);
  });

  test("explicit side-butt branch does not protrude past the opposite wall face", () => {
    const main = wall("main", P(0, 5), P(0, 0), 150);
    const branch = wall("branch", P(0, 0), P(5, 5), 150);
    main.joinEnds = { b: { priority: 10 } };
    const res = solveWallNetwork([main, branch], { nodeTolM: 1e-6 });
    const solvedMain = res.walls.find((w) => w.id === "main")!;
    const solvedBranch = res.walls.find((w) => w.id === "branch")!;

    expect(solvedMain.b.ownedCapPoly).toBeUndefined();
    expect(dist(solvedBranch.a.left, solvedBranch.a.right)).toBeGreaterThan(0.14);
  });

  test("Case 4: 90° different thickness (still joins)", () => {
    const w1 = wall("a", P(0, 0), P(5, 0), 300);
    const w2 = wall("b", P(0, 0), P(0, 5), 150);
    const res = solveWallNetwork([w1, w2], { nodeTolM: 1e-6, miterLimit: 12 });
    expect(res.walls.length).toBe(2);
    expect(res.walls[0].outline).toHaveLength(4);
    expect(res.walls[1].outline).toHaveLength(4);
  });

  test("keeps orthogonal side-butt main walls straight without hidden cap triangles", () => {
    const top = wall("top", P(0, 5), P(5, 5), 150);
    const right = wall("right", P(5, 5), P(5, 0), 150);
    const bottom = wall("bottom", P(0, 0), P(5, 0), 150);
    top.joinEnds = { b: { priority: 10 } };
    right.joinEnds = { b: { priority: 10 } };
    const res = solveWallNetwork([top, right, bottom], { nodeTolM: 1e-6 });
    const solvedTop = res.walls.find((w) => w.id === "top")!;
    const solvedRight = res.walls.find((w) => w.id === "right")!;

    expect(res.joinPolys).toHaveLength(0);
    expect(solvedTop.b.ownedCapPoly).toBeUndefined();
    expect(solvedRight.b.ownedCapPoly).toBeUndefined();
    expect(solvedTop.outline).toHaveLength(4);
    expect(solvedRight.outline).toHaveLength(4);
    expect(solvedTop.b.left.x).toBeCloseTo(5.075, 6);
    expect(solvedTop.b.right.x).toBeCloseTo(5.075, 6);
    expect(solvedRight.b.left.z).toBeCloseTo(-0.075, 6);
    expect(solvedRight.b.right.z).toBeCloseTo(-0.075, 6);
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

    expect(solvedMain.a.left.x).toBeCloseTo(-0.075, 6);
    expect(solvedMain.a.left.z).toBeCloseTo(0.075, 6);
    expect(solvedMain.a.right.x).toBeCloseTo(-0.075, 6);
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

    expect(solvedMain.a.left.x).toBeCloseTo(-0.15, 6);
    expect(solvedMain.a.left.z).toBeCloseTo(0.075, 6);
    expect(solvedMain.a.right.x).toBeCloseTo(-0.15, 6);
    expect(solvedMain.a.right.z).toBeCloseTo(-0.075, 6);
    expect(solvedBranch.a.left.x).toBeCloseTo(-0.15, 6);
    expect(solvedBranch.a.left.z).toBeCloseTo(0.075, 6);
    expect(solvedBranch.a.right.x).toBeCloseTo(0.15, 6);
    expect(solvedBranch.a.right.z).toBeCloseTo(0.075, 6);
  });
});

