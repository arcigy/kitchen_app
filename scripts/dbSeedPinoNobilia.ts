import { readFile } from "node:fs/promises";
import path from "node:path";
import { assertEnvironmentSchemaMatch, assertValidDatabaseSchema, getDatabaseUrl, normalizeAppEnvironment } from "../src/core/database/database-config";
import { closeSchemaPools, withSchemaClient } from "../src/core/database/postgres-client";
import { hashPassword } from "../src/core/auth/password";
import { createPostgresClientCatalogRepository } from "../src/core/catalog/catalog-postgres-repository";
import type {
  ClientCatalog,
  ComponentDefinition,
  ComponentGeometryDefinition,
  MaterialDefinition,
  PriceList,
  VendorPricingReference,
  VendorProductTemplate,
  VendorProductVariant
} from "../src/core/catalog/catalog-types";
import { attachVendorModuleIntent, summarizeVendorTemplateIntent } from "../src/core/catalog/vendor-module-intent";
import { createCatalogModuleDefinitionFromPackage } from "../src/core/module-package/module-package-catalog";
import { createPostgresModulePackageRepository } from "../src/core/module-package/module-package-postgres-repository";
import type { FurnQuoteModulePackage } from "../src/core/module-package/module-package-types";
import {
  getPinoSideCabinetDefinitions,
  getPinoSideCabinetSystem
} from "../src/modules/pinoSideCabinet/types";
import { buildPinoHandleComponentEntries, buildPinoHandleGeometryEntries } from "../src/modules/pinoSideCabinet/handleCatalog";
import { createPinoNobiliaTenantModulePackages } from "../src/system/pinoNobiliaTenantPackages";

const CLIENT_ID = "client_pino_nobilia_vkh_2026";
const USER_ID = "user_pino_nobilia_owner";
const USERNAME = "pino_nobilia";
const IDENTITY_ID = `password:${USERNAME}`;
const DEFAULT_SOURCE_PAGES = Array.from({ length: 20 }, (_, index) => 89 + index);
const MANUAL_SOURCE_PAGES = [243];

type Args = {
  schema?: string;
  databaseUrl?: string;
  appEnv?: string;
  outputDir?: string;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === "--schema") args.schema = argv[++index];
    else if (item.startsWith("--schema=")) args.schema = item.slice("--schema=".length);
    else if (item === "--database-url") args.databaseUrl = argv[++index];
    else if (item.startsWith("--database-url=")) args.databaseUrl = item.slice("--database-url=".length);
    else if (item === "--app-env") args.appEnv = argv[++index];
    else if (item.startsWith("--app-env=")) args.appEnv = item.slice("--app-env=".length);
    else if (item === "--output-dir") args.outputDir = argv[++index];
    else if (item.startsWith("--output-dir=")) args.outputDir = item.slice("--output-dir=".length);
    else throw new Error(`Unsupported argument: ${item}`);
  }
  return args;
}

async function readJson<T>(outputDir: string, fileName: string): Promise<T> {
  const raw = await readFile(path.join(outputDir, fileName), "utf-8");
  return JSON.parse(raw) as T;
}

function createMaterial(args: {
  id: string;
  name: string;
  family: NonNullable<MaterialDefinition["boardFamily"]>;
  baseMaterial: MaterialDefinition["baseMaterial"];
  decor: string;
  color: string;
  finish: string;
  thickness: number;
  hex: string;
  price: number;
}): MaterialDefinition {
  return {
    id: args.id,
    entityType: "material",
    materialType: "board",
    name: args.name,
    displayName: args.name,
    category: `PINO/Nobilia ${args.family}`,
    baseMaterial: args.baseMaterial,
    decor: args.decor,
    color: args.color,
    finish: args.finish,
    pricingBasis: "sheet_area",
    pricingUnit: "m2",
    availableThicknessesMm: [args.thickness],
    defaultThicknessMm: args.thickness,
    isActive: true,
    tags: ["pino", "nobilia", "vkh-2026", args.family],
    preview: {
      colorHex: args.hex,
      roughness: 0.58,
      metalness: 0
    },
    boardFamily: args.family,
    recommendedUse: args.family,
    grainDirectionRelevant: args.family === "front" || args.family === "worktop"
  };
}

