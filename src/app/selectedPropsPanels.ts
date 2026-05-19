import type { AppState } from "../layout/appState";
import type { ClientCatalog } from "../core/catalog/catalog-types";
import type { ModuleParams } from "../model/cabinetTypes";
import type { FurnQuoteModulePackage } from "../core/module-package/module-package-types";
import { createModulePackageControls, findModulePackageForParams } from "../core/module-package/runtime/module-package-controls";
import type { UnderlaySource } from "../ui/loadUnderlay";
import type { MeasureSelectionTarget } from "./measureEditing";
import type { PropertiesPanelApi } from "./toolPropsPanels";
import type {
  ColumnInstance,
  ColumnParams,
  DoorInstance,
  DoorParams,
  FloorBoundarySegment,
  FloorInstance,
  FloorParams,
  LayoutInstance,
  SectionInstance,
  SectionParams,
  WallInstance,
  WallParams,
  WindowInstance,
  WindowParams
} from "./localTypes";
import { DOOR_MATERIAL_OPTIONS } from "./doorMaterials";
import { WINDOW_MATERIAL_OPTIONS } from "./windowMaterials";

type MaterialOption = { id: string | number; name: string };
type FloorDefaults = Pick<FloorParams, "heightMm" | "thicknessMm" | "materialId">;
type CommitHistory = (state: AppState) => void;
type MountProps = () => void;
type AppendLinkedMeasureInputs = (section: HTMLElement, target: MeasureSelectionTarget | null) => void;
type SectionBasis = { length: number } | null;
type RebuildInstanceOptions = {
  skipLayoutValidation?: boolean;
  preserveBackAnchor?: boolean;
  previousParams?: ModuleParams;
  sourceKey?: string;
};

type WallPropsContext = {
  props: PropertiesPanelApi;
  selectedWallIds: Set<string>;
  walls: WallInstance[];
  showNoProps: () => void;
  commitHistory: CommitHistory;
  S: AppState;
  mountProps: MountProps;
  rebuildWall: (wall: WallInstance) => void;
  rebuildWallPlanMesh: () => void;
  appendLinkedMeasureInputs: AppendLinkedMeasureInputs;
};

type FloorPropsContext = {
  props: PropertiesPanelApi;
  getAllMaterials: () => MaterialOption[];
  floorDefault: FloorDefaults;
  rebuildFloor: (floor: FloorInstance) => void;
  updateSelectionHighlights: () => void;
  commitHistory: CommitHistory;
  S: AppState;
  enterFloorBoundaryEdit: (floorId?: string) => void;
  appendLinkedMeasureInputs: AppendLinkedMeasureInputs;
};

type SectionToolContext = {
  props: PropertiesPanelApi;
  sectionDraw: { a: { x: number; z: number } | null; mirrored: boolean };
  drawOrthoEnabled: boolean;
};

type SectionPropsContext = {
  props: PropertiesPanelApi;
  sections: Array<Pick<SectionInstance, "id" | "params">>;
  showNoProps: () => void;
  getSectionBasis: (params: SectionParams) => SectionBasis;
  updateAllSectionVisuals: () => void;
  mountProps: MountProps;
  commitHistory: CommitHistory;
  S: AppState;
};

type ColumnPropsContext = {
  props: PropertiesPanelApi;
  column: ColumnInstance | null;
  showNoProps: () => void;
  rebuildColumn: (column: ColumnInstance) => void;
  commitHistory: CommitHistory;
  S: AppState;
  mountProps: MountProps;
};

type ColumnPlacementPropsContext = {
  props: PropertiesPanelApi;
  params: ColumnParams;
  onChange: (params: Partial<ColumnParams>) => void;
  mountProps: MountProps;
};

type WindowPropsContext = {
  props: PropertiesPanelApi;
  windowInst: WindowInstance | null;
  walls: WallInstance[];
  updateWindowTransform: (windowInst: WindowInstance) => void;
  commitHistory: CommitHistory;
  S: AppState;
  mountProps: MountProps;
};

type WindowPlacementPropsContext = {
  props: PropertiesPanelApi;
  params: WindowParams;
  onChange: (params: Partial<WindowParams>) => void;
};

type DoorPropsContext = {
  props: PropertiesPanelApi;
  doorInst: DoorInstance | null;
  walls: WallInstance[];
  updateDoorTransform: (doorInst: DoorInstance) => void;
  commitHistory: CommitHistory;
  S: AppState;
  mountProps: MountProps;
};

type DoorPlacementPropsContext = {
  props: PropertiesPanelApi;
  params: DoorParams;
  onChange: (params: Partial<DoorParams>) => void;
};

type FloorBoundaryPropsContext = {
  props: PropertiesPanelApi;
  floorEdit: {
    params: FloorParams | null;
    segments: FloorBoundarySegment[];
    ortho: boolean;
    error: string;
  };
  getAllMaterials: () => MaterialOption[];
  floorDefault: FloorDefaults;
};

type UnderlayState = {
  opacity: number;
  scale: number;
  rotationDeg: number;
  offsetMm: { x: number; z: number };
  pinned: boolean;
  sourceName?: string | null;
};

type UnderlayCalibrationState = {
  knownMm: number;
  active: boolean;
  mode: "calibrate" | "reference";
  first: unknown | null;
};

