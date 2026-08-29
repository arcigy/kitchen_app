import type {
  ClientCatalog,
  ComponentDefinition,
  ComponentGeometryDefinition,
  MaterialDefinition,
  PriceList,
  VendorPricingReference,
  VendorProductTemplate,
  VendorProductVariant
} from "../../core/catalog/catalog-types";
import { attachVendorModuleIntent, summarizeVendorTemplateIntent } from "../../core/catalog/vendor-module-intent";
import { createCatalogModuleDefinitionFromPackage } from "../../core/module-package/module-package-catalog";
import { getPinoSideCabinetDefinitions, getPinoSideCabinetSystem } from "./types";
import { createPinoSideCabinetTenantPackage } from "../../system/module-packages/pinoSideCabinet";
import { buildPinoHandleComponentEntries, buildPinoHandleGeometryEntries } from "./handleCatalog";

function material(args: {
  id: string;
  name: string;
  family: NonNullable<MaterialDefinition["boardFamily"]>;
  baseMaterial: MaterialDefinition["baseMaterial"];
  decor: string;
  color: string;
  finish: string;
  thickness: number;
  hex: string;
}) {
  return {
    id: args.id,
    entityType: "material",
    materialType: "board",
    name: args.name,
    displayName: args.name,
    category: "PINO/Nobilia Preview",
    baseMaterial: args.baseMaterial,
    decor: args.decor,
    color: args.color,
    finish: args.finish,
    pricingBasis: "sheet_area",
    pricingUnit: "m2",
    availableThicknessesMm: [args.thickness],
    defaultThicknessMm: args.thickness,
    isActive: true,
    tags: ["pino", "preview", args.family],
    preview: { colorHex: args.hex, roughness: 0.58, metalness: 0 },
    boardFamily: args.family,
    recommendedUse: args.family,
    grainDirectionRelevant: args.family === "front" || args.family === "worktop"
  } satisfies MaterialDefinition;
}

function componentGeometry(args: {
  id: string;
  displayName: string;
  componentType: ComponentGeometryDefinition["componentType"];
  archetype: ComponentGeometryDefinition["archetype"];
  dimensionsMm: ComponentGeometryDefinition["dimensionsMm"];
}) {
  return {
    id: args.id,
    displayName: args.displayName,
    componentType: args.componentType,
    archetype: args.archetype,
    sourceGeometry: "catalog_demo",
    dimensionsMm: args.dimensionsMm,
    notes: ["PINO preview geometry placeholder."]
  } satisfies ComponentGeometryDefinition;
}

function component(args: {
  id: string;
  geometryId: string;
  type: ComponentDefinition["componentType"];
  name: string;
  color: string;
}) {
  return {
    id: args.id,
    entityType: "component",
    componentType: args.type,
    geometryId: args.geometryId,
    name: args.name,
    displayName: args.name,
    brand: "PINO/Nobilia",
    series: "VKH 2026",
    variant: args.id,
    color: args.color,
    pricingBasis: "piece",
    pricingUnit: "pcs",
    defaultQuantity: 1,
    isActive: true,
    tags: ["pino", "preview", args.type],
    preview: { colorHex: args.color, roughness: 0.45, metalness: args.type === "handle" || args.type === "hinge" ? 0.55 : 0.2 },
    recommendedUse: args.type
  } satisfies ComponentDefinition;
}

