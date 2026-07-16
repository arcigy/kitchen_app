import {
  demosEntries,
  demosReferenceImageUrl,
  demosReferencePageUrl,
  filterMaterials,
  materialColor,
  materialPayload,
  summarizeMaterials,
  uniqueValues,
  type MaterialProofCatalogs,
  type MaterialProofEntry,
  type MaterialProofFilters,
  type MaterialProofMode
} from "./materialProofData";
import { MATERIAL_PBR_OPTIONS as PBR_OPTIONS } from "./materialPbrOptions";
import { mapWithConcurrency } from "./materialProofSampling";

const SURFACE_PROFILES = [
  "wood_raw_matte",
  "wood_standard_matte",
  "wood_soft_touch_supermat",
  "wood_satin_lacquer",
  "wood_gloss_laminate"
];

type State = {
  mode: MaterialProofMode;
  csvBoards: MaterialProofEntry[];
  production: MaterialProofEntry[];
  staging: MaterialProofEntry[];
  selected?: MaterialProofEntry;
  filters: MaterialProofFilters;
  referencePageUrls: Record<string, string>;
  referenceImageUrls: Record<string, string>;
  pbrOverrides: Record<string, string>;
};

const emptyFilters = (): MaterialProofFilters => ({
  query: "",
  materialType: "",
  surfaceProfile: "",
  mappingStatus: "",
  productionSafe: ""
});

export async function startMaterialProofMode(root: HTMLElement): Promise<void> {
  root.className = "material-proof-app";
  root.innerHTML = `<main class="material-proof"><div class="material-proof-loading">Loading Material Proof Mode...</div></main>`;
  const catalogs = await loadCatalogs();
  const csvBoards = catalogs.csvBoards.slice(0, 20);
  const production = demosEntries(catalogs.production);
  const staging = demosEntries(catalogs.staging);
  const state: State = {
    mode: "csv",
    csvBoards,
    production,
    staging,
    selected: csvBoards[0] ?? production[0] ?? staging[0],
    filters: emptyFilters(),
    referencePageUrls: readReferenceUrls("materialProofDemosReferencePageUrls"),
    referenceImageUrls: readReferenceUrls("materialProofDemosReferenceImageUrls"),
    pbrOverrides: readReferenceUrls("materialProofPbrOverridesV2")
  };
  render(root, state);
  void refreshSampledPreviewColors(root, state);
}

async function refreshSampledPreviewColors(root: HTMLElement, state: State): Promise<void> {
  const sampled = await applySampledPreviewColors(state.csvBoards);
  if (!root.isConnected || !root.classList.contains("material-proof-app")) return;
  state.csvBoards = sampled;
  render(root, state);
}

async function loadCatalogs(): Promise<MaterialProofCatalogs> {
  const response = await fetch("/api/material-proof/catalogs", {
    credentials: "include",
    headers: { Accept: "application/json" }
  });
  if (!response.ok) throw new Error(`Failed to load material proof catalogs: HTTP ${response.status}`);
  const body = await response.json() as { csvBoards?: unknown; production?: unknown; staging?: unknown };
  return {
    csvBoards: Array.isArray(body.csvBoards) ? body.csvBoards as MaterialProofEntry[] : [],
    production: Array.isArray(body.production) ? body.production as MaterialProofEntry[] : [],
    staging: Array.isArray(body.staging) ? body.staging as MaterialProofEntry[] : []
  };
}

async function applySampledPreviewColors(entries: MaterialProofEntry[]): Promise<MaterialProofEntry[]> {
  return mapWithConcurrency(entries, 4, async (entry) => {
    const imageUrl = demosReferenceImageUrl(entry);
    if (!imageUrl) return entry;
    const colors = await sampleFiveImageColors(proxiedReferenceImageUrl(imageUrl));
    if (colors.length === 0) return { ...entry, referenceImageAvailable: false };
    const sampledBaseColorHex = averageHexColors(colors);
    return {
      ...entry,
      referenceImageAvailable: true,
      sampledColors: colors,
      sampledBaseColorHex,
      baseColorHex: sampledBaseColorHex,
      colorPreviewHex: sampledBaseColorHex
    };
  });
}

function proxiedReferenceImageUrl(imageUrl: string): string {
  return imageUrl ? `/api/material-proof/reference-image?url=${encodeURIComponent(imageUrl)}` : "";
}

