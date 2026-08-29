import parameterCatalog from "./package/definitions/corner_shelf_lower.parameter-catalog.json";
import materialsSnapshot from "./package/definitions/corner_shelf_lower.materials.snapshot.json";
import systemParameterCatalog from "./package/definitions/system-parameters.schema.json";
import systemParameterValues from "./package/definitions/corner_shelf_lower.system-parameters.json";
import { normalizeCornerShelfLowerParams, type CornerShelfLowerParams } from "./types";
import {
  createPortableModuleControls,
  type PortableFieldState,
  type PortableModuleControlsApi,
  type PortableModuleControlsArgs
} from "../runtime/portableControls";

function getNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function getCornerFieldState(params: CornerShelfLowerParams): Partial<Record<string, PortableFieldState>> {
  const worktopThicknessMm = Math.max(0, Math.round(getNumber(params.worktopThicknessMm, 38)));
  const totalHeightMm = Math.max(120, Math.round(getNumber(params.height, 720)));
  const boardThicknessMm = Math.max(1, Math.round(getNumber(params.boardThickness, 18)));
  const frontThicknessMm = Math.max(1, Math.round(getNumber(params.frontThicknessMm, 18)));
  const heightCarcassMm = Math.max(50, Math.round(getNumber(params.heightCarcass, totalHeightMm - worktopThicknessMm)));
  const plinthHeightMaxMm = Math.max(0, heightCarcassMm - 2 * boardThicknessMm);
  const doorHeightMm = Math.max(
    1,
    heightCarcassMm -
      Math.round(getNumber(params.plinthHeight, 100)) -
      Math.max(0, Math.round(getNumber(params.topGap, 2))) -
      Math.max(0, Math.round(getNumber(params.bottomGap, 2)))
  );
  const hingeOffsetMaxMm = Math.max(0, Math.floor(doorHeightMm / 2) - 20);

  return {
    lengthX: { min: 400, max: 3000, step: 1 },
    lengthZ: { min: 400, max: 3000, step: 1 },
    depth: { min: frontThicknessMm + 50, max: 1500, step: 1 },
    height: { min: 120, max: 3000, step: 1 },
    heightCarcass: { min: 50, max: Math.max(50, totalHeightMm), step: 1 },
    plinthHeight: { min: 0, max: plinthHeightMaxMm, step: 1 },
    plinthSetbackMm: { min: 0, max: Math.max(0, getNumber(params.depth, 560) - boardThicknessMm), step: 1 },
    shelfCount: { min: 1, max: 12, step: 1 },
    shelfGaps: { disabled: params.shelfAutoFit === true },
    hingeCountPerDoor: { min: 1, max: 6, step: 1 },
    hingeTopOffsetMm: { min: 0, max: hingeOffsetMaxMm, step: 1 },
    hingeBottomOffsetMm: { min: 0, max: hingeOffsetMaxMm, step: 1 },
    sideGap: { min: 0, max: 100, step: 1 },
    topGap: { min: 0, max: Math.max(0, doorHeightMm + Math.round(getNumber(params.topGap, 2))), step: 1 },
    bottomGap: { min: 0, max: Math.max(0, doorHeightMm + Math.round(getNumber(params.bottomGap, 2))), step: 1 },
    handlePositionMm: { min: 0, max: doorHeightMm, step: 1 },
    worktopThicknessMm: { min: 0, max: Math.max(0, totalHeightMm - 50), step: 1 },
    boardThickness: { min: 1, max: 50, step: 1 },
    backThickness: { min: 1, max: 20, step: 1 },
    frontThicknessMm: { min: 1, max: 50, step: 1 }
  };
}

export function createCornerShelfLowerControls(
  container: HTMLElement,
  params: CornerShelfLowerParams,
  args: PortableModuleControlsArgs
): PortableModuleControlsApi {
  return createPortableModuleControls({
    container,
    params: params as Record<string, unknown>,
    catalog: parameterCatalog as Parameters<typeof createPortableModuleControls>[0]["catalog"],
    controlArgs: args,
    paramChangeHook: (currentParams, key) => {
      Object.assign(
        currentParams,
        normalizeCornerShelfLowerParams(currentParams as CornerShelfLowerParams, { sourceKey: key })
      );
    },
    fieldState: {
      lengthX: (currentParams) => getCornerFieldState(currentParams as CornerShelfLowerParams).lengthX ?? {},
      lengthZ: (currentParams) => getCornerFieldState(currentParams as CornerShelfLowerParams).lengthZ ?? {},
      depth: (currentParams) => getCornerFieldState(currentParams as CornerShelfLowerParams).depth ?? {},
      height: (currentParams) => getCornerFieldState(currentParams as CornerShelfLowerParams).height ?? {},
      heightCarcass: (currentParams) => getCornerFieldState(currentParams as CornerShelfLowerParams).heightCarcass ?? {},
      plinthHeight: (currentParams) => getCornerFieldState(currentParams as CornerShelfLowerParams).plinthHeight ?? {},
      plinthSetbackMm: (currentParams) => getCornerFieldState(currentParams as CornerShelfLowerParams).plinthSetbackMm ?? {},
      shelfCount: (currentParams) => getCornerFieldState(currentParams as CornerShelfLowerParams).shelfCount ?? {},
      shelfGaps: (currentParams) => getCornerFieldState(currentParams as CornerShelfLowerParams).shelfGaps ?? {},
      hingeCountPerDoor: (currentParams) => getCornerFieldState(currentParams as CornerShelfLowerParams).hingeCountPerDoor ?? {},
      hingeTopOffsetMm: (currentParams) => getCornerFieldState(currentParams as CornerShelfLowerParams).hingeTopOffsetMm ?? {},
      hingeBottomOffsetMm: (currentParams) => getCornerFieldState(currentParams as CornerShelfLowerParams).hingeBottomOffsetMm ?? {},
      sideGap: (currentParams) => getCornerFieldState(currentParams as CornerShelfLowerParams).sideGap ?? {},
      topGap: (currentParams) => getCornerFieldState(currentParams as CornerShelfLowerParams).topGap ?? {},
      bottomGap: (currentParams) => getCornerFieldState(currentParams as CornerShelfLowerParams).bottomGap ?? {},
      handlePositionMm: (currentParams) => getCornerFieldState(currentParams as CornerShelfLowerParams).handlePositionMm ?? {},
      worktopThicknessMm: (currentParams) => getCornerFieldState(currentParams as CornerShelfLowerParams).worktopThicknessMm ?? {},
      boardThickness: (currentParams) => getCornerFieldState(currentParams as CornerShelfLowerParams).boardThickness ?? {},
      backThickness: (currentParams) => getCornerFieldState(currentParams as CornerShelfLowerParams).backThickness ?? {},
      frontThicknessMm: (currentParams) => getCornerFieldState(currentParams as CornerShelfLowerParams).frontThicknessMm ?? {}
    },
    materialsSnapshot: materialsSnapshot as unknown as Parameters<typeof createPortableModuleControls>[0]["materialsSnapshot"],
    systemCatalog: systemParameterCatalog as Parameters<typeof createPortableModuleControls>[0]["systemCatalog"],
    systemValues: systemParameterValues as Parameters<typeof createPortableModuleControls>[0]["systemValues"]
  });
}
