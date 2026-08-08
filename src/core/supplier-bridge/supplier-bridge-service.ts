import { createHash, randomUUID } from "node:crypto";
import type { ClientContext } from "../client/client-context";
import { evaluateSupplierCandidateMatch } from "./supplier-matching";
import type {
  MaterialSupplierMapping,
  MaterialSupplierAssignment,
  SupplierBridgeAttachment,
  SupplierBridgeSessionCreation,
  SupplierCatalogItem,
  SupplierCandidateSubmission,
  SupplierId,
  SupplierPriceObservation,
  SupplierProductCandidate,
  SupplierSyncCounts,
  SupplierSyncItem,
  SupplierSyncSession,
  SupplierSyncSessionView
} from "./supplier-bridge-types";
import { SUPPLIER_BRIDGE_SCHEMA_VERSION } from "./supplier-bridge-types";
import type { SupplierBridgeRepository, SupplierBridgeSessionAggregate } from "./supplier-bridge-repository";
import {
  hashSupplierBridgeToken,
  issueSupplierBridgeToken,
  parseSupplierBridgeToken
} from "./supplier-bridge-token";
import { logSupplierBridge } from "./supplier-bridge-logger";
import type { MaterialAssignmentCategory } from "../project-materials/project-material-types";

const SESSION_TTL_MS = 30 * 60_000;

function configuredSupplierId(value: string): Exclude<SupplierId, "mock-supplier"> | null {
  return value === "demos" || value === "schachermayer" || value === "hranipex" || value === "jaf_holz" ? value : null;
}

export class SupplierBridgeServiceError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 401 | 403 | 404 | 409 | 422 | 503,
    readonly errorCode: string | null = null
  ) {
    super(message);
  }
}

function confirmationPersistenceErrorCode(error: unknown): string {
  const code = error && typeof error === "object" && "code" in error && typeof error.code === "string"
    ? error.code.toUpperCase()
    : null;
  const stage = error && typeof error === "object" && "bridgeStage" in error && typeof error.bridgeStage === "string"
    ? error.bridgeStage
    : null;
  const databaseCode = code === "42P01" ? "DATABASE_SCHEMA_MISSING"
    : code === "23505" ? "DATABASE_DUPLICATE_CONFLICT"
      : code === "23503" ? "DATABASE_REFERENCE_MISSING"
        : code === "23502" ? "DATABASE_REQUIRED_VALUE_MISSING"
          : code === "22P02" ? "DATABASE_INVALID_VALUE"
            : "FAILED";
  return stage ? `BRIDGE_${stage}_${databaseCode}` : `BRIDGE_CONFIRMATION_PERSIST_${databaseCode}`;
}

function projectMaterialApplyFailure(error: unknown): {
  status: 409 | 422 | 503;
  errorCode: string;
  message: string;
} {
  const message = error instanceof Error ? error.message : "";
  const code = error && typeof error === "object" && "code" in error && typeof error.code === "string"
    ? error.code.toUpperCase()
    : "";
  if (code === "PROJECT_MATERIAL_REVISION_CONFLICT") {
    return {
      status: 409,
      errorCode: "PROJECT_MATERIAL_REVISION_CONFLICT",
      message: "Projekt bol medzitým zmenený. Materiál sa neprepísal; skúste priradenie znova."
    };
  }
  if (message === "Material assignment for supplier sync item no longer exists.") {
    return {
      status: 422,
      errorCode: "PROJECT_MATERIAL_TARGET_MISSING",
      message: "Vybraný cieľ materiálu už v projekte neexistuje. Obnovte projekt a vyberte cieľ znova."
    };
  }
  if (message === "Supplier synchronization target has no matching catalog snapshot.") {
    return {
      status: 422,
      errorCode: "PROJECT_MATERIAL_SNAPSHOT_MISSING",
      message: "Vybraný cieľ materiálu nemá platný snapshot katalógu. Materiál sa nezmenil."
    };
  }
  if (message === "Project save not found.") {
    return {
      status: 422,
      errorCode: "PROJECT_SAVE_MISSING",
      message: "Aktívna fáza projektu už nemá uložený projektový stav. Materiál sa nezmenil."
    };
  }
  if (["23503", "23505", "23514", "23502"].includes(code)) {
    return {
      status: 503,
      errorCode: "PROJECT_MATERIAL_DATABASE_CONSTRAINT",
      message: "Projektový zápis materiálu čaká na bezpečné opakovanie. Rozšírenie ho skúsi dokončiť znova."
    };
  }
  return {
    status: 503,
    errorCode: "PROJECT_MATERIAL_APPLY_FAILED",
    message: "Projektový zápis materiálu sa nedokončil. Rozšírenie ho skúsi bezpečne zopakovať."
  };
}

