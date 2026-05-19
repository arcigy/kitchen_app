import type { WallAreaPolygon } from "./wallAreaDetection";

export interface WallHatchRectangle {
  id: string;
  sourceWallAreaId: string;
  thicknessAxis: "x" | "y" | "both" | "unknown";
  thicknessDrawingUnits: number | null;
  thicknessMm?: number | null;
  lengthDrawingUnits: number | null;
  lengthMm?: number | null;
  bounds: {
    xMin: number;
    yMin: number;
    xMax: number;
    yMax: number;
  };
  points: Array<{ x: number; y: number }>;
  area: number;
  confidence: number;
  reasons: string[];
}

export interface WallHatchRectangulationResult {
  rectangles: WallHatchRectangle[];
  warnings: string[];
}

interface Cell {
  xIndex: number;
  yIndex: number;
}

export function rectangulateWallHatches(input: {
  wallAreaPolygons: WallAreaPolygon[];
  coordinateTolerance?: number;
  minRectangleArea?: number;
  edgeAlignmentTolerance?: number;
  gridSizeDrawingUnits?: number;
  coordinateGridSizeDrawingUnits?: number;
  wallThicknessGridSizeDrawingUnits?: number;
  scaleFactor?: number | null;
}): WallHatchRectangulationResult {
  const coordinateTolerance = input.coordinateTolerance ?? 2.5;
  const minRectangleArea = input.minRectangleArea ?? 1;
  const edgeAlignmentTolerance = input.edgeAlignmentTolerance ?? 0;
  const coordinateGridSizeDrawingUnits = input.coordinateGridSizeDrawingUnits ?? input.gridSizeDrawingUnits ?? 0;
  const wallThicknessGridSizeDrawingUnits = input.wallThicknessGridSizeDrawingUnits ?? 0;
  const scaleFactor = input.scaleFactor ?? null;
  const rectangles: WallHatchRectangle[] = [];
  const warnings: string[] = [];

  for (const polygon of input.wallAreaPolygons) {
    const result = rectangulateSingleWallHatch(polygon, coordinateTolerance, minRectangleArea);
    rectangles.push(...result.rectangles);
    warnings.push(...result.warnings);
  }

  const alignedRectangles = edgeAlignmentTolerance > 0
    ? alignCloseRectangleEdges(rectangles, edgeAlignmentTolerance)
    : rectangles;
  const snappedRectangles = coordinateGridSizeDrawingUnits > 0
    ? snapRectanglesToGrid(alignedRectangles, coordinateGridSizeDrawingUnits)
    : alignedRectangles;
  const thicknessNormalizedRectangles = wallThicknessGridSizeDrawingUnits > 0
    ? normalizeWallRectangleThicknesses(snappedRectangles, wallThicknessGridSizeDrawingUnits, coordinateGridSizeDrawingUnits)
    : snappedRectangles;
  const overlapTrimmedRectangles = coordinateGridSizeDrawingUnits > 0
    ? trimTinyRectangleOverlaps(thicknessNormalizedRectangles, coordinateGridSizeDrawingUnits)
    : thicknessNormalizedRectangles;
  const finalRectangles = overlapTrimmedRectangles
    .filter((rectangle) => rectangle.area >= minRectangleArea)
    .map((rectangle, index) => enrichRectangleMetrics({
      ...rectangle,
      id: `wall_rect_${index + 1}`
    }, scaleFactor));

  const overlapCount = countOverlappingRectangles(finalRectangles);
  if (overlapCount > 0) warnings.push(`rectangulation has ${overlapCount} overlapping rectangle pairs`);

  return { rectangles: finalRectangles, warnings };
}

