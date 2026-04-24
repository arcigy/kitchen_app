import { getUnitPriceForCatalogId } from "../../data/pricing";
import { getComponentDefinitionById } from "../../data/pricing/componentDefinitions";
import { getMaterialDefinitionById, materialDefinitions } from "../../data/pricing/materialDefinitions";
import type { ComponentDefinition, MaterialDefinition, PricingBasis, PricingUnit } from "../../data/pricing/types";

export type CommercialPricingStatus = "ok" | "incomplete";

export type PortableCommercialSelectionState = {
  boardMaterials: Record<string, string>;
  boardThicknesses: Record<string, number>;
};

export type PortableCatalogRef = {
  entityType: "material" | "component";
  catalogId: string;
  displayName?: string;
  group?: string;
  pricingBasis?: PricingBasis;
  pricingUnit?: PricingUnit;
};

export type PortablePricingLookup = {
  catalogType?: string;
  key?: string;
  sourceCatalogId?: string;
  sourceEntityType?: "material" | "component";
  resolution?: string;
};

export type PortableQuoteBomItem = {
  id: string;
  itemType: "board" | "edge_band" | "hardware";
  category: string;
  name: string;
  description: string;
  pricingBasis: PricingBasis;
  pricingUnit: PricingUnit;
  quantity: number;
  pricingQuantity: number;
  formulas?: Record<string, string>;
  dimensionsMm?: {
    length: number;
    width: number;
    thickness: number;
  };
  metrics?: {
    areaM2?: number;
    billableAreaM2?: number;
    wasteMultiplier?: number;
    edgeLengthLm?: number;
  };
  materialSlotId?: string;
  materialGroup?: string;
  material?: PortableMaterialRef | null;
  component?: PortableComponentRef | null;
  catalogRef?: PortableCatalogRef | null;
  pricingLookup?: PortablePricingLookup | null;
  sourcePartIds?: string[];
  notes?: string[];
  validationErrors?: string[];
  pricingGroup?: "boards" | "edge_bands" | "hardware";
  pricingQuantityBase?: number | null;
  unitPrice?: number | null;
  itemCost?: number | null;
  itemCostFormula?: string;
};

export type PortableMaterialRef = MaterialDefinition & {
  role?: string;
  key?: string;
  catalogId: string;
  family?: string;
  assignmentSource?: string;
};

export type PortableComponentRef = ComponentDefinition & {
  catalogId: string;
};

export type PortableQuoteBomPayload = {
  schemaVersion: "module-quote-bom.v1";
  moduleType: string;
  displayName: string;
  generatedAt: string;
  moduleInstance: {
    quantity: number;
    widthMm: number;
    heightMm: number;
    depthMm: number;
    wallMounted?: boolean;
  };
  systemParameters?: Record<string, unknown>;
  materials?: Record<string, PortableMaterialRef>;
  items: PortableQuoteBomItem[];
  aggregates?: {
    boardsByMaterial?: Array<Record<string, unknown>>;
    edgeBandsByMaterial?: Array<Record<string, unknown>>;
    componentsByCatalogId?: Array<Record<string, unknown>>;
  };
};

export type PortableCommercialPricingPayload = {
  schemaVersion: "module-commercial-pricing.v1";
  moduleType: string;
  displayName: string;
  generatedAt: string;
  pricingStatus: CommercialPricingStatus;
  validationErrors: string[];
  moduleInstance: PortableQuoteBomPayload["moduleInstance"];
  materials?: PortableQuoteBomPayload["materials"];
  items: PortableQuoteBomItem[];
  groups: {
    boards: { areaM2: number; pricedAreaM2: number; cost: number };
    edge_bands: { lengthLm: number; cost: number };
    hardware: { pieces: number; cost: number };
  };
  priceInputs: {
    currency: "EUR";
    boardWasteMultiplier: number;
    laborCostFixed: number;
    marginPercent: number;
  };
  calculationFormulas: Record<string, string>;
  aggregates?: PortableQuoteBomPayload["aggregates"];
  materialCost: number;
  laborCostFixed: number;
  subtotalCost: number;
  marginPercent: number;
  marginAmount: number;
  finalPrice: number;
};

type PortableAggregateRow = {
  catalogId: string;
  displayName: string;
  quantity: number;
  pricedQuantity?: number;
  unit: PricingUnit;
  group?: string;
  itemCount: number;
};

export type PortableMaterialSlotAssignment = {
  slotId: string;
  partId?: string;
  label: string;
  description?: string;
  boardFamily?: string;
  thicknessParameterKey?: string;
  assignedMaterial: PortableMaterialRef;
};

export type PortableComponentAssignment = {
  assignmentKey: string;
  label: string;
  sourceRule?: string;
  component: PortableComponentRef;
};

