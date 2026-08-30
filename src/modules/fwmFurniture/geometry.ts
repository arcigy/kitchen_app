import * as THREE from "three";
import type { ClientCatalog, ComponentDefinition, ComponentGeometryDefinition, ComponentType } from "../../core/catalog/catalog-types";
import type { ModuleGeometryPrimitive } from "../../core/module-package/module-package-types";
import {
  buildApplianceSubmodule,
  makeDefaultApplianceSubmoduleParams,
  type ApplianceSubmoduleType
} from "../../submodules/appliances";
import { buildCornerShelfLower } from "../cornerShelfLower/geometry";
import { createModuleRuntimeCatalogContext, type MaterialFallbackKind } from "../runtime/runtimeCatalog";
import { mapFwmCatalogCornerToCornerShelfLowerParams } from "./catalogCornerAdapter";
import baseCornerChamferedGroundTruth from "./data/baseCornerChamferedGroundTruth.compact.json";
import { getFwmAssemblyContext, getFwmFurnitureSpec, getFwmRoomCategory, getFwmSystemFamily, type FwmFurnitureSpec } from "./definitions";
import { resolveBackPanelDepthLayout, resolveDrawerDepthLayout } from "./depthLayout";
import { normalizeFwmFurnitureParams, type FwmFurnitureParams } from "./types";

const MM = 0.001;
const FWM_MATERIAL_CACHE = Symbol("fwmMaterialCache");
const BASE_CORNER_CHAMFERED_GROUND_TRUTH_PACKAGE = baseCornerChamferedGroundTruth as { primitives: ModuleGeometryPrimitive[] };
const kitchenCornerAnchorName = "__kitchen_corner_anchor";
const kitchenCornerXAnchorName = "__kitchen_corner_x_anchor";
const kitchenCornerZAnchorName = "__kitchen_corner_z_anchor";
const kitchenBackAnchorName = "__kitchen_back_anchor";
const BASE_CORNER_CHAMFERED_SOURCE = {
  xMin: 33.3,
  xMax: 933.3,
  zMin: 0,
  zMax: 900,
  yMin: 0,
  plinthTop: 100,
  yMax: 722,
  width: 900,
  depth: 900,
  chamferMm: 420,
  backChamferMm: 200,
  plinthSetbackMm: 60
} as const;
const BASE_CORNER_CHAMFERED_FRONT_DIAGONAL_SOURCE = {
  minX: 15.3,
  maxX: 471.3,
  minZ: 462,
  maxZ: 918
} as const;
const BASE_CORNER_CHAMFERED_DIAGONAL_PLINTH_SOURCE = {
  minX: 15.28,
  maxX: 596.702,
  minZ: 336.578,
  maxZ: 918
} as const;
const BASE_BOTTLE_PULLOUT_MODULE_TYPE = "base_bottle_pullout";

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

function bool(params: Record<string, unknown>, key: string, fallback: boolean) {
  const value = params[key];
  return typeof value === "boolean" ? value : fallback;
}

