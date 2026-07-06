import type { AppState } from "../layout/appState";
import type { ClientCatalog } from "../core/catalog/catalog-types";
import type { ModuleParams } from "../model/cabinetTypes";
import type { FurnQuoteModulePackage } from "../core/module-package/module-package-types";
import { createResolvedModuleControls, findModulePackageForParams } from "../core/module-package/runtime/module-package-controls";
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
import { DOOR_MATERIAL_OPTIONS, getDoorMaterialOption } from "./doorMaterials";
import { appendOpeningHandleRows, appendOpeningMaterialRow, appendOpeningNumberRows, appendOpeningSwingRows } from "./openingPropsPanelControls";
import { WINDOW_MATERIAL_OPTIONS } from "./windowMaterials";
import { mmDist, wallEndpointWhich } from "./wallGeometryHelpers";
import { refreshSelectionHighlights } from "./selectionController";
import { createButtonElement, createCheckboxElement, createFileInputElement, createInputElement, createMutedText, createRangeElement, createSelectElement } from "./propsPanelElements";
import {
  applyWallTypeToParams,
  CUSTOM_WALL_TYPE_ID,
  resolveWallTypeId,
  WALL_TYPE_PRESETS
} from "./wallTypes";

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
  wallJoinTolMm: number;
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
  recordActivity?: (label: string) => void;
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
  recordActivity?: (label: string) => void;
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
  const { props, selectedWallIds, walls, wallJoinTolMm, showNoProps, commitHistory, S, mountProps, rebuildWall, rebuildWallPlanMesh, appendLinkedMeasureInputs } = ctx;
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

    const rebuildJoinState = () => {
      for (const wall of walls) rebuildWall(wall);
      rebuildWallPlanMesh();
      commitHistory(S);
      mountProps();
    };

    const endpointPoint = (wall: WallInstance, end: "a" | "b") => (end === "a" ? wall.params.aMm : wall.params.bMm);
    const connectedAtEnd = (wall: WallInstance, end: "a" | "b") => {
      const p = endpointPoint(wall, end);
      return walls
        .filter((other) => other.id !== wall.id)
        .map((other) => ({ wall: other, end: wallEndpointWhich(other, p, wallJoinTolMm) }))
        .filter(
          (item): item is { wall: WallInstance; end: "a" | "b" } =>
            !!item.end && mmDist(endpointPoint(item.wall, item.end), p) <= wallJoinTolMm
        );
    };
    const joinEnd = (wall: WallInstance, end: "a" | "b") => wall.params.joinEnds?.[end] ?? {};
    const joinEnabled = (wall: WallInstance, end: "a" | "b") => joinEnd(wall, end).enabled !== false;
    const joinPriority = (wall: WallInstance, end: "a" | "b") => joinEnd(wall, end).priority ?? 0;
    const ensureJoinEnd = (wall: WallInstance, end: "a" | "b") => {
      wall.params.joinEnds ??= {};
      wall.params.joinEnds[end] ??= {};
      return wall.params.joinEnds[end]!;
    };

    const resolvedTypeIds = selectedWalls.map((wall) => resolveWallTypeId(wall.params));
    const wallTypeMixed = resolvedTypeIds.some((typeId) => typeId !== resolvedTypeIds[0]);
    const typeSelect = createSelectElement(wallTypeMixed ? "" : (resolvedTypeIds[0] ?? ""), [
      ...(wallTypeMixed ? [{ value: "", label: "(rozne)" }] : []),
      { value: CUSTOM_WALL_TYPE_ID, label: "Vlastna" },
      ...WALL_TYPE_PRESETS.map((preset) => ({ value: preset.id, label: preset.name }))
    ]);
    props.row(s, "Typ steny", typeSelect);

    const thickness = multiVal(selectedWalls, "thicknessMm");
    const th = createInputElement("number", thickness.mixed ? "" : String(thickness.value), {
      step: "1",
      placeholder: thickness.mixed ? "(rôzne)" : ""
    });
    props.row(s, "Hrúbka (mm)", th);

    const height = multiVal(selectedWalls, "heightMm");
    const heightInput = createInputElement("number", height.mixed ? "" : String(height.value), {
      step: "1",
      placeholder: height.mixed ? "(rôzne)" : ""
    });
    props.row(s, "Výška (mm)", heightInput);

    const justification = multiVal(selectedWalls, "justification");
    const just = createSelectElement(justification.mixed ? "" : String(justification.value ?? "center"), [
      ...(justification.mixed ? [{ value: "", label: "(rôzne)" }] : []),
      { value: "center", label: "Center" },
      { value: "interior", label: "Finish face: interior" },
      { value: "exterior", label: "Finish face: exterior" }
    ]);
    props.row(s, "Justification", just);

    typeSelect.addEventListener("change", () => {
      if (!typeSelect.value) return;
      applyToSelectedWalls((wall) => {
        const preset = applyWallTypeToParams(wall.params, typeSelect.value);
        if (preset) wall.heightMm = wall.params.heightMm;
      });
    });
    th.addEventListener("change", () => {
      const next = Number(th.value);
      if (!Number.isFinite(next)) return;
      applyToSelectedWalls((wall) => {
        wall.params.thicknessMm = Math.max(10, Math.round(next));
        wall.params.typeId = CUSTOM_WALL_TYPE_ID;
      });
    });
    heightInput.addEventListener("change", () => {
      const next = Number(heightInput.value);
      if (!Number.isFinite(next)) return;
      applyToSelectedWalls((wall) => {
        wall.params.heightMm = Math.max(1, Math.round(next));
        wall.params.typeId = CUSTOM_WALL_TYPE_ID;
        wall.heightMm = wall.params.heightMm;
      });
    });
    just.addEventListener("change", () => {
      if (!just.value) return;
      applyToSelectedWalls((wall) => {
        wall.params.justification =
          just.value === "interior" ? "interior" : just.value === "exterior" ? "exterior" : "center";
        wall.params.typeId = CUSTOM_WALL_TYPE_ID;
      });
    });

    if (isMulti) return;

    const flip = createButtonElement("Flip exterior");
    flip.style.height = "34px";
    props.row(s, "Exterior", flip);
    const len = document.createElement("div");
    len.className = "muted";
    const dx = firstWall.params.bMm.x - firstWall.params.aMm.x;
    const dz = firstWall.params.bMm.z - firstWall.params.aMm.z;
    len.textContent = `Length: ${Math.round(Math.hypot(dx, dz))} mm`;
    s.appendChild(len);
    flip.addEventListener("click", () => {
      firstWall.params.exteriorSign = (firstWall.params.exteriorSign ?? 1) === 1 ? -1 : 1;
      applyToSelectedWalls((wall) => {
        if (wall.id === firstWall.id) {
          wall.params.exteriorSign = firstWall.params.exteriorSign;
          wall.params.typeId = CUSTOM_WALL_TYPE_ID;
        }
      });
    });

    const joinsLabel = document.createElement("div");
    joinsLabel.className = "muted";
    joinsLabel.textContent = "Spoje stien";
    joinsLabel.style.marginTop = "10px";
    s.appendChild(joinsLabel);

    for (const end of ["a", "b"] as const) {
      const connected = connectedAtEnd(firstWall, end);
      const control = document.createElement("div");
      control.style.display = "grid";
      control.style.gap = "6px";

      const status = document.createElement("div");
      status.className = "muted";
      const enabled = joinEnabled(firstWall, end);
      const selectedPriority = joinPriority(firstWall, end);
      const neighborMaxPriority = connected.length > 0 ? Math.max(...connected.map((item) => joinPriority(item.wall, item.end))) : 0;
      const role =
        connected.length === 0
          ? "bez napojenia"
          : !enabled
            ? "spoj vypnuty"
            : selectedPriority > neighborMaxPriority
              ? "tato stena pokracuje"
              : selectedPriority < neighborMaxPriority
                ? "tato stena sa napaja"
                : "auto poradie";
      status.textContent = connected.length > 0 ? `${role} · ${connected.map((item) => item.wall.id).join(", ")}` : role;
      control.appendChild(status);

      const buttons = document.createElement("div");
      buttons.style.display = "flex";
      buttons.style.gap = "6px";
      buttons.style.flexWrap = "wrap";

      const makeMain = createButtonElement("Tato stena pokracuje");
      makeMain.disabled = connected.length === 0;
      makeMain.addEventListener("click", () => {
        const priorities = [joinPriority(firstWall, end), ...connected.map((item) => joinPriority(item.wall, item.end))];
        const join = ensureJoinEnd(firstWall, end);
        join.enabled = true;
        join.priority = Math.max(0, ...priorities) + 1;
        rebuildJoinState();
      });
      buttons.appendChild(makeMain);

      const toggle = createButtonElement(enabled ? "Vypnut spoj" : "Povolit spoj");
      toggle.disabled = connected.length === 0;
      toggle.addEventListener("click", () => {
        const join = ensureJoinEnd(firstWall, end);
        join.enabled = !enabled;
        rebuildJoinState();
      });
      buttons.appendChild(toggle);

      control.appendChild(buttons);
      props.row(s, `Spoj ${end.toUpperCase()}`, control);
    }

    appendLinkedMeasureInputs(s, { kind: "wall", wallId: firstWall.id });

}

