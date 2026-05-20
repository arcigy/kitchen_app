import * as THREE from "three";
import type { AppState } from "../layout/appState";
import type { AlignPickedLine, KitchenWorktopJustification, WallParams } from "./localTypes";
import type { MeasureState } from "./measureTools";
import {
  applyWallTypeToParams,
  CUSTOM_WALL_TYPE_ID,
  getWallTypeName,
  resolveWallTypeId,
  WALL_TYPE_PRESETS
} from "./wallTypes";

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
    const typeSelect = document.createElement("select");
    typeSelect.innerHTML = [
      `<option value="${CUSTOM_WALL_TYPE_ID}">Vlastna</option>`,
      ...WALL_TYPE_PRESETS.map((preset) => `<option value="${preset.id}">${preset.name}</option>`)
    ].join("");
    typeSelect.value = resolveWallTypeId(wallDefault);
    props.row(s, "Typ steny", typeSelect);
    const th = document.createElement("input");
    th.type = "number";
    th.step = "1";
    th.value = String(wallDefault.thicknessMm);
    props.row(s, "Thickness (mm)", th);
    const height = document.createElement("input");
    height.type = "number";
    height.step = "1";
    height.value = String(wallDefault.heightMm);
    props.row(s, "Height (mm)", height);
    const just = document.createElement("select");
    just.innerHTML = `
      <option value="center">Center</option>
      <option value="interior">Finish face: interior</option>
      <option value="exterior">Finish face: exterior</option>
    `;
    just.value = wallDefault.justification ?? "center";
    props.row(s, "Justification", just);
    const flip = document.createElement("button");
    flip.type = "button";
    flip.textContent = "Flip exterior";
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
    const hint = document.createElement("div");
    hint.className = "muted";
    hint.textContent = "Klikni 2 body v 2D. Shift = bez axis snap. Esc = stop chain.";
    s.appendChild(hint);
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

    const just = document.createElement("select");
    just.innerHTML = `
      <option value="center">Center</option>
      <option value="back">Back edge</option>
      <option value="front">Front edge</option>
    `;
    just.value = kitchenWorktopDraw.justification;
    props.row(section, "Justification", just);

    const depth = document.createElement("div");
    depth.textContent = `${S.kitchenCtx.worktopDepthMm} mm`;
    props.row(section, "Depth", depth);

    const thickness = document.createElement("div");
    thickness.textContent = `${S.kitchenCtx.worktopThicknessMm} mm`;
    props.row(section, "Thickness", thickness);

    const height = document.createElement("div");
    height.textContent = `${S.kitchenCtx.heightMm} mm`;
    props.row(section, "Top Height", height);

    const material = document.createElement("div");
    material.textContent = getMaterialDefinitionById(S.kitchenCtx.worktopMaterialId)?.displayName ?? S.kitchenCtx.worktopMaterialId;
    props.row(section, "Material", material);

    const hint = document.createElement("div");
    hint.className = "muted";
    hint.textContent =
      "Click worktop shape points. Continue through more corners for L/U shapes. Esc confirms the finished shape. Space mirrors the worktop around the same back/front line.";
    section.appendChild(hint);

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
    const hint = document.createElement("div");
    hint.className = "muted";
    hint.textContent = "Click the reference line, then the second parallel line (the wall moves or its end is adjusted). Esc = cancel.";
    s.appendChild(hint);
    const cur = document.createElement("div");
    cur.className = "muted";
    cur.style.marginTop = "8px";
    cur.textContent = alignState.ref ? `Reference: ${alignState.ref.label}` : "Reference: (none)";
    s.appendChild(cur);
  
}

export function mountTrimToolPropsPanel(ctx: TrimToolPropsContext) {
  const { props, trimState } = ctx;
    props.setTitle("Trim / Extend");
    const s = props.section();
    const hint = document.createElement("div");
    hint.className = "muted";
    hint.textContent = "Click the target wall, then click the boundary wall or line. The nearest end trims or extends to the intersection. Esc = back.";
    s.appendChild(hint);

    const step = document.createElement("div");
    step.className = "muted";
    step.style.marginTop = "8px";
    step.textContent = trimState.step === "pickTarget" ? "Step: select target" : "Step: select cut";
    s.appendChild(step);

    const cur = document.createElement("div");
    cur.className = "muted";
    cur.style.marginTop = "6px";
    cur.textContent = trimState.targetPick ? `Target: ${trimState.targetPick.label}` : "Target: (none)";
    s.appendChild(cur);
  
}

export function mountMeasureToolPropsPanel(ctx: MeasureToolPropsContext) {
  const { props, measureState, args, formatMm, clearAllMeasurements, setUnderlayStatus, mountProps } = ctx;
    props.setTitle("Measure");
    const s = props.section();

    const hint = document.createElement("div");
    hint.className = "muted";
    hint.textContent =
      "Works in 2D and 3D. Click the first snap point or edge. For the second point, 2D also enables perpendicular snap to edges. Hold Shift for normal guide mode. Esc exits the tool, Shift+Esc clears saved measurements.";
    s.appendChild(hint);

    const axisWrap = document.createElement("label");
    axisWrap.style.display = "flex";
    axisWrap.style.alignItems = "center";
    axisWrap.style.gap = "8px";
    axisWrap.style.marginTop = "10px";
    const axis = document.createElement("input");
    axis.type = "checkbox";
    axis.checked = measureState.axisLock;
    axis.addEventListener("change", () => {
      measureState.axisLock = axis.checked;
      args.axisLockEl.checked = axis.checked;
    });
    axisWrap.append(axis, document.createTextNode("Axis lock (optional, 2D/3D)"));
    s.appendChild(axisWrap);

    const status = document.createElement("div");
    status.className = "muted";
    status.style.marginTop = "8px";
    status.textContent = measureState.firstPoint
      ? `First point: ${formatMm(measureState.firstPoint)}`
      : "First point: (none)";
    s.appendChild(status);

    const clearBtn = document.createElement("button");
    clearBtn.type = "button";
    clearBtn.textContent = "Clear";
    clearBtn.style.marginTop = "10px";
    clearBtn.addEventListener("click", () => {
      clearAllMeasurements();
      setUnderlayStatus("Measure: click first point.");
      mountProps();
    });
    s.appendChild(clearBtn);
  
}
