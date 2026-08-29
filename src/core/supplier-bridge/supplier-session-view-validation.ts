import {
  SUPPLIER_BRIDGE_SCHEMA_VERSION,
  type SupplierPriceObservation,
  type SupplierProductCandidate,
  type SupplierSyncItem,
  type SupplierSyncSession,
  type SupplierSyncSessionView
} from "./supplier-bridge-types";
import { validateNormalizedSupplierProduct } from "./supplier-bridge-validation";

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function boundedString(value: unknown): value is string { return typeof value === "string" && value.length <= 8_192; }
function nullableString(value: unknown): value is string | null { return value === null || boundedString(value); }
function finite(value: unknown): value is number { return typeof value === "number" && Number.isFinite(value); }
const assignmentCategories = new Set([
  "corpus", "front", "worktop", "plinth", "back", "drawer_bottom", "edge_front", "edge_other",
  "handle", "hinge", "runner", "lift_up", "leg", "fastener", "other_component", "lighting"
]);

function parseSession(value: unknown): SupplierSyncSession | null {
  const input = record(value);
  if (!input || !["pending", "active", "completed", "cancelled", "expired", "failed"].includes(String(input.status))) return null;
  for (const key of ["id", "tenantId", "projectId", "userId", "supplierId", "createdAt", "updatedAt", "expiresAt"] as const) if (!boundedString(input[key])) return null;
  return input as SupplierSyncSession;
}

function parseItem(value: unknown): SupplierSyncItem | null {
  const input = record(value);
  if (!input || !["pending", "needs_confirmation", "confirmed", "skipped", "failed"].includes(String(input.status))) return null;
  for (const key of ["id", "sessionId", "materialAssignmentId", "query", "createdAt", "updatedAt"] as const) if (!boundedString(input[key])) return null;
  if (input.assignmentCategory !== undefined && !assignmentCategories.has(String(input.assignmentCategory))) return null;
  if (input.assignmentVariantKey !== undefined && !boundedString(input.assignmentVariantKey)) return null;
  if (input.targetLabel !== undefined && !boundedString(input.targetLabel)) return null;
  if (input.targetScope !== undefined && !["general", "module", "addition"].includes(String(input.targetScope))) return null;
  for (const key of ["expectedManufacturer", "expectedDecorCode", "expectedSurfaceCode", "expectedProductType", "selectedCandidateId", "errorCode"] as const) if (!nullableString(input[key])) return null;
  if (input.expectedThicknessMm !== null && !finite(input.expectedThicknessMm)) return null;
  const exact = input.exactLookup == null ? null : record(input.exactLookup);
  if (exact) {
    if (!boundedString(exact.requestId) || !["demos", "schachermayer", "hranipex", "jaf_holz"].includes(String(exact.supplierId))) return null;
    if (!boundedString(exact.supplierProductId) || !boundedString(exact.rawSupplierProductId)) return null;
    if (!["created", "waiting_for_extension", "checking_session", "waiting_for_login", "opening_supplier", "searching", "loading_product", "extracting", "needs_confirmation", "completed", "not_found", "failed", "cancelled"].includes(String(exact.lookupStatus))) return null;
  }
  return { ...input, exactLookup: exact } as SupplierSyncItem;
}

function parseCandidate(value: unknown): SupplierProductCandidate | null {
  const input = record(value);
  if (!input || !boundedString(input.id) || !boundedString(input.syncItemId) || !boundedString(input.supplierProductCode) || !boundedString(input.sourcePath) || !boundedString(input.observedAt)) return null;
  if (!["login", "search_results", "product", "cart", "diagnostic", "unknown"].includes(String(input.sourcePageType))) return null;
  if (!Array.isArray(input.matchEvidence) || !Array.isArray(input.conflicts)) return null;
  try { return { ...input, normalizedProduct: validateNormalizedSupplierProduct(input.normalizedProduct) } as SupplierProductCandidate; } catch { return null; }
}

function parsePrice(value: unknown): SupplierPriceObservation | null {
  const input = record(value);
  if (!input) return null;
  for (const key of ["id", "syncItemId", "candidateId", "tenantId", "supplierId", "supplierProductCode", "currency", "rawPriceText", "rawUnitText", "observedAt"] as const) if (!boundedString(input[key])) return null;
  for (const key of ["amount", "minimumQuantity", "packageQuantity", "normalizedAmount"] as const) if (input[key] !== null && !finite(input[key])) return null;
  if (!finite(input.normalizationConfidence) || !nullableString(input.normalizationCalculation) || !nullableString(input.supplierAccountId)) return null;
  if (!["piece", "sheet", "m2", "linear_meter", "pair", "set", "package", "unknown"].includes(String(input.priceBasis))) return null;
  if (!["piece", "sheet", "m2", "linear_meter", "pair", "set", "package", "unknown"].includes(String(input.normalizedPriceBasis))) return null;
  if (!["included", "excluded", "unknown"].includes(String(input.vatMode))) return null;
  return input as SupplierPriceObservation;
}

export function parseSupplierSyncSessionView(value: unknown): SupplierSyncSessionView | null {
  const input = record(value);
  if (!input || input.schemaVersion !== SUPPLIER_BRIDGE_SCHEMA_VERSION || !Array.isArray(input.items) || !Array.isArray(input.candidates) || !Array.isArray(input.priceObservations)) return null;
  const session = parseSession(input.session);
  const items = input.items.map(parseItem);
  const candidates = input.candidates.map(parseCandidate);
  const priceObservations = input.priceObservations.map(parsePrice);
  const counts = record(input.counts);
  if (!session || items.some((item) => !item) || candidates.some((candidate) => !candidate) || priceObservations.some((price) => !price) || !counts) return null;
  for (const key of ["total", "processed", "pending", "needsConfirmation", "completed", "skipped", "failed"] as const) if (!finite(counts[key]) || counts[key] < 0) return null;
  const typedItems = items as SupplierSyncItem[];
  const currentItemId = record(input.currentItem)?.id;
  const currentItem = input.currentItem === null ? null : typeof currentItemId === "string" ? typedItems.find((item) => item.id === currentItemId) ?? null : null;
  if (input.currentItem !== null && !currentItem) return null;
  return { schemaVersion: SUPPLIER_BRIDGE_SCHEMA_VERSION, session, items: typedItems, candidates: candidates as SupplierProductCandidate[], priceObservations: priceObservations as SupplierPriceObservation[], counts: counts as SupplierSyncSessionView["counts"], currentItem };
}
