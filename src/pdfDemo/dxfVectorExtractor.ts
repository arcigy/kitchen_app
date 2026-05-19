import { bboxFromSegments, round, type BBox, type Point2, type Segment2 } from "./geometryUtils";
import type { PdfVectorExtractionResult, PdfVectorObject, RgbColor } from "./pdfVectorExtractor";

export interface DxfExtractionConfig {
  drawingScale: number;
}

interface DxfGroup {
  code: number;
  value: string;
}

interface DxfEntity {
  type: string;
  groups: DxfGroup[];
}

const DEFAULT_DXF_CONFIG: DxfExtractionConfig = {
  drawingScale: 50
};

export async function extractDxfVectorObjects(
  file: File,
  config: DxfExtractionConfig = DEFAULT_DXF_CONFIG
): Promise<PdfVectorExtractionResult> {
  const text = await file.text();
  const entities = parseEntities(parseGroups(text));
  const objects = entities.flatMap((entity, index) => entityToVectorObject(entity, index, config.drawingScale));
  const minX = objects.length > 0 ? Math.min(...objects.map((object) => object.bbox.x)) : 0;
  const minY = objects.length > 0 ? Math.min(...objects.map((object) => object.bbox.y)) : 0;
  const bounds = getObjectsBounds(objects);
  const width = Math.max(1, bounds.x + bounds.width);
  const height = Math.max(1, bounds.y + bounds.height);
  const texts = entities
    .flatMap((entity) => entityToTextObject(entity, config.drawingScale))
    .map((item) => ({
      ...item,
      x: round(item.x - minX, 3),
      y: round(item.y - minY, 3)
    }));

  return {
    page: 1,
    isVectorPdf: true,
    width,
    height,
    backgroundDataUrl: "",
    objects,
    texts
  };
}

function parseGroups(text: string): DxfGroup[] {
  const lines = text.replace(/\r/g, "").split("\n");
  const groups: DxfGroup[] = [];

  for (let index = 0; index < lines.length - 1; index += 2) {
    const code = Number.parseInt(lines[index].trim(), 10);
    if (!Number.isFinite(code)) continue;
    groups.push({ code, value: lines[index + 1].trim() });
  }

  return groups;
}

function parseEntities(groups: DxfGroup[]): DxfEntity[] {
  const entities: DxfEntity[] = [];
  let inEntities = false;
  let current: DxfEntity | null = null;

  for (let index = 0; index < groups.length; index += 1) {
    const group = groups[index];
    const next = groups[index + 1];

    if (group.code === 0 && group.value === "SECTION" && next?.code === 2 && next.value === "ENTITIES") {
      inEntities = true;
      index += 1;
      continue;
    }

    if (inEntities && group.code === 0 && group.value === "ENDSEC") {
      if (current) entities.push(current);
      break;
    }

    if (!inEntities) continue;

    if (group.code === 0) {
      if (current) entities.push(current);
      current = { type: group.value, groups: [] };
      continue;
    }

    current?.groups.push(group);
  }

  return entities;
}

function entityToVectorObject(entity: DxfEntity, index: number, scale: number): PdfVectorObject[] {
  if (entity.type === "LINE") {
    const start = readPoint(entity.groups, 10, 20, scale);
    const end = readPoint(entity.groups, 11, 21, scale);
    if (!start || !end) return [];
    return [createObject(index, "line", [{ start, end }], [start, end], entity)];
  }

  if (entity.type === "LWPOLYLINE") {
    return createLwPolylineObject(index, entity, scale);
  }

  if (entity.type === "POLYLINE") {
    return [];
  }

  if (entity.type === "CIRCLE") {
    return createCircleObject(index, entity, scale);
  }

  if (entity.type === "ARC") {
    return createArcObject(index, entity, scale);
  }

  if (entity.type === "SPLINE") {
    const points = readLwPolylinePoints(entity.groups, scale);
    return createPolylineObjects(index, points, false, entity);
  }

  if (entity.type === "HATCH") {
    return createHatchObject(index, entity, scale);
  }

  return [];
}

function createCircleObject(index: number, entity: DxfEntity, scale: number): PdfVectorObject[] {
  const center = readPoint(entity.groups, 10, 20, scale);
  const radius = readNumber(entity.groups, 40);
  if (!center || radius === null) return [];
  const points = sampleArc(center, radius * scale, 0, 360);
  return createPolylineObjects(index, points, true, entity);
}

function createArcObject(index: number, entity: DxfEntity, scale: number): PdfVectorObject[] {
  const center = readPoint(entity.groups, 10, 20, scale);
  const radius = readNumber(entity.groups, 40);
  const startAngle = readNumber(entity.groups, 50);
  const endAngle = readNumber(entity.groups, 51);
  if (!center || radius === null || startAngle === null || endAngle === null) return [];
  const points = sampleArc(center, radius * scale, -startAngle, -endAngle, true);
  return createPolylineObjects(index, points, false, entity);
}

