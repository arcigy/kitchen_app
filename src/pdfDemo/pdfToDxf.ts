import type { PdfVectorExtractionResult, PdfVectorObject } from "./pdfVectorExtractor";
import type { Point2 } from "./geometryUtils";

export interface PdfToDxfOptions {
  drawingScale: number;
}

const DEFAULT_OPTIONS: PdfToDxfOptions = {
  drawingScale: 25.4 / 72 * 50
};

export function convertPdfVectorsToDxf(
  extraction: PdfVectorExtractionResult,
  options: PdfToDxfOptions = DEFAULT_OPTIONS
): string {
  const lines = [
    "0", "SECTION",
    "2", "HEADER",
    "9", "$ACADVER",
    "1", "AC1032",
    "9", "$INSUNITS",
    "70", "4",
    "9", "$LTSCALE",
    "40", "1.0",
    "0", "ENDSEC",
    "0", "SECTION",
    "2", "TABLES",
    "0", "TABLE",
    "2", "LAYER",
    "70", "3",
    ...layerRecord("PDF_Geometry", "7"),
    ...layerRecord("PDF_Text", "7"),
    ...layerRecord("PDF_Solid Fills", "9"),
    "0", "ENDTAB",
    "0", "ENDSEC",
    "0", "SECTION",
    "2", "ENTITIES"
  ];

  for (const object of dedupeObjects(extraction.objects)) {
    if (object.segments.length === 0) continue;

    if (isFilledShape(object)) {
      const circle = detectCircle(object);
      if (circle && object.paintOperation === "stroke") {
        appendCircle(lines, object, circle, options.drawingScale, extraction.height);
      } else {
        appendHatch(lines, object, options.drawingScale, extraction.height);
      }
      continue;
    }

    const circle = detectCircle(object);
    if (circle) {
      appendCircle(lines, object, circle, options.drawingScale, extraction.height);
      continue;
    }

    const arc = detectArc(object);
    if (arc) {
      appendArc(lines, object, arc, options.drawingScale, extraction.height);
      continue;
    }

    if (hasCurveCommands(object)) {
      appendSpline(lines, object, options.drawingScale, extraction.height);
      continue;
    }

    if (object.kind === "line" && object.segments.length === 1) {
      appendLine(lines, object, options.drawingScale, extraction.height);
      continue;
    }

    if (object.kind === "polyline" || object.kind === "path" || object.kind === "rectangle") {
      appendPolyline(lines, object, options.drawingScale, extraction.height);
    }
  }

  for (const text of extraction.texts ?? []) {
    appendMText(lines, text.value, text.x, text.y, Math.max(1.5, text.fontSize), options.drawingScale, extraction.height);
  }

  lines.push("0", "ENDSEC", "0", "EOF");
  return `${lines.join("\n")}\n`;
}

function appendCircle(
  lines: string[],
  object: PdfVectorObject,
  circle: { centerX: number; centerY: number; radius: number },
  scale: number,
  pageHeight: number
): void {
  lines.push(
    "0", "CIRCLE",
    "100", "AcDbEntity",
    "8", getLayer(object),
    "62", getDxfColor(object),
    "370", String(getDxfLineweight(object)),
    "100", "AcDbCircle",
    "10", String(circle.centerX * scale),
    "20", String(toDxfY(circle.centerY, pageHeight, scale)),
    "30", "0",
    "40", String(circle.radius * scale)
  );
}

function appendArc(
  lines: string[],
  object: PdfVectorObject,
  arc: { centerX: number; centerY: number; radius: number; startAngle: number; endAngle: number },
  scale: number,
  pageHeight: number
): void {
  lines.push(
    "0", "ARC",
    "100", "AcDbEntity",
    "8", getLayer(object),
    "62", getDxfColor(object),
    "370", String(getDxfLineweight(object)),
    "100", "AcDbCircle",
    "10", String(arc.centerX * scale),
    "20", String(toDxfY(arc.centerY, pageHeight, scale)),
    "30", "0",
    "40", String(arc.radius * scale),
    "100", "AcDbArc",
    "50", String(arc.startAngle),
    "51", String(arc.endAngle)
  );
}

