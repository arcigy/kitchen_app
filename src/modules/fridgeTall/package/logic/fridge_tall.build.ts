import { computeGeometry } from "./fridge_tall.geometry";
import { validateParams } from "./fridge_tall.validation";

export const moduleType = "fridge_tall";
export const displayName = "Fridge";
export const defaultParams = {
  "type": "fridge_tall",
  "assemblyContext": "kitchen",
  "kitchenModuleRole": "tall",
  "requiresWorktop": false,
  "worktopThicknessMm": 0,
  "width": 600,
  "height": 1916,
  "depth": 600,
  "boardThickness": 18,
  "backThickness": 6,
  "frontThicknessMm": 18,
  "doorOpen": false,
  "handlePositionMm": 60,
  "doorHandleOffsetFromSplitMm": 0,
  "__fridgeHandleSplitScaleVersion": 2,
  "freezerDoorHeightMm": 700,
  "fridgeBottomClearanceMm": 5,
  "fridgeDepthMm": 550,
  "fridgeDoorGapMm": 2,
  "fridgeHeightMm": 1770,
  "fridgeSideClearanceMm": 2,
  "fridgeTopClearanceMm": 5,
  "fridgeWidthMm": 560,
  "hingeComponentId": "cmp.hinge.fridge_integrated.softclose",
  "legComponentId": "cmp.leg.adjustable.100.black",
  "plinthHeight": 100,
  "plinthSetbackMm": 60,
  "materials": {
    "bodyKey": "mat.board.body.dtd.white.18",
    "bodyColor": "#f3f3ef",
    "frontKey": "mat.board.front.mdf.white_supermat.18",
    "frontColor": "#d7d9dd"
  },
  "handleComponentId": "cmp.handle.bar.160.black",
  "handleType": "bar",
  "handleLengthMm": 160,
  "handleSizeMm": 12,
  "handleProjectionMm": 14
} as const;

export function buildModule(input: Record<string, unknown> = defaultParams) {
  const validation = validateParams(input);
  return {
    validation,
    geometry: computeGeometry(),
    partCount: 19
  };
}