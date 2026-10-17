import { describe, expect, it, vi } from "vitest";
import { runCrmExportTick, sourceWindow, type CrmExportOutbox, type StoredCrmBatch } from "./crm-export-runner";
import type { CrmExportPayload, CrmSourceRows } from "./crm-export-types";

const emptyRows: CrmSourceRows = {
  organizations: [{ clientId: "client_delfi", name: "DELFI" }],
  users: [],
  projects: [],
  events: [],
  aiUsage: [],
  pdfOutcomes: []
};

function memoryOutbox(lastDelivered: string | null, due: StoredCrmBatch[] = []) {
  const stored: CrmExportPayload[] = [];
  const outbox: CrmExportOutbox & { stored: CrmExportPayload[] } = {
    stored,
    store: vi.fn(async (payload: CrmExportPayload) => { stored.push(payload); due.push({ batchId: payload.batch_id, payload, attempts: 0 }); }),
    due: vi.fn(async () => [...due]),
    markDelivered: vi.fn(async () => undefined),
    markFailed: vi.fn(async () => undefined),
    lastDeliveredDateTo: vi.fn(async () => lastDelivered)
  };
  return outbox;
}

function deps(now: string, outbox: CrmExportOutbox, deliver = vi.fn(async () => ({ ok: true, state: "applied" }))) {
  const readRows = vi.fn(async () => emptyRows);
  return { now: new Date(now), environment: "prod", clientKeys: ["client_delfi"], source: { readRows }, outbox, deliver, alert: vi.fn(async () => undefined) };
}

describe("CRM export scheduler tick", () => {
  it("waits until 02:30 Bratislava time before building yesterday's batch", async () => {
    const outbox = memoryOutbox(null);
    // 00:10 UTC on Wed 2026-10-14 is 02:10 local.
    const result = await runCrmExportTick(deps("2026-10-14T00:10:00Z", outbox));
    expect(result.built).toBeNull();
    expect(outbox.store).not.toHaveBeenCalled();
  });

  it("builds a 35-day batch when nothing was delivered yet and delivers it", async () => {
    const outbox = memoryOutbox(null);
    const context = deps("2026-10-14T00:40:00Z", outbox);
    const result = await runCrmExportTick(context);
    expect(outbox.stored[0]).toMatchObject({ date_from: "2026-09-09", date_to: "2026-10-13" });
    expect(result).toEqual({ built: outbox.stored[0].batch_id, delivered: [outbox.stored[0].batch_id], failed: [] });
    expect(outbox.markDelivered).toHaveBeenCalledWith(outbox.stored[0].batch_id, context.now);
  });

  it("builds only the last 7 days when it is caught up, and nothing more that day", async () => {
    const caughtUp = memoryOutbox("2026-10-12");
    await runCrmExportTick(deps("2026-10-14T05:00:00Z", caughtUp));
    expect(caughtUp.stored[0]).toMatchObject({ date_from: "2026-10-07", date_to: "2026-10-13" });

    const done = memoryOutbox("2026-10-13");
    await expect(runCrmExportTick(deps("2026-10-14T06:00:00Z", done))).resolves.toEqual({ built: null, delivered: [], failed: [] });
  });

  it("re-sends the full 35 days every Monday to heal a restored Odoo", async () => {
    const outbox = memoryOutbox("2026-10-17");
    await runCrmExportTick(deps("2026-10-19T03:00:00Z", outbox));
    expect(outbox.stored[0]).toMatchObject({ date_from: "2026-09-14", date_to: "2026-10-18" });
  });

  it("keeps a failed batch for the next tick and alerts after a day of failures", async () => {
    const payload = { batch_id: "prod:old" } as CrmExportPayload;
    const outbox = memoryOutbox("2026-10-13", [{ batchId: "prod:old", payload, attempts: 23 }]);
    const context = deps("2026-10-14T06:00:00Z", outbox, vi.fn(async () => { throw new Error("Odoo down"); }));
    const result = await runCrmExportTick(context);
    expect(result.failed).toEqual(["prod:old"]);
    expect(outbox.markFailed).toHaveBeenCalledWith("prod:old", "Odoo down");
    expect(context.alert).toHaveBeenCalledWith(expect.stringContaining("failed 24 times: Odoo down"));
  });

  it("treats an Odoo rejection as a failure", async () => {
    const outbox = memoryOutbox("2026-10-13", [{ batchId: "prod:bad", payload: {} as CrmExportPayload, attempts: 0 }]);
    const result = await runCrmExportTick(deps("2026-10-14T06:00:00Z", outbox, vi.fn(async () => ({ ok: false, state: "rejected", error: "schema_version 2 is not supported" }))));
    expect(result.failed).toEqual(["prod:bad"]);
    expect(outbox.markFailed).toHaveBeenCalledWith("prod:bad", "schema_version 2 is not supported");
  });

  it("reads a source window that covers the 30-day lookback and the whole month", () => {
    expect(sourceWindow("2026-10-07", "2026-10-13")).toEqual({
      from: new Date("2026-08-30T00:00:00Z"),
      to: new Date("2026-10-15T00:00:00Z")
    });
  });
});
