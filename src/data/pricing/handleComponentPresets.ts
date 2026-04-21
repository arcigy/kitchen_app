import { componentDefinitions, getComponentDefinitionById } from "./componentDefinitions";
import { getComponentGeometryDefinitionForComponentId } from "./componentGeometryDefinitions";
import type { ComponentDefinition } from "./types";

export type DrawerLowHandleGeometryKind = "none" | "bar" | "knob" | "gola";
export type DrawerLowLegComponentOption = {
  componentId: string;
  displayName: string;
  component: ComponentDefinition;
};

export type DrawerLowRunnerComponentOption = {
  componentId: string;
  displayName: string;
  component: ComponentDefinition;
};

export type DrawerLowHandleComponentOption = {
  componentId: string;
  displayName: string;
  component: ComponentDefinition;
};

export type DrawerLowHandlePreset = {
  componentId: string;
  displayName: string;
  exactType: string;
  geometryKind: Exclude<DrawerLowHandleGeometryKind, "none">;
  handleLengthMm: number;
  handleSizeMm: number;
  handleProjectionMm: number;
};

export type DrawerLowLegPreset = {
  componentId: string;
  displayName: string;
  exactType: string;
  nominalHeightMm: number;
};

export type DrawerLowRunnerPreset = {
  componentId: string;
  displayName: string;
  exactType: string;
  nominalLengthMm: number;
};

const DEFAULT_BAR_HANDLE_COMPONENT_ID = "cmp.handle.bar.160.black";
const DEFAULT_PROFILE_HANDLE_COMPONENT_ID = "cmp.handle.profile.aluminium";
const DEFAULT_KNOB_HANDLE_COMPONENT_ID = "cmp.handle.knob.round.black";
const DEFAULT_LEG_COMPONENT_ID = "cmp.leg.adjustable.100.black";
const DEFAULT_RUNNER_COMPONENT_ID = "cmp.runner.pair.400.standard";

function resolveHandleGeometryKind(componentId: string): Exclude<DrawerLowHandleGeometryKind, "none"> {
  if (componentId.includes(".knob.")) return "knob";
  if (componentId.includes(".profile.")) return "bar";
  return "bar";
}

function resolveHandleLength(component: ComponentDefinition): number {
  if (typeof component.nominalLengthMm === "number" && Number.isFinite(component.nominalLengthMm) && component.nominalLengthMm > 0) {
    return component.nominalLengthMm;
  }

  return 160;
}

