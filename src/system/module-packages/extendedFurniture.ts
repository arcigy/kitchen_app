import type {
  FurnQuoteModulePackage,
  ModuleComponentSlot,
  ModuleMaterialSlot,
  ModuleParameterDefinition,
  ModulePlacementRules,
  ModuleUiDefinition
} from "../../core/module-package/module-package-types";
import {
  FWM_FURNITURE_SPECS,
  getFwmAssemblyContext,
  getFwmRoomCategory,
  getFwmRuntimeBuilderKey,
  getFwmSystemFamily,
  type FwmFurnitureSpec
} from "../../modules/fwmFurniture/definitions";
import { FWM_DRAWER_SYSTEM_BRAND_OPTIONS } from "../../modules/fwmFurniture/drawerSystemPresets";
import { getFwmModulePreviewImage } from "../../modules/fwmFurniture/modulePreviewImages";
import { createModuleInternalEditingDefinition } from "../../layout/moduleInternalEditing";

const now = "2026-06-09T00:00:00.000Z";
const BASE_CORNER_NOTES = "Parametric lower catalog corner cabinet. The variant selects blind 1D, 90-degree or chamfered geometry. Depth controls both corner legs, plinthHeight stays independent from height, plinthSetbackMm moves the plinth zone, and chamfer controls are used only by chamfered variants.";
const BASE_BOTTLE_PULLOUT_PACKAGE_ID = "base_bottle_pullout";
const BASE_BOTTLE_PULLOUT_RUNTIME_TYPE = "base_bottle_pullout";
const BASE_BOTTLE_PULLOUT_DISPLAY_NAME = "Spodni flasovy vysuv";
const BASE_BOTTLE_PULLOUT_DESCRIPTION = "Narrow lower kitchen pull-out for bottles, oils and spices. It has one full-height front connected to two internal drawer trays, uses the shared drawer system hardware, binds to the kitchen worktop context, and never owns its own worktop.";

type UiVisibility = NonNullable<ModuleParameterDefinition["uiVisibility"]>;

const MODULE_PRESET_FREE_PARAMETER_KEYS = [
  "width",
  "height",
  "depth",
  "plinthHeight",
  "plinthSetbackMm",
  "bodyMaterialId",
  "frontMaterialId",
  "backMaterialId",
  "shelfMaterialId",
  "drawerBottomMaterialId",
  "plinthMaterialId",
  "worktopMaterialId",
  "boardThickness",
  "frontThicknessMm",
  "backThickness",
  "shelfThickness",
  "drawerBackGapMm",
  "materialAssignments",
  "commercialSelections"
];

const WALL_OPEN_END_USER_PARAMETER_KEYS = new Set([
  "width",
  "height",
  "depth",
  "side",
  "endingShape",
  "shelfCount",
  "cornerRadiusMm",
  "chamferMm",
  "boardThickness",
  "bodyMaterialId"
]);

const WALL_OPEN_END_OWNED_PARAMETER_KEYS = new Set([
  ...WALL_OPEN_END_USER_PARAMETER_KEYS,
  "type",
  "rowHeight",
  "heightCarcass",
  "variant",
  "catalogCode",
  "notes",
  "tags",
  "createdAt",
  "updatedAt",
  "endingSide",
  "shape",
  "bodyMaterialGroup"
]);

const WALL_OPEN_END_PARAMETER_GROUPS = new Set(["system", "ifc", "orientation", "placement", "pricing", "state"]);

const WALL_OPEN_END_FORBIDDEN_PARAMETER_KEYS = new Set([
  "drawerCount",
  "doorCount",
  "hasPlinth",
  "hasWorktop",
  "frontChamferMm",
  "backChamferMm",
  "cutoutWidthMm",
  "cutoutDepthMm",
  "powerW",
  "opened",
  "drawerSystemPricePerSet",
  "drawerSystemPriceWithMargin"
]);

const WALL_OPEN_END_FREE_PARAMETER_KEYS = [
  "width",
  "height",
  "depth",
  "bodyMaterialId",
  "boardThickness"
];

const WALL_CORNER_90_PACKAGE_ID = "wall_corner_90";
const WALL_CORNER_90_RUNTIME_TYPE = "fwm_catalog_wall_cabinet";
const WALL_CORNER_90_USER_PARAMETER_KEYS = new Set([
  "width",
  "height",
  "depth",
  "shelfCount",
  "opened",
  "bodyMaterialId",
  "frontMaterialId",
  "backMaterialId",
  "handleComponentId",
  "hingeComponentId",
  "boardThickness",
  "frontThicknessMm",
  "backThickness",
  "shelfThickness"
]);

const WALL_CORNER_90_OWNED_PARAMETER_KEYS = new Set([
  ...WALL_CORNER_90_USER_PARAMETER_KEYS,
  "typeId",
  "type",
  "displayName",
  "family",
  "code",
  "version",
  "widthMm",
  "heightMm",
  "depthMm",
  "rowHeight",
  "heightCarcass",
  "variant",
  "catalogCode",
  "side",
  "cornerShape",
  "frontType",
  "openingMode",
  "mountingMode",
  "doorCount",
  "shelfGaps",
  "frontGap",
  "sideGap",
  "handleType",
  "wallMounted",
  "glassFronts",
  "assemblyContext",
  "roomCategory",
  "kitchenModuleRole",
  "isCorner",
  "frontFaceCount",
  "backFaceCount",
  "requiresWorktop",
  "hasWorktop",
  "hasPlinth",
  "frontSide",
  "backSide",
  "leftSide",
  "rightSide",
  "frontDirection",
  "backDirection",
  "leftDirection",
  "rightDirection",
  "worktopBackSide",
  "positionXmm",
  "positionYmm",
  "positionZmm",
  "rotationZDeg",
  "customPriceOverride",
  "pricingEnabled",
  "priceSource",
  "costOverride",
  "quantity",
  "isActive",
  "isVisible",
  "isLocked",
  "isValid",
  "validationErrors",
  "notes",
  "tags",
  "createdAt",
  "updatedAt",
  "exportToIfc",
  "ifcClass",
  "ifcPredefinedType",
  "ifcName",
  "ifcDescription",
  "ifcObjectType",
  "ifcTag",
  "classificationCode",
  "classificationSystem",
  "bodyMaterialGroup",
  "frontMaterialGroup",
  "backMaterialGroup",
  "shelfMaterialGroup",
  "shelfMaterialId",
  "worktopMaterialGroup",
  "drawerBoxMaterialGroup",
  "materialAssignments",
  "componentAssignments",
  "commercialSelections"
]);

const BASE_BOTTLE_PULLOUT_USER_PARAMETER_KEYS = new Set([
  "width",
  "height",
  "depth",
  "plinthHeight",
  "plinthSetbackMm",
  "opened",
  "drawerSystemBrand",
  "drawer1SystemSize",
  "drawer2SystemSize",
  "bodyMaterialId",
  "frontMaterialId",
  "backMaterialId",
  "drawerBottomMaterialId",
  "plinthMaterialId",
  "boardThickness",
  "frontThicknessMm",
  "backThickness"
]);

const BASE_BOTTLE_PULLOUT_OWNED_PARAMETER_KEYS = new Set([
  ...BASE_BOTTLE_PULLOUT_USER_PARAMETER_KEYS,
  "typeId",
  "type",
  "displayName",
  "family",
  "code",
  "version",
  "widthMm",
  "heightMm",
  "depthMm",
  "rowHeight",
  "heightCarcass",
  "variant",
  "catalogCode",
  "assemblyContext",
  "roomCategory",
  "kitchenModuleRole",
  "isCorner",
  "frontFaceCount",
  "backFaceCount",
  "requiresWorktop",
  "hasWorktop",
  "hasPlinth",
  "frontSide",
  "backSide",
  "leftSide",
  "rightSide",
  "frontDirection",
  "backDirection",
  "leftDirection",
  "rightDirection",
  "worktopBackSide",
  "kitchenEndClosureLeft",
  "kitchenEndClosureRight",
  "kitchenEndClosureBackGapMm",
  "positionXmm",
  "positionYmm",
  "positionZmm",
  "rotationZDeg",
  "customPriceOverride",
  "pricingEnabled",
  "priceSource",
  "costOverride",
  "quantity",
  "isActive",
  "isVisible",
  "isLocked",
  "isValid",
  "validationErrors",
  "notes",
  "tags",
  "createdAt",
  "updatedAt",
  "exportToIfc",
  "ifcClass",
  "ifcPredefinedType",
  "ifcName",
  "ifcDescription",
  "ifcObjectType",
  "ifcTag",
  "classificationCode",
  "classificationSystem",
  "bodyMaterialGroup",
  "frontMaterialGroup",
  "backMaterialGroup",
  "shelfMaterialGroup",
  "worktopMaterialGroup",
  "drawerBoxMaterialGroup",
  "openingMode",
  "drawerCount",
  "drawerSystem",
  "drawerSystemSize",
  "drawerSystemSizes",
  "drawerSystemLabels",
  "drawerSystemMinFrontHeightsMm",
  "drawerSystemDepthMm",
  "drawerBottomDepthDeductionMm",
  "drawerBottomWidthDeductionMm",
  "drawerBackWidthDeductionMm",
  "drawerBackHeightDeductionMm",
  "drawerSystemBackHeightsMm",
  "drawerSystemPricePerSet",
  "drawerSystemPriceWithMargin",
  "drawerSystemCodeLabel",
  "drawerFrontHeightsMm",
  "drawer1FrontHeightMm",
  "drawer2FrontHeightMm",
  "drawer1SystemLabel",
  "drawer2SystemLabel",
  "drawer1SystemMinFrontHeightMm",
  "drawer2SystemMinFrontHeightMm",
  "drawer1SystemBackHeightMm",
  "drawer2SystemBackHeightMm",
  "handleType",
  "handleLengthMm",
  "handleProjectionMm",
  "handleSizeMm",
  "frontGap",
  "sideGap",
  "drawerBackGapMm",
  "worktopThicknessMm",
  "handleComponentId",
  "runnerComponentId",
  "legComponentId",
  "clipComponentId",
  "materialAssignments",
  "componentAssignments",
  "commercialSelections"
]);

const BASE_BOTTLE_PULLOUT_UI_CONTROL_KEYS = [
  "width",
  "height",
  "depth",
  "plinthHeight",
  "plinthSetbackMm",
  "opened",
  "drawerSystemBrand",
  "drawer1SystemSize",
  "drawer2SystemSize",
  "bodyMaterialId",
  "frontMaterialId",
  "backMaterialId",
  "drawerBottomMaterialId",
  "plinthMaterialId",
  "boardThickness",
  "frontThicknessMm",
  "backThickness"
];

const TALL_STACK_SLOT_DEFAULTS: Array<{ type: "empty" | "drawer" | "shelf" | "oven" | "sink" | "microwave" | "door"; height: number }> = [];

function requiresExternalKitchenWorktop(spec: FwmFurnitureSpec) {
  return spec.geometryKind !== "worktop" && (spec.hasWorktop === true || spec.moduleType === "fwm_catalog_base_corner");
}

const INTERNAL_PARAMETER_KEYS = new Set([
  "catalogCode",
  "componentAssignments",
  "cornerRadiusMm",
  "cutoutDepthMm",
  "cutoutWidthMm",
  "doorCount",
  "drawerCount",
  "handleLengthMm",
  "handleProjectionMm",
  "handleSizeMm",
  "hasWorktop",
  "quantity",
  "reserveModule",
  "rowHeight",
  "runnerComponentId",
  "shape",
  "updatedAt",
  "validationErrors",
  "variant",
  "worktopMaterialId",
  "powerW"
]);