function rectangulateSingleWallHatch(
  polygon: WallAreaPolygon,
  coordinateTolerance: number,
  minRectangleArea: number
): WallHatchRectangulationResult {
  const xs = uniqueSortedCoordinates(polygon.points.map((point) => point.x), coordinateTolerance);
  const ys = uniqueSortedCoordinates(polygon.points.map((point) => point.y), coordinateTolerance);
  const warnings: string[] = [];

  if (xs.length < 2 || ys.length < 2) {
    return {
      rectangles: [],
      warnings: [`${polygon.id}: not enough coordinates for rectangulation`]
    };
  }

  const cells: Cell[] = [];
  for (let yIndex = 0; yIndex < ys.length - 1; yIndex += 1) {
    for (let xIndex = 0; xIndex < xs.length - 1; xIndex += 1) {
      const xMin = xs[xIndex];
      const xMax = xs[xIndex + 1];
      const yMin = ys[yIndex];
      const yMax = ys[yIndex + 1];
      if ((xMax - xMin) * (yMax - yMin) < minRectangleArea) continue;
      const center = {
        x: (xMin + xMax) / 2,
        y: (yMin + yMax) / 2
      };
      if (isPointInsidePolygon(center, polygon.points)) cells.push({ xIndex, yIndex });
    }
  }

  const consumed = new Set<string>();
  const cellSet = new Set(cells.map(cellKey));
  const rectangles: WallHatchRectangle[] = [];

  for (const cell of cells) {
    if (consumed.has(cellKey(cell))) continue;
    const rect = growLargestRectangle(cell, cellSet, consumed, xs, ys);
    if (!rect) continue;
    for (let yIndex = rect.yStart; yIndex < rect.yEnd; yIndex += 1) {
      for (let xIndex = rect.xStart; xIndex < rect.xEnd; xIndex += 1) {
        consumed.add(cellKey({ xIndex, yIndex }));
      }
    }

    const bounds = {
      xMin: xs[rect.xStart],
      yMin: ys[rect.yStart],
      xMax: xs[rect.xEnd],
      yMax: ys[rect.yEnd]
    };
    const area = (bounds.xMax - bounds.xMin) * (bounds.yMax - bounds.yMin);
    if (area < minRectangleArea) continue;

    rectangles.push({
      id: "",
      sourceWallAreaId: polygon.id,
      thicknessAxis: "unknown",
      thicknessDrawingUnits: null,
      lengthDrawingUnits: null,
      bounds: {
        xMin: round(bounds.xMin),
        yMin: round(bounds.yMin),
        xMax: round(bounds.xMax),
        yMax: round(bounds.yMax)
      },
      points: [
        { x: round(bounds.xMin), y: round(bounds.yMin) },
        { x: round(bounds.xMax), y: round(bounds.yMin) },
        { x: round(bounds.xMax), y: round(bounds.yMax) },
        { x: round(bounds.xMin), y: round(bounds.yMax) }
      ],
      area: round(area),
      confidence: polygon.confidence,
      reasons: [
        `rectangulated from ${polygon.id}`,
        "source geometry is a detected wall hatch"
      ]
    });
  }

  const coveredArea = rectangles.reduce((sum, rectangle) => sum + rectangle.area, 0);
  const areaDelta = Math.abs(coveredArea - polygon.area);
  if (areaDelta > Math.max(5, polygon.area * 0.08)) {
    warnings.push(`${polygon.id}: rectangle area differs from hatch area by ${round(areaDelta)}`);
  }

  return { rectangles, warnings };
}

function growLargestRectangle(
  start: Cell,
  cellSet: Set<string>,
  consumed: Set<string>,
  xs: number[],
  ys: number[]
): { xStart: number; xEnd: number; yStart: number; yEnd: number } | null {
  let best: { xStart: number; xEnd: number; yStart: number; yEnd: number; area: number } | null = null;
  let width = 0;

  while (cellSet.has(cellKey({ xIndex: start.xIndex + width, yIndex: start.yIndex }))
    && !consumed.has(cellKey({ xIndex: start.xIndex + width, yIndex: start.yIndex }))) {
    width += 1;
  }

  for (let candidateWidth = width; candidateWidth >= 1; candidateWidth -= 1) {
    let height = 0;
    while (rectangleCellsAvailable(start.xIndex, start.yIndex, candidateWidth, height + 1, cellSet, consumed)) {
      height += 1;
    }
    if (height <= 0) continue;
    const area = (xs[start.xIndex + candidateWidth] - xs[start.xIndex]) * (ys[start.yIndex + height] - ys[start.yIndex]);
    if (!best || area > best.area) {
      best = {
        xStart: start.xIndex,
        xEnd: start.xIndex + candidateWidth,
        yStart: start.yIndex,
        yEnd: start.yIndex + height,
        area
      };
    }
  }

  return best;
}

function rectangleCellsAvailable(
  xStart: number,
  yStart: number,
  width: number,
  height: number,
  cellSet: Set<string>,
  consumed: Set<string>
): boolean {
  for (let yIndex = yStart; yIndex < yStart + height; yIndex += 1) {
    for (let xIndex = xStart; xIndex < xStart + width; xIndex += 1) {
      const key = cellKey({ xIndex, yIndex });
      if (!cellSet.has(key) || consumed.has(key)) return false;
    }
  }
  return true;
}

