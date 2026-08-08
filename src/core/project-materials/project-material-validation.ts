import type {
  JsonValue,
  MaterialAssignmentCategory,
  ProjectMaterialAssignment,
  ProjectMaterialAssignmentsState
} from "./project-material-types";
import { PROJECT_MATERIAL_ASSIGNMENTS_SCHEMA_VERSION } from "./project-material-types";

const MATERIAL_ASSIGNMENT_CATEGORIES = new Set<MaterialAssignmentCategory>([
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
  "other_component"
]);

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function requireNonEmptyString(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${path} must be a non-empty string.`);
  return value;
}

function requireIsoDate(value: unknown, path: string): void {
  if (typeof value !== "string" || !value.trim() || Number.isNaN(Date.parse(value))) {
    throw new Error(`${path} must be an ISO date string.`);
  }
}

function validateJsonValue(value: unknown, path: string, seen: WeakSet<object>): asserts value is JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`${path} must contain only finite JSON numbers.`);
    return;
  }
  if (!value || typeof value !== "object") throw new Error(`${path} must contain only JSON values.`);
  if (seen.has(value)) throw new Error(`${path} contains circular references.`);
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((item, index) => validateJsonValue(item, `${path}[${index}]`, seen));
  } else {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      validateJsonValue(child, `${path}.${key}`, seen);
    }
  }
  seen.delete(value);
}

function optionalId(value: unknown, path: string): string | undefined {
  if (value === undefined) return undefined;
  return requireNonEmptyString(value, path);
}

function validateSnapshot(
  value: unknown,
  expectedId: string | undefined,
  expectedEntityType: "material" | "component",
  path: string
): void {
  if (value === undefined) return;
  if (!expectedId) throw new Error(`${path} requires a matching catalog id.`);
  if (!isObject(value)) throw new Error(`${path} must be an object.`);
  if (!isObject(value.definition)) throw new Error(`${path}.definition must be an object.`);
  if (value.definition.entityType !== expectedEntityType) {
    throw new Error(`${path}.definition must be a ${expectedEntityType}.`);
  }
  if (value.definition.id !== expectedId) throw new Error(`${path}.definition.id must match ${expectedId}.`);
  if (value.unitPrice !== null && (typeof value.unitPrice !== "number" || !Number.isFinite(value.unitPrice) || value.unitPrice < 0)) {
    throw new Error(`${path}.unitPrice must be null or a non-negative finite number.`);
  }
  requireNonEmptyString(value.currency, `${path}.currency`);
  if (value.priceListId !== null) requireNonEmptyString(value.priceListId, `${path}.priceListId`);
  requireIsoDate(value.capturedAt, `${path}.capturedAt`);
}

function validateAssignment(value: unknown, path: string): asserts value is ProjectMaterialAssignment {
  if (!isObject(value)) throw new Error(`${path} must be an object.`);
  requireNonEmptyString(value.assignmentId, `${path}.assignmentId`);
  if (typeof value.category !== "string" || !MATERIAL_ASSIGNMENT_CATEGORIES.has(value.category as MaterialAssignmentCategory)) {
    throw new Error(`${path}.category is unsupported.`);
  }
  if (value.kind !== "material" && value.kind !== "component") throw new Error(`${path}.kind is unsupported.`);
  optionalId(value.variantKey, `${path}.variantKey`);
  if (value.source !== "auto" && value.source !== "user") throw new Error(`${path}.source is unsupported.`);

  const materialId = optionalId(value.materialId, `${path}.materialId`);
  const componentId = optionalId(value.componentId, `${path}.componentId`);
  const edgeFrontId = optionalId(value.edgeFrontId, `${path}.edgeFrontId`);
  const edgeOtherId = optionalId(value.edgeOtherId, `${path}.edgeOtherId`);
  if (value.kind === "material" && componentId) throw new Error(`${path} cannot contain componentId for a material assignment.`);
  if (value.kind === "component" && (materialId || edgeFrontId || edgeOtherId)) {
    throw new Error(`${path} cannot contain material ids for a component assignment.`);
  }
  if (value.thicknessMm !== undefined && (typeof value.thicknessMm !== "number" || !Number.isFinite(value.thicknessMm) || value.thicknessMm < 0)) {
    throw new Error(`${path}.thicknessMm must be a non-negative finite number.`);
  }
  if (!isObject(value.customValues)) throw new Error(`${path}.customValues must be a JSON object.`);
  validateJsonValue(value.customValues, `${path}.customValues`, new WeakSet<object>());
  if (!isObject(value.snapshots)) throw new Error(`${path}.snapshots must be an object.`);
  if (materialId && value.snapshots.material === undefined) throw new Error(`${path}.snapshots.material is required for materialId.`);
  if (componentId && value.snapshots.component === undefined) throw new Error(`${path}.snapshots.component is required for componentId.`);
  if (edgeFrontId && value.snapshots.edgeFront === undefined) throw new Error(`${path}.snapshots.edgeFront is required for edgeFrontId.`);
  if (edgeOtherId && value.snapshots.edgeOther === undefined) throw new Error(`${path}.snapshots.edgeOther is required for edgeOtherId.`);
  validateSnapshot(value.snapshots.material, materialId, "material", `${path}.snapshots.material`);
  validateSnapshot(value.snapshots.component, componentId, "component", `${path}.snapshots.component`);
  validateSnapshot(value.snapshots.edgeFront, edgeFrontId, "material", `${path}.snapshots.edgeFront`);
  validateSnapshot(value.snapshots.edgeOther, edgeOtherId, "material", `${path}.snapshots.edgeOther`);
  requireIsoDate(value.updatedAt, `${path}.updatedAt`);
}

export function validateProjectMaterialAssignmentsState(
  value: unknown,
  path = "project material assignments"
): asserts value is ProjectMaterialAssignmentsState {
  if (!isObject(value)) throw new Error(`${path} must be an object.`);
  if (value.schemaVersion !== PROJECT_MATERIAL_ASSIGNMENTS_SCHEMA_VERSION) throw new Error(`${path}.schemaVersion is unsupported.`);
  if (typeof value.initialized !== "boolean") throw new Error(`${path}.initialized must be a boolean.`);
  if (
    !Number.isSafeInteger(value.revision) ||
    (value.revision as number) < 0 ||
    (value.revision as number) >= Number.MAX_SAFE_INTEGER
  ) {
    throw new Error(`${path}.revision must be a non-negative incrementable safe integer.`);
  }
  if (!Array.isArray(value.assignments)) throw new Error(`${path}.assignments must be an array.`);
  if (value.updatedAt !== undefined) requireIsoDate(value.updatedAt, `${path}.updatedAt`);

  const assignmentIds = new Set<string>();
  value.assignments.forEach((assignment, index) => {
    const assignmentPath = `${path}.assignments[${index}]`;
    validateAssignment(assignment, assignmentPath);
    if (assignmentIds.has(assignment.assignmentId)) {
      throw new Error(`${path} contains duplicate assignmentId ${assignment.assignmentId}.`);
    }
    assignmentIds.add(assignment.assignmentId);
  });
}
