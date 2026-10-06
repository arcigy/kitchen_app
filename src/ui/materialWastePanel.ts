import { preservePanelRenderState } from "./panelRenderState";
import { normalizeProjectManufacturingSettings, type ProjectManufacturingSettings } from "../core/project-manufacturing/project-manufacturing-types";
import type { ProjectMarginsView } from "../layout/bom/projectMargins";
import type { ProjectMarginCommitResult, ProjectMarginsPanelHandle } from "./marginsPhasePanel";
import "./materialWastePanel.css";

export type ProjectWasteRates = Pick<ProjectManufacturingSettings, "pricingMode" | "boardWastePercent" | "edgeWastePercent">;

/** A second view of the existing project settings, with no independent saved state. */
export function mountMaterialWastePanel(
  container: HTMLElement,
  initialView: ProjectMarginsView,
  commit: (rates: ProjectWasteRates) => Promise<ProjectMarginCommitResult>
): ProjectMarginsPanelHandle {
  let view = structuredClone(initialView);
  let disabled = !view.editable;
  let pending: Promise<void> | null = null;
  let destroyed = false;
  container.innerHTML = `<section class="material-waste" aria-labelledby="material-waste-heading">
    <div class="material-waste__intro"><h2 id="material-waste-heading">Prerezy</h2>
      <p>Spoločné percentá pre plošné materiály a olepenie. Prerez sa pripočíta k nákladu pred maržou.</p></div>
    <form data-material-waste-form novalidate>
      <div class="material-waste__fields">
        <label>Prerez dosiek <span class="material-waste__input"><input type="text" inputmode="decimal" aria-label="Prerez dosiek (%)" data-material-board-waste /><span>%</span></span></label>
        <label>Prerez hrán <span class="material-waste__input"><input type="text" inputmode="decimal" aria-label="Prerez hrán (%)" data-material-edge-waste /><span>%</span></span></label>
        <button type="submit">Uložiť prerezy</button>
      </div>
      <label class="material-waste__enabled"><input type="checkbox" data-material-waste-enabled /> Používať projektové výrobné sadzby</label>
      <p class="material-waste__mode" data-material-waste-mode></p>
      <p class="material-waste__hint">Rovnaké hodnoty nájdete aj v Maržiach. Nula znamená bez prerezu; prázdne pole znamená nevyplnenú sadzbu. Individuálne sadzby materiálov majú prednosť.</p>
      <details><summary>Ako sa prerez počíta</summary><p>Príklad: materiál 100 + prerez 30 % = náklad 130. Marža 100 % z nákladu je 130, predajná cena 260. Pracovné dosky nakupované po celých alebo polovičných formátoch sa účtujú podľa nákupného formátu.</p></details>
      <p role="status" data-material-waste-status></p><p role="alert" data-material-waste-error hidden></p>
    </form>
  </section>`;
  const form = container.querySelector<HTMLFormElement>("form")!;
  const board = form.querySelector<HTMLInputElement>("[data-material-board-waste]")!;
  const edge = form.querySelector<HTMLInputElement>("[data-material-edge-waste]")!;
  const enabled = form.querySelector<HTMLInputElement>("[data-material-waste-enabled]")!;
  const save = form.querySelector<HTMLButtonElement>("button[type=submit]")!;
  const status = form.querySelector<HTMLElement>("[data-material-waste-status]")!;
  const error = form.querySelector<HTMLElement>("[data-material-waste-error]")!;
  const mode = form.querySelector<HTMLElement>("[data-material-waste-mode]")!;

  const setError = (message: string | null) => { error.textContent = message ?? ""; error.hidden = !message; };
  const updateAvailability = () => {
    for (const input of [board, edge, enabled, save]) input.disabled = disabled || pending !== null;
    save.textContent = pending ? "Ukladám…" : "Uložiť prerezy";
  };
  const updateMode = () => {
    mode.textContent = enabled.checked
      ? "Výrobné sadzby sú zapnuté. Sadzby predmontáže skriniek nastavíte v Maržiach; chýbajúce sadzby označia cenu ako neúplnú."
      : "Zostáva pôvodný výpočet. Tieto percentá sa použijú až po zapnutí výrobných sadzieb a uložení.";
  };
  const restore = () => {
    const rates = normalizeProjectManufacturingSettings(view.settings.manufacturing);
    board.value = rates.boardWastePercent == null ? "" : String(rates.boardWastePercent);
    edge.value = rates.edgeWastePercent == null ? "" : String(rates.edgeWastePercent);
    enabled.checked = rates.pricingMode === "configured";
    board.dataset.committedValue = board.value;
    edge.dataset.committedValue = edge.value;
    enabled.defaultChecked = enabled.checked;
    board.removeAttribute("aria-invalid"); edge.removeAttribute("aria-invalid");
    updateMode(); updateAvailability();
  };
  const rate = (input: HTMLInputElement): number | null | "invalid" => {
    const raw = input.value.trim();
    if (!raw) return null;
    const value = Number(raw.replace(",", "."));
    return Number.isFinite(value) && value >= 0 && /^\d+(?:[.,]\d+)?$/.test(raw) ? value : "invalid";
  };
  const onSubmit = (event: SubmitEvent) => {
    event.preventDefault();
    if (destroyed || disabled || pending) return;
    const boardWastePercent = rate(board), edgeWastePercent = rate(edge);
    board.setAttribute("aria-invalid", String(boardWastePercent === "invalid"));
    edge.setAttribute("aria-invalid", String(edgeWastePercent === "invalid"));
    if (boardWastePercent === "invalid" || edgeWastePercent === "invalid") {
      setError("Zadajte nezáporné percento, napríklad 30 alebo 12,5.");
      (boardWastePercent === "invalid" ? board : edge).focus(); return;
    }
    const rates: ProjectWasteRates = { boardWastePercent, edgeWastePercent, pricingMode: enabled.checked ? "configured" : "legacy" };
    setError(null); status.textContent = "";
    pending = Promise.resolve();
    let operation: Promise<ProjectMarginCommitResult>;
    try { operation = commit(rates); } catch (failure) { operation = Promise.reject(failure); }
    pending = operation.then(result => {
      if (destroyed) return;
      if (result.ok) status.textContent = view.warnings.length || view.summary.missingPriceCount
        ? "Prerezy sú uložené. Cena zostáva neúplná; podrobnosti nájdete v Maržiach."
        : "Prerezy sú uložené. Cena projektu bola prepočítaná.";
      else { setError(result.error ?? "Prerezy sa nepodarilo uložiť."); }
    }).catch(failure => {
      if (!destroyed) { setError(failure instanceof Error ? failure.message : "Prerezy sa nepodarilo uložiť."); }
    }).finally(() => { pending = null; if (!destroyed) updateAvailability(); });
    updateAvailability();
  };
  form.addEventListener("submit", onSubmit);
  enabled.addEventListener("change", updateMode);
  restore();
  return {
    update(next, state = {}) { if (!destroyed) { const restoreDraft = preservePanelRenderState(container); view = structuredClone(next); disabled = state.disabled ?? !view.editable; restore(); restoreDraft(); updateMode(); status.textContent = state.loadingMessage ?? ""; setError(state.error ?? null); } },
    setInputsDisabled(next) { disabled = next; updateAvailability(); },
    setLoading(loading, message) { disabled = loading || !view.editable; status.textContent = loading ? message ?? "Načítavam prerezy…" : ""; updateAvailability(); },
    setGlobalError: setError,
    async flushPending() { await pending; },
    destroy() { destroyed = true; form.removeEventListener("submit", onSubmit); enabled.removeEventListener("change", updateMode); }
  };
}
