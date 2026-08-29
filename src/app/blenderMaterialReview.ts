import type { MaterialColorTransform, MaterialRequestPayload, SceneExportV1 } from "../core/exportScene";
import {
  demosReferenceImageUrl,
  demosReferencePageUrl,
  materialColor,
  type MaterialProofCatalogs,
  type MaterialProofEntry
} from "./materialProofData";
import { MATERIAL_PBR_OPTIONS, pbrAssetUrl } from "./materialPbrOptions";

type SceneObject = SceneExportV1["objects"][number];
type ReviewResult = SceneExportV1 | null;

type MaterialSlot = {
  id: string;
  label: string;
  objectIndexes: number[];
  tags: string[];
  request: MaterialRequestPayload;
  reference?: MaterialProofEntry;
};

type SlotDraft = {
  slotId: string;
  demosDecorId: string;
  pbrMaterialId: string;
  surfaceProfile: string;
  baseColorHex: string;
  grainColorHex: string;
  sampledColors: string[];
  sampledFromImage: boolean;
  tintStrength: number;
  grainContrast: number;
  roughnessMultiplier: number;
  roughnessOverride: string;
  bumpMultiplier: number;
  grainDepth: number;
  coatMultiplier: number;
  tileSizeMeters: number;
  grainDirection: "vertical" | "horizontal" | "lengthwise" | "none";
};

const SURFACE_PROFILES = [
  "wood_raw_matte",
  "wood_standard_matte",
  "wood_soft_touch_supermat",
  "wood_satin_lacquer",
  "wood_gloss_laminate",
  "generic_matte",
  "wall_matte"
];

const DEFAULT_WALL_REQUEST: MaterialRequestPayload = {
  materialId: "wall_painted_white",
  surfaceProfile: "wall_matte",
  colorTransform: { mode: "none", baseColorHex: "#f2eee6", grainColorHex: "#d8d0c2", tintStrength: 0, grainContrast: 0.12 },
  tileSizeMeters: 0.4,
  uvScale: 2.5,
  textureStrength: 0.35,
  reflectivity: 0.18,
  grainDirection: "none",
  bumpMultiplier: 0.65,
  grainDepth: 0.08
};

const DEFAULT_FLOOR_REQUEST: MaterialRequestPayload = {
  materialId: "stone_concrete_smooth",
  surfaceProfile: "generic_matte",
  colorTransform: { mode: "none", baseColorHex: "#d7d0c6", grainColorHex: "#a79e92", tintStrength: 0, grainContrast: 0.16 },
  tileSizeMeters: 0.4,
  uvScale: 2.5,
  textureStrength: 0.45,
  reflectivity: 0.24,
  grainDirection: "none",
  bumpMultiplier: 0.8,
  grainDepth: 0.1
};

const DEFAULT_HARDWARE_REQUEST: MaterialRequestPayload = {
  materialId: "metal_brushed_steel",
  surfaceProfile: "generic_matte",
  baseColor: null,
  colorTransform: { mode: "none", tintStrength: 0, grainContrast: 0 },
  tileSizeMeters: 0.4,
  uvScale: 2.5,
  textureStrength: 0.55,
  reflectivity: 0.55,
  grainDirection: "none",
  bumpMultiplier: 0.35,
  grainDepth: 0.02
};

