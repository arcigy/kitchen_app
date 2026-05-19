import type { ClientCatalog, MaterialDefinition } from "./catalog-types";

export type MaterialCatalog = ReturnType<typeof createMaterialCatalog>;

export function createMaterialCatalog(catalog: Pick<ClientCatalog, "materials">) {
  const materialDefinitionsById = new Map(catalog.materials.map((material) => [material.id, material]));

  return {
    materialDefinitions: catalog.materials,
    getMaterialDefinitionById(id: string): MaterialDefinition | null {
      return materialDefinitionsById.get(id) ?? null;
    },
    getMaterialDefinitionsByType(type: MaterialDefinition["materialType"]): MaterialDefinition[] {
      return catalog.materials.filter((material) => material.materialType === type);
    }
  };
}
