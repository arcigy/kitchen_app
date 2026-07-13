import type { SupplierPriceBasis } from "../../../../src/core/supplier-bridge/supplier-bridge-types";

export function cleanText(element: Element | null | undefined): string {
  return (element?.textContent ?? "").replace(/\s+/g, " ").trim();
}

export function localizedNumber(raw: string | null): number | null {
  if (!raw) return null;
  const match = raw.replace(/\u00a0/g, " ").match(/-?\d[\d\s.]*[,.]\d+|-?\d[\d\s.]*/);
  if (!match) return null;
  const compact = match[0].replace(/\s/g, "");
  const normalized = compact.includes(",") ? compact.replace(/\./g, "").replace(",", ".") : compact;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

export function currencyFrom(raw: string): string {
  if (/K[cč]|CZK/i.test(raw)) return "CZK";
  if (/€|EUR/i.test(raw)) return "EUR";
  return "CZK";
}

export function priceBasisFromUnit(raw: string | null): SupplierPriceBasis {
  const unit = (raw ?? "").replace(/\s/g, "").toLocaleLowerCase("cs-CZ");
  if (unit === "m" || unit === "bm") return "linear_meter";
  if (unit === "m2" || unit === "m²") return "m2";
  if (unit === "ks" || unit === "kus") return "piece";
  if (unit === "pár" || unit === "par") return "pair";
  if (unit === "set" || unit === "sada") return "set";
  if (unit.startsWith("bal")) return "package";
  return "unknown";
}

export function unitFromText(raw: string): string | null {
  return raw.match(/\/?\s*(m²|m2|bm|m|ks|kus|pár|par|set|sada|bal(?:ení)?)(?:\b|$)/i)?.[1] ?? null;
}

export function productTypeOrOther(expected: "board" | "worktop" | "edge_band" | "hinge" | "drawer_system" | "hardware" | "component" | "unknown", fallback: "board" | "worktop" | "edge_band" | "hinge" | "drawer_system" | "hardware" | "component" | "other") {
  return expected === "unknown" ? fallback : expected;
}

export function availabilityFrom(raw: string) {
  if (/ihned k odeslání|skladem|skladový program/i.test(raw)) return { status: "available" as const, rawText: raw || null };
  if (/doprodej|omezen/i.test(raw)) return { status: "limited" as const, rawText: raw || null };
  if (/na objednávku|poptat|na dotaz/i.test(raw)) return { status: "on_request" as const, rawText: raw || null };
  if (/není skladem|nedostup/i.test(raw)) return { status: "unavailable" as const, rawText: raw || null };
  return { status: "unknown" as const, rawText: raw || null };
}

export function dimensionsFromText(raw: string) {
  const values = raw.match(/\d[\d\s]*(?:[,.]\d+)?/g)?.map((value) => localizedNumber(value)) ?? [];
  return values.length >= 2 ? { lengthMm: values[0], widthMm: values[1], depthMm: null } : null;
}