type UnderlayPropsContext = {
  props: PropertiesPanelApi;
  loadUnderlayToCanvas: (file: File) => Promise<UnderlaySource>;
  ensureLayoutMode: () => void;
  setUnderlayStatus: (text: string) => void;
  setUnderlayFromCanvas: (
    canvas: HTMLCanvasElement,
    name: string,
    kind: UnderlaySource["kind"],
    physicalSizeMm?: UnderlaySource["physicalSizeMm"]
  ) => void;
  underlayState: UnderlayState;
  commitHistory: CommitHistory;
  S: AppState;
  setSelectedUnderlay: () => void;
  updateUnderlayTransform: () => void;
  underlayCal: UnderlayCalibrationState;
  underlayMesh: { visible: boolean };
  clearUnderlay: () => void;
  setSelectedModule: (id: string | null) => void;
  mountProps: MountProps;
  setUnderlayScaleEl: (el: HTMLInputElement) => void;
  setUnderlayOffXEl: (el: HTMLInputElement) => void;
  setUnderlayOffZEl: (el: HTMLInputElement) => void;
  setUnderlayStatusEl: (el: HTMLDivElement) => void;
  markUnderlaySelected: () => void;
};

type ModulePropsContext = {
  findInstance: (id: string) => LayoutInstance | null;
  showNoProps: () => void;
  props: PropertiesPanelApi;
  pinnedInstanceIds: Set<string>;
  instanceFitsRoom: (inst: LayoutInstance) => boolean;
  anyOverlap: (moving: LayoutInstance, ignoreId: string | null) => boolean;
  moduleOverlapsWalls: (inst: LayoutInstance) => boolean;
  moduleOverlapsKitchenWorktops: (inst: LayoutInstance) => boolean;
  commitHistory: CommitHistory;
  S: AppState;
  mountProps: MountProps;
  modulePackages: readonly FurnQuoteModulePackage[];
  args: { propertiesEl: HTMLElement };
  clientCatalog: ClientCatalog;
  rebuildInstance: (inst: LayoutInstance, opts?: RebuildInstanceOptions) => boolean;
  appendLinkedMeasureInputs: AppendLinkedMeasureInputs;
};

export function mountWallPropsPanel(ctx: WallPropsContext, w?: WallInstance) {
  const { props, selectedWallIds, walls, showNoProps, commitHistory, S, mountProps, rebuildWall, rebuildWallPlanMesh, appendLinkedMeasureInputs } = ctx;
    const selectedWalls =
      selectedWallIds.size > 1
        ? [...selectedWallIds]
            .map((id: string) => walls.find((wall: WallInstance) => wall.id === id))
            .filter((wall): wall is WallInstance => Boolean(wall))
        : w
          ? [w]
          : [];
    if (selectedWalls.length === 0) return showNoProps();

    const isMulti = selectedWalls.length > 1;
    const firstWall = selectedWalls[0];
    props.setTitle(isMulti ? `Steny (${selectedWalls.length})` : `Stena (${firstWall.id})`);
    const s = props.section();

    const multiVal = <K extends keyof WallParams>(items: WallInstance[], key: K) => {
      const first = items[0].params[key];
      const mixed = items.some((item) => item.params[key] !== first);
      return { value: mixed ? null : first, mixed };
    };

    const applyToSelectedWalls = (fn: (wall: WallInstance) => void) => {
      for (const wall of selectedWalls) fn(wall);
      for (const wall of walls) rebuildWall(wall);
      rebuildWallPlanMesh();
      commitHistory(S);
      mountProps();
    };

    const thickness = multiVal(selectedWalls, "thicknessMm");
    const th = document.createElement("input");
    th.type = "number";
    th.step = "1";
    th.placeholder = thickness.mixed ? "(rôzne)" : "";
    th.value = thickness.mixed ? "" : String(thickness.value);
    props.row(s, "Hrúbka (mm)", th);

    const height = multiVal(selectedWalls, "heightMm");
    const heightInput = document.createElement("input");
    heightInput.type = "number";
    heightInput.step = "1";
    heightInput.placeholder = height.mixed ? "(rôzne)" : "";
    heightInput.value = height.mixed ? "" : String(height.value);
    props.row(s, "Výška (mm)", heightInput);

    const justification = multiVal(selectedWalls, "justification");
    const just = document.createElement("select");
    just.innerHTML = `
      ${justification.mixed ? `<option value="">(rôzne)</option>` : ""}
      <option value="center">Center</option>
      <option value="interior">Finish face: interior</option>
      <option value="exterior">Finish face: exterior</option>
    `;
    just.value = justification.mixed ? "" : String(justification.value ?? "center");
    props.row(s, "Justification", just);

    th.addEventListener("change", () => {
      const next = Number(th.value);
      if (!Number.isFinite(next)) return;
      applyToSelectedWalls((wall) => {
        wall.params.thicknessMm = Math.max(10, Math.round(next));
      });
    });
    heightInput.addEventListener("change", () => {
      const next = Number(heightInput.value);
      if (!Number.isFinite(next)) return;
      applyToSelectedWalls((wall) => {
        wall.params.heightMm = Math.max(1, Math.round(next));
        wall.heightMm = wall.params.heightMm;
      });
    });
    just.addEventListener("change", () => {
      if (!just.value) return;
      applyToSelectedWalls((wall) => {
        wall.params.justification =
          just.value === "interior" ? "interior" : just.value === "exterior" ? "exterior" : "center";
      });
    });

    if (isMulti) return;

    const flip = document.createElement("button");
    flip.type = "button";
    flip.textContent = "Flip exterior";
    flip.style.height = "34px";
    props.row(s, "Exterior", flip);
    const mat = document.createElement("select");
    mat.innerHTML = `<option value="default">Default</option>`;
    mat.value = firstWall.params.materialId;
    props.row(s, "Material", mat);
    const len = document.createElement("div");
    len.className = "muted";
    const dx = firstWall.params.bMm.x - firstWall.params.aMm.x;
    const dz = firstWall.params.bMm.z - firstWall.params.aMm.z;
    len.textContent = `Length: ${Math.round(Math.hypot(dx, dz))} mm`;
    s.appendChild(len);
    flip.addEventListener("click", () => {
      firstWall.params.exteriorSign = (firstWall.params.exteriorSign ?? 1) === 1 ? -1 : 1;
      applyToSelectedWalls((wall) => {
        if (wall.id === firstWall.id) wall.params.exteriorSign = firstWall.params.exteriorSign;
      });
    });
    mat.addEventListener("change", () => {
      firstWall.params.materialId = mat.value || "default";
      commitHistory(S);
    });

    appendLinkedMeasureInputs(s, { kind: "wall", wallId: firstWall.id });

}