function previewVendorCatalog() {
  const sourcePdf = getPinoSideCabinetSystem().sourcePdf;
  const productVariants: VendorProductVariant[] = [];
  const productTemplatesById = new Map<string, VendorProductTemplate>();
  const pricingReferences: VendorPricingReference[] = [];

  for (const definition of getPinoSideCabinetDefinitions()) {
    const productTemplateId = definition.definitionId;
    const pages = productTemplatesById.get(productTemplateId)?.sourcePages ?? [];
    productTemplatesById.set(productTemplateId, {
      itemType: "product_template",
      productTemplateId,
      sourcePdf,
      sourcePages: [...new Set([...pages, definition.sourcePage])],
      mainGroup: "BOCNE SKRINKY",
      subGroup: definition.productGroupId,
      productTemplateName: definition.productTemplateName,
      variantCatalogKeys: definition.catalogKeys,
      articleFamilies: [definition.articleFamily],
      availableWidthsMm: definition.dimensionsMm.availableWidths,
      confidence: 0.95,
      needsReview: false,
      reviewReasons: []
    });

    for (const row of definition.catalogRows) {
      productVariants.push(attachVendorModuleIntent({
        itemType: "product_variant",
        productTemplateId,
        sourcePdf,
        sourcePage: definition.sourcePage,
        mainGroup: "BOCNE SKRINKY",
        subGroup: definition.productGroupId,
        articleCode: row.articleCode,
        articleFamily: definition.articleFamily,
        widthCm: row.widthCm,
        widthMm: row.widthMm,
        variantCode: definition.variantCode,
        variantCodeStatus: definition.variantCode ? "extracted" : "none_expected",
        catalogKey: row.catalogKey,
        compositeKey: `${definition.articleFamily}|${row.widthCm ?? row.widthMm}|${definition.variantCode ?? ""}|${definition.productTemplateName}|${definition.sourcePage}`,
        productTemplateName: definition.productTemplateName,
        nameRaw: definition.moduleLabel,
        availableWidthsMm: definition.dimensionsMm.availableWidths,
        priceIndex: row.priceIndex,
        pricingReferenceRaw: row.pricingReferenceRaw,
        priceGroupValues: row.priceGroupValues,
        rulesRaw: definition.sourceNotes,
        notes: [...definition.sourceNotes, "Preview vendor index generated from PINO side-cabinet definitions."],
        imagePath: definition.sourceImagePath,
        imageRole: "product_image",
        imageCropQuality: "preview_render",
        confidence: 0.95,
        needsReview: false,
        reviewReasons: []
      }));
      pricingReferences.push({
        itemType: "pricing_reference",
        sourcePdf,
        sourcePage: definition.sourcePage,
        mainGroup: "BOCNE SKRINKY",
        subGroup: definition.productGroupId,
        catalogKey: row.catalogKey,
        articleCode: row.articleCode,
        priceIndex: row.priceIndex,
        priceGroupValues: row.priceGroupValues,
        pricingReferenceRaw: row.pricingReferenceRaw,
        confidence: 0.95,
        needsReview: false
      });
    }
  }

  const productTemplates = [...productTemplatesById.values()].map((template) =>
    summarizeVendorTemplateIntent(template, productVariants)
  );

  return {
    vendorId: "pino_preview",
    displayName: "PINO/Nobilia Side Cabinet Preview",
    source: "vkh_2026_cz_pdf" as const,
    productVariants,
    productTemplates,
    pricingReferences,
    extractionMeta: {
      sourcePdf,
      pages: [...new Set(getPinoSideCabinetDefinitions().map((definition) => definition.sourcePage))],
      productVariants: productVariants.length,
      productTemplates: productTemplates.length,
      pricingReferences: pricingReferences.length,
      importedAt: "2026-06-16T00:00:00.000Z",
      importStatus: "review_staging" as const,
      productionImportApproved: false as const,
      notes: ["Preview-only vendor index for PINO side-cabinet runtime diagnostics."]
    }
  };
}