function createComponentGeometry(args: {
  id: string;
  displayName: string;
  componentType: ComponentGeometryDefinition["componentType"];
  archetype: ComponentGeometryDefinition["archetype"];
  dimensionsMm: ComponentGeometryDefinition["dimensionsMm"];
}): ComponentGeometryDefinition {
  return {
    id: args.id,
    displayName: args.displayName,
    componentType: args.componentType,
    archetype: args.archetype,
    sourceGeometry: "catalog_demo",
    dimensionsMm: args.dimensionsMm,
    notes: ["PINO/Nobilia tenant seed geometry placeholder."]
  };
}

function createComponent(args: {
  id: string;
  geometryId: string;
  type: ComponentDefinition["componentType"];
  name: string;
  brand: string;
  series: string;
  variant: string;
  color: string;
  price: number;
  nominalLengthMm?: number;
  nominalHeightMm?: number;
}): ComponentDefinition {
  return {
    id: args.id,
    entityType: "component",
    componentType: args.type,
    geometryId: args.geometryId,
    name: args.name,
    displayName: args.name,
    brand: args.brand,
    series: args.series,
    variant: args.variant,
    color: args.color,
    pricingBasis: "piece",
    pricingUnit: "pcs",
    defaultQuantity: 1,
    isActive: true,
    tags: ["pino", "nobilia", "vkh-2026", args.type],
    preview: {
      colorHex: args.color,
      roughness: 0.45,
      metalness: args.type === "handle" || args.type === "hinge" ? 0.45 : 0
    },
    nominalLengthMm: args.nominalLengthMm,
    nominalHeightMm: args.nominalHeightMm,
    recommendedUse: args.type
  };
}

function customMaterials() {
  return [
    createMaterial({
      id: "mat.pino.body.laminate.light_grey.18",
      name: "PINO korpus svetlosivy 18 mm",
      family: "body",
      baseMaterial: "dtd",
      decor: "light_grey",
      color: "light grey",
      finish: "matte",
      thickness: 18,
      hex: "#c8c7c0",
      price: 19.5
    }),
    createMaterial({
      id: "mat.pino.front.lacquer.white_matt.19",
      name: "PINO front biela matna 19 mm",
      family: "front",
      baseMaterial: "mdf",
      decor: "white_matt",
      color: "white",
      finish: "matt lacquer",
      thickness: 19,
      hex: "#ecebe4",
      price: 42
    }),
    createMaterial({
      id: "mat.pino.back.hdf.white.8",
      name: "PINO chrbat HDF biely 8 mm",
      family: "back",
      baseMaterial: "hdf",
      decor: "white",
      color: "white",
      finish: "smooth",
      thickness: 8,
      hex: "#efeee8",
      price: 8
    }),
    createMaterial({
      id: "mat.pino.drawer_bottom.hdf.silver.8",
      name: "PINO dno zasuvky HDF strieborne 8 mm",
      family: "drawer_bottom",
      baseMaterial: "hdf",
      decor: "silver",
      color: "silver grey",
      finish: "smooth",
      thickness: 8,
      hex: "#b9bbb8",
      price: 9
    }),
    createMaterial({
      id: "mat.pino.worktop.compact.grey_stone.38",
      name: "PINO pracovna doska kamen seda 38 mm",
      family: "worktop",
      baseMaterial: "laminate",
      decor: "grey_stone",
      color: "grey",
      finish: "stone texture",
      thickness: 38,
      hex: "#777972",
      price: 65
    })
  ];
}

function customComponentGeometry(): ComponentGeometryDefinition[] {
  return [
    ...buildPinoHandleGeometryEntries(),
    createComponentGeometry({
      id: "geom.pino.runner.full_extension",
      displayName: "PINO plnovysuv",
      componentType: "runner",
      archetype: "runner_pair",
      dimensionsMm: { lengthMm: 500, heightMm: 45, depthMm: 12 }
    }),
    createComponentGeometry({
      id: "geom.pino.hinge.softclose",
      displayName: "PINO tlmeny zaves",
      componentType: "hinge",
      archetype: "hinge",
      dimensionsMm: { widthMm: 62, heightMm: 34, depthMm: 32 }
    }),
    createComponentGeometry({
      id: "geom.pino.leg.adjustable.100",
      displayName: "PINO nastavitelna nozka 100",
      componentType: "leg",
      archetype: "leg_adjustable",
      dimensionsMm: { heightMm: 100, diameterMm: 38 }
    }),
    createComponentGeometry({
      id: "geom.pino.plinth_clip",
      displayName: "PINO soklova klipsa",
      componentType: "plinth_clip",
      archetype: "plinth_clip",
      dimensionsMm: { widthMm: 48, heightMm: 16, depthMm: 50 }
    })
  ];
}

