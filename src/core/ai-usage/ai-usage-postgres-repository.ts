import { withSchemaClient } from "../database/postgres-client";
import type { AiUsageRepository } from "./ai-usage-types";

type AiUsageDatabase = { connectionString: string; schema: string };

export function createPostgresAiUsageRepository(database: AiUsageDatabase): AiUsageRepository {
  return {
    async record(event) {
      const result = await withSchemaClient(database.connectionString, database.schema, (client) => client.query(
        `INSERT INTO arcigy_ai_usage_events
           (client_id, usage_id, project_id, user_id, feature, provider, model, input_tokens, cached_input_tokens,
            output_tokens, cost_usd, cost_basis, price_table_version, provider_request_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
         ON CONFLICT DO NOTHING`,
        [
          event.clientId,
          event.usageId,
          event.projectId,
          event.userId,
          event.feature,
          event.provider,
          event.model,
          event.inputTokens,
          event.cachedInputTokens,
          event.outputTokens,
          event.costUsd,
          event.costBasis,
          event.priceTableVersion,
          event.providerRequestId,
          event.createdAt
        ]
      ));
      return { recorded: (result.rowCount ?? 0) > 0 };
    }
  };
}
