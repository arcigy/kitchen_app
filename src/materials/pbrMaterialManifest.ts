export const PBR_MATERIAL_IDS = [
  "wood_veneer_oak_7760_1k",
  "plaster_painted_7664_1k",
  "wood_floor_ash_4186_1k"
] as const;

export type PbrMaterialId = (typeof PBR_MATERIAL_IDS)[number];

export const PBR_TEXTURE_FILES = [
  "BaseColor.jpg",
  "Normal.png",
  "Roughness.jpg"
] as const;

export type PbrTextureFile = (typeof PBR_TEXTURE_FILES)[number];