export function mountFloorPropsPanel(ctx: FloorPropsContext, floor: FloorInstance) {
  const { props, getAllMaterials, floorDefault, rebuildFloor, updateSelectionHighlights, commitHistory, S, enterFloorBoundaryEdit, appendLinkedMeasureInputs } = ctx;
    props.setTitle(`Podlaha (${floor.id})`);
    const s = props.section();

    const name = document.createElement("input");
    name.type = "text";
    name.value = floor.params.name;
    props.row(s, "Názov", name);

    const height = document.createElement("input");
    height.type = "number";
    height.step = "1";
    height.value = String(floor.params.heightMm);
    props.row(s, "Výška úrovne (mm)", height);

    const thickness = document.createElement("input");
    thickness.type = "number";
    thickness.step = "1";
    thickness.value = String(floor.params.thicknessMm);
    props.row(s, "Hrúbka (mm)", thickness);

    const mat = document.createElement("select");
    mat.innerHTML = getAllMaterials().map((material: { id: string | number; name: string }) => `<option value="${material.id}">${material.name}</option>`).join("");
    mat.value = floor.params.materialId ?? floorDefault.materialId;
    props.row(s, "Materiál", mat);

    const edit = document.createElement("button");
    edit.type = "button";
    edit.textContent = "Edit Boundary Line";
    edit.style.marginTop = "10px";
    s.appendChild(edit);

    const commit = () => {
      floor.params.name = name.value.trim() || floor.params.name;
      floor.params.heightMm = Math.round(Number(height.value) || floor.params.heightMm);
      floor.params.thicknessMm = Math.max(1, Math.round(Number(thickness.value) || floor.params.thicknessMm));
      floor.params.materialId = mat.value || floorDefault.materialId;
      name.value = floor.params.name;
      height.value = String(floor.params.heightMm);
      thickness.value = String(floor.params.thicknessMm);
      mat.value = floor.params.materialId;
      rebuildFloor(floor);
      updateSelectionHighlights();
      commitHistory(S);
    };

    name.addEventListener("change", commit);
    height.addEventListener("change", commit);
    thickness.addEventListener("change", commit);
    mat.addEventListener("change", commit);
    edit.addEventListener("click", () => enterFloorBoundaryEdit(floor.id));

    appendLinkedMeasureInputs(s, { kind: "floor", floorId: floor.id });

}

export function mountSectionToolPropsPanel(ctx: SectionToolContext) {
  const { props, sectionDraw, drawOrthoEnabled } = ctx;
    props.setTitle("Section");
    const s = props.section();
    const info = document.createElement("div");
    info.className = "muted";
    info.textContent = sectionDraw.a
      ? `Klikni druhý bod. Ortho ${drawOrthoEnabled ? "ON" : "OFF"}, Shift = bez axis snap, Space = zrkadliť smer. Aktuálne: ${sectionDraw.mirrored ? "mirrored" : "default"}.`
      : "Klikni prvý bod section line. Po druhom bode sa section vytvorí a otvorí.";
    s.appendChild(info);

}

export function mountSectionPropsPanel(ctx: SectionPropsContext, id: string) {
  const { props, sections, showNoProps, getSectionBasis, updateAllSectionVisuals, mountProps, commitHistory, S } = ctx;
    const section = sections.find((item) => item.id === id) ?? null;
    if (!section) return showNoProps();
    props.setTitle(`Section (${section.id})`);
    const s = props.section();

    const name = document.createElement("input");
    name.type = "text";
    name.value = section.params.name;
    props.row(s, "Name", name);

    const info = document.createElement("div");
    info.className = "muted";
    info.style.marginTop = "8px";
    const basis = getSectionBasis(section.params);
    info.textContent = `A: ${section.params.aMm.x}, ${section.params.aMm.z} mm | B: ${section.params.bMm.x}, ${section.params.bMm.z} mm | Dĺžka: ${basis ? Math.round(basis.length * 1000) : 0} mm`;
    s.appendChild(info);

    const dir = document.createElement("div");
    dir.className = "muted";
    dir.style.marginTop = "6px";
    dir.textContent = `Smer: ${section.params.mirrored ? "Mirrored" : "Default"}`;
    s.appendChild(dir);

    const commit = () => {
      const nextName = name.value.trim() || section.params.name;
      if (nextName === section.params.name) {
        name.value = section.params.name;
        return;
      }
      section.params.name = nextName;
      name.value = section.params.name;
      updateAllSectionVisuals();
      mountProps();
      commitHistory(S);
    };

    name.addEventListener("change", commit);
    name.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") commit();
    });

}

export function mountColumnPropsPanel(ctx: ColumnPropsContext) {
  const { props, column, showNoProps, rebuildColumn, commitHistory, S, mountProps } = ctx;
  if (!column) return showNoProps();

  props.setTitle(`Stlp (${column.id})`);
  const s = props.section();
  const params = column.params;

  const apply = (commit: boolean, _patch: Partial<ColumnParams>, remount = false) => {
    rebuildColumn(column);
    if (commit) commitHistory(S);
    if (remount) mountProps();
  };

  appendColumnParameterRows(props, s, params, apply, { includePosition: true });
}

export function mountColumnPlacementPropsPanel(ctx: ColumnPlacementPropsContext) {
  const { props, params, onChange, mountProps } = ctx;
  props.setTitle("Stlp - vlozenie");
  const s = props.section();
  const info = document.createElement("div");
  info.className = "muted";
  info.textContent = "Nastav parametre a klikni miesto v podoryse. Esc zrusi vkladanie.";
  s.appendChild(info);
  appendColumnParameterRows(
    props,
    s,
    params,
    (_commit, patch, remount) => {
      onChange(patch);
      if (remount) mountProps();
    },
    { includePosition: false }
  );
}