function appendSpline(lines: string[], object: PdfVectorObject, scale: number, pageHeight: number): void {
  const points = object.points.length > 0
    ? object.points
    : object.segments.map((segment) => segment.start);
  if (points.length < 2) return;

  lines.push(
    "0", "SPLINE",
    "100", "AcDbEntity",
    "8", getLayer(object),
    "62", getDxfColor(object),
    "370", String(getDxfLineweight(object)),
    "100", "AcDbSpline",
    "70", object.closed ? "11" : "8",
    "71", "3",
    "72", "0",
    "73", String(points.length),
    "74", "0"
  );

  for (const point of points) {
    lines.push(
      "10", String(point.x * scale),
      "20", String(toDxfY(point.y, pageHeight, scale)),
      "30", "0"
    );
  }
}

function appendMText(
  lines: string[],
  value: string,
  x: number,
  y: number,
  fontSize: number,
  scale: number,
  pageHeight: number
): void {
  lines.push(
    "0", "MTEXT",
    "100", "AcDbEntity",
    "8", "PDF_Text",
    "62", "7",
    "100", "AcDbMText",
    "10", String(x * scale),
    "20", String(toDxfY(y, pageHeight, scale)),
    "30", "0",
    "40", String(fontSize * scale),
    "41", "0",
    "71", "1",
    "72", "5",
    "1", escapeDxfText(value)
  );
}

function escapeDxfText(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("{", "\\{").replaceAll("}", "\\}");
}

function dedupeObjects(objects: PdfVectorObject[]): PdfVectorObject[] {
  const seen = new Set<string>();
  const result: PdfVectorObject[] = [];

  for (const object of objects) {
    const key = getObjectKey(object);
    if (seen.has(key)) continue;

    seen.add(key);
    result.push(object);
  }

  return result;
}

function getObjectKey(object: PdfVectorObject): string {
  const points = object.points.length > 0
    ? object.points
    : object.segments.flatMap((segment) => [segment.start, segment.end]);
  return [
    object.kind,
    getDxfLineweight(object),
    object.paintOperation,
    points.map((point) => `${Math.round(point.x * 10) / 10},${Math.round(point.y * 10) / 10}`).join(";")
  ].join("|");
}

function layerRecord(name: string, color: string): string[] {
  return [
    "0", "LAYER",
    "100", "AcDbSymbolTableRecord",
    "100", "AcDbLayerTableRecord",
    "2", name,
    "70", "0",
    "62", color,
    "6", "Continuous"
  ];
}

function appendLine(lines: string[], object: PdfVectorObject, scale: number, pageHeight: number): void {
  const segment = object.segments[0];
  lines.push(
    "0", "LINE",
    "100", "AcDbEntity",
    "8", getLayer(object),
    "62", getDxfColor(object),
    "370", String(getDxfLineweight(object)),
    "100", "AcDbLine",
    "10", String(segment.start.x * scale),
    "20", String(toDxfY(segment.start.y, pageHeight, scale)),
    "30", "0",
    "11", String(segment.end.x * scale),
    "21", String(toDxfY(segment.end.y, pageHeight, scale)),
    "31", "0"
  );
}

function appendPolyline(lines: string[], object: PdfVectorObject, scale: number, pageHeight: number): void {
  const points = object.points.length > 0
    ? object.points
    : object.segments.map((segment) => segment.start);
  if (points.length < 2) return;

  lines.push(
    "0", "LWPOLYLINE",
    "100", "AcDbEntity",
    "8", getLayer(object),
    "62", getDxfColor(object),
    "370", String(getDxfLineweight(object)),
    "100", "AcDbPolyline",
    "90", String(points.length),
    "70", object.closed ? "1" : "0"
  );

  for (const point of points) {
    lines.push(
      "10", String(point.x * scale),
      "20", String(toDxfY(point.y, pageHeight, scale))
    );
  }
}

function toDxfY(pdfY: number, pageHeight: number, scale: number): number {
  return (pageHeight - pdfY) * scale;
}

function normalizeClosedPoints(points: PdfVectorObject["points"]): PdfVectorObject["points"] {
  if (points.length < 2) return points;
  const last = points[points.length - 1];
  const first = points[0];
  if (Math.abs(first.x - last.x) < 0.001 && Math.abs(first.y - last.y) < 0.001) {
    return points.slice(0, -1);
  }
  return points;
}

