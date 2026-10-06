import { ModulePackageRevisionConflictError } from "./module-package-write-lock";
import { createHash } from "node:crypto";
import type { ClientContext } from "../client/client-context";
import { withSchemaClient } from "../database/postgres-client";
import { computeModulePackageHash } from "./module-package-file";
import type { FurnQuoteModulePackagePayload, ModulePackageStoredMeta } from "./module-file-types";
import type { FurnQuoteModulePackage } from "./module-package-types";
import { validateFurnQuoteModulePackage } from "./module-package-validation";
import { assertModulePresetsRetained } from "./module-preset-retention";
import {
  normalizePersistedSystemModulePackage,
  normalizedSystemTemplateForStoredIdentity
} from "./module-package-persistence-compatibility";
import { presetCatalogReference } from "./module-preset-catalog";
import type { ClientCatalog } from "../catalog/catalog-types";
import { validateClientCatalog } from "../catalog/catalog-validation";
import { invalidateCatalogExactLookupCaches } from "../catalog/catalog-exact-lookup";
import type { ModulePackageRepository, SaveModulePackageOptions } from "./module-package-repository";

type PackageRow = {
  package: unknown;
  source: string;
};

type PackageRevisionRow = {
  module_package_id: string;
  module_type: string;
  package_hash: string;
  package_version: string;
  source: string;
  updated_at: Date | string;
};

function validatePersistedPackage(row: PackageRow): FurnQuoteModulePackage {
  return validateFurnQuoteModulePackage(
    normalizePersistedSystemModulePackage({ package: row.package, source: row.source }) as FurnQuoteModulePackage
  );
}

function revisionPackageHash(row: PackageRevisionRow): string {
  const normalized = normalizedSystemTemplateForStoredIdentity({
    modulePackageId: row.module_package_id,
    moduleType: row.module_type,
    source: row.source
  });
  return normalized ? computeModulePackageHash(normalized) : row.package_hash;
}

