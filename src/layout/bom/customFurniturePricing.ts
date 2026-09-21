import type { ClientCatalog, MaterialDefinition } from "../../core/catalog/catalog-types";
import { recipeThicknessMm, type ManufacturingRecipeSnapshot } from "../../core/project-manufacturing/project-manufacturing-types";
import { createPricingCatalog } from "../../core/catalog/pricing-catalog";
import {
  calculateCommercialPricingFromQuoteBom,
  type PortableMaterialRef,
  type PortableQuoteBomItem,
  type PortableQuoteBomPayload
} from "../../modules/runtime/portableCommercial";
import type { CustomFurnitureInstance } from "../customFurnitureTypes";
import { polygonAreaMm2, polygonBoundsMm, polygonEdgeLengthMm, sanitizeCustomFurnitureProfile } from "../customFurnitureGeometry";
import type { BOMResult } from "./bomTypes";

function round(value: number, digits = 4) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function toPortableMaterial(material: MaterialDefinition | null): PortableMaterialRef | null {
  if (!material) return null;
  return {
    ...material,
    catalogId: material.id,
    key: material.id,
    family: material.materialType === "board" ? material.boardFamily : material.edgeFamily,
    assignmentSource: "catalog"
  };
}

function resolveMaterial(catalog: ClientCatalog, materialId: string, materialType: "board" | "edge") {
  const pricingCatalog = createPricingCatalog(catalog);
  const direct = pricingCatalog.getMaterialDefinitionById(materialId);
  if (direct?.materialType === materialType) return direct;
  return catalog.materials.find((material) => material.materialType === materialType && material.isActive) ?? null;
}

function recipeUnitPrice(catalog: ClientCatalog, recipe: ManufacturingRecipeSnapshot, areaM2: number, perimeterLm: number): number | null {
  const pricing = createPricingCatalog(catalog);
  let total = 0;
  for (const layer of recipe.layers) {
    const unit = layer.unitPrice === undefined ? pricing.getUnitPriceForCatalogId(layer.materialId) : layer.unitPrice;
    if (unit == null) return null;
    total += unit * areaM2;
  }
  for (const operation of recipe.operations) {
    const count = operation.repetitions;
    const quantity = operation.basis === "area" ? areaM2 : operation.basis === "length" ? perimeterLm : operation.basis === "pieces" ? 1 : 1;
    total += operation.unitRate * quantity * count;
  }
  return areaM2 > 0 ? round(total / areaM2, 6) : null;
}