async function sampleFiveImageColors(imageUrl: string): Promise<string[]> {
  let objectUrl = "";
  try {
    const response = await fetch(imageUrl, { credentials: "include" });
    if (!response.ok || response.headers.get("X-Arcigy-Reference-Image") === "unavailable") return [];
    objectUrl = URL.createObjectURL(await response.blob());
    return await sampleImageColors(objectUrl);
  } catch {
    return [];
  } finally {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  }
}

function sampleImageColors(imageUrl: string): Promise<string[]> {
  return new Promise((resolve) => {
    const image = document.createElement("img");
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = Math.max(1, image.naturalWidth);
        canvas.height = Math.max(1, image.naturalHeight);
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (!context) {
          resolve([]);
          return;
        }
        context.drawImage(image, 0, 0);
        const points = [
          [0.2, 0.2],
          [0.8, 0.2],
          [0.5, 0.5],
          [0.2, 0.8],
          [0.8, 0.8]
        ];
        resolve(points.map(([px, py]) => sampleAverageAt(context, canvas.width, canvas.height, px, py)));
      } catch {
        resolve([]);
      }
    };
    image.onerror = () => resolve([]);
    image.src = imageUrl;
  });
}

function sampleAverageAt(context: CanvasRenderingContext2D, width: number, height: number, px: number, py: number): string {
  const radius = 4;
  const x = Math.max(0, Math.min(width - 1, Math.round(width * px)));
  const y = Math.max(0, Math.min(height - 1, Math.round(height * py)));
  const sx = Math.max(0, x - radius);
  const sy = Math.max(0, y - radius);
  const sw = Math.min(width - sx, radius * 2 + 1);
  const sh = Math.min(height - sy, radius * 2 + 1);
  const data = context.getImageData(sx, sy, sw, sh).data;
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;
  for (let index = 0; index < data.length; index += 4) {
    const alpha = data[index + 3] ?? 255;
    if (alpha < 16) continue;
    r += data[index] ?? 0;
    g += data[index + 1] ?? 0;
    b += data[index + 2] ?? 0;
    count += 1;
  }
  return rgbToHex(Math.round(r / Math.max(1, count)), Math.round(g / Math.max(1, count)), Math.round(b / Math.max(1, count)));
}

