import { createHash } from "node:crypto";
import type { ClientContext } from "../client/client-context";
import { withSchemaClient } from "../database/postgres-client";
import { computeModulePackageHash } from "./module-package-file";
import type { FurnQuoteModulePackagePayload, ModulePackageStoredMeta } from "./module-file-types";
import type { FurnQuoteModulePackage } from "./module-package-types";
import { validateFurnQuoteModulePackage } from "./module-package-validation";
import {
  normalizePersistedSystemModulePackage,
  normalizedSystemTemplateForStoredIdentity
} from "./module-package-persistence-compatibility";
import type { ModulePackageRepository, SaveModulePackageOptions } from "./module-package-repository";
import { systemModulePackageTemplates } from "../../system/module-packages";

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
      await client.query(
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
          ON CONFLICT (client_id, module_package_id) DO UPDATE SET
            module_type = EXCLUDED.module_type,
            package_version = EXCLUDED.package_version,
            package_hash = EXCLUDED.package_hash,
            package = EXCLUDED.package,
            source = EXCLUDED.source,
            updated_at = now()
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
    });
    return persisted;
  }

  async function ensureSystemPackages(ctx: ClientContext): Promise<void> {
    const existing = await listPackages(ctx);
    if (existing.length > 0) return;
    await Promise.all(systemModulePackageTemplates.map((modulePackage) =>
      savePackage(ctx, structuredClone(modulePackage), { source: "system-template" })
    ));
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
    savePackage,
    async getPackage(ctx, modulePackageId) {
      await ensureSystemPackages(ctx);
      return withSchemaClient(args.connectionString, args.schema, async (client) => {
        const result = await client.query<PackageRow>(
          "SELECT package, source FROM arcigy_module_packages WHERE client_id = $1 AND module_package_id = $2",
          [ctx.clientId, modulePackageId]
        );
        return result.rows[0] ? validatePersistedPackage(result.rows[0]) : null;
      });
    },
    async listPackages(ctx) {
      await ensureSystemPackages(ctx);
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