function appendHatch(lines: string[], object: PdfVectorObject, scale: number, pageHeight: number): void {
  const points = object.points.length > 0
    ? object.points
    : object.segments.map((segment) => segment.start);
  const boundary = normalizeClosedPoints(points);
  if (boundary.length < 3) return;

  lines.push(
    "0", "HATCH",
    "100", "AcDbEntity",
    "8", "PDF_Solid Fills",
    "62", getDxfColor(object),
    "100", "AcDbHatch",
    "10", "0",
    "20", "0",
    "30", "0",
    "210", "0",
    "220", "0",
    "230", "1",
    "2", "SOLID",
    "70", "1",
    "71", "0",
    "91", "1",
    "92", "7",
    "72", "1",
    "73", "1",
    "93", String(boundary.length)
  );

  for (let index = 0; index < boundary.length; index += 1) {
    const start = boundary[index];
    const end = boundary[(index + 1) % boundary.length];
    lines.push(
      "10", String(start.x * scale),
      "20", String(toDxfY(start.y, pageHeight, scale)),
      "11", String(end.x * scale),
      "21", String(toDxfY(end.y, pageHeight, scale))
    );
  }

  lines.push(
    "97", "0",
    "75", "0",
    "76", "1",
    "98", "0"
  );
}

function isFilledShape(object: PdfVectorObject): boolean {
  if (object.paintOperation !== "fill" && object.paintOperation !== "fill_stroke") return false;
  if (!object.closed) return false;
  return object.bbox.width > 0.01 && object.bbox.height > 0.01;
}

function hasCurveCommands(object: PdfVectorObject): boolean {
  return (object.commands ?? []).some((command) => command.type === "curve");
}

function detectCircle(object: PdfVectorObject): { centerX: number; centerY: number; radius: number } | null {
  const curveCount = (object.commands ?? []).filter((command) => command.type === "curve").length;
  if (curveCount !== 4) return null;
  const width = object.bbox.width;
  const height = object.bbox.height;
  if (width <= 0 || height <= 0) return null;
  if (Math.abs(width - height) > Math.max(width, height) * 0.08) return null;

  const radius = (width + height) / 4;
  return {
    centerX: object.bbox.x + width / 2,
    centerY: object.bbox.y + height / 2,
    radius
  };
}

function detectArc(
  object: PdfVectorObject
): { centerX: number; centerY: number; radius: number; startAngle: number; endAngle: number } | null {
  const curves = (object.commands ?? []).filter((command) => command.type === "curve");
  if (curves.length !== 1) return null;
  const curve = curves[0];
  const midpoint = cubicPoint(curve.start, curve.control1, curve.control2, curve.end, 0.5);
  const circle = circleFromThreePoints(curve.start, midpoint, curve.end);
  if (!circle) return null;

  const controlRadius1 = distance(curve.control1, circle);
  const controlRadius2 = distance(curve.control2, circle);
  if (Math.abs(controlRadius1 - circle.radius) > circle.radius * 0.45) return null;
  if (Math.abs(controlRadius2 - circle.radius) > circle.radius * 0.45) return null;
  if (!isStableCircularCubic(curve, circle)) return null;
  if (isLikelyAutoCadNonArcRadius(circle.radius)) return null;

  const angles = chooseArcAngles(
    pointAngle(curve.start, circle.x, circle.y),
    pointAngle(curve.end, circle.x, circle.y),
    pointAngle(midpoint, circle.x, circle.y)
  );

  return {
    centerX: circle.x,
    centerY: circle.y,
    radius: circle.radius,
    startAngle: angles.startAngle,
    endAngle: angles.endAngle
  };
}

function isLikelyAutoCadNonArcRadius(radius: number): boolean {
  return radius >= 1000 && radius <= 2000;
}