function rec(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function canonicalFwmMaterialGroup(value: unknown): string {
  const group = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (group === "body" || group === "carcass" || group === "shelf") return "corpus";
  return group;
}

function normalizeFwmMaterialMetadata(group: THREE.Group): THREE.Group {
  group.traverse((object) => {
    const data = object.userData as Record<string, unknown>;
    const materialGroup = canonicalFwmMaterialGroup(data.materialGroup);
    const materialSlotId = canonicalFwmMaterialGroup(data.materialSlotId);
    if (materialGroup) data.materialGroup = materialGroup;
    if (materialSlotId) {
      data.materialSlotId = materialSlotId;
    } else if (materialGroup) {
      data.materialSlotId = materialGroup;
    }
    if (data.materialRole === "body" || data.materialRole === "shelf") data.materialRole = "corpus";

    if (object instanceof THREE.Mesh) {
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      for (const material of materials) {
        const materialData = material.userData as Record<string, unknown>;
        const itemGroup = canonicalFwmMaterialGroup(materialData.materialGroup);
        const itemSlot = canonicalFwmMaterialGroup(materialData.materialSlotId);
        if (itemGroup) materialData.materialGroup = itemGroup;
        if (itemSlot) {
          materialData.materialSlotId = itemSlot;
        } else if (itemGroup) {
          materialData.materialSlotId = itemGroup;
        }
        if (materialData.materialRole === "body" || materialData.materialRole === "shelf") materialData.materialRole = "corpus";
      }
      const meshGroup = canonicalFwmMaterialGroup(data.materialGroup);
      if (meshGroup && !data.grainAlong) data.grainAlong = inferGrainAlong(object.name, meshGroup, readMeshDimensionsMm(object));
    }
  });
  group.userData.materialGroups = {
    corpus: "corpus",
    front: "front",
    back: "back",
    plinth: "plinth",
    worktop: "worktop",
    drawerBottom: "drawer_bottom",
    hardware: "hardware"
  };
  return group;
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
    role === "shelf" ? "corpus" :
    role === "drawer_bottom" ? "drawer_bottom" :
    role === "plinth" ? "plinth" :
    role === "worktop" ? "worktop" :
    "corpus";
  const assignedMaterialId =
    typeof assignments[slotKey] === "string" ? assignments[slotKey] as string :
    slotKey === "corpus" && typeof assignments.carcass === "string" ? assignments.carcass as string :
    undefined;
  const explicitMaterialId = typeof params[paramKey] === "string" && params[paramKey] ? params[paramKey] as string : undefined;
  const explicitCorpusMaterialId = slotKey === "corpus" && typeof params.corpusMaterialId === "string" && params.corpusMaterialId
    ? params.corpusMaterialId as string
    : undefined;
  const selectedMaterialId = explicitMaterialId ?? explicitCorpusMaterialId ?? assignedMaterialId;
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
  material.userData.materialRole = canonicalFwmMaterialGroup(role);
  material.userData.materialGroup = canonicalFwmMaterialGroup(role);
  material.userData.materialSlotId = slotKey;
  material.userData.materialSource = resolved.source;
  material.userData.renderColorHex = visualColorHex;
  cache.materials.set(cacheKey, material);
  return material;
}

function makeUniformPreviewMaterial(material: THREE.Material) {
  const materialColor = (material as { color?: THREE.Color }).color;
  const renderColorHex = typeof material.userData.renderColorHex === "string" && material.userData.renderColorHex
    ? material.userData.renderColorHex
    : `#${(materialColor ?? new THREE.Color(0xffffff)).getHexString()}`;
  const preview = new THREE.MeshBasicMaterial({ color: hex(renderColorHex) });
  preview.userData = { ...material.userData, renderColorHex, uniformFaceColor: true };
  return preview;
}

function resolveComponentForParam(
  params: Record<string, unknown>,
  catalog: ClientCatalog,
  key: "legComponentId" | "clipComponentId" | "handleComponentId" | "hingeComponentId",
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
  material.userData.materialGroup = "hardware";
  material.userData.materialSlotId = "hardware";
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
  mesh.userData.componentGeometryId = component.geometryId;
}

function componentGeometryForComponent(catalog: ClientCatalog, component: ComponentDefinition | undefined): ComponentGeometryDefinition | undefined {
  if (!component?.geometryId) return undefined;
  return catalog.componentGeometry.find((geometry) => geometry.id === component.geometryId && geometry.componentType === component.componentType);
}

function inferSideRole(name: string): SideRole | null {
  if (name.includes("drawer_left_side")) return "LEFT";
  if (name.includes("drawer_right_side")) return "RIGHT";
  if (name.includes("drawer_back")) return "BACK";
  if (name.includes("drawer_front_inner")) return "FRONT";
  if (name.includes("left_side")) return "LEFT";
  if (name.includes("right_side")) return "RIGHT";
  if (name.includes("back")) return "BACK";
  if (name.includes("front") || name.includes("door") || name.includes("drawer") || name.includes("cladding") || name.includes("relief")) return "FRONT";
  if (name.includes("worktop") || name.includes("top") || name.includes("table_top")) return "TOP";
  if (name.includes("bottom") || name.includes("plinth")) return "BOTTOM";
  return null;
}

function inferGrainAlong(name: string, materialGroup: string | null | undefined, dimensionsMm: { width: number; height: number; depth: number }) {
  const group = (materialGroup ?? "").toLowerCase();
  const normalizedName = name.toLowerCase();
  if (group === "hardware" || group === "appliance") return "none";
  if (group === "front" || group === "back") return "height";
  if (normalizedName.includes("side_panel") || normalizedName.includes("left_side") || normalizedName.includes("right_side")) return "height";
  if (group === "plinth") return "width";
  if (group === "shelf" || normalizedName.includes("shelf") || normalizedName.includes("top") || normalizedName.includes("bottom")) {
    return dimensionsMm.width >= dimensionsMm.depth ? "width" : "depth";
  }
  if (dimensionsMm.height >= dimensionsMm.width && dimensionsMm.height >= dimensionsMm.depth) return "height";
  return dimensionsMm.width >= dimensionsMm.depth ? "width" : "depth";
}

function readMeshDimensionsMm(mesh: THREE.Mesh) {
  const stored = mesh.userData.dimensionsMm as { width?: unknown; height?: unknown; depth?: unknown } | undefined;
  if (
    typeof stored?.width === "number" && Number.isFinite(stored.width) &&
    typeof stored.height === "number" && Number.isFinite(stored.height) &&
    typeof stored.depth === "number" && Number.isFinite(stored.depth)
  ) {
    return { width: stored.width, height: stored.height, depth: stored.depth };
  }
  mesh.geometry.computeBoundingBox();
  const box = mesh.geometry.boundingBox;
  if (!box) return { width: 0, height: 0, depth: 0 };
  return {
    width: (box.max.x - box.min.x) / MM,
    height: (box.max.y - box.min.y) / MM,
    depth: (box.max.z - box.min.z) / MM
  };
}

function readObjectBoundsMm(object: THREE.Object3D) {
  const box = new THREE.Box3().setFromObject(object);
  return {
    minX: box.min.x / MM,
    maxX: box.max.x / MM,
    minY: box.min.y / MM,
    maxY: box.max.y / MM,
    minZ: box.min.z / MM,
    maxZ: box.max.z / MM,
    width: (box.max.x - box.min.x) / MM,
    height: (box.max.y - box.min.y) / MM,
    depth: (box.max.z - box.min.z) / MM
  };
}

function resizeAxisAlignedBoxMeshToBoundsMm(
  mesh: THREE.Mesh,
  bounds: Partial<{ minX: number; maxX: number; minY: number; maxY: number; minZ: number; maxZ: number }>
) {
  const current = readObjectBoundsMm(mesh);
  const minX = bounds.minX ?? current.minX;
  const maxX = bounds.maxX ?? current.maxX;
  const minY = bounds.minY ?? current.minY;
  const maxY = bounds.maxY ?? current.maxY;
  const minZ = bounds.minZ ?? current.minZ;
  const maxZ = bounds.maxZ ?? current.maxZ;
  const next = {
    width: Math.max(0.1, maxX - minX),
    height: Math.max(0.1, maxY - minY),
    depth: Math.max(0.1, maxZ - minZ)
  };
  if (current.width > 0) mesh.scale.x *= next.width / current.width;
  if (current.height > 0) mesh.scale.y *= next.height / current.height;
  if (current.depth > 0) mesh.scale.z *= next.depth / current.depth;
  mesh.position.x += ((minX + next.width / 2) - (current.minX + current.width / 2)) * MM;
  mesh.position.y += ((minY + next.height / 2) - (current.minY + current.height / 2)) * MM;
  mesh.position.z += ((minZ + next.depth / 2) - (current.minZ + current.depth / 2)) * MM;
  mesh.updateMatrixWorld(true);
  mesh.userData.dimensionsMm = next;
  mesh.userData.grainAlong = inferGrainAlong(mesh.name, String(mesh.userData.materialGroup ?? "corpus"), next);
}

function inferMaterialGroup(name: string): string {
  const normalizedName = name.toLowerCase();
  if (normalizedName.includes("cutlery_inner_drawer_front")) return "front";
  if (normalizedName.includes("cutlery_inner_drawer_bottom") || normalizedName.includes("cutlery_inner_drawer_cross_rail")) return "drawer_bottom";
  if (normalizedName.includes("cutlery_inner_drawer_system") || normalizedName.includes("cutlery_inner_drawer_runner")) return "hardware";
  if (normalizedName.includes("kickclip") || normalizedName.includes("drawer_system") || normalizedName.includes("drawer_runner") || normalizedName.includes("runner")) return "hardware";
  if (normalizedName.includes("handle") || normalizedName.includes("hinge") || normalizedName.includes("faucet") || normalizedName.includes("leg") || normalizedName.includes("foot") || normalizedName.includes("clip")) return "hardware";
  if (normalizedName.includes("drawer_bottom")) return "drawer_bottom";
  if (normalizedName.includes("drawer_left_side") || normalizedName.includes("drawer_right_side") || normalizedName.includes("drawer_back") || normalizedName.includes("drawer_front_inner")) {
    return "body";
  }
  if (normalizedName.includes("rail")) return "body";
  if (normalizedName.includes("back")) return "back";
  if (normalizedName.includes("shelf")) return "shelf";
  if (normalizedName.includes("plinth")) return "plinth";
  if (normalizedName.includes("worktop") || normalizedName.includes("table_top")) return "worktop";
  if (normalizedName.includes("appliance") || normalizedName.includes("sink") || normalizedName.includes("basin")) return "appliance";
  if (normalizedName.includes("front") || normalizedName.includes("door") || normalizedName.includes("drawer")) return "front";
  return "body";
}

function markDrawerSubmodulePart(mesh: THREE.Mesh, args: {
  submoduleKind: "drawer" | "cutlery_inner_drawer";
  drawerIndex: number;
  drawerFrontHeightMm?: number;
  materialGroup?: string;
  materialSlotId?: string;
  drawerMotionRole?: "moving" | "fixed_corpus";
}) {
  mesh.userData.submoduleKind = args.submoduleKind;
  mesh.userData.parentDrawerIndex = args.drawerIndex;
  if (args.drawerMotionRole) mesh.userData.drawerMotionRole = args.drawerMotionRole;
  if (args.drawerFrontHeightMm) mesh.userData.drawerFrontHeightMm = args.drawerFrontHeightMm;
  if (args.materialGroup) mesh.userData.materialGroup = args.materialGroup;
  if (args.materialSlotId) mesh.userData.materialSlotId = args.materialSlotId;
  const dimensions = mesh.userData.dimensionsMm as { width: number; height: number; depth: number } | undefined;
  mesh.userData.grainAlong = inferGrainAlong(mesh.name, args.materialGroup ?? mesh.userData.materialGroup, dimensions ?? { width: 0, height: 0, depth: 0 });
}

function addCutleryInnerDrawerSubmodule(
  group: THREE.Group,
  params: FwmFurnitureParams,
  catalog: ClientCatalog,
  args: {
    prefix: string;
    index: number;
    frontHeightMm: number;
    boxDepthMm: number;
    cabinetInnerWidthMm: number;
  }
) {
  const enabled = bool(params, "hasCutleryInnerDrawer", false);
  if (!enabled) return;
  const targetIndex = Math.round(num(params, "drawerCount", 0));
  if (args.index !== targetIndex) return;

  const drawerBottomMat = makeMaterial(params, catalog, "drawer_bottom");
  const frontMat = makeMaterial(params, catalog, "front");
  const hardware = makeMaterial(params, catalog, "hardware");
  const frontT = num(params, "frontThicknessMm", 18);
  const innerFrontDepth = Math.max(12, Math.min(frontT, 22));
  const innerFrontHeight = Math.max(44, Math.min(72, args.frontHeightMm - 70));
  const innerBottomThickness = Math.max(8, Math.min(num(params, "boardThickness", 18), 18));
  const innerWidth = Math.max(60, args.cabinetInnerWidthMm - 24);
  const innerDepth = Math.max(100, args.boxDepthMm - 48);
  const innerFrontWidth = innerWidth;
  const crossRailWidth = innerWidth;
  const frontMaxY = args.frontHeightMm * 0.5;
  const innerFrontCenterY = frontMaxY - 10 - innerFrontHeight * 0.5;
  const innerBottomCenterY = innerFrontCenterY - innerFrontHeight * 0.5 + innerBottomThickness * 0.5 + 14;
  const innerFrontCenterZ = -frontT - 9 - innerFrontDepth * 0.5;
  const innerBottomCenterZ = innerFrontCenterZ - innerFrontDepth * 0.5 - innerDepth * 0.5;
  const crossRailCenterZ = innerBottomCenterZ - innerDepth * 0.5 + 9;
  const paramKeys = [
    "hasCutleryInnerDrawer",
    "cutleryInnerDrawerAllowed",
    "cutleryInnerDrawerStatus",
    "cutleryInnerDrawerTargetIndex",
    "cutleryInnerDrawerWidthMm",
    "cutleryInnerDrawerDepthMm",
    "cutleryInnerDrawerFrontWidthMm",
    "cutleryInnerDrawerCrossRailWidthMm",
    "drawerFrontHeightsMm",
    "width",
    "depth"
  ];
  const submoduleMeta = {
    submoduleKind: "cutlery_inner_drawer" as const,
    drawerIndex: args.index,
    drawerFrontHeightMm: args.frontHeightMm
  };

  const innerFront = addBox(
    group,
    `${args.prefix}cutlery_inner_drawer_front_${args.index}`,
    { width: innerFrontWidth, height: innerFrontHeight, depth: innerFrontDepth },
    { x: 0, y: innerFrontCenterY, z: innerFrontCenterZ },
    frontMat,
    paramKeys
  );
  markDrawerSubmodulePart(innerFront, { ...submoduleMeta, materialGroup: "front", materialSlotId: "front" });

  const innerBottom = addBox(
    group,
    `${args.prefix}cutlery_inner_drawer_bottom_${args.index}`,
    { width: innerWidth, height: innerBottomThickness, depth: innerDepth },
    { x: 0, y: innerBottomCenterY, z: innerBottomCenterZ },
    drawerBottomMat,
    [...paramKeys, "drawerBottomMaterialId"]
  );
  markDrawerSubmodulePart(innerBottom, { ...submoduleMeta, materialGroup: "drawer_bottom", materialSlotId: "drawer_bottom" });

  const crossRail = addBox(
    group,
    `${args.prefix}cutlery_inner_drawer_cross_rail_${args.index}`,
    { width: crossRailWidth, height: 36, depth: 18 },
    { x: 0, y: innerBottomCenterY + 22, z: crossRailCenterZ },
    drawerBottomMat,
    [...paramKeys, "drawerBottomMaterialId"]
  );
  markDrawerSubmodulePart(crossRail, { ...submoduleMeta, materialGroup: "drawer_bottom", materialSlotId: "drawer_bottom" });

  for (const side of [-1, 1] as const) {
    const systemSide = side < 0 ? "left" : "right";
    const runner = addBox(
      group,
      `${args.prefix}cutlery_inner_drawer_runner_${systemSide}_${args.index}`,
      { width: 6, height: 18, depth: innerDepth },
      { x: side * (innerWidth * 0.5 + 6), y: innerBottomCenterY + 10, z: innerBottomCenterZ },
      hardware,
      paramKeys
    );
    markDrawerSubmodulePart(runner, { ...submoduleMeta, materialGroup: "hardware", materialSlotId: "hardware" });
  }
}

function addDrawerSubmodule(
  group: THREE.Group,
  params: FwmFurnitureParams,
  catalog: ClientCatalog,
  args: {
    prefix: string;
    index: number;
    widthMm: number;
    frontHeightMm: number;
    drawerCenterZMm: number;
    drawerDepthMm: number;
    fixedRunnerOpenOffsetMm?: number;
  }
) {
  const body = makeMaterial(params, catalog, "body");
  const drawerBottomMat = makeMaterial(params, catalog, "drawer_bottom");
  const hardware = makeMaterial(params, catalog, "hardware");
  const drawerSystemParamKeys = [
    "drawerCount",
    "drawerFrontHeightsMm",
    "hasCutleryInnerDrawer",
    "width",
    "depth"
  ];
  const boxThickness = Math.max(10, Math.min(16, num(params, "boardThickness", 18) - 2));
  const bottomThickness = Math.max(6, num(params, "drawerBottomThickness", 8));
  const outerWidth = Math.max(90, args.widthMm - 48);
  const sideHeight = Math.max(55, Math.min(160, args.frontHeightMm - 48));
  const cabinetInnerWidth = Math.max(60, num(params, "width", args.widthMm + 4) - num(params, "boardThickness", 18) * 2);
  const innerWidth = Math.max(60, outerWidth - boxThickness * 2);
  const boxDepth = Math.max(160, args.drawerDepthMm);
  const bottomDepth = Math.max(100, boxDepth - boxThickness * 2);
  const drawerCenterZMm = args.drawerCenterZMm + 12;
  const bottomCenterZ = drawerCenterZMm;
  const localBottomCenterY = -args.frontHeightMm * 0.5 + 22;
  const bodyCenterY = localBottomCenterY + (sideHeight - bottomThickness) * 0.5;
  const innerFrontZ = drawerCenterZMm + boxDepth * 0.5 - boxThickness * 0.5;
  const innerBackZ = drawerCenterZMm - boxDepth * 0.5 + boxThickness * 0.5;
  const runnerHeight = Math.max(32, sideHeight - 20);
  const runnerInsetX = outerWidth * 0.5 + 8;
  const fixedRunnerOpenOffset = Math.max(0, args.fixedRunnerOpenOffsetMm ?? 0);

  const drawerMeta = { submoduleKind: "drawer" as const, drawerIndex: args.index, drawerFrontHeightMm: args.frontHeightMm, drawerMotionRole: "moving" as const };
  markDrawerSubmodulePart(addBox(group, `${args.prefix}drawer_left_side_${args.index}`, { width: boxThickness, height: sideHeight, depth: boxDepth }, { x: -outerWidth * 0.5 + boxThickness * 0.5, y: bodyCenterY, z: drawerCenterZMm }, body, ["drawerCount", "drawerFrontHeightsMm", "width", "depth"]), drawerMeta);
  markDrawerSubmodulePart(addBox(group, `${args.prefix}drawer_right_side_${args.index}`, { width: boxThickness, height: sideHeight, depth: boxDepth }, { x: outerWidth * 0.5 - boxThickness * 0.5, y: bodyCenterY, z: drawerCenterZMm }, body, ["drawerCount", "drawerFrontHeightsMm", "width", "depth"]), drawerMeta);
  markDrawerSubmodulePart(addBox(group, `${args.prefix}drawer_back_${args.index}`, { width: innerWidth, height: sideHeight, depth: boxThickness }, { x: 0, y: bodyCenterY, z: innerBackZ }, body, ["drawerCount", "drawerFrontHeightsMm", "depth", "backThickness"]), drawerMeta);
  markDrawerSubmodulePart(addBox(group, `${args.prefix}drawer_front_inner_${args.index}`, { width: innerWidth, height: Math.max(48, sideHeight - 18), depth: boxThickness }, { x: 0, y: bodyCenterY + 6, z: innerFrontZ }, body, ["drawerCount", "drawerFrontHeightsMm", "frontThicknessMm"]), drawerMeta);
  markDrawerSubmodulePart(addBox(group, `${args.prefix}drawer_bottom_${args.index}`, { width: innerWidth, height: bottomThickness, depth: bottomDepth }, { x: 0, y: localBottomCenterY, z: bottomCenterZ }, drawerBottomMat, [...drawerSystemParamKeys, "drawerBottomMaterialId"]), { ...drawerMeta, materialGroup: "drawer_bottom", materialSlotId: "drawer_bottom" });
  markDrawerSubmodulePart(addBox(group, `${args.prefix}drawer_runner_left_${args.index}`, { width: 8, height: runnerHeight, depth: boxDepth }, { x: -runnerInsetX, y: bodyCenterY, z: drawerCenterZMm - fixedRunnerOpenOffset }, hardware, drawerSystemParamKeys), { submoduleKind: "drawer", drawerIndex: args.index, drawerFrontHeightMm: args.frontHeightMm, materialGroup: "hardware", materialSlotId: "hardware", drawerMotionRole: "fixed_corpus" });
  markDrawerSubmodulePart(addBox(group, `${args.prefix}drawer_runner_right_${args.index}`, { width: 8, height: runnerHeight, depth: boxDepth }, { x: runnerInsetX, y: bodyCenterY, z: drawerCenterZMm - fixedRunnerOpenOffset }, hardware, drawerSystemParamKeys), { submoduleKind: "drawer", drawerIndex: args.index, drawerFrontHeightMm: args.frontHeightMm, materialGroup: "hardware", materialSlotId: "hardware", drawerMotionRole: "fixed_corpus" });
  addCutleryInnerDrawerSubmodule(group, params, catalog, {
    prefix: args.prefix,
    index: args.index,
    frontHeightMm: args.frontHeightMm,
    boxDepthMm: boxDepth,
    cabinetInnerWidthMm: cabinetInnerWidth
  });
}

function addSwingDoorLeaf(
  group: THREE.Group,
  params: FwmFurnitureParams,
  material: THREE.Material,
  hardware: THREE.Material,
  args: {
    name: string;
    widthMm: number;
    heightMm: number;
    xCenterMm: number;
    yCenterMm: number;
    zCenterMm: number;
    doorIndex: number;
    doorCount: number;
  }
) {
  const requestedSide = String(params.side ?? "left").toLowerCase();
  const hingeSide = args.doorCount === 1
    ? requestedSide === "right" ? "right" : "left"
    : args.doorIndex % 2 === 0 ? "left" : "right";
  const pivot = new THREE.Group();
  pivot.name = `${args.name}_pivot`;
  pivot.position.set(
    (hingeSide === "left" ? args.xCenterMm - args.widthMm * 0.5 : args.xCenterMm + args.widthMm * 0.5) * MM,
    args.yCenterMm * MM,
    args.zCenterMm * MM
  );
  pivot.rotation.y = bool(params, "opened", false) ? (hingeSide === "left" ? -Math.PI * 0.38 : Math.PI * 0.38) : 0;
  group.add(pivot);
  addBox(
    pivot,
    args.name,
    { width: args.widthMm, height: args.heightMm, depth: num(params, "frontThicknessMm", 18) },
    { x: hingeSide === "left" ? args.widthMm * 0.5 : -args.widthMm * 0.5, y: 0, z: 0 },
    material,
    ["doorCount", "frontThicknessMm", "frontGap", "handleComponentId", "opened"]
  );
  const frontThicknessMm = num(params, "frontThicknessMm", 18);
  const hingePlateX = hingeSide === "left" ? 12 : -12;
  const hingePlateZ = -frontThicknessMm * 0.5 - 3;
  const hingeYPositions = [
    { suffix: "lower", y: -args.heightMm * 0.28 },
    { suffix: "upper", y: args.heightMm * 0.28 }
  ];
  for (const hinge of hingeYPositions) {
    const plate = addBox(
      pivot,
      `${args.name}_hinge_${hinge.suffix}`,
      { width: 24, height: 64, depth: 6 },
      { x: hingePlateX, y: hinge.y, z: hingePlateZ },
      hardware,
      ["doorCount", "hingeComponentId", "opened", "side"]
    );
    plate.userData.componentType = "hinge";
    if (typeof params.hingeComponentId === "string" && params.hingeComponentId.trim()) {
      plate.userData.componentId = params.hingeComponentId.trim();
      plate.userData.catalogComponentId = params.hingeComponentId.trim();
      plate.userData.componentParamKey = "hingeComponentId";
    }
  }
  const handleProjectionMm = num(params, "handleProjectionMm", 28);
  const handleLengthMm = Math.min(num(params, "handleLengthMm", 160), args.heightMm * 0.45);
  addCylinder(
    pivot,
    `${args.name}_handle`,
    5,
    handleLengthMm,
    {
      x: hingeSide === "left" ? args.widthMm - 45 : -args.widthMm + 45,
      y: args.heightMm * 0.08,
      z: num(params, "frontThicknessMm", 18) * 0.5 + handleProjectionMm * 0.5
    },
    hardware,
    "y"
  );
  return pivot;
}

function mark(mesh: THREE.Mesh, dimensionsMm: { width: number; height: number; depth: number }, paramKeys: string[], sideRole: SideRole | null, materialGroup: string) {
  mesh.userData.selectable = true;
  mesh.userData.dimensionsMm = dimensionsMm;
  mesh.userData.paramKeys = paramKeys;
  mesh.userData.sideRole = sideRole;
  const canonicalGroup = canonicalFwmMaterialGroup(materialGroup) || materialGroup;
  mesh.userData.materialGroup = canonicalGroup;
  const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  const materialSlotId = canonicalFwmMaterialGroup(material?.userData?.materialSlotId) || canonicalGroup;
  mesh.userData.materialSlotId = materialSlotId;
  mesh.userData.grainAlong = inferGrainAlong(mesh.name, canonicalGroup, dimensionsMm);
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

function doubleSidedMaterial(material: THREE.Material | THREE.Material[]) {
  if (Array.isArray(material)) {
    return material.map((entry) => {
      const clone = entry.clone();
      clone.side = THREE.DoubleSide;
      return clone;
    });
  }
  const clone = material.clone();
  clone.side = THREE.DoubleSide;
  return clone;
}

function addPlanPrism(
  group: THREE.Group,
  name: string,
  pointsMm: Array<{ x: number; z: number }>,
  yMinMm: number,
  yMaxMm: number,
  material: THREE.Material | THREE.Material[],
  paramKeys: string[] = []
) {
  const vertices: number[] = [];
  for (const point of pointsMm) vertices.push(point.x * MM, yMinMm * MM, point.z * MM);
  for (const point of pointsMm) vertices.push(point.x * MM, yMaxMm * MM, point.z * MM);

  const indices: number[] = [];
  const count = pointsMm.length;
  for (let index = 0; index < count; index += 1) {
    const next = (index + 1) % count;
    indices.push(index, next, count + next, index, count + next, count + index);
  }
  // ShapeUtils handles both convex and concave cabinet footprints.
  const contour = pointsMm.map((point) => new THREE.Vector2(point.x, point.z));
  const triangles = THREE.ShapeUtils.triangulateShape(contour, []);
  for (const triangle of triangles) {
    indices.push(triangle[0]!, triangle[1]!, triangle[2]!);
    indices.push(count + triangle[2]!, count + triangle[1]!, count + triangle[0]!);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, doubleSidedMaterial(material));
  mesh.name = name;
  const minX = Math.min(...pointsMm.map((point) => point.x));
  const maxX = Math.max(...pointsMm.map((point) => point.x));
  const minZ = Math.min(...pointsMm.map((point) => point.z));
  const maxZ = Math.max(...pointsMm.map((point) => point.z));
  mark(
    mesh,
    { width: maxX - minX, height: yMaxMm - yMinMm, depth: maxZ - minZ },
    paramKeys,
    inferSideRole(name),
    inferMaterialGroup(name)
  );
  mesh.userData.revitPlanProfileMm = pointsMm.map((point) => ({ x: point.x, y: 0, z: point.z }));
  mesh.userData.revitExtrusionAxis = "Y";
  mesh.userData.revitExtrusionStartMm = yMinMm;
  mesh.userData.revitExtrusionEndMm = yMaxMm;
  group.add(mesh);
  return mesh;
}

function addBoardBetweenPlanPoints(
  group: THREE.Group,
  name: string,
  startMm: { x: number; z: number },
  endMm: { x: number; z: number },
  yCenterMm: number,
  heightMm: number,
  thicknessMm: number,
  material: THREE.Material,
  paramKeys: string[] = []
) {
  const dx = endMm.x - startMm.x;
  const dz = endMm.z - startMm.z;
  const length = Math.hypot(dx, dz);
  const center = { x: (startMm.x + endMm.x) / 2, y: yCenterMm, z: (startMm.z + endMm.z) / 2 };
  const mesh = addBox(group, name, { width: length, height: heightMm, depth: thicknessMm }, center, material, paramKeys);
  mesh.rotation.y = -Math.atan2(dz, dx);
  if (length > 0) {
    const nx = -dz / length;
    const nz = dx / length;
    const halfThickness = thicknessMm * 0.5;
    mesh.userData.revitPlanProfileMm = [
      { x: startMm.x + nx * halfThickness, y: 0, z: startMm.z + nz * halfThickness },
      { x: endMm.x + nx * halfThickness, y: 0, z: endMm.z + nz * halfThickness },
      { x: endMm.x - nx * halfThickness, y: 0, z: endMm.z - nz * halfThickness },
      { x: startMm.x - nx * halfThickness, y: 0, z: startMm.z - nz * halfThickness }
    ];
    mesh.userData.revitExtrusionAxis = "Y";
    mesh.userData.revitExtrusionStartMm = yCenterMm - heightMm * 0.5;
    mesh.userData.revitExtrusionEndMm = yCenterMm + heightMm * 0.5;
  }
  return mesh;
}

function offsetPlanSegmentTowardCenter(
  startMm: { x: number; z: number },
  endMm: { x: number; z: number },
  offsetMm: number,
  centerMm: { x: number; z: number } = { x: 0, z: 0 }
) {
  const dx = endMm.x - startMm.x;
  const dz = endMm.z - startMm.z;
  const length = Math.hypot(dx, dz);
  if (length <= 0) return { start: startMm, end: endMm };
  const leftNormal = { x: -dz / length, z: dx / length };
  const mid = { x: (startMm.x + endMm.x) / 2, z: (startMm.z + endMm.z) / 2 };
  const toCenter = { x: centerMm.x - mid.x, z: centerMm.z - mid.z };
  const normal = leftNormal.x * toCenter.x + leftNormal.z * toCenter.z >= 0
    ? leftNormal
    : { x: -leftNormal.x, z: -leftNormal.z };
  return {
    start: { x: startMm.x + normal.x * offsetMm, z: startMm.z + normal.z * offsetMm },
    end: { x: endMm.x + normal.x * offsetMm, z: endMm.z + normal.z * offsetMm }
  };
}

function insetPlanSegmentTowardCenter(
  startMm: { x: number; z: number },
  endMm: { x: number; z: number },
  thicknessMm: number,
  centerMm: { x: number; z: number } = { x: 0, z: 0 }
) {
  return offsetPlanSegmentTowardCenter(startMm, endMm, thicknessMm / 2, centerMm);
}

function addInsetBoardBetweenPlanPoints(
  group: THREE.Group,
  name: string,
  startMm: { x: number; z: number },
  endMm: { x: number; z: number },
  yCenterMm: number,
  heightMm: number,
  thicknessMm: number,
  material: THREE.Material,
  paramKeys: string[] = [],
  centerMm: { x: number; z: number } = { x: 0, z: 0 }
) {
  const inset = insetPlanSegmentTowardCenter(startMm, endMm, thicknessMm, centerMm);
  return addBoardBetweenPlanPoints(group, name, inset.start, inset.end, yCenterMm, heightMm, thicknessMm, material, paramKeys);
}

function addOutsetBoardBetweenPlanPoints(
  group: THREE.Group,
  name: string,
  startMm: { x: number; z: number },
  endMm: { x: number; z: number },
  yCenterMm: number,
  heightMm: number,
  thicknessMm: number,
  material: THREE.Material,
  paramKeys: string[] = [],
  centerMm: { x: number; z: number } = { x: 0, z: 0 }
) {
  const outset = offsetPlanSegmentTowardCenter(startMm, endMm, -thicknessMm / 2, centerMm);
  return addBoardBetweenPlanPoints(group, name, outset.start, outset.end, yCenterMm, heightMm, thicknessMm, material, paramKeys);
}

function tagVisibleEdges(mesh: THREE.Mesh, edgeIds: string[]) {
  if (edgeIds.length <= 0) return mesh;
  mesh.userData.edgeBandingStrategy = "explicit_visible_edges";
  mesh.userData.edgeBanding = edgeIds.map((edgeId) => ({
    edgeId,
    role: "visible",
    materialSlotId: canonicalFwmMaterialGroup(mesh.userData.materialSlotId) || canonicalFwmMaterialGroup(mesh.userData.materialGroup) || "corpus"
  }));
  return mesh;
}

function tagBoardIdentity(mesh: THREE.Mesh, boardName: string, materialSlotId: string) {
  mesh.userData.boardName = boardName;
  mesh.userData.partName = boardName;
  mesh.userData.materialGroup = materialSlotId;
  mesh.userData.materialSlotId = materialSlotId;
  mesh.userData.grainAlong = inferGrainAlong(boardName, materialSlotId, readMeshDimensionsMm(mesh));
  return mesh;
}

function wallOpenEndShapePath(width: number, depth: number, shape: string, side: string, amount: number) {
  const sign = side === "left" ? -1 : 1;
  const halfW = width / 2;
  const backZ = -depth / 2;
  const frontZ = depth / 2;
  const cut = Math.max(20, Math.min(amount, width - 30, depth - 30));
  const fixedBack = { x: -sign * halfW, z: backZ };
  const fixedFront = { x: -sign * halfW, z: frontZ };
  const shapedBack = { x: sign * halfW, z: backZ };
  const shapedPath = [shapedBack];

  if (shape === "rounded") {
    const radius = cut;
    const centerX = sign * (halfW - radius);
    const centerZ = frontZ - radius;
    shapedPath.push({ x: sign * halfW, z: centerZ });
    const steps = 8;
    for (let index = 1; index <= steps; index += 1) {
      const angle = (index / steps) * (Math.PI / 2);
      shapedPath.push({
        x: centerX + sign * Math.cos(angle) * radius,
        z: centerZ + Math.sin(angle) * radius
      });
    }
  } else {
    shapedPath.push(
      { x: sign * halfW, z: frontZ - cut },
      { x: sign * (halfW - cut), z: frontZ }
    );
  }

  return sign === 1
    ? [fixedBack, ...shapedPath, fixedFront]
    : [...shapedPath, fixedFront, fixedBack];
}

function wallOpenEndShelfPath(width: number, depth: number, shape: string, side: string, amount: number, boardThickness: number) {
  const sign = side === "left" ? -1 : 1;
  const halfW = width / 2;
  const backZ = -depth / 2 + boardThickness;
  const frontZ = depth / 2;
  const cut = Math.max(20, Math.min(amount, width - 30, depth - 30));
  const fixedBack = { x: -sign * halfW + sign * boardThickness, z: backZ };
  const fixedFront = { x: -sign * halfW + sign * boardThickness, z: frontZ };
  const shapedBack = { x: sign * halfW, z: backZ };
  const shapedPath = [shapedBack];

  if (shape === "rounded") {
    const radius = cut;
    const centerX = sign * (halfW - radius);
    const centerZ = frontZ - radius;
    shapedPath.push({ x: sign * halfW, z: centerZ });
    const steps = 8;
    for (let index = 1; index <= steps; index += 1) {
      const angle = (index / steps) * (Math.PI / 2);
      shapedPath.push({
        x: centerX + sign * Math.cos(angle) * radius,
        z: centerZ + Math.sin(angle) * radius
      });
    }
  } else {
    shapedPath.push(
      { x: sign * halfW, z: frontZ - cut },
      { x: sign * (halfW - cut), z: frontZ }
    );
  }

  return sign === 1
    ? [fixedBack, ...shapedPath, fixedFront]
    : [...shapedPath, fixedFront, fixedBack];
}

function wallOpenEndPanelSegments(width: number, depth: number, shape: string, side: string, amount: number) {
  const sign = side === "left" ? -1 : 1;
  const halfW = width / 2;
  const backZ = -depth / 2;
  const frontZ = depth / 2;
  const cut = Math.max(20, Math.min(amount, width - 30, depth - 30));
  const fixed = {
    start: { x: -sign * halfW, z: backZ },
    end: { x: -sign * halfW, z: frontZ }
  };
  const shapedPath = [{ x: sign * halfW, z: backZ }];

  if (shape === "rounded") {
    const radius = cut;
    const centerX = sign * (halfW - radius);
    const centerZ = frontZ - radius;
    shapedPath.push({ x: sign * halfW, z: centerZ });
    const steps = 8;
    for (let index = 1; index <= steps; index += 1) {
      const angle = (index / steps) * (Math.PI / 2);
      shapedPath.push({
        x: centerX + sign * Math.cos(angle) * radius,
        z: centerZ + Math.sin(angle) * radius
      });
    }
  } else {
    shapedPath.push(
      { x: sign * halfW, z: frontZ - cut },
      { x: sign * (halfW - cut), z: frontZ }
    );
  }

  const shaped = shapedPath.slice(0, -1).map((point, index) => ({
    start: point,
    end: shapedPath[index + 1]
  }));
  return { fixed, shaped };
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
  index: number | string,
  centerMm: { x: number; z: number },
  material: THREE.Material,
  component: ComponentDefinition | undefined,
  facing: "front" | "left" | "right" = "front"
) {
  const paramKeys = [
    "clipComponentId",
    "legComponentId",
    "plinthHeight",
    "plinthSetbackMm",
    "depth",
    "boardThickness",
    "kitchenEndClosureLeft",
    "kitchenEndClosureRight",
    "kitchenEndClosureBackGapMm"
  ];
  const rotationY = facing === "left" ? -Math.PI / 2 : facing === "right" ? Math.PI / 2 : 0;
  const direction = new THREE.Vector3(0, 0, 1).applyEuler(new THREE.Euler(0, rotationY, 0));
  const offsetCenter = (distance: number) => ({
    x: centerMm.x + direction.x * distance,
    y: 40,
    z: centerMm.z + direction.z * distance
  });
  const collar = addCornerStyleClipCollar(group, `${prefix}kickClip_${facing}_${index}_collar`, offsetCenter(1.768), material, paramKeys);
  collar.rotation.y += rotationY;
  const pad = addBox(group, `${prefix}kickClip_${facing}_${index}_pad`, { width: 30, height: 35, depth: 25 }, offsetCenter(7), material, paramKeys);
  pad.rotation.y = rotationY;
  const armCenter = offsetCenter(26.5);
  armCenter.y = 39;
  const arm = addBox(group, `${prefix}kickClip_${facing}_${index}_arm`, { width: 30, height: 35, depth: 25 }, armCenter, material, paramKeys);
  arm.rotation.y = rotationY;
  markComponent(collar, component, "clipComponentId");
  markComponent(pad, component, "clipComponentId");
  markComponent(arm, component, "clipComponentId");
}

function tagChamferedRuntimeHardware(mesh: THREE.Mesh, boardName: string, materialSlotId = "hardware") {
  mesh.userData.boardName = boardName;
  mesh.userData.partName = boardName;
  mesh.userData.materialGroup = "hardware";
  mesh.userData.materialSlotId = materialSlotId;
}

function addAdjustableLegs(group: THREE.Group, params: FwmFurnitureParams, catalog: ClientCatalog, opts: { width: number; depth: number; plinth: number; setback: number; boardDepth: number; prefix: string; zOffset?: number }) {
  const legHeight = Math.max(1, opts.plinth);
  const hardware = makeMaterial(params, catalog, "hardware");
  const legComponent = resolveComponentForParam(params, catalog, "legComponentId", "leg");
  const clipComponent = resolveComponentForParam(params, catalog, "clipComponentId", "plinth_clip");
  const legMaterial = makeComponentMaterial(params, catalog, legComponent, hardware);
  const clipMaterial = makeComponentMaterial(params, catalog, clipComponent, hardware);
  const xInset = Math.min(90, Math.max(55, opts.width * 0.12));
  const zOffset = opts.zOffset ?? 0;
  const zFront = zOffset + opts.depth / 2 - opts.setback - opts.boardDepth - 30;
  const zBack = zOffset - opts.depth / 2 + Math.min(100, Math.max(70, opts.depth * 0.16));
  const xPositions = [-opts.width / 2 + xInset, opts.width / 2 - xInset];
  if (opts.width > 900) xPositions.splice(1, 0, 0);
  if (opts.width > 1500) {
    xPositions.splice(1, 0, -opts.width * 0.25);
    xPositions.splice(xPositions.length - 1, 0, opts.width * 0.25);
  }
  const leftClosure = bool(params, "kitchenEndClosureLeft", false);
  const rightClosure = bool(params, "kitchenEndClosureRight", false);
  const sideLegInset = Math.min(Math.max(1, opts.width / 2 - 1), opts.boardDepth + 30);
  if (leftClosure && xPositions.length > 0) xPositions[0] = -opts.width / 2 + sideLegInset;
  if (rightClosure && xPositions.length > 0) xPositions[xPositions.length - 1] = opts.width / 2 - sideLegInset;
  const zPositions = Math.abs(zFront - zBack) > 120 ? [zFront, zBack] : [zFront];
  let frontIndex = 1;
  let rearIndex = 1;
  for (const [xIndex, x] of xPositions.entries()) {
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
      const sideFacing = xIndex === 0 && leftClosure
        ? "left"
        : xIndex === xPositions.length - 1 && rightClosure
          ? "right"
          : null;
      if (sideFacing) {
        addCornerStylePlinthClipSet(
          group,
          opts.prefix,
          `${isFront ? "front" : "rear"}_${index}`,
          { x, z },
          clipMaterial,
          clipComponent,
          sideFacing
        );
      }
    }
  }
}

function addCarcass(group: THREE.Group, params: FwmFurnitureParams, catalog: ClientCatalog, opts: { openFront?: boolean; topOpen?: boolean; topRails?: boolean; width?: number; height?: number; depth?: number; envelopeDepth?: number; zOffset?: number; namePrefix?: string } = {}) {
  const width = opts.width ?? num(params, "width", 800);
  const height = opts.height ?? num(params, "height", 720);
  const depth = opts.depth ?? num(params, "depth", 560);
  const envelopeDepth = opts.envelopeDepth ?? depth;
  const zOffset = opts.zOffset ?? 0;
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
  const leftClosure = bool(params, "kitchenEndClosureLeft", false);
  const rightClosure = bool(params, "kitchenEndClosureRight", false);
  const closureBackGapMm = Math.max(0, num(params, "kitchenEndClosureBackGapMm", 0));
  const closureParamKeys = [
    "width",
    "height",
    "depth",
    "boardThickness",
    "kitchenEndClosureLeft",
    "kitchenEndClosureRight",
    "kitchenEndClosureBackGapMm"
  ];
  const leftDepth = leftClosure ? envelopeDepth + closureBackGapMm : depth;
  const rightDepth = rightClosure ? envelopeDepth + closureBackGapMm : depth;

  group.userData.supportsKitchenRunEndClosure = true;
  if (!group.getObjectByName(kitchenBackAnchorName)) {
    const kitchenBackAnchor = new THREE.Object3D();
    kitchenBackAnchor.name = kitchenBackAnchorName;
    kitchenBackAnchor.position.set(0, 0, -envelopeDepth * 0.5 * MM);
    kitchenBackAnchor.visible = false;
    group.add(kitchenBackAnchor);
  }

  addBox(group, `${prefix}left_side`, { width: t, height: cabinetHeight, depth: leftDepth }, { x: -width / 2 + t / 2, y: baseY + cabinetHeight / 2, z: leftClosure ? -closureBackGapMm / 2 : zOffset }, body, closureParamKeys);
  addBox(group, `${prefix}right_side`, { width: t, height: cabinetHeight, depth: rightDepth }, { x: width / 2 - t / 2, y: baseY + cabinetHeight / 2, z: rightClosure ? -closureBackGapMm / 2 : zOffset }, body, closureParamKeys);
  addBox(group, `${prefix}bottom`, { width: innerW, height: t, depth }, { x: 0, y: baseY + t / 2, z: zOffset }, body, ["width", "depth", "boardThickness"]);
  if (!opts.topOpen && opts.topRails) {
    const railDepth = Math.max(50, Math.min(90, depth * 0.14));
    addBox(group, `${prefix}top_back_rail`, { width: innerW, height: t, depth: railDepth }, { x: 0, y: baseY + cabinetHeight - t / 2, z: zOffset - depth / 2 + railDepth / 2 }, body, ["width", "height", "depth", "boardThickness"]);
    addBox(group, `${prefix}top_front_rail`, { width: innerW, height: t, depth: railDepth }, { x: 0, y: baseY + cabinetHeight - t / 2, z: zOffset + depth / 2 - railDepth / 2 }, body, ["width", "height", "depth", "boardThickness"]);
  } else if (!opts.topOpen) {
    addBox(group, `${prefix}top`, { width: innerW, height: t, depth }, { x: 0, y: baseY + cabinetHeight - t / 2, z: zOffset }, body, ["width", "height", "depth", "boardThickness"]);
  }
  if (backLayout.thicknessMm > 0) addBox(group, `${prefix}back`, { width: innerW, height: innerH, depth: backLayout.thicknessMm }, { x: 0, y: baseY + t + innerH / 2, z: zOffset + backLayout.centerZ }, backMat, ["width", "height", "depth", "backThickness"]);

  const shelves = Math.round(num(params, "shelfCount", 0));
  const shelfT = num(params, "shelfThickness", t);
  const availableShelfGapHeight = Math.max(1, innerH - shelves * shelfT);
  const requestedShelfGaps = readShelfGapValues(params, shelves + 1);
  const shelfGaps = requestedShelfGaps.length > 0
    ? Array.from(
      { length: shelves + 1 },
      (_, index) => requestedShelfGaps[index] ?? requestedShelfGaps[requestedShelfGaps.length - 1] ?? (availableShelfGapHeight / (shelves + 1))
    )
    : Array.from({ length: shelves + 1 }, () => availableShelfGapHeight / (shelves + 1));
  const shelfGapTotal = shelfGaps.reduce((sum, value) => sum + value, 0);
  const shelfGapScale = shelfGapTotal > availableShelfGapHeight ? availableShelfGapHeight / shelfGapTotal : 1;
  let shelfCursorY = baseY + t;
  for (let index = 0; index < shelves; index += 1) {
    shelfCursorY += shelfGaps[index] * shelfGapScale;
    const y = shelfCursorY + shelfT / 2;
    addBox(group, `${prefix}shelf_${index + 1}`, { width: innerW, height: shelfT, depth: innerD }, { x: 0, y, z: zOffset + back / 2 }, shelfMat, ["shelfCount", "shelfGaps", "shelfThickness", "height", "shelfMaterialId"]);
    shelfCursorY += shelfT;
  }

  if (plinth > 0) {
    const setback = num(params, "plinthSetbackMm", 60);
    const boardDepth = Math.max(8, Math.min(t, 24));
    const z = zOffset + depth / 2 - setback - boardDepth / 2;
    addBox(group, `${prefix}plinth_front_board`, { width: Math.max(1, width), height: plinth, depth: boardDepth }, { x: 0, y: plinth / 2, z }, plinthMat, ["plinthHeight", "plinthSetbackMm", "plinthMaterialId"]);
    const sideReturnRearZ = -envelopeDepth / 2 - closureBackGapMm;
    const sideReturnFrontZ = zOffset + depth / 2 - setback;
    const sideReturnDepth = Math.max(1, sideReturnFrontZ - sideReturnRearZ);
    const sideReturnCenterZ = (sideReturnRearZ + sideReturnFrontZ) / 2;
    const sideReturnParamKeys = [
      "width",
      "depth",
      "plinthHeight",
      "plinthSetbackMm",
      "plinthMaterialId",
      "kitchenEndClosureLeft",
      "kitchenEndClosureRight",
      "kitchenEndClosureBackGapMm"
    ];
    if (leftClosure) {
      const leftReturn = addBox(group, `${prefix}plinth_left_return`, { width: boardDepth, height: plinth, depth: sideReturnDepth }, { x: -width / 2 + boardDepth / 2, y: plinth / 2, z: sideReturnCenterZ }, plinthMat, sideReturnParamKeys);
      leftReturn.userData.sideRole = "LEFT";
    }
    if (rightClosure) {
      const rightReturn = addBox(group, `${prefix}plinth_right_return`, { width: boardDepth, height: plinth, depth: sideReturnDepth }, { x: width / 2 - boardDepth / 2, y: plinth / 2, z: sideReturnCenterZ }, plinthMat, sideReturnParamKeys);
      rightReturn.userData.sideRole = "RIGHT";
    }
    addAdjustableLegs(group, params, catalog, { width, depth, plinth, setback, boardDepth, prefix, zOffset });
  }
}

type OpenEndSide = "none" | "left" | "right";
type OpenEndShape = "straight" | "rounded" | "chamfered";

function tagOpenEndBoard(mesh: THREE.Mesh, boardName: string, materialGroup: "corpus" | "back" | "plinth" | "hardware", edgeBanding: Array<Record<string, unknown>> = []) {
  mesh.userData.boardName = boardName;
  mesh.userData.partName = boardName;
  mesh.userData.materialGroup = materialGroup;
  mesh.userData.materialSlotId = materialGroup;
  mesh.userData.grainAlong = inferGrainAlong(boardName, materialGroup, readMeshDimensionsMm(mesh));
  if (edgeBanding.length > 0) {
    mesh.userData.edgeBandingStrategy = "explicit_visible_edges";
    mesh.userData.edgeBanding = edgeBanding;
  }
}

function openEndShape(params: FwmFurnitureParams): OpenEndShape {
  const variant = String(params.variant ?? "");
  const shape = String(params.shape ?? "").toLowerCase();
  if (variant.includes("rounded") || shape === "rounded") return "rounded";
  if (variant.includes("chamfered") || shape === "chamfered") return "chamfered";
  return "straight";
}

function openEndSide(params: FwmFurnitureParams, shape: OpenEndShape): OpenEndSide {
  const variant = String(params.variant ?? "");
  const endingSide = String(params.endingSide ?? "").toLowerCase();
  if (variant.includes("ending_left") || endingSide === "left") return "left";
  if (variant.includes("ending_right") || endingSide === "right") return "right";
  return shape === "straight" ? "none" : "right";
}

function openEndFootprintPoints(args: {
  width: number;
  depth: number;
  side: OpenEndSide;
  shape: OpenEndShape;
  radiusMm: number;
  chamferMm: number;
}): Array<{ x: number; z: number }> {
  const hw = args.width / 2;
  const hd = args.depth / 2;
  if (args.side === "none" || args.shape === "straight") {
    return [
      { x: -hw, z: -hd },
      { x: hw, z: -hd },
      { x: hw, z: hd },
      { x: -hw, z: hd }
    ];
  }

  const cut = Math.min(Math.max(args.shape === "rounded" ? args.radiusMm : args.chamferMm, 20), Math.max(20, Math.min(args.width, args.depth) - 20));
  if (args.shape === "chamfered") {
    return args.side === "right"
      ? [
          { x: -hw, z: -hd },
          { x: hw, z: -hd },
          { x: hw, z: hd - cut },
          { x: hw - cut, z: hd },
          { x: -hw, z: hd }
        ]
      : [
          { x: -hw, z: -hd },
          { x: hw, z: -hd },
          { x: hw, z: hd },
          { x: -hw + cut, z: hd },
          { x: -hw, z: hd - cut }
        ];
  }

  const segmentCount = 8;
  if (args.side === "right") {
    const center = { x: hw - cut, z: hd - cut };
    const arc = Array.from({ length: segmentCount + 1 }, (_, index) => {
      const angle = (index / segmentCount) * (Math.PI / 2);
      return { x: center.x + Math.cos(angle) * cut, z: center.z + Math.sin(angle) * cut };
    });
    return [
      { x: -hw, z: -hd },
      { x: hw, z: -hd },
      ...arc,
      { x: -hw, z: hd }
    ];
  }

  const center = { x: -hw + cut, z: hd - cut };
  const arc = Array.from({ length: segmentCount + 1 }, (_, index) => {
    const angle = Math.PI / 2 + (index / segmentCount) * (Math.PI / 2);
    return { x: center.x + Math.cos(angle) * cut, z: center.z + Math.sin(angle) * cut };
  });
  return [
    { x: -hw, z: -hd },
    { x: hw, z: -hd },
    { x: hw, z: hd },
    ...arc
  ];
}

function openEndEdgeSegments(points: Array<{ x: number; z: number }>) {
  return points.map((start, index) => ({
    start,
    end: points[(index + 1) % points.length],
    index
  }));
}

function isOpenFrontEdge(segment: { start: { x: number; z: number }; end: { x: number; z: number } }, frontZ: number) {
  return Math.abs(segment.start.z - frontZ) < 0.001 && Math.abs(segment.end.z - frontZ) < 0.001;
}

function isBackEdge(segment: { start: { x: number; z: number }; end: { x: number; z: number } }, backZ: number) {
  return Math.abs(segment.start.z - backZ) < 0.001 && Math.abs(segment.end.z - backZ) < 0.001;
}

function trimOpenEndSegmentBehindBack(
  segment: { start: { x: number; z: number }; end: { x: number; z: number } },
  backZ: number,
  backThickness: number
) {
  const trimPoint = (point: { x: number; z: number }) =>
    Math.abs(point.z - backZ) < 0.001 ? { ...point, z: backZ + backThickness } : point;
  return {
    start: trimPoint(segment.start),
    end: trimPoint(segment.end)
  };
}

function buildOpenEndCabinet(group: THREE.Group, params: FwmFurnitureParams, catalog: ClientCatalog) {
  const width = num(params, "width", 300);
  const height = num(params, "height", 722);
  const depth = num(params, "depth", 530);
  const t = num(params, "boardThickness", 18);
  const back = num(params, "backThickness", 8);
  const plinth = num(params, "plinthHeight", 0);
  const cabinetHeight = Math.max(t * 2 + 20, height - plinth);
  const baseY = plinth;
  const body = makeMaterial(params, catalog, "body");
  const backMat = makeMaterial(params, catalog, "back");
  const shelfMat = makeMaterial(params, catalog, "shelf");
  const plinthMat = makeMaterial(params, catalog, "plinth");
  const shape = openEndShape(params);
  const side = openEndSide(params, shape);
  const radius = num(params, "cornerRadiusMm", Math.min(width, depth) * 0.45);
  const chamfer = num(params, "chamferMm", Math.min(width, depth) * 0.42);
  const footprint = openEndFootprintPoints({ width, depth, side, shape, radiusMm: radius, chamferMm: chamfer });
  const innerWidth = Math.max(1, width - 2 * t);
  const innerDepth = Math.max(1, depth - back);
  const innerFootprint = openEndFootprintPoints({
    width: innerWidth,
    depth: innerDepth,
    side,
    shape,
    radiusMm: Math.max(10, radius - t),
    chamferMm: Math.max(10, chamfer - t)
  }).map((point) => ({ x: point.x, z: point.z + back / 2 }));
  const paramKeys = ["width", "height", "depth", "shelfCount", "shape", "endingSide", "cornerRadiusMm", "chamferMm", "boardThickness"];
  const frontZ = depth / 2;
  const backZ = -depth / 2;

  for (const segment of openEndEdgeSegments(footprint)) {
    if (isOpenFrontEdge(segment, frontZ)) continue;
    const boardName = isBackEdge(segment, backZ)
      ? "open_niche_back_panel"
      : shape === "straight"
        ? `open_niche_side_panel_${segment.index + 1}`
        : `open_niche_${shape}_ending_panel_${segment.index + 1}`;
    const boardSegment = isBackEdge(segment, backZ) ? segment : trimOpenEndSegmentBehindBack(segment, backZ, back);
    const mesh = addInsetBoardBetweenPlanPoints(
      group,
      boardName,
      boardSegment.start,
      boardSegment.end,
      baseY + cabinetHeight / 2,
      cabinetHeight,
      isBackEdge(segment, backZ) ? back : t,
      isBackEdge(segment, backZ) ? backMat : body,
      paramKeys,
      { x: 0, z: 0 }
    );
    tagOpenEndBoard(
      mesh,
      boardName,
      isBackEdge(segment, backZ) ? "back" : "corpus",
      isBackEdge(segment, backZ) ? [] : [{ edgeId: "front_or_side_visible_edge", role: "visible_open_end", axis: "Y", materialSlotId: "corpus" }]
    );
  }

  const bottom = addPlanPrism(group, "open_niche_bottom_panel", innerFootprint, baseY, baseY + t, body, paramKeys);
  tagOpenEndBoard(bottom, "open_niche_bottom_panel", "corpus", [{ edgeId: "front_visible_edge", role: "visible_front", axis: "XZ", materialSlotId: "corpus" }]);
  const top = addPlanPrism(group, "open_niche_top_panel", innerFootprint, baseY + cabinetHeight - t, baseY + cabinetHeight, body, paramKeys);
  tagOpenEndBoard(top, "open_niche_top_panel", "corpus", [{ edgeId: "front_visible_edge", role: "visible_front", axis: "XZ", materialSlotId: "corpus" }]);

  const shelves = Math.max(0, Math.min(16, Math.round(num(params, "shelfCount", 0))));
  const shelfT = num(params, "shelfThickness", t);
  const innerH = Math.max(1, cabinetHeight - 2 * t);
  const availableShelfGapHeight = Math.max(1, innerH - shelves * shelfT);
  const requestedShelfGaps = readShelfGapValues(params, shelves + 1);
  const shelfGaps = requestedShelfGaps.length > 0
    ? Array.from({ length: shelves + 1 }, (_, index) => requestedShelfGaps[index] ?? requestedShelfGaps[requestedShelfGaps.length - 1] ?? (availableShelfGapHeight / (shelves + 1)))
    : Array.from({ length: shelves + 1 }, () => availableShelfGapHeight / (shelves + 1));
  const shelfGapTotal = shelfGaps.reduce((sum, value) => sum + value, 0);
  const shelfGapScale = shelfGapTotal > availableShelfGapHeight ? availableShelfGapHeight / shelfGapTotal : 1;
  let shelfCursorY = baseY + t;
  for (let index = 0; index < shelves; index += 1) {
    shelfCursorY += shelfGaps[index] * shelfGapScale;
    const yMin = shelfCursorY;
    const shelf = addPlanPrism(group, `open_niche_shelf_${index + 1}`, innerFootprint, yMin, yMin + shelfT, shelfMat, ["shelfCount", "shelfGaps", "shelfThickness", "height", "depth"]);
    tagOpenEndBoard(shelf, `open_niche_shelf_${index + 1}`, "corpus", [{ edgeId: "front_visible_edge", role: "visible_shelf_front", axis: "XZ", materialSlotId: "corpus" }]);
    shelfCursorY += shelfT;
  }

  if (plinth > 0) {
    const boardDepth = Math.max(8, Math.min(t, 24));
    let plinthIndex = 1;
    for (const segment of openEndEdgeSegments(footprint)) {
      if (isBackEdge(segment, backZ)) continue;
      const shapedFrontEdge =
        shape !== "straight" &&
        !isOpenFrontEdge(segment, frontZ) &&
        Math.max(segment.start.z, segment.end.z) > frontZ - Math.max(radius, chamfer, 80) + 0.001;
      if (!isOpenFrontEdge(segment, frontZ) && !shapedFrontEdge) continue;
      const mesh = addInsetBoardBetweenPlanPoints(
        group,
        `open_niche_plinth_front_${plinthIndex}`,
        segment.start,
        segment.end,
        plinth / 2,
        plinth,
        boardDepth,
        plinthMat,
        ["plinthHeight", "plinthSetbackMm", "plinthMaterialId", "shape", "endingSide"],
        { x: 0, z: 0 }
      );
      tagOpenEndBoard(mesh, `open_niche_plinth_front_${plinthIndex}`, "plinth");
      plinthIndex += 1;
    }
    addAdjustableLegs(group, params, catalog, { width, depth, plinth, setback: num(params, "plinthSetbackMm", 60), boardDepth, prefix: "open_niche_" });
  }
}

function buildCatalogWallOpenEnd(group: THREE.Group, params: FwmFurnitureParams, catalog: ClientCatalog) {
  const width = num(params, "width", 300);
  const height = num(params, "height", 300);
  const depth = num(params, "depth", 330);
  const t = num(params, "boardThickness", 18);
  const body = makeMaterial(params, catalog, "body");
  const shape = String(params.endingShape ?? params.variant ?? "").includes("rounded") ? "rounded" : "chamfered";
  const side = String(params.side ?? "right") === "left" ? "left" : "right";
  const shapeAmount = shape === "rounded"
    ? num(params, "cornerRadiusMm", 120)
    : num(params, "chamferMm", 120);
  const shelfFootprint = wallOpenEndShelfPath(width, depth, shape, side, shapeAmount, t);
  const panels = wallOpenEndPanelSegments(width, depth, shape, side, shapeAmount);
  const paramKeys = ["width", "height", "depth", "side", "endingShape", "shelfCount", "cornerRadiusMm", "chamferMm", "boardThickness"];

  const rearBoard = addInsetBoardBetweenPlanPoints(
    group,
    "wall_open_end_rear_board",
    { x: -width / 2, z: -depth / 2 },
    { x: width / 2, z: -depth / 2 },
    height / 2,
    height,
    t,
    body,
    paramKeys
  );
  tagVisibleEdges(tagBoardIdentity(rearBoard, "wall_open_end_rear_board", "corpus"), ["rear_top_edge"]);

  const sideRearBoard = addInsetBoardBetweenPlanPoints(
    group,
    "wall_open_end_side_rear_board",
    { ...panels.fixed.start, z: panels.fixed.start.z + t },
    panels.fixed.end,
    height / 2,
    height,
    t,
    body,
    paramKeys
  );
  tagVisibleEdges(tagBoardIdentity(sideRearBoard, "wall_open_end_side_rear_board", "corpus"), ["front_vertical_edge"]);

  const bottom = addPlanPrism(group, "wall_open_end_bottom_shelf", shelfFootprint, 0, t, body, paramKeys);
  tagVisibleEdges(tagBoardIdentity(bottom, "wall_open_end_bottom_shelf", "corpus"), ["front_visible_edge", "ending_visible_edge"]);
  const top = addPlanPrism(group, "wall_open_end_top_shelf", shelfFootprint, height - t, height, body, paramKeys);
  tagVisibleEdges(tagBoardIdentity(top, "wall_open_end_top_shelf", "corpus"), ["front_visible_edge", "ending_visible_edge"]);

  const shelfCount = Math.max(0, Math.min(16, Math.round(num(params, "shelfCount", 2))));
  const availableShelfHeight = Math.max(1, height - 2 * t - shelfCount * t);
  const gap = availableShelfHeight / (shelfCount + 1);
  let cursorY = t;
  for (let index = 0; index < shelfCount; index += 1) {
    cursorY += gap;
    const shelf = addPlanPrism(group, `wall_open_end_shelf_${index + 1}`, shelfFootprint, cursorY, cursorY + t, body, paramKeys);
    tagVisibleEdges(tagBoardIdentity(shelf, `wall_open_end_shelf_${index + 1}`, "corpus"), ["front_visible_edge", "ending_visible_edge"]);
    cursorY += t;
  }

  group.userData.isOpenEnd = true;
  group.userData.endingShape = shape;
  group.userData.endingSide = side;
}

function tagWallCornerBoard(
  mesh: THREE.Mesh,
  boardName: string,
  materialGroup: "corpus" | "front" | "back" | "hardware",
  edgeBanding: Array<Record<string, unknown>> = []
) {
  mesh.userData.boardName = boardName;
  mesh.userData.partName = boardName;
  mesh.userData.materialGroup = materialGroup;
  mesh.userData.materialSlotId = materialGroup;
  mesh.userData.grainAlong = inferGrainAlong(boardName, materialGroup, readMeshDimensionsMm(mesh));
  if (edgeBanding.length > 0) {
    mesh.userData.edgeBandingStrategy = "explicit_visible_edges";
    mesh.userData.edgeBanding = edgeBanding;
  }
}

function wallCornerFootprint(variant: string, width: number, depth: number, chamferMm: number) {
  const size = Math.max(depth, width);
  const half = size / 2;
  const runDepth = Math.max(80, Math.min(depth, size));
  const frontInset = -half + runDepth;
  if (variant === "corner_90" || variant === "corner_90_1p") {
    return {
      points: [
        { x: -half, z: -half },
        { x: half, z: -half },
        { x: half, z: frontInset },
        { x: frontInset, z: frontInset },
        { x: frontInset, z: half },
        { x: -half, z: half }
      ],
      frontSegments: [
        { start: { x: frontInset, z: frontInset }, end: { x: half, z: frontInset }, name: "front_leaf_x" },
        { start: { x: frontInset, z: half }, end: { x: frontInset, z: frontInset }, name: "front_leaf_z" }
      ],
      frontCorpusSegments: [] as Array<{ start: { x: number; z: number }; end: { x: number; z: number }; name: string }>
    };
  }

  const diagonalStart = { x: half, z: frontInset };
  const diagonalEnd = { x: frontInset, z: half };
  return {
    points: [
      { x: -half, z: -half },
      { x: half, z: -half },
      diagonalStart,
      diagonalEnd,
      { x: -half, z: half }
    ],
    frontSegments: [{ start: diagonalStart, end: diagonalEnd, name: "diagonal_front" }],
    frontCorpusSegments: []
  };
}

function insetWallCornerFootprint(points: Array<{ x: number; z: number }>, inset: number) {
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minZ = Math.min(...points.map((point) => point.z));
  const maxZ = Math.max(...points.map((point) => point.z));
  return points.map((point) => {
    const x = point.x <= minX + 0.001 ? point.x + inset : point.x >= maxX - 0.001 ? point.x - inset : point.x;
    const z = point.z <= minZ + 0.001 ? point.z + inset : point.z >= maxZ - 0.001 ? point.z - inset : point.z;
    return { x, z };
  });
}

function wallCornerHorizontalBoardFootprint(points: Array<{ x: number; z: number }>, backThicknessMm: number, sideThicknessMm: number) {
  const minX = Math.min(...points.map((point) => point.x));
  const maxX = Math.max(...points.map((point) => point.x));
  const minZ = Math.min(...points.map((point) => point.z));
  const maxZ = Math.max(...points.map((point) => point.z));
  return points.map((point) => {
    const x = point.x <= minX + 0.001
      ? point.x + backThicknessMm
      : point.x >= maxX - 0.001
        ? point.x - sideThicknessMm
        : point.x;
    const z = point.z <= minZ + 0.001
      ? point.z + backThicknessMm
      : point.z >= maxZ - 0.001
        ? point.z - sideThicknessMm
        : point.z;
    return { x, z };
  });
}

function planLineIntersection(
  a: { x: number; z: number },
  b: { x: number; z: number },
  c: { x: number; z: number },
  d: { x: number; z: number }
) {
  const abx = b.x - a.x;
  const abz = b.z - a.z;
  const cdx = d.x - c.x;
  const cdz = d.z - c.z;
  const denominator = abx * cdz - abz * cdx;
  if (Math.abs(denominator) < 1e-9) return { ...b };
  const t = ((c.x - a.x) * cdz - (c.z - a.z) * cdx) / denominator;
  return { x: a.x + abx * t, z: a.z + abz * t };
}

function attachWallCornerKitchenAnchors(group: THREE.Group, minX: number, maxX: number, minZ: number, maxZ: number) {
  const cornerAnchor = new THREE.Object3D();
  cornerAnchor.name = kitchenCornerAnchorName;
  cornerAnchor.position.set(minX * MM, 0, minZ * MM);
  cornerAnchor.visible = false;
  group.add(cornerAnchor);

  const xAnchor = new THREE.Object3D();
  xAnchor.name = kitchenCornerXAnchorName;
  xAnchor.position.set(maxX * MM, 0, minZ * MM);
  xAnchor.visible = false;
  group.add(xAnchor);

  const zAnchor = new THREE.Object3D();
  zAnchor.name = kitchenCornerZAnchorName;
  zAnchor.position.set(minX * MM, 0, maxZ * MM);
  zAnchor.visible = false;
  group.add(zAnchor);
}

function addWallCornerHandle(
  group: THREE.Group,
  name: string,
  segment: { start: { x: number; z: number }; end: { x: number; z: number } },
  yCenterMm: number,
  material: THREE.Material
) {
  const inset = insetPlanSegmentTowardCenter(segment.start, segment.end, 24);
  const dx = inset.end.x - inset.start.x;
  const dz = inset.end.z - inset.start.z;
  const length = Math.max(1, Math.hypot(dx, dz));
  const center = {
    x: (inset.start.x + inset.end.x) / 2,
    y: yCenterMm,
    z: (inset.start.z + inset.end.z) / 2
  };
  const handle = addBox(group, name, { width: 55, height: 8, depth: 10 }, center, material, ["handleComponentId", "opened"]);
  handle.rotation.y = -Math.atan2(dz, dx);
  tagWallCornerBoard(handle, name, "hardware");
  return handle;
}

function wallCornerDerivedBaseParams(params: FwmFurnitureParams, variant: string): FwmFurnitureParams {
  const upperDepth = num(params, "depth", 330);
  const width = Math.max(upperDepth, num(params, "width", 600));
  const height = num(params, "height", 720);
  const boardThickness = num(params, "boardThickness", 18);
  const next = {
    ...params,
    type: "fwm_catalog_base_corner",
    variant: "corner_chamfered",
    width,
    // The top-corner width is its complete outer L-envelope. Its own depth
    // remains the usable arm depth and is expressed by the front chamfer
    // below; feeding that depth into the lower baked family used to ignore
    // the declared width and produced a 624 mm object for width 600.
    depth: width,
    height,
    heightCarcass: height,
    boardThickness,
    backThickness: boardThickness,
    shelfThickness: boardThickness,
    frontThicknessMm: boardThickness,
    // Wall corners have always exposed width as their outside envelope.
    // Build the inherited baked family under the v2 corner contract so the
    // decorative chamfer cannot add to that declared width.
    geometryContractVersion: 2,
    plinthHeight: 0,
    plinthSetbackMm: 0,
    hasPlinth: false,
    hasWorktop: false,
    requiresWorktop: false,
    kitchenModuleRole: "top"
  } as FwmFurnitureParams;
  const frontChamfer = num(params, "frontChamferMm", num(params, "chamferMm", Math.max(80, width - upperDepth)));
  next.frontChamferMm = frontChamfer;
  next.chamferMm = next.frontChamferMm;
  next.frontChamferReferenceMm = frontChamfer;
  next.backChamferMm = num(params, "backChamferMm", 0);
  return next;
}

function wallCornerObjectText(object: THREE.Object3D) {
  const data = object.userData as Record<string, unknown>;
  return [
    object.name,
    data.boardName,
    data.componentType,
    data.componentId,
    data.catalogComponentId,
    data.materialGroup
  ].filter((value): value is string => typeof value === "string").join(" ").toLowerCase();
}

function isLowerOnlyWallCornerPart(object: THREE.Object3D) {
  const text = wallCornerObjectText(object);
  const materialGroup = canonicalFwmMaterialGroup((object.userData as Record<string, unknown>).materialGroup);
  const componentType = String((object.userData as Record<string, unknown>).componentType ?? "").toLowerCase();
  if (materialGroup === "plinth") return true;
  if (componentType === "leg" || componentType === "plinth_clip") return true;
  return /(^|[_\s-])(leg|kick|plinth)([_\s-]|$)/.test(text) || text.includes("kickclip") || text.includes("plinth_clip");
}

function isOpenWallCornerFrontPart(object: THREE.Object3D) {
  const text = wallCornerObjectText(object);
  const materialGroup = canonicalFwmMaterialGroup((object.userData as Record<string, unknown>).materialGroup);
  const componentType = String((object.userData as Record<string, unknown>).componentType ?? "").toLowerCase();
  if (materialGroup === "front") return true;
  if (componentType === "handle" || componentType === "hinge") return true;
  return text.includes("door") || text.includes("handle") || text.includes("hinge");
}

function removeWallCornerParts(group: THREE.Group, predicate: (object: THREE.Object3D) => boolean) {
  const removals: THREE.Object3D[] = [];
  group.traverse((object) => {
    if (object !== group && predicate(object)) removals.push(object);
  });
  for (const object of removals) {
    object.parent?.remove(object);
  }
}

function rebaseWallCornerVisibleGeometryToFloor(group: THREE.Group) {
  group.updateMatrixWorld(true);
  const bounds = new THREE.Box3();
  let hasMesh = false;
  group.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const meshBounds = new THREE.Box3().setFromObject(object);
    if (meshBounds.isEmpty()) return;
    bounds.union(meshBounds);
    hasMesh = true;
  });
  if (!hasMesh) return;
  const minY = bounds.min.y / MM;
  if (Math.abs(minY) < 0.01) return;
  for (const child of group.children) {
    child.position.y -= minY * MM;
  }
  group.updateMatrixWorld(true);
}

