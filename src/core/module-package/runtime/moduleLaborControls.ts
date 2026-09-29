import type { ModuleControlsArgs } from "../../../modules/registry";
import type { FurnQuoteModulePackage } from "../module-package-types";
import { capturePresetLabor, catalogLaborCurrency, effectiveModuleLabor, moduleLaborAmount, readModuleLabor, validateLaborRate, type LaborRate, type ModuleLaborState } from "../../project-manufacturing/module-labor";
import type { PriceCurrency } from "../../pricing/currency";

export function createLaborRateInput(label: string, value: LaborRate | null, defaultCurrency: PriceCurrency) {
  const host = document.createElement("label"); host.style.display = "grid"; host.style.gap = "4px";
  const title = document.createElement("span"); title.textContent = label;
  const input = document.createElement("input"); input.type = "number"; input.min = "0"; input.max = "10000000"; input.step = "0.01";
  input.placeholder = "Zdediť sadzbu"; input.value = value ? String(value.amount) : ""; input.setAttribute("aria-label", label);
  const currency = document.createElement("select"); currency.setAttribute("aria-label", `${label} · mena`);
  for (const code of ["EUR", "CZK"]) { const option = document.createElement("option"); option.value = code; option.textContent = code; currency.append(option); }
  currency.value = value?.currency ?? defaultCurrency;
  host.append(title, input, currency);
  return { host, input, currency, read(): LaborRate | null {
    if (!input.value.trim()) { if (input.validity.badInput) throw new Error("Zadajte platnú sumu práce."); return null; }
    const rate = { amount: Number(input.value), currency: currency.value };
    validateLaborRate(rate); return rate;
  } };
}