function isStableCircularCubic(
  curve: { start: Point2; control1: Point2; control2: Point2; end: Point2 },
  circle: { x: number; y: number; radius: number }
): boolean {
  const samples = [0.125, 0.25, 0.375, 0.625, 0.75, 0.875]
    .map((step) => cubicPoint(curve.start, curve.control1, curve.control2, curve.end, step));
  const maxError = Math.max(...samples.map((point) => Math.abs(distance(point, circle) - circle.radius)));
  const chord = distance(curve.start, curve.end);
  const allowedError = Math.max(1.5, Math.min(8, chord * 0.015));
  return maxError <= allowedError;
}

function pointAngle(point: { x: number; y: number }, centerX: number, centerY: number): number {
  const angle = Math.atan2(centerY - point.y, point.x - centerX) * 180 / Math.PI;
  return angle < 0 ? angle + 360 : angle;
}

function chooseArcAngles(
  startAngle: number,
  endAngle: number,
  midpointAngle: number
): { startAngle: number; endAngle: number } {
  if (angleOnCounterClockwiseSweep(startAngle, endAngle, midpointAngle)) {
    return { startAngle, endAngle };
  }

  return { startAngle: endAngle, endAngle: startAngle };
}

function angleOnCounterClockwiseSweep(startAngle: number, endAngle: number, angle: number): boolean {
  const sweep = normalizeSweep(endAngle - startAngle);
  const offset = normalizeSweep(angle - startAngle);
  return offset >= -0.001 && offset <= sweep + 0.001;
}

function normalizeSweep(angle: number): number {
  let normalized = angle % 360;
  if (normalized < 0) normalized += 360;
  return normalized;
}

function cubicPoint(start: Point2, control1: Point2, control2: Point2, end: Point2, t: number): Point2 {
  const mt = 1 - t;
  return {
    x: mt ** 3 * start.x + 3 * mt ** 2 * t * control1.x + 3 * mt * t ** 2 * control2.x + t ** 3 * end.x,
    y: mt ** 3 * start.y + 3 * mt ** 2 * t * control1.y + 3 * mt * t ** 2 * control2.y + t ** 3 * end.y
  };
}

function circleFromThreePoints(
  first: Point2,
  second: Point2,
  third: Point2
): { x: number; y: number; radius: number } | null {
  const a = first.x * (second.y - third.y) - first.y * (second.x - third.x) +
    second.x * third.y - third.x * second.y;
  if (Math.abs(a) < 0.0001) return null;

  const firstSq = first.x * first.x + first.y * first.y;
  const secondSq = second.x * second.x + second.y * second.y;
  const thirdSq = third.x * third.x + third.y * third.y;
  const x = (
    firstSq * (second.y - third.y) +
    secondSq * (third.y - first.y) +
    thirdSq * (first.y - second.y)
  ) / (2 * a);
  const y = (
    firstSq * (third.x - second.x) +
    secondSq * (first.x - third.x) +
    thirdSq * (second.x - first.x)
  ) / (2 * a);
  return { x, y, radius: Math.hypot(first.x - x, first.y - y) };
}

function distance(point: Point2, circle: { x: number; y: number }): number {
  return Math.hypot(point.x - circle.x, point.y - circle.y);
}

function getDxfLineweight(object: PdfVectorObject): number {
  const rawStrokeWidth = object.rawStrokeWidth ?? object.strokeWidth;
  if (object.paintOperation === "fill") return 0;
  return mapPdfStrokeToAcadLineweight(rawStrokeWidth);
}

function mapPdfStrokeToAcadLineweight(rawStrokeWidth: number): number {
  if (rawStrokeWidth <= 0) return 0;
  if (rawStrokeWidth <= 1.4) return 5;
  if (rawStrokeWidth <= 2.4) return 9;
  if (rawStrokeWidth <= 3.4) return 13;
  if (rawStrokeWidth <= 4.4) return 18;
  if (rawStrokeWidth <= 8.4) return 30;
  return 40;
}

function getLayer(object: PdfVectorObject): string {
  if (object.paintOperation === "fill") return "PDF_Solid Fills";
  return "PDF_Geometry";
}

function getDxfColor(object: PdfVectorObject): string {
  const color = object.strokeColor ?? object.fillColor;
  if (!color) return "7";

  const max = Math.max(color.r, color.g, color.b);
  if (max < 80) return "7";
  if (max < 190) return "9";
  return "8";
}