function customComponents(): ComponentDefinition[] {
  return [
    ...buildPinoHandleComponentEntries(),
    createComponent({
      id: "cmp.pino.runner.full_extension",
      geometryId: "geom.pino.runner.full_extension",
      type: "runner",
      name: "PINO plnovysuv tlmeny",
      brand: "PINO/Nobilia",
      series: "VKH 2026",
      variant: "full-extension",
      color: "#8f9396",
      price: 18.5
    }),
    createComponent({
      id: "cmp.pino.hinge.softclose",
      geometryId: "geom.pino.hinge.softclose",
      type: "hinge",
      name: "PINO zaves tlmeny",
      brand: "PINO/Nobilia",
      series: "VKH 2026",
      variant: "softclose",
      color: "#aeb0b0",
      price: 3.4
    }),
    createComponent({
      id: "cmp.pino.leg.adjustable.100",
      geometryId: "geom.pino.leg.adjustable.100",
      type: "leg",
      name: "PINO nozka nastavitelna 100 mm",
      brand: "PINO/Nobilia",
      series: "VKH 2026",
      variant: "100mm",
      color: "#222222",
      price: 1.25,
      nominalHeightMm: 100
    }),
    createComponent({
      id: "cmp.pino.plinth_clip",
      geometryId: "geom.pino.plinth_clip",
      type: "plinth_clip",
      name: "PINO soklova klipsa",
      brand: "PINO/Nobilia",
      series: "VKH 2026",
      variant: "standard",
      color: "#222222",
      price: 0.45
    })
  ];
}

function priceList(materials: MaterialDefinition[], components: ComponentDefinition[]): PriceList {
  const prices: Record<string, number> = {};
  for (const material of materials) {
    prices[material.id] =
      material.boardFamily === "front" ? 42 :
      material.boardFamily === "worktop" ? 65 :
      material.boardFamily === "back" ? 8 :
      material.boardFamily === "drawer_bottom" ? 9 :
      19.5;
  }
  for (const component of components) {
    prices[component.id] =
      component.componentType === "handle"
        ? component.tags.includes("handle-render-profile")
          ? 12.5
          : component.tags.includes("handle-surcharge")
            ? 8.4
            : typeof component.nominalLengthMm === "number" && component.nominalLengthMm >= 320
              ? 9.2
              : 5.8
        : component.componentType === "runner" ? 18.5 :
          component.componentType === "hinge" ? 3.4 :
          component.componentType === "leg" ? 1.25 :
          0.45;
  }
  return {
    id: "price.pino_nobilia.vkh_2026.review_staging",
    name: "PINO/Nobilia VKH 2026 review staging",
    currency: "EUR",
    isActive: true,
    prices
  };
}

function filterPages<T extends { sourcePage?: number; sourcePages?: number[] }>(items: T[]): T[] {
  const pageSet = new Set(DEFAULT_SOURCE_PAGES);
  return items.filter((item) =>
    typeof item.sourcePage === "number"
      ? pageSet.has(item.sourcePage)
      : (item.sourcePages ?? []).some((page) => pageSet.has(page))
  );
}

function appendUniqueBy<T>(items: T[], additions: T[], keyFn: (item: T) => string): T[] {
  const seen = new Set(items.map(keyFn));
  const next = [...items];
  for (const item of additions) {
    const key = keyFn(item);
    if (seen.has(key)) continue;
    seen.add(key);
    next.push(item);
  }
  return next;
}