const TECHNICAL_PARAMETER_KEYS = new Set([
  "applianceKind",
  "applianceWidthMm",
  "assemblyContext",
  "backFaceCount",
  "code",
  "cornerShape",
  "createdAt",
  "cutleryInsertDepthDeductionMm",
  "cutleryInsertWidthDeductionMm",
  "cutleryInnerDrawerAllowed",
  "cutleryInnerDrawerCrossRailWidthMm",
  "cutleryInnerDrawerDepthMm",
  "cutleryInnerDrawerFrontWidthMm",
  "cutleryInnerDrawerStatus",
  "cutleryInnerDrawerTargetIndex",
  "cutleryInnerDrawerWidthMm",
  "drawerBackHeightDeductionMm",
  "drawerBackWidthDeductionMm",
  "drawerBottomDepthDeductionMm",
  "drawerBottomWidthDeductionMm",
  "drawerSystem",
  "drawerSystemBackHeightsMm",
  "drawerSystemCodeLabel",
  "drawerSystemDepthMm",
  "drawerFrontHeightsMm",
  "drawerSystemLabels",
  "drawerSystemMinFrontHeightsMm",
  "drawerSystemPricePerSet",
  "drawerSystemPriceWithMargin",
  "drawerSystemSize",
  "drawerSystemSizes",
  "endingSide",
  "heightCarcass",
  "frontFaceCount",
  "frontChamferReferenceMm",
  "innerDrawerCrossRailDeductionMm",
  "innerDrawerFrontDeductionMm",
  "isCorner",
  "kitchenModuleRole",
  "notes",
  "openingMode",
  "requiresWorktop",
  "roomCategory",
  "typeId",
  "version"
]);

const INTERNAL_PARAMETER_GROUPS = new Set(["state"]);
const TECHNICAL_PARAMETER_GROUPS = new Set(["ifc", "orientation", "placement"]);

function isIndexedDrawerFrontHeightParameter(key: string) {
  return /^drawer[1-5]FrontHeightMm$/.test(key);
}

function isIndexedDrawerSystemParameter(key: string) {
  return /^drawer[1-5]System(Size|Label|MinFrontHeightMm|BackHeightMm)$/.test(key);
}

function isIndexedDrawerSystemSizeParameter(key: string) {
  return /^drawer[1-5]SystemSize$/.test(key);
}

function withUiVisibility(parameter: ModuleParameterDefinition, uiVisibility: UiVisibility): ModuleParameterDefinition {
  return { ...parameter, uiVisibility };
}

function isDrawerOnlyParameter(key: string) {
  const normalizedKey = key.toLowerCase();
  return normalizedKey.includes("drawer") || normalizedKey.includes("cutlery") || key === "runnerComponentId";
}

function isSinkOnlyParameter(key: string) {
  return key === "sinkBowlWidthMm" || key === "sinkBowlDepthMm";
}

const TALL_HOST_USER_PARAMETER_KEYS = new Set([
  "width",
  "height",
  "depth",
  "plinthHeight",
  "plinthSetbackMm",
  "bodyMaterialId",
  "frontMaterialId",
  "backMaterialId",
  "shelfMaterialId",
  "drawerBottomMaterialId",
  "plinthMaterialId",
  "handleComponentId",
  "hingeComponentId",
  "legComponentId",
  "clipComponentId",
  "drawerSystemBrand",
  "handleType",
  "hasCutleryInnerDrawer",
  "boardThickness",
  "frontThicknessMm",
  "backThickness",
  "shelfThickness",
  "frontGap",
  "sideGap",
  "opened",
  "tallStackMode",
  "tallSlotCount",
  "tallDoorOpeningMode"
]);

const TOP_MODULE_INTERNAL_PARAMETER_KEYS = new Set([
  "hasPlinth",
  "plinthHeight",
  "plinthSetbackMm",
  "plinthMaterialId",
  "legComponentId",
  "clipComponentId",
  "hasWorktop",
  "worktopThicknessMm",
  "worktopMaterialId"
]);

function isTallSlotParameter(key: string) {
  return /^tallSlot\d+(Type|HeightMm|OffsetMm|DrawerSystemSize)$/.test(key);
}

function parameterUiVisibility(spec: FwmFurnitureSpec, parameter: ModuleParameterDefinition): UiVisibility {
  if (INTERNAL_PARAMETER_GROUPS.has(parameter.group ?? "")) return "internal";
  if (TECHNICAL_PARAMETER_GROUPS.has(parameter.group ?? "")) return "technical";
  if (spec.moduleType === "fwm_catalog_base_doors" && parameter.key === "doorCount") return "user";
  if (spec.moduleType === "fwm_catalog_base_doors" && parameter.key === "side") return "user";
  if (spec.moduleType === "fwm_catalog_base_drawers" && parameter.key === "drawerCount") return "user";
  if (spec.moduleType === "fwm_catalog_base_drawers" && parameter.key === "drawerSystemBrand") return "user";
  if (spec.moduleType === "fwm_catalog_base_drawers" && parameter.key === "hasCutleryInnerDrawer") return "user";
  if (spec.moduleType === "fwm_catalog_base_drawers" && isIndexedDrawerFrontHeightParameter(parameter.key)) return "user";
  if (spec.moduleType === "fwm_catalog_base_drawers" && isIndexedDrawerSystemSizeParameter(parameter.key)) return "user";
  if (spec.moduleType === "fwm_catalog_base_drawers" && isIndexedDrawerSystemParameter(parameter.key)) return "technical";
  if (spec.moduleType === BASE_BOTTLE_PULLOUT_RUNTIME_TYPE) {
    if (BASE_BOTTLE_PULLOUT_USER_PARAMETER_KEYS.has(parameter.key)) return "user";
    return "internal";
  }
  if (spec.kitchenRole === "top" && TOP_MODULE_INTERNAL_PARAMETER_KEYS.has(parameter.key)) return "internal";
  if (spec.moduleType === "fwm_catalog_wall_open_end") {
    if (WALL_OPEN_END_USER_PARAMETER_KEYS.has(parameter.key)) return "user";
    if (["variant", "endingSide", "shape", "requiresWorktop", "hasWorktop", "hasPlinth", "mountingMode", "wallMounted"].includes(parameter.key)) return "technical";
    return "internal";
  }
  if (spec.geometryKind === "open_end") {
    if (["width", "height", "depth", "plinthHeight", "plinthSetbackMm", "shelfCount", "shelfGaps", "shape", "endingSide", "cornerRadiusMm", "chamferMm", "boardThickness", "backThickness", "shelfThickness", "bodyMaterialId", "backMaterialId", "shelfMaterialId", "plinthMaterialId", "legComponentId", "clipComponentId"].includes(parameter.key)) return "user";
    if (["variant", "cornerShape"].includes(parameter.key)) return "technical";
  }
  if (spec.moduleType === "fwm_catalog_tall_cabinet") {
    if (isTallSlotParameter(parameter.key) || TALL_HOST_USER_PARAMETER_KEYS.has(parameter.key)) return "user";
    if (isIndexedDrawerSystemParameter(parameter.key)) return "technical";
    return "internal";
  }
  if (INTERNAL_PARAMETER_KEYS.has(parameter.key)) return "internal";
  if (isDrawerOnlyParameter(parameter.key) && (spec.drawers ?? 0) <= 0) return "internal";
  if (isSinkOnlyParameter(parameter.key) && spec.geometryKind !== "sink" && spec.geometryKind !== "bathroom") return "internal";
  if (TECHNICAL_PARAMETER_KEYS.has(parameter.key)) return "technical";
  if (parameter.key === "family" || parameter.key === "widthMm" || parameter.key === "heightMm" || parameter.key === "depthMm") return "internal";
  if (spec.moduleType === "fwm_catalog_base_corner" && parameter.key === "width") return "internal";
  if ((parameter.key === "handleComponentId" || parameter.key === "hingeComponentId") && (spec.doors ?? 0) <= 0 && (spec.drawers ?? 0) <= 0) return "internal";
  if (parameter.key === "frontMaterialId" && (spec.doors ?? 0) <= 0 && (spec.drawers ?? 0) <= 0 && spec.geometryKind !== "front_component") return "internal";
  return "user";
}