export function mountFloorPropsPanel(ctx: FloorPropsContext, floor: FloorInstance) {
  const { props, getAllMaterials, floorDefault, rebuildFloor, commitHistory, S, enterFloorBoundaryEdit, appendLinkedMeasureInputs } = ctx;
    props.setTitle(`Podlaha (${floor.id})`);
    const s = props.section();

    const name = createInputElement("text", floor.params.name);
    props.row(s, "Názov", name);

    const height = createInputElement("number", String(floor.params.heightMm), { step: "1" });
    props.row(s, "Výška úrovne (mm)", height);

    const thickness = createInputElement("number", String(floor.params.thicknessMm), { step: "1" });
    props.row(s, "Hrúbka (mm)", thickness);

    const mat = createSelectElement(
      floor.params.materialId ?? floorDefault.materialId,
      getAllMaterials().map((material: { id: string | number; name: string }) => ({ value: material.id, label: material.name }))
    );
    props.row(s, "Materiál", mat);

    const edit = createButtonElement("Edit Boundary Line");
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
      refreshSelectionHighlights(ctx);
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
    const info = createMutedText("");
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

    const name = createInputElement("text", section.params.name);
    props.row(s, "Name", name);

    const info = createMutedText("");
    info.style.marginTop = "8px";
    const basis = getSectionBasis(section.params);
    info.textContent = `A: ${section.params.aMm.x}, ${section.params.aMm.z} mm | B: ${section.params.bMm.x}, ${section.params.bMm.z} mm | Dĺžka: ${basis ? Math.round(basis.length * 1000) : 0} mm`;
    s.appendChild(info);

    const dir = createMutedText("");
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
  const info = createMutedText("");
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

  const name = createInputElement("text", params.name);
  props.row(s, "Nazov", name);

  const shape = createSelectElement(params.shape, [
    { value: "square", label: "Stvorcovy" },
    { value: "rectangular", label: "Obdlznikovy" },
    { value: "round", label: "Kruhovy" }
  ]);
  props.row(s, "Prierez", shape);

  const addNumberRow = (
    label: string,
    key: keyof Pick<ColumnParams, "xMm" | "zMm" | "widthMm" | "depthMm" | "diameterMm" | "heightMm">,
    onRead?: (next: number) => Partial<ColumnParams>
  ) => {
    const input = createInputElement("number", String(Math.round(Number(params[key] ?? 0))), { step: "1" });
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

  const justifyX = createSelectElement(params.justifyX ?? "center", [
    { value: "left", label: "Left" },
    { value: "center", label: "Center" },
    { value: "right", label: "Right" }
  ]);
  props.row(s, "Justification X", justifyX);

  const justifyY = createSelectElement(params.justifyY ?? "center", [
    { value: "up", label: "Up" },
    { value: "center", label: "Center" },
    { value: "down", label: "Down" }
  ]);
  props.row(s, "Justification Y", justifyY);

  const material = createSelectElement(params.materialId || "default", [{ value: "default", label: "Default" }]);
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
  appendOpeningNumberRows(
    props,
    section,
    params,
    [
      { label: "Sirka (mm)", key: "widthMm" },
      { label: "Vyska (mm)", key: "heightMm" },
      { label: "Sill height (mm)", key: "sillHeightMm" },
      ...(options.includeCenter ? [{ label: "Poloha na stene (mm)", key: "centerMm" as const }] : []),
      { label: "Sirka ramu (mm)", key: "frameWidthMm" },
      { label: "Odsadenie od vnutornej plochy (mm)", key: "offsetFromInteriorMm" },
      { label: "Sirka kridla (mm)", key: "sashWidthMm" },
      { label: "Vyska prierezu kridla (mm)", key: "sashProfileDepthMm" },
      { label: "Vyska prierezu ramu (mm)", key: "frameProfileDepthMm" }
    ],
    apply
  );

  appendOpeningSwingRows(props, section, params, apply, {
    controlsRow: "Sipky",
    directionRow: "Otvaranie",
    sideRow: "Smer",
    handednessButton: "Prehodit lave/prave okno",
    sideButton: "Prehodit otvaranie dovnutra/von",
    handednessToLeft: "Prehodit na lave okno",
    handednessToRight: "Prehodit na prave okno",
    sideToInward: "Prehodit otvaranie dovnutra",
    sideToOutward: "Prehodit otvaranie von"
  });

  appendOpeningHandleRows(props, section, params, apply);

  appendOpeningMaterialRow(props, section, params, WINDOW_MATERIAL_OPTIONS, apply);
}

export function mountWindowPlacementPropsPanel(ctx: WindowPlacementPropsContext) {
  const { props, params } = ctx;
  props.setTitle("Okno - vlozenie");
  const s = props.section();
  const info = createMutedText("");
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

  const wallInfo = createMutedText("");
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
        ctx.recordActivity?.("Window updated");
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
  appendOpeningNumberRows(
    props,
    section,
    params,
    [
      { label: "Sirka (mm)", key: "widthMm" },
      { label: "Vyska (mm)", key: "heightMm" },
      ...(options.includeCenter ? [{ label: "Poloha na stene (mm)", key: "centerMm" as const }] : []),
      { label: "Sirka ramu (mm)", key: "frameWidthMm" },
      { label: "Odsadenie kridla (mm)", key: "offsetFromInteriorMm" },
      { label: "Hrubka kridla (mm)", key: "panelThicknessMm" },
      { label: "Uhol otvorenia", key: "swingAngleDeg" }
    ],
    apply
  );

  appendOpeningSwingRows(props, section, params, apply, {
    controlsRow: "Sipky",
    directionRow: "Otvaranie",
    sideRow: "Smer",
    handednessButton: "Prehodit lave/prave dvere",
    sideButton: "Prehodit otvaranie dovnutra/von",
    handednessToLeft: "Prehodit na lave dvere",
    handednessToRight: "Prehodit na prave dvere",
    sideToInward: "Prehodit otvaranie dovnutra",
    sideToOutward: "Prehodit otvaranie von",
    includeButtonAriaLabel: true
  });

  appendOpeningHandleRows(props, section, params, apply);

  appendOpeningMaterialRow(props, section, params, DOOR_MATERIAL_OPTIONS, apply, {
    normalize: (value) => getDoorMaterialOption(value).id
  });
}

export function mountDoorPlacementPropsPanel(ctx: DoorPlacementPropsContext) {
  const { props, params } = ctx;
  props.setTitle("Dvere - vlozenie");
  const s = props.section();
  const info = createMutedText("");
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

  const wallInfo = createMutedText("");
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
        ctx.recordActivity?.("Door updated");
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

    const height = createInputElement("number", String(params.heightMm), { step: "1" });
    props.row(s, "Výška úrovne (mm)", height);

    const thickness = createInputElement("number", String(params.thicknessMm), { step: "1" });
    props.row(s, "Hrúbka (mm)", thickness);

    const mat = createSelectElement(
      params.materialId ?? floorDefault.materialId,
      getAllMaterials().map((material: { id: string | number; name: string }) => ({ value: material.id, label: material.name }))
    );
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

    const file = createFileInputElement(".png,.pdf,image/png,application/pdf");
    props.row(s, "Upload", file);

    const opacity = createRangeElement(String(underlayState.opacity), { min: "0", max: "1", step: "0.01" });
    props.row(s, "Opacity", opacity);
    S.underlayOpacityEl = opacity;

    const scale = createInputElement("number", String(underlayState.scale), { step: "0.01" });
    props.row(s, "Scale", scale);
    setUnderlayScaleEl(scale);
    S.underlayScaleEl = scale;

    const rot = createInputElement("number", String(underlayState.rotationDeg), { step: "1" });
    props.row(s, "Rotation °", rot);
    S.underlayRotEl = rot;

    const offX = createInputElement("number", String(underlayState.offsetMm.x), { step: "1" });
    props.row(s, "Offset X", offX);
    setUnderlayOffXEl(offX);
    S.underlayOffXEl = offX;

    const offZ = createInputElement("number", String(underlayState.offsetMm.z), { step: "1" });
    props.row(s, "Offset Z", offZ);
    setUnderlayOffZEl(offZ);
    S.underlayOffZEl = offZ;

    const known = createInputElement("number", String(underlayCal.knownMm), { step: "1" });
    props.row(s, "Calibrate mm", known);

    const pinned = createCheckboxElement(underlayState.pinned);
    props.row(s, "Pinned", pinned);

    const actions = document.createElement("div");
    actions.className = "actions";
    const calibrateBtn = createButtonElement("Calibrate");
    const resetScaleBtn = createButtonElement("Reset scale");
    const clearBtn = createButtonElement("Remove");
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

    const rot = createInputElement("number", String(Math.round((inst.root.rotation.y * 180) / Math.PI)), { step: "1" });
    props.row(rowHost, "Rotation (deg)", rot);

    const pinned = createCheckboxElement(pinnedInstanceIds.has(inst.id));
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
      createResolvedModuleControls(editorHost, modulePackage, inst.params, {
        ...worktopArgs,
        onChange,
        textInputCommitMode: "explicit",
        commitBoundary: args.propertiesEl,
        createParameterPreset: async ({ modulePackage: activePackage, parameters, name, note }) => {
          const response = await fetch(`/api/modules/${encodeURIComponent(activePackage.module.modulePackageId)}/parameter-presets`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, note, parameters })
          });
          const payload = await response.json().catch(() => null) as {
            ok?: boolean;
            error?: string;
            modulePackage?: FurnQuoteModulePackage;
            catalogModule?: ClientCatalog["modules"][number];
            preset?: { presetId?: string };
          } | null;
          if (!response.ok || !payload?.ok || !payload.modulePackage || !payload.preset?.presetId) {
            throw new Error(payload?.error || "Preset save failed.");
          }
          Object.assign(activePackage, payload.modulePackage);
          if (payload.catalogModule) {
            const moduleIndex = ctx.clientCatalog.modules.findIndex((module) =>
              module.modulePackageId === payload.catalogModule?.modulePackageId ||
              module.moduleType === payload.catalogModule?.moduleType
            );
            if (moduleIndex >= 0) ctx.clientCatalog.modules[moduleIndex] = payload.catalogModule;
            else ctx.clientCatalog.modules.push(payload.catalogModule);
          }
          inst.params.packageHash = payload.modulePackage.integrity.packageHash;
          return { modulePackage: payload.modulePackage, presetId: payload.preset.presetId };
        }
      });
    }

    appendLinkedMeasureInputs(s, { kind: "module", instanceId: inst.id });

}

