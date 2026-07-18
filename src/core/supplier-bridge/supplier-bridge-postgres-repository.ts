import type { PoolClient } from "pg";
import { withSchemaClient } from "../database/postgres-client";
import type {
  MaterialSupplierAssignment,
  MaterialSupplierMapping,
  SupplierBridgeTokenRecord,
  SupplierCatalogItem,
  SupplierPriceObservation,
  SupplierProductCandidate,
  SupplierSyncItem,
  SupplierSyncSession
} from "./supplier-bridge-types";
import {
  supplierMappingKey,
  type SupplierBridgeRepository,
  type SupplierBridgeSessionAggregate
} from "./supplier-bridge-repository";
import { stringifySupplierBridgeJson, supplierBridgePostgresValues } from "./supplier-bridge-postgres-json";

type DataRow = { data: unknown };

export class SupplierBridgePersistenceError extends Error {
  readonly bridgeStage: string;
  readonly code: string | undefined;

  constructor(stage: string, error: unknown) {
    super(`Supplier Bridge persistence failed at ${stage}.`);
    this.name = "SupplierBridgePersistenceError";
    this.bridgeStage = stage;
    this.code = error && typeof error === "object" && "code" in error && typeof error.code === "string"
      ? error.code
      : undefined;
  }
}

async function persistAt<T>(stage: string, operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw new SupplierBridgePersistenceError(stage, error);
  }
}

function data<T>(row: DataRow | undefined, label: string): T {
  if (!row?.data || typeof row.data !== "object") throw new Error(`${label} is invalid.`);
  return structuredClone(row.data) as T;
}

async function transaction<T>(client: PoolClient, operation: () => Promise<T>): Promise<T> {
  await client.query("BEGIN");
  try {
    const result = await operation();
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  }
}

async function readAggregate(client: PoolClient, tenantId: string, sessionId: string): Promise<SupplierBridgeSessionAggregate | null> {
  const sessionResult = await client.query<DataRow>(
    "SELECT data FROM arcigy_supplier_sync_sessions WHERE client_id = $1 AND session_id = $2",
    [tenantId, sessionId]
  );
  if (!sessionResult.rows[0]) return null;
  const [items, candidates, observations] = await Promise.all([
    client.query<DataRow>(
      "SELECT data FROM arcigy_supplier_sync_items WHERE client_id = $1 AND session_id = $2 ORDER BY db_created_at, sync_item_id",
      [tenantId, sessionId]
    ),
    client.query<DataRow>(
      "SELECT data FROM arcigy_supplier_product_candidates WHERE client_id = $1 AND session_id = $2 ORDER BY db_created_at, candidate_id",
      [tenantId, sessionId]
    ),
    client.query<DataRow>(
      "SELECT data FROM arcigy_supplier_price_observations WHERE client_id = $1 AND session_id = $2 ORDER BY observed_at, observation_id",
      [tenantId, sessionId]
    )
  ]);
  return {
    session: data<SupplierSyncSession>(sessionResult.rows[0], "Supplier sync session"),
    items: items.rows.map((row) => data<SupplierSyncItem>(row, "Supplier sync item")),
    candidates: candidates.rows.map((row) => data<SupplierProductCandidate>(row, "Supplier product candidate")),
    priceObservations: observations.rows.map((row) => data<SupplierPriceObservation>(row, "Supplier price observation"))
  };
}

async function requireAggregate(client: PoolClient, tenantId: string, sessionId: string): Promise<SupplierBridgeSessionAggregate> {
  const result = await readAggregate(client, tenantId, sessionId);
  if (!result) throw new Error("Supplier sync session not found.");
  return result;
}

async function saveSession(client: PoolClient, session: SupplierSyncSession): Promise<void> {
  await client.query(
    `
      UPDATE arcigy_supplier_sync_sessions
      SET status = $3, expires_at = $4::timestamptz, data = $5::jsonb, db_updated_at = now()
      WHERE client_id = $1 AND session_id = $2
    `,
    [session.tenantId, session.id, session.status, session.expiresAt, stringifySupplierBridgeJson(session)]
  );
}

