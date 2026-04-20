import type { BoardMaterialPresetId } from "../../data/materials";
import {
  ensureMaterialRoleSelection,
  resolveMaterialIdFromUnknown
} from "../../lib/materials/model";

export type MaterialParams = {
  bodyMaterialId: number | null;
  frontMaterialId: number | null;
  drawerMaterialId: number | null;
  bodyKey: string;
  frontKey: string;
  drawerKey: string;
  bodyName?: string;
  frontName?: string;
  drawerName?: string;
  bodyColor: string;
  frontColor: string;
  drawerColor: string;
  bodyPresetId?: BoardMaterialPresetId;
  frontPresetId?: BoardMaterialPresetId;
  drawerPresetId?: BoardMaterialPresetId;
  defaultTintColor?: string;
  defaultTintStrength?: number;
  bodyPbr?: {
    id: "wood_veneer_oak_7760_1k";
    rotationDeg?: 0 | 90 | 180 | 270;
    tintColor?: string;
    tintStrength?: number;
  };
  frontPbr?: {
    id: "wood_veneer_oak_7760_1k";
    rotationDeg?: 0 | 90 | 180 | 270;
    tintColor?: string;
    tintStrength?: number;
  };
  drawerPbr?: {
    id: "wood_veneer_oak_7760_1k";
    rotationDeg?: 0 | 90 | 180 | 270;
    tintColor?: string;
    tintStrength?: number;
  };
  partOverrides?: Record<string, number>;
};

export type DrawerLowParams = {
  type: "drawer_low";
  width: number;
  height: number;
  worktopThicknessMm: number;
  depth: number;
  boardThickness: number;
  backThickness: number;
  backGrooveDepthMm: number;
  backGrooveWidthMm: number;
  backGrooveOffsetMm: number;
  backGrooveClearanceMm: number;
  plinthHeight: number;
  plinthSetbackMm: number;
  frontGap: number;
  sideGap: number;
  topGap: number;
  bottomGap: number;
  sideClearanceMm: number;
  frontThicknessMm: number;
  frontStackPreset: "equal" | "top_small" | "manual";
  topFrontHeightMm: number;
  handleType: "none" | "bar" | "knob" | "cup" | "gola";
  handlePositionMm: number;
  handleLengthMm: number;
  handleSizeMm: number;
  handleProjectionMm: number;
  drawerBoxThickness: number;
  drawerBoxSideHeight: number;
  drawerBackReserveMm: number;
  drawerCount: number;
  drawerFrontHeights: number[];
  materials: MaterialParams;
};

export function makeDefaultDrawerLowParams(): DrawerLowParams {
  const base = makeDefaultDrawerLowParamsRaw();
  base.drawerFrontHeights = computeEqualDrawerFrontHeights(base);
  return normalizeDrawerLowParams(base);
}

export function normalizeDrawerLowParams(params: DrawerLowParams): DrawerLowParams {
  const base = makeDefaultDrawerLowParamsRaw();
  const next: DrawerLowParams = {
    ...base,
    ...params,
    type: "drawer_low",
    materials: normalizeMaterialParams({ ...base.materials, ...(params.materials ?? {}) })
  };
  next.drawerCount = Math.max(1, Math.min(8, Math.round(next.drawerCount)));
  if (!Array.isArray(next.drawerFrontHeights) || next.drawerFrontHeights.length !== next.drawerCount) {
    next.drawerFrontHeights = computeEqualDrawerFrontHeights(next);
  }
  return next;
}

function makeDefaultDrawerLowParamsRaw(): DrawerLowParams {
  return {
    type: "drawer_low",
    width: 800,
    height: 720,
    worktopThicknessMm: 0,
    depth: 560,
    boardThickness: 18,
    backThickness: 8,
    backGrooveDepthMm: 8,
    backGrooveWidthMm: 8,
    backGrooveOffsetMm: 12,
    backGrooveClearanceMm: 1,
    plinthHeight: 100,
    plinthSetbackMm: 60,
    frontGap: 2,
    sideGap: 2,
    topGap: 2,
    bottomGap: 2,
    sideClearanceMm: 13,
    frontThicknessMm: 19,
    frontStackPreset: "equal",
    topFrontHeightMm: 160,
    handleType: "none",
    handlePositionMm: 60,
    handleLengthMm: 160,
    handleSizeMm: 12,
    handleProjectionMm: 14,
    drawerBoxThickness: 13,
    drawerBoxSideHeight: 110,
    drawerBackReserveMm: 8,
    drawerCount: 3,
    drawerFrontHeights: [],
    materials: {
      bodyMaterialId: 2,
      frontMaterialId: 3,
      drawerMaterialId: 5,
      bodyKey: "carcass_default",
      frontKey: "front_default",
      drawerKey: "drawer_default",
      bodyColor: "#b8bcc7",
      frontColor: "#3a7bd5",
      drawerColor: "#e1a45a",
      bodyPbr: { id: "wood_veneer_oak_7760_1k", rotationDeg: 0, tintStrength: 0 },
      partOverrides: {}
    }
  };
}

