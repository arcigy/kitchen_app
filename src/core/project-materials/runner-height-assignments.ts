import {
  drawerCorpusThicknessFromVariantKey,
  drawerFrontHeightFromVariantKey,
  drawerRunnerVariantLabel
} from "../../modules/drawers/drawerHeightContract";
import {
  PROJECT_MATERIAL_ASSIGNMENTS_SCHEMA_VERSION,
  type ProjectMaterialAssignment,
  type ProjectMaterialAssignmentsState,
  type ProjectMaterialScope
} from "./project-material-types";

export function runnerHeightAssignmentId(variantKey: string): string {
  return `material-assignment:runner:${variantKey}`;
}
export function synchronizeRunnerHeightAssignments(
  state: ProjectMaterialAssignmentsState,
  scopes: readonly ProjectMaterialScope[],
  now = new Date().toISOString()
): ProjectMaterialAssignmentsState {
  const demanded = new Set<string>();
  for (const scope of scopes) {
    for (const item of scope.items) {
      if (item.category === "runner" && item.variantKey && drawerFrontHeightFromVariantKey(item.variantKey) != null) {
        demanded.add(item.variantKey);
      }
    }
  }

  const assignments = state.assignments.filter((assignment) => {
    if (assignment.category !== "runner") return true;
    if (!assignment.variantKey) return false;
    return demanded.has(assignment.variantKey) || assignment.source === "user";
  });
  const existing = new Set(assignments.filter((assignment) => assignment.category === "runner").map((assignment) => assignment.variantKey));
  for (const variantKey of [...demanded].sort()) {
    if (existing.has(variantKey)) continue;
    const frontHeightMm = drawerFrontHeightFromVariantKey(variantKey)!;
    const corpusThicknessMm = drawerCorpusThicknessFromVariantKey(variantKey);
    assignments.push({
      assignmentId: runnerHeightAssignmentId(variantKey),
      category: "runner",
      variantKey,
      kind: "component",
      customValues: {
        drawerFrontHeightMm: frontHeightMm,
        ...(corpusThicknessMm == null ? {} : {
          drawerCorpusThicknessMm: corpusThicknessMm,
          runnerVariantLabel: drawerRunnerVariantLabel(frontHeightMm, corpusThicknessMm)
        })
      },
      source: "auto",
      snapshots: {},
      updatedAt: now
    } satisfies ProjectMaterialAssignment);
  }

  return {
    ...structuredClone(state),
    schemaVersion: PROJECT_MATERIAL_ASSIGNMENTS_SCHEMA_VERSION,
    assignments
  };
}
