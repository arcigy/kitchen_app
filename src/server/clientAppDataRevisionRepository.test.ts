import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createFileClientCatalogRepository } from "../core/catalog/catalog-file-repository";
import type { ClientContext } from "../core/client/client-context";
import { createFileModulePackageRepository } from "../core/module-package/module-package-repository";

const context: ClientContext = {
  clientId: "client_revision_repository_test",
  userId: "user_revision_repository_test",
  role: "owner"
};

describe("client app data file revisions", () => {
  it("changes catalog and module revisions only after their persisted data changes", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "arcigy-app-data-revision-"));
    try {
      const catalogRepository = createFileClientCatalogRepository(root);
      const moduleRepository = createFileModulePackageRepository(root);

      expect(await catalogRepository.getRevision(context)).toBeNull();
      const catalog = await catalogRepository.ensureCatalogExists(context);
      const firstCatalogRevision = await catalogRepository.getRevision(context);
      const firstModuleRevision = await moduleRepository.getRevision(context);
      expect(firstCatalogRevision).not.toBeNull();
      expect(firstModuleRevision.count).toBeGreaterThan(0);
      const firstPrice = Object.entries(catalog.priceList.prices)[0]!;

      await catalogRepository.saveCatalog(context, {
        ...catalog,
        priceList: {
          ...catalog.priceList,
          prices: { ...catalog.priceList.prices, [firstPrice[0]]: firstPrice[1] + 1_000_000 }
        }
      });
      const secondCatalogRevision = await catalogRepository.getRevision(context);
      expect(secondCatalogRevision?.storageRevision).not.toBe(firstCatalogRevision?.storageRevision);
      expect(await moduleRepository.getRevision(context)).toEqual(firstModuleRevision);

      const modulePackage = (await moduleRepository.listPackages(context))[0]!;
      await moduleRepository.savePackage(context, {
        ...modulePackage,
        module: {
          ...modulePackage.module,
          description: `${modulePackage.module.description ?? ""} revision-test`
        },
        integrity: { ...modulePackage.integrity, packageHash: undefined }
      });
      const secondModuleRevision = await moduleRepository.getRevision(context);
      expect(secondModuleRevision.storageRevision).not.toBe(firstModuleRevision.storageRevision);
      expect(secondModuleRevision.count).toBe(firstModuleRevision.count);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }, 30_000);
});
