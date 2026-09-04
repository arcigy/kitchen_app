import type { SupplierPriceBasis } from "../../../../../src/core/supplier-bridge/supplier-bridge-types";
import { supplierPortals } from "../../config";
import { waitForStableElement } from "../../content/waitForStableElement";
import type {
  ExactIdSupplierAdapter,
  ExactProductExtractionContext,
  SupplierProductLookupResult
} from "../exactAdapterTypes";

const origin = supplierPortals.demos.origins[0];

function cleanText(element: Element | null | undefined): string {
  return (element?.textContent ?? "").replace(/\s+/g, " ").trim();
}

function verifiedLoggedOut(document: Document, url: URL): boolean {
  const form = document.querySelector<HTMLFormElement>('form[action$="/login/check/"]');
  return url.pathname === "/login/" && !!form?.querySelector("#front_login_form_login") && !!form.querySelector("#front_login_form_password");
}

function verifiedLoggedIn(document: Document): boolean {
  return !!document.querySelector("#js-product-search-autocomplete-input-lbx") && !!document.querySelector('a[href="https://www.demos24plus.com/cart/"], a[href="/cart/"]');
}

function parameterMap(document: Document): Map<string, string> {
  const result = new Map<string, string>();
  for (const row of document.querySelectorAll("table.table-params tbody tr")) {
    const label = cleanText(row.children[0]);
    const value = cleanText(row.children[1]);
    if (label && value) result.set(label, value);
  }
  return result;
}

function firstParameter(parameters: Map<string, string>, pattern: RegExp): string | null {
  for (const [label, value] of parameters) if (pattern.test(label)) return value;
  return null;
}

function materialThickness(parameters: Map<string, string>): string | null {
  // Démos board details can list veneer thickness before the board thickness.
  // A veneer is a surface layer, never the thickness to assign to a board.
  return firstParameter(parameters, /Tloušťka\s+materiálu/i)
    ?? firstParameter(parameters, /Tloušťka(?!\s+dýhy)/i);
}

function definitionValue(document: Document, label: string): string | null {
  const term = [...document.querySelectorAll("dt")].find((candidate) => cleanText(candidate) === label);
  return term ? cleanText(term.nextElementSibling) || null : null;
}

function previewImageUrl(document: Document): string | null {
  const candidates = [...document.querySelectorAll<HTMLImageElement>('[itemprop="image"], .box-detail__image img, .box-detail__gallery img')];
  for (const image of candidates) {
    const source = image.currentSrc || image.getAttribute("data-zoom-image") || image.getAttribute("data-src") || image.getAttribute("src") || image.src;
    try {
      const url = new URL(source, origin);
      if (url.protocol === "https:" && url.origin === origin) return url.toString();
    } catch {
      // A broken preview is non-blocking; product metadata remains valid.
    }
  }
  return null;
}

