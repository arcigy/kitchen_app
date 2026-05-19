import type { PdfVectorExtractionResult } from "./pdfVectorExtractor";
import { bboxCenter } from "./geometryUtils";
import type { DimensionDetectionResult } from "./dimensionDetector";
import type { WallCandidate, WallDetectionResult } from "./wallCandidateDetector";

export function renderWallDebugOverlay(
  extraction: PdfVectorExtractionResult,
  detection: WallDetectionResult,
  reviewState: WallReviewState = {},
  options: { samplePickEnabled?: boolean; dimensions?: DimensionDetectionResult | null } = {}
): string {
  const allObjects = extraction.objects.filter((object) => object.paintOperation === "stroke").map((object) => {
    const strokeWidth = Math.max(0.5, object.strokeWidth);

    if (object.segments.length === 0) return "";

    const sampleAttrs = options.samplePickEnabled
      ? `data-vector-id="${object.id}" data-vector-stroke-width="${object.strokeWidth}" data-vector-kind="${object.kind}"`
      : "";

    const segments = object.segments.map((segment) => `
      <line
        x1="${segment.start.x}"
        y1="${segment.start.y}"
        x2="${segment.end.x}"
        y2="${segment.end.y}"
        class="pdf-vector-object"
        stroke-width="${strokeWidth}"
        vector-effect="non-scaling-stroke"
      />
    `).join("");

    return `<g ${sampleAttrs}>${segments}</g>`;
  }).join("");

  const unresolvedBoundaryIds = new Set(detection.unresolvedWallBoundaries.map((boundary) => boundary.boundaryId));
  const wallCandidates = detection.walls.map((wall, index) => {
    const center = bboxCenter(wall.bbox);
    const status = reviewState[wall.id] ?? "unreviewed";
    const unresolved = detection.unresolvedWallBoundaries.find((boundary) => boundary.boundaryId === wall.id);
    const coverageClass = unresolvedBoundaryIds.has(wall.id) ? "pdf-wall-unresolved-boundary" : "pdf-wall-covered-boundary";
    return `
    <g class="pdf-wall-candidate ${coverageClass} pdf-wall-${status}" data-wall-id="${wall.id}" tabindex="0">
      <line
        x1="${wall.centerline.start.x}"
        y1="${wall.centerline.start.y}"
        x2="${wall.centerline.end.x}"
        y2="${wall.centerline.end.y}"
        stroke-width="${Math.max(3, wall.strokeWidth)}"
        vector-effect="non-scaling-stroke"
      />
      <rect
        x="${wall.bbox.x}"
        y="${wall.bbox.y}"
        width="${wall.bbox.width}"
        height="${wall.bbox.height}"
        vector-effect="non-scaling-stroke"
      />
      <text
        x="${center.x}"
        y="${center.y}"
        class="pdf-wall-label"
        text-anchor="middle"
        dominant-baseline="central"
        vector-effect="non-scaling-stroke"
      >W${index + 1}</text>
      <text
        x="${center.x}"
        y="${center.y + 16}"
        class="pdf-wall-unresolved-reason"
        text-anchor="middle"
        dominant-baseline="central"
        vector-effect="non-scaling-stroke"
      >${unresolved ? escapeHtml(unresolved.reason) : ""}</text>
    </g>
  `;
  }).join("");

  const wallRectangles = detection.wallRectangles.map((rectangle, index) => {
    const points = rectangle.polygon.map((point) => `${point.x},${point.y}`).join(" ");
    const center = bboxCenter(rectangle.bbox);
    return `
      <g class="pdf-wall-rectangle">
        <polygon points="${points}" vector-effect="non-scaling-stroke" />
        ${rectangle.autoClosedEdges.map((edge) => `
          <line
            class="pdf-wall-rectangle-auto-edge"
            x1="${edge.start.x}"
            y1="${edge.start.y}"
            x2="${edge.end.x}"
            y2="${edge.end.y}"
            vector-effect="non-scaling-stroke"
          />
        `).join("")}
        <text
          x="${center.x}"
          y="${center.y}"
          class="pdf-wall-rectangle-label"
          text-anchor="middle"
          dominant-baseline="central"
          vector-effect="non-scaling-stroke"
        >R${index + 1}</text>
      </g>
    `;
  }).join("");

  const textObjects = (extraction.texts ?? []).map((text) => `
    <text
      x="${text.x}"
      y="${text.y}"
      class="pdf-text-object"
      font-size="${Math.max(2, text.fontSize)}"
      vector-effect="non-scaling-stroke"
    >${escapeHtml(text.value)}</text>
  `).join("");

  const dimensionObjects = (options.dimensions?.dimensions ?? []).map((dimension) => `
    <g class="pdf-dimension-candidate">
      ${dimension.attachments.map((attachment) => `
        <line
          class="pdf-dimension-attachment"
          x1="${attachment.line.start.x}"
          y1="${attachment.line.start.y}"
          x2="${attachment.line.end.x}"
          y2="${attachment.line.end.y}"
          vector-effect="non-scaling-stroke"
        />
      `).join("")}
      <line
        x1="${dimension.line.start.x}"
        y1="${dimension.line.start.y}"
        x2="${dimension.line.end.x}"
        y2="${dimension.line.end.y}"
        vector-effect="non-scaling-stroke"
      />
      <circle cx="${dimension.text.x}" cy="${dimension.text.y}" r="28" vector-effect="non-scaling-stroke" />
      <text
        x="${dimension.text.x}"
        y="${dimension.text.y}"
        class="pdf-dimension-label"
        text-anchor="middle"
        dominant-baseline="central"
        vector-effect="non-scaling-stroke"
      >${escapeHtml(dimension.text.value)}</text>
    </g>
  `).join("");

  return `
    <div class="pdf-wall-debug">
      <svg viewBox="0 0 ${extraction.width} ${extraction.height}" role="img" aria-label="PDF vector wall extraction debug">
        ${extraction.backgroundDataUrl ? `<image href="${extraction.backgroundDataUrl}" x="0" y="0" width="${extraction.width}" height="${extraction.height}" />` : ""}
        <g class="pdf-vector-layer">${allObjects}</g>
        <g class="pdf-text-layer">${textObjects}</g>
        <g class="pdf-dimension-layer">${dimensionObjects}</g>
        <g class="pdf-wall-layer">${wallCandidates}</g>
        <g class="pdf-wall-rectangle-layer">${wallRectangles}</g>
      </svg>
    </div>
  `;
}

