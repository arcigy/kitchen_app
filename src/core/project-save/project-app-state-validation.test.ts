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
  it('rejects a persisted upper attachment to a missing wall', () => {
    const saved = state(null, null);
    const invalid = { ...saved, layout: { ...saved.layout, snapshot: { ...saved.layout.snapshot,
      instances: [{ id: 'upper', kitchenPlacement: { kind: 'wall', wallId: 'missing', wallSide: 'left', segmentIndex: 0, offsetAlongM: 1 } }]
    } } };
    expect(() => validateProjectAppState(invalid)).toThrow(/missing wall/);
  });
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


describe("wall dimensional integrity", () => {
  const fixture = () => ({layout:{snapshot:{walls:[{id:"wall",params:{aMm:{x:0,z:0},bMm:{x:3000,z:500},thicknessMm:150,heightMm:2600}}]},windows:[],doors:[]}});
  it("accepts a genuine diagonal without snapping it to an axis", () => {
    const data=fixture(),before=structuredClone(data);validateProjectAppState(data);expect(data).toEqual(before);
  });
  it.each([0,-100])("rejects nonpositive thickness %s", thicknessMm => {
    const data=fixture();data.layout.snapshot.walls[0]!.params.thicknessMm=thicknessMm;
    expect(()=>validateProjectAppState(data)).toThrow(/positive/);
  });
  it("rejects an opening above its host wall", () => {
    const data=fixture();
    expect(()=>validateProjectAppState({...data,layout:{...data.layout,windows:[{id:"w",params:{wallId:"wall",centerMm:1000,widthMm:800,sillHeightMm:1800,heightMm:1200}}]}})).toThrow(/height/);
  });
});