function appendColumnParameterRows(
  props: PropertiesPanelApi,
  s: HTMLElement,
  params: ColumnParams,
  apply: (commit: boolean, patch: Partial<ColumnParams>, remount?: boolean) => void,
  options: { includePosition: boolean }
) {
  const commitPatch = (commit: boolean, patch: Partial<ColumnParams>, remount = false) => {
    Object.assign(params, patch);
    apply(commit, patch, remount);
  };

  const name = document.createElement("input");
  name.type = "text";
  name.value = params.name;
  props.row(s, "Nazov", name);

  const shape = document.createElement("select");
  shape.innerHTML = `
    <option value="square">Stvorcovy</option>
    <option value="rectangular">Obdlznikovy</option>
    <option value="round">Kruhovy</option>
  `;
  shape.value = params.shape;
  props.row(s, "Prierez", shape);

  const addNumberRow = (
    label: string,
    key: keyof Pick<ColumnParams, "xMm" | "zMm" | "widthMm" | "depthMm" | "diameterMm" | "heightMm">,
    onRead?: (next: number) => Partial<ColumnParams>
  ) => {
    const input = document.createElement("input");
    input.type = "number";
    input.step = "1";
    input.value = String(Math.round(Number(params[key] ?? 0)));
    props.row(s, label, input);
    const restoreValue = () => {
      input.value = String(Math.round(Number(params[key] ?? 0)));
    };
    const read = (final = false): Partial<ColumnParams> | null => {
      const raw = input.value.trim();
      if (raw === "" || raw === "-" || raw === "+") {
        if (final) restoreValue();
        return null;
      }
      const next = Math.round(Number(raw));
      if (!Number.isFinite(next)) {
        if (final) restoreValue();
        return null;
      }
      return onRead ? onRead(next) : ({ [key]: next } as Partial<ColumnParams>);
    };
    input.addEventListener("input", () => {
      const patch = read();
      if (patch) commitPatch(false, patch);
    });
    input.addEventListener("change", () => {
      const patch = read(true);
      if (patch) {
        commitPatch(true, patch);
        restoreValue();
      }
    });
    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        const patch = read(true);
        if (!patch) return;
        commitPatch(true, patch);
        restoreValue();
      }
    });
  };

  if (options.includePosition) {
    addNumberRow("X (mm)", "xMm");
    addNumberRow("Z (mm)", "zMm");
  }
  addNumberRow("Vyska (mm)", "heightMm");

  if (params.shape === "round") {
    addNumberRow("Priemer (mm)", "diameterMm");
  } else if (params.shape === "square") {
    addNumberRow("Sirka (mm)", "widthMm", (next) => {
      return { widthMm: next, depthMm: next };
    });
  } else {
    addNumberRow("Sirka (mm)", "widthMm");
    addNumberRow("Hlbka (mm)", "depthMm");
  }

  const justifyX = document.createElement("select");
  justifyX.innerHTML = `
    <option value="left">Left</option>
    <option value="center">Center</option>
    <option value="right">Right</option>
  `;
  justifyX.value = params.justifyX ?? "center";
  props.row(s, "Justification X", justifyX);

  const justifyY = document.createElement("select");
  justifyY.innerHTML = `
    <option value="up">Up</option>
    <option value="center">Center</option>
    <option value="down">Down</option>
  `;
  justifyY.value = params.justifyY ?? "center";
  props.row(s, "Justification Y", justifyY);

  const material = document.createElement("select");
  material.innerHTML = `<option value="default">Default</option>`;
  material.value = params.materialId || "default";
  props.row(s, "Material", material);

  name.addEventListener("change", () => {
    const nextName = name.value.trim() || params.name;
    name.value = nextName;
    commitPatch(true, { name: nextName });
  });
  shape.addEventListener("change", () => {
    const nextShape = shape.value === "round" ? "round" : shape.value === "rectangular" ? "rectangular" : "square";
    const patch: Partial<ColumnParams> = { shape: nextShape };
    if (nextShape === "square") patch.depthMm = params.widthMm;
    if (nextShape === "round") patch.diameterMm = params.diameterMm || params.widthMm;
    commitPatch(true, patch, true);
  });
  justifyX.addEventListener("change", () => {
    commitPatch(true, { justifyX: justifyX.value === "left" || justifyX.value === "right" ? justifyX.value : "center" });
  });
  justifyY.addEventListener("change", () => {
    commitPatch(true, { justifyY: justifyY.value === "up" || justifyY.value === "down" ? justifyY.value : "center" });
  });
  material.addEventListener("change", () => {
    commitPatch(true, { materialId: material.value || "default" });
  });
}

