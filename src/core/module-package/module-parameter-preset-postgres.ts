import type { ClientContext } from "../client/client-context";
import type { ClientCatalog } from "../catalog/catalog-types";
import { invalidateCatalogExactLookupCaches } from "../catalog/catalog-exact-lookup";
import { withSchemaClient } from "../database/postgres-client";
import type { FurnQuoteModulePackage } from "./module-package-types";
import { normalizePersistedSystemModulePackage } from "./module-package-persistence-compatibility";
import { prepareModuleParameterPreset, type CreateModuleParameterPresetInput } from "./module-parameter-presets";

export async function createPostgresModuleParameterPreset(
  database: { connectionString: string; schema: string },
  context: ClientContext,
  input: CreateModuleParameterPresetInput
) {
  const result = await withSchemaClient(database.connectionString, database.schema, async client => {
    await client.query("BEGIN");
    try {
      // Lock the tenant catalog first, so concurrent creates for any of its modules serialize.
      const catalogs = await client.query<{ catalog: ClientCatalog }>(
        "SELECT catalog FROM arcigy_client_catalogs WHERE client_id = $1 FOR UPDATE", [context.clientId]
      );
      const catalog = catalogs.rows[0]?.catalog;
      if (!catalog || catalog.clientId !== context.clientId) throw new Error("Client catalog not found.");
      const packages = await client.query<{ package: FurnQuoteModulePackage; source: string }>(
        "SELECT package, source FROM arcigy_module_packages WHERE client_id = $1 AND module_package_id = $2 FOR UPDATE",
        [context.clientId, input.modulePackageId]
      );
      const row = packages.rows[0];
      if (!row) throw new Error("Module package not found.");
      const current = normalizePersistedSystemModulePackage(row) as FurnQuoteModulePackage;
      const prepared = prepareModuleParameterPreset(current, catalog, input);
      const updated = await client.query(
        `UPDATE arcigy_module_packages SET package = $3::jsonb, package_hash = $4, source = 'dev-json', updated_at = now()
         WHERE client_id = $1 AND module_package_id = $2`,
        [context.clientId, input.modulePackageId, JSON.stringify(prepared.modulePackage), prepared.modulePackage.integrity.packageHash]
      );
      if (updated.rowCount !== 1) throw new Error("Module package update failed.");
      const catalogUpdate = await client.query(
        `UPDATE arcigy_client_catalogs SET catalog = $2::jsonb, updated_at = $3::timestamptz, db_updated_at = now()
         WHERE client_id = $1`,
        [context.clientId, JSON.stringify(prepared.catalog), prepared.catalog.meta.updatedAt]
      );
      if (catalogUpdate.rowCount !== 1) throw new Error("Client catalog update failed.");
      await client.query("COMMIT");
      return { modulePackage: prepared.modulePackage, preset: prepared.preset, catalogModule: prepared.catalogModule };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
  invalidateCatalogExactLookupCaches(context.clientId);
  return result;
}
