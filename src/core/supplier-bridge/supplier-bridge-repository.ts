import type {
  MaterialSupplierAssignment,
  MaterialSupplierMapping,
  SupplierBridgeTenantState,
  SupplierBridgeTokenKind,
  SupplierBridgeTokenRecord,
  SupplierCatalogItem,
  SupplierPriceObservation,
  SupplierProductCandidate,
  SupplierSyncItem,
  SupplierSyncSession,
  SupplierSyncSessionStatus
} from "./supplier-bridge-types";
import { createEmptySupplierBridgeTenantState } from "./supplier-bridge-types";
import { supplierBridgeTokenHashesEqual } from "./supplier-bridge-token";
import { validateSupplierBridgeTenantState } from "./supplier-bridge-validation";

export type SupplierBridgeSessionAggregate = {
  session: SupplierSyncSession;
  items: SupplierSyncItem[];
  candidates: SupplierProductCandidate[];
  priceObservations: SupplierPriceObservation[];
};

export type SupplierCandidateWrite = {
  tenantId: string;
  sessionId: string;
  submissionId: string;
  candidate: SupplierProductCandidate;
  priceObservation: SupplierPriceObservation | null;
  persistPriceObservation: boolean;
};

export type SupplierCandidateWriteResult = {
  candidate: SupplierProductCandidate;
  priceObservation: SupplierPriceObservation | null;
  idempotent: boolean;
};

export type SupplierBridgeRepository = {
  createSession(
    tenantId: string,
    session: SupplierSyncSession,
    items: readonly SupplierSyncItem[],
    bridgeToken: SupplierBridgeTokenRecord
  ): Promise<void>;
  getSession(tenantId: string, sessionId: string): Promise<SupplierBridgeSessionAggregate | null>;
  saveToken(tenantId: string, token: SupplierBridgeTokenRecord): Promise<void>;
  consumeToken(args: {
    tenantId: string;
    sessionId: string;
    tokenId: string;
    tokenHash: string;
    kind: SupplierBridgeTokenKind;
    now: string;
  }): Promise<SupplierBridgeTokenRecord | null>;
  validateToken(args: {
    tenantId: string;
    sessionId: string;
    tokenId: string;
    tokenHash: string;
    kind: SupplierBridgeTokenKind;
    now: string;
  }): Promise<SupplierBridgeTokenRecord | null>;
  submitCandidate(input: SupplierCandidateWrite): Promise<SupplierCandidateWriteResult>;
  findLatestPriceObservation(args: {
    tenantId: string;
    supplierId: string;
    supplierProductCode: string;
  }): Promise<SupplierPriceObservation | null>;
  touchPriceObservation(args: {
    tenantId: string;
    observationId: string;
    lastVerifiedAt: string;
  }): Promise<SupplierPriceObservation>;
  confirmItem(args: {
    tenantId: string;
    sessionId: string;
    syncItemId: string;
    candidateId: string;
    mapping: MaterialSupplierMapping | null;
    catalogItem: SupplierCatalogItem | null;
    materialSupplierAssignment: MaterialSupplierAssignment | null;
    now: string;
  }): Promise<SupplierBridgeSessionAggregate>;
  skipItem(args: {
    tenantId: string;
    sessionId: string;
    syncItemId: string;
    errorCode: string | null;
    now: string;
  }): Promise<SupplierBridgeSessionAggregate>;
  setSessionStatus(args: {
    tenantId: string;
    sessionId: string;
    status: SupplierSyncSessionStatus;
    now: string;
  }): Promise<SupplierBridgeSessionAggregate>;
  findMapping(args: {
    tenantId: string;
    supplierId: string;
    manufacturer: string;
    decorCode: string;
    surfaceCode: string;
    productType: string;
    thicknessMm: number;
  }): Promise<MaterialSupplierMapping | null>;
};