function attachObjectsToWallCornerPivot(group: THREE.Group, pivotName: string, pivotPositionMm: { x: number; z: number }, objects: THREE.Object3D[]) {
  const pivot = new THREE.Group();
  pivot.name = pivotName;
  pivot.position.set(pivotPositionMm.x * MM, 0, pivotPositionMm.z * MM);
  group.add(pivot);
  group.updateMatrixWorld(true);
  for (const object of objects) {
    if (object.parent === pivot) continue;
    pivot.attach(object);
  }
  return pivot;
}

function addWallCornerHardwareBox(
  group: THREE.Group,
  name: string,
  sizeMm: { width: number; height: number; depth: number },
  centerMm: { x: number; y: number; z: number },
  material: THREE.Material,
  component: ComponentDefinition | undefined,
  componentParamKey: "handleComponentId" | "hingeComponentId",
  paramKeys: string[]
) {
  const mesh = addBox(group, name, sizeMm, centerMm, material, paramKeys);
  tagWallCornerBoard(mesh, name, "hardware");
  markComponent(mesh, component, componentParamKey);
  return mesh;
}

function addWallCornerHardwareCylinder(
  group: THREE.Group,
  name: string,
  radiusMm: number,
  lengthMm: number,
  centerMm: { x: number; y: number; z: number },
  material: THREE.Material,
  axis: "x" | "y" | "z",
  component: ComponentDefinition | undefined
) {
  const mesh = addCylinder(group, name, radiusMm, lengthMm, centerMm, material, axis, ["handleComponentId", "opened"]);
  tagWallCornerBoard(mesh, name, "hardware");
  markComponent(mesh, component, "handleComponentId");
  return mesh;
}

