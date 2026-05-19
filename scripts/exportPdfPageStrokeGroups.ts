import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { detectDimensionAnnotations, type DimensionDetectionResult, type VectorTextToken } from "../src/features/pdf-intake/dimensionDetection";
import { detectDrawingContentBounds, type DrawingContentBoundsResult } from "../src/features/pdf-intake/drawingBoundsDetection";
import { detectWallCandidateSegments, inferHeavyStructuralSegmentIds, type WallCandidateDetectionResult } from "../src/features/pdf-intake/wallCandidateDetection";
import { detectWallAreaPolygonsByStrokeFloodFill, type WallAreaPolygon } from "../src/features/pdf-intake/wallAreaDetection";
import { buildWallsFromDetectionResults } from "../src/features/pdf-intake/wallBuilder";
import { detectWallCenterlines, type WallCenterline } from "../src/features/pdf-intake/wallCenterlineDetection";
import { inferWallClosureSegments, type WallClosureSegment } from "../src/features/pdf-intake/wallClosureInference";
import { detectOpenWallEnds, type WallEndHighlight } from "../src/features/pdf-intake/wallEndDetection";
import { rectangulateWallHatches, type WallHatchRectangle } from "../src/features/pdf-intake/wallHatchRectangulation";
import { cleanupWallLineGroup, type WallLineCleanupResult } from "../src/features/pdf-intake/wallLineCleanup";
import { assertDevOnlyDebugOutputAllowed } from "../src/core/storage/debug-output-guard";
import {
  createColoredSvg,
  createStrokeGroupSummary,
  groupSegmentsByStrokeWidth,
  type StrokeWidthGroup,
  type VectorSegment
} from "../src/features/pdf-intake/vectorStrokeGrouping";

interface PdfOperatorList {
  fnArray: number[];
  argsArray: unknown[];
}

interface PdfTextContent {
  items: unknown[];
}

interface PdfTextItem {
  str?: string;
  transform?: number[];
  width?: number;
  height?: number;
}

type PreviewSnapSegment = {
  id: string;
  source: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
};

type Matrix = [number, number, number, number, number, number];
type Rgb = [number, number, number];

const OPS = pdfjs.OPS;
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];
const DEFAULT_STROKE_COLOR: Rgb = [0, 0, 0];
const DEFAULT_FILL_COLOR: Rgb = [0, 0, 0];

async function main(): Promise<void> {
  const [pdfPath, pageArg, outDirArg] = process.argv.slice(2);
  if (!pdfPath || !pageArg) {
    throw new Error("Usage: npm exec tsx scripts/exportPdfPageStrokeGroups.ts <pdfPath> <pageNumber> [outDir]");
  }

  const pageNumber = Number(pageArg);
  const outDir = outDirArg ?? path.join("public", "debug-pdf", "stroke-groups", `${path.basename(pdfPath, ".pdf")}-page-${pageNumber}`);
  assertDevOnlyDebugOutputAllowed(outDir);
  await mkdir(outDir, { recursive: true });

  const data = new Uint8Array(await readFile(pdfPath));
  const pdf = await pdfjs.getDocument({ data, disableWorker: true }).promise;
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale: 1 });
  const opList = await page.getOperatorList() as PdfOperatorList;
  const textContent = await page.getTextContent() as PdfTextContent;
  const segments = extractVectorSegments(opList);
  const textTokens = extractTextTokens(textContent);
  const rawGroups = groupSegmentsByStrokeWidth({
    segments,
    absoluteTolerance: 0.04,
    relativeTolerance: 0.18,
    colorTolerance: 32,
    minimumSegmentLength: 0.6
  });
  const wallLineCleanup = cleanupWallLineGroup({
    groups: rawGroups,
    targetGroupId: "stroke_group_1"
  });
  const groups = wallLineCleanup.groups;
  const processingGroups = groups.filter((group) => group.groupId === "stroke_group_1");
  const heavyWallCandidateSegmentIds = inferHeavyStructuralSegmentIds(processingGroups);
  const wallCandidateDetection = detectWallCandidateSegments({ groups: processingGroups, minimumSegmentLength: 5 });
  const wallCandidateSegmentIds = new Set(wallCandidateDetection.wallCandidateSegmentIds);
  const wallCandidateSegments = processingGroups.flatMap((group) =>
    group.segments.filter((segment) => wallCandidateSegmentIds.has(segment.id))
  );
  const drawingContentBounds = detectDrawingContentBounds({
    wallSegments: wallCandidateSegments,
    pageWidth: viewport.width,
    pageHeight: viewport.height
  });
  const retainedWallCandidateSegmentIds = new Set(drawingContentBounds.retainedSegmentIds);
  const rejectedWallCandidateSegmentIds = new Set(drawingContentBounds.rejectedSegmentIds);
  const roughDimensions = detectDimensionAnnotations({
    segments,
    texts: textTokens,
    excludedSegmentIds: Array.from(new Set([
      ...wallCandidateSegmentIds,
      ...wallLineCleanup.removedDuplicateSegmentIds
    ]))
  });
  const dimensions = suppressDimensionMarkers(roughDimensions);
  const retainedWallCandidateSegments = wallCandidateSegments.filter((segment) => retainedWallCandidateSegmentIds.has(segment.id));
  const rawWallOpenEnds = detectOpenWallEnds({
    wallSegments: retainedWallCandidateSegments,
    connectionTolerance: 5,
    minWallSegmentLength: 18,
    capMaxLength: 24,
    danglingOnly: true
  });
  const pageEdgeWallEnds = rawWallOpenEnds.filter((end) => isNearPageEdge(end, viewport.width, viewport.height));
  const pageEdgeWallEndIds = new Set(pageEdgeWallEnds.map((end) => end.id));
  const wallOpenEnds = rawWallOpenEnds.filter((end) => !pageEdgeWallEndIds.has(end.id));
  const inferredClosureStrokeWidth = Math.max(1, ...processingGroups.map((group) => group.representativeStrokeWidth));
  const wallClosureSegments = inferWallClosureSegments({
    openEnds: wallOpenEnds,
    existingSegments: retainedWallCandidateSegments,
    maxClosureLength: maxWallAreaThicknessForDrawing(dimensions.inferredScaleFactor)
  }).map((segment) => ({
    ...segment,
    strokeWidth: inferredClosureStrokeWidth,
    sourceStrokeWidth: inferredClosureStrokeWidth
  }));
  const wallSegmentsForAreaDetection = [...retainedWallCandidateSegments, ...wallClosureSegments];
  const closedWallAreaPolygons = detectWallAreaPolygonsByStrokeFloodFill({
    wallSegments: wallSegmentsForAreaDetection,
    gridSize: 1,
    minArea: 20,
    maxEstimatedThickness: maxWallAreaThicknessForDrawing(dimensions.inferredScaleFactor),
    barrierPadding: 1.8,
    boundarySnapDistance: 5
  });
  const pairedWallAreaPolygons: WallAreaPolygon[] = [];
  const wallAreaPolygons = closedWallAreaPolygons
    .map((polygon, index) => ({ ...polygon, id: `wall_area_${index + 1}` }));
  const previewPointGridSizeMm = 1;
  const wallRectangleThicknessGridSizeMm = 5;
  const previewPointGridSizeDrawingUnits = dimensions.inferredScaleFactor
    ? previewPointGridSizeMm / dimensions.inferredScaleFactor
    : 0;
  const wallRectangleThicknessGridSizeDrawingUnits = dimensions.inferredScaleFactor
    ? wallRectangleThicknessGridSizeMm / dimensions.inferredScaleFactor
    : 0;
  const wallHatchRectangulation = rectangulateWallHatches({
    wallAreaPolygons,
    edgeAlignmentTolerance: 2.5,
    coordinateGridSizeDrawingUnits: previewPointGridSizeDrawingUnits,
    wallThicknessGridSizeDrawingUnits: wallRectangleThicknessGridSizeDrawingUnits,
    scaleFactor: dimensions.inferredScaleFactor
  });
  const wallCenterlines = detectWallCenterlines({
    wallRectangles: wallHatchRectangulation.rectangles,
    minCenterlineLength: 1
  });
  const wallBuildResult = buildWallsFromDetectionResults({
    wallAreas: wallAreaPolygons,
    centerlines: wallCenterlines
  });
  const stem = `${path.basename(pdfPath, ".pdf")}-page-${pageNumber}`;

  await writeFile(path.join(outDir, `${stem}.dxf`), createDimensionAnnotatedDxf(groups, textTokens, dimensions, wallOpenEnds, wallCenterlines, wallAreaPolygons, retainedWallCandidateSegmentIds, rejectedWallCandidateSegmentIds, pageEdgeWallEnds, wallClosureSegments), "utf-8");
  await writeFile(path.join(outDir, `${stem}.svg`), createColoredSvg(groups, viewport.width, viewport.height), "utf-8");
  await writeFile(path.join(outDir, `${stem}-dimensions.dxf`), createDimensionAnnotatedDxf(groups, textTokens, dimensions), "utf-8");
  await writeFile(path.join(outDir, `${stem}-dimensions.svg`), createDimensionAnnotatedSvg(groups, textTokens, dimensions, viewport.width, viewport.height), "utf-8");
  await writeFile(path.join(outDir, `${stem}-wall-open-ends.dxf`), createWallOpenEndsDxf(groups, wallOpenEnds, dimensions.inferredScaleFactor ?? 1), "utf-8");
  await writeFile(path.join(outDir, `${stem}-wall-open-ends.svg`), createWallOpenEndsSvg(groups, wallOpenEnds, viewport.width, viewport.height), "utf-8");
  await writeFile(path.join(outDir, `${stem}-wall-centerlines.dxf`), createWallCenterlinesDxf(groups, wallCenterlines, dimensions.inferredScaleFactor ?? 1), "utf-8");
  await writeFile(path.join(outDir, `${stem}-wall-centerlines.svg`), createWallCenterlinesSvg(groups, wallCenterlines, viewport.width, viewport.height), "utf-8");
  await writeFile(path.join(outDir, `${stem}-wall-areas.dxf`), createWallAreasDxf(groups, wallAreaPolygons, dimensions.inferredScaleFactor ?? 1, wallClosureSegments), "utf-8");
  await writeFile(path.join(outDir, `${stem}-wall-areas.svg`), createWallAreasSvg(groups, wallAreaPolygons, viewport.width, viewport.height, wallClosureSegments), "utf-8");
  await writeFile(path.join(outDir, `${stem}-preview.html`), createDxfPreviewHtml({
    pdfPath,
    pageNumber,
    stem,
    groups,
    texts: textTokens,
    dimensions,
    wallCandidateDetection,
    retainedWallCandidateSegmentIds,
    rejectedWallCandidateSegmentIds,
    drawingContentBounds,
    wallOpenEnds,
    pageEdgeWallEnds,
    wallClosureSegments,
    wallCenterlines,
    wallAreaPolygons,
    wallHatchRectangles: wallHatchRectangulation.rectangles,
    width: viewport.width,
    height: viewport.height
  }), "utf-8");
  await writeFile(path.join(outDir, `${stem}-segments.json`), `${JSON.stringify({
    pdfPath,
    pageNumber,
    pageSize: { width: viewport.width, height: viewport.height },
    segmentCount: segments.length,
    textTokenCount: textTokens.length,
    heavyWallCandidateSegmentCount: heavyWallCandidateSegmentIds.size,
    wallCandidateSegmentCount: wallCandidateSegmentIds.size,
    retainedWallCandidateSegmentCount: retainedWallCandidateSegmentIds.size,
    rejectedWallCandidateSegmentCount: rejectedWallCandidateSegmentIds.size,
    wallCandidateCountsByGroup: createWallCandidateCountsByGroup(processingGroups, wallCandidateSegmentIds),
    retainedWallCandidateCountsByGroup: createWallCandidateCountsByGroup(processingGroups, retainedWallCandidateSegmentIds),
    drawingContentBounds,
    workingBoundarySafetyMarginMm: dimensions.inferredScaleFactor ? round(drawingContentBounds.safetyMargin * dimensions.inferredScaleFactor) : null,
    maxWallThicknessForCenterline: maxWallThicknessForDrawing(dimensions.inferredScaleFactor),
    maxWallThicknessForCenterlineMm: dimensions.inferredScaleFactor ? round(maxWallThicknessForDrawing(dimensions.inferredScaleFactor) * dimensions.inferredScaleFactor) : null,
    maxWallAreaThickness: maxWallAreaThicknessForDrawing(dimensions.inferredScaleFactor),
    maxWallAreaThicknessMm: dimensions.inferredScaleFactor ? round(maxWallAreaThicknessForDrawing(dimensions.inferredScaleFactor) * dimensions.inferredScaleFactor) : null,
    closedWallAreaPolygonCount: closedWallAreaPolygons.length,
    pairedWallAreaPolygonCount: pairedWallAreaPolygons.length,
    wallAreaPolygonCount: wallAreaPolygons.length,
    pageEdgeGuardMargin: pageEdgeGuardMargin(viewport.width, viewport.height),
    dimensionMarkersDisabledCount: roughDimensions.dimensionSegmentIds.length - dimensions.dimensionSegmentIds.length,
    wallLineCleanup: summarizeWallLineCleanup(wallLineCleanup),
    wallCandidateDetection,
    groups: createStrokeGroupSummary(groups),
    dimensionDetection: dimensions,
    wallOpenEnds,
    pageEdgeWallEnds,
    wallClosureSegments,
    wallCenterlines,
    wallAreaPolygons,
    wallHatchRectangles: wallHatchRectangulation.rectangles,
    wallHatchRectangulationWarnings: wallHatchRectangulation.warnings,
    previewPointGridSizeMm,
    previewPointGridSizeDrawingUnits,
    wallRectangleThicknessGridSizeMm,
    wallRectangleThicknessGridSizeDrawingUnits,
    walls: wallBuildResult.walls,
    unmatchedCenterlineIds: wallBuildResult.unmatchedCenterlineIds,
    firstNumericTextSamples: textTokens.filter((token) => /^\d+(?:[\s,.]\d+)?$/u.test(token.text.trim())).slice(0, 10),
    aiColorLegend: createAiColorLegend(groups)
  }, null, 2)}\n`, "utf-8");

  console.log(JSON.stringify({
    outDir,
    pageNumber,
    segmentCount: segments.length,
    textTokenCount: textTokens.length,
    heavyWallCandidateSegmentCount: heavyWallCandidateSegmentIds.size,
    wallCandidateSegmentCount: wallCandidateSegmentIds.size,
    retainedWallCandidateSegmentCount: retainedWallCandidateSegmentIds.size,
    rejectedWallCandidateSegmentCount: rejectedWallCandidateSegmentIds.size,
    wallCandidateGroupIds: wallCandidateDetection.candidateGroupIds,
    wallCandidateCountsByGroup: createWallCandidateCountsByGroup(processingGroups, wallCandidateSegmentIds),
    retainedWallCandidateCountsByGroup: createWallCandidateCountsByGroup(processingGroups, retainedWallCandidateSegmentIds),
    drawingBounds: drawingContentBounds.bounds,
    tightDrawingBounds: drawingContentBounds.tightBounds,
    workingDrawingBounds: drawingContentBounds.workingBounds,
    workingBoundarySafetyMargin: drawingContentBounds.safetyMargin,
    workingBoundarySafetyMarginMm: dimensions.inferredScaleFactor ? round(drawingContentBounds.safetyMargin * dimensions.inferredScaleFactor) : null,
    maxWallThicknessForCenterline: maxWallThicknessForDrawing(dimensions.inferredScaleFactor),
    maxWallThicknessForCenterlineMm: dimensions.inferredScaleFactor ? round(maxWallThicknessForDrawing(dimensions.inferredScaleFactor) * dimensions.inferredScaleFactor) : null,
    maxWallAreaThickness: maxWallAreaThicknessForDrawing(dimensions.inferredScaleFactor),
    maxWallAreaThicknessMm: dimensions.inferredScaleFactor ? round(maxWallAreaThicknessForDrawing(dimensions.inferredScaleFactor) * dimensions.inferredScaleFactor) : null,
    closedWallAreaPolygonCount: closedWallAreaPolygons.length,
    pairedWallAreaPolygonCount: pairedWallAreaPolygons.length,
    wallAreaPolygonCount: wallAreaPolygons.length,
    wallHatchRectangleCount: wallHatchRectangulation.rectangles.length,
    wallHatchRectangulationWarningCount: wallHatchRectangulation.warnings.length,
    previewPointGridSizeMm,
    previewPointGridSizeDrawingUnits: round(previewPointGridSizeDrawingUnits),
    wallRectangleThicknessGridSizeMm,
    wallRectangleThicknessGridSizeDrawingUnits: round(wallRectangleThicknessGridSizeDrawingUnits),
    wallCount: wallBuildResult.walls.length,
    inferredWallClosureCount: wallClosureSegments.length,
    unmatchedCenterlineCount: wallBuildResult.unmatchedCenterlineIds.length,
    rejectedWallComponentCount: drawingContentBounds.components.filter((component) => !component.isRetained).length,
    dimensionMarkersDisabledCount: roughDimensions.dimensionSegmentIds.length - dimensions.dimensionSegmentIds.length,
    wallLineCleanup: summarizeWallLineCleanup(wallLineCleanup),
    dimensionCount: dimensions.dimensions.length,
    strictDanglingWallEndCount: wallOpenEnds.length,
    ignoredPageEdgeWallEndCount: pageEdgeWallEnds.length,
    pageEdgeGuardMargin: pageEdgeGuardMargin(viewport.width, viewport.height),
    wallCenterlineCount: wallCenterlines.length,
    inferredScaleFactor: dimensions.inferredScaleFactor,
    previewHtml: path.join(outDir, `${stem}-preview.html`),
    groupCount: groups.length,
    groups: createStrokeGroupSummary(groups).slice(0, 12)
  }, null, 2));
}

