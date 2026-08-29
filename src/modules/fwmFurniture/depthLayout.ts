const DRAWER_FRONT_CLEARANCE_MM = 60;
export const DEFAULT_DRAWER_BACK_GAP_MM = 10;

export function resolveBackPanelDepthLayout(depthMm: number, backThicknessMm: number) {
  const safeDepth = Math.max(1, depthMm);
  const safeBackThickness = Math.max(0, Math.min(backThicknessMm, safeDepth - 1));
  const rearFaceZ = -safeDepth / 2;
  const innerFaceZ = rearFaceZ + safeBackThickness;
  return {
    rearFaceZ,
    innerFaceZ,
    centerZ: rearFaceZ + safeBackThickness / 2,
    thicknessMm: safeBackThickness
  };
}

export function resolveDrawerDepthLayout(depthMm: number, backThicknessMm: number, drawerBackGapMm = DEFAULT_DRAWER_BACK_GAP_MM) {
  const back = resolveBackPanelDepthLayout(depthMm, backThicknessMm);
  const frontClearance = Math.min(DRAWER_FRONT_CLEARANCE_MM, Math.max(1, depthMm * 0.18));
  const frontFaceZ = depthMm / 2 - frontClearance;
  const requestedBackGap = Math.max(0, drawerBackGapMm);
  const backGap = Math.min(requestedBackGap, Math.max(0, frontFaceZ - back.innerFaceZ - 1));
  const rearFaceZ = back.innerFaceZ + backGap;
  const safeFrontFaceZ = Math.max(rearFaceZ + 1, frontFaceZ);
  return {
    rearFaceZ,
    frontFaceZ: safeFrontFaceZ,
    centerZ: (rearFaceZ + safeFrontFaceZ) / 2,
    depthMm: Math.max(1, safeFrontFaceZ - rearFaceZ)
  };
}