function uniqueSortedCoordinates(values: number[], tolerance: number): number[] {
  const sorted = [...values].sort((left, right) => left - right);
  const result: number[] = [];
  for (const value of sorted) {
    const last = result[result.length - 1];
    if (last === undefined || Math.abs(value - last) > tolerance) {
      result.push(value);
    } else {
      result[result.length - 1] = (last + value) / 2;
    }
  }
  return result.map(round);
}

function alignCloseRectangleEdges(rectangles: WallHatchRectangle[], tolerance: number): WallHatchRectangle[] {
  const xClusters = buildCoordinateClusters(rectangles.flatMap((rectangle) => [rectangle.bounds.xMin, rectangle.bounds.xMax]), tolerance);
  const yClusters = buildCoordinateClusters(rectangles.flatMap((rectangle) => [rectangle.bounds.yMin, rectangle.bounds.yMax]), tolerance);

  return rectangles.map((rectangle) => updateRectangleBounds(rectangle, {
    xMin: snapToCluster(rectangle.bounds.xMin, xClusters),
    yMin: snapToCluster(rectangle.bounds.yMin, yClusters),
    xMax: snapToCluster(rectangle.bounds.xMax, xClusters),
    yMax: snapToCluster(rectangle.bounds.yMax, yClusters)
  }));
}

function snapRectanglesToGrid(rectangles: WallHatchRectangle[], gridSize: number): WallHatchRectangle[] {
  return rectangles.map((rectangle) => updateRectangleBounds(rectangle, {
    xMin: snapToGrid(rectangle.bounds.xMin, gridSize),
    yMin: snapToGrid(rectangle.bounds.yMin, gridSize),
    xMax: snapToGrid(rectangle.bounds.xMax, gridSize),
    yMax: snapToGrid(rectangle.bounds.yMax, gridSize)
  }));
}

function normalizeWallRectangleThicknesses(
  rectangles: WallHatchRectangle[],
  thicknessGridSize: number,
  coordinateGridSize: number
): WallHatchRectangle[] {
  return rectangles.map((rectangle) => {
    const width = rectangle.bounds.xMax - rectangle.bounds.xMin;
    const height = rectangle.bounds.yMax - rectangle.bounds.yMin;
    const shorterSide = Math.min(width, height);
    const longerSide = Math.max(width, height);
    const aspectRatio = shorterSide > 0 ? longerSide / shorterSide : Number.POSITIVE_INFINITY;

    if (aspectRatio < 1.4) {
      return {
        ...updateRectangleBounds(rectangle, snapBoundsSizeToGrid(rectangle.bounds, "both", thicknessGridSize, coordinateGridSize)),
        thicknessAxis: "both"
      };
    }

    const thicknessAxis = width <= height ? "x" : "y";
    return {
      ...updateRectangleBounds(rectangle, snapBoundsSizeToGrid(
      rectangle.bounds,
      thicknessAxis,
      thicknessGridSize,
      coordinateGridSize
      )),
      thicknessAxis
    };
  });
}

function trimTinyRectangleOverlaps(rectangles: WallHatchRectangle[], coordinateGridSize: number): WallHatchRectangle[] {
  let result = rectangles.map((rectangle) => ({ ...rectangle }));
  const tolerance = Math.max(0.001, coordinateGridSize * 1.25);

  for (let leftIndex = 0; leftIndex < result.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < result.length; rightIndex += 1) {
      const left = result[leftIndex];
      const right = result[rightIndex];
      const overlap = rectangleOverlap(left.bounds, right.bounds);
      if (!overlap || (overlap.width > tolerance && overlap.height > tolerance)) continue;

      if (overlap.width <= tolerance && overlap.height > 0) {
        const trimLeft = shouldTrimAxis(left, right, "x");
        const targetIndex = trimLeft ? leftIndex : rightIndex;
        const target = result[targetIndex];
        const other = trimLeft ? right : left;
        result[targetIndex] = updateRectangleBounds(target, trimBoundsAwayFrom(target.bounds, other.bounds, "x"));
      } else if (overlap.height <= tolerance && overlap.width > 0) {
        const trimLeft = shouldTrimAxis(left, right, "y");
        const targetIndex = trimLeft ? leftIndex : rightIndex;
        const target = result[targetIndex];
        const other = trimLeft ? right : left;
        result[targetIndex] = updateRectangleBounds(target, trimBoundsAwayFrom(target.bounds, other.bounds, "y"));
      }
    }
  }

  return result;
}

