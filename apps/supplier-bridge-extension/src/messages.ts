import type {
  NormalizedSupplierProduct,
  SupplierExpectedProductType,
  SupplierPriceObservation,
  SupplierSourcePageType,
  SupplierSyncSessionView
} from "../../../src/core/supplier-bridge/supplier-bridge-types";
import { validateSupplierCandidateSubmission } from "../../../src/core/supplier-bridge/supplier-bridge-validation";
import { parseSupplierSyncSessionView } from "../../../src/core/supplier-bridge/supplier-session-view-validation";

export const BRIDGE_CHANNEL = "arcigy-supplier-bridge" as const;

export type ArcigyWindowRequest = {
  source: "ARCIGY_WEB";
  type: "START_SUPPLIER_SESSION" | "OPEN_SUPPLIER_BRIDGE" | "GET_SUPPLIER_SESSION_STATUS" | "CANCEL_SUPPLIER_SESSION" | "SET_SUPPLIER_PROJECT_CONTEXT";
  requestId: string;
  nonce: string;
  sessionId: string;
  bridgeToken?: string;
  projectId?: string;
  projectLabel?: string;
};

export type ArcigyWindowResponse = {
  source: "ARCIGY_EXTENSION";
  type: "ARCIGY_BRIDGE_READY" | "SUPPLIER_BRIDGE_RESULT";
  requestId: string;
  nonce: string;
  sessionId: string | null;
  ok: boolean;
  opened: boolean;
  errorCode: string | null;
};

export type BridgeRuntimeRequest =
  | {
      channel: typeof BRIDGE_CHANNEL;
      type: "START_SUPPLIER_SESSION";
      requestId: string;
      nonce: string;
      sessionId: string;
      bridgeToken: string;
      arcigyOrigin: string;
      projectLabel: string;
    }
  | {
      channel: typeof BRIDGE_CHANNEL;
      type: "SET_SUPPLIER_PROJECT_CONTEXT";
      requestId: string;
      nonce: string;
      sessionId: string;
      arcigyOrigin: string;
      projectId: string;
      projectLabel: string;
    }
  | {
      channel: typeof BRIDGE_CHANNEL;
      type: "OPEN_SUPPLIER_BRIDGE" | "GET_SUPPLIER_SESSION_STATUS" | "CANCEL_SUPPLIER_SESSION";
      requestId: string;
      nonce: string;
      sessionId: string;
      arcigyOrigin: string;
    }
  | {
      channel: typeof BRIDGE_CHANNEL;
      type: "SIDE_PANEL_COMMAND";
      command: "status" | "open_supplier" | "capture" | "assign_current" | "confirm" | "skip" | "cancel" | "analyze";
      candidateId?: string;
      syncItemId?: string;
    }
  | {
      channel: typeof BRIDGE_CHANNEL;
      type: "CAPTURE_SUPPLIER_PAGE";
    }
  | {
      channel: typeof BRIDGE_CHANNEL;
      type: "CAPTURE_ACTIVE_SUPPLIER_PRODUCT";
    }
  | {
      channel: typeof BRIDGE_CHANNEL;
      type: "CAPTURE_EXACT_SUPPLIER_PRODUCT";
      requestedProductId: string;
      expectedProductType: SupplierExpectedProductType;
      expectedManufacturer: string | null;
      expectedThicknessMm: number | null;
    }
  | {
      channel: typeof BRIDGE_CHANNEL;
      type: "CAPTURE_CURRENT_SUPPLIER_PRODUCT";
      expectedProductType: SupplierExpectedProductType;
      expectedManufacturer: string | null;
      expectedThicknessMm: number | null;
    }
  | {
      channel: typeof BRIDGE_CHANNEL;
      type: "START_DIAGNOSTIC_PICK";
      field: DiagnosticField;
      pageType: SupplierSourcePageType;
    }
  | {
      channel: typeof BRIDGE_CHANNEL;
      type: "ANALYZE_SUPPLIER_PAGE";
    };

export type BridgeRuntimeResponse = {
  ok: boolean;
  opened?: boolean;
  errorCode?: string | null;
  message?: string;
  view?: SupplierSyncSessionView | null;
  capture?: SupplierPageCapture;
  diagnostic?: DiagnosticFieldCapture;
  analysis?: DiagnosticPageAnalysis;
};

