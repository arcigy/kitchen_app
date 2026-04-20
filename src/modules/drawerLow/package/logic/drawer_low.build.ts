import { computeGeometry } from "./drawer_low.geometry";
import { validateParams } from "./drawer_low.validation";

export const moduleType = "drawer_low";
export const displayName = "Drawer Low";
export const defaultParams = {
  "type": "drawer_low",
  "width": 600,
  "height": 720,
  "depth": 560,
  "boardThickness": 18,
  "backThickness": 8,
  "frontThicknessMm": 19,
  "drawerCount": 3,
  "drawerFrontHeights": [
    140,
    180,
    300
  ],
  "drawerBoxSideHeight": 110,
  "drawerBoxThickness": 13,
  "drawerBackReserveMm": 8,
  "sideGap": 2,
  "topGap": 2,
  "bottomGap": 2,
  "frontGap": 2,
  "plinthHeight": 100,
  "worktopThicknessMm": 38,
  "handleType": "bar",
  "handleLengthMm": 160,
  "handleProjectionMm": 14,
  "handleSizeMm": 12,
  "bodyMaterial": "oak-natural",
  "frontMaterial": "cashmere-matte",
  "wallMounted": false
} as const;

export function buildModule(input: Record<string, unknown> = defaultParams) {
  const validation = validateParams(input);
  return {
    validation,
    geometry: computeGeometry(),
    partCount: 13
  };
}