export type SupplierBridgeTenantStateStore = {
  read(tenantId: string): Promise<SupplierBridgeTenantState>;
  update<T>(tenantId: string, mutation: (state: SupplierBridgeTenantState) => T | Promise<T>): Promise<T>;
};

function clone<T>(value: T): T {
  return structuredClone(value);
}

function aggregate(state: SupplierBridgeTenantState, sessionId: string): SupplierBridgeSessionAggregate | null {
  const session = state.sessions.find((candidate) => candidate.id === sessionId);
  if (!session) return null;
  const items = state.items.filter((item) => item.sessionId === sessionId);
  const itemIds = new Set(items.map((item) => item.id));
  const candidates = state.candidates.filter((candidate) => itemIds.has(candidate.syncItemId));
  const priceObservations = state.priceObservations.filter((observation) => itemIds.has(observation.syncItemId));
  return clone({ session, items, candidates, priceObservations });
}

function requireAggregate(state: SupplierBridgeTenantState, sessionId: string): SupplierBridgeSessionAggregate {
  const result = aggregate(state, sessionId);
  if (!result) throw new Error("Supplier sync session not found.");
  return result;
}

function completeSessionWhenDone(state: SupplierBridgeTenantState, sessionId: string, now: string): void {
  const session = state.sessions.find((candidate) => candidate.id === sessionId);
  if (!session || ["cancelled", "expired", "failed"].includes(session.status)) return;
  const items = state.items.filter((item) => item.sessionId === sessionId);
  if (items.length > 0 && items.every((item) => ["confirmed", "skipped", "failed"].includes(item.status))) {
    session.status = "completed";
    session.updatedAt = now;
  }
}

export function supplierMappingKey(mapping: Omit<MaterialSupplierMapping, "supplierProductCode" | "createdByUserId" | "confirmedAt">): string {
  return [
    mapping.tenantId,
    mapping.supplierId,
    mapping.manufacturer,
    mapping.decorCode,
    mapping.surfaceCode,
    mapping.productType,
    String(mapping.thicknessMm)
  ].map((value) => value.trim().toLocaleLowerCase("sk-SK")).join("\u0000");
}

