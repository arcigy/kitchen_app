import { isComponentAllowedForCategory } from "../core/project-materials/project-material-business";
import { setRuntimeProjectAssignments } from "../core/project-materials/runtimeProjectAssignments";
import { convertPriceCurrency, isPriceCurrency } from "../core/pricing/currency";
import { repairSupplierMaterialPricing } from "../core/project-materials/supplierMaterialPricingRepair";
import { setRuntimeEdgeGroups } from "../core/edge-banding/edgeGroups";
import type { ClientCatalog, MaterialDefinition, ComponentDefinition } from "../core/catalog/catalog-types";
import type { ProjectMaterialAssignmentsState } from "../core/project-materials/project-material-types";

/**
 * Keeps supplier-confirmed material snapshots local to the open project. The
 * tenant catalog remains immutable, while renderers and module rebuilds can
 * resolve the exact material ID persisted in project assignments.
 */
export function createProjectMaterialRuntimeCatalog(baseCatalog: ClientCatalog): {
  catalog: ClientCatalog;
  applyProjectAssignments: (assignments: ProjectMaterialAssignmentsState) => void;
} {
  const catalog = structuredClone(baseCatalog);
  const baseComponents = structuredClone(baseCatalog.components);
  const baseMaterials = structuredClone(baseCatalog.materials);
  const basePrices = structuredClone(baseCatalog.priceList.prices);

  const applyProjectAssignments = (assignments: ProjectMaterialAssignmentsState): void => {
    assignments = repairSupplierMaterialPricing(assignments);
    setRuntimeEdgeGroups(catalog, assignments);
    setRuntimeProjectAssignments(catalog, assignments);
    const componentSnapshots = new Map<string, ComponentDefinition>();
    const supplierSnapshots = new Map<string, MaterialDefinition>();
    catalog.priceList.prices = structuredClone(basePrices);
    for (const assignment of assignments.assignments) {
      if (assignment.kind === "component" && assignment.snapshots.component && !isComponentAllowedForCategory(assignment.snapshots.component.definition, assignment.category)) continue;
      const snapshot = assignment.kind === "material" ? assignment.snapshots.material : assignment.snapshots.component;
      if (snapshot && isPriceCurrency(snapshot.currency) && isPriceCurrency(catalog.priceList.currency)) {
        if (snapshot.unitPrice === null) delete catalog.priceList.prices[snapshot.definition.id];
        else catalog.priceList.prices[snapshot.definition.id] = convertPriceCurrency(snapshot.unitPrice, snapshot.currency, catalog.priceList.currency);
      }
      const component = assignment.kind === "component" ? assignment.snapshots.component?.definition : undefined;
      if (component && assignment.componentId === component.id) componentSnapshots.set(component.id, structuredClone(component));
      const material = assignment.kind === "material" ? assignment.snapshots.material?.definition : undefined;
      if (!material || assignment.materialId !== material.id) continue;
      supplierSnapshots.set(material.id, structuredClone(material));
    }

    catalog.components = [
      ...baseComponents.filter(component => !componentSnapshots.has(component.id)).map(component => structuredClone(component)),
      ...componentSnapshots.values()
    ];
    catalog.materials = [
      ...baseMaterials.filter((material) => !supplierSnapshots.has(material.id)).map((material) => structuredClone(material)),
      ...supplierSnapshots.values()
    ];
  };

  return { catalog, applyProjectAssignments };
}