export type CapturedSupplierCandidate = {
  supplierProductCode: string;
  normalizedProduct: NormalizedSupplierProduct;
  sourcePageType: SupplierSourcePageType;
  sourcePath: string;
  observedAt: string;
  price: Omit<SupplierPriceObservation, "id" | "syncItemId" | "candidateId" | "tenantId" | "supplierId" | "supplierProductCode"> | null;
};

export type SupplierPageCapture = {
  supplierId: string;
  pageType: SupplierSourcePageType;
  candidates: CapturedSupplierCandidate[];
  warnings: string[];
  errorCode: string | null;
};

export const DIAGNOSTIC_FIELDS = [
  "searchInput", "searchButton", "productName", "productCode", "customerPrice", "listPrice",
  "price", "unit", "dimensions", "thickness", "availability"
] as const;
export type DiagnosticField = typeof DIAGNOSTIC_FIELDS[number];

export type DiagnosticNodeSnapshot = {
  tagName: string;
  id: string | null;
  classes: string[];
  attributes: Record<string, string>;
  textContent: string;
  candidateSelectors: string[];
};

export type DiagnosticFieldCapture = {
  field: DiagnosticField;
  selected: DiagnosticNodeSnapshot;
  parents: DiagnosticNodeSnapshot[];
  siblings: DiagnosticNodeSnapshot[];
  pathname: string;
  pageType: SupplierSourcePageType;
  extensionVersion: string;
};

export type DiagnosticPageAnalysis = {
  supplierId: string;
  origin: string;
  pathname: string;
  pageType: SupplierSourcePageType;
  sessionStatus: "logged_in" | "logged_out" | "unknown";
  fields: Partial<Record<DiagnosticField, DiagnosticFieldCapture>>;
  missingFields: DiagnosticField[];
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function safeText(value: unknown, maxLength = 8_192): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength;
}

export function parseArcigyWindowRequest(value: unknown): ArcigyWindowRequest | null {
  const input = record(value);
  if (!input || input.source !== "ARCIGY_WEB") return null;
  if (!["START_SUPPLIER_SESSION", "OPEN_SUPPLIER_BRIDGE", "GET_SUPPLIER_SESSION_STATUS", "CANCEL_SUPPLIER_SESSION", "SET_SUPPLIER_PROJECT_CONTEXT"].includes(String(input.type))) return null;
  if (!safeText(input.requestId, 160) || !safeText(input.nonce, 160) || !safeText(input.sessionId, 200)) return null;
  if (input.type === "START_SUPPLIER_SESSION" && !safeText(input.bridgeToken, 8_192)) return null;
  if (input.type === "SET_SUPPLIER_PROJECT_CONTEXT" && (!safeText(input.projectId, 200) || typeof input.projectLabel !== "string" || input.projectLabel.length > 300)) return null;
  return {
    source: "ARCIGY_WEB",
    type: input.type as ArcigyWindowRequest["type"],
    requestId: input.requestId,
    nonce: input.nonce,
    sessionId: input.sessionId,
    ...(typeof input.bridgeToken === "string" ? { bridgeToken: input.bridgeToken } : {}),
    ...(typeof input.projectId === "string" ? { projectId: input.projectId } : {}),
    ...(typeof input.projectLabel === "string" ? { projectLabel: input.projectLabel.slice(0, 300) } : {})
  };
}

