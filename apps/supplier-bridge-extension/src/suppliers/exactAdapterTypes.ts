import type {
  SupplierExpectedProductType,
  SupplierId,
  SupplierPriceBasis,
  SupplierVatMode
} from "../../../../src/core/supplier-bridge/supplier-bridge-types";

export type SupplierSessionDetection = {
  status: "logged_in" | "logged_out" | "unknown";
  evidence: string[];
};

export type ProductLookupPlan =
  | { type: "direct_url"; url: string }
  | { type: "search_form"; searchPageUrl: string; productId: string }
  | { type: "manual_assisted"; instructions: string };

export type SupplierPageDetection = {
  pageType: "login" | "search_results" | "product_detail" | "cart" | "other";
  confidence: "verified" | "unknown";
};

export type ExactProductExtractionContext = {
  requestedProductId: string;
  expectedProductType: SupplierExpectedProductType;
  expectedManufacturer: string | null;
  expectedThicknessMm: number | null;
};

export type ExactProductExtractionResult = {
  ok: boolean;
  errorCode: string | null;
  result: SupplierProductLookupResult | null;
};

export type SupplierProductLookupResult = {
  supplierId: Exclude<SupplierId, "mock-supplier">;
  requestedProductId: string;
  foundProductId: string;
  exactIdMatch: boolean;
  product: {
    name: string;
    manufacturer: string | null;
    manufacturerCode: string | null;
    productType: Exclude<SupplierExpectedProductType, "unknown"> | "other";
    description: string | null;
    decorCode: string | null;
    surfaceCode: string | null;
    thicknessMm: number | null;
    dimensions: { widthMm: number | null; lengthMm: number | null; depthMm: number | null } | null;
    availability: { status: "available" | "limited" | "unavailable" | "on_request" | "unknown"; rawText: string | null };
  };
  pricing: {
    customerPrice: { amount: number; currency: string; basis: SupplierPriceBasis; vatMode: SupplierVatMode; rawPriceText: string; rawUnitText: string | null } | null;
    listPrice: { amount: number; currency: string; rawPriceText: string } | null;
    discountPercent: number | null;
    normalizedPrice: { amount: number; unit: "piece" | "m2" | "linear_meter" | "pair" | "set"; confidence: "exact" | "calculated"; calculation: string | null } | null;
  };
  source: { pageUrl: string; pageType: "product_detail" | "search_results" | "cart" | "other"; observedAt: string; adapterVersion: string };
  diagnostics: { warnings: string[]; missingFields: string[] };
};

export type ExactIdSupplierAdapter = {
  supplierId: Exclude<SupplierId, "mock-supplier">;
  adapterVersion: string;
  productionReady: boolean;
  supportsUrl(url: URL): boolean;
  detectSession(document: Document, url: URL): SupplierSessionDetection;
  buildProductLookupPlan(supplierProductId: string): ProductLookupPlan;
  detectPage(document: Document, url: URL): SupplierPageDetection;
  waitForReady?(document: Document, url: URL): Promise<void>;
  extractExactProduct(document: Document, context: ExactProductExtractionContext): ExactProductExtractionResult;
};
