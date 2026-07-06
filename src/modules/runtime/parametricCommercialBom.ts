import type { ClientCatalog, ComponentDefinition, ComponentType, MaterialDefinition } from "../../core/catalog/catalog-types";
import {
  type PortableComponentRef,
  type PortableMaterialRef,
  type PortableQuoteBomItem
} from "./portableCommercial";
import { createModuleRuntimeCatalogContext } from "./runtimeCatalog";

export function num(params: Record<string, unknown>, key: string, fallback: number) {
  const value = params[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function rec(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function round(value: number, digits = 4) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function materialRef(material: MaterialDefinition | undefined | null, role: string): PortableMaterialRef | null {
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

export function componentRef(component: ComponentDefinition | undefined | null): PortableComponentRef | null {
  return component ? { ...component, catalogId: component.id } : null;
}

export function resolveMaterial(
  catalog: ClientCatalog,
  params: Record<string, unknown>,
  slot: "body" | "front" | "back" | "shelf" | "drawer_bottom" | "plinth" | "worktop"
) {
  const materials = rec(params.materials);
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
    slot === "front" ? assignments.front ?? materials.frontKey :
    slot === "back" ? assignments.back ?? materials.backKey :
    slot === "shelf" ? assignments.shelf ?? materials.shelfKey ?? materials.bodyKey :
    slot === "drawer_bottom" ? assignments.drawer_bottom ?? materials.drawerKey :
    slot === "plinth" ? assignments.plinth ?? materials.plinthKey ?? materials.bodyKey :
    slot === "worktop" ? assignments.worktop ?? materials.worktopKey :
    assignments.carcass ?? materials.bodyKey;
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

export function resolveComponent(
  catalog: ClientCatalog,
  params: Record<string, unknown>,
  key: "handleComponentId" | "hingeComponentId" | "runnerComponentId" | "legComponentId" | "clipComponentId" | "liftUpComponentId" | "hangingBracketComponentId" | "shelfSupportComponentId"
) {
  const assignments = rec(params.componentAssignments);
  const context = createModuleRuntimeCatalogContext(catalog);
  const explicit = typeof params[key] === "string" && params[key] ? params[key] as string : assignments[key] as string | undefined;
  const resolve = (componentType: ComponentType, defaultKind?: "handle" | "hinge" | "drawerSystem") => context.resolveComponent(explicit, componentType, defaultKind);
  if (key === "handleComponentId") return context.resolveComponent(explicit ?? assignments.handle as string | undefined, "handle", "handle");
  if (key === "hingeComponentId") return context.resolveComponent(explicit ?? assignments.hinge as string | undefined, "hinge", "hinge");
  if (key === "runnerComponentId") return context.resolveComponent(explicit ?? assignments.runner as string | undefined, "runner", "drawerSystem");
  if (key === "liftUpComponentId") return resolve("lift_up");
  if (key === "hangingBracketComponentId") return resolve("hanging_bracket");
  if (key === "shelfSupportComponentId") return resolve("shelf_support");
  if (key === "legComponentId") return resolve("leg");
  return resolve("plinth_clip");
}

export function boardItem(args: {
  id: string;
  category: string;
  description: string;
  quantity: number;
  length: number;
  width: number;
  thickness: number;
  material: PortableMaterialRef | null;
  slot: string;
  wasteMultiplier?: number;
}): PortableQuoteBomItem {
  const area = round((args.length * args.width * args.quantity) / 1_000_000);
  const billableArea = round(area * (args.wasteMultiplier ?? 1));
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
    pricingQuantity: billableArea,
    dimensionsMm: {
      length: round(args.length, 2),
      width: round(args.width, 2),
      thickness: round(args.thickness, 2)
    },
    metrics: {
      areaM2: area,
      billableAreaM2: billableArea,
      wasteMultiplier: args.wasteMultiplier ?? 1
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

export function edgeItem(id: string, description: string, lengthLm: number, material: PortableMaterialRef | null, slot: string): PortableQuoteBomItem {
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

export function hardwareItem(id: string, description: string, quantity: number, component: PortableComponentRef | null): PortableQuoteBomItem | null {
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

export function findEdgeMaterial(catalog: ClientCatalog, board: MaterialDefinition | undefined | null) {
  if (!board) return null;
  return catalog.materials.find((material) =>
    material.materialType === "edge" &&
    material.isActive &&
    material.edgeFamily === (board.boardFamily === "front" ? "front" : board.boardFamily === "worktop" ? "worktop" : "body")
  ) ?? null;
}
