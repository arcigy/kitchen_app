import { getUnitPriceForCatalogId } from "../../data/pricing";
import { getMaterialDefinitionById } from "../../data/pricing/materialDefinitions";
import { calculateCommercialPricingFromQuoteBom, type PortableMaterialRef, type PortableQuoteBomPayload } from "../../modules/runtime/portableCommercial";
import { getModuleDescriptor } from "../../modules/registry";
import type { KitchenWorktopInstance, LayoutInstance } from "../appState";
import type { KitchenContext } from "../kitchenContext";
import { getKitchenWorktopAreaM2, getKitchenWorktopBoundsMm, sanitizeKitchenWorktopPath } from "../worktopGeometry";
import { calculateModuleBOM } from "./calculateBOM";
import type { BOMResult } from "./bomTypes";

export type WorktopFormulaView = {
  shapeKey: "I" | "L" | "U" | "custom";
  shapeLabel: string;
  depthMm: number;
  thicknessMm: number;
  segmentLengthsMm: number[];
  areaM2: number;
};

export type ProjectPricingView = {
  instanceId: string;
  kind: "module" | "worktop";
  label: string;
  result: BOMResult;
  worktopFormula?: WorktopFormulaView;
};

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function moduleLabel(instance: LayoutInstance) {
  return getModuleDescriptor(instance.params.type)?.label ?? instance.params.type;
}

function buildWorktopFormulaView(worktop: KitchenWorktopInstance): WorktopFormulaView {
  const path = sanitizeKitchenWorktopPath(worktop.params.path);
  const segmentLengthsMm: number[] = [];
  for (let index = 0; index < path.length - 1; index += 1) {
    const current = path[index]!;
    const next = path[index + 1]!;
    segmentLengthsMm.push(Math.round(Math.hypot(next.x - current.x, next.z - current.z)));
  }

  const shapeKey =
    segmentLengthsMm.length === 1 ? "I" : segmentLengthsMm.length === 2 ? "L" : segmentLengthsMm.length === 3 ? "U" : "custom";
  const shapeLabel =
    shapeKey === "I"
      ? "I pracovná doska"
      : shapeKey === "L"
        ? "L pracovná doska"
        : shapeKey === "U"
          ? "U pracovná doska"
          : `Tvarovaná pracovná doska (${segmentLengthsMm.length} úseky)`;

  return {
    shapeKey,
    shapeLabel,
    depthMm: Math.round(worktop.params.depthMm),
    thicknessMm: Math.round(worktop.params.thicknessMm),
    segmentLengthsMm,
    areaM2: round(getKitchenWorktopAreaM2(worktop.params), 4)
  };
}

function toPortableMaterialRef(materialId: string): PortableMaterialRef | null {
  const material = getMaterialDefinitionById(materialId);
  if (!material) return null;
  return {
    ...material,
    catalogId: material.id,
    key: material.id,
    family: material.boardFamily,
    assignmentSource: "catalog"
  } satisfies PortableMaterialRef;
}

