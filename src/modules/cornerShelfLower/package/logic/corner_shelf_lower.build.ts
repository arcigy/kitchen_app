import { computeGeometry } from "./corner_shelf_lower.geometry";
import { validateParams } from "./corner_shelf_lower.validation";

export const moduleType = "corner_shelf_lower";
export const displayName = "Corner";
export const defaultParams = {
  "type": "corner_shelf_lower",
  "lengthX": 1000,
  "lengthZ": 1000,
  "depth": 560,
  "height": 720,
  "boardThickness": 18,
  "backThickness": 6,
  "plinthHeight": 100,
  "plinthSetbackMm": 60,
  "shelfCount": 4,
  "shelfAutoFit": true,
  "shelfGaps": [
    123,
    123,
    123,
    123
  ],
  "doorDouble": true,
  "doorOpen": false,
  "hingeCountPerDoor": 2,
  "hingeTopOffsetMm": 110,
  "hingeBottomOffsetMm": 110,
  "frontThicknessMm": 18,
  "sideGap": 2,
  "topGap": 2,
  "bottomGap": 2,
  "handleType": "bar",
  "handlePositionMm": 60,
  "handleLengthMm": 160,
  "handleSizeMm": 12,
  "handleProjectionMm": 14,
  "legInsetMm": 30,
  "legDiameterMm": 40,
  "materials": {
    "bodyKey": "2",
    "frontKey": "3",
    "drawerKey": "drawer_unused"
  },
  "heightCarcass": 682,
  "backGrooveDepthMm": 8,
  "backGrooveWidthMm": 8,
  "backGrooveOffsetMm": 12,
  "backGrooveClearanceMm": 1,
  "hingeComponentId": "cmp.hinge.corner.45.softclose",
  "clipComponentId": "cmp.clip.plinth.standard",
  "handleComponentId": "cmp.handle.bar.160.inox",
  "assemblyContext": "kitchen",
  "kitchenModuleRole": "low",
  "legComponentId": "cmp.leg.adjustable.100.black",
  "requiresWorktop": true,
  "worktopThicknessMm": 38
} as const;

export function buildModule(input: Record<string, unknown> = defaultParams) {
  const validation = validateParams(input);
  return {
    validation,
    geometry: computeGeometry(),
    partCount: 20
  };
}
