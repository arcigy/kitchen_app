import { afterEach, describe, expect, it, vi } from "vitest";
import {
  mountColumnPlacementPropsPanel,
  mountDoorPlacementPropsPanel,
  mountDoorPropsPanel,
  mountFloorBoundaryPropsPanel,
  mountFloorPropsPanel,
  mountModulePropsPanel,
  mountSectionPropsPanel,
  mountSectionToolPropsPanel,
  mountUnderlayPropsPanel,
  mountWallPropsPanel,
  mountWindowPlacementPropsPanel,
  mountWindowPropsPanel
} from "./selectedPropsPanels";
import type { ColumnParams, DoorInstance, DoorParams, FloorInstance, LayoutInstance, SectionInstance, WallInstance, WindowInstance, WindowParams } from "./localTypes";
import type { AppState } from "../layout/appState";
import { installFakeDocument, makePropertiesPanelHarness } from "./testUtils/propertiesPanelHarness";
import { makeDefaultModuleParams } from "../model/cabinetTypes";

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

function makeWall(id: string, thicknessMm: number, heightMm: number): WallInstance {
  return {
    id,
    params: {
      typeId: null,
      thicknessMm,
      heightMm,
      materialId: "wall",
      justification: "center",
      exteriorSign: 1,
      aMm: { x: 0, z: 0 },
      bMm: { x: 1000, z: 0 }
    },
    heightMm,
    root: {},
    mesh: {},
    outline: {}
  } as unknown as WallInstance;
}