export async function openBlenderMaterialReview(inputPayload: SceneExportV1): Promise<ReviewResult> {
  const payload = clonePayload(inputPayload);
  applyRoomDefaults(payload);
  const catalogs = await loadCatalogs();
  const references = buildReferenceList(catalogs);
  const slots = buildMaterialSlots(payload, references);
  const drafts = new Map(slots.map((slot) => [slot.id, draftFromSlot(slot)]));
  await autoSampleDraftColors(slots, drafts, references);

  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "blender-review-overlay";
    document.body.appendChild(overlay);

    let selectedSlotId = slots[0]?.id ?? "";

    const close = (result: ReviewResult) => {
      overlay.remove();
      resolve(result);
    };

    const render = () => {
      const selected = slots.find((slot) => slot.id === selectedSlotId) ?? slots[0];
      overlay.innerHTML = `
        <section class="blender-review">
          <header class="blender-review-header">
            <div>
              <p>NO DEMOS TEXTURE USED</p>
              <h2>Blender Material Review</h2>
              <span>Najprv skontroluj materialy v projekte. Render sa spusti az po potvrdeni.</span>
            </div>
            <button type="button" data-action="cancel">Cancel</button>
          </header>
          <div class="blender-review-body">
            <aside class="blender-review-slots">
              <h3>Materials used in project</h3>
              ${slots.map((slot) => renderSlotButton(slot, drafts.get(slot.id), selectedSlotId)).join("")}
            </aside>
            <main class="blender-review-main">
              ${selected ? renderSelectedSlot(selected, drafts.get(selected.id), references) : "<p>No exportable materials found.</p>"}
            </main>
          </div>
          <footer class="blender-review-footer">
            <span>${slots.length} material groups / ${payload.objects.length} exported objects</span>
            <button type="button" data-action="confirm">Confirm settings and render in Blender</button>
          </footer>
        </section>
      `;
      bind();
    };

    const bind = () => {
      overlay.querySelector<HTMLButtonElement>("[data-action='cancel']")?.addEventListener("click", () => close(null));
      overlay.querySelector<HTMLButtonElement>("[data-action='confirm']")?.addEventListener("click", () => {
        applyDraftsToPayload(payload, slots, drafts);
        close(payload);
      });
      overlay.querySelectorAll<HTMLButtonElement>("[data-slot-id]").forEach((button) => {
        button.addEventListener("click", () => {
          selectedSlotId = button.dataset.slotId ?? selectedSlotId;
          render();
        });
      });
      const selected = slots.find((slot) => slot.id === selectedSlotId);
      if (!selected) return;
      const update = (patch: Partial<SlotDraft>) => {
        const current = drafts.get(selected.id);
        if (!current) return;
        drafts.set(selected.id, { ...current, ...patch });
        render();
      };
      overlay.querySelector<HTMLSelectElement>("[data-control='demosDecorId']")?.addEventListener("change", (event) => {
        const value = (event.currentTarget as HTMLSelectElement).value;
        const match = references.find((entry) => entry.vendorDecorId === value);
        const current = drafts.get(selected.id);
        if (!current) return;
        const next = {
          ...current,
          demosDecorId: value,
          pbrMaterialId: match?.pbrMaterialId || current.pbrMaterialId,
          baseColorHex: match ? materialColor(match) : current.baseColorHex,
          grainColorHex: match?.grainColorHex ?? current.grainColorHex,
          sampledColors: [],
          sampledFromImage: false,
          surfaceProfile: match?.surfaceProfile ?? current.surfaceProfile,
          tintStrength: numberOr(match?.tintStrength, current.tintStrength),
          grainContrast: numberOr(match?.grainContrast, current.grainContrast),
          bumpMultiplier: numberOr(match?.bumpMultiplier, current.bumpMultiplier),
          grainDepth: numberOr(match?.grainDepth, current.grainDepth)
        };
        drafts.set(selected.id, next);
        render();
        void sampleReferenceForDraft(match, selected.request, next).then((sampled) => {
          if (!sampled) return;
          drafts.set(selected.id, sampled);
          render();
        });
      });
      overlay.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-control]").forEach((control) => {
        if (control.dataset.control === "demosDecorId") return;
        control.addEventListener("input", () => {
          const key = control.dataset.control as keyof SlotDraft;
          const value = control.value;
          if (["tintStrength", "grainContrast", "roughnessMultiplier", "bumpMultiplier", "grainDepth", "coatMultiplier", "tileSizeMeters"].includes(key)) {
            update({ [key]: Number(value) } as Partial<SlotDraft>);
          } else {
            update({ [key]: value } as Partial<SlotDraft>);
          }
        });
      });
    };

    render();
  });
}

function clonePayload(payload: SceneExportV1): SceneExportV1 {
  return JSON.parse(JSON.stringify(payload)) as SceneExportV1;
}

