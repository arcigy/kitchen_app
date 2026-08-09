// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createFeedbackReportController } from "./feedbackReportController";

function setup() {
  const trigger = document.createElement("button");
  const canvas = document.createElement("canvas");
  Object.defineProperties(canvas, { width: { value: 20 }, height: { value: 10 } });
  vi.spyOn(canvas, "toDataURL").mockReturnValue("data:image/png;base64,cG5n");
  document.body.append(trigger, canvas);
  const buildProjectSnapshot = vi.fn(() => ({ project: { id: "project-1" } }));
  const getDiagnostics = vi.fn(() => ({ selection: { id: "wall-1" } }));
  createFeedbackReportController({ trigger, canvas, buildProjectSnapshot, getDiagnostics }).mount();
  trigger.click();
  return { trigger, buildProjectSnapshot, getDiagnostics };
}

async function submit(): Promise<void> {
  const form = document.querySelector<HTMLFormElement>("#feedback-report-form")!;
  (form.elements.namedItem("title") as HTMLInputElement).value = "Nefunguje export";
  (form.elements.namedItem("description") as HTMLTextAreaElement).value = "Export sa po kliknutí nevytvorí.";
  (form.elements.namedItem("consent") as HTMLInputElement).checked = true;
  form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  await new Promise((resolve) => setTimeout(resolve));
}

afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("feedback report controller", () => {
  it("captures the editor before the feedback form can cover it", () => {
    const trigger = document.createElement("button");
    const canvas = document.createElement("canvas");
    Object.defineProperties(canvas, { width: { value: 20 }, height: { value: 10 } });
    const toDataUrl = vi.spyOn(canvas, "toDataURL").mockImplementation(() => {
      expect(document.querySelector(".feedback-report-overlay")).toBeNull();
      return "data:image/png;base64,cG5n";
    });
    document.body.append(trigger, canvas);

    createFeedbackReportController({ trigger, canvas, buildProjectSnapshot: () => ({}), getDiagnostics: () => ({}) }).mount();
    trigger.click();

    expect(toDataUrl).toHaveBeenCalledOnce();
    expect(document.querySelector(".feedback-report-overlay")).not.toBeNull();
  });

  it("replaces Share with a report action and shows the required form and canvas preview", () => {
    const { trigger } = setup();
    expect(trigger.textContent).toBe("Nahlásiť problém");
    expect(document.querySelector(".feedback-report-dialog")).not.toBeNull();
    expect(document.querySelectorAll("option")).toHaveLength(5);
    expect(document.querySelector<HTMLImageElement>(".feedback-report-preview")?.src).toContain("data:image/png;base64,cG5n");
    expect(document.querySelector<HTMLInputElement>("input[name='consent']")?.required).toBe(true);
  });

  it("sends immutable capture inputs only after validation and consent", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ ok: true }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const { buildProjectSnapshot, getDiagnostics } = setup();
    await submit();

    expect(fetchMock).toHaveBeenCalledOnce();
    const init = fetchMock.mock.calls[0]![1]!;
    const payload = JSON.parse(String(init.body));
    expect(payload).toMatchObject({ kind: "bug", consent: true, screenshotDataUrl: "data:image/png;base64,cG5n", projectSnapshot: { project: { id: "project-1" } } });
    expect(payload.diagnostics).toEqual(expect.objectContaining({ selection: { id: "wall-1" }, recentActions: expect.any(Array), recentRuntimeErrors: expect.any(Array) }));
    expect(buildProjectSnapshot).toHaveBeenCalledOnce();
    expect(getDiagnostics).toHaveBeenCalledOnce();
  });

  it("keeps the dialog open and exposes a safe error when delivery fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "Odoo je nedostupné." }), { status: 502 })));
    setup();
    await submit();

    expect(document.querySelector(".feedback-report-dialog")).not.toBeNull();
    expect(document.querySelector("[data-feedback-status]")?.textContent).toBe("Odoo je nedostupné.");
    expect(document.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(false);
  });
});