function averageHexColors(colors: string[]): string {
  const rgb = colors.map(hexToRgb);
  const total = rgb.reduce((acc, color) => ({ r: acc.r + color.r, g: acc.g + color.g, b: acc.b + color.b }), { r: 0, g: 0, b: 0 });
  return rgbToHex(
    Math.round(total.r / Math.max(1, rgb.length)),
    Math.round(total.g / Math.max(1, rgb.length)),
    Math.round(total.b / Math.max(1, rgb.length))
  );
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((value) => Math.max(0, Math.min(255, value)).toString(16).padStart(2, "0")).join("")}`;
}

function currentEntries(state: State): MaterialProofEntry[] {
  if (state.mode === "csv") return state.csvBoards;
  return state.mode === "production" ? state.production : state.staging;
}

function render(root: HTMLElement, state: State): void {
  const entries = state.csvBoards.slice(0, 20).map((entry) => applyPbrOverride(entry, state.pbrOverrides));
  state.selected = entries[0];
  root.innerHTML = `
    <main class="material-proof">
      <header class="material-proof-header">
        <div>
          <p class="material-proof-kicker">NO DEMOS TEXTURE USED</p>
          <h1>Material Proof Mode</h1>
          <p>First 20 Demos boards from the real products CSV. Left side is Demos web reference, right side is our internal PBR-based approximation.</p>
        </div>
        <a class="material-proof-back" href="/">Back to app</a>
      </header>
      ${renderSummary(state)}
      ${renderFinalComparison(entries)}
    </main>
  `;
  bindProofComparison(root, state);
  void applyTintedPbrCanvases(root, entries);
}

function renderFinalComparison(entries: MaterialProofEntry[]): string {
  return `
    <section class="material-proof-card material-proof-final">
      <div class="material-proof-section-title">
        <h2>Final comparison: Demos photo vs our PBR approximation</h2>
        <span>${entries.length} boards loaded from real Demos CSV</span>
      </div>
      <div class="material-proof-final-grid">
        ${entries.map((entry, index) => renderComparisonCard(entry, index + 1)).join("")}
      </div>
    </section>
  `;
}

function renderComparisonCard(entry: MaterialProofEntry, index: number): string {
  const configuredImageUrl = demosReferenceImageUrl(entry) ?? "";
  const imageUrl = entry.referenceImageAvailable === false ? "" : configuredImageUrl;
  const displayImageUrl = proxiedReferenceImageUrl(imageUrl);
  const pageUrl = demosReferencePageUrl(entry) ?? "";
  return `
    <article class="material-proof-comparison-card">
      <header>
        <span>${index.toString().padStart(2, "0")}</span>
        <div>
          <h3>${escapeHtml(entry.displayName ?? "Unnamed Demos board")}</h3>
          <p>${escapeHtml(entry.vendorSku ?? entry.vendorDecorId ?? "")}</p>
        </div>
      </header>
      <div class="material-proof-side-by-side">
        <div>
          <strong>Demos web photo</strong>
          ${displayImageUrl
            ? `<img class="material-proof-reference-image" src="${escapeAttr(displayImageUrl)}" alt="${escapeAttr(entry.displayName ?? "Demos board")}" />`
            : `<div class="material-proof-reference-empty">${configuredImageUrl ? "Demos reference temporarily unavailable" : "No CSV image URL"}</div>`}
          ${pageUrl ? `<a href="${escapeAttr(pageUrl)}" target="_blank" rel="noreferrer">Open Demos link</a>` : ""}
        </div>
        <div>
          <strong>Our internal material estimate</strong>
          <canvas
            class="material-proof-compare-board material-proof-pbr-canvas"
            width="520"
            height="300"
            data-pbr-canvas="${escapeAttr(entry.vendorDecorId ?? "")}"
          ></canvas>
          <small>NO DEMOS TEXTURE USED</small>
          ${renderPbrSelect(entry)}
        </div>
      </div>
      <dl class="material-proof-params">
        <div><dt>target</dt><dd>${escapeHtml(entry.targetInternalMaterialId ?? "")}</dd></div>
        <div><dt>PBR asset</dt><dd>${escapeHtml(entry.pbrMaterialId ?? "")}</dd></div>
        <div><dt>template</dt><dd>${escapeHtml(entry.proceduralTemplate ?? "")}</dd></div>
        <div><dt>grain</dt><dd>${escapeHtml(entry.grainPatternId ?? "")}</dd></div>
        <div><dt>surface</dt><dd>${escapeHtml(entry.surfaceProfile ?? "")}</dd></div>
        <div><dt>sample avg</dt><dd>${escapeHtml(entry.sampledBaseColorHex ?? materialColor(entry))}</dd></div>
        <div><dt>5 samples</dt><dd>${(entry.sampledColors ?? []).map((color) => `<span class="material-proof-color-chip" style="background:${escapeAttr(color)}" title="${escapeAttr(color)}"></span>`).join("")}</dd></div>
        <div><dt>grain color</dt><dd>${escapeHtml(entry.grainColorHex ?? "")}</dd></div>
        <div><dt>mapping tint</dt><dd>${entry.tintStrength ?? ""}</dd></div>
        <div><dt>PBR color mix</dt><dd>${pbrColorMixStrength(entry).toFixed(2)}</dd></div>
        <div><dt>contrast</dt><dd>${entry.grainContrast ?? ""}</dd></div>
        <div><dt>tile</dt><dd>${entry.tileSizeMeters ?? 0.4} m / uv ${entry.uvScale ?? 2.5}</dd></div>
        <div><dt>status</dt><dd>${escapeHtml(entry.mappingStatus ?? "")} / confidence ${entry.confidence ?? 0}</dd></div>
      </dl>
    </article>
  `;
}

async function applyTintedPbrCanvases(root: HTMLElement, entries: MaterialProofEntry[]): Promise<void> {
  await Promise.all(entries.map(async (entry) => {
    const id = entry.vendorDecorId;
    if (!id || !entry.pbrBaseColorUrl) return;
    const canvas = root.querySelector<HTMLCanvasElement>(`[data-pbr-canvas="${cssEscape(id)}"]`);
    if (!canvas) return;
    if (isSolidColorBoard(entry)) {
      drawExactSolidColorCanvas(canvas, materialColor(entry));
      return;
    }
    await drawTintedPbrCanvas(canvas, entry.pbrBaseColorUrl, materialColor(entry), pbrColorMixStrength(entry));
  }));
}

function isSolidColorBoard(entry: MaterialProofEntry): boolean {
  return entry.materialType === "solid"
    || entry.grainPatternId === "solid_no_grain"
    || entry.proceduralTemplate === "solid_color_neutral";
}

function pbrColorMixStrength(entry: MaterialProofEntry): number {
  const mappingTint = Number(entry.tintStrength ?? 0);
  if (entry.materialType === "solid") return 0.96;
  if (entry.surfaceProfile?.includes("gloss")) return Math.max(0.76, mappingTint);
  return Math.max(0.84, mappingTint);
}

function drawExactSolidColorCanvas(canvas: HTMLCanvasElement, targetHex: string): void {
  const context = canvas.getContext("2d");
  if (!context) return;
  const materialCanvas = document.createElement("canvas");
  materialCanvas.width = canvas.width;
  materialCanvas.height = canvas.height;
  const materialContext = materialCanvas.getContext("2d");
  if (!materialContext) return;
  materialContext.fillStyle = targetHex;
  materialContext.fillRect(0, 0, materialCanvas.width, materialCanvas.height);
  drawMaterialBoardWithEdges(context, materialCanvas);
}

async function drawTintedPbrCanvas(canvas: HTMLCanvasElement, textureUrl: string, targetHex: string, strength: number): Promise<void> {
  const image = await loadImage(textureUrl);
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return;
  const width = canvas.width;
  const height = canvas.height;
  const patternCanvas = document.createElement("canvas");
  patternCanvas.width = width;
  patternCanvas.height = height;
  const patternContext = patternCanvas.getContext("2d", { willReadFrequently: true });
  if (!patternContext) return;
  const tileHeight = Math.max(120, Math.round(height * 0.58));
  const tileWidth = Math.max(1, Math.round(image.naturalWidth * (tileHeight / Math.max(1, image.naturalHeight))));
  for (let y = 0; y < height; y += tileHeight) {
    for (let x = 0; x < width; x += tileWidth) {
      patternContext.drawImage(image, x, y, tileWidth, tileHeight);
    }
  }
  const pixels = patternContext.getImageData(0, 0, width, height);
  const target = hexToRgb(targetHex);
  const tintStrength = Math.max(0, Math.min(1, strength));
  let lumaSum = 0;
  let pixelCount = 0;
  for (let index = 0; index < pixels.data.length; index += 4) {
    const r = pixels.data[index] ?? 0;
    const g = pixels.data[index + 1] ?? 0;
    const b = pixels.data[index + 2] ?? 0;
    lumaSum += (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    pixelCount += 1;
  }
  const averageLuma = pixelCount > 0 ? lumaSum / pixelCount : 0.5;
  for (let index = 0; index < pixels.data.length; index += 4) {
    const r = pixels.data[index] ?? 0;
    const g = pixels.data[index + 1] ?? 0;
    const b = pixels.data[index + 2] ?? 0;
    const luma = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    const detail = (luma - averageLuma) * tintStrength;
    const shade = Math.max(0.72, Math.min(1.28, 1 + detail));
    pixels.data[index] = Math.round(Math.max(0, Math.min(255, target.r * shade)));
    pixels.data[index + 1] = Math.round(Math.max(0, Math.min(255, target.g * shade)));
    pixels.data[index + 2] = Math.round(Math.max(0, Math.min(255, target.b * shade)));
  }
  patternContext.putImageData(pixels, 0, 0);
  drawMaterialBoardWithEdges(context, patternCanvas);
}

function drawMaterialBoardWithEdges(context: CanvasRenderingContext2D, materialCanvas: HTMLCanvasElement): void {
  const width = materialCanvas.width;
  const height = materialCanvas.height;
  context.clearRect(0, 0, width, height);
  context.drawImage(materialCanvas, 0, 0, width, height);
  context.strokeStyle = "rgba(15,23,42,0.22)";
  context.lineWidth = 1;
  context.strokeRect(0.5, 0.5, width - 1, height - 1);
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = document.createElement("img");
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Failed to load ${src}`));
    image.src = src;
  });
}

