import type http from "node:http";
import type { ClientContext } from "../core/client/client-context";
import { createProjectService } from "../core/project/project-service";
import {
  createSupplierBridgeService,
  SupplierBridgeServiceError,
  type SupplierSyncMaterialInput
} from "../core/supplier-bridge/supplier-bridge-service";
import {
  SupplierBridgeValidationError,
  validateConfirmSupplierCandidateRequest,
  validateCreateSupplierSessionRequest,
  validateSkipSupplierItemRequest,
  validateSupplierCandidateSubmission
} from "../core/supplier-bridge/supplier-bridge-validation";
import { createServerProjectRepository } from "./projectRepository";
import { createServerCatalogRepository, createServerSupplierBridgeRepository, createServerSupplierConfigurationRepository } from "./serverRepositories";
import { resolveProjectMaterialScopes } from "./projectMaterialScopes";
import { applyConfirmedSupplierCandidateToProject } from "./supplierBridgeProjectUpdater";
import type { SupplierLookupRequest } from "../core/supplier-bridge/supplier-bridge-types";
import type { MaterialAssignmentCategory, ProjectMaterialAssignment } from "../core/project-materials/project-material-types";
import {
  resolveEffectiveProjectMaterialAssignment,
  topLevelProjectMaterialAssignments
} from "../core/project-materials/project-material-assignment-resolution";
import { clientSessionHeaderFromRequest } from "./requestAuthentication";
import { SupplierBridgePersistenceError } from "../core/supplier-bridge/supplier-bridge-postgres-repository";
import { supplierExpectedProductTypeForMaterialCategory } from "../core/supplier-bridge/supplier-target-contract";
import { resolveDemosPreviewImageColor, SupplierPreviewImageError } from "./supplierBridgePreviewImage";
import { logSupplierBridge } from "../core/supplier-bridge/supplier-bridge-logger";

type SupplierBridgeEndpointDeps = {
  projectRoot: string;
  getContext: (cookieHeader: string | string[] | undefined) => Promise<ClientContext>;
  readJsonBody: (req: http.IncomingMessage) => Promise<unknown>;
  sendJson: (res: http.ServerResponse, status: number, data: unknown) => void;
};

type WebRoute = {
  kind: "web";
  projectId: string;
  action: "create" | "status" | "cancel";
  sessionId: string | null;
};

type ExtensionRoute = {
  kind: "extension";
  sessionId: string;
  action: "attach" | "status" | "preview_color" | "candidate" | "confirm" | "skip" | "cancel";
};

type Route = WebRoute | ExtensionRoute | { kind: "configuration" };

function decoded(value: string): string | null {
  try {
    return decodeURIComponent(value);
  } catch {
    return null;
  }
}

function parseRoute(pathname: string): Route | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] !== "api") return null;
  if (parts.length === 2 && parts[1] === "suppliers") return { kind: "configuration" };
  if (parts[1] === "projects" && parts[2] && parts[3] === "supplier-sync-sessions") {
    const projectId = decoded(parts[2]);
    if (!projectId) return null;
    if (parts.length === 4) return { kind: "web", projectId, action: "create", sessionId: null };
    const sessionId = parts[4] ? decoded(parts[4]) : null;
    if (!sessionId) return null;
    if (parts.length === 5) return { kind: "web", projectId, action: "status", sessionId };
    if (parts.length === 6 && parts[5] === "cancel") return { kind: "web", projectId, action: "cancel", sessionId };
  }
  if (parts[1] === "supplier-bridge" && parts[2] === "sessions" && parts[3]) {
    const sessionId = decoded(parts[3]);
    if (!sessionId) return null;
    if (parts.length === 4) return { kind: "extension", sessionId, action: "status" };
    const action = parts[4];
    if (action === "attach" || action === "preview-color" || action === "candidates" || action === "confirm" || action === "skip" || action === "cancel") {
      return {
        kind: "extension",
        sessionId,
        action: action === "preview-color" ? "preview_color" : action === "candidates" ? "candidate" : action
      };
    }
  }
  return null;
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new SupplierBridgeValidationError(`${path} must be an object.`);
  const result = value as Record<string, unknown>;
  if ("clientId" in result || "tenantId" in result || "userId" in result) {
    throw new SupplierBridgeValidationError(`${path} cannot set tenant or user scope.`);
  }
  return result;
}