export function extractVectorSegments(opList: PdfOperatorList): VectorSegment[] {
  const segments: VectorSegment[] = [];
  const stateStack: Array<{ ctm: Matrix; lineWidth: number; strokeColor: Rgb; fillColor: Rgb }> = [];
  let ctm: Matrix = IDENTITY;
  let lineWidth = 1;
  let strokeColor: Rgb = DEFAULT_STROKE_COLOR;
  let fillColor: Rgb = DEFAULT_FILL_COLOR;
  let pendingPath: VectorSegment[] = [];
  let segmentIndex = 0;

  for (let index = 0; index < opList.fnArray.length; index += 1) {
    const fn = opList.fnArray[index];
    const args = opList.argsArray[index];

    if (fn === OPS.save) {
      stateStack.push({ ctm, lineWidth, strokeColor, fillColor });
      continue;
    }

    if (fn === OPS.restore) {
      const restored = stateStack.pop();
      if (restored) {
        ctm = restored.ctm;
        lineWidth = restored.lineWidth;
        strokeColor = restored.strokeColor;
        fillColor = restored.fillColor;
      }
      continue;
    }

    if (fn === OPS.transform && Array.isArray(args)) {
      ctm = multiplyMatrix(ctm, args as Matrix);
      continue;
    }

    if (fn === OPS.setLineWidth && Array.isArray(args) && typeof args[0] === "number") {
      lineWidth = args[0] === 0 ? 0.05 : args[0];
      continue;
    }

    if (fn === OPS.setStrokeGray && Array.isArray(args) && typeof args[0] === "number") {
      const gray = normalizeColorChannel(args[0]);
      strokeColor = [gray, gray, gray];
      continue;
    }

    if (fn === OPS.setStrokeRGBColor && Array.isArray(args)) {
      strokeColor = [
        normalizeColorChannel(Number(args[0] ?? 0)),
        normalizeColorChannel(Number(args[1] ?? 0)),
        normalizeColorChannel(Number(args[2] ?? 0))
      ];
      continue;
    }

    if (fn === OPS.setStrokeCMYKColor && Array.isArray(args)) {
      strokeColor = cmykToRgb(
        Number(args[0] ?? 0),
        Number(args[1] ?? 0),
        Number(args[2] ?? 0),
        Number(args[3] ?? 0)
      );
      continue;
    }

    if ((fn === OPS.setStrokeColor || fn === OPS.setStrokeColorN) && Array.isArray(args)) {
      const parsedColor = parseGenericStrokeColor(args);
      if (parsedColor) strokeColor = parsedColor;
      continue;
    }

    if (fn === OPS.setFillGray && Array.isArray(args) && typeof args[0] === "number") {
      const gray = normalizeColorChannel(args[0]);
      fillColor = [gray, gray, gray];
      continue;
    }

    if (fn === OPS.setFillRGBColor && Array.isArray(args)) {
      fillColor = [
        normalizeColorChannel(Number(args[0] ?? 0)),
        normalizeColorChannel(Number(args[1] ?? 0)),
        normalizeColorChannel(Number(args[2] ?? 0))
      ];
      continue;
    }

    if (fn === OPS.setFillCMYKColor && Array.isArray(args)) {
      fillColor = cmykToRgb(
        Number(args[0] ?? 0),
        Number(args[1] ?? 0),
        Number(args[2] ?? 0),
        Number(args[3] ?? 0)
      );
      continue;
    }

    if ((fn === OPS.setFillColor || fn === OPS.setFillColorN) && Array.isArray(args)) {
      const parsedColor = parseGenericStrokeColor(args);
      if (parsedColor) fillColor = parsedColor;
      continue;
    }

    if (fn === OPS.constructPath && Array.isArray(args)) {
      const extracted = extractSegmentsFromConstructPath(args, ctm, lineWidth, strokeColor, segmentIndex);
      pendingPath.push(...extracted);
      segmentIndex += extracted.length;
      continue;
    }

    if (fn === OPS.stroke || fn === OPS.closeStroke) {
      segments.push(...paintPath(pendingPath, "stroke", strokeColor));
      pendingPath = [];
      continue;
    }

    if (fn === OPS.fillStroke || fn === OPS.eoFillStroke || fn === OPS.closeFillStroke || fn === OPS.closeEOFillStroke) {
      segments.push(...paintPath(pendingPath, "fill_stroke", strokeColor));
      pendingPath = [];
      continue;
    }

    if (fn === OPS.fill || fn === OPS.eoFill) {
      segments.push(...paintPath(pendingPath, "fill", fillColor));
      pendingPath = [];
      continue;
    }

    if (fn === OPS.endPath) {
      pendingPath = [];
    }
  }

  return segments;
}

function paintPath(segments: VectorSegment[], paintKind: NonNullable<VectorSegment["paintKind"]>, color: Rgb): VectorSegment[] {
  return segments.map((segment) => ({
    ...segment,
    strokeColorHex: rgbToHex(color),
    strokeColorRgb: color,
    paintKind
  }));
}

export function extractTextTokens(textContent: PdfTextContent): VectorTextToken[] {
  const tokens: VectorTextToken[] = [];
  for (const item of textContent.items) {
    const textItem = item as PdfTextItem;
    const text = textItem.str?.trim();
    const transform = textItem.transform;
    if (!text || !Array.isArray(transform) || transform.length < 6) continue;
    const fontSize = Math.max(0.1, Math.hypot(transform[2] ?? 0, transform[3] ?? 0) || textItem.height || 1);
    const width = Math.max(0.1, Number(textItem.width ?? text.length * fontSize * 0.5));
    const height = Math.max(0.1, Number(textItem.height ?? fontSize));
    const rotationDeg = Math.round(Math.atan2(transform[1] ?? 0, transform[0] ?? 1) * 180 / Math.PI);
    tokens.push({
      id: `text_${tokens.length + 1}`,
      text,
      x: Number(transform[4] ?? 0),
      y: Number(transform[5] ?? 0),
      width,
      height,
      fontSize,
      rotationDeg
    });
  }
  return tokens;
}

