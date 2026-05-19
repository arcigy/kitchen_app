export interface Point2 {
  x: number;
  y: number;
}

export interface BBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Segment2 {
  start: Point2;
  end: Point2;
}

export type Orientation = "horizontal" | "vertical" | "diagonal";

export type Matrix2D = [number, number, number, number, number, number];

export const IDENTITY_MATRIX: Matrix2D = [1, 0, 0, 1, 0, 0];

export function multiplyMatrix(left: Matrix2D, right: Matrix2D): Matrix2D {
  const [a1, b1, c1, d1, e1, f1] = left;
  const [a2, b2, c2, d2, e2, f2] = right;

  return [
    a1 * a2 + c1 * b2,
    b1 * a2 + d1 * b2,
    a1 * c2 + c1 * d2,
    b1 * c2 + d1 * d2,
    a1 * e2 + c1 * f2 + e1,
    b1 * e2 + d1 * f2 + f1
  ];
}

export function applyMatrix(point: Point2, matrix: Matrix2D): Point2 {
  const [a, b, c, d, e, f] = matrix;
  return {
    x: point.x * a + point.y * c + e,
    y: point.x * b + point.y * d + f
  };
}

export function matrixScale(matrix: Matrix2D): number {
  const [a, b, c, d] = matrix;
  const scaleX = Math.hypot(a, b);
  const scaleY = Math.hypot(c, d);
  return (scaleX + scaleY) / 2;
}

export function normalizePdfPoint(point: Point2, pageHeight: number): Point2 {
  return {
    x: round(point.x, 3),
    y: round(pageHeight - point.y, 3)
  };
}

export function bboxFromPoints(points: Point2[]): BBox {
  if (points.length === 0) return { x: 0, y: 0, width: 0, height: 0 };

  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);

  return {
    x: round(minX, 3),
    y: round(minY, 3),
    width: round(maxX - minX, 3),
    height: round(maxY - minY, 3)
  };
}

export function bboxFromSegments(segments: Segment2[], strokeWidth = 0): BBox {
  const padding = strokeWidth / 2;
  const points = segments.flatMap((segment) => [segment.start, segment.end]);
  const bbox = bboxFromPoints(points);

  return {
    x: round(bbox.x - padding, 3),
    y: round(bbox.y - padding, 3),
    width: round(bbox.width + padding * 2, 3),
    height: round(bbox.height + padding * 2, 3)
  };
}

export function segmentLength(segment: Segment2): number {
  return Math.hypot(segment.end.x - segment.start.x, segment.end.y - segment.start.y);
}

export function bboxCenter(bbox: BBox): Point2 {
  return {
    x: round(bbox.x + bbox.width / 2, 3),
    y: round(bbox.y + bbox.height / 2, 3)
  };
}

export function getOrientation(segment: Segment2, angleToleranceDeg: number): Orientation {
  const dx = segment.end.x - segment.start.x;
  const dy = segment.end.y - segment.start.y;
  const angle = Math.abs(Math.atan2(dy, dx) * 180 / Math.PI);
  const normalized = angle > 90 ? 180 - angle : angle;

  if (normalized <= angleToleranceDeg) return "horizontal";
  if (Math.abs(90 - normalized) <= angleToleranceDeg) return "vertical";
  return "diagonal";
}

export function bboxOrientation(bbox: BBox): Exclude<Orientation, "diagonal"> {
  if (bbox.width >= bbox.height) return "horizontal";
  return "vertical";
}

export function mergeColinearSegments(
  segments: Segment2[],
  orientation: Exclude<Orientation, "diagonal">,
  axisTolerance: number,
  gapTolerance: number
): Segment2[] {
  const buckets = new Map<number, Segment2[]>();

  for (const segment of segments) {
    const axis = orientation === "horizontal"
      ? (segment.start.y + segment.end.y) / 2
      : (segment.start.x + segment.end.x) / 2;
    const bucketKey = Math.round(axis / axisTolerance);
    const bucket = buckets.get(bucketKey) ?? [];
    bucket.push(segment);
    buckets.set(bucketKey, bucket);
  }

  const merged: Segment2[] = [];
  for (const bucket of buckets.values()) {
    const intervals = bucket
      .map((segment) => {
        const axis = orientation === "horizontal"
          ? (segment.start.y + segment.end.y) / 2
          : (segment.start.x + segment.end.x) / 2;
        const from = orientation === "horizontal"
          ? Math.min(segment.start.x, segment.end.x)
          : Math.min(segment.start.y, segment.end.y);
        const to = orientation === "horizontal"
          ? Math.max(segment.start.x, segment.end.x)
          : Math.max(segment.start.y, segment.end.y);
        return { axis, from, to };
      })
      .sort((left, right) => left.from - right.from);

    let current = intervals[0];
    if (!current) continue;

    for (const interval of intervals.slice(1)) {
      if (interval.from <= current.to + gapTolerance) {
        current = {
          axis: (current.axis + interval.axis) / 2,
          from: current.from,
          to: Math.max(current.to, interval.to)
        };
      } else {
        merged.push(intervalToSegment(current.axis, current.from, current.to, orientation));
        current = interval;
      }
    }

    merged.push(intervalToSegment(current.axis, current.from, current.to, orientation));
  }

  return merged;
}

export function round(value: number, digits = 2): number {
  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
}

function intervalToSegment(
  axis: number,
  from: number,
  to: number,
  orientation: Exclude<Orientation, "diagonal">
): Segment2 {
  if (orientation === "horizontal") {
    return {
      start: { x: round(from, 3), y: round(axis, 3) },
      end: { x: round(to, 3), y: round(axis, 3) }
    };
  }

  return {
    start: { x: round(axis, 3), y: round(from, 3) },
    end: { x: round(axis, 3), y: round(to, 3) }
  };
}
