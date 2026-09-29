import { convertPriceCurrency, isPriceCurrency, type PriceCurrency } from "../pricing/currency";
import type { ClientCatalog } from "../catalog/catalog-types";
import type { FurnQuoteModulePackage, ModuleParameterPreset } from "../module-package/module-package-types";

export type LaborRate = { amount: number; currency: PriceCurrency };
export type PresetLaborSnapshot = {
  modulePackageId: string;
  presetId: string;
  label: string;
  packageVersion: string;
  packageHash: string;
};
/** Captured per cabinet: library edits must never rewrite an existing offer. */
export type ModuleLaborState = {
  schemaVersion: 1;
  inherited: { source: "preset" | "module" | "missing" | "legacy"; rate: LaborRate | null };
  preset?: PresetLaborSnapshot;
  override?: LaborRate;
};

const object = (value: unknown): value is Record<string, unknown> => !!value && typeof value === "object" && !Array.isArray(value);

export function validateLaborRate(value: unknown): asserts value is LaborRate {
  if (!object(value) || typeof value.amount !== "number" || !Number.isFinite(value.amount)
    || value.amount < 0 || value.amount > 10_000_000 || !isPriceCurrency(value.currency)) {
    throw new Error("Práca musí byť nezáporná suma do 10 000 000 v EUR alebo CZK.");
  }
}

export function readModuleLabor(value: unknown): ModuleLaborState | undefined {
  if (value === undefined) return undefined;
  if (!object(value) || value.schemaVersion !== 1 || !object(value.inherited)
    || !["preset", "module", "missing", "legacy"].includes(String(value.inherited.source))) {
    throw new Error("Neplatné uložené nastavenie práce skrinky.");
  }
  if (value.inherited.rate !== null) validateLaborRate(value.inherited.rate);
  if (value.override !== undefined) validateLaborRate(value.override);
  if (value.preset !== undefined) {
    if (!object(value.preset) || ["modulePackageId", "presetId", "label", "packageVersion", "packageHash"]
      .some(key => typeof value.preset === "object" && value.preset !== null
        && (typeof (value.preset as Record<string, unknown>)[key] !== "string" || !(value.preset as Record<string, string>)[key]?.trim()))) {
      throw new Error("Neplatná identita presetu práce.");
    }
  }
  return value as ModuleLaborState;
}

export function catalogLaborCurrency(catalog: ClientCatalog): PriceCurrency {
  return isPriceCurrency(catalog.priceList?.currency) ? catalog.priceList?.currency : "EUR";
}

export function capturePresetLabor(pkg: FurnQuoteModulePackage, preset: ModuleParameterPreset, catalog: ClientCatalog): ModuleLaborState {
  const moduleAmount = catalog.manufacturing?.preassemblyByModuleType[pkg.module.moduleType];
  const rate = preset.laborRate ?? (typeof moduleAmount === "number"
    ? { amount: moduleAmount, currency: catalogLaborCurrency(catalog) } : null);
  if (rate) validateLaborRate(rate);
  return {
    schemaVersion: 1,
    preset: {
      modulePackageId: pkg.module.modulePackageId, presetId: preset.presetId, label: preset.label,
      packageVersion: pkg.module.version,
      packageHash: pkg.integrity.packageHash ?? pkg.integrity.updatedAt
    },
    inherited: { source: preset.laborRate ? "preset" : rate ? "module" : "missing", rate: rate ? structuredClone(rate) : null }
  };
}

export function effectiveModuleLabor(state: ModuleLaborState): { source: "instance" | ModuleLaborState["inherited"]["source"]; rate: LaborRate | null } {
  return state.override ? { source: "instance", rate: state.override } : state.inherited;
}

export function moduleLaborAmount(rate: LaborRate, quantity: number, currency: PriceCurrency): number {
  validateLaborRate(rate);
  if (!Number.isSafeInteger(quantity) || quantity < 1) throw new Error("Počet skriniek musí byť kladné celé číslo.");
  const result = Math.round((convertPriceCurrency(rate.amount, rate.currency, currency) * quantity + Number.EPSILON) * 100) / 100;
  if (!Number.isSafeInteger(Math.round(result * 100))) throw new Error("Suma práce je príliš veľká.");
  return result;
}

/** Updates inherited rates only. Explicit cabinet overrides survive a bulk update. */
export function adoptPresetLabor(params: Record<string, unknown>, pkg: FurnQuoteModulePackage, preset: ModuleParameterPreset, catalog: ClientCatalog, preserveOverride = true): void {
  const previous = readModuleLabor(params.moduleLabor);
  const next = capturePresetLabor(pkg, preset, catalog);
  if (preserveOverride && previous?.override) next.override = structuredClone(previous.override);
  params.moduleLabor = next;
}

export function sameLaborPreset(state: ModuleLaborState | undefined, packageId: string, presetId: string): boolean {
  return state?.preset?.modulePackageId === packageId && state.preset.presetId === presetId;
}
