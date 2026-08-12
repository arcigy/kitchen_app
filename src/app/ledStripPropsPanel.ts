import type { ClientCatalog } from "../core/catalog/catalog-types";
import type { AppState } from "../layout/appState";
import { translateLedStripGroupHeight, type LedStripPointMm } from "../layout/ledStripTypes";
import { offsetLedStripPolyline } from "../layout/ledStripEditing";
import type { PropertiesPanelApi } from "./toolPropsPanels";
import { createInputElement, createSelectElement, createTextElement } from "./propsPanelElements";

export type LedStripPropsPanelContext = {
  props: PropertiesPanelApi;
  S: AppState;
  groupId: string | null;
  selectedPick: { groupId: string; runId: string; pointIndex: number | null; segmentIndex: number | null } | null;
  drawPoint: LedStripPointMm | null;
  catalog: ClientCatalog;
  commitHistory: (state: AppState) => void;
  refresh: () => void;
  mountProps: () => void;
  addVertical: (direction: "up" | "down", lengthMm: number) => boolean;
  moveSelectedTo: (point: LedStripPointMm) => boolean;
};

/** Properties are group-owned so automatic multi-run strips remain one material line. */
export function mountLedStripPropsPanel(ctx: LedStripPropsPanelContext): boolean {
  const group = ctx.groupId ? ctx.S.ledStripGroups.find((item) => item.id === ctx.groupId) ?? null : null;
  if (!group) {
    if (!ctx.drawPoint) return false;
    ctx.props.setTitle("LED pásik");
    const vertical = ctx.props.section();
    const direction = createSelectElement("up", [{ value: "up", label: "Hore" }, { value: "down", label: "Dole" }]);
    const length = createInputElement("number", "300", { min: "1", step: "1" });
    ctx.props.row(vertical, "Vertikálny pásik", direction);
    ctx.props.row(vertical, "Dĺžka (mm)", length);
    length.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      if (ctx.addVertical(direction.value === "down" ? "down" : "up", Math.round(Number(length.value)))) event.preventDefault();
    });
    return true;
  }
  ctx.props.setTitle("LED pásik");
  const section = ctx.props.section();
  const name = createInputElement("text", group.params.name);
  ctx.props.row(section, "Názov skupiny", name);
  const height = createInputElement("number", String(group.params.heightMm), { step: "1" });
  ctx.props.row(section, "Výška (mm)", height);
  const offset = createInputElement("number", String(group.params.offsetMm), { step: "1" });
  ctx.props.row(section, "Offset od steny (mm)", offset);
  const width = createInputElement("number", String(group.params.profileWidthMm ?? ""), { min: "1", step: "1", placeholder: "napr. 10" });
  ctx.props.row(section, "Šírka profilu (mm)", width);
  const lighting = ctx.catalog.components.filter((component) => component.componentType === "lighting");
  const component = createSelectElement(group.params.lightingComponentId ?? "", [
    { value: "", label: "Nepriradený LED produkt" },
    ...lighting.map((item) => ({ value: item.id, label: item.displayName }))
  ]);
  ctx.props.row(section, "LED produkt", component);
  ctx.props.row(section, "Režim", createTextElement(group.params.mode));
  ctx.props.row(section, "Počet línií", createTextElement(String(group.runs.length)));

  const commit = () => { ctx.refresh(); ctx.commitHistory(ctx.S); ctx.mountProps(); };
  name.addEventListener("change", () => { group.params.name = name.value.trim() || group.params.name; commit(); });
  height.addEventListener("change", () => {
    const value = Math.round(Number(height.value));
    if (!Number.isFinite(value)) return;
    const index = ctx.S.ledStripGroups.indexOf(group);
    ctx.S.ledStripGroups[index] = translateLedStripGroupHeight(group, value);
    commit();
  });
  offset.addEventListener("change", () => {
    const value = Math.round(Number(offset.value));
    if (!Number.isFinite(value)) return;
    if (group.params.mode === "underUpper") {
      const delta = value - group.params.offsetMm;
      group.runs = group.runs.map((run) => ({ ...run, points: offsetLedStripPolyline(run.points, delta) }));
    }
    group.params.offsetMm = value;
    commit();
  });
  width.addEventListener("change", () => { const value = Math.round(Number(width.value)); group.params.profileWidthMm = Number.isFinite(value) && value > 0 ? value : null; commit(); });
  component.addEventListener("change", () => { group.params.lightingComponentId = component.value || null; commit(); });

  const picked = ctx.selectedPick?.groupId === group.id ? ctx.selectedPick : null;
  const selectedRun = picked ? group.runs.find((run) => run.id === picked.runId) : null;
  const selectedPoint = selectedRun && picked
    ? picked.pointIndex != null ? selectedRun.points[picked.pointIndex] : picked.segmentIndex != null ? selectedRun.points[picked.segmentIndex] : null
    : null;
  if (selectedPoint) {
    const edit = ctx.props.section();
    const kind = picked!.pointIndex != null ? "bod" : "segment";
    ctx.props.row(edit, "Vybrané", createTextElement(kind));
    const x = createInputElement("number", String(selectedPoint.x), { step: "1" });
    const y = createInputElement("number", String(selectedPoint.y), { step: "1" });
    const z = createInputElement("number", String(selectedPoint.z), { step: "1" });
    const align = () => {
      const target = { x: Math.round(Number(x.value)), y: Math.round(Number(y.value)), z: Math.round(Number(z.value)) };
      if (![target.x, target.y, target.z].every(Number.isFinite)) return;
      ctx.moveSelectedTo(target);
    };
    ctx.props.row(edit, "Zarovnať X (mm)", x);
    ctx.props.row(edit, "Zarovnať Y (mm)", y);
    ctx.props.row(edit, "Zarovnať Z (mm)", z);
    x.addEventListener("change", align);
    y.addEventListener("change", align);
    z.addEventListener("change", align);
  }

  if (group.params.mode === "custom") {
    const vertical = ctx.props.section();
    const direction = createSelectElement("up", [{ value: "up", label: "Hore" }, { value: "down", label: "Dole" }]);
    const length = createInputElement("number", "300", { min: "1", step: "1" });
    ctx.props.row(vertical, "Vertikálny pásik", direction);
    ctx.props.row(vertical, "Dĺžka (mm)", length);
    length.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      if (ctx.addVertical(direction.value === "down" ? "down" : "up", Math.round(Number(length.value)))) event.preventDefault();
    });
  }
  return true;
}
