import { fetchExternalText } from "./external-http";
import type { CrmExportConfig } from "../core/crm-export/crm-export-config";
import type { OdooIngestResult } from "../core/crm-export/crm-export-runner";
import type { CrmExportPayload } from "../core/crm-export/crm-export-types";

/** Sends one batch to Odoo's `arcigy.client.export.batch.arcigy_ingest` over JSON-2. */
export async function deliverCrmBatchToOdoo(config: CrmExportConfig, payload: CrmExportPayload): Promise<OdooIngestResult> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.odooApiKey}`,
    "Content-Type": "application/json; charset=utf-8",
    "User-Agent": "Arcigy-CRM-Export/1.0"
  };
  if (config.odooDatabase) headers["X-Odoo-Database"] = config.odooDatabase;
  const { response, text } = await fetchExternalText(
    `${config.odooUrl}/json/2/arcigy.client.export.batch/arcigy_ingest`,
    { method: "POST", headers, body: JSON.stringify({ payload }) },
    { timeoutMs: 30_000, maxBytes: 1024 * 1024 }
  );
  let result: unknown;
  try {
    result = JSON.parse(text) as unknown;
  } catch {
    throw new Error(`Odoo CRM ingest returned ${response.status} without JSON.`);
  }
  if (!response.ok) {
    const message = result && typeof result === "object" && "message" in result ? String((result as { message: unknown }).message) : "";
    throw new Error(`Odoo CRM ingest returned ${response.status}${message ? `: ${message.slice(0, 300)}` : ""}.`);
  }
  if (!result || typeof result !== "object") throw new Error("Odoo CRM ingest returned an invalid result.");
  return result as OdooIngestResult;
}

export async function sendCrmExportAlert(config: CrmExportConfig, message: string): Promise<void> {
  console.error(`[crm-export] ${message}`);
  if (!config.alertUrl) return;
  await fetchExternalText(config.alertUrl, { method: "POST", headers: { Title: "Arcigy CRM export" }, body: message }, { timeoutMs: 10_000, maxBytes: 64 * 1024 });
}