export function parseBridgeRuntimeRequest(value: unknown): BridgeRuntimeRequest | null {
  const input = record(value);
  if (!input || input.channel !== BRIDGE_CHANNEL || !safeText(input.type, 80)) return null;
  if (input.type === "SIDE_PANEL_COMMAND") {
    if (!["status", "open_supplier", "capture", "assign_current", "confirm", "skip", "cancel", "analyze"].includes(String(input.command))) return null;
    return {
      channel: BRIDGE_CHANNEL,
      type: "SIDE_PANEL_COMMAND",
      command: input.command as Extract<BridgeRuntimeRequest, { type: "SIDE_PANEL_COMMAND" }>["command"],
      ...(typeof input.candidateId === "string" ? { candidateId: input.candidateId } : {}),
      ...(typeof input.syncItemId === "string" ? { syncItemId: input.syncItemId } : {})
    };
  }
  if (input.type === "CAPTURE_SUPPLIER_PAGE" || input.type === "CAPTURE_ACTIVE_SUPPLIER_PRODUCT") {
    return { channel: BRIDGE_CHANNEL, type: input.type };
  }
  if (input.type === "CAPTURE_EXACT_SUPPLIER_PRODUCT") {
    if (!safeText(input.requestedProductId, 160)) return null;
    if (!["board", "worktop", "edge_band", "hinge", "drawer_system", "handle", "lift_up", "leg", "fastener", "lighting", "hardware", "component", "unknown"].includes(String(input.expectedProductType))) return null;
    if (input.expectedManufacturer !== null && typeof input.expectedManufacturer !== "string") return null;
    if (input.expectedThicknessMm !== null && (typeof input.expectedThicknessMm !== "number" || !Number.isFinite(input.expectedThicknessMm))) return null;
    return {
      channel: BRIDGE_CHANNEL,
      type: "CAPTURE_EXACT_SUPPLIER_PRODUCT",
      requestedProductId: input.requestedProductId,
      expectedProductType: input.expectedProductType as SupplierExpectedProductType,
      expectedManufacturer: input.expectedManufacturer as string | null,
      expectedThicknessMm: input.expectedThicknessMm as number | null
    };
  }
  if (input.type === "CAPTURE_CURRENT_SUPPLIER_PRODUCT") {
    if (!["board", "worktop", "edge_band", "hinge", "drawer_system", "handle", "lift_up", "leg", "fastener", "lighting", "hardware", "component", "unknown"].includes(String(input.expectedProductType))) return null;
    if (input.expectedManufacturer !== null && typeof input.expectedManufacturer !== "string") return null;
    if (input.expectedThicknessMm !== null && (typeof input.expectedThicknessMm !== "number" || !Number.isFinite(input.expectedThicknessMm))) return null;
    return {
      channel: BRIDGE_CHANNEL,
      type: "CAPTURE_CURRENT_SUPPLIER_PRODUCT",
      expectedProductType: input.expectedProductType as SupplierExpectedProductType,
      expectedManufacturer: input.expectedManufacturer as string | null,
      expectedThicknessMm: input.expectedThicknessMm as number | null
    };
  }
  if (input.type === "ANALYZE_SUPPLIER_PAGE") return { channel: BRIDGE_CHANNEL, type: "ANALYZE_SUPPLIER_PAGE" };
  if (input.type === "START_DIAGNOSTIC_PICK") {
    if (!(DIAGNOSTIC_FIELDS as readonly string[]).includes(String(input.field))) return null;
    if (!["login", "search_results", "product", "cart", "diagnostic", "unknown"].includes(String(input.pageType))) return null;
    return {
      channel: BRIDGE_CHANNEL,
      type: "START_DIAGNOSTIC_PICK",
      field: input.field as DiagnosticField,
      pageType: input.pageType as SupplierSourcePageType
    };
  }
  if (!["START_SUPPLIER_SESSION", "OPEN_SUPPLIER_BRIDGE", "GET_SUPPLIER_SESSION_STATUS", "CANCEL_SUPPLIER_SESSION", "SET_SUPPLIER_PROJECT_CONTEXT"].includes(input.type)) return null;
  if (!safeText(input.requestId, 160) || !safeText(input.nonce, 160) || !safeText(input.sessionId, 200) || !safeText(input.arcigyOrigin, 300)) return null;
  if (input.type === "START_SUPPLIER_SESSION") {
    if (!safeText(input.bridgeToken, 8_192)) return null;
    return {
      channel: BRIDGE_CHANNEL,
      type: "START_SUPPLIER_SESSION",
      requestId: input.requestId,
      nonce: input.nonce,
      sessionId: input.sessionId,
      bridgeToken: input.bridgeToken,
      arcigyOrigin: input.arcigyOrigin,
      projectLabel: typeof input.projectLabel === "string" ? input.projectLabel.slice(0, 300) : ""
    };
  }
  if (input.type === "SET_SUPPLIER_PROJECT_CONTEXT") {
    if (!safeText(input.projectId, 200) || typeof input.projectLabel !== "string" || input.projectLabel.length > 300) return null;
    return {
      channel: BRIDGE_CHANNEL,
      type: "SET_SUPPLIER_PROJECT_CONTEXT",
      requestId: input.requestId,
      nonce: input.nonce,
      sessionId: input.sessionId,
      arcigyOrigin: input.arcigyOrigin,
      projectId: input.projectId,
      projectLabel: input.projectLabel
    };
  }
  return {
    channel: BRIDGE_CHANNEL,
    type: input.type as "OPEN_SUPPLIER_BRIDGE" | "GET_SUPPLIER_SESSION_STATUS" | "CANCEL_SUPPLIER_SESSION",
    requestId: input.requestId,
    nonce: input.nonce,
    sessionId: input.sessionId,
    arcigyOrigin: input.arcigyOrigin
  };
}