function renderPbrSelect(entry: MaterialProofEntry): string {
  const options = PBR_OPTIONS.map((option) => `
    <option value="${escapeAttr(option.id)}" ${option.id === entry.pbrMaterialId ? "selected" : ""}>${escapeHtml(option.label)}</option>
  `).join("");
  return `
    <label class="material-proof-pbr-select">
      Our PBR texture
      <select data-pbr-select="${escapeAttr(entry.vendorDecorId ?? "")}">
        ${options}
      </select>
    </label>
  `;
}

function renderTabs(state: State): string {
  return `
    <div class="material-proof-tabs" role="tablist">
      <button class="${state.mode === "csv" ? "active" : ""}" data-mode="csv">CSV Demos boards</button>
      <button class="${state.mode === "production" ? "active" : ""}" data-mode="production">Production Demos materials</button>
      <button class="${state.mode === "staging" ? "active" : ""}" data-mode="staging">Staging Demos materials</button>
    </div>
  `;
}

function renderSummary(state: State): string {
  const csv = summarizeMaterials(state.csvBoards);
  const production = summarizeMaterials(state.production);
  const staging = summarizeMaterials(state.staging);
  return `
    <div class="material-proof-summary">
      <article>
        <span>CSV boards</span>
        <strong>${csv.total}</strong>
        <small>${state.csvBoards.filter((entry) => entry.demosReferenceImageUrl).length} Demos photos / ${csv.needsReview} needs_review</small>
      </article>
      <article>
        <span>Production</span>
        <strong>${production.total}</strong>
        <small>${production.productionSafe} productionSafe / ${production.mapped} mapped / ${production.locked} locked</small>
      </article>
      <article>
        <span>Staging</span>
        <strong>${staging.total}</strong>
        <small>${staging.needsReview} needs_review / ${staging.mapped} mapped / ${staging.unlocked} unlocked</small>
      </article>
    </div>
  `;
}