export type PortableMaterialsSnapshot = {
  schemaVersion: "module-materials.v1";
  moduleType: string;
  displayName: string;
  slotAssignments?: PortableMaterialSlotAssignment[];
  componentAssignments?: PortableComponentAssignment[];
  livePartMaterials?: Array<{
    partName: string;
    paramKeys?: string[];
    materials?: Array<{
      name?: string | null;
      colorHex?: string | null;
      transparent?: boolean;
      opacity?: number | null;
    }>;
  }>;
};

const COMMERCIAL_SELECTIONS_KEY = "commercialSelections";

function roundMetric(value: number, digits = 4): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function roundCurrency(value: number): number {
  return roundMetric(value, 2);
}

function roundPricingQuantity(value: number): number {
  return roundMetric(value, 4);
}

function deepClone<T>(value: T): T {
  return structuredClone(value);
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toCamelCase(value: string) {
  const parts = value
    .split(/[^a-zA-Z0-9]+/g)
    .filter(Boolean)
    .map((part) => part.trim());
  if (parts.length === 0) return value;
  return parts
    .map((part, index) => {
      if (index === 0) return part[0]!.toLowerCase() + part.slice(1);
      return part[0]!.toUpperCase() + part.slice(1);
    })
    .join("");
}

function singularize(value: string) {
  return value.endsWith("s") ? value.slice(0, -1) : value;
}

function evaluateExpression(expression: string | undefined, context: Record<string, unknown>, fallback: number): number {
  if (!expression) return fallback;
  try {
    const evaluator = new Function(
      "context",
      `const { floor, ceil, round, min, max, abs, pow, sqrt } = Math; with (context) { return (${expression}); }`
    ) as (context: Record<string, unknown>) => unknown;
    const next = evaluator(context);
    return typeof next === "number" && Number.isFinite(next) ? next : fallback;
  } catch {
    return fallback;
  }
}

function getCommercialSelections(params: Record<string, unknown>): PortableCommercialSelectionState {
  const raw = params[COMMERCIAL_SELECTIONS_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { boardMaterials: {}, boardThicknesses: {} };
  }

  const maybeSelections = raw as Record<string, unknown>;
  const boardMaterials =
    maybeSelections.boardMaterials && typeof maybeSelections.boardMaterials === "object" && !Array.isArray(maybeSelections.boardMaterials)
      ? Object.fromEntries(
          Object.entries(maybeSelections.boardMaterials as Record<string, unknown>).flatMap(([key, value]) =>
            typeof value === "string" && value.trim().length > 0 ? [[key, value.trim()]] : []
          )
        )
      : {};

  const boardThicknesses =
    maybeSelections.boardThicknesses && typeof maybeSelections.boardThicknesses === "object" && !Array.isArray(maybeSelections.boardThicknesses)
      ? Object.fromEntries(
          Object.entries(maybeSelections.boardThicknesses as Record<string, unknown>).flatMap(([key, value]) => {
            const next = asFiniteNumber(value);
            return next !== null && next > 0 ? [[key, next]] : [];
          })
        )
      : {};

  return {
    boardMaterials,
    boardThicknesses
  };
}

export function updateCommercialSelections(
  params: Record<string, unknown>,
  updater: (current: PortableCommercialSelectionState) => PortableCommercialSelectionState
) {
  const current = getCommercialSelections(params);
  const next = updater({
    boardMaterials: { ...current.boardMaterials },
    boardThicknesses: { ...current.boardThicknesses }
  });
  params[COMMERCIAL_SELECTIONS_KEY] = next;
  return next;
}

export function getPortableMaterialsSnapshotSelections(
  snapshot: PortableMaterialsSnapshot | null | undefined,
  params: Record<string, unknown>
) {
  const commercialSelections = getCommercialSelections(params);
  const slotAssignments = snapshot?.slotAssignments ?? [];
  const slotMaterialCatalogIds: Record<string, string> = {};
  const slotThicknesses: Record<string, number> = {};

  for (const slot of slotAssignments) {
    const selectedCatalogId = commercialSelections.boardMaterials[slot.slotId] ?? slot.assignedMaterial.catalogId;
    slotMaterialCatalogIds[slot.slotId] = selectedCatalogId;

    const explicitThickness = commercialSelections.boardThicknesses[slot.slotId];
    if (typeof explicitThickness === "number" && Number.isFinite(explicitThickness) && explicitThickness > 0) {
      slotThicknesses[slot.slotId] = explicitThickness;
      continue;
    }

    const selectedMaterial = getMaterialDefinitionById(selectedCatalogId) ?? slot.assignedMaterial;
    const parameterValue =
      slot.thicknessParameterKey && asFiniteNumber(params[slot.thicknessParameterKey]) && asFiniteNumber(params[slot.thicknessParameterKey])! > 0
        ? asFiniteNumber(params[slot.thicknessParameterKey])!
        : null;
    slotThicknesses[slot.slotId] = parameterValue ?? selectedMaterial.defaultThicknessMm;
  }

  return {
    commercialSelections,
    slotMaterialCatalogIds,
    slotThicknesses
  };
}

function getNearestThickness(thicknesses: number[], desired: number) {
  return [...thicknesses].sort((left, right) => Math.abs(left - desired) - Math.abs(right - desired))[0] ?? thicknesses[0] ?? desired;
}

function normalizeBaseMaterialId(materialId: string) {
  const match = materialId.match(/^(.*)\.(\d+(?:_\d+)?)$/);
  return match ? match[1]! : materialId;
}

function formatThicknessToken(thickness: number) {
  return Number.isInteger(thickness) ? String(thickness) : String(thickness).replace(".", "_");
}

export function getBoardMaterialFamilyOptions() {
  const variantsByBaseId = new Map<
    string,
    {
      baseId: string;
      displayName: string;
      variants: MaterialDefinition[];
    }
  >();

  for (const material of materialDefinitions) {
    if (material.materialType !== "board" || !material.isActive) continue;
    const baseId = normalizeBaseMaterialId(material.id);
    const baseDisplayName = material.displayName.replace(/\s+\d+(?:[.,]\d+)?\s*mm$/i, "");
    const existing = variantsByBaseId.get(baseId);
    if (existing) {
      existing.variants.push(material);
      continue;
    }
    variantsByBaseId.set(baseId, {
      baseId,
      displayName: baseDisplayName,
      variants: [material]
    });
  }

  return [...variantsByBaseId.values()]
    .map((entry) => ({
      ...entry,
      variants: [...entry.variants].sort((left, right) => left.defaultThicknessMm - right.defaultThicknessMm)
    }))
    .sort((left, right) => left.displayName.localeCompare(right.displayName));
}

export function resolveBoardMaterialVariant(baseMaterialId: string, desiredThicknessMm: number) {
  const family = getBoardMaterialFamilyOptions().find((entry) => entry.baseId === baseMaterialId);
  if (!family) return null;
  const nearestThickness = getNearestThickness(
    family.variants.map((variant) => variant.defaultThicknessMm),
    desiredThicknessMm
  );
  return family.variants.find((variant) => variant.defaultThicknessMm === nearestThickness) ?? family.variants[0] ?? null;
}

function deriveBoardThicknessContext(snapshot: PortableMaterialsSnapshot | null | undefined, params: Record<string, unknown>) {
  const { slotMaterialCatalogIds, slotThicknesses } = getPortableMaterialsSnapshotSelections(snapshot, params);
  const slotAssignments = snapshot?.slotAssignments ?? [];
  const thicknessByKey: Record<string, number> = {};

  for (const slot of slotAssignments) {
    if (!slot.thicknessParameterKey) continue;
    const thickness = slotThicknesses[slot.slotId];
    if (typeof thicknessByKey[slot.thicknessParameterKey] !== "number") {
      thicknessByKey[slot.thicknessParameterKey] = thickness;
    }
  }

  const merged: Record<string, unknown> = { ...params };
  for (const [key, value] of Object.entries(thicknessByKey)) {
    merged[key] = value;
  }

  const drawerBottomSlot = slotAssignments.find((slot) => slot.thicknessParameterKey === "drawerBottomThickness");
  if (drawerBottomSlot) {
    merged.drawerBottomThickness = slotThicknesses[drawerBottomSlot.slotId];
  }

  const firstBodySlot = slotAssignments.find((slot) => slot.thicknessParameterKey === "boardThickness");
  if (firstBodySlot) {
    merged.boardThickness = slotThicknesses[firstBodySlot.slotId];
  }

  const firstFrontSlot = slotAssignments.find((slot) => slot.thicknessParameterKey === "frontThicknessMm");
  if (firstFrontSlot) {
    merged.frontThicknessMm = slotThicknesses[firstFrontSlot.slotId];
  }

  const firstBackSlot = slotAssignments.find((slot) => slot.thicknessParameterKey === "backThickness");
  if (firstBackSlot) {
    merged.backThickness = slotThicknesses[firstBackSlot.slotId];
  }

  const firstDrawerBoxSlot = slotAssignments.find((slot) => slot.thicknessParameterKey === "drawerBoxThickness");
  if (firstDrawerBoxSlot) {
    merged.drawerBoxThickness = slotThicknesses[firstDrawerBoxSlot.slotId];
  }

  return {
    paramsWithThicknesses: merged,
    slotMaterialCatalogIds,
    slotThicknesses
  };
}

function createEdgeMaterialFromBoard(boardMaterial: MaterialDefinition, fallback: PortableMaterialRef | null | undefined) {
  const desiredThickness = fallback?.defaultThicknessMm ?? 0.8;
  const family = boardMaterial.boardFamily === "front" ? "front" : boardMaterial.boardFamily === "drawer_box" ? "drawer_box" : boardMaterial.boardFamily === "shelf" ? "shelf" : boardMaterial.boardFamily === "worktop" ? "worktop" : "body";
  const colorTokens = [boardMaterial.decor, boardMaterial.color, boardMaterial.name]
    .join(" ")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean);

  const edgeCandidates = materialDefinitions.filter(
    (material) => material.materialType === "edge" && material.isActive && material.edgeFamily === family
  );

  const scored = edgeCandidates
    .map((candidate) => {
      const haystack = `${candidate.id} ${candidate.displayName} ${candidate.decor} ${candidate.color}`.toLowerCase();
      let score = 0;
      for (const token of colorTokens) {
        if (token.length < 3) continue;
        if (haystack.includes(token)) score += 1;
      }
      score -= Math.abs(candidate.defaultThicknessMm - desiredThickness);
      return { candidate, score };
    })
    .sort((left, right) => right.score - left.score);

  return scored[0]?.candidate ?? fallback ?? null;
}