function createWorktopQuoteBom(worktop: KitchenWorktopInstance, index: number): PortableQuoteBomPayload {
  const areaM2 = getKitchenWorktopAreaM2(worktop.params);
  const bounds = getKitchenWorktopBoundsMm(worktop.params);
  const material = toPortableMaterialRef(worktop.params.materialId);
  const formulaView = buildWorktopFormulaView(worktop);
  const description = areaM2 > 0 ? formulaView.shapeLabel : "Pracovná doska";

  return {
    schemaVersion: "module-quote-bom.v1",
    moduleType: "kitchen_worktop",
    displayName: `Pracovná doska #${index}`,
    generatedAt: new Date().toISOString(),
    moduleInstance: {
      quantity: 1,
      widthMm: bounds.widthMm,
      heightMm: worktop.params.thicknessMm,
      depthMm: bounds.depthMm
    },
    materials: material ? { worktop: material } : undefined,
    items: [
      {
        id: `worktop-board-${worktop.id}`,
        itemType: "board",
        category: "worktop",
        name: description,
        description,
        pricingBasis: "sheet_area",
        pricingUnit: "m2",
        quantity: 1,
        pricingQuantity: round(areaM2, 4),
        dimensionsMm: {
          length: bounds.widthMm,
          width: bounds.depthMm,
          thickness: worktop.params.thicknessMm
        },
        metrics: {
          areaM2: round(areaM2, 4),
          billableAreaM2: round(areaM2, 4),
          wasteMultiplier: 1
        },
        materialSlotId: "worktop",
        materialGroup: "worktop",
        material,
        catalogRef: material
          ? {
              entityType: "material",
              catalogId: material.catalogId,
              displayName: material.displayName,
              group: material.family,
              pricingBasis: "sheet_area",
              pricingUnit: "m2"
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
        sourcePartIds: [worktop.id],
        notes: [
          `Plocha: ${round(areaM2, 4)} m2`,
          `Cena: ${round(areaM2, 4)} m2 x ${round(getUnitPriceForCatalogId(worktop.params.materialId) ?? 0, 2)} EUR/m2`,
          `Tvar: ${formulaView.shapeKey}`,
          ...formulaView.segmentLengthsMm.map((lengthMm, segmentIndex) => `Úsek ${segmentIndex + 1}: ${lengthMm} mm`),
          `Hĺbka: ${formulaView.depthMm} mm`
        ],
        pricingGroup: "boards",
        pricingQuantityBase: round(areaM2, 4)
      }
    ]
  };
}

function createWorktopBOM(worktop: KitchenWorktopInstance, index: number): BOMResult {
  const quoteBom = createWorktopQuoteBom(worktop, index);
  return {
    moduleType: quoteBom.moduleType,
    displayName: quoteBom.displayName,
    quoteBom,
    pricing: calculateCommercialPricingFromQuoteBom({
      quoteBom,
      boardWasteMultiplier: 1,
      laborCostFixed: 0
    }),
    materialsSnapshot: null
  };
}

export function buildProjectPricingViews(
  instances: LayoutInstance[],
  worktops: KitchenWorktopInstance[],
  ctx: KitchenContext
): ProjectPricingView[] {
  const counts = new Map<string, number>();

  const moduleViews = instances.map((instance) => {
    const label = moduleLabel(instance);
    const nextCount = (counts.get(label) ?? 0) + 1;
    counts.set(label, nextCount);
    return {
      instanceId: instance.id,
      kind: "module" as const,
      label: `${label} #${nextCount}`,
      result: calculateModuleBOM(instance, ctx)
    };
  });

  const worktopViews = worktops.map((worktop, index) => ({
    instanceId: worktop.id,
    kind: "worktop" as const,
    label: `Pracovná doska #${index + 1}`,
    result: createWorktopBOM(worktop, index + 1),
    worktopFormula: buildWorktopFormulaView(worktop)
  }));

  return [...moduleViews, ...worktopViews];
}

export function buildProjectPricingPayload(entries: ProjectPricingView[]) {
  return {
    schemaVersion: "project-commercial-pricing.v2",
    generatedAt: new Date().toISOString(),
    entries: entries.map((entry) => ({
      instanceId: entry.instanceId,
      kind: entry.kind,
      label: entry.label,
      quoteBom: entry.result.quoteBom,
      pricing: entry.result.pricing
    })),
    totals: {
      boardsCost: round(entries.reduce((sum, entry) => sum + entry.result.pricing.groups.boards.cost, 0)),
      edgesCost: round(entries.reduce((sum, entry) => sum + entry.result.pricing.groups.edge_bands.cost, 0)),
      hardwareCost: round(entries.reduce((sum, entry) => sum + entry.result.pricing.groups.hardware.cost, 0)),
      laborCost: round(entries.reduce((sum, entry) => sum + entry.result.pricing.laborCostFixed, 0)),
      finalCost: round(entries.reduce((sum, entry) => sum + entry.result.pricing.finalPrice, 0))
    }
  };
}