export type SupplierSyncMaterialInput = {
  materialAssignmentId: string;
  assignmentCategory?: MaterialAssignmentCategory;
  assignmentVariantKey?: string;
  targetLabel?: string;
  targetScope?: "general" | "module" | "addition";
  query: string;
  expectedManufacturer: string | null;
  expectedDecorCode: string | null;
  expectedSurfaceCode: string | null;
  expectedProductType: string | null;
  expectedThicknessMm: number | null;
  exactLookup?: {
    requestId: string;
    supplierId: import("./supplier-bridge-types").SupplierId;
    supplierProductId: string;
  };
};

export type SupplierConfirmationApplyInput = {
  context: ClientContext;
  session: SupplierSyncSession;
  item: SupplierSyncItem;
  candidate: SupplierProductCandidate;
  priceObservation: SupplierPriceObservation | null;
  mapping: MaterialSupplierMapping | null;
};

export type SupplierBridgeServiceDependencies = {
  repository: SupplierBridgeRepository;
  applyConfirmedCandidate: (input: SupplierConfirmationApplyInput) => Promise<void>;
  now?: () => Date;
};

function counts(items: readonly SupplierSyncItem[]): SupplierSyncCounts {
  const byStatus = (status: SupplierSyncItem["status"]) => items.filter((item) => item.status === status).length;
  const completed = byStatus("confirmed");
  const skipped = byStatus("skipped");
  const failed = byStatus("failed");
  return {
    total: items.length,
    processed: completed + skipped + failed,
    pending: byStatus("pending"),
    needsConfirmation: byStatus("needs_confirmation"),
    completed,
    skipped,
    failed
  };
}

export function createSupplierSyncSessionView(aggregate: SupplierBridgeSessionAggregate): SupplierSyncSessionView {
  const sessionCounts = counts(aggregate.items);
  const currentItem = aggregate.items.find((item) => item.status === "needs_confirmation")
    ?? aggregate.items.find((item) => item.status === "pending")
    ?? null;
  return {
    schemaVersion: SUPPLIER_BRIDGE_SCHEMA_VERSION,
    session: structuredClone(aggregate.session),
    items: structuredClone(aggregate.items),
    candidates: structuredClone(aggregate.candidates),
    priceObservations: structuredClone(aggregate.priceObservations),
    counts: sessionCounts,
    currentItem: structuredClone(currentItem)
  };
}

function requireSession(aggregate: SupplierBridgeSessionAggregate | null): SupplierBridgeSessionAggregate {
  if (!aggregate) throw new SupplierBridgeServiceError("Supplier sync session not found.", 404);
  return aggregate;
}

function ensureScope(ctx: ClientContext, session: SupplierSyncSession, projectId?: string): void {
  if (session.tenantId !== ctx.clientId || session.userId !== ctx.userId) {
    throw new SupplierBridgeServiceError("Supplier sync session scope mismatch.", 403);
  }
  if (projectId && session.projectId !== projectId) throw new SupplierBridgeServiceError("Supplier sync project scope mismatch.", 403);
}

function ensureSessionMutable(session: SupplierSyncSession, now: number): void {
  if (Date.parse(session.expiresAt) <= now) throw new SupplierBridgeServiceError("Supplier sync session expired.", 409);
  if (["completed", "cancelled", "expired", "failed"].includes(session.status)) {
    throw new SupplierBridgeServiceError("Supplier sync session is not active.", 409);
  }
}

