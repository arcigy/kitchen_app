import type { Wall } from "./wallBuilder";

export type WallValidationSeverity = "info" | "warning" | "error";

export interface WallValidationFlag {
  code:
    | "thickness_too_large"
    | "aspect_ratio_too_low"
    | "closed_polyline_too_thick"
    | "complex_closed_polyline"
    | "large_area_with_complex_shape"
    | "duplicate_suppressed";
  severity: WallValidationSeverity;
  message: string;
  values: Record<string, number | string | boolean>;
}

export function validateWall(wall: Wall): {
  validationStatus: "valid" | "suspicious";
  validationFlags: WallValidationFlag[];
} {
  const metrics = wallFootprintMetrics(wall);
  const validationFlags: WallValidationFlag[] = [];

  if (metrics.shorterSide > 60) {
    validationFlags.push({
      code: "thickness_too_large",
      severity: "error",
      message: "Wall footprint shorter side is larger than expected for a normal wall thickness.",
      values: { shorterSide: metrics.shorterSide, threshold: 60, sourceKind: wall.sourceKind }
    });
  }

  if (metrics.aspectRatio < 3) {
    validationFlags.push({
      code: "aspect_ratio_too_low",
      severity: metrics.shorterSide > 30 ? "error" : "warning",
      message: "Wall footprint is too square-like for a normal wall band.",
      values: { aspectRatio: metrics.aspectRatio, threshold: 3, sourceKind: wall.sourceKind }
    });
  }

  if (wall.sourceKind === "closed_polyline" && metrics.shorterSide > 55) {
    validationFlags.push({
      code: "closed_polyline_too_thick",
      severity: "warning",
      message: "Closed polyline wall footprint is thicker than expected.",
      values: { shorterSide: metrics.shorterSide, threshold: 55 }
    });
  }

  if (wall.sourceKind === "closed_polyline" && metrics.pointCount > 8) {
    validationFlags.push({
      code: "complex_closed_polyline",
      severity: "warning",
      message: "Closed polyline wall footprint has many points and may wrap multiple wall parts.",
      values: { pointCount: metrics.pointCount, threshold: 8 }
    });
  }

  if (wall.sourceKind === "closed_polyline" && metrics.pointCount > 8 && metrics.area > 5000) {
    validationFlags.push({
      code: "large_area_with_complex_shape",
      severity: "error",
      message: "Closed polyline wall footprint is both complex and large, likely a false positive.",
      values: { pointCount: metrics.pointCount, area: metrics.area, pointThreshold: 8, areaThreshold: 5000 }
    });
  }

  return {
    validationStatus: validationFlags.some((flag) => flag.severity === "error") ? "suspicious" : "valid",
    validationFlags
  };
}

export function validateWalls(walls: Wall[]): Wall[] {
  return walls.map((wall) => ({
    ...wall,
    ...validateWall(wall)
  }));
}

function wallFootprintMetrics(wall: Wall): {
  area: number;
  aspectRatio: number;
  pointCount: number;
  shorterSide: number;
} {
  const xs = wall.footprint.map((point) => point.x);
  const ys = wall.footprint.map((point) => point.y);
  const width = Math.max(...xs) - Math.min(...xs);
  const height = Math.max(...ys) - Math.min(...ys);
  const shorterSide = Math.min(width, height);
  const longerSide = Math.max(width, height);
  return {
    area: round(polygonArea(wall.footprint)),
    aspectRatio: shorterSide <= 0 ? 0 : round(longerSide / shorterSide),
    pointCount: wall.footprint.length,
    shorterSide: round(shorterSide)
  };
}

function polygonArea(points: Array<{ x: number; y: number }>): number {
  let sum = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    sum += current.x * next.y - next.x * current.y;
  }
  return Math.abs(sum / 2);
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
