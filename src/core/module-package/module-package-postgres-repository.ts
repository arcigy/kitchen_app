import { createHash } from "node:crypto";
import type { ClientContext } from "../client/client-context";
import { withSchemaClient } from "../database/postgres-client";
import { computeModulePackageHash } from "./module-package-file";
import type { FurnQuoteModulePackagePayload, ModulePackageStoredMeta } from "./module-file-types";
import type { FurnQuoteModulePackage } from "./module-package-types";
import { validateFurnQuoteModulePackage } from "./module-package-validation";
import type { ModulePackageRepository, SaveModulePackageOptions } from "./module-package-repository";
import { systemModulePackageTemplates } from "../../system/module-packages";

type PackageRow = {
  package: unknown;
};

type PackageRevisionRow = {
  module_package_id: string;
  package_hash: string;
  package_version: string;
  updated_at: Date | string;
};

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
        "SELECT package FROM arcigy_module_packages WHERE client_id = $1 ORDER BY module_type, module_package_id",
        [ctx.clientId]
      );
      return result.rows.map((row) => validateFurnQuoteModulePackage(row.package as FurnQuoteModulePackage));
    });
  }

  return {
    savePackage,
    async getPackage(ctx, modulePackageId) {
      await ensureSystemPackages(ctx);
      return withSchemaClient(args.connectionString, args.schema, async (client) => {
        const result = await client.query<PackageRow>(
          "SELECT package FROM arcigy_module_packages WHERE client_id = $1 AND module_package_id = $2",
          [ctx.clientId, modulePackageId]
        );
        return result.rows[0] ? validateFurnQuoteModulePackage(result.rows[0].package as FurnQuoteModulePackage) : null;
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
            SELECT module_package_id, package_hash, package_version, updated_at
            FROM arcigy_module_packages
            WHERE client_id = $1
            ORDER BY module_package_id
          `,
          [ctx.clientId]
        );
        const revisionSource = result.rows.map((row) => [
          row.module_package_id,
          row.package_hash,
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
