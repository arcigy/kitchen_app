import { Box3, Mesh, type Object3D } from "three";
import { describe, expect, it } from "vitest";
import { createSystemCatalogSeed } from "../../core/catalog/catalog-bootstrap";
import type { ClientCatalog } from "../../core/catalog/catalog-types";
import { makeDefaultKitchenContext } from "../../layout/kitchenContext";
import { buildApplianceSubmodule } from "./geometry";
import { calculateApplianceSubmoduleBOM } from "./calculation";
import {
  APPLIANCE_SUBMODULE_DEFINITIONS,
  makeDefaultApplianceSubmoduleParams
} from "./types";

function boundsMm(object: { updateMatrixWorld: (force?: boolean) => void }) {
  object.updateMatrixWorld(true);
  const root = object as Object3D;
  const box = new Box3();
  let hasVisiblePart = false;
  root.traverse((child) => {
    if (!("isMesh" in child) || !child.isMesh || child.visible === false || child.userData.hiddenByDefault === true) return;
    box.union(new Box3().setFromObject(child));
    hasVisiblePart = true;
  });
  if (!hasVisiblePart) box.setFromObject(object as never);
  return {
    width: (box.max.x - box.min.x) * 1000,
    height: (box.max.y - box.min.y) * 1000,
    depth: (box.max.z - box.min.z) * 1000
  };
}

function getMesh(root: Object3D, name: string): Object3D | null {
  let found: Object3D | null = null;
  root.traverse((object) => {
    if (object.name === name) found = object;
  });
  return found;
}