function renderFilters(entries: MaterialProofEntry[], filters: MaterialProofFilters): string {
  const option = (value: string, selected: string) => `<option value="${escapeAttr(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(value)}</option>`;
  return `
    <div class="material-proof-filters">
      <input data-filter="query" value="${escapeAttr(filters.query)}" placeholder="Search displayName, vendorDecorId, decorFamily, target..." />
      <select data-filter="materialType"><option value="">All material types</option>${uniqueValues(entries, "materialType").map((value) => option(value, filters.materialType)).join("")}</select>
      <select data-filter="surfaceProfile"><option value="">All surface profiles</option>${uniqueValues(entries, "surfaceProfile").map((value) => option(value, filters.surfaceProfile)).join("")}</select>
      <select data-filter="mappingStatus"><option value="">All mapping statuses</option>${uniqueValues(entries, "mappingStatus").map((value) => option(value, filters.mappingStatus)).join("")}</select>
      <select data-filter="productionSafe"><option value="">Production safe: all</option><option value="true" ${filters.productionSafe === "true" ? "selected" : ""}>productionSafe true</option><option value="false" ${filters.productionSafe === "false" ? "selected" : ""}>productionSafe false</option></select>
    </div>
  `;
}

function renderListItem(entry: MaterialProofEntry, selected?: MaterialProofEntry): string {
  return `
    <button class="material-proof-row ${selected?.vendorDecorId === entry.vendorDecorId ? "selected" : ""}" data-decor-id="${escapeAttr(entry.vendorDecorId ?? "")}">
      <span class="material-proof-swatch" style="${swatchStyle(entry)}"></span>
      <span>
        <strong>${escapeHtml(entry.displayName ?? "Unnamed material")}</strong>
        <small>${escapeHtml(entry.vendorDecorId || entry.vendorSku || entry.demosReferenceSource || "")}</small>
      </span>
      <span class="material-proof-badges">${renderBadges(entry)}</span>
    </button>
  `;
}

