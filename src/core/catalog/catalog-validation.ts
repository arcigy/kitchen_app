import type { ClientCatalog, ClientModuleDefinition, KitchenDefaults } from "./catalog-types";
import type { ComponentType } from "./catalog-types";

export class CatalogValidationError extends Error {
  constructor(public readonly errors: string[]) {
    super(`Invalid client catalog: ${errors.join("; ")}`);
  }
}

function findDuplicates(values: string[]): string[] {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }
  return [...duplicates].sort();
}

function requireRefs(errors: string[], label: string, refs: Array<string | undefined>, validIds: Set<string>) {
  for (const ref of refs) {
    if (ref && !validIds.has(ref)) errors.push(`${label} references missing catalog id: ${ref}`);
  }
}

function requireComponentType(
  errors: string[],
  label: string,
  ref: string | undefined,
  componentsById: Map<string, { componentType: ComponentType }>,
  expectedType: ComponentType
) {
  if (!ref) return;
  const component = componentsById.get(ref);
  if (!component) return;
  if (component.componentType !== expectedType) {
    errors.push(`${label} references ${ref}, expected componentType ${expectedType} but got ${component.componentType}`);
  }
}

function validateModule(module: ClientModuleDefinition, priceIds: Set<string>, errors: string[]) {
  if (!module.id.trim()) errors.push("module id is required");
  if (!module.moduleType.trim()) errors.push(`module ${module.id || "(missing id)"} has empty moduleType`);
  if (module.enabled && !module.moduleType.trim()) errors.push(`enabled module ${module.id} must have a valid moduleType`);
  if (module.pricingRef && !priceIds.has(module.pricingRef)) {
    errors.push(`module ${module.id} pricingRef references missing price: ${module.pricingRef}`);
  }
}

function kitchenDefaultRefs(defaults: KitchenDefaults) {
  return [
    defaults.carcassMaterialId,
    defaults.frontMaterialId,
    defaults.worktopMaterialId,
    defaults.plinthMaterialId,
    defaults.backPanelMaterialId,
    defaults.drawerBottomMaterialId
  ];
}

function validateManufacturingCatalog(catalog: ClientCatalog, materialIds: Set<string>, errors: string[]): void {
  const manufacturing = catalog.manufacturing;
  if (!manufacturing) return;
  const recipeIds = new Set<string>();
  for (const recipe of manufacturing.recipes) {
    if (!recipe.id.trim()) errors.push("manufacturing recipe id is required");
    if (recipeIds.has(recipe.id)) errors.push(`duplicate manufacturing recipe id: ${recipe.id}`);
    recipeIds.add(recipe.id);
    if (!recipe.name.trim() || !Number.isSafeInteger(recipe.version) || recipe.version < 1) {
      errors.push(`manufacturing recipe ${recipe.id} must have a name and positive version`);
    }
    if (recipe.layers.length === 0) errors.push(`manufacturing recipe ${recipe.id} must contain a layer`);
    for (const layer of recipe.layers) {
      if (!materialIds.has(layer.materialId)) errors.push(`manufacturing recipe ${recipe.id} references missing material: ${layer.materialId}`);
      if (!Number.isFinite(layer.thicknessMm) || layer.thicknessMm <= 0) errors.push(`manufacturing recipe ${recipe.id} has invalid layer thickness`);
      if (layer.unitPrice !== undefined && layer.unitPrice !== null && (!Number.isFinite(layer.unitPrice) || layer.unitPrice < 0)) {
        errors.push(`manufacturing recipe ${recipe.id} has invalid captured layer price`);
      }
    }
    if (recipe.surfaceMaterialId && !materialIds.has(recipe.surfaceMaterialId)) {
      errors.push(`manufacturing recipe ${recipe.id} references missing surface material: ${recipe.surfaceMaterialId}`);
    }
    for (const operation of recipe.operations) {
      if (!Number.isFinite(operation.unitRate) || operation.unitRate < 0 || !Number.isSafeInteger(operation.repetitions) || operation.repetitions < 1) {
        errors.push(`manufacturing recipe ${recipe.id} has invalid operation ${operation.id}`);
      }
    }
  }
  for (const rates of [manufacturing.boardWasteByMaterialId, manufacturing.edgeWasteByMaterialId]) {
    for (const [materialId, rate] of Object.entries(rates)) {
      if (!materialIds.has(materialId)) errors.push(`manufacturing waste references missing material: ${materialId}`);
      if (!Number.isFinite(rate) || rate < 0) errors.push(`manufacturing waste has invalid rate for ${materialId}`);
    }
  }
}

