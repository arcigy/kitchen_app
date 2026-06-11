import { planarDistanceMm } from "./sharedUtils";
import type { MeasureState } from "./measureTools";
import type { PlanSnapBinding } from "./planSnap";
import { createInputElement } from "./propsPanelElements";

export type MeasureSelectionTarget =
  | { kind: "wall"; wallId: string }
  | { kind: "module"; instanceId: string }
  | { kind: "floor"; floorId: string }
  | { kind: "kitchenGroup"; groupId: string; instanceIds: Set<string>; worktopIds: Set<string> };

type MeasureEntry = MeasureState["measures"][number];

type MeasureInlineEditorArgs = {
  viewerEl: HTMLElement;
  measureOverlay: HTMLElement;
  measureState: MeasureState;
  getCurrentSelectionTarget: () => MeasureSelectionTarget | null;
  onCommitMeasure: (measureId: string, raw: string, target?: MeasureSelectionTarget | null) => void;
  propsRow: (section: HTMLElement, label: string, inputEl: HTMLElement) => void;
};

export function bindingMatchesMeasureSelectionTarget(binding: PlanSnapBinding, target: MeasureSelectionTarget) {
  switch (target.kind) {
    case "wall":
      return (
        (binding.type === "wallEndpoint" && binding.wallId === target.wallId) ||
        (binding.type === "wallCenterline" && binding.wallId === target.wallId)
      );
    case "module":
      return (
        (binding.type === "moduleVertex" && binding.instanceId === target.instanceId) ||
        (binding.type === "moduleEdge" && binding.instanceId === target.instanceId)
      );
    case "floor":
      return (
        (binding.type === "floorVertex" && binding.floorId === target.floorId) ||
        (binding.type === "floorEdge" && binding.floorId === target.floorId)
      );
    case "kitchenGroup":
      return (
        ((binding.type === "worktopVertex" || binding.type === "worktopEdge") && target.worktopIds.has(binding.worktopId)) ||
        ((binding.type === "moduleVertex" || binding.type === "moduleEdge") && target.instanceIds.has(binding.instanceId))
      );
    default:
      return false;
  }
}

export function getSelectionMeasureBindings(measure: MeasureEntry, target: MeasureSelectionTarget) {
  const aMatches = bindingMatchesMeasureSelectionTarget(measure.aBinding, target);
  const bMatches = bindingMatchesMeasureSelectionTarget(measure.bBinding, target);
  if (aMatches === bMatches) return null;
  return aMatches
    ? { attachedBinding: measure.aBinding, otherBinding: measure.bBinding }
    : { attachedBinding: measure.bBinding, otherBinding: measure.aBinding };
}

export function getLinkedDistanceMeasuresForTarget(measures: MeasureEntry[], target: MeasureSelectionTarget | null) {
  if (!target) return [] as MeasureEntry[];
  return measures.filter((item) => item.kind === "distance" && !!getSelectionMeasureBindings(item, target));
}

