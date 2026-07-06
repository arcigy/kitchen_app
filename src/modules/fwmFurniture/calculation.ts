import type { ClientCatalog, ComponentDefinition, ComponentType, MaterialDefinition } from "../../core/catalog/catalog-types";
import { createPricingCatalog } from "../../core/catalog/pricing-catalog";
import type { KitchenContext } from "../../layout/kitchenContext";
import type { BOMResult } from "../../layout/bom/bomTypes";
import { calculateBOM as calculateCornerShelfLowerBOM } from "../cornerShelfLower/calculation";
import {
  calculateCommercialPricingFromQuoteBom,
  type PortableComponentRef,
  type PortableMaterialRef,
  type PortableQuoteBomItem,
  type PortableQuoteBomPayload
} from "../runtime/portableCommercial";
import { createModuleRuntimeCatalogContext } from "../runtime/runtimeCatalog";
import { mapFwmCatalogCornerToCornerShelfLowerParams } from "./catalogCornerAdapter";
import { resolveDrawerDepthLayout } from "./depthLayout";
import { resolveFwmDrawerSystemPreset } from "./drawerSystemPresets";
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
  const canonicalRole = canonicalBomMaterialGroup(role);
  return {
    ...material,
    catalogId: material.id,
    key: material.id,
    role: canonicalRole,
    family: canonicalBomMaterialGroup(material.boardFamily ?? canonicalRole),
    assignmentSource: "catalog"
  };
}