function buildCatalogWallCorner90Cabinet(group: THREE.Group, params: FwmFurnitureParams, catalog: ClientCatalog) {
  const legLength = Math.max(260, num(params, "width", 600));
  const cabinetDepth = Math.max(120, Math.min(num(params, "depth", 330), legLength - 80));
  const height = Math.max(120, num(params, "height", 720));
  const t = Math.max(8, num(params, "boardThickness", 18));
  const backT = Math.max(8, num(params, "backThickness", t));
  const frontT = Math.max(8, num(params, "frontThicknessMm", t));
  const shelfT = Math.max(8, num(params, "shelfThickness", t));
  const minX = -legLength / 2;
  const maxX = legLength / 2;
  const minZ = -legLength / 2;
  const maxZ = legLength / 2;
  const frontOuter = minX + cabinetDepth;
  const frontInner = frontOuter - frontT;
  const body = makeMaterial(params, catalog, "body");
  const backMat = makeMaterial(params, catalog, "back");
  const frontMat = makeUniformPreviewMaterial(makeMaterial(params, catalog, "front"));
  const hardware = makeMaterial(params, catalog, "hardware");
  const handleComponent = resolveComponentForParam(params, catalog, "handleComponentId", "handle");
  const hingeComponent = resolveComponentForParam(params, catalog, "hingeComponentId", "hinge");
  const handleGeometry = componentGeometryForComponent(catalog, handleComponent);
  const hingeGeometry = componentGeometryForComponent(catalog, hingeComponent);
  const handleMaterial = makeComponentMaterial(params, catalog, handleComponent, hardware);
  const hingeMaterial = makeComponentMaterial(params, catalog, hingeComponent, hardware);
  const handleDims = handleGeometry?.dimensionsMm;
  const handleProjection = Math.max(4, num(params, "handleProjectionMm", handleDims?.projectionMm ?? handleDims?.depthMm ?? 28));
  const handleLength = Math.max(40, Math.min(num(params, "handleLengthMm", handleDims?.lengthMm ?? 160), height * 0.45));
  const handleRadius = Math.max(2, (handleDims?.diameterMm ?? handleDims?.thicknessMm ?? handleDims?.heightMm ?? 10) / 2);
  const hingeDims = hingeGeometry?.dimensionsMm;
  const hingePlane = Math.max(12, hingeDims?.widthMm ?? 24);
  const hingeHeight = Math.max(12, hingeDims?.heightMm ?? 64);
  const hingeNormal = Math.max(2, Math.min(frontT, hingeDims?.thicknessMm ?? 6));
  const hingeEndOffset = Math.max(34, hingePlane / 2 + 4);
  const footprint = [
    { x: minX, z: minZ },
    { x: maxX, z: minZ },
    { x: maxX, z: frontInner },
    { x: frontInner, z: frontInner },
    { x: frontInner, z: maxZ },
    { x: minX, z: maxZ }
  ];
  const innerShelfFootprint = [
    { x: minX + t, z: minZ + backT },
    { x: maxX - t, z: minZ + backT },
    { x: maxX - t, z: frontInner - t },
    { x: frontInner, z: frontInner - t },
    { x: frontInner, z: maxZ - t },
    { x: minX + backT, z: maxZ - t }
  ];
  const paramKeys = ["width", "height", "depth", "boardThickness", "backThickness", "frontThicknessMm", "opened"];
  const bottom = addPlanPrism(group, "bottom_l", footprint, 0, t, body, paramKeys);
  tagVisibleEdges(tagBoardIdentity(bottom, "bottom_panel", "corpus"), ["front_l_visible_edges"]);
  const top = addPlanPrism(group, "top_l", footprint, height - t, height, body, paramKeys);
  tagVisibleEdges(tagBoardIdentity(top, "top_panel", "corpus"), ["front_l_visible_edges"]);

  const backX = addBox(
    group,
    "back_x",
    { width: legLength - backT, height: Math.max(1, height - 2 * t), depth: backT },
    { x: (minX + backT + maxX) / 2, y: height / 2, z: minZ + backT / 2 },
    backMat,
    paramKeys
  );
  tagWallCornerBoard(backX, "back_x", "back");
  const backZ = addBox(
    group,
    "back_z",
    { width: backT, height: Math.max(1, height - 2 * t), depth: legLength - backT },
    { x: minX + backT / 2, y: height / 2, z: (minZ + backT + maxZ) / 2 },
    backMat,
    paramKeys
  );
  tagWallCornerBoard(backZ, "back_z", "back");

  const verticalPanelHeight = Math.max(1, height - 2 * t);
  const verticalPanelCenterY = t + verticalPanelHeight / 2;
  const sideEndX = addBox(
    group,
    "side_end_x",
    { width: t, height: verticalPanelHeight, depth: Math.max(1, cabinetDepth - backT - frontT) },
    { x: maxX - t / 2, y: verticalPanelCenterY, z: (minZ + backT + frontInner) / 2 },
    body,
    paramKeys
  );
  tagVisibleEdges(tagBoardIdentity(sideEndX, "side_end_x", "corpus"), ["front_vertical_edge"]);
  const sideEndZ = addBox(
    group,
    "side_end_z",
    { width: Math.max(1, cabinetDepth - backT - frontT), height: verticalPanelHeight, depth: t },
    { x: (minX + backT + frontInner) / 2, y: verticalPanelCenterY, z: maxZ - t / 2 },
    body,
    paramKeys
  );
  tagVisibleEdges(tagBoardIdentity(sideEndZ, "side_end_z", "corpus"), ["front_vertical_edge"]);

  const shelfCount = Math.max(0, Math.min(16, Math.round(num(params, "shelfCount", 2))));
  const clearHeight = Math.max(1, height - 2 * t - shelfCount * shelfT);
  const gap = clearHeight / (shelfCount + 1);
  let shelfY = t;
  for (let index = 0; index < shelfCount; index += 1) {
    shelfY += gap;
    const shelf = addPlanPrism(group, `shelf_${index + 1}_l`, innerShelfFootprint, shelfY, shelfY + shelfT, body, ["width", "depth", "height", "shelfCount", "shelfThickness", "shelfGaps"]);
    tagVisibleEdges(tagBoardIdentity(shelf, `shelf_${index + 1}`, "corpus"), ["front_l_visible_edges"]);
    shelfY += shelfT;
  }

  const doorY = height / 2;
  const doorH = height;
  // The upper 90 corner was rebuilt from the approved Revit lower-corner
  // family: the two L-front boards meet at the inner corner and cover the
  // outer side-front edges instead of stopping short by the side thickness.
  const doorXMinZ = frontInner;
  const doorXMaxZ = maxZ;
  const doorXDepth = Math.max(40, doorXMaxZ - doorXMinZ);
  const doorX = addBox(
    group,
    "door_front_x",
    { width: frontT, height: doorH, depth: doorXDepth },
    { x: frontInner + frontT / 2, y: doorY, z: doorXMinZ + doorXDepth / 2 },
    frontMat,
    ["doorCount", "frontThicknessMm", "frontGap", "frontMaterialId", "opened"]
  );
  tagVisibleEdges(tagBoardIdentity(doorX, "door_front_x", "front"), ["visible_door_edges"]);
  const doorZMinX = frontOuter;
  const doorZMaxX = maxX;
  const doorZWidth = Math.max(40, doorZMaxX - doorZMinX);
  const doorZ = addBox(
    group,
    "door_front_z",
    { width: doorZWidth, height: doorH, depth: frontT },
    { x: doorZMinX + doorZWidth / 2, y: doorY, z: frontInner + frontT / 2 },
    frontMat,
    ["doorCount", "frontThicknessMm", "frontGap", "frontMaterialId", "opened"]
  );
  tagVisibleEdges(tagBoardIdentity(doorZ, "door_front_z", "front"), ["visible_door_edges"]);

  addWallCornerHardwareCylinder(
    group,
    "doorHandle_front_x",
    handleRadius,
    handleLength,
    { x: frontOuter + handleProjection * 0.5, y: height - 60, z: doorXMinZ + doorXDepth * 0.5 },
    handleMaterial,
    "z",
    handleComponent
  );
  addWallCornerHardwareCylinder(
    group,
    "doorHandle_front_z",
    handleRadius,
    handleLength,
    { x: doorZMinX + doorZWidth * 0.5, y: height - 60, z: frontOuter + handleProjection * 0.5 },
    handleMaterial,
    "x",
    handleComponent
  );

  const hingeYs = [height * 0.28, height * 0.72];
  for (const [index, hingeY] of hingeYs.entries()) {
    addWallCornerHardwareBox(
      group,
      `hinge_front_x_${index + 1}_door_plate`,
      { width: hingeNormal, height: hingeHeight, depth: hingePlane },
      { x: frontInner - hingeNormal / 2, y: hingeY, z: doorXMaxZ - hingeEndOffset },
      hingeMaterial,
      hingeComponent,
      "hingeComponentId",
      ["hingeComponentId", "opened"]
    );
    addWallCornerHardwareBox(
      group,
      `hinge_front_x_${index + 1}_door_cup`,
      { width: hingeNormal, height: hingeHeight, depth: hingePlane },
      { x: frontInner - hingeNormal * 1.5, y: hingeY, z: doorXMaxZ - hingeEndOffset },
      hingeMaterial,
      hingeComponent,
      "hingeComponentId",
      ["hingeComponentId", "opened"]
    );
    addWallCornerHardwareBox(
      group,
      `hinge_front_z_${index + 1}_door_plate`,
      { width: hingePlane, height: hingeHeight, depth: hingeNormal },
      { x: doorZMaxX - hingeEndOffset, y: hingeY, z: frontInner - hingeNormal / 2 },
      hingeMaterial,
      hingeComponent,
      "hingeComponentId",
      ["hingeComponentId", "opened"]
    );
    addWallCornerHardwareBox(
      group,
      `hinge_front_z_${index + 1}_door_cup`,
      { width: hingePlane, height: hingeHeight, depth: hingeNormal },
      { x: doorZMaxX - hingeEndOffset, y: hingeY, z: frontInner - hingeNormal * 1.5 },
      hingeMaterial,
      hingeComponent,
      "hingeComponentId",
      ["hingeComponentId", "opened"]
    );
  }

  if (bool(params, "opened", false)) {
    const hingeCount = hingeYs.length;
    const xPivot = attachObjectsToWallCornerPivot(
      group,
      "__wall_corner_90_door_pivot_x",
      { x: frontInner + frontT / 2, z: doorXMaxZ },
      [
        doorX,
        group.getObjectByName("doorHandle_front_x"),
        ...Array.from({ length: hingeCount }, (_, index) => [
          group.getObjectByName(`hinge_front_x_${index + 1}_door_plate`),
          group.getObjectByName(`hinge_front_x_${index + 1}_door_cup`)
        ]).flat()
      ].filter((object): object is THREE.Object3D => Boolean(object))
    );
    xPivot.rotation.y = -Math.PI / 2;
    const zPivot = attachObjectsToWallCornerPivot(
      group,
      "__wall_corner_90_door_pivot_z",
      { x: doorZMaxX, z: frontInner + frontT / 2 },
      [
        doorZ,
        group.getObjectByName("doorHandle_front_z"),
        ...Array.from({ length: hingeCount }, (_, index) => [
          group.getObjectByName(`hinge_front_z_${index + 1}_door_plate`),
          group.getObjectByName(`hinge_front_z_${index + 1}_door_cup`)
        ]).flat()
      ].filter((object): object is THREE.Object3D => Boolean(object))
    );
    zPivot.rotation.y = Math.PI / 2;
  }

  attachWallCornerKitchenAnchors(group, minX, maxX, minZ, maxZ);
  // Historical 90-degree packages may carry a front board positioned a few
  // millimetres past the declared corner planes. Keep every board inside the
  // same physical envelope as its width anchors.
  trimChamferedBoardsToKitchenAnchors(group);
  group.userData.catalogWallCornerVariant = String(params.variant ?? "corner_90");
  group.userData.cornerShape = "l_shape";
  group.userData.sourceModuleType = "fwm_catalog_wall_cabinet";
  group.userData.wallCornerIndependentGeometry = true;
}

function openWallCornerChamferedDoor(group: THREE.Group) {
  const door = findGroundTruthMeshByBoardName(group, "diagonal_front");
  if (!door) return;
  const related = [
    door,
    findGroundTruthMeshByBoardName(group, "diagonal_handle"),
    findGroundTruthMeshByBoardName(group, "hinge_lower"),
    findGroundTruthMeshByBoardName(group, "hinge_upper")
  ].filter((object): object is THREE.Mesh => object !== null);
  door.updateMatrixWorld(true);
  const doorBounds = new THREE.Box3().setFromObject(door);
  const pivot = attachObjectsToWallCornerPivot(
    group,
    "__wall_corner_chamfered_door_pivot",
    { x: doorBounds.max.x / MM, z: doorBounds.max.z / MM },
    related
  );
  pivot.rotation.y = -Math.PI * 0.55;
}

function buildCatalogWallCornerCabinet(group: THREE.Group, params: FwmFurnitureParams, catalog: ClientCatalog) {
  const variant = String(params.variant ?? "corner_chamfered");
  const openNiche = variant === "corner_open_chamfered" || variant === "open_niche";
  if (variant === "corner_90" || variant === "corner_90_1p") {
    buildCatalogWallCorner90Cabinet(group, params, catalog);
    return;
  }
  const baseParams = wallCornerDerivedBaseParams(params, variant);
  group.userData.groundTruthBuildParams = baseParams;
  buildCatalogBaseCornerChamferedGroundTruth(group, catalog);
  removeWallCornerParts(group, isLowerOnlyWallCornerPart);
  if (openNiche) removeWallCornerParts(group, isOpenWallCornerFrontPart);
  rebaseWallCornerVisibleGeometryToFloor(group);
  trimChamferedBoardsToKitchenAnchors(group);
  if (!openNiche && bool(params, "opened", false)) openWallCornerChamferedDoor(group);
  group.userData.catalogWallCornerVariant = variant;
  group.userData.cornerShape = variant.includes("90") ? "l_shape" : "chamfered";
  group.userData.sourceModuleType = "fwm_catalog_wall_cabinet";
  group.userData.wallCornerIndependentGeometry = true;
}

function buildCatalogBaseCorner1D(group: THREE.Group, params: FwmFurnitureParams, catalog: ClientCatalog) {
  const width = num(params, "width", 900);
  const height = num(params, "height", 722);
  const depth = num(params, "depth", 782);
  const t = num(params, "boardThickness", 18);
  const back = num(params, "backThickness", 8);
  const plinth = num(params, "plinthHeight", 100);
  const shelfT = num(params, "shelfThickness", t);
  const frontT = num(params, "frontThicknessMm", 18);
  const plinthSetback = num(params, "plinthSetbackMm", 50);
  const body = makeMaterial(params, catalog, "body");
  const backMat = makeMaterial(params, catalog, "back");
  const shelfMat = makeMaterial(params, catalog, "shelf");
  const frontMat = makeMaterial(params, catalog, "front");
  const plinthMat = makeMaterial(params, catalog, "plinth");
  const hardware = makeMaterial(params, catalog, "hardware");
  const handleComponent = resolveComponentForParam(params, catalog, "handleComponentId", "handle");
  const hingeComponent = resolveComponentForParam(params, catalog, "hingeComponentId", "hinge");
  const legComponent = resolveComponentForParam(params, catalog, "legComponentId", "leg");
  const clipComponent = resolveComponentForParam(params, catalog, "clipComponentId", "plinth_clip");
  const handleMaterial = makeComponentMaterial(params, catalog, handleComponent, hardware);
  const hingeMaterial = makeComponentMaterial(params, catalog, hingeComponent, hardware);
  const legMaterial = makeComponentMaterial(params, catalog, legComponent, hardware);
  const clipMaterial = makeComponentMaterial(params, catalog, clipComponent, hardware);

  const source = { width: 1000.077, height: 722, depth: 782, plinth: 100 };
  const sourcePlinthSetback = 50;
  const plinthSetbackDelta = plinthSetback - sourcePlinthSetback;
  const side = String(params.side ?? "left") === "right" ? "right" : "left";
  const isLeftHand = side === "left";
  const mirrorAxisX = (-50.038 / source.width) * width;
  const handedX = (x: number) => isLeftHand ? mirrorAxisX * 2 - x : x;
  const materialByRole: Record<"body" | "back" | "shelf" | "front" | "plinth", THREE.Material> = {
    body,
    back: backMat,
    shelf: shelfMat,
    front: frontMat,
    plinth: plinthMat
  };

  type GroundTruthPart = {
    name: string;
    role: "body" | "back" | "shelf" | "front" | "plinth";
    size: { width: number; height: number; depth: number };
    center: { x: number; y: number; z: number };
    paramKeys: string[];
  };

  const parts: GroundTruthPart[] = [
    { name: "corner_left_side", role: "body", size: { width: 18, height: 622, depth: 694 }, center: { x: -491.038, y: 411, z: -44 }, paramKeys: ["width", "height", "depth", "boardThickness"] },
    { name: "corner_right_side", role: "body", size: { width: 18, height: 622, depth: 694 }, center: { x: 390.962, y: 411, z: -44 }, paramKeys: ["width", "height", "depth", "boardThickness"] },
    { name: "corner_back_panel", role: "back", size: { width: 864, height: 586, depth: 8 }, center: { x: -50.038, y: 411, z: -369 }, paramKeys: ["width", "height", "depth", "backThickness", "boardThickness"] },
    { name: "corner_bottom_panel", role: "body", size: { width: 864, height: 18, depth: 694 }, center: { x: -50.038, y: 109, z: -44 }, paramKeys: ["width", "depth", "boardThickness"] },
    { name: "corner_top_back_rail", role: "body", size: { width: 864, height: 18, depth: 70 }, center: { x: -50.038, y: 713, z: -356 }, paramKeys: ["width", "height", "depth", "boardThickness"] },
    { name: "corner_blind_divider", role: "front", size: { width: 18, height: 618, depth: 70 }, center: { x: -39.038, y: 411, z: 356 }, paramKeys: ["width", "height", "frontThicknessMm"] },
    { name: "corner_plinth_front_board", role: "plinth", size: { width: 468, height: 100, depth: 18 }, center: { x: -264.038, y: 50, z: 312 }, paramKeys: ["plinthHeight", "plinthSetbackMm", "plinthMaterialId", "width", "depth"] },
    { name: "corner_blind_front_filler", role: "front", size: { width: 340, height: 618, depth: 18 }, center: { x: -328.038, y: 411, z: 312 }, paramKeys: ["width", "height", "frontThicknessMm", "frontMaterialId"] },
    { name: "corner_right_door", role: "front", size: { width: 656.077, height: 618, depth: 18 }, center: { x: 172, y: 411, z: 312 }, paramKeys: ["width", "height", "doorCount", "frontThicknessMm", "frontMaterialId", "opened"] },
    { name: "corner_front_top_rail", role: "body", size: { width: 864, height: 18, depth: 70 }, center: { x: -50.038, y: 713, z: 268 }, paramKeys: ["width", "height", "depth", "boardThickness"] }
  ];

  for (const part of parts) {
    const size = scaleGroundTruthSize(part.size, part.role, { width, height, depth, plinth, t, back, shelfT, frontT }, source);
    const center = scaleGroundTruthCenter(part.center, source, { width, height, depth, plinth });
    center.x = handedX(center.x);
    if (part.role === "front") {
      size.height = Math.max(1, height - plinth);
      center.y = plinth + size.height / 2;
    }
    if (part.name === "corner_plinth_front_board") center.z -= plinthSetbackDelta;
    const mesh = addBox(group, part.name, size, center, materialByRole[part.role], part.paramKeys);
    mesh.userData.materialGroup = part.role;
  }

  const shelfCount = Math.max(0, Math.min(16, Math.round(num(params, "shelfCount", 1))));
  const shelfSize = scaleGroundTruthSize(
    { width: 862, height: 18, depth: 686 },
    "shelf",
    { width, height, depth, plinth, t, back, shelfT, frontT },
    source
  );
  const shelfSourceBottomY = 109 + 18;
  const shelfSourceTopY = 713 - 18;
  const shelfBottomY = scaleGroundTruthY(shelfSourceBottomY, source, { height, plinth });
  const shelfTopY = scaleGroundTruthY(shelfSourceTopY, source, { height, plinth });
  const shelfX = handedX((-51.038 / source.width) * width);
  const shelfZ = (-40 / source.depth) * depth;
  for (let index = 0; index < shelfCount; index += 1) {
    const ratio = (index + 1) / (shelfCount + 1);
    const y = shelfBottomY + (shelfTopY - shelfBottomY) * ratio;
    const mesh = addBox(
      group,
      `corner_right_shelf_${index + 1}`,
      shelfSize,
      { x: shelfX, y, z: shelfZ },
      shelfMat,
      ["shelfCount", "shelfThickness", "height", "shelfMaterialId", "width", "depth"]
    );
    mesh.userData.materialGroup = "shelf";
  }

  const handleTargetMesh = group.getObjectByName("corner_blind_front_filler") as THREE.Mesh | null;
  if (handleTargetMesh instanceof THREE.Mesh) {
    const doorBounds = readObjectBoundsMm(handleTargetMesh);
    const handleProjection = num(params, "handleProjectionMm", 28);
    const handleLength = Math.min(num(params, "handleLengthMm", 160), Math.max(40, doorBounds.height * 0.45));
    const handle = addCylinder(
      group,
      "corner_right_door_handle",
      5,
      handleLength,
      {
        x: isLeftHand ? doorBounds.maxX - 45 : doorBounds.minX + 45,
        y: doorBounds.minY + doorBounds.height * 0.58,
        z: doorBounds.maxZ + handleProjection * 0.5
      },
      handleMaterial,
      "y",
      ["handleComponentId", "handleLengthMm", "handleProjectionMm", "width", "height", "depth", "opened"]
    );
    handle.userData.componentType = "handle";
    handle.userData.attachedBoardName = "corner_blind_front_filler";
    markComponent(handle, handleComponent, "handleComponentId");
  }

  const legCenters = [
    { name: "corner_leg_front_left", x: -405.038, y: 50, z: 273, plinthClipIndex: 1 },
    { name: "corner_leg_front_middle", x: -41.038, y: 50, z: 273, plinthClipIndex: 2 },
    { name: "corner_leg_front_right", x: 304.962, y: 50, z: 231 },
    { name: "corner_leg_rear_left", x: -405.038, y: 50, z: -291 },
    { name: "corner_leg_rear_right", x: 304.962, y: 50, z: -291 }
  ];
  if (plinth > 0) {
    for (const leg of legCenters) {
      const center = scaleGroundTruthCenter(leg, source, { width, height, depth, plinth });
      center.x = handedX(center.x);
      center.z += leg.name.includes("_rear_") ? plinthSetbackDelta : -plinthSetbackDelta;
      const mesh = addCornerStyleLeg(group, leg.name, plinth, center, legMaterial, ["legComponentId", "plinthHeight", "plinthSetbackMm", "width", "depth"]);
      markComponent(mesh, legComponent, "legComponentId");
      if (leg.plinthClipIndex) {
        addCornerStylePlinthClipSet(group, "corner_", leg.plinthClipIndex, { x: center.x, z: center.z }, clipMaterial, clipComponent);
      }
    }
  }

  for (const [index, sourceCenter] of [
    { x: -131.618, y: 652.4, z: 302 },
    { x: -131.618, y: 157.4, z: 302 }
  ].entries()) {
    const center = scaleGroundTruthCenter(sourceCenter, source, { width, height, depth, plinth });
    center.x = handedX(center.x);
    const hinge = addBox(
      group,
      `corner_hinge_${index + 1}`,
      { width: 25, height: 25, depth: 2 },
      center,
      hingeMaterial,
      ["hingeComponentId", "width", "height", "depth"]
    );
    hinge.userData.materialGroup = "hardware";
    hinge.userData.componentType = "hinge";
    markComponent(hinge, hingeComponent, "hingeComponentId");
  }

  if (params.opened === true) openCatalogBaseCorner1DDoor(group, side);
}

function openCatalogBaseCorner1DDoor(group: THREE.Group, side: "left" | "right") {
  const door = group.getObjectByName("corner_blind_front_filler");
  if (!door) return;
  const bounds = readObjectBoundsMm(door);
  const pivot = new THREE.Group();
  pivot.name = "__corner_1d_door_pivot";
  pivot.position.set((side === "left" ? bounds.minX : bounds.maxX) * MM, 0, ((bounds.minZ + bounds.maxZ) * 0.5) * MM);
  group.add(pivot);
  group.updateMatrixWorld(true);

  for (const name of ["corner_blind_front_filler", "corner_right_door_handle", "corner_hinge_1", "corner_hinge_2"]) {
    const object = group.getObjectByName(name);
    if (object && object.parent !== pivot) pivot.attach(object);
  }

  pivot.rotation.y = (side === "left" ? -1 : 1) * Math.PI * 0.38;
}

function readGroundTruthString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function readGroundTruthColorHex(value: unknown): string | null {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : null;
}

function readGroundTruthVectorMm(value: unknown): THREE.Vector3 | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const vector = value as Record<string, unknown>;
  const x = vector.x;
  const y = vector.y;
  const z = vector.z;
  if (
    typeof x !== "number" || !Number.isFinite(x) ||
    typeof y !== "number" || !Number.isFinite(y) ||
    typeof z !== "number" || !Number.isFinite(z)
  ) {
    return null;
  }
  return new THREE.Vector3(x, y, z);
}

type ChamferedGroundTruthParametricContext = {
  geometryContractVersion: 1 | 2 | 3;
  width: number;
  depth: number;
  height: number;
  boardThickness: number;
  frontChamferMm: number;
  frontChamferReferenceMm: number;
  backChamferMm: number;
  plinthHeight: number;
  plinthSetbackMm: number;
};

const TOP_PANEL_OUTER_FOOTPRINT_OFFSETS = [
  { x: 33.3, z: 0, dx: -18, dz: -18 },
  { x: 733.3, z: 0, dx: -18, dz: -18 },
  { x: 933.3, z: 200, dx: 18, dz: 18 },
  { x: 933.3, z: 900, dx: 18, dz: 18 },
  { x: 453.3, z: 900, dx: 18, dz: 18 },
  { x: 33.3, z: 480, dx: -18, dz: -18 }
] as const;

function createChamferedGroundTruthParametricContext(params: FwmFurnitureParams): ChamferedGroundTruthParametricContext {
  const depth = Math.max(100, num(params, "depth", BASE_CORNER_CHAMFERED_SOURCE.depth));
  const width = depth;
  const height = Math.max(50, num(params, "height", BASE_CORNER_CHAMFERED_SOURCE.yMax));
  const boardThickness = Math.max(1, num(params, "boardThickness", 18));
  const frontFallback = num(params, "chamferMm", BASE_CORNER_CHAMFERED_SOURCE.chamferMm);
  const requestedFrontChamfer = num(params, "frontChamferMm", frontFallback);
  const requestedContractVersion = num(params, "geometryContractVersion", 1);
  const geometryContractVersion: 1 | 2 | 3 = requestedContractVersion >= 3
    ? 3
    : requestedContractVersion >= 2
      ? 2
      : 1;
  // V2 defines depth as the complete outside wall leg.  The old reference
  // field remains readable only for package snapshots authored before this
  // contract; new modules use the actual cut to divide the fixed envelope.
  const requestedFrontChamferReference = geometryContractVersion >= 2
    ? requestedFrontChamfer
    : num(params, "frontChamferReferenceMm", 200);
  const requestedBackChamfer = num(params, "backChamferMm", 0);
  const frontChamferMm = Math.min(
    Math.max(requestedFrontChamfer, 1),
    Math.max(1, Math.min(width, depth) - 72)
  );
  const frontChamferReferenceMm = Math.min(
    Math.max(requestedFrontChamferReference, 1),
    Math.max(1, Math.min(width, depth) - 72)
  );
  const backChamferMm = Math.min(
    Math.max(0, requestedBackChamfer),
    Math.max(0, Math.min(width, depth) - 72)
  );
  const plinthHeight = Math.max(0, Math.min(height - 1, num(params, "plinthHeight", BASE_CORNER_CHAMFERED_SOURCE.plinthTop)));
  const plinthSetbackMm = Math.max(0, num(params, "plinthSetbackMm", BASE_CORNER_CHAMFERED_SOURCE.plinthSetbackMm));
  return { geometryContractVersion, width, depth, height, boardThickness, frontChamferMm, frontChamferReferenceMm, backChamferMm, plinthHeight, plinthSetbackMm };
}

function chamferedReferenceTotalSpan(context: ChamferedGroundTruthParametricContext) {
  if (context.geometryContractVersion === 3) {
    return Math.max(1, context.depth + context.frontChamferReferenceMm);
  }
  if (context.geometryContractVersion === 2) return Math.max(1, context.depth);
  return Math.abs(context.frontChamferReferenceMm - BASE_CORNER_CHAMFERED_SOURCE.chamferMm) > 0.001
    ? Math.max(1, context.depth + context.frontChamferReferenceMm)
    : Math.max(1, context.depth);
}

function chamferedReferenceStraightSpan(context: ChamferedGroundTruthParametricContext) {
  return Math.max(1, chamferedReferenceTotalSpan(context) - context.frontChamferReferenceMm);
}

function mapChamferedGroundTruthAxis(value: number, sourceMin: number, sourceMax: number, targetSpan: number) {
  const sourceSpan = Math.max(1, sourceMax - sourceMin);
  if (value <= sourceMin) return sourceMin + (value - sourceMin);
  if (value >= sourceMax) return sourceMin + targetSpan + (value - sourceMax);
  return sourceMin + ((value - sourceMin) / sourceSpan) * targetSpan;
}

function mapChamferedGroundTruthX(value: number, context: ChamferedGroundTruthParametricContext) {
  const sourceMin = BASE_CORNER_CHAMFERED_SOURCE.xMin;
  const sourceMax = BASE_CORNER_CHAMFERED_SOURCE.xMax;
  const sourceCut = sourceMin + BASE_CORNER_CHAMFERED_SOURCE.chamferMm;
  const targetCut = sourceMin + context.frontChamferReferenceMm;
  const targetMax = targetCut + chamferedReferenceStraightSpan(context);
  if (value <= sourceMin) return sourceMin + (value - sourceMin);
  if (value >= sourceMax) return targetMax + (value - sourceMax);
  if (value <= sourceCut) {
    return sourceMin + ((value - sourceMin) / Math.max(1, sourceCut - sourceMin)) * context.frontChamferReferenceMm;
  }
  return targetCut + ((value - sourceCut) / Math.max(1, sourceMax - sourceCut)) * chamferedReferenceStraightSpan(context);
}

function mapChamferedGroundTruthZ(value: number, context: ChamferedGroundTruthParametricContext) {
  const sourceMin = BASE_CORNER_CHAMFERED_SOURCE.zMin;
  const sourceMax = BASE_CORNER_CHAMFERED_SOURCE.zMax;
  const sourceCut = sourceMax - BASE_CORNER_CHAMFERED_SOURCE.chamferMm;
  const targetCut = sourceMin + chamferedReferenceStraightSpan(context);
  const targetMax = targetCut + context.frontChamferReferenceMm;
  if (value <= sourceMin) return sourceMin + (value - sourceMin);
  if (value >= sourceMax) return targetMax + (value - sourceMax);
  if (value <= sourceCut) {
    return sourceMin + ((value - sourceMin) / Math.max(1, sourceCut - sourceMin)) * chamferedReferenceStraightSpan(context);
  }
  return targetCut + ((value - sourceCut) / Math.max(1, sourceMax - sourceCut)) * context.frontChamferReferenceMm;
}

function mapChamferedGroundTruthY(value: number, context: ChamferedGroundTruthParametricContext) {
  if (value <= BASE_CORNER_CHAMFERED_SOURCE.plinthTop) {
    return (value / BASE_CORNER_CHAMFERED_SOURCE.plinthTop) * context.plinthHeight;
  }
  const sourceBody = Math.max(1, BASE_CORNER_CHAMFERED_SOURCE.yMax - BASE_CORNER_CHAMFERED_SOURCE.plinthTop);
  const targetBody = Math.max(1, context.height - context.plinthHeight);
  return context.plinthHeight + ((value - BASE_CORNER_CHAMFERED_SOURCE.plinthTop) / sourceBody) * targetBody;
}

function resolveChamferedCornerJoinProfile(context: ChamferedGroundTruthParametricContext) {
  const frontDelta = context.frontChamferMm - context.frontChamferReferenceMm;
  const seamX = mapChamferedGroundTruthX(BASE_CORNER_CHAMFERED_SOURCE.xMin, context);
  const seamZ = mapChamferedGroundTruthZ(BASE_CORNER_CHAMFERED_FRONT_DIAGONAL_SOURCE.maxZ, context) + frontDelta;
  const cornerX = mapChamferedGroundTruthX(951.3, context) + frontDelta;
  const cornerZ = mapChamferedGroundTruthZ(BASE_CORNER_CHAMFERED_SOURCE.zMin, context);
  const leftStraightFrontZ = mapChamferedGroundTruthZ(
    BASE_CORNER_CHAMFERED_SOURCE.zMax - BASE_CORNER_CHAMFERED_SOURCE.chamferMm,
    context
  );
  const rightStraightFrontX = mapChamferedGroundTruthX(
    BASE_CORNER_CHAMFERED_SOURCE.xMin + BASE_CORNER_CHAMFERED_SOURCE.chamferMm,
    context
  ) + 18 + frontDelta;
  const diagonalBoardCoordinateThickness = context.boardThickness * Math.SQRT2;
  const plinthOuterLeft = new THREE.Vector3(
    seamX,
    0,
    leftStraightFrontZ - context.plinthSetbackMm
  );
  const plinthOuterRight = new THREE.Vector3(
    rightStraightFrontX + context.plinthSetbackMm,
    0,
    seamZ
  );
  return {
    corner: new THREE.Vector3(cornerX, 0, cornerZ),
    xJoin: new THREE.Vector3(seamX, 0, cornerZ),
    zJoin: new THREE.Vector3(cornerX, 0, seamZ),
    plinthOuterLeft,
    plinthOuterRight,
    plinthInnerLeft: new THREE.Vector3(
      plinthOuterLeft.x,
      0,
      plinthOuterLeft.z - diagonalBoardCoordinateThickness
    ),
    plinthInnerRight: new THREE.Vector3(
      plinthOuterRight.x + diagonalBoardCoordinateThickness,
      0,
      plinthOuterRight.z
    )
  };
}