function extractSegmentsFromConstructPath(args: unknown[], ctm: Matrix, lineWidth: number, strokeColor: Rgb, startIndex: number): VectorSegment[] {
  const operators = args[0] as number[] | undefined;
  const coords = args[1] as number[] | undefined;
  if (!Array.isArray(operators) || !Array.isArray(coords)) return [];

  const segments: VectorSegment[] = [];
  let coordIndex = 0;
  let current: { x: number; y: number } | null = null;
  let subpathStart: { x: number; y: number } | null = null;
  const effectiveWidth = effectiveLineWidth(lineWidth, ctm);

  for (const op of operators) {
    if (op === OPS.moveTo) {
      current = transformPoint(coords[coordIndex] ?? 0, coords[coordIndex + 1] ?? 0, ctm);
      subpathStart = current;
      coordIndex += 2;
      continue;
    }

    if (op === OPS.lineTo) {
      const next = transformPoint(coords[coordIndex] ?? 0, coords[coordIndex + 1] ?? 0, ctm);
      coordIndex += 2;
      if (current) {
        segments.push({
          id: `segment_${startIndex + segments.length + 1}`,
          x1: current.x,
          y1: current.y,
          x2: next.x,
          y2: next.y,
          strokeWidth: effectiveWidth,
          sourceStrokeWidth: lineWidth,
          strokeColorHex: rgbToHex(strokeColor),
          strokeColorRgb: strokeColor,
          pathKind: "line"
        });
      }
      current = next;
      continue;
    }

    if (op === OPS.curveTo) {
      const control1 = transformPoint(coords[coordIndex] ?? 0, coords[coordIndex + 1] ?? 0, ctm);
      const control2 = transformPoint(coords[coordIndex + 2] ?? 0, coords[coordIndex + 3] ?? 0, ctm);
      const end = transformPoint(coords[coordIndex + 4] ?? 0, coords[coordIndex + 5] ?? 0, ctm);
      coordIndex += 6;
      if (current) segments.push(...approximateCubicCurve(current, control1, control2, end, effectiveWidth, lineWidth, strokeColor, startIndex + segments.length));
      current = end;
      continue;
    }

    if (op === OPS.curveTo2) {
      const control2 = transformPoint(coords[coordIndex] ?? 0, coords[coordIndex + 1] ?? 0, ctm);
      const end = transformPoint(coords[coordIndex + 2] ?? 0, coords[coordIndex + 3] ?? 0, ctm);
      coordIndex += 4;
      if (current) segments.push(...approximateCubicCurve(current, current, control2, end, effectiveWidth, lineWidth, strokeColor, startIndex + segments.length));
      current = end;
      continue;
    }

    if (op === OPS.curveTo3) {
      const control1 = transformPoint(coords[coordIndex] ?? 0, coords[coordIndex + 1] ?? 0, ctm);
      const end = transformPoint(coords[coordIndex + 2] ?? 0, coords[coordIndex + 3] ?? 0, ctm);
      coordIndex += 4;
      if (current) segments.push(...approximateCubicCurve(current, control1, end, end, effectiveWidth, lineWidth, strokeColor, startIndex + segments.length));
      current = end;
      continue;
    }

    if (op === OPS.rectangle) {
      const x = coords[coordIndex] ?? 0;
      const y = coords[coordIndex + 1] ?? 0;
      const width = coords[coordIndex + 2] ?? 0;
      const height = coords[coordIndex + 3] ?? 0;
      coordIndex += 4;
      const points = [
        transformPoint(x, y, ctm),
        transformPoint(x + width, y, ctm),
        transformPoint(x + width, y + height, ctm),
        transformPoint(x, y + height, ctm)
      ];
      for (let pointIndex = 0; pointIndex < points.length; pointIndex += 1) {
        const from = points[pointIndex];
        const to = points[(pointIndex + 1) % points.length];
        segments.push(createSegment(`segment_${startIndex + segments.length + 1}`, from, to, effectiveWidth, lineWidth, strokeColor, "rectangle"));
      }
      current = points[0];
      subpathStart = points[0];
      continue;
    }

    if (op === OPS.closePath) {
      if (current && subpathStart) {
        segments.push(createSegment(`segment_${startIndex + segments.length + 1}`, current, subpathStart, effectiveWidth, lineWidth, strokeColor, "close"));
        current = subpathStart;
      }
    }
  }

  return segments;
}

function createSegment(
  id: string,
  from: { x: number; y: number },
  to: { x: number; y: number },
  effectiveWidth: number,
  sourceStrokeWidth: number,
  strokeColor: Rgb,
  pathKind: VectorSegment["pathKind"]
): VectorSegment {
  return {
    id,
    x1: from.x,
    y1: from.y,
    x2: to.x,
    y2: to.y,
    strokeWidth: effectiveWidth,
    sourceStrokeWidth,
    strokeColorHex: rgbToHex(strokeColor),
    strokeColorRgb: strokeColor,
    pathKind
  };
}

function approximateCubicCurve(
  start: { x: number; y: number },
  control1: { x: number; y: number },
  control2: { x: number; y: number },
  end: { x: number; y: number },
  effectiveWidth: number,
  sourceStrokeWidth: number,
  strokeColor: Rgb,
  startIndex: number
): VectorSegment[] {
  const controlLength = distance(start, control1) + distance(control1, control2) + distance(control2, end);
  const segmentCount = Math.min(32, Math.max(6, Math.ceil(controlLength / 12)));
  const segments: VectorSegment[] = [];
  let previous = start;
  for (let index = 1; index <= segmentCount; index += 1) {
    const point = cubicPoint(start, control1, control2, end, index / segmentCount);
    segments.push(createSegment(`segment_${startIndex + segments.length + 1}`, previous, point, effectiveWidth, sourceStrokeWidth, strokeColor, "curve"));
    previous = point;
  }
  return segments;
}

function cubicPoint(
  start: { x: number; y: number },
  control1: { x: number; y: number },
  control2: { x: number; y: number },
  end: { x: number; y: number },
  t: number
): { x: number; y: number } {
  const mt = 1 - t;
  return {
    x: mt ** 3 * start.x + 3 * mt ** 2 * t * control1.x + 3 * mt * t ** 2 * control2.x + t ** 3 * end.x,
    y: mt ** 3 * start.y + 3 * mt ** 2 * t * control1.y + 3 * mt * t ** 2 * control2.y + t ** 3 * end.y
  };
}

function multiplyMatrix(left: Matrix, right: Matrix): Matrix {
  return [
    left[0] * right[0] + left[2] * right[1],
    left[1] * right[0] + left[3] * right[1],
    left[0] * right[2] + left[2] * right[3],
    left[1] * right[2] + left[3] * right[3],
    left[0] * right[4] + left[2] * right[5] + left[4],
    left[1] * right[4] + left[3] * right[5] + left[5]
  ];
}

function transformPoint(x: number, y: number, matrix: Matrix): { x: number; y: number } {
  return {
    x: matrix[0] * x + matrix[2] * y + matrix[4],
    y: matrix[1] * x + matrix[3] * y + matrix[5]
  };
}

function effectiveLineWidth(width: number, matrix: Matrix): number {
  const scaleX = Math.hypot(matrix[0], matrix[1]);
  const scaleY = Math.hypot(matrix[2], matrix[3]);
  return width * ((scaleX + scaleY) / 2);
}

function normalizeColorChannel(value: number): number {
  if (!Number.isFinite(value)) return 0;
  const scaled = value <= 1 ? value * 255 : value;
  return Math.max(0, Math.min(255, Math.round(scaled)));
}

function parseGenericStrokeColor(args: unknown[]): Rgb | null {
  const numeric = args.filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  if (numeric.length >= 3) {
    return [normalizeColorChannel(numeric[0]), normalizeColorChannel(numeric[1]), normalizeColorChannel(numeric[2])];
  }
  if (numeric.length === 1) {
    const gray = normalizeColorChannel(numeric[0]);
    return [gray, gray, gray];
  }
  return null;
}

function cmykToRgb(cyan: number, magenta: number, yellow: number, black: number): Rgb {
  const c = cyan > 1 ? cyan / 100 : cyan;
  const m = magenta > 1 ? magenta / 100 : magenta;
  const y = yellow > 1 ? yellow / 100 : yellow;
  const k = black > 1 ? black / 100 : black;
  return [
    normalizeColorChannel((1 - Math.min(1, c * (1 - k) + k)) * 255),
    normalizeColorChannel((1 - Math.min(1, m * (1 - k) + k)) * 255),
    normalizeColorChannel((1 - Math.min(1, y * (1 - k) + k)) * 255)
  ];
}