function resolveBoardMaterialForSlot(
  item: PortableQuoteBomItem,
  snapshot: PortableMaterialsSnapshot | null | undefined,
  params: Record<string, unknown>
) {
  const { slotMaterialCatalogIds, slotThicknesses } = getPortableMaterialsSnapshotSelections(snapshot, params);
  const slotAssignments = snapshot?.slotAssignments ?? [];
  const slotAssignment = item.materialSlotId ? slotAssignments.find((entry) => entry.slotId === item.materialSlotId) : null;
  const selectedCatalogId =
    (item.materialSlotId ? slotMaterialCatalogIds[item.materialSlotId] : null) ??
    slotAssignment?.assignedMaterial.catalogId ??
    item.material?.catalogId ??
    null;

  const selectedMaterial = selectedCatalogId ? getMaterialDefinitionById(selectedCatalogId) : null;
  const thickness =
    (item.materialSlotId ? slotThicknesses[item.materialSlotId] : null) ??
    slotAssignment?.assignedMaterial.defaultThicknessMm ??
    selectedMaterial?.defaultThicknessMm ??
    item.material?.defaultThicknessMm ??
    item.dimensionsMm?.thickness ??
    18;

  if (!selectedMaterial) {
    return {
      material: item.material ?? null,
      thickness
    };
  }

  return {
    material: {
      ...selectedMaterial,
      catalogId: selectedMaterial.id,
      key: selectedMaterial.id,
      family: selectedMaterial.boardFamily,
      assignmentSource: "catalog"
    } satisfies PortableMaterialRef,
    thickness
  };
}

