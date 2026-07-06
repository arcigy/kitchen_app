import type { FurnQuoteModulePackage } from "../../core/module-package/module-package-types";
import {
  getPinoSideCabinetChoiceList,
  getPinoSideCabinetDefinitions,
  getPinoSideCabinetProductGroups,
  getPinoSideCabinetSystem
} from "../../modules/pinoSideCabinet/types";

export function createPinoSideCabinetTenantPackage(): FurnQuoteModulePackage {
  const now = new Date().toISOString();
  const definition = getPinoSideCabinetDefinitions()[0]!;
  const groups = getPinoSideCabinetProductGroups();
  const common = getPinoSideCabinetSystem().commonDimensionsMm;

  return {
    format: "furnquote-module",
    packageVersion: 1,
    module: {
      modulePackageId: "pino_nobilia_side_cabinet_vkh_2026_v1",
      moduleType: "pino_side_cabinet",
      familyName: "PINO/Nobilia bocne skrinky",
      displayName: "PINO bocna skrinka",
      description: "Custom PINO/Nobilia VKH 2026 tenant side-cabinet package with grouped product selection and kitchen-aware placement rules.",
      category: "tall_cabinet",
      version: "1.0.0",
      isSystemModule: false,
      tags: ["pino", "nobilia", "vkh-2026", "side-cabinet", "tall", "kitchen", "review-staging"]
    },
    parameters: {
      parameters: [
        { key: "type", label: "Type", type: "string", required: true, defaultValue: "pino_side_cabinet", group: "general", affects: "all" },
        { key: "assemblyContext", label: "Assembly context", type: "string", required: true, defaultValue: "kitchen", group: "general", affects: "placement" },
        {
          key: "kitchenModuleRole",
          label: "Kitchen module role",
          type: "select",
          required: true,
          defaultValue: "tall",
          group: "general",
          affects: "placement",
          options: [{ label: "Tall", value: "tall" }]
        },
        { key: "requiresWorktop", label: "Requires worktop", type: "boolean", required: true, defaultValue: false, group: "general", affects: "placement" },
        {
          key: "placementZone",
          label: "Placement zone",
          type: "select",
          required: true,
          defaultValue: "tall",
          group: "general",
          affects: "placement",
          options: [
            { label: "Tall", value: "tall" },
            { label: "Tall appliance", value: "tall_appliance" }
          ]
        },
        {
          key: "groupId",
          label: "Group",
          type: "select",
          required: true,
          defaultValue: definition.productGroupId,
          group: "catalog",
          affects: "all",
          options: groups.map((item) => ({ label: item.label, value: item.groupId }))
        },
        {
          key: "definitionId",
          label: "Product",
          type: "select",
          required: true,
          defaultValue: definition.definitionId,
          group: "catalog",
          affects: "all",
          options: getPinoSideCabinetChoiceList().map((item) => ({
            label: item.label,
            value: item.definitionId
          }))
        },
        { key: "articleCode", label: "Article code", type: "string", required: true, defaultValue: definition.catalogRows[0]?.articleCode ?? "", group: "catalog", affects: "pricing" },
        { key: "catalogKey", label: "Catalog key", type: "string", required: true, defaultValue: definition.catalogKeys[0] ?? "", group: "catalog", affects: "pricing" },
        { key: "priceGroup", label: "Price group", type: "select", required: true, defaultValue: "3", group: "catalog", affects: "pricing", options: ["0", "1", "2", "3", "4", "5"].map((value) => ({ label: value, value })) },
        { key: "width", label: "Width", type: "number", required: true, defaultValue: definition.dimensionsMm.defaultWidth, min: 300, max: 900, step: 50, unit: "mm", group: "dimensions", affects: "geometry" },
        { key: "height", label: "Height", type: "number", required: true, defaultValue: definition.dimensionsMm.height, min: 1800, max: 2600, step: 1, unit: "mm", group: "dimensions", affects: "geometry" },
        { key: "depth", label: "Depth", type: "number", required: true, defaultValue: definition.dimensionsMm.depth, min: 300, max: 900, step: 1, unit: "mm", group: "dimensions", affects: "geometry" },
        { key: "boardThickness", label: "Board thickness", type: "number", required: true, defaultValue: common.boardThickness, min: 12, max: 40, step: 1, unit: "mm", group: "construction", affects: "geometry" },
        { key: "frontThicknessMm", label: "Front thickness", type: "number", required: true, defaultValue: common.frontThickness, min: 12, max: 40, step: 1, unit: "mm", group: "construction", affects: "geometry" },
        { key: "backThickness", label: "Back thickness", type: "number", required: true, defaultValue: common.backThickness, min: 3, max: 20, step: 1, unit: "mm", group: "construction", affects: "geometry" },
        { key: "plinthHeight", label: "Plinth height", type: "number", required: true, defaultValue: common.plinthHeight, min: 0, max: 220, step: 1, unit: "mm", group: "construction", affects: "geometry" },
        { key: "frontGap", label: "Front gap", type: "number", required: true, defaultValue: 3, min: 0, max: 12, step: 1, unit: "mm", group: "fronts", affects: "geometry" },
        { key: "sideGap", label: "Side gap", type: "number", required: true, defaultValue: 2, min: 0, max: 12, step: 1, unit: "mm", group: "fronts", affects: "geometry" },
        { key: "shelfThickness", label: "Shelf thickness", type: "number", required: true, defaultValue: common.boardThickness, min: 12, max: 40, step: 1, unit: "mm", group: "construction", affects: "geometry" },
        { key: "opened", label: "Opened", type: "boolean", required: true, defaultValue: false, group: "state", affects: "geometry" },
        { key: "bodyMaterialId", label: "Body material", type: "material", required: false, defaultValue: "mat.pino.body.laminate.light_grey.18", group: "materials", affects: "visual" },
        { key: "frontMaterialId", label: "Front material", type: "material", required: false, defaultValue: "mat.pino.front.lacquer.white_matt.19", group: "materials", affects: "visual" },
        { key: "backMaterialId", label: "Back material", type: "material", required: false, defaultValue: "mat.pino.back.hdf.white.8", group: "materials", affects: "visual" },
        { key: "shelfMaterialId", label: "Shelf material", type: "material", required: false, defaultValue: "mat.pino.body.laminate.light_grey.18", group: "materials", affects: "visual" },
        { key: "plinthMaterialId", label: "Plinth material", type: "material", required: false, defaultValue: "mat.pino.body.laminate.light_grey.18", group: "materials", affects: "visual" },
        { key: "handleComponentId", label: "Handle component", type: "component", required: false, defaultValue: "cmp.pino.handle.601", group: "components", affects: "visual" },
        { key: "handlePlacementCode", label: "Handle placement", type: "string", required: false, defaultValue: "001", group: "components", affects: "geometry" },
        { key: "handleOffsetMm", label: "Handle offset", type: "number", required: false, defaultValue: 0, min: -220, max: 220, step: 1, unit: "mm", group: "components", affects: "geometry" },
        { key: "hingeComponentId", label: "Hinge component", type: "component", required: false, defaultValue: "cmp.pino.hinge.softclose", group: "components", affects: "visual" },
        { key: "runnerComponentId", label: "Runner component", type: "component", required: false, defaultValue: "cmp.pino.runner.full_extension", group: "components", affects: "visual" },
        { key: "applianceCategory", label: "Appliance category", type: "string", required: false, defaultValue: null, group: "state", affects: "geometry" },
        { key: "applianceModuleType", label: "Appliance module type", type: "string", required: false, defaultValue: null, group: "state", affects: "geometry" },
        { key: "applianceWidthMm", label: "Appliance width", type: "number", required: false, defaultValue: null, min: 100, max: 1200, step: 1, unit: "mm", group: "state", affects: "geometry" },
        { key: "applianceHeightMm", label: "Appliance height", type: "number", required: false, defaultValue: null, min: 100, max: 2200, step: 1, unit: "mm", group: "state", affects: "geometry" },
        { key: "applianceDepthMm", label: "Appliance depth", type: "number", required: false, defaultValue: null, min: 100, max: 1200, step: 1, unit: "mm", group: "state", affects: "geometry" },
        { key: "applianceInstalled", label: "Appliance installed", type: "boolean", required: false, defaultValue: false, group: "state", affects: "geometry" }
      ]
    },
    placement: {
      allowedContexts: ["kitchen_wall", "floor", "appliance_zone"],
      forbiddenContexts: ["wall_mounted", "above_countertop", "under_sink"],
      requiredAnchors: ["wall", "floor"],
      requiresWall: true,
      requiresFloor: true,
      allowFreePlacement: false,
      clearance: { frontMm: 600 }
    },
    constraints: {
      dimensionRules: {
        width: { min: 300, max: 900, step: 50 },
        height: { min: 1800, max: 2600, step: 1 },
        depth: { min: 300, max: 900, step: 1 }
      },
      validationRules: [
        {
          id: "catalog-width",
          message: "PINO side cabinet width should match a VKH catalog width.",
          severity: "warning",
          expression: "width === 300 || width === 450 || width === 500 || width === 600"
        }
      ]
    },
    snapping: {
      enabled: true,
      snapTargets: ["wall", "floor", "adjacent_module", "grid"],
      priority: ["wall", "adjacent_module", "grid"],
      snapDistanceMm: 40,
      rotationSnapDeg: 90,
      align: {
        backToWall: true,
        sideToWall: true,
        frontFlushWithAdjacent: true,
        topAlignWithAdjacent: false
      }
    },
    geometry: {
      mode: "trusted-runtime",
      runtimeBuilderKey: "pinoSideCabinet.v1"
    },
    materials: {
      slots: [
        { slotId: "carcass", label: "Carcass", required: true, defaultFrom: "catalog.kitchenDefaults.carcassMaterialId", affects: ["geometry", "visual", "bom", "pricing"] },
        { slotId: "front", label: "Front", required: true, defaultFrom: "catalog.kitchenDefaults.frontMaterialId", affects: ["geometry", "visual", "bom", "pricing"] },
        { slotId: "back", label: "Back", required: true, defaultFrom: "catalog.kitchenDefaults.backPanelMaterialId", affects: ["geometry", "visual", "bom", "pricing"] },
        { slotId: "shelf", label: "Shelf", required: true, defaultFrom: "catalog.kitchenDefaults.carcassMaterialId", affects: ["geometry", "visual", "bom", "pricing"] },
        { slotId: "plinth", label: "Plinth", required: true, defaultFrom: "catalog.kitchenDefaults.plinthMaterialId", affects: ["geometry", "visual", "bom", "pricing"] }
      ]
    },
    components: {
      slots: [
        { slotId: "handle", label: "Handle", componentType: "handle", required: false, defaultFrom: "catalog.kitchenDefaults.defaultHandleComponentId", affects: ["geometry", "visual", "bom", "pricing"] },
        { slotId: "hinge", label: "Hinge", componentType: "hinge", required: false, defaultFrom: "catalog.kitchenDefaults.defaultHingeComponentId", affects: ["geometry", "visual", "bom", "pricing"] },
        { slotId: "runner", label: "Runner", componentType: "runner", required: false, defaultFrom: "catalog.kitchenDefaults.defaultDrawerSystemComponentId", affects: ["geometry", "visual", "bom", "pricing"] }
      ]
    },
    behavior: {
      contextBindings: [
        {
          contextType: "kitchenGroup",
          required: true,
          scope: "single",
          autoAssign: "activeKitchenGroup",
          liveSync: true,
          forbidCrossContextAdjacency: true,
          parameterSync: [
            { targetParameter: "depth", source: "ctx.moduleDepthMm" },
            { targetParameter: "plinthHeight", source: "ctx.plinthHeightMm" }
          ],
          materialSync: [
            { targetSlot: "carcass", source: "ctx.corpusMaterialId", family: "body", thicknessParameter: "boardThickness", aliases: ["body", "shelf"] },
            { targetSlot: "front", source: "ctx.frontsMaterialId", family: "front", thicknessParameter: "frontThicknessMm", aliases: ["front"] },
            { targetSlot: "back", source: "ctx.backMaterialId", family: "back", thicknessParameter: "backThickness", aliases: ["back"] }
          ],
          componentSync: [
            {
              targetSlot: "handle",
              targetParameter: "handleComponentId",
              source: "ctx.handleComponentId",
              componentType: "handle",
              transforms: ["handleGeometryKind", "componentNominalLength"]
            }
          ],
          commercialSelectionSync: [{ source: "materialSnapshot" }],
          overridePolicy: {
            allowUserOverride: false,
            warnWhenDetachedFromContext: true
          }
        }
      ]
    },
    bom: {
      rules: []
    },
    pricing: {
      pricingRefs: definition.catalogKeys,
      quoteGroup: "PINO/Nobilia VKH review staging",
      marginCategory: "review_staging"
    },
    ui: {
      icon: "pino-side-cabinet-icon.png",
      previewImage: "pino-side-cabinet-page-243.png",
      groups: [
        { id: "general", label: "General", order: 5 },
        { id: "catalog", label: "Catalog", order: 10 },
        { id: "dimensions", label: "Dimensions", order: 20 },
        { id: "construction", label: "Construction", order: 30 },
        { id: "fronts", label: "Fronts", order: 40 },
        { id: "materials", label: "Materials", order: 50 },
        { id: "components", label: "Components", order: 55 },
        { id: "state", label: "State", order: 60 }
      ],
      controls: [
        { parameterKey: "groupId", controlType: "select", groupId: "catalog", order: 5 },
        { parameterKey: "definitionId", controlType: "select", groupId: "catalog", order: 10 },
        { parameterKey: "priceGroup", controlType: "select", groupId: "catalog", order: 15 },
        { parameterKey: "width", controlType: "number", groupId: "dimensions", order: 20 },
        { parameterKey: "height", controlType: "number", groupId: "dimensions", order: 30 },
        { parameterKey: "depth", controlType: "number", groupId: "dimensions", order: 40 },
        { parameterKey: "boardThickness", controlType: "number", groupId: "construction", order: 50 },
        { parameterKey: "frontThicknessMm", controlType: "number", groupId: "fronts", order: 60 },
        { parameterKey: "bodyMaterialId", controlType: "materialPicker", groupId: "materials", order: 70 },
        { parameterKey: "frontMaterialId", controlType: "materialPicker", groupId: "materials", order: 80 },
        { parameterKey: "handleComponentId", controlType: "componentPicker", groupId: "components", order: 90 },
        { parameterKey: "opened", controlType: "checkbox", groupId: "state", order: 100 }
      ]
    },
    exports: {
      exportTags: ["pino", "nobilia", "vkh-2026", "side-cabinet", "review-staging"],
      manufacturingCode: "PINO_SIDE_CABINET_REVIEW",
      notes: [
        "Data-driven PINO/Nobilia side-cabinet tenant package.",
        "Grouped product selection and placement are resolved by runtime logic.",
        "Do not use as production import until catalog data is reviewed."
      ]
    },
    manufacturing: {
      notes: ["Review prototype package; manufacturing rules are not final."]
    },
    assets: {
      files: []
    },
    compatibility: {
      requiredRuntimeBuilderKeys: ["pinoSideCabinet.v1"],
      requiredCatalogFeatures: ["vendorCatalog"]
    },
    integrity: {
      createdAt: now,
      updatedAt: now,
      author: "Arcigy PINO/Nobilia seed"
    }
  };
}