function applyParameterSurfacePolicy(spec: FwmFurnitureSpec, parameters: ModuleParameterDefinition[]) {
  return parameters.map((parameter) => {
    const next = { ...parameter };
    if (spec.moduleType === "fwm_catalog_base_corner") {
      if (next.key === "displayName") next.defaultValue = "Spodna rohova skrinka";
      if (next.key === "notes") next.defaultValue = BASE_CORNER_NOTES;
      if (next.key === "requiresWorktop") next.defaultValue = true;
      if (next.key === "side") {
        next.defaultValue = "left";
        next.options = [
          { label: "left", value: "left" },
          { label: "right", value: "right" }
        ];
      }
      if (next.key === "cornerShape") {
        next.defaultValue = "blind";
        next.options = [
          { label: "blind", value: "blind" },
          { label: "l shape", value: "l_shape" },
          { label: "chamfered", value: "chamfered" }
        ];
      }
    }
    if (spec.moduleType === "fwm_catalog_base_doors") {
      if (next.key === "doorCount") {
        next.defaultValue = 1;
        next.min = 1;
        next.max = 2;
      }
      if (next.key === "side") {
        next.defaultValue = "left";
        next.options = [
          { label: "left", value: "left" },
          { label: "right", value: "right" }
        ];
      }
      if (next.key === "shelfCount") next.defaultValue = 1;
      if (next.key === "depth") next.defaultValue = 530;
      if (next.key === "height") next.defaultValue = 722;
    }
    if (spec.moduleType === "fwm_catalog_base_drawers") {
      if (next.key === "drawerCount") {
        next.defaultValue = 3;
        next.min = 1;
        next.max = 5;
      }
      if (next.key === "drawerSystem") next.defaultValue = "merivobox";
      if (next.key === "drawerSystemBrand") {
        next.defaultValue = "merivobox";
        next.options = FWM_DRAWER_SYSTEM_BRAND_OPTIONS.map((option) => ({ label: option.label, value: option.value }));
      }
      if (next.key === "drawerSystemSize") {
        next.defaultValue = "M";
        next.options = [
          { label: "M - derived low drawer", value: "M" },
          { label: "D - derived high drawer", value: "D" },
          { label: "E - derived MERIVOBOX high", value: "E" },
          { label: "F - derived LEGRABOX high", value: "F" }
        ];
      }
      if (isIndexedDrawerSystemSizeParameter(next.key)) {
        next.defaultValue = "";
        next.options = [
          { label: "Auto", value: "" },
          { label: "M", value: "M" },
          { label: "D", value: "D" },
          { label: "E", value: "E" },
          { label: "F", value: "F" }
        ];
      }
      if (next.key === "drawerFrontHeightsMm") next.defaultValue = "";
      if (next.key === "depth") next.defaultValue = 530;
      if (next.key === "height") next.defaultValue = 722;
    }
    if (spec.moduleType === BASE_BOTTLE_PULLOUT_RUNTIME_TYPE) {
      if (next.key === "displayName" || next.key === "ifcName") next.defaultValue = BASE_BOTTLE_PULLOUT_DISPLAY_NAME;
      if (next.key === "notes") next.defaultValue = BASE_BOTTLE_PULLOUT_DESCRIPTION;
      if (next.key === "ifcDescription") next.defaultValue = BASE_BOTTLE_PULLOUT_DESCRIPTION;
      if (next.key === "width" || next.key === "widthMm") {
        next.defaultValue = 200;
        next.min = 150;
        next.max = 300;
        next.step = 10;
      }
      if (next.key === "height" || next.key === "heightMm" || next.key === "rowHeight" || next.key === "heightCarcass") next.defaultValue = 722;
      if (next.key === "depth" || next.key === "depthMm") next.defaultValue = 530;
      if (next.key === "variant") {
        next.defaultValue = "two_tier_single_front";
        next.options = [{ label: "two tier single front", value: "two_tier_single_front" }];
      }
      if (next.key === "drawerCount") {
        next.defaultValue = 2;
        next.min = 2;
        next.max = 2;
      }
      if (next.key === "doorCount" || next.key === "shelfCount") next.defaultValue = 0;
      if (next.key === "openingMode") next.defaultValue = "drawer";
      if (next.key === "drawerSystem" || next.key === "drawerSystemBrand") {
        next.defaultValue = "merivobox";
        if (next.key === "drawerSystemBrand") {
          next.options = FWM_DRAWER_SYSTEM_BRAND_OPTIONS.map((option) => ({ label: option.label, value: option.value }));
        }
      }
      if (next.key === "drawerSystemSize") next.defaultValue = "M";
      if (next.key === "drawerSystemSizes") next.defaultValue = "M,M";
      if (next.key === "drawerSystemLabels") next.defaultValue = "MERIVOBOX M,MERIVOBOX M";
      if (next.key === "drawerSystemMinFrontHeightsMm") next.defaultValue = "136,136";
      if (next.key === "drawerSystemBackHeightsMm") next.defaultValue = "83,83";
      if (next.key === "drawerFrontHeightsMm") next.defaultValue = "";
      if (next.key === "drawer1SystemSize" || next.key === "drawer2SystemSize") {
        next.defaultValue = "M";
        next.options = [
          { label: "Auto", value: "" },
          { label: "M", value: "M" },
          { label: "D", value: "D" },
          { label: "E", value: "E" },
          { label: "F", value: "F" }
        ];
      }
      if (next.key === "hasCutleryInnerDrawer") next.defaultValue = false;
      if (next.key === "handleType") next.defaultValue = "bar";
      if (next.key === "handleLengthMm") next.defaultValue = 120;
      if (next.key === "requiresWorktop") next.defaultValue = true;
      if (next.key === "hasWorktop") next.defaultValue = false;
      if (next.key === "hasPlinth") next.defaultValue = true;
      if (next.key === "bodyMaterialGroup" || next.key === "shelfMaterialGroup") next.defaultValue = "corpus";
      if (next.key === "frontMaterialGroup") next.defaultValue = "front";
      if (next.key === "backMaterialGroup") next.defaultValue = "back";
      if (next.key === "worktopMaterialGroup") next.defaultValue = "";
      if (next.key === "drawerBoxMaterialGroup") next.defaultValue = "drawer_bottom";
    }
    if (spec.moduleType === "fwm_catalog_wall_open_end") {
      if (next.key === "displayName") next.defaultValue = "Horny koncovy otvoreny modul";
      if (next.key === "notes") next.defaultValue = "Horny otvoreny koncovy modul pre horne skrinky. Ma dve zvisle corpus dosky do L a zrezane horizontalne police; nema pracovnu dosku, sokel, dvierka ani zasuvky.";
      if (next.key === "variant") next.defaultValue = "chamfered_end";
      if (next.key === "height") next.defaultValue = 300;
      if (next.key === "depth") next.defaultValue = 330;
      if (next.key === "doorCount" || next.key === "drawerCount" || next.key === "plinthHeight" || next.key === "plinthSetbackMm") next.defaultValue = 0;
      if (next.key === "requiresWorktop" || next.key === "hasWorktop" || next.key === "hasPlinth") next.defaultValue = false;
      if (next.key === "openingMode") next.defaultValue = "open";
      if (next.key === "side" || next.key === "endingSide") {
        next.defaultValue = "right";
        next.options = [
          { label: "left", value: "left" },
          { label: "right", value: "right" }
        ];
      }
      if (next.key === "endingShape") {
        next.defaultValue = "chamfered";
        next.options = [
          { label: "Skoseny", value: "chamfered" },
          { label: "Obly", value: "rounded" }
        ];
      }
      if (next.key === "shape") next.defaultValue = "chamfered";
      if (next.key === "cornerRadiusMm") next.defaultValue = 120;
      if (next.key === "chamferMm") next.defaultValue = 120;
      if (next.key === "shelfCount") next.defaultValue = 2;
    }
    if (spec.geometryKind === "open_end") {
      if (next.key === "displayName") next.defaultValue = spec.displayName;
      if (next.key === "notes") next.defaultValue = "Open shelf/niche cabinet. Shape controls whether the ending side is straight, rounded or chamfered; shelfCount creates real shelves; width, height and depth remain normal free dimensions.";
      if (next.key === "requiresWorktop") next.defaultValue = spec.hasWorktop === true;
      if (next.key === "doorCount" || next.key === "drawerCount") next.defaultValue = 0;
      if (next.key === "shape") {
        next.defaultValue = "straight";
        next.options = [
          { label: "straight", value: "straight" },
          { label: "rounded", value: "rounded" },
          { label: "chamfered", value: "chamfered" }
        ];
      }
      if (next.key === "endingSide") {
        next.defaultValue = "none";
        next.options = [
          { label: "none", value: "none" },
          { label: "left", value: "left" },
          { label: "right", value: "right" }
        ];
      }
      if (next.key === "cornerShape") next.defaultValue = "none";
      if (next.key === "cornerRadiusMm") next.defaultValue = 120;
      if (next.key === "chamferMm") next.defaultValue = 120;
    }
    if (spec.moduleType === "fwm_catalog_tall_cabinet") {
      if (next.key === "displayName") next.defaultValue = "Custom tall module";
      if (next.key === "notes") next.defaultValue = "Empty tall host cabinet with only the corpus shell. Users enter the module editor and insert submodules such as drawers, shelves, appliances and doors into ordered slots.";
      if (next.key === "variant") next.defaultValue = "custom_tall_builder";
      if (next.key === "width") next.defaultValue = 600;
      if (next.key === "height") next.defaultValue = 2080;
      if (next.key === "depth") next.defaultValue = 560;
      if (next.key === "drawerCount") next.defaultValue = 0;
      if (next.key === "doorCount") next.defaultValue = 0;
      if (next.key === "shelfCount") next.defaultValue = 0;
      if (next.key === "applianceKind") next.defaultValue = "none";
      if (next.key === "applianceWidthMm") next.defaultValue = 0;
    }
    return withUiVisibility(next, parameterUiVisibility(spec, next));
  });
}

function filterModuleSpecificParameters(spec: FwmFurnitureSpec, parameters: ModuleParameterDefinition[]) {
  if (spec.moduleType === BASE_BOTTLE_PULLOUT_RUNTIME_TYPE) {
    return parameters.filter((parameter) => BASE_BOTTLE_PULLOUT_OWNED_PARAMETER_KEYS.has(parameter.key));
  }
  if (spec.moduleType !== "fwm_catalog_wall_open_end") return parameters;
  return parameters.filter((parameter) =>
    !WALL_OPEN_END_FORBIDDEN_PARAMETER_KEYS.has(parameter.key) &&
    (WALL_OPEN_END_OWNED_PARAMETER_KEYS.has(parameter.key) ||
      WALL_OPEN_END_PARAMETER_GROUPS.has(parameter.group ?? ""))
  );
}

function numberParam(
  key: string,
  label: string,
  defaultValue: number,
  min: number,
  max: number,
  group: string,
  affects: ModuleParameterDefinition["affects"] = "geometry",
  step = 1
): ModuleParameterDefinition {
  return {
    key,
    label,
    type: "number",
    required: true,
    defaultValue,
    min,
    max,
    step,
    unit: key.endsWith("Count") ? "pcs" : "mm",
    group,
    affects
  };
}

function stringParam(
  key: string,
  label: string,
  defaultValue: unknown,
  group: string,
  affects: ModuleParameterDefinition["affects"] = "export",
  required = true
): ModuleParameterDefinition {
  return {
    key,
    label,
    type: "string",
    required,
    defaultValue,
    group,
    affects
  };
}

function booleanParam(
  key: string,
  label: string,
  defaultValue: boolean,
  group: string,
  affects: ModuleParameterDefinition["affects"] = "export"
): ModuleParameterDefinition {
  return {
    key,
    label,
    type: "boolean",
    required: true,
    defaultValue,
    group,
    affects
  };
}

function selectParam(
  key: string,
  label: string,
  defaultValue: unknown,
  options: string[],
  group: string,
  affects: ModuleParameterDefinition["affects"] = "export",
  required = true
): ModuleParameterDefinition {
  return {
    key,
    label,
    type: "select",
    required,
    defaultValue,
    options: options.map((value) => ({ label: value.replaceAll("_", " "), value })),
    group,
    affects
  };
}

function systemParameters(spec: FwmFurnitureSpec): ModuleParameterDefinition[] {
  const typeId = `${spec.moduleType}__type`;
  const assemblyContext = getFwmAssemblyContext(spec);
  const family = getFwmSystemFamily(spec);
  const minHeight = ["worktop", "shelf_surface", "trim", "front_component", "accessory"].includes(spec.geometryKind) ? 1 : 50;
  return [
    stringParam("typeId", "Type ID", typeId, "system"),
    stringParam("displayName", "Display name", spec.displayName, "system"),
    stringParam("family", "System family", family, "system"),
    stringParam("code", "Code", null, "system"),
    stringParam("version", "Version", "1.0.0", "system"),
    numberParam("widthMm", "System width", spec.width, 100, 5000, "system", "export", 1),
    numberParam("heightMm", "System height", spec.height, minHeight, 3200, "system", "export", 1),
    numberParam("depthMm", "System depth", spec.depth, 10, 2600, "system", "export", 1),
    selectParam("assemblyContext", "Assembly context", assemblyContext, ["kitchen", "generic", "wardrobe", "bathroom", "laundry"], "system", "placement"),
    selectParam("roomCategory", "Room category", getFwmRoomCategory(spec), ["kitchen", "living", "bedroom", "bathroom", "wardrobe", "office", "reception", "interior_cladding", "room"], "system", "placement"),
    selectParam("kitchenModuleRole", "Kitchen module role", spec.kitchenRole ?? null, ["low", "top", "tall"], "system", "placement", assemblyContext === "kitchen"),
    booleanParam("isCorner", "Is corner module", spec.geometryKind === "corner", "system", "placement"),
    numberParam("frontFaceCount", "Front face count", spec.geometryKind === "corner" ? 0 : 1, 0, 8, "system", "placement", 1),
    numberParam("backFaceCount", "Back face count", spec.geometryKind === "corner" ? 2 : 1, 0, 8, "system", "placement", 1),
    booleanParam("requiresWorktop", "Requires worktop", requiresExternalKitchenWorktop(spec), "system", "placement"),
    booleanParam("hasWorktop", "Has worktop", spec.geometryKind === "worktop", "system", "geometry"),
    booleanParam("hasPlinth", "Has plinth", spec.hasPlinth === true, "system", "geometry"),
    selectParam("frontSide", "Front side", "FRONT", ["FRONT"], "orientation", "placement"),
    selectParam("backSide", "Back side", "BACK", ["BACK"], "orientation", "placement"),
    selectParam("leftSide", "Left side", "LEFT", ["LEFT"], "orientation", "placement"),
    selectParam("rightSide", "Right side", "RIGHT", ["RIGHT"], "orientation", "placement"),
    selectParam("frontDirection", "Front direction", "+Z", ["+Z"], "orientation", "placement"),
    selectParam("backDirection", "Back direction", "-Z", ["-Z"], "orientation", "placement"),
    selectParam("leftDirection", "Left direction", "-X", ["-X"], "orientation", "placement"),
    selectParam("rightDirection", "Right direction", "+X", ["+X"], "orientation", "placement"),
    selectParam("worktopBackSide", "Worktop back side", "BACK", ["BACK"], "orientation", "placement"),
    booleanParam("kitchenEndClosureLeft", "Automatic left kitchen end", false, "placement", "geometry"),
    booleanParam("kitchenEndClosureRight", "Automatic right kitchen end", false, "placement", "geometry"),
    numberParam("kitchenEndClosureBackGapMm", "Kitchen end back gap", 0, 0, 1200, "placement", "geometry", 1),
    numberParam("positionXmm", "Position X", 0, -100000, 100000, "placement", "placement", 1),
    numberParam("positionYmm", "Position Y", 0, -100000, 100000, "placement", "placement", 1),
    numberParam("positionZmm", "Position Z", 0, -100000, 100000, "placement", "placement", 1),
    numberParam("rotationZDeg", "Rotation Z", 0, -360, 360, "placement", "placement", 1),
    stringParam("customPriceOverride", "Custom price override", null, "pricing", "pricing"),
    booleanParam("pricingEnabled", "Pricing enabled", true, "pricing", "pricing"),
    selectParam("priceSource", "Price source", "calculated", ["calculated", "override", "manual", "catalog"], "pricing", "pricing"),
    stringParam("costOverride", "Cost override", null, "pricing", "pricing"),
    numberParam("quantity", "Quantity", 1, 1, 999, "pricing", "pricing", 1),
    booleanParam("isActive", "Active", true, "state"),
    booleanParam("isVisible", "Visible", true, "state"),
    booleanParam("isLocked", "Locked", false, "state"),
    booleanParam("isValid", "Valid", true, "state"),
    stringParam("validationErrors", "Validation errors", [], "state"),
    stringParam("notes", "Notes", null, "metadata"),
    stringParam("tags", "Tags", [...spec.tags], "metadata"),
    stringParam("createdAt", "Created at", now, "metadata"),
    stringParam("updatedAt", "Updated at", now, "metadata"),
    booleanParam("exportToIfc", "Export to IFC", true, "ifc"),
    stringParam("ifcClass", "IFC class", "IfcFurniture", "ifc"),
    stringParam("ifcPredefinedType", "IFC predefined type", null, "ifc"),
    stringParam("ifcName", "IFC name", spec.displayName, "ifc"),
    stringParam("ifcDescription", "IFC description", `${spec.displayName} (${spec.moduleType})`, "ifc"),
    stringParam("ifcObjectType", "IFC object type", family, "ifc"),
    stringParam("ifcTag", "IFC tag", typeId, "ifc"),
    stringParam("classificationCode", "Classification code", null, "ifc"),
    stringParam("classificationSystem", "Classification system", null, "ifc"),
    stringParam("bodyMaterialGroup", "Body material group", "body", "materials", "bom"),
    stringParam("frontMaterialGroup", "Front material group", "front", "materials", "bom"),
    stringParam("backMaterialGroup", "Back material group", "back", "materials", "bom"),
    stringParam("shelfMaterialGroup", "Shelf material group", "shelf", "materials", "bom"),
    stringParam("worktopMaterialGroup", "Worktop material group", "worktop", "materials", "bom"),
    stringParam("drawerBoxMaterialGroup", "Drawer box material group", "drawer_box", "materials", "bom")
  ];
}

