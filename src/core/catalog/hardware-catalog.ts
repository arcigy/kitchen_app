import type { ClientCatalog, HardwareDefinition } from "./catalog-types";

export function createHardwareCatalog(catalog: Pick<ClientCatalog, "hardware" | "components">) {
  const hardwareById = new Map(catalog.hardware.map((item) => [item.id, item]));
  const componentById = new Map(catalog.components.map((item) => [item.id, item]));
  return {
    hardware: catalog.hardware,
    components: catalog.components,
    getHardwareById(id: string): HardwareDefinition | null {
      return hardwareById.get(id) ?? null;
    },
    getComponentById(id: string) {
      return componentById.get(id) ?? null;
    }
  };
}
