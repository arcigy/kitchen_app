export type PlanLinePoint = { x: number; z: number };

export type PlanLineSegment = {
  a: PlanLinePoint;
  b: PlanLinePoint;
  arcPoints?: PlanLinePoint[];
};

export type PlanLineDrawToolId =
  | "boundaryLine"
  | "line"
  | "rectangle"
  | "polygon"
  | "circle"
  | "arc"
  | "spline"
  | "pickLines";

export type PlanLineScreenRect = { x0: number; y0: number; x1: number; y1: number };

export type PlanLineTrackedAxisSnap = { point: PlanLinePoint; axis: "x" | "z" };

export type PlanLineParallelDimension = {
  segmentIndex: number;
  referenceSegmentIndex: number;
  distanceMm: number;
  signedDistanceMm: number;
  selectedPoint: PlanLinePoint;
  referencePoint: PlanLinePoint;
  dir: { x: number; z: number };
  normal: { x: number; z: number };
};

export const PLAN_LINE_DRAW_TOOL_IDS: PlanLineDrawToolId[] = [
  "boundaryLine",
  "line",
  "rectangle",
  "polygon",
  "circle",
  "arc",
  "spline",
  "pickLines"
];

export function clonePlanLineSegments<T extends PlanLineSegment>(segments: T[]): T[] {
  return segments.map((segment) => ({
    ...segment,
    a: { ...segment.a },
    b: { ...segment.b },
    ...(segment.arcPoints ? { arcPoints: segment.arcPoints.map((point) => ({ ...point })) } : {})
  }));
}

export function planLinePointDistanceMm(a: PlanLinePoint, b: PlanLinePoint) {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

export function resolvePlanLineTrackedAxisSnap(
  raw: PlanLinePoint,
  tracked: PlanLinePoint | null,
  toleranceMm: number
): PlanLineTrackedAxisSnap | null {
  if (!tracked) return null;
  const dx = Math.abs(raw.x - tracked.x);
  const dz = Math.abs(raw.z - tracked.z);
  if (dx > toleranceMm && dz > toleranceMm) return null;
  if (dx <= dz) return { point: { x: tracked.x, z: raw.z }, axis: "x" };
  return { point: { x: raw.x, z: tracked.z }, axis: "z" };
}

export function resolvePlanLineAutoAxisSnap(base: PlanLinePoint, raw: PlanLinePoint) {
  const dx = raw.x - base.x;
  const dz = raw.z - base.z;
  const length = Math.hypot(dx, dz);
  if (length < 10) return null;
  const snapAngleRad = (7 * Math.PI) / 180;
  const clamp = (value: number) => Math.min(1, Math.max(-1, value));
  if (Math.abs(Math.asin(clamp(dz / length))) <= snapAngleRad) return { x: raw.x, z: base.z };
  if (Math.abs(Math.asin(clamp(dx / length))) <= snapAngleRad) return { x: base.x, z: raw.z };
  return null;
}

export function resolvePlanLineCombinedAxisSnap(
  raw: PlanLinePoint,
  tracked: PlanLinePoint | null,
  base: PlanLinePoint | null,
  toleranceMm: number
) {
  const trackedSnap = resolvePlanLineTrackedAxisSnap(raw, tracked, toleranceMm);
  let point = trackedSnap?.point ?? raw;
  const autoSnap = base ? resolvePlanLineAutoAxisSnap(base, point) : null;
  if (autoSnap) point = autoSnap;
  if (!trackedSnap && !autoSnap) return null;
  return {
    point,
    trackedAxis: trackedSnap?.axis ?? null,
    autoAxis: autoSnap ? (autoSnap.z === base?.z ? "z" : "x") : null
  };
}

export function selectPlanLineSegmentsInRect<T extends PlanLineSegment>(
  segments: T[],
  rect: PlanLineScreenRect,
  toScreen: (point: PlanLinePoint) => { x: number; y: number },
  mode: "contain" | "touch" = "contain"
) {
  const x0 = Math.min(rect.x0, rect.x1);
  const x1 = Math.max(rect.x0, rect.x1);
  const y0 = Math.min(rect.y0, rect.y1);
  const y1 = Math.max(rect.y0, rect.y1);
  const contains = (point: { x: number; y: number }) => point.x >= x0 && point.x <= x1 && point.y >= y0 && point.y <= y1;
  const orientation = (a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }) =>
    (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const segmentIntersects = (
    a: { x: number; y: number },
    b: { x: number; y: number },
    c: { x: number; y: number },
    d: { x: number; y: number }
  ) => {
    const abC = orientation(a, b, c);
    const abD = orientation(a, b, d);
    const cdA = orientation(c, d, a);
    const cdB = orientation(c, d, b);
    return abC * abD <= 0 && cdA * cdB <= 0;
  };
  const touches = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    if (contains(a) || contains(b)) return true;
    const corners = [
      { x: x0, y: y0 },
      { x: x1, y: y0 },
      { x: x1, y: y1 },
      { x: x0, y: y1 }
    ];
    for (let index = 0; index < corners.length; index += 1) {
      if (segmentIntersects(a, b, corners[index]!, corners[(index + 1) % corners.length]!)) return true;
    }
    return false;
  };
  const selected: number[] = [];
  for (let index = 0; index < segments.length; index += 1) {
    const segment = segments[index]!;
    const a = toScreen(segment.a);
    const b = toScreen(segment.b);
    const ok = mode === "contain" ? contains(a) && contains(b) : touches(a, b);
    if (ok) selected.push(index);
  }
  return selected;
}

