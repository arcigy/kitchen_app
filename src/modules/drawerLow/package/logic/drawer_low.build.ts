import { computeGeometry } from "./drawer_low.geometry";
import { validateParams } from "./drawer_low.validation";

export const moduleType = "drawer_low";
export const displayName = "Drawer";
export const defaultParams = {
  "type": "drawer_low",
  "width": 800,
  "height": 720,
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
  "frontThicknessMm": 19,
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
    192,
    191,
    191
  ],
  "materials": {
    "bodyMaterialId": 2,
    "frontMaterialId": 3,
    "drawerMaterialId": 5,
    "bodyKey": "2",
    "frontKey": "3",
    "drawerKey": "5",
    "bodyColor": "#b88b5a",
    "frontColor": "#005fb8",
    "drawerColor": "#d8dde6",
    "bodyPresetId": "DTD1",
    "frontPresetId": "DTD2",
    "drawerPresetId": "DTD16",
    "defaultTintColor": "#ffffff",
    "defaultTintStrength": 0,
    "partOverrides": {},
    "bodyPbr": {
      "id": "wood_veneer_oak_7760_1k",
      "rotationDeg": 0,
      "tintStrength": 0,
      "tintColor": "#ffffff"
    },
    "bodyName": "DTD Grey",
    "frontName": "MDF Front",
    "drawerName": "Drawer Box Board"
  }
} as const;

export function buildModule(input: Record<string, unknown> = defaultParams) {
  const validation = validateParams(input);
  return {
    validation,
    geometry: computeGeometry(),
    partCount: 57
  };
}