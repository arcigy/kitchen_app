import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createFileClientCatalogRepository } from "../catalog/catalog-file-repository";
import { getEnabledModulePackageDefinitions } from "../catalog/module-catalog";
import { createSystemSeedClientCatalogRepository } from "../catalog/catalog-repository";
import type { ClientContext } from "../client/client-context";
import { createFileProjectRepository } from "../project/project-repository";
import { assembleProjectSaveFile } from "../project-save/project-save-assembler";
import { loadProjectSaveFile } from "../project-save/project-save-loader";
import { createFileModulePackageRepository } from "./module-package-repository";
import { createModulePackageService } from "./module-package-service";
import type { FurnQuoteModulePackage } from "./module-package-types";
import { computeModulePackageHash, parseModulePackageJson } from "./module-package-file";
import { createModuleFileEnvelope, createModuleFilePayload, packModulePackage, unpackModulePackage } from "./module-file-codec";
import type { FurnQuoteModuleFileEnvelope, FurnQuoteModulePackagePayload } from "./module-file-types";
import { sha256Hex } from "./module-file-validation";
import { exportModulePackage } from "./module-package-export";
import { resolveProjectModulePackagesFromSnapshots } from "./module-package-resolver";
import { validateFurnQuoteModulePackage } from "./module-package-validation";
import { validateModulePlacement } from "./rules/module-rule-engine";
import {
  buildModulePackageGeometryFromPackage,
  buildModulePackageGeometry,
  createDefaultModulePackageParameters,
  resolveModulePackageComponentAssignments,
  resolveModulePackageMaterialAssignments
} from "./runtime/module-runtime-adapter";
import { listVisibleModulePackages } from "../../ui/module-package/modulePackageListPanel";
import { validateKitchenModulePackagePlacement } from "../../layout/modulePackagePlacementIntegration";
import { makeDefaultKitchenContext } from "../../layout/kitchenContext";
import { applyKitchenContextToModuleParams } from "../../layout/kitchenMaterialSync";
import type { ModuleParams } from "../../model/cabinetTypes";
import { systemModulePackageTemplates } from "../../system/module-packages";
import cornerShelfLowerFixture from "./fixtures/cornerShelfLower.fqm.source.json";

const ctxA: ClientContext = { userId: "user_a", clientId: "client_a", role: "owner" };
const ctxB: ClientContext = { userId: "user_b", clientId: "client_b", role: "owner" };

function makeCatalog() {
  return createSystemSeedClientCatalogRepository().getCatalogForClient(ctxA.clientId);
}

function makeCornerPackage(): FurnQuoteModulePackage {
  return structuredClone(cornerShelfLowerFixture) as FurnQuoteModulePackage;
}