function mapChamferedDiagonalPlinthVertexMm(
  sourceVector: THREE.Vector3,
  context: ChamferedGroundTruthParametricContext
) {
  const profile = resolveChamferedCornerJoinProfile(context);
  const atRightEnd = Math.abs(sourceVector.z - BASE_CORNER_CHAMFERED_DIAGONAL_PLINTH_SOURCE.maxZ) < 0.5;
  if (atRightEnd) {
    const sourceOuterX = 571.3;
    const sourceInnerX = BASE_CORNER_CHAMFERED_DIAGONAL_PLINTH_SOURCE.maxX;
    const ratio = Math.max(0, Math.min(1, (sourceVector.x - sourceOuterX) / Math.max(1, sourceInnerX - sourceOuterX)));
    return profile.plinthOuterRight.clone().lerp(profile.plinthInnerRight, ratio).setY(
      mapChamferedGroundTruthY(sourceVector.y, context)
    );
  }

  const sourceInnerZ = BASE_CORNER_CHAMFERED_DIAGONAL_PLINTH_SOURCE.minZ;
  const sourceOuterZ = 362;
  const ratio = Math.max(0, Math.min(1, (sourceVector.z - sourceInnerZ) / Math.max(1, sourceOuterZ - sourceInnerZ)));
  return profile.plinthInnerLeft.clone().lerp(profile.plinthOuterLeft, ratio).setY(
    mapChamferedGroundTruthY(sourceVector.y, context)
  );
}

function groundTruthPrimitiveSourceBoundsMm(primitive: ModuleGeometryPrimitive) {
  const vertices = Array.isArray(primitive.params.verticesMm) ? primitive.params.verticesMm : [];
  const xs: number[] = [];
  const zs: number[] = [];
  for (const vertex of vertices) {
    const vector = readGroundTruthVectorMm(vertex);
    if (!vector) continue;
    xs.push(vector.x);
    zs.push(vector.z);
  }
  if (xs.length === 0 || zs.length === 0) return null;
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minZ: Math.min(...zs),
    maxZ: Math.max(...zs)
  };
}

function applyFrontChamferedHardwareCoordinateOffset(
  vector: THREE.Vector3,
  primitive: ModuleGeometryPrimitive,
  context: ChamferedGroundTruthParametricContext
) {
  if (readGroundTruthString(primitive.params.materialGroup) !== "hardware") return null;
  const boardName = readGroundTruthString(primitive.params.boardName) ?? "";
  if (!/(leg_back_right|leg_front_right|leg_diagonal|diagonal_handle|hinge)/i.test(boardName)) return vector;

  const delta = context.frontChamferMm - context.frontChamferReferenceMm;
  if (Math.abs(delta) < 0.001 && !/leg_diagonal/i.test(boardName)) return vector;

  if (boardName === "leg_back_right") {
    return new THREE.Vector3(vector.x + delta, vector.y, vector.z);
  }
  if (boardName === "leg_front_right") {
    return new THREE.Vector3(vector.x + delta, vector.y, vector.z + delta);
  }

  const bounds = groundTruthPrimitiveSourceBoundsMm(primitive);
  if (!bounds) return vector;

  const sourceCenterX = (bounds.minX + bounds.maxX) / 2;
  const sourceCenterZ = (bounds.minZ + bounds.maxZ) / 2;
  const mappedCenterX = mapChamferedGroundTruthX(sourceCenterX, context);
  const mappedCenterZ = mapChamferedGroundTruthZ(sourceCenterZ, context);
  const anchorX = mapChamferedGroundTruthX(BASE_CORNER_CHAMFERED_FRONT_DIAGONAL_SOURCE.minX, context);
  const anchorZ = mapChamferedGroundTruthZ(BASE_CORNER_CHAMFERED_FRONT_DIAGONAL_SOURCE.minZ, context);
  const mappedSpanX = mapChamferedGroundTruthX(BASE_CORNER_CHAMFERED_FRONT_DIAGONAL_SOURCE.maxX, context) - anchorX;
  const mappedSpanZ = mapChamferedGroundTruthZ(BASE_CORNER_CHAMFERED_FRONT_DIAGONAL_SOURCE.maxZ, context) - anchorZ;
  const targetSpanX = Math.max(1, mappedSpanX + delta);
  const targetSpanZ = Math.max(1, mappedSpanZ + delta);
  let targetCenterX = anchorX + (mappedCenterX - anchorX) * (targetSpanX / Math.max(1, mappedSpanX));
  let targetCenterZ = anchorZ + (mappedCenterZ - anchorZ) * (targetSpanZ / Math.max(1, mappedSpanZ));
  if (/leg_diagonal/i.test(boardName)) {
    const alongDiagonal = targetCenterX + targetCenterZ;
    const plinthProfile = resolveChamferedCornerJoinProfile(context);
    const plinthFrontLine = plinthProfile.plinthOuterLeft.z - plinthProfile.plinthOuterLeft.x;
    const legBehindPlinthMm = 55;
    const targetOffsetBehindPlinth = plinthFrontLine - legBehindPlinthMm;
    targetCenterX = (alongDiagonal - targetOffsetBehindPlinth) / 2;
    targetCenterZ = (alongDiagonal + targetOffsetBehindPlinth) / 2;
  }

  return new THREE.Vector3(
    vector.x + (targetCenterX - mappedCenterX),
    vector.y,
    vector.z + (targetCenterZ - mappedCenterZ)
  );
}

function applyChamferedCutCoordinateOffset(
  vector: THREE.Vector3,
  sourceVector: THREE.Vector3,
  primitive: ModuleGeometryPrimitive,
  context: ChamferedGroundTruthParametricContext
) {
  const materialGroup = readGroundTruthString(primitive.params.materialGroup);
  if (materialGroup === "hardware") {
    const hardware = applyFrontChamferedHardwareCoordinateOffset(vector, primitive, context);
    return hardware ?? vector;
  }

  const delta = context.frontChamferMm - context.frontChamferReferenceMm;
  if (Math.abs(delta) < 0.001) return vector;

  const sourceCutX = BASE_CORNER_CHAMFERED_SOURCE.xMin + BASE_CORNER_CHAMFERED_SOURCE.chamferMm;
  const sourceCutZ = BASE_CORNER_CHAMFERED_SOURCE.zMax - BASE_CORNER_CHAMFERED_SOURCE.chamferMm;
  const tolerance = 40;
  const frontZThreshold = sourceCutZ + tolerance;
  const shiftX = sourceVector.x >= sourceCutX - tolerance ? delta : 0;
  const shiftZ = sourceVector.z >= frontZThreshold ? delta : 0;
  if (Math.abs(shiftX) < 0.001 && Math.abs(shiftZ) < 0.001) return vector;

  return new THREE.Vector3(
    vector.x + shiftX,
    vector.y,
    vector.z + shiftZ
  );
}

function applyBackChamferedCutCoordinateOffset(
  vector: THREE.Vector3,
  sourceVector: THREE.Vector3,
  primitive: ModuleGeometryPrimitive,
  context: ChamferedGroundTruthParametricContext
) {
  const materialGroup = readGroundTruthString(primitive.params.materialGroup);
  if (materialGroup === "hardware") return vector;

  const sourceBackCutX = BASE_CORNER_CHAMFERED_SOURCE.xMax - BASE_CORNER_CHAMFERED_SOURCE.backChamferMm;
  const sourceBackCutZ = BASE_CORNER_CHAMFERED_SOURCE.zMin + BASE_CORNER_CHAMFERED_SOURCE.backChamferMm;
  const tolerance = 40;
  const boardName = readGroundTruthString(primitive.params.boardName) ?? "";
  const frontDelta = context.frontChamferMm - context.frontChamferReferenceMm;
  const targetBackRightInnerX = mapChamferedGroundTruthX(BASE_CORNER_CHAMFERED_SOURCE.xMax, context) + frontDelta;
  const targetBackInnerZ = mapChamferedGroundTruthZ(BASE_CORNER_CHAMFERED_SOURCE.zMin, context);
  const targetBackCutX = targetBackRightInnerX - context.backChamferMm;
  const targetBackCutZ = targetBackInnerZ + context.backChamferMm;

  const closesBackLeftEdge =
    /^(back_left_panel|back_corner_panel|top_panel|bottom_panel)$/i.test(boardName) &&
    sourceVector.x >= sourceBackCutX - tolerance &&
    sourceVector.x <= sourceBackCutX + tolerance &&
    sourceVector.z <= sourceBackCutZ + tolerance;
  const closesRightBackEdge =
    /^(right_side_panel|back_corner_panel|top_panel|bottom_panel)$/i.test(boardName) &&
    sourceVector.x >= sourceBackCutX + tolerance &&
    sourceVector.z >= sourceBackCutZ - tolerance &&
    sourceVector.z <= sourceBackCutZ + tolerance;

  if (!closesBackLeftEdge && !closesRightBackEdge) return vector;

  const adjusted = vector.clone();
  if (closesBackLeftEdge) adjusted.x = targetBackCutX + (sourceVector.x - sourceBackCutX);
  if (closesRightBackEdge) adjusted.z = targetBackCutZ + (sourceVector.z - sourceBackCutZ);
  return adjusted;
}

function trimChamferedStraightPanelMeasurementOverlap(
  vector: THREE.Vector3,
  sourceVector: THREE.Vector3,
  primitive: ModuleGeometryPrimitive
) {
  const boardName = readGroundTruthString(primitive.params.boardName) ?? "";
  if (
    boardName === "diagonal_front" &&
    (
      sourceVector.x <= BASE_CORNER_CHAMFERED_FRONT_DIAGONAL_SOURCE.minX + 0.5 ||
      sourceVector.z <= BASE_CORNER_CHAMFERED_FRONT_DIAGONAL_SOURCE.minZ + 0.5
    )
  ) {
    return new THREE.Vector3(vector.x + 18, vector.y, vector.z + 18);
  }
  const sourceFrontCutX = BASE_CORNER_CHAMFERED_SOURCE.xMin + BASE_CORNER_CHAMFERED_SOURCE.chamferMm;
  if (boardName === "front_right_panel" && sourceVector.x < sourceFrontCutX + 0.5) {
    return new THREE.Vector3(vector.x + 18, vector.y, vector.z);
  }
  if (boardName === "left_side_panel" && sourceVector.z < BASE_CORNER_CHAMFERED_SOURCE.zMin - 0.5) {
    return new THREE.Vector3(vector.x, vector.y, vector.z + 18);
  }
  return vector;
}

function alignVerticalBackPanelBottom(vector: THREE.Vector3, primitive: ModuleGeometryPrimitive) {
  const boardName = readGroundTruthString(primitive.params.boardName) ?? "";
  if (!/back_(left|corner)_panel/i.test(boardName)) return vector;
  if (Math.abs(vector.y - 118.05) > 0.1) return vector;
  return new THREE.Vector3(vector.x, 118, vector.z);
}

function alignTopPanelFootprintToVerticalPanels(vector: THREE.Vector3, primitive: ModuleGeometryPrimitive) {
  if (readGroundTruthString(primitive.params.boardName) !== "top_panel") return vector;
  const match = TOP_PANEL_OUTER_FOOTPRINT_OFFSETS.find((offset) =>
    Math.abs(vector.x - offset.x) < 0.05 &&
    Math.abs(vector.z - offset.z) < 0.05
  );
  if (!match) return vector;
  return new THREE.Vector3(vector.x + match.dx, vector.y, vector.z + match.dz);
}

function transformChamferedGroundTruthVertexMm(
  vector: THREE.Vector3,
  primitive: ModuleGeometryPrimitive,
  context: ChamferedGroundTruthParametricContext
) {
  if (readGroundTruthString(primitive.params.boardName) === "diagonal_plinth") {
    return mapChamferedDiagonalPlinthVertexMm(vector, context);
  }
  const sourceVector = alignTopPanelFootprintToVerticalPanels(alignVerticalBackPanelBottom(vector, primitive), primitive);
  const mapped = new THREE.Vector3(
    mapChamferedGroundTruthX(sourceVector.x, context),
    mapChamferedGroundTruthY(sourceVector.y, context),
    mapChamferedGroundTruthZ(sourceVector.z, context)
  );
  const chamfered = applyChamferedCutCoordinateOffset(mapped, sourceVector, primitive, context);
  const backChamfered = applyBackChamferedCutCoordinateOffset(chamfered, sourceVector, primitive, context);
  return trimChamferedStraightPanelMeasurementOverlap(backChamfered, sourceVector, primitive);
}

function fallbackGroundTruthColorForMaterialGroup(group: unknown): string {
  const value = canonicalFwmMaterialGroup(group);
  if (value.includes("front")) return "#d7d2c7";
  if (value.includes("worktop")) return "#9b846a";
  if (value.includes("plinth")) return "#4f4f4f";
  if (value.includes("back")) return "#c8ccd1";
  if (value.includes("hardware")) return "#464646";
  return "#eeeae0";
}

function roleFromMaterialGroup(group: string): MatRole {
  if (group === "front" || group === "back" || group === "drawer_bottom" || group === "plinth" || group === "worktop" || group === "hardware") return group;
  return "body";
}

function groundTruthHardwareComponentInfo(boardName: string | null | undefined): { type: ComponentType; key: "handleComponentId" | "hingeComponentId" | "legComponentId" | "clipComponentId" } | null {
  const name = (boardName ?? "").toLowerCase();
  if (name.includes("handle")) return { type: "handle", key: "handleComponentId" };
  if (name.includes("hinge")) return { type: "hinge", key: "hingeComponentId" };
  if (name.includes("leg")) return { type: "leg", key: "legComponentId" };
  if (name.includes("clip")) return { type: "plinth_clip", key: "clipComponentId" };
  return null;
}

function makeGroundTruthMaterial(primitive: ModuleGeometryPrimitive, params: FwmFurnitureParams, catalog: ClientCatalog) {
  const materialGroup = canonicalFwmMaterialGroup(readGroundTruthString(primitive.params.materialGroup) ?? "corpus") || "corpus";
  const boardName = readGroundTruthString(primitive.params.boardName);
  const baseMaterial = makeMaterial(params, catalog, roleFromMaterialGroup(materialGroup));
  const componentInfo = materialGroup === "hardware" ? groundTruthHardwareComponentInfo(boardName) : null;
  const component = componentInfo ? resolveComponentForParam(params, catalog, componentInfo.key, componentInfo.type) : undefined;
  const material = (component ? makeComponentMaterial(params, catalog, component, baseMaterial) : baseMaterial).clone();
  material.side = THREE.DoubleSide;
  const materialColorHex = typeof material.userData.renderColorHex === "string"
    ? material.userData.renderColorHex
    : fallbackGroundTruthColorForMaterialGroup(materialGroup);
  material.userData.materialGroup = materialGroup;
  material.userData.materialSlotId = canonicalFwmMaterialGroup(readGroundTruthString(primitive.params.materialSlotId) ?? materialGroup) || materialGroup;
  material.userData.materialName = readGroundTruthString(primitive.params.materialName);
  material.userData.materialColorHex = materialColorHex;
  material.userData.renderColorHex = materialColorHex;
  material.userData.revitMaterialElementId = readGroundTruthString(primitive.params.revitMaterialElementId);
  if (!component) material.userData.materialSource = readGroundTruthString(primitive.params.materialSource) ?? "revit-ground-truth";
  return material;
}

function chamferedCornerVisibleEdgeBanding(boardName: string | null | undefined, materialSlotId: string | null | undefined) {
  const slot = canonicalFwmMaterialGroup(materialSlotId ?? "corpus") || "corpus";
  switch (boardName) {
    case "front_right_panel":
      return [{ edgeId: "front_outer_edge", role: "visible_front", axis: "X", materialSlotId: slot }];
    case "left_side_panel":
      return [{ edgeId: "front_outer_edge", role: "visible_front", axis: "Z", materialSlotId: slot }];
    case "top_panel":
      return [{ edgeId: "front_chamfer_edge", role: "visible_chamfer", axis: "XZ", materialSlotId: slot }];
    case "bottom_panel":
      return [{ edgeId: "front_chamfer_edge", role: "visible_chamfer", axis: "XZ", materialSlotId: slot }];
    case "diagonal_front":
      return [{ edgeId: "front_chamfer_door_edge", role: "visible_chamfer", axis: "XZ", materialSlotId: slot }];
    default:
      return [];
  }
}

function tagGroundTruthMesh(mesh: THREE.Mesh, primitive: ModuleGeometryPrimitive) {
  const boardName = readGroundTruthString(primitive.params.boardName);
  const materialGroup = canonicalFwmMaterialGroup(readGroundTruthString(primitive.params.materialGroup) ?? "corpus") || "corpus";
  const materialSlotId = canonicalFwmMaterialGroup(readGroundTruthString(primitive.params.materialSlotId) ?? materialGroup) || materialGroup;
  const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  const materialData = material?.userData ?? {};
  const materialColorHex = typeof materialData.renderColorHex === "string"
    ? materialData.renderColorHex
    : readGroundTruthColorHex(primitive.params.materialColorHex) ?? fallbackGroundTruthColorForMaterialGroup(materialGroup);
  mesh.name = boardName
    ? `corner_chamfered_${boardName.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "").toLowerCase()}_${primitive.id}`
    : primitive.id;
  mesh.userData.selectable = true;
  mesh.userData.tags = ["module", "revit-ground-truth", primitive.primitiveType];
  mesh.userData.primitiveId = primitive.id;
  mesh.userData.boardName = boardName;
  mesh.userData.partName = boardName ?? primitive.id;
  mesh.userData.materialGroup = materialGroup;
  mesh.userData.materialSlotId = materialSlotId;
  mesh.userData.materialId = readGroundTruthString(primitive.params.materialId);
  mesh.userData.materialName = readGroundTruthString(primitive.params.materialName);
  if (typeof materialData.catalogMaterialId === "string") mesh.userData.catalogMaterialId = materialData.catalogMaterialId;
  if (typeof materialData.catalogMaterialName === "string") mesh.userData.catalogMaterialName = materialData.catalogMaterialName;
  if (typeof materialData.materialRole === "string") mesh.userData.materialRole = materialData.materialRole;
  if (typeof materialData.catalogComponentId === "string") {
    mesh.userData.catalogComponentId = materialData.catalogComponentId;
    mesh.userData.componentId = materialData.catalogComponentId;
  }
  if (typeof materialData.componentType === "string") mesh.userData.componentType = materialData.componentType;
  if (typeof materialData.componentName === "string") mesh.userData.componentName = materialData.componentName;
  const componentInfo = materialGroup === "hardware" ? groundTruthHardwareComponentInfo(boardName) : null;
  if (componentInfo) mesh.userData.componentParamKey = componentInfo.key;
  mesh.userData.materialColorHex = materialColorHex;
  mesh.userData.renderColorHex = materialColorHex;
  mesh.userData.materialParameterName = readGroundTruthString(primitive.params.materialParameterName);
  mesh.userData.materialParameterValue = readGroundTruthString(primitive.params.materialParameterValue);
  mesh.userData.revitMaterialElementId = readGroundTruthString(primitive.params.revitMaterialElementId);
  mesh.userData.materialSource = typeof materialData.materialSource === "string" ? materialData.materialSource : readGroundTruthString(primitive.params.materialSource);
  mesh.userData.sourceElementId = primitive.params.sourceElementId;
  mesh.userData.sourceUniqueId = readGroundTruthString(primitive.params.sourceUniqueId);
  mesh.userData.sourceName = readGroundTruthString(primitive.params.sourceName);
  mesh.userData.sourceClass = readGroundTruthString(primitive.params.sourceClass);
  // Imported joined solids can contain tiny non-planar triangulation seams. Keep
  // real board corners visible while preventing those helper diagonals from
  // appearing in the normal 3D module outline and in generated catalog icons.
  mesh.userData.moduleEdgeThresholdAngleDeg = 28;
  mesh.userData.revitCategory = readGroundTruthString(primitive.params.revitCategory);
  if (Array.isArray(primitive.params.paramKeys)) mesh.userData.paramKeys = primitive.params.paramKeys;
  if (primitive.params.revitProperties && typeof primitive.params.revitProperties === "object" && !Array.isArray(primitive.params.revitProperties)) {
    mesh.userData.revitProperties = primitive.params.revitProperties;
  }
  const box = mesh.geometry.boundingBox;
  if (box) {
    mesh.userData.dimensionsMm = {
      width: (box.max.x - box.min.x) / MM,
      height: (box.max.y - box.min.y) / MM,
      depth: (box.max.z - box.min.z) / MM
    };
    mesh.userData.grainAlong = inferGrainAlong(mesh.name, materialGroup, mesh.userData.dimensionsMm);
  } else {
    mesh.userData.grainAlong = inferGrainAlong(mesh.name, materialGroup, { width: 0, height: 0, depth: 0 });
  }
  const visibleEdgeBanding = chamferedCornerVisibleEdgeBanding(boardName, materialSlotId);
  if (visibleEdgeBanding.length > 0) {
    mesh.userData.edgeBandingStrategy = "explicit_visible_edges";
    mesh.userData.edgeBanding = visibleEdgeBanding;
  }
}

function buildGroundTruthMesh(
  primitive: ModuleGeometryPrimitive,
  context: ChamferedGroundTruthParametricContext,
  params: FwmFurnitureParams,
  catalog: ClientCatalog
) {
  const boardName = readGroundTruthString(primitive.params.boardName);
  if (boardName === "back_corner_panel" && context.backChamferMm <= 0.001) return null;

  const vertices = Array.isArray(primitive.params.verticesMm) ? primitive.params.verticesMm : [];
  const indices = Array.isArray(primitive.params.indices) ? primitive.params.indices : [];
  const positions: number[] = [];
  for (const vertex of vertices) {
    const vector = readGroundTruthVectorMm(vertex);
    if (!vector) continue;
    const transformed = transformChamferedGroundTruthVertexMm(vector, primitive, context);
    positions.push(transformed.x * MM, transformed.y * MM, transformed.z * MM);
  }
  const indexValues = indices.filter((value): value is number => Number.isInteger(value) && value >= 0);
  if (positions.length < 9 || indexValues.length < 3) return null;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indexValues);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();

  const mesh = new THREE.Mesh(geometry, makeGroundTruthMaterial(primitive, params, catalog));
  tagGroundTruthMesh(mesh, primitive);
  return mesh;
}

function findGroundTruthMeshByBoardName(group: THREE.Group, boardName: string): THREE.Mesh | null {
  let found: THREE.Mesh | null = null;
  group.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || found) return;
    if (mesh.userData.boardName === boardName) found = mesh;
  });
  return found;
}

function clampGroundTruthMeshY(mesh: THREE.Mesh, minY: number, maxY: number) {
  const position = mesh.geometry.getAttribute("position") as THREE.BufferAttribute | undefined;
  if (!position) return;
  let changed = false;
  for (let index = 0; index < position.count; index += 1) {
    const yMm = position.getY(index) / MM;
    const clamped = Math.max(minY, Math.min(maxY, yMm));
    if (Math.abs(clamped - yMm) <= 0.001) continue;
    position.setY(index, clamped * MM);
    changed = true;
  }
  if (!changed) return;
  position.needsUpdate = true;
  mesh.geometry.computeVertexNormals();
  mesh.geometry.computeBoundingBox();
  delete mesh.userData.dimensionsMm;
  mesh.userData.dimensionsMm = readMeshDimensionsMm(mesh);
  mesh.userData.grainAlong = inferGrainAlong(String(mesh.userData.boardName ?? mesh.name), String(mesh.userData.materialGroup ?? "corpus"), mesh.userData.dimensionsMm);
}

function fitChamferedGroundTruthVerticalBoardsBetweenHorizontals(group: THREE.Group) {
  const bottomPanel = findGroundTruthMeshByBoardName(group, "bottom_panel");
  const topPanel = findGroundTruthMeshByBoardName(group, "top_panel");
  if (!bottomPanel || !topPanel) return;

  bottomPanel.updateMatrixWorld(true);
  topPanel.updateMatrixWorld(true);
  const bottomBounds = new THREE.Box3().setFromObject(bottomPanel);
  const topBounds = new THREE.Box3().setFromObject(topPanel);
  const minY = bottomBounds.max.y / MM;
  const maxY = topBounds.min.y / MM;
  if (maxY <= minY) return;

  const verticalBoards = new Set([
    "back_left_panel",
    "right_side_panel",
    "back_corner_panel",
    "left_side_panel",
    "front_right_panel"
  ]);
  group.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !verticalBoards.has(String(mesh.userData.boardName ?? ""))) return;
    clampGroundTruthMeshY(mesh, minY, maxY);
  });
}

function readShelfGapValues(params: FwmFurnitureParams, count: number) {
  const raw = params.shelfGaps;
  const values = Array.isArray(raw)
    ? raw.map((value) => Number(value))
    : typeof raw === "string"
      ? raw.split(/[,;\s]+/g).map((value) => Number(value.trim()))
      : [];
  return values.filter((value) => Number.isFinite(value) && value > 0).slice(0, count);
}

