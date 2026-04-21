import { componentDefinitions, getComponentDefinitionById } from "./componentDefinitions";
import type { ComponentGeometryDefinition } from "./types";

export const componentGeometryDefinitions: ComponentGeometryDefinition[] = [
  {
    id: "geo.runner.pair.300.standard",
    displayName: "Runner Pair 300 Standard Geometry",
    componentType: "runner",
    archetype: "runner_pair",
    sourceGeometry: "catalog_demo",
    dimensionsMm: { lengthMm: 300, heightMm: 45, depthMm: 12, thicknessMm: 12 }
  },
  {
    id: "geo.runner.pair.350.standard",
    displayName: "Runner Pair 350 Standard Geometry",
    componentType: "runner",
    archetype: "runner_pair",
    sourceGeometry: "catalog_demo",
    dimensionsMm: { lengthMm: 350, heightMm: 45, depthMm: 12, thicknessMm: 12 }
  },
  {
    id: "geo.runner.pair.400.standard",
    displayName: "Runner Pair 400 Standard Geometry",
    componentType: "runner",
    archetype: "runner_pair",
    sourceGeometry: "legacy_drawer_low",
    dimensionsMm: { lengthMm: 400, heightMm: 45, depthMm: 12, thicknessMm: 12 },
    notes: ["Matches current drawer_low runner mesh strategy."]
  },
  {
    id: "geo.runner.pair.450.standard",
    displayName: "Runner Pair 450 Standard Geometry",
    componentType: "runner",
    archetype: "runner_pair",
    sourceGeometry: "catalog_demo",
    dimensionsMm: { lengthMm: 450, heightMm: 45, depthMm: 12, thicknessMm: 12 }
  },
  {
    id: "geo.runner.pair.500.standard",
    displayName: "Runner Pair 500 Standard Geometry",
    componentType: "runner",
    archetype: "runner_pair",
    sourceGeometry: "catalog_demo",
    dimensionsMm: { lengthMm: 500, heightMm: 45, depthMm: 12, thicknessMm: 12 }
  },
  {
    id: "geo.runner.pair.400.premium_softclose",
    displayName: "Runner Pair 400 Premium Softclose Geometry",
    componentType: "runner",
    archetype: "runner_pair",
    sourceGeometry: "catalog_demo",
    dimensionsMm: { lengthMm: 400, heightMm: 48, depthMm: 13, thicknessMm: 13 }
  },
  {
    id: "geo.runner.pair.450.premium_softclose",
    displayName: "Runner Pair 450 Premium Softclose Geometry",
    componentType: "runner",
    archetype: "runner_pair",
    sourceGeometry: "catalog_demo",
    dimensionsMm: { lengthMm: 450, heightMm: 48, depthMm: 13, thicknessMm: 13 }
  },
  {
    id: "geo.runner.pair.500.premium_softclose",
    displayName: "Runner Pair 500 Premium Softclose Geometry",
    componentType: "runner",
    archetype: "runner_pair",
    sourceGeometry: "catalog_demo",
    dimensionsMm: { lengthMm: 500, heightMm: 48, depthMm: 13, thicknessMm: 13 }
  },
  {
    id: "geo.handle.bar.160",
    displayName: "Bar Handle 160 Geometry",
    componentType: "handle",
    archetype: "handle_bar",
    sourceGeometry: "legacy_drawer_low",
    dimensionsMm: { lengthMm: 160, heightMm: 12, depthMm: 12, projectionMm: 14, thicknessMm: 12 },
    notes: ["Reuses current drawer_low bar-handle mesh proportions."]
  },
  {
    id: "geo.handle.bar.192",
    displayName: "Bar Handle 192 Geometry",
    componentType: "handle",
    archetype: "handle_bar",
    sourceGeometry: "legacy_drawer_low",
    dimensionsMm: { lengthMm: 192, heightMm: 12, depthMm: 12, projectionMm: 14, thicknessMm: 12 },
    notes: ["Reuses current drawer_low bar-handle mesh proportions."]
  },
  {
    id: "geo.handle.profile.standard",
    displayName: "Profile Handle Geometry",
    componentType: "handle",
    archetype: "handle_profile",
    sourceGeometry: "legacy_drawer_low",
    dimensionsMm: { lengthMm: 160, heightMm: 14, depthMm: 14, projectionMm: 10, thicknessMm: 14 },
    notes: ["Currently rendered through the reused visible bar-handle geometry in drawer_low."]
  },
  {
    id: "geo.handle.knob.round",
    displayName: "Round Knob Geometry",
    componentType: "handle",
    archetype: "handle_knob",
    sourceGeometry: "legacy_drawer_low",
    dimensionsMm: { diameterMm: 28, projectionMm: 28, thicknessMm: 28 },
    notes: ["Reuses current drawer_low knob geometry."]
  },
  {
    id: "geo.leg.adjustable.100",
    displayName: "Adjustable Leg 100 Geometry",
    componentType: "leg",
    archetype: "leg_adjustable",
    sourceGeometry: "legacy_drawer_low",
    dimensionsMm: { heightMm: 100, diameterMm: 39, depthMm: 40, widthMm: 39 },
    notes: ["Matches current drawer_low leg proportions."]
  },
  {
    id: "geo.leg.adjustable.150",
    displayName: "Adjustable Leg 150 Geometry",
    componentType: "leg",
    archetype: "leg_adjustable",
    sourceGeometry: "legacy_drawer_low",
    dimensionsMm: { heightMm: 150, diameterMm: 39, depthMm: 40, widthMm: 39 },
    notes: ["Matches current drawer_low leg proportions with taller nominal height."]
  },
  {
    id: "geo.plinth_clip.standard",
    displayName: "Plinth Clip Standard Geometry",
    componentType: "plinth_clip",
    archetype: "plinth_clip",
    sourceGeometry: "legacy_drawer_low",
    dimensionsMm: { widthMm: 30, heightMm: 35, depthMm: 25, thicknessMm: 6 },
    notes: ["Aggregates the current multi-part clip mesh used in drawer_low."]
  },
  {
    id: "geo.plinth_clip.heavy",
    displayName: "Plinth Clip Heavy Geometry",
    componentType: "plinth_clip",
    archetype: "plinth_clip",
    sourceGeometry: "catalog_demo",
    dimensionsMm: { widthMm: 36, heightMm: 40, depthMm: 28, thicknessMm: 7 }
  },
  {
    id: "geo.fastener.carcass_standard",
    displayName: "Carcass Fastener Geometry",
    componentType: "fastener",
    archetype: "fastener",
    sourceGeometry: "catalog_demo",
    dimensionsMm: { lengthMm: 32, diameterMm: 7 }
  },
  {
    id: "geo.fastener.confirmat",
    displayName: "Confirmat Geometry",
    componentType: "fastener",
    archetype: "fastener",
    sourceGeometry: "catalog_demo",
    dimensionsMm: { lengthMm: 50, diameterMm: 7 }
  },
  {
    id: "geo.fastener.shelf_pin",
    displayName: "Shelf Pin Geometry",
    componentType: "fastener",
    archetype: "fastener",
    sourceGeometry: "catalog_demo",
    dimensionsMm: { lengthMm: 12, diameterMm: 5 }
  },
  {
    id: "geo.fastener.handle_screw",
    displayName: "Handle Screw Geometry",
    componentType: "fastener",
    archetype: "fastener",
    sourceGeometry: "catalog_demo",
    dimensionsMm: { lengthMm: 25, diameterMm: 4 }
  },
  {
    id: "geo.fastener.euro_screw",
    displayName: "Euro Screw Geometry",
    componentType: "fastener",
    archetype: "fastener",
    sourceGeometry: "catalog_demo",
    dimensionsMm: { lengthMm: 13, diameterMm: 6.3 }
  },
  {
    id: "geo.fastener.drawer_fixing_screw",
    displayName: "Drawer Fixing Screw Geometry",
    componentType: "fastener",
    archetype: "fastener",
    sourceGeometry: "catalog_demo",
    dimensionsMm: { lengthMm: 16, diameterMm: 3.5 }
  },
  {
    id: "geo.hinge.clip_on.standard",
    displayName: "Clip-On Hinge Standard Geometry",
    componentType: "hinge",
    archetype: "hinge",
    sourceGeometry: "catalog_demo",
    dimensionsMm: { widthMm: 62, heightMm: 34, depthMm: 22, thicknessMm: 2.5 }
  },
  {
    id: "geo.hinge.clip_on.softclose",
    displayName: "Clip-On Hinge Softclose Geometry",
    componentType: "hinge",
    archetype: "hinge",
    sourceGeometry: "catalog_demo",
    dimensionsMm: { widthMm: 68, heightMm: 36, depthMm: 24, thicknessMm: 3 }
  },
  {
    id: "geo.hinge.corner.45.softclose",
    displayName: "Corner Hinge 45 Softclose Geometry",
    componentType: "hinge",
    archetype: "hinge",
    sourceGeometry: "catalog_demo",
    dimensionsMm: { widthMm: 72, heightMm: 38, depthMm: 28, thicknessMm: 3 }
  },
  {
    id: "geo.hinge.wide_angle.155.softclose",
    displayName: "Wide Angle Hinge 155 Softclose Geometry",
    componentType: "hinge",
    archetype: "hinge",
    sourceGeometry: "catalog_demo",
    dimensionsMm: { widthMm: 78, heightMm: 40, depthMm: 30, thicknessMm: 3 }
  },
  {
    id: "geo.push_to_open.standard",
    displayName: "Push To Open Standard Geometry",
    componentType: "push_system",
    archetype: "push_system",
    sourceGeometry: "catalog_demo",
    dimensionsMm: { lengthMm: 80, widthMm: 18, heightMm: 14, projectionMm: 20 }
  },
  {
    id: "geo.push_to_open.magnetic",
    displayName: "Push To Open Magnetic Geometry",
    componentType: "push_system",
    archetype: "push_system",
    sourceGeometry: "catalog_demo",
    dimensionsMm: { lengthMm: 92, widthMm: 20, heightMm: 16, projectionMm: 24 }
  },
  {
    id: "geo.hanging_bracket.wall.standard",
    displayName: "Hanging Bracket Standard Geometry",
    componentType: "hanging_bracket",
    archetype: "hanging_bracket",
    sourceGeometry: "catalog_demo",
    dimensionsMm: { widthMm: 48, heightMm: 55, depthMm: 18, thicknessMm: 3 }
  },
  {
    id: "geo.hanging_bracket.wall.heavy",
    displayName: "Hanging Bracket Heavy Geometry",
    componentType: "hanging_bracket",
    archetype: "hanging_bracket",
    sourceGeometry: "catalog_demo",
    dimensionsMm: { widthMm: 56, heightMm: 62, depthMm: 22, thicknessMm: 4 }
  },
  {
    id: "geo.shelf_support.standard",
    displayName: "Shelf Support Standard Geometry",
    componentType: "shelf_support",
    archetype: "shelf_support",
    sourceGeometry: "catalog_demo",
    dimensionsMm: { widthMm: 8, heightMm: 18, depthMm: 16, diameterMm: 5 }
  },
  {
    id: "geo.shelf_support.glass",
    displayName: "Shelf Support Glass Geometry",
    componentType: "shelf_support",
    archetype: "shelf_support",
    sourceGeometry: "catalog_demo",
    dimensionsMm: { widthMm: 12, heightMm: 20, depthMm: 18, diameterMm: 6 }
  },
  {
    id: "geo.drawer_insert.cutlery.standard",
    displayName: "Drawer Insert Cutlery Standard Geometry",
    componentType: "drawer_insert",
    archetype: "drawer_insert",
    sourceGeometry: "catalog_demo",
    dimensionsMm: { widthMm: 500, depthMm: 430, heightMm: 45, thicknessMm: 3 }
  },
  {
    id: "geo.drawer_insert.cutlery.premium",
    displayName: "Drawer Insert Cutlery Premium Geometry",
    componentType: "drawer_insert",
    archetype: "drawer_insert",
    sourceGeometry: "catalog_demo",
    dimensionsMm: { widthMm: 500, depthMm: 430, heightMm: 52, thicknessMm: 4 }
  },
  {
    id: "geo.lift_up.600.standard",
    displayName: "Lift Up 600 Standard Geometry",
    componentType: "lift_up",
    archetype: "lift_up",
    sourceGeometry: "catalog_demo",
    dimensionsMm: { lengthMm: 600, widthMm: 46, heightMm: 120, depthMm: 24 }
  },
  {
    id: "geo.lift_up.600.softclose",
    displayName: "Lift Up 600 Softclose Geometry",
    componentType: "lift_up",
    archetype: "lift_up",
    sourceGeometry: "catalog_demo",
    dimensionsMm: { lengthMm: 600, widthMm: 50, heightMm: 126, depthMm: 26 }
  },
  {
    id: "geo.waste_bin.pull_out.400.standard",
    displayName: "Waste Bin Pull-Out 400 Geometry",
    componentType: "waste_system",
    archetype: "waste_system",
    sourceGeometry: "catalog_demo",
    dimensionsMm: { widthMm: 362, depthMm: 460, heightMm: 410, thicknessMm: 16 }
  },
  {
    id: "geo.led_profile.drawer.500",
    displayName: "LED Profile Drawer 500 Geometry",
    componentType: "lighting",
    archetype: "lighting_profile",
    sourceGeometry: "catalog_demo",
    dimensionsMm: { lengthMm: 500, widthMm: 10, heightMm: 6, depthMm: 10 }
  }
];

const componentGeometryDefinitionsById: Record<string, ComponentGeometryDefinition> = Object.fromEntries(
  componentGeometryDefinitions.map((geometry) => [geometry.id, geometry])
);

export function getComponentGeometryDefinitionById(id: string | null | undefined): ComponentGeometryDefinition | null {
  if (!id) return null;
  return componentGeometryDefinitionsById[id] ?? null;
}

export function getComponentGeometryDefinitionForComponentId(componentId: string | null | undefined): ComponentGeometryDefinition | null {
  if (!componentId) return null;
  const component = getComponentDefinitionById(componentId);
  if (!component) return null;
  return getComponentGeometryDefinitionById(component.geometryId);
}

export function getMissingComponentGeometryIds(): string[] {
  return componentDefinitions
    .map((component) => component.geometryId)
    .filter((geometryId) => !componentGeometryDefinitionsById[geometryId]);
}