async function loadCatalogs(): Promise<MaterialProofCatalogs> {
  const response = await fetch("/api/material-proof/catalogs", { credentials: "include", headers: { Accept: "application/json" } });
  if (!response.ok) return { csvBoards: [], production: [], staging: [] };
  const data = await response.json() as Partial<MaterialProofCatalogs>;
  return {
    csvBoards: Array.isArray(data.csvBoards) ? data.csvBoards : [],
    production: Array.isArray(data.production) ? data.production : [],
    staging: Array.isArray(data.staging) ? data.staging : []
  };
}

function buildReferenceList(catalogs: MaterialProofCatalogs): MaterialProofEntry[] {
  const seen = new Set<string>();
  const all = [...catalogs.production, ...catalogs.staging, ...catalogs.csvBoards];
  return all.filter((entry) => {
    if (!entry.vendorDecorId || seen.has(entry.vendorDecorId)) return false;
    seen.add(entry.vendorDecorId);
    return true;
  });
}

function applyRoomDefaults(payload: SceneExportV1): void {
  payload.objects.forEach((object) => {
    if (isHardwareObject(object)) {
      object.material.materialRequest = { ...DEFAULT_HARDWARE_REQUEST };
    } else if (isWallObject(object) || isUnderlayObject(object)) {
      object.material.materialRequest = { ...DEFAULT_WALL_REQUEST };
    } else if (isFloorObject(object)) {
      object.material.materialRequest = { ...DEFAULT_FLOOR_REQUEST };
    }
  });
}

function buildMaterialSlots(payload: SceneExportV1, references: MaterialProofEntry[]): MaterialSlot[] {
  const slots: MaterialSlot[] = [];
  const byKey = new Map<string, MaterialSlot>();
  payload.objects.forEach((object, index) => {
    if (isHardwareObject(object)) return;
    const request = object.material.materialRequest;
    if (!request) return;
    const label = slotLabel(object, request);
    const key = slotKey(object, request, label);
    let slot = byKey.get(key);
    if (!slot) {
      slot = {
        id: `slot_${byKey.size}`,
        label,
        objectIndexes: [],
        tags: object.tags,
        request,
        reference: request.vendorDecorId ? references.find((entry) => entry.vendorDecorId === request.vendorDecorId) : undefined
      };
      byKey.set(key, slot);
      slots.push(slot);
    }
    slot.objectIndexes.push(index);
  });
  return slots;
}

function slotKey(object: SceneObject, request: MaterialRequestPayload, label: string): string {
  if (isWallObject(object) || isUnderlayObject(object)) return "room_plaster";
  if (isFloorObject(object)) return "floor";
  return JSON.stringify({
    label,
    materialId: request.materialId,
    vendor: request.vendor,
    vendorDecorId: request.vendorDecorId,
    surfaceProfile: request.surfaceProfile,
    baseColor: request.baseColor,
    colorTransform: request.colorTransform
  });
}

function slotLabel(object: SceneObject, request: MaterialRequestPayload): string {
  if (isWallObject(object) || isUnderlayObject(object)) return "Walls / underside plaster";
  if (isFloorObject(object)) return "Floor";
  return request.displayName || request.sourceCatalogMaterialId || request.vendorDecorId || request.materialId || object.name;
}

function isWallObject(object: SceneObject): boolean {
  const name = object.name.toLowerCase();
  if (object.tags.includes("module")) return false;
  return object.tags.includes("wall") || name.startsWith("wallmesh") || name.includes("roomback") || name.includes("roomfront") || name.includes("roomleft") || name.includes("roomright") || name.includes("ceiling");
}

function isFloorObject(object: SceneObject): boolean {
  const name = object.name.toLowerCase();
  return object.tags.includes("floor") || name.startsWith("floormesh") || name.includes("roomfloor");
}

function isUnderlayObject(object: SceneObject): boolean {
  const name = object.name.toLowerCase();
  return object.tags.includes("underlay") || name.includes("underlay");
}

function isHardwareObject(object: SceneObject): boolean {
  const name = object.name.toLowerCase();
  return (
    object.tags.includes("hardware") ||
    name.includes("handle") ||
    name.includes("uchyt") ||
    name.includes("hinge") ||
    name.includes("leg") ||
    name.includes("foot") ||
    name.includes("screw") ||
    name.includes("kickclip") ||
    name.includes("bracket") ||
    name.includes("knob") ||
    name.includes("rail")
  );
}

