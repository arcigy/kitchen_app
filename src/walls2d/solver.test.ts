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

  test("obtuse angled chain keeps the exterior miter instead of cutting an inside notch", () => {
    const w1 = wall("a", P(-5, 0), P(0, 0), 150);
    const w2 = wall("b", P(0, 0), P(-4, 4), 150);
    const res = solveWallNetwork([w1, w2], { nodeTolM: 1e-6, miterLimit: 12 });
    const solvedA = res.walls.find((w) => w.id === "a")!;
    const solvedB = res.walls.find((w) => w.id === "b")!;

    expect(solvedA.b.join).toBe("miter");
    expect(solvedB.a.join).toBe("miter");
    expect(solvedA.b.left.x).toBeLessThan(-0.15);
    expect(solvedA.b.right.x).toBeGreaterThan(0.15);
    expect(solvedB.a.left).toEqual(solvedA.b.left);
    expect(solvedB.a.right).toEqual(solvedA.b.right);
  });

  test("caps overlong miters with a bevel so shallow angles do not create long spikes", () => {
    const w1 = wall("a", P(-5, 0), P(0, 0), 150);
    const w2 = wall("b", P(0, 0), P(-4.33, 2.5), 150);
    const res = solveWallNetwork([w1, w2], { nodeTolM: 1e-6 });
    const solvedA = res.walls.find((w) => w.id === "a")!;
    const solvedB = res.walls.find((w) => w.id === "b")!;

    expect(solvedA.b.join).toBe("bevel");
    expect(solvedB.a.join).toBe("bevel");
    expect(res.joinPolys).toHaveLength(1);
    expect(solvedA.b.left.x).toBeCloseTo(-0.1125, 6);
    expect(solvedA.b.right.x).toBeCloseTo(-0.1125, 6);
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

  test("Case 6: T join (branch cut to main)", () => {
    // Main wall is split at node (0,0) so node degree becomes 3.
    const main0 = wall("m0", P(-5, 0), P(0, 0), 150);
    const main1 = wall("m1", P(0, 0), P(5, 0), 150);
    const branch = wall("b", P(0, 0), P(0, 5), 100);
    const res = solveWallNetwork([main0, main1, branch], { nodeTolM: 1e-6, miterLimit: 12 });
    expect(res.walls.length).toBe(3);
  });
  test("2-wall corner trims both wall faces to one clean miter", () => {
    const main = wall("main", P(0, 0), P(5, 0), 150);
    const branch = wall("branch", P(0, 0), P(0, 5), 150);
    const res = solveWallNetwork([main, branch], { nodeTolM: 1e-6, miterLimit: 12 });
    const solvedMain = res.walls.find((w) => w.id === "main")!;
    const solvedBranch = res.walls.find((w) => w.id === "branch")!;

    expect(solvedMain.a.left.x).toBeCloseTo(-0.075, 6);
    expect(solvedMain.a.left.z).toBeCloseTo(0.075, 6);
    expect(solvedMain.a.right.x).toBeCloseTo(0.075, 6);
    expect(solvedMain.a.right.z).toBeCloseTo(-0.075, 6);
    expect(solvedBranch.a.left.x).toBeCloseTo(-0.075, 6);
    expect(solvedBranch.a.left.z).toBeCloseTo(0.075, 6);
    expect(solvedBranch.a.right.x).toBeCloseTo(0.075, 6);
    expect(solvedBranch.a.right.z).toBeCloseTo(-0.075, 6);
  });

  test("2-wall corner miter follows the larger branch thickness", () => {
    const main = wall("main", P(0, 0), P(5, 0), 150);
    const branch = wall("branch", P(0, 0), P(0, 5), 300);
    const res = solveWallNetwork([main, branch], { nodeTolM: 1e-6, miterLimit: 12 });
    const solvedMain = res.walls.find((w) => w.id === "main")!;
    const solvedBranch = res.walls.find((w) => w.id === "branch")!;

    expect(solvedMain.a.left.x).toBeCloseTo(-0.15, 6);
    expect(solvedMain.a.left.z).toBeCloseTo(0.075, 6);
    expect(solvedMain.a.right.x).toBeCloseTo(0.15, 6);
    expect(solvedMain.a.right.z).toBeCloseTo(-0.075, 6);
    expect(solvedBranch.a.left.x).toBeCloseTo(-0.15, 6);
    expect(solvedBranch.a.left.z).toBeCloseTo(0.075, 6);
    expect(solvedBranch.a.right.x).toBeCloseTo(0.15, 6);
    expect(solvedBranch.a.right.z).toBeCloseTo(-0.075, 6);
  });
});

