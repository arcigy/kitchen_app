import { edgeGroup, readEdgeBindings, orphanEdgeBindings, BODY_EDGE_GROUP, FRONT_EDGE_GROUP } from "../../core/edge-banding/edgeEntities";
import { getManufacturingAssembly, manufacturingPartLabel } from "./manufacturingParts";
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
import { getFwmFurnitureSpec } from "./definitions";
import { normalizeFwmFurnitureParams, type FwmFurnitureParams } from "./types";
import {
  drawerRunnerVariantKey,
  drawerRunnerVariantLabel,
  groupDrawerFrontHeights
} from "../drawers/drawerHeightContract";

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

function configuredComponentId(
  params: FwmFurnitureParams,
  key: "handleComponentId" | "hingeComponentId" | "legComponentId" | "clipComponentId" | "hingePlateComponentId" | "legPlateComponentId" | "hangingBracketComponentId" | "shelfSupportComponentId" | "assemblyPackComponentId"
): string | undefined {
  const assignments = rec(params.componentAssignments);
  const explicit = typeof params[key] === "string" && params[key] ? params[key] as string : undefined;
  if (explicit) return explicit;
  const assignmentKey = key === "handleComponentId" ? "handle" :
    key === "hingeComponentId" ? "hinge" : key;
  const assigned = assignments[assignmentKey];
  return typeof assigned === "string" && assigned ? assigned : undefined;
}