export function resolvePlanLineParallelDimension<T extends PlanLineSegment>(
  segments: T[],
  segmentIndex: number
): PlanLineParallelDimension | null {
  const segment = segments[segmentIndex];
  if (!segment) return null;
  const dx = segment.b.x - segment.a.x;
  const dz = segment.b.z - segment.a.z;
  const length = Math.hypot(dx, dz);
  if (length < 1) return null;
  const dir = { x: dx / length, z: dz / length };
  const normal = { x: -dir.z, z: dir.x };
  const parallelTolerance = Math.sin((5 * Math.PI) / 180);
  let best: PlanLineParallelDimension | null = null;

  for (let referenceSegmentIndex = 0; referenceSegmentIndex < segments.length; referenceSegmentIndex += 1) {
    if (referenceSegmentIndex === segmentIndex) continue;
    const reference = segments[referenceSegmentIndex]!;
    const rdx = reference.b.x - reference.a.x;
    const rdz = reference.b.z - reference.a.z;
    const referenceLength = Math.hypot(rdx, rdz);
    if (referenceLength < 1) continue;
    const rdir = { x: rdx / referenceLength, z: rdz / referenceLength };
    if (Math.abs(dir.x * rdir.z - dir.z * rdir.x) > parallelTolerance) continue;

    const rA = (reference.a.x - segment.a.x) * dir.x + (reference.a.z - segment.a.z) * dir.z;
    const rB = (reference.b.x - segment.a.x) * dir.x + (reference.b.z - segment.a.z) * dir.z;
    const overlapStart = Math.max(0, Math.min(rA, rB));
    const overlapEnd = Math.min(length, Math.max(rA, rB));
    if (overlapEnd - overlapStart < 5) continue;

    const signedDistanceMm = (reference.a.x - segment.a.x) * normal.x + (reference.a.z - segment.a.z) * normal.z;
    const distanceMm = Math.abs(signedDistanceMm);
    if (distanceMm < 1) continue;
    const coord = (overlapStart + overlapEnd) / 2;
    const selectedPoint = {
      x: Math.round(segment.a.x + dir.x * coord),
      z: Math.round(segment.a.z + dir.z * coord)
    };
    const referencePoint = {
      x: Math.round(selectedPoint.x + normal.x * signedDistanceMm),
      z: Math.round(selectedPoint.z + normal.z * signedDistanceMm)
    };
    const next = { segmentIndex, referenceSegmentIndex, distanceMm, signedDistanceMm, selectedPoint, referencePoint, dir, normal };
    if (!best || next.distanceMm < best.distanceMm) best = next;
  }
  return best;
}

