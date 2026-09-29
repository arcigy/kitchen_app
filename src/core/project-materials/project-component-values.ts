import type { PricingUnit } from "../catalog/catalog-types";
import { convertPriceCurrency, isPriceCurrency, type PriceCurrency } from "../pricing/currency";
import type { ProjectMaterialAssignment } from "./project-material-types";

export type ProjectComponentUnit = "pcs" | "set" | "lm" | "profile";
export type ProjectComponentValues = {
  /** Per one cabinet for a module scope; project extras are charged once. */
  quantity?: number;
  unitPrice?: number;
  currency?: PriceCurrency;
  unit?: ProjectComponentUnit;
  includedInPackage?: boolean;
};

export function validateProjectComponentValues(value: unknown): asserts value is ProjectComponentValues {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Neplatné projektové hodnoty komponentu.");
  const record = value as Record<string, unknown>;
  for (const key of Object.keys(record)) if (!["quantity", "unitPrice", "currency", "unit", "includedInPackage"].includes(key)) throw new Error(`Neznáma hodnota komponentu: ${key}.`);
  for (const key of ["quantity", "unitPrice"]) if (record[key] !== undefined && (typeof record[key] !== "number" || !Number.isFinite(record[key]) || record[key] < 0)) throw new Error("Množstvo a cena musia byť nezáporné konečné čísla.");
  if (record.currency !== undefined && !isPriceCurrency(record.currency)) throw new Error("Nepodporovaná mena.");
  if (record.unitPrice !== undefined && !isPriceCurrency(record.currency)) throw new Error("Vlastná cena vyžaduje menu.");
  if (record.unit !== undefined && !["pcs", "set", "lm", "profile"].includes(String(record.unit))) throw new Error("Nepodporovaná jednotka komponentu.");
  if (record.includedInPackage !== undefined && typeof record.includedInPackage !== "boolean") throw new Error("Neplatný údaj o zahrnutí v balení.");
  if (typeof record.quantity === "number" && record.unit && record.unit !== "lm" && !Number.isSafeInteger(record.quantity)) throw new Error("Kusy, sady a celé profily vyžadujú celé množstvo.");
}

export function projectComponentUnit(assignment: ProjectMaterialAssignment): PricingUnit {
  if (assignment.projectValues?.unit) return assignment.projectValues.unit;
  const bridge = assignment.customValues.supplierBridge;
  const basis = bridge && typeof bridge === "object" && !Array.isArray(bridge) ? bridge.normalizedPriceBasis : undefined;
  if (basis === "set" || basis === "pair") return "set";
  return assignment.snapshots.component?.definition.pricingUnit ?? "pcs";
}

export function projectComponentAmount(assignment: ProjectMaterialAssignment, automaticQuantity: number, moduleQuantity: number, currency: PriceCurrency) {
  const values = assignment.projectValues;
  const snapshot = assignment.snapshots.component;
  const quantity = values?.quantity === undefined ? automaticQuantity : values.quantity * moduleQuantity;
  const unit = projectComponentUnit(assignment);
  const sourcePrice = values?.includedInPackage ? 0 : values?.unitPrice ?? snapshot?.unitPrice;
  const sourceCurrency = values?.includedInPackage ? currency : values?.unitPrice !== undefined ? values.currency : snapshot?.currency;
  const unitPrice = sourcePrice != null && Number.isFinite(sourcePrice) && sourcePrice >= 0 && isPriceCurrency(sourceCurrency)
    ? convertPriceCurrency(sourcePrice, sourceCurrency, currency) : null;
  return { quantity, unit, unitPrice, cost: unitPrice === null || !Number.isFinite(quantity) || quantity < 0 ? null : quantity * unitPrice };
}
