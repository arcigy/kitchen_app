import type { ClientContext } from "../client/client-context";
import type { ClientSupplierPortal } from "./supplier-configuration-types";

export type SupplierConfigurationRepository = {
  listEnabledForClient(ctx: ClientContext): Promise<ClientSupplierPortal[]>;
};

const DEMO_CLIENT_SUPPLIERS: ClientSupplierPortal[] = [
  { supplierId: "demos", displayName: "Démos", startUrl: "https://www.demos24plus.com/", adapterKey: "demos", sortOrder: 10 },
  { supplierId: "schachermayer", displayName: "Schachermayer", startUrl: "https://webshop.schachermayer.com/cat/cs-CZ", adapterKey: "schachermayer", sortOrder: 20 },
  { supplierId: "hranipex", displayName: "Hranipex", startUrl: "https://www.hranipex.cz/cs/", adapterKey: "hranipex", sortOrder: 30 },
  { supplierId: "jaf_holz", displayName: "JAF Holz", startUrl: "https://www.jafholz.cz/", adapterKey: "jaf_holz", sortOrder: 40 }
];

export function createSeedSupplierConfigurationRepository(): SupplierConfigurationRepository {
  return createInMemorySupplierConfigurationRepository({ client_arcigy_demo: DEMO_CLIENT_SUPPLIERS });
}

export function createInMemorySupplierConfigurationRepository(
  assignments: Readonly<Record<string, readonly ClientSupplierPortal[]>> = {}
): SupplierConfigurationRepository {
  return {
    async listEnabledForClient(ctx) {
      return (assignments[ctx.clientId] ?? []).map((supplier) => ({ ...supplier }));
    }
  };
}