export function renderWallJson(detection: WallDetectionResult): string {
  return `<pre class="pdf-wall-json">${escapeHtml(JSON.stringify(detection, null, 2))}</pre>`;
}

export type WallReviewStatus = "accepted" | "rejected" | "unreviewed";
export type WallReviewState = Record<string, Exclude<WallReviewStatus, "unreviewed">>;

export interface WallReviewExport {
  acceptedWalls: WallCandidate[];
  rejectedWallCandidates: WallCandidate[];
  unreviewedWallCandidates: WallCandidate[];
}

export function createWallReviewExport(
  detection: WallDetectionResult,
  reviewState: WallReviewState
): WallReviewExport {
  return {
    acceptedWalls: detection.walls.filter((wall) => reviewState[wall.id] === "accepted"),
    rejectedWallCandidates: detection.walls.filter((wall) => reviewState[wall.id] === "rejected"),
    unreviewedWallCandidates: detection.walls.filter((wall) => !reviewState[wall.id])
  };
}

export function renderWallInspector(
  wall: WallCandidate | null,
  status: WallReviewStatus
): string {
  if (!wall) {
    return `<div class="pdf-wall-inspector-empty">Click a wall candidate to inspect it.</div>`;
  }

  return `
    <div class="pdf-wall-inspector-card">
      <div class="pdf-wall-inspector-title">
        <strong>${escapeHtml(wall.id)}</strong>
        <span>${status}</span>
      </div>
      ${renderKeyValue("confidence", wall.confidence)}
      ${renderKeyValue("strokeWidth", wall.strokeWidth)}
      ${renderKeyValue("length", wall.length)}
      ${renderKeyValue("realWorldLength", wall.realWorldLength)}
      ${renderKeyValue("orientation", wall.orientation)}
      ${renderKeyValue("bbox", wall.bbox)}
      ${renderKeyValue("centerline.start", wall.centerline.start)}
      ${renderKeyValue("centerline.end", wall.centerline.end)}
      <h3>Reasons</h3>
      ${renderKeyValue("strokeWidthScore", wall.reasons.strokeWidthScore)}
      ${renderKeyValue("lengthScore", wall.reasons.lengthScore)}
      ${renderKeyValue("orientationScore", wall.reasons.orientationScore)}
      ${renderKeyValue("colorScore", wall.reasons.colorScore)}
      ${renderKeyValue("mergeScore", wall.reasons.mergeScore)}
    </div>
  `;
}

export function renderWallDiagnostics(detection: WallDetectionResult): string {
  const rows = [
    ["totalVectorObjects", detection.debug.totalVectorObjects],
    ["objectsAfterStrokeFilter", detection.debug.objectsAfterStrokeFilter],
    ["objectsAfterLengthFilter", detection.debug.objectsAfterLengthFilter],
    ["objectsAfterOrientationFilter", detection.debug.objectsAfterOrientationFilter],
    ["mergedSegments", detection.debug.mergedSegments],
    ["finalWallCandidates", detection.debug.finalWallCandidates],
    ["wallRectangles", detection.debug.wallRectangles],
    ["unresolvedWallBoundaries", detection.debug.unresolvedWallBoundaries]
  ];

  return `
    <table class="pdf-wall-diagnostics">
      <tbody>
        ${rows.map(([label, value]) => `
          <tr>
            <th>${label}</th>
            <td>${value}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

export function renderWallCandidateList(
  detection: WallDetectionResult,
  reviewState: WallReviewState,
  selectedWallId: string | null
): string {
  return `
    <div class="pdf-wall-candidate-list">
      ${detection.walls.map((wall, index) => {
        const status = reviewState[wall.id] ?? "unreviewed";
        return `
          <button
            type="button"
            class="${wall.id === selectedWallId ? "active" : ""}"
            data-wall-list-id="${wall.id}"
          >
            <span>W${index + 1}</span>
            <small>${status} · ${wall.orientation} · ${wall.length}px</small>
          </button>
        `;
      }).join("")}
    </div>
  `;
}

function renderKeyValue(label: string, value: unknown): string {
  const display = typeof value === "object" ? JSON.stringify(value) : String(value);
  return `
    <div class="pdf-wall-kv">
      <span>${escapeHtml(label)}</span>
      <code>${escapeHtml(display)}</code>
    </div>
  `;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