function createLwPolylineObject(index: number, entity: DxfEntity, scale: number): PdfVectorObject[] {
  const vertices = readLwPolylineVertices(entity.groups, scale);
  if (vertices.length < 2) return [];

  const points: Point2[] = [vertices[0].point];
  const closed = isClosed(entity.groups);
  const edgeCount = closed ? vertices.length : vertices.length - 1;

  for (let vertexIndex = 0; vertexIndex < edgeCount; vertexIndex += 1) {
    const current = vertices[vertexIndex];
    const next = vertices[(vertexIndex + 1) % vertices.length];
    const edgePoints = sampleBulgeSegment(current.point, next.point, current.bulge);
    points.push(...edgePoints.slice(1));
  }

  return createPolylineObjects(index, points, closed, entity);
}

function sampleArc(center: Point2, radius: number, startAngle: number, endAngle: number, shortSweep = false): Point2[] {
  const sweep = shortSweep
    ? normalizeShortSweep(endAngle - startAngle)
    : normalizePositiveSweep(endAngle - startAngle);
  const arcLength = Math.abs(sweep) * Math.PI / 180 * radius;
  const steps = Math.max(12, Math.ceil(Math.abs(sweep) / 4), Math.ceil(arcLength / 50));
  const points: Point2[] = [];

  for (let index = 0; index <= steps; index += 1) {
    const angle = (startAngle + sweep * index / steps) * Math.PI / 180;
    points.push({
      x: round(center.x + Math.cos(angle) * radius, 3),
      y: round(center.y + Math.sin(angle) * radius, 3)
    });
  }

  return points;
}

function createHatchObject(index: number, entity: DxfEntity, scale: number): PdfVectorObject[] {
  const segments: Segment2[] = [];
  let startX: number | null = null;
  let startY: number | null = null;
  let endX: number | null = null;

  for (const group of entity.groups) {
    if (group.code === 10) startX = Number.parseFloat(group.value);
    if (group.code === 20) startY = Number.parseFloat(group.value);
    if (group.code === 11) endX = Number.parseFloat(group.value);
    if (group.code === 21 && startX !== null && startY !== null && endX !== null) {
      const endY = Number.parseFloat(group.value);
      if ([startX, startY, endX, endY].every(Number.isFinite)) {
        segments.push({
          start: { x: round(startX * scale, 3), y: round(-startY * scale, 3) },
          end: { x: round(endX * scale, 3), y: round(-endY * scale, 3) }
        });
      }
      startX = null;
      startY = null;
      endX = null;
    }
  }

  if (segments.length === 0) return [];
  const points = segments.map((segment) => segment.start);
  const object = createObject(index, "path", segments, points, entity, true);
  object.paintOperation = "fill";
  object.fillColor = readEntityColor(entity.groups);
  return [object];
}

function normalizePositiveSweep(sweep: number): number {
  let normalized = sweep % 360;
  if (normalized <= 0) normalized += 360;
  return normalized;
}

function normalizeShortSweep(sweep: number): number {
  let normalized = sweep % 360;
  if (normalized > 180) normalized -= 360;
  if (normalized < -180) normalized += 360;
  return normalized;
}

function sampleBulgeSegment(start: Point2, end: Point2, rawBulge: number): Point2[] {
  if (Math.abs(rawBulge) < 0.000001) return [start, end];

  const bulge = -rawBulge;
  const theta = 4 * Math.atan(bulge);
  const chord = Math.hypot(end.x - start.x, end.y - start.y);
  const sinHalf = Math.sin(Math.abs(theta) / 2);
  if (chord < 0.000001 || Math.abs(sinHalf) < 0.000001) return [start, end];

  const radius = chord / (2 * sinHalf);
  const chordAngle = Math.atan2(end.y - start.y, end.x - start.x);
  const centerAngle = chordAngle + (Math.PI - theta) / 2;
  const center = {
    x: start.x + Math.cos(centerAngle) * radius,
    y: start.y + Math.sin(centerAngle) * radius
  };
  const startAngle = Math.atan2(start.y - center.y, start.x - center.x);
  const arcLength = Math.abs(theta) * radius;
  const steps = Math.max(8, Math.ceil(Math.abs(theta) * 180 / Math.PI / 4), Math.ceil(arcLength / 50));
  const points: Point2[] = [];

  for (let index = 0; index <= steps; index += 1) {
    const angle = startAngle + theta * index / steps;
    points.push({
      x: round(center.x + Math.cos(angle) * radius, 3),
      y: round(center.y + Math.sin(angle) * radius, 3)
    });
  }

  return points;
}

function createPolylineObjects(index: number, points: Point2[], closed: boolean, entity: DxfEntity): PdfVectorObject[] {
  if (points.length < 2) return [];

  const segments: Segment2[] = [];
  for (let pointIndex = 0; pointIndex < points.length - 1; pointIndex += 1) {
    segments.push({ start: points[pointIndex], end: points[pointIndex + 1] });
  }
  if (closed) {
    segments.push({ start: points[points.length - 1], end: points[0] });
  }

  return [createObject(index, "polyline", segments, points, entity, closed)];
}

