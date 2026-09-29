import { manufacturingEdges } from "./manufacturingEdges";
import type { EdgeEntity } from "../../core/edge-banding/edgeEntities";
import { Mesh } from "three";
import type { ClientCatalog } from "../../core/catalog/catalog-types";
import { buildFwmFurniture } from "./geometry";
import { measurePanel, type PanelMeasurement } from "./panelMeasurement";
import type { FwmFurnitureParams } from "./types";

export type ManufacturingPart = {
  id: string;
  sourcePartIds: string[];
  role: "body" | "front" | "back" | "shelf" | "drawer_bottom" | "plinth";
  quantity: number;
  length: number;
  width: number;
  thickness: number;
  areaM2: number;
  edgeLengthLm: number;
  drawerFrontHeightMm?: number;
};

export function manufacturingPartLabel(part: ManufacturingPart): string {
  const id = part.id;
  if (part.role === "front") return /drawer/.test(id) ? "Čelo zásuvky" : "Dvierka";
  if (part.role === "drawer_bottom") return "Dno zásuvky";
  if (part.role === "back") return "Chrbát skrinky";
  if (part.role === "shelf") return "Polica";
  if (part.role === "plinth") return /side|return/.test(id) ? "Bočný sokel" : "Predný sokel";
  if (/drawer/.test(id)) return /side/.test(id) ? "Bočnica zásuvky" : /back/.test(id) ? "Chrbát zásuvky" : "Vnútorné čelo zásuvky";
  if (/rail|support/.test(id)) return "Výstuha korpusu";
  if (/side|ending/.test(id)) return "Bočnica korpusu";
  if (/bottom-top/.test(id)) return "Dno a strop korpusu";
  if (/bottom/.test(id)) return "Dno korpusu";
  if (/top/.test(id)) return "Strop korpusu";
  if (/back|rear/.test(id)) return "Zadný panel korpusu";
  return "Panel korpusu";
}

function partId(mesh: Mesh, params: FwmFurnitureParams): string {
  const name = String(mesh.userData.boardName ?? mesh.name);
  const bare = name.replace(/^tower_/, "");
  if (/^(left|right)_side$/.test(bare)) {
    const side = bare.startsWith("left") ? "Left" : "Right";
    return params[`kitchenEndClosure${side}`] ? "kitchen-end-closure-side-panels" : "side-panels";
  }
  if (bare === "bottom" || bare === "top") return params.type === "fwm_catalog_base_doors" || params.type === "fwm_catalog_base_drawers" || params.type === "base_bottle_pullout"
    ? `${bare}-panel` : "bottom-top-panels";
  if (bare === "back") return "back-panel";
  if (bare === "plinth_front_board") return "plinth-front-board";
  if (/plinth_(left|right)_return/.test(bare)) return "plinth-side-return-boards";
  if (/^drawer_front_\d+$/.test(bare)) return "drawer-fronts";
  if (/^drawer_bottom_\d+$/.test(bare)) return "drawer-bottoms";
  if (/^bottle_drawer_bottom_\d+$/.test(name)) return "drawer-bottoms";
  if (/^door_\d+(?:_\d+)?$/.test(bare)) return "door-fronts";
  if (/^corner_chamfered_shelf_\d+$/.test(mesh.name)) return "corner-chamfered-shelves";
  if (mesh.userData.primitiveId) return `corner-chamfered-${name.replaceAll("_", "-")}`;
  if (/^shelf_\d+$/.test(bare)) return "shelves";
  if (/^corner_right_shelf_\d+$/.test(name)) return "corner-right-shelves";
  if (/^shelf_\d+_[xz]$/.test(name)) return `shelves-${name.at(-1)}`;
  if (name.startsWith("cutlery_inner_drawer_")) return name.replace(/_\d+$/, "").replaceAll("_", "-");
  return name.replaceAll("_", "-");
}

/** Single physical source for all nine runtime module families, including
 * custom drawer/tower layouts and imported corner geometry. No render state is
 * retained. A bounded cache avoids rebuilding identical modules for each view.
 */
type HardwareKind = "handle" | "hinge" | "leg" | "plinth_clip";
type ManufacturingAssembly = { parts: ManufacturingPart[]; edges: EdgeEntity[]; hardware: Record<HardwareKind, number>; clips: { front: number; side: number; total: number } };
const cache = new WeakMap<ClientCatalog, Map<string, ManufacturingAssembly>>();

export function getManufacturingParts(params: FwmFurnitureParams, catalog: ClientCatalog): ManufacturingPart[] {
  return getManufacturingAssembly(params, catalog).parts;
}

