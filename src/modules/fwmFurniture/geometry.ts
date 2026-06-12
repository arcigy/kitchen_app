import * as THREE from "three";
import type { ClientCatalog, ComponentDefinition, ComponentType } from "../../core/catalog/catalog-types";
import { createModuleRuntimeCatalogContext, type MaterialFallbackKind } from "../runtime/runtimeCatalog";
import { getFwmAssemblyContext, getFwmFurnitureSpec, getFwmRoomCategory, getFwmSystemFamily } from "./definitions";
import { resolveBackPanelDepthLayout, resolveDrawerDepthLayout } from "./depthLayout";
import { normalizeFwmFurnitureParams, type FwmFurnitureParams } from "./types";

const MM = 0.001;
const FWM_MATERIAL_CACHE = Symbol("fwmMaterialCache");

type MatRole = "body" | "front" | "back" | "shelf" | "drawer_bottom" | "plinth" | "worktop" | "hardware" | "glass" | "appliance" | "soft";
type SideRole = "FRONT" | "BACK" | "LEFT" | "RIGHT" | "TOP" | "BOTTOM";
type RuntimeCatalogContext = ReturnType<typeof createModuleRuntimeCatalogContext>;
type FwmMaterialCache = {
  catalog: ClientCatalog;
  ctx: RuntimeCatalogContext;
  materials: Map<string, THREE.Material>;
};

