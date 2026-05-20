export type WallMaterialOption = {
  id: string;
  name: string;
  color: number;
};

export const WALL_MATERIAL_OPTIONS: WallMaterialOption[] = [
  { id: "default", name: "Svetla seda", color: 0xb8c0cb },
  { id: "wall.white", name: "Biela", color: 0xf4f2ea },
  { id: "wall.warm_white", name: "Tepla biela", color: 0xeee7dd },
  { id: "wall.beige", name: "Bezova", color: 0xd5c6ad },
  { id: "wall.dark_gray", name: "Tmava seda", color: 0x8d96a1 }
];

export function getWallMaterialOption(id: string | null | undefined) {
  return WALL_MATERIAL_OPTIONS.find((option) => option.id === id) ?? WALL_MATERIAL_OPTIONS[0];
}