async function completeSessionWhenDone(client: PoolClient, session: SupplierSyncSession, now: string): Promise<void> {
  if (["cancelled", "expired", "failed"].includes(session.status)) return;
  const remaining = await client.query<{ count: string }>(
    `
      SELECT count(*)::text AS count
      FROM arcigy_supplier_sync_items
      WHERE client_id = $1 AND session_id = $2 AND status NOT IN ('confirmed', 'skipped', 'failed')
    `,
    [session.tenantId, session.id]
  );
  if (Number(remaining.rows[0]?.count ?? 0) === 0) session.status = "completed";
  session.updatedAt = now;
  await saveSession(client, session);
}

export function createPostgresSupplierBridgeRepository(args: {
  connectionString: string;
  schema: string;
}): SupplierBridgeRepository {
  const run = <T>(operation: (client: PoolClient) => Promise<T>) =>
    withSchemaClient(args.connectionString, args.schema, operation);

  return {
    async createSession(tenantId, session, items, bridgeToken) {
      await run((client) => transaction(client, async () => {
        if (session.tenantId !== tenantId || bridgeToken.tenantId !== tenantId) throw new Error("Supplier session tenant scope mismatch.");
        await client.query(
          `
            INSERT INTO arcigy_supplier_sync_sessions
              (client_id, session_id, project_id, user_id, supplier_id, status, expires_at, data)
            VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz, $8::jsonb)
          `,
          [tenantId, session.id, session.projectId, session.userId, session.supplierId, session.status, session.expiresAt, stringifySupplierBridgeJson(session)]
        );
        for (const item of items) {
          await client.query(
            `
              INSERT INTO arcigy_supplier_sync_items
                (client_id, session_id, sync_item_id, material_assignment_id, status, data)
              VALUES ($1, $2, $3, $4, $5, $6::jsonb)
            `,
            [tenantId, session.id, item.id, item.materialAssignmentId, item.status, stringifySupplierBridgeJson(item)]
          );
        }
        await client.query(
          `
            INSERT INTO arcigy_supplier_bridge_tokens
              (client_id, session_id, token_id, kind, token_hash, expires_at, used_at, data)
            VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $7::timestamptz, $8::jsonb)
          `,
          [tenantId, session.id, bridgeToken.id, bridgeToken.kind, bridgeToken.tokenHash, bridgeToken.expiresAt, bridgeToken.usedAt, stringifySupplierBridgeJson(bridgeToken)]
        );
      }));
    },
    async getSession(tenantId, sessionId) {
      return run((client) => readAggregate(client, tenantId, sessionId));
    },
    async saveToken(tenantId, token) {
      await run(async (client) => {
        if (token.tenantId !== tenantId) throw new Error("Supplier token tenant scope mismatch.");
        await client.query(
          `
            INSERT INTO arcigy_supplier_bridge_tokens
              (client_id, session_id, token_id, kind, token_hash, expires_at, used_at, data)
            VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $7::timestamptz, $8::jsonb)
          `,
          [tenantId, token.sessionId, token.id, token.kind, token.tokenHash, token.expiresAt, token.usedAt, stringifySupplierBridgeJson(token)]
        );
      });
    },
    async consumeToken(tokenArgs) {
      return run((client) => transaction(client, async () => {
        const result = await client.query<DataRow>(
          `
            UPDATE arcigy_supplier_bridge_tokens
            SET used_at = $7::timestamptz,
                data = jsonb_set(data, '{usedAt}', to_jsonb($7::text), true),
                db_updated_at = now()
            WHERE client_id = $1 AND session_id = $2 AND token_id = $3
              AND token_hash = $4 AND kind = $5 AND used_at IS NULL
              AND expires_at > $6::timestamptz
            RETURNING data
          `,
          [tokenArgs.tenantId, tokenArgs.sessionId, tokenArgs.tokenId, tokenArgs.tokenHash, tokenArgs.kind, tokenArgs.now, tokenArgs.now]
        );
        return result.rows[0] ? data<SupplierBridgeTokenRecord>(result.rows[0], "Supplier bridge token") : null;
      }));
    },
    async validateToken(tokenArgs) {
      return run(async (client) => {
        const result = await client.query<DataRow>(
          `
            SELECT data FROM arcigy_supplier_bridge_tokens
            WHERE client_id = $1 AND session_id = $2 AND token_id = $3
              AND token_hash = $4 AND kind = $5 AND used_at IS NULL
              AND expires_at > $6::timestamptz
          `,
          [tokenArgs.tenantId, tokenArgs.sessionId, tokenArgs.tokenId, tokenArgs.tokenHash, tokenArgs.kind, tokenArgs.now]
        );
        return result.rows[0] ? data<SupplierBridgeTokenRecord>(result.rows[0], "Supplier bridge token") : null;
      });
    },
    async submitCandidate(input) {
      return run((client) => transaction(client, async () => {
        const sessionRow = await persistAt("CANDIDATE_SESSION_READ", () => client.query<DataRow>(
          "SELECT data FROM arcigy_supplier_sync_sessions WHERE client_id = $1 AND session_id = $2 FOR UPDATE",
          supplierBridgePostgresValues(input.tenantId, input.sessionId)
        ));
        const itemRow = await persistAt("CANDIDATE_ITEM_READ", () => client.query<DataRow>(
          "SELECT data FROM arcigy_supplier_sync_items WHERE client_id = $1 AND session_id = $2 AND sync_item_id = $3 FOR UPDATE",
          supplierBridgePostgresValues(input.tenantId, input.sessionId, input.candidate.syncItemId)
        ));
        const session = data<SupplierSyncSession>(sessionRow.rows[0], "Supplier sync session");
        const item = data<SupplierSyncItem>(itemRow.rows[0], "Supplier sync item");
        if (["cancelled", "completed", "expired", "failed"].includes(session.status)) throw new Error("Supplier sync session is not active.");
        const existing = await persistAt("CANDIDATE_IDEMPOTENCY_READ", () => client.query<DataRow>(
          `
            SELECT data FROM arcigy_supplier_product_candidates
            WHERE client_id = $1 AND session_id = $2 AND sync_item_id = $3 AND submission_id = $4
          `,
          supplierBridgePostgresValues(input.tenantId, input.sessionId, input.candidate.syncItemId, input.submissionId)
        ));
        if (existing.rows[0]) {
          const candidate = data<SupplierProductCandidate>(existing.rows[0], "Supplier product candidate");
          const observation = await persistAt("CANDIDATE_REPLAY_PRICE_READ", () => client.query<DataRow>(
            "SELECT data FROM arcigy_supplier_price_observations WHERE client_id = $1 AND candidate_id = $2",
            supplierBridgePostgresValues(input.tenantId, candidate.id)
          ));
          return {
            candidate,
            priceObservation: observation.rows[0] ? data<SupplierPriceObservation>(observation.rows[0], "Supplier price observation") : null,
            idempotent: true
          };
        }
        await persistAt("CANDIDATE_INSERT", () => client.query(
          `
            INSERT INTO arcigy_supplier_product_candidates
              (client_id, session_id, sync_item_id, candidate_id, submission_id, supplier_product_code, data)
            VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
          `,
          supplierBridgePostgresValues(input.tenantId, input.sessionId, input.candidate.syncItemId, input.candidate.id, input.submissionId, input.candidate.supplierProductCode, stringifySupplierBridgeJson(input.candidate))
        ));
        if (input.priceObservation && input.persistPriceObservation) {
          const observation = input.priceObservation;
          await persistAt("CANDIDATE_PRICE_INSERT", () => client.query(
            `
              INSERT INTO arcigy_supplier_price_observations
                (client_id, session_id, sync_item_id, candidate_id, observation_id, supplier_id, supplier_product_code, observed_at, data)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8::timestamptz, $9::jsonb)
            `,
            supplierBridgePostgresValues(input.tenantId, input.sessionId, observation.syncItemId, observation.candidateId, observation.id, observation.supplierId, observation.supplierProductCode, observation.observedAt, stringifySupplierBridgeJson(observation))
          ));
        }
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
        await persistAt("CANDIDATE_ITEM_UPDATE", () => client.query(
          "UPDATE arcigy_supplier_sync_items SET status = $4, data = $5::jsonb, db_updated_at = now() WHERE client_id = $1 AND session_id = $2 AND sync_item_id = $3",
          supplierBridgePostgresValues(input.tenantId, input.sessionId, item.id, item.status, stringifySupplierBridgeJson(item))
        ));
        await persistAt("CANDIDATE_SESSION_UPDATE", () => saveSession(client, session));
        return { candidate: structuredClone(input.candidate), priceObservation: structuredClone(input.priceObservation), idempotent: false };
      }));
    },
    async findLatestPriceObservation(observationArgs) {
      return run(async (client) => {
        const result = await persistAt("PRICE_LATEST_READ", () => client.query<DataRow>(
          `
            SELECT data FROM arcigy_supplier_price_observations
            WHERE client_id = $1 AND supplier_id = $2 AND supplier_product_code = $3
            ORDER BY observed_at DESC, db_created_at DESC
            LIMIT 1
          `,
          supplierBridgePostgresValues(observationArgs.tenantId, observationArgs.supplierId, observationArgs.supplierProductCode)
        ));
        return result.rows[0] ? data<SupplierPriceObservation>(result.rows[0], "Supplier price observation") : null;
      });
    },
    async touchPriceObservation(observationArgs) {
      return run(async (client) => {
        const result = await persistAt("PRICE_TOUCH", () => client.query<DataRow>(
          `
            UPDATE arcigy_supplier_price_observations
            SET data = jsonb_set(data, '{lastVerifiedAt}', to_jsonb($3::text), true), db_updated_at = now()
            WHERE client_id = $1 AND observation_id = $2
            RETURNING data
          `,
          supplierBridgePostgresValues(observationArgs.tenantId, observationArgs.observationId, observationArgs.lastVerifiedAt)
        ));
        return data<SupplierPriceObservation>(result.rows[0], "Supplier price observation");
      });
    },
    async confirmItem(confirmArgs) {
      return run((client) => transaction(client, async () => {
        const sessionRow = await persistAt("SESSION_READ", () => client.query<DataRow>(
          "SELECT data FROM arcigy_supplier_sync_sessions WHERE client_id = $1 AND session_id = $2 FOR UPDATE",
          [confirmArgs.tenantId, confirmArgs.sessionId]
        ));
        const itemRow = await persistAt("ITEM_READ", () => client.query<DataRow>(
          "SELECT data FROM arcigy_supplier_sync_items WHERE client_id = $1 AND session_id = $2 AND sync_item_id = $3 FOR UPDATE",
          [confirmArgs.tenantId, confirmArgs.sessionId, confirmArgs.syncItemId]
        ));
        const candidateRow = await persistAt("CANDIDATE_READ", () => client.query<DataRow>(
          "SELECT data FROM arcigy_supplier_product_candidates WHERE client_id = $1 AND sync_item_id = $2 AND candidate_id = $3",
          [confirmArgs.tenantId, confirmArgs.syncItemId, confirmArgs.candidateId]
        ));
        const session = await persistAt("SESSION_DATA", async () => data<SupplierSyncSession>(sessionRow.rows[0], "Supplier sync session"));
        const item = await persistAt("ITEM_DATA", async () => data<SupplierSyncItem>(itemRow.rows[0], "Supplier sync item"));
        await persistAt("CANDIDATE_DATA", async () => data<SupplierProductCandidate>(candidateRow.rows[0], "Supplier product candidate"));
        if (item.status === "confirmed" && item.selectedCandidateId === confirmArgs.candidateId) {
          return requireAggregate(client, confirmArgs.tenantId, confirmArgs.sessionId);
        }
        if (item.status === "confirmed") throw new Error("Supplier sync item is already confirmed with another candidate.");
        item.status = "confirmed";
        if (item.exactLookup) item.exactLookup.lookupStatus = "completed";
        item.selectedCandidateId = confirmArgs.candidateId;
        item.errorCode = null;
        item.updatedAt = confirmArgs.now;
        await persistAt("ITEM_UPDATE", () => client.query(
          "UPDATE arcigy_supplier_sync_items SET status = $4, data = $5::jsonb, db_updated_at = now() WHERE client_id = $1 AND session_id = $2 AND sync_item_id = $3",
          [confirmArgs.tenantId, confirmArgs.sessionId, item.id, item.status, stringifySupplierBridgeJson(item)]
        ));
        if (confirmArgs.mapping) {
          const mapping = confirmArgs.mapping;
          const mappingKey = supplierMappingKey(mapping);
          await persistAt("MAPPING_UPSERT", () => client.query(
            `
              INSERT INTO arcigy_material_supplier_mappings
                (client_id, mapping_key, supplier_id, supplier_product_code, confirmed_at, data)
              VALUES ($1, $2, $3, $4, $5::timestamptz, $6::jsonb)
              ON CONFLICT (client_id, mapping_key) DO UPDATE SET
                supplier_id = EXCLUDED.supplier_id,
                supplier_product_code = EXCLUDED.supplier_product_code,
                confirmed_at = EXCLUDED.confirmed_at,
                data = EXCLUDED.data,
                db_updated_at = now()
            `,
            [confirmArgs.tenantId, mappingKey, mapping.supplierId, mapping.supplierProductCode, mapping.confirmedAt, stringifySupplierBridgeJson(mapping)]
          ));
        }
        if (confirmArgs.catalogItem) {
          const catalogItem: SupplierCatalogItem = confirmArgs.catalogItem;
          await persistAt("CATALOG_UPSERT", () => client.query(
            `
              INSERT INTO arcigy_supplier_catalog_items
                (client_id, catalog_item_id, supplier_id, supplier_product_id, last_verified_at, data)
              VALUES ($1, $2, $3, $4, $5::timestamptz, $6::jsonb)
              ON CONFLICT (client_id, supplier_id, supplier_product_id) DO UPDATE SET
                last_verified_at = EXCLUDED.last_verified_at,
                data = jsonb_set(EXCLUDED.data, '{firstObservedAt}', COALESCE(arcigy_supplier_catalog_items.data->'firstObservedAt', EXCLUDED.data->'firstObservedAt'), true),
                db_updated_at = now()
            `,
            [catalogItem.tenantId, catalogItem.id, catalogItem.supplierId, catalogItem.supplierProductId, catalogItem.lastVerifiedAt, stringifySupplierBridgeJson(catalogItem)]
          ));
        }
        if (confirmArgs.materialSupplierAssignment) {
          const assignment: MaterialSupplierAssignment = confirmArgs.materialSupplierAssignment;
          await persistAt("MATERIAL_ASSIGNMENT_UPSERT", () => client.query(
            `
              INSERT INTO arcigy_material_supplier_assignments
                (client_id, material_assignment_id, supplier_catalog_item_id, selected_price_observation_id, price_locked, assigned_at, data)
              VALUES ($1, $2, $3, $4, $5, $6::timestamptz, $7::jsonb)
              ON CONFLICT (client_id, material_assignment_id) DO UPDATE SET
                supplier_catalog_item_id = EXCLUDED.supplier_catalog_item_id,
                selected_price_observation_id = EXCLUDED.selected_price_observation_id,
                price_locked = EXCLUDED.price_locked,
                assigned_at = EXCLUDED.assigned_at,
                data = EXCLUDED.data,
                db_updated_at = now()
            `,
            [assignment.tenantId, assignment.materialAssignmentId, assignment.supplierCatalogItemId, assignment.selectedPriceObservationId, assignment.priceLocked, assignment.assignedAt, stringifySupplierBridgeJson(assignment)]
          ));
        }
        await persistAt("SESSION_COMPLETE", () => completeSessionWhenDone(client, session, confirmArgs.now));
        return persistAt("AGGREGATE_READ", () => requireAggregate(client, confirmArgs.tenantId, confirmArgs.sessionId));
      }));
    },
    async skipItem(skipArgs) {
      return run((client) => transaction(client, async () => {
        const sessionRow = await client.query<DataRow>(
          "SELECT data FROM arcigy_supplier_sync_sessions WHERE client_id = $1 AND session_id = $2 FOR UPDATE",
          [skipArgs.tenantId, skipArgs.sessionId]
        );
        const itemRow = await client.query<DataRow>(
          "SELECT data FROM arcigy_supplier_sync_items WHERE client_id = $1 AND session_id = $2 AND sync_item_id = $3 FOR UPDATE",
          [skipArgs.tenantId, skipArgs.sessionId, skipArgs.syncItemId]
        );
        const session = data<SupplierSyncSession>(sessionRow.rows[0], "Supplier sync session");
        const item = data<SupplierSyncItem>(itemRow.rows[0], "Supplier sync item");
        if (item.status !== "confirmed") {
          item.status = "skipped";
          if (item.exactLookup) item.exactLookup.lookupStatus = skipArgs.errorCode === "USER_CANCELLED" ? "cancelled" : "failed";
          item.errorCode = skipArgs.errorCode;
          item.updatedAt = skipArgs.now;
          await client.query(
            "UPDATE arcigy_supplier_sync_items SET status = $4, data = $5::jsonb, db_updated_at = now() WHERE client_id = $1 AND session_id = $2 AND sync_item_id = $3",
            [skipArgs.tenantId, skipArgs.sessionId, item.id, item.status, stringifySupplierBridgeJson(item)]
          );
        }
        await completeSessionWhenDone(client, session, skipArgs.now);
        return requireAggregate(client, skipArgs.tenantId, skipArgs.sessionId);
      }));
    },
    async setSessionStatus(statusArgs) {
      return run((client) => transaction(client, async () => {
        const row = await client.query<DataRow>(
          "SELECT data FROM arcigy_supplier_sync_sessions WHERE client_id = $1 AND session_id = $2 FOR UPDATE",
          [statusArgs.tenantId, statusArgs.sessionId]
        );
        const session = data<SupplierSyncSession>(row.rows[0], "Supplier sync session");
        session.status = statusArgs.status;
        if (statusArgs.status === "cancelled") {
          const items = await client.query<DataRow>(
            "SELECT data FROM arcigy_supplier_sync_items WHERE client_id = $1 AND session_id = $2 FOR UPDATE",
            [statusArgs.tenantId, statusArgs.sessionId]
          );
          for (const row of items.rows) {
            const item = data<SupplierSyncItem>(row, "Supplier sync item");
            if (!item.exactLookup || item.exactLookup.lookupStatus === "completed") continue;
            item.exactLookup.lookupStatus = "cancelled";
            item.updatedAt = statusArgs.now;
            await client.query(
              "UPDATE arcigy_supplier_sync_items SET data = $4::jsonb, db_updated_at = now() WHERE client_id = $1 AND session_id = $2 AND sync_item_id = $3",
              [statusArgs.tenantId, statusArgs.sessionId, item.id, stringifySupplierBridgeJson(item)]
            );
          }
        }
        session.updatedAt = statusArgs.now;
        await saveSession(client, session);
        return requireAggregate(client, statusArgs.tenantId, statusArgs.sessionId);
      }));
    },
    async findMapping(mappingArgs) {
      return run(async (client) => {
        const result = await persistAt("MAPPING_READ", () => client.query<DataRow>(
          "SELECT data FROM arcigy_material_supplier_mappings WHERE client_id = $1 AND mapping_key = $2",
          supplierBridgePostgresValues(mappingArgs.tenantId, supplierMappingKey(mappingArgs))
        ));
        return result.rows[0] ? data<MaterialSupplierMapping>(result.rows[0], "Material supplier mapping") : null;
      });
    }
  };
}