function num(params: Record<string, unknown>, key: string, fallback: number) {
  const value = params[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function rec(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function materialCacheFor(params: Record<string, unknown>, catalog: ClientCatalog): FwmMaterialCache {
  const keyed = params as Record<PropertyKey, unknown>;
  const existing = keyed[FWM_MATERIAL_CACHE] as FwmMaterialCache | undefined;
  if (existing?.catalog === catalog) return existing;
  const next: FwmMaterialCache = {
    catalog,
    ctx: createModuleRuntimeCatalogContext(catalog),
    materials: new Map()
  };
  Object.defineProperty(params, FWM_MATERIAL_CACHE, {
    value: next,
    enumerable: true,
    configurable: true
  });
  return next;
}

function hex(color: string) {
  return /^#[0-9a-f]{6}$/i.test(color) ? Number.parseInt(color.slice(1), 16) : 0xb8bcc7;
}

function hashText(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function rolePalette(role: MatRole) {
  if (role === "front") return ["#ede8dc", "#bfa077", "#8f6845", "#d4d7d3", "#6f7f73", "#3e4448", "#a96b63"];
  if (role === "worktop") return ["#ece7dc", "#2d2f31", "#9a9a91", "#b9824d", "#6f604f", "#d7d2c7"];
  if (role === "back" || role === "drawer_bottom") return ["#f2f0e8", "#d8d6ce", "#b9b9b1", "#34373a"];
  if (role === "plinth") return ["#2f3032", "#4e4035", "#6c4b2f", "#8c8a80"];
  if (role === "shelf") return ["#c9a06d", "#9e7048", "#858882", "#6f7d68", "#d8d3c6"];
  return ["#c79b66", "#a46f42", "#7a4f32", "#8a8d84", "#596f61", "#35383b"];
}

function inferCatalogVisualColor(
  resolved: { id: string; displayName: string; colorHex: string },
  role: MatRole,
  materialDefinition?: { color?: string; decor?: string; name?: string }
) {
  const preview = /^#[0-9a-f]{6}$/i.test(resolved.colorHex) ? resolved.colorHex.toLowerCase() : "";
  if (preview && preview !== "#a8835a" && !resolved.id.startsWith("mat.demos.")) return preview;

  const name = `${resolved.displayName} ${materialDefinition?.color ?? ""} ${materialDefinition?.decor ?? ""} ${materialDefinition?.name ?? ""} ${resolved.id}`.toLowerCase();
  if (/calacatta|olympus|biela|biely|white|w980|w1000|w5001|101 sm/.test(name)) return "#eeeae0";
  if (/black|cierna|čierna|antracit|anthracite|basalt|charcoal|190 pe|k210/.test(name)) return "#2f3235";
  if (/grey|gray|seda|šedá|strieb|silver|stone|concrete|dovetail|albus|platinium|k540|k538|k350/.test(name)) return "#8b8d88";
  if (/green|emerald|zelena|zelená|k520|k521/.test(name)) return "#516f5b";
  if (/pink|ruž|native pink|k512/.test(name)) return "#b7777d";
  if (/red|červen|cerven|spice|k515/.test(name)) return "#8d3e35";
  if (/cherry|čereš|ceres|344/.test(name)) return "#9e5237";
  if (/walnut|orech|dijon|729|h3734/.test(name)) return "#65452f";
  if (/chestnut|arvadonna|gaštan|gastan|k531|k532/.test(name)) return "#765035";
  if (/oak|dub|hudson|baroque|craft|akacia|acacia|h3303|h1145|h1151|h1277|h3332|h1424|h3702|k003|k529|k530|k535|k536|k551/.test(name)) return "#b9854f";
  if (/beech|buk|maple|javor|381|375/.test(name)) return "#c99b66";
  if (/toffee|amaretto|k516/.test(name)) return "#8a5c37";

  const palette = rolePalette(role);
  return palette[hashText(name) % palette.length] ?? (preview || "#b8bcc7");
}

function makeMaterial(params: Record<string, unknown>, catalog: ClientCatalog, role: MatRole) {
  const cache = materialCacheFor(params, catalog);
  if (cache.materials.has(`fixed:${role}`)) return cache.materials.get(`fixed:${role}`)!;
  const markFixed = (material: THREE.Material, colorHex: string) => {
    material.userData.materialRole = role;
    material.userData.renderColorHex = colorHex;
    material.userData.materialSource = "fixed";
    return material;
  };
  if (role === "hardware") {
    const material = markFixed(new THREE.MeshStandardMaterial({ color: 0x343842, roughness: 0.45, metalness: 0.55 }), "#343842");
    cache.materials.set(`fixed:${role}`, material);
    return material;
  }
  if (role === "glass") {
    const material = markFixed(new THREE.MeshPhysicalMaterial({ color: 0xbfd8ff, roughness: 0.12, metalness: 0, transparent: true, opacity: 0.42 }), "#bfd8ff");
    cache.materials.set(`fixed:${role}`, material);
    return material;
  }
  if (role === "appliance") {
    const material = markFixed(new THREE.MeshStandardMaterial({ color: 0xc3c7ce, roughness: 0.38, metalness: 0.35 }), "#c3c7ce");
    cache.materials.set(`fixed:${role}`, material);
    return material;
  }
  if (role === "soft") {
    const material = markFixed(new THREE.MeshStandardMaterial({ color: 0xd7d1c8, roughness: 0.88, metalness: 0.02 }), "#d7d1c8");
    cache.materials.set(`fixed:${role}`, material);
    return material;
  }

  const assignments = rec(params.materialAssignments);
  const paramKey =
    role === "front" ? "frontMaterialId" :
    role === "back" ? "backMaterialId" :
    role === "shelf" ? "shelfMaterialId" :
    role === "drawer_bottom" ? "drawerBottomMaterialId" :
    role === "plinth" ? "plinthMaterialId" :
    role === "worktop" ? "worktopMaterialId" :
    "bodyMaterialId";
  const slotKey =
    role === "front" ? "front" :
    role === "back" ? "back" :
    role === "shelf" ? "shelf" :
    role === "drawer_bottom" ? "drawer_bottom" :
    role === "plinth" ? "plinth" :
    role === "worktop" ? "worktop" :
    "carcass";
  const selectedMaterialId = typeof params[paramKey] === "string" && params[paramKey] ? params[paramKey] as string : assignments[slotKey] as string | undefined;
  const cacheKey = `catalog:${role}:${selectedMaterialId ?? ""}`;
  if (cache.materials.has(cacheKey)) return cache.materials.get(cacheKey)!;
  const fallback: MaterialFallbackKind =
    role === "front" ? "front" :
    role === "back" ? "backPanel" :
    role === "drawer_bottom" ? "drawer" :
    role === "plinth" ? "plinth" :
    role === "worktop" ? "worktop" :
    "carcass";
  const resolved = cache.ctx.resolveRenderMaterial(selectedMaterialId, fallback);
  const materialDefinition = cache.ctx.resolveMaterial(selectedMaterialId, fallback);
  const visualColorHex = inferCatalogVisualColor(resolved, role, materialDefinition);
  const material = new THREE.MeshStandardMaterial({
    color: hex(visualColorHex),
    roughness: resolved.roughness,
    metalness: resolved.metalness
  });
  material.userData.catalogMaterialId = resolved.id;
  material.userData.catalogMaterialName = resolved.displayName;
  material.userData.materialRole = role;
  material.userData.materialSource = resolved.source;
  material.userData.renderColorHex = visualColorHex;
  cache.materials.set(cacheKey, material);
  return material;
}

function resolveComponentForParam(
  params: Record<string, unknown>,
  catalog: ClientCatalog,
  key: "legComponentId" | "clipComponentId",
  componentType: ComponentType
) {
  const cache = materialCacheFor(params, catalog);
  const assignments = rec(params.componentAssignments);
  const explicit = typeof params[key] === "string" && params[key] ? params[key] as string : assignments[key] as string | undefined;
  return cache.ctx.resolveComponent(explicit, componentType);
}

function makeComponentMaterial(params: Record<string, unknown>, catalog: ClientCatalog, component: ComponentDefinition | undefined, fallback: THREE.Material) {
  if (!component) return fallback;
  const cache = materialCacheFor(params, catalog);
  const cacheKey = `component:${component.id}`;
  if (cache.materials.has(cacheKey)) return cache.materials.get(cacheKey)!;
  const material = new THREE.MeshStandardMaterial({
    color: hex(component.preview.colorHex),
    roughness: component.preview.roughness,
    metalness: component.preview.metalness
  });
  material.userData.materialRole = "hardware";
  material.userData.materialSource = "component";
  material.userData.renderColorHex = component.preview.colorHex;
  material.userData.catalogComponentId = component.id;
  material.userData.componentType = component.componentType;
  material.userData.componentName = component.displayName;
  cache.materials.set(cacheKey, material);
  return material;
}

function markComponent(mesh: THREE.Mesh, component: ComponentDefinition | undefined, componentParamKey: string) {
  if (!component) return;
  mesh.userData.catalogComponentId = component.id;
  mesh.userData.componentId = component.id;
  mesh.userData.componentType = component.componentType;
  mesh.userData.componentName = component.displayName;
  mesh.userData.componentParamKey = componentParamKey;
}

function inferSideRole(name: string): SideRole | null {
  if (name.includes("left_side")) return "LEFT";
  if (name.includes("right_side")) return "RIGHT";
  if (name.includes("back")) return "BACK";
  if (name.includes("front") || name.includes("door") || name.includes("drawer") || name.includes("cladding") || name.includes("relief")) return "FRONT";
  if (name.includes("worktop") || name.includes("top") || name.includes("table_top")) return "TOP";
  if (name.includes("bottom") || name.includes("plinth")) return "BOTTOM";
  return null;
}

function inferMaterialGroup(name: string): string {
  if (name.includes("back")) return "back";
  if (name.includes("front") || name.includes("door") || name.includes("drawer")) return "front";
  if (name.includes("shelf")) return "shelf";
  if (name.includes("worktop") || name.includes("table_top")) return "worktop";
  if (name.includes("handle") || name.includes("faucet") || name.includes("leg") || name.includes("foot") || name.includes("clip")) return "hardware";
  if (name.includes("appliance") || name.includes("sink") || name.includes("basin")) return "appliance";
  return "body";
}

function mark(mesh: THREE.Mesh, dimensionsMm: { width: number; height: number; depth: number }, paramKeys: string[], sideRole: SideRole | null, materialGroup: string) {
  mesh.userData.selectable = true;
  mesh.userData.dimensionsMm = dimensionsMm;
  mesh.userData.paramKeys = paramKeys;
  mesh.userData.sideRole = sideRole;
  mesh.userData.materialGroup = materialGroup;
  const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  if (material?.userData?.materialRole) {
    mesh.userData.catalogMaterialId = material.userData.catalogMaterialId;
    mesh.userData.catalogMaterialName = material.userData.catalogMaterialName;
    mesh.userData.materialRole = material.userData.materialRole;
    mesh.userData.renderColorHex = material.userData.renderColorHex;
  }
  mesh.castShadow = true;
  mesh.receiveShadow = true;
}

function addBox(
  group: THREE.Group,
  name: string,
  sizeMm: { width: number; height: number; depth: number },
  centerMm: { x: number; y: number; z: number },
  material: THREE.Material | THREE.Material[],
  paramKeys: string[] = []
) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(sizeMm.width * MM, sizeMm.height * MM, sizeMm.depth * MM),
    material
  );
  mesh.name = name;
  mesh.position.set(centerMm.x * MM, centerMm.y * MM, centerMm.z * MM);
  mark(mesh, sizeMm, paramKeys, inferSideRole(name), inferMaterialGroup(name));
  group.add(mesh);
  return mesh;
}

function addCylinder(
  group: THREE.Group,
  name: string,
  radiusMm: number,
  lengthMm: number,
  centerMm: { x: number; y: number; z: number },
  material: THREE.Material,
  axis: "x" | "y" | "z" = "x",
  paramKeys: string[] = ["handleComponentId"]
) {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radiusMm * MM, radiusMm * MM, lengthMm * MM, 24), material);
  mesh.name = name;
  if (axis === "x") mesh.rotation.z = Math.PI / 2;
  if (axis === "z") mesh.rotation.x = Math.PI / 2;
  mesh.position.set(centerMm.x * MM, centerMm.y * MM, centerMm.z * MM);
  const diameter = radiusMm * 2;
  const dimensions =
    axis === "x" ? { width: lengthMm, height: diameter, depth: diameter } :
    axis === "y" ? { width: diameter, height: lengthMm, depth: diameter } :
    { width: diameter, height: diameter, depth: lengthMm };
  mark(mesh, dimensions, paramKeys, inferSideRole(name), inferMaterialGroup(name));
  group.add(mesh);
  return mesh;
}

