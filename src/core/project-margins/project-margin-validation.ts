import type { MaterialAssignmentCategory } from "../project-materials/project-material-types";
import {
  PROJECT_MARGIN_SETTINGS_SCHEMA_VERSION,
  projectMarginTargetId,
  type ProjectMarginCategory,
  type ProjectMarginSettingsState
} from "./project-margin-types";

export const PROJECT_MARGIN_PERCENT_MIN = 0;
export const PROJECT_MARGIN_PERCENT_MAX = 1_000;
export const PROJECT_MARGIN_ADDITIONAL_LABOR_COST_MAX = 10_000_000;
export const PROJECT_MARGIN_ID_MAX_LENGTH = 240;
export const PROJECT_MARGIN_MAX_ITEM_OVERRIDES = 5_000;

const MATERIAL_CATEGORIES: readonly MaterialAssignmentCategory[] = [
  "corpus",
  "front",
  "worktop",
  "plinth",
  "back",
  "drawer_bottom",
  "edge_front",
  "edge_other",
  "handle",
  "hinge",
  "runner",
  "lift_up",
  "leg",
  "fastener",
  "other_component",
  "lighting"
];
const PROJECT_MARGIN_CATEGORIES = new Set<ProjectMarginCategory>([...MATERIAL_CATEGORIES, "labor"]);

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function assertKnownKeys(value: Record<string, unknown>, allowed: readonly string[], path: string): void {
  const allowedKeys = new Set(allowed);
  const unknown = Object.keys(value).find((key) => !allowedKeys.has(key));
  if (unknown) throw new Error(`${path} contains unsupported field ${unknown}.`);
}

function assertPercent(value: unknown, path: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${path} must be a finite number.`);
  if (value < PROJECT_MARGIN_PERCENT_MIN || value > PROJECT_MARGIN_PERCENT_MAX) {
    throw new Error(`${path} must be between ${PROJECT_MARGIN_PERCENT_MIN} and ${PROJECT_MARGIN_PERCENT_MAX}.`);
  }
}

function assertId(value: unknown, path: string): asserts value is string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${path} is required.`);
  if (value !== value.trim()) throw new Error(`${path} cannot have leading or trailing whitespace.`);
  if (value.length > PROJECT_MARGIN_ID_MAX_LENGTH) {
    throw new Error(`${path} cannot exceed ${PROJECT_MARGIN_ID_MAX_LENGTH} characters.`);
  }
  if (/\p{Cc}/u.test(value)) throw new Error(`${path} contains control characters.`);
}

export function isProjectMarginCategory(value: unknown): value is ProjectMarginCategory {
  return typeof value === "string" && PROJECT_MARGIN_CATEGORIES.has(value as ProjectMarginCategory);
}

export function validateProjectMarginSettingsState(
  value: unknown,
  path = "project margin settings"
): asserts value is ProjectMarginSettingsState {
  if (!isObject(value)) throw new Error(`${path} must be an object.`);
  assertKnownKeys(value, [
    "schemaVersion",
    "initialized",
    "revision",
    "calculationMode",
    "defaultMarginPercent",
    "additionalLaborCost",
    "groupMargins",
    "itemOverrides",
    "updatedAt"
  ], path);
  if (value.schemaVersion !== PROJECT_MARGIN_SETTINGS_SCHEMA_VERSION) {
    throw new Error(`${path}.schemaVersion must be ${PROJECT_MARGIN_SETTINGS_SCHEMA_VERSION}.`);
  }
  if (typeof value.initialized !== "boolean") throw new Error(`${path}.initialized must be a boolean.`);
  if (!Number.isSafeInteger(value.revision) || (value.revision as number) < 0) {
    throw new Error(`${path}.revision must be a non-negative safe integer.`);
  }
  if (value.calculationMode !== "markup_on_cost") {
    throw new Error(`${path}.calculationMode must be markup_on_cost.`);
  }
  assertPercent(value.defaultMarginPercent, `${path}.defaultMarginPercent`);
  if (
    typeof value.additionalLaborCost !== "number"
    || !Number.isFinite(value.additionalLaborCost)
    || value.additionalLaborCost < 0
    || value.additionalLaborCost > PROJECT_MARGIN_ADDITIONAL_LABOR_COST_MAX
  ) {
    throw new Error(`${path}.additionalLaborCost must be between 0 and ${PROJECT_MARGIN_ADDITIONAL_LABOR_COST_MAX}.`);
  }
  if (!isObject(value.groupMargins)) throw new Error(`${path}.groupMargins must be an object.`);
  for (const [category, marginPercent] of Object.entries(value.groupMargins)) {
    if (!isProjectMarginCategory(category)) throw new Error(`${path}.groupMargins contains unsupported category ${category}.`);
    assertPercent(marginPercent, `${path}.groupMargins.${category}`);
  }
  if (!Array.isArray(value.itemOverrides)) throw new Error(`${path}.itemOverrides must be an array.`);
  if (value.itemOverrides.length > PROJECT_MARGIN_MAX_ITEM_OVERRIDES) {
    throw new Error(`${path}.itemOverrides cannot contain more than ${PROJECT_MARGIN_MAX_ITEM_OVERRIDES} items.`);
  }
  const targetIds = new Set<string>();
  value.itemOverrides.forEach((override, index) => {
    const overridePath = `${path}.itemOverrides[${index}]`;
    if (!isObject(override)) throw new Error(`${overridePath} must be an object.`);
    assertKnownKeys(override, ["targetId", "scopeId", "itemId", "category", "marginPercent"], overridePath);
    assertId(override.targetId, `${overridePath}.targetId`);
    assertId(override.scopeId, `${overridePath}.scopeId`);
    assertId(override.itemId, `${overridePath}.itemId`);
    if (!isProjectMarginCategory(override.category)) throw new Error(`${overridePath}.category is unsupported.`);
    assertPercent(override.marginPercent, `${overridePath}.marginPercent`);
    const expectedTargetId = projectMarginTargetId({
      scopeId: override.scopeId,
      itemId: override.itemId,
      category: override.category
    });
    if (override.targetId !== expectedTargetId) throw new Error(`${overridePath}.targetId does not match its target fields.`);
    if (targetIds.has(override.targetId)) throw new Error(`${path}.itemOverrides contains duplicate targetId ${override.targetId}.`);
    targetIds.add(override.targetId);
  });
  if (value.updatedAt !== undefined) {
    if (typeof value.updatedAt !== "string" || !value.updatedAt.trim() || Number.isNaN(Date.parse(value.updatedAt))) {
      throw new Error(`${path}.updatedAt must be a valid timestamp.`);
    }
  }
}

export function assertNextProjectMarginRevision(
  expectedRevision: number,
  nextState: ProjectMarginSettingsState
): void {
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) {
    throw new Error("Expected project margin revision is invalid.");
  }
  validateProjectMarginSettingsState(nextState, "next project margin settings");
  if (nextState.revision !== expectedRevision + 1) {
    throw new Error("Next project margin revision must increment expectedRevision by one.");
  }
}
