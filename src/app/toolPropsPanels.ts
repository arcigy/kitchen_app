import * as THREE from "three";
import type { AppState } from "../layout/appState";
import { reportEditorToolEntryStatus } from "./editorToolEntryController";
import type { AlignPickedLine, KitchenWorktopJustification, WallParams } from "./localTypes";
import type { MeasureState } from "./measureTools";
import {
  applyWallTypeToParams,
  CUSTOM_WALL_TYPE_ID,
  getWallTypeName,
  resolveWallTypeId,
  WALL_TYPE_PRESETS
} from "./wallTypes";
import { appendMutedText, createButtonElement, createCheckboxElement, createInputElement, createMutedText, createSelectElement, createTextElement } from "./propsPanelElements";

export type PropertiesPanelApi = {
  setTitle: (title: string) => void;
  section: () => HTMLElement;
  row: (section: HTMLElement, label: string, control: HTMLElement) => void;
};

type WallToolPropsContext = {
  props: PropertiesPanelApi;
  wallDefault: Pick<WallParams, "typeId" | "thicknessMm" | "heightMm" | "justification" | "exteriorSign" | "materialId">;
  wallDraw: {
    preview: THREE.Mesh | null;
    a: THREE.Vector3 | null;
    hoverB: THREE.Vector3 | null;
  };
  updateWallMeshWithJustification: (
    mesh: THREE.Mesh,
    a: THREE.Vector3,
    b: THREE.Vector3,
    thicknessMm: number,
    justification: NonNullable<WallParams["justification"]>,
    exteriorSign: 1 | -1
  ) => void;
  setUnderlayStatus: (text: string) => void;
};

type KitchenWorktopToolPropsContext = {
  props: PropertiesPanelApi;
  S: AppState;
  kitchenWorktopDraw: { justification: KitchenWorktopJustification };
  scheduleKitchenWorktopPreviewUpdate: () => void;
  getMaterialDefinitionById: (id: string) => { displayName: string } | null | undefined;
};

type AlignToolPropsContext = {
  props: PropertiesPanelApi;
  alignState: { ref: AlignPickedLine | null };
};

type TrimToolPropsContext = {
  props: PropertiesPanelApi;
  trimState: { step: "pickTarget" | "pickCutter"; targetPick: AlignPickedLine | null };
};

type MeasureToolPropsContext = {
  props: PropertiesPanelApi;
  measureState: Pick<MeasureState, "axisLock" | "firstPoint">;
  args: { axisLockEl: HTMLInputElement };
  formatMm: (point: THREE.Vector3) => string;
  clearAllMeasurements: () => void;
  setUnderlayStatus: (text: string) => void;
  mountProps: () => void;
};

export function mountWallToolPropsPanel(ctx: WallToolPropsContext) {
  const { props, wallDefault, wallDraw, updateWallMeshWithJustification, setUnderlayStatus } = ctx;
    props.setTitle("Wall");
    const s = props.section();
    const typeSelect = createSelectElement(resolveWallTypeId(wallDefault), [
      { value: CUSTOM_WALL_TYPE_ID, label: "Vlastna" },
      ...WALL_TYPE_PRESETS.map((preset) => ({ value: preset.id, label: preset.name }))
    ]);
    props.row(s, "Typ steny", typeSelect);
    const th = createInputElement("number", String(wallDefault.thicknessMm), { step: "1" });
    props.row(s, "Thickness (mm)", th);
    const height = createInputElement("number", String(wallDefault.heightMm), { step: "1" });
    props.row(s, "Height (mm)", height);
    const just = createSelectElement(wallDefault.justification ?? "center", [
      { value: "center", label: "Center" },
      { value: "interior", label: "Finish face: interior" },
      { value: "exterior", label: "Finish face: exterior" }
    ]);
    props.row(s, "Justification", just);
    const flip = createButtonElement("Flip exterior");
    flip.style.height = "34px";
    props.row(s, "Exterior", flip);
    const updatePreview = () => {
      if (!wallDraw.preview || !wallDraw.a) return;
      updateWallMeshWithJustification(
        wallDraw.preview,
        wallDraw.a,
        wallDraw.hoverB ?? wallDraw.a,
        wallDefault.thicknessMm,
        wallDefault.justification ?? "center",
        wallDefault.exteriorSign ?? 1
      );
    };
    appendMutedText(s, "Klikni 2 body v 2D. Shift = bez axis snap. Esc = stop chain.");
    typeSelect.addEventListener("change", () => {
      const preset = applyWallTypeToParams(wallDefault, typeSelect.value);
      th.value = String(wallDefault.thicknessMm);
      height.value = String(wallDefault.heightMm);
      just.value = wallDefault.justification ?? "center";
      updatePreview();
      setUnderlayStatus(`Wall type: ${preset?.name ?? getWallTypeName(typeSelect.value)}.`);
    });
    th.addEventListener("change", () => {
      wallDefault.thicknessMm = Math.max(10, Math.round(Number(th.value) || wallDefault.thicknessMm));
      wallDefault.typeId = CUSTOM_WALL_TYPE_ID;
      th.value = String(wallDefault.thicknessMm);
      typeSelect.value = CUSTOM_WALL_TYPE_ID;
      updatePreview();
    });
    height.addEventListener("change", () => {
      wallDefault.heightMm = Math.max(1, Math.round(Number(height.value) || wallDefault.heightMm));
      wallDefault.typeId = CUSTOM_WALL_TYPE_ID;
      height.value = String(wallDefault.heightMm);
      typeSelect.value = CUSTOM_WALL_TYPE_ID;
      updatePreview();
    });
    just.addEventListener("change", () => {
      wallDefault.justification =
        just.value === "interior" ? "interior" : just.value === "exterior" ? "exterior" : "center";
      wallDefault.typeId = CUSTOM_WALL_TYPE_ID;
      typeSelect.value = CUSTOM_WALL_TYPE_ID;
      updatePreview();
    });
    flip.addEventListener("click", () => {
      wallDefault.exteriorSign = wallDefault.exteriorSign === 1 ? -1 : 1;
      wallDefault.typeId = CUSTOM_WALL_TYPE_ID;
      typeSelect.value = CUSTOM_WALL_TYPE_ID;
      updatePreview();
      setUnderlayStatus(`Wall: exterior ${wallDefault.exteriorSign === 1 ? "left" : "right"} of A->B.`);
    });
  
}