function addCornerStyleLeg(
  group: THREE.Group,
  name: string,
  heightMm: number,
  centerMm: { x: number; y: number; z: number },
  material: THREE.Material,
  paramKeys: string[]
) {
  const size = { width: 39.392, height: heightMm, depth: 40 };
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(20 * MM, 20 * MM, heightMm * MM, 24), material);
  mesh.name = name;
  mesh.position.set(centerMm.x * MM, centerMm.y * MM, centerMm.z * MM);
  mark(mesh, size, paramKeys, inferSideRole(name), inferMaterialGroup(name));
  group.add(mesh);
  return mesh;
}

function addCornerStyleClipCollar(
  group: THREE.Group,
  name: string,
  centerMm: { x: number; y: number; z: number },
  material: THREE.Material,
  paramKeys: string[]
) {
  const gapAngle = Math.PI * 0.35;
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(15 * MM, 15 * MM, 35 * MM, 24, 1, true, gapAngle / 2, Math.PI * 2 - gapAngle),
    material
  );
  mesh.name = name;
  mesh.rotation.y = Math.PI;
  mesh.position.set(centerMm.x * MM, centerMm.y * MM, centerMm.z * MM);
  mark(mesh, { width: 30, height: 35, depth: 25 }, paramKeys, inferSideRole(name), inferMaterialGroup(name));
  group.add(mesh);
  return mesh;
}

function addCornerStylePlinthClipSet(
  group: THREE.Group,
  prefix: string,
  index: number,
  centerMm: { x: number; z: number },
  material: THREE.Material,
  component: ComponentDefinition | undefined
) {
  const paramKeys = ["clipComponentId", "legComponentId", "plinthHeight", "plinthSetbackMm", "depth", "boardThickness"];
  const collar = addCornerStyleClipCollar(group, `${prefix}kickClip_front_${index}_collar`, { x: centerMm.x, y: 40, z: centerMm.z + 1.768 }, material, paramKeys);
  const pad = addBox(group, `${prefix}kickClip_front_${index}_pad`, { width: 30, height: 35, depth: 25 }, { x: centerMm.x, y: 40, z: centerMm.z + 7 }, material, paramKeys);
  const arm = addBox(group, `${prefix}kickClip_front_${index}_arm`, { width: 30, height: 35, depth: 25 }, { x: centerMm.x, y: 39, z: centerMm.z + 26.5 }, material, paramKeys);
  markComponent(collar, component, "clipComponentId");
  markComponent(pad, component, "clipComponentId");
  markComponent(arm, component, "clipComponentId");
}

