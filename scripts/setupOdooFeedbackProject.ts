/**
 * Explicit one-time Odoo setup. It is never imported by the application.
 * Required env: ARCIGY_ODOO_URL, ARCIGY_ODOO_API_KEY. Optional: ARCIGY_ODOO_DATABASE.
 */
const projectName = "Arcigy – Client Feedback";
const tags = ["bug", "feature_request", "improvement", "question", "other"];
const stages = ["New", "In review", "Done"];

type OdooSettings = { baseUrl: string; apiKey: string; database?: string };

function settings(): OdooSettings {
  const baseUrl = process.env.ARCIGY_ODOO_URL?.trim();
  const apiKey = process.env.ARCIGY_ODOO_API_KEY?.trim();
  if (!baseUrl || !apiKey) throw new Error("Set ARCIGY_ODOO_URL and ARCIGY_ODOO_API_KEY before running this explicit setup.");
  const url = new URL(baseUrl);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) throw new Error("ARCIGY_ODOO_URL must use HTTPS.");
  return { baseUrl: url.toString().replace(/\/$/, ""), apiKey, database: process.env.ARCIGY_ODOO_DATABASE?.trim() };
}

async function call(config: OdooSettings, model: string, method: string, body: unknown): Promise<unknown> {
  const response = await fetch(`${config.baseUrl}/json/2/${model}/${method}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json", ...(config.database ? { "X-Odoo-Database": config.database } : {}) },
    body: JSON.stringify(body), signal: AbortSignal.timeout(15_000)
  });
  if (!response.ok) throw new Error(`Odoo ${model}/${method} failed (${response.status}).`);
  return await response.json();
}

async function findOrCreate(config: OdooSettings, model: string, name: string, vals: Record<string, unknown>): Promise<number> {
  const matches = await call(config, model, "search_read", { domain: [["name", "=", name]], fields: ["id"], limit: 1 });
  if (Array.isArray(matches) && typeof matches[0]?.id === "number") return matches[0].id;
  const id = await call(config, model, "create", { vals });
  if (typeof id !== "number") throw new Error(`Odoo did not return an id for ${model}.`);
  return id;
}

async function main(): Promise<void> {
  if (process.argv[2] !== "--apply") throw new Error("This one-time setup changes Odoo only when run with --apply.");
  const config = settings();
  const projectId = await findOrCreate(config, "project.project", projectName, { name: projectName });
  const tagIds: Record<string, number> = {};
  for (const tag of tags) tagIds[tag] = await findOrCreate(config, "project.tags", tag, { name: tag });
  for (const stage of stages) await findOrCreate(config, "project.task.type", stage, { name: stage, project_ids: [[4, projectId]] });
  console.log("Odoo feedback project is ready. Configure these server-only values:");
  console.log(`ARCIGY_ODOO_FEEDBACK_PROJECT_ID=${projectId}`);
  for (const [tag, id] of Object.entries(tagIds)) console.log(`ARCIGY_ODOO_FEEDBACK_TAG_${tag.toUpperCase()}_ID=${id}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
