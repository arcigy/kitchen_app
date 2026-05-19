import type { ClientCatalog, KitchenDefaults } from "./catalog-types";

export function getKitchenDefaults(catalog: Pick<ClientCatalog, "kitchenDefaults">): KitchenDefaults {
  return { ...catalog.kitchenDefaults };
}
