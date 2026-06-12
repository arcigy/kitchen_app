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

const now = "2026-06-09T00:00:00.000Z";

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
  return [
    stringParam("typeId", "Type ID", typeId, "system"),
    stringParam("displayName", "Display name", spec.displayName, "system"),
    stringParam("family", "System family", family, "system"),
    stringParam("code", "Code", null, "system"),
    stringParam("version", "Version", "1.0.0", "system"),
    numberParam("widthMm", "System width", spec.width, 100, 5000, "system", "export", 1),
    numberParam("heightMm", "System height", spec.height, 50, 3200, "system", "export", 1),
    numberParam("depthMm", "System depth", spec.depth, 10, 2600, "system", "export", 1),
    selectParam("assemblyContext", "Assembly context", assemblyContext, ["kitchen", "generic", "wardrobe", "bathroom", "laundry"], "system", "placement"),
    selectParam("roomCategory", "Room category", getFwmRoomCategory(spec), ["kitchen", "living", "bedroom", "bathroom", "wardrobe", "office", "reception", "interior_cladding", "room"], "system", "placement"),
    selectParam("kitchenModuleRole", "Kitchen module role", spec.kitchenRole ?? null, ["base", "top", "wall", "tall"], "system", "placement", assemblyContext === "kitchen"),
    booleanParam("requiresWorktop", "Requires worktop", spec.hasWorktop === true, "system", "placement"),
    selectParam("frontSide", "Front side", "FRONT", ["FRONT"], "orientation", "placement"),
    selectParam("backSide", "Back side", "BACK", ["BACK"], "orientation", "placement"),
    selectParam("leftSide", "Left side", "LEFT", ["LEFT"], "orientation", "placement"),
    selectParam("rightSide", "Right side", "RIGHT", ["RIGHT"], "orientation", "placement"),
    selectParam("frontDirection", "Front direction", "+Z", ["+Z"], "orientation", "placement"),
    selectParam("backDirection", "Back direction", "-Z", ["-Z"], "orientation", "placement"),
    selectParam("leftDirection", "Left direction", "-X", ["-X"], "orientation", "placement"),
    selectParam("rightDirection", "Right direction", "+X", ["+X"], "orientation", "placement"),
    selectParam("worktopBackSide", "Worktop back side", "BACK", ["BACK"], "orientation", "placement"),
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
  const heightMax = spec.geometryKind === "wardrobe" || spec.geometryKind === "cladding" || spec.geometryKind === "tall" ? 3200 : 2600;
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
    numberParam("width", "Width", spec.width, 100, spec.geometryKind === "wall_unit" ? 5000 : 3600, "dimensions", "geometry", 10),
    numberParam("height", "Height", spec.height, 50, heightMax, "dimensions", "geometry", 10),
    numberParam("heightCarcass", "Carcass height", Math.max(50, spec.height - (spec.hasWorktop ? 38 : 0)), 50, 3200, "dimensions", "geometry", 10),
    numberParam("depth", "Depth", spec.depth, 10, spec.geometryKind === "bed" ? 2600 : 1400, "dimensions", "geometry", 10),
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
    numberParam("drawerCount", "Drawer count", spec.drawers ?? 0, 0, 12, "components", "geometry"),
    stringParam("drawerFrontHeightsMm", "Drawer front heights", "", "components", "geometry", false),
    numberParam("doorCount", "Door count", spec.doors ?? 0, 0, 12, "components", "geometry"),
    numberParam("shelfCount", "Shelf count", spec.shelves ?? 0, 0, 16, "components", "geometry"),
    numberParam("boardThickness", "Body board thickness", 18, 8, 60, "materials", "geometry"),
    numberParam("frontThicknessMm", "Front thickness", spec.glassFronts ? 6 : 18, 4, 50, "materials", "geometry"),
    numberParam("backThickness", "Back thickness", spec.geometryKind === "cladding" ? 0 : 8, 0, 30, "materials", "geometry"),
    numberParam("drawerBackGapMm", "Drawer back gap", 10, 0, 80, "advanced", "geometry"),
    numberParam("shelfThickness", "Shelf thickness", 18, 8, 50, "materials", "geometry"),
    numberParam("worktopThicknessMm", "Worktop thickness", spec.hasWorktop ? 38 : 0, 0, 100, "materials", "geometry"),
    numberParam("plinthHeight", "Plinth height", spec.hasPlinth ? 100 : 0, 0, 300, "dimensions", "geometry"),
    numberParam("plinthSetbackMm", "Plinth setback", spec.hasPlinth ? 60 : 0, 0, 300, "dimensions", "geometry"),
    numberParam("frontGap", "Front gap", 2, 0, 12, "advanced", "geometry"),
    numberParam("sideGap", "Side gap", 2, 0, 20, "advanced", "geometry"),
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
  return params;
}