function rectangleOverlap(
  left: WallHatchRectangle["bounds"],
  right: WallHatchRectangle["bounds"]
): { width: number; height: number } | null {
  const width = Math.max(0, Math.min(left.xMax, right.xMax) - Math.max(left.xMin, right.xMin));
  const height = Math.max(0, Math.min(left.yMax, right.yMax) - Math.max(left.yMin, right.yMin));
  return width > 0 && height > 0 ? { width, height } : null;
}

function shouldTrimAxis(left: WallHatchRectangle, right: WallHatchRectangle, axis: "x" | "y"): boolean {
  const leftIsThickness = left.thicknessAxis === axis || left.thicknessAxis === "both";
  const rightIsThickness = right.thicknessAxis === axis || right.thicknessAxis === "both";
  if (leftIsThickness !== rightIsThickness) return !leftIsThickness;
  const leftCenter = axis === "x"
    ? (left.bounds.xMin + left.bounds.xMax) / 2
    : (left.bounds.yMin + left.bounds.yMax) / 2;
  const rightCenter = axis === "x"
    ? (right.bounds.xMin + right.bounds.xMax) / 2
    : (right.bounds.yMin + right.bounds.yMax) / 2;
  return leftCenter < rightCenter;
}

function trimBoundsAwayFrom(
  target: WallHatchRectangle["bounds"],
  other: WallHatchRectangle["bounds"],
  axis: "x" | "y"
): WallHatchRectangle["bounds"] {
  const next = { ...target };
  if (axis === "x") {
    const targetCenter = (target.xMin + target.xMax) / 2;
    const otherCenter = (other.xMin + other.xMax) / 2;
    if (targetCenter < otherCenter) next.xMax = Math.min(next.xMax, other.xMin);
    else next.xMin = Math.max(next.xMin, other.xMax);
  } else {
    const targetCenter = (target.yMin + target.yMax) / 2;
    const otherCenter = (other.yMin + other.yMax) / 2;
    if (targetCenter < otherCenter) next.yMax = Math.min(next.yMax, other.yMin);
    else next.yMin = Math.max(next.yMin, other.yMax);
  }
  return next;
}

function snapBoundsSizeToGrid(
  bounds: WallHatchRectangle["bounds"],
  axis: "x" | "y" | "both",
  thicknessGridSize: number,
  coordinateGridSize: number
): WallHatchRectangle["bounds"] {
  let next = { ...bounds };
  if (axis === "x" || axis === "both") {
    next = resizeBoundsAroundCenter(next, "x", snapLengthToGrid(next.xMax - next.xMin, thicknessGridSize));
  }
  if (axis === "y" || axis === "both") {
    next = resizeBoundsAroundCenter(next, "y", snapLengthToGrid(next.yMax - next.yMin, thicknessGridSize));
  }
  return coordinateGridSize > 0 ? {
    xMin: snapToGrid(next.xMin, coordinateGridSize),
    yMin: snapToGrid(next.yMin, coordinateGridSize),
    xMax: snapToGrid(next.xMax, coordinateGridSize),
    yMax: snapToGrid(next.yMax, coordinateGridSize)
  } : next;
}

function resizeBoundsAroundCenter(
  bounds: WallHatchRectangle["bounds"],
  axis: "x" | "y",
  size: number
): WallHatchRectangle["bounds"] {
  if (axis === "x") {
    const center = (bounds.xMin + bounds.xMax) / 2;
    return { ...bounds, xMin: center - size / 2, xMax: center + size / 2 };
  }
  const center = (bounds.yMin + bounds.yMax) / 2;
  return { ...bounds, yMin: center - size / 2, yMax: center + size / 2 };
}

function snapLengthToGrid(length: number, gridSize: number): number {
  return Math.max(gridSize, Math.round(length / gridSize) * gridSize);
}

