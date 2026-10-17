/**
 * Daily client metrics batch sent to Odoo (arcigy_client_crm). Only aggregates leave the app:
 * per company per day/month and per user per month, never single events, timestamps of people,
 * project names or end-customer data. See docs/CRM_CLIENT_METRICS.md.
 */
export const CRM_EXPORT_SCHEMA_VERSION = 1;
export const CRM_EXPORT_TIME_ZONE = "Europe/Bratislava";
/** Target AI cost of one project in USD. */
export const CRM_AI_COST_TARGET_USD = 0.1;

export type CrmUserState = "active_30d" | "inactive" | "deactivated";
export type CrmAppRole = "administrator" | "team_member" | "observer";

export type CrmExportUser = {
  user_key: string;
  name: string;
  position: string;
  app_role: CrmAppRole;
  state: CrmUserState;
};

export type CrmExportDaily = {
  date: string;
  users_total: number;
  users_active_30d: number;
  projects_created: number;
  projects_deleted: number;
  offers_generated: number;
  offers_sheet_generated: number;
  /** Net: offers marked as sent minus reverted markings that day. */
  offers_sent: number;
  pdf_documents_processed: number;
  pdf_items_proposed: number;
  pdf_items_corrected: number;
  pdf_items_rejected: number;
  pdf_items_added_by_user: number;
  ai_cost_usd_pdf: number;
  ai_cost_usd_assistant: number;
  ai_cost_usd_other: number;
  ai_calls: number;
  ai_calls_unpriced: number;
};

export type CrmExportMonthly = {
  month: string;
  projects_with_ai: number;
  ai_cost_per_project_avg_usd: number;
  ai_cost_per_project_p90_usd: number;
  ai_cost_per_project_max_usd: number;
  projects_over_target: number;
  ai_cost_usd_without_project: number;
};

export type CrmExportUserMonthly = {
  user_key: string;
  month: string;
  projects_created: number;
  offers_generated: number;
  offers_sent: number;
  pdf_documents_processed: number;
  pdf_items_proposed: number;
  pdf_items_corrected: number;
};

export type CrmExportClient = {
  client_key: string;
  name: string;
  users: CrmExportUser[];
  daily: CrmExportDaily[];
  monthly: CrmExportMonthly[];
  user_monthly: CrmExportUserMonthly[];
};

export type CrmExportPayload = {
  schema_version: typeof CRM_EXPORT_SCHEMA_VERSION;
  batch_id: string;
  environment: string;
  generated_at: string;
  timezone: typeof CRM_EXPORT_TIME_ZONE;
  date_from: string;
  date_to: string;
  clients: CrmExportClient[];
  control_totals: { projects_created: number; offers_sent: number; ai_cost_usd: number; ai_calls: number };
};

/** Raw source rows, read per client for a window that covers the batch plus 30 days. */
export type CrmSourceRows = {
  organizations: Array<{ clientId: string; name: string }>;
  users: Array<{ clientId: string; userId: string; name: string; position: string; isActive: boolean; role: string | null }>;
  projects: Array<{ clientId: string; projectId: string; createdAt: string; createdByUserId: string }>;
  events: Array<{ clientId: string; projectId: string; actorUserId: string; eventType: string; createdAt: string; data: Record<string, unknown> }>;
  aiUsage: Array<{ clientId: string; projectId: string | null; userId: string | null; feature: string; costUsd: number; costBasis: string; createdAt: string }>;
  pdfOutcomes: Array<{ clientId: string; projectId: string; documentSha256: string; proposedBy: string; outcome: string; decidedByUserId: string | null; decidedAt: string }>;
};
