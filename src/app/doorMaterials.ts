export type DoorMaterialOption = {
  id: string;
  name: string;
  color: number;
};

export const DOOR_MATERIAL_OPTIONS: DoorMaterialOption[] = [
  { id: "door.white", name: "Biela", color: 0xf3f4f1 },
  { id: "door.oak", name: "Dub", color: 0xb58a55 },
  { id: "door.walnut", name: "Orech", color: 0x7a5230 },
  { id: "door.graphite", name: "Grafit", color: 0x4b515c },
  { id: "door.black", name: "Cierna", color: 0x1f2328 }
];

export function getDoorMaterialOption(id: string | null | undefined) {
  return DOOR_MATERIAL_OPTIONS.find((option) => option.id === id) ?? DOOR_MATERIAL_OPTIONS[0];
}
