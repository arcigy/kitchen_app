import type { MaterialAssignmentCategory } from "../project-materials/project-material-types";

export const PROJECT_MARGIN_SETTINGS_SCHEMA_VERSION = 1 as const;
export const DEFAULT_PROJECT_MARGIN_PERCENT = 20;
export const DEFAULT_PROJECT_ADDITIONAL_LABOR_COST = 0;

export type ProjectMarginCategory = MaterialAssignmentCategory | "labor";

export type ProjectMarginItemOverride = {
  targetId: string;
  scopeId: string;
  itemId: string;
  category: ProjectMarginCategory;
  marginPercent: number;
};

export type ProjectMarginSettingsState = {
  schemaVersion: typeof PROJECT_MARGIN_SETTINGS_SCHEMA_VERSION;
  initialized: boolean;
  revision: number;
  calculationMode: "markup_on_cost";
  defaultMarginPercent: number;
  additionalLaborCost: number;
  groupMargins: Partial<Record<ProjectMarginCategory, number>>;
  itemOverrides: ProjectMarginItemOverride[];
  updatedAt?: string;
};

export type ProjectMarginTarget = Pick<ProjectMarginItemOverride, "scopeId" | "itemId" | "category">;

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function legacyNumber(value: unknown, fallback: number, maximum: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(0, parsed));
}

export function projectMarginTargetId(target: ProjectMarginTarget): string {
  return `project-margin:${encodeURIComponent(target.scopeId)}:${target.category}:${encodeURIComponent(target.itemId)}`;
}

export function createDefaultProjectMarginSettingsState(): ProjectMarginSettingsState {
  return {
    schemaVersion: PROJECT_MARGIN_SETTINGS_SCHEMA_VERSION,
    initialized: false,
    revision: 0,
    calculationMode: "markup_on_cost",
    defaultMarginPercent: DEFAULT_PROJECT_MARGIN_PERCENT,
    additionalLaborCost: DEFAULT_PROJECT_ADDITIONAL_LABOR_COST,
    groupMargins: {},
    itemOverrides: []
  };
}

export function isProjectMarginSettingsState(value: unknown): value is ProjectMarginSettingsState {
  return isObject(value) && value.schemaVersion === PROJECT_MARGIN_SETTINGS_SCHEMA_VERSION;
}

export function normalizeProjectMarginSettingsState(value: unknown): ProjectMarginSettingsState {
  if (isProjectMarginSettingsState(value)) return structuredClone(value);

  const legacy = isObject(value) ? value : {};
  const legacyDefault = legacy.defaultMarginPercent
    ?? legacy.globalMarginPercent
    ?? legacy.marginPercent
    ?? legacy.margin;
  const hasLegacySettings = Object.keys(legacy).length > 0;
  return {
    ...createDefaultProjectMarginSettingsState(),
    initialized: hasLegacySettings,
    defaultMarginPercent: legacyNumber(legacyDefault, DEFAULT_PROJECT_MARGIN_PERCENT, 1_000),
    additionalLaborCost: legacyNumber(
      legacy.additionalLaborCost,
      DEFAULT_PROJECT_ADDITIONAL_LABOR_COST,
      10_000_000
    )
  };
}

export function resolveEffectiveProjectMarginPercent(
  state: ProjectMarginSettingsState,
  target: ProjectMarginTarget
): number {
  const targetId = projectMarginTargetId(target);
  return state.itemOverrides.find((override) => override.targetId === targetId)?.marginPercent
    ?? state.groupMargins[target.category]
    ?? state.defaultMarginPercent;
}