describe("appliance submodules", () => {
  it("declares appliance submodule contracts separately from cabinet modules", () => {
    expect(APPLIANCE_SUBMODULE_DEFINITIONS.map((definition) => definition.type)).toEqual([
      "microwave",
      "oven",
      "fridge",
      "fridge_freezer",
      "sink",
      "dishwasher",
      "cooktop"
    ]);
    const cooktop = APPLIANCE_SUBMODULE_DEFINITIONS.find((definition) => definition.type === "cooktop");
    expect(cooktop?.defaultParams.placementRule).toBe("worktop_top_only");
    expect(cooktop?.defaultParams.requiresWorktop).toBe(true);
  });

  it("builds a microwave appliance submodule with real dimensions and pricing params", () => {
    const catalog: ClientCatalog = { clientId: "test", ...createSystemCatalogSeed() };
    const params = {
      ...makeDefaultApplianceSubmoduleParams("microwave"),
      brand: "TestBrand",
      model: "MW 600",
      width: 595,
      height: 382,
      depth: 320,
      priceNet: 321
    };
    const group = buildApplianceSubmodule(params, catalog);
    const meshNames: string[] = [];
    group.traverse((object) => {
      if ("isMesh" in object && object.isMesh) meshNames.push(object.name);
    });
    expect(meshNames).toContain("microwave_body");
    expect(meshNames).toContain("microwave_front_black_glass");
    expect(meshNames).toContain("microwave_door_smoked_window");
    expect(meshNames).toContain("microwave_window_rib_1");
    expect(meshNames).toContain("microwave_control_panel_gloss");
    expect(meshNames).toContain("microwave_vertical_handle");
    expect(meshNames).toContain("microwave_knob_1_outer");
    expect(meshNames).toContain("microwave_knob_2_outer");
    expect(meshNames).toContain("microwave_left_vent_1_1");
    expect(meshNames).not.toContain("microwave_left_side_panel");
    expect(meshNames).toContain("microwave_required_opening_envelope");
    expect(group.userData.submoduleKind).toBe("appliance");

    const size = boundsMm(group);
    const bodySize = boundsMm(getMesh(group, "microwave_body")!);
    expect(bodySize.width).toBeCloseTo(595, 1);
    expect(bodySize.height).toBeCloseTo(382, 1);
    expect(bodySize.depth).toBeCloseTo(320, 1);
    expect(size.width).toBeLessThanOrEqual(params.width + 0.001);
    expect(size.height).toBeLessThanOrEqual(params.height + 0.001);
    expect(size.depth).toBeGreaterThan(params.depth);

    const bom = calculateApplianceSubmoduleBOM(params, makeDefaultKitchenContext(catalog), catalog);
    expect(bom.moduleType).toBe("appliance_submodule");
    expect(bom.pricing.finalPrice).toBe(321);
    expect(bom.quoteBom.items[0]?.notes?.join(" ")).toContain("built_in_tall_or_base_opening");
  });

  it("builds oven, sink and cooktop submodules with real geometry and appliance pricing", () => {
    const catalog: ClientCatalog = { clientId: "test", ...createSystemCatalogSeed() };
    const cases = [
      {
        type: "oven" as const,
        priceNet: 260,
        probePart: "oven_body",
        expectedSize: { width: 595, height: 595, depth: 550 },
        requiredParts: ["oven_control_bar", "oven_handle", "oven_knob_left", "oven_knob_right", "oven_digital_display"],
        placementRule: "built_in_tall_or_base_opening"
      },
      {
        type: "sink" as const,
        priceNet: 90,
        probePart: "sink_outer_rim",
        expectedSize: { width: 860, height: 18, depth: 500 },
        requiredParts: ["sink_drainer_board", "sink_drainer_groove_1", "sink_bowl_bottom", "sink_drain_ring"],
        placementRule: "base_sink_opening"
      },
      {
        type: "cooktop" as const,
        priceNet: 220,
        probePart: "cooktop_body",
        expectedSize: { width: 590, height: 50, depth: 520 },
        requiredParts: ["cooktop_zone_round_upper", "cooktop_zone_round_lower", "cooktop_zone_rect_1_top", "cooktop_touch_display"],
        placementRule: "worktop_top_only"
      }
    ];

    for (const entry of cases) {
      const params = {
        ...makeDefaultApplianceSubmoduleParams(entry.type),
        priceNet: entry.priceNet
      };
      const group = buildApplianceSubmodule(params, catalog);
      const meshNames: string[] = [];
      group.traverse((object) => {
        if ("isMesh" in object && object.isMesh) meshNames.push(object.name);
      });

      expect(group.name).toBe(`appliance_submodule_${entry.type}`);
      expect(group.userData.submoduleKind).toBe("appliance");
      for (const partName of [entry.probePart, ...entry.requiredParts]) {
        expect(meshNames).toContain(partName);
      }

      const partSize = boundsMm(getMesh(group, entry.probePart)!);
      expect(partSize.width).toBeCloseTo(entry.expectedSize.width, 1);
      expect(partSize.height).toBeCloseTo(entry.expectedSize.height, 1);
      expect(partSize.depth).toBeCloseTo(entry.expectedSize.depth, 1);
      if (entry.type === "oven") {
        const applianceSize = boundsMm(group);
        expect(applianceSize.width).toBeLessThanOrEqual(params.width + 0.001);
        expect(applianceSize.height).toBeLessThanOrEqual(params.height + 0.001);
        expect(applianceSize.depth).toBeGreaterThan(params.depth);
      }
      if (entry.type === "sink") {
        const rim = getMesh(group, "sink_outer_rim") as Mesh;
        expect(rim.geometry.type).toBe("ExtrudeGeometry");
        const badgeBounds = boundsMm(getMesh(group, "sink_small_brand_badge")!);
        expect(badgeBounds.height).toBeLessThanOrEqual(4);
        const placementEnvelope = getMesh(group, "sink_required_opening_envelope")!;
        expect(placementEnvelope.visible).toBe(false);
      }

      const bom = calculateApplianceSubmoduleBOM(params, makeDefaultKitchenContext(catalog), catalog);
      expect(bom.pricing.finalPrice).toBe(entry.priceNet);
      expect(bom.quoteBom.items[0]?.notes?.join(" ")).toContain(`placementRule=${entry.placementRule}`);
    }
  });
});
