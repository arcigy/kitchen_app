import type { PortableJsonValue } from "../runtime/portableTypes";
import {
  FWM_FURNITURE_SPECS,
  getFwmAssemblyContext,
  getFwmFurnitureSpec,
  getFwmRoomCategory,
  getFwmSystemFamily,
  type FwmFurnitureModuleType
} from "./definitions";

const MAX_INDEXED_DRAWER_PARAMS = 5;
const MAX_TALL_STACK_SLOTS = 12;
const TALL_STACK_SLOT_TYPES = ["empty", "drawer", "shelf", "oven", "sink", "microwave", "door"] as const;
const DEFAULT_TALL_STACK_SLOTS: Array<{ type: (typeof TALL_STACK_SLOT_TYPES)[number]; height: number }> = [];

export type FwmFurnitureParams = {
  type: FwmFurnitureModuleType;
} & Record<string, PortableJsonValue>;

function num(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function bool(value: unknown, fallback: boolean) {
  return typeof value === "boolean" ? value : fallback;
}

function text(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function count(value: unknown, fallback: number, max: number) {
  return clamp(Math.round(num(value, fallback)), 0, max);
}

function parsePositiveCsvNumbers(value: unknown) {
  return typeof value === "string"
    ? value.split(",").map((entry) => Number(entry.trim())).filter((entry) => Number.isFinite(entry) && entry > 0)
    : [];
}

function indexedDrawerFrontHeights(params: Record<string, PortableJsonValue>, drawerCount: number) {
  const values = Array.from({ length: drawerCount }, (_, index) => num(params[`drawer${index + 1}FrontHeightMm`], 0));
  return values.length === drawerCount && values.every((value) => value > 0) ? values : [];
}

function resolveDrawerFrontHeights(params: Record<string, PortableJsonValue>, drawerCount: number) {
  if (drawerCount <= 0) return [];
  const height = num(params.height, 720);
  const plinth = num(params.plinthHeight, 0);
  const gap = num(params.frontGap, 2);
  const frontAreaHeight = Math.max(80, height - plinth - gap * 2);
  const availableHeight = Math.max(40, frontAreaHeight - gap * (drawerCount - 1));
  const rawHeights = indexedDrawerFrontHeights(params, drawerCount).length > 0
    ? indexedDrawerFrontHeights(params, drawerCount)
    : parsePositiveCsvNumbers(params.drawerFrontHeightsMm);
  const requestedSum = rawHeights.length === drawerCount ? rawHeights.reduce((sum, entry) => sum + entry, 0) : 0;
  return requestedSum > 0
    ? rawHeights.map((entry) => Math.max(40, (entry / requestedSum) * availableHeight))
    : Array.from({ length: drawerCount }, () => Math.max(40, availableHeight / drawerCount));
}

function nearestStep(value: number, step: number) {
  return Math.round(value / step) * step;
}

function isWallCornerVariant(spec: ReturnType<typeof getFwmFurnitureSpec>, params: Record<string, PortableJsonValue>) {
  const variant = text(params.variant, spec.variantOptions?.[0] ?? "");
  return spec.moduleType === "fwm_catalog_wall_cabinet" && variant.startsWith("corner_");
}

function usesUnifiedCornerDepth(spec: ReturnType<typeof getFwmFurnitureSpec>, params: Record<string, PortableJsonValue>) {
  const variant = text(params.variant, spec.variantOptions?.[0] ?? "");
  return spec.moduleType === "fwm_catalog_base_corner" && variant.includes("chamfered");
}

function isLowerChamferedCorner(spec: ReturnType<typeof getFwmFurnitureSpec>, params: Record<string, PortableJsonValue>) {
  return spec.moduleType === "fwm_catalog_base_corner" &&
    spec.kitchenRole === "low" &&
    text(params.variant, spec.variantOptions?.[0] ?? "").includes("chamfered");
}

function hasNoBackPanel(spec: ReturnType<typeof getFwmFurnitureSpec>) {
  return ["cladding", "worktop", "shelf_surface", "trim", "front_component", "accessory"].includes(spec.geometryKind);
}

function isSurfaceLike(spec: ReturnType<typeof getFwmFurnitureSpec>) {
  return ["cladding", "worktop", "shelf_surface", "trim", "front_component"].includes(spec.geometryKind);
}

function requiresExternalKitchenWorktop(spec: ReturnType<typeof getFwmFurnitureSpec>, params: FwmFurnitureParams) {
  return spec.geometryKind !== "worktop" && params.requiresWorktop !== false && (spec.hasWorktop === true || spec.moduleType === "fwm_catalog_base_corner");
}

export function makeDefaultFwmFurnitureParams(type: FwmFurnitureModuleType): FwmFurnitureParams {
  const spec = getFwmFurnitureSpec(type);
  const typeId = `${type}__type`;
  const requiresWorktop = spec.geometryKind !== "worktop" && (spec.hasWorktop === true || type === "fwm_catalog_base_corner");
  return normalizeFwmFurnitureParams({
    typeId,
    type,
    displayName: spec.displayName,
    family: getFwmSystemFamily(spec),
    code: null,
    version: "1.0.0",
    widthMm: spec.width,
    heightMm: spec.height,
    depthMm: spec.depth,
    assemblyContext: getFwmAssemblyContext(spec),
    roomCategory: getFwmRoomCategory(spec),
    kitchenModuleRole: spec.kitchenRole ?? null,
    requiresWorktop,
    hasWorktop: spec.geometryKind === "worktop",
    hasPlinth: spec.hasPlinth === true,
    frontSide: "FRONT",
    backSide: "BACK",
    leftSide: "LEFT",
    rightSide: "RIGHT",
    frontDirection: "+Z",
    backDirection: "-Z",
    leftDirection: "-X",
    rightDirection: "+X",
    worktopBackSide: "BACK",
    positionXmm: 0,
    positionYmm: 0,
    positionZmm: 0,
    rotationZDeg: 0,
    customPriceOverride: null,
    pricingEnabled: true,
    priceSource: "calculated",
    costOverride: null,
    quantity: 1,
    isActive: true,
    isVisible: true,
    isLocked: false,
    isValid: true,
    validationErrors: [],
    notes: null,
    tags: [...spec.tags],
    createdAt: "2026-06-09T00:00:00.000Z",
    updatedAt: "2026-06-09T00:00:00.000Z",
    exportToIfc: true,
    ifcClass: "IfcFurniture",
    ifcPredefinedType: null,
    ifcName: spec.displayName,
    ifcDescription: `${spec.displayName} (${type})`,
    ifcObjectType: getFwmSystemFamily(spec),
    ifcTag: typeId,
    classificationCode: null,
    classificationSystem: null,
    bodyMaterialGroup: "corpus",
    frontMaterialGroup: "front",
    backMaterialGroup: "back",
    shelfMaterialGroup: "corpus",
    worktopMaterialGroup: "worktop",
    drawerBoxMaterialGroup: "drawer_box",
    width: spec.width,
    height: spec.height,
    depth: spec.depth,
    drawerCount: spec.drawers ?? 0,
    hasCutleryInnerDrawer: false,
    cutleryInnerDrawerAllowed: false,
    cutleryInnerDrawerStatus: "disabled",
    cutleryInnerDrawerTargetIndex: 0,
    cutleryInnerDrawerWidthMm: 0,
    cutleryInnerDrawerDepthMm: 0,
    cutleryInnerDrawerFrontWidthMm: 0,
    cutleryInnerDrawerCrossRailWidthMm: 0,
    drawerFrontHeightsMm: "",
    drawer1FrontHeightMm: 40,
    drawer2FrontHeightMm: 40,
    drawer3FrontHeightMm: 40,
    drawer4FrontHeightMm: 40,
    drawer5FrontHeightMm: 40,
    doorCount: spec.doors ?? 0,
    shelfCount: spec.shelves ?? 0,
    shelfGaps: "",
    tallStackMode: type === "fwm_catalog_tall_cabinet" ? "builder" : "fixed",
    tallSlotCount: type === "fwm_catalog_tall_cabinet" ? DEFAULT_TALL_STACK_SLOTS.length : 0,
    tallSlot1Type: "empty",
    tallSlot1HeightMm: 0,
    tallSlot1OffsetMm: 0,
    tallSlot2Type: "empty",
    tallSlot2HeightMm: 0,
    tallSlot2OffsetMm: 0,
    tallSlot3Type: "empty",
    tallSlot3HeightMm: 0,
    tallSlot3OffsetMm: 0,
    tallSlot4Type: "empty",
    tallSlot4HeightMm: 0,
    tallSlot4OffsetMm: 0,
    tallSlot5Type: "empty",
    tallSlot5HeightMm: 0,
    tallSlot5OffsetMm: 0,
    tallSlot6Type: "empty",
    tallSlot6HeightMm: 0,
    tallSlot6OffsetMm: 0,
    tallSlot7Type: "empty",
    tallSlot7HeightMm: 0,
    tallSlot7OffsetMm: 0,
    tallSlot8Type: "empty",
    tallSlot8HeightMm: 0,
    tallSlot8OffsetMm: 0,
    tallSlot9Type: "empty",
    tallSlot9HeightMm: 0,
    tallSlot9OffsetMm: 0,
    tallSlot10Type: "empty",
    tallSlot10HeightMm: 0,
    tallSlot10OffsetMm: 0,
    tallSlot11Type: "empty",
    tallSlot11HeightMm: 0,
    tallSlot11OffsetMm: 0,
    tallSlot12Type: "empty",
    tallSlot12HeightMm: 0,
    tallSlot12OffsetMm: 0,
    tallDoorOpeningMode: "lift_up",
    boardThickness: 18,
    backThickness: spec.geometryKind === "cladding" ? 0 : 8,
    frontThicknessMm: 18,
    shelfThickness: 18,
    worktopThicknessMm: requiresWorktop || spec.geometryKind === "worktop" ? 38 : 0,
    plinthHeight: spec.hasPlinth ? 100 : 0,
    plinthSetbackMm: spec.hasPlinth ? 60 : 0,
    kitchenEndClosureLeft: false,
    kitchenEndClosureRight: false,
    kitchenEndClosureBackGapMm: 0,
    frontGap: 2,
    sideGap: 2,
    side: spec.geometryKind === "corner" ? "left" : "none",
    endingSide: "none",
    endingShape: type === "fwm_catalog_wall_open_end" ? "chamfered" : "none",
    cornerShape: type === "fwm_catalog_base_corner" ? "chamfered" : spec.geometryKind === "corner" ? "l_shape" : "none",
    handleType: spec.drawers || spec.doors ? "bar" : "none",
    handleLengthMm: 160,
    handleProjectionMm: 28,
    handleSizeMm: 16,
    applianceWidthMm: spec.appliance ? Math.min(spec.width - 80, 600) : 0,
    sinkBowlWidthMm: spec.geometryKind === "sink" || spec.geometryKind === "bathroom" ? 520 : 0,
    sinkBowlDepthMm: spec.geometryKind === "sink" || spec.geometryKind === "bathroom" ? 400 : 0,
    variant: spec.variantOptions?.[0] ?? "default",
    wallMounted: spec.wallMounted ?? false,
    glassFronts: spec.glassFronts ?? false,
    reserveModule: spec.reserve ?? false,
    bodyMaterialId: "",
    frontMaterialId: "",
    backMaterialId: "",
    shelfMaterialId: "",
    drawerBottomMaterialId: "",
    plinthMaterialId: "",
    worktopMaterialId: "",
    handleComponentId: "",
    hingeComponentId: "",
    legComponentId: spec.hasPlinth ? "cmp.leg.adjustable.100.black" : "",
    clipComponentId: spec.hasPlinth ? "cmp.clip.plinth.standard" : ""
  } as FwmFurnitureParams);
}

export function normalizeFwmFurnitureParams(params: FwmFurnitureParams): FwmFurnitureParams {
  const spec = getFwmFurnitureSpec(params.type);
  const next = { ...params } as FwmFurnitureParams;
  const typeId = `${spec.moduleType}__type`;
  next.type = spec.moduleType as FwmFurnitureModuleType;
  next.typeId = text(next.typeId, typeId);
  next.displayName = text(next.displayName, spec.displayName);
  next.family = text(next.family, getFwmSystemFamily(spec));
  next.code = typeof next.code === "string" ? next.code : null;
  next.version = text(next.version, "1.0.0");
  next.assemblyContext = text(next.assemblyContext, getFwmAssemblyContext(spec));
  next.roomCategory = text(next.roomCategory, getFwmRoomCategory(spec));
  const explicitRequiresWorktop = params.requiresWorktop === true;
  const externalKitchenWorktop = requiresExternalKitchenWorktop(spec, params);
  const ownsWorktopGeometry = spec.geometryKind === "worktop";
  const suppressWorktop = (!ownsWorktopGeometry && params.requiresWorktop === false) || num(params.worktopThicknessMm, spec.hasWorktop ? 38 : 0) <= 0;
  const suppressPlinth = params.hasPlinth === false;
  next.kitchenModuleRole = spec.kitchenRole ?? null;
  next.requiresWorktop = explicitRequiresWorktop || externalKitchenWorktop || (ownsWorktopGeometry && params.requiresWorktop !== false);
  next.hasWorktop = ownsWorktopGeometry && !suppressWorktop;
  next.frontSide = "FRONT";
  next.backSide = "BACK";
  next.leftSide = "LEFT";
  next.rightSide = "RIGHT";
  next.frontDirection = "+Z";
  next.backDirection = "-Z";
  next.leftDirection = "-X";
  next.rightDirection = "+X";
  next.worktopBackSide = "BACK";
  next.positionXmm = num(next.positionXmm, 0);
  next.positionYmm = num(next.positionYmm, 0);
  next.positionZmm = num(next.positionZmm, 0);
  next.rotationZDeg = num(next.rotationZDeg, 0);
  next.customPriceOverride = typeof next.customPriceOverride === "number" ? next.customPriceOverride : null;
  next.pricingEnabled = bool(next.pricingEnabled, true);
  next.priceSource = text(next.priceSource, "calculated");
  next.costOverride = typeof next.costOverride === "number" ? next.costOverride : null;
  next.quantity = Math.max(1, Math.round(num(next.quantity, 1)));
  next.isActive = bool(next.isActive, true);
  next.isVisible = bool(next.isVisible, true);
  next.isLocked = bool(next.isLocked, false);
  next.isValid = bool(next.isValid, true);
  next.validationErrors = Array.isArray(next.validationErrors) ? next.validationErrors : [];
  next.notes = typeof next.notes === "string" ? next.notes : null;
  next.tags = Array.isArray(next.tags) ? next.tags : [...spec.tags];
  next.createdAt = text(next.createdAt, "2026-06-09T00:00:00.000Z");
  next.updatedAt = text(next.updatedAt, "2026-06-09T00:00:00.000Z");
  next.exportToIfc = bool(next.exportToIfc, true);
  next.ifcClass = text(next.ifcClass, "IfcFurniture");
  next.ifcPredefinedType = typeof next.ifcPredefinedType === "string" ? next.ifcPredefinedType : null;
  next.ifcName = text(next.ifcName, spec.displayName);
  next.ifcDescription = text(next.ifcDescription, `${spec.displayName} (${spec.moduleType})`);
  next.ifcObjectType = text(next.ifcObjectType, getFwmSystemFamily(spec));
  next.ifcTag = text(next.ifcTag, typeId);
  next.classificationCode = typeof next.classificationCode === "string" ? next.classificationCode : null;
  next.classificationSystem = typeof next.classificationSystem === "string" ? next.classificationSystem : null;
  next.bodyMaterialGroup = "corpus";
  next.frontMaterialGroup = "front";
  next.backMaterialGroup = "back";
  next.shelfMaterialGroup = "corpus";
  next.worktopMaterialGroup = "worktop";
  next.drawerBoxMaterialGroup = "drawer_box";

  const widthMax = spec.geometryKind === "worktop" || spec.geometryKind === "accessory" || spec.geometryKind === "trim" || spec.geometryKind === "cladding" || spec.geometryKind === "wall_unit" ? 5000 : 3600;
  const heightMax = spec.geometryKind === "worktop" || spec.geometryKind === "shelf_surface" || spec.geometryKind === "trim" || spec.geometryKind === "accessory"
    ? 1200
    : spec.geometryKind === "cladding" || spec.geometryKind === "wardrobe" || spec.geometryKind === "tall" || (spec.geometryKind === "open_end" && spec.kitchenRole === "tall")
      ? 3200
      : spec.geometryKind === "bed"
        ? 1400
        : 2600;
  const minHeight = spec.geometryKind === "worktop" || spec.geometryKind === "shelf_surface" || spec.geometryKind === "trim" || spec.geometryKind === "front_component" || spec.geometryKind === "accessory" ? 1 : 50;
  const depthMax = spec.geometryKind === "worktop" ? 2600 : spec.geometryKind === "bed" ? 2600 : spec.geometryKind === "island" ? 1400 : 1200;

  next.width = nearestStep(clamp(num(next.width, spec.width), 100, widthMax), 1);
  next.height = nearestStep(clamp(num(next.height, spec.height), minHeight, heightMax), 1);
  next.depth = nearestStep(clamp(num(next.depth, spec.depth), 10, depthMax), 1);
  if (usesUnifiedCornerDepth(spec, next)) {
    next.width = next.depth;
  }
  next.widthMm = next.width;
  next.heightMm = next.height;
  next.depthMm = next.depth;
  next.boardThickness = clamp(Math.round(num(next.boardThickness, isSurfaceLike(spec) ? num(next.height, spec.height) : 18)), 4, 100);
  next.backThickness = hasNoBackPanel(spec) ? 0 : clamp(num(next.backThickness, 8), 0, Math.min(30, Math.max(0, num(next.depth, spec.depth) - 1)));
  next.drawerBackGapMm = clamp(num(next.drawerBackGapMm, 10), 0, 80);
  next.frontThicknessMm = clamp(Math.round(num(next.frontThicknessMm, 18)), 4, 50);
  next.shelfThickness = clamp(Math.round(num(next.shelfThickness, num(next.boardThickness, 18))), 8, 50);
  next.worktopThicknessMm = (next.requiresWorktop || ownsWorktopGeometry) && !suppressWorktop ? clamp(Math.round(num(next.worktopThicknessMm, 38)), 10, 100) : 0;
  next.plinthHeight = spec.hasPlinth && !suppressPlinth ? clamp(Math.round(num(next.plinthHeight, 100)), 0, Math.max(0, num(next.height, spec.height) - 120)) : 0;
  next.plinthSetbackMm = spec.hasPlinth && !suppressPlinth ? clamp(Math.round(num(next.plinthSetbackMm, 60)), 0, Math.max(0, num(next.depth, spec.depth) / 2)) : 0;
  next.kitchenEndClosureLeft = bool(next.kitchenEndClosureLeft, false);
  next.kitchenEndClosureRight = bool(next.kitchenEndClosureRight, false);
  next.kitchenEndClosureBackGapMm = clamp(Math.round(num(next.kitchenEndClosureBackGapMm, 0)), 0, 1200);
  next.hasPlinth = spec.hasPlinth === true && next.plinthHeight > 0;
  next.frontGap = clamp(num(next.frontGap, 2), 0, 12);
  next.sideGap = clamp(num(next.sideGap, 2), 0, 20);
  next.side = spec.geometryKind === "corner"
    ? (text(next.side, "left") === "right" ? "right" : "left")
    : spec.moduleType === "fwm_catalog_wall_open_end"
      ? (text(next.side, "right") === "left" ? "left" : "right")
      : text(next.side, "none");
  next.endingSide = spec.moduleType === "fwm_catalog_wall_open_end" ? next.side : text(next.endingSide, "none");
  const endingShape = text(next.endingShape, "");
  const variantShape = text(next.variant, spec.variantOptions?.[0] ?? "").includes("rounded") ? "rounded" : "chamfered";
  next.endingShape = spec.moduleType === "fwm_catalog_wall_open_end"
    ? endingShape === "rounded" ? "rounded" : endingShape === "chamfered" ? "chamfered" : variantShape
    : text(next.endingShape, "none");
  const variantValue = text(next.variant, spec.variantOptions?.[0] ?? "default");
  next.cornerShape = spec.moduleType === "fwm_catalog_base_corner"
    ? variantValue.includes("chamfered") ? "chamfered" : variantValue.includes("90") ? "l_shape" : "blind"
    : isWallCornerVariant(spec, next)
      ? variantValue.includes("chamfered") ? "chamfered" : variantValue.includes("90") ? "l_shape" : "blind"
      : text(next.cornerShape, spec.geometryKind === "corner" ? "l_shape" : "none");
  if (isLowerChamferedCorner(spec, next)) {
    const requestedVersion = num(params.geometryContractVersion, 3);
    next.geometryContractVersion = requestedVersion >= 3 ? 3 : requestedVersion === 2 ? 3 : 1;
  }
  next.handleType = ["none", "bar", "knob", "profile", "push"].includes(text(next.handleType, "none")) ? text(next.handleType, "none") : "none";
  next.drawerCount = count(next.drawerCount, spec.drawers ?? 0, 12);
  next.drawerFrontHeightsMm = typeof next.drawerFrontHeightsMm === "string" ? next.drawerFrontHeightsMm.trim() : "";
  const drawerHeights = resolveDrawerFrontHeights(next, next.drawerCount as number);
  for (let index = 0; index < MAX_INDEXED_DRAWER_PARAMS; index += 1) {
    const drawerIndex = index + 1;
    next[`drawer${drawerIndex}FrontHeightMm`] = drawerHeights[index] ? Math.round(drawerHeights[index] * 1000) / 1000 : 0;
  }
  const topDrawerIndex = next.drawerCount as number;
  const supportsCutleryInnerDrawer = spec.moduleType === "fwm_catalog_base_drawers";
  const cutleryAllowed = supportsCutleryInnerDrawer && topDrawerIndex > 0;
  const cabinetInnerWidth = Math.max(60, num(next.width, spec.width) - num(next.boardThickness, 18) * 2);
  const drawerDepth = Math.max(100, num(next.depth, spec.depth) - num(next.backThickness, 8) - 58);
  next.hasCutleryInnerDrawer = supportsCutleryInnerDrawer ? bool(next.hasCutleryInnerDrawer, false) : false;
  next.cutleryInnerDrawerAllowed = cutleryAllowed;
  next.cutleryInnerDrawerStatus = !next.hasCutleryInnerDrawer
    ? "disabled"
    : cutleryAllowed
    ? "enabled"
      : "disabled_no_drawer";
  next.cutleryInnerDrawerTargetIndex = cutleryAllowed ? topDrawerIndex : 0;
  next.cutleryInnerDrawerWidthMm = cutleryAllowed ? Math.round(Math.max(60, cabinetInnerWidth - 24) * 1000) / 1000 : 0;
  next.cutleryInnerDrawerDepthMm = cutleryAllowed ? Math.round(Math.max(100, drawerDepth - 48) * 1000) / 1000 : 0;
  next.cutleryInnerDrawerFrontWidthMm = next.cutleryInnerDrawerWidthMm;
  next.cutleryInnerDrawerCrossRailWidthMm = next.cutleryInnerDrawerWidthMm;
  next.drawerFrontHeightsMm = drawerHeights.map((height) => String(Math.round(height * 1000) / 1000)).join(",");
  const legacyDrawerKeys = [
    "drawerSystem", "drawerSystemBrand", "drawerSystemSize", "drawerSystemSizes", "drawerSystemLabels",
    "drawerSystemMinFrontHeightsMm", "drawerSystemDepthMm", "drawerBottomDepthDeductionMm",
    "drawerBottomWidthDeductionMm", "drawerBackWidthDeductionMm", "drawerBackHeightDeductionMm",
    "drawerSystemBackHeightsMm", "cutleryInsertWidthDeductionMm", "cutleryInsertDepthDeductionMm",
    "innerDrawerFrontDeductionMm", "innerDrawerCrossRailDeductionMm", "drawerSystemPricePerSet",
    "drawerSystemPriceWithMargin", "drawerSystemCodeLabel", "runnerComponentId"
  ];
  for (const key of legacyDrawerKeys) delete next[key];
  for (let index = 1; index <= MAX_INDEXED_DRAWER_PARAMS; index += 1) {
    delete next[`drawer${index}SystemSize`];
    delete next[`drawer${index}SystemLabel`];
    delete next[`drawer${index}SystemMinFrontHeightMm`];
    delete next[`drawer${index}SystemBackHeightMm`];
  }
  next.doorCount = count(next.doorCount, spec.doors ?? 0, 12);
  next.shelfCount = count(next.shelfCount, spec.shelves ?? 0, 16);
  if (spec.moduleType === "fwm_catalog_tall_cabinet") {
    next.tallStackMode = ["fixed", "builder"].includes(text(next.tallStackMode, "builder")) ? text(next.tallStackMode, "builder") : "builder";
    next.tallSlotCount = count(next.tallSlotCount, DEFAULT_TALL_STACK_SLOTS.length, MAX_TALL_STACK_SLOTS);
    for (let index = 0; index < MAX_TALL_STACK_SLOTS; index += 1) {
      const slotIndex = index + 1;
      const fallback = DEFAULT_TALL_STACK_SLOTS[index] ?? { type: "empty", height: 0 };
      const typeKey = `tallSlot${slotIndex}Type`;
      const heightKey = `tallSlot${slotIndex}HeightMm`;
      const doorLeafCountKey = `tallSlot${slotIndex}DoorLeafCount`;
      const doorOpeningModeKey = `tallSlot${slotIndex}DoorOpeningMode`;
      const offsetKey = `tallSlot${slotIndex}OffsetMm`;
      const slotType = text(next[typeKey], fallback.type);
      next[typeKey] = TALL_STACK_SLOT_TYPES.includes(slotType as (typeof TALL_STACK_SLOT_TYPES)[number]) ? slotType : fallback.type;
      next[heightKey] = clamp(Math.round(num(next[heightKey], fallback.height)), 0, 1400);
      delete next[`tallSlot${slotIndex}DrawerSystemSize`];
      next[doorLeafCountKey] = count(next[doorLeafCountKey], 1, 2);
      next[doorLeafCountKey] = Math.max(1, Math.min(2, next[doorLeafCountKey] as number));
      next[doorOpeningModeKey] = ["hinged", "lift_up"].includes(text(next[doorOpeningModeKey], "hinged")) ? text(next[doorOpeningModeKey], "hinged") : "hinged";
      next[offsetKey] = clamp(Math.round(num(next[offsetKey], 0)), -3000, 3000);
    }
    next.tallDoorOpeningMode = ["left", "right", "lift_up"].includes(text(next.tallDoorOpeningMode, "lift_up")) ? text(next.tallDoorOpeningMode, "lift_up") : "lift_up";
  }
  if (Array.isArray(next.shelfGaps)) {
    next.shelfGaps = next.shelfGaps
      .map((value) => Number(value))
      .filter((value) => Number.isFinite(value) && value > 0)
      .slice(0, (next.shelfCount as number) + 1);
  } else if (typeof next.shelfGaps === "string") {
    next.shelfGaps = next.shelfGaps.trim();
  } else {
    next.shelfGaps = "";
  }
  next.handleLengthMm = clamp(Math.round(num(next.handleLengthMm, 160)), 40, Math.max(40, num(next.width, spec.width) - 80));
  next.handleProjectionMm = clamp(Math.round(num(next.handleProjectionMm, 28)), 0, 80);
  next.handleSizeMm = clamp(Math.round(num(next.handleSizeMm, 16)), 4, 60);
  next.applianceWidthMm = spec.appliance ? clamp(Math.round(num(next.applianceWidthMm, Math.min(spec.width - 80, 600))), 250, Math.max(250, num(next.width, spec.width) - 60)) : 0;
  next.sinkBowlWidthMm = clamp(Math.round(num(next.sinkBowlWidthMm, spec.geometryKind === "sink" ? 520 : 0)), 0, Math.max(0, num(next.width, spec.width) - 140));
  next.sinkBowlDepthMm = clamp(Math.round(num(next.sinkBowlDepthMm, spec.geometryKind === "sink" ? 400 : 0)), 0, Math.max(0, num(next.depth, spec.depth) - 120));
  next.wallMounted = bool(next.wallMounted, spec.wallMounted ?? false);
  next.glassFronts = bool(next.glassFronts, spec.glassFronts ?? false);
  next.reserveModule = bool(next.reserveModule, spec.reserve ?? false);
  next.handleComponentId = typeof next.handleComponentId === "string" ? next.handleComponentId.trim() : "";
  next.hingeComponentId = typeof next.hingeComponentId === "string" ? next.hingeComponentId.trim() : "";
  next.legComponentId = spec.hasPlinth ? text(next.legComponentId, "cmp.leg.adjustable.100.black") : "";
  next.clipComponentId = spec.hasPlinth ? text(next.clipComponentId, "cmp.clip.plinth.standard") : "";

  const variants = spec.variantOptions ?? ["default"];
  next.variant = variants.includes(text(next.variant, variants[0] ?? "default")) ? text(next.variant, variants[0] ?? "default") : variants[0] ?? "default";
  if (spec.moduleType === "fwm_catalog_wall_cabinet" && text(next.variant, "").includes("corner_chamfered")) {
    next.backThickness = next.boardThickness;
    next.frontThicknessMm = next.boardThickness;
    next.shelfThickness = next.boardThickness;
  }

  return next;
}

export function validateFwmFurniture(params: FwmFurnitureParams): string[] {
  const normalized = normalizeFwmFurnitureParams(params);
  const spec = getFwmFurnitureSpec(normalized.type);
  const errors: string[] = [];
  const width = normalized.width as number;
  const height = normalized.height as number;
  const depth = normalized.depth as number;
  const board = normalized.boardThickness as number;
  if (hasNoBackPanel(spec)) {
    if (width <= 0) errors.push("Width must be greater than zero.");
    if (height <= 0) errors.push("Height must be greater than zero.");
    if (depth <= 0) errors.push("Depth must be greater than zero.");
    return errors;
  }
  if (width <= board * 2 + 40) errors.push("Width is too small for side panels and internal clearance.");
  if (height <= board * 2 + 40) errors.push("Height is too small for top/bottom boards and usable interior.");
  if (depth <= board + 30) errors.push("Depth is too small for a manufacturable module.");
  if ((normalized.drawerCount as number) > 0 && height / (normalized.drawerCount as number) < 90) {
    errors.push("Drawer count is too high for the selected height.");
  }
  return errors;
}

export function isFwmFurnitureModuleType(type: string): type is FwmFurnitureModuleType {
  return FWM_FURNITURE_SPECS.some((spec) => spec.moduleType === type);
}
