import { afterEach, describe, expect, it, vi } from "vitest";
import {
  mountColumnPlacementPropsPanel,
  mountDoorPlacementPropsPanel,
  mountDoorPropsPanel,
  mountFloorPropsPanel,
  mountSectionPropsPanel,
  mountSectionToolPropsPanel,
  mountWindowPlacementPropsPanel,
  mountWindowPropsPanel
} from "./selectedPropsPanels";
import type { ColumnParams, DoorInstance, DoorParams, FloorInstance, SectionInstance, WallInstance, WindowInstance, WindowParams } from "./localTypes";
import type { AppState } from "../layout/appState";
import { installFakeDocument, makePropertiesPanelHarness } from "./testUtils/propertiesPanelHarness";

function makeColumnParams(): ColumnParams {
  return {
    name: "Column",
    shape: "square",
    xMm: 0,
    zMm: 0,
    justifyX: "center",
    justifyY: "center",
    widthMm: 200,
    depthMm: 200,
    diameterMm: 200,
    heightMm: 2600,
    materialId: "mat"
  };
}

function makeWindowParams(overrides: Partial<WindowParams> = {}): WindowParams {
  return {
    wall: "back",
    wallId: "wall-1",
    widthMm: 900,
    heightMm: 1200,
    sillHeightMm: 900,
    centerMm: 1000,
    frameWidthMm: 70,
    offsetFromInteriorMm: 0,
    sashWidthMm: 50,
    sashProfileDepthMm: 60,
    frameProfileDepthMm: 70,
    swingDirection: "right",
    swingSide: "outward",
    swingAngleDeg: 90,
    handleType: "lever",
    handleOffsetMm: 50,
    handleHeightMm: 900,
    materialId: "vinyl",
    ...overrides
  };
}

function makeDoorParams(overrides: Partial<DoorParams> = {}): DoorParams {
  return {
    wall: "back",
    wallId: "wall-1",
    widthMm: 900,
    heightMm: 2100,
    centerMm: 1000,
    frameWidthMm: 70,
    offsetFromInteriorMm: 0,
    panelThicknessMm: 45,
    swingDirection: "right",
    swingSide: "outward",
    swingAngleDeg: 90,
    handleType: "lever",
    handleOffsetMm: 50,
    handleHeightMm: 950,
    materialId: "painted-white",
    ...overrides
  };
}