function resolveComponentForItem(
  item: PortableQuoteBomItem,
  snapshot: PortableMaterialsSnapshot | null | undefined,
  params: Record<string, unknown>
) {
  const current = item.component;
  const componentAssignments = snapshot?.componentAssignments ?? [];
  const normalizedItemId = item.id.toLowerCase();
  const findAssigned = (...assignmentKeys: string[]) =>
    componentAssignments.find((entry) => assignmentKeys.includes(entry.assignmentKey))?.component ?? null;

  const explicitComponentId =
    normalizedItemId.includes("runner")
      ? typeof params.runnerComponentId === "string"
        ? params.runnerComponentId
        : null
      : normalizedItemId.includes("handle")
        ? typeof params.handleComponentId === "string"
          ? params.handleComponentId
          : null
        : normalizedItemId.includes("adjustable-legs")
          ? typeof params.legComponentId === "string"
            ? params.legComponentId
            : null
          : normalizedItemId.includes("hinge")
            ? typeof params.hingeComponentId === "string"
              ? params.hingeComponentId
              : null
            : normalizedItemId.includes("plinth-clips")
              ? typeof params.clipComponentId === "string"
                ? params.clipComponentId
                : null
          : null;

  if (explicitComponentId) {
    const definition = getComponentDefinitionById(explicitComponentId);
    if (definition) {
      return { ...definition, catalogId: definition.id } satisfies PortableComponentRef;
    }
  }

  if (normalizedItemId.includes("plinth-clips")) {
    return findAssigned("plinth-clips") ?? current ?? null;
  }

  if (normalizedItemId.includes("carcass-fastener")) {
    return findAssigned("carcass-fasteners") ?? current ?? null;
  }

  if (normalizedItemId.includes("runner")) {
    return findAssigned("drawer-runners") ?? current ?? null;
  }

  if (normalizedItemId.includes("handle")) {
    return findAssigned("door-handles", "drawer-handles") ?? current ?? null;
  }

  if (normalizedItemId.includes("adjustable-legs")) {
    return findAssigned("adjustable-legs") ?? current ?? null;
  }

  if (normalizedItemId.includes("hinge")) {
    return findAssigned("door-hinges") ?? current ?? null;
  }

  return current ?? null;
}

function resolvePricingGroup(item: PortableQuoteBomItem) {
  if (item.itemType === "board") return "boards" as const;
  if (item.itemType === "edge_band") return "edge_bands" as const;
  return "hardware" as const;
}