function componentUsage(
  catalog: ClientCatalog,
  params: FwmFurnitureParams,
  key: "handleComponentId" | "hingeComponentId" | "legComponentId" | "clipComponentId" | "hingePlateComponentId" | "legPlateComponentId" | "hangingBracketComponentId" | "shelfSupportComponentId" | "assemblyPackComponentId",
  componentType: ComponentType
): { component: PortableComponentRef | null; configuredId: string | undefined; componentType: ComponentType } {
  return {
    component: componentRef(resolveComponent(catalog, params, key)),
    configuredId: configuredComponentId(params, key),
    componentType
  };
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

function resolveComponent(catalog: ClientCatalog, params: FwmFurnitureParams, key: "handleComponentId" | "hingeComponentId" | "legComponentId" | "clipComponentId" | "hingePlateComponentId" | "legPlateComponentId" | "hangingBracketComponentId" | "shelfSupportComponentId" | "assemblyPackComponentId") {
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
  if (key === "legComponentId") return resolve("leg");
  const types = { clipComponentId: "plinth_clip", hingePlateComponentId: "hinge_plate", legPlateComponentId: "leg_plate", hangingBracketComponentId: "hanging_bracket", shelfSupportComponentId: "shelf_support", assemblyPackComponentId: "assembly_pack" } as const;
  return resolve(types[key]);
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
  const materialGroup = canonicalBomMaterialGroup(args.slot);
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
      length: round(args.length, 4),
      width: round(args.width, 4),
      thickness: round(args.thickness, 4)
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
  const materialGroup = canonicalBomMaterialGroup(slot);
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

function hardwareItem(
  id: string,
  description: string,
  quantity: number,
  usage: { component: PortableComponentRef | null; configuredId: string | undefined; componentType: ComponentType }
): PortableQuoteBomItem | null {
  if (quantity <= 0) return null;
  const component = usage.component;
  if (!component) {
    const configuredId = usage.configuredId;
    return {
      id,
      itemType: "hardware",
      category: usage.componentType,
      name: description,
      description,
      pricingBasis: "piece",
      pricingUnit: "pcs",
      quantity,
      pricingQuantity: quantity,
      materialGroup: usage.componentType,
      component: null,
      catalogRef: null,
      pricingLookup: configuredId
        ? {
            key: configuredId,
            sourceCatalogId: configuredId,
            sourceEntityType: "component",
            resolution: "unresolved_catalog_id"
          }
        : null,
      pricingGroup: "hardware",
      pricingQuantityBase: quantity,
      notes: ["Required hardware is unresolved in the tenant catalog."],
      validationErrors: [`Missing catalog component${configuredId ? ` ${configuredId}` : ""}`]
    };
  }
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
  const width = num(p, "width", spec.width);
  const height = num(p, "height", spec.height);
  const depth = num(p, "depth", spec.depth);
  const boardT = num(p, "boardThickness", 18);
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
  const items: PortableQuoteBomItem[] = [];
  const { parts, edges, hardware: hardwareCounts, clips } = getManufacturingAssembly(normalized, catalog);
  const bindings = readEdgeBindings(p.edgeBandingOverrides);
  const orphanEdges = orphanEdgeBindings({ kind: "module", edges }, bindings);
  const isLower90Corner = spec.moduleType === "fwm_catalog_base_corner" && String(p.variant).startsWith("corner_90");
  const runnerHeights = parts.flatMap(part => part.drawerFrontHeightMm == null ? []
    : part.sourcePartIds.filter(id => /drawer_left_side_\d+$/.test(id)).map(() => part.drawerFrontHeightMm!));
  for (const part of parts.filter(part => part.id.includes("cutlery-inner-drawer-front"))) {
    for (let index = 0; index < part.quantity; index += 1) runnerHeights.push(part.width);
  }
  for (const part of parts) {
    const material = part.role === "front" ? frontRef
      : part.role === "back" ? backRef
      : part.role === "shelf" ? shelfRef ?? bodyRef
      : part.role === "drawer_bottom" ? drawerBottomRef
      : part.role === "plinth" ? plinthRef ?? bodyRef : bodyRef;
    const slot = part.role === "body" ? "carcass" : part.role;
    const description = manufacturingPartLabel(part);
    const board = boardItem({ ...part, category: part.role, description, material, slot });
    // For shaped panels, net material follows the actual face, not its bounding rectangle.
    const areaM2 = round(part.areaM2);
    // Preserve the existing 10% cutting allowance of the lower 90° family.
    const wasteMultiplier = isLower90Corner ? 1.1 : 1;
    const billableAreaM2 = round(areaM2 * wasteMultiplier);
    board.metrics = { areaM2, billableAreaM2, wasteMultiplier };
    board.pricingQuantity = billableAreaM2;
    board.pricingQuantityBase = areaM2;
    board.sourcePartIds = part.sourcePartIds;
    if (orphanEdges.length && items.length === 0) board.validationErrors = [`${orphanEdges.length} priradení olepenia nezodpovedá aktuálnemu tvaru. Skontrolujte Olepenie v rozšírených nastaveniach.`];
    items.push(board);
    const groups = new Map<string, {groupId:string;explicit:boolean;lengthLm:number}>();
    for (const physical of edges.filter(edge => part.sourcePartIds.includes(edge.partId))) {
      const groupId = edgeGroup(physical, bindings);
      if (groupId) {
        const explicit=Object.hasOwn(bindings,physical.id), key=`${groupId}:${explicit}`;
        groups.set(key,{groupId,explicit,lengthLm:(groups.get(key)?.lengthLm??0)+physical.lengthMm/1000});
      }
    }
    for (const {groupId,explicit,lengthLm} of groups.values()) {
      const family = part.role === "front" ? "front" : "body";
      const isDefault = groupId === FRONT_EDGE_GROUP || groupId === BODY_EDGE_GROUP;
      const edgeMaterial = isDefault ? catalog.materials.find(candidate => candidate.materialType === "edge" && candidate.isActive && candidate.edgeFamily === family) : undefined;
      const edge = edgeItem(`${part.id}-edge${explicit?":assigned":""}${groupId === (part.role === "front" ? FRONT_EDGE_GROUP : BODY_EDGE_GROUP) ? "" : `:${groupId}`}`, `${description} – olepenie`, lengthLm, materialRef(edgeMaterial, "edge"), family);
      edge.edgeGroupId = groupId;
      edge.edgeGroupExplicit = explicit;
      edge.sourcePartIds = part.sourcePartIds;
      edge.quantity = part.quantity;
      items.push(edge);
    }
  }

  const hardware = [
    hardwareItem("handles", "Visible handles", hardwareCounts.handle, componentUsage(catalog, p, "handleComponentId", "handle")),
    hardwareItem(isLower90Corner ? "corner-hinges" : "hinges", "Door hinges", hardwareCounts.hinge, componentUsage(catalog, p, "hingeComponentId", "hinge")),
    hardwareItem("adjustable-legs", "Adjustable cabinet legs", hardwareCounts.leg, componentUsage(catalog, p, "legComponentId", "leg")),
    hardwareItem("plinth-clips", `Soklové klipy · predné ${clips.front}, bočné ${clips.side}, spolu ${clips.total}`, hardwareCounts.plinth_clip, componentUsage(catalog, p, "clipComponentId", "plinth_clip")),
    hardwareItem("hinge-plates", "Podložky pántov", hardwareCounts.hinge, componentUsage(catalog, p, "hingePlateComponentId", "hinge_plate")),
    hardwareItem("leg-plates", "Podložky nôh", hardwareCounts.leg, componentUsage(catalog, p, "legPlateComponentId", "leg_plate")),
    hardwareItem("hanging-brackets", "Závesné kovanie", p.wallMounted === true || spec.kitchenRole === "top" ? num(p, "hangingBracketCount", 2) : 0, componentUsage(catalog, p, "hangingBracketComponentId", "hanging_bracket")),
    hardwareItem("shelf-supports", "Policové podpery", parts.filter(part => part.role === "shelf").reduce((sum, part) => sum + part.quantity * 4, 0), componentUsage(catalog, p, "shelfSupportComponentId", "shelf_support")),
    hardwareItem("assembly-pack", "Montážny balíček", spec.kitchenRole ? 1 : 0, componentUsage(catalog, p, "assemblyPackComponentId", "assembly_pack"))
  ].filter((item): item is PortableQuoteBomItem => !!item);
  if (runnerHeights.length > 0) {
    for (const bucket of groupDrawerFrontHeights(runnerHeights)) {
      const variantKey = drawerRunnerVariantKey(bucket.frontHeightMm, boardT);
      const variantLabel = drawerRunnerVariantLabel(bucket.frontHeightMm, boardT);
      hardware.push({
        id: `runners-${variantKey}`,
        itemType: "hardware",
        category: "runner",
        name: `Zásuvkové výsuvy · ${variantLabel}`,
        description: `Zásuvkové výsuvy · ${variantLabel}`,
        pricingBasis: "piece",
        pricingUnit: "pcs",
        quantity: bucket.count,
        pricingQuantity: bucket.count,
        materialGroup: "runner",
        component: null,
        catalogRef: null,
        pricingLookup: null,
        pricingGroup: "hardware",
        pricingQuantityBase: bucket.count,
        variantKey,
        variantLabel,
        notes: ["Konkrétny výsuv sa priraďuje podľa výšky čela a hrúbky korpusu cez Materiály alebo Supplier Bridge."]
      });
    }
  }
  items.push(...hardware);

  const moduleQuantity = Math.max(1, Math.round(num(p, "quantity", 1)));
  if (moduleQuantity > 1) for (const item of items) {
    if (item.sourcePartIds?.length) {
      const sourceIds = item.sourcePartIds;
      item.sourcePartIds = Array.from({ length: moduleQuantity }, (_, copy) => sourceIds.map(id => `${id}:copy-${copy + 1}`)).flat();
    }
    item.quantity *= moduleQuantity;
    item.pricingQuantity = round(item.pricingQuantity * moduleQuantity);
    if (item.pricingQuantityBase != null) item.pricingQuantityBase = round(item.pricingQuantityBase * moduleQuantity);
    if (item.metrics?.areaM2 != null) item.metrics.areaM2 = round(item.metrics.areaM2 * moduleQuantity);
    if (item.metrics?.billableAreaM2 != null) item.metrics.billableAreaM2 = round(item.metrics.billableAreaM2 * moduleQuantity);
    if (item.metrics?.edgeLengthLm != null) item.metrics.edgeLengthLm = round(item.metrics.edgeLengthLm * moduleQuantity);
  }

  const pricingCatalog = createPricingCatalog(catalog);
  for (const item of items) {
    const lookup = item.pricingLookup?.sourceCatalogId;
    if (!item.edgeGroupId && lookup && pricingCatalog.getUnitPriceForCatalogId(lookup) === null) {
      item.validationErrors = [...(item.validationErrors ?? []), `Missing price for ${lookup}`];
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
      quantity: moduleQuantity,
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
      laborCostFixed: (spec.reserve ? 64 : 48) * moduleQuantity
    }),
    materialsSnapshot: null
  };
}
