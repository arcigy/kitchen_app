export type WallTypeAssignable = {
  typeId?: string | null;
  thicknessMm: number;
  heightMm?: number;
  materialId?: string;
  justification?: "center" | "interior" | "exterior";
  exteriorSign?: 1 | -1;
};

export type WallTypePreset = {
  id: string;
  name: string;
  thicknessMm: number;
  heightMm: number;
  materialId: string;
  justification: "center" | "interior" | "exterior";
  exteriorSign: 1 | -1;
  ifcPredefinedType: string;
};

export const CUSTOM_WALL_TYPE_ID = "custom";
export const DEFAULT_WALL_TYPE_ID = "partition_150";

export const WALL_TYPE_PRESETS: readonly WallTypePreset[] = [
  {
    id: "partition_100",
    name: "Priecka 100",
    thicknessMm: 100,
    heightMm: 2600,
    materialId: "default",
    justification: "center",
    exteriorSign: 1,
    ifcPredefinedType: "PARTITIONING"
  },
  {
    id: "partition_150",
    name: "Priecka 150",
    thicknessMm: 150,
    heightMm: 2600,
    materialId: "default",
    justification: "center",
    exteriorSign: 1,
    ifcPredefinedType: "PARTITIONING"
  },
  {
    id: "bearing_200",
    name: "Nosna 200",
    thicknessMm: 200,
    heightMm: 2800,
    materialId: "default",
    justification: "center",
    exteriorSign: 1,
    ifcPredefinedType: "SOLIDWALL"
  },
  {
    id: "external_300",
    name: "Obvodova 300",
    thicknessMm: 300,
    heightMm: 2800,
    materialId: "default",
    justification: "center",
    exteriorSign: 1,
    ifcPredefinedType: "STANDARD"
  }
] as const;

export function getWallTypePreset(typeId?: string | null) {
  return WALL_TYPE_PRESETS.find((preset) => preset.id === typeId) ?? null;
}

export function resolveWallTypeId(params: WallTypeAssignable) {
  if (params.typeId === CUSTOM_WALL_TYPE_ID) return CUSTOM_WALL_TYPE_ID;
  if (getWallTypePreset(params.typeId)) return params.typeId!;
  const matchingPreset = WALL_TYPE_PRESETS.find(
    (preset) =>
      params.thicknessMm === preset.thicknessMm &&
      (params.heightMm ?? preset.heightMm) === preset.heightMm &&
      (params.materialId ?? preset.materialId) === preset.materialId
  );
  return matchingPreset?.id ?? CUSTOM_WALL_TYPE_ID;
}

export function getWallTypeName(typeId?: string | null) {
  if (typeId === CUSTOM_WALL_TYPE_ID) return "Vlastna";
  return getWallTypePreset(typeId)?.name ?? "Vlastna";
}

export function applyWallTypeToParams(params: WallTypeAssignable, typeId: string) {
  if (typeId === CUSTOM_WALL_TYPE_ID) {
    params.typeId = CUSTOM_WALL_TYPE_ID;
    return null;
  }

  const preset = getWallTypePreset(typeId) ?? getWallTypePreset(DEFAULT_WALL_TYPE_ID)!;
  params.typeId = preset.id;
  params.thicknessMm = preset.thicknessMm;
  params.heightMm = preset.heightMm;
  params.materialId = preset.materialId;
  params.justification = preset.justification;
  params.exteriorSign = preset.exteriorSign;
  return preset;
}
