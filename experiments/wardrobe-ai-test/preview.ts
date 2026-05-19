import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

type OpeningKind =
  | "drawer"
  | "hanging"
  | "shelf_opening"
  | "shelf_opening_overflow"
  | "unresolved_gap";

type Opening = {
  id: string;
  kind: OpeningKind;
  label: string;
  x?: number;
  width?: number;
  yFromBottom: number;
  height: number;
};

type Column = {
  id: string;
  label: string;
  x: number;
  width: number;
  openings: Opening[];
};

type WardrobeFile = {
  wardrobe: {
    id: string;
    dimensions: {
      width: number;
      height: number;
      depth: number | null;
      heightExpression?: string;
    };
    materials: Record<string, { status: string; previewColor: string }>;
    construction: {
      columns: Column[];
    };
    parseNotes: Array<{ severity: "info" | "warning"; message: string }>;
  };
};

const currentDir = dirname(fileURLToPath(import.meta.url));
const inputPath = join(currentDir, "wardrobe.json");
const outputPath = join(currentDir, "preview.html");
const data = JSON.parse(readFileSync(inputPath, "utf8")) as WardrobeFile;
const wardrobe = data.wardrobe;

const maxContentHeight = Math.max(
  wardrobe.dimensions.height,
  ...wardrobe.construction.columns.map((column) =>
    Math.max(...column.openings.map((opening) => opening.yFromBottom + opening.height)),
  ),
);

const overflowTop = Math.max(0, maxContentHeight - wardrobe.dimensions.height);
const margin = 120;
const originX = margin;
const originY = margin + overflowTop;
const viewBoxWidth = wardrobe.dimensions.width + margin * 2;
const viewBoxHeight = maxContentHeight + margin * 2;

const kindClass: Record<OpeningKind, string> = {
  drawer: "drawer",
  hanging: "hanging",
  shelf_opening: "shelf",
  shelf_opening_overflow: "overflow",
  unresolved_gap: "gap",
};

const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const openingRect = (column: Column, opening: Opening) => {
  const openingX = opening.x ?? 0;
  const openingWidth = opening.width ?? column.width;
  const x = originX + column.x + openingX;
  const y = originY + wardrobe.dimensions.height - opening.yFromBottom - opening.height;
  const height = opening.height;
  const labelY = y + Math.max(34, Math.min(height / 2, height - 16));
  const label = `${opening.label} / ${opening.height} mm`;
  const isSmall = height < 210 || openingWidth < 650;

  return `
    <g>
      <rect class="${kindClass[opening.kind]}" x="${x}" y="${y}" width="${openingWidth}" height="${height}" />
      <text class="${isSmall ? "small-label" : "label"}" x="${x + openingWidth / 2}" y="${labelY}" text-anchor="middle">
        ${escapeHtml(label)}
      </text>
    </g>`;
};

const shelves = wardrobe.construction.columns
  .flatMap((column) => column.openings.map((opening) => openingRect(column, opening)))
  .join("\n");

const dividerLines = wardrobe.construction.columns
  .slice(1)
  .map((column) => {
    const x = originX + column.x;
    return `<line class="divider" x1="${x}" y1="${originY}" x2="${x}" y2="${originY + wardrobe.dimensions.height}" />`;
  })
  .join("\n");

const columnLabels = wardrobe.construction.columns
  .map((column) => {
    const x = originX + column.x + column.width / 2;
    return `<text class="module-label" x="${x}" y="${originY + wardrobe.dimensions.height + 55}" text-anchor="middle">${escapeHtml(
      `${column.label} / ${column.width} mm`,
    )}</text>`;
  })
  .join("\n");

const notesHtml = wardrobe.parseNotes
  .map((note) => `<li class="${note.severity}">${escapeHtml(note.message)}</li>`)
  .join("");

