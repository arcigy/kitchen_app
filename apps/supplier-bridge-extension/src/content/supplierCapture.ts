import { adapterForUrl } from "../adapters/registry";
import { exactAdapterForUrl } from "../suppliers/registry";
import { analyzeSupplierPage } from "./supplierPageAnalyzer";
import {
  parseBridgeRuntimeRequest,
  parseSupplierPageCapture,
  type BridgeRuntimeResponse
} from "../messages";

chrome.runtime.onMessage.addListener((raw: unknown, _sender, sendResponse: (response: BridgeRuntimeResponse) => void) => {
  const message = parseBridgeRuntimeRequest(raw);
  if (!message || !["CAPTURE_SUPPLIER_PAGE", "CAPTURE_EXACT_SUPPLIER_PRODUCT", "CAPTURE_CURRENT_SUPPLIER_PRODUCT", "ANALYZE_SUPPLIER_PAGE"].includes(message.type)) return false;
  void (async () => {
    const url = new URL(window.location.href);
    if (message.type === "ANALYZE_SUPPLIER_PAGE") {
      const analysis = analyzeSupplierPage(document, url);
      sendResponse(analysis
        ? { ok: true, analysis }
        : { ok: false, errorCode: "UNVERIFIED_SUPPLIER_ORIGIN", message: "Táto stránka nie je na povolenej českej doméne dodávateľa." });
      return;
    }
    if (message.type === "CAPTURE_EXACT_SUPPLIER_PRODUCT" || message.type === "CAPTURE_CURRENT_SUPPLIER_PRODUCT") {
      const exactAdapter = exactAdapterForUrl(url);
      if (!exactAdapter) {
        sendResponse({ ok: false, errorCode: "UNVERIFIED_SUPPLIER_ORIGIN", message: "No verified exact-ID adapter supports this Czech supplier page." });
        return;
      }
      const session = exactAdapter.detectSession(document, url);
      if (session.status === "logged_out") {
        sendResponse({ ok: false, errorCode: "SUPPLIER_LOGIN_REQUIRED", message: `Pre pokračovanie sa manuálne prihláste do ${exactAdapter.supplierId}.` });
        return;
      }
      await exactAdapter.waitForReady?.(document, url);
      const capturesCurrentProduct = message.type === "CAPTURE_CURRENT_SUPPLIER_PRODUCT";
      const requestedProductId = capturesCurrentProduct ? "__ARCIGY_CURRENT_PRODUCT__" : message.requestedProductId;
      const extracted = exactAdapter.extractExactProduct(document, {
        requestedProductId,
        expectedProductType: message.expectedProductType,
        expectedManufacturer: message.expectedManufacturer,
        expectedThicknessMm: message.expectedThicknessMm
      });
      if ((!extracted.ok && !capturesCurrentProduct) || !extracted.result) {
        sendResponse({ ok: false, errorCode: extracted.errorCode ?? "EXACT_PRODUCT_EXTRACTION_FAILED", message: "Exact product extraction requires a verified real Czech fixture." });
        return;
      }
      const result = extracted.result;
      const customerPrice = result.pricing.customerPrice;
      const normalized = result.pricing.normalizedPrice;
      const pageType = result.source.pageType === "product_detail"
        ? "product"
        : result.source.pageType === "other"
          ? "unknown"
          : result.source.pageType;
      const capture = parseSupplierPageCapture({
        supplierId: result.supplierId,
        pageType,
        candidates: [{
          supplierProductCode: result.foundProductId,
          normalizedProduct: {
            displayName: result.product.name,
            manufacturer: result.product.manufacturer,
            decorCode: result.product.decorCode,
            surfaceCode: result.product.surfaceCode,
            previewColorHex: result.product.previewColorHex ?? null,
            productType: result.product.productType,
            thicknessMm: result.product.thicknessMm,
            widthMm: result.product.dimensions?.widthMm ?? null,
            lengthMm: result.product.dimensions?.lengthMm ?? null,
            availability: result.product.availability.status === "available" ? "available" : result.product.availability.status === "unavailable" ? "unavailable" : "unknown"
          },
          sourcePageType: pageType,
          sourcePath: new URL(result.source.pageUrl).pathname,
          observedAt: result.source.observedAt,
          price: customerPrice ? {
            supplierAccountId: null,
            amount: customerPrice.amount,
            currency: customerPrice.currency,
            priceBasis: customerPrice.basis,
            vatMode: customerPrice.vatMode,
            minimumQuantity: null,
            packageQuantity: null,
            rawPriceText: customerPrice.rawPriceText,
            rawUnitText: customerPrice.rawUnitText ?? "unknown",
            normalizedAmount: normalized?.amount ?? customerPrice.amount,
            normalizedPriceBasis: normalized?.unit ?? customerPrice.basis,
            normalizationCalculation: normalized?.calculation ?? null,
            normalizationConfidence: normalized?.confidence === "exact" ? 1 : normalized ? 0.98 : 0.7,
            observedAt: result.source.observedAt
          } : null
        }],
        warnings: result.diagnostics.warnings,
        errorCode: result.exactIdMatch ? null : "SUPPLIER_PRODUCT_ID_MISMATCH"
      });
      const errorCode = capturesCurrentProduct ? null : capture?.errorCode ?? "INVALID_EXACT_CAPTURE";
      sendResponse(capture ? { ok: errorCode === null, capture: { ...capture, errorCode }, errorCode } : { ok: false, errorCode: "INVALID_EXACT_CAPTURE" });
      return;
    }
    const adapter = adapterForUrl(url);
    if (!adapter) {
      sendResponse({ ok: false, errorCode: "UNSUPPORTED_SUPPLIER_URL", message: "No verified supplier adapter supports this page." });
      return;
    }
    try {
      const capture = parseSupplierPageCapture(await adapter.extractCurrentPage(document, url));
      if (!capture) {
        sendResponse({ ok: false, errorCode: "INVALID_CAPTURE_PAYLOAD", message: "Supplier adapter returned invalid data." });
        return;
      }
      sendResponse({ ok: capture.errorCode === null, capture, errorCode: capture.errorCode });
    } catch {
      sendResponse({ ok: false, errorCode: "CAPTURE_FAILED", message: "Supplier page capture failed." });
    }
  })();
  return true;
});
