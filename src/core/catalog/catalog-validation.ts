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

export function normalizeCatalogMeta(catalog: ClientCatalog): ClientCatalog {
  const now = new Date().toISOString();
  return {
    ...catalog,
    meta: {
      catalogVersion: catalog.meta?.catalogVersion ?? 1,
      source: catalog.meta?.source ?? "client-custom",
      createdAt: catalog.meta?.createdAt ?? now,
      updatedAt: catalog.meta?.updatedAt ?? now
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

  for (const id of findDuplicates(catalog.materials.map((material) => material.id))) errors.push(`duplicate material id: ${id}`);
  for (const id of findDuplicates(catalog.components.map((component) => component.id))) errors.push(`duplicate component id: ${id}`);
  for (const id of findDuplicates(moduleIds)) errors.push(`duplicate module id: ${id}`);

  requireRefs(errors, "kitchenDefaults", kitchenDefaultRefs(catalog.kitchenDefaults), materialIds);
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