function appendWindowParameterRows(
  props: PropertiesPanelApi,
  section: HTMLElement,
  params: WindowParams,
  apply: (commit: boolean, patch: Partial<WindowParams>) => void,
  options: { includeCenter: boolean }
) {
  const numberRow = (
    label: string,
    key: keyof Pick<
      WindowParams,
      | "widthMm"
      | "heightMm"
      | "sillHeightMm"
      | "centerMm"
      | "frameWidthMm"
      | "offsetFromInteriorMm"
      | "sashWidthMm"
      | "sashProfileDepthMm"
      | "frameProfileDepthMm"
    >
  ) => {
    const input = document.createElement("input");
    input.type = "number";
    input.step = "1";
    input.value = String(Math.round(Number(params[key] ?? 0)));
    props.row(section, label, input);
    const read = () => {
      const next = Number(input.value);
      if (!Number.isFinite(next)) return false;
      params[key] = Math.round(next) as never;
      return true;
    };
    input.addEventListener("input", () => {
      if (read()) apply(false, { [key]: params[key] } as Partial<WindowParams>);
    });
    input.addEventListener("change", () => {
      if (read()) apply(true, { [key]: params[key] } as Partial<WindowParams>);
    });
    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" && read()) apply(true, { [key]: params[key] } as Partial<WindowParams>);
    });
  };

  numberRow("Sirka (mm)", "widthMm");
  numberRow("Vyska (mm)", "heightMm");
  numberRow("Sill height (mm)", "sillHeightMm");
  if (options.includeCenter) numberRow("Poloha na stene (mm)", "centerMm");
  numberRow("Sirka ramu (mm)", "frameWidthMm");
  numberRow("Odsadenie od vnutornej plochy (mm)", "offsetFromInteriorMm");
  numberRow("Sirka kridla (mm)", "sashWidthMm");
  numberRow("Vyska prierezu kridla (mm)", "sashProfileDepthMm");
  numberRow("Vyska prierezu ramu (mm)", "frameProfileDepthMm");

  const swingControls = document.createElement("div");
  swingControls.className = "door-swing-controls";
  const makeSwingButton = (html: string, title: string) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "door-swing-button";
    button.innerHTML = html;
    button.title = title;
    return button;
  };
  const handednessButton = makeSwingButton("&#8596;", "Prehodit lave/prave okno");
  const sideButton = makeSwingButton("&#8597;", "Prehodit otvaranie dovnutra/von");
  swingControls.append(handednessButton, sideButton);
  props.row(section, "Sipky", swingControls);

  const swing = document.createElement("select");
  swing.innerHTML = `
    <option value="left">Lave</option>
    <option value="right">Prave</option>
  `;
  swing.value = params.swingDirection;
  const swingSide = document.createElement("select");
  swingSide.innerHTML = `
    <option value="inward">Dovnutra</option>
    <option value="outward">Von</option>
  `;
  swingSide.value = params.swingSide;
  const syncSwingControls = () => {
    swing.value = params.swingDirection;
    swingSide.value = params.swingSide;
    handednessButton.title = params.swingDirection === "right" ? "Prehodit na lave okno" : "Prehodit na prave okno";
    sideButton.title = params.swingSide === "outward" ? "Prehodit otvaranie dovnutra" : "Prehodit otvaranie von";
  };
  handednessButton.addEventListener("click", () => {
    params.swingDirection = params.swingDirection === "right" ? "left" : "right";
    syncSwingControls();
    apply(true, { swingDirection: params.swingDirection });
  });
  sideButton.addEventListener("click", () => {
    params.swingSide = params.swingSide === "outward" ? "inward" : "outward";
    syncSwingControls();
    apply(true, { swingSide: params.swingSide });
  });
  swing.addEventListener("change", () => {
    params.swingDirection = swing.value === "right" ? "right" : "left";
    syncSwingControls();
    apply(true, { swingDirection: params.swingDirection });
  });
  props.row(section, "Otvaranie", swing);
  swingSide.addEventListener("change", () => {
    params.swingSide = swingSide.value === "outward" ? "outward" : "inward";
    syncSwingControls();
    apply(true, { swingSide: params.swingSide });
  });
  props.row(section, "Smer", swingSide);
  syncSwingControls();

  const material = document.createElement("select");
  material.innerHTML = WINDOW_MATERIAL_OPTIONS.map((option) => `<option value="${option.id}">${option.name}</option>`).join("");
  material.value = params.materialId;
  material.addEventListener("change", () => {
    params.materialId = material.value;
    apply(true, { materialId: material.value });
  });
  props.row(section, "Material", material);
}

export function mountWindowPlacementPropsPanel(ctx: WindowPlacementPropsContext) {
  const { props, params } = ctx;
  props.setTitle("Okno - vlozenie");
  const s = props.section();
  const info = document.createElement("div");
  info.className = "muted";
  info.textContent = "Najprv nastav parametre, potom klikni presne miesto na stene.";
  s.appendChild(info);
  appendWindowParameterRows(
    props,
    s,
    params,
    (_commit, patch) => {
      ctx.onChange(patch);
    },
    { includeCenter: false }
  );
}

export function mountWindowPropsPanel(ctx: WindowPropsContext) {
  const { props, windowInst } = ctx;
  if (!windowInst) return;

  props.setTitle("Okno");
  const s = props.section();
  const params = windowInst.params;
  const wall = params.wallId ? ctx.walls.find((item) => item.id === params.wallId) ?? null : null;

  const wallInfo = document.createElement("div");
  wallInfo.className = "muted";
  wallInfo.textContent = wall ? `Stena: ${wall.id}` : "Okno nie je vlozene v kreslenej stene.";
  s.appendChild(wallInfo);

  appendWindowParameterRows(
    props,
    s,
    params,
    (commit) => {
      ctx.updateWindowTransform(windowInst);
      if (commit) {
        ctx.commitHistory(ctx.S);
        ctx.mountProps();
      }
    },
    { includeCenter: true }
  );
}

