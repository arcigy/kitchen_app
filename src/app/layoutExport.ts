import type { ColumnInstance, DoorInstance, FloorInstance, LayoutInstance, SectionInstance, WallInstance, WindowInstance } from "./localTypes";
import { getWallTypeName, getWallTypePreset, resolveWallTypeId } from "./wallTypes";

type LayoutExportArgs = {
  windowInst: WindowInstance | null;
  windows: WindowInstance[];
  doorInst: DoorInstance | null;
  doors: DoorInstance[];
  walls: WallInstance[];
  columns: ColumnInstance[];
  floors: FloorInstance[];
  sections: SectionInstance[];
  instances: LayoutInstance[];
};

export function createLayoutExportPayload(args: LayoutExportArgs) {
  return {
    mode: "layout" as const,
    units: "mm" as const,
    generatedAt: new Date().toISOString(),
    window: args.windowInst ? args.windowInst.params : null,
    windows: args.windows.map((window) => ({
      id: window.id,
      params: window.params
    })),
    door: args.doorInst ? args.doorInst.params : null,
    doors: args.doors.map((door) => ({
      id: door.id,
      params: door.params
    })),
    walls: args.walls.map((wall) => {
      const typeId = resolveWallTypeId(wall.params);
      const preset = getWallTypePreset(typeId);
      return {
        id: wall.id,
        params: wall.params,
        ifc: {
          className: "IfcWall",
          predefinedType: preset?.ifcPredefinedType ?? "STANDARD",
          typeId,
          typeName: preset?.name ?? getWallTypeName(typeId)
        }
      };
    }),
    columns: args.columns.map((column) => ({
      id: column.id,
      params: column.params
    })),
    floors: args.floors.map((floor) => ({
      id: floor.id,
      params: floor.params
    })),
    sections: args.sections.map((section) => ({
      id: section.id,
      params: section.params
    })),
    modules: args.instances.map((instance) => ({
      id: instance.id,
      type: instance.params.type,
      positionMm: {
        x: Math.round(instance.root.position.x * 1000),
        y: Math.round(instance.root.position.y * 1000),
        z: Math.round(instance.root.position.z * 1000)
      },
      params: instance.params
    }))
  };
}