export function mountKitchenWorktopToolPropsPanel(ctx: KitchenWorktopToolPropsContext) {
  const { props, S, kitchenWorktopDraw, scheduleKitchenWorktopPreviewUpdate, getMaterialDefinitionById } = ctx;
    props.setTitle("Worktop");
    const section = props.section();

    const just = createSelectElement(kitchenWorktopDraw.justification, [
      { value: "center", label: "Center" },
      { value: "back", label: "Back edge" },
      { value: "front", label: "Front edge" }
    ]);
    props.row(section, "Justification", just);

    const depth = createTextElement(`${S.kitchenCtx.worktopDepthMm} mm`);
    props.row(section, "Depth", depth);

    const thickness = createTextElement(`${S.kitchenCtx.worktopThicknessMm} mm`);
    props.row(section, "Thickness", thickness);

    const height = createTextElement(`${S.kitchenCtx.heightMm} mm`);
    props.row(section, "Top Height", height);

    const material = createTextElement(getMaterialDefinitionById(S.kitchenCtx.worktopMaterialId)?.displayName ?? S.kitchenCtx.worktopMaterialId);
    props.row(section, "Material", material);

    appendMutedText(
      section,
      "Click worktop shape points. Continue through more corners for L/U shapes. Esc confirms the finished shape. Space mirrors the worktop around the same back/front line."
    );

    just.addEventListener("change", () => {
      kitchenWorktopDraw.justification =
        just.value === "front" ? "front" : just.value === "center" ? "center" : "back";
      scheduleKitchenWorktopPreviewUpdate();
    });
  
}

export function mountAlignToolPropsPanel(ctx: AlignToolPropsContext) {
  const { props, alignState } = ctx;
    props.setTitle("Align");
    const s = props.section();
    appendMutedText(s, "Click the reference line, then click one or more parallel lines to align. Esc = new reference, Esc again = exit.");
    const cur = createMutedText(alignState.ref ? `Reference: ${alignState.ref.label}` : "Reference: (none)");
    cur.style.marginTop = "8px";
    s.appendChild(cur);
  
}

export function mountTrimToolPropsPanel(ctx: TrimToolPropsContext) {
  const { props, trimState } = ctx;
    props.setTitle("Trim / Extend");
    const s = props.section();
    appendMutedText(s, "Click the target wall, then click the boundary wall or line. The nearest end trims or extends to the intersection. Esc = back.");

    const step = createMutedText(trimState.step === "pickTarget" ? "Step: select target" : "Step: select cut");
    step.style.marginTop = "8px";
    s.appendChild(step);

    const cur = createMutedText(trimState.targetPick ? `Target: ${trimState.targetPick.label}` : "Target: (none)");
    cur.style.marginTop = "6px";
    s.appendChild(cur);
  
}

export function mountMeasureToolPropsPanel(ctx: MeasureToolPropsContext) {
  const { props, measureState, args, formatMm, clearAllMeasurements, setUnderlayStatus, mountProps } = ctx;
    props.setTitle("Measure");
    const s = props.section();

    appendMutedText(
      s,
      "Works in 2D and 3D. Click the first snap point or edge. For the second point, 2D also enables perpendicular snap to edges. Hold Shift for normal guide mode. Esc exits the tool, Shift+Esc clears saved measurements."
    );

    const axisWrap = document.createElement("label");
    axisWrap.style.display = "flex";
    axisWrap.style.alignItems = "center";
    axisWrap.style.gap = "8px";
    axisWrap.style.marginTop = "10px";
    const axis = createCheckboxElement(measureState.axisLock);
    axis.addEventListener("change", () => {
      measureState.axisLock = axis.checked;
      args.axisLockEl.checked = axis.checked;
    });
    axisWrap.append(axis, document.createTextNode("Axis lock (optional, 2D/3D)"));
    s.appendChild(axisWrap);

    const status = createMutedText(
      measureState.firstPoint ? `First point: ${formatMm(measureState.firstPoint)}` : "First point: (none)"
    );
    status.style.marginTop = "8px";
    s.appendChild(status);

    const clearBtn = createButtonElement("Clear");
    clearBtn.style.marginTop = "10px";
    clearBtn.addEventListener("click", () => {
      clearAllMeasurements();
      reportEditorToolEntryStatus({ setUnderlayStatus, mountProps }, "Measure: click first point.");
    });
    s.appendChild(clearBtn);
  
}