function renderBadges(entry: MaterialProofEntry): string {
  const badges: string[] = [];
  if (entry.productionSafe) badges.push(`<b class="ok">PRODUCTION</b>`);
  if (entry.mappingStatus === "needs_review") badges.push(`<b class="warn">NEEDS REVIEW</b>`);
  if (entry.mappingStatus === "unmapped") badges.push(`<b class="warn">UNMAPPED</b>`);
  badges.push(`<b class="${entry.mappingLocked ? "ok" : "muted"}">${entry.mappingLocked ? "LOCKED" : "UNLOCKED"}</b>`);
  if (entry.usesExternalVendorTexture) badges.push(`<b class="error">ERROR: EXTERNAL VENDOR TEXTURE</b>`);
  return badges.join("");
}

function renderSelected(entry: MaterialProofEntry | undefined, referenceImageUrl: string, referencePageUrl: string): string {
  if (!entry) return `<section class="material-proof-card"><h2>Selected material</h2><p>No material selected.</p></section>`;
  return `
    <section class="material-proof-card material-proof-selected">
      <div class="material-proof-section-title">
        <h2>Selected material</h2>
        <span>${entry.usesExternalVendorTexture ? "ERROR: EXTERNAL VENDOR TEXTURE" : "NO DEMOS TEXTURE USED"}</span>
      </div>
      <div class="material-proof-main-board" style="${boardStyle(entry)}"></div>
      <div class="material-proof-selected-meta">
        <h3>${escapeHtml(entry.displayName ?? "Unnamed material")}</h3>
        <p>${escapeHtml(entry.surfaceProfile ?? "")} / ${escapeHtml(entry.grainPatternId ?? "")}</p>
        <div class="material-proof-badges">${renderBadges(entry)}</div>
      </div>
      ${renderCsvDetails(entry)}
      ${renderReferenceComparison(entry, referenceImageUrl, referencePageUrl)}
      <h3>Debug payload</h3>
      <pre class="material-proof-json">${escapeHtml(JSON.stringify(materialPayload(entry), null, 2))}</pre>
    </section>
  `;
}

function renderCsvDetails(entry: MaterialProofEntry): string {
  if (!entry.rawCsv) return "";
  const fields = Object.entries(entry.rawCsv).filter(([, value]) => value && value.trim()).slice(0, 32);
  return `
    <div class="material-proof-csv-details">
      <h3>Exact CSV board data</h3>
      <dl>
        ${fields.map(([key, value]) => `<div><dt>${escapeHtml(key)}</dt><dd>${escapeHtml(value)}</dd></div>`).join("")}
      </dl>
    </div>
  `;
}

function renderReferenceComparison(entry: MaterialProofEntry, referenceImageUrl: string, referencePageUrl: string): string {
  const safeImageUrl = isHttpUrl(referenceImageUrl) ? referenceImageUrl : "";
  const safePageUrl = isHttpUrl(referencePageUrl) ? referencePageUrl : "";
  return `
    <div class="material-proof-reference">
      <div class="material-proof-section-title">
        <h3>Demos texture reference vs our approximation</h3>
        <span>CSV image reference, not a render texture</span>
      </div>
      <div class="material-proof-reference-tools">
        <input data-reference-image-url value="${escapeAttr(referenceImageUrl)}" placeholder="Demos scraped image URL from master CSV..." />
        <input data-reference-page-url value="${escapeAttr(referencePageUrl)}" placeholder="Demos product page URL..." />
        ${safePageUrl ? `<a href="${escapeAttr(safePageUrl)}" target="_blank" rel="noreferrer">Open Demos page</a>` : `<span>Demos page not set</span>`}
      </div>
      <div class="material-proof-compare">
        <article>
          <strong>Demos scraped texture/reference image</strong>
          ${safeImageUrl ? `<img class="material-proof-reference-image" src="${escapeAttr(safeImageUrl)}" alt="Demos scraped reference for ${escapeAttr(entry.displayName ?? "material")}" referrerpolicy="no-referrer" />` : `<div class="material-proof-reference-empty">No Demos image URL found in CSV for this vendorDecorId. Add a column like demosReferenceImageUrl, imageUrl, imgUrl, thumbnailUrl, photoUrl, or pictureUrl.</div>`}
          ${entry.demosReferenceSource ? `<small>Source CSV: ${escapeHtml(entry.demosReferenceSource)}</small>` : ""}
        </article>
        <article>
          <strong>Our mapped material</strong>
          <div class="material-proof-compare-board" style="${boardStyle(entry)}"></div>
          <small>${escapeHtml(entry.targetInternalMaterialId ?? "")}</small>
          <small>${escapeHtml(entry.proceduralTemplate ?? "")} / ${escapeHtml(entry.grainPatternId ?? "")}</small>
          <small>${escapeHtml(entry.surfaceProfile ?? "")} / ${escapeHtml(materialColor(entry))}</small>
          <small>NO DEMOS TEXTURE USED</small>
        </article>
      </div>
    </div>
  `;
}

