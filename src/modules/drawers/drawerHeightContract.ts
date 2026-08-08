export const DRAWER_FRONT_HEIGHT_VARIANT_PREFIX = "front-height:";

export type DrawerFrontHeightBucket = {
  frontHeightMm: number;
  variantKey: string;
  variantLabel: string;
  count: number;
};

function finitePositive(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function parseDrawerFrontHeights(value: unknown): number[] {
  const source = Array.isArray(value)
    ? value
    : typeof value === "string"
      ? value.split(",")
      : [];
  return source.flatMap((entry) => {
    const parsed = finitePositive(typeof entry === "string" ? entry.trim() : entry);
    return parsed == null ? [] : [Math.round(parsed * 1000) / 1000];
  });
}

export function drawerFrontHeightVariantKey(frontHeightMm: number): string {
  return `${DRAWER_FRONT_HEIGHT_VARIANT_PREFIX}${Math.max(1, Math.round(frontHeightMm))}`;
}

export function drawerFrontHeightFromVariantKey(variantKey: string | undefined): number | null {
  if (!variantKey?.startsWith(DRAWER_FRONT_HEIGHT_VARIANT_PREFIX)) return null;
  const parsed = Number(variantKey.slice(DRAWER_FRONT_HEIGHT_VARIANT_PREFIX.length));
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export function drawerFrontHeightVariantLabel(frontHeightMm: number): string {
  return `Čelo ${Math.max(1, Math.round(frontHeightMm))} mm`;
}

export function groupDrawerFrontHeights(value: unknown): DrawerFrontHeightBucket[] {
  const buckets = new Map<number, DrawerFrontHeightBucket>();
  for (const height of parseDrawerFrontHeights(value)) {
    const frontHeightMm = Math.max(1, Math.round(height));
    const existing = buckets.get(frontHeightMm);
    if (existing) existing.count += 1;
    else buckets.set(frontHeightMm, {
      frontHeightMm,
      variantKey: drawerFrontHeightVariantKey(frontHeightMm),
      variantLabel: drawerFrontHeightVariantLabel(frontHeightMm),
      count: 1
    });
  }
  return [...buckets.values()].sort((left, right) => right.frontHeightMm - left.frontHeightMm);
}

