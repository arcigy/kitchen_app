import { describe, expect, it } from "vitest";
import { systemModulePackageTemplates } from "../../system/module-packages";
import { getModuleDescriptors } from "../../modules/registry";
import { buildModulePackageGeometryFromPackage, hasTrustedRuntimeBuilder } from "../module-package/runtime/module-runtime-adapter";
import { parseModulePackageImport } from "../module-package/module-package-import";
import { packModulePackage } from "../module-package/module-file-codec";
import { createPinoSideCabinetTenantPackage } from "./__fixtures__/retiredPinoModule";
import { RETIRED_MODULE_TYPES } from "../module-package/retired-module-types";

import { getEnabledClientModules, getEnabledModulePackageDefinitions } from "./module-catalog";
import { createCatalogModuleDefinitionFromPackage } from "../module-package/module-package-catalog";
import { createSystemSeedClientCatalogRepository } from "./catalog-repository";
import { validateFurnQuoteModulePackage } from "../module-package/module-package-validation";

const supportedTypes = [
  "fwm_catalog_base_corner", "fwm_catalog_base_doors", "fwm_catalog_base_drawers",
  "base_bottle_pullout", "fwm_catalog_base_open_end", "fwm_tall_open_end",
  "fwm_catalog_tall_cabinet", "fwm_catalog_wall_cabinet", "fwm_catalog_wall_open_end"
];

describe("retired module boundary", () => {
  it("ships only the supported kitchen families in the catalog and runtime", () => {
    expect([...new Set(systemModulePackageTemplates.map(pack => pack.module.moduleType))].sort()).toEqual([...supportedTypes].sort());
    expect(getModuleDescriptors().map(descriptor => descriptor.type).sort()).toEqual([...supportedTypes].sort());
    expect(systemModulePackageTemplates).toHaveLength(10); // Nine families and the upper corner package.
  });

  it("keeps current assigned packages usable and respects disabled assignments", () => {
    const catalog = createSystemSeedClientCatalogRepository().getCatalogForClient("retirement-fixture");
    const packs = systemModulePackageTemplates.slice(0, 2).map(pack => parseModulePackageImport({ package: pack }).modulePackage);
    catalog.modules = packs.map((pack, index) => createCatalogModuleDefinitionFromPackage(pack, { catalog, enabled: index === 0 }));
    expect(getEnabledClientModules(catalog).map(module => module.modulePackageId)).toEqual([packs[0]!.module.modulePackageId]);
    expect(getEnabledModulePackageDefinitions(catalog, packs)).toEqual([packs[0]]);
  });

  it("rejects retired declarative geometry in validation and direct rendering", () => {
    const catalog = createSystemSeedClientCatalogRepository().getCatalogForClient("retirement-fixture");
    const pack = structuredClone(systemModulePackageTemplates[0]!);
    pack.module.moduleType = "fwm_room_special_module_10";
    pack.geometry = { mode: "declarative", primitives: [] };
    expect(() => validateFurnQuoteModulePackage(pack)).toThrow("has been retired");
    expect(() => buildModulePackageGeometryFromPackage({ modulePackage: pack, catalog })).toThrow("has been retired");
  });

  it("has no trusted runtime capable of restoring a retired module", () => {
    for (const key of ["cornerShelfLower.v1", "drawerLow.v1", "flapShelvesLow.v1", "fridgeTall.v1", "swingShelvesLow.v1", "pinoSideCabinet.v1",
      ...[...RETIRED_MODULE_TYPES].map(type => `${type}.v1`)]) {
      expect(hasTrustedRuntimeBuilder(key), key).toBe(false);
    }
  });

  it("rejects a complete historical PINO package", () => {
    const pack = createPinoSideCabinetTenantPackage();
    expect(() => parseModulePackageImport({ fqm: packModulePackage(JSON.parse(JSON.stringify(pack))) })).toThrow("has been retired");
  });

  it("rejects retired identities even if an import changes its geometry to a supported builder", () => {
    expect(RETIRED_MODULE_TYPES.size).toBe(61);
    for (const type of RETIRED_MODULE_TYPES) {
      const pack = structuredClone(systemModulePackageTemplates[0]!);
      pack.module.moduleType = type;
      expect(() => parseModulePackageImport({ package: pack })).toThrow("has been retired");
      expect(() => parseModulePackageImport({ rawJson: JSON.stringify(pack) })).toThrow("has been retired");
      expect(() => parseModulePackageImport({ fqm: packModulePackage(JSON.parse(JSON.stringify(pack))) })).toThrow("has been retired");
    }
  });
});