function renderDeckPreview(entries: MaterialProofEntry[]): string {
  const picked = entries.slice(0, 5);
  return `
    <section class="material-proof-card">
      <div class="material-proof-section-title"><h2>Material preview</h2><span>5 equal boards from current catalog</span></div>
      <div class="material-proof-board-grid">
        ${picked.map((entry) => `
          <article>
            <div class="material-proof-board" style="${boardStyle(entry)}"></div>
            <strong>${escapeHtml(entry.displayName ?? "")}</strong>
            <small>${escapeHtml(entry.surfaceProfile ?? "")}</small>
            <small>${escapeHtml(entry.grainPatternId ?? "")}</small>
            <small>${escapeHtml(entry.mappingStatus ?? "")} / ${entry.productionSafe ? "productionSafe" : "needs_review"}</small>
          </article>
        `).join("")}
      </div>
    </section>
  `;
}

function renderSurfaceComparison(selected?: MaterialProofEntry): string {
  const base = selected ? materialColor(selected) : "#b98a55";
  const grain = selected?.grainColorHex ?? "#6f4425";
  return `
    <section class="material-proof-card">
      <div class="material-proof-section-title"><h2>Surface Profile Comparison</h2><span>Same color, different surface behavior</span></div>
      <div class="material-proof-board-grid">
        ${SURFACE_PROFILES.map((profile) => {
          const entry: MaterialProofEntry = { colorPreviewHex: base, grainColorHex: grain, surfaceProfile: profile, grainContrast: 0.35 };
          return `
            <article>
              <div class="material-proof-board ${surfaceClass(profile)}" style="${boardStyle(entry)}"></div>
              <strong>${escapeHtml(profile)}</strong>
            </article>
          `;
        }).join("")}
      </div>
    </section>
  `;
}

function bind(root: HTMLElement, state: State): void {
  root.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      state.mode = button.dataset.mode === "staging" ? "staging" : button.dataset.mode === "production" ? "production" : "csv";
      state.filters = emptyFilters();
      state.selected = currentEntries(state)[0];
      render(root, state);
    });
  });
  root.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-filter]").forEach((control) => {
    control.addEventListener("input", () => {
      const key = control.dataset.filter as keyof MaterialProofFilters;
      state.filters[key] = control.value;
      state.selected = filterMaterials(currentEntries(state), state.filters)[0] ?? currentEntries(state)[0];
      render(root, state);
    });
  });
  root.querySelectorAll<HTMLInputElement>("[data-reference-page-url]").forEach((control) => {
    control.addEventListener("change", () => {
      const id = state.selected?.vendorDecorId;
      if (!id) return;
      state.referencePageUrls[id] = control.value.trim();
      writeReferenceUrls("materialProofDemosReferencePageUrls", state.referencePageUrls);
      render(root, state);
    });
  });
  root.querySelectorAll<HTMLInputElement>("[data-reference-image-url]").forEach((control) => {
    control.addEventListener("change", () => {
      const id = state.selected?.vendorDecorId;
      if (!id) return;
      state.referenceImageUrls[id] = control.value.trim();
      writeReferenceUrls("materialProofDemosReferenceImageUrls", state.referenceImageUrls);
      render(root, state);
    });
  });
  root.querySelectorAll<HTMLButtonElement>("[data-decor-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset.decorId;
      state.selected = currentEntries(state).find((entry) => entry.vendorDecorId === id) ?? state.selected;
      render(root, state);
    });
  });
}

function bindProofComparison(root: HTMLElement, state: State): void {
  root.querySelectorAll<HTMLSelectElement>("[data-pbr-select]").forEach((select) => {
    select.addEventListener("change", () => {
      const id = select.dataset.pbrSelect;
      if (!id) return;
      state.pbrOverrides[id] = select.value;
      writeReferenceUrls("materialProofPbrOverridesV2", state.pbrOverrides);
      render(root, state);
    });
  });
}