function appendDoorParameterRows(
  props: PropertiesPanelApi,
  section: HTMLElement,
  params: DoorParams,
  apply: (commit: boolean, patch: Partial<DoorParams>) => void,
  options: { includeCenter: boolean }
) {
  const numberRow = (
    label: string,
    key: keyof Pick<
      DoorParams,
      "widthMm" | "heightMm" | "centerMm" | "frameWidthMm" | "offsetFromInteriorMm" | "panelThicknessMm" | "swingAngleDeg"
    >
  ) => {
    const input = document.createElement("input");
    input.type = "number";
    input.step = "1";
    input.value = String(Math.round(Number(params[key] ?? 0)));
    props.row(section, label, input);
    const read = () => {
      const next = Number(input.value);
      if (!Number.isFinite(next)) return false;
      params[key] = Math.round(next) as never;
      return true;
    };
    input.addEventListener("input", () => {
      if (read()) apply(false, { [key]: params[key] } as Partial<DoorParams>);
    });
    input.addEventListener("change", () => {
      if (read()) apply(true, { [key]: params[key] } as Partial<DoorParams>);
    });
    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" && read()) apply(true, { [key]: params[key] } as Partial<DoorParams>);
    });
  };

  numberRow("Sirka (mm)", "widthMm");
  numberRow("Vyska (mm)", "heightMm");
  if (options.includeCenter) numberRow("Poloha na stene (mm)", "centerMm");
  numberRow("Sirka ramu (mm)", "frameWidthMm");
  numberRow("Odsadenie kridla (mm)", "offsetFromInteriorMm");
  numberRow("Hrubka kridla (mm)", "panelThicknessMm");
  numberRow("Uhol otvorenia", "swingAngleDeg");

  const swingControls = document.createElement("div");
  swingControls.className = "door-swing-controls";
  const makeSwingButton = (html: string, label: string) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "door-swing-button";
    button.innerHTML = html;
    button.title = label;
    button.setAttribute("aria-label", label);
    return button;
  };
  const handednessButton = makeSwingButton("&#8596;", "Prehodit lave/prave dvere");
  const sideButton = makeSwingButton("&#8597;", "Prehodit otvaranie dovnutra/von");
  swingControls.append(handednessButton, sideButton);
  props.row(section, "Sipky", swingControls);

  const swing = document.createElement("select");
  swing.innerHTML = `
    <option value="left">Lave</option>
    <option value="right">Prave</option>
  `;
  swing.value = params.swingDirection;

  const swingSide = document.createElement("select");
  swingSide.innerHTML = `
    <option value="inward">Dovnutra</option>
    <option value="outward">Von</option>
  `;
  swingSide.value = params.swingSide;

  const syncSwingControls = () => {
    swing.value = params.swingDirection;
    swingSide.value = params.swingSide;
    handednessButton.title = params.swingDirection === "right" ? "Prehodit na lave dvere" : "Prehodit na prave dvere";
    sideButton.title = params.swingSide === "outward" ? "Prehodit otvaranie dovnutra" : "Prehodit otvaranie von";
  };

  handednessButton.addEventListener("click", () => {
    params.swingDirection = params.swingDirection === "right" ? "left" : "right";
    syncSwingControls();
    apply(true, { swingDirection: params.swingDirection });
  });
  sideButton.addEventListener("click", () => {
    params.swingSide = params.swingSide === "outward" ? "inward" : "outward";
    syncSwingControls();
    apply(true, { swingSide: params.swingSide });
  });
  swing.addEventListener("change", () => {
    params.swingDirection = swing.value === "right" ? "right" : "left";
    syncSwingControls();
    apply(true, { swingDirection: params.swingDirection });
  });
  props.row(section, "Otvaranie", swing);
  swingSide.addEventListener("change", () => {
    params.swingSide = swingSide.value === "outward" ? "outward" : "inward";
    syncSwingControls();
    apply(true, { swingSide: params.swingSide });
  });
  props.row(section, "Smer", swingSide);
  syncSwingControls();

  const material = document.createElement("select");
  material.innerHTML = DOOR_MATERIAL_OPTIONS.map((option) => `<option value="${option.id}">${option.name}</option>`).join("");
  material.value = params.materialId;
  material.addEventListener("change", () => {
    params.materialId = material.value;
    apply(true, { materialId: material.value });
  });
  props.row(section, "Material", material);
}

export function mountDoorPlacementPropsPanel(ctx: DoorPlacementPropsContext) {
  const { props, params } = ctx;
  props.setTitle("Dvere - vlozenie");
  const s = props.section();
  const info = document.createElement("div");
  info.className = "muted";
  info.textContent = "Najprv nastav parametre, potom klikni presne miesto na stene. Space lave/prave, Shift+Space dnu/von.";
  s.appendChild(info);
  appendDoorParameterRows(
    props,
    s,
    params,
    (_commit, patch) => {
      ctx.onChange(patch);
    },
    { includeCenter: false }
  );
}

export function mountDoorPropsPanel(ctx: DoorPropsContext) {
  const { props, doorInst } = ctx;
  if (!doorInst) return;

  props.setTitle("Dvere");
  const s = props.section();
  const params = doorInst.params;
  const wall = params.wallId ? ctx.walls.find((item) => item.id === params.wallId) ?? null : null;

  const wallInfo = document.createElement("div");
  wallInfo.className = "muted";
  wallInfo.textContent = wall ? `Stena: ${wall.id}` : "Dvere nie su vlozene v kreslenej stene.";
  s.appendChild(wallInfo);

  appendDoorParameterRows(
    props,
    s,
    params,
    (commit) => {
      ctx.updateDoorTransform(doorInst);
      if (commit) {
        ctx.commitHistory(ctx.S);
        ctx.mountProps();
      }
    },
    { includeCenter: true }
  );
}

