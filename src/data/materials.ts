export interface MaterialDefinition {
  id: string
  name: string
  pricePerM2: number
  pbrMaterialId?: string  // optional link to PBR visual
}

export type BoardMaterialPresetId = "DTD1" | "DTD2" | "DTD3" | "MDF" | "DVD" | "DTD16"

export type BoardMaterialPreset = {
  id: BoardMaterialPresetId
  label: string
  thicknessMm: number
  visual:
    | { kind: "solid"; color: string }
    | { kind: "dvd"; insideColor: string; outsideColor: string }
}

const boardMaterialPresets: Record<BoardMaterialPresetId, BoardMaterialPreset> = {
  DTD1: { id: "DTD1", label: "DTD1", thicknessMm: 18, visual: { kind: "solid", color: "#b8bcc7" } },
  DTD2: { id: "DTD2", label: "DTD2", thicknessMm: 18, visual: { kind: "solid", color: "#f6f6f6" } },
  DTD3: { id: "DTD3", label: "DTD3", thicknessMm: 18, visual: { kind: "solid", color: "#d2d6df" } },
  MDF: { id: "MDF", label: "MDF", thicknessMm: 18, visual: { kind: "solid", color: "#e7e1d7" } },
  DVD: {
    id: "DVD",
    label: "DVD",
    thicknessMm: 6,
    visual: { kind: "dvd", insideColor: "#f4f4f4", outsideColor: "#bf8f62" }
  },
  DTD16: { id: "DTD16", label: "DTD16", thicknessMm: 16, visual: { kind: "solid", color: "#c6cad3" } }
}

const materials: MaterialDefinition[] = [
  { id: 'mat_white_melamine', name: 'Biela melamína', pricePerM2: 8.5 },
  { id: 'mat_oak_natural', name: 'Dub prírodný', pricePerM2: 24.0, pbrMaterialId: 'oak_natural' },
  { id: 'mat_grey_corpus', name: 'Sivý korpus', pricePerM2: 9.0 },
  { id: 'mat_worktop_oak', name: 'Pracovná doska dub', pricePerM2: 32.0, pbrMaterialId: 'oak_natural' },
]

export function getMaterial(id: string): MaterialDefinition {
  const m = materials.find(m => m.id === id)
  if (!m) throw new Error(`Material not found: ${id}`)
  return m
}

export function getAllMaterials(): MaterialDefinition[] {
  return materials
}

export function isBoardMaterialPresetId(value: unknown): value is BoardMaterialPresetId {
  return typeof value === "string" && value in boardMaterialPresets
}

export function getBoardMaterialPreset(id: BoardMaterialPresetId): BoardMaterialPreset {
  return boardMaterialPresets[id]
}