function makePackage(overrides: Partial<FurnQuoteModulePackage> = {}): FurnQuoteModulePackage {
  const now = "2026-05-19T00:00:00.000Z";
  const modulePackage: FurnQuoteModulePackage = {
    format: "furnquote-module",
    packageVersion: 1,
    module: {
      modulePackageId: "drawer_low_standard",
      moduleType: "drawer_low",
      familyName: "Drawer Low",
      displayName: "Drawer Low",
      category: "base_cabinet",
      version: "1.0.0",
      tags: ["kitchen"]
    },
    parameters: {
      parameters: [
        { key: "width", label: "Width", type: "number", required: true, defaultValue: 800, min: 300, max: 1200, step: 50, unit: "mm", affects: "geometry" },
        { key: "height", label: "Height", type: "number", required: true, defaultValue: 720, min: 500, max: 900, step: 10, unit: "mm", affects: "geometry" },
        { key: "depth", label: "Depth", type: "number", required: true, defaultValue: 560, min: 300, max: 700, step: 10, unit: "mm", affects: "geometry" },
        { key: "front", label: "Front", type: "material", defaultValue: "mat.board.front.mdf.white.18", affects: "visual" },
        { key: "handle", label: "Handle", type: "component", affects: "visual" }
      ]
    },
    placement: {
      allowedContexts: ["kitchen_wall"],
      requiredAnchors: ["wall", "floor"],
      requiresWall: true,
      requiresFloor: true,
      allowFreePlacement: false
    },
    constraints: {
      dimensionRules: {
        width: { min: 300, max: 1200, step: 50 },
        height: { min: 500, max: 900, step: 10 },
        depth: { min: 300, max: 700, step: 10 }
      }
    },
    snapping: {
      enabled: true,
      snapTargets: ["wall", "grid"],
      priority: ["wall", "grid"],
      snapDistanceMm: 50,
      rotationSnapDeg: 90
    },
    geometry: {
      mode: "trusted-runtime",
      runtimeBuilderKey: "drawerLow.v1"
    },
    materials: {
      slots: [
        {
          slotId: "front",
          label: "Front material",
          required: true,
          defaultFrom: "catalog.kitchenDefaults.frontMaterialId",
          affects: ["visual", "bom", "pricing"]
        }
      ]
    },
    components: {
      slots: [
        {
          slotId: "handle",
          label: "Handle",
          componentType: "handle",
          required: false,
          defaultFrom: "catalog.kitchenDefaults.defaultHandleComponentId",
          affects: ["visual", "bom", "pricing"]
        }
      ]
    },
    bom: {
      rules: [
        {
          id: "front-area",
          itemType: "material",
          source: "materialSlot",
          sourceKey: "front",
          quantityFormula: { type: "area", widthParam: "width", heightParam: "height" }
        }
      ]
    },
    pricing: {
      pricingRefs: ["mat.board.front.mdf.white.18"],
      marginCategory: "base",
      quoteGroup: "kitchen"
    },
    ui: {
      icon: "icon.png",
      previewImage: "preview.png",
      groups: [{ id: "dimensions", label: "Dimensions", order: 1 }],
      controls: [
        { parameterKey: "width", controlType: "number", groupId: "dimensions", order: 1 },
        { parameterKey: "front", controlType: "materialPicker", groupId: "dimensions", order: 2 },
        { parameterKey: "handle", controlType: "componentPicker", groupId: "dimensions", order: 3 }
      ]
    },
    exports: { exportTags: ["cnc"] },
    manufacturing: { cncStrategy: "panelized" },
    assets: {
      files: [
        { assetId: "icon", fileName: "icon.png", mimeType: "image/png", sizeBytes: 100 },
        { assetId: "preview", fileName: "preview.png", mimeType: "image/png", sizeBytes: 100 }
      ]
    },
    compatibility: {
      requiredRuntimeBuilderKeys: ["drawerLow.v1"]
    },
    integrity: {
      createdAt: now,
      updatedAt: now,
      author: "test"
    }
  };
  return {
    ...modulePackage,
    ...overrides,
    module: { ...modulePackage.module, ...overrides.module },
    parameters: overrides.parameters ?? modulePackage.parameters,
    placement: overrides.placement ?? modulePackage.placement,
    constraints: overrides.constraints ?? modulePackage.constraints,
    snapping: overrides.snapping ?? modulePackage.snapping,
    geometry: overrides.geometry ?? modulePackage.geometry,
    materials: overrides.materials ?? modulePackage.materials,
    components: overrides.components ?? modulePackage.components,
    ui: overrides.ui ?? modulePackage.ui,
    assets: overrides.assets ?? modulePackage.assets,
    compatibility: overrides.compatibility ?? modulePackage.compatibility,
    integrity: { ...modulePackage.integrity, ...overrides.integrity }
  };
}

describe("FurnQuote module package validation", () => {
  it("accepts a valid .fqm package and computes a stable hash", () => {
    const modulePackage = validateFurnQuoteModulePackage(makePackage());
    const hash = computeModulePackageHash(modulePackage);
    const exported = exportModulePackage(modulePackage);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(parseModulePackageJson(exported).integrity.packageHash).toBe(hash);
  });

  it("rejects invalid package shapes and unsafe fields", () => {
    expect(() => validateFurnQuoteModulePackage(makePackage({ module: { ...makePackage().module, modulePackageId: "" } }))).toThrow("modulePackageId");
    expect(() => validateFurnQuoteModulePackage(makePackage({
      parameters: { parameters: [...makePackage().parameters.parameters, { ...makePackage().parameters.parameters[0]!, label: "Again" }] }
    }))).toThrow("duplicate parameter key");
    expect(() => validateFurnQuoteModulePackage(makePackage({ placement: { allowedContexts: ["bad" as "kitchen_wall"] } }))).toThrow("invalid placement context");
    expect(() => validateFurnQuoteModulePackage(makePackage({
      components: { slots: [{ ...makePackage().components.slots[0]!, componentType: "bad" as "handle" }] }
    }))).toThrow("invalid componentType");
    expect(() => validateFurnQuoteModulePackage(makePackage({
      geometry: { mode: "trusted-runtime", runtimeBuilderKey: "missing.v1" }
    }))).toThrow("trusted runtime builder");
    expect(() => validateFurnQuoteModulePackage(makePackage({
      assets: { files: [{ assetId: "bad", fileName: "../bad.png", mimeType: "image/png" }] }
    }))).toThrow("unsafe path segment");
    expect(() => validateFurnQuoteModulePackage({
      ...makePackage(),
      script: "console.log('no')"
    } as FurnQuoteModulePackage)).toThrow("not allowed");
  });

  it("rejects unsupported versions and incompatible app versions", () => {
    expect(() => validateFurnQuoteModulePackage(makePackage({ packageVersion: 99 }))).toThrow("unsupported packageVersion");
    expect(() => validateFurnQuoteModulePackage(makePackage({
      compatibility: { minAppVersion: "999.0.0", requiredRuntimeBuilderKeys: ["drawerLow.v1"] }
    }), { appVersion: "1.0.0" })).toThrow("minAppVersion");
  });

  it("validates the real cornerShelfLower .fqm fixture", () => {
    const modulePackage = validateFurnQuoteModulePackage(makeCornerPackage());
    expect(modulePackage.module.moduleType).toBe("corner_shelf_lower");
    expect(modulePackage.module.category).toBe("corner_cabinet");
    expect(modulePackage.geometry).toMatchObject({ mode: "trusted-runtime", runtimeBuilderKey: "cornerShelfLower.v1" });
    expect(modulePackage.placement.allowedContexts).toEqual(["kitchen_corner"]);
    expect(modulePackage.behavior?.contextBindings?.[0]).toMatchObject({
      contextType: "kitchenGroup",
      required: true,
      scope: "single",
      autoAssign: "activeKitchenGroup",
      liveSync: true,
      forbidCrossContextAdjacency: true
    });
    expect(() => validateFurnQuoteModulePackage({
      ...modulePackage,
      geometry: { mode: "trusted-runtime", runtimeBuilderKey: "missingCorner.v1" }
    })).toThrow("trusted runtime builder");
  });

  it("validates all system .fqm templates used for tenant seeding", () => {
    expect(systemModulePackageTemplates.map((modulePackage) => modulePackage.module.modulePackageId).sort()).toEqual([
      "corner_shelf_lower_family_v1",
      "drawer_low_family_v1",
      "flap_shelves_low_family_v1",
      "fridge_tall_family_v1",
      "swing_shelves_low_family_v1"
    ]);
    for (const modulePackage of systemModulePackageTemplates) {
      const validated = validateFurnQuoteModulePackage(modulePackage);
      expect(validated.geometry.mode).toBe("trusted-runtime");
      expect(validated.parameters.parameters.some((parameter) => parameter.key === "type")).toBe(true);
    }
  });
});