export function movePlanLineSegmentToParallelDistance<T extends PlanLineSegment>(
  segments: T[],
  segmentIndex: number,
  referenceSegmentIndex: number,
  nextDistanceMm: number
) {
  const dimension = resolvePlanLineParallelDimension(segments, segmentIndex);
  const nextDistance = Math.max(1, Math.round(nextDistanceMm));
  if (!dimension || dimension.referenceSegmentIndex !== referenceSegmentIndex || !Number.isFinite(nextDistance)) return clonePlanLineSegments(segments);
  const sign = dimension.signedDistanceMm < 0 ? -1 : 1;
  const delta = dimension.signedDistanceMm - sign * nextDistance;
  const move = {
    x: Math.round(dimension.normal.x * delta),
    z: Math.round(dimension.normal.z * delta)
  };
  const segment = segments[segmentIndex]!;
  const nextA = { x: segment.a.x + move.x, z: segment.a.z + move.z };
  const nextB = { x: segment.b.x + move.x, z: segment.b.z + move.z };
  return clonePlanLineSegments(segments).map((item, index) =>
    index === segmentIndex
      ? { ...item, a: { ...nextA }, b: { ...nextB } }
      : {
          ...item,
          a: planLinePointDistanceMm(item.a, segment.a) <= 3 ? { ...nextA } : planLinePointDistanceMm(item.a, segment.b) <= 3 ? { ...nextB } : { ...item.a },
          b: planLinePointDistanceMm(item.b, segment.a) <= 3 ? { ...nextA } : planLinePointDistanceMm(item.b, segment.b) <= 3 ? { ...nextB } : { ...item.b }
        }
  );
}

export function trimExtendPlanLineSegmentsToCorner<T extends PlanLineSegment>(segments: T[], firstIndex: number, secondIndex: number) {
  const first = segments[firstIndex];
  const second = segments[secondIndex];
  if (!first || !second || firstIndex === secondIndex) return clonePlanLineSegments(segments);
  const r = { x: first.b.x - first.a.x, z: first.b.z - first.a.z };
  const s = { x: second.b.x - second.a.x, z: second.b.z - second.a.z };
  const denominator = r.x * s.z - r.z * s.x;
  if (Math.abs(denominator) < 1e-6) return clonePlanLineSegments(segments);
  const qp = { x: second.a.x - first.a.x, z: second.a.z - first.a.z };
  const t = (qp.x * s.z - qp.z * s.x) / denominator;
  const corner = { x: Math.round(first.a.x + t * r.x), z: Math.round(first.a.z + t * r.z) };
  const firstEndpoint = planLinePointDistanceMm(first.a, corner) <= planLinePointDistanceMm(first.b, corner) ? first.a : first.b;
  const secondEndpoint = planLinePointDistanceMm(second.a, corner) <= planLinePointDistanceMm(second.b, corner) ? second.a : second.b;
  return clonePlanLineSegments(segments).map((segment) => ({
    ...segment,
    a:
      planLinePointDistanceMm(segment.a, firstEndpoint) <= 3 || planLinePointDistanceMm(segment.a, secondEndpoint) <= 3
        ? { ...corner }
        : { ...segment.a },
    b:
      planLinePointDistanceMm(segment.b, firstEndpoint) <= 3 || planLinePointDistanceMm(segment.b, secondEndpoint) <= 3
        ? { ...corner }
        : { ...segment.b }
  }));
}