function buildRuntimeAggregates(items: PortableQuoteBomItem[]) {
  const boardsByMaterial = new Map<string, PortableAggregateRow>();
  const edgeBandsByMaterial = new Map<string, PortableAggregateRow>();
  const componentsByCatalogId = new Map<string, PortableAggregateRow>();

  for (const item of items) {
    if (item.itemType === "board" && item.material?.catalogId) {
      const existing =
        boardsByMaterial.get(item.material.catalogId) ??
        {
          catalogId: item.material.catalogId,
          displayName: item.material.displayName,
          quantity: 0,
          pricedQuantity: 0,
          unit: "m2" as const,
          group: item.material.family ?? item.materialGroup,
          itemCount: 0
        };
      existing.quantity += item.metrics?.areaM2 ?? item.pricingQuantityBase ?? item.pricingQuantity;
      existing.pricedQuantity = (existing.pricedQuantity ?? 0) + item.pricingQuantity;
      existing.itemCount += 1;
      boardsByMaterial.set(existing.catalogId, existing);
      continue;
    }

    if (item.itemType === "edge_band" && item.material?.catalogId) {
      const existing =
        edgeBandsByMaterial.get(item.material.catalogId) ??
        {
          catalogId: item.material.catalogId,
          displayName: item.material.displayName,
          quantity: 0,
          unit: "lm" as const,
          group: item.material.family ?? item.materialGroup,
          itemCount: 0
        };
      existing.quantity += item.metrics?.edgeLengthLm ?? item.pricingQuantity;
      existing.itemCount += 1;
      edgeBandsByMaterial.set(existing.catalogId, existing);
      continue;
    }

    if (item.itemType === "hardware" && item.component?.catalogId) {
      const existing =
        componentsByCatalogId.get(item.component.catalogId) ??
        {
          catalogId: item.component.catalogId,
          displayName: item.component.displayName,
          quantity: 0,
          unit: "pcs" as const,
          group: item.component.componentType,
          itemCount: 0
        };
      existing.quantity += item.pricingQuantity;
      existing.itemCount += 1;
      componentsByCatalogId.set(existing.catalogId, existing);
    }
  }

  const sortRows = (rows: PortableAggregateRow[]) => rows.sort((left, right) => left.displayName.localeCompare(right.displayName));

  return {
    boardsByMaterial: sortRows(
      [...boardsByMaterial.values()].map((row) => ({
        ...row,
        quantity: roundPricingQuantity(row.quantity),
        pricedQuantity: roundPricingQuantity(row.pricedQuantity ?? row.quantity)
      }))
    ),
    edgeBandsByMaterial: sortRows(
      [...edgeBandsByMaterial.values()].map((row) => ({
        ...row,
        quantity: roundPricingQuantity(row.quantity)
      }))
    ),
    componentsByCatalogId: sortRows(
      [...componentsByCatalogId.values()].map((row) => ({
        ...row,
        quantity: roundPricingQuantity(row.quantity)
      }))
    )
  };
}

function buildFormulaContext(snapshot: PortableMaterialsSnapshot | null | undefined, params: Record<string, unknown>) {
  const { paramsWithThicknesses } = deriveBoardThicknessContext(snapshot, params);
  return { ...paramsWithThicknesses };
}

function applyItemAliases(itemId: string, quantity: number, context: Record<string, unknown>) {
  const camel = toCamelCase(itemId);
  const singularCamel = singularize(camel);
  context[camel] = quantity;
  context[`${camel}Count`] = quantity;
  context[`${singularCamel}Count`] = quantity;
  context[`${itemId.replace(/-/g, "_")}_count`] = quantity;
}

