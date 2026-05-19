export interface VectorSegment {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  strokeWidth: number;
  sourceStrokeWidth: number;
  strokeColorHex?: string;
  strokeColorRgb?: [number, number, number];
  pathKind?: "line" | "curve" | "rectangle" | "close";
  paintKind?: "stroke" | "fill" | "fill_stroke";
}

export interface StrokeWidthGroup {
  groupId: string;
  colorName: string;
  colorHex: string;
  sourceColorHex?: string;
  representativeStrokeColorRgb?: [number, number, number];
  minStrokeWidth: number;
  maxStrokeWidth: number;
  representativeStrokeWidth: number;
  segments: VectorSegment[];
  totalLength: number;
}

const DEBUG_COLORS = [
  { name: "green", hex: "#22c55e" },
  { name: "blue", hex: "#2563eb" },
  { name: "orange", hex: "#f97316" },
  { name: "yellow", hex: "#eab308" },
  { name: "pink", hex: "#ec4899" },
  { name: "cyan", hex: "#06b6d4" },
  { name: "purple", hex: "#8b5cf6" },
  { name: "red", hex: "#ef4444" },
  { name: "slate", hex: "#64748b" },
  { name: "lime", hex: "#84cc16" }
];

export function groupSegmentsByStrokeWidth(input: {
  segments: VectorSegment[];
  absoluteTolerance?: number;
  relativeTolerance?: number;
  colorTolerance?: number;
  minimumSegmentLength?: number;
}): StrokeWidthGroup[] {
  const absoluteTolerance = input.absoluteTolerance ?? 0.04;
  const relativeTolerance = input.relativeTolerance ?? 0.18;
  const colorTolerance = input.colorTolerance ?? 28;
  const minimumSegmentLength = input.minimumSegmentLength ?? 0.5;
  const sorted = input.segments
    .filter((segment) => segmentLength(segment) >= minimumSegmentLength)
    .sort((left, right) => left.strokeWidth - right.strokeWidth || colorLuminance(left.strokeColorRgb) - colorLuminance(right.strokeColorRgb));
  const groups: StrokeWidthGroup[] = [];

  for (const segment of sorted) {
    const existing = groups.find((group) => fitsStrokeGroup(segment, group, absoluteTolerance, relativeTolerance, colorTolerance));
    if (existing) {
      existing.segments.push(segment);
      existing.minStrokeWidth = Math.min(existing.minStrokeWidth, segment.strokeWidth);
      existing.maxStrokeWidth = Math.max(existing.maxStrokeWidth, segment.strokeWidth);
      existing.representativeStrokeWidth = weightedAverage(existing.segments.map((item) => item.strokeWidth));
      existing.representativeStrokeColorRgb = representativeColor(existing.segments);
      existing.sourceColorHex = rgbToHex(existing.representativeStrokeColorRgb);
      existing.totalLength += segmentLength(segment);
      continue;
    }

    const color = DEBUG_COLORS[groups.length % DEBUG_COLORS.length];
    const representativeStrokeColorRgb = representativeColor([segment]);
    groups.push({
      groupId: `stroke_group_${groups.length + 1}`,
      colorName: color.name,
      colorHex: color.hex,
      sourceColorHex: rgbToHex(representativeStrokeColorRgb),
      representativeStrokeColorRgb,
      minStrokeWidth: segment.strokeWidth,
      maxStrokeWidth: segment.strokeWidth,
      representativeStrokeWidth: segment.strokeWidth,
      segments: [segment],
      totalLength: segmentLength(segment)
    });
  }

  return groups.sort((left, right) => right.representativeStrokeWidth - left.representativeStrokeWidth || right.totalLength - left.totalLength)
    .map((group, index) => {
      const color = DEBUG_COLORS[index % DEBUG_COLORS.length];
      return {
        ...group,
        groupId: `stroke_group_${index + 1}`,
        colorName: color.name,
        colorHex: color.hex
      };
    });
}

export function createStrokeGroupSummary(groups: StrokeWidthGroup[]): Array<{
    groupId: string;
    colorName: string;
    colorHex: string;
    sourceColorHex?: string;
    minStrokeWidth: number;
    maxStrokeWidth: number;
    representativeStrokeWidth: number;
    segmentCount: number;
    curveSegmentCount: number;
    rectangleSegmentCount: number;
    totalLength: number;
  }> {
  return groups.map((group) => ({
    groupId: group.groupId,
    colorName: group.colorName,
    colorHex: group.colorHex,
    sourceColorHex: group.sourceColorHex,
    minStrokeWidth: round(group.minStrokeWidth),
    maxStrokeWidth: round(group.maxStrokeWidth),
    representativeStrokeWidth: round(group.representativeStrokeWidth),
    segmentCount: group.segments.length,
    curveSegmentCount: group.segments.filter((segment) => segment.pathKind === "curve").length,
    rectangleSegmentCount: group.segments.filter((segment) => segment.pathKind === "rectangle").length,
    totalLength: round(group.totalLength)
  }));
}

