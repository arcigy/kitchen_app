import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ClientContext } from "../core/client/client-context";
import { clearFeedbackReportDeliveriesForTest, handleFeedbackReportApi } from "./feedbackReportEndpoint";

const context: ClientContext = { clientId: "tenant-a", userId: "user-a", role: "owner" };
const env = {
  ARCIGY_ODOO_URL: "https://odoo.example.test",
  ARCIGY_ODOO_API_KEY: "test-key",
  ARCIGY_ODOO_FEEDBACK_PROJECT_ID: "42"
};

function report(submissionId = "report-1") {
  return {
    submissionId,
    kind: "bug",
    title: "Dvierka sa neotvárajú",
    description: "Po kliknutí sa nič nestane.",
    comment: "",
    consent: true,
    screenshotDataUrl: "data:image/png;base64,cG5n",
    projectSnapshot: { projectId: "project-a", objects: [] },
    diagnostics: { viewport: { width: 1440, height: 900 } }
  };
}

async function send(body: ReturnType<typeof report>, fetchImpl: typeof fetch) {
  const sendJson = vi.fn();
  const handled = await handleFeedbackReportApi(
    { method: "POST", headers: { cookie: "session=yes", "idempotency-key": body.submissionId } } as never,
    {} as never,
    new URL("http://localhost/api/feedback-reports"),
    { getContext: vi.fn(async () => context), readJsonBody: vi.fn(async () => body), sendJson, fetch: fetchImpl, env }
  );
  return { handled, sendJson };
}

describe("feedback report endpoint", () => {
  beforeEach(clearFeedbackReportDeliveriesForTest);

  it("creates the feedback task and the three required attachments with server-validated reporter context", async () => {
    const requests: Array<{ url: string; body: Record<string, unknown> }> = [];
    const fetchImpl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      requests.push({ url: String(url), body: JSON.parse(String(init?.body)) as Record<string, unknown> });
      return new Response(JSON.stringify([requests.length === 1 ? 777 : 1000 + requests.length]), { status: 200 });
    }) as unknown as typeof fetch;
    const result = await send(report(), fetchImpl);

    expect(result.handled).toBe(true);
    expect(result.sendJson).toHaveBeenCalledWith(expect.anything(), 201, expect.objectContaining({ ok: true, taskId: 777, replayed: false }));
    expect(requests).toHaveLength(4);
    expect(requests[0].url).toContain("/json/2/project.task/create");
    expect(requests[0].body).toEqual(expect.objectContaining({ vals_list: [expect.objectContaining({ project_id: 42 })] }));
    const attachmentValues = requests.slice(1).map((request) => (request.body.vals_list as Array<{ name: string; datas: string }>)[0]);
    expect(attachmentValues.map((values) => values.name)).toEqual(["screenshot.png", "project-snapshot.json", "diagnostics.json"]);
    const diagnostics = JSON.parse(Buffer.from(attachmentValues[2].datas, "base64").toString("utf8"));
    expect(diagnostics.reporter).toEqual({ userId: "user-a", clientId: "tenant-a" });
  });

  it("retries an incomplete submission without duplicating the Odoo task or completed attachment", async () => {
    let call = 0;
    const fetchImpl = vi.fn(async () => {
      call += 1;
      if (call === 3) return new Response("failure", { status: 500 });
      return new Response(JSON.stringify([call === 1 ? 777 : call]), { status: 200 });
    }) as unknown as typeof fetch;

    const first = await send(report(), fetchImpl);
    const retry = await send(report(), fetchImpl);

    expect(first.sendJson).toHaveBeenCalledWith(expect.anything(), 502, expect.anything());
    expect(retry.sendJson).toHaveBeenCalledWith(expect.anything(), 200, expect.objectContaining({ ok: true, taskId: 777, replayed: true }));
    expect(fetchImpl).toHaveBeenCalledTimes(5);
  });

  it("rejects an invalid Odoo 19 create result before reporting success", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(777), { status: 200 })) as unknown as typeof fetch;

    const result = await send(report(), fetchImpl);

    expect(result.sendJson).toHaveBeenCalledWith(
      expect.anything(),
      502,
      expect.objectContaining({ ok: false, error: "Odoo nevytvorilo úlohu." })
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("requires a matching idempotency key and a screenshot", async () => {
    const sendJson = vi.fn();
    const invalid = { ...report(), screenshotDataUrl: "" };
    await handleFeedbackReportApi(
      { method: "POST", headers: { "idempotency-key": "different" } } as never,
      {} as never,
      new URL("http://localhost/api/feedback-reports"),
      { getContext: vi.fn(async () => context), readJsonBody: vi.fn(async () => invalid), sendJson, env }
    );
    expect(sendJson).toHaveBeenCalledWith(expect.anything(), 400, expect.objectContaining({ ok: false }));
  });
});