export function mountMultiModulePropsPanel(ctx: ModulePropsContext, ids: Iterable<string>) {
  const { findInstance, showNoProps, props, commitHistory, S, mountProps, modulePackages, args, rebuildInstance } = ctx;
  const selected = Array.from(ids)
    .map((id) => findInstance(id))
    .filter((inst): inst is LayoutInstance => Boolean(inst));
  if (selected.length === 0) return showNoProps();
  if (selected.length === 1) return mountModulePropsPanel(ctx, selected[0].id);

  props.setTitle(`Modules (${selected.length})`);
  const section = props.section();
  const info = document.createElement("div");
  info.className = "muted";
  info.textContent = selected.map((inst) => inst.id).join(", ");
  section.appendChild(info);

  const packageByInstance = new Map<LayoutInstance, FurnQuoteModulePackage | null>();
  for (const inst of selected) packageByInstance.set(inst, findModulePackageForParams(modulePackages, inst.params));
  const firstPackage = packageByInstance.get(selected[0]) ?? null;
  const samePackage = !!firstPackage && selected.every((inst) => packageByInstance.get(inst)?.module.modulePackageId === firstPackage.module.modulePackageId);

  const editorHost = document.createElement("div");
  editorHost.style.marginTop = "10px";
  section.appendChild(editorHost);

  if (!samePackage || !firstPackage) {
    const mixed = document.createElement("div");
    mixed.className = "muted";
    mixed.textContent = "Vybrane moduly nemaju rovnaky parameter package. Spolocna editacia parametrov je dostupna pre rovnaky typ modulu.";
    editorHost.appendChild(mixed);
    return;
  }

  const aggregate = structuredClone(selected[0].params) as Record<string, unknown>;
  const mixedKeys = new Set<string>();
  for (const parameter of firstPackage.parameters.parameters) {
    const firstValue = selected[0].params[parameter.key];
    const isMixed = selected.some((inst) => inst.params[parameter.key] !== firstValue);
    if (!isMixed) {
      aggregate[parameter.key] = firstValue;
      continue;
    }
    mixedKeys.add(parameter.key);
    if (parameter.type === "boolean") aggregate[parameter.key] = false;
    else aggregate[parameter.key] = "";
  }

  const worktopArgs = { getWorktopThicknessMm: () => 0, clientCatalog: ctx.clientCatalog };
  const onChange = (_previousParams?: ModuleParams, sourceKey?: string) => {
    if (!sourceKey) return false;
    const nextValue = aggregate[sourceKey];
    const previous = selected.map((inst) => ({ inst, params: structuredClone(inst.params) }));
    for (const inst of selected) {
      (inst.params as Record<string, unknown>)[sourceKey] = nextValue;
      const accepted = rebuildInstance(inst, {
        previousParams: previous.find((item) => item.inst === inst)?.params,
        preserveBackAnchor: true,
        sourceKey
      });
      if (!accepted) {
        for (const item of previous) {
          item.inst.params = item.params;
          rebuildInstance(item.inst, { skipLayoutValidation: true });
        }
        return false;
      }
    }
    commitHistory(S);
    mountProps();
    return true;
  };

  createResolvedModuleControls(editorHost, firstPackage, aggregate, {
    ...worktopArgs,
    onChange,
    textInputCommitMode: "explicit",
    commitBoundary: args.propertiesEl
  });

  for (const key of mixedKeys) {
    const parameter = firstPackage.parameters.parameters.find((item) => item.key === key) ?? null;
    const label = parameter ? parameter.label : key;
    const rows = Array.from(editorHost.querySelectorAll<HTMLElement>(".module-package-control"));
    const row = rows.find((item) => item.textContent?.includes(label) || item.textContent?.includes(key));
    const input = row?.querySelector<HTMLInputElement | HTMLSelectElement>("input, select") ?? null;
    if (!input) continue;
    if (input instanceof HTMLInputElement && input.type !== "checkbox") input.placeholder = "rozdielne";
    input.title = "rozdielne";
  }
}