function draftFromSlot(slot: MaterialSlot): SlotDraft {
  const request = slot.request;
  const transform: Partial<MaterialColorTransform> = request.colorTransform ?? {};
  const pbr = pbrOptionFor(slot.reference?.pbrMaterialId || request.materialId || request.targetInternalMaterialId);
  const fallbackColor = slot.reference ? materialColor(slot.reference) : "#b98a55";
  return {
    slotId: slot.id,
    demosDecorId: request.vendorDecorId ?? slot.reference?.vendorDecorId ?? "",
    pbrMaterialId: pbr.id,
    surfaceProfile: request.surfaceProfile || slot.reference?.surfaceProfile || "wood_standard_matte",
    baseColorHex: transform.baseColorHex || request.baseColor || fallbackColor,
    grainColorHex: transform.grainColorHex || slot.reference?.grainColorHex || "#6f4425",
    sampledColors: [],
    sampledFromImage: false,
    tintStrength: numberOr(transform.tintStrength, slot.reference?.tintStrength, 0.35),
    grainContrast: numberOr(transform.grainContrast, slot.reference?.grainContrast, 0.35),
    roughnessMultiplier: numberOr(request.roughnessMultiplier, slot.reference?.roughnessMultiplier, 1),
    roughnessOverride: typeof request.roughnessOverride === "number" ? String(request.roughnessOverride) : "",
    bumpMultiplier: numberOr(request.bumpMultiplier, slot.reference?.bumpMultiplier, 1),
    grainDepth: numberOr(request.grainDepth, slot.reference?.grainDepth, 0.22),
    coatMultiplier: numberOr(request.coatMultiplier, 1),
    tileSizeMeters: numberOr(request.tileSizeMeters, slot.reference?.tileSizeMeters, 0.4),
    grainDirection: normalizeGrain(request.grainDirection || slot.reference?.grainDirectionDefault)
  };
}

function numberOr(...values: unknown[]): number {
  for (const value of values) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return 0;
}

function normalizeGrain(value: unknown): SlotDraft["grainDirection"] {
  return value === "horizontal" || value === "lengthwise" || value === "none" ? value : "vertical";
}

async function autoSampleDraftColors(slots: MaterialSlot[], drafts: Map<string, SlotDraft>, references: MaterialProofEntry[]): Promise<void> {
  await Promise.all(slots.map(async (slot) => {
    const current = drafts.get(slot.id);
    if (!current) return;
    const reference = current.demosDecorId ? references.find((entry) => entry.vendorDecorId === current.demosDecorId) : slot.reference;
    const sampled = await sampleReferenceForDraft(reference, slot.request, current);
    if (sampled) drafts.set(slot.id, sampled);
  }));
}

async function sampleReferenceForDraft(
  reference: MaterialProofEntry | undefined,
  request: MaterialRequestPayload,
  draft: SlotDraft
): Promise<SlotDraft | null> {
  const url = (reference ? demosReferenceImageUrl(reference) : null) ?? request.demosReferenceImageUrl ?? null;
  if (!url || !/^https?:\/\//i.test(url)) return null;
  const sample = await sampleFiveColorsFromImage(proxyReferenceImageUrl(url));
  if (!sample) return null;
  return {
    ...draft,
    baseColorHex: sample.averageHex,
    grainColorHex: darkestColor(sample.colors) ?? darkenHex(sample.averageHex, 0.58),
    sampledColors: sample.colors,
    sampledFromImage: true,
    tintStrength: 0.96,
    grainContrast: Math.max(0.08, Math.min(0.52, colorSpread(sample.colors)))
  };
}

function proxyReferenceImageUrl(url: string): string {
  return `/api/material-proof/reference-image?url=${encodeURIComponent(url)}`;
}

type ColorSampleResult = {
  colors: string[];
  averageHex: string;
};

function sampleFiveColorsFromImage(src: string): Promise<ColorSampleResult | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      try {
        const width = image.naturalWidth || image.width;
        const height = image.naturalHeight || image.height;
        if (!width || !height) return resolve(null);
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return resolve(null);
        ctx.drawImage(image, 0, 0, width, height);
        const points = [
          [0.5, 0.5],
          [0.32, 0.34],
          [0.68, 0.34],
          [0.32, 0.68],
          [0.68, 0.68]
        ];
        const colors = points.map(([px, py]) => {
          const x = Math.max(0, Math.min(width - 1, Math.round(px * (width - 1))));
          const y = Math.max(0, Math.min(height - 1, Math.round(py * (height - 1))));
          const data = ctx.getImageData(x, y, 1, 1).data;
          return rgbToHex(data[0], data[1], data[2]);
        });
        resolve({ colors, averageHex: averageHex(colors) });
      } catch {
        resolve(null);
      }
    };
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

