import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ClientContext } from "../client/client-context";
import { resolveClientModulePackagePath, resolveClientModulePackagesPath } from "../storage/storage-path-resolver";
import { sanitizeStorageFileName, sanitizeStorageId } from "../storage/storage-types";
import { packModulePackage } from "./module-file-codec";
import type { FurnQuoteModulePackagePayload, ModulePackageStoredMeta } from "./module-file-types";
import type { FurnQuoteModulePackage } from "./module-package-types";
import { computeModulePackageHash } from "./module-package-file";
import { validateFurnQuoteModulePackage } from "./module-package-validation";

export type ModulePackageRepository = {
  savePackage(ctx: ClientContext, modulePackage: FurnQuoteModulePackage, options?: SaveModulePackageOptions): Promise<FurnQuoteModulePackage>;
  getPackage(ctx: ClientContext, modulePackageId: string): Promise<FurnQuoteModulePackage | null>;
  listPackages(ctx: ClientContext): Promise<FurnQuoteModulePackage[]>;
};

export type SaveModulePackageOptions = {
  source?: ModulePackageStoredMeta["source"];
  originalModuleFile?: string;
  payload?: FurnQuoteModulePackagePayload;
};

const MODULE_FILE_NAME = "module.fqm";
const PACKAGE_FILE_NAME = "module.package.json";
const META_FILE_NAME = "module.meta.json";

async function readJson<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(filePath, "utf-8")) as T;
  } catch (error: unknown) {
    if ((error as { code?: string }).code === "ENOENT") return null;
    throw error;
  }
}

function packageDir(projectRoot: string, ctx: ClientContext, modulePackageId: string): string {
  return resolveClientModulePackagePath(projectRoot, ctx, sanitizeStorageId(modulePackageId, "modulePackageId"));
}

export function createFileModulePackageRepository(projectRoot: string): ModulePackageRepository {
  return {
    async savePackage(ctx, modulePackage, options = {}) {
      const validated = validateFurnQuoteModulePackage(modulePackage);
      const modulePackageId = validated.module.modulePackageId;
      const targetDir = packageDir(projectRoot, ctx, modulePackageId);
      const hash = computeModulePackageHash(validated);
      const persisted: FurnQuoteModulePackage = {
        ...validated,
        integrity: {
          ...validated.integrity,
          packageHash: hash
        }
      };
      await mkdir(path.join(targetDir, "assets"), { recursive: true });
      const payload: FurnQuoteModulePackagePayload = options.payload ?? {
        payloadType: "furnquote-module-package",
        payloadVersion: 1,
        exportedAt: new Date().toISOString(),
        modulePackage: persisted,
        bundledAssets: []
      };
      const moduleFile = options.originalModuleFile ?? packModulePackage({ ...payload, modulePackage: persisted });
      await writeFile(path.join(targetDir, MODULE_FILE_NAME), moduleFile.endsWith("\n") ? moduleFile : `${moduleFile}\n`, "utf-8");
      await writeFile(path.join(targetDir, PACKAGE_FILE_NAME), `${JSON.stringify(persisted, null, 2)}\n`, "utf-8");
      for (const asset of payload.bundledAssets) {
        const safeFileName = sanitizeStorageFileName(asset.fileName);
        await writeFile(path.join(targetDir, "assets", safeFileName), Buffer.from(asset.data, "base64"));
      }
      await writeFile(
        path.join(targetDir, META_FILE_NAME),
        `${JSON.stringify(
          {
            modulePackageId,
            moduleType: persisted.module.moduleType,
            packageVersion: persisted.module.version,
            packageHash: hash,
            source: options.source ?? "dev-json",
            importedAt: new Date().toISOString(),
            importedByUserId: ctx.userId
          } satisfies ModulePackageStoredMeta,
          null,
          2
        )}\n`,
        "utf-8"
      );
      return persisted;
    },
    async getPackage(ctx, modulePackageId) {
      return readJson<FurnQuoteModulePackage>(path.join(packageDir(projectRoot, ctx, modulePackageId), PACKAGE_FILE_NAME));
    },
    async listPackages(ctx) {
      const root = resolveClientModulePackagesPath(projectRoot, ctx);
      let entries: string[];
      try {
        entries = await readdir(root);
      } catch (error: unknown) {
        if ((error as { code?: string }).code === "ENOENT") return [];
        throw error;
      }
      const packages = await Promise.all(
        entries.map((entry) =>
          readJson<FurnQuoteModulePackage>(path.join(root, sanitizeStorageFileName(entry), PACKAGE_FILE_NAME))
        )
      );
      return packages.filter((modulePackage): modulePackage is FurnQuoteModulePackage => !!modulePackage);
    }
  };
}
