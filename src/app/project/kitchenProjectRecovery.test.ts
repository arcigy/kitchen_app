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

const makeWorktopOnlyState = (): ProjectSaveFile["appState"] => ({
  ...makeState("kg-worktop-only"),
  layout: {
    snapshot: {
      instances: [],
      worktops: [{
        id: "wt-only",
        kitchenGroupId: "kg-worktop-only",
        params: {
          path: [
            { x: -1563, z: 1431 },
            { x: -1563, z: -110 },
            { x: 1147, z: -110 },
            { x: 1147, z: 2010 }
          ],
          depthMm: 620,
          thicknessMm: 38,
          heightMm: 820
        }
      }]
    },
    windows: [],
    doors: []
  }
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

  it("reconstructs a worktop-only orphan and preserves its geometry", () => {
    const prepared = normalizeKitchenProjectAppState(makeWorktopOnlyState());
    const kitchen = prepared.appState.kitchen as {
      groups: Array<{ id: string; instanceIds: string[] }>;
      activeEdit?: {
        origin: string;
        groupId: string;
        instanceSnapshots: unknown[];
        worktopSnapshots: Array<{ id: string; params: { path: Array<{ x: number; z: number }> } }>;
      };
      activeKitchenGroupId: string | null;
    };

    expect(kitchen.groups).toEqual([{
      id: "kg-worktop-only",
      name: "Obnovená kuchyňa 1",
      ctx: { name: "Kitchen" },
      instanceIds: []
    }]);
    expect(kitchen.activeKitchenGroupId).toBe("kg-worktop-only");
    expect(kitchen.activeEdit).toMatchObject({ origin: "existing", groupId: "kg-worktop-only" });
    expect(kitchen.activeEdit?.instanceSnapshots).toEqual([]);
    expect(kitchen.activeEdit?.worktopSnapshots).toEqual([{
      id: "wt-only",
      params: expect.objectContaining({
        depthMm: 620,
        thicknessMm: 38,
        heightMm: 820,
        path: [
          { x: -1563, z: 1431 },
          { x: -1563, z: -110 },
          { x: 1147, z: -110 },
          { x: 1147, z: 2010 }
        ]
      })
    }]);
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
