export type MaterialPbrOption = {
  id: string;
  label: string;
  path: string;
};

export const MATERIAL_PBR_OPTIONS: MaterialPbrOption[] = [
  { id: "wood_amaretto_hudson_oak", label: "Amaretto Hudson Oak", path: "assets/materials/wood/wood_amaretto_hudson_oak/maps/basecolor.jpg" },
  { id: "wood_floor_051", label: "Wood Floor 051", path: "assets/materials/wood/wood_floor_051/maps/basecolor.jpg" },
  { id: "wood_floor_052", label: "Wood Floor 052", path: "assets/materials/wood/wood_floor_052/maps/basecolor.jpg" },
  { id: "wood_floor_053", label: "Wood Floor 053", path: "assets/materials/wood/wood_floor_053/maps/basecolor.jpg" },
  { id: "wood_floor_054", label: "Wood Floor 054", path: "assets/materials/wood/wood_floor_054/maps/basecolor.jpg" },
  { id: "wood_030", label: "Wood 030", path: "assets/materials/wood/wood_030/maps/basecolor.jpg" },
  { id: "wood_034", label: "Wood 034", path: "assets/materials/wood/wood_034/maps/basecolor.jpg" },
  { id: "wood_046", label: "Wood 046", path: "assets/materials/wood/wood_046/maps/basecolor.jpg" },
  { id: "wood_oak_natural", label: "Wood Oak Natural", path: "assets/materials/wood/wood_oak_natural/maps/basecolor.jpg" },
  { id: "wood_warm_clean", label: "Wood Warm Clean", path: "assets/materials/wood/wood_warm_clean/maps/basecolor.jpg" },
  { id: "wood_light_plain", label: "Wood Light Plain", path: "assets/materials/wood/wood_light_plain/maps/basecolor.jpg" },
  { id: "wood_dark_smooth", label: "Wood Dark Smooth", path: "assets/materials/wood/wood_dark_smooth/maps/basecolor.jpg" },
  { id: "wood_dark_rough", label: "Wood Dark Rough", path: "assets/materials/wood/wood_dark_rough/maps/basecolor.jpg" },
  { id: "wood_dark_espresso", label: "Wood Dark Espresso", path: "assets/materials/wood/wood_dark_espresso/maps/basecolor.jpg" },
  { id: "wood_varnished_satin", label: "Wood Varnished Satin", path: "assets/materials/wood/wood_varnished_satin/maps/basecolor.jpg" },
  { id: "lacquer_base_white", label: "Lacquer Base White", path: "assets/materials/lacquer/lacquer_base_white/maps/basecolor.jpg" },
  { id: "stone_concrete_smooth", label: "Smooth Concrete Floor", path: "assets/materials/stone/stone_concrete_smooth/maps/basecolor.jpg" },
  { id: "wall_painted_white", label: "Painted Plaster Wall", path: "assets/materials/wall/wall_painted_white/maps/basecolor.jpg" },
  { id: "tile_white_simple", label: "White Tile", path: "assets/materials/tile/tile_white_simple/maps/basecolor.jpg" }
];

export function pbrAssetUrl(path: string): string {
  return `/api/material-proof/asset?path=${encodeURIComponent(path)}`;
}