function localizedNumber(raw: string | null): number | null {
  if (!raw) return null;
  const match = raw.replace(/\u00a0/g, " ").match(/-?\d[\d\s.]*[,.]\d+|-?\d+/);
  if (!match) return null;
  const compact = match[0].replace(/\s/g, "");
  const normalized = compact.includes(",") ? compact.replace(/\./g, "").replace(",", ".") : compact;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

function currencyFrom(raw: string): string {
  if (/Kč/i.test(raw)) return "CZK";
  if (/€|EUR/i.test(raw)) return "EUR";
  return "CZK";
}

function priceBasisFromUnit(rawUnit: string | null): SupplierPriceBasis {
  const unit = (rawUnit ?? "").trim().toLocaleLowerCase("cs-CZ");
  if (unit === "m" || unit === "bm") return "linear_meter";
  if (unit === "m2" || unit === "m²") return "m2";
  if (unit === "ks" || unit === "kus") return "piece";
  if (unit === "pár" || unit === "par") return "pair";
  if (unit === "set" || unit === "sada") return "set";
  if (unit.startsWith("bal")) return "package";
  return "unknown";
}

function unitFromPriceText(raw: string): string | null {
  return raw.match(/\/\s*(m²|m2|bm|m|ks|kus|pár|par|set|sada|bal(?:ení)?)/i)?.[1] ?? null;
}

function dimensions(parameters: Map<string, string>): { widthMm: number | null; lengthMm: number | null; depthMm: number | null } | null {
  const format = firstParameter(parameters, /Formát.*\(mm\)/i);
  const formatValues = format?.match(/\d+(?:[,.]\d+)?/g)?.map((value) => localizedNumber(value)) ?? [];
  const width = firstParameter(parameters, /Šířka.*\(mm\)/i);
  const length = firstParameter(parameters, /Délka.*\(mm\)/i);
  const widthMm = localizedNumber(width) ?? formatValues[1] ?? null;
  const lengthMm = localizedNumber(length) ?? formatValues[0] ?? null;
  return widthMm !== null || lengthMm !== null ? { widthMm, lengthMm, depthMm: null } : null;
}

function inferredProductType(context: ExactProductExtractionContext, parameters: Map<string, string>, name: string): SupplierProductLookupResult["product"]["productType"] {
  if (context.expectedProductType !== "unknown") return context.expectedProductType;
  if (firstParameter(parameters, /Typ hrany/i)) return "edge_band";
  if (/pracovn[ií]\s+deska/i.test(name)) return "worktop";
  if (firstParameter(parameters, /Formát materiálu/i)) return "board";
  return "other";
}

function availability(raw: string): SupplierProductLookupResult["product"]["availability"] {
  if (/Skladem/i.test(raw)) return { status: "available", rawText: raw || null };
  if (/Po objednání|na dotaz/i.test(raw)) return { status: "on_request", rawText: raw || null };
  if (/Doprodej/i.test(raw)) return { status: "limited", rawText: raw || null };
  if (/Není skladem|Nedostup/i.test(raw)) return { status: "unavailable", rawText: raw || null };
  return { status: "unknown", rawText: raw || null };
}

function normalizedPrice(amount: number, basis: SupplierPriceBasis, productType: SupplierProductLookupResult["product"]["productType"], productDimensions: ReturnType<typeof dimensions>) {
  if ((basis === "piece" || basis === "sheet") && (productType === "board" || productType === "worktop") && productDimensions?.widthMm && productDimensions.lengthMm) {
    const areaM2 = productDimensions.widthMm * productDimensions.lengthMm / 1_000_000;
    return {
      amount: amount / areaM2,
      unit: "m2" as const,
      confidence: "calculated" as const,
      calculation: `${amount} / (${productDimensions.widthMm} * ${productDimensions.lengthMm} / 1000000)`
    };
  }
  if (basis === "piece" || basis === "m2" || basis === "linear_meter" || basis === "pair" || basis === "set") {
    return { amount, unit: basis, confidence: "exact" as const, calculation: null };
  }
  return null;
}

function detailExtraction(document: Document, context: ExactProductExtractionContext): SupplierProductLookupResult | null {
  const foundProductId = cleanText(document.querySelector(".box-detail__top__code__value"));
  const name = cleanText(document.querySelector("h1.box-detail__top__title"));
  if (!foundProductId || !name) return null;
  const parameters = parameterMap(document);
  const productDimensions = dimensions(parameters);
  const productType = inferredProductType(context, parameters, name);
  const rawCustomerPrice = cleanText(document.querySelector(".js-online-partner-price-without-vat"));
  const rawListPrice = cleanText(document.querySelector(".js-online-base-price-without-vat"));
  const unit = definitionValue(document, "Jednotka (MJ)") ?? unitFromPriceText(cleanText(document.querySelector(".box-detail-add__prices")));
  const basis = priceBasisFromUnit(unit);
  const customerAmount = localizedNumber(rawCustomerPrice);
  const listAmount = localizedNumber(rawListPrice);
  const availabilityText = cleanText(document.querySelector(".box-detail-add__availability"));
  const priceContainerText = cleanText(document.querySelector(".box-detail-add__prices"));
  const missingFields = [
    customerAmount === null ? "customerPrice" : null,
    !unit ? "unit" : null,
    !availabilityText ? "availability" : null
  ].filter((value): value is string => !!value);
  return {
    supplierId: "demos",
    requestedProductId: context.requestedProductId,
    foundProductId,
    exactIdMatch: foundProductId === context.requestedProductId,
    product: {
      name,
      manufacturer: definitionValue(document, "Značka"),
      manufacturerCode: null,
      productType,
      description: null,
      decorCode: firstParameter(parameters, /Číslo dekoru|Název dekoru/i),
      surfaceCode: firstParameter(parameters, /Struktura/i),
      previewImageUrl: previewImageUrl(document),
      thicknessMm: localizedNumber(materialThickness(parameters)),
      dimensions: productDimensions,
      availability: availability(availabilityText)
    },
    pricing: {
      customerPrice: customerAmount === null ? null : {
        amount: customerAmount,
        currency: currencyFrom(rawCustomerPrice),
        basis,
        vatMode: "excluded",
        rawPriceText: rawCustomerPrice,
        rawUnitText: unit
      },
      listPrice: listAmount === null ? null : { amount: listAmount, currency: currencyFrom(rawListPrice), rawPriceText: rawListPrice },
      discountPercent: localizedNumber(priceContainerText.match(/Sleva\s+([\d\s.,]+)\s*%/i)?.[1] ?? null),
      normalizedPrice: customerAmount === null ? null : normalizedPrice(customerAmount, basis, productType, productDimensions)
    },
    source: { pageUrl: document.location?.href ?? `${origin}/product/${encodeURIComponent(foundProductId)}/`, pageType: "product_detail", observedAt: new Date().toISOString(), adapterVersion: "demos-exact-id.v1" },
    diagnostics: { warnings: missingFields.length ? ["Some Démos fields were not available after the stable-page wait."] : [], missingFields }
  };
}

function searchResultExtraction(document: Document, context: ExactProductExtractionContext): SupplierProductLookupResult | null {
  const rows = [...document.querySelectorAll<HTMLTableRowElement>("tr.lb-product, tr.list-products-line__item")];
  const row = rows.find((candidate) => cleanText(candidate.querySelector(".list-products-line__item__cell--code")).match(/\b\d{4,}\b/)?.[0] === context.requestedProductId);
  if (!row) return null;
  const foundProductId = cleanText(row.querySelector(".list-products-line__item__cell--code")).match(/\b\d{4,}\b/)?.[0] ?? "";
  const name = cleanText(row.querySelector(".list-products-line__item__cell--title h2")) || cleanText(row.querySelector(".list-products-line__item__cell--title"));
  const rawCustomerPrice = cleanText(row.querySelector(".list-products-line__item__cell--price"));
  const rawListPrice = cleanText(row.querySelector(".list-products-line__item__cell--price-left"));
  const rawAvailability = `${cleanText(row.querySelector(".js-local-warehouse-availability"))} ${cleanText(row.querySelector(".js-central-warehouse-availability"))}`.trim();
  const unit = unitFromPriceText(rawCustomerPrice) ?? unitFromPriceText(rawListPrice);
  const basis = priceBasisFromUnit(unit);
  const customerAmount = localizedNumber(rawCustomerPrice);
  const listAmount = localizedNumber(rawListPrice);
  const productType = context.expectedProductType === "unknown" ? "other" : context.expectedProductType;
  return {
    supplierId: "demos",
    requestedProductId: context.requestedProductId,
    foundProductId,
    exactIdMatch: foundProductId === context.requestedProductId,
    product: { name, manufacturer: null, manufacturerCode: null, productType, description: null, decorCode: null, surfaceCode: null, thicknessMm: null, dimensions: null, availability: availability(rawAvailability) },
    pricing: {
      customerPrice: customerAmount === null ? null : { amount: customerAmount, currency: currencyFrom(rawCustomerPrice), basis, vatMode: "excluded", rawPriceText: rawCustomerPrice, rawUnitText: unit },
      listPrice: listAmount === null ? null : { amount: listAmount, currency: currencyFrom(rawListPrice), rawPriceText: rawListPrice },
      discountPercent: null,
      normalizedPrice: customerAmount === null ? null : normalizedPrice(customerAmount, basis, productType, null)
    },
    source: { pageUrl: document.location?.href ?? `${origin}/search`, pageType: "search_results", observedAt: new Date().toISOString(), adapterVersion: "demos-exact-id.v1" },
    diagnostics: { warnings: ["Search-result capture has fewer technical parameters than the Démos product detail."], missingFields: ["manufacturer", "dimensions", "thickness"] }
  };
}

export const demosExactIdAdapter: ExactIdSupplierAdapter = {
  supplierId: "demos",
  adapterVersion: "demos-exact-id.v1",
  productionReady: true,
  supportsUrl(url) { return url.origin === origin; },
  detectSession(document, url) {
    if (verifiedLoggedOut(document, url)) return { status: "logged_out", evidence: ["Verified /login/ form with Démos login field identifiers."] };
    if (verifiedLoggedIn(document)) return { status: "logged_in", evidence: ["Verified Czech catalog search input and cart navigation marker."] };
    return { status: "unknown", evidence: ["No verified Démos login or logged-in marker was present."] };
  },
  buildProductLookupPlan(supplierProductId) {
    if (/^\d+$/.test(supplierProductId)) return { type: "direct_url", url: `${origin}/product/${encodeURIComponent(supplierProductId)}/` };
    return { type: "search_form", searchPageUrl: `${origin}/search?q=${encodeURIComponent(supplierProductId)}`, productId: supplierProductId };
  },
  detectPage(document, url) {
    if (verifiedLoggedOut(document, url)) return { pageType: "login", confidence: "verified" };
    if (document.querySelector("h1.box-detail__top__title") && document.querySelector(".box-detail__top__code__value")) return { pageType: "product_detail", confidence: "verified" };
    if (document.querySelector("main.lb-search__main")) return { pageType: "search_results", confidence: "verified" };
    if (url.pathname === "/cart/" || url.pathname.startsWith("/cart/")) return { pageType: "cart", confidence: "verified" };
    return { pageType: "other", confidence: document.querySelector("h1")?.textContent?.trim() === "404" ? "verified" : "unknown" };
  },
  async waitForReady(document, url) {
    const page = this.detectPage(document, url);
    if (page.pageType === "product_detail") {
      await waitForStableElement(document, [".box-detail__top__code__value"], { requireVisible: false, requireText: true, stableForMs: 250 });
      try {
        await waitForStableElement(document, [".js-online-partner-price-without-vat", ".js-online-base-price-without-vat"], { requireVisible: false, requireText: true, stableForMs: 400, timeoutMs: 6_000 });
      } catch {
        // Product metadata remains useful when this account has no visible price.
      }
    }
    if (page.pageType === "search_results") {
      await waitForStableElement(document, ["main.lb-search__main"], { requireVisible: false, requireText: true, stableForMs: 250 });
    }
  },
  extractExactProduct(document, context) {
    const page = this.detectPage(document, new URL(document.location?.href ?? origin));
    const result = page.pageType === "product_detail"
      ? detailExtraction(document, context)
      : page.pageType === "search_results"
        ? searchResultExtraction(document, context)
        : null;
    if (!result) return { ok: false, errorCode: "SUPPLIER_PRODUCT_NOT_FOUND", result: null };
    return { ok: result.exactIdMatch, errorCode: result.exactIdMatch ? null : "SUPPLIER_PRODUCT_ID_MISMATCH", result };
  }
};