function materialSlots(spec: FwmFurnitureSpec): ModuleMaterialSlot[] {
  const slots: ModuleMaterialSlot[] = [
    {
      slotId: "carcass",
      label: "Carcass",
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
      slotId: "shelf",
      label: "Shelves",
      required: false,
      defaultFrom: "catalog.kitchenDefaults.carcassMaterialId",
      allowedMaterialTags: ["body", "shelf", "board"],
      affects: ["geometry", "visual", "bom", "pricing"]
    },
    {
      slotId: "drawer_bottom",
      label: "Drawer bottoms",
      required: false,
      defaultFrom: "catalog.kitchenDefaults.drawerBottomMaterialId",
      allowedMaterialTags: ["drawer_bottom", "board"],
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
  if (spec.hasWorktop || spec.geometryKind === "table") {
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
  return {
    allowedContexts: [...spec.placementContexts],
    requiredAnchors: spec.wallMounted ? ["wall"] : spec.geometryKind === "corner" ? ["two_perpendicular_walls", "floor"] : ["floor"],
    requiresCorner: spec.geometryKind === "corner",
    requiresWall: spec.wallMounted || spec.placementContexts.includes("kitchen_wall"),
    requiresFloor: !spec.wallMounted && spec.geometryKind !== "cladding",
    allowFreePlacement: !spec.placementContexts.includes("kitchen_wall") || spec.placementContexts.includes("free_standing"),
    corner: spec.geometryKind === "corner" ? { required: true, allowedAngles: [90], toleranceDeg: 3, mustTouchBothWalls: true } : undefined,
    wall: spec.wallMounted || spec.placementContexts.includes("kitchen_wall") ? { mustAttachToWall: true, minWallLengthMm: Math.min(spec.width, 600) } : undefined,
    clearance: {
      frontMm: spec.geometryKind === "appliance" ? 900 : spec.geometryKind === "bed" ? 700 : 500,
      leftMm: spec.geometryKind === "bed" ? 500 : 0,
      rightMm: spec.geometryKind === "bed" ? 500 : 0
    },
    collision: { allowOverlap: false }
  };
}

function ui(spec: FwmFurnitureSpec): ModuleUiDefinition {
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
    "width",
    "height",
    "depth",
    "drawerCount",
    "doorCount",
    "shelfCount",
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
    "applianceWidthMm",
    "sinkBowlWidthMm",
    "sinkBowlDepthMm",
    "wallMounted",
    "glassFronts"
  ];
  const parameterGroup = new Map(baseParameters(spec).map((param) => [param.key, param.group ?? "general"]));
  const controls = keys.map((key, index) => {
    const groupId = parameterGroup.get(key) ?? "general";
    const controlType =
      key.endsWith("MaterialId") ? "materialPicker" :
      key.endsWith("ComponentId") ? "componentPicker" :
      key === "variant" ? "select" :
      key === "wallMounted" || key === "glassFronts" ? "checkbox" :
      "number";
    return { parameterKey: key, controlType, groupId, order: index };
  }) satisfies ModuleUiDefinition["controls"];
  return { icon: "box", groups, controls };
}

function kitchenBehavior(spec: FwmFurnitureSpec): FurnQuoteModulePackage["behavior"] | undefined {
  if (!spec.kitchenRole) return undefined;
  const materialSync = [
    { targetSlot: "carcass" as const, targetParameter: "bodyMaterialId", source: "ctx.corpusMaterialId", family: "body" as const, thicknessParameter: "boardThickness", aliases: ["body" as const] },
    { targetSlot: "front" as const, targetParameter: "frontMaterialId", source: "ctx.frontsMaterialId", family: "front" as const, thicknessParameter: "frontThicknessMm", aliases: ["front" as const] },
    { targetSlot: "back" as const, targetParameter: "backMaterialId", source: "ctx.backMaterialId", family: "back" as const, thicknessParameter: "backThickness", aliases: ["back" as const] },
    { targetSlot: "shelf" as const, targetParameter: "shelfMaterialId", source: "ctx.corpusMaterialId", family: "shelf" as const, thicknessParameter: "shelfThickness", aliases: ["shelf" as const] },
    { targetSlot: "drawer_bottom" as const, targetParameter: "drawerBottomMaterialId", source: "ctx.drawerBottomMaterialId", family: "drawer_bottom" as const, aliases: ["drawer_bottom" as const] },
    ...(spec.hasPlinth ? [{ targetSlot: "plinth" as const, targetParameter: "plinthMaterialId", source: "catalog.kitchenDefaults.plinthMaterialId", family: "body" as const }] : []),
    ...(spec.hasWorktop ? [{ targetSlot: "worktop" as const, targetParameter: "worktopMaterialId", source: "ctx.worktopMaterialId", family: "worktop" as const, thicknessParameter: "worktopThicknessMm", aliases: ["worktop" as const] }] : [])
  ];
  const componentSync = (spec.drawers ?? 0) > 0 || (spec.doors ?? 0) > 0
    ? [{ targetSlot: "handle" as const, targetParameter: "handleComponentId", source: "ctx.handleComponentId", componentType: "handle" as const, transforms: ["handleGeometryKind" as const, "componentNominalLength" as const] }]
    : [];
  return {
    contextBindings: [
      {
        contextType: "kitchenGroup",
        required: false,
        scope: "optional",
        autoAssign: "activeKitchenGroup",
        liveSync: true,
        parameterSync: [
          { targetParameter: "height", source: spec.kitchenRole === "top" ? "ctx.upperHeightMm" : spec.kitchenRole === "tall" ? "ctx.wallHeightMm" : "ctx.heightMm", transform: "identity", mode: "live" },
          { targetParameter: "heightCarcass", source: spec.kitchenRole === "top" ? "ctx.upperHeightMm" : spec.kitchenRole === "tall" ? "ctx.wallHeightMm" : "ctx.moduleHeightMm", transform: "identity", mode: "live" },
          { targetParameter: "depth", source: spec.kitchenRole === "top" ? "ctx.upperDepthMm" : "ctx.moduleDepthMm", transform: "identity", mode: "live" },
          ...(spec.hasPlinth
            ? [
                { targetParameter: "plinthHeight" as const, source: "ctx.plinthHeightMm", transform: "identity" as const, mode: "live" as const },
                { targetParameter: "plinthSetbackMm" as const, source: "ctx.plinthDepthMm", transform: "identity" as const, mode: "live" as const }
              ]
            : []),
          ...(spec.hasWorktop ? [{ targetParameter: "worktopThicknessMm" as const, source: "ctx.worktopThicknessMm", transform: "resolvedWorktopThickness" as const, mode: "live" as const }] : [])
        ],
        materialSync,
        componentSync,
        overridePolicy: { allowUserOverride: true, warnWhenDetachedFromContext: true }
      }
    ]
  };
}

function makePackage(spec: FwmFurnitureSpec): FurnQuoteModulePackage {
  const runtimeBuilderKey = getFwmRuntimeBuilderKey(spec.moduleType);
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
        width: { min: 100, max: spec.geometryKind === "wall_unit" ? 5000 : 3600, step: 10 },
        height: { min: 50, max: spec.geometryKind === "wardrobe" || spec.geometryKind === "cladding" || spec.geometryKind === "tall" ? 3200 : 2600, step: 10 },
        depth: { min: 10, max: spec.geometryKind === "bed" ? 2600 : 1400, step: 10 }
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
    bom: {
      rules: [
        {
          id: "carcass-board-area",
          itemType: "material",
          source: "materialSlot",
          sourceKey: "carcass",
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
    exports: {
      exportTags: [...spec.tags, "fwm"],
      manufacturingCode: spec.moduleType.toUpperCase(),
      notes: ["Generated system FWM package for trusted runtime furniture modules."]
    },
    manufacturing: {
      cncStrategy: spec.geometryKind === "cladding" ? "panel_cladding" : "panel_furniture",
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

export const extendedFurnitureModulePackages: FurnQuoteModulePackage[] = FWM_FURNITURE_SPECS.map(makePackage);
