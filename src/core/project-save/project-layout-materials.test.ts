import { describe, expect, it } from "vitest";
import { createEmptyProjectMaterialAssignmentsState } from "../project-materials/project-material-types";
import { synchronizeLayoutMaterials } from "./project-layout-materials";

describe("saved layout material authority", () => {
  it("replaces stale nested materials without changing past undo snapshots", () => {
    const older = createEmptyProjectMaterialAssignmentsState();
    const current = { ...older, initialized: true, revision: 9 };
    const layout = { snapshot: { materialAssignments: older, modules: [{ id: "cabinet" }] } };
    const result = synchronizeLayoutMaterials(layout, current);
    expect(result).toEqual({ snapshot: { materialAssignments: current, modules: [{ id: "cabinet" }] } });
    expect(layout.snapshot.materialAssignments.revision).toBe(0);
    current.revision = 10;
    expect(result).toMatchObject({ snapshot: { materialAssignments: { revision: 9 } } });
  });
});
