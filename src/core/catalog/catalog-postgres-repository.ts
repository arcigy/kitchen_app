import type { ClientContext } from "../client/client-context";
import { withSchemaClient } from "../database/postgres-client";
import { createSystemSeedClientCatalogRepository, type ClientCatalogRepository } from "./catalog-repository";
import type { ClientCatalog } from "./catalog-types";
import { validateClientCatalog } from "./catalog-validation";

type CatalogRow = {
  catalog: unknown;
};

function assertCatalogClient(ctx: ClientContext, catalog: ClientCatalog): void {
  if (catalog.clientId !== ctx.clientId) throw new Error("Catalog clientId must match ClientContext.");
}

export function createPostgresClientCatalogRepository(args: {
  connectionString: string;
  schema: string;
}): ClientCatalogRepository {
  const seed = createSystemSeedClientCatalogRepository();

  const readCatalog = async (ctx: ClientContext): Promise<ClientCatalog | null> =>
    withSchemaClient(args.connectionString, args.schema, async (client) => {
      const result = await client.query<CatalogRow>(
        "SELECT catalog FROM arcigy_client_catalogs WHERE client_id = $1",
        [ctx.clientId]
      );
      const catalog = result.rows[0]?.catalog;
      return catalog ? validateClientCatalog(catalog as ClientCatalog) : null;
    });

  const writeCatalog = async (ctx: ClientContext, catalog: ClientCatalog): Promise<void> => {
    const validated = validateClientCatalog(catalog);
    assertCatalogClient(ctx, validated);
    await withSchemaClient(args.connectionString, args.schema, async (client) => {
      await client.query(
        `
          INSERT INTO arcigy_client_catalogs (
            client_id,
            catalog,
            catalog_version,
            source,
            created_at,
            updated_at,
            db_updated_at
          )
          VALUES ($1, $2::jsonb, $3, $4, $5::timestamptz, $6::timestamptz, now())
          ON CONFLICT (client_id) DO UPDATE SET
            catalog = EXCLUDED.catalog,
            catalog_version = EXCLUDED.catalog_version,
            source = EXCLUDED.source,
            updated_at = EXCLUDED.updated_at,
            db_updated_at = now()
        `,
        [
          validated.clientId,
          JSON.stringify(validated),
          validated.meta.catalogVersion,
          validated.meta.source,
          validated.meta.createdAt,
          validated.meta.updatedAt
        ]
      );
    });
  };

  const ensureCatalogExists = async (ctx: ClientContext): Promise<ClientCatalog> => {
    const existing = await readCatalog(ctx);
    if (existing) return existing;
    const catalog = seed.getCatalogForClient(ctx.clientId);
    await writeCatalog(ctx, catalog);
    return catalog;
  };

  return {
    getCatalogForClient(clientId) {
      return seed.getCatalogForClient(clientId);
    },
    async getCatalog(ctx) {
      return (await readCatalog(ctx)) ?? seed.getCatalogForClient(ctx.clientId);
    },
    saveCatalog: writeCatalog,
    ensureCatalogExists,
    async getMaterialById(ctx, materialId) {
      return (await ensureCatalogExists(ctx)).materials.find((material) => material.id === materialId) ?? null;
    },
    async getComponentById(ctx, componentId) {
      return (await ensureCatalogExists(ctx)).components.find((component) => component.id === componentId) ?? null;
    },
    async getModuleByType(ctx, moduleType) {
      return (await ensureCatalogExists(ctx)).modules.find((module) => module.moduleType === moduleType) ?? null;
    },
    async getPrice(ctx, priceRef) {
      return (await ensureCatalogExists(ctx)).priceList.prices[priceRef] ?? null;
    },
    async getKitchenDefaults(ctx) {
      return { ...(await ensureCatalogExists(ctx)).kitchenDefaults };
    }
  };
}