function createObject(
  index: number,
  kind: PdfVectorObject["kind"],
  segments: Segment2[],
  points: Point2[],
  entity: DxfEntity,
  closed = false
): PdfVectorObject {
  const lineweight = readLineweight(entity.groups);
  const bbox = bboxFromSegments(segments, lineweight || 0.01);

  return {
    id: `dxf_${String(index + 1).padStart(5, "0")}`,
    page: 1,
    kind,
    source: "vector_path",
    paintOperation: "stroke",
    strokeWidth: lineweight,
    fillColor: null,
    strokeColor: readEntityColor(entity.groups),
    bbox,
    segments,
    points,
    commands: [],
    closed
  };
}

function entityToTextObject(entity: DxfEntity, scale: number) {
  if (entity.type !== "MTEXT" && entity.type !== "TEXT") return [];
  const point = readPoint(entity.groups, 10, 20, scale);
  const value = readText(entity.groups);
  if (!point || !value) return [];
  return [{
    value,
    page: 1,
    x: point.x,
    y: point.y,
    fontSize: round((readNumber(entity.groups, 40) ?? 2.5) * scale, 3)
  }];
}

function readText(groups: DxfGroup[]): string {
  return groups
    .filter((group) => group.code === 1 || group.code === 3)
    .map((group) => group.value)
    .join("");
}

function readPoint(groups: DxfGroup[], xCode: number, yCode: number, scale: number): Point2 | null {
  const x = readNumber(groups, xCode);
  const y = readNumber(groups, yCode);
  if (x === null || y === null) return null;

  return {
    x: round(x * scale, 3),
    y: round(-y * scale, 3)
  };
}

function readLwPolylinePoints(groups: DxfGroup[], scale: number): Point2[] {
  return readLwPolylineVertices(groups, scale).map((vertex) => vertex.point);
}

function readLwPolylineVertices(groups: DxfGroup[], scale: number): Array<{ point: Point2; bulge: number }> {
  const points: Point2[] = [];
  const vertices: Array<{ point: Point2; bulge: number }> = [];
  let pendingX: number | null = null;
  let currentIndex = -1;

  for (const group of groups) {
    if (group.code === 10) {
      pendingX = Number.parseFloat(group.value);
      continue;
    }

    if (group.code === 20 && pendingX !== null) {
      const y = Number.parseFloat(group.value);
      if (Number.isFinite(pendingX) && Number.isFinite(y)) {
        vertices.push({ point: { x: round(pendingX * scale, 3), y: round(-y * scale, 3) }, bulge: 0 });
        currentIndex = vertices.length - 1;
      }
      pendingX = null;
      continue;
    }

    if (group.code === 42 && currentIndex >= 0) {
      const bulge = Number.parseFloat(group.value);
      if (Number.isFinite(bulge)) vertices[currentIndex].bulge = bulge;
    }
  }

  return vertices;
}

function readNumber(groups: DxfGroup[], code: number): number | null {
  const group = groups.find((item) => item.code === code);
  if (!group) return null;

  const value = Number.parseFloat(group.value);
  return Number.isFinite(value) ? value : null;
}

function readLineweight(groups: DxfGroup[]): number {
  const raw = readNumber(groups, 370);
  if (raw === null || raw < 0) return 0;
  return round(raw / 100, 3);
}

function readEntityColor(groups: DxfGroup[]): RgbColor | null {
  const colorIndex = readNumber(groups, 62);
  if (colorIndex === null) return null;
  if (colorIndex === 7 || colorIndex === 250) return { r: 0, g: 0, b: 0 };
  if (colorIndex === 8 || colorIndex === 9) return { r: 128, g: 128, b: 128 };
  return null;
}

function isClosed(groups: DxfGroup[]): boolean {
  const flag = readNumber(groups, 70);
  return flag !== null && (flag & 1) === 1;
}

function getObjectsBounds(objects: PdfVectorObject[]): BBox {
  if (objects.length === 0) return { x: 0, y: 0, width: 1000, height: 1000 };

  const minX = Math.min(...objects.map((object) => object.bbox.x));
  const minY = Math.min(...objects.map((object) => object.bbox.y));
  const maxX = Math.max(...objects.map((object) => object.bbox.x + object.bbox.width));
  const maxY = Math.max(...objects.map((object) => object.bbox.y + object.bbox.height));

  for (const object of objects) {
    object.bbox.x = round(object.bbox.x - minX, 3);
    object.bbox.y = round(object.bbox.y - minY, 3);
    object.points = object.points.map((point) => ({ x: round(point.x - minX, 3), y: round(point.y - minY, 3) }));
    object.segments = object.segments.map((segment) => ({
      start: { x: round(segment.start.x - minX, 3), y: round(segment.start.y - minY, 3) },
      end: { x: round(segment.end.x - minX, 3), y: round(segment.end.y - minY, 3) }
    }));
  }

  return {
    x: 0,
    y: 0,
    width: round(maxX - minX, 3),
    height: round(maxY - minY, 3)
  };
}
