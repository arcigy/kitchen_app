import type { ClientContext } from "../client/client-context";
import { withSchemaClient } from "../database/postgres-client";
import {
  createSystemSeedClientCatalogRepository,
  findCatalogComponentByCode,
  findCatalogMaterialByCode,
  type ClientCatalogRepository
} from "./catalog-repository";
import type { ClientCatalog } from "./catalog-types";
import { validateClientCatalog } from "./catalog-validation";
import { invalidateCatalogExactLookupCaches } from "./catalog-exact-lookup";

type CatalogRow = {
  catalog: unknown;
};

type CatalogItemRow = {
  item: unknown;
};

type CatalogPriceRow = {
  price: string | null;
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
    invalidateCatalogExactLookupCaches(ctx.clientId);
  };

  const ensureCatalogExists = async (ctx: ClientContext): Promise<ClientCatalog> => {
    const existing = await readCatalog(ctx);
    if (existing) return existing;
    const catalog = seed.getCatalogForClient(ctx.clientId);
    await writeCatalog(ctx, catalog);
    return catalog;
  };

  const catalogExists = async (ctx: ClientContext): Promise<boolean> =>
    withSchemaClient(args.connectionString, args.schema, async (client) => {
      const result = await client.query(
        "SELECT 1 FROM arcigy_client_catalogs WHERE client_id = $1",
        [ctx.clientId]
      );
      return result.rowCount === 1;
    });

  const readMaterialById = async (ctx: ClientContext, materialId: string): Promise<ClientCatalog["materials"][number] | null> =>
    withSchemaClient(args.connectionString, args.schema, async (client) => {
      const result = await client.query<CatalogItemRow>(
        `
          SELECT material.item AS item
          FROM arcigy_client_catalogs AS catalogs
          CROSS JOIN LATERAL jsonb_array_elements(
            COALESCE(catalogs.catalog -> 'materials', '[]'::jsonb)
          ) AS material(item)
          WHERE catalogs.client_id = $1
            AND material.item ->> 'id' = $2
          LIMIT 1
        `,
        [ctx.clientId, materialId]
      );
      return (result.rows[0]?.item as ClientCatalog["materials"][number] | undefined) ?? null;
    });

  const readMaterialByCode = async (ctx: ClientContext, code: string): Promise<ClientCatalog["materials"][number] | null> =>
    withSchemaClient(args.connectionString, args.schema, async (client) => {
      const result = await client.query<CatalogItemRow>(
        `
          SELECT material.item AS item
          FROM arcigy_client_catalogs AS catalogs
          CROSS JOIN LATERAL jsonb_array_elements(
            COALESCE(catalogs.catalog -> 'materials', '[]'::jsonb)
          ) AS material(item)
          WHERE catalogs.client_id = $1
            AND (
              material.item ->> 'id' = $2
              OR material.item ->> 'materialCode' = $2
              OR material.item #>> '{supplierSource,supplierProductId}' = $2
            )
        `,
        [ctx.clientId, code]
      );
      return findCatalogMaterialByCode(
        result.rows.map((row) => row.item as ClientCatalog["materials"][number]),
        code
      );
    });

  const readComponentById = async (ctx: ClientContext, componentId: string): Promise<ClientCatalog["components"][number] | null> =>
    withSchemaClient(args.connectionString, args.schema, async (client) => {
      const result = await client.query<CatalogItemRow>(
        `
          SELECT component.item AS item
          FROM arcigy_client_catalogs AS catalogs
          CROSS JOIN LATERAL jsonb_array_elements(
            COALESCE(catalogs.catalog -> 'components', '[]'::jsonb)
          ) AS component(item)
          WHERE catalogs.client_id = $1
            AND component.item ->> 'id' = $2
          LIMIT 1
        `,
        [ctx.clientId, componentId]
      );
      return (result.rows[0]?.item as ClientCatalog["components"][number] | undefined) ?? null;
    });

  const readComponentByCode = async (ctx: ClientContext, code: string): Promise<ClientCatalog["components"][number] | null> =>
    withSchemaClient(args.connectionString, args.schema, async (client) => {
      const result = await client.query<CatalogItemRow>(
        `
          SELECT component.item AS item
          FROM arcigy_client_catalogs AS catalogs
          CROSS JOIN LATERAL jsonb_array_elements(
            COALESCE(catalogs.catalog -> 'components', '[]'::jsonb)
          ) AS component(item)
          WHERE catalogs.client_id = $1
            AND (
              component.item ->> 'id' = $2
              OR component.item ->> 'componentCode' = $2
              OR component.item #>> '{supplierSource,supplierProductId}' = $2
            )
        `,
        [ctx.clientId, code]
      );
      return findCatalogComponentByCode(
        result.rows.map((row) => row.item as ClientCatalog["components"][number]),
        code
      );
    });

  const readPrice = async (ctx: ClientContext, priceRef: string): Promise<CatalogPriceRow | null> =>
    withSchemaClient(args.connectionString, args.schema, async (client) => {
      const result = await client.query<CatalogPriceRow>(
        `
          SELECT catalog -> 'priceList' -> 'prices' ->> $2 AS price
          FROM arcigy_client_catalogs
          WHERE client_id = $1
        `,
        [ctx.clientId, priceRef]
      );
      return result.rows[0] ?? null;
    });

  const ensureCatalogRowForLookup = async (ctx: ClientContext): Promise<boolean> => {
    if (await catalogExists(ctx)) return false;
    await ensureCatalogExists(ctx);
    return true;
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
      let material = await readMaterialById(ctx, materialId);
      if (material) return material;
      if (!(await ensureCatalogRowForLookup(ctx))) return null;
      material = await readMaterialById(ctx, materialId);
      return material;
    },
    async getMaterialByCode(ctx, code) {
      let material = await readMaterialByCode(ctx, code);
      if (material) return material;
      if (!(await ensureCatalogRowForLookup(ctx))) return null;
      material = await readMaterialByCode(ctx, code);
      return material;
    },
    async getComponentById(ctx, componentId) {
      let component = await readComponentById(ctx, componentId);
      if (component) return component;
      if (!(await ensureCatalogRowForLookup(ctx))) return null;
      component = await readComponentById(ctx, componentId);
      return component;
    },
    async getComponentByCode(ctx, code) {
      let component = await readComponentByCode(ctx, code);
      if (component) return component;
      if (!(await ensureCatalogRowForLookup(ctx))) return null;
      component = await readComponentByCode(ctx, code);
      return component;
    },
    async getModuleByType(ctx, moduleType) {
      return (await ensureCatalogExists(ctx)).modules.find((module) => module.moduleType === moduleType) ?? null;
    },
    async getPrice(ctx, priceRef) {
      let row = await readPrice(ctx, priceRef);
      if (!row) {
        await ensureCatalogRowForLookup(ctx);
        row = await readPrice(ctx, priceRef);
      }
      if (row?.price == null) return null;
      const price = Number(row.price);
      return Number.isFinite(price) ? price : null;
    },
    async getKitchenDefaults(ctx) {
      return { ...(await ensureCatalogExists(ctx)).kitchenDefaults };
    }
  };
}
