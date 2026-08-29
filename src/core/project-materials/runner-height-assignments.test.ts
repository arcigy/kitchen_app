import { describe, expect, it } from "vitest";
import { PROJECT_MATERIAL_ASSIGNMENTS_SCHEMA_VERSION } from "./project-material-types";
import { drawerRunnerVariantKey } from "../../modules/drawers/drawerHeightContract";
import { synchronizeRunnerHeightAssignments } from "./runner-height-assignments";

describe("runner height assignments", () => {
  it("creates independent Supplier Bridge targets for equal front heights in different corpus thicknesses", () => {
    const eighteenMillimetres = drawerRunnerVariantKey(180, 18);
    const nineteenMillimetres = drawerRunnerVariantKey(180, 19);
    const state = synchronizeRunnerHeightAssignments({
      schemaVersion: PROJECT_MATERIAL_ASSIGNMENTS_SCHEMA_VERSION,
      initialized: true,
      revision: 0,
      assignments: []
    }, [
      {
        id: "module:drawer-18",
        kind: "module",
        label: "Zásuvky 18 mm",
        items: [{ id: "runner-18", category: "runner", variantKey: eighteenMillimetres, label: "Zásuvkové výsuvy", description: "Čelo 180 mm · Korpus 18 mm", quantity: 1, unit: "pcs", pieces: 1 }]
      },
      {
        id: "module:drawer-19",
        kind: "module",
        label: "Zásuvky 19 mm",
        items: [{ id: "runner-19", category: "runner", variantKey: nineteenMillimetres, label: "Zásuvkové výsuvy", description: "Čelo 180 mm · Korpus 19 mm", quantity: 1, unit: "pcs", pieces: 1 }]
      }
    ], "2026-08-09T12:00:00.000Z");

    const runners = state.assignments.filter((assignment) => assignment.category === "runner");
    expect(runners).toHaveLength(2);
    expect(runners.map((assignment) => assignment.variantKey)).toEqual([eighteenMillimetres, nineteenMillimetres]);
    expect(runners.map((assignment) => assignment.customValues.runnerVariantLabel)).toEqual([
      "Čelo 180 mm · Korpus 18 mm",
      "Čelo 180 mm · Korpus 19 mm"
    ]);
  });
});
