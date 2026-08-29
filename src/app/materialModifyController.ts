import * as THREE from "three";
import type { ClientCatalog, MaterialDefinition } from "../core/catalog/catalog-types";
import { createMaterialRequestFromCatalogMaterial } from "../core/catalog/material-render-request";
import type { MaterialColorTransform, MaterialRequestPayload } from "../core/exportScene";
import { MATERIAL_PBR_OPTIONS, pbrAssetUrl } from "./materialPbrOptions";

type MaterialModifyControllerContext = {
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  raycaster: THREE.Raycaster;
  getCamera: () => THREE.Camera;
  catalog: ClientCatalog;
  setStatus: (message: string) => void;
  commitHistory: () => void;
};

type EditableTarget = {
  mesh: THREE.Mesh;
  key: string;
  label: string;
  request: MaterialRequestPayload;
  tags: string[];
};

type MaterialDraft = {
  materialId: string;
  surfaceProfile: string;
  baseColorHex: string;
  grainColorHex: string;
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

const GRAIN_DIRECTIONS: MaterialDraft["grainDirection"][] = ["vertical", "horizontal", "lengthwise", "none"];
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

const surfaceRoughness: Record<string, number> = {
  wood_raw_matte: 0.75,
  wood_standard_matte: 0.55,
  wood_soft_touch_supermat: 0.88,
  wood_satin_lacquer: 0.34,
  wood_gloss_laminate: 0.14,
  generic_matte: 0.55,
  wall_matte: 0.72
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const finite = (value: unknown, fallback: number) => (typeof value === "number" && Number.isFinite(value) ? value : fallback);
const text = (value: unknown, fallback = "") => (typeof value === "string" && value.trim() ? value.trim() : fallback);
const bool = (value: unknown) => value === true || value === "true";
const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);

function normalizeHex(value: unknown, fallback: string): string {
  return typeof value === "string" && HEX_RE.test(value) ? value : fallback;
}

function darken(hex: string, amount = 0.58): string {
  const safe = normalizeHex(hex, "#b98a55").slice(1);
  const rgb = [safe.slice(0, 2), safe.slice(2, 4), safe.slice(4, 6)].map((part) =>
    Math.max(0, Math.round(parseInt(part, 16) * amount))
  );
  return `#${rgb.map((part) => part.toString(16).padStart(2, "0")).join("")}`;
}

function tagsOf(mesh: THREE.Mesh): string[] {
  const tags = (mesh.userData as Record<string, unknown>).tags;
  return Array.isArray(tags) ? tags.filter((tag): tag is string => typeof tag === "string") : [];
}

function isHardware(tags: string[]) {
  return tags.some((tag) => ["hardware", "handle", "leg"].includes(tag));
}

function materialKey(mesh: THREE.Mesh): string | null {
  const data = mesh.userData as Record<string, unknown>;
  const request = data.materialRequest as Partial<MaterialRequestPayload> | undefined;
  return (
    text(request?.sourceCatalogMaterialId) ||
    text(request?.vendorDecorId) ||
    text(data.catalogMaterialId) ||
    text(request?.materialId) ||
    null
  );
}

function defaultRequestForTags(tags: string[]): MaterialRequestPayload {
  if (tags.includes("wall")) {
    return {
      materialId: "wall_painted_white",
      surfaceProfile: "wall_matte",
      colorTransform: { mode: "none", baseColorHex: "#f2eee6", grainColorHex: "#d8d0c2", tintStrength: 0, grainContrast: 0.12 },
      tileSizeMeters: 0.4,
      uvScale: 2.5,
      grainDirection: "none",
      roughnessMultiplier: 1,
      bumpMultiplier: 0.65,
      grainDepth: 0.08,
      coatMultiplier: 0.6,
      usesExternalVendorTexture: false
    };
  }
  if (tags.includes("floor") || tags.includes("worktop")) {
    return {
      materialId: tags.includes("worktop") ? "stone_concrete_smooth" : "stone_concrete_smooth",
      surfaceProfile: "generic_matte",
      colorTransform: { mode: "none", baseColorHex: "#d7d0c6", grainColorHex: "#a79e92", tintStrength: 0, grainContrast: 0.16 },
      tileSizeMeters: 0.4,
      uvScale: 2.5,
      grainDirection: tags.includes("worktop") ? "lengthwise" : "none",
      roughnessMultiplier: 1,
      bumpMultiplier: 0.8,
      grainDepth: 0.1,
      coatMultiplier: 0.7,
      usesExternalVendorTexture: false
    };
  }
  return {
    materialId: "wood_oak_natural",
    surfaceProfile: "wood_standard_matte",
    colorTransform: { mode: "tint_multiply", baseColorHex: "#b98a55", grainColorHex: "#6f4425", tintStrength: 0.92, grainContrast: 0.36 },
    tileSizeMeters: 0.4,
    uvScale: 2.5,
    grainDirection: "vertical",
    roughnessMultiplier: 1,
    bumpMultiplier: 1,
    grainDepth: 0.24,
    coatMultiplier: 0.75,
    usesExternalVendorTexture: false
  };
}

function requestFromMesh(mesh: THREE.Mesh, catalog: ClientCatalog): MaterialRequestPayload {
  const data = mesh.userData as Record<string, unknown>;
  if (data.materialRequest && typeof data.materialRequest === "object") {
    return structuredClone(data.materialRequest as MaterialRequestPayload);
  }
  const catalogMaterialId = text(data.catalogMaterialId);
  const material = catalog.materials.find((item) => item.id === catalogMaterialId);
  if (material) return createMaterialRequestFromCatalogMaterial(material);
  return defaultRequestForTags(tagsOf(mesh));
}

function getCatalogMaterial(mesh: THREE.Mesh, catalog: ClientCatalog): MaterialDefinition | null {
  const id = text((mesh.userData as Record<string, unknown>).catalogMaterialId);
  return catalog.materials.find((item) => item.id === id) ?? null;
}

function draftFromRequest(request: MaterialRequestPayload): MaterialDraft {
  const transform: Partial<MaterialColorTransform> = request.colorTransform ?? {};
  const baseColorHex = normalizeHex(transform.baseColorHex ?? request.baseColor, "#b98a55");
  const grainColorHex = normalizeHex(transform.grainColorHex, darken(baseColorHex));
  const materialId = text(request.targetInternalMaterialId) || text(request.materialId) || "wood_oak_natural";
  const tileSizeMeters = clamp(finite(request.tileSizeMeters, request.uvScale ? 1 / request.uvScale : 0.4), 0.1, 10);
  const direction = GRAIN_DIRECTIONS.includes(request.grainDirection as MaterialDraft["grainDirection"])
    ? (request.grainDirection as MaterialDraft["grainDirection"])
    : "vertical";
  return {
    materialId,
    surfaceProfile: text(request.surfaceProfile, "wood_standard_matte"),
    baseColorHex,
    grainColorHex,
    tintStrength: clamp(finite(transform.tintStrength, 0.92), 0, 1),
    grainContrast: clamp(finite(transform.grainContrast, 0.36), 0, 1),
    roughnessMultiplier: clamp(finite(request.roughnessMultiplier, 1), 0, 2),
    roughnessOverride: typeof request.roughnessOverride === "number" ? String(request.roughnessOverride) : "",
    bumpMultiplier: clamp(finite(request.bumpMultiplier, 1), 0, 2),
    grainDepth: clamp(finite(request.grainDepth, 0.24), 0, 2),
    coatMultiplier: clamp(finite(request.coatMultiplier, 0.75), 0, 2),
    tileSizeMeters,
    grainDirection: direction
  };
}

function requestFromDraft(source: MaterialRequestPayload, draft: MaterialDraft): MaterialRequestPayload {
  const uvScale = 1 / draft.tileSizeMeters;
  const colorTransform: MaterialColorTransform = {
    mode: draft.surfaceProfile === "generic_matte" || draft.surfaceProfile === "wall_matte" ? "solid_color" : "tint_multiply",
    baseColorHex: draft.baseColorHex,
    grainColorHex: draft.grainColorHex,
    tintStrength: draft.tintStrength,
    grainContrast: draft.grainContrast,
    hueShiftDegrees: source.colorTransform?.hueShiftDegrees ?? 0,
    saturationScale: source.colorTransform?.saturationScale ?? 1,
    valueScale: source.colorTransform?.valueScale ?? 1,
    contrastScale: source.colorTransform?.contrastScale ?? 1
  };
  return {
    ...source,
    materialId: draft.materialId,
    targetInternalMaterialId: draft.materialId,
    surfaceProfile: draft.surfaceProfile,
    colorTransform,
    roughnessMultiplier: draft.roughnessMultiplier,
    roughnessOverride: draft.roughnessOverride.trim() ? clamp(Number(draft.roughnessOverride), 0, 1) : null,
    bumpMultiplier: draft.bumpMultiplier,
    grainDepth: draft.grainDepth,
    coatMultiplier: draft.coatMultiplier,
    tileSizeMeters: draft.tileSizeMeters,
    uvScale,
    grainDirection: draft.grainDirection,
    textureStrength: source.textureStrength ?? 0.5,
    reflectivity: draft.surfaceProfile.includes("gloss") ? 0.65 : draft.surfaceProfile.includes("satin") ? 0.45 : 0.32,
    usesExternalVendorTexture: false
  };
}

function collectEditableMeshes(scene: THREE.Scene): THREE.Mesh[] {
  const meshes: THREE.Mesh[] = [];
  scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const tags = tagsOf(mesh);
    if (isHardware(tags)) return;
    if (!materialKey(mesh) && !tags.length) return;
    meshes.push(mesh);
  });
  return meshes;
}

