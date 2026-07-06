import { PINO_SIDE_CABINET_SYSTEM } from "./catalog";
import { getPinoHandleByComponentId, type PinoHandlePlacementCode } from "./handleCatalog";

export type PinoSideCabinetComponentKind =
  | "flap_door"
  | "swing_door"
  | "fixed_shelf"
  | "adjustable_shelf"
  | "drawer"
  | "pullout"
  | "wire_shelf"
  | "broom_hook"
  | "cable_holder"
  | "open_niche";

export type PinoSideCabinetFrontSegment = {
  componentId: string;
  heightMm: number;
  count: number;
  nameRaw: string;
};

export type PinoSideCabinetInteriorComponent = {
  componentId: string;
  count: number;
  placement: string;
  nameRaw: string;
};

export type PinoSideCabinetCatalogRow = {
  articleCode: string;
  catalogKey: string;
  widthCm: number | null;
  widthMm: number;
  widthListedInCatalog: boolean;
  priceIndex: number | null;
  pricingReferenceRaw: string;
  priceGroupValues: Record<string, number>;
};

export type PinoSideCabinetProductGroup = {
  groupId: string;
  label: string;
  description: string;
  placementRules: {
    moduleClass: "tall_side" | "appliance_tall";
    kitchenZone: "tall" | "tall_appliance";
    requiresApplianceNiche: boolean;
    supportsWorktopTermination: boolean;
    cornerOnly: boolean;
  };
  compatibilityRules: {
    acceptsApplianceCategories: string[];
    recommendedUse: string;
    requiresOpenNicheFront: boolean;
    allowedFrontKinds: PinoSideCabinetComponentKind[];
    allowedInteriorKinds: PinoSideCabinetComponentKind[];
  };
};

export type PinoSideCabinetDefinition = {
  productGroupId: string;
  definitionId: string;
  productTemplateName: string;
  moduleLabel: string;
  articleFamily: string;
  variantCode: string | null;
  catalogKeys: string[];
  sourcePage: number;
  sourceImagePath: string;
  dimensionsMm: {
    height: number;
    depth: number;
    availableWidths: number[];
    defaultWidth: number;
  };
  frontStackTopDown: PinoSideCabinetFrontSegment[];
  interiorComponents: PinoSideCabinetInteriorComponent[];
  catalogRows: PinoSideCabinetCatalogRow[];
  sourceNotes: string[];
};

export type PinoSideCabinetSystem = {
  schemaVersion: "pino-side-cabinet-system.v1" | "pino-side-cabinet-system.v2";
  sourcePdf: string;
  sourcePage: number;
  systemId: string;
  displayName: string;
  commonDimensionsMm: {
    height: number;
    depth: number;
    plinthHeight: number;
    boardThickness: number;
    frontThickness: number;
    backThickness: number;
  };
  productGroups: PinoSideCabinetProductGroup[];
  componentLibrary: Record<string, { kind: PinoSideCabinetComponentKind; label: string }>;
  definitions: PinoSideCabinetDefinition[];
};

export type PinoSideCabinetParams = {
  type: "pino_side_cabinet";
  [key: string]: unknown;
  assemblyContext?: "kitchen" | "generic" | "wardrobe" | "bathroom" | "laundry" | null;
  kitchenModuleRole?: "base" | "top" | "tall" | null;
  requiresWorktop?: boolean;
  placementZone?: "tall" | "tall_appliance";
  groupId: string;
  definitionId: string;
  catalogKey: string;
  articleCode: string;
  priceGroup: "0" | "1" | "2" | "3" | "4" | "5";
  opened: boolean;
  width: number;
  height: number;
  depth: number;
  boardThickness: number;
  frontThicknessMm: number;
  backThickness: number;
  plinthHeight: number;
  frontGap: number;
  sideGap: number;
  shelfThickness: number;
  bodyMaterialId?: string | null;
  frontMaterialId?: string | null;
  backMaterialId?: string | null;
  shelfMaterialId?: string | null;
  plinthMaterialId?: string | null;
  handleComponentId?: string | null;
  handlePlacementCode?: PinoHandlePlacementCode | null;
  handleOffsetMm?: number | null;
  hingeComponentId?: string | null;
  runnerComponentId?: string | null;
  applianceCategory?: string | null;
  applianceModuleType?: PinoSideCabinetApplianceModuleType | null;
  applianceWidthMm?: number | null;
  applianceHeightMm?: number | null;
  applianceDepthMm?: number | null;
  applianceInstalled?: boolean;
  materialAssignments?: Record<string, string>;
  componentAssignments?: Record<string, string>;
};

