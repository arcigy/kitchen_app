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
  item: Pick<ProjectMaterialScopeItem, "id" | "category">
): string {
  return `material-assignment:${scopeId}:${item.category}:${item.id}`;
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
  category: MaterialAssignmentCategory
): ProjectMaterialAssignment | null {
  return assignments.find((assignment) => assignment.assignmentId === `material-assignment:${category}`)
    ?? assignments.find((assignment) => assignment.category === category && !isScopedProjectMaterialAssignment(assignment))
    ?? null;
}

export function resolveEffectiveProjectMaterialAssignment(
  assignments: readonly ProjectMaterialAssignment[],
  scopeId: string,
  item: Pick<ProjectMaterialScopeItem, "id" | "category">
): EffectiveProjectMaterialAssignment {
  const assignmentId = projectMaterialScopeAssignmentId(scopeId, item);
  const override = assignments.find((assignment) => assignment.assignmentId === assignmentId) ?? null;
  if (override) return { assignmentId, assignment: override, source: "override" };
  const general = generalProjectMaterialAssignment(assignments, item.category);
  return { assignmentId, assignment: general, source: general ? "general" : null };
}