export function buildRuntimeQuoteBom(args: {
  bom: PortableQuoteBomPayload;
  materialsSnapshot?: PortableMaterialsSnapshot | null;
  params: Record<string, unknown>;
}): PortableQuoteBomPayload {
  const { bom, materialsSnapshot, params } = args;
  const nextBom = deepClone(bom);
  const validationErrors: string[] = [];
  const context = buildFormulaContext(materialsSnapshot, params);
  const slotAssignments = materialsSnapshot?.slotAssignments ?? [];
  const drawerSideItem = nextBom.items.find((item) => /drawer-box-\d+-side-panels$/.test(item.id) && item.dimensionsMm);
  if (drawerSideItem?.dimensionsMm) {
    const depthOffset = nextBom.moduleInstance.depthMm - drawerSideItem.dimensionsMm.length;
    context.drawerBoxDepth = (asFiniteNumber(params.depth) ?? nextBom.moduleInstance.depthMm) - depthOffset;
  }
  const drawerFrontBackItem = nextBom.items.find((item) => /drawer-box-\d+-front-back-panels$/.test(item.id) && item.dimensionsMm);
  if (drawerFrontBackItem?.dimensionsMm) {
    const drawerBoxThickness =
      (typeof context.drawerBoxThickness === "number" ? (context.drawerBoxThickness as number) : null) ??
      drawerFrontBackItem.dimensionsMm.thickness;
    const externalWidthMm = drawerFrontBackItem.dimensionsMm.length + 2 * drawerBoxThickness;
    const widthOffset = nextBom.moduleInstance.widthMm - externalWidthMm;
    context.drawerBoxWidth = (asFiniteNumber(params.width) ?? nextBom.moduleInstance.widthMm) - widthOffset;
  }

  for (const item of nextBom.items) {
    const formulas = item.formulas ?? {};
    const itemErrors = [...(item.validationErrors ?? [])];
    const localContext: Record<string, unknown> = { ...context };

    if (item.itemType === "board" && item.materialSlotId) {
      const slot = slotAssignments.find((entry) => entry.slotId === item.materialSlotId);
      const resolved = resolveBoardMaterialForSlot(item, materialsSnapshot, params);
      if (resolved.material) {
        item.material = resolved.material;
        item.name = `${resolved.material.name} - ${item.description}`;
        item.catalogRef = {
          entityType: "material",
          catalogId: resolved.material.catalogId,
          displayName: resolved.material.displayName,
          group: item.materialGroup ?? resolved.material.boardFamily,
          pricingBasis: item.pricingBasis,
          pricingUnit: item.pricingUnit
        };
        item.pricingLookup = {
          ...(item.pricingLookup ?? {}),
          key: resolved.material.catalogId,
          sourceCatalogId: resolved.material.catalogId,
          sourceEntityType: "material",
          resolution: "catalog_id"
        };
      }
      if (slot?.thicknessParameterKey) {
        localContext[slot.thicknessParameterKey] = resolved.thickness;
      }
    }

    if (item.itemType === "edge_band" && item.materialSlotId) {
      const baseBoardItem = nextBom.items.find((candidate) => candidate.materialSlotId === item.materialSlotId && candidate.itemType === "board");
      if (baseBoardItem?.material?.catalogId) {
        const boardMaterial = getMaterialDefinitionById(baseBoardItem.material.catalogId);
        const edgeMaterial = boardMaterial ? createEdgeMaterialFromBoard(boardMaterial, item.material ?? undefined) : item.material ?? null;
        if (edgeMaterial) {
          item.material = {
            ...edgeMaterial,
            catalogId: edgeMaterial.id ?? edgeMaterial.catalogId,
            key: edgeMaterial.id ?? edgeMaterial.catalogId,
            family: "edgeFamily" in edgeMaterial ? edgeMaterial.edgeFamily : (item.material?.family ?? undefined),
            assignmentSource: "catalog"
          } as PortableMaterialRef;
          item.name = item.description;
          item.catalogRef = {
            entityType: "material",
            catalogId: item.material.catalogId,
            displayName: item.material.displayName,
            group: item.materialGroup ?? item.material.family,
            pricingBasis: item.pricingBasis,
            pricingUnit: item.pricingUnit
          };
          item.pricingLookup = {
            ...(item.pricingLookup ?? {}),
            key: item.material.catalogId,
            sourceCatalogId: item.material.catalogId,
            sourceEntityType: "material",
            resolution: "catalog_id"
          };
        }
      }
    }

    if (item.itemType === "hardware") {
      const component = resolveComponentForItem(item, materialsSnapshot, params);
      if (component) {
        item.component = component;
        item.name = component.displayName;
        item.catalogRef = {
          entityType: "component",
          catalogId: component.catalogId,
          displayName: component.displayName,
          group: component.componentType,
          pricingBasis: item.pricingBasis,
          pricingUnit: item.pricingUnit
        };
        item.pricingLookup = {
          ...(item.pricingLookup ?? {}),
          key: component.catalogId,
          sourceCatalogId: component.catalogId,
          sourceEntityType: "component",
          resolution: "catalog_id"
        };
      }
    }

    const fallbackQuantity = asFiniteNumber(item.quantity) ?? 1;
    const quantity = Math.max(1, roundPricingQuantity(evaluateExpression(formulas.quantity, localContext, fallbackQuantity)));
    item.quantity = quantity;

    if (item.itemType === "board") {
      const fallbackLength = item.dimensionsMm?.length ?? 1;
      const fallbackWidth = item.dimensionsMm?.width ?? 1;
      const fallbackThickness = item.dimensionsMm?.thickness ?? 1;
      const lengthMm = Math.max(
        1,
        roundPricingQuantity(evaluateExpression(formulas.lengthMm ?? formulas.width, { ...localContext, quantity }, fallbackLength))
      );
      const widthMm = Math.max(
        1,
        roundPricingQuantity(evaluateExpression(formulas.widthMm ?? formulas.height, { ...localContext, quantity, lengthMm }, fallbackWidth))
      );
      const thicknessMm = Math.max(
        1,
        roundPricingQuantity(
          evaluateExpression(formulas.thicknessMm ?? formulas.thickness, { ...localContext, quantity, lengthMm, widthMm }, fallbackThickness)
        )
      );

      item.dimensionsMm = {
        length: lengthMm,
        width: widthMm,
        thickness: thicknessMm
      };

      const areaM2 = roundPricingQuantity(
        evaluateExpression(formulas.areaM2, { ...localContext, quantity, lengthMm, widthMm, thicknessMm }, (lengthMm * widthMm * quantity) / 1_000_000)
      );
      const wasteMultiplier = roundPricingQuantity(
        evaluateExpression(formulas.wasteMultiplier, { ...localContext, quantity, lengthMm, widthMm, thicknessMm, areaM2 }, item.metrics?.wasteMultiplier ?? 1)
      );
      const pricingQuantity = roundPricingQuantity(
        evaluateExpression(
          formulas.pricingQuantity,
          { ...localContext, quantity, lengthMm, widthMm, thicknessMm, areaM2, wasteMultiplier },
          areaM2 * wasteMultiplier
        )
      );

      item.metrics = {
        ...(item.metrics ?? {}),
        areaM2,
        billableAreaM2: pricingQuantity,
        wasteMultiplier
      };
      item.pricingQuantity = pricingQuantity;
      item.pricingQuantityBase = areaM2;
    } else if (item.itemType === "edge_band") {
      const relatedBoardItem = item.materialSlotId
        ? nextBom.items.find((candidate) => candidate.itemType === "board" && candidate.materialSlotId === item.materialSlotId && candidate.dimensionsMm)
        : null;
      const edgeContext = relatedBoardItem?.dimensionsMm
        ? {
            ...localContext,
            width: relatedBoardItem.dimensionsMm.length,
            height: relatedBoardItem.dimensionsMm.width,
            lengthMm: relatedBoardItem.dimensionsMm.length,
            widthMm: relatedBoardItem.dimensionsMm.width,
            thicknessMm: relatedBoardItem.dimensionsMm.thickness
          }
        : localContext;
      const edgeLengthMm = roundPricingQuantity(
        evaluateExpression(formulas.edgeLengthMm, { ...edgeContext, quantity }, (item.metrics?.edgeLengthLm ?? item.pricingQuantity) * 1000)
      );
      const edgeLengthLm = roundPricingQuantity(
        evaluateExpression(formulas.pricingQuantity, { ...edgeContext, quantity, edgeLengthMm }, edgeLengthMm / 1000)
      );
      item.metrics = {
        ...(item.metrics ?? {}),
        edgeLengthLm: edgeLengthLm
      };
      item.pricingQuantity = edgeLengthLm;
      item.pricingQuantityBase = edgeLengthLm;
    } else {
      item.pricingQuantity = roundPricingQuantity(
        evaluateExpression(formulas.pricingQuantity, { ...localContext, quantity }, item.pricingQuantity)
      );
      item.pricingQuantityBase = item.pricingQuantity;
    }

    item.pricingGroup = resolvePricingGroup(item);
    item.validationErrors = itemErrors;
    validationErrors.push(...itemErrors);
    applyItemAliases(item.id, item.quantity, context);
  }

  if (nextBom.materials) {
    const roleMap: Array<[string, string]> = [
      ["body", "body"],
      ["front", "front"],
      ["drawer", "drawer_box"],
      ["back", "back"]
    ];
    for (const [materialRoleKey, groupKey] of roleMap) {
      const boardItem = nextBom.items.find(
        (item) => item.itemType === "board" && item.material && (item.materialGroup === groupKey || item.material.role === materialRoleKey)
      );
      if (boardItem?.material) {
        nextBom.materials[materialRoleKey] = boardItem.material;
      }
    }
  }

  nextBom.moduleInstance = {
    ...nextBom.moduleInstance,
    widthMm: asFiniteNumber(params.width) ?? asFiniteNumber(params.lengthX) ?? nextBom.moduleInstance.widthMm,
    heightMm: asFiniteNumber(params.height) ?? nextBom.moduleInstance.heightMm,
    depthMm: asFiniteNumber(params.lengthZ) ?? asFiniteNumber(params.depth) ?? nextBom.moduleInstance.depthMm
  };

  nextBom.generatedAt = new Date().toISOString();
  nextBom.items = nextBom.items.map((item) => ({ ...item }));
  nextBom.aggregates = buildRuntimeAggregates(nextBom.items);
  return nextBom;
}

