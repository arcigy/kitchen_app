import { add, clamp, dist, dot, intersectLines, mul, sub, type Point } from "./geom";
import { rawEndCorners, sideLineAtNode, spineDir, type Wall } from "./model";

export type WallEnd = "a" | "b";

export type WallSolvedEnd = {
  left: Point;
  right: Point;
  join: "butt" | "miter" | "bevel";
  // when bevel happens we also return a join quad (exterior->exterior->interior->interior)
  bevelJoinPoly?: Point[];
};

export type WallSolved = {
  id: string;
  a: WallSolvedEnd;
  b: WallSolvedEnd;
  outline: Point[]; // polygon in XZ
};

type Node = { id: string; p: Point; incident: Array<{ wall: Wall; end: WallEnd }> };

export const DEFAULT_WALL_MITER_LIMIT = 1.25;

function key(p: Point, tol = 1e-3) {
  // tol in meters -> quantize
  const qx = Math.round(p.x / tol);
  const qz = Math.round(p.z / tol);
  return `${qx},${qz}`;
}

function collinear(u: Point, v: Point) {
  const d = Math.abs(u.x * v.z - u.z * v.x);
  return d <= 1e-6;
}

function solveMiterAtNode(
  a: Wall,
  endA: WallEnd,
  b: Wall,
  endB: WallEnd,
  opts: { miterLimit: number }
): { aEnd: WallSolvedEnd; bEnd: WallSolvedEnd } {
  const rawA = rawEndCorners(a, endA);
  const rawB = rawEndCorners(b, endB);

  const limA = Math.max(0.001, a.thicknessM * opts.miterLimit);
  const limB = Math.max(0.001, b.thicknessM * opts.miterLimit);
  const aLeft = sideLineAtNode(a, endA, "left");
  const aRight = sideLineAtNode(a, endA, "right");
  const bLeft = sideLineAtNode(b, endB, "left");
  const bRight = sideLineAtNode(b, endB, "right");
  const iLeft = intersectLines(aLeft, bLeft);
  const iRight = intersectLines(aRight, bRight);

  if (!iLeft || !iRight) {
    return { aEnd: { ...rawA, join: "butt" }, bEnd: { ...rawB, join: "butt" } };
  }

  const tooLong =
    dist(aLeft.p, iLeft.p) > limA ||
    dist(aRight.p, iRight.p) > limA ||
    dist(bLeft.p, iLeft.p) > limB ||
    dist(bRight.p, iRight.p) > limB;

  if (!tooLong) {
    return {
      aEnd: { left: iLeft.p, right: iRight.p, join: "miter" },
      bEnd: { left: iLeft.p, right: iRight.p, join: "miter" }
    };
  }

  const da = spineDir(a, endA);
  const db = spineDir(b, endB);

  const clampOn = (p0: Point, dir: Point, target: Point, maxLen: number) => {
    const v = sub(target, p0);
    const along = v.x * dir.x + v.z * dir.z;
    const t = clamp(along, 0, maxLen);
    return add(p0, mul(dir, t));
  };

  const aLeftP = clampOn(aLeft.p, da, iLeft.p, limA);
  const aRightP = clampOn(aRight.p, da, iRight.p, limA);
  const bLeftP = clampOn(bLeft.p, db, iLeft.p, limB);
  const bRightP = clampOn(bRight.p, db, iRight.p, limB);

  const joinPoly: Point[] = [aLeftP, bLeftP, bRightP, aRightP];

  const aEnd: WallSolvedEnd = { left: aLeftP, right: aRightP, join: "bevel", bevelJoinPoly: joinPoly };
  const bEnd: WallSolvedEnd = { left: bLeftP, right: bRightP, join: "bevel", bevelJoinPoly: joinPoly };

  return { aEnd, bEnd };
}

