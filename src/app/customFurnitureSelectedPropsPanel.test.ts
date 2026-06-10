import { afterEach, describe, expect, it, vi } from "vitest";
import type { ClientCatalog, MaterialDefinition } from "../core/catalog/catalog-types";
import type { CustomFurnitureBoardParams, CustomFurnitureInstance } from "../layout/customFurnitureTypes";
import { mountCustomFurnitureBoardProps, mountCustomFurnitureProps } from "./customFurnitureSelectedPropsPanel";

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

function makeBoard(overrides: Partial<CustomFurnitureBoardParams> = {}): CustomFurnitureBoardParams {
  return {
    id: "b1",
    name: "Board 1",
    kind: "horizontal",
    workplane: { type: "horizontal", elevationMm: 120 },
    profile: [
      { x: 0, y: 0 },
      { x: 1000, y: 0 },
      { x: 1000, y: 500 },
      { x: 0, y: 500 }
    ],
    thicknessMm: 18,
    materialId: "board-b",
    baseConstraint: "furnitureBase",
    baseOffsetMm: 0,
    topConstraint: "furnitureTop",
    topOffsetMm: 0,
    justification: "center",
    edgeBanding: [{ edgeIndex: 0, materialId: "edge-a" }],
    ...overrides
  };
}

function makeFurniture(board = makeBoard()): CustomFurnitureInstance {
  return {
    id: "cf1",
    params: {
      name: "Furniture",
      baseConstraint: "projectBase",
      baseOffsetMm: 10,
      topConstraint: "absolute",
      topOffsetMm: 900,
      boundary: [
        { x: 0, z: 0 },
        { x: 1000, z: 0 },
        { x: 1000, z: 500 }
      ],
      boards: [board]
    }
  } as CustomFurnitureInstance;
}

const constraintOptions = ["projectBase", "furnitureBase", "furnitureTop", "absolute"] as const;

describe("custom furniture selected props panel", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("mounts selected furniture rows and keeps name/base offset commit behavior", () => {
    installFakeDocument();
    const { props, rows, section } = makeProps();
    const furniture = makeFurniture();
    const rebuildFurniture = vi.fn();
    const commitHistory = vi.fn();
    const refreshProps = vi.fn();

    mountCustomFurnitureProps({ props, furniture, constraintOptions, rebuildFurniture, commitHistory, refreshProps });

    expect(props.setTitle).toHaveBeenCalledWith("Custom furniture");
    expect(rows.map((row) => row.label)).toEqual(["Name", "Base constraint", "Base offset", "Top constraint", "Top offset"]);
    expect(section.children.at(-1)?.textContent).toBe("Boundary: 3 points. Boards: 1.");

    rows[0]!.control.value = "  New furniture  ";
    rows[0]!.control.dispatch("change");
    expect(furniture.params.name).toBe("New furniture");
    expect(commitHistory).toHaveBeenCalledTimes(1);
    expect(refreshProps).toHaveBeenCalledTimes(1);
    expect(rebuildFurniture).not.toHaveBeenCalled();

    rows[2]!.control.value = "25";
    rows[2]!.control.dispatch("change");
    expect(furniture.params.baseOffsetMm).toBe(25);
    expect(rebuildFurniture).toHaveBeenCalledWith(furniture);
    expect(commitHistory).toHaveBeenCalledTimes(2);
  });

  it("mounts selected board rows, updates material/elevation, and keeps horizontal board summary", () => {
    installFakeDocument();
    const { props, rows, section } = makeProps();
    const board = makeBoard();
    const furniture = makeFurniture(board);
    const rebuildFurniture = vi.fn();
    const commitHistory = vi.fn();

    mountCustomFurnitureBoardProps({
      props,
      catalog: makeCatalog(),
      furniture,
      board,
      constraintOptions,
      syncVerticalBoardProfileToConstraints: vi.fn(),
      rebuildFurniture,
      commitHistory,
      refreshProps: vi.fn()
    });

    expect(props.setTitle).toHaveBeenCalledWith("Custom board");
    expect(rows.map((row) => row.label)).toEqual([
      "Name",
      "Kind",
      "Material",
      "Thickness",
      "Elevation",
      "Justification",
      "Base constraint",
      "Base offset",
      "Top constraint",
      "Top offset"
    ]);
    expect(section.children.at(-1)?.textContent).toBe("Profile: 4 points, 1000 x 500 mm. Edge banding: 1.");

    rows[2]!.control.value = "board-a";
    rows[2]!.control.dispatch("change");
    expect(board.materialId).toBe("board-a");
    expect(rebuildFurniture).toHaveBeenCalledWith(furniture);
    expect(commitHistory).toHaveBeenCalledTimes(1);

    rows[4]!.control.value = "180";
    rows[4]!.control.dispatch("change");
    expect(board.workplane.type === "horizontal" ? board.workplane.elevationMm : null).toBe(180);
    expect(commitHistory).toHaveBeenCalledTimes(2);
  });

  it("keeps vertical board constraint changes synced before rebuild and commit", () => {
    installFakeDocument();
    const { props, rows } = makeProps();
    const board = makeBoard({ workplane: { type: "vertical", aMm: { x: 0, z: 0 }, bMm: { x: 1000, z: 0 }, mirrored: false } });
    const furniture = makeFurniture(board);
    const syncVerticalBoardProfileToConstraints = vi.fn();
    const rebuildFurniture = vi.fn();
    const commitHistory = vi.fn();

    mountCustomFurnitureBoardProps({
      props,
      catalog: makeCatalog(),
      furniture,
      board,
      constraintOptions,
      syncVerticalBoardProfileToConstraints,
      rebuildFurniture,
      commitHistory,
      refreshProps: vi.fn()
    });

    expect(rows.map((row) => row.label)).not.toContain("Elevation");

    const baseOffset = rows.find((row) => row.label === "Base offset")!;
    baseOffset.control.value = "32";
    baseOffset.control.dispatch("change");

    expect(board.baseOffsetMm).toBe(32);
    expect(syncVerticalBoardProfileToConstraints).toHaveBeenCalledWith(furniture, board);
    expect(rebuildFurniture).toHaveBeenCalledWith(furniture);
    expect(commitHistory).toHaveBeenCalledTimes(1);
  });
});
