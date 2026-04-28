import type { FloorInstance, LayoutInstance, SectionInstance, WindowInstance } from "./localTypes";

type LayoutExportArgs = {
  windowInst: WindowInstance | null;
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