function solveTAtNode(main0: Wall, end0: WallEnd, main1: Wall, end1: WallEnd, branch: Wall, endB: WallEnd) {
  // Keep main continuous; cut branch end to main boundaries (butt).
  const rawB = rawEndCorners(branch, endB);
  const sides: Array<"left" | "right"> = ["left", "right"];

  let best: { bOuter: "left" | "right"; mOuter: "left" | "right"; out: Point; inn: Point; cost: number } | null =
    null;
  for (const bOuter of sides) {
    for (const mOuter of sides) {
      const bInner = bOuter === "left" ? "right" : "left";
      const mInner = mOuter === "left" ? "right" : "left";
      const bOut = sideLineAtNode(branch, endB, bOuter);
      const bIn = sideLineAtNode(branch, endB, bInner);
      const mOut = sideLineAtNode(main0, end0, mOuter);
      const mIn = sideLineAtNode(main0, end0, mInner);
      const iOut = intersectLines(bOut, mOut);
      const iIn = intersectLines(bIn, mIn);
      if (!iOut || !iIn) continue;
      const cost = dist(bOut.p, iOut.p) + dist(bIn.p, iIn.p);
      if (!best || cost < best.cost) best = { bOuter, mOuter, out: iOut.p, inn: iIn.p, cost };
    }
  }

  if (!best) return { branchEnd: { ...rawB, join: "butt" as const } };
  const branchEnd: WallSolvedEnd =
    best.bOuter === "left" ? { left: best.out, right: best.inn, join: "butt" } : { left: best.inn, right: best.out, join: "butt" };
  return { branchEnd };
}

function solveSideButtCornerAtNode(main: Wall, endMain: WallEnd, branch: Wall, endBranch: WallEnd) {
  const rawMain = rawEndCorners(main, endMain);
  const rawBranch = rawEndCorners(branch, endBranch);
  const branchDir = spineDir(branch, endBranch);
  const mainDir = spineDir(main, endMain);
  const beyondMainEndDir = mul(mainDir, -1);
  const mainNode = endMain === "a" ? main.a : main.b;
  const branchLeft = sideLineAtNode(branch, endBranch, "left");
  const branchRight = sideLineAtNode(branch, endBranch, "right");
  const sides: Array<"left" | "right"> = ["left", "right"];

  let best: { side: "left" | "right"; left: Point; right: Point; cost: number } | null = null;
  for (const side of sides) {
    const cutLine = sideLineAtNode(main, endMain, side);
    const iLeft = intersectLines(branchLeft, cutLine);
    const iRight = intersectLines(branchRight, cutLine);
    if (!iLeft || !iRight) continue;
    const leftAlong = dot(sub(iLeft.p, branchLeft.p), branchDir);
    const rightAlong = dot(sub(iRight.p, branchRight.p), branchDir);
    const behindPenalty = Math.max(0, -leftAlong) + Math.max(0, -rightAlong);
    const cost = behindPenalty * 1000 + Math.abs(leftAlong) + Math.abs(rightAlong);
    if (!best || cost < best.cost) best = { side, left: iLeft.p, right: iRight.p, cost };
  }

  let joinPoly: Point[] | undefined;
  if (best && Math.abs(dot(mainDir, branchDir)) > 0.15) {
    const leftProjection = dot(sub(best.left, mainNode), beyondMainEndDir);
    const rightProjection = dot(sub(best.right, mainNode), beyondMainEndDir);
    const protrudingSide: "left" | "right" = leftProjection >= rightProjection ? "left" : "right";
    const protrudingProjection = Math.max(leftProjection, rightProjection);
    if (protrudingProjection > 0.001) {
      const capTip = rawBranch[protrudingSide];
      const protrudingPoint = protrudingSide === "left" ? best.left : best.right;
      const cutCorner = best.side === "left" ? rawMain.left : rawMain.right;
      const oppositeCorner = best.side === "left" ? rawMain.right : rawMain.left;
      const protrudingLine = protrudingSide === "left" ? branchLeft : branchRight;
      const oppositeSide = best.side === "left" ? "right" : "left";
      const oppositeMainLine = sideLineAtNode(main, endMain, oppositeSide);
      const oppositeIntersect = intersectLines(protrudingLine, oppositeMainLine);
      const maxCapProjection = Math.max(main.thicknessM, branch.thicknessM) * DEFAULT_WALL_MITER_LIMIT;
      const oppositeProjection = oppositeIntersect
        ? clamp(dot(sub(oppositeIntersect.p, mainNode), beyondMainEndDir), 0, maxCapProjection)
        : Math.min(maxCapProjection, Math.max(protrudingProjection, main.thicknessM));
      const extendedOppositeCorner = add(oppositeCorner, mul(beyondMainEndDir, oppositeProjection));
      joinPoly = [oppositeCorner, extendedOppositeCorner, capTip, protrudingPoint, cutCorner];
    }
  }

  return {
    mainEnd: { ...rawMain, join: "butt" as const, bevelJoinPoly: joinPoly },
    branchEnd: best ? { left: best.left, right: best.right, join: "butt" as const, bevelJoinPoly: joinPoly } : { ...rawBranch, join: "butt" as const }
  };
}

