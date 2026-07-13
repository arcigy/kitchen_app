import type { SupplierPriceBasis, SupplierVatMode } from "./supplier-bridge-types";

export type SupplierPriceParseInput = {
  rawPriceText: string;
  rawUnitText: string;
  currency?: string;
  widthMm?: number | null;
  lengthMm?: number | null;
  minimumQuantity?: number | null;
  packageQuantity?: number | null;
  observedAt?: string;
};

export type SupplierPriceParseResult = {
  amount: number | null;
  currency: string;
  priceBasis: SupplierPriceBasis;
  vatMode: SupplierVatMode;
  minimumQuantity: number | null;
  packageQuantity: number | null;
  rawPriceText: string;
  rawUnitText: string;
  normalizedAmount: number | null;
  normalizedPriceBasis: SupplierPriceBasis;
  normalizationCalculation: string | null;
  normalizationConfidence: number;
  observedAt: string;
};

export function parseLocalizedSupplierAmount(raw: string): number | null {
  const numeric = raw.replace(/[^0-9,.'\s-]/g, "").trim();
  if (!numeric) return null;
  const compact = numeric.replace(/[\s']/g, "");
  const comma = compact.lastIndexOf(",");
  const dot = compact.lastIndexOf(".");
  const decimalIndex = Math.max(comma, dot);
  let normalized = compact;
  if (decimalIndex >= 0) {
    const decimalDigits = compact.length - decimalIndex - 1;
    const isDecimal = decimalDigits > 0 && decimalDigits <= 2;
    if (isDecimal) {
      const whole = compact.slice(0, decimalIndex).replace(/[,.]/g, "");
      const fraction = compact.slice(decimalIndex + 1).replace(/[,.]/g, "");
      normalized = `${whole}.${fraction}`;
    } else {
      normalized = compact.replace(/[,.]/g, "");
    }
  }
  const amount = Number(normalized);
  return Number.isFinite(amount) && amount >= 0 ? amount : null;
}

export function parseSupplierPriceBasis(rawUnitText: string): SupplierPriceBasis {
  const unit = rawUnitText.toLocaleLowerCase("sk-SK").replaceAll("²", "2").replace(/\s+/g, " ").trim();
  if (/\b(m2|m\^2|m 2)\b/.test(unit)) return "m2";
  if (/\b(bm|lm|m\/bm|linear|bežn|bezny meter|bežný meter)\b/.test(unit)) return "linear_meter";
  if (/(?:\bsheet\b|dosk|tabuľ|tabul|platň|platn)/.test(unit)) return "sheet";
  if (/\b(pair|pár|par)\b/.test(unit)) return "pair";
  if (/\b(set|sada)\b/.test(unit)) return "set";
  if (/(?:\bpackage\b|balen|\bbal\.)/.test(unit)) return "package";
  if (/\b(piece|pcs|ks|kus)\b/.test(unit)) return "piece";
  return "unknown";
}

export function parseSupplierVatMode(rawText: string): SupplierVatMode {
  const text = rawText.toLocaleLowerCase("sk-SK").replace(/\s+/g, " ");
  if (/bez\s*dph|excl(?:uding)?\s*vat|without\s*vat|netto|\bnet\b/.test(text)) return "excluded";
  if (/s\s*dph|vrátane\s*dph|vratane\s*dph|incl(?:uding)?\s*vat|with\s*vat|brutto|\bgross\b/.test(text)) return "included";
  return "unknown";
}

function detectCurrency(raw: string, fallback = "EUR"): string {
  const upper = raw.toUpperCase();
  if (upper.includes("CZK") || upper.includes("KČ")) return "CZK";
  if (upper.includes("USD") || raw.includes("$")) return "USD";
  if (upper.includes("GBP") || raw.includes("£")) return "GBP";
  if (upper.includes("EUR") || raw.includes("€")) return "EUR";
  return /^[A-Z]{3}$/.test(fallback.toUpperCase()) ? fallback.toUpperCase() : "EUR";
}

export function parseSupplierPrice(input: SupplierPriceParseInput): SupplierPriceParseResult {
  const amount = parseLocalizedSupplierAmount(input.rawPriceText);
  const priceBasis = parseSupplierPriceBasis(input.rawUnitText);
  const vatMode = parseSupplierVatMode(`${input.rawPriceText} ${input.rawUnitText}`);
  let normalizedAmount = amount;
  let normalizedPriceBasis = priceBasis;
  let normalizationCalculation: string | null = amount == null ? null : "No unit conversion applied.";
  let normalizationConfidence = amount == null ? 0 : priceBasis === "unknown" ? 0.45 : 0.85;

  if (amount != null && priceBasis === "sheet") {
    const widthMm = input.widthMm ?? null;
    const lengthMm = input.lengthMm ?? null;
    if (widthMm != null && lengthMm != null && widthMm > 0 && lengthMm > 0) {
      const areaM2 = widthMm * lengthMm / 1_000_000;
      normalizedAmount = amount / areaM2;
      normalizedPriceBasis = "m2";
      normalizationCalculation = `${amount} / (${widthMm} * ${lengthMm} / 1000000) = ${normalizedAmount}`;
      normalizationConfidence = 0.98;
    } else {
      normalizationCalculation = "Sheet dimensions are missing; price remains per sheet.";
      normalizationConfidence = 0.7;
    }
  }

  return {
    amount,
    currency: detectCurrency(input.rawPriceText, input.currency),
    priceBasis,
    vatMode,
    minimumQuantity: input.minimumQuantity ?? null,
    packageQuantity: input.packageQuantity ?? null,
    rawPriceText: input.rawPriceText.slice(0, 200),
    rawUnitText: input.rawUnitText.slice(0, 120),
    normalizedAmount: normalizedAmount == null ? null : Math.round(normalizedAmount * 10_000) / 10_000,
    normalizedPriceBasis,
    normalizationCalculation,
    normalizationConfidence,
    observedAt: input.observedAt ?? new Date().toISOString()
  };
}
