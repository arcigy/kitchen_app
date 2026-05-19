export type WindowMaterialOption = {
  id: string;
  name: string;
  color: number;
};

export const WINDOW_MATERIAL_OPTIONS: WindowMaterialOption[] = [
  { id: "window.white", name: "Biela", color: 0xf4f2ea },
  { id: "window.anthracite", name: "Antracit", color: 0x32383f },
  { id: "window.black", name: "Cierna", color: 0x111317 },
  { id: "window.aluminium", name: "Hlinik", color: 0xb8bec4 },
  { id: "window.oak", name: "Dub", color: 0xb88752 }
];

export function getWindowMaterialOption(id: string | null | undefined) {
  return WINDOW_MATERIAL_OPTIONS.find((option) => option.id === id) ?? WINDOW_MATERIAL_OPTIONS[0];
}