export function alignPlanLineSegmentToReference<T extends PlanLineSegment>(segments: T[], referenceIndex: number, movingIndex: number) {
  const reference = segments[referenceIndex];
  const moving = segments[movingIndex];
  if (!reference || !moving || referenceIndex === movingIndex) return clonePlanLineSegments(segments);
  const rdx = reference.b.x - reference.a.x;
  const rdz = reference.b.z - reference.a.z;
  const mdx = moving.b.x - moving.a.x;
  const mdz = moving.b.z - moving.a.z;
  const referenceLength = Math.hypot(rdx, rdz);
  const movingLength = Math.hypot(mdx, mdz);
  if (referenceLength < 1 || movingLength < 1) return clonePlanLineSegments(segments);
  const rdir = { x: rdx / referenceLength, z: rdz / referenceLength };
  const mdir = { x: mdx / movingLength, z: mdz / movingLength };
  const normal = { x: -rdir.z, z: rdir.x };
  if (Math.abs(rdir.x * mdir.z - rdir.z * mdir.x) <= Math.sin((5 * Math.PI) / 180)) {
    const offset = (reference.a.x - moving.a.x) * normal.x + (reference.a.z - moving.a.z) * normal.z;
    const move = { x: Math.round(normal.x * offset), z: Math.round(normal.z * offset) };
    const nextA = { x: moving.a.x + move.x, z: moving.a.z + move.z };
    const nextB = { x: moving.b.x + move.x, z: moving.b.z + move.z };
    return clonePlanLineSegments(segments).map((segment, index) =>
      index === movingIndex
        ? { ...segment, a: { ...nextA }, b: { ...nextB } }
        : {
            ...segment,
            a: planLinePointDistanceMm(segment.a, moving.a) <= 3 ? { ...nextA } : planLinePointDistanceMm(segment.a, moving.b) <= 3 ? { ...nextB } : { ...segment.a },
            b: planLinePointDistanceMm(segment.b, moving.a) <= 3 ? { ...nextA } : planLinePointDistanceMm(segment.b, moving.b) <= 3 ? { ...nextB } : { ...segment.b }
          }
    );
  }

  const denominator = rdx * mdz - rdz * mdx;
  if (Math.abs(denominator) < 1e-6) return clonePlanLineSegments(segments);
  const qp = { x: moving.a.x - reference.a.x, z: moving.a.z - reference.a.z };
  const t = (qp.x * mdz - qp.z * mdx) / denominator;
  const intersection = { x: Math.round(reference.a.x + t * rdx), z: Math.round(reference.a.z + t * rdz) };
  const replaceEndpoint = planLinePointDistanceMm(moving.a, intersection) <= planLinePointDistanceMm(moving.b, intersection) ? moving.a : moving.b;
  return clonePlanLineSegments(segments).map((segment, index) =>
    index === movingIndex
      ? {
          ...segment,
          a: planLinePointDistanceMm(segment.a, replaceEndpoint) <= 3 ? { ...intersection } : { ...segment.a },
          b: planLinePointDistanceMm(segment.b, replaceEndpoint) <= 3 ? { ...intersection } : { ...segment.b }
        }
      : {
          ...segment,
          a: planLinePointDistanceMm(segment.a, replaceEndpoint) <= 3 ? { ...intersection } : { ...segment.a },
          b: planLinePointDistanceMm(segment.b, replaceEndpoint) <= 3 ? { ...intersection } : { ...segment.b }
        }
  );
}

export function offsetPlanLinePath(points: PlanLinePoint[], offsetMm: number, direction = 1, closed = false) {
  const offset = Number.isFinite(offsetMm) ? offsetMm * (direction >= 0 ? 1 : -1) : 0;
  if (Math.abs(offset) < 0.5 || points.length < 2) return points.map((point) => ({ ...point }));
  return points.map((point, index) => {
    const prev = points[closed ? (index - 1 + points.length) % points.length : Math.max(0, index - 1)]!;
    const next = points[closed ? (index + 1) % points.length : Math.min(points.length - 1, index + 1)]!;
    let dx = next.x - prev.x;
    let dz = next.z - prev.z;
    const len = Math.hypot(dx, dz);
    if (len < 1) {
      dx = index > 0 ? point.x - points[index - 1]!.x : points[index + 1]!.x - point.x;
      dz = index > 0 ? point.z - points[index - 1]!.z : points[index + 1]!.z - point.z;
    }
    const safeLen = Math.max(1, Math.hypot(dx, dz));
    return {
      x: Math.round(point.x + (-dz / safeLen) * offset),
      z: Math.round(point.z + (dx / safeLen) * offset)
    };
  });
}