function convexPlanHull(points: Array<{ x: number; z: number }>) {
  if (points.length <= 3) return points;
  const sorted = [...points].sort((left, right) => left.x - right.x || left.z - right.z);
  const cross = (origin: { x: number; z: number }, a: { x: number; z: number }, b: { x: number; z: number }) =>
    (a.x - origin.x) * (b.z - origin.z) - (a.z - origin.z) * (b.x - origin.x);
  const buildHalf = (ordered: Array<{ x: number; z: number }>) => {
    const half: Array<{ x: number; z: number }> = [];
    for (const point of ordered) {
      while (half.length >= 2 && cross(half[half.length - 2]!, half[half.length - 1]!, point) <= 0) half.pop();
      half.push(point);
    }
    return half;
  };
  const lower = buildHalf(sorted);
  const upper = buildHalf([...sorted].reverse());
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

function createChamferedShelfFootprintMm(context: ChamferedGroundTruthParametricContext, insetMm: number) {
  const bottomPrimitive = BASE_CORNER_CHAMFERED_GROUND_TRUTH_PACKAGE.primitives.find(
    (primitive) => readGroundTruthString(primitive.params.boardName) === "bottom_panel"
  );
  const vertices = Array.isArray(bottomPrimitive?.params.verticesMm) ? bottomPrimitive.params.verticesMm : [];
  const byPoint = new Map<string, { x: number; z: number }>();
  for (const vertex of vertices) {
    const vector = readGroundTruthVectorMm(vertex);
    if (!vector) continue;
    const transformed = transformChamferedGroundTruthVertexMm(vector, bottomPrimitive!, context);
    byPoint.set(`${transformed.x.toFixed(3)}:${transformed.z.toFixed(3)}`, { x: transformed.x, z: transformed.z });
  }
  // Revit exports a triangle soup, so first-occurrence vertex order is not a
  // usable polygon boundary. Build the actual outer perimeter before creating
  // the shelf; otherwise ShapeUtils can triangulate a self-crossing footprint
  // and render fake diagonal boards/lines inside an open corner niche.
  const points = convexPlanHull([...byPoint.values()]);
  if (points.length < 3) return null;
  const center = points.reduce((acc, point) => ({ x: acc.x + point.x / points.length, z: acc.z + point.z / points.length }), { x: 0, z: 0 });
  return points.map((point) => {
    const dx = point.x - center.x;
    const dz = point.z - center.z;
    const length = Math.hypot(dx, dz);
    if (length <= insetMm) return { x: point.x, z: point.z };
    return {
      x: point.x - (dx / length) * insetMm,
      z: point.z - (dz / length) * insetMm
    };
  });
}

function addChamferedGroundTruthShelves(
  group: THREE.Group,
  params: FwmFurnitureParams,
  catalog: ClientCatalog,
  context: ChamferedGroundTruthParametricContext
) {
  const shelfCount = Math.max(0, Math.min(16, Math.round(num(params, "shelfCount", 0))));
  if (shelfCount <= 0) return;
  const shelfThickness = Math.max(8, Math.min(50, num(params, "shelfThickness", num(params, "boardThickness", 18))));
  const boardInset = Math.max(12, num(params, "boardThickness", 18) * 1.4);
  const footprint = createChamferedShelfFootprintMm(context, boardInset);
  if (!footprint) return;
  const shelfMaterial = makeMaterial(params, catalog, "shelf");
  const bottomPanel = findGroundTruthMeshByBoardName(group, "bottom_panel");
  const topPanel = findGroundTruthMeshByBoardName(group, "top_panel");
  if (!bottomPanel || !topPanel) return;
  bottomPanel.updateMatrixWorld(true);
  topPanel.updateMatrixWorld(true);
  const bottomBounds = new THREE.Box3().setFromObject(bottomPanel);
  const topBounds = new THREE.Box3().setFromObject(topPanel);
  const interiorMinY = bottomBounds.max.y / MM;
  const interiorMaxY = topBounds.min.y / MM;
  const available = Math.max(1, interiorMaxY - interiorMinY - shelfCount * shelfThickness);
  const requestedGaps = readShelfGapValues(params, shelfCount + 1);
  const gaps = requestedGaps.length > 0
    ? Array.from({ length: shelfCount + 1 }, (_, index) => requestedGaps[index] ?? requestedGaps[requestedGaps.length - 1] ?? (available / (shelfCount + 1)))
    : Array.from({ length: shelfCount + 1 }, () => available / (shelfCount + 1));
  const gapTotal = gaps.reduce((sum, value) => sum + value, 0);
  const scale = gapTotal > available ? available / gapTotal : 1;
  let cursorY = interiorMinY;
  for (let index = 0; index < shelfCount; index += 1) {
    cursorY += gaps[index] * scale;
    const yMin = cursorY;
    const yMax = yMin + shelfThickness;
    const shelf = addPlanPrism(
      group,
      `corner_chamfered_shelf_${index + 1}`,
      footprint,
      yMin,
      yMax,
      shelfMaterial,
      ["shelfCount", "shelfGaps", "shelfThickness", "height", "shelfMaterialId", "width", "depth", "frontChamferMm", "backChamferMm"]
    );
    shelf.userData.boardName = `shelf_${index + 1}`;
    shelf.userData.partName = `shelf_${index + 1}`;
    shelf.userData.materialGroup = "shelf";
    shelf.userData.materialSlotId = "shelf";
    cursorY = yMax;
  }
}

function addChamferedDiagonalPlinthClipSet(
  group: THREE.Group,
  params: FwmFurnitureParams,
  catalog: ClientCatalog,
  legBoardName: "leg_diagonal_left" | "leg_diagonal_right",
  label: "left" | "right"
) {
  const leg = findGroundTruthMeshByBoardName(group, legBoardName);
  if (!leg) return;

  leg.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(leg);
  if (box.isEmpty()) return;
  const center = box.getCenter(new THREE.Vector3()).multiplyScalar(1000);
  const hardware = makeMaterial(params, catalog, "hardware");
  const clipComponent = resolveComponentForParam(params, catalog, "clipComponentId", "plinth_clip");
  const clipMaterial = makeComponentMaterial(params, catalog, clipComponent, hardware);
  const clipGroup = new THREE.Group();
  clipGroup.name = `corner_chamfered_diagonal_plinth_clip_${label}`;
  clipGroup.position.set(center.x * MM, 0, center.z * MM);
  clipGroup.rotation.y = -Math.PI / 4;
  group.add(clipGroup);

  const paramKeys = ["clipComponentId", "legComponentId", "frontChamferMm", "plinthHeight", "plinthSetbackMm", "depth"];
  const collar = addCornerStyleClipCollar(clipGroup, `${clipGroup.name}_collar`, { x: 0, y: 40, z: 1.768 }, clipMaterial, paramKeys);
  const pad = addBox(clipGroup, `${clipGroup.name}_pad`, { width: 30, height: 35, depth: 25 }, { x: 0, y: 40, z: 7 }, clipMaterial, paramKeys);
  const arm = addBox(clipGroup, `${clipGroup.name}_arm`, { width: 30, height: 35, depth: 48 }, { x: 0, y: 39, z: 38 }, clipMaterial, paramKeys);

  for (const [mesh, suffix] of [[collar, "collar"], [pad, "pad"], [arm, "arm"]] as const) {
    tagChamferedRuntimeHardware(mesh, `diagonal_plinth_clip_${label}_${suffix}`);
    markComponent(mesh, clipComponent, "clipComponentId");
  }
}

function buildCatalogBaseCornerChamferedGroundTruth(group: THREE.Group, catalog: ClientCatalog) {
  const primitives = BASE_CORNER_CHAMFERED_GROUND_TRUTH_PACKAGE.primitives;
  const params = group.userData.groundTruthBuildParams as FwmFurnitureParams | undefined;
  const buildParams = params ?? ({} as FwmFurnitureParams);
  const context = createChamferedGroundTruthParametricContext(buildParams);
  for (const primitive of primitives) {
    if (primitive.primitiveType !== "mesh") continue;
    const mesh = buildGroundTruthMesh(primitive, context, buildParams, catalog);
    if (mesh) group.add(mesh);
  }
  fitChamferedGroundTruthVerticalBoardsBetweenHorizontals(group);
  addChamferedGroundTruthShelves(group, buildParams, catalog, context);
  addChamferedDiagonalPlinthClipSet(group, buildParams, catalog, "leg_diagonal_left", "left");
  addChamferedDiagonalPlinthClipSet(group, buildParams, catalog, "leg_diagonal_right", "right");
  group.userData.sourceGeometry = "revit-ground-truth-baked";
  group.userData.groundTruthPackageId = "base_corner_chamfered";
  group.userData.groundTruthPrimitiveCount = primitives.length;
  group.userData.groundTruthParametricContext = context;
  group.userData.kitchenCornerRotationOffsetRad = Math.PI / 2;
  attachChamferedCornerKitchenAnchors(group);
}

function attachChamferedCornerKitchenAnchors(group: THREE.Group) {
  const params = group.userData.groundTruthBuildParams as FwmFurnitureParams | undefined;
  const profile = resolveChamferedCornerJoinProfile(
    createChamferedGroundTruthParametricContext(params ?? ({} as FwmFurnitureParams))
  );

  // V2 placement anchors are the declared outside wall-leg reference planes,
  // not an incidental board/hardware extent from the baked source mesh.
  const corner = profile.corner.clone();
  const xJoin = profile.xJoin.clone();
  const zJoin = profile.zJoin.clone();
  if (profile && (group.userData.groundTruthParametricContext as ChamferedGroundTruthParametricContext | undefined)?.geometryContractVersion === 2) {
    corner.x = xJoin.x + (group.userData.groundTruthParametricContext as ChamferedGroundTruthParametricContext).depth;
    corner.z = xJoin.z;
    zJoin.x = corner.x;
    zJoin.z = corner.z + (group.userData.groundTruthParametricContext as ChamferedGroundTruthParametricContext).depth;
  }

  const cornerAnchor = new THREE.Object3D();
  cornerAnchor.name = kitchenCornerAnchorName;
  cornerAnchor.position.copy(corner).multiplyScalar(MM);
  cornerAnchor.visible = false;
  group.add(cornerAnchor);

  const xAnchor = new THREE.Object3D();
  xAnchor.name = kitchenCornerXAnchorName;
  xAnchor.position.copy(xJoin).multiplyScalar(MM);
  xAnchor.visible = false;
  group.add(xAnchor);

  const zAnchor = new THREE.Object3D();
  zAnchor.name = kitchenCornerZAnchorName;
  zAnchor.position.copy(zJoin).multiplyScalar(MM);
  zAnchor.visible = false;
  group.add(zAnchor);
}

/**
 * The baked chamfered source contains construction overhangs beyond its
 * declared kitchen-corner planes. Those hidden 18 mm overlaps made a 900 mm
 * package measure 936 mm in Properties/selection. Trim board vertices to the
 * contract planes; hardware remains independent of the board envelope.
 */
function trimChamferedBoardsToKitchenAnchors(group: THREE.Group) {
  const corner = group.getObjectByName(kitchenCornerAnchorName);
  const xAnchor = group.getObjectByName(kitchenCornerXAnchorName);
  const zAnchor = group.getObjectByName(kitchenCornerZAnchorName);
  if (!corner || !xAnchor || !zAnchor) return;
  const minX = Math.min(corner.position.x, xAnchor.position.x, zAnchor.position.x);
  const maxX = Math.max(corner.position.x, xAnchor.position.x, zAnchor.position.x);
  const minZ = Math.min(corner.position.z, xAnchor.position.z, zAnchor.position.z);
  const maxZ = Math.max(corner.position.z, xAnchor.position.z, zAnchor.position.z);
  const point = new THREE.Vector3();
  group.updateMatrixWorld(true);
  group.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || !["corpus", "body", "carcass", "front", "back", "shelf", "drawer_bottom", "plinth"].includes(String(object.userData.materialGroup))) return;
    const position = object.geometry.getAttribute("position") as THREE.BufferAttribute | undefined;
    if (!position) return;
    for (let index = 0; index < position.count; index += 1) {
      point.fromBufferAttribute(position, index);
      object.localToWorld(point);
      point.x = Math.min(maxX, Math.max(minX, point.x));
      point.z = Math.min(maxZ, Math.max(minZ, point.z));
      object.worldToLocal(point);
      position.setXYZ(index, point.x, point.y, point.z);
    }
    position.needsUpdate = true;
    object.geometry.computeBoundingBox();
    object.geometry.computeBoundingSphere();
    object.geometry.computeVertexNormals();
  });
  group.updateMatrixWorld(true);
}

function buildCatalogBaseCornerChamfered(group: THREE.Group, params: FwmFurnitureParams, catalog: ClientCatalog) {
  group.userData.groundTruthBuildParams = params;
  buildCatalogBaseCornerChamferedGroundTruth(group, catalog);
  trimChamferedBoardsToKitchenAnchors(group);
  group.userData.catalogCornerVariant = String(params.variant ?? "corner_chamfered");
}

function buildCatalogBaseCornerChamferedProcedural(group: THREE.Group, params: FwmFurnitureParams, catalog: ClientCatalog) {
  const width = num(params, "width", 900);
  const height = num(params, "height", 722);
  const depth = num(params, "depth", 900);
  const t = num(params, "boardThickness", 18);
  const back = num(params, "backThickness", 8);
  const plinth = num(params, "plinthHeight", 100);
  const shelfT = num(params, "shelfThickness", t);
  const frontT = num(params, "frontThicknessMm", 18);
  const chamfer = Math.min(
    Math.max(num(params, "chamferMm", 420), Math.min(width, depth) * 0.34),
    Math.min(width, depth) - t * 4
  );
  const bodyHeight = Math.max(1, height - plinth);
  const baseY = plinth;
  const innerBottomY = baseY + t;
  const innerTopY = baseY + bodyHeight - t;
  const innerHeight = Math.max(1, innerTopY - innerBottomY);
  const supportHeight = Math.max(70, Math.min(130, bodyHeight * 0.16));
  const supportDepth = Math.max(36, Math.min(72, t * 3));
  const body = makeMaterial(params, catalog, "body");
  const backMat = makeMaterial(params, catalog, "back");
  const shelfMat = makeMaterial(params, catalog, "shelf");
  const frontMat = makeMaterial(params, catalog, "front");
  const plinthMat = makeMaterial(params, catalog, "plinth");
  const hardware = makeMaterial(params, catalog, "hardware");

  const minX = -width / 2;
  const maxX = width / 2;
  const backZ = -depth / 2;
  const frontZ = depth / 2;
  const frontAfterChamfer = minX + chamfer;
  const leftBeforeChamfer = frontZ - chamfer;
  const footprint = [
    { x: minX, z: backZ },
    { x: maxX, z: backZ },
    { x: maxX, z: frontZ },
    { x: frontAfterChamfer, z: frontZ },
    { x: minX, z: leftBeforeChamfer }
  ];
  const innerFootprint = [
    { x: minX + t, z: backZ + back },
    { x: maxX - t, z: backZ + back },
    { x: maxX - t, z: frontZ - t },
    { x: frontAfterChamfer + t * 0.5, z: frontZ - t },
    { x: minX + t, z: leftBeforeChamfer - t * 0.5 }
  ];

  const bottom = addPlanPrism(group, "corner_chamfered_bottom_panel", footprint, baseY, baseY + t, body, ["width", "depth", "boardThickness", "chamferMm"]);
  bottom.userData.materialGroup = "body";
  const top = addPlanPrism(
    group,
    "corner_chamfered_top_panel",
    footprint,
    baseY + bodyHeight - t,
    baseY + bodyHeight,
    body,
    ["width", "depth", "height", "boardThickness", "chamferMm"]
  );
  top.userData.materialGroup = "body";

  const backPanel = addBox(
    group,
    "corner_chamfered_back_panel",
    { width: Math.max(1, width - 2 * t), height: Math.max(1, bodyHeight - 2 * t), depth: back },
    { x: 0, y: innerBottomY + innerHeight / 2, z: backZ + back / 2 },
    backMat,
    ["width", "height", "backThickness", "boardThickness"]
  );
  backPanel.userData.materialGroup = "back";
  const backCorner = addBox(
    group,
    "corner_chamfered_back_corner_panel",
    { width: back, height: Math.max(1, bodyHeight - 2 * t), depth: Math.max(1, leftBeforeChamfer - backZ - t) },
    { x: minX + t + back / 2, y: innerBottomY + innerHeight / 2, z: (backZ + leftBeforeChamfer - t) / 2 },
    backMat,
    ["depth", "height", "backThickness", "boardThickness", "chamferMm"]
  );
  backCorner.userData.materialGroup = "back";

  addBox(
    group,
    "corner_chamfered_left_side",
    { width: t, height: bodyHeight, depth: Math.max(1, leftBeforeChamfer - backZ) },
    { x: minX + t / 2, y: baseY + bodyHeight / 2, z: (backZ + leftBeforeChamfer) / 2 },
    body,
    ["height", "depth", "boardThickness", "chamferMm"]
  ).userData.materialGroup = "body";
  addBox(
    group,
    "corner_chamfered_right_side",
    { width: t, height: bodyHeight, depth },
    { x: maxX - t / 2, y: baseY + bodyHeight / 2, z: 0 },
    body,
    ["height", "depth", "boardThickness"]
  ).userData.materialGroup = "body";

  addBox(
    group,
    "corner_chamfered_support_front",
    { width: Math.max(1, maxX - frontAfterChamfer - t), height: supportHeight, depth: supportDepth },
    { x: (frontAfterChamfer + maxX) / 2, y: baseY + bodyHeight - t - supportHeight / 2, z: frontZ - t - supportDepth / 2 },
    body,
    ["width", "height", "boardThickness", "chamferMm"]
  ).userData.materialGroup = "body";
  addBox(
    group,
    "corner_chamfered_support_back",
    { width: Math.max(1, width - 2 * t), height: supportHeight, depth: supportDepth },
    { x: 0, y: baseY + bodyHeight - t - supportHeight / 2, z: backZ + back + supportDepth / 2 },
    body,
    ["width", "height", "boardThickness"]
  ).userData.materialGroup = "body";
  addBoardBetweenPlanPoints(
    group,
    "corner_chamfered_support_diagonal",
    { x: minX + t, z: leftBeforeChamfer - t },
    { x: frontAfterChamfer + t, z: frontZ - t },
    baseY + bodyHeight - t - supportHeight / 2,
    supportHeight,
    supportDepth,
    body,
    ["width", "depth", "height", "boardThickness", "chamferMm"]
  ).userData.materialGroup = "body";
  addBox(
    group,
    "corner_chamfered_lower_front_support",
    { width: Math.max(1, maxX - frontAfterChamfer - t), height: supportHeight, depth: supportDepth },
    { x: (frontAfterChamfer + maxX) / 2, y: baseY + t + supportHeight / 2, z: frontZ - t - supportDepth / 2 },
    body,
    ["width", "height", "boardThickness", "chamferMm"]
  ).userData.materialGroup = "body";

  addBoardBetweenPlanPoints(
    group,
    "corner_chamfered_diagonal_front",
    { x: minX - t * 1.5, z: leftBeforeChamfer + t },
    { x: frontAfterChamfer - t * 0.5, z: frontZ + t * 1.5 },
    baseY + bodyHeight / 2,
    Math.max(1, bodyHeight - 4),
    frontT,
    frontMat,
    ["width", "depth", "height", "frontThicknessMm", "frontMaterialId", "chamferMm"]
  ).userData.materialGroup = "front";

  const shelfCount = Math.max(0, Math.min(16, Math.round(num(params, "shelfCount", 1))));
  for (let index = 0; index < shelfCount; index += 1) {
    const ratio = (index + 1) / (shelfCount + 1);
    const centerY = innerBottomY + innerHeight * ratio;
    const shelf = addPlanPrism(
      group,
      `corner_chamfered_shelf_${index + 1}`,
      innerFootprint,
      centerY - shelfT / 2,
      centerY + shelfT / 2,
      shelfMat,
      ["shelfCount", "shelfThickness", "height", "width", "depth", "chamferMm", "shelfMaterialId"]
    );
    shelf.userData.materialGroup = "shelf";
  }

  if (plinth > 0) {
    addBoardBetweenPlanPoints(
      group,
      "corner_chamfered_plinth_diagonal",
      { x: minX + 70, z: leftBeforeChamfer - 45 },
      { x: frontAfterChamfer - 45, z: frontZ - 70 },
      plinth / 2,
      plinth,
      Math.max(8, Math.min(t, 24)),
      plinthMat,
      ["plinthHeight", "plinthSetbackMm", "plinthMaterialId", "width", "depth", "chamferMm"]
    ).userData.materialGroup = "plinth";
    const legCenters = [
      { name: "corner_chamfered_leg_back_left", x: minX + 85, z: backZ + 95 },
      { name: "corner_chamfered_leg_back_right", x: maxX - 85, z: backZ + 95 },
      { name: "corner_chamfered_leg_front_right", x: maxX - 85, z: frontZ - 95 },
      { name: "corner_chamfered_leg_diagonal_left", x: minX + chamfer * 0.28, z: leftBeforeChamfer + chamfer * 0.12 },
      { name: "corner_chamfered_leg_diagonal_right", x: frontAfterChamfer - chamfer * 0.12, z: frontZ - chamfer * 0.28 }
    ];
    for (const leg of legCenters) {
      addCornerStyleLeg(group, leg.name, plinth, { x: leg.x, y: plinth / 2, z: leg.z }, hardware, ["legComponentId", "plinthHeight", "width", "depth", "chamferMm"]);
    }
  }

  const handleMid = { x: minX + chamfer * 0.52, z: leftBeforeChamfer + chamfer * 0.48 };
  const handle = addCylinder(
    group,
    "corner_chamfered_diagonal_handle",
    5,
    Math.min(num(params, "handleLengthMm", 160), Math.max(40, bodyHeight * 0.28)),
    { x: handleMid.x + 18, y: baseY + bodyHeight * 0.55, z: handleMid.z + 18 },
    hardware,
    "y",
    ["handleComponentId", "handleLengthMm", "handleProjectionMm", "width", "height", "depth", "chamferMm"]
  );
  handle.userData.componentType = "handle";

  for (const [index, hingeY] of [baseY + bodyHeight * 0.22, baseY + bodyHeight * 0.78].entries()) {
    const hinge = addBox(
      group,
      `corner_chamfered_hinge_${index + 1}`,
      { width: 24, height: 24, depth: 4 },
      { x: minX + chamfer * 0.18, y: hingeY, z: leftBeforeChamfer + chamfer * 0.18 },
      hardware,
      ["hingeComponentId", "height", "chamferMm"]
    );
    hinge.rotation.y = Math.PI / 4;
    hinge.userData.componentType = "hinge";
    hinge.userData.materialGroup = "hardware";
  }
}

function buildCatalogBaseCorner90(group: THREE.Group, params: FwmFurnitureParams, catalog: ClientCatalog) {
  const sourceParams = mapFwmCatalogCornerToCornerShelfLowerParams(params);
  const shouldOpen = sourceParams.doorOpen === true;
  const source = buildCornerShelfLower({ ...sourceParams, doorOpen: false }, catalog);
  source.name = "corner_fwm_runtime_source";
  annotateCopiedCornerFwmRuntime(source, params, catalog);
  trimCopiedCorner90ButtJoints(
    source,
    Math.max(0, num(params, "sideGap", 2)),
    Math.max(1, Math.round(num(params, "hingeCountPerDoor", 2)))
  );
  if (shouldOpen) openCopiedCorner90Doors(source, params);
  group.add(source);
  group.userData.catalogCornerVariant = String(params.variant ?? "corner_90");
  group.userData.sourceModuleType = "corner_shelf_lower";
}

function findMeshObject(root: THREE.Object3D, name: string) {
  const object = root.getObjectByName(name);
  return object instanceof THREE.Mesh ? object : null;
}

function shiftCopiedCornerObjects(root: THREE.Object3D, names: string[], axis: "x" | "z", deltaMm: number) {
  if (Math.abs(deltaMm) <= 1e-6) return;
  for (const name of names) {
    const object = root.getObjectByName(name);
    if (object) object.position[axis] += deltaMm * MM;
  }
}

function copiedCornerHingeNames(axis: "x" | "z", hingeCount: number) {
  return Array.from({ length: hingeCount }, (_, index) => [
    `hinge_front_${axis}_${index + 1}_door_plate`,
    `hinge_front_${axis}_${index + 1}_door_cup`,
    `hinge_front_${axis}_${index + 1}_arm`
  ]).flat();
}

function trimCopiedCorner90ButtJoints(root: THREE.Object3D, sideGapMm: number, hingeCount: number) {
  const sideEndZ = findMeshObject(root, "side_end_z");
  const bottomZ = findMeshObject(root, "bottom_z");
  if (sideEndZ && bottomZ) {
    const sideBounds = readObjectBoundsMm(sideEndZ);
    resizeAxisAlignedBoxMeshToBoundsMm(bottomZ, { maxZ: sideBounds.minZ });
  }

  const sideEndX = findMeshObject(root, "side_end_x");
  const doorFrontX = findMeshObject(root, "door_front_x");
  const doorFrontZ = findMeshObject(root, "door_front_z");
  if (sideEndX && sideEndZ && doorFrontX && doorFrontZ) {
    const doorXBefore = readObjectBoundsMm(doorFrontX);
    const sideZBounds = readObjectBoundsMm(sideEndZ);
    const doorXMaxZ = sideZBounds.maxZ - sideGapMm;
    resizeAxisAlignedBoxMeshToBoundsMm(doorFrontX, { maxZ: doorXMaxZ });
    const doorXAfter = readObjectBoundsMm(doorFrontX);
    const doorXCenterDeltaZ = (doorXAfter.minZ + doorXAfter.maxZ - doorXBefore.minZ - doorXBefore.maxZ) / 2;
    shiftCopiedCornerObjects(root, ["doorHandle_front_x"], "z", doorXCenterDeltaZ);
    shiftCopiedCornerObjects(
      root,
      copiedCornerHingeNames("x", hingeCount),
      "z",
      doorXAfter.maxZ - doorXBefore.maxZ
    );

    const doorZBefore = readObjectBoundsMm(doorFrontZ);
    const sideXBounds = readObjectBoundsMm(sideEndX);
    resizeAxisAlignedBoxMeshToBoundsMm(doorFrontZ, {
      minX: doorXAfter.maxX,
      maxX: sideXBounds.maxX - sideGapMm
    });
    const doorZAfter = readObjectBoundsMm(doorFrontZ);
    const doorZCenterDeltaX = (doorZAfter.minX + doorZAfter.maxX - doorZBefore.minX - doorZBefore.maxX) / 2;
    shiftCopiedCornerObjects(root, ["doorHandle_front_z"], "x", doorZCenterDeltaX);
    shiftCopiedCornerObjects(
      root,
      copiedCornerHingeNames("z", hingeCount),
      "x",
      doorZAfter.maxX - doorZBefore.maxX
    );
  }

  const backX = findMeshObject(root, "back_x");
  if (sideEndX && backX) {
    const sideBounds = readObjectBoundsMm(sideEndX);
    resizeAxisAlignedBoxMeshToBoundsMm(backX, { maxX: sideBounds.minX });
  }

  const backCorner = findMeshObject(root, "back_corner_panel");
  if (backCorner && backX) {
    const cornerBounds = readObjectBoundsMm(backCorner);
    resizeAxisAlignedBoxMeshToBoundsMm(backX, { minX: cornerBounds.maxX });
  }

  const backZ = findMeshObject(root, "back_z");
  if (sideEndZ && backZ) {
    const sideBounds = readObjectBoundsMm(sideEndZ);
    resizeAxisAlignedBoxMeshToBoundsMm(backZ, { maxZ: sideBounds.minZ });
  }
}

function openCopiedCorner90Doors(root: THREE.Group, params: FwmFurnitureParams) {
  const hingeCount = Math.max(1, Math.round(num(params, "hingeCountPerDoor", 2)));
  const doorFrontX = findMeshObject(root, "door_front_x");
  const doorFrontZ = findMeshObject(root, "door_front_z");
  if (doorFrontX) {
    const bounds = readObjectBoundsMm(doorFrontX);
    const pivot = attachObjectsToWallCornerPivot(
      root,
      "__corner_door_pivot_x",
      { x: (bounds.minX + bounds.maxX) / 2, z: bounds.maxZ },
      [
        doorFrontX,
        root.getObjectByName("doorHandle_front_x"),
        ...copiedCornerHingeNames("x", hingeCount).map((name) => root.getObjectByName(name))
      ].filter((object): object is THREE.Object3D => Boolean(object))
    );
    pivot.rotation.y = Math.PI / 2;
  }
  if (doorFrontZ) {
    const bounds = readObjectBoundsMm(doorFrontZ);
    const pivot = attachObjectsToWallCornerPivot(
      root,
      "__corner_door_pivot_z",
      { x: bounds.maxX, z: (bounds.minZ + bounds.maxZ) / 2 },
      [
        doorFrontZ,
        root.getObjectByName("doorHandle_front_z"),
        ...copiedCornerHingeNames("z", hingeCount).map((name) => root.getObjectByName(name))
      ].filter((object): object is THREE.Object3D => Boolean(object))
    );
    pivot.rotation.y = -Math.PI / 2;
  }
}