describe("FurnQuote .fqm envelope", () => {
  it("packs and unpacks a real .fqm envelope", () => {
    const modulePackage = makePackage();
    const fqm = packModulePackage(createModuleFilePayload({ modulePackage }));
    const envelope = JSON.parse(fqm) as FurnQuoteModuleFileEnvelope;
    expect(envelope).toMatchObject({
      magic: "FURNQUOTE_MODULE_PACKAGE",
      envelopeVersion: 1,
      packageEncoding: "base64",
      compression: "gzip"
    });
    expect(fqm).not.toContain('"displayName": "Drawer Low"');
    expect(unpackModulePackage(fqm).modulePackage.module.displayName).toBe("Drawer Low");
  });

  it("rejects invalid envelope and payload boundaries", () => {
    const envelope = createModuleFileEnvelope(createModuleFilePayload({ modulePackage: makePackage() }));
    expect(() => unpackModulePackage(JSON.stringify({ ...envelope, magic: "BAD" }))).toThrow("magic");
    expect(() => unpackModulePackage(JSON.stringify({ ...envelope, envelopeVersion: 99 }))).toThrow("envelopeVersion");
    expect(() => unpackModulePackage(JSON.stringify({ ...envelope, payload: "not-base64" }))).toThrow();
    expect(() => unpackModulePackage(JSON.stringify({ ...envelope, payloadHash: "0".repeat(64) }))).toThrow("payloadHash");

    const badPayload = {
      ...createModuleFilePayload({ modulePackage: makePackage() }),
      payloadType: "wrong"
    } as unknown as FurnQuoteModulePackagePayload;
    expect(() => unpackModulePackage(packModulePackage(badPayload))).toThrow("payloadType");
    expect(() => unpackModulePackage(packModulePackage({
      ...createModuleFilePayload({ modulePackage: makePackage() }),
      payloadVersion: 99
    } as unknown as FurnQuoteModulePackagePayload))).toThrow("payloadVersion");
  });

  it("validates bundled assets inside .fqm payloads", () => {
    const bytes = Buffer.from("icon-bytes");
    const payload = createModuleFilePayload({
      modulePackage: makePackage(),
      bundledAssets: [{
        assetId: "icon",
        encoding: "base64",
        mimeType: "image/png",
        fileName: "icon.png",
        sha256: sha256Hex(bytes),
        sizeBytes: bytes.length,
        data: bytes.toString("base64")
      }]
    });
    expect(unpackModulePackage(packModulePackage(payload)).bundledAssets[0]?.fileName).toBe("icon.png");
    expect(() => unpackModulePackage(packModulePackage({
      ...payload,
      bundledAssets: [{ ...payload.bundledAssets[0]!, sha256: "0".repeat(64) }]
    }))).toThrow("sha256");
    expect(() => unpackModulePackage(packModulePackage({
      ...payload,
      bundledAssets: [{ ...payload.bundledAssets[0]!, fileName: "../icon.png" }]
    }))).toThrow("unsafe path");
    expect(() => unpackModulePackage(packModulePackage(payload), { maxSingleAssetBytes: 1 })).toThrow("max single asset");
  });
});

