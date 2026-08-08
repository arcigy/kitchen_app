import type {
  MaterialAssignmentCategory,
  ProjectMaterialAssignment,
  ProjectMaterialScopeItem
} from "./project-material-types";

export type EffectiveProjectMaterialAssignment = {
  assignmentId: string;
  assignment: ProjectMaterialAssignment | null;
  source: "override" | "general" | null;
};

export function projectMaterialScopeAssignmentId(
  scopeId: string,
  item: Pick<ProjectMaterialScopeItem, "id" | "category" | "variantKey">
): string {
  return `material-assignment:${scopeId}:${item.category}:${item.variantKey ?? item.id}`;
}

export function isScopedProjectMaterialAssignment(assignment: ProjectMaterialAssignment): boolean {
  return assignment.assignmentId.startsWith("material-assignment:module:")
    || assignment.assignmentId.startsWith("material-assignment:addition:");
}

export function topLevelProjectMaterialAssignments(
  assignments: readonly ProjectMaterialAssignment[]
): ProjectMaterialAssignment[] {
  return assignments.filter((assignment) => !isScopedProjectMaterialAssignment(assignment));
}

export function generalProjectMaterialAssignment(
  assignments: readonly ProjectMaterialAssignment[],
  category: MaterialAssignmentCategory,
  variantKey?: string
): ProjectMaterialAssignment | null {
  if (variantKey) {
    return assignments.find((assignment) =>
      assignment.category === category &&
      assignment.variantKey === variantKey &&
      !isScopedProjectMaterialAssignment(assignment)
    ) ?? null;
  }
  return assignments.find((assignment) => assignment.assignmentId === `material-assignment:${category}`)
    ?? assignments.find((assignment) => assignment.category === category && !assignment.variantKey && !isScopedProjectMaterialAssignment(assignment))
    ?? null;
}

export function resolveEffectiveProjectMaterialAssignment(
  assignments: readonly ProjectMaterialAssignment[],
  scopeId: string,
  item: Pick<ProjectMaterialScopeItem, "id" | "category" | "variantKey">
): EffectiveProjectMaterialAssignment {
  const assignmentId = projectMaterialScopeAssignmentId(scopeId, item);
  const override = assignments.find((assignment) => assignment.assignmentId === assignmentId) ?? null;
  if (override) return { assignmentId, assignment: override, source: "override" };
  const general = generalProjectMaterialAssignment(assignments, item.category, item.variantKey);
  return { assignmentId, assignment: general, source: general ? "general" : null };
}