export function parseSupplierPageCapture(value: unknown): SupplierPageCapture | null {
  const input = record(value);
  if (!input || !safeText(input.supplierId, 160) || !Array.isArray(input.candidates) || !Array.isArray(input.warnings)) return null;
  if (!["login", "search_results", "product", "cart", "diagnostic", "unknown"].includes(String(input.pageType))) return null;
  const candidates: CapturedSupplierCandidate[] = [];
  for (const rawCandidate of input.candidates) {
    const candidate = record(rawCandidate);
    if (!candidate || !safeText(candidate.supplierProductCode, 160) || !record(candidate.normalizedProduct)) return null;
    if (!safeText(candidate.sourcePath, 1_024) || candidate.sourcePath.includes("?") || !safeText(candidate.observedAt, 64)) return null;
    try {
      const validated = validateSupplierCandidateSubmission({
        submissionId: "capture-validation",
        syncItemId: "capture-validation",
        supplierProductCode: candidate.supplierProductCode,
        normalizedProduct: candidate.normalizedProduct,
        sourcePageType: candidate.sourcePageType,
        sourcePath: candidate.sourcePath,
        observedAt: candidate.observedAt,
        price: candidate.price ?? null
      });
      candidates.push({
        supplierProductCode: validated.supplierProductCode,
        normalizedProduct: validated.normalizedProduct,
        sourcePageType: validated.sourcePageType,
        sourcePath: validated.sourcePath,
        observedAt: validated.observedAt,
        price: validated.price
      });
    } catch {
      return null;
    }
  }
  if (!input.warnings.every((warning) => typeof warning === "string" && warning.length <= 500)) return null;
  return {
    supplierId: input.supplierId,
    pageType: input.pageType as SupplierSourcePageType,
    candidates,
    warnings: [...input.warnings] as string[],
    errorCode: typeof input.errorCode === "string" ? input.errorCode : null
  };
}

function parseDiagnosticNode(value: unknown): DiagnosticNodeSnapshot | null {
  const input = record(value);
  if (!input || !safeText(input.tagName, 80) || (input.id !== null && typeof input.id !== "string")) return null;
  if (!Array.isArray(input.classes) || !input.classes.every((entry) => typeof entry === "string" && entry.length <= 180)) return null;
  const attributes = record(input.attributes);
  if (!attributes || !Object.entries(attributes).every(([name, entry]) => name.length <= 180 && typeof entry === "string" && entry.length <= 240)) return null;
  if (typeof input.textContent !== "string" || input.textContent.length > 500) return null;
  if (!Array.isArray(input.candidateSelectors) || !input.candidateSelectors.every((entry) => typeof entry === "string" && entry.length <= 500)) return null;
  return {
    tagName: input.tagName,
    id: input.id as string | null,
    classes: [...input.classes] as string[],
    attributes: { ...attributes } as Record<string, string>,
    textContent: input.textContent,
    candidateSelectors: [...input.candidateSelectors] as string[]
  };
}

