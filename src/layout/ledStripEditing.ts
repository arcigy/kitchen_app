import type { LedStripGroup, LedStripPointMm, LedStripRun } from "./ledStripTypes";
import { cloneLedStripGroup } from "./ledStripTypes";

export type LedStripSegmentRef = { runId: string; segmentIndex: number };
export type LedStripPointRef = { runId: string; pointIndex: number };

function requireRun(group: LedStripGroup, runId: string): LedStripRun {
  const run = group.runs.find((item) => item.id === runId);
  if (!run) throw new Error(`LED strip group ${group.id} has no run ${runId}.`);
  return run;
}

function requirePointIndex(run: LedStripRun, index: number): void {
  if (!Number.isInteger(index) || index < 0 || index >= run.points.length) throw new Error(`LED strip point ${index} is outside run ${run.id}.`);
}

function clonePoint(point: LedStripPointMm): LedStripPointMm { return { ...point }; }

export function moveLedStripPoint(group: LedStripGroup, ref: LedStripPointRef, next: LedStripPointMm): LedStripGroup {
  const result = cloneLedStripGroup(group);
  const run = requireRun(result, ref.runId);
  requirePointIndex(run, ref.pointIndex);
  if (![next.x, next.y, next.z].every(Number.isFinite)) throw new Error("LED strip point must be finite.");
  run.points[ref.pointIndex] = clonePoint(next);
  return result;
}

export function moveLedStripSegment(group: LedStripGroup, ref: LedStripSegmentRef, delta: LedStripPointMm): LedStripGroup {
  const result = cloneLedStripGroup(group);
  const run = requireRun(result, ref.runId);
  requirePointIndex(run, ref.segmentIndex);
  requirePointIndex(run, ref.segmentIndex + 1);
  if (![delta.x, delta.y, delta.z].every(Number.isFinite)) throw new Error("LED strip movement must be finite.");
  for (const index of [ref.segmentIndex, ref.segmentIndex + 1]) {
    const point = run.points[index]!;
    run.points[index] = { x: point.x + delta.x, y: point.y + delta.y, z: point.z + delta.z };
  }
  return result;
}

/**
 * Removing an end segment shortens its run. Removing a middle segment produces
 * two connected groups, preserving the no-disconnected-custom-group invariant.
 */
export function deleteLedStripSegment(group: LedStripGroup, ref: LedStripSegmentRef): LedStripGroup[] {
  const source = cloneLedStripGroup(group);
  const run = requireRun(source, ref.runId);
  requirePointIndex(run, ref.segmentIndex);
  requirePointIndex(run, ref.segmentIndex + 1);

  if (run.points.length === 2) return [];
  if (ref.segmentIndex === 0) {
    run.points.splice(0, 1);
    return [source];
  }
  if (ref.segmentIndex === run.points.length - 2) {
    run.points.splice(run.points.length - 1, 1);
    return [source];
  }

  const leftRun: LedStripRun = { id: `${run.id}-a`, points: run.points.slice(0, ref.segmentIndex + 1).map(clonePoint) };
  const rightRun: LedStripRun = { id: `${run.id}-b`, points: run.points.slice(ref.segmentIndex + 1).map(clonePoint) };
  const left: LedStripGroup = { ...cloneLedStripGroup(source), id: `${source.id}-a`, params: { ...source.params, name: `${source.params.name} A` }, runs: [{ ...leftRun }] };
  const right: LedStripGroup = { ...cloneLedStripGroup(source), id: `${source.id}-b`, params: { ...source.params, name: `${source.params.name} B` }, runs: [{ ...rightRun }] };
  return [left, right];
}

type Vec2 = { x: number; z: number };
const cross = (a: Vec2, b: Vec2) => a.x * b.z - a.z * b.x;
const subtract = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x - b.x, z: a.z - b.z });
const add = (a: Vec2, b: Vec2): Vec2 => ({ x: a.x + b.x, z: a.z + b.z });
const scale = (a: Vec2, value: number): Vec2 => ({ x: a.x * value, z: a.z * value });
const normalized = (a: Vec2): Vec2 | null => {
  const length = Math.hypot(a.x, a.z);
  return length > 1e-8 ? scale(a, 1 / length) : null;
};

/** Offset an XZ centreline using true intersections; overly long miters fall back to bevel points. */
export function offsetLedStripPolyline(points: readonly LedStripPointMm[], offsetMm: number, miterLimit = 4): LedStripPointMm[] {
  if (points.length < 2 || !Number.isFinite(offsetMm)) return points.map(clonePoint);
  const segments = points.slice(1).map((point, index) => {
    const a = points[index]!;
    const direction = normalized({ x: point.x - a.x, z: point.z - a.z });
    if (!direction) throw new Error("LED strip cannot offset a zero-length segment.");
    return { direction, normal: { x: -direction.z, z: direction.x } };
  });
  const result: LedStripPointMm[] = [];
  const offsetPoint = (point: LedStripPointMm, normal: Vec2): LedStripPointMm => ({ x: point.x + normal.x * offsetMm, y: point.y, z: point.z + normal.z * offsetMm });
  result.push(offsetPoint(points[0]!, segments[0]!.normal));
  for (let index = 1; index < points.length - 1; index += 1) {
    const point = points[index]!;
    const previous = segments[index - 1]!;
    const next = segments[index]!;
    const a = offsetPoint(point, previous.normal);
    const b = offsetPoint(point, next.normal);
    const denominator = cross(previous.direction, next.direction);
    if (Math.abs(denominator) < 1e-8) {
      result.push(a);
      continue;
    }
    const delta = subtract({ x: b.x, z: b.z }, { x: a.x, z: a.z });
    const t = cross(delta, next.direction) / denominator;
    const intersection = add({ x: a.x, z: a.z }, scale(previous.direction, t));
    const miterLength = Math.hypot(intersection.x - point.x, intersection.z - point.z);
    if (miterLength > Math.max(Math.abs(offsetMm) * miterLimit, 1)) {
      result.push(a, b);
    } else {
      result.push({ x: intersection.x, y: point.y, z: intersection.z });
    }
  }
  result.push(offsetPoint(points[points.length - 1]!, segments[segments.length - 1]!.normal));
  return result;
}