function findTargetFromClick(ctx: MaterialModifyControllerContext, event: PointerEvent): EditableTarget | null {
  const rect = ctx.renderer.domElement.getBoundingClientRect();
  const pointer = new THREE.Vector2(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1
  );
  const candidates = collectEditableMeshes(ctx.scene);
  ctx.raycaster.setFromCamera(pointer, ctx.getCamera());
  const hits = ctx.raycaster.intersectObjects(candidates, false);
  for (const hit of hits) {
    const mesh = hit.object as THREE.Mesh;
    const tags = tagsOf(mesh);
    if (isHardware(tags)) continue;
    const request = requestFromMesh(mesh, ctx.catalog);
    const key = materialKey(mesh) || request.sourceCatalogMaterialId || request.vendorDecorId || request.materialId || mesh.uuid;
    return {
      mesh,
      key,
      label: text(mesh.userData.catalogMaterialName) || request.displayName || mesh.name || key,
      request,
      tags
    };
  }
  return null;
}

function matchingMeshes(scene: THREE.Scene, target: EditableTarget): THREE.Mesh[] {
  const matches: THREE.Mesh[] = [];
  scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const tags = tagsOf(mesh);
    if (isHardware(tags)) return;
    const key = materialKey(mesh) || requestFromMesh(mesh, { materials: [] } as unknown as ClientCatalog).materialId || mesh.uuid;
    if (key === target.key || mesh === target.mesh) matches.push(mesh);
  });
  return matches;
}