export function createMeasureInlineEditor(args: MeasureInlineEditorArgs) {
  const measureInlineInput = createInputElement("text", "", {
    autocomplete: "off",
    id: "measure-inline-value",
    inputMode: "numeric",
    name: "measure-inline-value",
    placeholder: "mm"
  });
  measureInlineInput.setAttribute("aria-label", "Measure value in millimeters");
  measureInlineInput.style.position = "absolute";
  measureInlineInput.style.display = "none";
  measureInlineInput.style.pointerEvents = "auto";
  measureInlineInput.style.zIndex = "12";
  measureInlineInput.style.width = "96px";
  measureInlineInput.style.height = "24px";
  measureInlineInput.style.borderRadius = "8px";
  measureInlineInput.style.border = "1px solid rgba(36, 40, 54, 0.95)";
  measureInlineInput.style.background = "#0f1117";
  measureInlineInput.style.color = "#ffffff";
  measureInlineInput.style.caretColor = "#ffffff";
  measureInlineInput.style.padding = "0 8px";
  measureInlineInput.style.fontSize = "12px";
  measureInlineInput.style.fontWeight = "700";
  measureInlineInput.style.outline = "none";
  measureInlineInput.style.transform = "translate(-50%, -50%)";
  args.measureOverlay.appendChild(measureInlineInput);

  let activeMeasureEditId: string | null = null;
  let activeMeasureEditTarget: MeasureSelectionTarget | null = null;

  const hideInlineInput = () => {
    activeMeasureEditId = null;
    activeMeasureEditTarget = null;
    measureInlineInput.style.display = "none";
  };

  const beginInlineEdit = (measureId: string, anchorEl: HTMLElement) => {
    const measure = args.measureState.measures.find((item) => item.id === measureId && item.kind === "distance") ?? null;
    if (!measure) return;
    const target = args.getCurrentSelectionTarget();
    if (!target || !getSelectionMeasureBindings(measure, target)) return;
    activeMeasureEditId = measureId;
    activeMeasureEditTarget = target;
    measureInlineInput.value = String(Math.round(planarDistanceMm(measure.a, measure.b)));
    measureInlineInput.style.left = anchorEl.style.left;
    measureInlineInput.style.top = anchorEl.style.top;
    measureInlineInput.style.display = "block";
    measureInlineInput.focus();
    measureInlineInput.select();
  };

  const getEditableMeasureEntriesForCurrentSelection = () => {
    const target = args.getCurrentSelectionTarget();
    if (!target) return [] as MeasureEntry[];
    return getLinkedDistanceMeasuresForTarget(args.measureState.measures, target);
  };

  const canEditMeasure = (measureId: string) => {
    return getEditableMeasureEntriesForCurrentSelection().some((measure) => measure.id === measureId);
  };

  const findEditableMeasureLabelAtClientPoint = (clientX: number, clientY: number) => {
    let best: { measureId: string; label: HTMLElement; area: number } | null = null;
    for (const measure of getEditableMeasureEntriesForCurrentSelection()) {
      const label = measure.label;
      if (!label || label.style.display === "none") continue;
      const rect = label.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) continue;
      const area = rect.width * rect.height;
      if (!best || area < best.area) best = { measureId: measure.id, label, area };
    }
    return best;
  };

  const updateMeasureLabelInteractivity = () => {
    const target = args.getCurrentSelectionTarget();
    for (const measure of args.measureState.measures) {
      if (!measure.label) continue;
      const editable = !!(target && measure.kind === "distance" && getSelectionMeasureBindings(measure, target));
      measure.label.style.cursor = editable ? "pointer" : "default";
      measure.label.style.pointerEvents = editable ? "auto" : "none";
      measure.label.style.borderColor = editable ? "rgba(255,255,255,0.75)" : "rgba(255,255,255,0.35)";
      measure.label.style.boxShadow = editable
        ? "0 10px 28px rgba(0,0,0,0.36), 0 0 0 1px rgba(136,247,255,0.45)"
        : "0 8px 24px rgba(0,0,0,0.3)";
    }
    if (activeMeasureEditId && !canEditMeasure(activeMeasureEditId)) hideInlineInput();
  };

  const appendLinkedMeasureInputs = (section: HTMLElement, target: MeasureSelectionTarget | null) => {
    const linkedMeasures = getLinkedDistanceMeasuresForTarget(args.measureState.measures, target);
    if (linkedMeasures.length === 0) return;

    const heading = document.createElement("div");
    heading.className = "muted";
    heading.style.marginTop = "10px";
    heading.textContent = "Linked measures";
    section.appendChild(heading);

    for (const measure of linkedMeasures) {
      const targetForInput = target;
      const input = createInputElement("number", String(Math.round(planarDistanceMm(measure.a, measure.b))), { step: "1" });
      input.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter") {
          args.onCommitMeasure(measure.id, input.value, targetForInput);
          ev.preventDefault();
        }
      });
      input.addEventListener("change", () => args.onCommitMeasure(measure.id, input.value, targetForInput));
      args.propsRow(section, `Measure ${measure.id.replace("measure_", "#")}`, input);
    }
  };

  measureInlineInput.addEventListener("keydown", (ev) => {
    if (ev.key === "Enter") {
      if (activeMeasureEditId) args.onCommitMeasure(activeMeasureEditId, measureInlineInput.value, activeMeasureEditTarget);
      hideInlineInput();
      ev.preventDefault();
      ev.stopPropagation();
      return;
    }
    if (ev.key === "Escape") {
      hideInlineInput();
      ev.preventDefault();
      ev.stopPropagation();
    }
  });

  measureInlineInput.addEventListener("blur", () => {
    if (activeMeasureEditId) args.onCommitMeasure(activeMeasureEditId, measureInlineInput.value, activeMeasureEditTarget);
    hideInlineInput();
  });

  args.viewerEl.addEventListener(
    "pointerdown",
    (ev) => {
      if (ev.button !== 0) return;
      if (measureInlineInput.style.display !== "none" && measureInlineInput.contains(ev.target as Node | null)) return;
      const hit = findEditableMeasureLabelAtClientPoint(ev.clientX, ev.clientY);
      if (!hit) return;
      ev.preventDefault();
      ev.stopPropagation();
      beginInlineEdit(hit.measureId, hit.label);
    },
    true
  );

  return {
    appendLinkedMeasureInputs,
    canEditMeasure,
    hideInlineInput,
    updateMeasureLabelInteractivity
  };
}