export function createPinoSideCabinetPreviewCatalog(): ClientCatalog {
  const materials: MaterialDefinition[] = [
    material({ id: "mat.pino.body.laminate.light_grey.18", name: "PINO korpus svetlosivy 18 mm", family: "body", baseMaterial: "dtd", decor: "light_grey", color: "light grey", finish: "matte", thickness: 18, hex: "#c8c7c0" }),
    material({ id: "mat.pino.front.lacquer.white_matt.19", name: "PINO front biela matna 19 mm", family: "front", baseMaterial: "mdf", decor: "white_matt", color: "white", finish: "matt lacquer", thickness: 19, hex: "#ecebe4" }),
    material({ id: "mat.pino.back.hdf.white.8", name: "PINO chrbat HDF biely 8 mm", family: "back", baseMaterial: "hdf", decor: "white", color: "white", finish: "smooth", thickness: 8, hex: "#efeee8" }),
    material({ id: "mat.pino.drawer_bottom.hdf.silver.8", name: "PINO dno zasuvky HDF strieborne 8 mm", family: "drawer_bottom", baseMaterial: "hdf", decor: "silver", color: "silver grey", finish: "smooth", thickness: 8, hex: "#b9bbb8" }),
    material({ id: "mat.pino.worktop.compact.grey_stone.38", name: "PINO pracovna doska kamen seda 38 mm", family: "worktop", baseMaterial: "laminate", decor: "grey_stone", color: "grey", finish: "stone texture", thickness: 38, hex: "#777972" })
  ];

  const componentGeometryList: ComponentGeometryDefinition[] = [
    ...buildPinoHandleGeometryEntries(),
    componentGeometry({ id: "geom.pino.runner.full_extension", displayName: "PINO plnovysuv", componentType: "runner", archetype: "runner_pair", dimensionsMm: { lengthMm: 500, heightMm: 45, depthMm: 12 } }),
    componentGeometry({ id: "geom.pino.hinge.softclose", displayName: "PINO tlmeny zaves", componentType: "hinge", archetype: "hinge", dimensionsMm: { widthMm: 62, heightMm: 34, depthMm: 32 } })
  ];

  const components: ComponentDefinition[] = [
    ...buildPinoHandleComponentEntries(),
    component({ id: "cmp.pino.runner.full_extension", geometryId: "geom.pino.runner.full_extension", type: "runner", name: "PINO plnovysuv tlmeny", color: "#8f9396" }),
    component({ id: "cmp.pino.hinge.softclose", geometryId: "geom.pino.hinge.softclose", type: "hinge", name: "PINO zaves tlmeny", color: "#aeb0b0" })
  ];

  const handlePrices = Object.fromEntries(
    buildPinoHandleComponentEntries().map((entry) => {
      const hasSurcharge = (entry.tags ?? []).includes("handle-surcharge");
      const isProfile = (entry.tags ?? []).includes("handle-render-profile");
      const base =
        isProfile ? 12.5 :
        entry.nominalLengthMm && entry.nominalLengthMm >= 320 ? 9.2 :
        hasSurcharge ? 8.4 :
        5.8;
      return [entry.id, base];
    })
  );

  const priceList: PriceList = {
    id: "price.pino.preview",
    name: "PINO Preview",
    currency: "EUR",
    isActive: true,
    prices: {
      "mat.pino.body.laminate.light_grey.18": 19.5,
      "mat.pino.front.lacquer.white_matt.19": 42,
      "mat.pino.back.hdf.white.8": 8,
      "mat.pino.drawer_bottom.hdf.silver.8": 9,
      "mat.pino.worktop.compact.grey_stone.38": 65,
      ...handlePrices,
      "cmp.pino.runner.full_extension": 18.5,
      "cmp.pino.hinge.softclose": 3.4
    }
  };
  const sideCabinetPackage = createPinoSideCabinetTenantPackage();
  const vendorCatalog = previewVendorCatalog();

  return {
    clientId: "pino_preview",
    materials,
    hardware: [],
    legacyMaterials: [],
    components,
    componentGeometry: componentGeometryList,
    modules: [
      createCatalogModuleDefinitionFromPackage(sideCabinetPackage, {
        enabled: true,
        catalog: { priceList }
      })
    ],
    priceList,
    kitchenDefaults: {
      carcassMaterialId: "mat.pino.body.laminate.light_grey.18",
      frontMaterialId: "mat.pino.front.lacquer.white_matt.19",
      backPanelMaterialId: "mat.pino.back.hdf.white.8",
      plinthMaterialId: "mat.pino.body.laminate.light_grey.18",
      defaultHandleComponentId: "cmp.pino.handle.601",
      defaultHingeComponentId: "cmp.pino.hinge.softclose",
      defaultDrawerSystemComponentId: "cmp.pino.runner.full_extension",
      defaultCarcassThicknessMm: 18,
      defaultBackPanelThicknessMm: 8,
      defaultPlinthHeightMm: 110
    },
    vendorCatalog,
    meta: {
      catalogVersion: 1,
      source: "client-custom",
      createdAt: "2026-06-16T00:00:00.000Z",
      updatedAt: "2026-06-16T00:00:00.000Z"
    }
  };
}