function applyLiveMaterial(mesh: THREE.Mesh, draft: MaterialDraft) {
  const roughness = clamp(
    draft.roughnessOverride.trim()
      ? Number(draft.roughnessOverride)
      : (surfaceRoughness[draft.surfaceProfile] ?? 0.55) * draft.roughnessMultiplier,
    0,
    1
  );
  const apply = (material: THREE.Material) => {
    const mat = material as THREE.MeshStandardMaterial;
    if (mat.color instanceof THREE.Color) mat.color.set(draft.baseColorHex);
    if ("roughness" in mat) mat.roughness = roughness;
    if ("metalness" in mat) mat.metalness = 0;
    mat.needsUpdate = true;
  };
  if (Array.isArray(mesh.material)) mesh.material.forEach(apply);
  else apply(mesh.material);
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function renderOptions(selected: string) {
  return MATERIAL_PBR_OPTIONS.map((option) => `<option value="${escapeHtml(option.id)}" ${option.id === selected ? "selected" : ""}>${escapeHtml(option.label)}</option>`).join("");
}

function renderSurfaceOptions(selected: string) {
  return SURFACE_PROFILES.map((profile) => `<option value="${profile}" ${profile === selected ? "selected" : ""}>${profile}</option>`).join("");
}

function renderDirectionOptions(selected: string) {
  return GRAIN_DIRECTIONS.map((direction) => `<option value="${direction}" ${direction === selected ? "selected" : ""}>${direction}</option>`).join("");
}

function pbrPreviewUrl(materialId: string) {
  return pbrAssetUrl(MATERIAL_PBR_OPTIONS.find((option) => option.id === materialId)?.path ?? MATERIAL_PBR_OPTIONS[0].path);
}

function renderPanel(target: EditableTarget, draft: MaterialDraft, groupCount: number) {
  const payload = requestFromDraft(target.request, draft);
  const previewStyle = `background:
    linear-gradient(115deg, rgba(255,255,255,0.34), rgba(255,255,255,0) 36%, rgba(0,0,0,0.08) 72%),
    repeating-linear-gradient(90deg, ${draft.grainColorHex}00 0 18px, ${draft.grainColorHex}${Math.round(draft.grainContrast * 75).toString(16).padStart(2, "0")} 19px 22px),
    ${draft.baseColorHex};`;
  return `
    <section class="material-modify-panel" role="dialog" aria-label="Material modify">
      <header class="material-modify-header">
        <div>
          <p>Visualisation / Material Modify</p>
          <h2 data-material-modify-label></h2>
          <span>${groupCount} scene part${groupCount === 1 ? "" : "s"} using this material group</span>
        </div>
        <button type="button" data-action="close">Close</button>
      </header>
      <div class="material-modify-body">
        <div class="material-modify-preview">
          <div class="material-modify-board" style="${previewStyle}"></div>
          <img src="${pbrPreviewUrl(draft.materialId)}" alt="" />
          <strong>Live preview color</strong>
          <span>Blender uses this payload plus the selected internal PBR maps.</span>
        </div>
        <form class="material-modify-form">
          <label>Internal PBR texture<select data-field="materialId">${renderOptions(draft.materialId)}</select></label>
          <label>Surface profile<select data-field="surfaceProfile">${renderSurfaceOptions(draft.surfaceProfile)}</select></label>
          <label>Base color<input data-field="baseColorHex" type="color" value="${draft.baseColorHex}"></label>
          <label>Grain color<input data-field="grainColorHex" type="color" value="${draft.grainColorHex}"></label>
          <label>Tint strength<input data-field="tintStrength" type="number" min="0" max="1" step="0.01" value="${formatNumber(draft.tintStrength)}"></label>
          <label>Grain contrast<input data-field="grainContrast" type="number" min="0" max="1" step="0.01" value="${formatNumber(draft.grainContrast)}"></label>
          <label>Roughness multiplier<input data-field="roughnessMultiplier" type="number" min="0" max="2" step="0.05" value="${formatNumber(draft.roughnessMultiplier)}"></label>
          <label>Roughness override<input data-field="roughnessOverride" type="number" min="0" max="1" step="0.01" value="${draft.roughnessOverride}" placeholder="auto"></label>
          <label>Bump multiplier<input data-field="bumpMultiplier" type="number" min="0" max="2" step="0.05" value="${formatNumber(draft.bumpMultiplier)}"></label>
          <label>Grain depth<input data-field="grainDepth" type="number" min="0" max="2" step="0.05" value="${formatNumber(draft.grainDepth)}"></label>
          <label>Coat multiplier<input data-field="coatMultiplier" type="number" min="0" max="2" step="0.05" value="${formatNumber(draft.coatMultiplier)}"></label>
          <label>Tile size meters<input data-field="tileSizeMeters" type="number" min="0.1" max="10" step="0.05" value="${formatNumber(draft.tileSizeMeters)}"></label>
          <label>Grain direction<select data-field="grainDirection">${renderDirectionOptions(draft.grainDirection)}</select></label>
        </form>
        <pre class="material-modify-payload"></pre>
      </div>
      <footer class="material-modify-footer">
        <button type="button" data-action="cancel">Cancel</button>
        <button type="button" data-action="apply">Apply to this material</button>
      </footer>
    </section>
  `;
}

export function createMaterialModifyController(ctx: MaterialModifyControllerContext) {
  let active = false;
  let overlay: HTMLDivElement | null = null;

  const cleanupPicking = () => {
    if (!active) return;
    active = false;
    ctx.renderer.domElement.classList.remove("material-modify-picking");
    ctx.renderer.domElement.removeEventListener("pointerdown", onPointerDown, true);
  };

  const closePanel = () => {
    overlay?.remove();
    overlay = null;
  };

  const openPanel = (target: EditableTarget) => {
    cleanupPicking();
    closePanel();
    const group = matchingMeshes(ctx.scene, target);
    let draft = draftFromRequest(target.request);
    overlay = document.createElement("div");
    overlay.className = "material-modify-overlay";
    document.body.appendChild(overlay);

    const render = () => {
      if (!overlay) return;
      // lgtm[js/dom-text-reinterpreted-as-html]
      // All dynamic text is assigned below through textContent. The remaining
      // template values are constrained material IDs, enum values, hex colors,
      // or finite numeric values created by draftFromRequest/updateDraft.
      overlay.innerHTML = renderPanel(target, draft, group.length);
      const label = overlay.querySelector<HTMLElement>("[data-material-modify-label]");
      const payload = overlay.querySelector<HTMLElement>(".material-modify-payload");
      if (!label || !payload) throw new Error("Material modify panel is incomplete.");
      label.textContent = target.label;
      payload.textContent = JSON.stringify(requestFromDraft(target.request, draft), null, 2);
      bind();
    };

    const updateDraft = (field: string, value: string) => {
      if (field === "materialId") draft = { ...draft, materialId: value };
      else if (field === "surfaceProfile") draft = { ...draft, surfaceProfile: value };
      else if (field === "baseColorHex" && HEX_RE.test(value)) draft = { ...draft, baseColorHex: value };
      else if (field === "grainColorHex" && HEX_RE.test(value)) draft = { ...draft, grainColorHex: value };
      else if (field === "grainDirection" && GRAIN_DIRECTIONS.includes(value as MaterialDraft["grainDirection"])) {
        draft = { ...draft, grainDirection: value as MaterialDraft["grainDirection"] };
      } else if (field === "roughnessOverride") {
        draft = { ...draft, roughnessOverride: value };
      } else {
        const numeric = Number(value);
        if (!Number.isFinite(numeric)) return;
        if (field === "tintStrength") draft = { ...draft, tintStrength: clamp(numeric, 0, 1) };
        if (field === "grainContrast") draft = { ...draft, grainContrast: clamp(numeric, 0, 1) };
        if (field === "roughnessMultiplier") draft = { ...draft, roughnessMultiplier: clamp(numeric, 0, 2) };
        if (field === "bumpMultiplier") draft = { ...draft, bumpMultiplier: clamp(numeric, 0, 2) };
        if (field === "grainDepth") draft = { ...draft, grainDepth: clamp(numeric, 0, 2) };
        if (field === "coatMultiplier") draft = { ...draft, coatMultiplier: clamp(numeric, 0, 2) };
        if (field === "tileSizeMeters") draft = { ...draft, tileSizeMeters: clamp(numeric, 0.1, 10) };
      }
      for (const mesh of group) applyLiveMaterial(mesh, draft);
      render();
    };

    const bind = () => {
      overlay?.querySelector<HTMLButtonElement>("[data-action='close']")?.addEventListener("click", closePanel);
      overlay?.querySelector<HTMLButtonElement>("[data-action='cancel']")?.addEventListener("click", closePanel);
      overlay?.querySelector<HTMLButtonElement>("[data-action='apply']")?.addEventListener("click", () => {
        const request = requestFromDraft(target.request, draft);
        for (const mesh of group) {
          mesh.userData.materialRequest = structuredClone(request);
          mesh.userData.catalogMaterialId = request.sourceCatalogMaterialId ?? request.vendorDecorId ?? request.materialId ?? draft.materialId;
          mesh.userData.catalogMaterialName = request.displayName ?? target.label;
          applyLiveMaterial(mesh, draft);
        }
        ctx.commitHistory();
        ctx.setStatus(`Material modify: applied to ${group.length} part${group.length === 1 ? "" : "s"}.`);
        closePanel();
      });
      overlay?.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-field]").forEach((input) => {
        input.addEventListener("input", () => updateDraft(input.dataset.field ?? "", input.value));
        input.addEventListener("change", () => updateDraft(input.dataset.field ?? "", input.value));
      });
    };

    for (const mesh of group) applyLiveMaterial(mesh, draft);
    render();
  };

  function onPointerDown(event: PointerEvent) {
    if (!active || event.button !== 0) return;
    const target = findTargetFromClick(ctx, event);
    event.preventDefault();
    event.stopPropagation();
    if (!target) {
      ctx.setStatus("Material modify: click a visible board, worktop, wall, or floor material.");
      return;
    }
    if (bool(target.request.usesExternalVendorTexture)) {
      ctx.setStatus("Material modify: blocked external vendor texture material.");
      return;
    }
    openPanel(target);
  }

  const activate = () => {
    closePanel();
    cleanupPicking();
    active = true;
    ctx.renderer.domElement.classList.add("material-modify-picking");
    ctx.renderer.domElement.addEventListener("pointerdown", onPointerDown, true);
    ctx.setStatus("Material modify: left-click one visible material in the scene.");
  };

  const deactivate = () => {
    cleanupPicking();
    closePanel();
  };

  return { activate, deactivate };
}