function baseParameters(spec: FwmFurnitureSpec): ModuleParameterDefinition[] {
  const variants = spec.variantOptions ?? ["default"];
  const heightMax = spec.geometryKind === "worktop" || spec.geometryKind === "shelf_surface" || spec.geometryKind === "trim" || spec.geometryKind === "accessory"
    ? 1200
    : spec.geometryKind === "wardrobe" || spec.geometryKind === "cladding" || spec.geometryKind === "tall" || (spec.geometryKind === "open_end" && spec.kitchenRole === "tall")
      ? 3200
      : 2600;
  const widthMax = spec.geometryKind === "worktop" || spec.geometryKind === "accessory" || spec.geometryKind === "trim" || spec.geometryKind === "cladding" || spec.geometryKind === "wall_unit" ? 5000 : 3600;
  const depthMax = spec.geometryKind === "worktop" || spec.geometryKind === "bed" ? 2600 : 1400;
  const hasNoBackPanel = ["cladding", "worktop", "shelf_surface", "trim", "front_component", "accessory"].includes(spec.geometryKind);
  const frontChamferDefault = spec.moduleType === "fwm_catalog_base_corner"
    ? 200
    : spec.moduleType === "fwm_catalog_wall_cabinet"
      ? Math.max(80, spec.width - spec.depth)
      : 420;
  const backChamferDefault = spec.moduleType === "fwm_catalog_base_corner" ? 0 : 200;
  const sideDefault = spec.geometryKind === "corner" ? "left" : spec.moduleType === "fwm_catalog_wall_open_end" ? "right" : "none";
  const sideOptions = spec.geometryKind === "corner" || spec.moduleType === "fwm_catalog_wall_open_end" ? ["left", "right"] : ["none", "left", "right"];
  const cornerShapeDefault = spec.moduleType === "fwm_catalog_base_corner" ? "chamfered" : spec.geometryKind === "corner" ? "l_shape" : "none";
  const params: ModuleParameterDefinition[] = [
    ...systemParameters(spec),
    {
      key: "type",
      label: "Type",
      type: "string",
      required: true,
      defaultValue: spec.moduleType,
      group: "general",
      affects: "all"
    },
    numberParam("width", "Width", spec.width, 100, widthMax, "dimensions", "geometry", 10),
    numberParam("height", "Height", spec.height, ["worktop", "shelf_surface", "trim", "front_component", "accessory"].includes(spec.geometryKind) ? 1 : 50, heightMax, "dimensions", "geometry", 10),
    numberParam("rowHeight", "Row height", spec.height, ["worktop", "shelf_surface", "trim", "front_component", "accessory"].includes(spec.geometryKind) ? 1 : 50, heightMax, "dimensions", "geometry", 10),
    numberParam("heightCarcass", "Carcass height", Math.max(50, spec.height - (requiresExternalKitchenWorktop(spec) ? 38 : 0)), 50, 3200, "dimensions", "geometry", 10),
    numberParam("depth", "Depth", spec.depth, 10, depthMax, "dimensions", "geometry", 10),
    {
      key: "variant",
      label: "Variant",
      type: "select",
      required: true,
      defaultValue: variants[0],
      options: variants.map((value) => ({ label: value.replaceAll("_", " "), value })),
      group: "general",
      affects: "all"
    },
    stringParam("catalogCode", "Catalog code", "", "metadata", "export", false),
    selectParam("side", "Side", sideDefault, sideOptions, "general", "geometry", false),
    selectParam("endingSide", "Ending side", "none", ["none", "left", "right"], "general", "geometry", false),
    selectParam("endingShape", "Ending shape", spec.moduleType === "fwm_catalog_wall_open_end" ? "chamfered" : "none", ["none", "chamfered", "rounded"], "geometry", "geometry", false),
    selectParam("cornerShape", "Corner shape", cornerShapeDefault, ["none", "l_shape", "blind", "diagonal", "chamfered"], "general", "geometry", false),
    selectParam("frontType", "Front type", spec.glassFronts ? "glass" : "solid", ["solid", "glass", "aluminium_frame", "profiled", "decor"], "components", "geometry", false),
    selectParam("openingMode", "Opening mode", spec.drawers ? "drawer" : spec.doors ? "hinged" : "open", ["open", "hinged", "lift_up", "drawer", "sliding"], "components", "geometry", false),
    selectParam("applianceKind", "Appliance kind", spec.appliance ?? "none", ["none", "cooking", "dishwasher", "fridge", "oven", "sink", "microwave", "oven_microwave"], "components", "geometry", false),
    selectParam("shape", "Shape", spec.geometryKind === "worktop" || spec.geometryKind === "shelf_surface" ? "straight" : "none", ["none", "straight", "corner", "rounded", "chamfered", "notched", "round", "half_round", "octagonal"], "geometry", "geometry", false),
    selectParam("mountingMode", "Mounting mode", spec.wallMounted ? "wall" : "floor", ["floor", "wall", "suspended", "worktop", "free"], "placement", "placement", false),
    numberParam("angleDeg", "Angle", 90, 0, 180, "geometry", "geometry", 1),
    numberParam("cornerRadiusMm", "Corner radius", 120, 0, 1200, "geometry", "geometry", 1),
    numberParam("chamferMm", "Chamfer", 120, 0, 1200, "geometry", "geometry", 1),
    numberParam("frontChamferMm", "Front chamfer", frontChamferDefault, 1, 1200, "geometry", "geometry", 1),
    ...(spec.moduleType === "fwm_catalog_base_corner"
      ? [numberParam("frontChamferReferenceMm", "Front chamfer reference", frontChamferDefault, 1, 1200, "geometry", "geometry", 1)]
      : []),
    numberParam("backChamferMm", "Back chamfer", backChamferDefault, 0, 1200, "geometry", "geometry", 1),
    numberParam("cutoutWidthMm", "Cutout width", 0, 0, 2400, "geometry", "geometry", 1),
    numberParam("cutoutDepthMm", "Cutout depth", 0, 0, 1600, "geometry", "geometry", 1),
    numberParam("powerW", "Power", 0, 0, 5000, "components", "bom", 1),
    numberParam("drawerCount", "Drawer count", spec.drawers ?? 0, 0, 12, "components", "geometry"),
    selectParam("drawerSystemBrand", "Drawer brand", "merivobox", FWM_DRAWER_SYSTEM_BRAND_OPTIONS.map((option) => option.value), "components", "geometry", false),
    selectParam("drawerSystemSize", "Derived first drawer size", "M", ["M", "D", "E", "F"], "components", "geometry", false),
    stringParam("drawerSystemSizes", "Derived drawer sizes", "M,M,M", "components", "geometry", false),
    stringParam("drawerSystemLabels", "Derived drawer systems", "MERIVOBOX M,MERIVOBOX M,MERIVOBOX M", "components", "geometry", false),
    stringParam("drawerSystemMinFrontHeightsMm", "Drawer system min front heights", "136,136,136", "components", "geometry", false),
    selectParam("drawerSystem", "Drawer system", "merivobox", FWM_DRAWER_SYSTEM_BRAND_OPTIONS.map((option) => option.value), "components", "geometry", false),
    numberParam("drawerSystemDepthMm", "Drawer system depth", 500, 0, 1200, "components", "geometry"),
    numberParam("drawerBottomDepthDeductionMm", "Drawer bottom depth deduction", 26, -200, 400, "components", "bom"),
    numberParam("drawerBottomWidthDeductionMm", "Drawer bottom width deduction", 51, -200, 400, "components", "bom"),
    numberParam("drawerBackWidthDeductionMm", "Drawer back width deduction", 51, -200, 400, "components", "bom"),
    numberParam("drawerBackHeightDeductionMm", "Drawer back height deduction", 83, 0, 400, "components", "geometry"),
    stringParam("drawerSystemBackHeightsMm", "Drawer system back heights", "83,83,83", "components", "geometry", false),
    numberParam("cutleryInsertWidthDeductionMm", "Cutlery insert width deduction", -3, -200, 400, "components", "bom"),
    numberParam("cutleryInsertDepthDeductionMm", "Cutlery insert depth deduction", 0, -200, 400, "components", "bom"),
    numberParam("innerDrawerFrontDeductionMm", "Inner drawer front deduction", 126, -200, 400, "components", "bom"),
    numberParam("innerDrawerCrossRailDeductionMm", "Inner drawer cross rail deduction", 111, -200, 400, "components", "bom"),
    booleanParam("hasCutleryInnerDrawer", "Cutlery inner drawer", false, "components", "geometry"),
    booleanParam("cutleryInnerDrawerAllowed", "Cutlery inner drawer allowed", false, "components", "geometry"),
    stringParam("cutleryInnerDrawerStatus", "Cutlery inner drawer status", "disabled", "components", "geometry", false),
    numberParam("cutleryInnerDrawerTargetIndex", "Cutlery inner drawer target", 0, 0, 5, "components", "geometry"),
    numberParam("cutleryInnerDrawerWidthMm", "Cutlery inner drawer width", 0, 0, 1600, "components", "geometry"),
    numberParam("cutleryInnerDrawerDepthMm", "Cutlery inner drawer depth", 0, 0, 1200, "components", "geometry"),
    numberParam("cutleryInnerDrawerFrontWidthMm", "Cutlery inner drawer front width", 0, 0, 1600, "components", "geometry"),
    numberParam("cutleryInnerDrawerCrossRailWidthMm", "Cutlery inner drawer cross rail width", 0, 0, 1600, "components", "geometry"),
    numberParam("drawerSystemPricePerSet", "Drawer system price per set", 669, 0, 100000, "pricing", "pricing"),
    numberParam("drawerSystemPriceWithMargin", "Drawer system price with margin", 1338, 0, 100000, "pricing", "pricing"),
    stringParam("drawerSystemCodeLabel", "Drawer system code label", "kod merivo M", "components", "bom", false),
    stringParam("drawerFrontHeightsMm", "Drawer front heights", "", "components", "geometry", false),
    numberParam("drawer1FrontHeightMm", "Drawer 1 front height", 40, 40, 1200, "components", "geometry", 1),
    numberParam("drawer2FrontHeightMm", "Drawer 2 front height", 40, 40, 1200, "components", "geometry", 1),
    numberParam("drawer3FrontHeightMm", "Drawer 3 front height", 40, 40, 1200, "components", "geometry", 1),
    numberParam("drawer4FrontHeightMm", "Drawer 4 front height", 40, 40, 1200, "components", "geometry", 1),
    numberParam("drawer5FrontHeightMm", "Drawer 5 front height", 40, 40, 1200, "components", "geometry", 1),
    selectParam("drawer1SystemSize", "Drawer 1 system size", "", ["", "M", "D", "E", "F"], "components", "geometry", false),
    selectParam("drawer2SystemSize", "Drawer 2 system size", "", ["", "M", "D", "E", "F"], "components", "geometry", false),
    selectParam("drawer3SystemSize", "Drawer 3 system size", "", ["", "M", "D", "E", "F"], "components", "geometry", false),
    selectParam("drawer4SystemSize", "Drawer 4 system size", "", ["", "M", "D", "E", "F"], "components", "geometry", false),
    selectParam("drawer5SystemSize", "Drawer 5 system size", "", ["", "M", "D", "E", "F"], "components", "geometry", false),
    stringParam("drawer1SystemLabel", "Drawer 1 system", "", "components", "geometry", false),
    stringParam("drawer2SystemLabel", "Drawer 2 system", "", "components", "geometry", false),
    stringParam("drawer3SystemLabel", "Drawer 3 system", "", "components", "geometry", false),
    stringParam("drawer4SystemLabel", "Drawer 4 system", "", "components", "geometry", false),
    stringParam("drawer5SystemLabel", "Drawer 5 system", "", "components", "geometry", false),
    numberParam("drawer1SystemMinFrontHeightMm", "Drawer 1 system min front", 0, 0, 1200, "components", "geometry", 1),
    numberParam("drawer2SystemMinFrontHeightMm", "Drawer 2 system min front", 0, 0, 1200, "components", "geometry", 1),
    numberParam("drawer3SystemMinFrontHeightMm", "Drawer 3 system min front", 0, 0, 1200, "components", "geometry", 1),
    numberParam("drawer4SystemMinFrontHeightMm", "Drawer 4 system min front", 0, 0, 1200, "components", "geometry", 1),
    numberParam("drawer5SystemMinFrontHeightMm", "Drawer 5 system min front", 0, 0, 1200, "components", "geometry", 1),
    numberParam("drawer1SystemBackHeightMm", "Drawer 1 system back height", 0, 0, 400, "components", "geometry", 1),
    numberParam("drawer2SystemBackHeightMm", "Drawer 2 system back height", 0, 0, 400, "components", "geometry", 1),
    numberParam("drawer3SystemBackHeightMm", "Drawer 3 system back height", 0, 0, 400, "components", "geometry", 1),
    numberParam("drawer4SystemBackHeightMm", "Drawer 4 system back height", 0, 0, 400, "components", "geometry", 1),
    numberParam("drawer5SystemBackHeightMm", "Drawer 5 system back height", 0, 0, 400, "components", "geometry", 1),
    numberParam("doorCount", "Door count", spec.doors ?? 0, 0, 12, "components", "geometry"),
    numberParam("shelfCount", "Shelf count", spec.shelves ?? 0, 0, 16, "components", "geometry"),
    stringParam("shelfGaps", "Shelf gaps", "", "components", "geometry", false),
    ...(spec.moduleType === "fwm_catalog_tall_cabinet"
      ? [
        selectParam("tallStackMode", "Tall stack mode", "builder", ["builder", "fixed"], "tall_stack", "geometry"),
        numberParam("tallSlotCount", "Tall slot count", TALL_STACK_SLOT_DEFAULTS.length, 0, 12, "tall_stack", "geometry", 1),
        ...Array.from({ length: 12 }, (_, index) => {
          const slotIndex = index + 1;
          const defaults = TALL_STACK_SLOT_DEFAULTS[index] ?? { type: "empty", height: 0 };
          return [
            selectParam(`tallSlot${slotIndex}Type`, `Slot ${slotIndex} type`, defaults.type, ["empty", "drawer", "shelf", "oven", "sink", "microwave", "door"], "tall_stack", "geometry"),
            numberParam(`tallSlot${slotIndex}HeightMm`, `Slot ${slotIndex} height`, defaults.height, 0, 1400, "tall_stack", "geometry", 1),
            selectParam(`tallSlot${slotIndex}DrawerSystemSize`, `Slot ${slotIndex} drawer system size`, "", ["", "M", "D", "E", "F"], "tall_stack", "geometry", false),
            numberParam(`tallSlot${slotIndex}DoorLeafCount`, `Slot ${slotIndex} door leaves`, 1, 1, 2, "tall_stack", "geometry", 1),
            selectParam(`tallSlot${slotIndex}DoorOpeningMode`, `Slot ${slotIndex} door opening`, "hinged", ["hinged", "lift_up"], "tall_stack", "geometry"),
            numberParam(`tallSlot${slotIndex}OffsetMm`, `Slot ${slotIndex} vertical offset`, 0, -3000, 3000, "tall_stack", "geometry", 1)
          ];
        }).flat(),
        selectParam("tallDoorOpeningMode", "Tall door opening", "lift_up", ["lift_up", "left", "right"], "tall_stack", "geometry")
      ]
      : []),
    numberParam("boardThickness", "Body board thickness", 18, 8, 60, "materials", "geometry"),
    numberParam("frontThicknessMm", "Front thickness", 18, 4, 50, "materials", "geometry"),
    numberParam("backThickness", "Back thickness", hasNoBackPanel ? 0 : 8, 0, 30, "materials", "geometry"),
    numberParam("drawerBackGapMm", "Drawer back gap", 10, 0, 80, "advanced", "geometry"),
    numberParam("shelfThickness", "Shelf thickness", 18, 8, 50, "materials", "geometry"),
    numberParam("worktopThicknessMm", "Worktop thickness", requiresExternalKitchenWorktop(spec) || spec.geometryKind === "worktop" ? 38 : 0, 0, 100, "materials", "geometry"),
    numberParam("plinthHeight", "Plinth height", spec.hasPlinth ? 100 : 0, 0, 300, "dimensions", "geometry"),
    numberParam("plinthSetbackMm", "Plinth setback", spec.hasPlinth ? 60 : 0, 0, 300, "dimensions", "geometry"),
    numberParam("frontGap", "Front gap", 2, 0, 12, "advanced", "geometry"),
    numberParam("sideGap", "Side gap", 2, 0, 20, "advanced", "geometry"),
    booleanParam("opened", "Opened", false, "runtime", "geometry"),
    selectParam("handleType", "Handle type", spec.drawers || spec.doors ? "bar" : "none", ["none", "bar", "knob", "profile", "push"], "components", "geometry", false),
    numberParam("handleLengthMm", "Handle length", 160, 40, 1200, "components", "geometry"),
    numberParam("handleProjectionMm", "Handle projection", 28, 0, 80, "components", "geometry"),
    numberParam("handleSizeMm", "Handle size", 16, 4, 60, "components", "geometry"),
    numberParam("applianceWidthMm", "Appliance width", spec.appliance ? Math.min(spec.width - 80, 600) : 0, 0, 1200, "components", "geometry"),
    numberParam("sinkBowlWidthMm", "Sink bowl width", spec.geometryKind === "sink" || spec.geometryKind === "bathroom" ? 520 : 0, 0, 1600, "components", "geometry"),
    numberParam("sinkBowlDepthMm", "Sink bowl depth", spec.geometryKind === "sink" || spec.geometryKind === "bathroom" ? 400 : 0, 0, 900, "components", "geometry"),
    {
      key: "wallMounted",
      label: "Wall mounted",
      type: "boolean",
      required: false,
      defaultValue: spec.wallMounted ?? false,
      group: "placement",
      affects: "placement"
    },
    {
      key: "glassFronts",
      label: "Glass fronts",
      type: "boolean",
      required: false,
      defaultValue: spec.glassFronts ?? false,
      group: "materials",
      affects: "visual"
    },
    {
      key: "reserveModule",
      label: "Reserve module",
      type: "boolean",
      required: false,
      defaultValue: spec.reserve ?? false,
      group: "runtime",
      affects: "export"
    },
    {
      key: "bodyMaterialId",
      label: "Body material",
      type: "material",
      required: false,
      defaultValue: "",
      group: "materials",
      affects: "all"
    },
    {
      key: "frontMaterialId",
      label: "Front material",
      type: "material",
      required: false,
      defaultValue: "",
      group: "materials",
      affects: "all"
    },
    {
      key: "backMaterialId",
      label: "Back material",
      type: "material",
      required: false,
      defaultValue: "",
      group: "materials",
      affects: "all"
    },
    {
      key: "shelfMaterialId",
      label: "Shelf material",
      type: "material",
      required: false,
      defaultValue: "",
      group: "materials",
      affects: "all"
    },
    {
      key: "drawerBottomMaterialId",
      label: "Drawer bottom material",
      type: "material",
      required: false,
      defaultValue: "",
      group: "materials",
      affects: "all"
    },
    {
      key: "plinthMaterialId",
      label: "Plinth material",
      type: "material",
      required: false,
      defaultValue: "",
      group: "materials",
      affects: "all"
    },
    {
      key: "worktopMaterialId",
      label: "Worktop material",
      type: "material",
      required: false,
      defaultValue: "",
      group: "materials",
      affects: "all"
    },
    {
      key: "handleComponentId",
      label: "Handle",
      type: "component",
      required: false,
      defaultValue: "",
      group: "components",
      affects: "all"
    },
    {
      key: "hingeComponentId",
      label: "Hinge",
      type: "component",
      required: false,
      defaultValue: "",
      group: "components",
      affects: "bom"
    },
    {
      key: "runnerComponentId",
      label: "Runner",
      type: "component",
      required: false,
      defaultValue: "",
      group: "components",
      affects: "bom"
    },
    {
      key: "legComponentId",
      label: "Adjustable leg",
      type: "component",
      required: false,
      defaultValue: spec.hasPlinth ? "cmp.leg.adjustable.100.black" : "",
      group: "components",
      affects: "all"
    },
    {
      key: "clipComponentId",
      label: "Plinth clip",
      type: "component",
      required: false,
      defaultValue: spec.hasPlinth ? "cmp.clip.plinth.standard" : "",
      group: "components",
      affects: "all"
    }
  ];
  return filterModuleSpecificParameters(spec, applyParameterSurfacePolicy(spec, params));
}