function annotateCopiedCornerFwmRuntime(source: THREE.Object3D, params: FwmFurnitureParams, catalog: ClientCatalog) {
  const bodyMaterial = makeMaterial(params, catalog, "body");
  const hardwareMaterial = makeMaterial(params, catalog, "hardware");
  const handleComponent = resolveComponentForParam(params, catalog, "handleComponentId", "handle");
  const hingeComponent = resolveComponentForParam(params, catalog, "hingeComponentId", "hinge");
  const legComponent = resolveComponentForParam(params, catalog, "legComponentId", "leg");
  const clipComponent = resolveComponentForParam(params, catalog, "clipComponentId", "plinth_clip");
  const handleMaterial = makeComponentMaterial(params, catalog, handleComponent, hardwareMaterial);
  const hingeMaterial = makeComponentMaterial(params, catalog, hingeComponent, hardwareMaterial);
  const legMaterial = makeComponentMaterial(params, catalog, legComponent, hardwareMaterial);
  const clipMaterial = makeComponentMaterial(params, catalog, clipComponent, hardwareMaterial);
  const materialByGroup: Record<string, THREE.Material> = {
    body: bodyMaterial,
    front: makeMaterial(params, catalog, "front"),
    back: hasCopiedCornerMaterialOverride(params, "back") ? makeMaterial(params, catalog, "back") : bodyMaterial,
    shelf: hasCopiedCornerMaterialOverride(params, "shelf") ? makeMaterial(params, catalog, "shelf") : bodyMaterial,
    plinth: hasCopiedCornerMaterialOverride(params, "plinth") ? makeMaterial(params, catalog, "plinth") : bodyMaterial,
    hardware: hardwareMaterial
  };
  source.traverse((object) => {
    const data = object.userData as Record<string, unknown>;
    const name = object.name.toLowerCase();
    const tags = Array.isArray(data.tags) ? data.tags.filter((tag): tag is string => typeof tag === "string") : [];
    const hasTag = (tag: string) => tags.includes(tag);
    const group =
      name.startsWith("kick_") ? "plinth" :
      name.startsWith("leg_") || name.startsWith("kickclip_") || name.startsWith("hinge_") || name.startsWith("doorhandle_") ? "hardware" :
      hasTag("front") || name.includes("door_front") ? "front" :
      hasTag("shelf") || name.startsWith("shelf_") ? "shelf" :
      hasTag("back") || name.startsWith("back_") ? "back" :
      hasTag("body") || name.startsWith("side_") || name.startsWith("bottom_") || name.startsWith("top_") ? "body" :
      "";
    if (group) data.materialGroup = group;
    if (!data.sourceModuleType) data.sourceModuleType = "corner_shelf_lower";
    if (!data.boardName && object.name) data.boardName = object.name;
    const component =
      group === "hardware" && name.startsWith("doorhandle_") ? handleComponent :
      group === "hardware" && name.startsWith("hinge_") ? hingeComponent :
      group === "hardware" && name.startsWith("leg_") ? legComponent :
      group === "hardware" && name.startsWith("kickclip_") ? clipComponent :
      undefined;
    const componentParamKey =
      component === handleComponent ? "handleComponentId" :
      component === hingeComponent ? "hingeComponentId" :
      component === legComponent ? "legComponentId" :
      component === clipComponent ? "clipComponentId" :
      "";
    const material =
      group === "hardware" && name.startsWith("doorhandle_") ? handleMaterial :
      group === "hardware" && name.startsWith("hinge_") ? hingeMaterial :
      group === "hardware" && name.startsWith("leg_") ? legMaterial :
      group === "hardware" && name.startsWith("kickclip_") ? clipMaterial :
      materialByGroup[group];
    if (material && (object as THREE.Mesh).isMesh) {
      const mesh = object as THREE.Mesh;
      mesh.material = material;
      if (component && componentParamKey) markComponent(mesh, component, componentParamKey);
      if (group === "front") fitCopiedCornerFrontPanelHeight(mesh, params);
      data.grainAlong = inferGrainAlong(object.name, group, readMeshDimensionsMm(mesh));
      if ((group === "front" || group === "shelf" || group === "body") && !data.edgeBandingStrategy) {
        data.edgeBandingStrategy = "explicit_visible_edges";
        data.edgeBanding = [{
          edgeId: `${group}_visible_edges`,
          role: group === "front" ? "visible_front" : "visible_corpus",
          axis: group === "front" ? "Y" : "XZ",
          materialSlotId: group === "front" ? "front" : "corpus"
        }];
      }
      data.catalogMaterialId = material.userData.catalogMaterialId;
      data.catalogMaterialName = material.userData.catalogMaterialName;
      data.materialRole = material.userData.materialRole;
      data.materialSource = material.userData.materialSource;
      data.renderColorHex = material.userData.renderColorHex;
      delete data.materialRequest;
    }
    if (group === "hardware" && !data.componentType) {
      data.componentType = name.startsWith("hinge_") ? "hinge" : name.startsWith("doorhandle_") ? "handle" : name.startsWith("leg_") ? "leg" : "plinth_clip";
    }
  });
}

function fitCopiedCornerFrontPanelHeight(mesh: THREE.Mesh, params: FwmFurnitureParams) {
  const dimensions = readMeshDimensionsMm(mesh);
  if (!Number.isFinite(dimensions.height) || dimensions.height <= 0) return;
  const height = num(params, "height", 722);
  const plinth = Math.max(0, num(params, "plinthHeight", 100));
  const targetHeight = Math.max(1, height - plinth);
  mesh.scale.y *= targetHeight / dimensions.height;
  mesh.position.y = (plinth + targetHeight / 2) * MM;
  mesh.userData.dimensionsMm = {
    ...dimensions,
    height: targetHeight
  };
}

function hasCopiedCornerMaterialOverride(params: FwmFurnitureParams, role: "back" | "shelf" | "plinth") {
  const paramKey =
    role === "back" ? "backMaterialId" :
    role === "shelf" ? "shelfMaterialId" :
    "plinthMaterialId";
  if (typeof params[paramKey] === "string" && params[paramKey]) return true;
  const assignments = rec(params.materialAssignments);
  return typeof assignments[role] === "string" && Boolean(assignments[role]);
}

function scaleGroundTruthCenter(
  center: { x: number; y: number; z: number },
  source: { width: number; height: number; depth: number; plinth: number },
  target: { width: number; height: number; depth: number; plinth: number }
) {
  return {
    x: (center.x / source.width) * target.width,
    y: scaleGroundTruthY(center.y, source, target),
    z: (center.z / source.depth) * target.depth
  };
}

function scaleGroundTruthSize(
  size: { width: number; height: number; depth: number },
  role: "body" | "back" | "shelf" | "front" | "plinth",
  target: { width: number; height: number; depth: number; plinth: number; t: number; back: number; shelfT: number; frontT: number },
  source: { width: number; height: number; depth: number; plinth: number }
) {
  const thin = (axis: "x" | "y" | "z", value: number) => {
    if (value > 30) return null;
    if (role === "back") return target.back;
    if (role === "shelf") return target.shelfT;
    if (role === "front") return target.frontT;
    if (role === "plinth" && axis !== "y") return Math.max(8, Math.min(target.t, 24));
    return target.t;
  };
  const xThin = thin("x", size.width);
  const yThin = thin("y", size.height);
  const zThin = thin("z", size.depth);
  return {
    width: Math.max(1, xThin ?? (size.width / source.width) * target.width),
    height: Math.max(1, role === "plinth" ? target.plinth : yThin ?? scaleGroundTruthYSize(size.height, source, target)),
    depth: Math.max(1, zThin ?? (size.depth / source.depth) * target.depth)
  };
}

function scaleGroundTruthY(
  y: number,
  source: { height: number; plinth: number },
  target: { height: number; plinth: number }
) {
  if (source.plinth <= 0 || target.plinth <= 0 || y <= source.plinth) {
    return source.plinth > 0 ? (y / Math.max(1, source.plinth)) * target.plinth : y;
  }
  const sourceBody = Math.max(1, source.height - source.plinth);
  const targetBody = Math.max(1, target.height - target.plinth);
  return target.plinth + ((y - source.plinth) / sourceBody) * targetBody;
}

function scaleGroundTruthYSize(
  height: number,
  source: { height: number; plinth: number },
  target: { height: number; plinth: number }
) {
  if (height <= source.plinth) return (height / Math.max(1, source.plinth)) * target.plinth;
  return (height / Math.max(1, source.height - source.plinth)) * Math.max(1, target.height - target.plinth);
}

function addFronts(group: THREE.Group, params: FwmFurnitureParams, catalog: ClientCatalog, opts: { width?: number; height?: number; depth?: number; zOffset?: number; drawerDepthShiftMm?: number; yOffset?: number; prefix?: string } = {}) {
  const width = opts.width ?? num(params, "width", 800);
  const height = opts.height ?? num(params, "height", 720);
  const depth = opts.depth ?? num(params, "depth", 560);
  const zOffset = opts.zOffset ?? 0;
  const drawerDepthShiftMm = opts.drawerDepthShiftMm ?? 0;
  const plinth = num(params, "plinthHeight", 0);
  const gap = num(params, "frontGap", 2);
  const sideGap = num(params, "sideGap", 2);
  const frontT = num(params, "frontThicknessMm", 18);
  const frontType = String(params.frontType ?? "");
  const frontMat = makeMaterial(params, catalog, params.glassFronts || frontType === "glass" ? "glass" : "front");
  const hardware = makeMaterial(params, catalog, "hardware");
  const drawerCount = Math.round(num(params, "drawerCount", 0));
  const doorCount = Math.round(num(params, "doorCount", 0));
  const opened = bool(params, "opened", false);
  const prefix = opts.prefix ? `${opts.prefix}_` : "";
  const z = zOffset + depth / 2 + frontT / 2 + 1;
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
      const drawerDepth = resolveDrawerDepthLayout(depth, num(params, "backThickness", 8), num(params, "drawerBackGapMm", 10));
      const openOffset = opened ? Math.min(220, depth * 0.42) : 0;
      const drawerGroup = new THREE.Group();
      drawerGroup.name = `${prefix}drawer_front_${index + 1}_group`;
      drawerGroup.position.set(0, y * MM, (z + openOffset) * MM);
      group.add(drawerGroup);
      addBox(drawerGroup, `${prefix}drawer_front_${index + 1}`, { width: width - sideGap * 2, height: drawerH, depth: frontT }, { x: 0, y: 0, z: 0 }, frontMat, ["drawerCount", "drawerFrontHeightsMm", "frontThicknessMm", "frontGap", "handleComponentId", "opened"]);
      const drawerCenterWorldZ = zOffset + drawerDepth.centerZ - drawerDepthShiftMm;
      addDrawerSubmodule(drawerGroup, params, catalog, {
        prefix,
        index: index + 1,
        widthMm: width - sideGap * 2,
        frontHeightMm: drawerH,
        drawerCenterZMm: drawerCenterWorldZ - z,
        drawerDepthMm: drawerDepth.depthMm,
        fixedRunnerOpenOffsetMm: openOffset
      });
      const handleZ = frontT / 2 + num(params, "handleProjectionMm", 28) / 2;
      addCylinder(drawerGroup, `${prefix}drawer_handle_${index + 1}`, 6, Math.min(num(params, "handleLengthMm", 160), width - 120), { x: 0, y: drawerH * 0.28, z: handleZ }, hardware, "x");
      y += drawerH / 2 + gap;
    }
    if (!mixedWithDoors) return;

    const doorZoneStart = plinth + gap + drawerZoneHeight + gap;
    const doorZoneHeight = Math.max(80, frontAreaHeight - drawerZoneHeight - gap);
    const eachW = Math.max(40, (width - sideGap * 2 - gap * (doorCount - 1)) / doorCount);
    for (let index = 0; index < doorCount; index += 1) {
      const x = -width / 2 + sideGap + eachW / 2 + index * (eachW + gap);
      addSwingDoorLeaf(group, params, frontMat, hardware, {
        name: `${prefix}door_${index + 1}`,
        widthMm: eachW,
        heightMm: doorZoneHeight,
        xCenterMm: x,
        yCenterMm: doorZoneStart + doorZoneHeight / 2,
        zCenterMm: z,
        doorIndex: index,
        doorCount
      });
    }
    return;
  }

  if (doorCount > 0) {
    const eachW = Math.max(40, (width - sideGap * 2 - gap * (doorCount - 1)) / doorCount);
    for (let index = 0; index < doorCount; index += 1) {
      const x = -width / 2 + sideGap + eachW / 2 + index * (eachW + gap);
      addSwingDoorLeaf(group, params, frontMat, hardware, {
        name: `${prefix}door_${index + 1}`,
        widthMm: eachW,
        heightMm: frontAreaHeight,
        xCenterMm: x,
        yCenterMm: plinth + frontAreaHeight / 2 + gap,
        zCenterMm: z,
        doorIndex: index,
        doorCount
      });
    }
  }
}

function readTwoTierBottlePulloutHeights(params: FwmFurnitureParams, availableHeight: number, gap: number) {
  const raw = typeof params.drawerFrontHeightsMm === "string"
    ? params.drawerFrontHeightsMm
      .split(",")
      .map((entry) => Number(entry.trim()))
      .filter((entry) => Number.isFinite(entry) && entry > 0)
      .slice(0, 2)
    : [];
  const tierAvailable = Math.max(80, availableHeight - gap);
  if (raw.length === 2) {
    const sum = raw[0]! + raw[1]!;
    return sum > 0 ? raw.map((entry) => Math.max(40, (entry / sum) * tierAvailable)) : [tierAvailable / 2, tierAvailable / 2];
  }
  return [tierAvailable / 2, tierAvailable / 2];
}

function buildCatalogBaseBottlePullout(group: THREE.Group, params: FwmFurnitureParams, catalog: ClientCatalog) {
  const width = num(params, "width", 200);
  const height = num(params, "height", 722);
  const depth = num(params, "depth", 530);
  const plinth = num(params, "plinthHeight", 100);
  const frontGap = num(params, "frontGap", 2);
  const sideGap = num(params, "sideGap", 2);
  const frontT = num(params, "frontThicknessMm", 18);
  const frontDepthAllowance = frontT + 1;
  const carcassDepth = Math.max(1, depth - frontDepthAllowance);
  const carcassZOffset = -frontDepthAllowance / 2;
  const frontMat = makeMaterial(params, catalog, "front");
  const hardware = makeMaterial(params, catalog, "hardware");
  const handleComponent = resolveComponentForParam(params, catalog, "handleComponentId", "handle");
  const handleMat = makeComponentMaterial(params, catalog, handleComponent, hardware);

  addCarcass(
    group,
    { ...params, drawerCount: 0, doorCount: 0, shelfCount: 0 } as FwmFurnitureParams,
    catalog,
    { width, height, depth: carcassDepth, envelopeDepth: depth, zOffset: carcassZOffset, topRails: true }
  );

  const frontAreaHeight = Math.max(80, height - plinth - frontGap * 2);
  const frontZ = carcassZOffset + carcassDepth / 2 + frontT / 2 + 1;
  const opened = bool(params, "opened", false);
  const openOffset = opened ? Math.min(220, depth * 0.42) : 0;
  const pulloutGroup = new THREE.Group();
  pulloutGroup.name = "bottle_pullout_group";
  pulloutGroup.position.set(0, 0, (frontZ + openOffset) * MM);
  pulloutGroup.userData.selectableSubmoduleId = "bottle_pullout";
  pulloutGroup.userData.submoduleKind = "bottle_pullout";
  group.add(pulloutGroup);

  const front = addBox(
    pulloutGroup,
    "bottle_pullout_front",
    { width: Math.max(40, width - sideGap * 2), height: frontAreaHeight, depth: frontT },
    { x: 0, y: plinth + frontGap + frontAreaHeight / 2, z: 0 },
    frontMat,
    ["width", "height", "frontThicknessMm", "frontGap", "sideGap", "opened", "handleComponentId"]
  );
  front.userData.submoduleKind = "bottle_pullout";
  front.userData.selectableSubmoduleId = "bottle_pullout";
  front.userData.edgeBandingStrategy = "explicit_visible_edges";
  front.userData.edgeBanding = [{
    edgeId: "front_visible_edges",
    role: "visible_front",
    axis: "XY",
    materialSlotId: "front"
  }];

  const handleLength = Math.max(40, Math.min(num(params, "handleLengthMm", 120), Math.max(40, width - 80)));
  const handle = addCylinder(
    pulloutGroup,
    "bottle_pullout_handle",
    6,
    handleLength,
    {
      x: 0,
      y: plinth + frontGap + frontAreaHeight * 0.78,
      z: frontT / 2 + 0.789 + 6
    },
    handleMat,
    "x"
  );
  markComponent(handle, handleComponent, "handleComponentId");
  handle.userData.submoduleKind = "bottle_pullout";
  handle.userData.selectableSubmoduleId = "bottle_pullout";

  const neutralDrawerDepth = resolveDrawerDepthLayout(carcassDepth, num(params, "backThickness", 8), num(params, "drawerBackGapMm", 10));
  const metalDrawerDepth = neutralDrawerDepth.depthMm;
  const drawerCenterWorldZ = neutralDrawerDepth.centerZ;
  const drawerCenterLocalZ = drawerCenterWorldZ - frontZ;
  const tierHeights = readTwoTierBottlePulloutHeights(params, frontAreaHeight, Math.max(24, frontGap));
  let cursorY = plinth + frontGap;
  for (let index = 0; index < 2; index += 1) {
    const tierHeight = Math.max(40, tierHeights[index] ?? tierHeights[0] ?? 120);
    const tierGroup = new THREE.Group();
    tierGroup.name = `bottle_pullout_tier_${index + 1}_group`;
    tierGroup.position.set(0, (cursorY + tierHeight / 2) * MM, 0);
    tierGroup.userData.selectableSubmoduleId = "bottle_pullout";
    tierGroup.userData.submoduleKind = "drawer";
    tierGroup.userData.parentDrawerIndex = index + 1;
    pulloutGroup.add(tierGroup);
    addDrawerSubmodule(tierGroup, params, catalog, {
      prefix: "bottle_",
      index: index + 1,
      widthMm: Math.max(40, width - sideGap * 2),
      frontHeightMm: tierHeight,
      drawerCenterZMm: drawerCenterLocalZ,
      drawerDepthMm: metalDrawerDepth,
      fixedRunnerOpenOffsetMm: openOffset
    });
    cursorY += tierHeight + Math.max(24, frontGap);
  }
}

function addWorktop(group: THREE.Group, params: FwmFurnitureParams, catalog: ClientCatalog, opts: { width?: number; depth?: number; height?: number; prefix?: string } = {}) {
  void group;
  void params;
  void catalog;
  void opts;
}

function paramsForExternalKitchenWorktop(params: FwmFurnitureParams, spec: FwmFurnitureSpec): FwmFurnitureParams {
  if (spec.geometryKind === "worktop") return params;
  const worktopThicknessMm = num(params, "worktopThicknessMm", 0);
  const heightCarcassMm = num(params, "heightCarcass", Number.NaN);
  const requiresWorktop = params.requiresWorktop !== false && worktopThicknessMm > 0;
  if (!requiresWorktop || !Number.isFinite(heightCarcassMm) || heightCarcassMm <= 0) return params;
  return {
    ...params,
    height: heightCarcassMm,
    heightMm: heightCarcassMm,
    hasWorktop: false
  } as FwmFurnitureParams;
}

function addAppliance(group: THREE.Group, params: FwmFurnitureParams, catalog: ClientCatalog, name: string, y: number, h: number) {
  const width = Math.min(num(params, "applianceWidthMm", 560), num(params, "width", 600) - 70);
  const depth = Math.max(160, num(params, "depth", 560) - 70);
  addBox(group, name, { width, height: h, depth }, { x: 0, y, z: 20 }, makeMaterial(params, catalog, "appliance"), ["applianceWidthMm", "width", "height", "depth"]);
}

type TallStackSlotType = "empty" | "drawer" | "shelf" | "oven" | "sink" | "microwave" | "door";

const TALL_STACK_SLOT_TYPES: readonly TallStackSlotType[] = ["empty", "drawer", "shelf", "oven", "sink", "microwave", "door"];
const DEFAULT_TALL_STACK: Array<{ type: TallStackSlotType; height: number }> = [];

function tallSlotType(params: FwmFurnitureParams, index: number): TallStackSlotType {
  const fallback = DEFAULT_TALL_STACK[index - 1]?.type ?? "empty";
  const value = String(params[`tallSlot${index}Type`] ?? fallback);
  return TALL_STACK_SLOT_TYPES.includes(value as TallStackSlotType) ? value as TallStackSlotType : fallback;
}

function tallSlotHeight(params: FwmFurnitureParams, index: number) {
  return Math.max(0, num(params, `tallSlot${index}HeightMm`, DEFAULT_TALL_STACK[index - 1]?.height ?? 0));
}

function tallSlotOffset(params: FwmFurnitureParams, index: number) {
  return num(params, `tallSlot${index}OffsetMm`, 0);
}

function markTallSelectableSubmodule(group: THREE.Object3D, args: { id: string; label: string; kind: string; slotIndex: number }) {
  group.traverse((child) => {
    child.userData.selectableSubmoduleId = args.id;
    child.userData.selectableSubmoduleLabel = args.label;
    child.userData.selectableSubmoduleKind = args.kind;
    child.userData.submoduleKind = child.userData.submoduleKind ?? args.kind;
    child.userData.hostSlotIndex = args.slotIndex;
  });
}

function visibleObjectBounds(object: THREE.Object3D) {
  object.updateMatrixWorld(true);
  const bounds = new THREE.Box3();
  let hasVisiblePart = false;
  object.traverse((child) => {
    if (!(child as THREE.Mesh).isMesh || child.visible === false || child.userData.hiddenByDefault === true) return;
    bounds.union(new THREE.Box3().setFromObject(child));
    hasVisiblePart = true;
  });
  return hasVisiblePart ? bounds : new THREE.Box3().setFromObject(object);
}

function addTallApplianceSubmodule(
  group: THREE.Group,
  params: FwmFurnitureParams,
  catalog: ClientCatalog,
  type: Extract<ApplianceSubmoduleType, "oven" | "sink" | "microwave">,
  slotIndex: number,
  bottomY: number,
  slotHeight: number
) {
  const cabinetWidth = num(params, "width", 600);
  const cabinetDepth = num(params, "depth", 560);
  const defaults = makeDefaultApplianceSubmoduleParams(type);
  const applianceParams = {
    ...defaults,
    width: Math.min(defaults.width, Math.max(120, cabinetWidth - 5)),
    height: Math.max(80, slotHeight - 4),
    depth: Math.min(defaults.depth, Math.max(120, cabinetDepth - 20)),
    hostOpeningWidthMm: Math.max(defaults.hostOpeningWidthMm, cabinetWidth),
    hostOpeningHeightMm: Math.max(defaults.hostOpeningHeightMm, slotHeight),
    hostOpeningDepthMm: Math.max(defaults.hostOpeningDepthMm, cabinetDepth)
  };
  const submodule = buildApplianceSubmodule(applianceParams, catalog);
  submodule.name = `tower_${type}_submodule_${slotIndex}`;
  const submoduleBounds = visibleObjectBounds(submodule);
  const submoduleCenterX = ((submoduleBounds.min.x + submoduleBounds.max.x) / 2) / MM;
  const submoduleMinY = submoduleBounds.min.y / MM;
  submodule.position.set(
    -submoduleCenterX * MM,
    (bottomY - submoduleMinY) * MM,
    (cabinetDepth / 2 - applianceParams.depth / 2 - 3) * MM
  );
  submodule.traverse((child) => {
    child.userData.hostModuleType = params.type;
    child.userData.hostSlotIndex = slotIndex;
    child.userData.paramKeys = Array.from(new Set([...(child.userData.paramKeys ?? []), `tallSlot${slotIndex}Type`, `tallSlot${slotIndex}HeightMm`, `tallSlot${slotIndex}OffsetMm`, "width", "depth"]));
  });
  markTallSelectableSubmodule(submodule, {
    id: `tower_${type}_${slotIndex}`,
    label: `Slot ${slotIndex} ${type}`,
    kind: "appliance",
    slotIndex
  });
  group.add(submodule);
}

function addTallDrawerSlot(
  group: THREE.Group,
  params: FwmFurnitureParams,
  catalog: ClientCatalog,
  slotIndex: number,
  drawerIndex: number,
  bottomY: number,
  slotHeight: number,
  coverBottomMm = 0,
  coverTopMm = 0
) {
  const width = num(params, "width", 600);
  const depth = num(params, "depth", 560);
  const gap = num(params, "frontGap", 2);
  const sideGap = num(params, "sideGap", 2);
  const frontT = num(params, "frontThicknessMm", 18);
  const frontBottomY = bottomY - coverBottomMm + (coverBottomMm > 0 ? 0 : gap / 2);
  const frontTopY = bottomY + slotHeight + coverTopMm - (coverTopMm > 0 ? 0 : gap / 2);
  const frontHeight = Math.max(40, frontTopY - frontBottomY);
  const drawerGroup = new THREE.Group();
  drawerGroup.name = `tower_drawer_front_${drawerIndex}_group`;
  const frontWorldZ = depth / 2 + frontT / 2 + 1;
  drawerGroup.position.set(0, (frontBottomY + frontHeight / 2) * MM, frontWorldZ * MM);
  group.add(drawerGroup);
  addBox(drawerGroup, `tower_drawer_front_${drawerIndex}`, { width: width - sideGap * 2, height: frontHeight, depth: frontT }, { x: 0, y: 0, z: 0 }, makeMaterial(params, catalog, "front"), ["tallStackMode", `tallSlot${slotIndex}Type`, `tallSlot${slotIndex}HeightMm`, `tallSlot${slotIndex}OffsetMm`, "frontMaterialId"]);
  const neutralDrawerDepth = resolveDrawerDepthLayout(depth, num(params, "backThickness", 8), num(params, "drawerBackGapMm", 10));
  addDrawerSubmodule(drawerGroup, params, catalog, {
    prefix: "tower_",
    index: drawerIndex,
    widthMm: width - sideGap * 2,
    frontHeightMm: frontHeight,
    drawerCenterZMm: neutralDrawerDepth.centerZ - frontWorldZ,
    drawerDepthMm: neutralDrawerDepth.depthMm
  });
  addCylinder(drawerGroup, `tower_drawer_handle_${drawerIndex}`, 6, Math.min(num(params, "handleLengthMm", 160), width - 120), { x: 0, y: Math.max(18, frontHeight * 0.26), z: frontT / 2 + num(params, "handleProjectionMm", 28) / 2 }, makeMaterial(params, catalog, "hardware"), "x");
  markTallSelectableSubmodule(drawerGroup, {
    id: `tower_drawer_${drawerIndex}`,
    label: `Slot ${slotIndex} drawer ${drawerIndex}`,
    kind: "drawer",
    slotIndex
  });
}

function addTallShelfSlot(group: THREE.Group, params: FwmFurnitureParams, catalog: ClientCatalog, slotIndex: number, bottomY: number, slotHeight: number, hiddenUnderPreviousDrawer = false) {
  const width = num(params, "width", 600);
  const depth = num(params, "depth", 560);
  const t = num(params, "boardThickness", 18);
  const shelfT = Math.max(8, Math.min(slotHeight || num(params, "shelfThickness", t), num(params, "shelfThickness", t)));
  const back = num(params, "backThickness", 8);
  const shelfBottomY = hiddenUnderPreviousDrawer ? bottomY - shelfT : bottomY;
  const shelf = addBox(group, `tower_shelf_${slotIndex}`, { width: Math.max(1, width - t * 2), height: shelfT, depth: Math.max(1, depth - back) }, { x: 0, y: shelfBottomY + shelfT / 2, z: back / 2 }, makeMaterial(params, catalog, "shelf"), ["tallStackMode", `tallSlot${slotIndex}Type`, `tallSlot${slotIndex}HeightMm`, `tallSlot${slotIndex}OffsetMm`, "shelfMaterialId"]);
  markTallSelectableSubmodule(shelf, {
    id: `tower_shelf_${slotIndex}`,
    label: `Slot ${slotIndex} shelf`,
    kind: "shelf",
    slotIndex
  });
}