export function validateDrawerLow(p: DrawerLowParams): string[] {
  const errors: string[] = [];

  positiveNumber(errors, "width", p.width, 200);
  positiveNumber(errors, "height", p.height, 200);
  positiveNumber(errors, "worktopThicknessMm", p.worktopThicknessMm, 0);
  positiveNumber(errors, "depth", p.depth, 200);
  positiveNumber(errors, "boardThickness", p.boardThickness, 5);
  positiveNumber(errors, "backThickness", p.backThickness, 3);
  positiveNumber(errors, "backGrooveDepthMm", p.backGrooveDepthMm, 0);
  positiveNumber(errors, "backGrooveWidthMm", p.backGrooveWidthMm, 0);
  positiveNumber(errors, "backGrooveOffsetMm", p.backGrooveOffsetMm, 0);
  positiveNumber(errors, "backGrooveClearanceMm", p.backGrooveClearanceMm, 0);
  positiveNumber(errors, "plinthHeight", p.plinthHeight, 0);
  positiveNumber(errors, "plinthSetbackMm", p.plinthSetbackMm, 0);
  positiveNumber(errors, "frontGap", p.frontGap, 0);
  positiveNumber(errors, "sideGap", p.sideGap, 0);
  positiveNumber(errors, "topGap", p.topGap, 0);
  positiveNumber(errors, "bottomGap", p.bottomGap, 0);
  positiveNumber(errors, "sideClearanceMm", p.sideClearanceMm, 0);
  positiveNumber(errors, "frontThicknessMm", p.frontThicknessMm, 5);
  positiveNumber(errors, "topFrontHeightMm", p.topFrontHeightMm, 0);
  positiveNumber(errors, "handlePositionMm", p.handlePositionMm, 0);
  positiveNumber(errors, "handleLengthMm", p.handleLengthMm, 0);
  positiveNumber(errors, "handleSizeMm", p.handleSizeMm, 0);
  positiveNumber(errors, "handleProjectionMm", p.handleProjectionMm, 0);
  positiveNumber(errors, "drawerBoxThickness", p.drawerBoxThickness, 3);
  positiveNumber(errors, "drawerBoxSideHeight", p.drawerBoxSideHeight, 20);
  positiveNumber(errors, "drawerBackReserveMm", p.drawerBackReserveMm, 0);

  if (!Number.isInteger(p.drawerCount) || p.drawerCount < 1 || p.drawerCount > 8) {
    errors.push("drawerCount must be an integer between 1 and 8.");
  }
  if (!Array.isArray(p.drawerFrontHeights) || p.drawerFrontHeights.some((n) => typeof n !== "number")) {
    errors.push("drawerFrontHeights must be an array of numbers.");
  } else if (p.drawerFrontHeights.length !== p.drawerCount) {
    errors.push("drawerFrontHeights count must match drawerCount.");
  }
  if (p.backThickness >= p.depth) errors.push("backThickness must be smaller than depth.");
  if (p.plinthSetbackMm > p.depth) errors.push("plinthSetbackMm must be <= depth.");
  if (p.frontStackPreset !== "equal" && p.frontStackPreset !== "top_small" && p.frontStackPreset !== "manual") {
    errors.push("frontStackPreset must be equal, top_small, or manual.");
  }
  if (!["none", "bar", "knob", "cup", "gola"].includes(p.handleType)) {
    errors.push("handleType is invalid.");
  }
  validateMaterials(errors, p.materials);
  return errors;
}

export function computeEqualDrawerFrontHeights(p: DrawerLowParams): number[] {
  const count = Math.max(1, Math.round(p.drawerCount));
  const available = p.height - p.plinthHeight - p.topGap - p.bottomGap - p.frontGap * (count - 1);
  if (p.frontStackPreset === "top_small" && count > 1) {
    const top = Math.max(0, Math.min(p.topFrontHeightMm, available));
    const rest = (available - top) / (count - 1);
    return [roundMm1(top), ...Array.from({ length: count - 1 }, () => roundMm1(rest))];
  }
  const h = available / count;
  return Array.from({ length: count }, () => roundMm1(h));
}

function normalizeMaterialParams(materials: MaterialParams): MaterialParams {
  const next = { ...materials };
  next.bodyMaterialId = resolveMaterialIdFromUnknown(next.bodyMaterialId ?? next.bodyKey);
  next.frontMaterialId = resolveMaterialIdFromUnknown(next.frontMaterialId ?? next.frontKey);
  next.drawerMaterialId = resolveMaterialIdFromUnknown(next.drawerMaterialId ?? next.drawerKey);
  ensureMaterialRoleSelection(next, "body");
  ensureMaterialRoleSelection(next, "front");
  ensureMaterialRoleSelection(next, "drawer");
  return {
    ...next
  };
}

function validateMaterials(errors: string[], m: unknown) {
  if (!m || typeof m !== "object") {
    errors.push("materials must be an object.");
    return;
  }
  const mat = m as Partial<MaterialParams>;
  validateHexColor(errors, "materials.bodyColor", mat.bodyColor);
  validateHexColor(errors, "materials.frontColor", mat.frontColor);
  validateHexColor(errors, "materials.drawerColor", mat.drawerColor);
}

function validateHexColor(errors: string[], label: string, value: unknown) {
  if (typeof value !== "string" || !/^#[0-9a-fA-F]{6}$/.test(value)) {
    errors.push(`${label} must be a hex color like #RRGGBB.`);
  }
}

function positiveNumber(errors: string[], label: string, value: unknown, min: number) {
  if (typeof value !== "number" || Number.isNaN(value)) {
    errors.push(`${label} must be a number.`);
    return;
  }
  if (value < min) errors.push(`${label} must be >= ${min}.`);
}

function roundMm1(n: number) {
  return Math.round(n * 10) / 10;
}
