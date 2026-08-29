import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppState, LayoutSnapshot } from "../layout/appState";
import { createRecentActivityController, describeSnapshotActivity } from "./recentActivityController";
import { FakeElement } from "./testUtils/propertiesPanelHarness";

const snapshot = (patch: Partial<LayoutSnapshot>): LayoutSnapshot => ({
  wallCounter: 1,
  walls: [],
  floorCounter: 1,
  floors: [],
  columnCounter: 1,
  columns: [],
  sectionCounter: 1,
  sections: [],
  worktopCounter: 1,
  worktops: [],
  instanceCounter: 1,
  instances: [],
  pinnedWallIds: [],
  pinnedInstanceIds: [],
  underlayPinned: false,
  selected: { kind: null, wallId: null, instId: null, floorId: null, columnId: null, sectionId: null, wallIds: [], instIds: [] },
  ...patch
});

const wall = (id: string, thicknessMm = 120) => ({
  id,
  params: {
    aMm: { x: 0, z: 0 },
    bMm: { x: 1000, z: 0 },
    thicknessMm,
    heightMm: 2600
  }
});

const moduleItem = (id: string, width = 600) => ({
  id,
  params: { type: "base", width },
  kitchenGroupId: null,
  kitchenPlacement: null,
  positionMm: { x: 0, y: 0, z: 0 },
  rotationYDeg: 0
});

describe("describeSnapshotActivity", () => {
  it("reports multiple deleted walls", () => {
    const activity = describeSnapshotActivity(
      snapshot({ walls: [wall("w1"), wall("w2"), wall("w3")] as LayoutSnapshot["walls"] }),
      snapshot({ walls: [wall("w1")] as LayoutSnapshot["walls"] })
    );

    expect(activity.label).toBe("2 walls deleted");
    expect(activity.target).toEqual({ kind: null, id: null });
  });

  it("reports multiple updated objects", () => {
    const activity = describeSnapshotActivity(
      snapshot({
        walls: [wall("w1")] as LayoutSnapshot["walls"],
        instances: [moduleItem("m1")] as LayoutSnapshot["instances"]
      }),
      snapshot({
        walls: [wall("w1", 180)] as LayoutSnapshot["walls"],
        instances: [moduleItem("m1", 900)] as LayoutSnapshot["instances"]
      })
    );

    expect(activity.label).toBe("2 objects updated");
    expect(activity.target).toEqual({ kind: null, id: null });
  });
});

describe("createRecentActivityController", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function findByClass(root: FakeElement, className: string): FakeElement | null {
    if (root.className.split(/\s+/).includes(className)) return root;
    for (const child of root.children) {
      const match = findByClass(child, className);
      if (match) return match;
    }
    return null;
  }

  it("keeps recent activity popover and confirm buttons mounted with current behavior", () => {
    const body = new FakeElement();
    const listEl = new FakeElement();
    const countEl = new FakeElement();
    vi.stubGlobal("document", {
      addEventListener: vi.fn(),
      body,
      createElement: () => new FakeElement(),
      querySelector: (selector: string) => {
        if (selector === "[data-recent-activity]") return listEl;
        if (selector === "[data-recent-activity-count]") return countEl;
        if (selector.startsWith(".")) return findByClass(body, selector.slice(1));
        return null;
      },
      querySelectorAll: () => []
    });
    vi.stubGlobal("performance", { now: () => 0 });
    const current = snapshot({ walls: [wall("w1")] as LayoutSnapshot["walls"] });
    const controller = createRecentActivityController({
      S: { history: { current, past: [], future: [] } } as unknown as AppState,
      getHelpers: vi.fn(),
      selectTarget: vi.fn(),
      onRestore: vi.fn()
    });

    controller.record("Wall W1 added", current, { kind: "wall", id: "w1" });
    countEl.dispatch("click");

    const popover = body.children.find((child) => child.className === "archux-activity-history-popover")!;
    expect(popover.attributes.get("role")).toBe("dialog");
    expect(popover.attributes.get("aria-label")).toBe("Activity history");
    const header = popover.children[0]!;
    expect(header.children[1]!.type).toBe("button");
    expect(header.children[1]!.textContent).toBe("Close");
    const list = popover.children[2]!;
    const entryButton = list.children[0]!;
    expect(entryButton.type).toBe("button");
    expect(entryButton.children[0]!.textContent).toBe("Wall W1 added");

    entryButton.dispatch("click");

    const actions = popover.children[1]!.children[2]!;
    expect(actions.children.map((child) => [child.type, child.textContent, child.disabled])).toEqual([
      ["button", "Nie", false],
      ["button", "Ukazat stav", false],
      ["button", "Ano, obnovit", false]
    ]);
    expect(actions.children[1]!.dataset.activityPreview).toBe("true");
    expect(actions.children[2]!.dataset.activityConfirmYes).toBe("true");

    actions.children[0]!.dispatch("click");

    expect(popover.children[1]!.className).toBe("");
    expect(popover.children[1]!.children).toEqual([]);
  });
});
