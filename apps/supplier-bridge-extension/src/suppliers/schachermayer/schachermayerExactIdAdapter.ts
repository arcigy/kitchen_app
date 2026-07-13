import { supplierPortals } from "../../config";
import { waitForStableElement } from "../../content/waitForStableElement";
import type { ExactIdSupplierAdapter, ExactProductExtractionContext, SupplierProductLookupResult } from "../exactAdapterTypes";
import { availabilityFrom, cleanText, currencyFrom, localizedNumber, priceBasisFromUnit, productTypeOrOther } from "../supplierAdapterUtils";

const origin = supplierPortals.schachermayer.origins[0];
const version = "schachermayer-exact-id.v1";

function details(document: Document): HTMLElement | null { return document.querySelector<HTMLElement>(".article-details-container-layout"); }
function extract(document: Document, context: ExactProductExtractionContext): SupplierProductLookupResult | null {
  const root = details(document); if (!root) return null;
  const text = cleanText(root); const foundId = text.match(/Obj\.č\.:\s*(\d+)/i)?.[1] ?? "";
  if (!foundId) return null;
  const priceBlock = [...root.querySelectorAll<HTMLElement>("div")].find((el) => /Vaše cena/.test(cleanText(el)) && /CZK/.test(cleanText(el)) && cleanText(el).length < 160);
  const priceText = cleanText(priceBlock); const amount = localizedNumber(priceText.match(/CZK\s*([\d\s.,]+)/i)?.[1] ?? null);
  const unit = priceText.match(/za\s*\d+\s*([A-ZÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]+)/i)?.[1]?.toLowerCase() ?? null;
  const name = cleanText(root.querySelector("h1")); const availabilityText = text.match(/(\d[\d\s]*\s*KS\s*IHNED K ODESLÁNÍ|Poptat cenu a dostupnost)/i)?.[1] ?? "";
  const manufacturer = [...document.querySelectorAll<HTMLElement>("[role=combobox]")].map(cleanText).find((value) => /blum/i.test(value)) ?? context.expectedManufacturer;
  return {
    supplierId: "schachermayer", requestedProductId: context.requestedProductId, foundProductId: foundId, exactIdMatch: foundId === context.requestedProductId,
    product: { name, manufacturer, manufacturerCode: null, productType: productTypeOrOther(context.expectedProductType, /pant|závěs/i.test(name) ? "hinge" : "hardware"), description: null, decorCode: null, surfaceCode: null, thicknessMm: null, dimensions: null, availability: availabilityFrom(availabilityText) },
    pricing: { customerPrice: amount === null ? null : { amount, currency: currencyFrom(priceText), basis: priceBasisFromUnit(unit), vatMode: "excluded", rawPriceText: priceText, rawUnitText: unit }, listPrice: null, discountPercent: null, normalizedPrice: amount === null ? null : { amount, unit: "piece", confidence: "exact", calculation: null } },
    source: { pageUrl: document.location?.href ?? origin, pageType: "product_detail", observedAt: new Date().toISOString(), adapterVersion: version }, diagnostics: { warnings: [], missingFields: [] }
  };
}

export const schachermayerExactIdAdapter: ExactIdSupplierAdapter = {
  supplierId: "schachermayer", adapterVersion: version, productionReady: true,
  supportsUrl: (url) => url.origin === origin,
  detectSession(document) { return document.querySelector('a[href*="extranet/redirect/docs"]') && /Můj\s*účet/i.test(cleanText(document.body)) ? { status: "logged_in", evidence: ["Verified Czech Schachermayer account navigation."] } : { status: "unknown", evidence: ["No verified Schachermayer session marker."] }; },
  buildProductLookupPlan(productId) { return { type: "search_form", searchPageUrl: `${origin}/cat/cs-CZ/products/v-echny-kategorie/1?sSearch=${encodeURIComponent(productId)}`, productId }; },
  detectPage(document, url) { if (/\/product\/.+\/\d+/.test(url.pathname) && details(document)) return { pageType: "product_detail", confidence: "verified" }; if (/\/products\//.test(url.pathname)) return { pageType: "search_results", confidence: "verified" }; return { pageType: "other", confidence: "unknown" }; },
  async waitForReady(document, url) { if (this.detectPage(document, url).pageType === "product_detail") await waitForStableElement(document, [".article-details-container-layout"], { requireVisible: false, requireText: true, stableForMs: 400, timeoutMs: 6_000 }); },
  extractExactProduct(document, context) { const result = extract(document, context); if (!result) return { ok: false, errorCode: "SUPPLIER_PRODUCT_NOT_FOUND", result: null }; return { ok: result.exactIdMatch, errorCode: result.exactIdMatch ? null : "SUPPLIER_PRODUCT_ID_MISMATCH", result }; }
};