function rgbToHex(color: Rgb): string {
  return `#${color.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function distance(left: { x: number; y: number }, right: { x: number; y: number }): number {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

function createAiColorLegend(groups: StrokeWidthGroup[]): Array<{
  colorName: string;
  colorHex: string;
  groupId: string;
  expectedLabel: "wall" | "door" | "window" | "dimension" | "furniture" | "other" | "unknown";
  evidenceForAi: string;
}> {
  return groups.map((group) => ({
    colorName: group.colorName,
    colorHex: group.colorHex,
    groupId: group.groupId,
    expectedLabel: "unknown",
    evidenceForAi: `Stroke width ${round(group.representativeStrokeWidth)}, ${group.segments.length} segments, total length ${round(group.totalLength)}.`
  }));
}

function createWallCandidateCountsByGroup(groups: StrokeWidthGroup[], wallCandidateSegmentIds: Set<string>): Array<{
  groupId: string;
  colorName: string;
  candidateCount: number;
  totalSegments: number;
}> {
  return groups.map((group) => ({
    groupId: group.groupId,
    colorName: group.colorName,
    candidateCount: group.segments.filter((segment) => wallCandidateSegmentIds.has(segment.id)).length,
    totalSegments: group.segments.length
  })).filter((group) => group.candidateCount > 0);
}

function suppressDimensionMarkers(dimensions: DimensionDetectionResult): DimensionDetectionResult {
  const sanitizedDimensions = dimensions.dimensions.map((dimension) => ({
    ...dimension,
    markerSegmentIds: [],
    reasons: dimension.markerSegmentIds.length > 0
      ? [...dimension.reasons, "dimension markers disabled while wall detection is being stabilized"]
      : dimension.reasons
  }));
  const dimensionSegmentIds = new Set<string>();
  for (const dimension of sanitizedDimensions) {
    dimensionSegmentIds.add(dimension.mainSegmentId);
    for (const markerId of dimension.markerSegmentIds) dimensionSegmentIds.add(markerId);
  }

  return {
    ...dimensions,
    dimensions: sanitizedDimensions,
    dimensionSegmentIds: Array.from(dimensionSegmentIds),
    warnings: dimensions.warnings
  };
}

function isNearPageEdge(point: { x: number; y: number }, pageWidth: number, pageHeight: number): boolean {
  const margin = pageEdgeGuardMargin(pageWidth, pageHeight);
  return point.x <= margin
    || pageWidth - point.x <= margin
    || point.y <= margin
    || pageHeight - point.y <= margin;
}

function pageEdgeGuardMargin(pageWidth: number, pageHeight: number): number {
  return round(Math.max(16, Math.min(pageWidth, pageHeight) * 0.02));
}

function maxWallThicknessForDrawing(scaleFactor: number | undefined): number {
  if (!scaleFactor || !Number.isFinite(scaleFactor) || scaleFactor <= 0) return 60;
  return round(Math.max(40, Math.min(80, 900 / scaleFactor)));
}

function maxWallAreaThicknessForDrawing(scaleFactor: number | undefined): number {
  if (!scaleFactor || !Number.isFinite(scaleFactor) || scaleFactor <= 0) return 60;
  return round(Math.max(18, Math.min(80, 900 / scaleFactor)));
}

function summarizeWallLineCleanup(result: WallLineCleanupResult): Omit<WallLineCleanupResult, "groups"> {
  return {
    targetGroupId: result.targetGroupId,
    removedDuplicateSegmentIds: result.removedDuplicateSegmentIds,
    adjustedSegmentIds: result.adjustedSegmentIds,
    snappedEndpointCount: result.snappedEndpointCount,
    warnings: result.warnings
  };
}

function createDimensionAnnotatedDxf(
  groups: StrokeWidthGroup[],
  texts: VectorTextToken[],
  dimensions: DimensionDetectionResult,
  wallOpenEnds: WallEndHighlight[] = [],
  wallCenterlines: WallCenterline[] = [],
  wallAreaPolygons: WallAreaPolygon[] = [],
  wallCandidateSegmentIds: Set<string> = new Set(),
  rejectedWallCandidateSegmentIds: Set<string> = new Set(),
  pageEdgeWallEnds: WallEndHighlight[] = [],
  wallClosureSegments: WallClosureSegment[] = []
): string {
  const dimensionSegmentIds = new Set(dimensions.dimensionSegmentIds);
  const dimensionTextIds = new Set(dimensions.dimensionTextTokenIds);
  const dxfScale = dimensions.inferredScaleFactor ?? 1;
  const lines = [
    "0", "SECTION", "2", "HEADER", "9", "$ACADVER", "1", "AC1015", "9", "$INSUNITS", "70", "4", "0", "ENDSEC",
    "0", "SECTION", "2", "TABLES", "0", "TABLE", "2", "LAYER"
  ];

  for (const group of groups) {
    lines.push("0", "LAYER", "2", group.groupId, "70", "0", "62", String(dxfColorIndex(group.colorName)), "6", "CONTINUOUS");
  }
  lines.push("0", "LAYER", "2", "DIMENSION_LINE", "70", "0", "62", "2", "6", "CONTINUOUS");
  lines.push("0", "LAYER", "2", "DIMENSION_MARKER", "70", "0", "62", "4", "6", "CONTINUOUS");
  lines.push("0", "LAYER", "2", "DIMENSION_TEXT", "70", "0", "62", "2", "6", "CONTINUOUS");
  lines.push("0", "LAYER", "2", "WALL_FACE_CANDIDATE", "70", "0", "62", "3", "6", "CONTINUOUS");
  lines.push("0", "LAYER", "2", "IGNORED_FRAME_CANDIDATE", "70", "0", "62", "8", "6", "DASHED");
  lines.push("0", "LAYER", "2", "IGNORED_PAGE_EDGE_END", "70", "0", "62", "8", "6", "CONTINUOUS");
  lines.push("0", "LAYER", "2", "WALL_OPEN_END", "70", "0", "62", "1", "6", "CONTINUOUS");
  lines.push("0", "LAYER", "2", "INFERRED_WALL_CLOSURE", "70", "0", "62", "1", "6", "CONTINUOUS");
  lines.push("0", "LAYER", "2", "WALL_CENTERLINE", "70", "0", "62", "6", "6", "CENTER");
  lines.push("0", "LAYER", "2", "WALL_AREA_HATCH", "70", "0", "62", "3", "6", "CONTINUOUS");
  lines.push("0", "LAYER", "2", "WALL_AREA_OUTLINE", "70", "0", "62", "3", "6", "CONTINUOUS");
  lines.push("0", "ENDTAB", "0", "ENDSEC", "0", "SECTION", "2", "ENTITIES");
  const mainDimensionSegmentIds = new Set(dimensions.dimensions.map((dimension) => dimension.mainSegmentId));

  for (const group of groups) {
    for (const segment of group.segments) {
      const isDimension = dimensionSegmentIds.has(segment.id);
      const isMainDimension = mainDimensionSegmentIds.has(segment.id);
      const isWallCandidate = !isDimension && wallCandidateSegmentIds.has(segment.id);
      const isRejectedWallCandidate = !isDimension && rejectedWallCandidateSegmentIds.has(segment.id);
      lines.push(
        "0", "LINE",
        "8", isDimension ? isMainDimension ? "DIMENSION_LINE" : "DIMENSION_MARKER" : isWallCandidate ? "WALL_FACE_CANDIDATE" : isRejectedWallCandidate ? "IGNORED_FRAME_CANDIDATE" : group.groupId,
        "62", isDimension ? isMainDimension ? "2" : "4" : isWallCandidate ? "3" : isRejectedWallCandidate ? "8" : String(dxfColorIndex(group.colorName)),
        "10", formatDxfNumber(segment.x1 * dxfScale),
        "20", formatDxfNumber(segment.y1 * dxfScale),
        "30", "0",
        "11", formatDxfNumber(segment.x2 * dxfScale),
        "21", formatDxfNumber(segment.y2 * dxfScale),
        "31", "0"
      );
    }
  }

  for (const text of texts) {
    if (!dimensionTextIds.has(text.id)) continue;
    lines.push(
      "0", "TEXT",
      "8", "DIMENSION_TEXT",
      "62", "2",
      "10", formatDxfNumber(text.x * dxfScale),
      "20", formatDxfNumber(text.y * dxfScale),
      "30", "0",
      "40", formatDxfNumber(Math.max(1, text.fontSize * dxfScale)),
      "1", text.text,
      "50", String(text.rotationDeg ?? 0)
    );
  }

  pushWallAreaDxfEntities(lines, wallAreaPolygons, dxfScale);
  pushWallClosureDxfEntities(lines, wallClosureSegments, dxfScale);
  pushWallCenterlineDxfEntities(lines, wallCenterlines, dxfScale);
  pushWallOpenEndDxfEntities(lines, wallOpenEnds, dxfScale);
  pushWallEndDxfEntities(lines, pageEdgeWallEnds, dxfScale, "IGNORED_PAGE_EDGE_END", "8");

  lines.push("0", "ENDSEC", "0", "EOF");
  return `${lines.join("\n")}\n`;
}

function createWallOpenEndsDxf(groups: StrokeWidthGroup[], wallOpenEnds: WallEndHighlight[], dxfScale: number): string {
  const lines = [
    "0", "SECTION", "2", "HEADER", "9", "$ACADVER", "1", "AC1015", "9", "$INSUNITS", "70", "4", "0", "ENDSEC",
    "0", "SECTION", "2", "TABLES", "0", "TABLE", "2", "LAYER"
  ];

  for (const group of groups) {
    lines.push("0", "LAYER", "2", group.groupId, "70", "0", "62", String(dxfColorIndex(group.colorName)), "6", "CONTINUOUS");
  }
  lines.push("0", "LAYER", "2", "WALL_OPEN_END", "70", "0", "62", "1", "6", "CONTINUOUS");
  lines.push("0", "ENDTAB", "0", "ENDSEC", "0", "SECTION", "2", "ENTITIES");

  for (const group of groups) {
    for (const segment of group.segments) {
      lines.push(
        "0", "LINE",
        "8", group.groupId,
        "62", String(dxfColorIndex(group.colorName)),
        "10", formatDxfNumber(segment.x1 * dxfScale),
        "20", formatDxfNumber(segment.y1 * dxfScale),
        "30", "0",
        "11", formatDxfNumber(segment.x2 * dxfScale),
        "21", formatDxfNumber(segment.y2 * dxfScale),
        "31", "0"
      );
    }
  }

  pushWallOpenEndDxfEntities(lines, wallOpenEnds, dxfScale);
  lines.push("0", "ENDSEC", "0", "EOF");
  return `${lines.join("\n")}\n`;
}

function createWallCenterlinesDxf(groups: StrokeWidthGroup[], wallCenterlines: WallCenterline[], dxfScale: number): string {
  const lines = [
    "0", "SECTION", "2", "HEADER", "9", "$ACADVER", "1", "AC1015", "9", "$INSUNITS", "70", "4", "0", "ENDSEC",
    "0", "SECTION", "2", "TABLES", "0", "TABLE", "2", "LAYER"
  ];

  for (const group of groups) {
    lines.push("0", "LAYER", "2", group.groupId, "70", "0", "62", String(dxfColorIndex(group.colorName)), "6", "CONTINUOUS");
  }
  lines.push("0", "LAYER", "2", "WALL_CENTERLINE", "70", "0", "62", "6", "6", "CENTER");
  lines.push("0", "ENDTAB", "0", "ENDSEC", "0", "SECTION", "2", "ENTITIES");

  for (const group of groups) {
    for (const segment of group.segments) {
      lines.push(
        "0", "LINE",
        "8", group.groupId,
        "62", String(dxfColorIndex(group.colorName)),
        "10", formatDxfNumber(segment.x1 * dxfScale),
        "20", formatDxfNumber(segment.y1 * dxfScale),
        "30", "0",
        "11", formatDxfNumber(segment.x2 * dxfScale),
        "21", formatDxfNumber(segment.y2 * dxfScale),
        "31", "0"
      );
    }
  }

  pushWallCenterlineDxfEntities(lines, wallCenterlines, dxfScale);
  lines.push("0", "ENDSEC", "0", "EOF");
  return `${lines.join("\n")}\n`;
}

function createWallAreasDxf(
  groups: StrokeWidthGroup[],
  wallAreaPolygons: WallAreaPolygon[],
  dxfScale: number,
  wallClosureSegments: WallClosureSegment[] = []
): string {
  const lines = [
    "0", "SECTION", "2", "HEADER", "9", "$ACADVER", "1", "AC1015", "9", "$INSUNITS", "70", "4", "0", "ENDSEC",
    "0", "SECTION", "2", "TABLES", "0", "TABLE", "2", "LAYER"
  ];

  for (const group of groups) {
    lines.push("0", "LAYER", "2", group.groupId, "70", "0", "62", String(dxfColorIndex(group.colorName)), "6", "CONTINUOUS");
  }
  lines.push("0", "LAYER", "2", "WALL_AREA_HATCH", "70", "0", "62", "3", "6", "CONTINUOUS");
  lines.push("0", "LAYER", "2", "WALL_AREA_OUTLINE", "70", "0", "62", "3", "6", "CONTINUOUS");
  lines.push("0", "LAYER", "2", "INFERRED_WALL_CLOSURE", "70", "0", "62", "1", "6", "CONTINUOUS");
  lines.push("0", "ENDTAB", "0", "ENDSEC", "0", "SECTION", "2", "ENTITIES");

  for (const group of groups) {
    for (const segment of group.segments) {
      lines.push(
        "0", "LINE",
        "8", group.groupId,
        "62", String(dxfColorIndex(group.colorName)),
        "10", formatDxfNumber(segment.x1 * dxfScale),
        "20", formatDxfNumber(segment.y1 * dxfScale),
        "30", "0",
        "11", formatDxfNumber(segment.x2 * dxfScale),
        "21", formatDxfNumber(segment.y2 * dxfScale),
        "31", "0"
      );
    }
  }

  pushWallClosureDxfEntities(lines, wallClosureSegments, dxfScale);
  pushWallAreaDxfEntities(lines, wallAreaPolygons, dxfScale);
  lines.push("0", "ENDSEC", "0", "EOF");
  return `${lines.join("\n")}\n`;
}

function pushWallAreaDxfEntities(lines: string[], wallAreaPolygons: WallAreaPolygon[], dxfScale: number): void {
  for (const polygon of wallAreaPolygons) {
    pushWallAreaHatch(lines, polygon, dxfScale);
    lines.push(
      "0", "LWPOLYLINE",
      "8", "WALL_AREA_OUTLINE",
      "62", "3",
      "90", String(polygon.points.length),
      "70", "1"
    );
    for (const point of polygon.points) {
      lines.push(
        "10", formatDxfNumber(point.x * dxfScale),
        "20", formatDxfNumber(point.y * dxfScale)
      );
    }
  }
}

function pushWallAreaHatch(lines: string[], polygon: WallAreaPolygon, dxfScale: number): void {
  lines.push(
    "0", "HATCH",
    "8", "WALL_AREA_HATCH",
    "62", "3",
    "100", "AcDbEntity",
    "100", "AcDbHatch",
    "10", "0",
    "20", "0",
    "30", "0",
    "2", "ANSI31",
    "70", "0",
    "71", "0",
    "91", "1",
    "92", "2",
    "72", "1",
    "73", "1",
    "93", String(polygon.points.length)
  );
  for (const point of polygon.points) {
    lines.push(
      "10", formatDxfNumber(point.x * dxfScale),
      "20", formatDxfNumber(point.y * dxfScale)
    );
  }
  lines.push("97", "0", "75", "0", "76", "1", "52", "0", "41", "4", "77", "0", "78", "0", "98", "0");
}

function pushWallCenterlineDxfEntities(lines: string[], wallCenterlines: WallCenterline[], dxfScale: number): void {
  for (const centerline of wallCenterlines) {
    lines.push(
      "0", "LINE",
      "8", "WALL_CENTERLINE",
      "62", "6",
      "10", formatDxfNumber(centerline.x1 * dxfScale),
      "20", formatDxfNumber(centerline.y1 * dxfScale),
      "30", "0",
      "11", formatDxfNumber(centerline.x2 * dxfScale),
      "21", formatDxfNumber(centerline.y2 * dxfScale),
      "31", "0"
    );
  }
}

function pushWallClosureDxfEntities(lines: string[], wallClosureSegments: WallClosureSegment[], dxfScale: number): void {
  for (const segment of wallClosureSegments) {
    lines.push(
      "0", "LINE",
      "8", "INFERRED_WALL_CLOSURE",
      "62", "1",
      "10", formatDxfNumber(segment.x1 * dxfScale),
      "20", formatDxfNumber(segment.y1 * dxfScale),
      "30", "0",
      "11", formatDxfNumber(segment.x2 * dxfScale),
      "21", formatDxfNumber(segment.y2 * dxfScale),
      "31", "0"
    );
  }
}

function pushWallOpenEndDxfEntities(lines: string[], wallOpenEnds: WallEndHighlight[], dxfScale: number): void {
  pushWallEndDxfEntities(lines, wallOpenEnds, dxfScale, "WALL_OPEN_END", "1");
}

function pushWallEndDxfEntities(lines: string[], wallOpenEnds: WallEndHighlight[], dxfScale: number, layerName: string, colorIndex: string): void {
  const radius = 5 * dxfScale;
  for (const end of wallOpenEnds) {
    const x = end.x * dxfScale;
    const y = end.y * dxfScale;
    lines.push(
      "0", "CIRCLE",
      "8", layerName,
      "62", colorIndex,
      "10", formatDxfNumber(x),
      "20", formatDxfNumber(y),
      "30", "0",
      "40", formatDxfNumber(radius)
    );
    lines.push(
      "0", "LINE",
      "8", layerName,
      "62", colorIndex,
      "10", formatDxfNumber(x - radius),
      "20", formatDxfNumber(y),
      "30", "0",
      "11", formatDxfNumber(x + radius),
      "21", formatDxfNumber(y),
      "31", "0",
      "0", "LINE",
      "8", layerName,
      "62", colorIndex,
      "10", formatDxfNumber(x),
      "20", formatDxfNumber(y - radius),
      "30", "0",
      "11", formatDxfNumber(x),
      "21", formatDxfNumber(y + radius),
      "31", "0"
    );
  }
}

function createDimensionAnnotatedSvg(
  groups: StrokeWidthGroup[],
  texts: VectorTextToken[],
  dimensions: DimensionDetectionResult,
  width: number,
  height: number,
  style: { mainColor?: string; markerColor?: string; label?: string } = {}
): string {
  const mainColor = style.mainColor ?? "#facc15";
  const markerColor = style.markerColor ?? "#38bdf8";
  const label = style.label ?? "main dimension lines";
  const dimensionSegmentIds = new Set(dimensions.dimensionSegmentIds);
  const dimensionTextIds = new Set(dimensions.dimensionTextTokenIds);
  const mainDimensionSegmentIds = new Set(dimensions.dimensions.map((dimension) => dimension.mainSegmentId));
  const markerSegmentIds = new Set(dimensions.dimensions.flatMap((dimension) => dimension.markerSegmentIds));
  const segmentElements = groups.flatMap((group) => group.segments.map((segment) => {
    const isMainDimension = mainDimensionSegmentIds.has(segment.id);
    const isMarker = markerSegmentIds.has(segment.id);
    const isDimension = dimensionSegmentIds.has(segment.id);
    const stroke = isMainDimension ? mainColor : isMarker ? markerColor : segment.strokeColorHex ?? "#111827";
    const strokeWidth = isMainDimension ? 1.3 : isMarker ? 1.1 : Math.max(0.2, group.representativeStrokeWidth);
    const opacity = isDimension ? "1" : "0.34";
    return `<line x1="${round(segment.x1)}" y1="${round(height - segment.y1)}" x2="${round(segment.x2)}" y2="${round(height - segment.y2)}" stroke="${stroke}" stroke-width="${round(strokeWidth)}" stroke-linecap="round" opacity="${opacity}" />`;
  }));
  const textElements = texts.filter((text) => dimensionTextIds.has(text.id)).map((text) => {
    const svgY = height - text.y;
    const rotation = -(text.rotationDeg ?? 0);
    const fontSize = Math.max(3, round(text.fontSize));
    const paddingX = 2;
    const paddingY = 1;
    const boxWidth = Math.max(8, round(text.width + paddingX * 2));
    const boxHeight = Math.max(fontSize + 2, round(text.height + paddingY * 2));
    const x = round(text.x - paddingX);
    const y = round(svgY - boxHeight + paddingY);
    const transform = `rotate(${round(rotation)} ${round(text.x)} ${round(svgY)})`;
    return `<g transform="${transform}"><rect x="${x}" y="${y}" width="${boxWidth}" height="${boxHeight}" rx="1.5" fill="#0f172a" opacity="0.78"/><text x="${round(text.x)}" y="${round(svgY)}" font-size="${fontSize}" fill="#ffffff" font-family="Arial, sans-serif" font-weight="400">${escapeSvg(text.text)}</text></g>`;
  });
  const dimensionLegend = `<g transform="translate(12 20)"><rect width="12" height="12" fill="${mainColor}"/><text x="18" y="11" font-size="11" fill="#111">${label}: ${dimensions.dimensions.length}</text><rect x="230" width="12" height="12" fill="${markerColor}"/><text x="248" y="11" font-size="11" fill="#111">end markers: ${markerSegmentIds.size}</text><text x="370" y="11" font-size="11" fill="#111">scale ${dimensions.inferredScaleFactor ?? "unknown"}</text></g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(width)}" height="${Math.ceil(height)}" viewBox="0 0 ${Math.ceil(width)} ${Math.ceil(height)}">