export type PinoSideCabinetLayoutSegment = PinoSideCabinetFrontSegment & {
  yCenterMm: number;
  yTopMm: number;
  yBottomMm: number;
};

export type PinoSideCabinetLayout = {
  definition: PinoSideCabinetDefinition;
  widthMm: number;
  heightMm: number;
  depthMm: number;
  frontZoneTopMm: number;
  frontZoneBottomMm: number;
  frontSegments: PinoSideCabinetLayoutSegment[];
  catalogRow: PinoSideCabinetCatalogRow | null;
};

export type PinoSideCabinetProductChoice = {
  groupId: string;
  definitionId: string;
  label: string;
  articleFamily: string;
  variantCode: string | null;
  availableWidths: number[];
};

export type PinoSideCabinetApplianceOpening = {
  widthMm: number;
  heightMm: number;
  depthMm: number;
  yBottomMm: number;
  yTopMm: number;
  zBackMm: number;
  zFrontMm: number;
};

export type PinoSideCabinetApplianceProfile = {
  category: string;
  label: string;
  widthMm: number;
  heightMm: number;
  depthMm: number;
};

export type PinoSideCabinetApplianceModuleType =
  | "fwm_oven_tower_module"
  | "fwm_microwave_tower_module"
  | "pino_compact_appliance_insert";

const SYSTEM = PINO_SIDE_CABINET_SYSTEM as unknown as PinoSideCabinetSystem;
const APPLIANCE_PROFILES: Record<string, PinoSideCabinetApplianceProfile> = {
  oven_tall: {
    category: "oven_tall",
    label: "Tall oven",
    widthMm: 540,
    heightMm: 540,
    depthMm: 450
  },
  microwave_tall: {
    category: "microwave_tall",
    label: "Tall microwave",
    widthMm: 510,
    heightMm: 380,
    depthMm: 420
  },
  compact_appliance: {
    category: "compact_appliance",
    label: "Compact appliance",
    widthMm: 540,
    heightMm: 450,
    depthMm: 450
  }
};

const APPLIANCE_MODULE_TYPE_BY_CATEGORY: Record<string, PinoSideCabinetApplianceModuleType> = {
  oven_tall: "fwm_oven_tower_module",
  microwave_tall: "fwm_microwave_tower_module",
  compact_appliance: "pino_compact_appliance_insert"
};

function finiteNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function finiteString(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function fitSegmentHeights(heights: number[], availableHeight: number) {
  const fitted = [...heights];
  let total = fitted.reduce((sum, value) => sum + value, 0);
  let overflow = total - availableHeight;
  for (let index = fitted.length - 1; index >= 0 && overflow > 0; index -= 1) {
    const minHeight = fitted.length === 1 ? 140 : 90;
    const reducible = Math.max(0, fitted[index]! - minHeight);
    const reduction = Math.min(reducible, overflow);
    fitted[index] -= reduction;
    overflow -= reduction;
  }
  total = fitted.reduce((sum, value) => sum + value, 0);
  const leftover = Math.max(0, availableHeight - total);
  if (fitted.length > 0 && leftover > 0) {
    fitted[fitted.length - 1] += leftover;
  }
  return fitted;
}

export function getPinoSideCabinetSystem(): PinoSideCabinetSystem {
  return SYSTEM;
}

export function getPinoSideCabinetDefinitions(): PinoSideCabinetDefinition[] {
  return SYSTEM.definitions;
}

export function getPinoSideCabinetProductGroups(): PinoSideCabinetProductGroup[] {
  return SYSTEM.productGroups;
}

export function getPinoSideCabinetProductGroup(groupId: string): PinoSideCabinetProductGroup {
  return SYSTEM.productGroups.find((group) => group.groupId === groupId) ?? SYSTEM.productGroups[0]!;
}

export function getPinoSideCabinetDefinition(definitionId: string): PinoSideCabinetDefinition {
  return SYSTEM.definitions.find((definition) => definition.definitionId === definitionId) ?? SYSTEM.definitions[0]!;
}

export function getPinoSideCabinetDefinitionsForGroup(groupId: string): PinoSideCabinetDefinition[] {
  return SYSTEM.definitions.filter((definition) => definition.productGroupId === groupId);
}

export function getPinoSideCabinetProductChoicesForGroup(groupId: string): PinoSideCabinetProductChoice[] {
  return getPinoSideCabinetDefinitionsForGroup(groupId).map((definition) => ({
    groupId: definition.productGroupId,
    definitionId: definition.definitionId,
    label: definition.moduleLabel,
    articleFamily: definition.articleFamily,
    variantCode: definition.variantCode,
    availableWidths: [...definition.dimensionsMm.availableWidths]
  }));
}

export function getPinoSideCabinetApplianceProfile(category: string | null | undefined): PinoSideCabinetApplianceProfile | null {
  if (!category) return null;
  return APPLIANCE_PROFILES[category] ?? null;
}

export function getPinoSideCabinetApplianceProfilesForGroup(groupId: string): PinoSideCabinetApplianceProfile[] {
  const productGroup = getPinoSideCabinetProductGroup(groupId);
  return productGroup.compatibilityRules.acceptsApplianceCategories
    .map((category) => getPinoSideCabinetApplianceProfile(category))
    .filter((profile): profile is PinoSideCabinetApplianceProfile => profile != null);
}

export function getPinoSideCabinetApplianceModuleTypeForCategory(
  category: string | null | undefined
): PinoSideCabinetApplianceModuleType | null {
  if (!category) return null;
  return APPLIANCE_MODULE_TYPE_BY_CATEGORY[category] ?? null;
}

export function getPinoSideCabinetCatalogRow(definition: PinoSideCabinetDefinition, widthMm: number, catalogKey?: string | null) {
  if (catalogKey) {
    const explicit = definition.catalogRows.find((row) => row.catalogKey === catalogKey);
    if (explicit && explicit.widthMm === widthMm) return explicit;
  }
  return definition.catalogRows.find((row) => row.widthMm === widthMm) ?? definition.catalogRows[0] ?? null;
}

export function makeDefaultPinoSideCabinetParams(): PinoSideCabinetParams {
  const definition = SYSTEM.definitions[0]!;
  const common = SYSTEM.commonDimensionsMm;
  const width = definition.dimensionsMm.defaultWidth;
  const row = getPinoSideCabinetCatalogRow(definition, width);
  return normalizePinoSideCabinetParams({
    type: "pino_side_cabinet",
    assemblyContext: "kitchen",
    kitchenModuleRole: "tall",
    requiresWorktop: false,
    placementZone: definition.productGroupId === "appliance_tall" ? "tall_appliance" : "tall",
    groupId: definition.productGroupId,
    definitionId: definition.definitionId,
    articleCode: row?.articleCode ?? "",
    catalogKey: row?.catalogKey ?? definition.catalogKeys[0] ?? "",
    priceGroup: "3",
    opened: false,
    width,
    height: definition.dimensionsMm.height,
    depth: definition.dimensionsMm.depth,
    boardThickness: common.boardThickness,
    frontThicknessMm: common.frontThickness,
    backThickness: common.backThickness,
    plinthHeight: common.plinthHeight,
    frontGap: 3,
    sideGap: 2,
    shelfThickness: common.boardThickness,
    bodyMaterialId: "mat.pino.body.laminate.light_grey.18",
    frontMaterialId: "mat.pino.front.lacquer.white_matt.19",
    backMaterialId: "mat.pino.back.hdf.white.8",
    shelfMaterialId: "mat.pino.body.laminate.light_grey.18",
    plinthMaterialId: "mat.pino.body.laminate.light_grey.18",
    handleComponentId: "cmp.pino.handle.601",
    handlePlacementCode: "001",
    handleOffsetMm: 0,
    hingeComponentId: "cmp.pino.hinge.softclose",
    runnerComponentId: "cmp.pino.runner.full_extension"
  });
}

export function normalizePinoSideCabinetParams(params: PinoSideCabinetParams): PinoSideCabinetParams {
  const fallbackDefinition = SYSTEM.definitions[0]!;
  const requestedGroupId = finiteString(params.groupId, fallbackDefinition.productGroupId);
  const groupDefinitions = getPinoSideCabinetDefinitionsForGroup(requestedGroupId);
  const definitionPool = groupDefinitions.length > 0 ? groupDefinitions : SYSTEM.definitions;
  const requestedDefinitionId = finiteString(params.definitionId, definitionPool[0]!.definitionId);
  const definition = definitionPool.find((item) => item.definitionId === requestedDefinitionId) ?? definitionPool[0]!;
  const productGroup = getPinoSideCabinetProductGroup(definition.productGroupId);
  const common = SYSTEM.commonDimensionsMm;
  const allowedWidths = definition.dimensionsMm.availableWidths;
  const requestedWidth = Math.round(finiteNumber(params.width, definition.dimensionsMm.defaultWidth));
  const width = allowedWidths.includes(requestedWidth)
    ? requestedWidth
    : allowedWidths.reduce((best, candidate) =>
        Math.abs(candidate - requestedWidth) < Math.abs(best - requestedWidth) ? candidate : best,
        allowedWidths[0] ?? definition.dimensionsMm.defaultWidth
      );
  const row = getPinoSideCabinetCatalogRow(definition, width, params.catalogKey);
  const applianceProfiles = getPinoSideCabinetApplianceProfilesForGroup(definition.productGroupId);
  const requestedApplianceCategory = typeof params.applianceCategory === "string" ? params.applianceCategory.trim() : "";
  const selectedApplianceProfile =
    applianceProfiles.find((profile) => profile.category === requestedApplianceCategory) ??
    applianceProfiles[0] ??
    null;
  const allowedApplianceModuleTypes = applianceProfiles
    .map((profile) => getPinoSideCabinetApplianceModuleTypeForCategory(profile.category))
    .filter((value): value is PinoSideCabinetApplianceModuleType => value != null);
  const requestedApplianceModuleType =
    typeof params.applianceModuleType === "string" ? params.applianceModuleType.trim() : "";
  const applianceModuleType =
    (allowedApplianceModuleTypes.includes(requestedApplianceModuleType as PinoSideCabinetApplianceModuleType)
      ? requestedApplianceModuleType
      : getPinoSideCabinetApplianceModuleTypeForCategory(selectedApplianceProfile?.category ?? null) ??
        allowedApplianceModuleTypes[0] ??
        null) as PinoSideCabinetApplianceModuleType | null;
  const selectedHandle = getPinoHandleByComponentId(typeof params.handleComponentId === "string" ? params.handleComponentId.trim() : "");
  const allowedHandlePlacements = selectedHandle?.allowedPlacementCodes ?? ["001", "002", "006"];
  const requestedHandlePlacement = typeof params.handlePlacementCode === "string" ? params.handlePlacementCode.trim() : "";
  const handlePlacementCode = (allowedHandlePlacements.includes(requestedHandlePlacement as PinoHandlePlacementCode)
    ? requestedHandlePlacement
    : selectedHandle?.defaultPlacementCode ?? allowedHandlePlacements[0] ?? "001") as PinoHandlePlacementCode;
  return {
    ...params,
    type: "pino_side_cabinet",
    assemblyContext: "kitchen",
    kitchenModuleRole: "tall",
    requiresWorktop: false,
    placementZone: productGroup.placementRules.kitchenZone,
    groupId: definition.productGroupId,
    definitionId: definition.definitionId,
    articleCode: row?.articleCode ?? params.articleCode ?? "",
    catalogKey: row?.catalogKey ?? definition.catalogKeys[0] ?? "",
    priceGroup: ["0", "1", "2", "3", "4", "5"].includes(String(params.priceGroup)) ? (String(params.priceGroup) as PinoSideCabinetParams["priceGroup"]) : "3",
    opened: params.opened === true,
    width,
    height: clamp(Math.round(finiteNumber(params.height, definition.dimensionsMm.height)), 1000, 3000),
    depth: clamp(Math.round(finiteNumber(params.depth, definition.dimensionsMm.depth)), 300, 900),
    boardThickness: clamp(Math.round(finiteNumber(params.boardThickness, common.boardThickness)), 12, 40),
    frontThicknessMm: clamp(Math.round(finiteNumber(params.frontThicknessMm, common.frontThickness)), 12, 40),
    backThickness: clamp(Math.round(finiteNumber(params.backThickness, common.backThickness)), 3, 20),
    plinthHeight: clamp(Math.round(finiteNumber(params.plinthHeight, common.plinthHeight)), 0, 220),
    frontGap: clamp(Math.round(finiteNumber(params.frontGap, 3)), 0, 12),
    sideGap: clamp(Math.round(finiteNumber(params.sideGap, 2)), 0, 12),
    shelfThickness: clamp(Math.round(finiteNumber(params.shelfThickness, common.boardThickness)), 12, 40),
    handleComponentId: selectedHandle?.componentId ?? "cmp.pino.handle.601",
    handlePlacementCode,
    handleOffsetMm: clamp(Math.round(finiteNumber(params.handleOffsetMm, 0)), -220, 220),
    applianceCategory: selectedApplianceProfile?.category ?? null,
    applianceModuleType,
    applianceWidthMm: selectedApplianceProfile
      ? clamp(Math.round(finiteNumber(params.applianceWidthMm, selectedApplianceProfile.widthMm)), 100, 1200)
      : null,
    applianceHeightMm: selectedApplianceProfile
      ? clamp(Math.round(finiteNumber(params.applianceHeightMm, selectedApplianceProfile.heightMm)), 100, 2200)
      : null,
    applianceDepthMm: selectedApplianceProfile
      ? clamp(Math.round(finiteNumber(params.applianceDepthMm, selectedApplianceProfile.depthMm)), 100, 1200)
      : null,
    applianceInstalled: productGroup.placementRules.requiresApplianceNiche ? params.applianceInstalled !== false : false
  };
}

export function validatePinoSideCabinet(params: PinoSideCabinetParams): string[] {
  const normalized = normalizePinoSideCabinetParams(params);
  const definition = getPinoSideCabinetDefinition(normalized.definitionId);
  const layout = createPinoSideCabinetLayout(normalized);
  const errors: string[] = [];
  if (!definition.dimensionsMm.availableWidths.includes(normalized.width)) {
    errors.push("Width must match one of the catalog widths.");
  }
  if (!getPinoSideCabinetCatalogRow(definition, normalized.width, normalized.catalogKey)) {
    errors.push("Catalog key does not match the selected side cabinet definition and width.");
  }
  const frontStackHeight = definition.frontStackTopDown.reduce((sum, segment) => sum + segment.heightMm, 0);
  if (frontStackHeight > normalized.height) {
    errors.push("Front stack is taller than the cabinet.");
  }
  const lowestFront = layout.frontSegments.at(-1);
  if (lowestFront && lowestFront.yBottomMm < normalized.plinthHeight + Math.max(2, normalized.frontGap)) {
    errors.push("Front stack enters the plinth zone.");
  }
  for (let index = 1; index < layout.frontSegments.length; index += 1) {
    const previous = layout.frontSegments[index - 1]!;
    const current = layout.frontSegments[index]!;
    if (Math.abs(previous.yBottomMm - current.yTopMm) > 1) {
      errors.push("Front stack contains a discontinuity between segments.");
      break;
    }
  }
  return errors;
}

export function getPinoSideCabinetChoiceList() {
  return SYSTEM.productGroups.flatMap((group) => getPinoSideCabinetProductChoicesForGroup(group.groupId));
}

export function validatePinoSideCabinetDefinitionRules(definition: PinoSideCabinetDefinition): string[] {
  const group = getPinoSideCabinetProductGroup(definition.productGroupId);
  const errors: string[] = [];
  const frontKinds = definition.frontStackTopDown.map((segment) => segment.componentId as PinoSideCabinetComponentKind);
  const interiorKinds = definition.interiorComponents.map((component) => component.componentId as PinoSideCabinetComponentKind);

  for (const kind of frontKinds) {
    if (!group.compatibilityRules.allowedFrontKinds.includes(kind)) {
      errors.push(`Front kind ${kind} is not allowed for group ${group.groupId}.`);
    }
  }

  for (const kind of interiorKinds) {
    if (!group.compatibilityRules.allowedInteriorKinds.includes(kind)) {
      errors.push(`Interior kind ${kind} is not allowed for group ${group.groupId}.`);
    }
  }

  if (group.compatibilityRules.requiresOpenNicheFront && !frontKinds.includes("open_niche")) {
    errors.push(`Group ${group.groupId} requires an open niche front segment.`);
  }

  if (!group.compatibilityRules.requiresOpenNicheFront && frontKinds.includes("open_niche")) {
    errors.push(`Group ${group.groupId} must not expose an appliance niche front segment.`);
  }

  return errors;
}

export function getPinoSideCabinetApplianceOpening(params: PinoSideCabinetParams): PinoSideCabinetApplianceOpening | null {
  const normalized = normalizePinoSideCabinetParams(params);
  const layout = createPinoSideCabinetLayout(normalized);
  const nicheSegment = layout.frontSegments.find((segment) => segment.componentId === "open_niche");
  if (!nicheSegment) return null;

  const widthMm = Math.max(1, normalized.width - normalized.boardThickness * 2 - 14);
  const zBackMm = -normalized.depth * 0.5 + normalized.backThickness + 8;
  const zFrontMm = normalized.depth * 0.5 - normalized.frontThicknessMm - 26;
  const depthMm = Math.max(120, zFrontMm - zBackMm);
  const heightMm = Math.max(120, nicheSegment.heightMm - normalized.boardThickness * 2);

  return {
    widthMm,
    heightMm,
    depthMm,
    yBottomMm: nicheSegment.yBottomMm + normalized.boardThickness,
    yTopMm: nicheSegment.yTopMm - normalized.boardThickness,
    zBackMm,
    zFrontMm
  };
}

export function createPinoSideCabinetLayout(params: PinoSideCabinetParams): PinoSideCabinetLayout {
  const normalized = normalizePinoSideCabinetParams(params);
  const definition = getPinoSideCabinetDefinition(normalized.definitionId);
  const topReveal = Math.max(4, normalized.frontGap);
  const bottomReveal = normalized.plinthHeight + Math.max(2, normalized.frontGap);
  const frontZoneTopMm = normalized.height - topReveal;
  const frontZoneBottomMm = bottomReveal;
  const availableFrontHeight = Math.max(200, frontZoneTopMm - frontZoneBottomMm);
  const fittedHeights = fitSegmentHeights(
    definition.frontStackTopDown.map((segment) => segment.heightMm),
    availableFrontHeight
  );
  let cursorTop = frontZoneTopMm;
  const frontSegments = definition.frontStackTopDown.map((segment, index) => {
    const segmentHeight = fittedHeights[index] ?? segment.heightMm;
    const yTopMm = cursorTop;
    const yBottomMm = yTopMm - segmentHeight;
    cursorTop = yBottomMm;
    return {
      ...segment,
      heightMm: segmentHeight,
      yCenterMm: yBottomMm + segmentHeight / 2,
      yTopMm,
      yBottomMm
    };
  });
  return {
    definition,
    widthMm: normalized.width,
    heightMm: normalized.height,
    depthMm: normalized.depth,
    frontZoneTopMm,
    frontZoneBottomMm,
    frontSegments,
    catalogRow: getPinoSideCabinetCatalogRow(definition, normalized.width, normalized.catalogKey)
  };
}
