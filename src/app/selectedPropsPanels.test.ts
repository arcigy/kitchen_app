import { afterEach, describe, expect, it, vi } from "vitest";
import { mountFloorPropsPanel } from "./selectedPropsPanels";
import type { PropertiesPanelApi } from "./toolPropsPanels";
import type { FloorInstance } from "./localTypes";
import type { AppState } from "../layout/appState";

type FakeListener = (event: Record<string, unknown>) => void;

class FakeElement {
  children: FakeElement[] = [];
  className = "";
  disabled = false;
  innerHTML = "";
  listeners = new Map<string, FakeListener[]>();
  step = "";
  style: Record<string, string> = {};
  textContent = "";
  type = "";
  value = "";

  addEventListener(type: string, listener: FakeListener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  append(...children: FakeElement[]) {
    this.children.push(...children);
  }

  appendChild(child: FakeElement) {
    this.children.push(child);
    return child;
  }

  dispatch(type: string, event: Record<string, unknown> = {}) {
    for (const listener of this.listeners.get(type) ?? []) listener(event);
  }
}

function installFakeDocument() {
  vi.stubGlobal("document", {
    createElement: () => new FakeElement()
  });
}

function makeProps() {
  const rows: Array<{ label: string; control: FakeElement }> = [];
  const section = new FakeElement();
  const props: PropertiesPanelApi = {
    setTitle: vi.fn(),
    section: () => section as unknown as HTMLElement,
    row: (_section, label, control) => rows.push({ label, control: control as unknown as FakeElement })
  };
  return { props, rows, section };
}

describe("selected props panels", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("commits selected floor property changes through the current rebuild and history flow", () => {
    installFakeDocument();
    const { props, rows, section } = makeProps();
    const floor = {
      id: "floor-1",
      params: {
        name: "Ground floor",
        heightMm: 0,
        thicknessMm: 120,
        materialId: "oak",
        boundary: []
      }
    } as unknown as FloorInstance;
    const ctx = {
      props,
      getAllMaterials: () => [
        { id: "oak", name: "Oak" },
        { id: "tile", name: "Tile" }
      ],
      floorDefault: { heightMm: 0, thicknessMm: 100, materialId: "oak" },
      rebuildFloor: vi.fn(),
      updateSelectionHighlights: vi.fn(),
      commitHistory: vi.fn(),
      S: {} as AppState,
      enterFloorBoundaryEdit: vi.fn(),
      appendLinkedMeasureInputs: vi.fn()
    };

    mountFloorPropsPanel(ctx, floor);

    expect(props.setTitle).toHaveBeenCalledWith("Podlaha (floor-1)");
    expect(rows).toHaveLength(4);
    expect(ctx.appendLinkedMeasureInputs).toHaveBeenCalledWith(section, { kind: "floor", floorId: "floor-1" });

    rows[0].control.value = "  Main floor  ";
    rows[1].control.value = "15.6";
    rows[2].control.value = "0";
    rows[3].control.value = "tile";
    rows[0].control.dispatch("change");

    expect(floor.params).toMatchObject({
      name: "Main floor",
      heightMm: 16,
      thicknessMm: 120,
      materialId: "tile"
    });
    expect(ctx.rebuildFloor).toHaveBeenCalledOnce();
    expect(ctx.rebuildFloor).toHaveBeenCalledWith(floor);
    expect(ctx.updateSelectionHighlights).toHaveBeenCalledOnce();
    expect(ctx.commitHistory).toHaveBeenCalledOnce();
    expect(ctx.commitHistory).toHaveBeenCalledWith(ctx.S);
  });

  it("keeps selected floor boundary editing routed through the current edit button", () => {
    installFakeDocument();
    const { props, section } = makeProps();
    const floor = {
      id: "floor-2",
      params: {
        name: "Second floor",
        heightMm: 3000,
        thicknessMm: 100,
        materialId: "oak",
        boundary: []
      }
    } as unknown as FloorInstance;
    const ctx = {
      props,
      getAllMaterials: () => [{ id: "oak", name: "Oak" }],
      floorDefault: { heightMm: 0, thicknessMm: 100, materialId: "oak" },
      rebuildFloor: vi.fn(),
      updateSelectionHighlights: vi.fn(),
      commitHistory: vi.fn(),
      S: {} as AppState,
      enterFloorBoundaryEdit: vi.fn(),
      appendLinkedMeasureInputs: vi.fn()
    };

    mountFloorPropsPanel(ctx, floor);

    const editButton = section.children[0];
    expect(editButton.textContent).toBe("Edit Boundary Line");
    editButton.dispatch("click");

    expect(ctx.enterFloorBoundaryEdit).toHaveBeenCalledWith("floor-2");
    expect(ctx.commitHistory).not.toHaveBeenCalled();
  });
});
