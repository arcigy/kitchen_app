import type { DrawerLowParams } from "./types";

function getNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function roundMm(value: number) {
  return Math.max(1, Math.round(value));
}

function distributeEvenly(totalMm: number, count: number) {
  if (count <= 1) return [roundMm(totalMm)];
  const roundedTotal = Math.max(count, Math.round(totalMm));
  const base = Math.floor(roundedTotal / count);
  const remainder = roundedTotal - base * count;
  return Array.from({ length: count }, (_, index) => base + (index < remainder ? 1 : 0));
}

export function getDrawerLowDrawerCount(params: DrawerLowParams) {
  return Math.max(1, Math.round(getNumber(params.drawerCount, 3)));
}

export function isManualDrawerFrontPreset(value: unknown) {
  if (typeof value !== "string") return false;
  const preset = value.trim().toLowerCase();
  return preset.includes("custom") || preset.includes("manual");
}

function getAvailableFrontStackHeight(params: DrawerLowParams) {
  const drawerCount = getDrawerLowDrawerCount(params);
  const finalHeight = getNumber(params.height, 720);
  const worktopThickness = Math.max(0, getNumber(params.worktopThicknessMm, 38));
  const plinthHeight = Math.max(0, getNumber(params.plinthHeight, 100));
  const topGap = Math.max(0, getNumber(params.topGap, 2));
  const bottomGap = Math.max(0, getNumber(params.bottomGap, 2));
  const frontGap = Math.max(0, getNumber(params.frontGap, 2));
  const carcassHeight = Math.max(0, finalHeight - worktopThickness);

  return Math.max(
    drawerCount,
    carcassHeight - plinthHeight - topGap - bottomGap - Math.max(0, drawerCount - 1) * frontGap
  );
}

function getValidFrontHeights(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is number => typeof entry === "number" && Number.isFinite(entry) && entry > 0);
}

export function computeAutoDrawerFrontHeights(params: DrawerLowParams) {
  const drawerCount = getDrawerLowDrawerCount(params);
  const totalHeight = getAvailableFrontStackHeight(params);
  const preset = typeof params.frontStackPreset === "string" ? params.frontStackPreset.trim().toLowerCase() : "equal";

  if (drawerCount <= 1) return [roundMm(totalHeight)];

  if (preset.includes("top")) {
    const topFrontHeight = roundMm(
      Math.min(
        Math.max(1, getNumber(params.topFrontHeightMm, 160)),
        Math.max(1, totalHeight - (drawerCount - 1))
      )
    );
    const remaining = Math.max(drawerCount - 1, totalHeight - topFrontHeight);
    return [...distributeEvenly(remaining, drawerCount - 1), topFrontHeight];
  }

  return distributeEvenly(totalHeight, drawerCount);
}

export function resizeManualDrawerFrontHeights(params: DrawerLowParams, source = params.drawerFrontHeights) {
  const drawerCount = getDrawerLowDrawerCount(params);
  const manual = getValidFrontHeights(source).slice(0, drawerCount);
  const fallback = computeAutoDrawerFrontHeights(params);

  if (manual.length === 0) return fallback;
  while (manual.length < drawerCount) {
    manual.push(manual[manual.length - 1] ?? fallback[manual.length] ?? fallback[fallback.length - 1] ?? 1);
  }
  return manual;
}

export function resolveDrawerFrontHeights(params: DrawerLowParams) {
  if (isManualDrawerFrontPreset(params.frontStackPreset)) {
    return resizeManualDrawerFrontHeights(params);
  }
  return computeAutoDrawerFrontHeights(params);
}

export function getDrawerFrontHeightsContextKey(params: DrawerLowParams) {
  return JSON.stringify({
    height: getNumber(params.height, 720),
    worktopThicknessMm: getNumber(params.worktopThicknessMm, 38),
    plinthHeight: getNumber(params.plinthHeight, 100),
    topGap: getNumber(params.topGap, 2),
    bottomGap: getNumber(params.bottomGap, 2),
    frontGap: getNumber(params.frontGap, 2),
    drawerCount: getDrawerLowDrawerCount(params),
    topFrontHeightMm: getNumber(params.topFrontHeightMm, 160),
    frontStackPreset: typeof params.frontStackPreset === "string" ? params.frontStackPreset : "equal"
  });
}

export function getDrawerFrontHeightsValueKey(params: DrawerLowParams) {
  return JSON.stringify(getValidFrontHeights(params.drawerFrontHeights));
}