export function mountModuleLaborControls(host: HTMLElement, pkg: FurnQuoteModulePackage, params: Record<string, unknown>, args: ModuleControlsArgs) {
  const initial = () => readModuleLabor(params.moduleLabor) ?? args.initialLaborState?.();
  const panel = document.createElement("section"); panel.dataset.moduleLabor = "true";
  panel.style.display = "grid"; panel.style.gap = "8px";
  const title = document.createElement("strong"); title.textContent = "Práca za modul";
  const summary = document.createElement("div"); summary.dataset.moduleLaborSummary = "true";
  const own = createLaborRateInput("Vlastná práca za jednu skrinku", initial()?.override ?? null, catalogLaborCurrency(args.clientCatalog));
  own.input.dataset.moduleLaborRate = "true";
  const status = document.createElement("p"); status.setAttribute("role", "status"); status.style.fontSize = "12px";
  const presetArea = document.createElement("details");
  const presetTitle = document.createElement("summary"); presetTitle.textContent = "Práca uložená v presete";
  const presetBody = document.createElement("div"); presetBody.style.display = "grid"; presetBody.style.gap = "8px";
  presetArea.append(presetTitle, presetBody);
  let latest = pkg;
  let generation = 0;
  let busy = false;
  let loading = false;

  function button(text: string, action: () => void | Promise<void>, parent: HTMLElement = panel) {
    const element = document.createElement("button"); element.type = "button"; element.textContent = text;
    element.addEventListener("click", async () => {
      if (busy) return;
      busy = true;
      const buttons = Array.from(panel.querySelectorAll<HTMLButtonElement | HTMLInputElement | HTMLSelectElement>("button, input, select"), button => ({ button, disabled: button.disabled }));
      for (const { button } of buttons) button.disabled = true;
      status.textContent = "";
      try { await action(); } catch (error) { status.textContent = error instanceof Error ? error.message : "Zmenu sa nepodarilo uložiť."; }
      finally { busy = false; for (const { button, disabled } of buttons) if (button.isConnected) button.disabled = disabled; }
    });
    parent.append(element); return element;
  }
  function commit(next: ModuleLaborState | undefined) {
    const previous = structuredClone(params.moduleLabor);
    if (next) params.moduleLabor = next; else delete params.moduleLabor;
    try {
      if (args.onChange() === false) throw new Error("Zmenu práce sa nepodarilo použiť.");
    } catch (error) {
      if (previous === undefined) delete params.moduleLabor; else params.moduleLabor = previous;
      throw error;
    }
    refresh();
  }
  panel.append(title, summary, own.host);
  button("Uložiť pre túto skrinku", () => {
    const rate = own.read();
    const state = structuredClone(initial() ?? { schemaVersion: 1, inherited: { source: "legacy", rate: null } } satisfies ModuleLaborState);
    if (rate) state.override = rate; else delete state.override;
    commit(state); status.textContent = "Zmenená je iba táto skrinka. V rozšírenom editore potvrďte zmenu uložením modulu.";
  });
  button("Obnoviť zdedenú sadzbu", () => {
    const state = initial();
    if (!state) return;
    const next = structuredClone(state); delete next.override; commit(next);
  });
  panel.append(presetArea, status); host.append(panel);

  function refresh(updateInput = true) {
    const state = initial();
    const effective = state ? effectiveModuleLabor(state) : null;
    const quantity = Math.max(1, Math.round(Number(params.quantity) || 1));
    if (updateInput) {
      own.input.value = state?.override ? String(state.override.amount) : "";
      own.currency.value = state?.override?.currency ?? catalogLaborCurrency(args.clientCatalog);
    }
    const source = effective?.source === "instance" ? "Vlastná hodnota" : effective?.source === "preset" ? `Preset ${state?.preset?.label ?? ""}` : effective?.source === "module" ? "Typ modulu" : effective?.source === "missing" ? "Chýbajúca sadzba" : "Pôvodný výpočet projektu";
    summary.textContent = effective?.rate ? `${source}: ${effective.rate.amount.toFixed(2)} ${effective.rate.currency} × ${quantity} = ${moduleLaborAmount(effective.rate, quantity, effective.rate.currency).toFixed(2)} ${effective.rate.currency}` : `${source}. ${quantity} ks. ${effective?.source === "missing" ? "Cena zostáva neúplná." : "Aktuálna suma je v rozpise Marže → Práca."}`;
    presetBody.replaceChildren();
    const ref = state?.preset;
    const preset = ref?.modulePackageId === latest.module.modulePackageId ? latest.parameterPresets?.presets.find(p => p.presetId === ref.presetId) : undefined;
    if (!preset) {
      presetBody.textContent = ref ? "Preset už nie je v knižnici. Uložená sadzba skrinky zostáva zachovaná." : "Vyberte preset, ku ktorému chcete priradiť sadzbu práce.";
      return;
    }
    const captured = capturePresetLabor(latest, preset, args.clientCatalog);
    const newer = JSON.stringify(captured.inherited) !== JSON.stringify(state?.inherited);
    const notice = document.createElement("small"); notice.textContent = newer ? "V presete je dostupná iná sadzba. Prevzatie zmení iba prácu." : "Firemná sadzba platí pre nové použitia presetu vo všetkých projektoch.";
    presetBody.append(notice);
    const rateEditor = createLaborRateInput("Práca za jeden modul v presete", preset.laborRate ?? null, catalogLaborCurrency(args.clientCatalog));
    rateEditor.input.dataset.presetLaborRate = "true"; presetBody.append(rateEditor.host);
    button("Uložiť do presetu", async () => {
      if (!args.presetLaborApi) return;
      generation += 1;
      latest = await args.presetLaborApi.save(latest, preset.presetId, rateEditor.read());
      // Only library metadata is refreshed. A placed cabinet keeps its captured rate.
      pkg.parameterPresets = structuredClone(latest.parameterPresets);
      pkg.integrity = structuredClone(latest.integrity);
      refresh(); status.textContent = "Sadzba je uložená vo firemnom presete. Existujúce skrinky sa nezmenili.";
    }, presetBody).disabled = !args.presetLaborApi;
    button("Prevziať sadzbu z presetu", () => { commit(captured); }, presetBody);
    if (args.adoptPresetLaborForProject) button("Prevziať pre všetky skrinky tohto presetu", () => {
      const count = args.adoptPresetLaborForProject!(latest, preset.presetId);
      refresh(); status.textContent = `Aktualizované skrinky: ${count}. Vlastné sadzby zostali zachované.`;
    }, presetBody);
    button("Načítať aktuálny preset", loadLatest, presetBody).disabled = !args.presetLaborApi;
    if (loading) for (const element of presetBody.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement>("input, button, select")) element.disabled = true;
  }
  async function loadLatest() {
    if (!args.presetLaborApi) return;
    const request = ++generation;
    loading = true;
    for (const element of presetBody.querySelectorAll<HTMLInputElement | HTMLButtonElement | HTMLSelectElement>("input, button, select")) element.disabled = true;
    try {
      const loaded = await args.presetLaborApi.load(pkg.module.modulePackageId);
      if (request === generation) latest = loaded;
    } finally {
      if (request === generation) { loading = false; refresh(false); }
    }
  }
  refresh();
  if (args.presetLaborApi && readModuleLabor(params.moduleLabor)?.preset) void loadLatest().catch(error => { status.textContent = error instanceof Error ? error.message : "Knižnica presetov nie je dostupná."; });
  return { refresh };
}