export function calculateCommercialPricingFromQuoteBom(args: {
  quoteBom: PortableQuoteBomPayload;
  boardWasteMultiplier?: number;
  laborCostFixed?: number;
}): PortableCommercialPricingPayload {
  const boardWasteMultiplier = args.boardWasteMultiplier ?? 1.1;
  const laborCostFixed = roundCurrency(args.laborCostFixed ?? 48);
  const validationErrors: string[] = [];

  const items = args.quoteBom.items.map((item) => {
    const nextItem = deepClone(item);
    const lookupKey = nextItem.pricingLookup?.sourceCatalogId ?? nextItem.pricingLookup?.key ?? nextItem.catalogRef?.catalogId ?? null;
    const itemErrors = [...(nextItem.validationErrors ?? [])];
    const unitPrice = lookupKey ? getUnitPriceForCatalogId(lookupKey) : null;

    if (!lookupKey) itemErrors.push(`Item ${nextItem.id} is missing pricing lookup.`);
    if (unitPrice === null) itemErrors.push(`Item ${nextItem.id} is missing unit price.`);
    if (!Number.isFinite(nextItem.pricingQuantity)) itemErrors.push(`Item ${nextItem.id} has invalid pricingQuantity.`);
    if (nextItem.itemType === "board" && !nextItem.dimensionsMm) itemErrors.push(`Board item ${nextItem.id} is missing dimensions.`);
    if (
      nextItem.itemType === "board" &&
      nextItem.dimensionsMm &&
      (!Number.isFinite(nextItem.dimensionsMm.length) ||
        !Number.isFinite(nextItem.dimensionsMm.width) ||
        !Number.isFinite(nextItem.dimensionsMm.thickness))
    ) {
      itemErrors.push(`Board item ${nextItem.id} has invalid dimensions.`);
    }
    if (
      (nextItem.itemType === "board" && (nextItem.pricingBasis !== "sheet_area" || nextItem.pricingUnit !== "m2")) ||
      (nextItem.itemType === "edge_band" && (nextItem.pricingBasis !== "linear_length" || nextItem.pricingUnit !== "lm")) ||
      (nextItem.itemType === "hardware" && (nextItem.pricingBasis !== "piece" || nextItem.pricingUnit !== "pcs"))
    ) {
      itemErrors.push(`Item ${nextItem.id} has inconsistent pricing basis or unit.`);
    }

    nextItem.unitPrice = unitPrice;
    nextItem.itemCost = unitPrice === null ? null : roundCurrency(nextItem.pricingQuantity * unitPrice);
    if (nextItem.itemCost !== null && !Number.isFinite(nextItem.itemCost)) {
      itemErrors.push(`Item ${nextItem.id} has invalid item cost.`);
      nextItem.itemCost = null;
    }
    nextItem.itemCostFormula = "pricingQuantity * unitPrice";
    nextItem.validationErrors = itemErrors;
    nextItem.pricingGroup = resolvePricingGroup(nextItem);
    validationErrors.push(...itemErrors);
    return nextItem;
  });

  const groups = {
    boards: { areaM2: 0, pricedAreaM2: 0, cost: 0 },
    edge_bands: { lengthLm: 0, cost: 0 },
    hardware: { pieces: 0, cost: 0 }
  };

  for (const item of items) {
    if (item.itemCost === null) continue;
    if (item.pricingGroup === "boards") {
      groups.boards.areaM2 = roundPricingQuantity(groups.boards.areaM2 + (item.pricingQuantityBase ?? item.pricingQuantity));
      groups.boards.pricedAreaM2 = roundPricingQuantity(groups.boards.pricedAreaM2 + item.pricingQuantity);
      groups.boards.cost = roundCurrency(groups.boards.cost + item.itemCost);
      continue;
    }
    if (item.pricingGroup === "edge_bands") {
      groups.edge_bands.lengthLm = roundPricingQuantity(groups.edge_bands.lengthLm + item.pricingQuantity);
      groups.edge_bands.cost = roundCurrency(groups.edge_bands.cost + item.itemCost);
      continue;
    }
    groups.hardware.pieces = roundPricingQuantity(groups.hardware.pieces + item.pricingQuantity);
    groups.hardware.cost = roundCurrency(groups.hardware.cost + item.itemCost);
  }

  const materialCost = roundCurrency(groups.boards.cost + groups.edge_bands.cost + groups.hardware.cost);
  const subtotalCost = roundCurrency(materialCost + laborCostFixed);

  return {
    schemaVersion: "module-commercial-pricing.v1",
    moduleType: args.quoteBom.moduleType,
    displayName: args.quoteBom.displayName,
    generatedAt: new Date().toISOString(),
    pricingStatus: validationErrors.length > 0 ? "incomplete" : "ok",
    validationErrors,
    moduleInstance: args.quoteBom.moduleInstance,
    materials: args.quoteBom.materials,
    items,
    groups,
    priceInputs: {
      currency: "EUR",
      boardWasteMultiplier,
      laborCostFixed,
      marginPercent: 0
    },
    calculationFormulas: {
      boardPricedQuantity: "areaM2 * wasteMultiplier",
      itemCost: "pricingQuantity * unitPrice",
      subtotalCost: "materialCost + laborCostFixed",
      marginAmount: "0",
      finalPrice: "subtotalCost"
    },
    aggregates: buildRuntimeAggregates(items),
    materialCost,
    laborCostFixed,
    subtotalCost,
    marginPercent: 0,
    marginAmount: 0,
    finalPrice: subtotalCost
  };
}

export function getCommercialSelectionStateKey() {
  return COMMERCIAL_SELECTIONS_KEY;
}