export function createPostgresModulePackageRepository(args: {
  connectionString: string;
  schema: string;
}): ModulePackageRepository {
  async function savePackage(ctx: ClientContext, modulePackage: FurnQuoteModulePackage, options: SaveModulePackageOptions = {}) {
    const validated = validateFurnQuoteModulePackage(modulePackage);
    const packageHash = computeModulePackageHash(validated);
    const persisted: FurnQuoteModulePackage = {
      ...validated,
      integrity: {
        ...validated.integrity,
        packageHash
      }
    };
    const source: ModulePackageStoredMeta["source"] = options.source ?? "dev-json";
    await withSchemaClient(args.connectionString, args.schema, async (client) => {
      if (typeof options.expectedPackageHash === "string") {
        // Stored system templates may be normalized on read. Compare the same
        // public revision, then guard the write with the actual database hash.
        const current = await client.query<PackageRow & { package_hash: string }>(
          "SELECT package, source, package_hash FROM arcigy_module_packages WHERE client_id=$1 AND module_package_id=$2",
          [ctx.clientId, persisted.module.modulePackageId]);
        const row = current.rows[0];
        if (!row || computeModulePackageHash(validatePersistedPackage(row)) !== options.expectedPackageHash) throw new ModulePackageRevisionConflictError();
        assertModulePresetsRetained(validatePersistedPackage(row), persisted);
        const updated = await client.query(`UPDATE arcigy_module_packages SET module_type=$3, package_version=$4,
          package_hash=$5, package=$6::jsonb, source=$7, updated_at=now()
          WHERE client_id=$1 AND module_package_id=$2 AND package_hash=$8 RETURNING module_package_id`,
          [ctx.clientId, persisted.module.modulePackageId, persisted.module.moduleType, persisted.module.version,
            packageHash, JSON.stringify(persisted), source, row.package_hash]);
        if (updated.rowCount !== 1) throw new ModulePackageRevisionConflictError();
        return;
      }
      const written = await client.query(
        `
          INSERT INTO arcigy_module_packages (
            client_id,
            module_package_id,
            module_type,
            package_version,
            package_hash,
            package,
            source,
            created_at,
            updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, now(), now())
          ${options.expectedPackageHash === null ? "ON CONFLICT (client_id, module_package_id) DO NOTHING" : `ON CONFLICT (client_id, module_package_id) DO UPDATE SET
            module_type = EXCLUDED.module_type,
            package_version = EXCLUDED.package_version,
            package_hash = EXCLUDED.package_hash,
            package = EXCLUDED.package,
            source = EXCLUDED.source,
            updated_at = now()
          WHERE COALESCE(EXCLUDED.package->'parameterPresets'->'presets', '[]'::jsonb)
            @> COALESCE(arcigy_module_packages.package->'parameterPresets'->'presets', '[]'::jsonb)`}
          RETURNING module_package_id
        `,
        [
          ctx.clientId,
          persisted.module.modulePackageId,
          persisted.module.moduleType,
          persisted.module.version,
          packageHash,
          JSON.stringify(persisted),
          source
        ]
      );
      if (written.rowCount !== 1) throw new ModulePackageRevisionConflictError();
    });
    return persisted;
  }

  async function listPackages(ctx: ClientContext): Promise<FurnQuoteModulePackage[]> {
    return withSchemaClient(args.connectionString, args.schema, async (client) => {
      const result = await client.query<PackageRow>(
        "SELECT package, source FROM arcigy_module_packages WHERE client_id = $1 ORDER BY module_type, module_package_id",
        [ctx.clientId]
      );
      return result.rows.map(validatePersistedPackage);
    });
  }

  return {
    async mutatePreset(ctx, modulePackageId, prepare) {
      if (ctx.role === "viewer") throw new Error("Viewer role cannot edit presets.");
      const committed = await withSchemaClient(args.connectionString, args.schema, async client => {
        await client.query("BEGIN");
        try {
          // Every package in a tenant shares this row. Lock it first so concurrent
          // preset writes cannot publish stale catalog snapshots or deadlock.
          const catalogResult = await client.query<{ catalog: ClientCatalog }>(
            "SELECT catalog FROM arcigy_client_catalogs WHERE client_id=$1 FOR UPDATE", [ctx.clientId]);
          const catalogRow = catalogResult.rows[0];
          if (!catalogRow) throw new Error("Client catalog not found.");
          const catalog = validateClientCatalog(catalogRow.catalog);
          if (catalog.clientId !== ctx.clientId) throw new Error("Catalog clientId must match ClientContext.");
          const packageResult = await client.query<PackageRow & { package_hash: string }>(
            "SELECT package, source, package_hash FROM arcigy_module_packages WHERE client_id=$1 AND module_package_id=$2 FOR UPDATE",
            [ctx.clientId, modulePackageId]);
          const row = packageResult.rows[0];
          if (!row) throw new Error("Module package not found.");
          const current = validatePersistedPackage(row);
          const prepared = prepare(current);
          let persisted = current;
          if (prepared.modulePackage !== current) {
            const validated = validateFurnQuoteModulePackage(prepared.modulePackage);
            if (validated.module.modulePackageId !== modulePackageId) throw new Error("Preset module identity cannot change.");
            assertModulePresetsRetained(current, validated);
            persisted = { ...validated, integrity: { ...validated.integrity, packageHash: computeModulePackageHash(validated) } };
            const result = await client.query(`UPDATE arcigy_module_packages SET module_type=$3, package_version=$4,
              package_hash=$5, package=$6::jsonb, source='dev-json', updated_at=now()
              WHERE client_id=$1 AND module_package_id=$2 AND package_hash=$7`,
              [ctx.clientId, modulePackageId, persisted.module.moduleType, persisted.module.version,
                persisted.integrity.packageHash, JSON.stringify(persisted), row.package_hash]);
            if (result.rowCount !== 1) throw new ModulePackageRevisionConflictError();
          }
          const reference = presetCatalogReference(catalog, persisted);
          if (reference.changed) {
            // Patch only the module references, preserving all commercial data
            // and root metadata exactly as stored by the company.
            validateClientCatalog({ ...catalog, modules: reference.modules });
            const result = await client.query(`UPDATE arcigy_client_catalogs
              SET catalog=jsonb_set(catalog,'{modules}',$2::jsonb), db_updated_at=now()
              WHERE client_id=$1`, [ctx.clientId, JSON.stringify(reference.modules)]);
            if (result.rowCount !== 1) throw new Error("Client catalog not found.");
          }
          await client.query("COMMIT");
          return { result: { modulePackage: persisted, preset: prepared.preset, catalogModule: reference.catalogModule }, catalogChanged: reference.changed };
        } catch (error) {
          await client.query("ROLLBACK");
          throw error;
        }
      });
      if (committed.catalogChanged) invalidateCatalogExactLookupCaches(ctx.clientId);
      return committed.result;
    },
    savePackage,
    async getPackage(ctx, modulePackageId) {
      return withSchemaClient(args.connectionString, args.schema, async (client) => {
        const result = await client.query<PackageRow>(
          "SELECT package, source FROM arcigy_module_packages WHERE client_id = $1 AND module_package_id = $2",
          [ctx.clientId, modulePackageId]
        );
        return result.rows[0] ? validatePersistedPackage(result.rows[0]) : null;
      });
    },
    async listPackages(ctx) {
      return listPackages(ctx);
    },
    async getRevision(ctx) {
      return withSchemaClient(args.connectionString, args.schema, async (client) => {
        const result = await client.query<PackageRevisionRow>(
          `
            SELECT module_package_id, module_type, package_hash, package_version, source, updated_at
            FROM arcigy_module_packages
            WHERE client_id = $1
            ORDER BY module_package_id
          `,
          [ctx.clientId]
        );
        const revisionSource = result.rows.map((row) => [
          row.module_package_id,
          revisionPackageHash(row),
          row.package_version,
          new Date(row.updated_at).toISOString()
        ].join("\u0000")).join("\n");
        const updatedAtMs = result.rows.reduce(
          (latest, row) => Math.max(latest, new Date(row.updated_at).getTime()),
          0
        );
        return {
          count: result.rows.length,
          updatedAt: updatedAtMs > 0 ? new Date(updatedAtMs).toISOString() : null,
          storageRevision: createHash("sha256").update(revisionSource).digest("hex")
        };
      });
    }
  };
}

export type { FurnQuoteModulePackagePayload };