export function mountFloorBoundaryPropsPanel(ctx: FloorBoundaryPropsContext) {
  const { props, floorEdit, getAllMaterials, floorDefault } = ctx;
    props.setTitle("Floor Boundary");
    const s = props.section();
    const params = floorEdit.params;
    if (!params) return;

    const height = document.createElement("input");
    height.type = "number";
    height.step = "1";
    height.value = String(params.heightMm);
    props.row(s, "Výška úrovne (mm)", height);

    const thickness = document.createElement("input");
    thickness.type = "number";
    thickness.step = "1";
    thickness.value = String(params.thicknessMm);
    props.row(s, "Hrúbka (mm)", thickness);

    const mat = document.createElement("select");
    mat.innerHTML = getAllMaterials().map((material: { id: string | number; name: string }) => `<option value="${material.id}">${material.name}</option>`).join("");
    mat.value = params.materialId ?? floorDefault.materialId;
    props.row(s, "Materiál", mat);

    const info = document.createElement("div");
    info.className = "muted";
    info.textContent = `Boundary lines: ${floorEdit.segments.length}. Ortho: ${floorEdit.ortho ? "ON" : "OFF"}. Horná línia je na výške úrovne, hrúbka ide vždy smerom dole.`;
    s.appendChild(info);

    if (floorEdit.error) {
      const error = document.createElement("div");
      error.style.color = "#ff6b6b";
      error.style.marginTop = "8px";
      error.textContent = floorEdit.error;
      s.appendChild(error);
    }

    height.addEventListener("change", () => {
      const next = Number(height.value);
      if (!Number.isFinite(next)) return;
      params.heightMm = Math.round(next);
      height.value = String(params.heightMm);
    });
    thickness.addEventListener("change", () => {
      const next = Number(thickness.value);
      if (!Number.isFinite(next)) return;
      params.thicknessMm = Math.max(1, Math.round(next));
      thickness.value = String(params.thicknessMm);
    });
    mat.addEventListener("change", () => {
      params.materialId = mat.value || floorDefault.materialId;
    });

}

export function mountUnderlayPropsPanel(ctx: UnderlayPropsContext) {
  const { props, loadUnderlayToCanvas, ensureLayoutMode, setUnderlayStatus, setUnderlayFromCanvas, underlayState, commitHistory, S, setSelectedUnderlay, updateUnderlayTransform, underlayCal, underlayMesh, clearUnderlay, setSelectedModule, mountProps, setUnderlayScaleEl, setUnderlayOffXEl, setUnderlayOffZEl, setUnderlayStatusEl, markUnderlaySelected } = ctx;
    props.setTitle("Underlay");
    const s = props.section();

    const file = document.createElement("input");
    file.type = "file";
    file.accept = ".png,.pdf,image/png,application/pdf";
    props.row(s, "Upload", file);

    const opacity = document.createElement("input");
    opacity.type = "range";
    opacity.min = "0";
    opacity.max = "1";
    opacity.step = "0.01";
    opacity.value = String(underlayState.opacity);
    props.row(s, "Opacity", opacity);
    S.underlayOpacityEl = opacity;

    const scale = document.createElement("input");
    scale.type = "number";
    scale.step = "0.01";
    scale.value = String(underlayState.scale);
    props.row(s, "Scale", scale);
    setUnderlayScaleEl(scale);
    S.underlayScaleEl = scale;

    const rot = document.createElement("input");
    rot.type = "number";
    rot.step = "1";
    rot.value = String(underlayState.rotationDeg);
    props.row(s, "Rotation °", rot);
    S.underlayRotEl = rot;

    const offX = document.createElement("input");
    offX.type = "number";
    offX.step = "1";
    offX.value = String(underlayState.offsetMm.x);
    props.row(s, "Offset X", offX);
    setUnderlayOffXEl(offX);
    S.underlayOffXEl = offX;

    const offZ = document.createElement("input");
    offZ.type = "number";
    offZ.step = "1";
    offZ.value = String(underlayState.offsetMm.z);
    props.row(s, "Offset Z", offZ);
    setUnderlayOffZEl(offZ);
    S.underlayOffZEl = offZ;

    const known = document.createElement("input");
    known.type = "number";
    known.step = "1";
    known.value = String(underlayCal.knownMm);
    props.row(s, "Calibrate mm", known);

    const pinned = document.createElement("input");
    pinned.type = "checkbox";
    pinned.checked = underlayState.pinned;
    props.row(s, "Pinned", pinned);

    const actions = document.createElement("div");
    actions.className = "actions";
    const calibrateBtn = document.createElement("button");
    calibrateBtn.type = "button";
    calibrateBtn.textContent = "Calibrate";
    const resetScaleBtn = document.createElement("button");
    resetScaleBtn.type = "button";
    resetScaleBtn.textContent = "Reset scale";
    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.textContent = "Remove";
    clearBtn.style.borderColor = "#3a1f23";
    clearBtn.style.background = "#1a0f12";
    clearBtn.style.color = "#ff6b6b";
    actions.appendChild(calibrateBtn);
    actions.appendChild(resetScaleBtn);
    actions.appendChild(clearBtn);
    s.appendChild(actions);

    const underlayStatusEl = document.createElement("div");
    setUnderlayStatusEl(underlayStatusEl);
    underlayStatusEl.className = "muted";
    underlayStatusEl.style.fontSize = "12px";
    underlayStatusEl.style.marginTop = "10px";
    underlayStatusEl.textContent = underlayMesh.visible ? `Underlay: ${underlayState.sourceName ?? "loaded"}` : "Upload PDF/PNG underlay.";
    S.underlayStatusEl = underlayStatusEl;
    s.appendChild(underlayStatusEl);

    file.addEventListener("change", async () => {
      ensureLayoutMode();
      const f = file.files?.[0] ?? null;
      if (!f) return;
      setUnderlayStatus("Loading...");
      try {
        const res = await loadUnderlayToCanvas(f);
        setUnderlayFromCanvas(res.canvas, res.name, res.kind);
        opacity.value = String(underlayState.opacity);
        scale.value = String(underlayState.scale);
        rot.value = String(underlayState.rotationDeg);
        offX.value = String(underlayState.offsetMm.x);
        offZ.value = String(underlayState.offsetMm.z);
        pinned.checked = underlayState.pinned;
        setUnderlayStatus(`Underlay: ${res.name}`);
        setSelectedUnderlay();
        commitHistory(S);
      } catch (e) {
        setUnderlayStatus(`Load failed: ${(e as Error).message}`);
      } finally {
        file.value = "";
      }
    });

    opacity.addEventListener("input", () => {
      underlayState.opacity = Math.min(1, Math.max(0, Number(opacity.value) || 0));
      updateUnderlayTransform();
    });
    scale.addEventListener("change", () => {
      underlayState.scale = Math.max(0.001, Number(scale.value) || 1);
      updateUnderlayTransform();
      commitHistory(S);
    });
    rot.addEventListener("change", () => {
      underlayState.rotationDeg = Number(rot.value) || 0;
      updateUnderlayTransform();
      commitHistory(S);
    });
    offX.addEventListener("change", () => {
      underlayState.offsetMm.x = Number(offX.value) || 0;
      updateUnderlayTransform();
      commitHistory(S);
    });
    offZ.addEventListener("change", () => {
      underlayState.offsetMm.z = Number(offZ.value) || 0;
      updateUnderlayTransform();
      commitHistory(S);
    });
    pinned.addEventListener("change", () => {
      underlayState.pinned = pinned.checked;
      S.underlayState.pinned = underlayState.pinned;
      if (underlayState.pinned) setSelectedModule(null);
      commitHistory(S);
      mountProps();
    });
    calibrateBtn.addEventListener("click", () => {
      ensureLayoutMode();
      if (!underlayMesh.visible) {
        setUnderlayStatus("Upload underlay first.");
        return;
      }
      underlayCal.knownMm = Math.max(1, Number(known.value) || 1);
      underlayCal.active = true;
      underlayCal.mode = "calibrate";
      underlayCal.first = null;
      setUnderlayStatus("Calibration: click first point...");
    });
    resetScaleBtn.addEventListener("click", () => {
      underlayState.scale = 1;
      scale.value = "1";
      updateUnderlayTransform();
      commitHistory(S);
      setUnderlayStatus("Scale reset.");
    });
    clearBtn.addEventListener("click", () => {
      clearUnderlay();
      setSelectedModule(null);
      markUnderlaySelected();
      commitHistory(S);
      mountProps();
    });

}