function createManualSideCabinetVendorData(): {
  products: VendorProductVariant[];
  templates: VendorProductTemplate[];
  pricingReferences: VendorPricingReference[];
} {
  const products: VendorProductVariant[] = [];
  const templates: VendorProductTemplate[] = [];
  const pricingReferences: VendorPricingReference[] = [];
  const sourcePdf = getPinoSideCabinetSystem().sourcePdf;

  for (const definition of getPinoSideCabinetDefinitions()) {
    templates.push({
      itemType: "product_template",
      productTemplateId: definition.definitionId,
      sourcePdf,
      sourcePages: [definition.sourcePage],
      mainGroup: "BOÄŚNĂŤ SKĹĂŤĹ‡KY",
      subGroup: null,
      productTemplateName: definition.productTemplateName,
      nameNormalized: definition.productTemplateName.toLowerCase(),
      variantCatalogKeys: definition.catalogKeys,
      articleFamilies: [definition.articleFamily],
      availableWidthsMm: definition.dimensionsMm.availableWidths,
      confidence: 0.92,
      needsReview: true,
      reviewReasons: [
        "Manual page 243 extraction added for 3D review prototype.",
        "Not part of the reviewed automatic import range 89-108."
      ]
    });

    for (const row of definition.catalogRows) {
      const widthMm = row.widthMm;
      const compositeKey = [
        definition.articleFamily,
        row.widthCm,
        definition.variantCode ?? "",
        definition.productTemplateName,
        definition.sourcePage
      ].join("|");
      products.push({
        recordType: "product_variant",
        itemType: "product_variant",
        productTemplateId: definition.definitionId,
        templateId: definition.definitionId,
        sourcePdf,
        sourcePage: definition.sourcePage,
        mainGroup: "BOÄŚNĂŤ SKĹĂŤĹ‡KY",
        subGroup: null,
        articleCode: row.articleCode,
        articleFamily: definition.articleFamily,
        widthCm: row.widthCm,
        variantCode: definition.variantCode,
        variantCodeStatus: definition.variantCode ? "extracted" : "none_expected",
        catalogKey: row.catalogKey,
        compositeKey,
        productTemplateName: definition.productTemplateName,
        nameRaw: definition.productTemplateName,
        nameNormalized: definition.productTemplateName.toLowerCase(),
        widthMm,
        heightMm: definition.dimensionsMm.height,
        depthMm: definition.dimensionsMm.depth,
        availableWidthsMm: definition.dimensionsMm.availableWidths,
        priceIndex: row.priceIndex,
        pricingReferenceRaw: row.pricingReferenceRaw,
        priceGroupValues: row.priceGroupValues,
        rulesRaw: definition.sourceNotes,
        notes: [
          "Manually transcribed from VKH 2026 CZ page 243 for side-cabinet geometry prototyping.",
          "DÄ›lenĂ© ÄŤelo se mĹŻĹľe odliĹˇovat od obrĂˇzku."
        ],
        imagePath: definition.sourceImagePath,
        imageRole: "product_image",
        imageCropQuality: "manual_page_render",
        confidence: 0.9,
        needsReview: true,
        reviewReasons: [
          "Manual staging extraction.",
          "3D geometry approximates visible external dimensions and front rhythm, not final manufacturing detail."
        ]
      });
      pricingReferences.push({
        itemType: "pricing_reference",
        sourcePdf,
        sourcePage: definition.sourcePage,
        mainGroup: "BOÄŚNĂŤ SKĹĂŤĹ‡KY",
        subGroup: null,
        catalogKey: row.catalogKey,
        articleCode: row.articleCode,
        priceIndex: row.priceIndex,
        priceGroupValues: row.priceGroupValues,
        pricingReferenceRaw: row.pricingReferenceRaw,
        confidence: 0.9,
        needsReview: true
      });
    }
  }

  return { products, templates, pricingReferences };
}