function updateRectangleBounds(rectangle: WallHatchRectangle, nextBounds: WallHatchRectangle["bounds"]): WallHatchRectangle {
  const bounds = {
    xMin: round(Math.min(nextBounds.xMin, nextBounds.xMax)),
    yMin: round(Math.min(nextBounds.yMin, nextBounds.yMax)),
    xMax: round(Math.max(nextBounds.xMin, nextBounds.xMax)),
    yMax: round(Math.max(nextBounds.yMin, nextBounds.yMax))
  };
  const area = (bounds.xMax - bounds.xMin) * (bounds.yMax - bounds.yMin);
  return {
    ...rectangle,
    bounds,
    points: [
      { x: bounds.xMin, y: bounds.yMin },
      { x: bounds.xMax, y: bounds.yMin },
      { x: bounds.xMax, y: bounds.yMax },
      { x: bounds.xMin, y: bounds.yMax }
    ],
    area: round(area)
  };
}

function enrichRectangleMetrics(rectangle: WallHatchRectangle, scaleFactor: number | null): WallHatchRectangle {
  const width = rectangle.bounds.xMax - rectangle.bounds.xMin;
  const height = rectangle.bounds.yMax - rectangle.bounds.yMin;
  const shorterSide = Math.min(width, height);
  const longerSide = Math.max(width, height);
  const aspectRatio = shorterSide > 0 ? longerSide / shorterSide : Number.POSITIVE_INFINITY;
  const thicknessAxis = rectangle.thicknessAxis !== "unknown"
    ? rectangle.thicknessAxis
    : aspectRatio < 1.4
    ? "both"
    : width <= height ? "x" : "y";
  return {
    ...rectangle,
    thicknessAxis,
    thicknessDrawingUnits: round(thicknessAxis === "x" ? width : thicknessAxis === "y" ? height : shorterSide),
    thicknessMm: scaleFactor ? round((thicknessAxis === "x" ? width : thicknessAxis === "y" ? height : shorterSide) * scaleFactor) : null,
    lengthDrawingUnits: round(longerSide),
    lengthMm: scaleFactor ? round(longerSide * scaleFactor) : null
  };
}

function buildCoordinateClusters(values: number[], tolerance: number): Array<{ min: number; max: number; value: number }> {
  const sorted = [...values].sort((left, right) => left - right);
  const clusters: Array<{ values: number[] }> = [];

  for (const value of sorted) {
    const cluster = clusters[clusters.length - 1];
    const lastValue = cluster?.values[cluster.values.length - 1];
    if (!cluster || lastValue === undefined || Math.abs(value - lastValue) > tolerance) {
      clusters.push({ values: [value] });
    } else {
      cluster.values.push(value);
    }
  }

  return clusters.map((cluster) => {
    const min = Math.min(...cluster.values);
    const max = Math.max(...cluster.values);
    const value = cluster.values.reduce((sum, current) => sum + current, 0) / cluster.values.length;
    return { min, max, value };
  });
}

function snapToCluster(value: number, clusters: Array<{ min: number; max: number; value: number }>): number {
  const cluster = clusters.find((candidate) => value >= candidate.min && value <= candidate.max);
  return cluster ? cluster.value : value;
}

function snapToGrid(value: number, gridSize: number): number {
  return round(Math.round(value / gridSize) * gridSize);
}

function countOverlappingRectangles(rectangles: WallHatchRectangle[]): number {
  let count = 0;
  for (let leftIndex = 0; leftIndex < rectangles.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < rectangles.length; rightIndex += 1) {
      const left = rectangles[leftIndex].bounds;
      const right = rectangles[rightIndex].bounds;
      const width = Math.max(0, Math.min(left.xMax, right.xMax) - Math.max(left.xMin, right.xMin));
      const height = Math.max(0, Math.min(left.yMax, right.yMax) - Math.max(left.yMin, right.yMin));
      if (width * height > 0.001) count += 1;
    }
  }
  return count;
}

function isPointInsidePolygon(point: { x: number; y: number }, polygon: Array<{ x: number; y: number }>): boolean {
  let inside = false;
  for (let index = 0, previousIndex = polygon.length - 1; index < polygon.length; previousIndex = index, index += 1) {
    const current = polygon[index];
    const previous = polygon[previousIndex];
    const intersects = (current.y > point.y) !== (previous.y > point.y)
      && point.x < ((previous.x - current.x) * (point.y - current.y)) / (previous.y - current.y || Number.EPSILON) + current.x;
    if (intersects) inside = !inside;
  }
  return inside;
}

function cellKey(cell: Cell): string {
  return `${cell.xIndex}:${cell.yIndex}`;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
