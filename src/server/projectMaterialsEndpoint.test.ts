import { describe, expect, it } from "vitest";
import { createSystemCatalogSeed } from "../core/catalog/catalog-bootstrap";
import { createDefaultProjectMaterialAssignments } from "../core/project-materials/project-material-business";
import { copyProjectMaterialAssignmentToScope } from "../core/project-materials/project-material-copy";
import { removeScopedProjectMaterialAssignmentState } from "./projectMaterialsEndpoint";

const NOW = "2026-08-10T08:00:00.000Z";

describe("project material override removal", () => {
  it("removes only the requested scoped override and advances the revision", () => {
    const catalog = { clientId: "client_test", ...createSystemCatalogSeed() };
    const state = createDefaultProjectMaterialAssignments(catalog, NOW);
    const source = state.assignments.find((assignment) => assignment.category === "front")!;
    const scoped = copyProjectMaterialAssignmentToScope(source, "module:m1", {
      id: "door",
      category: "front"
    }, NOW);
    const current = { ...state, revision: 4, assignments: [...state.assignments, scoped] };

    const result = removeScopedProjectMaterialAssignmentState(current, {
      type: "remove_assignment",
      assignmentId: scoped.assignmentId
    }, 4, "2026-08-10T08:01:00.000Z");

    expect(result.state.revision).toBe(5);
    expect(result.state.assignments).toHaveLength(state.assignments.length);
    expect(result.state.assignments.some((assignment) => assignment.assignmentId === source.assignmentId)).toBe(true);
    expect(result.state.assignments.some((assignment) => assignment.assignmentId === scoped.assignmentId)).toBe(false);
  });

  it("rejects deleting a General settings assignment", () => {
    const catalog = { clientId: "client_test", ...createSystemCatalogSeed() };
    const state = createDefaultProjectMaterialAssignments(catalog, NOW);
    const general = state.assignments[0]!;

    expect(() => removeScopedProjectMaterialAssignmentState(state, {
      type: "remove_assignment",
      assignmentId: general.assignmentId
    }, state.revision, NOW)).toThrow("Only a module or addition override can be removed.");
  });
});
