import type http from "node:http";
import type { ClientContext } from "../core/client/client-context";

const MAX_SCREENSHOT_BYTES = 8 * 1024 * 1024;
const MAX_SNAPSHOT_BYTES = 20 * 1024 * 1024;
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;
const kinds = new Set(["bug", "feature_request", "improvement", "question", "other"]);

type FeedbackDeps = {
  getContext(cookie: string | string[] | undefined): Promise<ClientContext>;
  readJsonBody(req: http.IncomingMessage): Promise<unknown>;
  sendJson(res: http.ServerResponse, status: number, data: unknown): void;
  fetch?: typeof fetch;
  env?: NodeJS.ProcessEnv;
};

type DeliveryState = {
  expiresAt: number;
  taskId?: number;
  completed: Set<string>;
  inFlight?: Promise<void>;
};

const deliveries = new Map<string, DeliveryState>();

class FeedbackReportError extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new FeedbackReportError("Neplatný feedback report.");
  return value as Record<string, unknown>;
}

function text(value: unknown, name: string, max: number, required = true): string {
  if (typeof value !== "string" || (required && !value.trim()) || value.length > max) throw new FeedbackReportError(`Neplatné pole ${name}.`);
  return value.trim();
}

function jsonBytes(value: unknown): number { return Buffer.byteLength(JSON.stringify(value), "utf8"); }

function pngData(value: unknown): string {
  const screenshot = text(value, "screenshotDataUrl", Math.ceil(MAX_SCREENSHOT_BYTES * 4 / 3));
  const prefix = "data:image/png;base64,";
  if (!screenshot.startsWith(prefix)) throw new FeedbackReportError("Screenshot je príliš veľký alebo neplatný.");
  const encoded = screenshot.slice(prefix.length);
  if (!encoded || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(encoded)) {
    throw new FeedbackReportError("Screenshot je príliš veľký alebo neplatný.");
  }
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.byteLength > MAX_SCREENSHOT_BYTES || bytes.subarray(0, 8).compare(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) !== 0) {
    throw new FeedbackReportError("Screenshot je príliš veľký alebo neplatný.");
  }
  return encoded;
}

function config(env: NodeJS.ProcessEnv) {
  const baseUrl = env.ARCIGY_ODOO_URL?.trim();
  const apiKey = env.ARCIGY_ODOO_API_KEY?.trim();
  const projectId = Number(env.ARCIGY_ODOO_FEEDBACK_PROJECT_ID);
  if (!baseUrl || !apiKey || !Number.isInteger(projectId) || projectId <= 0) throw new FeedbackReportError("Odoo feedback integrácia nie je nakonfigurovaná.", 503);
  const url = new URL(baseUrl);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) throw new FeedbackReportError("Odoo feedback URL musí používať HTTPS.", 503);
  const tagIdByKind = Object.fromEntries([...kinds].flatMap((kind) => {
    const id = Number(env[`ARCIGY_ODOO_FEEDBACK_TAG_${kind.toUpperCase()}_ID`]);
    return Number.isInteger(id) && id > 0 ? [[kind, id]] : [];
  })) as Partial<Record<string, number>>;
  return { baseUrl: url.toString().replace(/\/$/, ""), apiKey, projectId, database: env.ARCIGY_ODOO_DATABASE?.trim(), tagIdByKind };
}

function cleanupDeliveries(now = Date.now()): void {
  for (const [key, delivery] of deliveries) if (delivery.expiresAt <= now) deliveries.delete(key);
}

async function odooCall(fetchImpl: typeof fetch, settings: ReturnType<typeof config>, model: string, method: string, body: unknown) {
  const response = await fetchImpl(`${settings.baseUrl}/json/2/${model}/${method}`, {
    method: "POST",
    redirect: "error",
    headers: { Authorization: `Bearer ${settings.apiKey}`, "Content-Type": "application/json; charset=utf-8", ...(settings.database ? { "X-Odoo-Database": settings.database } : {}) },
    body: JSON.stringify(body), signal: AbortSignal.timeout(15_000)
  });
  if (!response.ok) throw new FeedbackReportError("Odoo prijatie reportu zlyhalo.", 502);
  return await response.json() as unknown;
}

