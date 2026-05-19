import * as pdfjsLib from "pdfjs-dist";
import {
  applyMatrix,
  bboxFromSegments,
  bboxFromPoints,
  IDENTITY_MATRIX,
  matrixScale,
  multiplyMatrix,
  normalizePdfPoint,
  type BBox,
  type Matrix2D,
  type Point2,
  type Segment2
} from "./geometryUtils";

export type VectorObjectKind = "line" | "path" | "rectangle" | "polyline";
export type PaintOperation = "stroke" | "fill" | "fill_stroke";

export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

export interface PdfVectorObject {
  id: string;
  page: number;
  kind: VectorObjectKind;
  source: "vector_path";
  paintOperation: PaintOperation;
  strokeWidth: number;
  rawStrokeWidth?: number;
  fillColor: RgbColor | null;
  strokeColor: RgbColor | null;
  bbox: BBox;
  segments: Segment2[];
  points: Point2[];
  commands?: PdfPathCommand[];
  closed: boolean;
}

export type PdfPathCommand =
  | { type: "move"; point: Point2 }
  | { type: "line"; start: Point2; end: Point2 }
  | { type: "curve"; start: Point2; control1: Point2; control2: Point2; end: Point2 }
  | { type: "close" };

export interface PdfTextObject {
  value: string;
  page: number;
  x: number;
  y: number;
  fontSize: number;
}

export interface PdfVectorExtractionResult {
  page: number;
  isVectorPdf: boolean;
  width: number;
  height: number;
  backgroundDataUrl: string;
  objects: PdfVectorObject[];
  texts: PdfTextObject[];
}

interface GraphicsState {
  transform: Matrix2D;
  lineWidth: number;
  strokeColor: RgbColor | null;
  fillColor: RgbColor | null;
}

interface PathState {
  segments: Segment2[];
  points: Point2[];
  commands: PdfPathCommand[];
  closed: boolean;
  hasRectangle: boolean;
}

const OPS = pdfjsLib.OPS;

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.mjs",
  import.meta.url
).toString();

export async function extractPdfVectorObjects(file: File, pageNumber = 1): Promise<PdfVectorExtractionResult> {
  const data = await file.arrayBuffer();
  const document = await pdfjsLib.getDocument({ data }).promise;
  const page = await document.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1 });
  const operatorList = await page.getOperatorList();
  const objects: PdfVectorObject[] = [];
  const stack: GraphicsState[] = [];
  const state: GraphicsState = {
    transform: [...IDENTITY_MATRIX],
    lineWidth: 1,
    strokeColor: null,
    fillColor: null
  };
  let currentPath = createEmptyPath();

  for (let index = 0; index < operatorList.fnArray.length; index += 1) {
    const fn = operatorList.fnArray[index];
    const args = operatorList.argsArray[index];

    if (fn === OPS.save) {
      stack.push(cloneState(state));
      continue;
    }

    if (fn === OPS.restore) {
      const previous = stack.pop();
      if (previous) copyState(previous, state);
      continue;
    }

    if (fn === OPS.transform) {
      const matrix = readMatrix(args);
      if (matrix) state.transform = multiplyMatrix(state.transform, matrix);
      continue;
    }

    if (fn === OPS.setLineWidth) {
      const width = readNumberAt(args, 0);
      if (width !== null) state.lineWidth = width;
      continue;
    }

    if (fn === OPS.setStrokeRGBColor || fn === OPS.setStrokeGray || fn === OPS.setStrokeColor) {
      state.strokeColor = readColor(args);
      continue;
    }

    if (fn === OPS.setFillRGBColor || fn === OPS.setFillGray || fn === OPS.setFillColor) {
      state.fillColor = readColor(args);
      continue;
    }

    if (fn === OPS.constructPath) {
      appendConstructedPath(currentPath, args, state.transform, viewport.height);
      continue;
    }

    if (fn === OPS.rectangle) {
      appendRectanglePath(currentPath, args, state.transform, viewport.height);
      continue;
    }

    const paintOperation = getPaintOperation(fn);
    if (!paintOperation) continue;

    if (currentPath.points.length > 0 || currentPath.segments.length > 0) {
      objects.push(createVectorObject(objects.length, pageNumber, currentPath, state, paintOperation));
      currentPath = createEmptyPath();
    }
  }

  return {
    page: pageNumber,
    isVectorPdf: objects.length > 0,
    width: viewport.width,
    height: viewport.height,
    backgroundDataUrl: await renderPageBackground(page, viewport),
    objects,
    texts: await extractPageText(page, pageNumber, viewport.height)
  };
}

