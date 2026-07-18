export const SUPPLIER_BRIDGE_SCHEMA_VERSION = 1 as const;

export type SupplierCapability =
  | "capture_current_product"
  | "capture_visible_results"
  | "capture_cart"
  | "build_search_url"
  | "automated_search";

export type SupplierSyncSessionStatus = "pending" | "active" | "completed" | "cancelled" | "expired" | "failed";
export type SupplierSyncItemStatus = "pending" | "needs_confirmation" | "confirmed" | "skipped" | "failed";
export type SupplierSourcePageType = "login" | "search_results" | "product" | "cart" | "diagnostic" | "unknown";
export type SupplierPriceBasis = "piece" | "sheet" | "m2" | "linear_meter" | "pair" | "set" | "package" | "unknown";
export type SupplierVatMode = "included" | "excluded" | "unknown";
export type SupplierProductAvailability = "available" | "unavailable" | "unknown";
export type SupplierId = "demos" | "schachermayer" | "hranipex" | "jaf_holz" | "mock-supplier";
export type SupplierExpectedProductType = "board" | "worktop" | "edge_band" | "hinge" | "drawer_system" | "hardware" | "component" | "unknown";
export type SupplierLookupStatus =
  | "created"
  | "waiting_for_extension"
  | "checking_session"
  | "waiting_for_login"
  | "opening_supplier"
  | "searching"
  | "loading_product"
  | "extracting"
  | "needs_confirmation"
  | "completed"
  | "not_found"
  | "failed"
  | "cancelled";

export type SupplierLookupRequest = {
  requestId: string;
  projectId: string;
  materialAssignmentId: string;
  supplierId: SupplierId;
  supplierProductId: string;
  expectedProductType: SupplierExpectedProductType;
  expectedManufacturer?: string;
  expectedThicknessMm?: number;
};

export type SupplierExactLookup = {
  requestId: string;
  supplierId: SupplierId;
  supplierProductId: string;
  rawSupplierProductId: string;
  lookupStatus: SupplierLookupStatus;
};

export type SupplierSyncSession = {
  id: string;
  tenantId: string;
  projectId: string;
  userId: string;
  supplierId: string;
  status: SupplierSyncSessionStatus;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
};