export function parseDiagnosticFieldCapture(value: unknown): DiagnosticFieldCapture | null {
  const input = record(value);
  if (!input || !(DIAGNOSTIC_FIELDS as readonly string[]).includes(String(input.field))) return null;
  if (!["login", "search_results", "product", "cart", "diagnostic", "unknown"].includes(String(input.pageType))) return null;
  if (!safeText(input.pathname, 1_024) || input.pathname.includes("?") || !safeText(input.extensionVersion, 80)) return null;
  if (!Array.isArray(input.parents) || input.parents.length > 2 || !Array.isArray(input.siblings) || input.siblings.length > 2) return null;
  const selected = parseDiagnosticNode(input.selected);
  const parents = input.parents.map(parseDiagnosticNode);
  const siblings = input.siblings.map(parseDiagnosticNode);
  if (!selected || parents.some((node) => !node) || siblings.some((node) => !node)) return null;
  return {
    field: input.field as DiagnosticField,
    selected,
    parents: parents as DiagnosticNodeSnapshot[],
    siblings: siblings as DiagnosticNodeSnapshot[],
    pathname: input.pathname,
    pageType: input.pageType as SupplierSourcePageType,
    extensionVersion: input.extensionVersion
  };
}

export function parseDiagnosticPageAnalysis(value: unknown): DiagnosticPageAnalysis | null {
  const input = record(value);
  if (!input || !safeText(input.supplierId, 160) || !safeText(input.origin, 300) || !safeText(input.pathname, 1_024)) return null;
  if (input.pathname.includes("?") || !["login", "search_results", "product", "cart", "diagnostic", "unknown"].includes(String(input.pageType))) return null;
  if (!["logged_in", "logged_out", "unknown"].includes(String(input.sessionStatus))) return null;
  const rawFields = record(input.fields);
  if (!rawFields || !Array.isArray(input.missingFields) || !input.missingFields.every((field) => (DIAGNOSTIC_FIELDS as readonly string[]).includes(String(field)))) return null;
  const fields: Partial<Record<DiagnosticField, DiagnosticFieldCapture>> = {};
  for (const [field, rawCapture] of Object.entries(rawFields)) {
    if (!(DIAGNOSTIC_FIELDS as readonly string[]).includes(field)) return null;
    const capture = parseDiagnosticFieldCapture(rawCapture);
    if (!capture || capture.field !== field) return null;
    fields[field as DiagnosticField] = capture;
  }
  return {
    supplierId: input.supplierId,
    origin: input.origin,
    pathname: input.pathname,
    pageType: input.pageType as SupplierSourcePageType,
    sessionStatus: input.sessionStatus as DiagnosticPageAnalysis["sessionStatus"],
    fields,
    missingFields: [...input.missingFields] as DiagnosticField[]
  };
}

export function parseBridgeRuntimeResponse(value: unknown): BridgeRuntimeResponse | null {
  const input = record(value);
  if (!input || typeof input.ok !== "boolean") return null;
  if (input.opened !== undefined && typeof input.opened !== "boolean") return null;
  if (input.errorCode !== undefined && input.errorCode !== null && !safeText(input.errorCode, 160)) return null;
  if (input.message !== undefined && typeof input.message !== "string") return null;
  const view = input.view === undefined || input.view === null ? input.view : parseSupplierSyncSessionView(input.view);
  if (input.view !== undefined && input.view !== null && !view) return null;
  const capture = input.capture === undefined ? undefined : parseSupplierPageCapture(input.capture);
  if (input.capture !== undefined && !capture) return null;
  const diagnostic = input.diagnostic === undefined ? undefined : parseDiagnosticFieldCapture(input.diagnostic);
  if (input.diagnostic !== undefined && !diagnostic) return null;
  const analysis = input.analysis === undefined ? undefined : parseDiagnosticPageAnalysis(input.analysis);
  if (input.analysis !== undefined && !analysis) return null;
  return {
    ok: input.ok,
    ...(typeof input.opened === "boolean" ? { opened: input.opened } : {}),
    ...(input.errorCode === null || typeof input.errorCode === "string" ? { errorCode: input.errorCode } : {}),
    ...(typeof input.message === "string" ? { message: input.message.slice(0, 2_000) } : {}),
    ...(view !== undefined ? { view: view ?? null } : {}),
    ...(capture ? { capture } : {}),
    ...(diagnostic ? { diagnostic } : {}),
    ...(analysis ? { analysis } : {})
  };
}