function materialSlots(spec: FwmFurnitureSpec): ModuleMaterialSlot[] {
  if (spec.moduleType === "fwm_catalog_wall_open_end") {
    return [
      {
        slotId: "corpus",
        label: "Corpus",
        required: true,
        defaultFrom: "catalog.kitchenDefaults.carcassMaterialId",
        allowedMaterialTags: ["body", "board"],
        affects: ["geometry", "visual", "bom", "pricing"]
      }
    ];
  }
  const slots: ModuleMaterialSlot[] = [
    {
      slotId: "corpus",
      label: "Corpus",
      required: true,
      defaultFrom: "catalog.kitchenDefaults.carcassMaterialId",
      allowedMaterialTags: ["body", "board"],
      affects: ["geometry", "visual", "bom", "pricing"]
    },
    {
      slotId: "front",
      label: "Fronts",
      required: false,
      defaultFrom: "catalog.kitchenDefaults.frontMaterialId",
      allowedMaterialTags: ["front", "board"],
      affects: ["geometry", "visual", "bom", "pricing"]
    },
    {
      slotId: "back",
      label: "Back panel",
      required: false,
      defaultFrom: "catalog.kitchenDefaults.backPanelMaterialId",
      allowedMaterialTags: ["back", "board"],
      affects: ["geometry", "visual", "bom", "pricing"]
    },
    {
      slotId: "plinth",
      label: "Plinth",
      required: false,
      defaultFrom: "catalog.kitchenDefaults.plinthMaterialId",
      allowedMaterialTags: ["body", "plinth", "board"],
      affects: ["geometry", "visual", "bom", "pricing"]
    }
  ];
  if ((spec.drawers ?? 0) > 0) {
    slots.push({
      slotId: "drawer_bottom",
      label: "Drawer bottoms",
      required: false,
      defaultFrom: "catalog.kitchenDefaults.drawerBottomMaterialId",
      allowedMaterialTags: ["drawer_bottom", "board"],
      affects: ["geometry", "visual", "bom", "pricing"]
    });
  }
  if (spec.geometryKind === "table" || spec.geometryKind === "worktop") {
    slots.push({
      slotId: "worktop",
      label: "Worktop / top",
      required: false,
      defaultFrom: "catalog.kitchenDefaults.worktopMaterialId",
      allowedMaterialTags: ["worktop", "board"],
      affects: ["geometry", "visual", "bom", "pricing"]
    });
  }
  return slots;
}