export function createColoredDxf(groups: StrokeWidthGroup[]): string {
  const lines = [
    "0", "SECTION", "2", "HEADER", "9", "$ACADVER", "1", "AC1015", "0", "ENDSEC",
    "0", "SECTION", "2", "TABLES", "0", "TABLE", "2", "LAYER"
  ];

  for (const group of groups) {
    lines.push("0", "LAYER", "2", group.groupId, "70", "0", "62", String(dxfColorIndex(group.colorName)), "6", "CONTINUOUS");
  }

  lines.push("0", "ENDTAB", "0", "ENDSEC", "0", "SECTION", "2", "ENTITIES");

  for (const group of groups) {
    for (const segment of group.segments) {
      lines.push(
        "0", "LINE",
        "8", group.groupId,
        "62", String(dxfColorIndex(group.colorName)),
        "10", formatDxfNumber(segment.x1),
        "20", formatDxfNumber(segment.y1),
        "30", "0",
        "11", formatDxfNumber(segment.x2),
        "21", formatDxfNumber(segment.y2),
        "31", "0"
      );
    }
  }

  lines.push("0", "ENDSEC", "0", "EOF");
  return `${lines.join("\n")}\n`;
}

export function createColoredSvg(groups: StrokeWidthGroup[], width: number, height: number): string {
  const elements = groups.flatMap((group) => group.segments.map((segment) =>
    `<line x1="${round(segment.x1)}" y1="${round(height - segment.y1)}" x2="${round(segment.x2)}" y2="${round(height - segment.y2)}" stroke="${group.colorHex}" stroke-width="${Math.max(0.25, group.representativeStrokeWidth)}" stroke-linecap="round" />`
  ));
  const legend = groups.map((group, index) =>
    `<g transform="translate(12 ${20 + index * 18})"><rect width="10" height="10" fill="${group.colorHex}" /><text x="16" y="9" font-size="10" fill="#111">${group.colorName}: w ${round(group.representativeStrokeWidth)}, src ${group.sourceColorHex ?? "n/a"} (${group.segments.length})</text></g>`
  );
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(width)}" height="${Math.ceil(height)}" viewBox="0 0 ${Math.ceil(width)} ${Math.ceil(height)}">
<rect width="100%" height="100%" fill="white"/>
${elements.join("\n")}
${legend.join("\n")}
</svg>
`;
}

function fitsStrokeGroup(segment: VectorSegment, group: StrokeWidthGroup, absoluteTolerance: number, relativeTolerance: number, colorTolerance: number): boolean {
  const delta = Math.abs(segment.strokeWidth - group.representativeStrokeWidth);
  const widthFits = delta <= absoluteTolerance || delta <= Math.max(segment.strokeWidth, group.representativeStrokeWidth) * relativeTolerance;
  if (!widthFits) return false;
  if (!segment.strokeColorRgb && !group.representativeStrokeColorRgb) return true;
  if (!segment.strokeColorRgb || !group.representativeStrokeColorRgb) return false;
  return colorDistance(segment.strokeColorRgb, group.representativeStrokeColorRgb) <= colorTolerance;
}

function segmentLength(segment: VectorSegment): number {
  return Math.hypot(segment.x2 - segment.x1, segment.y2 - segment.y1);
}

function weightedAverage(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
}

function representativeColor(segments: VectorSegment[]): [number, number, number] | undefined {
  const colors = segments.map((segment) => segment.strokeColorRgb).filter((color): color is [number, number, number] => Boolean(color));
  if (colors.length === 0) return undefined;
  return [
    Math.round(weightedAverage(colors.map((color) => color[0]))),
    Math.round(weightedAverage(colors.map((color) => color[1]))),
    Math.round(weightedAverage(colors.map((color) => color[2])))
  ];
}

function rgbToHex(color: [number, number, number] | undefined): string | undefined {
  if (!color) return undefined;
  return `#${color.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function colorDistance(left: [number, number, number], right: [number, number, number]): number {
  return Math.hypot(left[0] - right[0], left[1] - right[1], left[2] - right[2]);
}

function colorLuminance(color: [number, number, number] | undefined): number {
  if (!color) return 0;
  return 0.2126 * color[0] + 0.7152 * color[1] + 0.0722 * color[2];
}

function formatDxfNumber(value: number): string {
  return String(round(value));
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
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