function addAdjustableLegs(group: THREE.Group, params: FwmFurnitureParams, catalog: ClientCatalog, opts: { width: number; depth: number; plinth: number; setback: number; boardDepth: number; prefix: string }) {
  const legHeight = Math.max(1, opts.plinth);
  const hardware = makeMaterial(params, catalog, "hardware");
  const legComponent = resolveComponentForParam(params, catalog, "legComponentId", "leg");
  const clipComponent = resolveComponentForParam(params, catalog, "clipComponentId", "plinth_clip");
  const legMaterial = makeComponentMaterial(params, catalog, legComponent, hardware);
  const clipMaterial = makeComponentMaterial(params, catalog, clipComponent, hardware);
  const xInset = Math.min(90, Math.max(55, opts.width * 0.12));
  const zFront = opts.depth / 2 - opts.setback - opts.boardDepth - 30;
  const zBack = -opts.depth / 2 + Math.min(100, Math.max(70, opts.depth * 0.16));
  const xPositions = [-opts.width / 2 + xInset, opts.width / 2 - xInset];
  if (opts.width > 900) xPositions.splice(1, 0, 0);
  if (opts.width > 1500) {
    xPositions.splice(1, 0, -opts.width * 0.25);
    xPositions.splice(xPositions.length - 1, 0, opts.width * 0.25);
  }
  const zPositions = Math.abs(zFront - zBack) > 120 ? [zFront, zBack] : [zFront];
  let frontIndex = 1;
  let rearIndex = 1;
  for (const x of xPositions) {
    for (const [zIndex, z] of zPositions.entries()) {
      const isFront = zIndex === 0;
      const index = isFront ? frontIndex : rearIndex;
      const legName = isFront ? `${opts.prefix}leg_front_${index}` : `${opts.prefix}leg_rear_${index}`;
      const leg = addCornerStyleLeg(group, legName, legHeight, { x, y: legHeight / 2, z }, legMaterial, ["legComponentId", "plinthHeight", "plinthSetbackMm", "depth"]);
      markComponent(leg, legComponent, "legComponentId");
      if (isFront) {
        addCornerStylePlinthClipSet(group, opts.prefix, index, { x, z }, clipMaterial, clipComponent);
        frontIndex += 1;
      } else {
        rearIndex += 1;
      }
    }
  }
}

function addCarcass(group: THREE.Group, params: FwmFurnitureParams, catalog: ClientCatalog, opts: { openFront?: boolean; topOpen?: boolean; width?: number; height?: number; depth?: number; namePrefix?: string } = {}) {
  const width = opts.width ?? num(params, "width", 800);
  const height = opts.height ?? num(params, "height", 720);
  const depth = opts.depth ?? num(params, "depth", 560);
  const t = num(params, "boardThickness", 18);
  const back = num(params, "backThickness", 8);
  const plinth = num(params, "plinthHeight", 0);
  const body = makeMaterial(params, catalog, "body");
  const backMat = makeMaterial(params, catalog, "back");
  const shelfMat = makeMaterial(params, catalog, "shelf");
  const plinthMat = makeMaterial(params, catalog, "plinth");
  const prefix = opts.namePrefix ? `${opts.namePrefix}_` : "";
  const cabinetHeight = Math.max(t * 2 + 20, height - plinth);
  const baseY = plinth;
  const innerW = Math.max(1, width - 2 * t);
  const innerH = Math.max(1, cabinetHeight - 2 * t);
  const backLayout = resolveBackPanelDepthLayout(depth, back);
  const innerD = Math.max(1, depth / 2 - backLayout.innerFaceZ);

  addBox(group, `${prefix}left_side`, { width: t, height: cabinetHeight, depth }, { x: -width / 2 + t / 2, y: baseY + cabinetHeight / 2, z: 0 }, body, ["width", "height", "depth", "boardThickness"]);
  addBox(group, `${prefix}right_side`, { width: t, height: cabinetHeight, depth }, { x: width / 2 - t / 2, y: baseY + cabinetHeight / 2, z: 0 }, body, ["width", "height", "depth", "boardThickness"]);
  addBox(group, `${prefix}bottom`, { width: innerW, height: t, depth }, { x: 0, y: baseY + t / 2, z: 0 }, body, ["width", "depth", "boardThickness"]);
  if (!opts.topOpen) addBox(group, `${prefix}top`, { width: innerW, height: t, depth }, { x: 0, y: baseY + cabinetHeight - t / 2, z: 0 }, body, ["width", "height", "depth", "boardThickness"]);
  if (backLayout.thicknessMm > 0) addBox(group, `${prefix}back`, { width: innerW, height: innerH, depth: backLayout.thicknessMm }, { x: 0, y: baseY + t + innerH / 2, z: backLayout.centerZ }, backMat, ["width", "height", "depth", "backThickness"]);

  const shelves = Math.round(num(params, "shelfCount", 0));
  const shelfT = num(params, "shelfThickness", t);
  for (let index = 0; index < shelves; index += 1) {
    const y = baseY + t + ((index + 1) * innerH) / (shelves + 1);
    addBox(group, `${prefix}shelf_${index + 1}`, { width: innerW, height: shelfT, depth: innerD }, { x: 0, y, z: back / 2 }, shelfMat, ["shelfCount", "shelfThickness", "height", "shelfMaterialId"]);
  }

  if (plinth > 0) {
    const setback = num(params, "plinthSetbackMm", 60);
    const boardDepth = Math.max(8, Math.min(t, 24));
    const z = depth / 2 - setback - boardDepth / 2;
    addBox(group, `${prefix}plinth_front_board`, { width: Math.max(1, width), height: plinth, depth: boardDepth }, { x: 0, y: plinth / 2, z }, plinthMat, ["plinthHeight", "plinthSetbackMm", "plinthMaterialId"]);
    addAdjustableLegs(group, params, catalog, { width, depth, plinth, setback, boardDepth, prefix });
  }
}

