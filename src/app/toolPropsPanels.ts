import * as THREE from "three";
import type { AppState } from "../layout/appState";
import type { AlignPickedLine, KitchenWorktopJustification, WallParams } from "./localTypes";
import type { MeasureState } from "./measureTools";
import { createWallMaterialPicker } from "./wallMaterialPicker";

export type PropertiesPanelApi = {
  setTitle: (title: string) => void;
  section: () => HTMLElement;
  row: (section: HTMLElement, label: string, control: HTMLElement) => void;
};

type WallToolPropsContext = {
  props: PropertiesPanelApi;
  wallDefault: Pick<WallParams, "thicknessMm" | "justification" | "exteriorSign" | "materialId">;
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
    exteriorSign: 1 | -1,
    heightMm?: number,
    materialId?: string
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
    const th = document.createElement("input");
    th.type = "number";
    th.step = "1";
    th.value = String(wallDefault.thicknessMm);
    props.row(s, "Thickness (mm)", th);
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
        wallDefault.exteriorSign ?? 1,
        undefined,
        wallDefault.materialId
      );
    };
    const materialPicker = createWallMaterialPicker({
      value: wallDefault.materialId,
      onChange: (materialId) => {
        wallDefault.materialId = materialId;
        updatePreview();
      }
    });
    props.row(s, "Farba steny", materialPicker);
    const hint = document.createElement("div");
    hint.className = "muted";
    hint.textContent = "Klikni 2 body v 2D. Shift = bez axis snap. Esc = stop chain.";
    s.appendChild(hint);
    th.addEventListener("change", () => {
      wallDefault.thicknessMm = Math.max(10, Number(th.value) || wallDefault.thicknessMm);
      th.value = String(wallDefault.thicknessMm);
      updatePreview();
    });
    just.addEventListener("change", () => {
      wallDefault.justification =
        just.value === "interior" ? "interior" : just.value === "exterior" ? "exterior" : "center";
      updatePreview();
    });
    flip.addEventListener("click", () => {
      wallDefault.exteriorSign = wallDefault.exteriorSign === 1 ? -1 : 1;
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
    props.setTitle("Trim");
    const s = props.section();
    const hint = document.createElement("div");
    hint.className = "muted";
    hint.textContent = "Click the target wall, then click the cutting line. Esc = back.";
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