describe("tenant module package import", () => {
  let root = "";

  beforeEach(async () => {
    root = await mkdtemp(path.join(os.tmpdir(), "fqm-"));
    await mkdir(root, { recursive: true });
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("stores imports under the importing client and updates ClientCatalog modules", async () => {
    const packageRepository = createFileModulePackageRepository(root);
    const catalogRepository = createSystemSeedClientCatalogRepository();
    const serviceA = createModulePackageService({ context: ctxA, packageRepository, catalogRepository });
    await serviceA.importPackage({ package: makePackage() });

    expect(await packageRepository.getPackage(ctxA, "drawer_low_standard")).not.toBeNull();
    expect(await packageRepository.getPackage(ctxB, "drawer_low_standard")).toBeNull();
    expect((await packageRepository.listPackages(ctxB))).toEqual([]);
    const catalogA = await catalogRepository.getCatalog(ctxA);
    const catalogB = await catalogRepository.getCatalog(ctxB);
    expect(catalogA.modules.some((module) => module.modulePackageId === "drawer_low_standard" && module.enabled)).toBe(true);
    expect(catalogB.modules.some((module) => module.modulePackageId === "drawer_low_standard")).toBe(false);

    const storedFilePath = path.join(root, "storage", "clients", "client_a", "catalog", "modules", "drawer_low_standard", "module.fqm");
    const storedManifestPath = path.join(root, "storage", "clients", "client_a", "catalog", "modules", "drawer_low_standard", "module.package.json");
    expect(JSON.parse(await readFile(storedFilePath, "utf-8"))).toMatchObject({ magic: "FURNQUOTE_MODULE_PACKAGE" });
    expect(JSON.parse(await readFile(storedManifestPath, "utf-8"))).toMatchObject({ format: "furnquote-module" });
  }, 30_000);

  it("imports a real .fqm file, stores the envelope, runtime manifest, meta, and assets", async () => {
    const bytes = Buffer.from("preview-bytes");
    const modulePackage = makePackage({
      module: { ...makePackage().module, modulePackageId: "drawer_low_fqm_import" },
      assets: {
        files: [{ assetId: "preview", fileName: "preview.png", mimeType: "image/png", sizeBytes: bytes.length, sha256: sha256Hex(bytes) }]
      }
    });
    const fqm = packModulePackage(createModuleFilePayload({
      modulePackage,
      bundledAssets: [{
        assetId: "preview",
        encoding: "base64",
        mimeType: "image/png",
        fileName: "preview.png",
        sha256: sha256Hex(bytes),
        sizeBytes: bytes.length,
        data: bytes.toString("base64")
      }]
    }));
    const packageRepository = createFileModulePackageRepository(root);
    const catalogRepository = createSystemSeedClientCatalogRepository();
    const serviceA = createModulePackageService({ context: ctxA, packageRepository, catalogRepository });
    const imported = await serviceA.importPackage({ fqm });

    const moduleDir = path.join(root, "storage", "clients", "client_a", "catalog", "modules", "drawer_low_fqm_import");
    expect(JSON.parse(await readFile(path.join(moduleDir, "module.fqm"), "utf-8")).magic).toBe("FURNQUOTE_MODULE_PACKAGE");
    expect(JSON.parse(await readFile(path.join(moduleDir, "module.package.json"), "utf-8")).module.modulePackageId).toBe("drawer_low_fqm_import");
    expect(JSON.parse(await readFile(path.join(moduleDir, "module.meta.json"), "utf-8"))).toMatchObject({
      modulePackageId: "drawer_low_fqm_import",
      source: "fqm",
      importedByUserId: ctxA.userId
    });
    expect(await readFile(path.join(moduleDir, "assets", "preview.png"), "utf-8")).toBe("preview-bytes");
    expect(imported.catalogModule.modulePackageId).toBe("drawer_low_fqm_import");
  }, 15_000);

  it("keeps UI visibility scoped to ClientCatalog enabled modules", async () => {
    const modulePackage = makePackage();
    const catalog = makeCatalog();
    catalog.modules.push({
      id: "drawer_low_package",
      moduleType: "drawer_low",
      modulePackageId: modulePackage.module.modulePackageId,
      packageVersion: modulePackage.module.version,
      packageHash: computeModulePackageHash(modulePackage),
      name: modulePackage.module.displayName,
      enabled: true,
      runtimeBuilderKey: "drawerLow.v1"
    });
    expect(listVisibleModulePackages({ catalog, packages: [modulePackage] })).toHaveLength(1);
    catalog.modules = catalog.modules.map((module) => module.modulePackageId === modulePackage.module.modulePackageId ? { ...module, enabled: false } : module);
    expect(listVisibleModulePackages({ catalog, packages: [modulePackage] })).toHaveLength(0);
  });

  it("imports the real corner .fqm package and keeps it tenant-scoped", async () => {
    const packageRepository = createFileModulePackageRepository(root);
    const catalogRepository = createSystemSeedClientCatalogRepository();
    const serviceA = createModulePackageService({ context: ctxA, packageRepository, catalogRepository });
    const modulePackage = makeCornerPackage();
    const imported = await serviceA.importPackage({ package: modulePackage });

    expect(imported.catalogModule).toMatchObject({
      modulePackageId: "corner_shelf_lower_family_v1",
      moduleType: "corner_shelf_lower",
      runtimeBuilderKey: "cornerShelfLower.v1",
      enabled: true
    });
    expect(await packageRepository.getPackage(ctxB, modulePackage.module.modulePackageId)).toBeNull();
    const catalogA = await catalogRepository.getCatalog(ctxA);
    expect(listVisibleModulePackages({ catalog: catalogA, packages: [imported.modulePackage] })).toHaveLength(1);
    catalogA.modules = catalogA.modules.map((module) =>
      module.modulePackageId === modulePackage.module.modulePackageId ? { ...module, enabled: false } : module
    );
    expect(listVisibleModulePackages({ catalog: catalogA, packages: [imported.modulePackage] })).toHaveLength(0);
  }, 15_000);

  it("seeds new clients with tenant copies of system module packages", async () => {
    const catalogRepository = createFileClientCatalogRepository(root);
    const packageRepository = createFileModulePackageRepository(root);
    const catalogA = await catalogRepository.ensureCatalogExists(ctxA);
    const catalogB = await catalogRepository.ensureCatalogExists(ctxB);
    const packagesA = await packageRepository.listPackages(ctxA);
    const packagesB = await packageRepository.listPackages(ctxB);

    expect(packagesA).toHaveLength(systemModulePackageTemplates.length);
    expect(packagesB).toHaveLength(systemModulePackageTemplates.length);
    expect(getEnabledModulePackageDefinitions(catalogA, packagesA)).toHaveLength(systemModulePackageTemplates.length);
    expect(getEnabledModulePackageDefinitions(catalogB, packagesB)).toHaveLength(systemModulePackageTemplates.length);
    expect(catalogA.modules.every((module) => module.modulePackageId && module.runtimeBuilderKey)).toBe(true);

    const clientAPath = path.join(root, "storage", "clients", ctxA.clientId, "catalog", "modules", "drawer_low_family_v1", "module.package.json");
    const clientBPath = path.join(root, "storage", "clients", ctxB.clientId, "catalog", "modules", "drawer_low_family_v1", "module.package.json");
    const clientAPackage = JSON.parse(await readFile(clientAPath, "utf-8")) as FurnQuoteModulePackage;
    clientAPackage.module.displayName = "Client A Drawer";
    await writeFile(clientAPath, `${JSON.stringify(clientAPackage, null, 2)}\n`, "utf-8");

    expect((await packageRepository.getPackage(ctxA, "drawer_low_family_v1"))?.module.displayName).toBe("Client A Drawer");
    expect((await packageRepository.getPackage(ctxB, "drawer_low_family_v1"))?.module.displayName).not.toBe("Client A Drawer");
    expect(await readFile(clientBPath, "utf-8")).toContain("Drawer Low");
  }, 30_000);

  it("uses ClientCatalog plus tenant packages as the module visibility source of truth", async () => {
    const catalogRepository = createFileClientCatalogRepository(root);
    const packageRepository = createFileModulePackageRepository(root);
    const catalog = await catalogRepository.ensureCatalogExists(ctxA);
    const packages = await packageRepository.listPackages(ctxA);

    expect(listVisibleModulePackages({ catalog, packages }).map((modulePackage) => modulePackage.module.moduleType).sort()).toEqual([
      "corner_shelf_lower",
      "drawer_low",
      "flap_shelves_low",
      "fridge_tall",
      "swing_shelves_low"
    ]);

    const disabledCatalog = {
      ...catalog,
      modules: catalog.modules.map((module) => module.moduleType === "drawer_low" ? { ...module, enabled: false } : module)
    };
    expect(listVisibleModulePackages({ catalog: disabledCatalog, packages }).map((modulePackage) => modulePackage.module.moduleType)).not.toContain("drawer_low");
    expect(listVisibleModulePackages({
      catalog: {
        ...catalog,
        modules: [...catalog.modules, { id: "runtime_only", moduleType: "runtime_only", name: "Runtime Only", enabled: true }]
      },
      packages
    }).map((modulePackage) => modulePackage.module.moduleType)).not.toContain("runtime_only");
  }, 15_000);
});

describe("corner module placement rules", () => {
  it("accepts only valid kitchen corners", () => {
    const modulePackage = makeCornerPackage();
    const valid = validateModulePlacement({
      modulePackage,
      placementContext: "kitchen_corner",
      layoutContext: {
        hasWall: true,
        hasFloor: true,
        corner: { exists: true, angleDeg: 90, hasTwoPerpendicularWalls: true, touchesBothWalls: true, snapPosition: { x: 0, z: 0 }, snapRotation: 90 }
      },
      candidateRotation: 0
    });
    expect(valid.valid).toBe(true);
    expect(valid.suggestedSnap?.rotation).toBe(90);

    expect(validateModulePlacement({ modulePackage, placementContext: "kitchen_wall", layoutContext: { hasWall: true, hasFloor: true } }).valid).toBe(false);
    expect(validateModulePlacement({ modulePackage, placementContext: "free_standing", layoutContext: { hasFloor: true } }).valid).toBe(false);
    expect(validateModulePlacement({
      modulePackage,
      placementContext: "kitchen_corner",
      layoutContext: { hasWall: true, hasFloor: true, corner: { exists: true, angleDeg: 120, hasTwoPerpendicularWalls: true, touchesBothWalls: true } }
    }).errors.map((error) => error.code)).toContain("placement.corner_angle_invalid");
    expect(validateModulePlacement({
      modulePackage,
      placementContext: "kitchen_corner",
      layoutContext: { hasWall: true, hasFloor: true, corner: { exists: true, angleDeg: 90, hasTwoPerpendicularWalls: false, touchesBothWalls: true } }
    }).errors.map((error) => error.code)).toContain("placement.two_perpendicular_walls_required");
  });

  it("runs the kitchen placement integration adapter through package rules", () => {
    const modulePackage = makeCornerPackage();
    expect(validateKitchenModulePackagePlacement({
      modulePackage,
      candidate: {
        placementContext: "kitchen_corner",
        hasWall: true,
        hasFloor: true,
        hasCorner: true,
        cornerAngleDeg: 90,
        hasTwoPerpendicularWalls: true,
        touchesBothWalls: true,
        snapPosition: { x: 0, z: 0 },
        snapRotation: Math.PI / 2
      }
    }).valid).toBe(true);
    expect(validateKitchenModulePackagePlacement({
      modulePackage,
      candidate: {
        placementContext: "kitchen_wall",
        hasWall: true,
        hasFloor: true,
        hasCorner: false,
        hasTwoPerpendicularWalls: false,
        touchesBothWalls: false
      }
    }).valid).toBe(false);
    expect(validateKitchenModulePackagePlacement({
      modulePackage,
      candidate: {
        placementContext: "free_standing",
        hasWall: false,
        hasFloor: true,
        hasCorner: false,
        hasTwoPerpendicularWalls: false,
        touchesBothWalls: false
      }
    }).valid).toBe(false);
    expect(validateKitchenModulePackagePlacement({
      modulePackage,
      candidate: {
        placementContext: "kitchen_corner",
        hasWall: true,
        hasFloor: true,
        hasCorner: true,
        cornerAngleDeg: 120,
        hasTwoPerpendicularWalls: true,
        touchesBothWalls: true
      }
    }).errors.map((error) => error.code)).toContain("placement.corner_angle_invalid");
    expect(validateKitchenModulePackagePlacement({
      modulePackage,
      candidate: {
        placementContext: "kitchen_corner",
        hasWall: true,
        hasFloor: true,
        hasCorner: true,
        cornerAngleDeg: 90,
        hasTwoPerpendicularWalls: false,
        touchesBothWalls: true
      }
    }).errors.map((error) => error.code)).toContain("placement.two_perpendicular_walls_required");
  });
});

describe("runtime and project save integration", () => {
  it("uses trusted runtime builders and resolves slots through ClientCatalog", () => {
    const modulePackage = makePackage();
    const catalog = makeCatalog();
    const group = buildModulePackageGeometry({
      runtimeBuilderKey: "drawerLow.v1",
      parameters: { width: 900 },
      catalog
    });
    expect(group.type).toBe("Group");
    expect(resolveModulePackageMaterialAssignments({ modulePackage, catalog }).front).toBe(catalog.kitchenDefaults.frontMaterialId);
    expect(resolveModulePackageComponentAssignments({ modulePackage, catalog }).handle).toBe(catalog.kitchenDefaults.defaultHandleComponentId);
  });

  it("builds the real corner fixture through package defaults and trusted runtime", () => {
    const modulePackage = makeCornerPackage();
    const catalog = makeCatalog();
    const defaults = createDefaultModulePackageParameters(modulePackage);
    const group = buildModulePackageGeometryFromPackage({ modulePackage, catalog });
    expect(group.userData.runtimeBuilderKey).toBe("cornerShelfLower.v1");
    expect(group.userData.modulePackageBuildParameters).toMatchObject({
      modulePackageId: "corner_shelf_lower_family_v1",
      type: "corner_shelf_lower",
      lengthX: 1000,
      lengthZ: 1000,
      height: 720,
      depth: 560
    });
    expect(defaults.lengthX).toBe(1000);
    expect(resolveModulePackageMaterialAssignments({ modulePackage, catalog })).toMatchObject({
      carcass: catalog.kitchenDefaults.carcassMaterialId,
      front: catalog.kitchenDefaults.frontMaterialId
    });
    expect(resolveModulePackageComponentAssignments({ modulePackage, catalog }).handle).toBe(catalog.kitchenDefaults.defaultHandleComponentId);
  });

  it("uses package parameter defaults and UI labels as runtime source data", () => {
    const modulePackage = makeCornerPackage();
    modulePackage.parameters.parameters = modulePackage.parameters.parameters.map((parameter) =>
      parameter.key === "lengthX" ? { ...parameter, defaultValue: 1375, label: "Tenant custom width" } : parameter
    );
    modulePackage.ui.groups = modulePackage.ui.groups.map((group) =>
      group.id === "dimensions" ? { ...group, label: "Tenant dimensions" } : group
    );

    const defaults = createDefaultModulePackageParameters(modulePackage);
    expect(defaults.lengthX).toBe(1375);
    expect(modulePackage.parameters.parameters.find((parameter) => parameter.key === "lengthX")?.label).toBe("Tenant custom width");
    expect(modulePackage.ui.groups.find((group) => group.id === "dimensions")?.label).toBe("Tenant dimensions");
  });

  it("applies kitchen group rules from .fqm behavior bindings", () => {
    const modulePackage = makeCornerPackage();
    const catalog = makeCatalog();
    const kitchenCtx = {
      ...makeDefaultKitchenContext(catalog),
      heightMm: 910,
      moduleHeightMm: 860,
      moduleDepthMm: 545,
      plinthHeightMm: 123,
      plinthDepthMm: 44
    };
    const params = applyKitchenContextToModuleParams(
      {
        ...createDefaultModulePackageParameters(modulePackage),
        height: 1,
        heightCarcass: 1,
        depth: 1,
        plinthHeight: 1,
        plinthSetbackMm: 1
      } as unknown as ModuleParams,
      kitchenCtx,
      catalog,
      modulePackage
    ) as Record<string, unknown>;

    expect(params.height).toBe(910);
    expect(params.heightCarcass).toBe(872);
    expect(params.depth).toBe(545);
    expect(params.plinthHeight).toBe(123);
    expect(params.plinthSetbackMm).toBe(44);
    expect(params.materialAssignments).toMatchObject({
      carcass: kitchenCtx.corpusMaterialId,
      front: kitchenCtx.frontsMaterialId
    });
    expect(params.componentAssignments).toMatchObject({
      handle: kitchenCtx.handleComponentId
    });
    expect(params.handleComponentId).toBe(kitchenCtx.handleComponentId);
    expect(params.handleType).toBe("bar");
    expect((params.commercialSelections as { boardMaterials: Record<string, string> }).boardMaterials["left-side"]).toBe(kitchenCtx.corpusMaterialId);
  });

  it("creates dynamic drawer material slots from .fqm drawerCount rules", () => {
    const modulePackage = systemModulePackageTemplates.find((candidate) => candidate.module.moduleType === "drawer_low");
    expect(modulePackage).toBeTruthy();
    const catalog = makeCatalog();
    const kitchenCtx = makeDefaultKitchenContext(catalog);
    const params = applyKitchenContextToModuleParams(
      {
        ...createDefaultModulePackageParameters(modulePackage!),
        type: "drawer_low",
        drawerCount: 4
      } as unknown as ModuleParams,
      kitchenCtx,
      catalog,
      modulePackage
    ) as Record<string, unknown>;
    const selections = params.commercialSelections as {
      boardMaterials: Record<string, string>;
      boardThicknesses: Record<string, number>;
    };

    expect(selections.boardMaterials["drawer-front-4"]).toBe(kitchenCtx.frontsMaterialId);
    expect(selections.boardMaterials["drawer-box-4-bottom-panel"]).toBe(kitchenCtx.drawerBottomMaterialId);
    expect(selections.boardMaterials["drawer-box-4-side-panels"]).toMatch(/^(mat\.board\.drawer_box\.|mat\.demos\.drawer_box\.)/);
    expect(selections.boardMaterials["drawer-box-4-front-back-panels"]).toBe(selections.boardMaterials["drawer-box-4-side-panels"]);
    expect(selections.boardThicknesses["drawer-front-4"]).toBeGreaterThan(0);
    expect(selections.boardThicknesses["drawer-box-4-bottom-panel"]).toBeGreaterThan(0);
  });

  it("stores used module package snapshots in .fqp catalog snapshot", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "fqm-project-"));
    try {
      const repo = createFileProjectRepository(root);
      const project = await repo.createProject(ctxA, {
        name: "Kitchen",
        location: { address: "Main", city: "Bratislava" },
        contact: { name: "Client" }
      });
      const modulePackage = makePackage();
      const hash = computeModulePackageHash(modulePackage);
      const catalog = makeCatalog();
      catalog.modules.push({
        id: "drawer_low_package",
        moduleType: "drawer_low",
        modulePackageId: modulePackage.module.modulePackageId,
        packageVersion: modulePackage.module.version,
        packageHash: hash,
        name: modulePackage.module.displayName,
        enabled: true,
        runtimeBuilderKey: "drawerLow.v1"
      });
      const save = assembleProjectSaveFile({
        clientId: ctxA.clientId,
        projectId: project.projectId,
        activePhaseId: project.activePhaseId,
        project,
        catalog,
        layoutState: { snapshot: {}, windows: [], doors: [] },
        kitchenState: {},
        moduleInstances: [{
          instanceId: "module-1",
          modulePackageId: modulePackage.module.modulePackageId,
          moduleType: modulePackage.module.moduleType,
          packageVersion: modulePackage.module.version,
          packageHash: hash,
          parameters: { width: 850 },
          placement: { context: "kitchen_wall", position: { x: 0, z: 0 }, rotation: 0 },
          materialAssignments: {},
          componentAssignments: {},
          createdAt: "2026-05-19T00:00:00.000Z",
          updatedAt: "2026-05-19T00:00:00.000Z"
        }],
        sceneState: {},
        modulePackages: [modulePackage]
      });
      expect(save.catalogSnapshot.usedModulePackageSnapshots).toHaveLength(1);
      expect(save.catalogSnapshot.usedModulePackageSnapshots?.[0]?.packageHash).toBe(hash);
      expect(JSON.stringify(save.appState.modules)).toContain("850");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("restores a project module package from .fqp snapshot when current catalog package is missing", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "fqm-project-restore-"));
    try {
      const repo = createFileProjectRepository(root);
      const project = await repo.createProject(ctxA, {
        name: "Corner Kitchen",
        location: { address: "Main", city: "Bratislava" },
        contact: { name: "Client" }
      });
      const modulePackage = makeCornerPackage();
      const hash = computeModulePackageHash(modulePackage);
      const catalog = makeCatalog();
      catalog.modules.push({
        id: "corner_shelf_lower_package",
        moduleType: "corner_shelf_lower",
        modulePackageId: modulePackage.module.modulePackageId,
        packageVersion: modulePackage.module.version,
        packageHash: hash,
        name: modulePackage.module.displayName,
        enabled: true,
        runtimeBuilderKey: "cornerShelfLower.v1"
      });
      const moduleInstance = {
        instanceId: "corner-1",
        modulePackageId: modulePackage.module.modulePackageId,
        moduleType: modulePackage.module.moduleType,
        packageVersion: modulePackage.module.version,
        packageHash: hash,
        parameters: { lengthX: 1200, lengthZ: 900, depth: 560 },
        placement: { context: "kitchen_corner", position: { x: 0, z: 0 }, rotation: Math.PI / 2, anchorRefs: ["wall-a", "wall-b"] },
        materialAssignments: { front: catalog.kitchenDefaults.frontMaterialId },
        componentAssignments: { handle: catalog.kitchenDefaults.defaultHandleComponentId },
        createdAt: "2026-05-19T00:00:00.000Z",
        updatedAt: "2026-05-19T00:00:00.000Z"
      };
      const save = assembleProjectSaveFile({
        clientId: ctxA.clientId,
        projectId: project.projectId,
        activePhaseId: project.activePhaseId,
        project,
        catalog,
        layoutState: { snapshot: {}, windows: [], doors: [] },
        kitchenState: {},
        moduleInstances: [moduleInstance],
        sceneState: {},
        modulePackages: [modulePackage]
      });
      const loaded = loadProjectSaveFile(JSON.parse(JSON.stringify(save)), { clientId: ctxA.clientId, projectId: project.projectId });
      const restored = resolveProjectModulePackagesFromSnapshots({ save: loaded, currentPackages: [] });
      expect(restored).toHaveLength(1);
      expect(restored[0]?.warning).toBe("package-missing-loaded-from-project-snapshot");
      expect(restored[0]?.modulePackage.module.modulePackageId).toBe(modulePackage.module.modulePackageId);
      expect(JSON.stringify(loaded.appState.modules)).toContain("\"lengthX\":1200");
      expect(JSON.stringify(loaded.appState.modules)).toContain("\"context\":\"kitchen_corner\"");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("module package import boundary", () => {
  it("does not use executable package imports or global registry mutation in module-package core", async () => {
    const root = path.join(process.cwd(), "src", "core", "module-package");
    async function listFiles(dir: string): Promise<string[]> {
      const entries = await readdir(dir, { withFileTypes: true });
      const files: string[] = [];
      for (const entry of entries) {
        const next = path.join(dir, entry.name);
        if (entry.isDirectory()) files.push(...await listFiles(next));
        else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) files.push(next);
      }
      return files;
    }
    const files = await listFiles(root);
    const offenders: string[] = [];
    for (const file of files) {
      const source = await readFile(file, "utf-8");
      if (/eval\s*\(|new\s+Function\s*\(|import\s*\(/.test(source)) offenders.push(path.relative(process.cwd(), file));
      if (source.includes("MODULE_DESCRIPTORS.push") || source.includes("moduleDescriptorMap.set")) offenders.push(path.relative(process.cwd(), file));
    }
    expect(offenders).toEqual([]);
  });

  it("keeps normal runtime UI and placement paths off descriptor defaults/control factories", async () => {
    const runtimeFiles = [
      "src/app/buildModeController.ts",
      "src/app/selectedPropsPanels.ts",
      "src/app/propertiesRouter.ts",
      "src/layout/placementManager.ts"
    ];
    const offenders: string[] = [];
    for (const file of runtimeFiles) {
      const source = await readFile(path.join(process.cwd(), file), "utf-8");
      if (/getModuleDescriptorOrThrow|\.createControls\s*\(|\.defaultParams\s*\(/.test(source)) offenders.push(file);
    }
    expect(offenders).toEqual([]);
  });
});
