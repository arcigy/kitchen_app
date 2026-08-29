// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

const html2canvasMock = vi.hoisted(() => vi.fn());
vi.mock("html2canvas", () => ({ default: html2canvasMock }));

import { captureArcigyViewport, createFeedbackReportController } from "./feedbackReportController";

const PNG = "data:image/png;base64,cG5n";

async function setup(captureViewport: () => Promise<string | null> = vi.fn(async () => PNG)) {
  const trigger = document.createElement("button");
  document.body.append(trigger);
  const buildProjectSnapshot = vi.fn(() => ({ project: { id: "project-1" } }));
  const getDiagnostics = vi.fn(() => ({ selection: { id: "wall-1" } }));
  createFeedbackReportController({ trigger, captureViewport, buildProjectSnapshot, getDiagnostics }).mount();
  trigger.click();
  await new Promise((resolve) => setTimeout(resolve));
  return { trigger, captureViewport, buildProjectSnapshot, getDiagnostics };
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
  html2canvasMock.mockReset();
  document.body.replaceChildren();
});

describe("feedback report controller", () => {
  it("captures the visible Arcigy application before the feedback form can cover it", async () => {
    const trigger = document.createElement("button");
    const materialsPanel = document.createElement("aside");
    materialsPanel.className = "materials-panel";
    materialsPanel.textContent = "Materiály";
    const captureViewport = vi.fn(async () => {
      expect(document.querySelector(".feedback-report-overlay")).toBeNull();
      expect(document.querySelector(".materials-panel")?.textContent).toBe("Materiály");
      return PNG;
    });
    document.body.append(trigger, materialsPanel);

    createFeedbackReportController({ trigger, captureViewport, buildProjectSnapshot: () => ({}), getDiagnostics: () => ({}) }).mount();
    trigger.click();
    await new Promise((resolve) => setTimeout(resolve));

    expect(captureViewport).toHaveBeenCalledOnce();
    expect(document.querySelector(".feedback-report-overlay")).not.toBeNull();
  });

  it("captures the full visible browser viewport through the DOM renderer", async () => {
    html2canvasMock.mockResolvedValue({ width: 1440, height: 900, toDataURL: () => PNG });
    Object.defineProperties(window, {
      innerWidth: { configurable: true, value: 1440 },
      innerHeight: { configurable: true, value: 900 },
      scrollX: { configurable: true, value: 25 },
      scrollY: { configurable: true, value: 50 }
    });

    await expect(captureArcigyViewport()).resolves.toBe(PNG);
    expect(html2canvasMock).toHaveBeenCalledWith(document.body, expect.objectContaining({
      width: 1440,
      height: 900,
      windowWidth: 1440,
      windowHeight: 900,
      scrollX: -25,
      scrollY: -50
    }));
  });

  it("replaces Share with a report action and shows the required form and full-app preview", async () => {
    const { trigger } = await setup();
    expect(trigger.textContent).toBe("Nahlásiť problém");
    expect(document.querySelector(".feedback-report-dialog")).not.toBeNull();
    expect(document.querySelector(".feedback-report-dialog")?.textContent).toContain("screenshot celej viditeľnej Arcigy aplikácie");
    expect(document.querySelectorAll("option")).toHaveLength(5);
    expect(document.querySelector<HTMLImageElement>(".feedback-report-preview")?.src).toContain(PNG);
    expect(document.querySelector<HTMLInputElement>("input[name='consent']")?.required).toBe(true);
  });

  it("blocks delivery with a clear state when the full-app capture is unavailable", async () => {
    await setup(vi.fn(async () => null));

    expect(document.querySelector(".feedback-report-preview")).toBeNull();
    expect(document.querySelector(".feedback-report-dialog")?.textContent).toContain("Screenshot celej viditeľnej Arcigy aplikácie nie je v tomto okamihu dostupný");
  });

  it("sends immutable capture inputs only after validation and consent", async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ ok: true }), { status: 201 }));
    vi.stubGlobal("fetch", fetchMock);
    const { buildProjectSnapshot, getDiagnostics } = await setup();
    await submit();

    expect(fetchMock).toHaveBeenCalledOnce();
    const init = fetchMock.mock.calls[0]![1]!;
    const payload = JSON.parse(String(init.body));
    expect(payload).toMatchObject({ kind: "bug", consent: true, screenshotDataUrl: PNG, projectSnapshot: { project: { id: "project-1" } } });
    expect(payload.diagnostics).toEqual(expect.objectContaining({ selection: { id: "wall-1" }, recentActions: expect.any(Array), recentRuntimeErrors: expect.any(Array) }));
    expect(buildProjectSnapshot).toHaveBeenCalledOnce();
    expect(getDiagnostics).toHaveBeenCalledOnce();
  });

  it("keeps the dialog open and exposes a safe error when delivery fails", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ error: "Odoo je nedostupné." }), { status: 502 })));
    await setup();
    await submit();

    expect(document.querySelector(".feedback-report-dialog")).not.toBeNull();
    expect(document.querySelector("[data-feedback-status]")?.textContent).toBe("Odoo je nedostupné.");
    expect(document.querySelector<HTMLButtonElement>('button[type="submit"]')?.disabled).toBe(false);
  });
});
