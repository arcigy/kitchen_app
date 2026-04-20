import type { Material, MaterialId } from "../types/material";

export type MaterialDefinition = Material;

export type BoardMaterialPresetId = "DTD1" | "DTD2" | "DTD3" | "MDF" | "DVD" | "DTD16";

export type BoardMaterialPreset = {
  id: BoardMaterialPresetId;
  label: string;
  thicknessMm: number;
  visual:
    | { kind: "solid"; color: string }
    | { kind: "dvd"; insideColor: string; outsideColor: string };
};

export type MaterialRenderProfile =
  | { kind: "solid"; color: string; roughness?: number }
  | { kind: "dvd"; insideColor: string; outsideColor: string; roughnessInside?: number; roughnessOutside?: number }
  | { kind: "oak_pbr"; fallbackColor: string; tintStrength?: number };

export const DEFAULT_KITCHEN_MATERIAL_IDS = {
  face: 3,
  corpus: 2,
  interior: 5,
  worktop: 6,
  backPanel: 4,
  plinth: 2,
  endPanel: 7
} as const;

export const BOARD_MATERIAL_PRESET_IDS: BoardMaterialPresetId[] = ["DTD1", "DTD2", "DTD3", "MDF", "DVD", "DTD16"];

const boardMaterialPresets: Record<BoardMaterialPresetId, BoardMaterialPreset> = {
  DTD1: { id: "DTD1", label: "DTD 1", thicknessMm: 18, visual: { kind: "solid", color: "#c49a6c" } },
  DTD2: { id: "DTD2", label: "DTD 2", thicknessMm: 18, visual: { kind: "solid", color: "#f6f6f6" } },
  DTD3: { id: "DTD3", label: "DTD 3", thicknessMm: 18, visual: { kind: "solid", color: "#d9dee5" } },
  MDF: { id: "MDF", label: "MDF", thicknessMm: 18, visual: { kind: "solid", color: "#e7e1d7" } },
  DVD: {
    id: "DVD",
    label: "DVD",
    thicknessMm: 6,
    visual: { kind: "dvd", insideColor: "#f4f4f4", outsideColor: "#bf8f62" }
  },
  DTD16: { id: "DTD16", label: "DTD 16", thicknessMm: 16, visual: { kind: "solid", color: "#d1d7e0" } }
};

export const MATERIALS: readonly Material[] = [
  { id: 1, name: "DTD White", type: "board", thickness_mm: 18, price_eur_m2: 11.63, currency: "EUR", vat_included: true, is_public: true },
  { id: 2, name: "DTD Grey", type: "board", thickness_mm: 18, price_eur_m2: 12.15, currency: "EUR", vat_included: true, is_public: true },
  { id: 3, name: "MDF Front", type: "front", thickness_mm: 19, price_eur_m2: 18.9, currency: "EUR", vat_included: true, is_public: true },
  { id: 4, name: "HDF Back Panel", type: "back_panel", thickness_mm: 8, price_eur_m2: 6.4, currency: "EUR", vat_included: true, is_public: true },
  { id: 5, name: "Drawer Box Board", type: "drawer_box", thickness_mm: 13, price_eur_m2: 9.8, currency: "EUR", vat_included: true, is_public: true },
  { id: 6, name: "Oak Worktop", type: "worktop", thickness_mm: 38, price_eur_m2: 32, currency: "EUR", vat_included: true, is_public: true },
  { id: 7, name: "End Panel Oak", type: "panel", thickness_mm: 18, price_eur_m2: 14.2, currency: "EUR", vat_included: true, is_public: true }
] as const;

const materialById = new Map<number, Material>(MATERIALS.map((material) => [material.id, material]));
const legacyMaterialKeyToId = new Map<string, number | null>([
  ["1", 1],
  ["2", 2],
  ["3", 3],
  ["4", 4],
  ["5", 5],
  ["6", 6],
  ["7", 7],
  ["carcass_default", 2],
  ["front_default", 3],
  ["drawer_default", 5],
  ["drawer_unused", null],
  ["mat_white_melamine", 1],
  ["mat_oak_natural", 7],
  ["mat_grey_corpus", 2],
  ["mat_worktop_oak", 6]
]);

const legacyPresetIdToMaterialId = new Map<BoardMaterialPresetId, number | null>([
  ["DTD1", 7],
  ["DTD2", 1],
  ["DTD3", 2],
  ["MDF", 3],
  ["DVD", 4],
  ["DTD16", 5]
]);

const materialRenderProfileById = new Map<number, MaterialRenderProfile>([
  [1, { kind: "solid", color: "#f6f6f6", roughness: 0.86 }],
  [2, { kind: "solid", color: "#d9dee5", roughness: 0.86 }],
  [3, { kind: "solid", color: "#a98a72", roughness: 0.9 }],
  [4, { kind: "dvd", insideColor: "#f4f4f4", outsideColor: "#bf8f62", roughnessInside: 0.78, roughnessOutside: 0.94 }],
  [5, { kind: "solid", color: "#d1d7e0", roughness: 0.88 }],
  [6, { kind: "oak_pbr", fallbackColor: "#b5885e", tintStrength: 0 }],
  [7, { kind: "oak_pbr", fallbackColor: "#c49a6c", tintStrength: 0 }]
]);

export function getPublicMaterials(): Material[] {
  return MATERIALS.filter((material) => material.is_public);
}

export function getAllMaterials(): Material[] {
  return getPublicMaterials();
}

export function findMaterialById(id: number | null | undefined): Material | null {
  if (typeof id !== "number" || !Number.isFinite(id)) return null;
  return materialById.get(id) ?? null;
}

export function getMaterial(id: number): Material {
  const material = findMaterialById(id);
  if (!material) throw new Error(`Material not found: ${id}`);
  return material;
}

export function findMaterialIdByLegacyKey(value: string | null | undefined): MaterialId | null {
  if (!value) return null;
  return legacyMaterialKeyToId.get(value) ?? null;
}

export function findMaterialIdByLegacyPresetId(value: BoardMaterialPresetId | null | undefined): MaterialId | null {
  if (!value) return null;
  return legacyPresetIdToMaterialId.get(value) ?? null;
}

export function isBoardMaterialPresetId(value: unknown): value is BoardMaterialPresetId {
  return typeof value === "string" && value in boardMaterialPresets;
}

export function getBoardMaterialPreset(id: BoardMaterialPresetId): BoardMaterialPreset {
  return boardMaterialPresets[id];
}

export function getBoardMaterialPresetLabel(id: BoardMaterialPresetId): string {
  return boardMaterialPresets[id].label;
}

export function getMaterialRenderProfile(materialId: number | null | undefined): MaterialRenderProfile | null {
  if (typeof materialId !== "number" || !Number.isFinite(materialId)) return null;
  return materialRenderProfileById.get(materialId) ?? null;
}
