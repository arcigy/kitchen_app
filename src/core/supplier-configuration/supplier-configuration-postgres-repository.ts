import type { ClientContext } from "../client/client-context";
import { withSchemaClient } from "../database/postgres-client";
import type { SupplierConfigurationRepository } from "./supplier-configuration-repository";
import type { ClientSupplierPortal } from "./supplier-configuration-types";

type SupplierRow = {
  supplier_id: string;
  display_name: string;
  start_url: string;
  adapter_key: string;
  sort_order: number;
};

export function createPostgresSupplierConfigurationRepository(args: {
  connectionString: string;
  schema: string;
}): SupplierConfigurationRepository {
  return {
    async listEnabledForClient(ctx: ClientContext): Promise<ClientSupplierPortal[]> {
      return withSchemaClient(args.connectionString, args.schema, async (client) => {
        const result = await client.query<SupplierRow>(
          `
            SELECT
              suppliers.supplier_id,
              COALESCE(client_suppliers.display_name_override, suppliers.display_name) AS display_name,
              suppliers.start_url,
              suppliers.adapter_key,
              COALESCE(client_suppliers.sort_order_override, suppliers.sort_order) AS sort_order
            FROM arcigy_client_suppliers AS client_suppliers
            INNER JOIN arcigy_suppliers AS suppliers
              ON suppliers.supplier_id = client_suppliers.supplier_id
            WHERE client_suppliers.client_id = $1
              AND client_suppliers.enabled = true
              AND suppliers.is_active = true
            ORDER BY COALESCE(client_suppliers.sort_order_override, suppliers.sort_order), suppliers.display_name
          `,
          [ctx.clientId]
        );
        return result.rows.map((row) => ({
          supplierId: row.supplier_id,
          displayName: row.display_name,
          startUrl: row.start_url,
          adapterKey: row.adapter_key,
          sortOrder: row.sort_order
        }));
      });
    }
  };
}