function addFronts(group: THREE.Group, params: FwmFurnitureParams, catalog: ClientCatalog, opts: { width?: number; height?: number; depth?: number; yOffset?: number; prefix?: string } = {}) {
  const width = opts.width ?? num(params, "width", 800);
  const height = opts.height ?? num(params, "height", 720);
  const depth = opts.depth ?? num(params, "depth", 560);
  const plinth = num(params, "plinthHeight", 0);
  const gap = num(params, "frontGap", 2);
  const sideGap = num(params, "sideGap", 2);
  const frontT = num(params, "frontThicknessMm", 18);
  const frontMat = makeMaterial(params, catalog, params.glassFronts ? "glass" : "front");
  const drawerBottomMat = makeMaterial(params, catalog, "drawer_bottom");
  const hardware = makeMaterial(params, catalog, "hardware");
  const drawerCount = Math.round(num(params, "drawerCount", 0));
  const doorCount = Math.round(num(params, "doorCount", 0));
  const prefix = opts.prefix ? `${opts.prefix}_` : "";
  const z = depth / 2 + frontT / 2 + 1;
  const frontAreaHeight = Math.max(80, height - plinth - gap * 2);

  if (drawerCount > 0) {
    const mixedWithDoors = doorCount > 0;
    const drawerZoneHeight = mixedWithDoors
      ? Math.max(120, Math.min(frontAreaHeight * 0.48, drawerCount * 240))
      : frontAreaHeight;
    const rawHeights = typeof params.drawerFrontHeightsMm === "string"
      ? params.drawerFrontHeightsMm.split(",").map((entry) => Number(entry.trim())).filter((entry) => Number.isFinite(entry) && entry > 0)
      : [];
    const availableHeight = Math.max(40, drawerZoneHeight - gap * (drawerCount - 1));
    const requestedSum = rawHeights.length === drawerCount ? rawHeights.reduce((sum, entry) => sum + entry, 0) : 0;
    const drawerHeights =
      requestedSum > 0
        ? rawHeights.map((entry) => Math.max(40, (entry / requestedSum) * availableHeight))
        : Array.from({ length: drawerCount }, () => Math.max(40, availableHeight / drawerCount));
    let y = plinth + gap;
    for (let index = 0; index < drawerCount; index += 1) {
      const drawerH = drawerHeights[index] ?? Math.max(40, availableHeight / drawerCount);
      y += drawerH / 2;
      addBox(group, `${prefix}drawer_front_${index + 1}`, { width: width - sideGap * 2, height: drawerH, depth: frontT }, { x: 0, y, z }, frontMat, ["drawerCount", "frontThicknessMm", "frontGap", "handleComponentId"]);
      const drawerDepth = resolveDrawerDepthLayout(depth, num(params, "backThickness", 8), num(params, "drawerBackGapMm", 10));
      addBox(group, `${prefix}drawer_bottom_${index + 1}`, { width: Math.max(60, width - sideGap * 2 - 70), height: Math.max(6, num(params, "drawerBottomThickness", 8)), depth: drawerDepth.depthMm }, { x: 0, y: Math.max(plinth + 20, y - drawerH / 2 + 22), z: drawerDepth.centerZ }, drawerBottomMat, ["drawerCount", "drawerBottomMaterialId", "depth", "backThickness", "drawerBackGapMm"]);
      addCylinder(group, `${prefix}drawer_handle_${index + 1}`, 6, Math.min(num(params, "handleLengthMm", 160), width - 120), { x: 0, y: y + drawerH * 0.28, z: z + frontT / 2 + num(params, "handleProjectionMm", 28) / 2 }, hardware, "x");
      y += drawerH / 2 + gap;
    }
    if (!mixedWithDoors) return;

    const doorZoneStart = plinth + gap + drawerZoneHeight + gap;
    const doorZoneHeight = Math.max(80, frontAreaHeight - drawerZoneHeight - gap);
    const eachW = Math.max(40, (width - sideGap * 2 - gap * (doorCount - 1)) / doorCount);
    for (let index = 0; index < doorCount; index += 1) {
      const x = -width / 2 + sideGap + eachW / 2 + index * (eachW + gap);
      addBox(group, `${prefix}door_${index + 1}`, { width: eachW, height: doorZoneHeight, depth: frontT }, { x, y: doorZoneStart + doorZoneHeight / 2, z }, frontMat, ["doorCount", "frontThicknessMm", "frontGap", "handleComponentId"]);
      const handleX = x + (index % 2 === 0 ? eachW / 2 - 45 : -eachW / 2 + 45);
      addCylinder(group, `${prefix}door_handle_${index + 1}`, 5, Math.min(num(params, "handleLengthMm", 160), doorZoneHeight * 0.45), { x: handleX, y: doorZoneStart + doorZoneHeight * 0.58, z: z + frontT / 2 + num(params, "handleProjectionMm", 28) / 2 }, hardware, "y");
    }
    return;
  }

  if (doorCount > 0) {
    const eachW = Math.max(40, (width - sideGap * 2 - gap * (doorCount - 1)) / doorCount);
    for (let index = 0; index < doorCount; index += 1) {
      const x = -width / 2 + sideGap + eachW / 2 + index * (eachW + gap);
      addBox(group, `${prefix}door_${index + 1}`, { width: eachW, height: frontAreaHeight, depth: frontT }, { x, y: plinth + frontAreaHeight / 2 + gap, z }, frontMat, ["doorCount", "frontThicknessMm", "frontGap", "handleComponentId"]);
      const handleX = x + (index % 2 === 0 ? eachW / 2 - 45 : -eachW / 2 + 45);
      addCylinder(group, `${prefix}door_handle_${index + 1}`, 5, Math.min(num(params, "handleLengthMm", 160), frontAreaHeight * 0.45), { x: handleX, y: plinth + frontAreaHeight * 0.58, z: z + frontT / 2 + num(params, "handleProjectionMm", 28) / 2 }, hardware, "y");
    }
  }
}