describe("selected props panels", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("commits selected floor property changes through the current rebuild and history flow", () => {
    installFakeDocument();
    const { props, rows, section } = makePropertiesPanelHarness();
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
    const { props, section } = makePropertiesPanelHarness();
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

  it("keeps section tool and selected section muted summary text", () => {
    installFakeDocument();
    const toolHarness = makePropertiesPanelHarness();

    mountSectionToolPropsPanel({
      props: toolHarness.props,
      sectionDraw: { a: null, mirrored: false },
      drawOrthoEnabled: true
    });

    expect(toolHarness.props.setTitle).toHaveBeenCalledWith("Section");
    expect(toolHarness.section.children[0]?.className).toBe("muted");
    expect(toolHarness.section.children[0]?.textContent).toContain("section line");
    expect(toolHarness.section.children[0]?.textContent).toContain("Po druhom bode");

    const sectionHarness = makePropertiesPanelHarness();
    const section = {
      id: "section-1",
      params: {
        name: "Section 1",
        aMm: { x: 0, z: 0 },
        bMm: { x: 1000, z: 0 },
        mirrored: true
      }
    } as unknown as SectionInstance;

    mountSectionPropsPanel(
      {
        props: sectionHarness.props,
        sections: [section],
        showNoProps: vi.fn(),
        getSectionBasis: vi.fn(() => ({ length: 1.25 })),
        updateAllSectionVisuals: vi.fn(),
        mountProps: vi.fn(),
        commitHistory: vi.fn(),
        S: {} as AppState
      },
      "section-1"
    );

    expect(sectionHarness.props.setTitle).toHaveBeenCalledWith("Section (section-1)");
    expect(sectionHarness.rows.map((row) => row.label)).toEqual(["Name"]);
    expect(sectionHarness.section.children[0]?.className).toBe("muted");
    expect(sectionHarness.section.children[0]?.style.marginTop).toBe("8px");
    expect(sectionHarness.section.children[0]?.textContent).toContain("1250 mm");
    expect(sectionHarness.section.children[1]?.className).toBe("muted");
    expect(sectionHarness.section.children[1]?.style.marginTop).toBe("6px");
    expect(sectionHarness.section.children[1]?.textContent).toBe("Smer: Mirrored");
  });

  it("keeps placement panel muted instructions for columns, windows, and doors", () => {
    installFakeDocument();

    const columnHarness = makePropertiesPanelHarness();
    mountColumnPlacementPropsPanel({
      props: columnHarness.props,
      params: makeColumnParams(),
      onChange: vi.fn(),
      mountProps: vi.fn()
    });
    expect(columnHarness.props.setTitle).toHaveBeenCalledWith("Stlp - vlozenie");
    expect(columnHarness.section.children[0]?.className).toBe("muted");
    expect(columnHarness.section.children[0]?.textContent).toBe("Nastav parametre a klikni miesto v podoryse. Esc zrusi vkladanie.");

    const windowHarness = makePropertiesPanelHarness();
    mountWindowPlacementPropsPanel({
      props: windowHarness.props,
      params: makeWindowParams(),
      onChange: vi.fn()
    });
    expect(windowHarness.props.setTitle).toHaveBeenCalledWith("Okno - vlozenie");
    expect(windowHarness.section.children[0]?.className).toBe("muted");
    expect(windowHarness.section.children[0]?.textContent).toBe("Najprv nastav parametre, potom klikni presne miesto na stene.");

    const doorHarness = makePropertiesPanelHarness();
    mountDoorPlacementPropsPanel({
      props: doorHarness.props,
      params: makeDoorParams(),
      onChange: vi.fn()
    });
    expect(doorHarness.props.setTitle).toHaveBeenCalledWith("Dvere - vlozenie");
    expect(doorHarness.section.children[0]?.className).toBe("muted");
    expect(doorHarness.section.children[0]?.textContent).toBe("Najprv nastav parametre, potom klikni presne miesto na stene. Space lave/prave, Shift+Space dnu/von.");
  });

  it("keeps selected window and door wall info muted text", () => {
    installFakeDocument();
    const walls = [{ id: "wall-1" }] as WallInstance[];
    const windowHarness = makePropertiesPanelHarness();

    mountWindowPropsPanel({
      props: windowHarness.props,
      windowInst: { id: "window-1", params: makeWindowParams() } as unknown as WindowInstance,
      walls,
      updateWindowTransform: vi.fn(),
      commitHistory: vi.fn(),
      S: {} as AppState,
      mountProps: vi.fn()
    });

    expect(windowHarness.props.setTitle).toHaveBeenCalledWith("Okno");
    expect(windowHarness.section.children[0]?.className).toBe("muted");
    expect(windowHarness.section.children[0]?.textContent).toBe("Stena: wall-1");

    const doorHarness = makePropertiesPanelHarness();
    mountDoorPropsPanel({
      props: doorHarness.props,
      doorInst: { id: "door-1", params: makeDoorParams({ wallId: null }) } as unknown as DoorInstance,
      walls,
      updateDoorTransform: vi.fn(),
      commitHistory: vi.fn(),
      S: {} as AppState,
      mountProps: vi.fn()
    });

    expect(doorHarness.props.setTitle).toHaveBeenCalledWith("Dvere");
    expect(doorHarness.section.children[0]?.className).toBe("muted");
    expect(doorHarness.section.children[0]?.textContent).toBe("Dvere nie su vlozene v kreslenej stene.");
  });
});