function componentSlots(spec: FwmFurnitureSpec): ModuleComponentSlot[] {
  const slots: ModuleComponentSlot[] = [];
  if ((spec.drawers ?? 0) > 0 || (spec.doors ?? 0) > 0) {
    slots.push({
      slotId: "handle",
      label: "Handle",
      componentType: "handle",
      required: false,
      defaultFrom: "catalog.kitchenDefaults.defaultHandleComponentId",
      affects: ["geometry", "bom", "pricing", "visual"]
    });
  }
  if ((spec.doors ?? 0) > 0) {
    slots.push({
      slotId: "hinge",
      label: "Hinge",
      componentType: "hinge",
      required: false,
      defaultFrom: "catalog.kitchenDefaults.defaultHingeComponentId",
      affects: ["bom", "pricing"]
    });
  }
  if ((spec.drawers ?? 0) > 0) {
    slots.push({
      slotId: "runner",
      label: "Drawer runner",
      componentType: "runner",
      required: false,
      defaultFrom: "catalog.kitchenDefaults.defaultDrawerSystemComponentId",
      affects: ["bom", "pricing"]
    });
  }
  if (spec.hasPlinth) {
    slots.push(
      {
        slotId: "leg",
        label: "Adjustable leg",
        componentType: "leg",
        required: false,
        defaultFrom: "parameter.legComponentId",
        affects: ["geometry", "bom", "pricing", "visual"]
      },
      {
        slotId: "plinth_clip",
        label: "Plinth clip",
        componentType: "plinth_clip",
        required: false,
        defaultFrom: "parameter.clipComponentId",
        affects: ["geometry", "bom", "pricing", "visual"]
      }
    );
  }
  return slots;
}

function placement(spec: FwmFurnitureSpec): ModulePlacementRules {
  const freeSurface = ["worktop", "shelf_surface", "trim", "front_component", "accessory"].includes(spec.geometryKind);
  const corner = spec.geometryKind === "corner";
  const wallBound = spec.wallMounted || spec.placementContexts.includes("kitchen_wall");
  return {
    allowedContexts: corner ? ["kitchen_corner"] : [...spec.placementContexts],
    requiredAnchors: spec.wallMounted
      ? ["wall"]
      : corner
        ? ["two_perpendicular_walls", "corner", "floor"]
        : freeSurface
          ? []
          : wallBound
            ? ["wall", "floor"]
            : ["floor"],
    requiresCorner: corner,
    requiresWall: corner || wallBound,
    requiresFloor: !spec.wallMounted && spec.geometryKind !== "cladding" && !freeSurface,
    allowFreePlacement: corner ? false : !wallBound || spec.placementContexts.includes("free_standing"),
    corner: corner ? { required: true, allowedAngles: [90], toleranceDeg: 3, mustTouchBothWalls: true } : undefined,
    wall: corner || wallBound ? { mustAttachToWall: true } : undefined,
    clearance: {
      frontMm: spec.geometryKind === "appliance" ? 900 : spec.geometryKind === "bed" ? 700 : 500,
      leftMm: spec.geometryKind === "bed" ? 500 : 0,
      rightMm: spec.geometryKind === "bed" ? 500 : 0
    },
    collision: { allowOverlap: false }
  };
}

function ui(spec: FwmFurnitureSpec): ModuleUiDefinition {
  const parameterDefinitions = baseParameters(spec);
  const groups = [
    { id: "general", label: "General", order: 0 },
    { id: "dimensions", label: "Dimensions", order: 1 },
    { id: "materials", label: "Materials", order: 2 },
    { id: "components", label: "Components", order: 3 },
    { id: "placement", label: "Placement", order: 4 },
    { id: "advanced", label: "Advanced", order: 5 },
    { id: "runtime", label: "Runtime", order: 6 }
  ];
  const keys = [
    "variant",
    "catalogCode",
    "width",
    "height",
    "depth",
    "side",
    "endingSide",
    "endingShape",
    "cornerShape",
    "frontType",
    "openingMode",
    "applianceKind",
    "shape",
    "mountingMode",
    "angleDeg",
    "cornerRadiusMm",
    "chamferMm",
    "frontChamferMm",
    "frontChamferReferenceMm",
    "backChamferMm",
    "cutoutWidthMm",
    "cutoutDepthMm",
    "powerW",
    "drawerCount",
    "drawerSystemBrand",
    "drawer1SystemSize",
    "drawer2SystemSize",
    "hasCutleryInnerDrawer",
    "drawerFrontHeightsMm",
    "drawerSystem",
    "doorCount",
    "shelfCount",
    "shelfGaps",
    "tallStackMode",
    "tallSlotCount",
    ...Array.from({ length: 12 }, (_, index) => [`tallSlot${index + 1}Type`, `tallSlot${index + 1}HeightMm`, `tallSlot${index + 1}DrawerSystemSize`, `tallSlot${index + 1}OffsetMm`]).flat(),
    "tallDoorOpeningMode",
    "bodyMaterialId",
    "frontMaterialId",
    "backMaterialId",
    "shelfMaterialId",
    "drawerBottomMaterialId",
    "plinthMaterialId",
    "worktopMaterialId",
    "handleComponentId",
    "hingeComponentId",
    "runnerComponentId",
    "legComponentId",
    "clipComponentId",
    "boardThickness",
    "frontThicknessMm",
    "backThickness",
    "drawerBackGapMm",
    "shelfThickness",
    "worktopThicknessMm",
    "plinthHeight",
    "plinthSetbackMm",
    "frontGap",
    "sideGap",
    "opened",
    "handleType",
    "applianceWidthMm",
    "sinkBowlWidthMm",
    "sinkBowlDepthMm",
    "wallMounted",
    "glassFronts"
  ];
  const parameterByKey = new Map(parameterDefinitions.map((param) => [param.key, param]));
  const controls = keys.flatMap((key, index) => {
    const parameter = parameterByKey.get(key);
    if (!parameter || parameter.uiVisibility !== "user") return [];
    const groupId = parameter.group ?? "general";
    const controlType =
      key.endsWith("MaterialId") ? "materialPicker" :
      key.endsWith("ComponentId") ? "componentPicker" :
      /^tallSlot\d+(Type|DrawerSystemSize)$/.test(key) || /^drawer[1-5]SystemSize$/.test(key) || ["variant", "side", "endingSide", "endingShape", "cornerShape", "frontType", "openingMode", "applianceKind", "shape", "mountingMode", "handleType", "drawerSystemBrand", "drawerSystemSize", "drawerSystem", "tallStackMode", "tallDoorOpeningMode"].includes(key) ? "select" :
      key === "wallMounted" || key === "glassFronts" || key === "opened" || key === "hasCutleryInnerDrawer" ? "checkbox" :
      parameter.type === "string" ? "text" :
      "number";
    return [{ parameterKey: key, controlType, groupId, order: index }];
  }) satisfies ModuleUiDefinition["controls"];
  return {
    icon: "box",
    previewImage: getFwmModulePreviewImage(spec.moduleType),
    groups,
    controls
  };
}

function kitchenBehavior(spec: FwmFurnitureSpec): FurnQuoteModulePackage["behavior"] | undefined {
  if (!spec.kitchenRole) return undefined;
  const requiresWorktop = requiresExternalKitchenWorktop(spec);
  const materialSync = spec.moduleType === "fwm_catalog_wall_open_end" ? [
    { targetSlot: "corpus" as const, targetParameter: "bodyMaterialId", source: "ctx.corpusMaterialId", family: "body" as const, thicknessParameter: "boardThickness", aliases: ["body" as const] }
  ] : [
    { targetSlot: "corpus" as const, targetParameter: "bodyMaterialId", source: "ctx.corpusMaterialId", family: "body" as const, thicknessParameter: "boardThickness", aliases: ["body" as const] },
    { targetSlot: "front" as const, targetParameter: "frontMaterialId", source: "ctx.frontsMaterialId", family: "front" as const, thicknessParameter: "frontThicknessMm", aliases: ["front" as const] },
    { targetSlot: "back" as const, targetParameter: "backMaterialId", source: "ctx.backMaterialId", family: "back" as const, thicknessParameter: "backThickness", aliases: ["back" as const] },
    { targetSlot: "corpus" as const, targetParameter: "shelfMaterialId", source: "ctx.corpusMaterialId", family: "body" as const, thicknessParameter: "shelfThickness", aliases: ["shelf" as const] },
    ...((spec.drawers ?? 0) > 0 ? [{ targetSlot: "drawer_bottom" as const, targetParameter: "drawerBottomMaterialId", source: "ctx.drawerBottomMaterialId", family: "drawer_bottom" as const, aliases: ["drawer_bottom" as const] }] : []),
    ...(spec.hasPlinth ? [{ targetSlot: "plinth" as const, targetParameter: "plinthMaterialId", source: "catalog.kitchenDefaults.plinthMaterialId", family: "body" as const }] : []),
  ];
  const componentSync = (spec.drawers ?? 0) > 0 || (spec.doors ?? 0) > 0
    ? [{ targetSlot: "handle" as const, targetParameter: "handleComponentId", source: "ctx.handleComponentId", componentType: "handle" as const, transforms: ["handleGeometryKind" as const, "componentNominalLength" as const] }]
    : [];
  return {
    contextBindings: [
      {
        contextType: "kitchenGroup",
        required: true,
        scope: "single",
        autoAssign: "activeKitchenGroup",
        liveSync: true,
        forbidCrossContextAdjacency: true,
        parameterSync: [
          { targetParameter: "height", source: spec.kitchenRole === "top" ? "ctx.upperHeightMm" : spec.kitchenRole === "tall" ? "ctx.wallHeightMm" : "ctx.heightMm", transform: "identity", mode: "live" },
          { targetParameter: "heightCarcass", source: spec.kitchenRole === "top" ? "ctx.upperHeightMm" : spec.kitchenRole === "tall" ? "ctx.wallHeightMm" : "ctx.moduleHeightMm", transform: "identity", mode: "live" },
          { targetParameter: "depth" as const, source: spec.kitchenRole === "top" ? "ctx.upperDepthMm" as const : "ctx.moduleDepthMm" as const, transform: "identity" as const, mode: "live" as const },
          ...(spec.hasPlinth
            ? [
                { targetParameter: "plinthHeight" as const, source: "ctx.plinthHeightMm", transform: "identity" as const, mode: "live" as const },
                { targetParameter: "plinthSetbackMm" as const, source: "ctx.plinthDepthMm", transform: "identity" as const, mode: "live" as const }
              ]
            : []),
          ...(requiresWorktop ? [{ targetParameter: "worktopThicknessMm" as const, source: "ctx.worktopThicknessMm", transform: "resolvedWorktopThickness" as const, mode: "live" as const }] : [])
        ],
        materialSync,
        componentSync,
        overridePolicy: { allowUserOverride: true, warnWhenDetachedFromContext: true }
      }
    ]
  };
}

function drawerStackPreset(args: {
  presetId: string;
  label: string;
  ratiosBottomUp: number[];
  sourceLabels: string[];
  note: string;
  tags?: string[];
}): NonNullable<FurnQuoteModulePackage["parameterPresets"]>["presets"][number] {
  return {
    presetId: args.presetId,
    label: args.label,
    description: args.note,
    note: args.note,
    tags: ["drawer-stack", ...(args.tags ?? [])],
    sourceLabels: args.sourceLabels,
    parameterValues: {
      drawerCount: args.ratiosBottomUp.length
    },
    ratioParameters: [
      {
        parameterKey: "drawerFrontHeightsMm",
        countParameter: "drawerCount",
        ratios: args.ratiosBottomUp,
        order: "bottom-up",
        indexedParameterPrefix: "drawer",
        indexedParameterSuffix: "FrontHeightMm"
      }
    ]
  };
}