function appendConstructedPath(path: PathState, args: unknown, transform: Matrix2D, pageHeight: number): void {
  if (!Array.isArray(args) || !Array.isArray(args[0]) || !Array.isArray(args[1])) return;

  const operators = args[0].filter((value): value is number => typeof value === "number");
  const coordinates = args[1].filter((value): value is number => typeof value === "number");
  let cursor = 0;
  let current: Point2 | null = null;

  for (const operator of operators) {
    if (operator === OPS.moveTo) {
      current = readPoint(coordinates, cursor, transform, pageHeight);
      cursor += 2;
      if (current) {
        path.points.push(current);
        path.commands.push({ type: "move", point: current });
      }
      continue;
    }

    if (operator === OPS.lineTo) {
      const next = readPoint(coordinates, cursor, transform, pageHeight);
      cursor += 2;
      if (current && next) {
        path.segments.push({ start: current, end: next });
        path.points.push(next);
        path.commands.push({ type: "line", start: current, end: next });
      }
      current = next;
      continue;
    }

    if (operator === OPS.rectangle) {
      appendRectangleFromCoordinates(path, coordinates, cursor, transform, pageHeight);
      cursor += 4;
      current = path.points[path.points.length - 1] ?? null;
      continue;
    }

    if (operator === OPS.curveTo) {
      const control1 = readPoint(coordinates, cursor, transform, pageHeight);
      const control2 = readPoint(coordinates, cursor + 2, transform, pageHeight);
      const end = readPoint(coordinates, cursor + 4, transform, pageHeight);
      cursor += 6;
      if (current && control1 && control2 && end) {
        appendCubic(path, current, control1, control2, end);
      }
      current = end;
      continue;
    }

    if (operator === OPS.curveTo2) {
      const control = readPoint(coordinates, cursor, transform, pageHeight);
      const end = readPoint(coordinates, cursor + 2, transform, pageHeight);
      cursor += 4;
      if (current && control && end) {
        appendCubic(path, current, current, control, end);
      }
      current = end;
      continue;
    }

    if (operator === OPS.curveTo3) {
      const control = readPoint(coordinates, cursor, transform, pageHeight);
      const end = readPoint(coordinates, cursor + 2, transform, pageHeight);
      cursor += 4;
      if (current && control && end) {
        appendCubic(path, current, control, end, end);
      }
      current = end;
      continue;
    }

    if (operator === OPS.closePath) {
      path.closed = true;
      const first = path.points[0];
      if (current && first) {
        path.segments.push({ start: current, end: first });
        path.commands.push({ type: "close" });
      }
    }
  }
}

function appendCubic(path: PathState, start: Point2, control1: Point2, control2: Point2, end: Point2): void {
  let previous = start;
  for (let step = 1; step <= 12; step += 1) {
    const point = cubicPoint(start, control1, control2, end, step / 12);
    path.segments.push({ start: previous, end: point });
    previous = point;
  }
  path.points.push(end);
  path.commands.push({ type: "curve", start, control1, control2, end });
}

function cubicPoint(start: Point2, control1: Point2, control2: Point2, end: Point2, t: number): Point2 {
  const mt = 1 - t;
  return {
    x: Math.round((mt ** 3 * start.x + 3 * mt ** 2 * t * control1.x + 3 * mt * t ** 2 * control2.x + t ** 3 * end.x) * 1000) / 1000,
    y: Math.round((mt ** 3 * start.y + 3 * mt ** 2 * t * control1.y + 3 * mt * t ** 2 * control2.y + t ** 3 * end.y) * 1000) / 1000
  };
}

function appendRectanglePath(path: PathState, args: unknown, transform: Matrix2D, pageHeight: number): void {
  if (!Array.isArray(args)) return;

  const coordinates = args.filter((value): value is number => typeof value === "number");
  appendRectangleFromCoordinates(path, coordinates, 0, transform, pageHeight);
}

function appendRectangleFromCoordinates(
  path: PathState,
  coordinates: number[],
  cursor: number,
  transform: Matrix2D,
  pageHeight: number
): void {
  const x = coordinates[cursor];
  const y = coordinates[cursor + 1];
  const width = coordinates[cursor + 2];
  const height = coordinates[cursor + 3];
  if (![x, y, width, height].every((value) => typeof value === "number")) return;

  const points = [
    readPoint([x, y], 0, transform, pageHeight),
    readPoint([x + width, y], 0, transform, pageHeight),
    readPoint([x + width, y + height], 0, transform, pageHeight),
    readPoint([x, y + height], 0, transform, pageHeight)
  ].filter((point): point is Point2 => point !== null);

  for (let index = 0; index < points.length; index += 1) {
    const start = points[index];
    const end = points[(index + 1) % points.length];
    path.segments.push({ start, end });
    path.points.push(start);
    if (index === 0) path.commands.push({ type: "move", point: start });
    path.commands.push({ type: "line", start, end });
  }

  path.closed = true;
  path.hasRectangle = true;
}

