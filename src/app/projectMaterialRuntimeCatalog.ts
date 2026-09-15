import type { ClientCatalog, MaterialDefinition } from "../core/catalog/catalog-types";
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
  const baseMaterials = structuredClone(baseCatalog.materials);

  const applyProjectAssignments = (assignments: ProjectMaterialAssignmentsState): void => {
    const supplierSnapshots = new Map<string, MaterialDefinition>();
    for (const assignment of assignments.assignments) {
      const material = assignment.kind === "material" ? assignment.snapshots.material?.definition : undefined;
      if (!material?.supplierSource || assignment.materialId !== material.id) continue;
      supplierSnapshots.set(material.id, structuredClone(material));
    }

    catalog.materials = [
      ...baseMaterials.filter((material) => !supplierSnapshots.has(material.id)).map((material) => structuredClone(material)),
      ...supplierSnapshots.values()
    ];
  };

  return { catalog, applyProjectAssignments };
}
