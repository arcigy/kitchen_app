import { describe, expect, it } from "vitest";
import { createEmptyProjectMaterialAssignmentsState } from "./project-material-types";
import { validateProjectMaterialAssignmentsState } from "./project-material-validation";

describe("project material assignment structural validation", () => {
  it("rejects a revision that cannot be incremented safely", () => {
    const state = createEmptyProjectMaterialAssignmentsState();
    state.revision = Number.MAX_SAFE_INTEGER;

    expect(() => validateProjectMaterialAssignmentsState(state)).toThrow(/incrementable safe integer/);
  });
});