<rect width="100%" height="100%" fill="white"/>
${segmentElements.join("\n")}
${textElements.join("\n")}
${dimensionLegend}
</svg>
`;
}

function createWallOpenEndsSvg(groups: StrokeWidthGroup[], wallOpenEnds: WallEndHighlight[], width: number, height: number): string {
  const segmentElements = groups.flatMap((group) => group.segments.map((segment) =>
    `<line x1="${round(segment.x1)}" y1="${round(height - segment.y1)}" x2="${round(segment.x2)}" y2="${round(height - segment.y2)}" stroke="${segment.strokeColorHex ?? group.colorHex}" stroke-width="${Math.max(0.2, group.representativeStrokeWidth)}" stroke-linecap="round" opacity="0.3" />`
  ));
  const endElements = wallOpenEnds.map((end) => {
    const x = round(end.x);
    const y = round(height - end.y);
    return `<g><circle cx="${x}" cy="${y}" r="5" fill="none" stroke="#ef4444" stroke-width="1.6"/><line x1="${round(end.x - 5)}" y1="${y}" x2="${round(end.x + 5)}" y2="${y}" stroke="#ef4444" stroke-width="1.2"/><line x1="${x}" y1="${round(y - 5)}" x2="${x}" y2="${round(y + 5)}" stroke="#ef4444" stroke-width="1.2"/></g>`;
  });
  const legend = `<g transform="translate(12 20)"><rect width="12" height="12" fill="#ef4444"/><text x="18" y="11" font-size="11" fill="#111">strict dangling wall ends: ${wallOpenEnds.length}</text></g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(width)}" height="${Math.ceil(height)}" viewBox="0 0 ${Math.ceil(width)} ${Math.ceil(height)}">
<rect width="100%" height="100%" fill="white"/>
${segmentElements.join("\n")}
${endElements.join("\n")}
${legend}
</svg>
`;
}

function createWallCenterlinesSvg(groups: StrokeWidthGroup[], wallCenterlines: WallCenterline[], width: number, height: number): string {
  const segmentElements = groups.flatMap((group) => group.segments.map((segment) =>
    `<line x1="${round(segment.x1)}" y1="${round(height - segment.y1)}" x2="${round(segment.x2)}" y2="${round(height - segment.y2)}" stroke="${segment.strokeColorHex ?? group.colorHex}" stroke-width="${Math.max(0.2, group.representativeStrokeWidth)}" stroke-linecap="round" opacity="0.24" />`
  ));
  const centerlineElements = wallCenterlines.map((centerline) =>
    `<line x1="${round(centerline.x1)}" y1="${round(height - centerline.y1)}" x2="${round(centerline.x2)}" y2="${round(height - centerline.y2)}" stroke="#d946ef" stroke-width="1.8" stroke-linecap="round" stroke-dasharray="7 4" />`
  );
  const legend = `<g transform="translate(12 20)"><rect width="12" height="12" fill="#d946ef"/><text x="18" y="11" font-size="11" fill="#111">wall centerlines: ${wallCenterlines.length}</text></g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(width)}" height="${Math.ceil(height)}" viewBox="0 0 ${Math.ceil(width)} ${Math.ceil(height)}">
<rect width="100%" height="100%" fill="white"/>
${segmentElements.join("\n")}
${centerlineElements.join("\n")}
${legend}
</svg>
`;
}

function createWallAreasSvg(
  groups: StrokeWidthGroup[],
  wallAreaPolygons: WallAreaPolygon[],
  width: number,
  height: number,
  wallClosureSegments: WallClosureSegment[] = []
): string {
  const segmentElements = groups.flatMap((group) => group.segments.map((segment) =>
    `<line x1="${round(segment.x1)}" y1="${round(height - segment.y1)}" x2="${round(segment.x2)}" y2="${round(height - segment.y2)}" stroke="${segment.strokeColorHex ?? group.colorHex}" stroke-width="${Math.max(0.2, group.representativeStrokeWidth)}" stroke-linecap="round" opacity="0.22" />`
  ));
  const areaElements = wallAreaPolygons.map((polygon) =>
    `<polygon points="${svgPolygonPoints(polygon, height)}" fill="url(#wall-area-hatch)" stroke="#16a34a" stroke-width="1.2" opacity="0.9" />`
  );
  const closureElements = createWallClosureSvgLines(wallClosureSegments, height);
  const legend = `<g transform="translate(12 20)"><rect width="12" height="12" fill="#bbf7d0" stroke="#16a34a"/><text x="18" y="11" font-size="11" fill="#111">closed wall areas: ${wallAreaPolygons.length}, inferred closures: ${wallClosureSegments.length}</text></g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(width)}" height="${Math.ceil(height)}" viewBox="0 0 ${Math.ceil(width)} ${Math.ceil(height)}">
<defs>
  <pattern id="wall-area-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
    <rect width="8" height="8" fill="#dcfce7" opacity="0.55"/>
    <line x1="0" y1="0" x2="0" y2="8" stroke="#16a34a" stroke-width="1"/>
  </pattern>