async function createPinoCatalog(args: {
  outputDir: string;
  savedPackages: FurnQuoteModulePackage[];
}): Promise<ClientCatalog> {
  const importedProducts = filterPages(await readJson<VendorProductVariant[]>(args.outputDir, "products.json"));
  const importedTemplates = filterPages(await readJson<VendorProductTemplate[]>(args.outputDir, "product_templates.json"));
  const importedPricingReferences = filterPages(await readJson<VendorPricingReference[]>(args.outputDir, "pricing_references.json"));
  const manualSideCabinets = createManualSideCabinetVendorData();
  const products = appendUniqueBy(importedProducts, manualSideCabinets.products, (item) => item.catalogKey)
    .map(attachVendorModuleIntent);
  const templates = appendUniqueBy(importedTemplates, manualSideCabinets.templates, (item) => item.productTemplateId)
    .map((template) => summarizeVendorTemplateIntent(template, products));
  const pricingReferences = appendUniqueBy(importedPricingReferences, manualSideCabinets.pricingReferences, (item) => item.catalogKey);
  const report = await readJson<{ sourcePdf?: string; pages?: number[]; productVariants?: number }>(args.outputDir, "extraction_report.json");
  const materials = customMaterials();
  const components = customComponents();
  const componentGeometry = customComponentGeometry();
  const now = new Date().toISOString();
  const catalog: ClientCatalog = {
    clientId: CLIENT_ID,
    materials,
    hardware: [],
    legacyMaterials: [],
    components,
    componentGeometry,
    modules: args.savedPackages.map((modulePackage) =>
      createCatalogModuleDefinitionFromPackage(modulePackage, {
        enabled: true,
        catalog: { priceList: priceList(materials, components) }
      })
    ),
    priceList: priceList(materials, components),
    kitchenDefaults: {
      carcassMaterialId: "mat.pino.body.laminate.light_grey.18",
      frontMaterialId: "mat.pino.front.lacquer.white_matt.19",
      worktopMaterialId: "mat.pino.worktop.compact.grey_stone.38",
      plinthMaterialId: "mat.pino.body.laminate.light_grey.18",
      backPanelMaterialId: "mat.pino.back.hdf.white.8",
      drawerBottomMaterialId: "mat.pino.drawer_bottom.hdf.silver.8",
      defaultHandleComponentId: "cmp.pino.handle.601",
      defaultHingeComponentId: "cmp.pino.hinge.softclose",
      defaultDrawerSystemComponentId: "cmp.pino.runner.full_extension",
      defaultWorktopThicknessMm: 38,
      defaultCarcassThicknessMm: 18,
      defaultBackPanelThicknessMm: 8,
      defaultPlinthHeightMm: 150
    },
    vendorCatalog: {
      vendorId: "pino_nobilia",
      displayName: "PINO/Nobilia VKH 2026 CZ",
      source: "vkh_2026_cz_pdf",
      productVariants: products,
      productTemplates: templates,
      pricingReferences,
      extractionMeta: {
        sourcePdf: report.sourcePdf ?? "VKH_2026_CZ.pdf",
        pages: [...DEFAULT_SOURCE_PAGES, ...MANUAL_SOURCE_PAGES],
        productVariants: products.length,
        productTemplates: templates.length,
        pricingReferences: pricingReferences.length,
        importedAt: now,
        importStatus: "review_staging",
        productionImportApproved: false,
        notes: [
          "Seeded only from reviewed pages 89-108.",
          "Page 243 side-cabinet records are manually transcribed review data for geometry prototyping.",
          "Vendor records carry inferred module intent and placement intelligence for runtime mapping.",
          "PDF extraction remains review/staging data and must not be used as a production import."
        ]
      }
    },
    meta: {
      catalogVersion: 1,
      source: "client-custom",
      createdAt: now,
      updatedAt: now
    }
  };
  return catalog;
}

const args = parseArgs(process.argv.slice(2));
const password = process.env.PINO_NOBILIA_SEED_PASSWORD;
if (!password) throw new Error("PINO_NOBILIA_SEED_PASSWORD is required.");
if (password.length < 10) throw new Error("PINO_NOBILIA_SEED_PASSWORD must be at least 10 characters.");

const connectionString = args.databaseUrl || getDatabaseUrl();
if (!connectionString) throw new Error("DATABASE_URL or KITCHEN_PROJECT_DATABASE_URL is required.");

const inferredAppEnv = args.appEnv || process.env.APP_ENV || (args.schema === "prod" || args.schema === "dev" ? args.schema : undefined);
const appEnv = normalizeAppEnvironment(inferredAppEnv, process.env.NODE_ENV);
const schema = assertValidDatabaseSchema(args.schema || process.env.DATABASE_SCHEMA || appEnv);
assertEnvironmentSchemaMatch(appEnv, schema);

const outputDir = path.resolve(process.cwd(), args.outputDir ?? "output");
const ctx = { clientId: CLIENT_ID, userId: USER_ID, role: "owner" as const };
const now = new Date().toISOString();

