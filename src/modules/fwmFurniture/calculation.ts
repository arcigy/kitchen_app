import type { ClientCatalog, ComponentDefinition, ComponentType, MaterialDefinition } from "../../core/catalog/catalog-types";
import { createPricingCatalog } from "../../core/catalog/pricing-catalog";
import type { KitchenContext } from "../../layout/kitchenContext";
import type { BOMResult } from "../../layout/bom/bomTypes";
import {
  calculateCommercialPricingFromQuoteBom,
  type PortableComponentRef,
  type PortableMaterialRef,
  type PortableQuoteBomItem,
  type PortableQuoteBomPayload
} from "../runtime/portableCommercial";
import { createModuleRuntimeCatalogContext } from "../runtime/runtimeCatalog";
import { resolveDrawerDepthLayout } from "./depthLayout";
import { getFwmFurnitureSpec } from "./definitions";
import { normalizeFwmFurnitureParams, type FwmFurnitureParams } from "./types";

function num(params: Record<string, unknown>, key: string, fallback: number) {
  const value = params[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function rec(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function round(value: number, digits = 4) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function materialRef(material: MaterialDefinition | undefined | null, role: string): PortableMaterialRef | null {
  if (!material) return null;
  return {
    ...material,
    catalogId: material.id,
    key: material.id,
    role,
    family: material.boardFamily,
    assignmentSource: "catalog"
  };
}

function componentRef(component: ComponentDefinition | undefined | null): PortableComponentRef | null {
  return component ? { ...component, catalogId: component.id } : null;
}

function resolveMaterial(catalog: ClientCatalog, params: FwmFurnitureParams, slot: "body" | "front" | "back" | "shelf" | "drawer_bottom" | "plinth" | "worktop") {
  const assignments = rec(params.materialAssignments);
  const context = createModuleRuntimeCatalogContext(catalog);
  const explicit =
    slot === "front" ? params.frontMaterialId :
    slot === "back" ? params.backMaterialId :
    slot === "shelf" ? params.shelfMaterialId :
    slot === "drawer_bottom" ? params.drawerBottomMaterialId :
    slot === "plinth" ? params.plinthMaterialId :
    slot === "worktop" ? params.worktopMaterialId :
    params.bodyMaterialId;
  const assigned =
    slot === "front" ? assignments.front :
    slot === "back" ? assignments.back :
    slot === "shelf" ? assignments.shelf :
    slot === "drawer_bottom" ? assignments.drawer_bottom :
    slot === "plinth" ? assignments.plinth :
    slot === "worktop" ? assignments.worktop :
    assignments.carcass;
  return context.resolveMaterial(
    typeof explicit === "string" && explicit ? explicit : typeof assigned === "string" ? assigned : undefined,
    slot === "front" ? "front" :
      slot === "back" ? "backPanel" :
      slot === "drawer_bottom" ? "drawer" :
      slot === "plinth" ? "plinth" :
      slot === "worktop" ? "worktop" :
      "carcass"
  );
}

function resolveComponent(catalog: ClientCatalog, params: FwmFurnitureParams, key: "handleComponentId" | "hingeComponentId" | "runnerComponentId" | "legComponentId" | "clipComponentId") {
  const assignments = rec(params.componentAssignments);
  const context = createModuleRuntimeCatalogContext(catalog);
  const explicit = typeof params[key] === "string" && params[key] ? params[key] as string : assignments[key] as string | undefined;
  const resolve = (componentType: ComponentType, defaultKind?: "handle" | "hinge" | "drawerSystem") => context.resolveComponent(explicit, componentType, defaultKind);
  if (key === "handleComponentId") {
    return context.resolveComponent(
      explicit ?? assignments.handle as string | undefined,
      "handle",
      "handle"
    );
  }
  if (key === "hingeComponentId") {
    return context.resolveComponent(
      explicit ?? assignments.hinge as string | undefined,
      "hinge",
      "hinge"
    );
  }
  if (key === "runnerComponentId") return context.resolveComponent(explicit ?? assignments.runner as string | undefined, "runner", "drawerSystem");
  if (key === "legComponentId") return resolve("leg");
  return resolve("plinth_clip");
}

function legAndClipCounts(width: number, depth: number, setback: number, boardThickness: number) {
  const xCount = width > 1500 ? 5 : width > 900 ? 3 : 2;
  const boardDepth = Math.max(8, Math.min(boardThickness, 24));
  const zFront = depth / 2 - setback - boardDepth - 55;
  const zBack = -depth / 2 + Math.min(100, Math.max(70, depth * 0.16));
  const zCount = Math.abs(zFront - zBack) > 120 ? 2 : 1;
  return { legs: xCount * zCount, clips: xCount };
}

function boardItem(args: {
  id: string;
  category: string;
  description: string;
  quantity: number;
  length: number;
  width: number;
  thickness: number;
  material: PortableMaterialRef | null;
  slot: string;
}): PortableQuoteBomItem {
  const area = round((args.length * args.width * args.quantity) / 1_000_000);
  const materialGroup = args.material?.family ?? (args.slot === "carcass" ? "body" : args.slot);
  return {
    id: args.id,
    itemType: "board",
    category: args.category,
    name: args.description,
    description: args.description,
    pricingBasis: "sheet_area",
    pricingUnit: "m2",
    quantity: args.quantity,
    pricingQuantity: area,
    dimensionsMm: {
      length: round(args.length, 2),
      width: round(args.width, 2),
      thickness: round(args.thickness, 2)
    },
    metrics: {
      areaM2: area,
      billableAreaM2: area,
      wasteMultiplier: 1
    },
    materialSlotId: args.slot,
    materialGroup,
    material: args.material,
    catalogRef: args.material
      ? {
          entityType: "material",
          catalogId: args.material.catalogId,
          displayName: args.material.displayName,
          group: materialGroup,
          pricingBasis: "sheet_area",
          pricingUnit: "m2"
        }
      : null,
    pricingLookup: args.material
      ? {
          key: args.material.catalogId,
          sourceCatalogId: args.material.catalogId,
          sourceEntityType: "material",
          resolution: "catalog_id"
        }
      : null,
    sourcePartIds: [args.id],
    pricingGroup: "boards",
    pricingQuantityBase: area
  };
}

function edgeItem(id: string, description: string, lengthLm: number, material: PortableMaterialRef | null, slot: string): PortableQuoteBomItem {
  const materialGroup = material?.family ?? (slot === "carcass" ? "body" : slot);
  return {
    id,
    itemType: "edge_band",
    category: "edge_band",
    name: description,
    description,
    pricingBasis: "linear_length",
    pricingUnit: "lm",
    quantity: 1,
    pricingQuantity: round(lengthLm),
    metrics: { edgeLengthLm: round(lengthLm) },
    materialSlotId: slot,
    materialGroup,
    material,
    catalogRef: material
      ? {
          entityType: "material",
          catalogId: material.catalogId,
          displayName: material.displayName,
          group: materialGroup,
          pricingBasis: "linear_length",
          pricingUnit: "lm"
        }
      : null,
    pricingLookup: material
      ? {
          key: material.catalogId,
          sourceCatalogId: material.catalogId,
          sourceEntityType: "material",
          resolution: "catalog_id"
        }
      : null,
    pricingGroup: "edge_bands",
    pricingQuantityBase: round(lengthLm)
  };
}

function hardwareItem(id: string, description: string, quantity: number, component: PortableComponentRef | null): PortableQuoteBomItem | null {
  if (!component || quantity <= 0) return null;
  return {
    id,
    itemType: "hardware",
    category: component.componentType,
    name: component.displayName,
    description,
    pricingBasis: "piece",
    pricingUnit: "pcs",
    quantity,
    pricingQuantity: quantity,
    materialGroup: component.componentType,
    component,
    catalogRef: {
      entityType: "component",
      catalogId: component.catalogId,
      displayName: component.displayName,
      group: component.componentType,
      pricingBasis: "piece",
      pricingUnit: "pcs"
    },
    pricingLookup: {
      key: component.catalogId,
      sourceCatalogId: component.catalogId,
      sourceEntityType: "component",
      resolution: "catalog_id"
    },
    pricingGroup: "hardware",
    pricingQuantityBase: quantity
  };
}

function findEdgeMaterial(catalog: ClientCatalog, board: MaterialDefinition | undefined | null) {
  if (!board) return null;
  return catalog.materials.find((material) =>
    material.materialType === "edge" &&
    material.isActive &&
    material.edgeFamily === (board.boardFamily === "front" ? "front" : board.boardFamily === "worktop" ? "worktop" : "body")
  ) ?? null;
}

export function calculateFwmFurnitureBOM(params: FwmFurnitureParams, ctx: KitchenContext, catalog: ClientCatalog): BOMResult {
  void ctx;
  const p = normalizeFwmFurnitureParams(params);
  const spec = getFwmFurnitureSpec(p.type);
  const width = num(p, "width", spec.width);
  const height = num(p, "height", spec.height);
  const depth = num(p, "depth", spec.depth);
  const boardT = num(p, "boardThickness", 18);
  const frontT = num(p, "frontThicknessMm", 18);
  const backT = num(p, "backThickness", 8);
  const shelfT = num(p, "shelfThickness", boardT);
  const plinth = num(p, "plinthHeight", 0);
  const plinthSetback = num(p, "plinthSetbackMm", 0);
  const bodyMaterial = resolveMaterial(catalog, p, "body");
  const frontMaterial = resolveMaterial(catalog, p, "front");
  const backMaterial = resolveMaterial(catalog, p, "back");
  const shelfMaterial = resolveMaterial(catalog, p, "shelf");
  const drawerBottomMaterial = resolveMaterial(catalog, p, "drawer_bottom");
  const plinthMaterial = resolveMaterial(catalog, p, "plinth");
  const worktopMaterial = resolveMaterial(catalog, p, "worktop");
  const bodyRef = materialRef(bodyMaterial, "body");
  const frontRef = materialRef(frontMaterial, "front");
  const backRef = materialRef(backMaterial, "back");
  const shelfRef = materialRef(shelfMaterial, "shelf");
  const drawerBottomRef = materialRef(drawerBottomMaterial, "drawer_bottom");
  const plinthRef = materialRef(plinthMaterial, "plinth");
  const worktopRef = materialRef(worktopMaterial, "worktop");
  const edgeRef = materialRef(findEdgeMaterial(catalog, frontMaterial ?? bodyMaterial), "edge");
  const items: PortableQuoteBomItem[] = [];
  const cabinetH = Math.max(50, height - plinth);
  const innerW = Math.max(1, width - 2 * boardT);
  const innerH = Math.max(1, cabinetH - 2 * boardT);
  const drawerCount = Math.round(num(p, "drawerCount", spec.drawers ?? 0));
  const doorCount = Math.round(num(p, "doorCount", spec.doors ?? 0));
  const shelfCount = Math.round(num(p, "shelfCount", spec.shelves ?? 0));

  if (spec.geometryKind === "bed") {
    items.push(
      boardItem({ id: "bed-frame-side-panels", category: "body", description: "Bed frame side panels", quantity: 2, length: depth, width: 180, thickness: boardT, material: bodyRef, slot: "carcass" }),
      boardItem({ id: "bed-frame-front-back", category: "body", description: "Bed frame front/back panels", quantity: 2, length: width, width: 180, thickness: boardT, material: bodyRef, slot: "carcass" }),
      boardItem({ id: "bed-headboard", category: "front", description: "Headboard panel", quantity: 1, length: width, width: Math.max(400, height), thickness: frontT, material: frontRef, slot: "front" })
    );
  } else if (spec.geometryKind === "table") {
    const topT = Math.max(24, num(p, "worktopThicknessMm", boardT));
    items.push(
      boardItem({ id: "table-top", category: "worktop", description: "Table top", quantity: 1, length: width, width: depth, thickness: topT, material: worktopRef ?? bodyRef, slot: "worktop" }),
      boardItem({ id: "table-legs", category: "body", description: "Table legs", quantity: 4, length: height - topT, width: 80, thickness: boardT, material: bodyRef, slot: "carcass" })
    );
  } else if (spec.geometryKind === "cladding") {
    items.push(boardItem({ id: "cladding-panel", category: "front", description: "Interior cladding panel", quantity: 1, length: height, width, thickness: depth, material: frontRef ?? bodyRef, slot: "front" }));
  } else {
    items.push(
      boardItem({ id: "side-panels", category: "body", description: "Side panels", quantity: spec.geometryKind === "corner" ? 4 : 2, length: cabinetH, width: depth, thickness: boardT, material: bodyRef, slot: "carcass" }),
      boardItem({ id: "bottom-top-panels", category: "body", description: "Bottom and top panels", quantity: spec.geometryKind === "sink" ? 1 : 2, length: innerW, width: depth, thickness: boardT, material: bodyRef, slot: "carcass" })
    );
    if (backT > 0) items.push(boardItem({ id: "back-panel", category: "back", description: "Back panel", quantity: 1, length: innerW, width: innerH, thickness: backT, material: backRef, slot: "back" }));
    if (shelfCount > 0) items.push(boardItem({ id: "shelves", category: "shelf", description: "Adjustable shelves", quantity: shelfCount, length: innerW, width: Math.max(1, depth - backT), thickness: shelfT, material: shelfRef ?? bodyRef, slot: "shelf" }));
    if (plinth > 0) {
      items.push(boardItem({ id: "plinth-front-board", category: "plinth", description: "Plinth front board", quantity: 1, length: width, width: plinth, thickness: Math.max(8, Math.min(boardT, 24)), material: plinthRef ?? bodyRef, slot: "plinth" }));
    }
    if (drawerCount > 0) {
      const frontH = Math.max(80, (height - plinth) / drawerCount);
      const drawerDepth = resolveDrawerDepthLayout(depth, backT, num(p, "drawerBackGapMm", 10)).depthMm;
      items.push(
        boardItem({ id: "drawer-fronts", category: "front", description: "Drawer fronts", quantity: drawerCount, length: width - 4, width: frontH - 2, thickness: frontT, material: frontRef, slot: "front" }),
        boardItem({ id: "drawer-boxes", category: "drawer_box", description: "Drawer box boards", quantity: drawerCount * 4, length: drawerDepth, width: 120, thickness: boardT, material: bodyRef, slot: "carcass" }),
        boardItem({ id: "drawer-bottoms", category: "drawer_bottom", description: "Drawer bottom boards", quantity: drawerCount, length: drawerDepth, width: Math.max(60, width - boardT * 2 - 70), thickness: num(p, "drawerBottomThickness", drawerBottomMaterial?.defaultThicknessMm ?? 8), material: drawerBottomRef ?? bodyRef, slot: "drawer_bottom" })
      );
    }
    if (doorCount > 0) {
      items.push(boardItem({ id: "door-fronts", category: "front", description: "Door fronts", quantity: doorCount, length: Math.max(80, (width - 4) / doorCount), width: Math.max(100, height - plinth - 8), thickness: frontT, material: frontRef, slot: "front" }));
    }
    if (spec.appliance === "dishwasher") {
      items.push(boardItem({ id: "dishwasher-front-panel", category: "front", description: "Integrated dishwasher front panel", quantity: 1, length: Math.max(80, width - 4), width: Math.max(120, height - plinth - 8), thickness: frontT, material: frontRef, slot: "front" }));
    }
    if (num(p, "worktopThicknessMm", 0) > 0) {
      items.push(boardItem({ id: "worktop", category: "worktop", description: "Worktop", quantity: 1, length: width + 30, width: depth + 40, thickness: num(p, "worktopThicknessMm", 38), material: worktopRef, slot: "worktop" }));
    }
  }

  const edgeLengthLm = round(items
    .filter((item) => item.itemType === "board")
    .reduce((sum, item) => sum + ((item.dimensionsMm?.length ?? 0) + (item.dimensionsMm?.width ?? 0)) * 2 * item.quantity / 1000, 0));
  if (edgeLengthLm > 0 && edgeRef) items.push(edgeItem("visible-edge-banding", "Visible ABS edge banding", edgeLengthLm, edgeRef, "front"));

  const hardware = [
    hardwareItem("handles", "Visible handles", Math.max(0, drawerCount + doorCount), componentRef(resolveComponent(catalog, p, "handleComponentId"))),
    hardwareItem("hinges", "Door hinges", Math.max(0, doorCount * 2), componentRef(resolveComponent(catalog, p, "hingeComponentId"))),
    hardwareItem("runners", "Drawer runner pairs", Math.max(0, drawerCount), componentRef(resolveComponent(catalog, p, "runnerComponentId"))),
    ...(plinth > 0
      ? [
          hardwareItem("adjustable-legs", "Adjustable cabinet legs", legAndClipCounts(width, depth, plinthSetback, boardT).legs, componentRef(resolveComponent(catalog, p, "legComponentId"))),
          hardwareItem("plinth-clips", "Plinth board clips", legAndClipCounts(width, depth, plinthSetback, boardT).clips, componentRef(resolveComponent(catalog, p, "clipComponentId")))
        ]
      : [])
  ].filter((item): item is PortableQuoteBomItem => !!item);
  items.push(...hardware);

  const pricingCatalog = createPricingCatalog(catalog);
  for (const item of items) {
    const lookup = item.pricingLookup?.sourceCatalogId;
    if (lookup && pricingCatalog.getUnitPriceForCatalogId(lookup) === null) {
      item.validationErrors = [`Missing price for ${lookup}`];
    }
  }

  const quoteBom: PortableQuoteBomPayload = {
    schemaVersion: "module-quote-bom.v1",
    moduleType: p.type,
    displayName: spec.displayName,
    generatedAt: new Date().toISOString(),
    moduleInstance: {
      quantity: 1,
      widthMm: width,
      heightMm: height,
      depthMm: depth,
      wallMounted: Boolean(p.wallMounted)
    },
    materials: {
      body: bodyRef!,
      front: frontRef!,
      back: backRef!,
      shelf: shelfRef ?? bodyRef!,
      drawer_bottom: drawerBottomRef ?? bodyRef!,
      plinth: plinthRef ?? bodyRef!,
      worktop: worktopRef!
    },
    items
  };

  return {
    moduleType: p.type,
    displayName: spec.displayName,
    quoteBom,
    pricing: calculateCommercialPricingFromQuoteBom({
      quoteBom,
      catalog,
      laborCostFixed: spec.reserve ? 64 : 48
    }),
    materialsSnapshot: null
  };
}