export function mountModulePropsPanel(ctx: ModulePropsContext, id: string) {
  const { findInstance, showNoProps, props, pinnedInstanceIds, instanceFitsRoom, anyOverlap, moduleOverlapsWalls, moduleOverlapsKitchenWorktops, commitHistory, S, mountProps, modulePackages, args, rebuildInstance, appendLinkedMeasureInputs } = ctx;
    const inst = findInstance(id);
    if (!inst) return showNoProps();
    props.setTitle(`Module (${inst.id})`);
    const s = props.section();
    const type = document.createElement("div");
    type.className = "muted";
    type.textContent = `Type: ${inst.params.type}`;
    s.appendChild(type);
    const pos = document.createElement("div");
    pos.className = "muted";
    pos.textContent = `Pozícia: ${Math.round(inst.root.position.x * 1000)}×${Math.round(inst.root.position.z * 1000)} mm`;
    s.appendChild(pos);

    const rowHost = document.createElement("div");
    rowHost.style.marginTop = "10px";
    s.appendChild(rowHost);

    const rot = document.createElement("input");
    rot.type = "number";
    rot.step = "1";
    rot.value = String(Math.round((inst.root.rotation.y * 180) / Math.PI));
    props.row(rowHost, "Rotation (deg)", rot);

    const pinned = document.createElement("input");
    pinned.type = "checkbox";
    pinned.checked = pinnedInstanceIds.has(inst.id);
    props.row(rowHost, "Pinned", pinned);

    const applyRot = () => {
      const n = Number(String(rot.value).trim().replace(",", "."));
      if (!Number.isFinite(n)) return;
      const deg = ((n % 360) + 360) % 360;
      const next = (deg * Math.PI) / 180;
      const prevRot = inst.root.rotation.y;
      inst.root.rotation.y = next;
      const inRoom = instanceFitsRoom(inst);
      const overlaps = anyOverlap(inst, null) || moduleOverlapsWalls(inst) || moduleOverlapsKitchenWorktops(inst);
      if (!inRoom || overlaps) {
        inst.root.rotation.y = prevRot;
        rot.value = String(Math.round((prevRot * 180) / Math.PI));
        return;
      }
      commitHistory(S);
      mountProps();
    };

    rot.addEventListener("change", applyRot);
    rot.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") applyRot();
      if (ev.key === "Escape") {
        ev.preventDefault();
        rot.value = String(Math.round((inst.root.rotation.y * 180) / Math.PI));
        rot.select();
      }
    });

    pinned.addEventListener("change", () => {
      if (pinned.checked) pinnedInstanceIds.add(inst.id);
      else pinnedInstanceIds.delete(inst.id);
      commitHistory(S);
      mountProps();
    });

    const editorHost = document.createElement("div");
    editorHost.style.marginTop = "10px";
    s.appendChild(editorHost);

    const worktopArgs = { getWorktopThicknessMm: () => 0, clientCatalog: ctx.clientCatalog };
    const onChange = (previousParams?: ModuleParams, sourceKey?: string) => {
      const accepted = rebuildInstance(inst, {
        previousParams,
        preserveBackAnchor: true,
        sourceKey
      });
      if (!accepted) return false;
      commitHistory(S);
      pos.textContent = `Pozícia: ${Math.round(inst.root.position.x * 1000)}×${Math.round(inst.root.position.z * 1000)} mm`;
      mountProps();
      return true;
    };

    const modulePackage = findModulePackageForParams(modulePackages, inst.params);
    if (!modulePackage) {
      const missing = document.createElement("div");
      missing.className = "muted";
      missing.textContent = `Module package missing for ${inst.params.type}.`;
      editorHost.appendChild(missing);
    } else {
      createModulePackageControls(editorHost, modulePackage, inst.params, {
        ...worktopArgs,
        onChange,
        textInputCommitMode: "explicit",
        commitBoundary: args.propertiesEl
      });
    }

    appendLinkedMeasureInputs(s, { kind: "module", instanceId: inst.id });

}
