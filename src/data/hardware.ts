export interface HardwareDefinition {
  id: string
  name: string
  pricePerPiece: number
  type: 'handle' | 'rail' | 'hinge' | 'other'
  symmetricSides: boolean  // false = strana záleží na montáži
  pbrMaterialId?: string
}

const hardware: HardwareDefinition[] = [
  { id: 'hdw_handle_bar_black', name: 'Tyčová rúčka čierna 128mm', pricePerPiece: 4.5, type: 'handle', symmetricSides: true },
  { id: 'hdw_rail_blum_500', name: 'Koľajnica Blum 500mm', pricePerPiece: 18.0, type: 'rail', symmetricSides: false },
  { id: 'hdw_hinge_blum', name: 'Pant Blum', pricePerPiece: 3.2, type: 'hinge', symmetricSides: false },
]

export function getHardware(id: string): HardwareDefinition {
  const h = hardware.find(h => h.id === id)
  if (!h) throw new Error(`Hardware not found: ${id}`)
  return h
}

export function getAllHardware(): HardwareDefinition[] {
  return hardware
}