export type SupplierSyncItem = {
  id: string;
  sessionId: string;
  materialAssignmentId: string;
  /** Authoritative base category for scoped targets; never infer it from an opaque item ID. */
  assignmentCategory?: import("../project-materials/project-material-types").MaterialAssignmentCategory;
  targetLabel?: string;
  targetScope?: "general" | "module" | "addition";
  query: string;
  expectedManufacturer: string | null;
  expectedDecorCode: string | null;
  expectedSurfaceCode: string | null;
  expectedProductType: string | null;
  expectedThicknessMm: number | null;
  exactLookup: SupplierExactLookup | null;
  status: SupplierSyncItemStatus;
  selectedCandidateId: string | null;
  errorCode: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SupplierCatalogItem = {
  id: string;
  tenantId: string;
  supplierId: SupplierId;
  supplierProductId: string;
  name: string;
  manufacturer: string | null;
  productType: SupplierExpectedProductType | "other";
  metadata: Record<string, unknown>;
  firstObservedAt: string;
  lastObservedAt: string;
  lastVerifiedAt: string;
};

export type MaterialSupplierAssignment = {
  tenantId: string;
  materialAssignmentId: string;
  supplierCatalogItemId: string;
  selectedPriceObservationId: string | null;
  assignedByUserId: string;
  assignedAt: string;
  priceLocked: boolean;
};

export type NormalizedSupplierProduct = {
  displayName: string;
  manufacturer: string | null;
  decorCode: string | null;
  surfaceCode: string | null;
  productType: string | null;
  thicknessMm: number | null;
  widthMm: number | null;
  lengthMm: number | null;
  availability: SupplierProductAvailability;
};

export type SupplierMatchEvidence = {
  field: "manufacturer" | "decorCode" | "surfaceCode" | "productType" | "thickness" | "supplierProductCode";
  expected: string | number | null;
  observed: string | number | null;
  matched: boolean;
  score: number;
  explanation: string;
};

export type SupplierMatchConflict = {
  code: "PRODUCT_TYPE_MISMATCH" | "THICKNESS_MISMATCH";
  field: "productType" | "thickness";
  expected: string | number;
  observed: string | number;
  hard: true;
  explanation: string;
};

export type SupplierProductCandidate = {
  id: string;
  syncItemId: string;
  supplierProductCode: string;
  normalizedProduct: NormalizedSupplierProduct;
  matchEvidence: SupplierMatchEvidence[];
  conflicts: SupplierMatchConflict[];
  sourcePageType: SupplierSourcePageType;
  sourcePath: string;
  observedAt: string;
};

export type SupplierPriceObservation = {
  id: string;
  syncItemId: string;
  candidateId: string;
  tenantId: string;
  supplierId: string;
  supplierAccountId: string | null;
  supplierProductCode: string;
  amount: number | null;
  currency: string;
  priceBasis: SupplierPriceBasis;
  vatMode: SupplierVatMode;
  minimumQuantity: number | null;
  packageQuantity: number | null;
  rawPriceText: string;
  rawUnitText: string;
  normalizedAmount: number | null;
  normalizedPriceBasis: SupplierPriceBasis;
  normalizationCalculation: string | null;
  normalizationConfidence: number;
  observedAt: string;
  lastVerifiedAt?: string;
};

export type MaterialSupplierMapping = {
  tenantId: string;
  supplierId: string;
  manufacturer: string;
  decorCode: string;
  surfaceCode: string;
  productType: string;
  thicknessMm: number;
  supplierProductCode: string;
  createdByUserId: string;
  confirmedAt: string;
};

export type SupplierCandidateSubmission = {
  submissionId: string;
  syncItemId: string;
  supplierProductCode: string;
  normalizedProduct: NormalizedSupplierProduct;
  sourcePageType: SupplierSourcePageType;
  sourcePath: string;
  observedAt: string;
  price: Omit<SupplierPriceObservation, "id" | "syncItemId" | "candidateId" | "tenantId" | "supplierId" | "supplierProductCode"> | null;
};

export type SupplierSyncCounts = {
  total: number;
  processed: number;
  pending: number;
  needsConfirmation: number;
  completed: number;
  skipped: number;
  failed: number;
};

export type SupplierSyncSessionView = {
  schemaVersion: typeof SUPPLIER_BRIDGE_SCHEMA_VERSION;
  session: SupplierSyncSession;
  items: SupplierSyncItem[];
  candidates: SupplierProductCandidate[];
  priceObservations: SupplierPriceObservation[];
  counts: SupplierSyncCounts;
  currentItem: SupplierSyncItem | null;
};

export type SupplierBridgeSessionCreation = {
  view: SupplierSyncSessionView;
  bridgeToken: string;
};

export type SupplierBridgeAttachment = {
  view: SupplierSyncSessionView;
  accessToken: string;
  accessTokenExpiresAt: string;
};

export type SupplierBridgeTokenKind = "bridge_once" | "session_access";

export type SupplierBridgeTokenRecord = {
  id: string;
  tenantId: string;
  userId: string;
  sessionId: string;
  kind: SupplierBridgeTokenKind;
  tokenHash: string;
  createdAt: string;
  expiresAt: string;
  usedAt: string | null;
};

export type SupplierBridgeTenantState = {
  schemaVersion: typeof SUPPLIER_BRIDGE_SCHEMA_VERSION;
  sessions: SupplierSyncSession[];
  items: SupplierSyncItem[];
  candidates: SupplierProductCandidate[];
  priceObservations: SupplierPriceObservation[];
  mappings: MaterialSupplierMapping[];
  catalogItems: SupplierCatalogItem[];
  materialSupplierAssignments: MaterialSupplierAssignment[];
  tokens: SupplierBridgeTokenRecord[];
  submissionKeys: Array<{ sessionId: string; syncItemId: string; submissionId: string; candidateId: string }>;
};

export function createEmptySupplierBridgeTenantState(): SupplierBridgeTenantState {
  return {
    schemaVersion: SUPPLIER_BRIDGE_SCHEMA_VERSION,
    sessions: [],
    items: [],
    candidates: [],
    priceObservations: [],
    mappings: [],
    catalogItems: [],
    materialSupplierAssignments: [],
    tokens: [],
    submissionKeys: []
  };
}
