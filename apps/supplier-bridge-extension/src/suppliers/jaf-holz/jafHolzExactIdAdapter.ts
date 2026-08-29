import { supplierPortals } from "../../config";
import { waitForStableElement } from "../../content/waitForStableElement";
import type { ExactIdSupplierAdapter, ExactProductExtractionContext, SupplierProductLookupResult } from "../exactAdapterTypes";
import { availabilityFrom, cleanText, currencyFrom, dimensionsFromText, localizedNumber, priceBasisFromUnit, productTypeOrOther } from "../supplierAdapterUtils";

const origin = supplierPortals.jaf_holz.origins[0];
const version = "jaf-holz-exact-id.v1";

function productCard(document: Document, id: string): HTMLElement | null {
  return [...document.querySelectorAll<HTMLElement>("section.product-teaser.js-product")]
    .find((card) => [...card.querySelectorAll("span,div")].some((el) => cleanText(el) === id)) ?? null;
}

function labeledPrice(text: string, label: string, unit: string): number | null {
  const escaped = unit.replace("²", "[²2]");
  return localizedNumber(text.match(new RegExp(`${label}\\s+([\\d\\s.,]+)\\s*Kč\\s*\\/${escaped}`, "i"))?.[1] ?? null);
}

function extract(document: Document, context: ExactProductExtractionContext): SupplierProductLookupResult | null {
  const card = productCard(document, context.requestedProductId);
  if (!card) return null;
  const text = cleanText(card);
  const name = cleanText(card.querySelector("h3"));
  const dimensionsText = text.match(/D\s*x\s*Š\s*([\d\s.,]+\s*x\s*[\d\s.,]+)\s*mm/i)?.[1] ?? "";
  const dimensions = dimensionsFromText(dimensionsText);
  const amountM2 = labeledPrice(text, "Cena po slevě bez DPH", "m²");
  const amountPiece = labeledPrice(text, "Cena po slevě bez DPH", "ks");
  const customerAmount = amountM2 ?? amountPiece;
  const basis = amountM2 !== null ? "m2" : priceBasisFromUnit("ks");
  const listAmount = labeledPrice(text, "Ceníková cena bez DPH", "ks");
  const availability = availabilityFrom(text);
  return {
    supplierId: "jaf_holz", requestedProductId: context.requestedProductId, foundProductId: context.requestedProductId, exactIdMatch: true,
    product: { name, manufacturer: /egger/i.test(name) ? "Egger" : context.expectedManufacturer, manufacturerCode: null, productType: productTypeOrOther(context.expectedProductType, "board"), description: null, decorCode: null, surfaceCode: null, thicknessMm: localizedNumber(text.match(/Tloušťka\s*([\d.,]+)\s*mm/i)?.[1] ?? null), dimensions, availability },
    pricing: {
      customerPrice: customerAmount === null ? null : { amount: customerAmount, currency: currencyFrom(text), basis, vatMode: "excluded", rawPriceText: text.match(/Cena po slevě bez DPH\s*[\d\s.,]+\s*Kč\s*\/(?:m²|ks)/i)?.[0] ?? String(customerAmount), rawUnitText: amountM2 !== null ? "m²" : "ks" },
      listPrice: listAmount === null ? null : { amount: listAmount, currency: "CZK", rawPriceText: `Ceníková cena bez DPH ${listAmount} Kč /ks` }, discountPercent: null,
      normalizedPrice: customerAmount === null ? null : { amount: customerAmount, unit: amountM2 !== null ? "m2" : "piece", confidence: "exact", calculation: null }
    },
    source: { pageUrl: document.location?.href ?? `${origin}/vyhledavani`, pageType: "search_results", observedAt: new Date().toISOString(), adapterVersion: version },
    diagnostics: { warnings: availability.status === "unknown" ? ["JAF availability was not explicit on the result card."] : [], missingFields: availability.status === "unknown" ? ["availability"] : [] }
  };
}

export const jafHolzExactIdAdapter: ExactIdSupplierAdapter = {
  supplierId: "jaf_holz", adapterVersion: version, productionReady: true,
  supportsUrl: (url) => url.origin === origin,
  detectSession(document) { return document.querySelector('a[href="/muj-ucet"]') ? { status: "logged_in", evidence: ["Verified Czech JAF customer-account link."] } : { status: "unknown", evidence: ["No verified JAF session marker."] }; },
  buildProductLookupPlan(productId) { return { type: "search_form", searchPageUrl: `${origin}/vyhledavani?q=${encodeURIComponent(productId)}`, productId }; },
  detectPage(document, url) {
    if (url.pathname === "/checkout/cart") return { pageType: "cart", confidence: "verified" };
    if (url.pathname === "/vyhledavani" && document.querySelector("section.product-teaser.js-product")) return { pageType: "search_results", confidence: "verified" };
    if (url.pathname.startsWith("/shop/") && document.querySelector("h1")) return { pageType: "product_detail", confidence: "verified" };
    return { pageType: "other", confidence: "unknown" };
  },
  async waitForReady(document, url) { if (this.detectPage(document, url).pageType === "search_results") await waitForStableElement(document, ["section.product-teaser.js-product"], { requireVisible: false, requireText: true, stableForMs: 400, timeoutMs: 6_000 }); },
  extractExactProduct(document, context) { const result = extract(document, context); return result ? { ok: true, errorCode: null, result } : { ok: false, errorCode: "SUPPLIER_PRODUCT_NOT_FOUND", result: null }; }
};