</defs>
<rect width="100%" height="100%" fill="white"/>
${segmentElements.join("\n")}
${closureElements.join("\n")}
${areaElements.join("\n")}
${legend}
</svg>
`;
}

function createDxfPreviewHtml(input: {
  pdfPath: string;
  pageNumber: number;
  stem: string;
  groups: StrokeWidthGroup[];
  texts: VectorTextToken[];
  dimensions: DimensionDetectionResult;
  wallCandidateDetection: WallCandidateDetectionResult;
  retainedWallCandidateSegmentIds: Set<string>;
  rejectedWallCandidateSegmentIds: Set<string>;
  drawingContentBounds: DrawingContentBoundsResult;
  wallOpenEnds: WallEndHighlight[];
  pageEdgeWallEnds: WallEndHighlight[];
  wallClosureSegments: WallClosureSegment[];
  wallCenterlines: WallCenterline[];
  wallAreaPolygons: WallAreaPolygon[];
  wallHatchRectangles: WallHatchRectangle[];
  width: number;
  height: number;
}): string {
  const dimensionMarkerCount = input.dimensions.dimensions.reduce((sum, dimension) => sum + dimension.markerSegmentIds.length, 0);
  const previewMeasureData = createPreviewMeasureData(input);
  const layerControls = [
    ...input.groups.map((group) => ({
      id: group.groupId,
      label: `raw ${group.groupId} (${group.colorName})`,
      color: group.colorHex,
      count: group.segments.length,
      checked: true
    })),
    { id: "wall-candidate", label: "retained wall candidates", color: "#22c55e", count: input.retainedWallCandidateSegmentIds.size, checked: true },
    { id: "ignored-wall-candidate", label: "ignored frame/isolated candidates", color: "#64748b", count: input.rejectedWallCandidateSegmentIds.size, checked: true },
    { id: "drawing-bounds", label: "tight drawing bounds", color: "#06b6d4", count: input.drawingContentBounds.tightBounds ? 1 : 0, checked: true },
    { id: "working-boundary", label: "working boundary + safety gap", color: "#2563eb", count: input.drawingContentBounds.workingBounds ? 1 : 0, checked: true },
    { id: "page-edge-guard", label: "page edge guard", color: "#94a3b8", count: 1, checked: true },
    { id: "dimension-line", label: "dimension lines", color: "#facc15", count: input.dimensions.dimensions.length, checked: true },
    { id: "dimension-marker", label: "dimension markers disabled", color: "#94a3b8", count: dimensionMarkerCount, checked: false },
    { id: "dimension-text", label: "dimension text", color: "#0f172a", count: input.dimensions.dimensionTextTokenIds.length, checked: true },
    { id: "wall-area-hatch", label: "closed wall area hatches", color: "#86efac", count: input.wallAreaPolygons.length, checked: true },
    { id: "wall-rectangle", label: "wall rectangles", color: "#0ea5e9", count: input.wallHatchRectangles.length, checked: true },
    { id: "inferred-wall-closure", label: "inferred wall closure lines", color: "#ef4444", count: input.wallClosureSegments.length, checked: true },
    { id: "wall-centerline", label: "wall centerlines", color: "#d946ef", count: input.wallCenterlines.length, checked: true },
    { id: "wall-open-end", label: "strict dangling wall ends", color: "#ef4444", count: input.wallOpenEnds.length, checked: true },
    { id: "ignored-page-edge-end", label: "ignored page-edge ends", color: "#64748b", count: input.pageEdgeWallEnds.length, checked: true }
  ];

  const controls = layerControls.map((layer) => `
      <label class="layer-toggle">
        <input type="checkbox" data-layer="${escapeHtml(layer.id)}" ${layer.checked ? "checked" : ""}>
        <span class="swatch" style="background:${escapeHtml(layer.color)}"></span>
        <span>${escapeHtml(layer.label)}</span>
        <strong>${layer.count}</strong>
      </label>`).join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(input.stem)} DXF preview</title>
  <style>
    :root { color-scheme: light; font-family: Arial, sans-serif; }
    body { margin: 0; background: #f4f6f8; color: #111827; overflow: hidden; }
    .app { display: grid; grid-template-columns: 320px minmax(0, 1fr); height: 100vh; }
    aside { background: #fff; border-right: 1px solid #d6dde6; padding: 18px; overflow: auto; }
    main { overflow: hidden; padding: 18px; height: 100vh; box-sizing: border-box; }
    h1 { font-size: 18px; margin: 0 0 4px; }
    h2 { font-size: 13px; margin: 22px 0 8px; text-transform: uppercase; color: #475569; }
    .meta { font-size: 12px; color: #475569; line-height: 1.5; overflow-wrap: anywhere; }
    .layer-toggle { display: grid; grid-template-columns: 18px 14px minmax(0, 1fr) auto; gap: 8px; align-items: center; padding: 7px 0; font-size: 13px; }
    .layer-toggle input { width: 16px; height: 16px; margin: 0; }
    .swatch { width: 12px; height: 12px; border-radius: 2px; border: 1px solid #94a3b8; }
    .links a { display: block; color: #1d4ed8; font-size: 13px; margin: 7px 0; text-decoration: none; }
    .links a:hover { text-decoration: underline; }
    .canvas-wrap { background: #fff; border: 1px solid #d6dde6; border-radius: 6px; width: 100%; height: 100%; overflow: hidden; position: relative; cursor: grab; touch-action: none; }
    .canvas-wrap.is-panning { cursor: grabbing; }
    .canvas-stage { position: relative; transform-origin: 0 0; will-change: transform; }
    svg { display: block; background: #fff; max-width: none; }
    .layer-hidden { display: none; }
    .stat-grid { display: grid; grid-template-columns: 1fr auto; gap: 6px 12px; font-size: 13px; }
    .stat-grid span:nth-child(odd) { color: #475569; }
    .zoom-controls { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; align-items: center; }
    .zoom-controls button { border: 1px solid #cbd5e1; border-radius: 4px; background: #f8fafc; padding: 7px 8px; cursor: pointer; }
    .zoom-controls button:hover { background: #e2e8f0; }
    .zoom-value { grid-column: 1 / -1; text-align: center; font-size: 12px; color: #475569; }
    .view-option { display: flex; gap: 8px; align-items: center; margin-top: 10px; font-size: 13px; color: #334155; }
    .view-option input { width: 16px; height: 16px; margin: 0; }
    .measure-controls { display: grid; gap: 8px; }
    .measure-controls button { border: 1px solid #cbd5e1; border-radius: 4px; background: #f8fafc; padding: 8px 9px; cursor: pointer; text-align: left; }
    .measure-controls button:hover { background: #e2e8f0; }
    .measure-controls button.active { background: #1d4ed8; border-color: #1d4ed8; color: white; }
    .measure-readout { border: 1px solid #d6dde6; border-radius: 4px; background: #f8fafc; padding: 8px; font-size: 12px; line-height: 1.45; color: #334155; min-height: 42px; }
    .measure-hint { font-size: 12px; line-height: 1.45; color: #64748b; }
    .canvas-wrap.is-measuring { cursor: crosshair; }
    .measure-overlay { position: absolute; inset: 0; pointer-events: none; overflow: visible; background: transparent; }
    @media (max-width: 900px) { .app { grid-template-columns: 1fr; } aside { border-right: 0; border-bottom: 1px solid #d6dde6; } }
  </style>
</head>
<body>
  <div class="app">
    <aside>
      <h1>DXF preview</h1>
      <div class="meta">${escapeHtml(input.stem)}<br>Page ${input.pageNumber}<br>${escapeHtml(input.pdfPath)}</div>
      <h2>Layers</h2>
      ${controls}
      <h2>View</h2>
      <div class="zoom-controls">
        <button type="button" data-zoom-step="-0.1">-</button>
        <button type="button" data-zoom-reset>Reset</button>
        <button type="button" data-zoom-step="0.1">+</button>
        <div class="zoom-value" id="zoomValue">100%</div>
      </div>
      <label class="view-option">
        <input type="checkbox" id="visualStrokeToggle" checked>
        <span>Preview line thickness</span>
      </label>
      <h2>Measure</h2>
      <div class="measure-controls">
        <button type="button" id="measureToggle">Measure: Off</button>
        <button type="button" id="clearMeasures">Clear measures</button>
        <div class="measure-readout" id="measureReadout">Turn on Measure, then click two snap points.</div>
        <div class="measure-hint">Snaps: corners/endpoints, perpendicular, midpoint, edge. Hold Shift for axis lock. Esc cancels current measure.</div>
      </div>
      <h2>Stats</h2>
      <div class="stat-grid">
        <span>Stroke groups</span><strong>${input.groups.length}</strong>
        <span>Dimensions</span><strong>${input.dimensions.dimensions.length}</strong>
        <span>Retained wall candidates</span><strong>${input.retainedWallCandidateSegmentIds.size}</strong>
        <span>Ignored wall candidates</span><strong>${input.rejectedWallCandidateSegmentIds.size}</strong>
        <span>Safety margin</span><strong>${input.drawingContentBounds.safetyMargin}</strong>
        <span>Max wall thickness</span><strong>${maxWallThicknessForDrawing(input.dimensions.inferredScaleFactor)}</strong>
        <span>Max wall area thickness</span><strong>${maxWallAreaThicknessForDrawing(input.dimensions.inferredScaleFactor)}</strong>
        <span>Wall area hatches</span><strong>${input.wallAreaPolygons.length}</strong>
        <span>Wall rectangles</span><strong>${input.wallHatchRectangles.length}</strong>
        <span>Inferred wall closures</span><strong>${input.wallClosureSegments.length}</strong>
        <span>Wall centerlines</span><strong>${input.wallCenterlines.length}</strong>
        <span>Strict dangling ends</span><strong>${input.wallOpenEnds.length}</strong>
        <span>Ignored page-edge ends</span><strong>${input.pageEdgeWallEnds.length}</strong>
        <span>Page edge guard</span><strong>${pageEdgeGuardMargin(input.width, input.height)}</strong>
        <span>Wall candidate groups</span><strong>${escapeHtml(input.wallCandidateDetection.candidateGroupIds.join(", ") || "none")}</strong>
        <span>Rejected components</span><strong>${input.drawingContentBounds.components.filter((component) => !component.isRetained).length}</strong>
        <span>Scale</span><strong>${input.dimensions.inferredScaleFactor ?? "unknown"}</strong>
      </div>
      <h2>Files</h2>
      <div class="links">
        <a href="./${encodeURI(input.stem)}.dxf">${escapeHtml(input.stem)}.dxf</a>
        <a href="./${encodeURI(input.stem)}-wall-centerlines.dxf">wall-centerlines.dxf</a>
        <a href="./${encodeURI(input.stem)}-wall-areas.dxf">wall-areas.dxf</a>
        <a href="./${encodeURI(input.stem)}-dimensions.dxf">dimensions.dxf</a>
        <a href="./${encodeURI(input.stem)}-segments.json">segments.json</a>
      </div>
    </aside>
    <main>
      <div class="canvas-wrap">
        <div class="canvas-stage" id="canvasStage" data-base-width="${Math.ceil(input.width)}" data-base-height="${Math.ceil(input.height)}">
${createDxfPreviewSvg(input.groups, input.texts, input.dimensions, input.retainedWallCandidateSegmentIds, input.rejectedWallCandidateSegmentIds, input.drawingContentBounds, input.wallOpenEnds, input.pageEdgeWallEnds, input.wallClosureSegments, input.wallCenterlines, input.wallAreaPolygons, input.wallHatchRectangles, input.width, input.height)}
          <svg id="measureOverlay" class="measure-overlay" width="${Math.ceil(input.width)}" height="${Math.ceil(input.height)}" viewBox="0 0 ${Math.ceil(input.width)} ${Math.ceil(input.height)}"></svg>
        </div>
      </div>
    </main>
  </div>
  <script>
    for (const input of document.querySelectorAll('[data-layer]')) {
      const sync = () => {
        const layer = input.getAttribute('data-layer');
        for (const element of document.querySelectorAll('[data-layer-name="' + layer + '"]')) {
          element.classList.toggle('layer-hidden', !input.checked);
        }
      };
      input.addEventListener('change', sync);
      sync();
    }
    const previewMeasureData = ${scriptJson(previewMeasureData)};
    const canvasWrap = document.querySelector('.canvas-wrap');
    const stage = document.getElementById('canvasStage');
    const zoomValue = document.getElementById('zoomValue');
    const measureToggle = document.getElementById('measureToggle');
    const clearMeasures = document.getElementById('clearMeasures');
    const measureReadout = document.getElementById('measureReadout');
    const measureOverlay = document.getElementById('measureOverlay');
    const visualStrokeToggle = document.getElementById('visualStrokeToggle');
    let zoom = 1;
    let panX = 0;
    let panY = 0;
    let isPanning = false;
    let panStartX = 0;
    let panStartY = 0;
    let startPanX = 0;
    let startPanY = 0;
    const clampZoom = (value) => Math.max(0.25, Math.min(6, value));
    const visualLineElements = Array.from(stage.querySelectorAll('line'));
    for (const line of visualLineElements) {
      line.dataset.previewStrokeWidth = line.getAttribute('stroke-width') || '1';
    }
    const syncVisualStrokeWidths = () => {
      const usePreviewThickness = visualStrokeToggle.checked;
      for (const line of visualLineElements) {
        line.setAttribute('stroke-width', usePreviewThickness ? line.dataset.previewStrokeWidth : '0.35');
        line.setAttribute('vector-effect', 'non-scaling-stroke');
      }
    };
    visualStrokeToggle.addEventListener('change', syncVisualStrokeWidths);
    const applyViewport = () => {
      const baseWidth = Number(stage.dataset.baseWidth);
      const baseHeight = Number(stage.dataset.baseHeight);
      stage.style.width = Math.ceil(baseWidth) + 'px';
      stage.style.height = Math.ceil(baseHeight) + 'px';
      stage.style.transform = 'translate(' + panX + 'px, ' + panY + 'px) scale(' + zoom + ')';
      zoomValue.textContent = Math.round(zoom * 100) + '%';
      renderMeasures();
    };
    syncVisualStrokeWidths();
    const zoomAt = (nextZoom, clientX, clientY) => {
      const next = clampZoom(nextZoom);
      const rect = canvasWrap.getBoundingClientRect();
      const localX = clientX - rect.left;
      const localY = clientY - rect.top;
      const worldX = (localX - panX) / zoom;
      const worldY = (localY - panY) / zoom;
      zoom = next;
      panX = localX - worldX * zoom;
      panY = localY - worldY * zoom;
      applyViewport();
    };
    const svgNs = 'http://www.w3.org/2000/svg';
    let measureEnabled = false;
    let firstMeasurePoint = null;
    let hoverMeasurePoint = null;
    const savedMeasures = [];
    const formatMeasure = (distanceUnits) => {
      if (!previewMeasureData.scaleFactor) return Math.round(distanceUnits * 10) / 10 + ' drawing units';
      return Math.round(distanceUnits * previewMeasureData.scaleFactor) + ' mm';
    };
    const formatPoint = (point) => {
      if (!previewMeasureData.scaleFactor) return Math.round(point.x * 10) / 10 + ', ' + Math.round(point.y * 10) / 10;
      return Math.round(point.x * previewMeasureData.scaleFactor) + ', ' + Math.round((previewMeasureData.height - point.y) * previewMeasureData.scaleFactor) + ' mm';
    };
    const snapPointToMeasureGrid = (point) => {
      if (!previewMeasureData.scaleFactor) return point;
      const grid = previewMeasureData.pointGridSizeMm || 1;
      return {
        x: Math.round((point.x * previewMeasureData.scaleFactor) / grid) * grid / previewMeasureData.scaleFactor,
        y: previewMeasureData.height - Math.round(((previewMeasureData.height - point.y) * previewMeasureData.scaleFactor) / grid) * grid / previewMeasureData.scaleFactor
      };
    };
    const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const localPointFromEvent = (event) => {
      const rect = canvasWrap.getBoundingClientRect();
      return {
        x: (event.clientX - rect.left - panX) / zoom,
        y: (event.clientY - rect.top - panY) / zoom
      };
    };
    const isLayerVisible = (layer) => {
      const input = document.querySelector('[data-layer="' + layer + '"]');
      return !input || input.checked;
    };
    const closestPointOnSegment = (point, segment) => {
      const vx = segment.x2 - segment.x1;
      const vy = segment.y2 - segment.y1;
      const lenSq = vx * vx + vy * vy;
      if (lenSq <= 1e-9) return { x: segment.x1, y: segment.y1, t: 0 };
      const t = Math.max(0, Math.min(1, ((point.x - segment.x1) * vx + (point.y - segment.y1) * vy) / lenSq));
      return { x: segment.x1 + vx * t, y: segment.y1 + vy * t, t };
    };
    const axisLockPoint = (origin, point) => {
      const dx = Math.abs(point.x - origin.x);
      const dy = Math.abs(point.y - origin.y);
      return dx >= dy ? { x: point.x, y: origin.y } : { x: origin.x, y: point.y };
    };
    const snapPoint = (rawInputPoint, firstPoint, event) => {
      const rawPoint = snapPointToMeasureGrid(rawInputPoint);
      const threshold = 18 / zoom;
      let best = {
        kind: 'free',
        point: rawPoint,
        distance: threshold + 1,
        priority: 99,
        source: null,
        segment: null
      };
      const consider = (kind, point, segment, priority) => {
        const d = distance(rawPoint, point);
        if (d > threshold) return;
        if (priority < best.priority || (priority === best.priority && d < best.distance)) {
          best = { kind, point, distance: d, priority, source: segment ? segment.source : null, segment };
        }
      };
      for (const segment of previewMeasureData.segments) {
        if (!isLayerVisible(segment.source)) continue;
        const a = { x: segment.x1, y: segment.y1 };
        const b = { x: segment.x2, y: segment.y2 };
        consider('endpoint', a, segment, 0);
        consider('endpoint', b, segment, 0);
        if (firstPoint) {
          const perpendicular = closestPointOnSegment(firstPoint, segment);
          if (perpendicular.t > 0 && perpendicular.t < 1) {
            consider('perpendicular', perpendicular, segment, 1);
          }
        }
        consider('midpoint', { x: (segment.x1 + segment.x2) / 2, y: (segment.y1 + segment.y2) / 2 }, segment, 2);
        const edge = closestPointOnSegment(rawPoint, segment);
        if (edge.t > 0 && edge.t < 1) consider('edge', edge, segment, 3);
      }
      if (firstPoint && event.shiftKey) {
        return { kind: 'axis', point: axisLockPoint(firstPoint, best.point), source: best.source, segment: best.segment };
      }
      return best.distance <= threshold ? best : { kind: 'free', point: rawPoint, source: null, segment: null };
    };
    const svgEl = (name, attrs) => {
      const element = document.createElementNS(svgNs, name);
      for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, String(value));
      return element;
    };
    const addMeasureLine = (a, b, color, label) => {
      const line = svgEl('line', {
        x1: a.x,
        y1: a.y,
        x2: b.x,
        y2: b.y,
        stroke: color,
        'stroke-width': 2,
        'vector-effect': 'non-scaling-stroke',
        'stroke-linecap': 'round'
      });
      measureOverlay.appendChild(line);
      const radius = Math.max(1.2, 4 / zoom);
      measureOverlay.appendChild(svgEl('circle', { cx: a.x, cy: a.y, r: radius, fill: color, 'fill-opacity': 0.95 }));
      measureOverlay.appendChild(svgEl('circle', { cx: b.x, cy: b.y, r: radius, fill: color, 'fill-opacity': 0.95 }));
      const text = svgEl('text', {
        x: (a.x + b.x) / 2 + 8 / zoom,
        y: (a.y + b.y) / 2 - 8 / zoom,
        'font-size': Math.max(3, 13 / zoom),
        'font-family': 'Arial, sans-serif',
        'font-weight': 700,
        fill: color,
        stroke: 'white',
        'stroke-width': 3 / zoom,
        'paint-order': 'stroke'
      });
      text.textContent = label;
      measureOverlay.appendChild(text);
    };
    const renderMeasures = () => {
      measureOverlay.replaceChildren();
      for (const item of savedMeasures) addMeasureLine(item.a, item.b, '#1d4ed8', formatMeasure(distance(item.a, item.b)));
      if (firstMeasurePoint) {
        measureOverlay.appendChild(svgEl('circle', {
          cx: firstMeasurePoint.x,
          cy: firstMeasurePoint.y,
          r: Math.max(1.5, 5 / zoom),
          fill: '#dc2626',
          'fill-opacity': 0.95
        }));
      }
      if (firstMeasurePoint && hoverMeasurePoint) {
        addMeasureLine(firstMeasurePoint, hoverMeasurePoint.point, '#dc2626', formatMeasure(distance(firstMeasurePoint, hoverMeasurePoint.point)));
      }
      if (hoverMeasurePoint && hoverMeasurePoint.kind !== 'free') {
        measureOverlay.appendChild(svgEl('circle', {
          cx: hoverMeasurePoint.point.x,
          cy: hoverMeasurePoint.point.y,
          r: Math.max(1.5, 6 / zoom),
          fill: 'none',
          stroke: '#f97316',
          'stroke-width': 2,
          'vector-effect': 'non-scaling-stroke'
        }));
      }
    };
    const setMeasureEnabled = (enabled) => {
      measureEnabled = enabled;
      measureToggle.classList.toggle('active', measureEnabled);
      canvasWrap.classList.toggle('is-measuring', measureEnabled);
      measureToggle.textContent = measureEnabled ? 'Measure: On' : 'Measure: Off';
      if (!measureEnabled) {
        firstMeasurePoint = null;
        hoverMeasurePoint = null;
      }
      measureReadout.textContent = measureEnabled
        ? 'Click first snap point. Wheel still zooms; drag is disabled while measuring.'
        : 'Turn on Measure, then click two snap points.';
      renderMeasures();
    };
    measureToggle.addEventListener('click', () => setMeasureEnabled(!measureEnabled));
    clearMeasures.addEventListener('click', () => {
      savedMeasures.length = 0;
      firstMeasurePoint = null;
      hoverMeasurePoint = null;
      measureReadout.textContent = measureEnabled ? 'Measures cleared. Click first snap point.' : 'Measures cleared.';
      renderMeasures();
    });
    window.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      firstMeasurePoint = null;
      hoverMeasurePoint = null;
      measureReadout.textContent = measureEnabled ? 'Measure cancelled. Click first snap point.' : '';
      renderMeasures();
    });
    for (const button of document.querySelectorAll('[data-zoom-step]')) {
      button.addEventListener('click', () => {
        const rect = canvasWrap.getBoundingClientRect();
        zoomAt(zoom + Number(button.getAttribute('data-zoom-step')), rect.left + rect.width / 2, rect.top + rect.height / 2);
      });
    }
    document.querySelector('[data-zoom-reset]').addEventListener('click', () => {
      zoom = 1;
      panX = 0;
      panY = 0;
      applyViewport();
    });
    canvasWrap.addEventListener('wheel', (event) => {
      event.preventDefault();
      zoomAt(zoom * (event.deltaY < 0 ? 1.12 : 0.88), event.clientX, event.clientY);
    }, { passive: false });
    canvasWrap.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      if (measureEnabled) {
        const snapped = snapPoint(localPointFromEvent(event), firstMeasurePoint, event);
        if (!firstMeasurePoint) {
          firstMeasurePoint = snapped.point;
          measureReadout.textContent = 'First point: ' + formatPoint(firstMeasurePoint) + ' (' + snapped.kind + '). Click second point.';
        } else {
          const second = snapped.point;
          savedMeasures.push({ a: firstMeasurePoint, b: second });
          measureReadout.textContent = 'Measured ' + formatMeasure(distance(firstMeasurePoint, second)) + ' (' + snapped.kind + '). Click next second point or Esc to reset.';
          firstMeasurePoint = second;
        }
        hoverMeasurePoint = snapped;
        renderMeasures();
        return;
      }
      isPanning = true;
      panStartX = event.clientX;
      panStartY = event.clientY;
      startPanX = panX;
      startPanY = panY;
      canvasWrap.classList.add('is-panning');
      canvasWrap.setPointerCapture(event.pointerId);
    });
    canvasWrap.addEventListener('pointermove', (event) => {
      if (measureEnabled) {
        hoverMeasurePoint = snapPoint(localPointFromEvent(event), firstMeasurePoint, event);
        if (firstMeasurePoint) {
          measureReadout.textContent = 'Measure: ' + formatMeasure(distance(firstMeasurePoint, hoverMeasurePoint.point)) + ' (' + hoverMeasurePoint.kind + ')';
        } else {
          measureReadout.textContent = 'Hover: ' + formatPoint(hoverMeasurePoint.point) + ' (' + hoverMeasurePoint.kind + ')';
        }
        renderMeasures();
        return;
      }
      if (!isPanning) return;
      panX = startPanX + event.clientX - panStartX;
      panY = startPanY + event.clientY - panStartY;
      applyViewport();
    });
    canvasWrap.addEventListener('pointerup', (event) => {
      if (!isPanning) return;
      isPanning = false;
      canvasWrap.classList.remove('is-panning');
      canvasWrap.releasePointerCapture(event.pointerId);
    });
    applyViewport();
  </script>
</body>
</html>
`;
}

