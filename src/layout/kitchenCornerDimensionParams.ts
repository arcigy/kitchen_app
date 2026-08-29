export type KitchenCornerDimensionAxis = "x" | "z";

export type KitchenCornerDimensionParam = {
  key: string;
  currentValueMm: number;
  minimumMm: number;
  maximumMm: number;
};

const finiteNumber = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

export function resolveKitchenCornerDimensionParam(
  params: Record<string, unknown>,
  axis: KitchenCornerDimensionAxis
): KitchenCornerDimensionParam | null {
  const directKey = axis === "x" ? "lengthX" : "lengthZ";
  const directValue = finiteNumber(params[directKey]);
  if (directValue != null) {
    return { key: directKey, currentValueMm: directValue, minimumMm: 400, maximumMm: 3000 };
  }

  const moduleType = typeof params.type === "string" ? params.type : "";
  const variant = typeof params.variant === "string" ? params.variant : "";
  if (moduleType === "fwm_catalog_base_corner" && variant.includes("90")) {
    if (axis === "x") {
      const width = finiteNumber(params.width) ?? finiteNumber(params.widthMm);
      return width == null
        ? null
        : { key: finiteNumber(params.width) != null ? "width" : "widthMm", currentValueMm: width, minimumMm: 400, maximumMm: 3000 };
    }
    const fallback = finiteNumber(params.width) ?? finiteNumber(params.widthMm);
    const lengthZ = finiteNumber(params.cornerLengthZMm) ?? fallback;
    return lengthZ == null
      ? null
      : { key: "cornerLengthZMm", currentValueMm: lengthZ, minimumMm: 400, maximumMm: 3000 };
  }

  const key = axis === "x"
    ? finiteNumber(params.width) != null ? "width" : "widthMm"
    : finiteNumber(params.depth) != null ? "depth" : "depthMm";
  const value = finiteNumber(params[key]);
  return value == null
    ? null
    : { key, currentValueMm: value, minimumMm: 100, maximumMm: 3000 };
}

export function requestedKitchenCornerParamValue(args: {
  param: KitchenCornerDimensionParam;
  currentArmLengthMm: number;
  requestedArmLengthMm: number;
}) {
  if (!Number.isFinite(args.currentArmLengthMm) || !Number.isFinite(args.requestedArmLengthMm)) return null;
  const requested = args.param.currentValueMm + args.requestedArmLengthMm - args.currentArmLengthMm;
  return Math.max(args.param.minimumMm, Math.min(args.param.maximumMm, requested));
}
