import { add, clamp, dist, dot, intersectLines, mul, sub, type Point } from "./geom";
import { rawEndCorners, sideLineAtNode, spineDir, type Wall } from "./model";

export type WallEnd = "a" | "b";

export type WallSolvedEnd = {
  left: Point;
  right: Point;
  join: "butt" | "miter" | "bevel";
  // when bevel happens we also return a join quad (exterior->exterior->interior->interior)
  bevelJoinPoly?: Point[];
  ownedCapPoly?: Point[];
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

function joinEnabled(item: { wall: Wall; end: WallEnd }) {
  return item.wall.joinEnds?.[item.end]?.enabled !== false;
}

function joinPriority(item: { wall: Wall; end: WallEnd }) {
  return item.wall.joinEnds?.[item.end]?.priority ?? 0;
}

function sortByJoinPriority<T extends { wall: Wall; end: WallEnd }>(items: T[]) {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => joinPriority(b.item) - joinPriority(a.item) || a.index - b.index)
    .map((entry) => entry.item);
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
  let branchEnd: WallSolvedEnd = { ...rawBranch, join: "butt" as const };
  if (best) {
    const cutCorner = best.side === "left" ? rawMain.left : rawMain.right;
    const clampObliqueEnd = Math.abs(dot(mainDir, branchDir)) > 0.15;
    const clampPastEnd = (point: Point) => {
      const projection = dot(sub(point, mainNode), beyondMainEndDir);
      return clampObliqueEnd && projection > 0.001 ? cutCorner : point;
    };
    const left = clampPastEnd(best.left);
    const right = clampPastEnd(best.right);
    branchEnd = { left, right, join: "butt" as const };

    if (!clampObliqueEnd) {
      const leftProjection = dot(sub(best.left, mainNode), beyondMainEndDir);
      const rightProjection = dot(sub(best.right, mainNode), beyondMainEndDir);
      const protrudingSide: "left" | "right" = leftProjection >= rightProjection ? "left" : "right";
      const protrudingProjection = Math.max(leftProjection, rightProjection);
      if (protrudingProjection > 0.001) {
        const protrudingPoint = protrudingSide === "left" ? best.left : best.right;
        const oppositeCorner = best.side === "left" ? rawMain.right : rawMain.left;
        joinPoly = [oppositeCorner, protrudingPoint, cutCorner];
      }
    }
  }

  return {
    mainEnd: { ...rawMain, join: "butt" as const, ownedCapPoly: joinPoly },
    branchEnd
  };
}

function samePoint(a: Point, b: Point) {
  return dist(a, b) <= 1e-6;
}

function endPath(start: Point, end: Point, cap?: Point[]) {
  if (cap && cap.length >= 3) {
    const first = cap[0];
    const last = cap[cap.length - 1];
    if (samePoint(first, start) && samePoint(last, end)) return cap;
    if (samePoint(first, end) && samePoint(last, start)) return [...cap].reverse();
  }
  return [start, end];
}

function dedupeLoop(points: Point[]) {
  const out: Point[] = [];
  for (const point of points) {
    const prev = out[out.length - 1];
    if (prev && samePoint(prev, point)) continue;
    out.push(point);
  }
  if (out.length > 2 && samePoint(out[0], out[out.length - 1])) out.pop();
  return out;
}

function solvedOutline(a: WallSolvedEnd, b: WallSolvedEnd) {
  return dedupeLoop([
    ...endPath(a.left, a.right, a.ownedCapPoly),
    ...endPath(b.right, b.left, b.ownedCapPoly)
  ]);
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
    const inc = node.incident.filter(joinEnabled);
    if (inc.length < 2) continue;

    // 2-wall corner: ordinary equal-priority corners miter cleanly. Explicit
    // join priority switches to a Revit-like join order where one wall
    // continues and the other butts into it.
    if (inc.length === 2) {
      const [A, B] = sortByJoinPriority(inc);
      const sa = solvedEnds.get(A.wall.id)!;
      const sb = solvedEnds.get(B.wall.id)!;
      if (joinPriority(A) !== joinPriority(B)) {
        const res = solveSideButtCornerAtNode(A.wall, A.end, B.wall, B.end);
        sa[A.end] = res.mainEnd;
        sb[B.end] = res.branchEnd;
      } else {
        const angleDot = Math.abs(dot(spineDir(A.wall, A.end), spineDir(B.wall, B.end)));
        if (angleDot > 0.15) {
          const res = solveSideButtCornerAtNode(A.wall, A.end, B.wall, B.end);
          sa[A.end] = res.mainEnd;
          sb[B.end] = res.branchEnd;
        } else {
          const res = solveMiterAtNode(A.wall, A.end, B.wall, B.end, { miterLimit });
          sa[A.end] = res.aEnd;
          sb[B.end] = res.bEnd;
          if (res.aEnd.join === "bevel" && res.aEnd.bevelJoinPoly) joinPolys.push(res.aEnd.bevelJoinPoly);
        }
      }
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
        const [m0, m1] = sortByJoinPriority([inc[pair[0]], inc[pair[1]]]);
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
    // Build polygon with consistent winding and fold owned corner caps into the wall itself.
    const outline = solvedOutline(a, b);
    solved.push({ id: w.id, a, b, outline });
  }

  return { walls: solved, joinPolys, debug: { nodes } };
}