function addTallDoorSlot(
  group: THREE.Group,
  params: FwmFurnitureParams,
  catalog: ClientCatalog,
  slotIndex: number,
  bottomY: number,
  slotHeight: number,
  coverBottomMm = 0,
  coverTopMm = 0
) {
  const width = num(params, "width", 600);
  const depth = num(params, "depth", 560);
  const frontT = num(params, "frontThicknessMm", 18);
  const sideGap = num(params, "sideGap", 2);
  const gap = num(params, "frontGap", 2);
  const leafCount = Math.max(1, Math.min(2, Math.round(num(params, `tallSlot${slotIndex}DoorLeafCount`, 1))));
  const openingMode = String(params[`tallSlot${slotIndex}DoorOpeningMode`] ?? "hinged") === "lift_up" ? "lift_up" : "hinged";
  const frontBottomY = bottomY - coverBottomMm + (coverBottomMm > 0 ? 0 : gap);
  const frontTopY = bottomY + slotHeight + coverTopMm - (coverTopMm > 0 ? 0 : gap);
  const frontHeight = Math.max(60, frontTopY - frontBottomY);
  const fullFrontWidth = Math.max(60, width - sideGap * 2);
  const leafGap = leafCount > 1 ? gap : 0;
  const leafWidth = Math.max(40, (fullFrontWidth - leafGap * (leafCount - 1)) / leafCount);
  const material = makeMaterial(params, catalog, "front");
  const hardware = makeMaterial(params, catalog, "hardware");
  const doorGroup = new THREE.Group();
  doorGroup.name = `tower_door_submodule_${slotIndex}`;
  group.add(doorGroup);
  for (let index = 0; index < leafCount; index += 1) {
    const xCenter = -fullFrontWidth / 2 + leafWidth / 2 + index * (leafWidth + leafGap);
    const leafName = leafCount === 1 ? `tower_door_${slotIndex}` : `tower_door_${slotIndex}_${index + 1}`;
    if (openingMode === "lift_up") {
      const pivot = new THREE.Group();
      pivot.name = `${leafName}_lift_pivot`;
      pivot.position.set(xCenter * MM, frontTopY * MM, (depth / 2 + frontT / 2 + 1) * MM);
      pivot.rotation.x = bool(params, "opened", false) ? -Math.PI * 0.42 : 0;
      doorGroup.add(pivot);
      addBox(
        pivot,
        leafName,
        { width: leafWidth, height: frontHeight, depth: frontT },
        { x: 0, y: -frontHeight / 2, z: 0 },
        material,
        ["tallStackMode", `tallSlot${slotIndex}Type`, `tallSlot${slotIndex}HeightMm`, `tallSlot${slotIndex}DoorLeafCount`, `tallSlot${slotIndex}DoorOpeningMode`, "frontThicknessMm", "frontGap", "handleComponentId", "opened"]
      );
      for (const hingeX of [-leafWidth * 0.3, leafWidth * 0.3]) {
        const plate = addBox(
          pivot,
          `${leafName}_hinge_top_${hingeX < 0 ? "left" : "right"}`,
          { width: 64, height: 24, depth: 6 },
          { x: hingeX, y: -12, z: -frontT / 2 - 3 },
          hardware,
          ["tallStackMode", `tallSlot${slotIndex}DoorOpeningMode`, "hingeComponentId", "opened"]
        );
        plate.userData.componentType = "hinge";
      }
      addCylinder(
        pivot,
        `${leafName}_handle`,
        5,
        Math.min(num(params, "handleLengthMm", 160), leafWidth * 0.55),
        { x: 0, y: -frontHeight + Math.max(38, frontHeight * 0.12), z: frontT * 0.5 + num(params, "handleProjectionMm", 28) * 0.5 },
        hardware,
        "x"
      );
      continue;
    }
    const leaf = addSwingDoorLeaf(doorGroup, params, material, hardware, {
      name: leafName,
      widthMm: leafWidth,
      heightMm: frontHeight,
      xCenterMm: xCenter,
      yCenterMm: frontBottomY + frontHeight / 2,
      zCenterMm: depth / 2 + frontT / 2 + 1,
      doorIndex: index,
      doorCount: leafCount
    });
    leaf.userData.paramKeys = Array.from(new Set([...(leaf.userData.paramKeys ?? []), `tallSlot${slotIndex}DoorLeafCount`, `tallSlot${slotIndex}DoorOpeningMode`]));
  }
  markTallSelectableSubmodule(doorGroup, {
    id: `tower_door_${slotIndex}`,
    label: `Slot ${slotIndex} door`,
    kind: "door",
    slotIndex
  });
}

function buildCatalogTallStackBuilder(group: THREE.Group, params: FwmFurnitureParams, catalog: ClientCatalog) {
  const width = num(params, "width", 600);
  const height = num(params, "height", 2080);
  const depth = num(params, "depth", 560);
  const t = num(params, "boardThickness", 18);
  const plinth = num(params, "plinthHeight", 100);
  addCarcass(group, { ...params, doorCount: 0, drawerCount: 0, shelfCount: 0, applianceKind: "none" } as FwmFurnitureParams, catalog, { width, height, depth, namePrefix: "tower" });

  const slotCount = Math.max(0, Math.min(12, Math.round(num(params, "tallSlotCount", DEFAULT_TALL_STACK.length))));
  const slots = Array.from({ length: slotCount }, (_, index) => ({
    index: index + 1,
    type: tallSlotType(params, index + 1),
    height: tallSlotHeight(params, index + 1),
    offset: tallSlotOffset(params, index + 1)
  }));
  const nonShelfSlots = slots.filter((slot) => slot.type !== "shelf" && slot.type !== "empty");
  const usableBottom = plinth + t;
  const usableHeight = Math.max(80, height - plinth - t * 2);
  const fixedTotal = slots.reduce((sum, slot) => sum + (slot.type !== "shelf" && slot.type !== "empty" && slot.height > 0 ? slot.height : 0), 0);
  const fillSlots = slots.filter((slot) => slot.type !== "shelf" && slot.type !== "empty" && slot.height <= 0).length;
  const fillHeight = fillSlots > 0 ? Math.max(60, (usableHeight - fixedTotal) / fillSlots) : 0;
  const shouldScaleOverflow = String(params.tallStackMode ?? "builder") !== "builder";
  const scale = shouldScaleOverflow && fillSlots === 0 && fixedTotal > usableHeight ? usableHeight / fixedTotal : 1;
  let cursor = usableBottom;
  let drawerIndex = 1;
  let previousSlotType: TallStackSlotType | null = null;
  let previousNonShelfType: TallStackSlotType | null = null;
  let lastShelfTopY: number | null = null;
  let shelfAtCurrentBoundary = false;
  for (const slot of slots) {
    const slotHeight = slot.height > 0 ? Math.max(8, slot.height * scale) : fillHeight;
    const slotBottomY = cursor + slot.offset;
    const isMoved = Math.abs(slot.offset) > 0.001;
    if (slot.type === "drawer") {
      addTallDrawerSlot(group, params, catalog, slot.index, drawerIndex, slotBottomY, slotHeight, drawerIndex === 1 || shelfAtCurrentBoundary ? t : 0, 0);
      drawerIndex += 1;
      cursor += slotHeight;
      previousNonShelfType = slot.type;
      shelfAtCurrentBoundary = false;
    } else if (slot.type === "shelf") {
      const nextNonShelf = slots.slice(slot.index).find((candidate) => candidate.type !== "shelf" && candidate.type !== "empty")?.type ?? null;
      const topY = previousNonShelfType === "drawer" && !isMoved && (nextNonShelf === "oven" || nextNonShelf === "sink" || nextNonShelf === "microwave")
        ? cursor - num(params, "frontGap", 2) / 2
        : slotBottomY;
      if (lastShelfTopY == null || Math.abs(lastShelfTopY - topY) > 0.01) {
        addTallShelfSlot(group, params, catalog, slot.index, topY, slotHeight, true);
        lastShelfTopY = topY;
      }
      if (!isMoved) cursor = topY;
      shelfAtCurrentBoundary = !isMoved;
    } else if (slot.type === "oven" || slot.type === "sink" || slot.type === "microwave") {
      if (!shelfAtCurrentBoundary) {
        addTallShelfSlot(group, params, catalog, slot.index, cursor, num(params, "shelfThickness", t), true);
        shelfAtCurrentBoundary = true;
      }
      addTallApplianceSubmodule(group, params, catalog, slot.type, slot.index, slotBottomY, slotHeight);
      cursor += slotHeight;
      previousNonShelfType = slot.type;
      shelfAtCurrentBoundary = false;
    } else if (slot.type === "door") {
      const remainingFrontSlots = nonShelfSlots.filter((candidate) => candidate.index > slot.index && (candidate.type === "door" || candidate.type === "drawer"));
      const coverTop = remainingFrontSlots.length === 0 ? t + num(params, "frontGap", 2) / 2 : 0;
      addTallDoorSlot(group, params, catalog, slot.index, slotBottomY, slotHeight, shelfAtCurrentBoundary ? t : 0, coverTop);
      cursor += slotHeight;
      previousNonShelfType = slot.type;
      shelfAtCurrentBoundary = false;
    } else if (slot.type === "empty") {
      cursor += Math.max(0, slot.height);
      shelfAtCurrentBoundary = false;
    }
    previousSlotType = slot.type;
  }
  group.userData.tallStackSlots = slots;
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

function buildCatalogWorktopSurface(group: THREE.Group, params: FwmFurnitureParams, catalog: ClientCatalog) {
  const w = num(params, "width", 1000);
  const d = num(params, "depth", 600);
  const t = Math.max(10, num(params, "worktopThicknessMm", num(params, "height", 38)));
  const mat = makeMaterial(params, catalog, "worktop");
  const shape = String(params.shape ?? "none");
  const variant = shape !== "none" ? shape : String(params.variant ?? "straight");
  const radius = Math.max(50, num(params, "cornerRadiusMm", Math.min(w, d) * 0.5));
  if (variant === "round") {
    addCylinder(group, "worktop_round_surface", Math.min(radius, Math.min(w, d) * 0.5), t, { x: 0, y: t / 2, z: 0 }, mat, "y", ["width", "depth", "worktopThicknessMm", "worktopMaterialId", "shape", "cornerRadiusMm"]);
    return;
  }
  if (variant === "half_round") {
    addBox(group, "worktop_half_round_rect", { width: w, height: t, depth: d * 0.55 }, { x: 0, y: t / 2, z: -d * 0.225 }, mat, ["width", "depth", "worktopThicknessMm", "worktopMaterialId", "variant"]);
    addCylinder(group, "worktop_half_round_front", Math.min(radius, Math.max(50, w * 0.5)), t, { x: 0, y: t / 2, z: d * 0.05 }, mat, "y", ["width", "depth", "worktopThicknessMm", "worktopMaterialId", "shape", "cornerRadiusMm"]);
    return;
  }
  addBox(group, "worktop_surface", { width: w, height: t, depth: d }, { x: 0, y: t / 2, z: 0 }, mat, ["width", "depth", "worktopThicknessMm", "worktopMaterialId", "variant"]);
  if (variant.includes("corner")) {
    addBox(group, "worktop_corner_return", { width: Math.max(120, d), height: t, depth: Math.max(120, w * 0.45) }, { x: -w / 2 + Math.max(120, d) / 2, y: t / 2, z: -d / 2 - Math.max(120, w * 0.45) / 2 }, mat, ["width", "depth", "worktopThicknessMm", "variant"]);
  }
  const cutoutW = num(params, "cutoutWidthMm", variant.includes("cutout") ? Math.min(520, w * 0.45) : 0);
  const cutoutD = num(params, "cutoutDepthMm", variant.includes("cutout") ? Math.min(400, d * 0.45) : 0);
  if (cutoutW > 0 && cutoutD > 0) {
    addBox(group, "worktop_cutout_marker", { width: Math.min(cutoutW, w - 80), height: 4, depth: Math.min(cutoutD, d - 80) }, { x: 0, y: t + 2, z: 0 }, makeMaterial(params, catalog, "hardware"), ["shape", "cutoutWidthMm", "cutoutDepthMm", "width", "depth"]);
  }
  if (variant === "chamfered" || String(params.variant ?? "").includes("chamfered")) {
    const chamfer = Math.min(num(params, "chamferMm", 120), w * 0.35, d * 0.35);
    addBox(group, "worktop_chamfer_marker", { width: chamfer, height: 5, depth: chamfer }, { x: w / 2 - chamfer / 2, y: t + 4, z: d / 2 - chamfer / 2 }, makeMaterial(params, catalog, "hardware"), ["shape", "chamferMm"]);
  }
}

function buildCatalogShelfSurface(group: THREE.Group, params: FwmFurnitureParams, catalog: ClientCatalog) {
  const w = num(params, "width", 600);
  const d = num(params, "depth", 300);
  const t = Math.max(4, num(params, "shelfThickness", num(params, "height", 18)));
  const count = Math.max(1, Math.round(num(params, "shelfCount", 1)));
  const mat = String(params.variant ?? "").includes("glass") || String(params.frontType ?? "") === "glass" || bool(params, "glassFronts", false)
    ? makeMaterial(params, catalog, "glass")
    : makeMaterial(params, catalog, "shelf");
  for (let index = 0; index < count; index += 1) {
    const y = t / 2 + index * Math.max(90, t + 80);
    addBox(group, `free_shelf_${index + 1}`, { width: w, height: t, depth: d }, { x: 0, y, z: 0 }, mat, ["width", "depth", "shelfThickness", "shelfCount", "shelfMaterialId", "variant"]);
  }
}

function buildCatalogTrim(group: THREE.Group, params: FwmFurnitureParams, catalog: ClientCatalog) {
  const w = num(params, "width", 600);
  const h = num(params, "height", 100);
  const d = num(params, "depth", 18);
  const mat = makeMaterial(params, catalog, String(params.variant ?? "").includes("plinth") ? "plinth" : "body");
  addBox(group, "trim_panel", { width: w, height: h, depth: d }, { x: 0, y: h / 2, z: 0 }, mat, ["width", "height", "depth", "variant", "bodyMaterialId", "plinthMaterialId"]);
}

function buildCatalogFrontComponent(group: THREE.Group, params: FwmFurnitureParams, catalog: ClientCatalog) {
  const w = num(params, "width", 450);
  const h = num(params, "height", 722);
  const t = num(params, "frontThicknessMm", num(params, "depth", 20));
  const frontType = String(params.frontType ?? "solid");
  const variant = frontType !== "solid" ? frontType : String(params.variant ?? "base_1d");
  const isGlass = variant.includes("glass") || bool(params, "glassFronts", false);
  const frontMat = makeMaterial(params, catalog, isGlass ? "glass" : "front");
  const hardware = makeMaterial(params, catalog, "hardware");
  if (variant.includes("aluminium_frame") || variant.includes("aluminum_frame")) {
    const frame = Math.max(32, Math.min(70, w * 0.12));
    addBox(group, "front_frame_left", { width: frame, height: h, depth: t }, { x: -w / 2 + frame / 2, y: h / 2, z: 0 }, hardware, ["width", "height", "frontThicknessMm", "variant"]);
    addBox(group, "front_frame_right", { width: frame, height: h, depth: t }, { x: w / 2 - frame / 2, y: h / 2, z: 0 }, hardware, ["width", "height", "frontThicknessMm", "variant"]);
    addBox(group, "front_frame_top", { width: w, height: frame, depth: t }, { x: 0, y: h - frame / 2, z: 0 }, hardware, ["width", "height", "frontThicknessMm", "variant"]);
    addBox(group, "front_frame_bottom", { width: w, height: frame, depth: t }, { x: 0, y: frame / 2, z: 0 }, hardware, ["width", "height", "frontThicknessMm", "variant"]);
    addBox(group, "front_glass_insert", { width: Math.max(1, w - frame * 2), height: Math.max(1, h - frame * 2), depth: Math.max(4, t * 0.35) }, { x: 0, y: h / 2, z: 1 }, makeMaterial(params, catalog, "glass"), ["width", "height", "variant"]);
    return;
  }
  addBox(group, "front_component_panel", { width: w, height: h, depth: t }, { x: 0, y: h / 2, z: 0 }, frontMat, ["width", "height", "frontThicknessMm", "frontMaterialId", "variant"]);
  if (variant.includes("profiled")) {
    addBox(group, "front_profile_center", { width: Math.max(20, w - 80), height: 16, depth: 6 }, { x: 0, y: h * 0.5, z: t / 2 + 3 }, hardware, ["variant", "width"]);
  }
}

function buildCatalogAccessory(group: THREE.Group, params: FwmFurnitureParams, catalog: ClientCatalog) {
  const w = num(params, "width", 380);
  const h = num(params, "height", 100);
  const d = num(params, "depth", 300);
  const variant = String(params.variant ?? "generic_accessory");
  const hardware = makeMaterial(params, catalog, "hardware");
  if (variant.includes("conical_leg")) {
    addCylinder(group, "conical_leg", Math.max(12, Math.min(w, d) * 0.12), h, { x: 0, y: h / 2, z: 0 }, hardware, "y", ["width", "height", "depth", "variant"]);
    return;
  }
  if (variant.includes("wire_basket")) {
    const rod = 8;
    addBox(group, "wire_basket_front", { width: w, height: rod, depth: rod }, { x: 0, y: h, z: d / 2 }, hardware, ["width", "height", "depth", "variant"]);
    addBox(group, "wire_basket_back", { width: w, height: rod, depth: rod }, { x: 0, y: h, z: -d / 2 }, hardware, ["width", "height", "depth", "variant"]);
    addBox(group, "wire_basket_left", { width: rod, height: rod, depth: d }, { x: -w / 2, y: h, z: 0 }, hardware, ["width", "height", "depth", "variant"]);
    addBox(group, "wire_basket_right", { width: rod, height: rod, depth: d }, { x: w / 2, y: h, z: 0 }, hardware, ["width", "height", "depth", "variant"]);
    for (let index = 0; index < 4; index += 1) {
      addBox(group, `wire_basket_floor_rod_${index + 1}`, { width: w, height: rod, depth: rod }, { x: 0, y: rod / 2, z: -d / 2 + ((index + 1) * d) / 5 }, hardware, ["variant", "width", "depth"]);
    }
    return;
  }
  if (variant.includes("point_light")) {
    addCylinder(group, "point_light", Math.max(20, Math.min(w, d) * 0.22), Math.max(8, h), { x: 0, y: h / 2, z: 0 }, hardware, "y", ["width", "height", "depth", "variant"]);
    return;
  }
  if (variant.includes("lumina") || variant.includes("sada") || variant.includes("light")) {
    addBox(group, "light_bar", { width: w, height: h, depth: d }, { x: 0, y: h / 2, z: 0 }, hardware, ["width", "height", "depth", "variant"]);
    return;
  }
  addBox(group, "accessory_body", { width: w, height: h, depth: d }, { x: 0, y: h / 2, z: 0 }, hardware, ["width", "height", "depth", "variant"]);
}

export function buildFwmFurniture(params: FwmFurnitureParams, catalog: ClientCatalog): THREE.Group {
  const normalized = normalizeFwmFurnitureParams(params);
  const spec = getFwmFurnitureSpec(normalized.type);
  const p = paramsForExternalKitchenWorktop(normalized, spec);
  const group = new THREE.Group();
  group.name = `${normalized.type}_module`;
  group.userData.modulePackageBuildParameters = { ...normalized };
  group.userData.moduleRenderableBuildParameters = { ...p };
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
    corpus: "corpus",
    front: "front",
    back: "back",
    shelf: "corpus",
    worktop: "worktop",
    drawerBottom: "drawer_bottom",
    hardware: "hardware"
  };
  group.userData.systemParameters = {
    typeId: `${spec.moduleType}__type`,
    type: spec.moduleType,
    displayName: spec.displayName,
    family: getFwmSystemFamily(spec),
    assemblyContext: getFwmAssemblyContext(spec),
    roomCategory: getFwmRoomCategory(spec),
    kitchenModuleRole: spec.kitchenRole ?? null,
    requiresWorktop: spec.geometryKind !== "worktop" && (spec.hasWorktop === true || spec.moduleType === "fwm_catalog_base_corner"),
    ifcClass: "IfcFurniture",
    ifcObjectType: getFwmSystemFamily(spec),
    ifcTag: `${spec.moduleType}__type`
  };
  const finish = () => {
    group.updateMatrixWorld(true);
    return normalizeFwmMaterialMetadata(group);
  };

  if (spec.geometryKind === "bed") {
    buildBed(group, p, catalog);
    return finish();
  }
  if (spec.geometryKind === "table") {
    buildTable(group, p, catalog);
    return finish();
  }
  if (spec.geometryKind === "worktop") {
    buildCatalogWorktopSurface(group, p, catalog);
    return finish();
  }
  if (spec.geometryKind === "shelf_surface") {
    buildCatalogShelfSurface(group, p, catalog);
    return finish();
  }
  if (spec.geometryKind === "trim") {
    buildCatalogTrim(group, p, catalog);
    return finish();
  }
  if (spec.geometryKind === "front_component") {
    buildCatalogFrontComponent(group, p, catalog);
    return finish();
  }
  if (spec.geometryKind === "accessory") {
    buildCatalogAccessory(group, p, catalog);
    return finish();
  }
  if (spec.geometryKind === "cladding") {
    addBox(group, "cladding_panel", { width: num(p, "width", spec.width), height: num(p, "height", spec.height), depth: num(p, "depth", spec.depth) }, { x: 0, y: num(p, "height", spec.height) / 2, z: 0 }, makeMaterial(p, catalog, "front"), ["width", "height", "depth", "frontMaterialId", "variant"]);
    const slatCount = String(p.variant).includes("slat") ? 8 : 4;
    for (let index = 0; index < slatCount; index += 1) {
      const x = -num(p, "width", spec.width) / 2 + ((index + 0.5) * num(p, "width", spec.width)) / slatCount;
      addBox(group, `relief_${index + 1}`, { width: 12, height: num(p, "height", spec.height), depth: 10 }, { x, y: num(p, "height", spec.height) / 2, z: num(p, "depth", spec.depth) / 2 + 5 }, makeMaterial(p, catalog, "body"), ["variant"]);
    }
    return finish();
  }

  if (spec.geometryKind === "island") {
    addCarcass(group, p, catalog, { width: num(p, "width", spec.width), height: num(p, "height", spec.height), depth: num(p, "depth", spec.depth) });
    addFronts(group, p, catalog);
    addFronts(group, { ...p, drawerCount: 0, doorCount: Math.max(2, num(p, "doorCount", 2)) } as FwmFurnitureParams, catalog, { prefix: "back", depth: num(p, "depth", spec.depth), height: num(p, "height", spec.height) });
    addWorktop(group, p, catalog);
    return finish();
  }

  if (spec.moduleType === "fwm_catalog_base_corner") {
    const variant = String(p.variant ?? "corner_1d");
    if (variant === "corner_90" || variant === "corner_90_1p") {
      buildCatalogBaseCorner90(group, p, catalog);
    } else if (variant === "corner_chamfered" || variant === "corner_chamfered_1p") {
      buildCatalogBaseCornerChamfered(group, p, catalog);
    } else {
      buildCatalogBaseCorner1D(group, p, catalog);
    }
    return finish();
  }

  if (spec.moduleType === "fwm_catalog_wall_cabinet") {
    const variant = String(p.variant ?? "");
    if (variant === "corner_90" || variant === "corner_90_1p" || variant === "corner_chamfered" || variant === "corner_chamfered_1p" || variant === "corner_open_chamfered") {
      buildCatalogWallCornerCabinet(group, p, catalog);
      return finish();
    }
  }

  if (spec.moduleType === "fwm_catalog_wall_open_end") {
    buildCatalogWallOpenEnd(group, p, catalog);
    return finish();
  }

  if (spec.geometryKind === "open_end") {
    buildOpenEndCabinet(group, p, catalog);
    return finish();
  }

  if (spec.moduleType === "fwm_catalog_tall_cabinet") {
    buildCatalogTallStackBuilder(group, p, catalog);
    return finish();
  }

  if (spec.moduleType === BASE_BOTTLE_PULLOUT_MODULE_TYPE) {
    buildCatalogBaseBottlePullout(group, p, catalog);
    return finish();
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
    return finish();
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
    return finish();
  }

  if (spec.geometryKind === "vanity" || spec.geometryKind === "bathroom") {
    addCarcass(group, p, catalog);
    addFronts(group, p, catalog);
    addWorktop(group, p, catalog);
    addBox(group, "mirror", { width: num(p, "width", spec.width) * 0.55, height: 620, depth: 18 }, { x: 0, y: num(p, "height", spec.height) - 330, z: -num(p, "depth", spec.depth) / 2 + 12 }, makeMaterial(p, catalog, "glass"), ["height", "width"]);
    if (num(p, "sinkBowlWidthMm", 0) > 0) {
      addBox(group, "basin", { width: num(p, "sinkBowlWidthMm", 520), height: 90, depth: num(p, "sinkBowlDepthMm", 360) }, { x: 0, y: num(p, "height", spec.height) + 55, z: 35 }, makeMaterial(p, catalog, "appliance"), ["sinkBowlWidthMm", "sinkBowlDepthMm"]);
    }
    return finish();
  }

  if (spec.geometryKind === "counter" || spec.geometryKind === "office") {
    addCarcass(group, p, catalog);
    addFronts(group, p, catalog);
    addWorktop(group, p, catalog);
    const privacyH = spec.geometryKind === "counter" ? 320 : 0;
    if (privacyH > 0) addBox(group, "raised_front_panel", { width: num(p, "width", spec.width), height: privacyH, depth: num(p, "frontThicknessMm", 18) }, { x: 0, y: num(p, "height", spec.height) - privacyH / 2, z: num(p, "depth", spec.depth) / 2 + 18 }, makeMaterial(p, catalog, "front"), ["height", "frontMaterialId"]);
    if (spec.geometryKind === "office") buildTable(group, { ...p, width: num(p, "width", spec.width) * 0.55, height: 740, depth: 700 } as FwmFurnitureParams, catalog);
    return finish();
  }

  const usesTotalOutsideDepth = spec.moduleType === "fwm_catalog_base_drawers" ||
    spec.moduleType === "fwm_catalog_base_doors" ||
    spec.moduleType === "fwm_catalog_wall_cabinet";
  const totalOutsideDepth = num(p, "depth", spec.depth);
  const frontDepthAllowance = usesTotalOutsideDepth ? num(p, "frontThicknessMm", 18) + 1 : 0;
  const carcassDepth = Math.max(1, totalOutsideDepth - frontDepthAllowance);
  const carcassZOffset = usesTotalOutsideDepth ? -frontDepthAllowance / 2 : 0;
  addCarcass(group, p, catalog, {
    topOpen: spec.geometryKind === "sink",
    topRails: spec.moduleType === "fwm_catalog_base_doors" || spec.moduleType === "fwm_catalog_base_drawers",
    depth: carcassDepth,
    envelopeDepth: totalOutsideDepth,
    zOffset: carcassZOffset
  });
  const applianceKind = (spec.appliance ?? (typeof p.applianceKind === "string" && p.applianceKind !== "none" ? p.applianceKind : null)) as string | null;
  if (applianceKind) {
    addAppliance(group, p, catalog, applianceKind, num(p, "height", spec.height) * 0.48, applianceKind === "microwave" ? 380 : applianceKind === "oven" ? 600 : num(p, "height", spec.height) * 0.58);
  }
  if (spec.geometryKind === "sink") {
    addBox(group, "sink_bowl", { width: num(p, "sinkBowlWidthMm", 520), height: 160, depth: num(p, "sinkBowlDepthMm", 400) }, { x: 0, y: num(p, "height", spec.height) + 10, z: 40 }, makeMaterial(p, catalog, "appliance"), ["sinkBowlWidthMm", "sinkBowlDepthMm"]);
    addCylinder(group, "faucet_arc", 12, 220, { x: 0, y: num(p, "height", spec.height) + 170, z: -120 }, makeMaterial(p, catalog, "hardware"), "y");
  }
  if (applianceKind === "dishwasher") addDishwasherFront(group, p, catalog);
  else addFronts(group, p, catalog, {
    depth: carcassDepth,
    zOffset: carcassZOffset,
    drawerDepthShiftMm: frontDepthAllowance
  });
  addWorktop(group, p, catalog);
  return finish();
}