function applyPbrOverride(entry: MaterialProofEntry, overrides: Record<string, string>): MaterialProofEntry {
  const overrideId = entry.vendorDecorId ? overrides[entry.vendorDecorId] : "";
  const option = PBR_OPTIONS.find((candidate) => candidate.id === overrideId);
  if (!option) return entry;
  return {
    ...entry,
    pbrMaterialId: option.id,
    pbrBaseColorAsset: option.path,
    pbrBaseColorUrl: `/api/material-proof/asset?path=${encodeURIComponent(option.path)}`
  };
}

function getReferenceImageUrl(state: State): string {
  const entry = state.selected;
  if (!entry?.vendorDecorId) return "";
  return state.referenceImageUrls[entry.vendorDecorId] ?? demosReferenceImageUrl(entry) ?? "";
}

function getReferencePageUrl(state: State): string {
  const entry = state.selected;
  if (!entry?.vendorDecorId) return "";
  return state.referencePageUrls[entry.vendorDecorId] ?? demosReferencePageUrl(entry) ?? "";
}

function readReferenceUrls(storageKey: string): Record<string, string> {
  try {
    const raw = window.localStorage.getItem(storageKey);
    const parsed = raw ? JSON.parse(raw) as unknown : {};
    return parsed && typeof parsed === "object" ? parsed as Record<string, string> : {};
  } catch {
    return {};
  }
}

function writeReferenceUrls(storageKey: string, urls: Record<string, string>): void {
  window.localStorage.setItem(storageKey, JSON.stringify(urls));
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

function swatchStyle(entry: MaterialProofEntry): string {
  return `background:${materialColor(entry)};`;
}

function boardStyle(entry: MaterialProofEntry): string {
  const base = materialColor(entry);
  const grain = entry.grainColorHex ?? "#6f4425";
  const contrast = Math.max(0.08, Math.min(0.8, Number(entry.grainContrast ?? 0.3)));
  const gloss = entry.surfaceProfile?.includes("gloss") ? "0 22px 45px rgba(255,255,255,0.34) inset, 0 16px 32px rgba(0,0,0,0.18)" : entry.surfaceProfile?.includes("satin") ? "0 16px 30px rgba(255,255,255,0.18) inset, 0 12px 24px rgba(0,0,0,0.16)" : "0 4px 14px rgba(0,0,0,0.16)";
  const opacity = contrast.toFixed(2);
  if (entry.pbrBaseColorUrl) {
    const tint = hexToRgb(base);
    const tintStrength = Math.max(0, Math.min(0.5, Number(entry.tintStrength ?? 0.18)));
    const overlay = `rgba(${tint.r}, ${tint.g}, ${tint.b}, ${tintStrength.toFixed(2)})`;
    return `background:
      linear-gradient(0deg, ${overlay}, ${overlay}),
      url('${escapeCssUrl(entry.pbrBaseColorUrl)}');
      background-size: auto 58%;
      background-repeat: repeat;
      background-position: center;
      background-blend-mode: multiply, normal;
      box-shadow:${gloss};`;
  }
  return `background:
    linear-gradient(110deg, rgba(255,255,255,${entry.surfaceProfile?.includes("gloss") ? "0.36" : "0.08"}), transparent 42%),
    repeating-linear-gradient(90deg, ${grain} 0 2px, transparent 2px 12px),
    linear-gradient(135deg, ${base}, ${base});
    background-blend-mode: screen, multiply, normal;
    opacity: 1;
    --grain-opacity:${opacity};
    box-shadow:${gloss};`;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const normalized = /^#[0-9a-f]{6}$/i.test(hex) ? hex.slice(1) : "b98a55";
  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16)
  };
}

function escapeCssUrl(value: string): string {
  return value.replace(/["\\\n\r]/g, "");
}

function cssEscape(value: string): string {
  return value.replace(/["\\]/g, "\\$&");
}

function surfaceClass(profile: string): string {
  if (profile.includes("gloss")) return "profile-gloss";
  if (profile.includes("satin")) return "profile-satin";
  if (profile.includes("supermat")) return "profile-supermat";
  if (profile.includes("raw")) return "profile-raw";
  return "profile-matte";
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" })[char] ?? char);
}

function escapeAttr(value: string): string {
  return escapeHtml(value);
}
