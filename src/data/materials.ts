export interface MaterialDefinition {
  id: string
  name: string
  pricePerM2: number
  pbrMaterialId?: string  // optional link to PBR visual
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