function getGeometryNumber(
  componentId: string,
  key: keyof NonNullable<ReturnType<typeof getComponentGeometryDefinitionForComponentId>>["dimensionsMm"],
  fallback: number
): number {
  const geometry = getComponentGeometryDefinitionForComponentId(componentId);
  const value = geometry?.dimensionsMm[key];
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

export const drawerLowHandleComponentOptions: DrawerLowHandleComponentOption[] = componentDefinitions
  .filter((component): component is ComponentDefinition => component.componentType === "handle" && component.isActive)
  .map((component) => ({
    componentId: component.id,
    displayName: component.displayName,
    component
  }))
  .sort((left, right) => left.displayName.localeCompare(right.displayName));

export const drawerLowLegComponentOptions: DrawerLowLegComponentOption[] = componentDefinitions
  .filter((component): component is ComponentDefinition => component.componentType === "leg" && component.isActive)
  .map((component) => ({
    componentId: component.id,
    displayName: component.displayName,
    component
  }))
  .sort((left, right) => left.displayName.localeCompare(right.displayName));

export const drawerLowRunnerComponentOptions: DrawerLowRunnerComponentOption[] = componentDefinitions
  .filter((component): component is ComponentDefinition => component.componentType === "runner" && component.isActive)
  .map((component) => ({
    componentId: component.id,
    displayName: component.displayName,
    component
  }))
  .sort((left, right) => left.displayName.localeCompare(right.displayName));

export function getDrawerLowHandleComponentOptions(): DrawerLowHandleComponentOption[] {
  return drawerLowHandleComponentOptions.map((option) => ({
    ...option,
    component: { ...option.component, tags: [...option.component.tags], preview: { ...option.component.preview } }
  }));
}

export function getDrawerLowLegComponentOptions(): DrawerLowLegComponentOption[] {
  return drawerLowLegComponentOptions.map((option) => ({
    ...option,
    component: { ...option.component, tags: [...option.component.tags], preview: { ...option.component.preview } }
  }));
}

export function getDrawerLowRunnerComponentOptions(): DrawerLowRunnerComponentOption[] {
  return drawerLowRunnerComponentOptions.map((option) => ({
    ...option,
    component: { ...option.component, tags: [...option.component.tags], preview: { ...option.component.preview } }
  }));
}

export function getDrawerLowHandlePresetById(componentId: string | null | undefined): DrawerLowHandlePreset | null {
  if (!componentId) return null;
  const component = getComponentDefinitionById(componentId);
  if (!component || component.componentType !== "handle") return null;

  const isProfileHandle = component.id.includes(".profile.");
  const geometryKind = resolveHandleGeometryKind(component.id);
  if (geometryKind === "knob") {
    return {
      componentId: component.id,
      displayName: component.displayName,
      exactType: "Handle Component / Round Knob",
      geometryKind,
      handleLengthMm: getGeometryNumber(component.id, "diameterMm", 32),
      handleSizeMm: getGeometryNumber(component.id, "thicknessMm", 28),
      handleProjectionMm: getGeometryNumber(component.id, "projectionMm", 28)
    };
  }

  if (isProfileHandle) {
    return {
      componentId: component.id,
      displayName: component.displayName,
      exactType: "Handle Component / Profile Handle",
      geometryKind,
      handleLengthMm: resolveHandleLength(component),
      handleSizeMm: getGeometryNumber(component.id, "thicknessMm", 14),
      handleProjectionMm: getGeometryNumber(component.id, "projectionMm", 10)
    };
  }

  return {
    componentId: component.id,
    displayName: component.displayName,
    exactType: "Handle Component / Bar Handle",
    geometryKind,
    handleLengthMm: resolveHandleLength(component),
    handleSizeMm: getGeometryNumber(component.id, "thicknessMm", 12),
    handleProjectionMm: getGeometryNumber(component.id, "projectionMm", 14)
  };
}

export function getDrawerLowLegPresetById(componentId: string | null | undefined): DrawerLowLegPreset | null {
  if (!componentId) return null;
  const component = getComponentDefinitionById(componentId);
  if (!component || component.componentType !== "leg") return null;

  const nominalHeightMm =
    getGeometryNumber(component.id, "heightMm", typeof component.nominalHeightMm === "number" ? component.nominalHeightMm : 100);

  return {
    componentId: component.id,
    displayName: component.displayName,
    exactType: "Leg Component / Adjustable Leg",
    nominalHeightMm
  };
}

export function getDrawerLowRunnerPresetById(componentId: string | null | undefined): DrawerLowRunnerPreset | null {
  if (!componentId) return null;
  const component = getComponentDefinitionById(componentId);
  if (!component || component.componentType !== "runner") return null;

  return {
    componentId: component.id,
    displayName: component.displayName,
    exactType: component.id.includes(".premium_softclose")
      ? "Runner Component / Premium Softclose Pair"
      : "Runner Component / Standard Pair",
    nominalLengthMm: typeof component.nominalLengthMm === "number" ? component.nominalLengthMm : 400
  };
}

export function resolveDrawerLowHandleComponentIdFromParams(params: Record<string, unknown> | null | undefined): string | null {
  if (!params) return null;

  const explicitComponentId =
    typeof params.handleComponentId === "string" && params.handleComponentId.trim().length > 0 ? params.handleComponentId.trim() : null;
  if (explicitComponentId && getDrawerLowHandlePresetById(explicitComponentId)) {
    return explicitComponentId;
  }

  const handleType = typeof params.handleType === "string" ? params.handleType : "bar";
  if (handleType === "none") return null;
  if (handleType === "knob") return DEFAULT_KNOB_HANDLE_COMPONENT_ID;
  if (handleType === "gola") return DEFAULT_PROFILE_HANDLE_COMPONENT_ID;

  const handleLength = typeof params.handleLengthMm === "number" ? params.handleLengthMm : Number(params.handleLengthMm);
  const resolvedLength = Number.isFinite(handleLength) && handleLength >= 176 ? 192 : 160;
  return `cmp.handle.bar.${resolvedLength}.black`;
}

export function resolveDrawerLowLegComponentIdFromParams(params: Record<string, unknown> | null | undefined): string {
  if (!params) return DEFAULT_LEG_COMPONENT_ID;

  const explicitComponentId =
    typeof params.legComponentId === "string" && params.legComponentId.trim().length > 0 ? params.legComponentId.trim() : null;
  if (explicitComponentId && getDrawerLowLegPresetById(explicitComponentId)) {
    return explicitComponentId;
  }

  const plinthHeight = typeof params.plinthHeight === "number" ? params.plinthHeight : Number(params.plinthHeight);
  return Number.isFinite(plinthHeight) && plinthHeight >= 140 ? "cmp.leg.adjustable.150.black" : DEFAULT_LEG_COMPONENT_ID;
}

export function resolveDrawerLowRunnerComponentIdFromParams(params: Record<string, unknown> | null | undefined): string {
  if (!params) return DEFAULT_RUNNER_COMPONENT_ID;

  const explicitComponentId =
    typeof params.runnerComponentId === "string" && params.runnerComponentId.trim().length > 0
      ? params.runnerComponentId.trim()
      : null;
  if (explicitComponentId && getDrawerLowRunnerPresetById(explicitComponentId)) {
    return explicitComponentId;
  }

  return DEFAULT_RUNNER_COMPONENT_ID;
}

export function applyDrawerLowHandleComponentToParams(
  params: Record<string, unknown>,
  componentId: string | null | undefined
): Record<string, unknown> {
  const nextParams: Record<string, unknown> = { ...params };
  const preset = getDrawerLowHandlePresetById(componentId ?? null);

  if (!preset) {
    nextParams.handleType = "none";
    delete nextParams.handleComponentId;
    return nextParams;
  }

  nextParams.handleComponentId = preset.componentId;
  nextParams.handleType = preset.geometryKind;
  nextParams.handleLengthMm = preset.handleLengthMm;
  nextParams.handleSizeMm = preset.handleSizeMm;
  nextParams.handleProjectionMm = preset.handleProjectionMm;
  return nextParams;
}

export function applyDrawerLowLegComponentToParams(
  params: Record<string, unknown>,
  componentId: string | null | undefined
): Record<string, unknown> {
  const nextParams: Record<string, unknown> = { ...params };
  const preset = getDrawerLowLegPresetById(componentId ?? null);
  if (!preset) {
    delete nextParams.legComponentId;
    return nextParams;
  }

  nextParams.legComponentId = preset.componentId;
  nextParams.plinthHeight = preset.nominalHeightMm;
  return nextParams;
}

export function applyDrawerLowRunnerComponentToParams(
  params: Record<string, unknown>,
  componentId: string | null | undefined
): Record<string, unknown> {
  const nextParams: Record<string, unknown> = { ...params };
  const preset = getDrawerLowRunnerPresetById(componentId ?? null);

  if (!preset) {
    delete nextParams.runnerComponentId;
    return nextParams;
  }

  nextParams.runnerComponentId = preset.componentId;
  return nextParams;
}

export function getDefaultDrawerLowHandleComponentId(): string {
  return DEFAULT_BAR_HANDLE_COMPONENT_ID;
}

export function getDefaultDrawerLowLegComponentId(): string {
  return DEFAULT_LEG_COMPONENT_ID;
}

export function getDefaultDrawerLowRunnerComponentId(): string {
  return DEFAULT_RUNNER_COMPONENT_ID;
}
