import {
  SUPPLIER_BRIDGE_SCHEMA_VERSION,
  type NormalizedSupplierProduct,
  type SupplierBridgeTenantState,
  type SupplierCandidateSubmission,
  type SupplierExpectedProductType,
  type SupplierId,
  type SupplierLookupRequest,
  type SupplierPriceBasis,
  type SupplierSourcePageType,
  type SupplierVatMode
} from "./supplier-bridge-types";

const PRICE_BASES = new Set<SupplierPriceBasis>([
  "piece", "sheet", "m2", "linear_meter", "pair", "set", "package", "unknown"
]);
const VAT_MODES = new Set<SupplierVatMode>(["included", "excluded", "unknown"]);
const PAGE_TYPES = new Set<SupplierSourcePageType>(["login", "search_results", "product", "cart", "diagnostic", "unknown"]);
const REAL_SUPPLIER_IDS = new Set<SupplierId>(["demos", "schachermayer", "hranipex", "jaf_holz"]);
const EXPECTED_PRODUCT_TYPES = new Set<SupplierExpectedProductType>(["board", "worktop", "edge_band", "hinge", "drawer_system", "hardware", "component", "unknown"]);

export class SupplierBridgeValidationError extends Error {}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new SupplierBridgeValidationError(`${path} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function text(value: unknown, path: string, maxLength = 500): string {
  if (typeof value !== "string") throw new SupplierBridgeValidationError(`${path} must be a string.`);
  const normalized = value.trim();
  if (!normalized) throw new SupplierBridgeValidationError(`${path} is required.`);
  if (normalized.length > maxLength) throw new SupplierBridgeValidationError(`${path} is too long.`);
  return normalized;
}

function nullableText(value: unknown, path: string, maxLength = 500): string | null {
  if (value == null) return null;
  return text(value, path, maxLength);
}

function nullableNumber(value: unknown, path: string, options: { min?: number; max?: number } = {}): number | null {
  if (value == null) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new SupplierBridgeValidationError(`${path} must be a finite number or null.`);
  }
  if (options.min != null && value < options.min) throw new SupplierBridgeValidationError(`${path} is below the minimum.`);
  if (options.max != null && value > options.max) throw new SupplierBridgeValidationError(`${path} is above the maximum.`);
  return value;
}

function isoDate(value: unknown, path: string): string {
  const normalized = text(value, path, 64);
  if (!Number.isFinite(Date.parse(normalized))) throw new SupplierBridgeValidationError(`${path} must be an ISO date.`);
  return normalized;
}

function literal<T extends string>(value: unknown, allowed: Set<T>, path: string): T {
  if (typeof value !== "string" || !allowed.has(value as T)) {
    throw new SupplierBridgeValidationError(`${path} has an unsupported value.`);
  }
  return value as T;
}

export function assertSafeSupplierSourcePath(value: unknown, path = "sourcePath"): string {
  const normalized = text(value, path, 1_024);
  if (!normalized.startsWith("/") || normalized.includes("?") || normalized.includes("#") || normalized.includes("://")) {
    throw new SupplierBridgeValidationError(`${path} must contain only a pathname.`);
  }
  return normalized;
}

export function validateNormalizedSupplierProduct(value: unknown, path = "normalizedProduct"): NormalizedSupplierProduct {
  const input = record(value, path);
  const availability = input.availability;
  if (availability !== "available" && availability !== "unavailable" && availability !== "unknown") {
    throw new SupplierBridgeValidationError(`${path}.availability has an unsupported value.`);
  }
  return {
    displayName: text(input.displayName, `${path}.displayName`, 300),
    manufacturer: nullableText(input.manufacturer, `${path}.manufacturer`, 160),
    decorCode: nullableText(input.decorCode, `${path}.decorCode`, 120),
    surfaceCode: nullableText(input.surfaceCode, `${path}.surfaceCode`, 120),
    productType: nullableText(input.productType, `${path}.productType`, 120),
    thicknessMm: nullableNumber(input.thicknessMm, `${path}.thicknessMm`, { min: 0.1, max: 1_000 }),
    widthMm: nullableNumber(input.widthMm, `${path}.widthMm`, { min: 0.1, max: 100_000 }),
    lengthMm: nullableNumber(input.lengthMm, `${path}.lengthMm`, { min: 0.1, max: 100_000 }),
    availability
  };
}

export function validateSupplierCandidateSubmission(value: unknown): SupplierCandidateSubmission {
  const input = record(value, "candidate submission");
  const priceInput = input.price == null ? null : record(input.price, "candidate submission.price");
  const price = priceInput
    ? {
        supplierAccountId: nullableText(priceInput.supplierAccountId, "candidate submission.price.supplierAccountId", 160),
        amount: nullableNumber(priceInput.amount, "candidate submission.price.amount", { min: 0, max: 1_000_000_000 }),
        currency: text(priceInput.currency, "candidate submission.price.currency", 8).toUpperCase(),
        priceBasis: literal(priceInput.priceBasis, PRICE_BASES, "candidate submission.price.priceBasis"),
        vatMode: literal(priceInput.vatMode, VAT_MODES, "candidate submission.price.vatMode"),
        minimumQuantity: nullableNumber(priceInput.minimumQuantity, "candidate submission.price.minimumQuantity", { min: 0 }),
        packageQuantity: nullableNumber(priceInput.packageQuantity, "candidate submission.price.packageQuantity", { min: 0 }),
        rawPriceText: text(priceInput.rawPriceText, "candidate submission.price.rawPriceText", 200),
        rawUnitText: text(priceInput.rawUnitText, "candidate submission.price.rawUnitText", 120),
        normalizedAmount: nullableNumber(priceInput.normalizedAmount, "candidate submission.price.normalizedAmount", { min: 0, max: 1_000_000_000 }),
        normalizedPriceBasis: literal(priceInput.normalizedPriceBasis, PRICE_BASES, "candidate submission.price.normalizedPriceBasis"),
        normalizationCalculation: nullableText(priceInput.normalizationCalculation, "candidate submission.price.normalizationCalculation", 500),
        normalizationConfidence: nullableNumber(priceInput.normalizationConfidence, "candidate submission.price.normalizationConfidence", { min: 0, max: 1 }) ?? 0,
        observedAt: isoDate(priceInput.observedAt, "candidate submission.price.observedAt")
      }
    : null;
  if (price && !/^[A-Z]{3}$/.test(price.currency)) {
    throw new SupplierBridgeValidationError("candidate submission.price.currency must be a three-letter currency code.");
  }
  return {
    submissionId: text(input.submissionId, "candidate submission.submissionId", 160),
    syncItemId: text(input.syncItemId, "candidate submission.syncItemId", 160),
    supplierProductCode: text(input.supplierProductCode, "candidate submission.supplierProductCode", 160),
    normalizedProduct: validateNormalizedSupplierProduct(input.normalizedProduct),
    sourcePageType: literal(input.sourcePageType, PAGE_TYPES, "candidate submission.sourcePageType"),
    sourcePath: assertSafeSupplierSourcePath(input.sourcePath),
    observedAt: isoDate(input.observedAt, "candidate submission.observedAt"),
    price
  };
}

export function validateSupplierBridgeTenantState(value: unknown): SupplierBridgeTenantState {
  const input = record(value, "supplier bridge state");
  if (input.schemaVersion !== SUPPLIER_BRIDGE_SCHEMA_VERSION) {
    throw new SupplierBridgeValidationError("supplier bridge state schemaVersion is unsupported.");
  }
  input.catalogItems ??= [];
  input.materialSupplierAssignments ??= [];
  for (const key of ["sessions", "items", "candidates", "priceObservations", "mappings", "catalogItems", "materialSupplierAssignments", "tokens", "submissionKeys"] as const) {
    if (!Array.isArray(input[key])) throw new SupplierBridgeValidationError(`supplier bridge state.${key} must be an array.`);
  }
  const state = structuredClone(input) as SupplierBridgeTenantState;
  state.items = state.items.map((item) => ({ ...item, exactLookup: item.exactLookup ?? null }));
  for (const session of state.sessions) {
    text(session.id, "session.id", 160);
    text(session.tenantId, "session.tenantId", 160);
    text(session.projectId, "session.projectId", 160);
    text(session.userId, "session.userId", 160);
    text(session.supplierId, "session.supplierId", 160);
    isoDate(session.createdAt, "session.createdAt");
    isoDate(session.updatedAt, "session.updatedAt");
    isoDate(session.expiresAt, "session.expiresAt");
  }
  for (const token of state.tokens) {
    text(token.id, "token.id", 160);
    text(token.tokenHash, "token.tokenHash", 200);
    isoDate(token.createdAt, "token.createdAt");
    isoDate(token.expiresAt, "token.expiresAt");
    if (token.usedAt != null) isoDate(token.usedAt, "token.usedAt");
  }
  return state;
}

export function validateCreateSupplierSessionRequest(value: unknown): { supplierId: string; projectId: string | null; lookups: SupplierLookupRequest[] } {
  const input = record(value, "supplier session request");
  if ("clientId" in input || "tenantId" in input || "userId" in input) {
    throw new SupplierBridgeValidationError("Supplier session scope must come from the authenticated session.");
  }
  const supplierId = text(input.supplierId, "supplier session request.supplierId", 160);
  const projectId = input.projectId == null ? null : text(input.projectId, "supplier session request.projectId", 160);
  const rawLookups = input.lookups == null ? [] : input.lookups;
  if (!Array.isArray(rawLookups) || rawLookups.length > 200) throw new SupplierBridgeValidationError("supplier session request.lookups must contain at most 200 items.");
  const lookups = rawLookups.map((value, index): SupplierLookupRequest => {
    const lookup = record(value, `supplier session request.lookups[${index}]`);
    const supplierProductId = text(lookup.supplierProductId, `supplier session request.lookups[${index}].supplierProductId`, 160);
    return {
      requestId: text(lookup.requestId, `supplier session request.lookups[${index}].requestId`, 160),
      projectId: text(lookup.projectId, `supplier session request.lookups[${index}].projectId`, 160),
      materialAssignmentId: text(lookup.materialAssignmentId, `supplier session request.lookups[${index}].materialAssignmentId`, 200),
      supplierId: literal(lookup.supplierId, REAL_SUPPLIER_IDS, `supplier session request.lookups[${index}].supplierId`),
      supplierProductId,
      expectedProductType: literal(lookup.expectedProductType, EXPECTED_PRODUCT_TYPES, `supplier session request.lookups[${index}].expectedProductType`),
      ...(lookup.expectedManufacturer == null ? {} : { expectedManufacturer: text(lookup.expectedManufacturer, `supplier session request.lookups[${index}].expectedManufacturer`, 160) }),
      ...(lookup.expectedThicknessMm == null ? {} : { expectedThicknessMm: nullableNumber(lookup.expectedThicknessMm, `supplier session request.lookups[${index}].expectedThicknessMm`, { min: 0.1, max: 1_000 })! })
    };
  });
  if (new Set(lookups.map((lookup) => lookup.requestId)).size !== lookups.length) throw new SupplierBridgeValidationError("supplier lookup requestId values must be unique.");
  return { supplierId, projectId, lookups };
}

export function validateConfirmSupplierCandidateRequest(value: unknown): { syncItemId: string; candidateId: string } {
  const input = record(value, "supplier confirmation");
  return {
    syncItemId: text(input.syncItemId, "supplier confirmation.syncItemId", 160),
    candidateId: text(input.candidateId, "supplier confirmation.candidateId", 160)
  };
}

export function validateSkipSupplierItemRequest(value: unknown): { syncItemId: string; errorCode: string | null } {
  const input = record(value, "supplier skip request");
  return {
    syncItemId: text(input.syncItemId, "supplier skip request.syncItemId", 160),
    errorCode: nullableText(input.errorCode, "supplier skip request.errorCode", 160)
  };
}
