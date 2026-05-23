import { add, dist, dot, intersectLines, mul, sub, type Point } from "./geom";
import { leftNormal, offsetsM, rawEndCorners, spineDir, type Wall } from "./model";

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

export const DEFAULT_WALL_MITER_LIMIT = Number.POSITIVE_INFINITY;

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

function sideLineAtSolvedNode(w: Wall, end: WallEnd, side: "left" | "right", node: Point) {
  const nL = leftNormal(w);
  const offs = offsetsM(w);
  const off = side === "left" ? offs.left : offs.right;
  return { p: add(node, mul(nL, off)), d: spineDir(w, end) };
}

function rawEndCornersAtSolvedNode(w: Wall, node: Point): { left: Point; right: Point } {
  const nL = leftNormal(w);
  const offs = offsetsM(w);
  return { left: add(node, mul(nL, offs.left)), right: add(node, mul(nL, offs.right)) };
}

function solveTAtNode(main0: Wall, end0: WallEnd, main1: Wall, end1: WallEnd, branch: Wall, endB: WallEnd, node: Point) {
  // Keep main continuous; cut branch end to main boundaries (butt).
  const rawB = rawEndCornersAtSolvedNode(branch, node);
  const sides: Array<"left" | "right"> = ["left", "right"];

  let best: { bOuter: "left" | "right"; mOuter: "left" | "right"; out: Point; inn: Point; cost: number } | null =
    null;
  for (const bOuter of sides) {
    for (const mOuter of sides) {
      const bInner = bOuter === "left" ? "right" : "left";
      const mInner = mOuter === "left" ? "right" : "left";
      const bOut = sideLineAtSolvedNode(branch, endB, bOuter, node);
      const bIn = sideLineAtSolvedNode(branch, endB, bInner, node);
      const mOut = sideLineAtSolvedNode(main0, end0, mOuter, node);
      const mIn = sideLineAtSolvedNode(main0, end0, mInner, node);
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

function solveSideButtCornerAtNode(main: Wall, endMain: WallEnd, branch: Wall, endBranch: WallEnd, node: Point) {
  const rawMain = rawEndCornersAtSolvedNode(main, node);
  const rawBranch = rawEndCornersAtSolvedNode(branch, node);
  const branchDir = spineDir(branch, endBranch);
  const beyondMainEndDir = mul(spineDir(main, endMain), -1);
  const branchLeft = sideLineAtSolvedNode(branch, endBranch, "left", node);
  const branchRight = sideLineAtSolvedNode(branch, endBranch, "right", node);
  const sides: Array<"left" | "right"> = ["left", "right"];

  let best: { side: "left" | "right"; left: Point; right: Point; cost: number } | null = null;
  for (const side of sides) {
    const cutLine = sideLineAtSolvedNode(main, endMain, side, node);
    const iLeft = intersectLines(branchLeft, cutLine);
    const iRight = intersectLines(branchRight, cutLine);
    if (!iLeft || !iRight) continue;
    const leftAlong = dot(sub(iLeft.p, branchLeft.p), branchDir);
    const rightAlong = dot(sub(iRight.p, branchRight.p), branchDir);
    const behindPenalty = Math.max(0, -leftAlong) + Math.max(0, -rightAlong);
    const cost = behindPenalty * 1000 + Math.abs(leftAlong) + Math.abs(rightAlong);
    if (!best || cost < best.cost) best = { side, left: iLeft.p, right: iRight.p, cost };
  }

  const extendMainSide = (side: "left" | "right") => {
    const raw = side === "left" ? rawMain.left : rawMain.right;
    const sideLine = sideLineAtSolvedNode(main, endMain, side, node);
    const intersections = [intersectLines(sideLine, branchLeft), intersectLines(sideLine, branchRight)]
      .map((item) => item?.p)
      .filter((point): point is Point => !!point)
      .map((point) => ({ point, projection: dot(sub(point, raw), beyondMainEndDir) }))
      .filter((item) => item.projection > 0.001)
      .sort((a, b) => b.projection - a.projection);
    return intersections[0]?.point ?? raw;
  };

  const mainEnd: WallSolvedEnd = best
    ? { left: extendMainSide("left"), right: extendMainSide("right"), join: "butt" }
    : { ...rawMain, join: "butt" };
  const branchEnd: WallSolvedEnd = best
    ? { left: best.left, right: best.right, join: "butt" }
    : { ...rawBranch, join: "butt" };
  return { mainEnd, branchEnd };
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

  const nodes: Node[] = [];
  const pushNode = (p: Point, wall: Wall, end: WallEnd) => {
    let n = nodes.find((candidate) => dist(candidate.p, p) <= nodeTolM);
    if (!n) {
      n = { id: key(p, nodeTolM), p, incident: [] };
      nodes.push(n);
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

  for (const node of nodes) {
    const inc = node.incident.filter(joinEnabled);
    if (inc.length < 2) continue;

    // 2-wall corner: one wall owns the corner and extends to the outside
    // face; the other butts into its side face. This prevents both gaps and
    // overlaps without using 45-degree miters.
    if (inc.length === 2) {
      const [A, B] = sortByJoinPriority(inc);
      const sa = solvedEnds.get(A.wall.id)!;
      const sb = solvedEnds.get(B.wall.id)!;
      const res = solveSideButtCornerAtNode(A.wall, A.end, B.wall, B.end, node.p);
      sa[A.end] = res.mainEnd;
      sb[B.end] = res.branchEnd;
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
        const res = solveTAtNode(m0.wall, m0.end, m1.wall, m1.end, br.wall, br.end, node.p);
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