const html = `<!doctype html>
<html lang="sk">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Wardrobe AI JSON Preview</title>
  <style>
    :root {
      color: #241f1a;
      background: #f7f4ee;
      font-family: Arial, sans-serif;
    }

    body {
      margin: 0;
      padding: 28px;
    }

    main {
      max-width: 1180px;
      margin: 0 auto;
    }

    h1 {
      margin: 0 0 8px;
      font-size: 24px;
      font-weight: 700;
    }

    .meta {
      margin: 0 0 20px;
      color: #5f564c;
      font-size: 14px;
    }

    .preview {
      overflow: auto;
      border: 1px solid #d4cbbd;
      background: #fffaf1;
      padding: 16px;
    }

    svg {
      display: block;
      width: min(100%, 980px);
      min-width: 720px;
      height: auto;
      margin: 0 auto;
    }

    .frame {
      fill: none;
      stroke: #2e2923;
      stroke-width: 14;
    }

    .divider {
      stroke: #2e2923;
      stroke-width: 14;
    }

    .drawer {
      fill: #eee3d2;
      stroke: #6f6457;
      stroke-width: 5;
    }

    .shelf {
      fill: #f7efe1;
      stroke: #8a7d6e;
      stroke-width: 5;
    }

    .hanging {
      fill: #e9f0ed;
      stroke: #678070;
      stroke-width: 5;
    }

    .gap {
      fill: #fff;
      stroke: #b28f2f;
      stroke-dasharray: 24 16;
      stroke-width: 5;
    }

    .overflow {
      fill: #f8dfdc;
      stroke: #bd3d35;
      stroke-width: 7;
    }

    .label,
    .small-label,
    .module-label,
    .dimension {
      fill: #241f1a;
      font-weight: 700;
    }

    .label {
      font-size: 42px;
    }

    .small-label {
      font-size: 32px;
    }

    .module-label,
    .dimension {
      font-size: 40px;
    }

    .height-line {
      stroke: #695f54;
      stroke-width: 5;
    }

    .overflow-line {
      stroke: #bd3d35;
      stroke-width: 6;
      stroke-dasharray: 20 14;
    }

    .notes {
      margin-top: 18px;
      padding-left: 20px;
      color: #3f382f;
      line-height: 1.45;
    }

    .warning {
      color: #8b2d25;
    }
  </style>
</head>
<body>
  <main>
    <h1>Wardrobe AI JSON Preview</h1>
    <p class="meta">
      Front view from JSON. Width ${wardrobe.dimensions.width} mm, height ${wardrobe.dimensions.height} mm${
        wardrobe.dimensions.heightExpression ? ` (${escapeHtml(wardrobe.dimensions.heightExpression)})` : ""
      }.
    </p>
    <section class="preview" aria-label="Wardrobe front preview">
      <svg viewBox="0 0 ${viewBoxWidth} ${viewBoxHeight}" role="img" aria-label="Wardrobe front elevation">
        <rect class="frame" x="${originX}" y="${originY}" width="${wardrobe.dimensions.width}" height="${wardrobe.dimensions.height}" />
        ${shelves}
        ${dividerLines}
        <rect class="frame" x="${originX}" y="${originY}" width="${wardrobe.dimensions.width}" height="${wardrobe.dimensions.height}" />
        <line class="height-line" x1="${originX + wardrobe.dimensions.width + 60}" y1="${originY}" x2="${originX + wardrobe.dimensions.width + 60}" y2="${originY + wardrobe.dimensions.height}" />
        <text class="dimension" x="${originX + wardrobe.dimensions.width + 92}" y="${originY + wardrobe.dimensions.height / 2}" transform="rotate(90 ${originX + wardrobe.dimensions.width + 92} ${originY + wardrobe.dimensions.height / 2})" text-anchor="middle">${wardrobe.dimensions.height} mm</text>
        ${
          overflowTop > 0
            ? `<line class="overflow-line" x1="${originX}" y1="${originY - overflowTop}" x2="${originX + wardrobe.dimensions.width}" y2="${originY - overflowTop}" />
        <text class="dimension" x="${originX + wardrobe.dimensions.width / 2}" y="${originY - overflowTop + 48}" text-anchor="middle">Right side exceeds height by ${overflowTop} mm</text>`
            : ""
        }
        ${columnLabels}
        <text class="dimension" x="${originX + wardrobe.dimensions.width / 2}" y="${originY + wardrobe.dimensions.height + 105}" text-anchor="middle">${wardrobe.dimensions.width} mm</text>
      </svg>
    </section>
    <ul class="notes">${notesHtml}</ul>
  </main>
</body>
</html>
`;

writeFileSync(outputPath, html, "utf8");
console.log(`Preview written to ${outputPath}`);
