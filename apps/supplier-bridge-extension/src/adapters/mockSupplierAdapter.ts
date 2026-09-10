import { parseSupplierPrice } from "../../../../src/core/supplier-bridge/supplier-price";
import type { SupplierSourcePageType } from "../../../../src/core/supplier-bridge/supplier-bridge-types";
import { isSupplierSimulatorOrigin, supplierSimulatorSearchUrl } from "../config";
import type { CapturedSupplierCandidate, SupplierPageCapture } from "../messages";
import type { SupplierAdapter } from "./types";

const capabilities = new Set([
  "capture_current_product",
  "capture_visible_results",
  "capture_cart",
  "build_search_url"
] as const);

function numberAttribute(element: Element, name: string): number | null {
  const value = element.getAttribute(name);
  if (!value) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function requiredAttribute(element: Element, name: string): string | null {
  const value = element.getAttribute(name)?.trim();
  return value || null;
}

async function waitForStablePrice(root: Element, timeoutMs = 4_000): Promise<Element | null> {
  const current = root.querySelector("[data-supplier-price]");
  if (current?.textContent?.trim()) return current;
  return new Promise((resolve) => {
    let stableTimer = 0;
    const timeout = window.setTimeout(() => finish(null), timeoutMs);
    const observer = new MutationObserver(() => {
      const price = root.querySelector("[data-supplier-price]");
      if (!price?.textContent?.trim()) return;
      window.clearTimeout(stableTimer);
      stableTimer = window.setTimeout(() => finish(price), 180);
    });
    const finish = (result: Element | null) => {
      observer.disconnect();
      window.clearTimeout(timeout);
      window.clearTimeout(stableTimer);
      resolve(result);
    };
    observer.observe(root, { childList: true, subtree: true, characterData: true });
  });
}

async function candidateFromElement(element: Element, pageType: SupplierSourcePageType, sourcePath: string): Promise<CapturedSupplierCandidate | null> {
  const supplierProductCode = requiredAttribute(element, "data-product-code");
  const displayName = requiredAttribute(element, "data-display-name");
  if (!supplierProductCode || !displayName) return null;
  const widthMm = numberAttribute(element, "data-width-mm");
  const lengthMm = numberAttribute(element, "data-length-mm");
  const priceElement = await waitForStablePrice(element);
  const unitElement = element.querySelector("[data-supplier-unit]");
  const rawPriceText = priceElement?.textContent?.trim() ?? "";
  const rawUnitText = unitElement?.textContent?.trim() ?? "";
  const price = rawPriceText && rawUnitText
    ? {
        supplierAccountId: document.body.dataset.supplierAccountId ?? null,
        ...parseSupplierPrice({ rawPriceText, rawUnitText, widthMm, lengthMm })
      }
    : null;
  const availability = element.getAttribute("data-availability");
  return {
    supplierProductCode,
    normalizedProduct: {
      displayName,
      manufacturer: requiredAttribute(element, "data-manufacturer"),
      decorCode: requiredAttribute(element, "data-decor-code"),
      surfaceCode: requiredAttribute(element, "data-surface-code"),
      previewColorHex: requiredAttribute(element, "data-preview-color-hex"),
      productType: requiredAttribute(element, "data-product-type"),
      thicknessMm: numberAttribute(element, "data-thickness-mm"),
      widthMm,
      lengthMm,
      availability: availability === "available" || availability === "unavailable" ? availability : "unknown"
    },
    sourcePageType: pageType,
    sourcePath,
    observedAt: new Date().toISOString(),
    price
  };
}

export const mockSupplierAdapter: SupplierAdapter = {
  supplierId: "mock-supplier",
  productionReady: false,
  capabilities,
  supportsUrl(url) {
    return isSupplierSimulatorOrigin(url.origin);
  },
  detectPage(_document, url) {
    if (url.pathname === "/login") return "login";
    if (url.pathname === "/search") return "search_results";
    if (url.pathname.startsWith("/product/")) return "product";
    if (url.pathname === "/cart") return "cart";
    return "unknown";
  },
  async extractCurrentPage(document, url): Promise<SupplierPageCapture> {
    const pageType = this.detectPage(document, url);
    if (pageType === "login") {
      return { supplierId: this.supplierId, pageType, candidates: [], warnings: ["Supplier session is expired or logged out."], errorCode: "SUPPLIER_SESSION_EXPIRED" };
    }
    const roots = pageType === "product"
      ? [...document.querySelectorAll("[data-supplier-product]")].slice(0, 1)
      : [...document.querySelectorAll("[data-supplier-product]")].slice(0, 20);
    if (roots.length === 0) {
      return { supplierId: this.supplierId, pageType, candidates: [], warnings: ["No supported product markup is visible."], errorCode: "SELECTOR_MISSING" };
    }
    const candidates = (await Promise.all(roots.map((root) => candidateFromElement(root, pageType, url.pathname))))
      .filter((candidate): candidate is CapturedSupplierCandidate => candidate !== null);
    return {
      supplierId: this.supplierId,
      pageType,
      candidates,
      warnings: candidates.some((candidate) => candidate.price === null) ? ["At least one product has no visible price."] : [],
      errorCode: candidates.length > 0 ? null : "PRODUCT_DATA_INCOMPLETE"
    };
  },
  buildSearchUrl(query, arcigyOrigin) {
    return supplierSimulatorSearchUrl(query, arcigyOrigin);
  }
};
