import { describe, expect, it } from "vitest";
import { buildCrmExportPayload, exportMonths, localDate } from "./crm-export-aggregation";
import { CRM_GOLDEN_ROWS } from "./crm-export.fixture";

const rows = CRM_GOLDEN_ROWS;

describe("CRM export aggregation", () => {
  const payload = buildCrmExportPayload({
    rows,
    clientKeys: ["client_delfi"],
    dateFrom: "2026-10-11",
    dateTo: "2026-10-12",
    environment: "prod",
    generatedAt: new Date("2026-10-13T00:30:00Z")
  });
  const delfi = payload.clients[0];

  it("exports only allow-listed clients", () => {
    expect(payload.clients.map((client) => client.client_key)).toEqual(["client_delfi"]);
  });

  it("aggregates each day in the Bratislava time zone", () => {
    expect(delfi.daily).toEqual([
      {
        date: "2026-10-11", users_total: 2, users_active_30d: 2, projects_created: 1, projects_deleted: 0,
        offers_generated: 1, offers_sheet_generated: 1, offers_sent: 0,
        pdf_documents_processed: 0, pdf_items_proposed: 0, pdf_items_corrected: 0, pdf_items_rejected: 0, pdf_items_added_by_user: 0,
        ai_cost_usd_pdf: 0, ai_cost_usd_assistant: 0.02, ai_cost_usd_other: 0, ai_calls: 1, ai_calls_unpriced: 0
      },
      {
        date: "2026-10-12", users_total: 2, users_active_30d: 2, projects_created: 1, projects_deleted: 1,
        offers_generated: 0, offers_sheet_generated: 0, offers_sent: 1,
        pdf_documents_processed: 1, pdf_items_proposed: 3, pdf_items_corrected: 1, pdf_items_rejected: 1, pdf_items_added_by_user: 1,
        ai_cost_usd_pdf: 0.09, ai_cost_usd_assistant: 0.015, ai_cost_usd_other: 0, ai_calls: 4, ai_calls_unpriced: 1
      }
    ]);
  });

  it("computes the monthly AI cost per project against the 10-cent target", () => {
    expect(delfi.monthly).toEqual([{
      month: "2026-10-01",
      projects_with_ai: 2,
      ai_cost_per_project_avg_usd: 0.06,
      ai_cost_per_project_p90_usd: 0.11,
      ai_cost_per_project_max_usd: 0.11,
      projects_over_target: 1,
      ai_cost_usd_without_project: 0.005
    }]);
  });

  it("keeps users as monthly aggregates and derives their state", () => {
    expect(delfi.users).toEqual([
      { user_key: "client_delfi:u1", name: "Aleš", position: "Konštruktér", app_role: "administrator", state: "active_30d" },
      { user_key: "client_delfi:u2", name: "Bea", position: "Obchod", app_role: "team_member", state: "active_30d" },
      { user_key: "client_delfi:u3", name: "Cyril", position: "Archív", app_role: "observer", state: "deactivated" }
    ]);
    expect(delfi.user_monthly).toEqual([
      { user_key: "client_delfi:u1", month: "2026-10-01", projects_created: 1, offers_generated: 1, offers_sent: 1, pdf_documents_processed: 1, pdf_items_proposed: 3, pdf_items_corrected: 1 },
      { user_key: "client_delfi:u2", month: "2026-10-01", projects_created: 1, offers_generated: 0, offers_sent: 0, pdf_documents_processed: 0, pdf_items_proposed: 0, pdf_items_corrected: 0 },
      { user_key: "client_delfi:u3", month: "2026-10-01", projects_created: 0, offers_generated: 0, offers_sent: 0, pdf_documents_processed: 0, pdf_items_proposed: 0, pdf_items_corrected: 0 }
    ]);
  });

  it("carries control totals and a content-addressed batch ID", () => {
    expect(payload.control_totals).toEqual({ projects_created: 2, offers_sent: 1, ai_cost_usd: 0.125, ai_calls: 5 });
    expect(payload.batch_id).toMatch(/^prod:2026-10-11\.\.2026-10-12:[0-9a-f]{16}$/);
    const replay = buildCrmExportPayload({ rows, clientKeys: ["client_delfi"], dateFrom: "2026-10-11", dateTo: "2026-10-12", environment: "prod", generatedAt: new Date() });
    expect(replay.batch_id).toBe(payload.batch_id);
    const changed = buildCrmExportPayload({ rows: { ...rows, events: rows.events.slice(1) }, clientKeys: ["client_delfi"], dateFrom: "2026-10-11", dateTo: "2026-10-12", environment: "prod", generatedAt: new Date() });
    expect(changed.batch_id).not.toBe(payload.batch_id);
  });

  it("never exports names of projects, events or end customers", () => {
    const serialized = JSON.stringify(payload);
    for (const forbidden of ["p0", "p1\"", "projectCreatedAt", "doc-a", "Demo"]) expect(serialized).not.toContain(forbidden);
  });
});

describe("CRM export calendar helpers", () => {
  it("converts timestamps to the Bratislava calendar day across DST", () => {
    expect(localDate("2026-10-24T22:30:00Z")).toBe("2026-10-25");
    expect(localDate("2026-10-25T23:30:00Z")).toBe("2026-10-26");
    expect(localDate("2026-10-25T22:30:00Z")).toBe("2026-10-25");
  });

  it("recomputes the previous month during the first days of a month", () => {
    expect(exportMonths("2026-10-27", "2026-11-02")).toEqual(["2026-10-01", "2026-11-01"]);
    expect(exportMonths("2026-11-03", "2026-11-09")).toEqual(["2026-11-01"]);
    expect(exportMonths("2026-11-01", "2026-11-05")).toEqual(["2026-10-01", "2026-11-01"]);
  });
});

describe("CRM export contract with Odoo", () => {
  it("produces exactly the example batch that arcigy_client_crm's tests ingest", async () => {
    const { readFile } = await import("node:fs/promises");
    const path = await import("node:path");
    const example = JSON.parse(await readFile(path.join(process.cwd(), "src/core/crm-export/fixtures/crm-export.v1.example.json"), "utf-8"));
    const payload = buildCrmExportPayload({
      rows: CRM_GOLDEN_ROWS,
      clientKeys: ["client_delfi"],
      dateFrom: "2026-10-11",
      dateTo: "2026-10-12",
      environment: "prod",
      generatedAt: new Date("2026-10-13T00:30:00Z")
    });
    // A failure here means the Odoo side (arcigy/odoo, integrations/fixtures) must change too.
    expect(JSON.parse(JSON.stringify(payload))).toEqual(example);
  });
});
