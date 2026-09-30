import { catalogLaborCurrency, type ModuleLaborState } from "../core/project-manufacturing/module-labor";
import { normalizeProjectManufacturingSettings, resolvePreassemblyRate, type ProjectManufacturingSettings } from "../core/project-manufacturing/project-manufacturing-types";
import type { ClientCatalog } from "../core/catalog/catalog-types";
import type { LayoutInstance } from "../layout/appState";
import type { KitchenContext } from "../layout/kitchenContext";
import { calculateModuleBOM } from "../layout/bom/calculateBOM";

/** Read-only migration preview. Persist it only when a user edits labor or applies a preset. */
export function legacyModuleLaborState(instance: LayoutInstance, kitchen: KitchenContext, catalog: ClientCatalog, value?: ProjectManufacturingSettings): ModuleLaborState {
  const settings = normalizeProjectManufacturingSettings(value);
  if (settings.pricingMode === "legacy") {
    try {
      const result = calculateModuleBOM(instance, kitchen, catalog);
      return { schemaVersion: 1, inherited: { source: "legacy", rate: { amount: result.pricing.laborCostFixed / result.quoteBom.moduleInstance.quantity, currency: result.pricing.priceInputs.currency } } };
    } catch {
      // Missing legacy catalog data must not prevent opening cabinet properties.
      return { schemaVersion: 1, inherited: { source: "legacy", rate: null } };
    }
  }
  const inheritedSettings = { ...settings, preassemblyByInstanceId: {} };
  const inherited = resolvePreassemblyRate(inheritedSettings, instance.id, instance.params.type, typeof instance.params.presetId === "string" ? instance.params.presetId : undefined);
  const quantity = Math.max(1, Number(instance.params.quantity) || 1);
  const rate = inherited.amount == null ? null : { amount: inherited.amount / quantity, currency: catalogLaborCurrency(catalog) };
  const own = settings.preassemblyByInstanceId[instance.id];
  return { schemaVersion: 1, inherited: { source: inherited.source === "instance" ? "module" : inherited.source, rate }, ...(typeof own === "number" ? { override: { amount: own / quantity, currency: catalogLaborCurrency(catalog) } } : {}) };
}