function completeMapping(candidate: SupplierProductCandidate, session: SupplierSyncSession, item: SupplierSyncItem, userId: string, now: string): MaterialSupplierMapping | null {
  const product = candidate.normalizedProduct;
  if (
    !product.manufacturer ||
    !product.decorCode ||
    !product.surfaceCode ||
    !product.productType ||
    product.thicknessMm == null
  ) {
    if (item.exactLookup || configuredSupplierId(session.supplierId)) return null;
    throw new SupplierBridgeServiceError("Confirmed supplier mapping requires manufacturer, decor, surface, product type and thickness.", 422);
  }
  return {
    tenantId: session.tenantId,
    supplierId: item.exactLookup?.supplierId ?? session.supplierId,
    manufacturer: product.manufacturer,
    decorCode: product.decorCode,
    surfaceCode: product.surfaceCode,
    productType: product.productType,
    thicknessMm: product.thicknessMm,
    supplierProductCode: candidate.supplierProductCode,
    createdByUserId: userId,
    confirmedAt: now
  };
}

function catalogItemId(supplierId: string, supplierProductId: string): string {
  const digest = createHash("sha256").update(`${supplierId}\u0000${supplierProductId}`).digest("hex").slice(0, 24);
  return `supplier-catalog-${supplierId}-${digest}`;
}

function samePriceObservation(
  previous: SupplierPriceObservation,
  next: NonNullable<SupplierCandidateSubmission["price"]>
): boolean {
  return previous.amount === next.amount &&
    previous.currency === next.currency &&
    previous.priceBasis === next.priceBasis &&
    previous.vatMode === next.vatMode &&
    previous.normalizedAmount === next.normalizedAmount &&
    previous.normalizedPriceBasis === next.normalizedPriceBasis;
}