function createPreviewMeasureData(input: {
  groups: StrokeWidthGroup[];
  dimensions: DimensionDetectionResult;
  retainedWallCandidateSegmentIds: Set<string>;
  wallClosureSegments: WallClosureSegment[];
  wallCenterlines: WallCenterline[];
  wallAreaPolygons: WallAreaPolygon[];
  wallHatchRectangles: WallHatchRectangle[];
  height: number;
}): { scaleFactor: number | null; pointGridSizeMm: number; height: number; segments: PreviewSnapSegment[] } {
  const segments: PreviewSnapSegment[] = [];
  const pointGridSizeMm = 1;
  const snapCoordinate = (value: number) => input.dimensions.inferredScaleFactor
    ? round(Math.round((value * input.dimensions.inferredScaleFactor) / pointGridSizeMm) * pointGridSizeMm / input.dimensions.inferredScaleFactor)
    : round(value);
  const addSegment = (id: string, source: string, x1: number, y1: number, x2: number, y2: number) => {
    const snapped = {
      x1: snapCoordinate(x1),
      y1: snapCoordinate(y1),
      x2: snapCoordinate(x2),
      y2: snapCoordinate(y2)
    };
    if (Math.hypot(snapped.x2 - snapped.x1, snapped.y2 - snapped.y1) < 0.001) return;
    segments.push({
      id,
      source,
      x1: snapped.x1,
      y1: round(input.height - snapped.y1),
      x2: snapped.x2,
      y2: round(input.height - snapped.y2)
    });
  };

  for (const group of input.groups) {
    for (const segment of group.segments) {
      if (input.retainedWallCandidateSegmentIds.has(segment.id)) {
        addSegment(segment.id, "wall-candidate", segment.x1, segment.y1, segment.x2, segment.y2);
      }
    }
  }

  const mainDimensionSegmentIds = new Set(input.dimensions.dimensions.map((dimension) => dimension.mainSegmentId));
  for (const group of input.groups) {
    for (const segment of group.segments) {
      if (mainDimensionSegmentIds.has(segment.id)) {
        addSegment(segment.id, "dimension-line", segment.x1, segment.y1, segment.x2, segment.y2);
      }
    }
  }

  for (const segment of input.wallClosureSegments) {
    addSegment(segment.id, "inferred-wall-closure", segment.x1, segment.y1, segment.x2, segment.y2);
  }

  for (const centerline of input.wallCenterlines) {
    addSegment(centerline.id, "wall-centerline", centerline.x1, centerline.y1, centerline.x2, centerline.y2);
  }

  for (const polygon of input.wallAreaPolygons) {
    for (let index = 0; index < polygon.points.length; index += 1) {
      const start = polygon.points[index];
      const end = polygon.points[(index + 1) % polygon.points.length];
      addSegment(`${polygon.id}_edge_${index + 1}`, "wall-area-hatch", start.x, start.y, end.x, end.y);
    }
  }

  for (const rectangle of input.wallHatchRectangles) {
    const { xMin, xMax, yMin, yMax } = rectangle.bounds;
    addSegment(`${rectangle.id}_top`, "wall-rectangle", xMin, yMax, xMax, yMax);
    addSegment(`${rectangle.id}_right`, "wall-rectangle", xMax, yMax, xMax, yMin);
    addSegment(`${rectangle.id}_bottom`, "wall-rectangle", xMax, yMin, xMin, yMin);
    addSegment(`${rectangle.id}_left`, "wall-rectangle", xMin, yMin, xMin, yMax);
  }

  return {
    scaleFactor: input.dimensions.inferredScaleFactor ?? null,
    pointGridSizeMm,
    height: round(input.height),
    segments
  };
}

