import { describe, expect, it } from "vitest";
import { validateProjectAppState } from "./project-app-state-validation";

const activeEdit = {
  version: 1,
  groupId: "kg-draft",
  origin: "new",
  activeName: "Kuchyna",
  snapshotName: "Kuchyna",
  editingExistingGroupId: null,
  moduleEditLayer: "base",
  kitchenCtxSnapshot: {},
  instanceSnapshots: [],
  worktopSnapshots: []
};

const state = (groupId: string | null, edit: unknown = activeEdit) => ({
  layout: {
    snapshot: {
      walls: [],
      floors: [],
      columns: [],
      sections: [],
      worktops: groupId ? [{ id: "wt1", kitchenGroupId: groupId, params: {} }] : [],
      instances: [],
      customFurniture: []
    },
    windows: [],
    doors: []
  },
  kitchen: { groups: [], activeKitchenGroupId: edit ? groupId : null, activeEdit: edit },
  modules: [],
  materialAssignments: {},
  scene: {}
});

describe("project app state kitchen references", () => {
  it("accepts references owned by a new active edit", () => {
    expect(() => validateProjectAppState(state("kg-draft"))).not.toThrow();
  });

  it("rejects an orphan reference without a valid active edit", () => {
    expect(() => validateProjectAppState(state("kg-orphan", null))).toThrow(/missing kitchen group/);
  });

  it("keeps the legacy active-group shape loadable for app-level repair", () => {
    expect(() => validateProjectAppState({
      ...state("kg-orphan", null),
      kitchen: { groups: [], activeKitchenGroupId: "kg-orphan" }
    })).not.toThrow();
  });
});
