import { computeGeometry } from "./flap_shelves_low.geometry";
import { validateParams } from "./flap_shelves_low.validation";

export const moduleType = "flap_shelves_low";
export const displayName = "Flap";
export const defaultParams = {
  "type": "flap_shelves_low",
  "assemblyContext": "kitchen",
  "kitchenModuleRole": "top",
  "requiresWorktop": false,
  "worktopThicknessMm": 0,
  "width": 900,
  "height": 720,
  "depth": 560,
  "boardThickness": 18,
  "backThickness": 8,
  "frontThicknessMm": 18,
  "wallMounted": true,
  "plinthHeight": 0,
  "plinthSetbackMm": 60,
  "frontGap": 2,
  "sideGap": 2,
  "topGap": 2,
  "bottomGap": 2,
  "shelfCount": 3,
  "shelfThickness": 18,
  "shelfAutoFit": false,
  "shelfGaps": [
    210,
    430
  ],
  "doorSystem": "flap_up",
  "doorOpen": false,
  "handleComponentId": "cmp.handle.bar.160.black",
  "handlePositionMm": 60,
  "handleHorizontalPositionMm": 0,
  "liftUpComponentId": "cmp.lift_up.softclose.600",
  "hingeComponentId": "cmp.hinge.clip_on.softclose",
  "hangingBracketComponentId": "cmp.hanging_bracket.wall.standard",
  "shelfSupportComponentId": "cmp.shelf_support.standard.nickel",
  "materials": {
    "bodyKey": "mat.board.body.dtd.white.18",
    "bodyColor": "#f3f3ef",
    "frontKey": "mat.board.front.mdf.white_supermat.18",
    "frontColor": "#d7d9dd",
    "drawerKey": "mat.board.front.mdf.white_supermat.18",
    "drawerColor": "#d7d9dd"
  },
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
    partCount: 8
  };
}