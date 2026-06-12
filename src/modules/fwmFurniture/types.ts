import type { PortableJsonValue } from "../runtime/portableTypes";
import {
  FWM_FURNITURE_SPECS,
  getFwmAssemblyContext,
  getFwmFurnitureSpec,
  getFwmRoomCategory,
  getFwmSystemFamily,
  type FwmFurnitureModuleType
} from "./definitions";

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

function nearestStep(value: number, step: number) {
  return Math.round(value / step) * step;
}

export function makeDefaultFwmFurnitureParams(type: FwmFurnitureModuleType): FwmFurnitureParams {
  const spec = getFwmFurnitureSpec(type);
  const typeId = `${type}__type`;
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
    requiresWorktop: spec.hasWorktop === true,
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
    bodyMaterialGroup: "body",
    frontMaterialGroup: "front",
    backMaterialGroup: "back",
    shelfMaterialGroup: "shelf",
    worktopMaterialGroup: "worktop",
    drawerBoxMaterialGroup: "drawer_box",
    width: spec.width,
    height: spec.height,
    depth: spec.depth,
    drawerCount: spec.drawers ?? 0,
    drawerFrontHeightsMm: "",
    doorCount: spec.doors ?? 0,
    shelfCount: spec.shelves ?? 0,
    boardThickness: 18,
    backThickness: spec.geometryKind === "cladding" ? 0 : 8,
    frontThicknessMm: spec.glassFronts ? 6 : 18,
    shelfThickness: 18,
    worktopThicknessMm: spec.hasWorktop ? 38 : 0,
    plinthHeight: spec.hasPlinth ? 100 : 0,
    plinthSetbackMm: spec.hasPlinth ? 60 : 0,
    frontGap: 2,
    sideGap: 2,
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
    runnerComponentId: "",
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
  const suppressWorktop = params.requiresWorktop === false || num(params.worktopThicknessMm, spec.hasWorktop ? 38 : 0) <= 0;
  next.kitchenModuleRole = spec.kitchenRole ?? null;
  next.requiresWorktop = spec.hasWorktop === true && !suppressWorktop;
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
  next.bodyMaterialGroup = "body";
  next.frontMaterialGroup = "front";
  next.backMaterialGroup = "back";
  next.shelfMaterialGroup = "shelf";
  next.worktopMaterialGroup = "worktop";
  next.drawerBoxMaterialGroup = "drawer_box";

  const widthMax = spec.geometryKind === "cladding" ? 3000 : spec.geometryKind === "wall_unit" ? 5000 : 3600;
  const heightMax = spec.geometryKind === "cladding" || spec.geometryKind === "wardrobe" || spec.geometryKind === "tall" ? 3200 : spec.geometryKind === "bed" ? 1400 : 2600;
  const depthMax = spec.geometryKind === "bed" ? 2600 : spec.geometryKind === "island" ? 1400 : 1200;

  next.width = nearestStep(clamp(num(next.width, spec.width), 100, widthMax), 1);
  next.height = nearestStep(clamp(num(next.height, spec.height), 50, heightMax), 1);
  next.depth = nearestStep(clamp(num(next.depth, spec.depth), 10, depthMax), 1);
  next.widthMm = next.width;
  next.heightMm = next.height;
  next.depthMm = next.depth;
  next.boardThickness = clamp(Math.round(num(next.boardThickness, 18)), 8, 60);
  next.backThickness = clamp(num(next.backThickness, spec.geometryKind === "cladding" ? 0 : 8), 0, Math.min(30, Math.max(0, num(next.depth, spec.depth) - 1)));
  next.drawerBackGapMm = clamp(num(next.drawerBackGapMm, 10), 0, 80);
  next.frontThicknessMm = clamp(Math.round(num(next.frontThicknessMm, spec.glassFronts ? 6 : 18)), 4, 50);
  next.shelfThickness = clamp(Math.round(num(next.shelfThickness, num(next.boardThickness, 18))), 8, 50);
  next.worktopThicknessMm = spec.hasWorktop && !suppressWorktop ? clamp(Math.round(num(next.worktopThicknessMm, 38)), 10, 100) : 0;
  next.plinthHeight = spec.hasPlinth ? clamp(Math.round(num(next.plinthHeight, 100)), 0, Math.max(0, num(next.height, spec.height) - 120)) : 0;
  next.plinthSetbackMm = spec.hasPlinth ? clamp(Math.round(num(next.plinthSetbackMm, 60)), 0, Math.max(0, num(next.depth, spec.depth) / 2)) : 0;
  next.frontGap = clamp(num(next.frontGap, 2), 0, 12);
  next.sideGap = clamp(num(next.sideGap, 2), 0, 20);
  next.drawerCount = count(next.drawerCount, spec.drawers ?? 0, 12);
  next.drawerFrontHeightsMm = typeof next.drawerFrontHeightsMm === "string" ? next.drawerFrontHeightsMm.trim() : "";
  next.doorCount = count(next.doorCount, spec.doors ?? 0, 12);
  next.shelfCount = count(next.shelfCount, spec.shelves ?? 0, 16);
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
  next.runnerComponentId = typeof next.runnerComponentId === "string" ? next.runnerComponentId.trim() : "";
  next.legComponentId = spec.hasPlinth ? text(next.legComponentId, "cmp.leg.adjustable.100.black") : "";
  next.clipComponentId = spec.hasPlinth ? text(next.clipComponentId, "cmp.clip.plinth.standard") : "";

  const variants = spec.variantOptions ?? ["default"];
  next.variant = variants.includes(text(next.variant, variants[0] ?? "default")) ? text(next.variant, variants[0] ?? "default") : variants[0] ?? "default";

  return next;
}

export function validateFwmFurniture(params: FwmFurnitureParams): string[] {
  const normalized = normalizeFwmFurnitureParams(params);
  const errors: string[] = [];
  const width = normalized.width as number;
  const height = normalized.height as number;
  const depth = normalized.depth as number;
  const board = normalized.boardThickness as number;
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