function requiredText(value: unknown, path: string, maxLength = 8_192): string {
  if (typeof value !== "string" || !value.trim()) throw new SupplierBridgeValidationError(`${path} is required.`);
  if (value.length > maxLength) throw new SupplierBridgeValidationError(`${path} is too long.`);
  return value.trim();
}

function bearerToken(req: http.IncomingMessage): string {
  const raw = req.headers.authorization;
  if (typeof raw !== "string" || !raw.startsWith("Bearer ")) {
    throw new SupplierBridgeServiceError("Supplier bridge access token is required.", 401);
  }
  return requiredText(raw.slice("Bearer ".length), "Supplier bridge access token");
}

function previewColorRequest(value: unknown): { syncItemId: string; imageUrl: string } {
  const body = record(value, "supplier bridge preview image");
  return {
    syncItemId: requiredText(body.syncItemId, "supplier bridge preview image.syncItemId", 200),
    imageUrl: requiredText(body.imageUrl, "supplier bridge preview image.imageUrl", 2_048)
  };
}

function materialText(metadata: Record<string, unknown>, key: string): string | null {
  const value = metadata[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function manualTargetProductType(category: MaterialAssignmentCategory): string {
  return supplierExpectedProductTypeForMaterialCategory(category);
}

function currentAssignmentText(assignment: ProjectMaterialAssignment): string {
  const snapshot = assignment.kind === "material" ? assignment.snapshots.material : assignment.snapshots.component;
  const bridge = assignment.customValues.supplierBridge;
  const values = bridge && typeof bridge === "object" && !Array.isArray(bridge) ? bridge as Record<string, unknown> : {};
  const code = typeof values.supplierProductCode === "string" ? values.supplierProductCode : null;
  const width = typeof values.edgeWidthMm === "number" ? values.edgeWidthMm : null;
  const thickness = typeof values.edgeThicknessMm === "number" ? values.edgeThicknessMm : assignment.thicknessMm ?? null;
  if (!code) return "nepriradené";
  const dimensions = width != null || thickness != null ? ` · ${width ?? "—"} × ${thickness ?? "—"} mm` : "";
  return `${snapshot?.definition.displayName ?? "Produkt"} · ${code}${dimensions}`;
}

async function projectMaterialInputs(
  ctx: ClientContext,
  projectId: string,
  projectRoot: string,
  lookups: readonly SupplierLookupRequest[] = [],
  browseFirst = false
): Promise<SupplierSyncMaterialInput[]> {
  const service = createProjectService(createServerProjectRepository({ projectRoot }));
  const save = await service.loadProject(ctx, projectId);
  const assignments = save.appState.materialAssignments.assignments;
  const generalAssignments = topLevelProjectMaterialAssignments(assignments);
  const scopes = resolveProjectMaterialScopes(save, await createServerCatalogRepository(projectRoot).ensureCatalogExists(ctx));
  const scopedTargets = new Map<string, { scope: (typeof scopes)[number]; item: (typeof scopes)[number]["items"][number] }>(scopes.flatMap((scope) => scope.items.map((item) => [
    `material-assignment:${scope.id}:${item.category}:${item.id}`,
    { scope, item }
  ] as const)));
  const selectedAssignments: Array<{ assignment: ProjectMaterialAssignment; lookup: SupplierLookupRequest | null; materialAssignmentId?: string; targetLabel?: string; targetScope?: "general" | "module" | "addition" }> = lookups.length > 0
    ? lookups.map((lookup) => {
        if (lookup.projectId !== projectId) throw new SupplierBridgeValidationError("Supplier lookup projectId must match the route project.");
        const scoped = scopedTargets.get(lookup.materialAssignmentId);
        const assignment = scoped
          ? resolveEffectiveProjectMaterialAssignment(assignments, scoped.scope.id, scoped.item).assignment
          : assignments.find((candidate) => candidate.assignmentId === lookup.materialAssignmentId);
        if (!assignment) throw new SupplierBridgeValidationError(`Material assignment ${lookup.materialAssignmentId} was not found in the project.`);
        return {
          assignment,
          lookup,
          ...(scoped ? {
            materialAssignmentId: lookup.materialAssignmentId,
            targetLabel: `${scoped.scope.label} · ${scoped.item.label} · ${currentAssignmentText(assignment)}`,
            targetScope: scoped.scope.kind
          } : {})
        };
      })
    : [
      ...generalAssignments.map((assignment) => ({
        assignment,
        lookup: null,
        targetLabel: `${assignment.category}${assignment.customValues.splitIndex === 2 ? " · ohranenie 2" : ""} · ${currentAssignmentText(assignment)}`,
        targetScope: "general" as const
      })),
      ...scopes.flatMap((scope) => scope.items.flatMap((item) => {
        const effective = resolveEffectiveProjectMaterialAssignment(assignments, scope.id, item);
        if (!effective.assignment) return [];
        return [{ assignment: effective.assignment, lookup: null, materialAssignmentId: effective.assignmentId, targetLabel: `${scope.label} · ${item.label} · ${currentAssignmentText(effective.assignment)}`, targetScope: scope.kind }];
      }))
    ];
  return selectedAssignments.flatMap<SupplierSyncMaterialInput>(({ assignment, lookup, materialAssignmentId, targetLabel, targetScope }) => {
    const definition = assignment.kind === "material"
      ? assignment.snapshots.material?.definition
      : assignment.snapshots.component?.definition;
    // The extension deliberately allows selecting a supplier product for an
    // unassigned project target. Such a target has no catalog snapshot yet,
    // but the exact product code supplied by the extension is enough to start
    // a session; the confirmation flow creates the supplier snapshot.
    if (!definition && lookup) {
      return [{
        materialAssignmentId: materialAssignmentId ?? assignment.assignmentId,
        assignmentCategory: assignment.category,
        ...(assignment.variantKey ? { assignmentVariantKey: assignment.variantKey } : {}),
        ...(targetLabel ? { targetLabel } : {}),
        ...(targetScope ? { targetScope } : {}),
        query: lookup.supplierProductId,
        expectedManufacturer: lookup.expectedManufacturer ?? null,
        expectedDecorCode: null,
        expectedSurfaceCode: null,
        expectedProductType: lookup.expectedProductType ?? manualTargetProductType(assignment.category),
        expectedThicknessMm: lookup.expectedThicknessMm
          ?? (assignment.kind === "material" ? assignment.thicknessMm : null)
          ?? null,
        exactLookup: { requestId: lookup.requestId, supplierId: lookup.supplierId, supplierProductId: lookup.supplierProductId }
      }];
    }
    if (!definition) return [];
    const metadata = definition.metadata && typeof definition.metadata === "object" && !Array.isArray(definition.metadata)
      ? definition.metadata
      : {};
    const expectedManufacturer = lookup?.expectedManufacturer
      ?? (definition.entityType === "material" ? definition.manufacturer ?? definition.supplierId ?? definition.supplierSource?.supplier : definition.brand ?? definition.supplierId)
      ?? null;
    const expectedDecorCode = definition.entityType === "material"
      ? definition.materialCode ?? definition.supplierSource?.supplierProductId ?? definition.id
      : definition.componentCode ?? definition.id;
    const expectedSurfaceCode = definition.entityType === "material"
      ? materialText(metadata, "surfaceCode") ?? definition.subcategory ?? definition.category
      : definition.series ?? definition.variant ?? null;
    const expectedProductType = lookup?.expectedProductType
      ?? materialText(metadata, "productType")
      ?? (definition.entityType === "material" ? definition.materialType : definition.componentType);
    const expectedThicknessMm = lookup?.expectedThicknessMm
      ?? (assignment.kind === "material" ? assignment.thicknessMm ?? assignment.snapshots.material?.definition.defaultThicknessMm : null)
      ?? null;
    if (!lookup && browseFirst) {
      return [{
        materialAssignmentId: materialAssignmentId ?? assignment.assignmentId,
        assignmentCategory: assignment.category,
        ...(assignment.variantKey ? { assignmentVariantKey: assignment.variantKey } : {}),
        ...(targetLabel ? { targetLabel } : {}),
        ...(targetScope ? { targetScope } : {}),
        query: assignment.category,
        expectedManufacturer: null,
        expectedDecorCode: null,
        expectedSurfaceCode: null,
        expectedProductType: manualTargetProductType(assignment.category),
        expectedThicknessMm: null
      }];
    }
    const query = lookup?.supplierProductId ?? [expectedManufacturer, expectedDecorCode, expectedSurfaceCode, expectedProductType, expectedThicknessMm == null ? null : `${expectedThicknessMm} mm`]
      .filter((value): value is string => typeof value === "string" && value.length > 0)
      .join(" ");
    return [{
      materialAssignmentId: materialAssignmentId ?? assignment.assignmentId,
      assignmentCategory: assignment.category,
      ...(assignment.variantKey ? { assignmentVariantKey: assignment.variantKey } : {}),
      ...(targetLabel ? { targetLabel } : {}),
      ...(targetScope ? { targetScope } : {}),
      query,
      expectedManufacturer,
      expectedDecorCode,
      expectedSurfaceCode,
      expectedProductType,
      expectedThicknessMm,
      ...(lookup ? { exactLookup: { requestId: lookup.requestId, supplierId: lookup.supplierId, supplierProductId: lookup.supplierProductId } } : {})
    }];
  });
}

function createService(projectRoot: string) {
  return createSupplierBridgeService({
    repository: createServerSupplierBridgeRepository(projectRoot),
    applyConfirmedCandidate: (input) => applyConfirmedSupplierCandidateToProject(projectRoot, input)
  });
}

export async function handleSupplierBridgeApi(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
  deps: SupplierBridgeEndpointDeps
): Promise<boolean> {
  const route = parseRoute(url.pathname);
  if (!route) return false;
  const service = createService(deps.projectRoot);
  try {
    if (route.kind === "configuration") {
      if (req.method !== "GET") return false;
      const ctx = await deps.getContext(clientSessionHeaderFromRequest(req));
      const suppliers = await createServerSupplierConfigurationRepository().listEnabledForClient(ctx);
      deps.sendJson(res, 200, { ok: true, suppliers });
      return true;
    }
    if (route.kind === "web") {
      const ctx = await deps.getContext(clientSessionHeaderFromRequest(req));
      if (route.action === "create" && req.method === "POST") {
        const request = validateCreateSupplierSessionRequest(await deps.readJsonBody(req));
        if (request.projectId && request.projectId !== route.projectId) throw new SupplierBridgeValidationError("Supplier session projectId must match the route project.");
        const supplierIds = [...new Set(request.lookups.map((lookup) => lookup.supplierId))];
        const sessionSupplierId = supplierIds.length === 1 ? supplierIds[0]! : request.lookups.length > 0 ? "mixed" : request.supplierId;
        const materials = await projectMaterialInputs(ctx, route.projectId, deps.projectRoot, request.lookups, sessionSupplierId !== "mock-supplier");
        const requestedSupplierIds = supplierIds.length > 0 ? supplierIds : [sessionSupplierId];
        if (requestedSupplierIds.some((supplierId) => supplierId !== "mock-supplier")) {
          const configured = await createServerSupplierConfigurationRepository().listEnabledForClient(ctx);
          if (requestedSupplierIds.some((supplierId) => supplierId !== "mock-supplier" && !configured.some((supplier) => supplier.supplierId === supplierId))) {
            throw new SupplierBridgeServiceError("Supplier is not enabled for this client.", 403);
          }
        }
        const result = await service.createSession(ctx, route.projectId, sessionSupplierId, materials);
        deps.sendJson(res, 201, { ok: true, ...result });
        return true;
      }
      if (route.action === "status" && req.method === "GET" && route.sessionId) {
        deps.sendJson(res, 200, { ok: true, view: await service.getSessionForWeb(ctx, route.projectId, route.sessionId) });
        return true;
      }
      if (route.action === "cancel" && req.method === "POST" && route.sessionId) {
        deps.sendJson(res, 200, { ok: true, view: await service.cancelForWeb(ctx, route.projectId, route.sessionId) });
        return true;
      }
      return false;
    }

    if (route.action === "attach" && req.method === "POST") {
      const body = record(await deps.readJsonBody(req), "supplier bridge attachment");
      const bridgeToken = requiredText(body.bridgeToken, "supplier bridge attachment.bridgeToken");
      deps.sendJson(res, 200, { ok: true, ...(await service.attachSession(route.sessionId, bridgeToken)) });
      return true;
    }
    const accessToken = bearerToken(req);
    if (route.action === "status" && req.method === "GET") {
      deps.sendJson(res, 200, { ok: true, view: await service.getSessionForExtension(route.sessionId, accessToken) });
      return true;
    }
    if (route.action === "preview_color" && req.method === "POST") {
      const request = previewColorRequest(await deps.readJsonBody(req));
      const view = await service.getSessionForExtension(route.sessionId, accessToken);
      const item = view.items.find((candidate) => candidate.id === request.syncItemId);
      const supplierId = item?.exactLookup?.supplierId ?? view.session.supplierId;
      if (!item || supplierId !== "demos") throw new SupplierBridgeServiceError("Démos preview image is not authorized for this material target.", 403);
      const startedAt = Date.now();
      logSupplierBridge("info", { event: "preview_color_requested", sessionId: route.sessionId, syncItemId: item.id, status: "requested" });
      try {
        const previewColorHex = await resolveDemosPreviewImageColor(request.imageUrl);
        logSupplierBridge("info", { event: "preview_color_resolved", sessionId: route.sessionId, syncItemId: item.id, status: "derived", durationMs: Date.now() - startedAt, previewColorApplied: true });
        deps.sendJson(res, 200, { ok: true, previewColorHex });
      } catch (error) {
        logSupplierBridge("warn", { event: "preview_color_unavailable", sessionId: route.sessionId, syncItemId: item.id, status: "unavailable", durationMs: Date.now() - startedAt, errorCode: error instanceof SupplierPreviewImageError ? "SUPPLIER_PREVIEW_IMAGE_UNAVAILABLE" : "SUPPLIER_PREVIEW_IMAGE_FAILED" });
        throw error;
      }
      return true;
    }
    if (route.action === "candidate" && req.method === "POST") {
      const result = await service.submitCandidate(
        route.sessionId,
        accessToken,
        validateSupplierCandidateSubmission(await deps.readJsonBody(req))
      );
      deps.sendJson(res, result.idempotent ? 200 : 201, { ok: true, ...result });
      return true;
    }
    if (route.action === "confirm" && req.method === "POST") {
      const request = validateConfirmSupplierCandidateRequest(await deps.readJsonBody(req));
      deps.sendJson(res, 200, {
        ok: true,
        view: await service.confirmCandidate(route.sessionId, accessToken, request.syncItemId, request.candidateId)
      });
      return true;
    }
    if (route.action === "skip" && req.method === "POST") {
      const request = validateSkipSupplierItemRequest(await deps.readJsonBody(req));
      deps.sendJson(res, 200, {
        ok: true,
        view: await service.skipItem(route.sessionId, accessToken, request.syncItemId, request.errorCode)
      });
      return true;
    }
    if (route.action === "cancel" && req.method === "POST") {
      deps.sendJson(res, 200, { ok: true, view: await service.cancelForExtension(route.sessionId, accessToken) });
      return true;
    }
    return false;
  } catch (error) {
    if (error instanceof SupplierBridgeServiceError) {
      deps.sendJson(res, error.status, {
        ok: false,
        error: error.message,
        ...(error.errorCode ? { code: error.errorCode } : {})
      });
      return true;
    }
    if (error instanceof SupplierBridgeValidationError) {
      deps.sendJson(res, 400, { ok: false, error: error.message });
      return true;
    }
    if (error instanceof SupplierPreviewImageError) {
      deps.sendJson(res, 422, { ok: false, error: error.message, code: "SUPPLIER_PREVIEW_IMAGE_UNAVAILABLE" });
      return true;
    }
    if (error instanceof SupplierBridgePersistenceError) {
      deps.sendJson(res, 500, {
        ok: false,
        error: "Supplier Bridge database write failed.",
        code: `SUPPLIER_BRIDGE_DB_${error.bridgeStage}`
      });
      return true;
    }
    throw error;
  }
}