function makeLayoutInstance(): LayoutInstance {
  return {
    id: "module-1",
    params: makeDefaultModuleParams("drawer_low"),
    kitchenGroupId: null,
    kitchenPlacement: null,
    root: {
      position: { x: 1.2, z: -0.4 },
      rotation: { y: Math.PI / 2 }
    },
    module: {},
    localBox: {},
    pick: {},
    outline: {}
  } as unknown as LayoutInstance;
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
    expect(rows[0].control.type).toBe("text");
    expect(rows[0].control.value).toBe("Ground floor");
    expect(rows[1].control.type).toBe("number");
    expect(rows[1].control.step).toBe("1");
    expect(rows[1].control.value).toBe("0");
    expect(rows[2].control.type).toBe("number");
    expect(rows[2].control.step).toBe("1");
    expect(rows[2].control.value).toBe("120");
    expect(rows[3].control.children.map((child) => [child.value, child.textContent])).toEqual([
      ["oak", "Oak"],
      ["tile", "Tile"]
    ]);

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

  it("keeps multi-wall thickness and height inputs routed through the current rebuild and history flow", () => {
    installFakeDocument();
    const { props, rows } = makePropertiesPanelHarness();
    const walls = [makeWall("wall-1", 100, 2500), makeWall("wall-2", 200, 2800)];
    const ctx = {
      props,
      selectedWallIds: new Set(["wall-1", "wall-2"]),
      walls,
      wallJoinTolMm: 1,
      showNoProps: vi.fn(),
      commitHistory: vi.fn(),
      S: {} as AppState,
      mountProps: vi.fn(),
      rebuildWall: vi.fn(),
      rebuildWallPlanMesh: vi.fn(),
      appendLinkedMeasureInputs: vi.fn()
    };

    mountWallPropsPanel(ctx);

    expect(props.setTitle).toHaveBeenCalledWith("Steny (2)");
    expect(rows.map((row) => row.label)).toEqual(["Typ steny", "Hrúbka (mm)", "Výška (mm)", "Justification"]);
    expect(rows[1]!.control.type).toBe("number");
    expect(rows[1]!.control.step).toBe("1");
    expect(rows[1]!.control.placeholder).toBe("(rôzne)");
    expect(rows[1]!.control.value).toBe("");
    expect(rows[2]!.control.type).toBe("number");
    expect(rows[2]!.control.step).toBe("1");
    expect(rows[2]!.control.placeholder).toBe("(rôzne)");
    expect(rows[2]!.control.value).toBe("");

    rows[1]!.control.value = "150";
    rows[1]!.control.dispatch("change");

    expect(walls.map((wall) => wall.params.thicknessMm)).toEqual([150, 150]);
    expect(ctx.rebuildWall).toHaveBeenCalledTimes(2);
    expect(ctx.rebuildWallPlanMesh).toHaveBeenCalledOnce();
    expect(ctx.commitHistory).toHaveBeenCalledOnce();
    expect(ctx.commitHistory).toHaveBeenCalledWith(ctx.S);
    expect(ctx.mountProps).toHaveBeenCalledOnce();
    expect(ctx.appendLinkedMeasureInputs).not.toHaveBeenCalled();
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

  it("keeps floor boundary material select options and local params update behavior", () => {
    installFakeDocument();
    const { props, rows, section } = makePropertiesPanelHarness();
    const params = {
      name: "Boundary floor",
      heightMm: 0,
      thicknessMm: 100,
      materialId: "oak",
      boundary: []
    };

    mountFloorBoundaryPropsPanel({
      props,
      floorEdit: {
        params,
        segments: [{ a: { x: 0, z: 0 }, b: { x: 1000, z: 0 } }],
        ortho: true,
        error: ""
      },
      getAllMaterials: () => [
        { id: "oak", name: "Oak" },
        { id: "tile", name: "Tile" }
      ],
      floorDefault: { heightMm: 0, thicknessMm: 100, materialId: "oak" }
    });

    expect(props.setTitle).toHaveBeenCalledWith("Floor Boundary");
    expect(rows.map((row) => row.label)).toEqual(["Výška úrovne (mm)", "Hrúbka (mm)", "Materiál"]);
    expect(rows[0]!.control.type).toBe("number");
    expect(rows[0]!.control.step).toBe("1");
    expect(rows[0]!.control.value).toBe("0");
    expect(rows[1]!.control.type).toBe("number");
    expect(rows[1]!.control.step).toBe("1");
    expect(rows[1]!.control.value).toBe("100");
    expect(rows[2]!.control.children.map((child) => [child.value, child.textContent])).toEqual([
      ["oak", "Oak"],
      ["tile", "Tile"]
    ]);
    expect(section.children[0]?.className).toBe("muted");
    expect(section.children[0]?.textContent).toContain("Boundary lines: 1");

    rows[2]!.control.value = "tile";
    rows[2]!.control.dispatch("change");

    expect(params.materialId).toBe("tile");
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
    expect(sectionHarness.rows[0]!.control.type).toBe("text");
    expect(sectionHarness.rows[0]!.control.value).toBe("Section 1");
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
    const columnParams = makeColumnParams();
    const onColumnChange = vi.fn();
    const mountColumnProps = vi.fn();
    mountColumnPlacementPropsPanel({
      props: columnHarness.props,
      params: columnParams,
      onChange: onColumnChange,
      mountProps: mountColumnProps
    });
    expect(columnHarness.props.setTitle).toHaveBeenCalledWith("Stlp - vlozenie");
    expect(columnHarness.section.children[0]?.className).toBe("muted");
    expect(columnHarness.section.children[0]?.textContent).toBe("Nastav parametre a klikni miesto v podoryse. Esc zrusi vkladanie.");
    expect(columnHarness.rows.map((row) => row.label)).toEqual([
      "Nazov",
      "Prierez",
      "Vyska (mm)",
      "Sirka (mm)",
      "Justification X",
      "Justification Y",
      "Material"
    ]);
    expect(columnHarness.rows[0]!.control.type).toBe("text");
    expect(columnHarness.rows[0]!.control.value).toBe("Column");
    expect(columnHarness.rows[2]!.control.type).toBe("number");
    expect(columnHarness.rows[2]!.control.step).toBe("1");
    expect(columnHarness.rows[2]!.control.value).toBe("2600");
    expect(columnHarness.rows[3]!.control.type).toBe("number");
    expect(columnHarness.rows[3]!.control.step).toBe("1");
    expect(columnHarness.rows[3]!.control.value).toBe("200");
    expect(columnHarness.rows[1]!.control.children.map((child) => [child.value, child.textContent])).toEqual([
      ["square", "Stvorcovy"],
      ["rectangular", "Obdlznikovy"],
      ["round", "Kruhovy"]
    ]);
    expect(columnHarness.rows[4]!.control.children.map((child) => [child.value, child.textContent])).toEqual([
      ["left", "Left"],
      ["center", "Center"],
      ["right", "Right"]
    ]);
    expect(columnHarness.rows[5]!.control.children.map((child) => [child.value, child.textContent])).toEqual([
      ["up", "Up"],
      ["center", "Center"],
      ["down", "Down"]
    ]);
    expect(columnHarness.rows[6]!.control.children.map((child) => [child.value, child.textContent])).toEqual([["default", "Default"]]);

    columnHarness.rows[1]!.control.value = "rectangular";
    columnHarness.rows[1]!.control.dispatch("change");
    expect(columnParams.shape).toBe("rectangular");
    expect(onColumnChange).toHaveBeenLastCalledWith({ shape: "rectangular" });
    expect(mountColumnProps).toHaveBeenCalledOnce();

    columnHarness.rows[4]!.control.value = "right";
    columnHarness.rows[4]!.control.dispatch("change");
    expect(columnParams.justifyX).toBe("right");
    expect(onColumnChange).toHaveBeenLastCalledWith({ justifyX: "right" });

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

  it("keeps underlay numeric controls mounted with current values and element refs", () => {
    installFakeDocument();
    const { props, rows } = makePropertiesPanelHarness();
    const underlayState = {
      opacity: 0.4,
      scale: 1.25,
      rotationDeg: 12,
      offsetMm: { x: 30, z: -45 },
      pinned: false,
      sourceName: "plan.pdf"
    };
    const ctx = {
      props,
      loadUnderlayToCanvas: vi.fn(),
      ensureLayoutMode: vi.fn(),
      setUnderlayStatus: vi.fn(),
      setUnderlayFromCanvas: vi.fn(),
      underlayState,
      commitHistory: vi.fn(),
      S: { underlayState } as unknown as AppState,
      setSelectedUnderlay: vi.fn(),
      updateUnderlayTransform: vi.fn(),
      underlayCal: { knownMm: 900, active: false, mode: "calibrate" as const, first: null },
      underlayMesh: { visible: true },
      clearUnderlay: vi.fn(),
      setSelectedModule: vi.fn(),
      mountProps: vi.fn(),
      setUnderlayScaleEl: vi.fn(),
      setUnderlayOffXEl: vi.fn(),
      setUnderlayOffZEl: vi.fn(),
      setUnderlayStatusEl: vi.fn(),
      markUnderlaySelected: vi.fn()
    };

    mountUnderlayPropsPanel(ctx);

    expect(props.setTitle).toHaveBeenCalledWith("Underlay");
    expect(rows.map((row) => row.label)).toEqual([
      "Upload",
      "Opacity",
      "Scale",
      "Rotation °",
      "Offset X",
      "Offset Z",
      "Calibrate mm",
      "Pinned"
    ]);
    expect(rows[0]!.control.type).toBe("file");
    expect(rows[0]!.control.accept).toBe(".png,.pdf,image/png,application/pdf");
    expect(rows[1]!.control.type).toBe("range");
    expect(rows[1]!.control.min).toBe("0");
    expect(rows[1]!.control.max).toBe("1");
    expect(rows[1]!.control.step).toBe("0.01");
    expect(rows[1]!.control.value).toBe("0.4");
    expect(rows[2]!.control.type).toBe("number");
    expect(rows[2]!.control.step).toBe("0.01");
    expect(rows[2]!.control.value).toBe("1.25");
    expect(rows[3]!.control.type).toBe("number");
    expect(rows[3]!.control.step).toBe("1");
    expect(rows[3]!.control.value).toBe("12");
    expect(rows[4]!.control.type).toBe("number");
    expect(rows[4]!.control.step).toBe("1");
    expect(rows[4]!.control.value).toBe("30");
    expect(rows[5]!.control.type).toBe("number");
    expect(rows[5]!.control.step).toBe("1");
    expect(rows[5]!.control.value).toBe("-45");
    expect(rows[6]!.control.type).toBe("number");
    expect(rows[6]!.control.step).toBe("1");
    expect(rows[6]!.control.value).toBe("900");
    expect(rows[7]!.control.type).toBe("checkbox");
    expect(rows[7]!.control.checked).toBe(false);
    expect(ctx.setUnderlayScaleEl).toHaveBeenCalledWith(rows[2]!.control);
    expect(ctx.setUnderlayOffXEl).toHaveBeenCalledWith(rows[4]!.control);
    expect(ctx.setUnderlayOffZEl).toHaveBeenCalledWith(rows[5]!.control);
  });

  it("keeps module rotation control mounted with current degrees and measure target", () => {
    installFakeDocument();
    const { props, rows, section } = makePropertiesPanelHarness();
    const inst = makeLayoutInstance();
    const ctx = {
      findInstance: vi.fn(() => inst),
      showNoProps: vi.fn(),
      props,
      pinnedInstanceIds: new Set<string>(),
      instanceFitsRoom: vi.fn(() => true),
      anyOverlap: vi.fn(() => false),
      moduleOverlapsWalls: vi.fn(() => false),
      moduleOverlapsKitchenWorktops: vi.fn(() => false),
      commitHistory: vi.fn(),
      S: {} as AppState,
      mountProps: vi.fn(),
      modulePackages: [],
      args: { propertiesEl: section },
      clientCatalog: {},
      rebuildInstance: vi.fn(() => true),
      appendLinkedMeasureInputs: vi.fn()
    };

    mountModulePropsPanel(ctx as unknown as Parameters<typeof mountModulePropsPanel>[0], "module-1");

    expect(props.setTitle).toHaveBeenCalledWith("Module (module-1)");
    expect(rows.map((row) => row.label)).toEqual(["Rotation (deg)", "Pinned"]);
    expect(rows[0]!.control.type).toBe("number");
    expect(rows[0]!.control.step).toBe("1");
    expect(rows[0]!.control.value).toBe("90");
    expect(rows[1]!.control.type).toBe("checkbox");
    expect(rows[1]!.control.checked).toBe(false);
    expect(ctx.appendLinkedMeasureInputs).toHaveBeenCalledWith(section, { kind: "module", instanceId: "module-1" });
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