async function deliver(
  state: DeliveryState,
  fetchImpl: typeof fetch,
  settings: ReturnType<typeof config>,
  report: { submissionId: string; kind: string; title: string; description: string; comment: string; screenshot: string; projectSnapshot: unknown; diagnostics: Record<string, unknown>; reporter: ClientContext }
): Promise<void> {
  if (!state.taskId) {
    const task = await odooCall(fetchImpl, settings, "project.task", "create", { vals: {
      name: `[Arcigy ${report.kind}] ${report.title}`,
      project_id: settings.projectId,
      description: ["Arcigy feedback report", `submission=${report.submissionId}`, `type=${report.kind}`, "", report.description, report.comment ? `\nComment:\n${report.comment}` : ""].join("\n"),
      ...(settings.tagIdByKind[report.kind] ? { tag_ids: [[6, 0, [settings.tagIdByKind[report.kind]]]] } : {})
    } });
    if (typeof task !== "number") throw new FeedbackReportError("Odoo nevytvorilo úlohu.", 502);
    state.taskId = task;
  }
  const attachments = [
    { key: "screenshot.png", name: "screenshot.png", data: report.screenshot, mimetype: "image/png" },
    { key: "project-snapshot.json", name: "project-snapshot.json", data: Buffer.from(JSON.stringify(report.projectSnapshot, null, 2)).toString("base64"), mimetype: "application/json" },
    { key: "diagnostics.json", name: "diagnostics.json", data: Buffer.from(JSON.stringify({ ...report.diagnostics, reporter: { userId: report.reporter.userId, clientId: report.reporter.clientId } }, null, 2)).toString("base64"), mimetype: "application/json" }
  ];
  for (const attachment of attachments) {
    if (state.completed.has(attachment.key)) continue;
    await odooCall(fetchImpl, settings, "ir.attachment", "create", { vals: { name: attachment.name, datas: attachment.data, mimetype: attachment.mimetype, res_model: "project.task", res_id: state.taskId } });
    state.completed.add(attachment.key);
  }
}

export async function handleFeedbackReportApi(req: http.IncomingMessage, res: http.ServerResponse, url: URL, deps: FeedbackDeps): Promise<boolean> {
  if (req.method !== "POST" || url.pathname !== "/api/feedback-reports") return false;
  try {
    const reporter = await deps.getContext(req.headers.cookie);
    const body = object(await deps.readJsonBody(req));
    const submissionId = text(body.submissionId, "submissionId", 120);
    const headerId = req.headers["idempotency-key"];
    if (typeof headerId !== "string" || headerId !== submissionId) throw new FeedbackReportError("Chýba platný Idempotency-Key.");
    const kind = text(body.kind, "kind", 40);
    if (!kinds.has(kind) || body.consent !== true) throw new FeedbackReportError("Pred odoslaním potvrďte zdieľanie príloh.");
    const title = text(body.title, "title", 180);
    const description = text(body.description, "description", 8_000);
    const comment = text(body.comment ?? "", "comment", 4_000, false);
    const screenshot = pngData(body.screenshotDataUrl);
    if (jsonBytes(body.projectSnapshot) > MAX_SNAPSHOT_BYTES || jsonBytes(body.diagnostics) > MAX_SNAPSHOT_BYTES) throw new FeedbackReportError("Projektový snapshot je príliš veľký na bezpečné odoslanie.");
    const diagnostics = object(body.diagnostics);
    const settings = config(deps.env ?? process.env);
    const key = `${reporter.clientId}\u0000${reporter.userId}\u0000${submissionId}`;
    cleanupDeliveries();
    let state = deliveries.get(key);
    const replayed = Boolean(state);
    if (!state) {
      state = { expiresAt: Date.now() + IDEMPOTENCY_TTL_MS, completed: new Set() };
      deliveries.set(key, state);
    }
    if (!state.inFlight) {
      state.inFlight = deliver(state, deps.fetch ?? fetch, settings, { submissionId, kind, title, description, comment, screenshot, projectSnapshot: body.projectSnapshot, diagnostics, reporter })
        .finally(() => { state!.inFlight = undefined; });
    }
    await state.inFlight;
    deps.sendJson(res, replayed ? 200 : 201, { ok: true, submissionId, taskId: state.taskId, replayed });
  } catch (error) {
    const known = error instanceof FeedbackReportError;
    deps.sendJson(res, known ? error.status : 400, { ok: false, error: known ? error.message : "Feedback report sa nepodarilo odoslať." });
  }
  return true;
}

export function clearFeedbackReportDeliveriesForTest(): void {
  deliveries.clear();
}