function addWorktop(group: THREE.Group, params: FwmFurnitureParams, catalog: ClientCatalog, opts: { width?: number; depth?: number; height?: number; prefix?: string } = {}) {
  const thickness = num(params, "worktopThicknessMm", 0);
  if (thickness <= 0) return;
  const width = opts.width ?? num(params, "width", 800);
  const depth = opts.depth ?? num(params, "depth", 560);
  const height = opts.height ?? num(params, "height", 720);
  const mat = makeMaterial(params, catalog, "worktop");
  const prefix = opts.prefix ? `${opts.prefix}_` : "";
  addBox(group, `${prefix}worktop`, { width: width + 30, height: thickness, depth: depth + 40 }, { x: 0, y: height + thickness / 2, z: 10 }, mat, ["width", "depth", "worktopThicknessMm", "worktopMaterialId"]);
}

function addAppliance(group: THREE.Group, params: FwmFurnitureParams, catalog: ClientCatalog, name: string, y: number, h: number) {
  const width = Math.min(num(params, "applianceWidthMm", 560), num(params, "width", 600) - 70);
  const depth = Math.max(160, num(params, "depth", 560) - 70);
  addBox(group, name, { width, height: h, depth }, { x: 0, y, z: 20 }, makeMaterial(params, catalog, "appliance"), ["applianceWidthMm", "width", "height", "depth"]);
}

function addDishwasherFront(group: THREE.Group, params: FwmFurnitureParams, catalog: ClientCatalog) {
  const width = num(params, "width", 600);
  const height = num(params, "height", 820);
  const depth = num(params, "depth", 560);
  const plinth = num(params, "plinthHeight", 0);
  const gap = num(params, "frontGap", 2);
  const sideGap = num(params, "sideGap", 2);
  const frontT = num(params, "frontThicknessMm", 18);
  const panelH = Math.max(120, height - plinth - gap * 2);
  const panelW = Math.max(80, width - sideGap * 2);
  const panelY = plinth + gap + panelH / 2;
  const panelZ = depth / 2 + frontT / 2 + 1;
  addBox(
    group,
    "dishwasher_front_panel",
    { width: panelW, height: panelH, depth: frontT },
    { x: 0, y: panelY, z: panelZ },
    makeMaterial(params, catalog, "front"),
    ["width", "height", "frontThicknessMm", "frontGap", "frontMaterialId"]
  );
  addBox(
    group,
    "dishwasher_top_reveal",
    { width: panelW, height: Math.min(18, Math.max(6, gap * 4)), depth: 4 },
    { x: 0, y: height - Math.max(8, gap * 2), z: panelZ + frontT / 2 + 3 },
    makeMaterial(params, catalog, "hardware"),
    ["width", "height", "frontGap"]
  );
  if (num(params, "handleProjectionMm", 28) > 0 && num(params, "handleLengthMm", 160) > 0) {
    addCylinder(
      group,
      "dishwasher_handle",
      Math.max(4, num(params, "handleSizeMm", 16) * 0.35),
      Math.min(num(params, "handleLengthMm", 160), Math.max(60, panelW - 120)),
      { x: 0, y: height - 90, z: panelZ + frontT / 2 + num(params, "handleProjectionMm", 28) / 2 },
      makeMaterial(params, catalog, "hardware"),
      "x"
    );
  }
}

function buildBed(group: THREE.Group, params: FwmFurnitureParams, catalog: ClientCatalog) {
  const w = num(params, "width", 1800);
  const d = num(params, "depth", 2100);
  const h = num(params, "height", 900);
  const body = makeMaterial(params, catalog, "body");
  addBox(group, "bed_frame", { width: w, height: 180, depth: d }, { x: 0, y: 170, z: 0 }, body, ["width", "depth", "boardThickness"]);
  addBox(group, "mattress", { width: w - 90, height: 180, depth: d - 140 }, { x: 0, y: 360, z: 40 }, makeMaterial(params, catalog, "soft"), ["width", "depth", "variant"]);
  addBox(group, "headboard", { width: w, height: Math.max(400, h), depth: 80 }, { x: 0, y: h / 2, z: -d / 2 + 40 }, body, ["height", "variant"]);
  if (String(params.variant) === "storage") {
    addFronts(group, { ...params, height: 360, width: w - 160, depth: 240, plinthHeight: 0, drawerCount: 2, doorCount: 0 } as FwmFurnitureParams, catalog, { width: w - 160, height: 360, depth: 240, prefix: "bed_storage" });
  }
}