try {
  await withSchemaClient(connectionString, schema, async (client) => {
    const passwordHash = await hashPassword(password);
    await client.query(
      `
        INSERT INTO arcigy_organizations (
          organization_id,
          name,
          legal_name,
          settings,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4::jsonb, $5::timestamptz, $6::timestamptz)
        ON CONFLICT (organization_id) DO UPDATE SET
          name = EXCLUDED.name,
          legal_name = EXCLUDED.legal_name,
          settings = EXCLUDED.settings,
          updated_at = EXCLUDED.updated_at,
          db_updated_at = now()
      `,
      [
        CLIENT_ID,
        "PINO/Nobilia VKH 2026",
        "PINO/Nobilia VKH 2026",
        JSON.stringify({
          company: { name: "PINO/Nobilia VKH 2026", legalName: "PINO/Nobilia VKH 2026" },
          defaults: { currency: "EUR", language: "sk", vatRate: 20 },
          source: "vkh_2026_cz_pdf_review_staging"
        }),
        now,
        now
      ]
    );
    await client.query(
      `
        INSERT INTO arcigy_organization_users (
          user_id,
          organization_id,
          name,
          email,
          position,
          photo_asset_id,
          is_active,
          profile,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, true, $7::jsonb, $8::timestamptz, $9::timestamptz)
        ON CONFLICT (user_id) DO UPDATE SET
          organization_id = EXCLUDED.organization_id,
          name = EXCLUDED.name,
          email = EXCLUDED.email,
          position = EXCLUDED.position,
          photo_asset_id = EXCLUDED.photo_asset_id,
          is_active = EXCLUDED.is_active,
          profile = EXCLUDED.profile,
          updated_at = EXCLUDED.updated_at,
          db_updated_at = now()
      `,
      [
        USER_ID,
        CLIENT_ID,
        "PINO/Nobilia Owner",
        "pino-nobilia@arcigy.local",
        "Owner",
        "/organization/pino-nobilia.png",
        JSON.stringify({
          organizationRole: "administrator",
          permissions: ["projects:view", "projects:edit", "projects:save", "projects:export", "versions:view", "versions:restore", "organization:view", "organization:manage"]
        }),
        now,
        now
      ]
    );
    await client.query(
      `
        INSERT INTO arcigy_organization_memberships (
          organization_id,
          user_id,
          role,
          permissions,
          created_at,
          updated_at
        )
        VALUES ($1, $2, 'owner', $3::jsonb, $4::timestamptz, $5::timestamptz)
        ON CONFLICT (organization_id, user_id) DO UPDATE SET
          role = EXCLUDED.role,
          permissions = EXCLUDED.permissions,
          updated_at = EXCLUDED.updated_at
      `,
      [
        CLIENT_ID,
        USER_ID,
        JSON.stringify(["projects:view", "projects:edit", "projects:save", "projects:export", "versions:view", "versions:restore", "organization:view", "organization:manage"]),
        now,
        now
      ]
    );
    await client.query(
      `
        INSERT INTO arcigy_auth_identities (
          identity_id,
          user_id,
          username,
          email,
          password_hash,
          provider,
          is_active,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, 'password', true, $6::timestamptz, $7::timestamptz)
        ON CONFLICT (identity_id) DO UPDATE SET
          username = EXCLUDED.username,
          email = EXCLUDED.email,
          password_hash = EXCLUDED.password_hash,
          is_active = EXCLUDED.is_active,
          updated_at = EXCLUDED.updated_at
      `,
      [IDENTITY_ID, USER_ID, USERNAME, "pino-nobilia@arcigy.local", passwordHash, now, now]
    );
  });

  const packageRepository = createPostgresModulePackageRepository({ connectionString, schema });
  const savedPackages = [];
  for (const modulePackage of createPinoNobiliaTenantModulePackages()) {
    savedPackages.push(await packageRepository.savePackage(ctx, modulePackage, { source: "dev-json" }));
  }

  const catalogRepository = createPostgresClientCatalogRepository({ connectionString, schema });
  const catalog = await createPinoCatalog({ outputDir, savedPackages });
  await catalogRepository.saveCatalog(ctx, catalog);
  console.log(`[db:seed:pino-nobilia] Seeded ${CLIENT_ID} with ${catalog.vendorCatalog?.productVariants.length ?? 0} vendor variants in schema ${schema}`);
} finally {
  await closeSchemaPools();
}