export function normalizeCatalogMeta(catalog: ClientCatalog): ClientCatalog {
  const now = new Date().toISOString();
  return {
    ...catalog,
    meta: {
      catalogVersion: catalog.meta?.catalogVersion ?? 1,
      source: catalog.meta?.source ?? "client-custom",
      createdAt: catalog.meta?.createdAt ?? now,
      updatedAt: catalog.meta?.updatedAt ?? now,
      ...(catalog.meta?.lastSynchronizedAt !== undefined
        ? { lastSynchronizedAt: catalog.meta.lastSynchronizedAt }
        : {})
    }
  };
}

export function validateClientCatalog(input: ClientCatalog): ClientCatalog {
  const catalog = normalizeCatalogMeta(input);
  const errors: string[] = [];
  const materialIds = new Set(catalog.materials.map((material) => material.id));
  const componentIds = new Set(catalog.components.map((component) => component.id));
  const componentsById = new Map(catalog.components.map((component) => [component.id, component]));
  const geometryIds = new Set(catalog.componentGeometry.map((geometry) => geometry.id));
  const moduleIds = catalog.modules.map((module) => module.id);
  const priceIds = new Set(Object.keys(catalog.priceList.prices));

  if (
    catalog.meta.lastSynchronizedAt !== undefined &&
    (typeof catalog.meta.lastSynchronizedAt !== "string" || Number.isNaN(Date.parse(catalog.meta.lastSynchronizedAt)))
  ) {
    errors.push("meta.lastSynchronizedAt must be an ISO date string");
  }

  for (const id of findDuplicates(catalog.materials.map((material) => material.id))) errors.push(`duplicate material id: ${id}`);
  for (const id of findDuplicates(catalog.components.map((component) => component.id))) errors.push(`duplicate component id: ${id}`);
  for (const id of findDuplicates(moduleIds)) errors.push(`duplicate module id: ${id}`);
  for (const code of findDuplicates(catalog.materials.map((material) => material.materialCode?.trim() ?? "").filter(Boolean))) {
    errors.push(`duplicate materialCode: ${code}`);
  }
  for (const code of findDuplicates(catalog.components.map((component) => component.componentCode?.trim() ?? "").filter(Boolean))) {
    errors.push(`duplicate componentCode: ${code}`);
  }

  requireRefs(errors, "kitchenDefaults", kitchenDefaultRefs(catalog.kitchenDefaults), materialIds);
  validateManufacturingCatalog(catalog, materialIds, errors);
  requireRefs(errors, "kitchenDefaults", [
    catalog.kitchenDefaults.defaultHandleComponentId,
    catalog.kitchenDefaults.defaultHingeComponentId,
    catalog.kitchenDefaults.defaultDrawerSystemComponentId
  ], componentIds);
  requireComponentType(errors, "kitchenDefaults.defaultHandleComponentId", catalog.kitchenDefaults.defaultHandleComponentId, componentsById, "handle");
  requireComponentType(errors, "kitchenDefaults.defaultHingeComponentId", catalog.kitchenDefaults.defaultHingeComponentId, componentsById, "hinge");
  requireComponentType(errors, "kitchenDefaults.defaultDrawerSystemComponentId", catalog.kitchenDefaults.defaultDrawerSystemComponentId, componentsById, "runner");

  for (const component of catalog.components) {
    if (!geometryIds.has(component.geometryId)) errors.push(`component ${component.id} references missing geometry: ${component.geometryId}`);
  }

  if (catalog.priceList.currency !== "EUR") errors.push(`unsupported priceList currency: ${catalog.priceList.currency}`);
  const priceableIds = new Set([...materialIds, ...componentIds]);
  for (const [id, price] of Object.entries(catalog.priceList.prices)) {
    if (!priceableIds.has(id)) errors.push(`priceList references missing catalog id: ${id}`);
    if (!Number.isFinite(price) || price < 0) errors.push(`invalid price for ${id}`);
  }

  for (const module of catalog.modules) validateModule(module, priceIds, errors);

  if (errors.length > 0) throw new CatalogValidationError(errors);
  return catalog;
}
