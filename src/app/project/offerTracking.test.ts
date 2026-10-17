import { describe, expect, it, vi } from "vitest";
import type { ProjectMetadata } from "../../core/project/project-types";
import type { ProjectRuntimeState } from "./projectActions";
import { createOfferTracking, recordOfferExport } from "./offerTracking";

const project = { projectId: "kitchen 1", status: "draft" } as ProjectMetadata;

function response(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("offer tracking", () => {
  it("does nothing without an open project", async () => {
    const fetchImpl = vi.fn();
    await expect(recordOfferExport(null, "pdf", { fetchImpl })).resolves.toBe(false);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("retries a failed report with the same idempotency key", async () => {
    const fetchImpl = vi.fn()
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce(response(503))
      .mockResolvedValueOnce(response(200, { ok: true, recorded: true }));
    const sleep = vi.fn(async () => undefined);
    await expect(recordOfferExport("kitchen 1", "pdf", { fetchImpl, sleep })).resolves.toBe(true);

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    const keys = fetchImpl.mock.calls.map(([, init]) => (init as RequestInit & { headers: Record<string, string> }).headers["Idempotency-Key"]);
    expect(new Set(keys).size).toBe(1);
    expect(keys[0]).toMatch(/^offer-pdf:/);
    expect(fetchImpl.mock.calls[0][0]).toBe("/api/projects/kitchen%201/offer-events");
    expect(JSON.parse(String((fetchImpl.mock.calls[0][1] as RequestInit).body))).toEqual({ type: "offer.pdf_generated" });
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("gives up on client errors and after the last retry without throwing", async () => {
    const rejected = vi.fn(async () => response(400));
    await expect(recordOfferExport("kitchen 1", "sheet", { fetchImpl: rejected, sleep: async () => undefined })).resolves.toBe(false);
    expect(rejected).toHaveBeenCalledTimes(1);

    const offline = vi.fn(async () => { throw new TypeError("offline"); });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await expect(recordOfferExport("kitchen 1", "sheet", { fetchImpl: offline, sleep: async () => undefined })).resolves.toBe(false);
    expect(offline).toHaveBeenCalledTimes(3);
    warn.mockRestore();
  });

  it("marks the offer as sent and applies the server metadata to the open project", async () => {
    const state = { currentProject: project } as ProjectRuntimeState;
    const updateCurrentMetadata = vi.fn((next: ProjectMetadata) => { state.currentProject = next; });
    const fetchImpl = vi.fn(async () => response(200, { ok: true, project: { ...project, status: "sent" } }));
    const tracking = createOfferTracking({ getState: () => state, updateCurrentMetadata }, { fetchImpl });

    await expect(tracking.setSent(true)).resolves.toMatchObject({ status: "sent" });
    expect(fetchImpl).toHaveBeenCalledWith("/api/projects/kitchen%201/offer-status", expect.objectContaining({ method: "PUT", body: JSON.stringify({ sent: true }) }));
    expect(updateCurrentMetadata).toHaveBeenCalledWith(expect.objectContaining({ status: "sent" }));
    expect(tracking.currentProject()?.status).toBe("sent");
  });

  it("surfaces a failed status change", async () => {
    const state = { currentProject: project } as ProjectRuntimeState;
    const tracking = createOfferTracking(
      { getState: () => state, updateCurrentMetadata: vi.fn() },
      { fetchImpl: vi.fn(async () => response(403, { ok: false, error: "Viewer role cannot change the offer status." })) }
    );
    await expect(tracking.setSent(true)).rejects.toThrow("Viewer role cannot change the offer status.");
  });
});