export function getManufacturingAssembly(params: FwmFurnitureParams, catalog: ClientCatalog): ManufacturingAssembly {
  const closed = { ...params, opened: false, doorOpen: false } as FwmFurnitureParams;
  const key = JSON.stringify(closed);
  const entries = cache.get(catalog) ?? new Map<string, ManufacturingAssembly>();
  cache.set(catalog, entries);
  const cached = entries.get(key);
  if (cached) return structuredClone(cached);
  const root = buildFwmFurniture(closed, catalog);
  const parts: ManufacturingPart[] = [];
  const edges: EdgeEntity[] = [];
  const hardware = { handle: new Set<string>(), hinge: new Set<string>(), leg: new Set<string>(), plinth_clip: new Set<string>() };
  const sideClips = new Set<string>();
  const grouped = new Map<string, ManufacturingPart>();
  const ids = new Map<string, number>();
  try {
    root.traverse(object => {
      if (!(object instanceof Mesh)) return;
      const group = String(object.userData.materialGroup ?? "");
      if (group === "hardware") {
        const name = String(object.userData.boardName ?? object.name);
        const kind = String(object.userData.componentType ?? (/handle/i.test(name) ? "handle" : /hinge/i.test(name) ? "hinge"
          : /clip/i.test(name) ? "plinth_clip" : /(^|_)leg_/i.test(name) ? "leg" : "")) as HardwareKind;
        if (["handle", "hinge", "leg", "plinth_clip"].includes(kind)) {
          // A hinge or clip is an assembly of several display meshes, sold once.
          const assemblyId = String(object.userData.hardwareAssemblyId ?? name.replace(/_(door_plate|door_cup|arm|collar|pad)$/, ""));
          hardware[kind].add(assemblyId);
          if (kind === "plinth_clip" && (object.userData.hardwareRole === "side" || /kickClip_(left|right)_/.test(name))) sideClips.add(assemblyId);
        }
      }
      if (!["corpus", "front", "back", "drawer_bottom", "plinth"].includes(group)) return;
      const name = String(object.userData.boardName ?? object.name);
      const role = group === "corpus" ? /shelf/.test(name) ? "shelf" : "body" : group as ManufacturingPart["role"];
      const nominalThickness = Number(role === "front" ? closed.frontThicknessMm : role === "back" ? closed.backThickness
        : role === "drawer_bottom" ? closed.drawerBottomThickness : role === "shelf" ? closed.shelfThickness : closed.boardThickness);
      const panel = measurePanel(object, nominalThickness);
      // Imported corner solids are deformed/joined for display. Their envelope
      // is not stock thickness (e.g. a mitred 18 mm front spans 29 mm). The
      // manufacturing thickness remains the configured board thickness.
      const thickness = object.userData.primitiveId && Number.isFinite(nominalThickness) && nominalThickness > 0
        ? nominalThickness : panel.thicknessMm;
      const partEdges = manufacturingEdges(object, role, panel, closed);
      edges.push(...partEdges);
      const edgeLengthLm = partEdges.filter(edge => edge.defaultGroupId).reduce((sum, edge) => sum + edge.lengthMm / 1000, 0);
      const sidePanel = /(^|_)(left_side|right_side|side_panel|side_end|side_[xz])/.test(name);
      const drawerBottom = role === "drawer_bottom" && !/cross_rail/.test(name);
      const length = sidePanel || drawerBottom ? panel.verticalMm : panel.horizontalMm;
      const width = sidePanel || drawerBottom ? panel.horizontalMm : panel.verticalMm;
      const baseId = partId(object, closed);
      const groupKey = JSON.stringify([baseId, role, length.toFixed(3), width.toFixed(3), thickness.toFixed(3), edgeLengthLm.toFixed(6), panel.areaMm2.toFixed(2)]);
      const existing = grouped.get(groupKey);
      if (existing) {
        existing.quantity += 1;
        existing.areaM2 += panel.areaMm2 / 1_000_000;
        existing.edgeLengthLm += edgeLengthLm;
        existing.sourcePartIds.push(object.name);
        return;
      }
      const ordinal = (ids.get(baseId) ?? 0) + 1;
      ids.set(baseId, ordinal);
      const part: ManufacturingPart = {
        id: ordinal === 1 ? baseId : `${baseId}-${ordinal}`,
        sourcePartIds: [object.name], role, quantity: 1,
        length, width, thickness,
        areaM2: panel.areaMm2 / 1_000_000, edgeLengthLm,
        ...(typeof object.userData.drawerFrontHeightMm === "number" ? { drawerFrontHeightMm: object.userData.drawerFrontHeightMm } : {})
      };
      parts.push(part);
      grouped.set(groupKey, part);
    });
  } finally {
    const geometries = new Set<Mesh["geometry"]>();
    const materials = new Set<import("three").Material>();
    root.traverse(object => {
      if (!(object instanceof Mesh)) return;
      geometries.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
    });
    for (const geometry of geometries) geometry.dispose();
    for (const material of materials) material.dispose();
  }
  if (parts.length === 0) throw new Error(`No manufacturing panels for ${params.type}.`);
  if (entries.size >= 128) entries.delete(entries.keys().next().value!);
  const assembly: ManufacturingAssembly = { parts, edges, clips: { front: hardware.plinth_clip.size - sideClips.size, side: sideClips.size, total: hardware.plinth_clip.size }, hardware: { handle: hardware.handle.size, hinge: hardware.hinge.size, leg: hardware.leg.size, plinth_clip: hardware.plinth_clip.size } };
  entries.set(key, assembly);
  return structuredClone(assembly);
}
