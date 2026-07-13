import { computeGeometry } from "./swing_shelves_low.geometry";
import { validateParams } from "./swing_shelves_low.validation";

export const moduleType = "swing_shelves_low";
export const displayName = "Shelf Doors";
export const defaultParams = {
  "type": "swing_shelves_low",
  "assemblyContext": "kitchen",
  "kitchenModuleRole": "base",
  "requiresWorktop": true,
  "worktopThicknessMm": 38,
  "width": 800,
  "height": 700,
  "heightCarcass": 662,
  "depth": 560,
  "boardThickness": 18,
  "shelfThickness": 18,
  "backThickness": 6,
  "backGrooveDepthMm": 8,
  "backGrooveWidthMm": 8,
  "backGrooveOffsetMm": 12,
  "backGrooveClearanceMm": 1,
  "frontThicknessMm": 18,
  "frontGap": 2,
  "sideGap": 2,
  "topGap": 2,
  "bottomGap": 2,
  "shelfCount": 4,
  "shelfAutoFit": true,
  "shelfGaps": [
    123,
    123,
    123
  ],
  "doorDouble": true,
  "doorOpen": false,
  "hingeCountPerDoor": 2,
  "hingeTopOffsetMm": 110,
  "hingeBottomOffsetMm": 110,
  "handlePositionMm": 60,
  "clipComponentId": "cmp.clip.plinth.standard",
  "legComponentId": "cmp.leg.adjustable.100.black",
  "plinthHeight": 100,
  "plinthSetbackMm": 60,
  "materials": {
    "bodyKey": "mat.board.body.dtd.white.18",
    "bodyColor": "#f3f3ef",
    "frontKey": "mat.board.front.mdf.white_supermat.19",
    "frontColor": "#d7d9dd"
  },
  "handleComponentId": "cmp.handle.bar.160.black",
  "handleType": "bar",
  "handleLengthMm": 160,
  "handleSizeMm": 12,
  "handleProjectionMm": 14,
  "hingeComponentId": "cmp.hinge.clip_on.softclose"
} as const;

export function buildModule(input: Record<string, unknown> = defaultParams) {
  const validation = validateParams(input);
  return {
    validation,
    geometry: computeGeometry(),
    partCount: 32
  };
}