function canonicalBomMaterialGroup(value: string): string {
  return value === "body" || value === "carcass" || value === "shelf" ? "corpus" : value;
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
    (params.bodyMaterialId ?? params.corpusMaterialId);
  const assigned =
    slot === "front" ? assignments.front :
    slot === "back" ? assignments.back :
    slot === "shelf" ? assignments.shelf ?? assignments.corpus ?? assignments.carcass :
    slot === "drawer_bottom" ? assignments.drawer_bottom :
    slot === "plinth" ? assignments.plinth :
    slot === "worktop" ? assignments.worktop :
    assignments.corpus ?? assignments.carcass;
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
  const materialGroup = canonicalBomMaterialGroup(args.material?.family ?? args.slot);
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
    materialSlotId: canonicalBomMaterialGroup(args.slot),
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
  const materialGroup = canonicalBomMaterialGroup(material?.family ?? slot);
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
    materialSlotId: canonicalBomMaterialGroup(slot),
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

function paramsForExternalKitchenWorktop(params: FwmFurnitureParams, spec: ReturnType<typeof getFwmFurnitureSpec>): FwmFurnitureParams {
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

export function calculateFwmFurnitureBOM(params: FwmFurnitureParams, ctx: KitchenContext, catalog: ClientCatalog): BOMResult {
  const normalized = normalizeFwmFurnitureParams(params);
  const spec = getFwmFurnitureSpec(normalized.type);
  const p = paramsForExternalKitchenWorktop(normalized, spec);
  const cornerVariant = String(p.variant ?? "corner_1d");
  if (spec.moduleType === "fwm_catalog_base_corner" && (cornerVariant === "corner_90" || cornerVariant === "corner_90_1p")) {
    const copied = calculateCornerShelfLowerBOM(mapFwmCatalogCornerToCornerShelfLowerParams(p), ctx, catalog);
    const quoteBom = {
      ...copied.quoteBom,
      moduleType: p.type,
      displayName: spec.displayName
    };
    return {
      ...copied,
      moduleType: p.type,
      displayName: spec.displayName,
      quoteBom
    };
  }
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
  } else if (spec.geometryKind === "worktop") {
    const topT = Math.max(10, num(p, "worktopThicknessMm", height));
    items.push(boardItem({ id: "catalog-worktop-surface", category: "worktop", description: "Catalog worktop surface", quantity: 1, length: width, width: depth, thickness: topT, material: worktopRef ?? bodyRef, slot: "worktop" }));
  } else if (spec.geometryKind === "shelf_surface") {
    items.push(boardItem({ id: "catalog-free-shelves", category: "shelf", description: "Catalog free shelves", quantity: Math.max(1, shelfCount), length: width, width: depth, thickness: shelfT, material: shelfRef ?? bodyRef, slot: "shelf" }));
  } else if (spec.geometryKind === "trim") {
    const slot = String(p.variant ?? "").includes("plinth") ? "plinth" : "carcass";
    items.push(boardItem({ id: "catalog-trim-panel", category: "trim", description: "Catalog trim/filler panel", quantity: 1, length: width, width: height, thickness: depth, material: slot === "plinth" ? plinthRef ?? bodyRef : bodyRef, slot }));
  } else if (spec.geometryKind === "front_component") {
    items.push(boardItem({ id: "catalog-front-component", category: "front", description: "Catalog front component", quantity: 1, length: width, width: height, thickness: frontT, material: frontRef, slot: "front" }));
  } else if (spec.geometryKind === "accessory") {
    if (String(p.variant ?? "").includes("worktop")) {
      items.push(boardItem({ id: "catalog-worktop-accessory-panel", category: "worktop", description: "Catalog worktop accessory", quantity: 1, length: width, width: Math.max(height, depth), thickness: Math.min(height, depth), material: worktopRef ?? bodyRef, slot: "worktop" }));
    } else if (String(p.variant ?? "").includes("light") || String(p.variant ?? "").includes("sada") || String(p.variant ?? "").includes("lumina")) {
      items.push({
        id: "catalog-lighting-accessory",
        itemType: "hardware",
        category: "lighting",
        name: "Catalog lighting accessory",
        description: "Catalog lighting accessory",
        pricingBasis: "piece",
        pricingUnit: "pcs",
        quantity: 1,
        pricingQuantity: 1,
        materialGroup: "hardware",
        catalogRef: null,
        pricingLookup: null,
        pricingGroup: "hardware",
        pricingQuantityBase: 1
      });
    } else {
      items.push(boardItem({ id: "catalog-accessory-body", category: "accessory", description: "Catalog accessory placeholder", quantity: 1, length: width, width: Math.max(height, depth), thickness: Math.min(height, depth), material: bodyRef, slot: "carcass" }));
    }
  } else if (spec.moduleType === "fwm_catalog_base_corner") {
    const source = { width: 1000.077, height: 722, depth: 782, plinth: 100 };
    const sourceBodyHeight = Math.max(1, source.height - source.plinth);
    const targetBodyHeight = Math.max(1, height - plinth);
    const scaleYSize = (value: number) => value <= source.plinth
      ? (value / Math.max(1, source.plinth)) * plinth
      : (value / sourceBodyHeight) * targetBodyHeight;
    const scaledSize = (role: "body" | "back" | "shelf" | "front" | "plinth", size: { width: number; height: number; depth: number }) => {
      const thin = (axis: "x" | "y" | "z", value: number) => {
        if (value > 30) return null;
        if (role === "back") return backT;
        if (role === "shelf") return shelfT;
        if (role === "front") return frontT;
        if (role === "plinth" && axis !== "y") return Math.max(8, Math.min(boardT, 24));
        return boardT;
      };
      return {
        width: thin("x", size.width) ?? (size.width / source.width) * width,
        height: role === "plinth" ? plinth : thin("y", size.height) ?? scaleYSize(size.height),
        depth: thin("z", size.depth) ?? (size.depth / source.depth) * depth
      };
    };
    const addCatalogCornerPart = (
      id: string,
      role: "body" | "back" | "shelf" | "front" | "plinth",
      description: string,
      size: { width: number; height: number; depth: number },
      quantity = 1
    ) => {
      const resolved = scaledSize(role, size);
      const [thickness, panelWidth, panelLength] = [resolved.width, resolved.height, resolved.depth].sort((left, right) => left - right);
      const material =
        role === "front" ? frontRef :
        role === "back" ? backRef :
        role === "shelf" ? shelfRef ?? bodyRef :
        role === "plinth" ? plinthRef ?? bodyRef :
        bodyRef;
      const slot =
        role === "front" ? "front" :
        role === "back" ? "back" :
        role === "shelf" ? "shelf" :
        role === "plinth" ? "plinth" :
        "carcass";
      items.push(boardItem({
        id,
        category: role === "body" ? "body" : role,
        description,
        quantity,
        length: panelLength,
        width: panelWidth,
        thickness,
        material,
        slot
      }));
    };

    if (cornerVariant === "corner_chamfered" || cornerVariant === "corner_chamfered_1p") {
      const frontFallback = num(p, "chamferMm", 420);
      const frontChamfer = Math.min(Math.max(num(p, "frontChamferMm", frontFallback), Math.min(width, depth) * 0.34), Math.min(width, depth) - boardT * 4);
      const backChamfer = Math.min(Math.max(num(p, "backChamferMm", 0), 0), Math.min(width, depth) - boardT * 4);
      const diagonal = Math.hypot(frontChamfer, frontChamfer);
      const bodyH = Math.max(1, height - plinth);
      const supportHeight = Math.max(70, Math.min(130, bodyH * 0.16));
      const supportDepth = Math.max(36, Math.min(72, boardT * 3));
      addCatalogCornerPart("corner-chamfered-left-side", "body", "Chamfered corner left side panel", { width: boardT, height: bodyH, depth: Math.max(1, frontChamfer + 2 * boardT) });
      addCatalogCornerPart("corner-chamfered-right-side", "body", "Chamfered corner right side panel", { width: boardT, height: bodyH, depth });
      addCatalogCornerPart("corner-chamfered-back-panel", "back", "Chamfered corner back panel", { width: Math.max(1, width - 2 * boardT), height: Math.max(1, bodyH - 2 * boardT), depth: backT });
      if (backChamfer > 0) addCatalogCornerPart("corner-chamfered-back-corner-panel", "back", "Chamfered corner side back panel", { width: backT, height: Math.max(1, bodyH - 2 * boardT), depth: Math.max(1, backChamfer - boardT) });
      addCatalogCornerPart("corner-chamfered-bottom-panel", "body", "Chamfered corner bottom panel", { width: Math.max(1, width - frontChamfer * 0.5), height: boardT, depth: Math.max(1, depth - frontChamfer * 0.5) });
      addCatalogCornerPart("corner-chamfered-top-panel", "body", "Chamfered corner top panel", { width: Math.max(1, width - frontChamfer * 0.5), height: boardT, depth: Math.max(1, depth - frontChamfer * 0.5) });
      addCatalogCornerPart("corner-chamfered-support-front", "body", "Chamfered corner front support rail", { width: Math.max(1, width - frontChamfer - boardT), height: supportHeight, depth: supportDepth });
      addCatalogCornerPart("corner-chamfered-support-back", "body", "Chamfered corner back support rail", { width: Math.max(1, width - 2 * boardT), height: supportHeight, depth: supportDepth });
      addCatalogCornerPart("corner-chamfered-support-diagonal", "body", "Chamfered corner diagonal support rail", { width: diagonal, height: supportHeight, depth: supportDepth });
      addCatalogCornerPart("corner-chamfered-lower-front-support", "body", "Chamfered corner lower front support rail", { width: Math.max(1, width - frontChamfer - boardT), height: supportHeight, depth: supportDepth });
      if (shelfCount > 0) {
        addCatalogCornerPart(
          "corner-chamfered-shelves",
          "shelf",
          "Chamfered corner internal shelves",
          { width: Math.max(1, width - frontChamfer * 0.5 - 2 * boardT), height: shelfT, depth: Math.max(1, depth - frontChamfer * 0.5 - 2 * boardT) },
          Math.max(0, Math.min(16, shelfCount))
        );
      }
      if (plinth > 0) addCatalogCornerPart("corner-chamfered-plinth-diagonal", "plinth", "Chamfered corner diagonal plinth", { width: diagonal - 120, height: plinth, depth: Math.max(8, Math.min(boardT, 24)) });
      addCatalogCornerPart("corner-chamfered-diagonal-front", "front", "Chamfered corner diagonal door/front", { width: diagonal, height: Math.max(1, bodyH - 4), depth: frontT });
    } else {
      addCatalogCornerPart("corner-left-side", "body", "Corner left side panel", { width: 18, height: 622, depth: 694 });
      addCatalogCornerPart("corner-right-side", "body", "Corner right side panel", { width: 18, height: 622, depth: 694 });
      addCatalogCornerPart("corner-back-panel", "back", "Corner back panel", { width: 864, height: 586, depth: 8 });
      addCatalogCornerPart("corner-bottom-panel", "body", "Corner bottom panel", { width: 864, height: 18, depth: 694 });
      addCatalogCornerPart("corner-top-back-rail", "body", "Corner top back rail", { width: 864, height: 18, depth: 70 });
      addCatalogCornerPart("corner-blind-divider", "front", "Corner blind divider front", { width: 18, height: 618, depth: 70 });
      if (shelfCount > 0) {
        addCatalogCornerPart("corner-right-shelves", "shelf", "Corner right shelves", { width: 862, height: 18, depth: 686 }, Math.max(0, Math.min(16, shelfCount)));
      }
      if (plinth > 0) addCatalogCornerPart("corner-plinth-front-board", "plinth", "Corner plinth front board", { width: 468, height: 100, depth: 18 });
      addCatalogCornerPart("corner-blind-front-filler", "front", "Corner blind front filler", { width: 340, height: 618, depth: 18 });
      addCatalogCornerPart("corner-right-door", "front", "Corner right door", { width: 656.077, height: 618, depth: 18 });
      addCatalogCornerPart("corner-front-top-rail", "body", "Corner front top rail", { width: 864, height: 18, depth: 70 });
    }
  } else {
    items.push(boardItem({ id: "side-panels", category: "body", description: "Side panels", quantity: spec.geometryKind === "corner" ? 4 : 2, length: cabinetH, width: depth, thickness: boardT, material: bodyRef, slot: "carcass" }));
    if (spec.moduleType === "fwm_catalog_base_doors" || spec.moduleType === "fwm_catalog_base_drawers") {
      const railDepth = Math.max(50, Math.min(90, depth * 0.14));
      items.push(
        boardItem({ id: "bottom-panel", category: "body", description: "Bottom panel", quantity: 1, length: innerW, width: depth, thickness: boardT, material: bodyRef, slot: "carcass" }),
        boardItem({ id: "top-front-back-rails", category: "body", description: "Top front/back rails", quantity: 2, length: innerW, width: railDepth, thickness: boardT, material: bodyRef, slot: "carcass" })
      );
    } else {
      items.push(boardItem({ id: "bottom-top-panels", category: "body", description: "Bottom and top panels", quantity: spec.geometryKind === "sink" ? 1 : 2, length: innerW, width: depth, thickness: boardT, material: bodyRef, slot: "carcass" }));
    }
    if (backT > 0) items.push(boardItem({ id: "back-panel", category: "back", description: "Back panel", quantity: 1, length: innerW, width: innerH, thickness: backT, material: backRef, slot: "back" }));
    if (shelfCount > 0) items.push(boardItem({ id: "shelves", category: "shelf", description: "Adjustable shelves", quantity: shelfCount, length: innerW, width: Math.max(1, depth - backT), thickness: shelfT, material: shelfRef ?? bodyRef, slot: "shelf" }));
    if (plinth > 0) {
      items.push(boardItem({ id: "plinth-front-board", category: "plinth", description: "Plinth front board", quantity: 1, length: width, width: plinth, thickness: Math.max(8, Math.min(boardT, 24)), material: plinthRef ?? bodyRef, slot: "plinth" }));
    }
    if (drawerCount > 0) {
      const frontH = Math.max(80, (height - plinth) / drawerCount);
      const drawerDepth = resolveDrawerDepthLayout(depth, backT, num(p, "drawerBackGapMm", 10)).depthMm;
      const drawerBoxThickness = Math.max(10, Math.min(16, boardT - 2));
      const drawerPreset = resolveFwmDrawerSystemPreset(p.drawerSystemBrand ?? p.drawerSystem, p.drawerSystemSize);
      const drawerBottomLength = spec.moduleType === "fwm_catalog_base_drawers"
        ? Math.max(100, drawerPreset.systemDepthMm - drawerPreset.bottomDepthDeductionMm)
        : Math.max(100, drawerDepth - drawerBoxThickness);
      const drawerBottomWidth = spec.moduleType === "fwm_catalog_base_drawers"
        ? Math.max(60, width - boardT * 2 - drawerPreset.bottomWidthDeductionMm)
        : Math.max(60, width - boardT * 2 - 70);
      items.push(boardItem({ id: "drawer-fronts", category: "front", description: "Drawer fronts", quantity: drawerCount, length: width - 4, width: frontH - 2, thickness: frontT, material: frontRef, slot: "front" }));
      if (spec.moduleType !== "fwm_catalog_base_drawers") {
        items.push(boardItem({ id: "drawer-boxes", category: "drawer_box", description: "Drawer box boards", quantity: drawerCount * 4, length: drawerDepth, width: 120, thickness: boardT, material: bodyRef, slot: "carcass" }));
      }
      items.push(boardItem({ id: "drawer-bottoms", category: "drawer_bottom", description: "Drawer bottom boards", quantity: drawerCount, length: drawerBottomLength, width: drawerBottomWidth, thickness: num(p, "drawerBottomThickness", drawerBottomMaterial?.defaultThicknessMm ?? 8), material: drawerBottomRef ?? bodyRef, slot: "drawer_bottom" }));
      if (
        spec.moduleType === "fwm_catalog_base_drawers" &&
        p.hasCutleryInnerDrawer === true &&
        p.cutleryInnerDrawerAllowed === true
      ) {
        items.push(
          boardItem({
            id: "cutlery-inner-drawer-front",
            category: "front",
            description: "Cutlery inner drawer front",
            quantity: 1,
            length: num(p, "cutleryInnerDrawerFrontWidthMm", Math.max(60, innerW - num(p, "innerDrawerFrontDeductionMm", 126))),
            width: 64,
            thickness: frontT,
            material: frontRef,
            slot: "front"
          }),
          boardItem({
            id: "cutlery-inner-drawer-bottom",
            category: "drawer_bottom",
            description: "Cutlery inner drawer bottom",
            quantity: 1,
            length: num(p, "cutleryInnerDrawerDepthMm", Math.max(100, drawerBottomLength - 40)),
            width: num(p, "cutleryInnerDrawerWidthMm", Math.max(60, innerW - num(p, "cutleryInsertWidthDeductionMm", 0))),
            thickness: num(p, "drawerBottomThickness", drawerBottomMaterial?.defaultThicknessMm ?? 8),
            material: drawerBottomRef ?? bodyRef,
            slot: "drawer_bottom"
          }),
          boardItem({
            id: "cutlery-inner-drawer-cross-rail",
            category: "drawer_bottom",
            description: "Cutlery inner drawer cross rail",
            quantity: 1,
            length: num(p, "cutleryInnerDrawerCrossRailWidthMm", Math.max(60, innerW - num(p, "innerDrawerCrossRailDeductionMm", 111))),
            width: 36,
            thickness: boardT,
            material: drawerBottomRef ?? bodyRef,
            slot: "drawer_bottom"
          })
        );
      }
    }
    if (doorCount > 0) {
      items.push(boardItem({ id: "door-fronts", category: "front", description: "Door fronts", quantity: doorCount, length: Math.max(80, (width - 4) / doorCount), width: Math.max(100, height - plinth - 8), thickness: frontT, material: frontRef, slot: "front" }));
    }
    if (spec.appliance === "dishwasher") {
      items.push(boardItem({ id: "dishwasher-front-panel", category: "front", description: "Integrated dishwasher front panel", quantity: 1, length: Math.max(80, width - 4), width: Math.max(120, height - plinth - 8), thickness: frontT, material: frontRef, slot: "front" }));
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

  const materials: Record<string, PortableMaterialRef> = {
    body: bodyRef!,
    front: frontRef!,
    back: backRef!,
    shelf: shelfRef ?? bodyRef!,
    drawer_bottom: drawerBottomRef ?? bodyRef!,
    plinth: plinthRef ?? bodyRef!
  };
  if (["table", "worktop", "accessory"].includes(spec.geometryKind) && worktopRef) {
    materials.worktop = worktopRef;
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
    materials,
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
