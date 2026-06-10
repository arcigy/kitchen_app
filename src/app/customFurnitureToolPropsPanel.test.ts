import { afterEach, describe, expect, it, vi } from "vitest";
import type { ClientCatalog, MaterialDefinition } from "../core/catalog/catalog-types";
import { mountCustomFurnitureActiveToolProps } from "./customFurnitureToolPropsPanel";

type FakeListener = () => void;

class FakeElement {
  children: FakeElement[] = [];
  className = "";
  listeners = new Map<string, FakeListener[]>();
  textContent = "";
  type = "";
  value = "";

  addEventListener(type: string, listener: FakeListener) {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  appendChild(child: FakeElement) {
    this.children.push(child);
    return child;
  }

  dispatch(type: string) {
    for (const listener of this.listeners.get(type) ?? []) listener();
  }
}

function installFakeDocument() {
  vi.stubGlobal("document", {
    createElement: () => new FakeElement()
  });
}

function makeMaterial(id: string, displayName: string): MaterialDefinition {
  return {
    id,
    displayName,
    materialType: "board",
    isActive: true,
    preview: { colorHex: "#ffffff", roughness: 0.5, metalness: 0.1 }
  } as MaterialDefinition;
}

function makeCatalog(): ClientCatalog {
  return {
    clientId: "client",
    materials: [makeMaterial("board-b", "Beta"), makeMaterial("board-a", "Alpha")],
    hardware: [],
    legacyMaterials: [],
    components: [],
    componentGeometry: [],
    modules: [],
    priceList: { id: "prices", name: "Prices", currency: "EUR", isActive: true, prices: {} },
    kitchenDefaults: {},
    meta: {
      catalogVersion: 1,
      source: "client-custom",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    }
  } as ClientCatalog;
}

function makeProps() {
  const section = new FakeElement();
  const rows: Array<{ label: string; control: FakeElement }> = [];
  const props = {
    setTitle: vi.fn(),
    section: vi.fn(() => section as unknown as HTMLElement),
    row: vi.fn((_section: HTMLElement, label: string, control: HTMLElement) => {
      rows.push({ label, control: control as unknown as FakeElement });
      return new FakeElement() as unknown as HTMLElement;
    })
  };
  return { props, rows, section };
}

const baseArgs = {
  catalog: makeCatalog(),
  constraintOptions: ["projectBase", "furnitureBase", "furnitureTop", "absolute"] as const,
  verticalBoardDraft: {
    materialId: "board-b",
    thicknessMm: 18,
    justification: "center" as const,
    baseConstraint: "furnitureBase" as const,
    baseOffsetMm: 0,
    topConstraint: "furnitureTop" as const,
    topOffsetMm: 0
  }
};

describe("custom furniture tool props panel", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns false without mounting when no custom furniture tool is active", () => {
    installFakeDocument();
    const { props } = makeProps();

    expect(
      mountCustomFurnitureActiveToolProps({
        ...baseArgs,
        props,
        activeTool: null,
        boundaryEditActive: false,
        boundarySegmentsCount: 0,
        boundaryHasFirstPoint: false,
        draftPointsCount: 0,
        onVerticalBoardDraftChange: vi.fn()
      })
    ).toBe(false);

    expect(props.setTitle).not.toHaveBeenCalled();
  });

  it("mounts vertical board draft rows and keeps change callbacks isolated from commit history", () => {
    installFakeDocument();
    const { props, rows, section } = makeProps();
    const onVerticalBoardDraftChange = vi.fn();

    expect(
      mountCustomFurnitureActiveToolProps({
        ...baseArgs,
        props,
        activeTool: "verticalBoard",
        boundaryEditActive: false,
        boundarySegmentsCount: 0,
        boundaryHasFirstPoint: false,
        draftPointsCount: 2,
        onVerticalBoardDraftChange
      })
    ).toBe(true);

    expect(props.setTitle).toHaveBeenCalledWith("Custom furniture tool");
    expect(rows.map((row) => row.label)).toEqual([
      "Material",
      "Thickness",
      "Justification",
      "Base constraint",
      "Base offset",
      "Top constraint",
      "Top offset"
    ]);
    expect(section.children.at(-1)?.textContent).toBe("verticalBoard: 2 point(s).");

    rows[0]!.control.value = "board-a";
    rows[0]!.control.dispatch("change");
    expect(onVerticalBoardDraftChange).toHaveBeenLastCalledWith({ materialId: "board-a" });

    rows[1]!.control.value = "0";
    rows[1]!.control.dispatch("change");
    expect(onVerticalBoardDraftChange).toHaveBeenLastCalledWith({ thicknessMm: 1 });
  });

  it("mounts boundary edit summary without vertical draft controls", () => {
    installFakeDocument();
    const { props, rows, section } = makeProps();

    expect(
      mountCustomFurnitureActiveToolProps({
        ...baseArgs,
        props,
        activeTool: null,
        boundaryEditActive: true,
        boundarySegmentsCount: 3,
        boundaryHasFirstPoint: true,
        draftPointsCount: 0,
        onVerticalBoardDraftChange: vi.fn()
      })
    ).toBe(true);

    expect(rows).toEqual([]);
    expect(section.children.at(-1)?.className).toBe("muted");
    expect(section.children.at(-1)?.textContent).toBe("boundary: 3 line(s). Click next point to place the current line.");
  });
});