function parameterPresets(spec: FwmFurnitureSpec): FurnQuoteModulePackage["parameterPresets"] {
  const presets: NonNullable<FurnQuoteModulePackage["parameterPresets"]>["presets"] = [];
  if (spec.moduleType === "fwm_catalog_base_drawers") {
    presets.push(
      drawerStackPreset({
        presetId: "drawers_1_full_height",
        label: "1x zasuvka",
        ratiosBottomUp: [1],
        sourceLabels: ["1X ZASUVKA", "Spod. 1K"],
        note: "Jeden vysoky suflik cez celu dostupnu vysku frontu. Preset nastavuje iba drawerCount a pomer frontu; sirka, vyska, hlbka, sokel a materialy ostavaju volne."
      }),
      drawerStackPreset({
        presetId: "drawers_2_equal",
        label: "2x zasuvka",
        ratiosBottomUp: [1, 1],
        sourceLabels: ["2X ZASUVKA", "Spod. 2K", "ZAKONCOVACI 2X ZASUVKA"],
        note: "Dve rovnako vysoke zasuvkove cela. Preset nastavuje iba pocet zasuviek a pomer ciel; sirka, vyska, hlbka, sokel a materialy ostavaju volne."
      }),
      drawerStackPreset({
        presetId: "drawers_2_top_shallow",
        label: "2x zasuvka - horna mala",
        ratiosBottomUp: [3, 1],
        sourceLabels: ["2X ZASUVKA horna plytka", "Spod. 1K 1Z"],
        note: "Dve zasuvky s plytkym hornym celom a vysokym spodnym celom. Pomer sa prepocita z aktualnej vysky modulu."
      }),
      drawerStackPreset({
        presetId: "drawers_3_equal",
        label: "3x zasuvka",
        ratiosBottomUp: [1, 1, 1],
        sourceLabels: ["3X ZASUVKA", "ZAKONCOVACI 3X ZASUVKA"],
        note: "Tri rovnake zasuvkove cela, kazde 1/3 dostupnej vysky. Preset neprepisuje rozmery kuchyne ani materialy."
      }),
      drawerStackPreset({
        presetId: "drawers_3_top_shallow",
        label: "3x zasuvka - horna mala",
        ratiosBottomUp: [3, 2, 1],
        sourceLabels: ["3X ZASUVKA horna plytka", "Spod. 1K 2Z"],
        note: "Tri zasuvky s najmensim hornym celom a vacsimi spodnymi celami. AI ho ma pouzit pre katalogovy variant s plytkou hornou zasuvkou."
      }),
      drawerStackPreset({
        presetId: "drawers_3_top_shallow_two_high",
        label: "3x zasuvka - 2K 1Z",
        ratiosBottomUp: [2, 2, 1],
        sourceLabels: ["Spod. 2K 1Z"],
        note: "Tri zasuvky: dve spodne rovnako vysoke kuchynske zasuvky a jedna plytka horna zasuvka. Rozmery su ulozene ako pomer, nie pevne milimetre."
      }),
      drawerStackPreset({
        presetId: "drawers_4_three_shallow_one_high",
        label: "4x zasuvka - 3 male + 1 velka",
        ratiosBottomUp: [3, 1, 1, 1],
        sourceLabels: ["4X ZASUVKA", "4 X ZASUVKA", "Spod. 1K 3Z", "ZAKONCOVACI 4 X ZASUVKA", "S8-BL1113-xxx", "S8-BA 1113-xxx", "S8-VT1113-xxx"],
        note: "Styri zasuvky s pomerom od vrchu 1/6, 1/6, 1/6, 1/2. V spodnom poradi parametrov je to 1/2, 1/6, 1/6, 1/6."
      }),
      drawerStackPreset({
        presetId: "drawers_5_equal",
        label: "5x zasuvka",
        ratiosBottomUp: [1, 1, 1, 1, 1],
        sourceLabels: ["Spod. 5Z"],
        note: "Pat rovnako vysokych zasuvkovych ciel. Pouziva sa pre katalogovy variant Spod. 5Z."
      })
    );
  }
  return {
    freeParameterKeys: spec.moduleType === "fwm_catalog_wall_open_end" ? WALL_OPEN_END_FREE_PARAMETER_KEYS : MODULE_PRESET_FREE_PARAMETER_KEYS,
    presets
  };
}

function makePackage(spec: FwmFurnitureSpec): FurnQuoteModulePackage {
  const runtimeBuilderKey = getFwmRuntimeBuilderKey(spec.moduleType);
  const widthMax = spec.geometryKind === "worktop" || spec.geometryKind === "accessory" || spec.geometryKind === "trim" || spec.geometryKind === "cladding" || spec.geometryKind === "wall_unit" ? 5000 : 3600;
  const heightMax = spec.geometryKind === "worktop" || spec.geometryKind === "shelf_surface" || spec.geometryKind === "trim" || spec.geometryKind === "accessory"
      ? 1200
      : spec.geometryKind === "wardrobe" || spec.geometryKind === "cladding" || spec.geometryKind === "tall" || (spec.geometryKind === "open_end" && spec.kitchenRole === "tall")
        ? 3200
        : 2600;
  const depthMax = spec.geometryKind === "worktop" || spec.geometryKind === "bed" ? 2600 : 1400;
  const panelStrategy = ["cladding", "worktop", "shelf_surface", "trim", "front_component"].includes(spec.geometryKind);
  return {
    format: "furnquote-module",
    packageVersion: 1,
    module: {
      modulePackageId: `${spec.moduleType}_family_v1`,
      moduleType: spec.moduleType,
      familyName: spec.displayName,
      displayName: spec.displayName,
      description: spec.description,
      category: spec.category,
      version: "1.0.0",
      isSystemModule: true,
      tags: [...spec.tags]
    },
    parameters: { parameters: baseParameters(spec) },
    placement: placement(spec),
    constraints: {
      dimensionRules: {
        width: { min: 100, max: widthMax, step: 10 },
        height: { min: 50, max: heightMax, step: 10 },
        depth: { min: 10, max: depthMax, step: 10 }
      },
      validationRules: [
        {
          id: "manufacturable-width",
          message: "Width must allow side panels and usable internal clearance.",
          severity: "error",
          expression: "width > boardThickness * 2 + 40"
        },
        {
          id: "drawer-height",
          message: "Drawer count must fit usable height.",
          severity: "warning",
          expression: "drawerCount === 0 || height / drawerCount >= 90"
        }
      ]
    },
    snapping: {
      enabled: true,
      snapTargets: spec.geometryKind === "corner" ? ["corner", "wall", "grid"] : spec.wallMounted ? ["wall", "grid"] : ["wall", "adjacent_module", "grid"],
      priority: spec.geometryKind === "corner" ? ["corner", "wall", "grid"] : ["wall", "adjacent_module", "grid"],
      snapDistanceMm: 40,
      rotationSnapDeg: 90,
      align: {
        backToWall: spec.placementContexts.includes("kitchen_wall") || spec.wallMounted,
        sideToWall: spec.geometryKind === "corner",
        frontFlushWithAdjacent: true,
        topAlignWithAdjacent: spec.kitchenRole === "top" || spec.kitchenRole === "tall"
      }
    },
    geometry: {
      mode: "trusted-runtime",
      runtimeBuilderKey,
      parameterMapping: {
        heightCarcass: "heightCarcass"
      }
    },
    materials: { slots: materialSlots(spec) },
    components: { slots: componentSlots(spec) },
    behavior: kitchenBehavior(spec),
    internalEditing: createModuleInternalEditingDefinition({
      moduleType: spec.moduleType,
      geometryKind: spec.geometryKind,
      kitchenRole: spec.kitchenRole,
      tags: spec.tags,
      hasWorktop: spec.geometryKind === "worktop"
    }),
    bom: {
      rules: [
        {
          id: "carcass-board-area",
          itemType: "material",
          source: "materialSlot",
          sourceKey: "corpus",
          quantityFormula: { type: "area", widthParam: "width", heightParam: "height", multiplier: 2 }
        },
        {
          id: "front-board-area",
          itemType: "material",
          source: "materialSlot",
          sourceKey: "front",
          quantityFormula: { type: "area", widthParam: "width", heightParam: "height", multiplier: 1 }
        }
      ]
    },
    pricing: {
      marginCategory: spec.category,
      quoteGroup: spec.tags.includes("kitchen") ? "kitchen" : "furniture"
    },
    ui: ui(spec),
    parameterPresets: parameterPresets(spec),
    exports: {
      exportTags: [...spec.tags, "fwm"],
      manufacturingCode: spec.moduleType.toUpperCase(),
      notes: ["Generated system FWM package for trusted runtime furniture modules."]
    },
    manufacturing: {
      cncStrategy: panelStrategy ? "panel_component" : spec.geometryKind === "accessory" ? "component_accessory" : "panel_furniture",
      edgeBandingStrategy: "visible_edges_abs",
      notes: [
        "Board thickness follows selected catalog materials where kitchen context sync is active.",
        "Hardware quantities are derived from drawer and door counts."
      ]
    },
    assets: { files: [] },
    compatibility: {
      minAppVersion: "0.0.0",
      requiredRuntimeBuilderKeys: [runtimeBuilderKey],
      requiredCatalogFeatures: ["materials", "components", "pricing"]
    },
    integrity: {
      createdAt: now,
      updatedAt: now,
      author: "system"
    }
  };
}