export function createSupplierBridgeService(deps: SupplierBridgeServiceDependencies) {
  const now = deps.now ?? (() => new Date());

  const authorizeAccessToken = async (sessionId: string, accessToken: string) => {
    const payload = parseSupplierBridgeToken(accessToken);
    const current = now();
    if (
      !payload ||
      payload.kind !== "session_access" ||
      payload.sessionId !== sessionId ||
      Date.parse(payload.expiresAt) <= current.getTime()
    ) throw new SupplierBridgeServiceError("Supplier bridge access token is invalid or expired.", 401);
    const token = await deps.repository.validateToken({
      tenantId: payload.tenantId,
      sessionId,
      tokenId: payload.tokenId,
      tokenHash: hashSupplierBridgeToken(accessToken),
      kind: "session_access",
      now: current.toISOString()
    });
    if (!token || token.userId !== payload.userId) throw new SupplierBridgeServiceError("Supplier bridge access token is invalid or expired.", 401);
    const aggregate = requireSession(await deps.repository.getSession(payload.tenantId, sessionId));
    if (aggregate.session.userId !== payload.userId) throw new SupplierBridgeServiceError("Supplier bridge access token scope mismatch.", 403);
    return { payload, aggregate, context: { clientId: payload.tenantId, userId: payload.userId, role: "designer" } as ClientContext };
  };

  return {
    async createSession(
      ctx: ClientContext,
      projectId: string,
      supplierId: string,
      materials: readonly SupplierSyncMaterialInput[]
    ): Promise<SupplierBridgeSessionCreation> {
      if (ctx.role === "viewer") throw new SupplierBridgeServiceError("Viewer role cannot start supplier synchronization.", 403);
      if (materials.length === 0) throw new SupplierBridgeServiceError("Project has no assigned materials to synchronize.", 422);
      const createdAt = now();
      const sessionId = `supplier-session-${randomUUID()}`;
      const session: SupplierSyncSession = {
        id: sessionId,
        tenantId: ctx.clientId,
        projectId,
        userId: ctx.userId,
        supplierId,
        status: "active",
        createdAt: createdAt.toISOString(),
        updatedAt: createdAt.toISOString(),
        expiresAt: new Date(createdAt.getTime() + SESSION_TTL_MS).toISOString()
      };
      const items: SupplierSyncItem[] = materials.map((material) => ({
        id: `supplier-item-${randomUUID()}`,
        sessionId,
        materialAssignmentId: material.materialAssignmentId,
        ...(material.assignmentCategory ? { assignmentCategory: material.assignmentCategory } : {}),
        ...(material.assignmentVariantKey ? { assignmentVariantKey: material.assignmentVariantKey } : {}),
        ...(material.targetLabel ? { targetLabel: material.targetLabel } : {}),
        ...(material.targetScope ? { targetScope: material.targetScope } : {}),
        query: material.query,
        expectedManufacturer: material.expectedManufacturer,
        expectedDecorCode: material.expectedDecorCode,
        expectedSurfaceCode: material.expectedSurfaceCode,
        expectedProductType: material.expectedProductType,
        expectedThicknessMm: material.expectedThicknessMm,
        exactLookup: material.exactLookup ? {
          requestId: material.exactLookup.requestId,
          supplierId: material.exactLookup.supplierId,
          supplierProductId: material.exactLookup.supplierProductId,
          rawSupplierProductId: material.exactLookup.supplierProductId,
          lookupStatus: "waiting_for_extension"
        } : null,
        status: "pending",
        selectedCandidateId: null,
        errorCode: null,
        createdAt: createdAt.toISOString(),
        updatedAt: createdAt.toISOString()
      }));
      const issued = issueSupplierBridgeToken({
        tenantId: ctx.clientId,
        userId: ctx.userId,
        sessionId,
        kind: "bridge_once",
        now: createdAt
      });
      await deps.repository.createSession(ctx.clientId, session, items, issued.record);
      logSupplierBridge("info", { event: "session_created", sessionId, status: session.status });
      return {
        view: createSupplierSyncSessionView({ session, items, candidates: [], priceObservations: [] }),
        bridgeToken: issued.token
      };
    },

    async attachSession(sessionId: string, bridgeToken: string): Promise<SupplierBridgeAttachment> {
      const payload = parseSupplierBridgeToken(bridgeToken);
      const attachedAt = now();
      if (
        !payload ||
        payload.kind !== "bridge_once" ||
        payload.sessionId !== sessionId ||
        Date.parse(payload.expiresAt) <= attachedAt.getTime()
      ) throw new SupplierBridgeServiceError("Supplier bridge token is invalid or expired.", 401);
      const consumed = await deps.repository.consumeToken({
        tenantId: payload.tenantId,
        sessionId,
        tokenId: payload.tokenId,
        tokenHash: hashSupplierBridgeToken(bridgeToken),
        kind: "bridge_once",
        now: attachedAt.toISOString()
      });
      if (!consumed || consumed.userId !== payload.userId) throw new SupplierBridgeServiceError("Supplier bridge token was already used or expired.", 401);
      const aggregate = requireSession(await deps.repository.getSession(payload.tenantId, sessionId));
      ensureSessionMutable(aggregate.session, attachedAt.getTime());
      const access = issueSupplierBridgeToken({
        tenantId: payload.tenantId,
        userId: payload.userId,
        sessionId,
        kind: "session_access",
        now: attachedAt,
        ttlMs: Math.min(15 * 60_000, Date.parse(aggregate.session.expiresAt) - attachedAt.getTime())
      });
      await deps.repository.saveToken(payload.tenantId, access.record);
      logSupplierBridge("info", { event: "extension_attached", sessionId, status: aggregate.session.status });
      return {
        view: createSupplierSyncSessionView(aggregate),
        accessToken: access.token,
        accessTokenExpiresAt: access.record.expiresAt
      };
    },

    async getSessionForExtension(sessionId: string, accessToken: string): Promise<SupplierSyncSessionView> {
      const authorized = await authorizeAccessToken(sessionId, accessToken);
      return createSupplierSyncSessionView(authorized.aggregate);
    },

    async submitCandidate(sessionId: string, accessToken: string, submission: SupplierCandidateSubmission) {
      const authorized = await authorizeAccessToken(sessionId, accessToken);
      ensureSessionMutable(authorized.aggregate.session, now().getTime());
      const item = authorized.aggregate.items.find((candidate) => candidate.id === submission.syncItemId);
      if (!item) throw new SupplierBridgeServiceError("Supplier sync item not found.", 404);
      const exactIdMatch = !item.exactLookup || item.exactLookup.supplierProductId === submission.supplierProductCode.trim();
      let expectedSupplierProductCode: string | null = null;
      if (
        item.expectedManufacturer && item.expectedDecorCode && item.expectedSurfaceCode &&
        item.expectedProductType && item.expectedThicknessMm != null
      ) {
        expectedSupplierProductCode = (await deps.repository.findMapping({
          tenantId: authorized.payload.tenantId,
          supplierId: authorized.aggregate.session.supplierId,
          manufacturer: item.expectedManufacturer,
          decorCode: item.expectedDecorCode,
          surfaceCode: item.expectedSurfaceCode,
          productType: item.expectedProductType,
          thicknessMm: item.expectedThicknessMm
        }))?.supplierProductCode ?? null;
      }
      const observedAt = submission.observedAt;
      const draftCandidate: SupplierProductCandidate = {
        id: `supplier-candidate-${randomUUID()}`,
        syncItemId: item.id,
        supplierProductCode: submission.supplierProductCode,
        normalizedProduct: structuredClone(submission.normalizedProduct),
        matchEvidence: [],
        conflicts: [],
        sourcePageType: submission.sourcePageType,
        sourcePath: submission.sourcePath,
        observedAt
      };
      const match = evaluateSupplierCandidateMatch({ item, candidate: draftCandidate, expectedSupplierProductCode });
      draftCandidate.matchEvidence = match.evidence;
      draftCandidate.conflicts = match.conflicts;
      if (!exactIdMatch) {
        draftCandidate.matchEvidence.unshift({
          field: "supplierProductCode",
          expected: item.exactLookup!.supplierProductId,
          observed: submission.supplierProductCode,
          matched: false,
          score: 0,
          explanation: "Found supplier product ID does not exactly match the requested ID."
        });
      }
      const priceSupplierId = item.exactLookup?.supplierId ?? authorized.aggregate.session.supplierId;
      const previousPrice = submission.price ? await deps.repository.findLatestPriceObservation({
        tenantId: authorized.payload.tenantId,
        supplierId: priceSupplierId,
        supplierProductCode: submission.supplierProductCode
      }) : null;
      const unchangedPrice = !!(submission.price && previousPrice && samePriceObservation(previousPrice, submission.price));
      const priceObservation: SupplierPriceObservation | null = submission.price
        ? unchangedPrice
          ? await deps.repository.touchPriceObservation({
              tenantId: authorized.payload.tenantId,
              observationId: previousPrice!.id,
              lastVerifiedAt: submission.observedAt
            })
          : {
            id: `supplier-price-${randomUUID()}`,
            syncItemId: item.id,
            candidateId: draftCandidate.id,
            tenantId: authorized.payload.tenantId,
            supplierId: priceSupplierId,
            supplierProductCode: submission.supplierProductCode,
            lastVerifiedAt: submission.observedAt,
            ...structuredClone(submission.price)
          }
        : null;
      const result = await deps.repository.submitCandidate({
        tenantId: authorized.payload.tenantId,
        sessionId,
        submissionId: submission.submissionId,
        candidate: draftCandidate,
        priceObservation,
        persistPriceObservation: !unchangedPrice
      });
      const aggregate = requireSession(await deps.repository.getSession(authorized.payload.tenantId, sessionId));
      if (result.priceObservation && !aggregate.priceObservations.some((observation) => observation.id === result.priceObservation!.id)) {
        aggregate.priceObservations.push(result.priceObservation);
      }
      logSupplierBridge("info", {
        event: result.idempotent ? "candidate_submission_replayed" : "candidate_submitted",
        sessionId,
        syncItemId: item.id,
        supplierProductCode: result.candidate.supplierProductCode,
        amount: result.priceObservation?.normalizedAmount
      });
      return { view: createSupplierSyncSessionView(aggregate), candidate: result.candidate, idempotent: result.idempotent };
    },

    async confirmCandidate(sessionId: string, accessToken: string, syncItemId: string, candidateId: string): Promise<SupplierSyncSessionView> {
      const authorized = await authorizeAccessToken(sessionId, accessToken);
      ensureSessionMutable(authorized.aggregate.session, now().getTime());
      const item = authorized.aggregate.items.find((candidate) => candidate.id === syncItemId);
      const candidate = authorized.aggregate.candidates.find((entry) => entry.id === candidateId && entry.syncItemId === syncItemId);
      if (!item || !candidate) throw new SupplierBridgeServiceError("Supplier confirmation target not found.", 404);
      if (item.exactLookup && candidate.supplierProductCode.trim() !== item.exactLookup.supplierProductId) {
        throw new SupplierBridgeServiceError("Found supplier product ID does not exactly match the requested ID.", 422);
      }
      if (item.status === "confirmed" && item.selectedCandidateId === candidateId) return createSupplierSyncSessionView(authorized.aggregate);
      if (candidate.conflicts.length > 0) {
        throw new SupplierBridgeServiceError("Candidate has a hard product type or thickness conflict and cannot be confirmed.", 422);
      }
      const confirmedAt = now().toISOString();
      const mapping = completeMapping(candidate, authorized.aggregate.session, item, authorized.payload.userId, confirmedAt);
      const priceObservation = authorized.aggregate.priceObservations.find((observation) => observation.candidateId === candidate.id)
        ?? await deps.repository.findLatestPriceObservation({
          tenantId: authorized.payload.tenantId,
          supplierId: item.exactLookup?.supplierId ?? authorized.aggregate.session.supplierId,
          supplierProductCode: candidate.supplierProductCode
        });
      const observedSupplierId = item.exactLookup?.supplierId ?? configuredSupplierId(authorized.aggregate.session.supplierId);
      const observedProductId = item.exactLookup?.supplierProductId ?? candidate.supplierProductCode;
      const catalogItem: SupplierCatalogItem | null = observedSupplierId ? {
        id: catalogItemId(observedSupplierId, observedProductId),
        tenantId: authorized.payload.tenantId,
        supplierId: observedSupplierId,
        supplierProductId: observedProductId,
        name: candidate.normalizedProduct.displayName,
        manufacturer: candidate.normalizedProduct.manufacturer,
        productType: (candidate.normalizedProduct.productType as SupplierCatalogItem["productType"] | null) ?? "other",
        metadata: {
          decorCode: candidate.normalizedProduct.decorCode,
          surfaceCode: candidate.normalizedProduct.surfaceCode,
          thicknessMm: candidate.normalizedProduct.thicknessMm,
          widthMm: candidate.normalizedProduct.widthMm,
          lengthMm: candidate.normalizedProduct.lengthMm,
          availability: candidate.normalizedProduct.availability,
          sourcePath: candidate.sourcePath
        },
        firstObservedAt: candidate.observedAt,
        lastObservedAt: candidate.observedAt,
        lastVerifiedAt: confirmedAt
      } : null;
      const materialSupplierAssignment: MaterialSupplierAssignment | null = catalogItem ? {
        tenantId: authorized.payload.tenantId,
        materialAssignmentId: item.materialAssignmentId,
        supplierCatalogItemId: catalogItem.id,
        selectedPriceObservationId: priceObservation?.id ?? null,
        assignedByUserId: authorized.payload.userId,
        assignedAt: confirmedAt,
        priceLocked: false
      } : null;
      try {
        await deps.applyConfirmedCandidate({
          context: authorized.context,
          session: authorized.aggregate.session,
          item,
          candidate,
          priceObservation,
          mapping
        });
      } catch (error) {
        const failure = projectMaterialApplyFailure(error);
        logSupplierBridge("error", {
          event: "candidate_project_material_apply_failed",
          sessionId,
          syncItemId,
          errorCode: failure.errorCode
        });
        throw new SupplierBridgeServiceError(failure.message, failure.status, failure.errorCode);
      }
      let aggregate: SupplierBridgeSessionAggregate;
      try {
        aggregate = await deps.repository.confirmItem({
          tenantId: authorized.payload.tenantId,
          sessionId,
          syncItemId,
          candidateId,
          mapping,
          catalogItem,
          materialSupplierAssignment,
          now: confirmedAt
        });
      } catch (error) {
        const errorCode = confirmationPersistenceErrorCode(error);
        logSupplierBridge("error", {
          event: "candidate_confirmation_persistence_failed",
          sessionId,
          syncItemId,
          errorCode
        });
        // The project update above is idempotent for this session/candidate pair.
        // A retry therefore completes only the failed Bridge bookkeeping write.
        throw new SupplierBridgeServiceError(
          "Materiál je uložený v projekte. Potvrdenie evidencie dodávateľa sa nedokončilo; rozšírenie ho skúsi dokončiť znova.",
          503,
          errorCode
        );
      }
      logSupplierBridge("info", { event: "candidate_confirmed", sessionId, syncItemId, status: aggregate.session.status });
      return createSupplierSyncSessionView(aggregate);
    },

    async skipItem(sessionId: string, accessToken: string, syncItemId: string, errorCode: string | null): Promise<SupplierSyncSessionView> {
      const authorized = await authorizeAccessToken(sessionId, accessToken);
      ensureSessionMutable(authorized.aggregate.session, now().getTime());
      const aggregate = await deps.repository.skipItem({
        tenantId: authorized.payload.tenantId,
        sessionId,
        syncItemId,
        errorCode,
        now: now().toISOString()
      });
      logSupplierBridge("info", { event: "item_skipped", sessionId, syncItemId, status: aggregate.session.status });
      return createSupplierSyncSessionView(aggregate);
    },

    async cancelForExtension(sessionId: string, accessToken: string): Promise<SupplierSyncSessionView> {
      const authorized = await authorizeAccessToken(sessionId, accessToken);
      const aggregate = await deps.repository.setSessionStatus({
        tenantId: authorized.payload.tenantId,
        sessionId,
        status: "cancelled",
        now: now().toISOString()
      });
      logSupplierBridge("info", { event: "session_cancelled", sessionId, status: "cancelled" });
      return createSupplierSyncSessionView(aggregate);
    },

    async getSessionForWeb(ctx: ClientContext, projectId: string, sessionId: string): Promise<SupplierSyncSessionView> {
      const aggregate = requireSession(await deps.repository.getSession(ctx.clientId, sessionId));
      ensureScope(ctx, aggregate.session, projectId);
      if (Date.parse(aggregate.session.expiresAt) <= now().getTime() && !["completed", "cancelled", "expired"].includes(aggregate.session.status)) {
        return createSupplierSyncSessionView(await deps.repository.setSessionStatus({
          tenantId: ctx.clientId,
          sessionId,
          status: "expired",
          now: now().toISOString()
        }));
      }
      return createSupplierSyncSessionView(aggregate);
    },

    async cancelForWeb(ctx: ClientContext, projectId: string, sessionId: string): Promise<SupplierSyncSessionView> {
      if (ctx.role === "viewer") throw new SupplierBridgeServiceError("Viewer role cannot cancel supplier synchronization.", 403);
      const aggregate = requireSession(await deps.repository.getSession(ctx.clientId, sessionId));
      ensureScope(ctx, aggregate.session, projectId);
      return createSupplierSyncSessionView(await deps.repository.setSessionStatus({
        tenantId: ctx.clientId,
        sessionId,
        status: "cancelled",
        now: now().toISOString()
      }));
    }
  };
}
