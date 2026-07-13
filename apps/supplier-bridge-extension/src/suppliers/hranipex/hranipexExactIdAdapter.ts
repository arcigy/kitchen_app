import { supplierPortals } from "../../config";
import { waitForStableElement } from "../../content/waitForStableElement";
import type { ExactIdSupplierAdapter, ExactProductExtractionContext, SupplierProductLookupResult } from "../exactAdapterTypes";
import { availabilityFrom, cleanText, currencyFrom, localizedNumber, priceBasisFromUnit, productTypeOrOther } from "../supplierAdapterUtils";

const origin = supplierPortals.hranipex.origins[0];
const version = "hranipex-exact-id.v1";

function extract(document: Document, context: ExactProductExtractionContext): SupplierProductLookupResult | null {
  const topRow = [...document.querySelectorAll<HTMLTableRowElement>("tr.variantsTable-rowTop")].find((row) => cleanText(row).split(" ")[0] === context.requestedProductId);
  if (!topRow) return null;
  const foundId = cleanText(topRow).split(" ")[0]; const variantText = cleanText(topRow); const bottom = topRow.nextElementSibling as HTMLTableRowElement | null;
  const priceText = cleanText(bottom?.querySelector("[data-price]")); const amount = localizedNumber(priceText); const availabilityText = cleanText(bottom?.querySelector("[data-item-instock]"));
  const dimensionValues = variantText.match(/(\d+(?:[,.]\d+)?)\s*x\s*(\d+(?:[,.]\d+)?)\s*mm/i);
  return {
    supplierId: "hranipex", requestedProductId: context.requestedProductId, foundProductId: foundId, exactIdMatch: foundId === context.requestedProductId,
    product: { name: cleanText(document.querySelector("h1")), manufacturer: context.expectedManufacturer, manufacturerCode: null, productType: productTypeOrOther(context.expectedProductType, "edge_band"), description: null, decorCode: cleanText(document.querySelector("h1")).match(/\b(?:HD|HU)\s*\d+/i)?.[0] ?? null, surfaceCode: null, thicknessMm: localizedNumber(dimensionValues?.[2] ?? null), dimensions: dimensionValues ? { widthMm: localizedNumber(dimensionValues[1]), lengthMm: null, depthMm: null } : null, availability: availabilityFrom(availabilityText) },
    pricing: { customerPrice: amount === null ? null : { amount, currency: currencyFrom(priceText), basis: priceBasisFromUnit("m"), vatMode: "excluded", rawPriceText: priceText, rawUnitText: "m" }, listPrice: null, discountPercent: null, normalizedPrice: amount === null ? null : { amount, unit: "linear_meter", confidence: "exact", calculation: null } },
    source: { pageUrl: document.location?.href ?? origin, pageType: "product_detail", observedAt: new Date().toISOString(), adapterVersion: version }, diagnostics: { warnings: [], missingFields: [] }
  };
}

export const hranipexExactIdAdapter: ExactIdSupplierAdapter = {
  supplierId: "hranipex", adapterVersion: version, productionReady: true,
  supportsUrl: (url) => url.origin === origin,
  detectSession(document) { return document.querySelector('a[href="/cs/zakaznik/osobni-profil/"]') ? { status: "logged_in", evidence: ["Verified Czech Hranipex personal-profile link."] } : { status: "unknown", evidence: ["No verified Hranipex session marker."] }; },
  buildProductLookupPlan(productId) { return { type: "search_form", searchPageUrl: `${origin}/cs/vyhledavani/?q=${encodeURIComponent(productId)}`, productId }; },
  detectPage(document, url) { if (url.pathname.startsWith("/cs/produkt/") && document.querySelector("table")) return { pageType: "product_detail", confidence: "verified" }; if (url.pathname === "/cs/vyhledavani/") return { pageType: "search_results", confidence: "verified" }; if (url.pathname.startsWith("/cs/nakupni-kosik/")) return { pageType: "cart", confidence: "verified" }; return { pageType: "other", confidence: "unknown" }; },
  async waitForReady(document, url) { if (this.detectPage(document, url).pageType === "product_detail") await waitForStableElement(document, ["tr.variantsTable-rowTop", "[data-price]"], { requireVisible: false, requireText: true, stableForMs: 400, timeoutMs: 6_000 }); },
  extractExactProduct(document, context) { const result = extract(document, context); return result ? { ok: true, errorCode: null, result } : { ok: false, errorCode: "SUPPLIER_PRODUCT_NOT_FOUND", result: null }; }
};
