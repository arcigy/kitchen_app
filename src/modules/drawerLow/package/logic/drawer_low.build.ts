import { computeGeometry } from "./drawer_low.geometry";
import { validateParams } from "./drawer_low.validation";

export const moduleType = "drawer_low";
export const displayName = "Drawer";
export const defaultParams = {
  "type": "drawer_low",
  "width": 800,
  "height": 700,
  "worktopThicknessMm": 38,
  "depth": 560,
  "boardThickness": 18,
  "backThickness": 6,
  "backGrooveDepthMm": 8,
  "backGrooveWidthMm": 8,
  "backGrooveOffsetMm": 12,
  "backGrooveClearanceMm": 1,
  "plinthHeight": 100,
  "plinthSetbackMm": 60,
  "frontGap": 2,
  "sideGap": 2,
  "topGap": 2,
  "bottomGap": 2,
  "sideClearanceMm": 4,
  "frontThicknessMm": 18,
  "frontStackPreset": "equal",
  "topFrontHeightMm": 160,
  "handleType": "bar",
  "handlePositionMm": 60,
  "handleLengthMm": 160,
  "handleSizeMm": 12,
  "handleProjectionMm": 14,
  "drawerBoxThickness": 13,
  "drawerBoxSideHeight": 110,
  "drawerBackReserveMm": 8,
  "drawerCount": 3,
  "drawerFrontHeights": [
    185,
    185,
    184
  ],
  "materials": {
    "bodyKey": "2",
    "frontKey": "3",
    "drawerKey": "5"
  },
  "assemblyContext": "kitchen",
  "autoFit": true,
  "handleComponentId": "cmp.handle.bar.160.black",
  "heightCarcass": 662,
  "kitchenModuleRole": "low",
  "legComponentId": "cmp.leg.adjustable.100.black",
  "requiresWorktop": true
} as const;

export function buildModule(input: Record<string, unknown> = defaultParams) {
  const validation = validateParams(input);
  return {
    validation,
    geometry: computeGeometry(),
    partCount: 49
  };
}