function averageHex(colors: string[]): string {
  if (!colors.length) return "#b98a55";
  const total = colors.reduce((acc, color) => {
    const rgb = hexToRgb(color);
    return { r: acc.r + rgb.r, g: acc.g + rgb.g, b: acc.b + rgb.b };
  }, { r: 0, g: 0, b: 0 });
  return rgbToHex(total.r / colors.length, total.g / colors.length, total.b / colors.length);
}

function darkestColor(colors: string[]): string | null {
  if (!colors.length) return null;
  return [...colors].sort((a, b) => luminance(hexToRgb(a)) - luminance(hexToRgb(b)))[0] ?? null;
}

function colorSpread(colors: string[]): number {
  if (colors.length < 2) return 0.18;
  const values = colors.map((color) => luminance(hexToRgb(color)));
  return (Math.max(...values) - Math.min(...values)) / 255;
}

function darkenHex(hex: string, amount: number): string {
  const rgb = hexToRgb(hex);
  return rgbToHex(rgb.r * amount, rgb.g * amount, rgb.b * amount);
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const safe = /^#[0-9a-fA-F]{6}$/.test(hex) ? hex.slice(1) : "b98a55";
  return {
    r: parseInt(safe.slice(0, 2), 16),
    g: parseInt(safe.slice(2, 4), 16),
    b: parseInt(safe.slice(4, 6), 16)
  };
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((value) => Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, "0")).join("")}`;
}

function luminance(rgb: { r: number; g: number; b: number }): number {
  return 0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b;
}

function pbrOptionFor(id: unknown) {
  return MATERIAL_PBR_OPTIONS.find((option) => option.id === id) ?? MATERIAL_PBR_OPTIONS[1] ?? MATERIAL_PBR_OPTIONS[0] ?? {
    id: "wood_oak_natural",
    label: "Wood Oak Natural",
    path: "assets/materials/wood/wood_oak_natural/maps/basecolor.jpg"
  };
}

function applyDraftsToPayload(payload: SceneExportV1, slots: MaterialSlot[], drafts: Map<string, SlotDraft>): void {
  for (const slot of slots) {
    const draft = drafts.get(slot.id);
    if (!draft) continue;
    const request = requestFromDraft(draft, slot.request);
    for (const index of slot.objectIndexes) {
      const object = payload.objects[index];
      if (object) object.material.materialRequest = request;
    }
  }
}

function requestFromDraft(draft: SlotDraft, source?: MaterialRequestPayload): MaterialRequestPayload {
  const roughnessOverride = draft.roughnessOverride.trim() ? Number(draft.roughnessOverride) : null;
  const solidColor = draft.pbrMaterialId === "lacquer_base_white";
  return {
    materialId: draft.pbrMaterialId,
    ...(source?.vendor ? { vendor: source.vendor } : draft.demosDecorId ? { vendor: "demos" } : {}),
    ...(draft.demosDecorId ? { vendorDecorId: draft.demosDecorId } : source?.vendorDecorId ? { vendorDecorId: source.vendorDecorId } : {}),
    ...(source?.sourceCatalogMaterialId ? { sourceCatalogMaterialId: source.sourceCatalogMaterialId } : {}),
    ...(source?.displayName ? { displayName: source.displayName } : {}),
    ...(source?.demosReferenceImageUrl ? { demosReferenceImageUrl: source.demosReferenceImageUrl } : {}),
    ...(source?.demosReferencePageUrl ? { demosReferencePageUrl: source.demosReferencePageUrl } : {}),
    targetInternalMaterialId: draft.pbrMaterialId,
    usesExternalVendorTexture: false,
    surfaceProfile: draft.surfaceProfile,
    colorTransform: {
      mode: solidColor ? "solid_color" : "tint_multiply",
      baseColorHex: draft.baseColorHex,
      grainColorHex: draft.grainColorHex,
      secondaryColorHex: draft.sampledColors[1] ?? null,
      tintStrength: draft.tintStrength,
      grainContrast: draft.grainContrast,
      hueShiftDegrees: 0,
      saturationScale: 1,
      valueScale: 1,
      contrastScale: 1
    },
    roughnessMultiplier: draft.roughnessMultiplier,
    roughnessOverride: Number.isFinite(roughnessOverride) ? roughnessOverride : null,
    bumpMultiplier: draft.bumpMultiplier,
    grainDepth: draft.grainDepth,
    coatMultiplier: draft.coatMultiplier,
    tileSizeMeters: draft.tileSizeMeters,
    uvScale: 1 / draft.tileSizeMeters,
    grainDirection: draft.grainDirection,
    textureStrength: 0.5,
    reflectivity: draft.surfaceProfile.includes("gloss") ? 0.65 : draft.surfaceProfile.includes("satin") ? 0.45 : 0.32
  };
}

function renderSlotButton(slot: MaterialSlot, draft: SlotDraft | undefined, selectedSlotId: string): string {
  return `
    <button type="button" class="blender-review-slot ${slot.id === selectedSlotId ? "selected" : ""}" data-slot-id="${escapeAttr(slot.id)}">
      <span>${escapeHtml(slot.label)}</span>
      <small>${slot.objectIndexes.length} objects / ${escapeHtml(draft?.pbrMaterialId ?? "")}</small>
    </button>
  `;
}

function renderSelectedSlot(slot: MaterialSlot, draft: SlotDraft | undefined, references: MaterialProofEntry[]): string {
  if (!draft) return "";
  const pbr = pbrOptionFor(draft.pbrMaterialId);
  const selectedRef = references.find((entry) => entry.vendorDecorId === draft.demosDecorId) ?? slot.reference;
  const imageUrl = selectedRef ? demosReferenceImageUrl(selectedRef) : null;
  const pageUrl = selectedRef ? demosReferencePageUrl(selectedRef) : null;
  const payload = requestFromDraft(draft, slot.request);
  const requestImageUrl = slot.request.demosReferenceImageUrl && /^https?:\/\//i.test(slot.request.demosReferenceImageUrl) ? slot.request.demosReferenceImageUrl : null;
  const requestPageUrl = slot.request.demosReferencePageUrl && /^https?:\/\//i.test(slot.request.demosReferencePageUrl) ? slot.request.demosReferencePageUrl : null;
  const displayImageUrl = imageUrl ?? requestImageUrl;
  const displayPageUrl = pageUrl ?? requestPageUrl;
  return `
    <div class="blender-review-comparison">
      <section>
        <h3>Demos preview</h3>
        ${displayImageUrl ? `<img src="/api/material-proof/reference-image?url=${encodeURIComponent(displayImageUrl)}" alt="${escapeAttr(selectedRef?.displayName ?? slot.request.displayName ?? "Demos material")}" />` : `<div class="blender-review-empty">No Demos reference for this material group</div>`}
        ${displayPageUrl ? `<a href="${escapeAttr(displayPageUrl)}" target="_blank" rel="noreferrer">Open Demos link</a>` : ""}
      </section>
      <section>
        <h3>Our Blender prediction</h3>
        <div class="blender-review-estimate" style="${estimateStyle(draft, pbr.path)}"></div>
        <small>NO DEMOS TEXTURE USED / ${escapeHtml(pbr.label)} / ${draft.sampledFromImage ? "5-color sampled prediction" : "catalog fallback color"}</small>
        ${draft.sampledColors.length ? `<div class="blender-review-samples">${draft.sampledColors.map((color) => `<span title="${escapeAttr(color)}" style="background:${escapeAttr(color)}"></span>`).join("")}<strong>${escapeHtml(draft.baseColorHex)}</strong></div>` : ""}
      </section>
    </div>
    <div class="blender-review-controls">
      ${renderSelect("Demos reference", "demosDecorId", draft.demosDecorId, [["", "No Demos reference"], ...references.map((entry) => [entry.vendorDecorId ?? "", entry.displayName ?? entry.vendorDecorId ?? "Demos"] as [string, string])])}
      ${renderSelect("Our PBR texture", "pbrMaterialId", draft.pbrMaterialId, MATERIAL_PBR_OPTIONS.map((option) => [option.id, option.label]))}
      ${renderSelect("Surface / gloss profile", "surfaceProfile", draft.surfaceProfile, SURFACE_PROFILES.map((profile) => [profile, profile]))}
      ${renderInput("Base color", "baseColorHex", draft.baseColorHex, "color")}
      ${renderInput("Grain color", "grainColorHex", draft.grainColorHex, "color")}
      ${renderInput("Tint strength", "tintStrength", String(draft.tintStrength), "number", "0", "1", "0.01")}
      ${renderInput("Grain contrast", "grainContrast", String(draft.grainContrast), "number", "0", "1", "0.01")}
      ${renderInput("Roughness multiplier", "roughnessMultiplier", String(draft.roughnessMultiplier), "number", "0", "2", "0.01")}
      ${renderInput("Roughness override", "roughnessOverride", draft.roughnessOverride, "number", "0", "1", "0.01")}
      ${renderInput("Bump multiplier", "bumpMultiplier", String(draft.bumpMultiplier), "number", "0", "2", "0.01")}
      ${renderInput("Grain depth", "grainDepth", String(draft.grainDepth), "number", "0", "2", "0.01")}
      ${renderInput("Coat multiplier", "coatMultiplier", String(draft.coatMultiplier), "number", "0", "2", "0.01")}
      ${renderInput("Tile size meters", "tileSizeMeters", String(draft.tileSizeMeters), "number", "0.05", "5", "0.01")}
      ${renderSelect("Grain direction", "grainDirection", draft.grainDirection, [["vertical", "vertical"], ["horizontal", "horizontal"], ["lengthwise", "lengthwise"], ["none", "none"]])}
    </div>
    <section class="blender-review-payload">
      <h3>Payload that Blender will receive for this material</h3>
      <pre>${escapeHtml(JSON.stringify(payload, null, 2))}</pre>
    </section>
  `;
}

function renderSelect(label: string, key: keyof SlotDraft, value: string, options: Array<[string, string]>): string {
  return `
    <label>
      <span>${escapeHtml(label)}</span>
      <select data-control="${escapeAttr(key)}">
        ${options.map(([optionValue, optionLabel]) => `<option value="${escapeAttr(optionValue)}" ${optionValue === value ? "selected" : ""}>${escapeHtml(optionLabel)}</option>`).join("")}
      </select>
    </label>
  `;
}

function renderInput(label: string, key: keyof SlotDraft, value: string, type: string, min = "", max = "", step = ""): string {
  return `
    <label>
      <span>${escapeHtml(label)}</span>
      <input data-control="${escapeAttr(key)}" type="${escapeAttr(type)}" value="${escapeAttr(value)}" ${min ? `min="${escapeAttr(min)}"` : ""} ${max ? `max="${escapeAttr(max)}"` : ""} ${step ? `step="${escapeAttr(step)}"` : ""} />
    </label>
  `;
}

function estimateStyle(draft: SlotDraft, pbrPath: string): string {
  const url = pbrAssetUrl(pbrPath);
  const textureOpacity = draft.pbrMaterialId === "lacquer_base_white" ? 0 : Math.max(0.32, Math.min(0.68, 0.42 + draft.grainContrast * 0.5));
  return `
    --review-base-color: ${draft.baseColorHex};
    --review-texture-url: url("${url}");
    --review-texture-opacity: ${textureOpacity};
    --review-texture-contrast: ${1 + draft.grainContrast};
    background: ${draft.baseColorHex};
    box-shadow: ${draft.surfaceProfile.includes("gloss") ? "inset 0 22px 46px rgba(255,255,255,0.34)" : draft.surfaceProfile.includes("satin") ? "inset 0 16px 32px rgba(255,255,255,0.18)" : "none"};
  `;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#039;" })[char] ?? char);
}

function escapeAttr(value: string): string {
  return escapeHtml(value);
}
