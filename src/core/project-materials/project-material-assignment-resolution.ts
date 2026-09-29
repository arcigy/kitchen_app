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
  item: Pick<ProjectMaterialScopeItem, "id" | "category" | "variantKey" | "edgeGroupId" | "edgeGroupExplicit">
): string {
  return `material-assignment:${scopeId}:${item.category}:${item.variantKey ?? item.id}`;
}

export function isScopedProjectMaterialAssignment(assignment: ProjectMaterialAssignment): boolean {
  return !!assignment.extraComponent || assignment.assignmentId.startsWith("material-assignment:module:")
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
  item: Pick<ProjectMaterialScopeItem, "id" | "category" | "variantKey" | "edgeGroupId" | "edgeGroupExplicit">
): EffectiveProjectMaterialAssignment {
  const extra = assignments.find(assignment => assignment.assignmentId === item.id && assignment.extraComponent?.scopeId === scopeId);
  if (extra) return { assignmentId: extra.assignmentId, assignment: extra, source: "override" };
  const assignmentId = projectMaterialScopeAssignmentId(scopeId, item);
  const override = assignments.find((assignment) => assignment.assignmentId === assignmentId) ?? null;
  // Old per-part overrides continue to apply to construction defaults. Explicit
  // edge choices always use their selected shared group.
  const constructionDefault = !item.edgeGroupExplicit && (item.edgeGroupId === "material-assignment:edge_front" || item.edgeGroupId === "material-assignment:edge_other");
  if (override && (!item.edgeGroupId || constructionDefault)) return {assignmentId,assignment:override,source:"override"};
  if (item.edgeGroupId) {
    const group = assignments.find(a => a.assignmentId === item.edgeGroupId && (a.category === "edge_front" || a.category === "edge_other"));
    return { assignmentId: item.edgeGroupId, assignment: group ?? null, source: group ? "general" : null };
  }
  const general = generalProjectMaterialAssignment(assignments, item.category, item.variantKey);
  return { assignmentId, assignment: general, source: general ? "general" : null };
}