export function createCustomFurnitureQuoteBom(furniture: CustomFurnitureInstance, catalog: ClientCatalog): PortableQuoteBomPayload {
  const items: PortableQuoteBomItem[] = [];
  const materials: Record<string, PortableMaterialRef> = {};

  for (const board of furniture.params.boards) {
    const profile = sanitizeCustomFurnitureProfile(board.profile);
    if (profile.length < 3) continue;
    const boardMaterial = resolveMaterial(catalog, board.materialId, "board");
    const boardPortable = toPortableMaterial(boardMaterial);
    const bounds = polygonBoundsMm(profile);
    const areaM2 = round(polygonAreaMm2(profile) / 1_000_000);
    const perimeterLm = round(profile.reduce((sum, _point, index) => sum + polygonEdgeLengthMm(profile, index), 0) / 1000);
    const recipe = board.recipeSnapshot;
    const recipePrice = recipe ? recipeUnitPrice(catalog, recipe, areaM2, perimeterLm) : null;
    const materialSlotId = `board:${board.id}`;
    if (boardPortable) materials[materialSlotId] = boardPortable;

    items.push({
      id: `custom-board-${furniture.id}-${board.id}`,
      itemType: "board",
      category: board.kind === "worktop" ? "worktop" : "custom_furniture_board",
      name: recipe?.name ?? board.name,
      description: recipe ? `${recipe.name} (${board.name})` : `${board.name} (${board.kind})`,
      pricingBasis: "sheet_area",
      pricingUnit: "m2",
      quantity: 1,
      pricingQuantity: areaM2,
      pricingQuantityBase: areaM2,
      dimensionsMm: {
        length: Math.max(1, Math.round(bounds.widthMm)),
        width: Math.max(1, Math.round(bounds.heightMm)),
        thickness: Math.max(1, Math.round(recipe ? recipeThicknessMm(recipe) : board.thicknessMm))
      },
      metrics: {
        areaM2,
        billableAreaM2: areaM2,
        wasteMultiplier: 1
      },
      materialSlotId,
      materialGroup: board.kind === "worktop" ? "worktop" : boardMaterial?.boardFamily ?? "body",
      material: boardPortable,
      catalogRef: !recipe && boardPortable
        ? {
            entityType: "material",
            catalogId: boardPortable.catalogId,
            displayName: boardPortable.displayName,
            group: boardPortable.family,
            pricingBasis: "sheet_area",
            pricingUnit: "m2"
          }
        : null,
      pricingLookup: !recipe && boardPortable
        ? {
            key: boardPortable.catalogId,
            sourceCatalogId: boardPortable.catalogId,
            sourceEntityType: "material",
            resolution: "catalog_id"
          }
        : null,
      ...(recipe ? { unitPriceOverride: recipePrice } : {}),
      sourcePartIds: [board.id],
      notes: [
        `Area: ${areaM2} m2`,
        `Thickness: ${Math.round(recipe ? recipeThicknessMm(recipe) : board.thicknessMm)} mm`,
        ...(recipe ? [`Recipe: ${recipe.name} v${recipe.version}`, `Recipe layers: ${recipe.layers.length}`, `Recipe operations: ${recipe.operations.length}`] : [])
      ],
      pricingGroup: "boards"
    });

    for (const edgeBand of board.edgeBanding) {
      const edgeMaterial = resolveMaterial(catalog, edgeBand.materialId, "edge");
      const edgePortable = toPortableMaterial(edgeMaterial);
      const edgeLengthLm = round(polygonEdgeLengthMm(profile, edgeBand.edgeIndex) / 1000);
      const edgeSlotId = `edge:${board.id}:${edgeBand.edgeIndex}`;
      if (edgePortable) materials[edgeSlotId] = edgePortable;
      items.push({
        id: `custom-edge-${furniture.id}-${board.id}-${edgeBand.edgeIndex}`,
        itemType: "edge_band",
        category: "custom_furniture_edge",
        name: `${board.name} edge ${edgeBand.edgeIndex + 1}`,
        description: `${board.name} edge band ${edgeBand.edgeIndex + 1}`,
        pricingBasis: "linear_length",
        pricingUnit: "lm",
        quantity: 1,
        pricingQuantity: edgeLengthLm,
        pricingQuantityBase: edgeLengthLm,
        metrics: { edgeLengthLm },
        materialSlotId: edgeSlotId,
        materialGroup: edgeMaterial?.edgeFamily ?? "body",
        material: edgePortable,
        catalogRef: edgePortable
          ? {
              entityType: "material",
              catalogId: edgePortable.catalogId,
              displayName: edgePortable.displayName,
              group: edgePortable.family,
              pricingBasis: "linear_length",
              pricingUnit: "lm"
            }
          : null,
        pricingLookup: edgePortable
          ? {
              key: edgePortable.catalogId,
              sourceCatalogId: edgePortable.catalogId,
              sourceEntityType: "material",
              resolution: "catalog_id"
            }
          : null,
        sourcePartIds: [board.id],
        pricingGroup: "edge_bands"
      });
    }
  }

  const bounds = furniture.params.boundary.reduce(
    (acc, point) => ({
      minX: Math.min(acc.minX, point.x),
      maxX: Math.max(acc.maxX, point.x),
      minZ: Math.min(acc.minZ, point.z),
      maxZ: Math.max(acc.maxZ, point.z)
    }),
    { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity }
  );
  const widthMm = Number.isFinite(bounds.maxX - bounds.minX) ? bounds.maxX - bounds.minX : 1;
  const depthMm = Number.isFinite(bounds.maxZ - bounds.minZ) ? bounds.maxZ - bounds.minZ : 1;

  return {
    schemaVersion: "module-quote-bom.v1",
    moduleType: "custom_furniture",
    displayName: furniture.params.name,
    generatedAt: new Date().toISOString(),
    moduleInstance: {
      quantity: 1,
      widthMm: Math.max(1, Math.round(widthMm)),
      heightMm: Math.max(1, Math.round(furniture.params.topOffsetMm - furniture.params.baseOffsetMm)),
      depthMm: Math.max(1, Math.round(depthMm))
    },
    materials,
    items
  };
}

export function createCustomFurnitureBOM(furniture: CustomFurnitureInstance, catalog: ClientCatalog): BOMResult {
  const quoteBom = createCustomFurnitureQuoteBom(furniture, catalog);
  return {
    moduleType: quoteBom.moduleType,
    displayName: quoteBom.displayName,
    quoteBom,
    pricing: calculateCommercialPricingFromQuoteBom({
      quoteBom,
      catalog,
      boardWasteMultiplier: 1,
      laborCostFixed: 0
    }),
    materialsSnapshot: null
  };
}
