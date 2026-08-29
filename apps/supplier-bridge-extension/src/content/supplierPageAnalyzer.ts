import type { SupplierSourcePageType } from "../../../../src/core/supplier-bridge/supplier-bridge-types";
import { supplierBridgeBuild } from "../config";
import { captureDiagnosticField } from "../diagnosticSanitizer";
import { DIAGNOSTIC_FIELDS, type DiagnosticField, type DiagnosticPageAnalysis } from "../messages";
import { exactAdapterForUrl } from "../suppliers/registry";

const FIELD_SELECTORS: Record<DiagnosticField, readonly string[]> = {
  searchInput: ['input[type="search"]', '[role="searchbox"]', 'input[name*="search" i]', 'input[id*="search" i]'],
  searchButton: ['button[type="submit"]', '[role="search"] button', 'button[aria-label*="search" i]'],
  productName: ['[itemprop="name"]', '[data-product-name]', 'h1'],
  productCode: ['[itemprop="sku"]', '[data-product-code]', '[data-sku]', '[class*="product-code" i]'],
  customerPrice: ['[data-customer-price]', '[class*="customer-price" i]', '[itemprop="price"]'],
  listPrice: ['[data-list-price]', '[class*="list-price" i]', 'del[class*="price" i]'],
  price: ['[itemprop="price"]', '[data-price]', '[class*="price" i]'],
  unit: ['[data-price-unit]', '[class*="price-unit" i]', '[class*="unit-price" i]'],
  dimensions: ['[data-dimensions]', '[class*="dimension" i]'],
  thickness: ['[data-thickness]', '[class*="thickness" i]'],
  availability: ['[itemprop="availability"]', '[data-availability]', '[class*="availability" i]', '[class*="stock" i]']
};

function firstSafeMatch(document: Document, selectors: readonly string[]): Element | null {
  for (const selector of selectors) {
    const match = document.querySelector(selector);
    if (!match) continue;
    if (match instanceof HTMLInputElement && (match.type === "password" || match.type === "hidden")) continue;
    return match;
  }
  return null;
}

function sourcePageType(pageType: ReturnType<NonNullable<ReturnType<typeof exactAdapterForUrl>>["detectPage"]>["pageType"]): SupplierSourcePageType {
  if (pageType === "product_detail") return "product";
  if (pageType === "other") return "unknown";
  return pageType;
}

export function analyzeSupplierPage(document: Document, url: URL): DiagnosticPageAnalysis | null {
  const adapter = exactAdapterForUrl(url);
  if (!adapter) return null;
  const pageType = sourcePageType(adapter.detectPage(document, url).pageType);
  const fields: DiagnosticPageAnalysis["fields"] = {};
  for (const field of DIAGNOSTIC_FIELDS) {
    const element = firstSafeMatch(document, FIELD_SELECTORS[field]);
    if (element) fields[field] = captureDiagnosticField(element, field, pageType, supplierBridgeBuild.version);
  }
  return {
    supplierId: adapter.supplierId,
    origin: url.origin,
    pathname: url.pathname,
    pageType,
    sessionStatus: adapter.detectSession(document, url).status,
    fields,
    missingFields: DIAGNOSTIC_FIELDS.filter((field) => !fields[field])
  };
}