function createVectorObject(
  index: number,
  page: number,
  path: PathState,
  state: GraphicsState,
  paintOperation: PaintOperation
): PdfVectorObject {
  const strokeWidth = state.lineWidth * matrixScale(state.transform);
  const bbox = path.segments.length > 0
    ? bboxFromSegments(path.segments, paintOperation === "fill" ? 0 : strokeWidth)
    : bboxFromPoints(path.points);

  return {
    id: `vec_${String(index + 1).padStart(5, "0")}`,
    page,
    kind: getPathKind(path),
    source: "vector_path",
    paintOperation,
    strokeWidth,
    rawStrokeWidth: state.lineWidth,
    fillColor: state.fillColor,
    strokeColor: state.strokeColor,
    bbox,
    segments: path.segments,
    points: path.points,
    commands: path.commands,
    closed: path.closed
  };
}

function getPathKind(path: PathState): VectorObjectKind {
  if (path.hasRectangle) return "rectangle";
  if (path.segments.length === 1) return "line";
  if (path.closed) return "path";
  return "polyline";
}

function getPaintOperation(fn: number): PaintOperation | null {
  if (fn === OPS.stroke || fn === OPS.closeStroke) return "stroke";
  if (fn === OPS.fill || fn === OPS.eoFill || fn === OPS.closeFillStroke || fn === OPS.closeEOFillStroke) {
    return fn === OPS.closeFillStroke || fn === OPS.closeEOFillStroke ? "fill_stroke" : "fill";
  }
  if (fn === OPS.fillStroke || fn === OPS.eoFillStroke) return "fill_stroke";
  if (fn === OPS.endPath) return null;
  return null;
}

function readPoint(coordinates: number[], cursor: number, transform: Matrix2D, pageHeight: number): Point2 | null {
  const x = coordinates[cursor];
  const y = coordinates[cursor + 1];
  if (typeof x !== "number" || typeof y !== "number") return null;

  return normalizePdfPoint(applyMatrix({ x, y }, transform), pageHeight);
}

function readMatrix(args: unknown): Matrix2D | null {
  if (!Array.isArray(args) || args.length < 6) return null;

  const values = args.slice(0, 6);
  if (!values.every((value) => typeof value === "number")) return null;
  return values as Matrix2D;
}

function readNumberAt(args: unknown, index: number): number | null {
  if (!Array.isArray(args)) return null;

  const value = args[index];
  return typeof value === "number" ? value : null;
}

function readColor(args: unknown): RgbColor | null {
  const values = readNumericArgs(args);
  if (values.length === 0) return null;

  if (values.length === 1) {
    const channel = normalizeColorChannel(values[0]);
    return { r: channel, g: channel, b: channel };
  }

  return {
    r: normalizeColorChannel(values[0]),
    g: normalizeColorChannel(values[1]),
    b: normalizeColorChannel(values[2])
  };
}

function readNumericArgs(args: unknown): number[] {
  if (Array.isArray(args)) {
    return args.filter((value): value is number => typeof value === "number");
  }

  if (isArrayLike(args)) {
    return Array.from({ length: args.length }, (_, index) => args[index])
      .filter((value): value is number => typeof value === "number");
  }

  return [];
}

function normalizeColorChannel(value: number): number {
  if (value <= 1) return Math.round(value * 255);
  return Math.round(value);
}

function isArrayLike(value: unknown): value is { length: number; [index: number]: unknown } {
  return typeof value === "object" && value !== null && "length" in value && typeof value.length === "number";
}

async function renderPageBackground(
  page: pdfjsLib.PDFPageProxy,
  viewport: pdfjsLib.PageViewport
): Promise<string> {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return "";

  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  await page.render({ canvasContext: context, viewport }).promise;

  return canvas.toDataURL("image/png");
}

async function extractPageText(
  page: pdfjsLib.PDFPageProxy,
  pageNumber: number,
  pageHeight: number
): Promise<PdfTextObject[]> {
  const content = await page.getTextContent();
  return content.items
    .flatMap((item) => {
      if (!isPositionedTextItem(item)) return [];
      return [{
      value: item.str.trim(),
      page: pageNumber,
      x: Math.round(item.transform[4] * 1000) / 1000,
      y: Math.round((pageHeight - item.transform[5]) * 1000) / 1000,
      fontSize: Math.round(Math.hypot(item.transform[2], item.transform[3]) * 1000) / 1000
      }];
    })
    .filter((item) => item.value.length > 0);
}

function isPositionedTextItem(item: unknown): item is { str: string; transform: number[] } {
  if (!item || typeof item !== "object" || !("str" in item) || !("transform" in item)) return false;
  const candidate = item as { str: unknown; transform: unknown };
  return typeof candidate.str === "string" && Array.isArray(candidate.transform);
}

function createEmptyPath(): PathState {
  return {
    segments: [],
    points: [],
    commands: [],
    closed: false,
    hasRectangle: false
  };
}

function cloneState(state: GraphicsState): GraphicsState {
  return {
    transform: [...state.transform],
    lineWidth: state.lineWidth,
    strokeColor: state.strokeColor,
    fillColor: state.fillColor
  };
}

function copyState(from: GraphicsState, to: GraphicsState): void {
  to.transform = [...from.transform];
  to.lineWidth = from.lineWidth;
  to.strokeColor = from.strokeColor;
  to.fillColor = from.fillColor;
}
