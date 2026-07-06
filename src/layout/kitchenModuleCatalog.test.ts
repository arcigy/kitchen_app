import { describe, expect, it } from "vitest";
import type {
  FurnQuoteModulePackage,
  ModulePackageCategory,
} from "../core/module-package/module-package-types";
import {
  getKitchenCatalogRole,
  getKitchenCatalogSubcategoryKey,
  groupKitchenModulePackages,
} from "./kitchenModuleCatalog";

function makeModulePackage(args: {
  modulePackageId: string;
  moduleType: string;
  displayName: string;
  category: ModulePackageCategory;
  tags?: string[];
  kitchenModuleRole?: string;
}): FurnQuoteModulePackage {
  return {
    format: "furnquote-module",
    packageVersion: 1,
    module: {
      modulePackageId: args.modulePackageId,
      moduleType: args.moduleType,
      familyName: "test",
      displayName: args.displayName,
      category: args.category,
      version: "v1",
      tags: args.tags ?? [],
    },
    parameters: {
      parameters: args.kitchenModuleRole
        ? [
            {
              key: "kitchenModuleRole",
              label: "Kitchen role",
              type: "string",
              defaultValue: args.kitchenModuleRole,
              affects: "placement",
            },
          ]
        : [],
    },
    placement: {
      allowedContexts: ["custom"],
    },
    constraints: {},
    snapping: {
      enabled: false,
    },
    geometry: {
      mode: "trusted-runtime",
      runtimeBuilderKey: "test.builder",
    },
    materials: {
      slots: [],
    },
    components: {
      slots: [],
    },
    ui: {
      groups: [],
      controls: [],
    },
    assets: {
      files: [],
    },
    compatibility: {},
    integrity: {
      createdAt: "2026-06-16T00:00:00.000Z",
      updatedAt: "2026-06-16T00:00:00.000Z",
    },
  };
}

describe("kitchenModuleCatalog", () => {
  it("groups exactly the DB-enabled package list supplied by the caller", () => {
    const delfiTall = makeModulePackage({
      modulePackageId: "fwm_catalog_tall_cabinet_family_v1",
      moduleType: "fwm_catalog_tall_cabinet",
      displayName: "Katalogova vysoka skrina",
      category: "tall_cabinet",
      tags: ["kitchen", "catalog", "vendor", "tall"],
    });
    const delfiDrawer = makeModulePackage({
      modulePackageId: "fwm_catalog_base_drawers_family_v1",
      moduleType: "fwm_catalog_base_drawers",
      displayName: "Katalogova spodna zasuvkova skrinka",
      category: "base_cabinet",
      tags: ["kitchen", "catalog", "vendor", "drawer"],
    });

    const grouped = groupKitchenModulePackages([delfiTall, delfiDrawer], "");

    expect(grouped.packages).toEqual([delfiTall, delfiDrawer]);
    expect(grouped.groups.tall.get("other")).toEqual([delfiTall]);
    expect(grouped.groups.low.get("drawer")).toEqual([delfiDrawer]);
  });

  it("routes PINO cladding modules into accessory cover panels", () => {
    const cladding = makeModulePackage({
      modulePackageId: "pino_nobilia_fwm_interior_cladding_1_vkh_2026_v1",
      moduleType: "fwm_interior_cladding_1",
      displayName: "Krycí panel",
      category: "custom",
      tags: ["kitchen", "accessory", "cover-panel", "cladding"],
    });

    expect(getKitchenCatalogRole(cladding)).toBe("accessory");
    expect(getKitchenCatalogSubcategoryKey(cladding)).toBe("cover_panel");
  });

  it("keeps tall and low kitchen modules in their expected groups", () => {
    const sideCabinet = makeModulePackage({
      modulePackageId: "pino_nobilia_side_cabinet_vkh_2026_v1",
      moduleType: "pino_side_cabinet",
      displayName: "Boční skříňka",
      category: "tall_cabinet",
      tags: ["kitchen", "side-cabinet"],
    });
    const drawerBase = makeModulePackage({
      modulePackageId: "pino_nobilia_drawer_low_vkh_2026_v1",
      moduleType: "drawer_low",
      displayName: "Spodná zásuvková skrinka",
      category: "base_cabinet",
      tags: ["kitchen", "drawer"],
      kitchenModuleRole: "low",
    });
    const cladding = makeModulePackage({
      modulePackageId: "pino_nobilia_fwm_interior_cladding_1_vkh_2026_v1",
      moduleType: "fwm_interior_cladding_1",
      displayName: "Krycí panel",
      category: "custom",
      tags: ["kitchen", "accessory", "cover-panel"],
    });

    const grouped = groupKitchenModulePackages(
      [sideCabinet, drawerBase, cladding],
      "",
    );

    expect(grouped.groups.tall.get("other")).toEqual([sideCabinet]);
    expect(grouped.groups.low.get("drawer")).toEqual([drawerBase]);
    expect(grouped.groups.accessory.get("cover_panel")).toEqual([cladding]);
    expect(grouped.packages).toHaveLength(3);
  });

  it("applies catalog search before grouping", () => {
    const sideCabinet = makeModulePackage({
      modulePackageId: "pino_nobilia_side_cabinet_vkh_2026_v1",
      moduleType: "pino_side_cabinet",
      displayName: "Boční skříňka",
      category: "tall_cabinet",
      tags: ["kitchen"],
    });
    const cladding = makeModulePackage({
      modulePackageId: "pino_nobilia_fwm_interior_cladding_1_vkh_2026_v1",
      moduleType: "fwm_interior_cladding_1",
      displayName: "Krycí panel",
      category: "custom",
      tags: ["kitchen", "accessory", "cover-panel"],
    });

    const grouped = groupKitchenModulePackages(
      [sideCabinet, cladding],
      "panel",
    );

    expect(grouped.packages).toEqual([cladding]);
    expect(grouped.groups.accessory.get("cover_panel")).toEqual([cladding]);
    expect(grouped.groups.tall.size).toBe(0);
  });
});