export function solveWallNetwork(
  walls: Wall[],
  opts: { nodeTolM?: number; miterLimit?: number } = {}
): { walls: WallSolved[]; joinPolys: Point[][]; debug: { nodes: Node[] } } {
  const nodeTolM = opts.nodeTolM ?? 0.02;
  const miterLimit = opts.miterLimit ?? DEFAULT_WALL_MITER_LIMIT;

  const nodesMap = new Map<string, Node>();
  const pushNode = (p: Point, wall: Wall, end: WallEnd) => {
    const k = key(p, nodeTolM);
    let n = nodesMap.get(k);
    if (!n) {
      n = { id: k, p, incident: [] };
      nodesMap.set(k, n);
    }
    n.incident.push({ wall, end });
  };

  for (const w of walls) {
    pushNode(w.a, w, "a");
    pushNode(w.b, w, "b");
  }

  // seed solved ends with raw offsets
  const solvedEnds = new Map<string, { a: WallSolvedEnd; b: WallSolvedEnd }>();
  for (const w of walls) {
    solvedEnds.set(w.id, {
      a: { ...rawEndCorners(w, "a"), join: "butt" },
      b: { ...rawEndCorners(w, "b"), join: "butt" }
    });
  }

  const joinPolys: Point[][] = [];

  const nodes = Array.from(nodesMap.values());
  for (const node of nodes) {
    const inc = node.incident;
    if (inc.length < 2) continue;

    // 2-wall corner: keep the earlier/reference wall full and butt the next wall
    // into that wall face. This keeps the visible corner seam on the face line
    // instead of drawing a diagonal cut through both walls.
    if (inc.length === 2) {
      const A = inc[0];
      const B = inc[1];
      const res = solveSideButtCornerAtNode(A.wall, A.end, B.wall, B.end);
      const sa = solvedEnds.get(A.wall.id)!;
      const sb = solvedEnds.get(B.wall.id)!;
      sa[A.end] = res.mainEnd;
      sb[B.end] = res.branchEnd;
      const capPoly = res.mainEnd.bevelJoinPoly ?? res.branchEnd.bevelJoinPoly;
      if (capPoly && capPoly.length >= 3) joinPolys.push(capPoly);
      continue;
    }

    // T join: 3 incident, with 2 collinear
    if (inc.length === 3) {
      const dirs = inc.map((it) => spineDir(it.wall, it.end));
      let pair: [number, number] | null = null;
      for (let i = 0; i < 3 && !pair; i++) {
        for (let j = i + 1; j < 3 && !pair; j++) {
          if (collinear(dirs[i], dirs[j])) pair = [i, j];
        }
      }
      if (pair) {
        const k = [0, 1, 2].find((x) => x !== pair![0] && x !== pair![1])!;
        const m0 = inc[pair[0]];
        const m1 = inc[pair[1]];
        const br = inc[k];
        const res = solveTAtNode(m0.wall, m0.end, m1.wall, m1.end, br.wall, br.end);
        const sbr = solvedEnds.get(br.wall.id)!;
        sbr[br.end] = res.branchEnd;
      }
    }
  }

  const solved: WallSolved[] = [];
  for (const w of walls) {
    const se = solvedEnds.get(w.id)!;
    const a = se.a;
    const b = se.b;
    // Build polygon with consistent winding: [a.left, a.right, b.right, b.left]
    const outline = [a.left, a.right, b.right, b.left];
    solved.push({ id: w.id, a, b, outline });
  }

  return { walls: solved, joinPolys, debug: { nodes } };
}
