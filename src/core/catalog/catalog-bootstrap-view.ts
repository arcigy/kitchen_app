import type { ClientCatalog } from "./catalog-types";

/**
 * Creates the catalog view required by the interactive browser runtime.
 * Supplier provenance remains authoritative on the server and is restored into
 * project/FQP snapshots by the server-side save assembler.
 */
export function createClientCatalogBootstrapView(catalog: ClientCatalog): ClientCatalog {
  return {
    ...catalog,
    materials: catalog.materials.map((material) => {
      const projected = { ...material };
      delete projected.supplierSource;
      return projected;
    }),
    components: catalog.components.map((component) => {
      const projected = { ...component };
      delete projected.supplierSource;
      return projected;
    })
  };
}