function createBaseBottlePulloutModulePackage(): FurnQuoteModulePackage {
  const sourceSpec = FWM_FURNITURE_SPECS.find((spec) => spec.moduleType === BASE_BOTTLE_PULLOUT_RUNTIME_TYPE);
  if (!sourceSpec) throw new Error(`Missing ${BASE_BOTTLE_PULLOUT_RUNTIME_TYPE} source spec.`);

  const modulePackage = makePackage(sourceSpec);
  modulePackage.module = {
    ...modulePackage.module,
    modulePackageId: BASE_BOTTLE_PULLOUT_PACKAGE_ID,
    moduleType: BASE_BOTTLE_PULLOUT_RUNTIME_TYPE,
    familyName: BASE_BOTTLE_PULLOUT_DISPLAY_NAME,
    displayName: BASE_BOTTLE_PULLOUT_DISPLAY_NAME,
    description: BASE_BOTTLE_PULLOUT_DESCRIPTION,
    tags: [...sourceSpec.tags]
  };
  modulePackage.parameters = {
    ...modulePackage.parameters,
    parameters: modulePackage.parameters.parameters
      .filter((parameter) => BASE_BOTTLE_PULLOUT_OWNED_PARAMETER_KEYS.has(parameter.key))
      .map((parameter) => {
        const next = { ...parameter };
        if (BASE_BOTTLE_PULLOUT_USER_PARAMETER_KEYS.has(next.key)) next.uiVisibility = "user";
        else next.uiVisibility = "internal";
        if (next.key === "type") next.defaultValue = BASE_BOTTLE_PULLOUT_RUNTIME_TYPE;
        if (next.key === "displayName" || next.key === "ifcName") next.defaultValue = BASE_BOTTLE_PULLOUT_DISPLAY_NAME;
        if (next.key === "notes" || next.key === "ifcDescription") next.defaultValue = BASE_BOTTLE_PULLOUT_DESCRIPTION;
        if (next.key === "typeId" || next.key === "ifcTag") next.defaultValue = `${BASE_BOTTLE_PULLOUT_PACKAGE_ID}__type`;
        if (next.key === "family") next.defaultValue = "base";
        if (next.key === "width" || next.key === "widthMm") {
          next.defaultValue = 200;
          next.min = 150;
          next.max = 300;
          next.step = 10;
        }
        if (next.key === "height" || next.key === "heightMm" || next.key === "rowHeight" || next.key === "heightCarcass") next.defaultValue = 722;
        if (next.key === "depth" || next.key === "depthMm") next.defaultValue = 530;
        if (next.key === "variant") {
          next.defaultValue = "two_tier_single_front";
          next.options = [{ label: "two tier single front", value: "two_tier_single_front" }];
        }
        if (next.key === "drawerCount") {
          next.defaultValue = 2;
          next.min = 2;
          next.max = 2;
        }
        if (next.key === "drawerSystemBrand") {
          next.defaultValue = "merivobox";
          next.options = FWM_DRAWER_SYSTEM_BRAND_OPTIONS.map((option) => ({ label: option.label, value: option.value }));
        }
        if (next.key === "drawerSystem" || next.key === "drawerSystemSize") next.defaultValue = next.key === "drawerSystem" ? "merivobox" : "M";
        if (next.key === "drawerSystemSizes") next.defaultValue = "M,M";
        if (next.key === "drawerSystemLabels") next.defaultValue = "MERIVOBOX M,MERIVOBOX M";
        if (next.key === "drawerSystemMinFrontHeightsMm") next.defaultValue = "136,136";
        if (next.key === "drawerSystemBackHeightsMm") next.defaultValue = "83,83";
        if (next.key === "drawer1SystemSize" || next.key === "drawer2SystemSize") {
          next.defaultValue = "M";
          next.options = [
            { label: "Auto", value: "" },
            { label: "M", value: "M" },
            { label: "D", value: "D" },
            { label: "E", value: "E" },
            { label: "F", value: "F" }
          ];
        }
        if (next.key === "openingMode") next.defaultValue = "drawer";
        if (next.key === "requiresWorktop") next.defaultValue = true;
        if (next.key === "hasWorktop") next.defaultValue = false;
        if (next.key === "hasPlinth") next.defaultValue = true;
        return next;
      })
  };
  const parameterKeys = new Set(modulePackage.parameters.parameters.map((parameter) => parameter.key));
  modulePackage.ui = {
    ...modulePackage.ui,
    controls: BASE_BOTTLE_PULLOUT_UI_CONTROL_KEYS
      .filter((parameterKey) => parameterKeys.has(parameterKey))
      .map((parameterKey, order) => {
        const definition = modulePackage.parameters.parameters.find((parameter) => parameter.key === parameterKey);
        const controlType =
          parameterKey.endsWith("MaterialId") ? "materialPicker" :
          /^drawer[1-5]SystemSize$/.test(parameterKey) || parameterKey === "drawerSystemBrand" ? "select" :
          parameterKey === "opened" ? "checkbox" :
          "number";
        return {
          parameterKey,
          controlType,
          groupId: definition?.group ?? "general",
          order
        };
      })
  };
  modulePackage.materials = {
    ...modulePackage.materials,
    slots: modulePackage.materials.slots.filter((slot) => ["corpus", "front", "back", "drawer_bottom", "plinth"].includes(slot.slotId))
  };
  modulePackage.components = {
    ...modulePackage.components,
    slots: modulePackage.components.slots.filter((slot) => ["handle", "runner", "leg", "plinth_clip"].includes(slot.slotId))
  };
  modulePackage.behavior = modulePackage.behavior
    ? {
        ...modulePackage.behavior,
        contextBindings: modulePackage.behavior.contextBindings?.map((binding) => ({
          ...binding,
          materialSync: binding.materialSync?.filter((rule) => rule.targetParameter !== "shelfMaterialId"),
          componentSync: binding.componentSync?.filter((rule) => rule.targetParameter === "handleComponentId")
        }))
      }
    : modulePackage.behavior;
  if (modulePackage.geometry.mode === "trusted-runtime") {
    modulePackage.geometry = {
      ...modulePackage.geometry,
      parameterMapping: Object.fromEntries(
        Object.entries(modulePackage.geometry.parameterMapping ?? {}).filter(([key]) => parameterKeys.has(key))
      ) as Record<string, string>
    };
  }
  modulePackage.parameterPresets = {
    freeParameterKeys: MODULE_PRESET_FREE_PARAMETER_KEYS.filter((key) => parameterKeys.has(key) || key === "materialAssignments" || key === "commercialSelections"),
    presets: []
  };
  modulePackage.exports = {
    ...modulePackage.exports,
    exportTags: [...sourceSpec.tags],
    manufacturingCode: "BASE_BOTTLE_PULLOUT",
    notes: ["Narrow base bottle pull-out package using two internal drawer trays and one shared front."]
  };
  modulePackage.manufacturing = {
    ...modulePackage.manufacturing,
    notes: [
      "One full-height front is edge-banded as visible front board.",
      "Two internal trays reuse the shared drawer-system hardware and drawer-bottom material group."
    ]
  };
  return modulePackage;
}

function createWallCorner90ModulePackage(): FurnQuoteModulePackage {
  const sourceSpec = FWM_FURNITURE_SPECS.find((spec) => spec.moduleType === WALL_CORNER_90_RUNTIME_TYPE);
  if (!sourceSpec) throw new Error(`Missing ${WALL_CORNER_90_RUNTIME_TYPE} source spec.`);

  const wallCornerSpec: FwmFurnitureSpec = {
    ...sourceSpec,
    displayName: "Horna rohova skrinka 90",
    description: "Upper L-shaped 90-degree corner cabinet for DELFI-style kitchen groups. It uses the proven upper corner runtime geometry, two hinged fronts, real shelves, top-context height/depth sync, canonical material groups, and no plinth, legs, clips or worktop.",
    geometryKind: "corner",
    width: 600,
    height: 720,
    depth: 320,
    doors: 2,
    shelves: 2,
    hasWorktop: false,
    hasPlinth: false,
    wallMounted: true,
    glassFronts: false,
    variantOptions: ["corner_90"],
    placementContexts: ["kitchen_corner", "kitchen_wall", "wall_mounted"],
    kitchenRole: "top",
    tags: ["kitchen", "wall", "upper", "corner", "l_shape"]
  };

  const modulePackage = makePackage(wallCornerSpec);
  const displayName = "Horna rohova skrinka 90";
  const description = wallCornerSpec.description;
  modulePackage.module = {
    ...modulePackage.module,
    modulePackageId: WALL_CORNER_90_PACKAGE_ID,
    moduleType: WALL_CORNER_90_RUNTIME_TYPE,
    familyName: displayName,
    displayName,
    description,
    tags: [...wallCornerSpec.tags]
  };
  modulePackage.parameters = {
    ...modulePackage.parameters,
    parameters: modulePackage.parameters.parameters
      .filter((parameter) => WALL_CORNER_90_OWNED_PARAMETER_KEYS.has(parameter.key))
      .map((parameter) => {
        const next = { ...parameter };
        if (WALL_CORNER_90_USER_PARAMETER_KEYS.has(next.key)) next.uiVisibility = "user";
        else if (["variant", "doorCount", "cornerShape", "frontType", "openingMode", "mountingMode", "isCorner", "frontFaceCount", "backFaceCount", "requiresWorktop", "hasWorktop", "hasPlinth", "kitchenModuleRole"].includes(next.key)) next.uiVisibility = "technical";
        else next.uiVisibility = next.uiVisibility === "user" ? "internal" : next.uiVisibility;

        if (next.key === "type") next.defaultValue = WALL_CORNER_90_RUNTIME_TYPE;
        if (next.key === "displayName" || next.key === "ifcName") next.defaultValue = displayName;
        if (next.key === "notes") next.defaultValue = description;
        if (next.key === "ifcDescription") next.defaultValue = description;
        if (next.key === "ifcObjectType") next.defaultValue = "wall";
        if (next.key === "typeId" || next.key === "ifcTag") next.defaultValue = `${WALL_CORNER_90_PACKAGE_ID}__type`;
        if (next.key === "family") next.defaultValue = "wall";
        if (next.key === "width" || next.key === "widthMm") next.defaultValue = 600;
        if (next.key === "height" || next.key === "heightMm" || next.key === "rowHeight" || next.key === "heightCarcass") next.defaultValue = 720;
        if (next.key === "depth" || next.key === "depthMm") next.defaultValue = 320;
        if (next.key === "variant") {
          next.defaultValue = "corner_90";
          next.options = [{ label: "corner 90", value: "corner_90" }];
        }
        if (next.key === "doorCount") {
          next.defaultValue = 2;
          next.min = 2;
          next.max = 2;
        }
        if (next.key === "shelfCount") next.defaultValue = 2;
        if (next.key === "opened") next.defaultValue = true;
        if (next.key === "cornerShape") next.defaultValue = "l_shape";
        if (next.key === "frontType") next.defaultValue = "solid";
        if (next.key === "openingMode") next.defaultValue = "hinged";
        if (next.key === "side") next.defaultValue = "left";
        if (next.key === "boardThickness" || next.key === "frontThicknessMm" || next.key === "backThickness" || next.key === "shelfThickness") next.defaultValue = 18;
        if (next.key === "isCorner") next.defaultValue = true;
        if (next.key === "frontFaceCount") next.defaultValue = 0;
        if (next.key === "backFaceCount") next.defaultValue = 2;
        if (next.key === "requiresWorktop" || next.key === "hasWorktop" || next.key === "hasPlinth") next.defaultValue = false;
        if (next.key === "kitchenModuleRole") next.defaultValue = "top";
        if (next.key === "bodyMaterialGroup" || next.key === "shelfMaterialGroup") next.defaultValue = "corpus";
        if (next.key === "frontMaterialGroup") next.defaultValue = "front";
        if (next.key === "backMaterialGroup") next.defaultValue = "back";
        if (next.key === "worktopMaterialGroup") next.defaultValue = "";
        if (next.key === "drawerBoxMaterialGroup") next.defaultValue = "";
        return next;
      })
  };
  const parameterKeys = new Set(modulePackage.parameters.parameters.map((parameter) => parameter.key));
  modulePackage.ui = {
    ...modulePackage.ui,
    previewImage: getFwmModulePreviewImage(WALL_CORNER_90_PACKAGE_ID),
    controls: modulePackage.ui.controls.filter((control) => WALL_CORNER_90_USER_PARAMETER_KEYS.has(control.parameterKey))
  };
  modulePackage.materials = {
    ...modulePackage.materials,
    slots: modulePackage.materials.slots.filter((slot) => slot.slotId === "corpus" || slot.slotId === "front" || slot.slotId === "back")
  };
  modulePackage.placement = {
    ...modulePackage.placement,
    allowedContexts: ["kitchen_corner"],
    requiredAnchors: ["two_perpendicular_walls", "corner", "wall"],
    requiresCorner: true,
    requiresWall: true,
    requiresFloor: false,
    allowFreePlacement: false,
    corner: { required: true, allowedAngles: [90], toleranceDeg: 3, mustTouchBothWalls: true },
    wall: { mustAttachToWall: true }
  };
  modulePackage.behavior = modulePackage.behavior
    ? {
        ...modulePackage.behavior,
        contextBindings: modulePackage.behavior.contextBindings?.map((binding) => ({
          ...binding,
          materialSync: binding.materialSync?.map((rule) =>
            rule.targetParameter === "backMaterialId" ? { ...rule, thicknessParameter: undefined } : rule
          )
        }))
      }
    : modulePackage.behavior;
  if (modulePackage.geometry.mode === "trusted-runtime") {
    modulePackage.geometry = {
      ...modulePackage.geometry,
      parameterMapping: Object.fromEntries(
        Object.entries(modulePackage.geometry.parameterMapping ?? {}).filter(([key]) => parameterKeys.has(key))
      ) as Record<string, string>
    };
  }
  modulePackage.parameterPresets = {
    freeParameterKeys: MODULE_PRESET_FREE_PARAMETER_KEYS.filter((key) => parameterKeys.has(key) || key === "materialAssignments" || key === "commercialSelections"),
    presets: []
  };
  modulePackage.exports = {
    ...modulePackage.exports,
    manufacturingCode: "WALL_CORNER_90",
    notes: ["Upper 90-degree wall corner module package. Runtime builder is shared with the historical wall-cabinet implementation; package identity stays generic."]
  };
  return modulePackage;
}

export const extendedFurnitureModulePackages: FurnQuoteModulePackage[] = [
  ...FWM_FURNITURE_SPECS
    .filter((spec) => spec.moduleType !== BASE_BOTTLE_PULLOUT_RUNTIME_TYPE)
    .map(makePackage),
  createBaseBottlePulloutModulePackage(),
  createWallCorner90ModulePackage()
];
