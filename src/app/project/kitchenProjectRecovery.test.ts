import { describe, expect, it } from "vitest";
import { createEmptyProjectMaterialAssignmentsState } from "../../core/project-materials/project-material-types";
import type { ProjectSaveFile } from "../../core/project-save/project-save-types";
import { normalizeKitchenProjectAppState } from "./kitchenProjectRecovery";

const makeState = (activeKitchenGroupId: string | null): ProjectSaveFile["appState"] => ({
  layout: {
    snapshot: {
      instances: [{
        id: "m1",
        params: { type: "fwm_catalog_base_doors", width: 600 },
        kitchenGroupId: "kg-orphan",
        positionMm: { x: 1000, y: 0, z: 200 },
        rotationYDeg: 90
      }],
      worktops: [{
        id: "wt1",
        kitchenGroupId: "kg-orphan",
        params: { path: [{ x: 0, z: 0 }, { x: 1000, z: 0 }] }
      }]
    },
    windows: [],
    doors: []
  },
  kitchen: {
    context: { name: "Kitchen" },
    groups: [],
    activeKitchenGroupId
  },
  modules: [],
  materialAssignments: createEmptyProjectMaterialAssignmentsState(),
  scene: {}
});

describe("kitchen project recovery normalization", () => {
  it("reconstructs an orphan legacy kitchen and resumes it safely", () => {
    const prepared = normalizeKitchenProjectAppState(makeState("kg-orphan"));
    const kitchen = prepared.appState.kitchen as { groups: Array<{ id: string; instanceIds: string[] }>; activeEdit?: { origin: string; groupId: string }; activeKitchenGroupId: string | null };

    expect(kitchen.groups).toEqual([{ id: "kg-orphan", name: "Obnovená kuchyňa 1", ctx: { name: "Kitchen" }, instanceIds: ["m1"] }]);
    expect(kitchen.activeKitchenGroupId).toBe("kg-orphan");
    expect(kitchen.activeEdit).toMatchObject({ origin: "existing", groupId: "kg-orphan" });
    expect(prepared.notice).toContain("obnovená");
  });

  it("keeps a valid new active draft out of committed groups", () => {
    const state = makeState("kg-draft");
    (state.kitchen as Record<string, unknown>).activeEdit = {
      version: 1,
      groupId: "kg-draft",
      origin: "new",
      activeName: "Kuchyňa 1",
      snapshotName: "Kuchyňa 1",
      editingExistingGroupId: null,
      moduleEditLayer: "base",
      activeTallEditorInstanceId: null,
      activeTallEditorSnapshot: null,
      selectedWorktopSegment: null,
      kitchenCtxSnapshot: { name: "Kitchen" },
      instanceSnapshots: [],
      worktopSnapshots: []
    };
    const prepared = normalizeKitchenProjectAppState(state);
    const kitchen = prepared.appState.kitchen as { groups: Array<{ id: string }>; activeEdit?: { origin: string; groupId: string } };
    expect(kitchen.groups).toEqual([{ id: "kg-orphan", name: "Obnovená kuchyňa 1", ctx: { name: "Kitchen" }, instanceIds: ["m1"] }]);
    expect(kitchen.activeEdit).toMatchObject({ origin: "new", groupId: "kg-draft" });
  });
});