function buildTable(group: THREE.Group, params: FwmFurnitureParams, catalog: ClientCatalog) {
  const w = num(params, "width", 1200);
  const h = num(params, "height", 760);
  const d = num(params, "depth", 700);
  const topT = Math.max(24, num(params, "worktopThicknessMm", num(params, "boardThickness", 30)));
  const body = makeMaterial(params, catalog, "body");
  addBox(group, "table_top", { width: w, height: topT, depth: d }, { x: 0, y: h, z: 0 }, makeMaterial(params, catalog, "worktop"), ["width", "depth", "worktopMaterialId"]);
  const leg = Math.max(45, num(params, "boardThickness", 60));
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      addBox(group, `leg_${sx}_${sz}`, { width: leg, height: h - topT, depth: leg }, { x: sx * (w / 2 - 90), y: (h - topT) / 2, z: sz * (d / 2 - 90) }, body, ["width", "depth", "height"]);
    }
  }
  if (num(params, "shelfCount", 0) > 0) {
    addBox(group, "lower_shelf", { width: w - 220, height: num(params, "shelfThickness", 18), depth: d - 220 }, { x: 0, y: Math.max(160, h * 0.35), z: 0 }, body, ["shelfCount", "shelfThickness"]);
  }
}

export function buildFwmFurniture(params: FwmFurnitureParams, catalog: ClientCatalog): THREE.Group {
  const p = normalizeFwmFurnitureParams(params);
  const spec = getFwmFurnitureSpec(p.type);
  const group = new THREE.Group();
  group.name = `${p.type}_module`;
  group.userData.fwmModuleType = p.type;
  group.userData.moduleDisplayName = spec.displayName;
  group.userData.assemblyContext = getFwmAssemblyContext(spec);
  group.userData.roomCategory = getFwmRoomCategory(spec);
  group.userData.kitchenModuleRole = spec.kitchenRole ?? null;
  group.userData.orientation = {
    front: { side: "FRONT", direction: "+Z" },
    back: { side: "BACK", direction: "-Z" },
    left: { side: "LEFT", direction: "-X" },
    right: { side: "RIGHT", direction: "+X" },
    up: { side: "TOP", direction: "+Y" },
    down: { side: "BOTTOM", direction: "-Y" }
  };
  group.userData.worktopPlacement = {
    backSide: "BACK",
    frontSide: "FRONT",
    rotatesWithModule: true
  };
  group.userData.materialGroups = {
    body: "body",
    front: "front",
    back: "back",
    shelf: "shelf",
    worktop: "worktop",
    drawerBox: "drawer_box"
  };
  group.userData.systemParameters = {
    typeId: `${spec.moduleType}__type`,
    type: spec.moduleType,
    displayName: spec.displayName,
    family: getFwmSystemFamily(spec),
    assemblyContext: getFwmAssemblyContext(spec),
    roomCategory: getFwmRoomCategory(spec),
    kitchenModuleRole: spec.kitchenRole ?? null,
    requiresWorktop: spec.hasWorktop === true,
    ifcClass: "IfcFurniture",
    ifcObjectType: getFwmSystemFamily(spec),
    ifcTag: `${spec.moduleType}__type`
  };

  if (spec.geometryKind === "bed") {
    buildBed(group, p, catalog);
    return group;
  }
  if (spec.geometryKind === "table") {
    buildTable(group, p, catalog);
    return group;
  }
  if (spec.geometryKind === "cladding") {
    addBox(group, "cladding_panel", { width: num(p, "width", spec.width), height: num(p, "height", spec.height), depth: num(p, "depth", spec.depth) }, { x: 0, y: num(p, "height", spec.height) / 2, z: 0 }, makeMaterial(p, catalog, "front"), ["width", "height", "depth", "frontMaterialId", "variant"]);
    const slatCount = String(p.variant).includes("slat") ? 8 : 4;
    for (let index = 0; index < slatCount; index += 1) {
      const x = -num(p, "width", spec.width) / 2 + ((index + 0.5) * num(p, "width", spec.width)) / slatCount;
      addBox(group, `relief_${index + 1}`, { width: 12, height: num(p, "height", spec.height), depth: 10 }, { x, y: num(p, "height", spec.height) / 2, z: num(p, "depth", spec.depth) / 2 + 5 }, makeMaterial(p, catalog, "body"), ["variant"]);
    }
    return group;
  }

  if (spec.geometryKind === "island") {
    addCarcass(group, p, catalog, { width: num(p, "width", spec.width), height: num(p, "height", spec.height), depth: num(p, "depth", spec.depth) });
    addFronts(group, p, catalog);
    addFronts(group, { ...p, drawerCount: 0, doorCount: Math.max(2, num(p, "doorCount", 2)) } as FwmFurnitureParams, catalog, { prefix: "back", depth: num(p, "depth", spec.depth), height: num(p, "height", spec.height) });
    addWorktop(group, p, catalog);
    return group;
  }

  if (spec.geometryKind === "corner") {
    addCarcass(group, p, catalog, { width: num(p, "width", spec.width), depth: Math.min(num(p, "depth", spec.depth), 650), namePrefix: "run_x" });
    const branch = new THREE.Group();
    branch.name = "corner_branch_z";
    addCarcass(branch, { ...p, width: Math.min(num(p, "depth", spec.depth), 650), depth: num(p, "width", spec.width) } as FwmFurnitureParams, catalog, { namePrefix: "run_z" });
    branch.rotation.y = Math.PI / 2;
    branch.position.set(0, 0, (-num(p, "depth", spec.depth) / 2 + 325) * MM);
    group.add(branch);
    addFronts(group, p, catalog, { width: Math.min(num(p, "width", spec.width), 720), prefix: "corner" });
    addWorktop(group, p, catalog);
    return group;
  }

  if (spec.geometryKind === "wall_unit") {
    addCarcass(group, { ...p, height: 780, depth: 430, plinthHeight: 80, drawerCount: num(p, "drawerCount", 3), doorCount: 0 } as FwmFurnitureParams, catalog, { namePrefix: "base", height: 780, depth: 430 });
    addFronts(group, { ...p, height: 780, depth: 430, plinthHeight: 80, drawerCount: num(p, "drawerCount", 3), doorCount: 0 } as FwmFurnitureParams, catalog, { prefix: "base", height: 780, depth: 430 });
    const upperGroup = new THREE.Group();
    upperGroup.name = "upper_wall_section";
    const upperParams = { ...p, width: num(p, "width", 3000) * 0.55, height: 700, depth: 320, plinthHeight: 0, shelfCount: num(p, "shelfCount", 4), doorCount: Math.max(2, num(p, "doorCount", 4)), drawerCount: 0 } as FwmFurnitureParams;
    addCarcass(upperGroup, upperParams, catalog, { namePrefix: "upper", width: num(upperParams, "width", 1650), height: 700, depth: 320 });
    addFronts(upperGroup, upperParams, catalog, { prefix: "upper", width: num(upperParams, "width", 1650), height: 700, depth: 320 });
    upperGroup.position.y = 1250 * MM;
    group.add(upperGroup);
    addBox(group, "media_void_marker", { width: 1100, height: 620, depth: 30 }, { x: 0, y: 1200, z: num(p, "depth", 450) / 2 + 20 }, makeMaterial(p, catalog, "back"), ["width", "height"]);
    return group;
  }

  if (spec.geometryKind === "vanity" || spec.geometryKind === "bathroom") {
    addCarcass(group, p, catalog);
    addFronts(group, p, catalog);
    addWorktop(group, p, catalog);
    addBox(group, "mirror", { width: num(p, "width", spec.width) * 0.55, height: 620, depth: 18 }, { x: 0, y: num(p, "height", spec.height) - 330, z: -num(p, "depth", spec.depth) / 2 + 12 }, makeMaterial(p, catalog, "glass"), ["height", "width"]);
    if (num(p, "sinkBowlWidthMm", 0) > 0) {
      addBox(group, "basin", { width: num(p, "sinkBowlWidthMm", 520), height: 90, depth: num(p, "sinkBowlDepthMm", 360) }, { x: 0, y: num(p, "height", spec.height) + 55, z: 35 }, makeMaterial(p, catalog, "appliance"), ["sinkBowlWidthMm", "sinkBowlDepthMm"]);
    }
    return group;
  }

  if (spec.geometryKind === "counter" || spec.geometryKind === "office") {
    addCarcass(group, p, catalog);
    addFronts(group, p, catalog);
    addWorktop(group, p, catalog);
    const privacyH = spec.geometryKind === "counter" ? 320 : 0;
    if (privacyH > 0) addBox(group, "raised_front_panel", { width: num(p, "width", spec.width), height: privacyH, depth: num(p, "frontThicknessMm", 18) }, { x: 0, y: num(p, "height", spec.height) - privacyH / 2, z: num(p, "depth", spec.depth) / 2 + 18 }, makeMaterial(p, catalog, "front"), ["height", "frontMaterialId"]);
    if (spec.geometryKind === "office") buildTable(group, { ...p, width: num(p, "width", spec.width) * 0.55, height: 740, depth: 700 } as FwmFurnitureParams, catalog);
    return group;
  }

  addCarcass(group, p, catalog, { topOpen: spec.geometryKind === "sink" });
  if (spec.appliance) addAppliance(group, p, catalog, spec.appliance, num(p, "height", spec.height) * 0.48, spec.appliance === "microwave" ? 380 : spec.appliance === "oven" ? 600 : num(p, "height", spec.height) * 0.58);
  if (spec.geometryKind === "sink") {
    addBox(group, "sink_bowl", { width: num(p, "sinkBowlWidthMm", 520), height: 160, depth: num(p, "sinkBowlDepthMm", 400) }, { x: 0, y: num(p, "height", spec.height) + 10, z: 40 }, makeMaterial(p, catalog, "appliance"), ["sinkBowlWidthMm", "sinkBowlDepthMm"]);
    addCylinder(group, "faucet_arc", 12, 220, { x: 0, y: num(p, "height", spec.height) + 170, z: -120 }, makeMaterial(p, catalog, "hardware"), "y");
  }
  if (spec.appliance === "dishwasher") addDishwasherFront(group, p, catalog);
  else addFronts(group, p, catalog);
  addWorktop(group, p, catalog);
  return group;
}