function createDxfPreviewSvg(
  groups: StrokeWidthGroup[],
  texts: VectorTextToken[],
  dimensions: DimensionDetectionResult,
  wallCandidateSegmentIds: Set<string>,
  rejectedWallCandidateSegmentIds: Set<string>,
  drawingContentBounds: DrawingContentBoundsResult,
  wallOpenEnds: WallEndHighlight[],
  pageEdgeWallEnds: WallEndHighlight[],
  wallClosureSegments: WallClosureSegment[],
  wallCenterlines: WallCenterline[],
  wallAreaPolygons: WallAreaPolygon[],
  wallHatchRectangles: WallHatchRectangle[],
  width: number,
  height: number
): string {
  const dimensionTextIds = new Set(dimensions.dimensionTextTokenIds);
  const mainDimensionSegmentIds = new Set(dimensions.dimensions.map((dimension) => dimension.mainSegmentId));
  const markerSegmentIds = new Set(dimensions.dimensions.flatMap((dimension) => dimension.markerSegmentIds));
  const groupLayers = groups.map((group) => {
    const lines = group.segments
      .map((segment) => `<line x1="${round(segment.x1)}" y1="${round(height - segment.y1)}" x2="${round(segment.x2)}" y2="${round(height - segment.y2)}" stroke="${segment.strokeColorHex ?? group.colorHex}" stroke-width="${Math.max(0.2, group.representativeStrokeWidth)}" stroke-linecap="round" opacity="0.46" />`);
    return `<g data-layer-name="${escapeHtml(group.groupId)}">${lines.join("\n")}</g>`;
  });
  const wallCandidateLines = groups.flatMap((group) => group.segments
    .filter((segment) => wallCandidateSegmentIds.has(segment.id))
    .map((segment) => `<line x1="${round(segment.x1)}" y1="${round(height - segment.y1)}" x2="${round(segment.x2)}" y2="${round(height - segment.y2)}" stroke="#22c55e" stroke-width="${Math.max(0.9, group.representativeStrokeWidth + 0.35)}" stroke-linecap="round" opacity="0.9" />`)
  );
  const rejectedWallCandidateLines = groups.flatMap((group) => group.segments
    .filter((segment) => rejectedWallCandidateSegmentIds.has(segment.id))
    .map((segment) => `<line x1="${round(segment.x1)}" y1="${round(height - segment.y1)}" x2="${round(segment.x2)}" y2="${round(height - segment.y2)}" stroke="#64748b" stroke-width="${Math.max(0.9, group.representativeStrokeWidth + 0.35)}" stroke-linecap="round" stroke-dasharray="6 4" opacity="0.95" />`)
  );
  const drawingBounds = drawingContentBounds.bounds
    ? `<rect x="${round(drawingContentBounds.tightBounds?.xMin ?? drawingContentBounds.bounds.xMin)}" y="${round(height - (drawingContentBounds.tightBounds?.yMax ?? drawingContentBounds.bounds.yMax))}" width="${round((drawingContentBounds.tightBounds?.xMax ?? drawingContentBounds.bounds.xMax) - (drawingContentBounds.tightBounds?.xMin ?? drawingContentBounds.bounds.xMin))}" height="${round((drawingContentBounds.tightBounds?.yMax ?? drawingContentBounds.bounds.yMax) - (drawingContentBounds.tightBounds?.yMin ?? drawingContentBounds.bounds.yMin))}" fill="none" stroke="#06b6d4" stroke-width="2" stroke-dasharray="10 5" opacity="0.9" />`
    : "";
  const workingBoundary = drawingContentBounds.workingBounds
    ? `<rect x="${round(drawingContentBounds.workingBounds.xMin)}" y="${round(height - drawingContentBounds.workingBounds.yMax)}" width="${round(drawingContentBounds.workingBounds.xMax - drawingContentBounds.workingBounds.xMin)}" height="${round(drawingContentBounds.workingBounds.yMax - drawingContentBounds.workingBounds.yMin)}" fill="none" stroke="#2563eb" stroke-width="2.4" stroke-dasharray="14 6" opacity="0.95" />`
    : "";
  const guard = pageEdgeGuardMargin(width, height);
  const pageEdgeGuard = `<rect x="${guard}" y="${guard}" width="${round(width - guard * 2)}" height="${round(height - guard * 2)}" fill="none" stroke="#94a3b8" stroke-width="1.6" stroke-dasharray="4 4" opacity="0.75" />`;
  const dimensionLines = groups.flatMap((group) => group.segments
    .filter((segment) => mainDimensionSegmentIds.has(segment.id))
    .map((segment) => `<line x1="${round(segment.x1)}" y1="${round(height - segment.y1)}" x2="${round(segment.x2)}" y2="${round(height - segment.y2)}" stroke="#facc15" stroke-width="1.4" stroke-linecap="round" />`)
  );
  const dimensionMarkers = groups.flatMap((group) => group.segments
    .filter((segment) => markerSegmentIds.has(segment.id))
    .map((segment) => `<line x1="${round(segment.x1)}" y1="${round(height - segment.y1)}" x2="${round(segment.x2)}" y2="${round(height - segment.y2)}" stroke="#38bdf8" stroke-width="1.1" stroke-linecap="round" />`)
  );
  const dimensionTexts = texts.filter((text) => dimensionTextIds.has(text.id)).map((text) => {
    const svgY = height - text.y;
    const rotation = -(text.rotationDeg ?? 0);
    const fontSize = Math.max(3, round(text.fontSize));
    const transform = `rotate(${round(rotation)} ${round(text.x)} ${round(svgY)})`;
    return `<g transform="${transform}"><text x="${round(text.x)}" y="${round(svgY)}" font-size="${fontSize}" fill="#0f172a" font-family="Arial, sans-serif" font-weight="500">${escapeSvg(text.text)}</text></g>`;
  });
  const centerlines = wallCenterlines.map((centerline) =>
    `<line x1="${round(centerline.x1)}" y1="${round(height - centerline.y1)}" x2="${round(centerline.x2)}" y2="${round(height - centerline.y2)}" stroke="#d946ef" stroke-width="1.8" stroke-linecap="round" stroke-dasharray="7 4" />`
  );
  const wallAreas = wallAreaPolygons.map((polygon) =>
    `<polygon points="${svgPolygonPoints(polygon, height)}" fill="url(#wall-area-preview-hatch)" stroke="#16a34a" stroke-width="1.2" opacity="0.9"><title>${escapeSvg(`${polygon.id}: thickness ${polygon.estimatedThickness}, confidence ${polygon.confidence}`)}</title></polygon>`
  );
  const wallRectangles = wallHatchRectangles.map((rectangle) =>
    `<rect x="${round(rectangle.bounds.xMin)}" y="${round(height - rectangle.bounds.yMax)}" width="${round(rectangle.bounds.xMax - rectangle.bounds.xMin)}" height="${round(rectangle.bounds.yMax - rectangle.bounds.yMin)}" fill="#0ea5e9" fill-opacity="0.1" stroke="#0284c7" stroke-width="0.55" stroke-opacity="0.65"><title>${escapeSvg(`${rectangle.id}: ${rectangle.sourceWallAreaId}, area ${rectangle.area}`)}</title></rect>`
  );
  const closureLines = createWallClosureSvgLines(wallClosureSegments, height);
  const openEnds = wallOpenEnds.map((end) => {
    const x = round(end.x);
    const y = round(height - end.y);
    return `<g><circle cx="${x}" cy="${y}" r="5" fill="none" stroke="#ef4444" stroke-width="1.6"/><line x1="${round(end.x - 5)}" y1="${y}" x2="${round(end.x + 5)}" y2="${y}" stroke="#ef4444" stroke-width="1.2"/><line x1="${x}" y1="${round(y - 5)}" x2="${x}" y2="${round(y + 5)}" stroke="#ef4444" stroke-width="1.2"/></g>`;
  });
  const ignoredPageEdgeEnds = pageEdgeWallEnds.map((end) => {
    const x = round(end.x);
    const y = round(height - end.y);
    return `<g><circle cx="${x}" cy="${y}" r="6" fill="none" stroke="#64748b" stroke-width="1.6"/><line x1="${round(end.x - 5)}" y1="${round(y - 5)}" x2="${round(end.x + 5)}" y2="${round(y + 5)}" stroke="#64748b" stroke-width="1.4"/><line x1="${round(end.x - 5)}" y1="${round(y + 5)}" x2="${round(end.x + 5)}" y2="${round(y - 5)}" stroke="#64748b" stroke-width="1.4"/></g>`;
  });

  return `        <svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(width)}" height="${Math.ceil(height)}" viewBox="0 0 ${Math.ceil(width)} ${Math.ceil(height)}">
          <defs>
            <pattern id="wall-area-preview-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="8" height="8" fill="#dcfce7" opacity="0.55"/>
              <line x1="0" y1="0" x2="0" y2="8" stroke="#16a34a" stroke-width="1"/>
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="white"/>
          ${groupLayers.join("\n")}
          <g data-layer-name="wall-candidate">${wallCandidateLines.join("\n")}</g>
          <g data-layer-name="ignored-wall-candidate">${rejectedWallCandidateLines.join("\n")}</g>
          <g data-layer-name="drawing-bounds">${drawingBounds}</g>
          <g data-layer-name="working-boundary">${workingBoundary}</g>
          <g data-layer-name="page-edge-guard">${pageEdgeGuard}</g>
          <g data-layer-name="dimension-line">${dimensionLines.join("\n")}</g>
          <g data-layer-name="dimension-marker">${dimensionMarkers.join("\n")}</g>
          <g data-layer-name="dimension-text">${dimensionTexts.join("\n")}</g>
          <g data-layer-name="wall-area-hatch">${wallAreas.join("\n")}</g>
          <g data-layer-name="wall-rectangle">${wallRectangles.join("\n")}</g>
          <g data-layer-name="inferred-wall-closure">${closureLines.join("\n")}</g>
          <g data-layer-name="wall-centerline">${centerlines.join("\n")}</g>
          <g data-layer-name="wall-open-end">${openEnds.join("\n")}</g>
          <g data-layer-name="ignored-page-edge-end">${ignoredPageEdgeEnds.join("\n")}</g>
        </svg>`;
}

function createWallClosureSvgLines(wallClosureSegments: WallClosureSegment[], height: number): string[] {
  return wallClosureSegments.map((segment) =>
    `<line x1="${round(segment.x1)}" y1="${round(height - segment.y1)}" x2="${round(segment.x2)}" y2="${round(height - segment.y2)}" stroke="#ef4444" stroke-width="2.2" stroke-linecap="round" opacity="0.95"><title>${escapeSvg(segment.reasons.join("; "))}</title></line>`
  );
}

function svgPolygonPoints(polygon: WallAreaPolygon, height: number): string {
  return polygon.points.map((point) => `${round(point.x)},${round(height - point.y)}`).join(" ");
}

function escapeSvg(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;");
}

function escapeHtml(value: string): string {
  return escapeSvg(value);
}

function scriptJson(value: unknown): string {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function formatDxfNumber(value: number): string {
  return String(round(value));
}

function dxfColorIndex(colorName: string): number {
  if (colorName === "red") return 1;
  if (colorName === "yellow") return 2;
  if (colorName === "green") return 3;
  if (colorName === "cyan") return 4;
  if (colorName === "blue") return 5;
  if (colorName === "purple" || colorName === "pink") return 6;
  if (colorName === "slate") return 8;
  if (colorName === "orange" || colorName === "lime") return 30;
  return 7;
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