export function createSupplierBridgeRepositoryFromStateStore(store: SupplierBridgeTenantStateStore): SupplierBridgeRepository {
  return {
    async createSession(tenantId, session, items, bridgeToken) {
      await store.update(tenantId, (state) => {
        if (session.tenantId !== tenantId || bridgeToken.tenantId !== tenantId) throw new Error("Supplier session tenant scope mismatch.");
        if (state.sessions.some((candidate) => candidate.id === session.id)) throw new Error("Supplier sync session already exists.");
        state.sessions.push(clone(session));
        state.items.push(...clone([...items]));
        state.tokens.push(clone(bridgeToken));
      });
    },
    async getSession(tenantId, sessionId) {
      return aggregate(await store.read(tenantId), sessionId);
    },
    async saveToken(tenantId, token) {
      await store.update(tenantId, (state) => {
        if (token.tenantId !== tenantId) throw new Error("Supplier token tenant scope mismatch.");
        if (state.tokens.some((candidate) => candidate.id === token.id)) throw new Error("Supplier token already exists.");
        state.tokens.push(clone(token));
      });
    },
    async consumeToken(args) {
      return store.update(args.tenantId, (state) => {
        const token = state.tokens.find((candidate) =>
          candidate.id === args.tokenId &&
          candidate.sessionId === args.sessionId &&
          candidate.kind === args.kind &&
          candidate.usedAt === null &&
          Date.parse(candidate.expiresAt) > Date.parse(args.now) &&
          supplierBridgeTokenHashesEqual(candidate.tokenHash, args.tokenHash)
        );
        if (!token) return null;
        token.usedAt = args.now;
        return clone(token);
      });
    },
    async validateToken(args) {
      const state = await store.read(args.tenantId);
      const token = state.tokens.find((candidate) =>
        candidate.id === args.tokenId &&
        candidate.sessionId === args.sessionId &&
        candidate.kind === args.kind &&
        candidate.usedAt === null &&
        Date.parse(candidate.expiresAt) > Date.parse(args.now) &&
        supplierBridgeTokenHashesEqual(candidate.tokenHash, args.tokenHash)
      );
      return token ? clone(token) : null;
    },
    async submitCandidate(input) {
      return store.update(input.tenantId, (state) => {
        const existingKey = state.submissionKeys.find((candidate) =>
          candidate.sessionId === input.sessionId &&
          candidate.syncItemId === input.candidate.syncItemId &&
          candidate.submissionId === input.submissionId
        );
        if (existingKey) {
          const existingCandidate = state.candidates.find((candidate) => candidate.id === existingKey.candidateId);
          if (!existingCandidate) throw new Error("Idempotent supplier candidate is missing.");
          return {
            candidate: clone(existingCandidate),
            priceObservation: clone(state.priceObservations.find((observation) => observation.candidateId === existingCandidate.id) ?? null),
            idempotent: true
          };
        }
        const session = state.sessions.find((candidate) => candidate.id === input.sessionId && candidate.tenantId === input.tenantId);
        const item = state.items.find((candidate) => candidate.id === input.candidate.syncItemId && candidate.sessionId === input.sessionId);
        if (!session || !item) throw new Error("Supplier sync item not found.");
        if (["cancelled", "completed", "expired", "failed"].includes(session.status)) throw new Error("Supplier sync session is not active.");
        state.candidates.push(clone(input.candidate));
        if (input.priceObservation && input.persistPriceObservation) state.priceObservations.push(clone(input.priceObservation));
        state.submissionKeys.push({
          sessionId: input.sessionId,
          syncItemId: input.candidate.syncItemId,
          submissionId: input.submissionId,
          candidateId: input.candidate.id
        });
        item.status = "needs_confirmation";
        if (item.exactLookup) {
          item.exactLookup.lookupStatus = item.exactLookup.supplierProductId === input.candidate.supplierProductCode.trim()
            ? "needs_confirmation"
            : "not_found";
        }
        item.errorCode = null;
        item.updatedAt = input.candidate.observedAt;
        session.status = "active";
        session.updatedAt = input.candidate.observedAt;
        return { candidate: clone(input.candidate), priceObservation: clone(input.priceObservation), idempotent: false };
      });
    },
    async findLatestPriceObservation(args) {
      const state = await store.read(args.tenantId);
      const matches = state.priceObservations
        .filter((observation) => observation.supplierId === args.supplierId && observation.supplierProductCode === args.supplierProductCode)
        .sort((left, right) => Date.parse(right.observedAt) - Date.parse(left.observedAt));
      return clone(matches[0] ?? null);
    },
    async touchPriceObservation(args) {
      return store.update(args.tenantId, (state) => {
        const observation = state.priceObservations.find((candidate) => candidate.id === args.observationId);
        if (!observation) throw new Error("Supplier price observation not found.");
        observation.lastVerifiedAt = args.lastVerifiedAt;
        return clone(observation);
      });
    },
    async confirmItem(args) {
      return store.update(args.tenantId, (state) => {
        const session = state.sessions.find((candidate) => candidate.id === args.sessionId && candidate.tenantId === args.tenantId);
        const item = state.items.find((candidate) => candidate.id === args.syncItemId && candidate.sessionId === args.sessionId);
        const candidate = state.candidates.find((entry) => entry.id === args.candidateId && entry.syncItemId === args.syncItemId);
        if (!session || !item || !candidate) throw new Error("Supplier confirmation target not found.");
        if (item.status === "confirmed" && item.selectedCandidateId === candidate.id) return requireAggregate(state, args.sessionId);
        if (item.status === "confirmed") throw new Error("Supplier sync item is already confirmed with another candidate.");
        item.status = "confirmed";
        if (item.exactLookup) item.exactLookup.lookupStatus = "completed";
        item.selectedCandidateId = candidate.id;
        item.errorCode = null;
        item.updatedAt = args.now;
        if (args.mapping) {
          const key = supplierMappingKey(args.mapping);
          const existingIndex = state.mappings.findIndex((mapping) => supplierMappingKey(mapping) === key);
          if (existingIndex >= 0) state.mappings[existingIndex] = clone(args.mapping);
          else state.mappings.push(clone(args.mapping));
        }
        if (args.catalogItem) {
          const existing = state.catalogItems.findIndex((catalogItem) =>
            catalogItem.supplierId === args.catalogItem!.supplierId &&
            catalogItem.supplierProductId === args.catalogItem!.supplierProductId
          );
          if (existing >= 0) {
            args.catalogItem.firstObservedAt = state.catalogItems[existing]!.firstObservedAt;
            state.catalogItems[existing] = clone(args.catalogItem);
          } else state.catalogItems.push(clone(args.catalogItem));
        }
        if (args.materialSupplierAssignment) {
          const existing = state.materialSupplierAssignments.findIndex((assignment) =>
            assignment.materialAssignmentId === args.materialSupplierAssignment!.materialAssignmentId
          );
          if (existing >= 0) state.materialSupplierAssignments[existing] = clone(args.materialSupplierAssignment);
          else state.materialSupplierAssignments.push(clone(args.materialSupplierAssignment));
        }
        session.updatedAt = args.now;
        completeSessionWhenDone(state, args.sessionId, args.now);
        return requireAggregate(state, args.sessionId);
      });
    },
    async skipItem(args) {
      return store.update(args.tenantId, (state) => {
        const session = state.sessions.find((candidate) => candidate.id === args.sessionId && candidate.tenantId === args.tenantId);
        const item = state.items.find((candidate) => candidate.id === args.syncItemId && candidate.sessionId === args.sessionId);
        if (!session || !item) throw new Error("Supplier sync item not found.");
        if (item.status !== "confirmed") {
          item.status = "skipped";
          if (item.exactLookup) item.exactLookup.lookupStatus = args.errorCode === "USER_CANCELLED" ? "cancelled" : "failed";
          item.errorCode = args.errorCode;
          item.updatedAt = args.now;
        }
        session.updatedAt = args.now;
        completeSessionWhenDone(state, args.sessionId, args.now);
        return requireAggregate(state, args.sessionId);
      });
    },
    async setSessionStatus(args) {
      return store.update(args.tenantId, (state) => {
        const session = state.sessions.find((candidate) => candidate.id === args.sessionId && candidate.tenantId === args.tenantId);
        if (!session) throw new Error("Supplier sync session not found.");
        session.status = args.status;
        if (args.status === "cancelled") {
          for (const item of state.items.filter((entry) => entry.sessionId === args.sessionId && entry.exactLookup)) {
            if (item.exactLookup!.lookupStatus !== "completed") item.exactLookup!.lookupStatus = "cancelled";
          }
        }
        session.updatedAt = args.now;
        return requireAggregate(state, args.sessionId);
      });
    },
    async findMapping(args) {
      const state = await store.read(args.tenantId);
      const key = supplierMappingKey(args);
      return clone(state.mappings.find((mapping) => supplierMappingKey(mapping) === key) ?? null);
    }
  };
}

export function createInMemorySupplierBridgeRepository(): SupplierBridgeRepository {
  const states = new Map<string, SupplierBridgeTenantState>();
  const store: SupplierBridgeTenantStateStore = {
    async read(tenantId) {
      return clone(states.get(tenantId) ?? createEmptySupplierBridgeTenantState());
    },
    async update(tenantId, mutation) {
      const state = clone(states.get(tenantId) ?? createEmptySupplierBridgeTenantState());
      const result = await mutation(state);
      states.set(tenantId, validateSupplierBridgeTenantState(state));
      return clone(result);
    }
  };
  return createSupplierBridgeRepositoryFromStateStore(store);
}
