import type { ClientCatalog } from "../core/catalog/catalog-types";
import type { ModuleParams } from "../model/cabinetTypes";
import { explicitLegCounts } from "../modules/fwmFurniture/legLayout";
import { getManufacturingAssembly } from "../modules/fwmFurniture/manufacturingParts";
import type { FwmFurnitureParams } from "../modules/fwmFurniture/types";
import { getKitchenModuleRole } from "../layout/kitchenModuleRules";

export function mountModuleHardwareControls(host: HTMLElement, catalog: ClientCatalog, getParams: () => ModuleParams,
  change: (params: ModuleParams, key: string) => boolean) {
  const section = document.createElement("fieldset"); section.dataset.moduleHardwareControls = "true";
  const legend = document.createElement("legend"); legend.textContent = "Nohy a závesné kovanie"; section.append(legend);
  const inputs = new Map<string, { input: HTMLInputElement; row: HTMLLabelElement }>();
  for (const [key, label] of [["legCountTotal", "Počet nôh celkom"], ["legCountFront", "Z toho predné"], ["hangingBracketCount", "Počet závesov"]] as const) {
    const row = document.createElement("label"); row.className = "module-package-control";
    row.textContent = label;
    const input = document.createElement("input"); input.type = "number"; input.min = "0"; input.step = "1";
    input.setAttribute("aria-label", label); input.dataset.hardwareCount = key;
    row.append(input); section.append(row); inputs.set(key, { input, row });
    input.addEventListener("change", () => {
      const next = { ...getParams() };
      try {
        const value = Number(input.value);
        if (!input.value.trim() || !Number.isSafeInteger(value) || value < 0) throw new Error("Zadajte celé nezáporné číslo.");
        if (key === "hangingBracketCount") next[key] = value;
        else {
          next.legCountTotal = Number(inputs.get("legCountTotal")!.input.value);
          next.legCountFront = Number(inputs.get("legCountFront")!.input.value);
          explicitLegCounts(next);
        }
        if (!change(next, key)) throw new Error("Nastavenie sa nepodarilo použiť.");
        error.textContent = ""; sync();
      } catch (failure) { error.textContent = failure instanceof Error ? failure.message : "Neplatný počet."; }
    });
  }
  const summary = document.createElement("small"); summary.dataset.hardwareCountSummary = "true"; section.append(summary);
  const reset = document.createElement("button"); reset.type = "button"; reset.textContent = "Obnoviť automatiku";
  reset.addEventListener("click", () => {
    const next = { ...getParams() }; delete next.legCountTotal; delete next.legCountFront; delete next.hangingBracketCount;
    if (change(next, "legCountTotal")) { error.textContent = ""; sync(); }
  }); section.append(reset);
  const error = document.createElement("small"); error.setAttribute("role", "alert"); section.append(error); host.append(section);
  function sync() {
    const params = getParams();
    const hasLegs = Number(params.plinthHeight) > 0;
    const isUpper = params.wallMounted === true || getKitchenModuleRole(params) === "upper";
    section.hidden = !hasLegs && !isUpper;
    for (const [key, { row }] of inputs) row.hidden = key === "hangingBracketCount" ? !isUpper : !hasLegs;
    if (section.hidden) return;
    const explicit = explicitLegCounts(params);
    const assembly = hasLegs ? getManufacturingAssembly(params as FwmFurnitureParams, catalog) : null;
    inputs.get("legCountTotal")!.input.value = String(explicit?.total ?? assembly?.hardware.leg ?? 0);
    inputs.get("legCountFront")!.input.value = String(explicit?.front ?? assembly?.clips.front ?? 0);
    inputs.get("hangingBracketCount")!.input.value = String(params.hangingBracketCount ?? 2);
    summary.textContent = assembly ? `Zadné nohy: ${explicit?.rear ?? Math.max(0, assembly.hardware.leg - assembly.clips.front)} · Klipy predné: ${assembly.clips.front}, bočné: ${assembly.clips.side}, spolu: ${assembly.clips.total}` : "Predvolene dva závesy na jednu skrinku.";
    reset.disabled = !explicit && params.hangingBracketCount === undefined;
  }
  sync(); return { sync };
}
