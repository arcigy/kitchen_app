import process from "node:process";
import { boundedLimit, parseOdooDiagnostics } from "../src/core/feedback/odoo-feedback-reader";

type OdooTask = { id: number; name: string; description?: string; create_date?: string; write_date?: string; stage_id?: [number, string] };
type Attachment = { res_id: number; datas?: string };

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

async function call(model: string, method: string, body: unknown): Promise<unknown> {
  const baseUrl = required("ARCIGY_ODOO_URL").replace(/\/$/, "");
  const response = await fetch(`${baseUrl}/json/2/${model}/${method}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${required("ARCIGY_ODOO_API_KEY")}`,
      "Content-Type": "application/json; charset=utf-8",
      ...(process.env.ARCIGY_ODOO_DATABASE?.trim() ? { "X-Odoo-Database": process.env.ARCIGY_ODOO_DATABASE.trim() } : {})
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000)
  });
  if (!response.ok) throw new Error(`Odoo ${model}/${method} failed (${response.status}).`);
  return await response.json() as unknown;
}

async function main(): Promise<void> {
  if (process.env.ARCIGY_SUPPORT_READ !== "true") throw new Error("Set ARCIGY_SUPPORT_READ=true for an explicit, read-only support lookup.");
  const projectId = Number(required("ARCIGY_ODOO_FEEDBACK_PROJECT_ID"));
  if (!Number.isInteger(projectId) || projectId <= 0) throw new Error("ARCIGY_ODOO_FEEDBACK_PROJECT_ID is invalid.");
  const includeDiagnostics = process.argv.includes("--include-diagnostics");
  const limit = boundedLimit(process.argv.find((item) => item.startsWith("--limit="))?.slice("--limit=".length));
  const taskId = Number(process.argv.find((item) => item.startsWith("--taskId="))?.slice("--taskId=".length));
  const domain: unknown[] = [["project_id", "=", projectId], ["name", "like", "[Arcigy "]];
  if (Number.isInteger(taskId) && taskId > 0) domain.push(["id", "=", taskId]);
  const tasks = await call("project.task", "search_read", {
    domain,
    fields: ["id", "name", "description", "create_date", "write_date", "stage_id"],
    limit,
    order: "write_date desc, id desc"
  });
  if (!Array.isArray(tasks)) throw new Error("Odoo task lookup returned an invalid response.");
  const taskRows = tasks.filter((item): item is OdooTask => Boolean(item) && typeof item === "object" && Number.isInteger((item as OdooTask).id));
  if (!includeDiagnostics || taskRows.length === 0) {
    process.stdout.write(`${JSON.stringify({ ok: true, taskCount: taskRows.length, tasks: taskRows })}\n`);
    return;
  }
  const attachments = await call("ir.attachment", "search_read", {
    domain: [["res_model", "=", "project.task"], ["res_id", "in", taskRows.map((task) => task.id)], ["name", "=", "diagnostics.json"]],
    fields: ["res_id", "datas"],
    limit: taskRows.length
  });
  if (!Array.isArray(attachments)) throw new Error("Odoo attachment lookup returned an invalid response.");
  const diagnosticsByTaskId = new Map<number, Record<string, unknown>>();
  for (const attachment of attachments as Attachment[]) {
    if (typeof attachment.res_id === "number" && typeof attachment.datas === "string") diagnosticsByTaskId.set(attachment.res_id, parseOdooDiagnostics(attachment.datas));
  }
  process.stdout.write(`${JSON.stringify({ ok: true, taskCount: taskRows.length, tasks: taskRows.map((task) => ({ ...task, diagnostics: diagnosticsByTaskId.get(task.id) ?? null })) })}\n`);
}

main().catch((error: unknown) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
