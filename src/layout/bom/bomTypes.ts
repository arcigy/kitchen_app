export interface BOMPart {
  name: string
  widthMm: number
  heightMm: number
  thicknessMm: number
  materialId: string
  quantity: number
  areaMm2: number
  pricePerM2: number
  totalPrice: number
}

export interface BOMHardware {
  name: string
  hardwareId: string
  quantity: number
  pricePerPiece: number
  totalPrice: number
}

export interface BOMResult {
  moduleType: string
  parts: BOMPart[]
  hardware: BOMHardware[]
  totalPrice: number
}
