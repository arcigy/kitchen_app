// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupplierSyncSessionView } from "../core/supplier-bridge/supplier-bridge-types";
import { createSupplierBridgeWebController } from "./supplierBridgeWebController";

const view: SupplierSyncSessionView = {
  schemaVersion: 1,
  session: { id: "session-1", tenantId: "tenant-1", projectId: "project-1", userId: "user-1", supplierId: "demos", status: "active", createdAt: "2026-07-10T08:00:00.000Z", updatedAt: "2026-07-10T08:00:00.000Z", expiresAt: "2026-07-10T09:00:00.000Z" },
  items: [], candidates: [], priceObservations: [], currentItem: null,
  counts: { total: 2, processed: 1, pending: 1, needsConfirmation: 1, completed: 0, skipped: 0, failed: 0 }
};

afterEach(() => vi.restoreAllMocks());

describe("supplier bridge web controller", () => {
  it("opens the selected supplier with the active project context", async () => {
    history.replaceState({}, "", "/");
    const fetchMock = vi.fn().mockImplementation((url: string) => Promise.resolve(new Response(JSON.stringify(
      url === "/api/suppliers"
        ? { ok: true, suppliers: [{ supplierId: "demos", displayName: "Démos", startUrl: "https://www.demos24plus.com/", adapterKey: "demos", sortOrder: 10 }] }
        : { ok: true, view, bridgeToken: "one-time-bridge-token-that-is-long-enough" }
    ), { status: url === "/api/suppliers" ? 200 : 201, headers: { "Content-Type": "application/json" } })));
    vi.stubGlobal("fetch", fetchMock);
    const openWindow = vi.spyOn(window, "open").mockReturnValue({} as Window);
    const posted: Array<Record<string, unknown>> = [];
    vi.spyOn(window, "postMessage").mockImplementation((message: unknown) => {
      const request = message as Record<string, unknown>;
      posted.push(request);
      window.setTimeout(() => window.dispatchEvent(new MessageEvent("message", {
        source: window,
        origin: window.location.origin,
        data: { source: "ARCIGY_EXTENSION", type: "SUPPLIER_BRIDGE_RESULT", requestId: request.requestId, nonce: request.nonce, sessionId: request.sessionId, ok: true, opened: true, errorCode: null }
      })), 0);
    });
    const onStateChanged = vi.fn();
    const controller = createSupplierBridgeWebController({ getProjectId: () => "project-1", getProjectLabel: () => "Kuchyňa Novák", onStateChanged, onProjectMaterialsChanged: vi.fn(), pollIntervalMs: 60_000 });

    await controller.open();
    await controller.start("demos");

    expect(openWindow).toHaveBeenCalledWith("https://www.demos24plus.com/", "_blank", "noopener");
    expect(fetchMock).toHaveBeenCalledWith("/api/projects/project-1/supplier-sync-sessions", expect.objectContaining({ body: JSON.stringify({ supplierId: "demos", projectId: "project-1", lookups: [] }) }));
    const start = posted.find((message) => message.type === "START_SUPPLIER_SESSION");
    expect(start).toMatchObject({ source: "ARCIGY_WEB", sessionId: "session-1", bridgeToken: "one-time-bridge-token-that-is-long-enough", projectLabel: "Kuchyňa Novák" });
    expect(onStateChanged).toHaveBeenLastCalledWith(expect.objectContaining({ connection: "connected", total: 2, needsConfirmation: 1, fallbackInstruction: false }));
    controller.destroy();
  });

  it("opens the supplier tab before waiting for session creation", async () => {
    history.replaceState({}, "", "/");
    let resolveSession!: (response: Response) => void;
    const sessionResponse = new Promise<Response>((resolve) => { resolveSession = resolve; });
    vi.stubGlobal("fetch", vi.fn().mockImplementation((url: string) => url === "/api/suppliers"
      ? Promise.resolve(new Response(JSON.stringify({ ok: true, suppliers: [{ supplierId: "demos", displayName: "Démos", startUrl: "https://www.demos24plus.com/", adapterKey: "demos", sortOrder: 10 }] }), { status: 200 }))
      : sessionResponse));
    const openWindow = vi.spyOn(window, "open").mockReturnValue({} as Window);
    vi.spyOn(window, "postMessage").mockImplementation(() => undefined);
    const controller = createSupplierBridgeWebController({ getProjectId: () => "project-1", onStateChanged: vi.fn(), onProjectMaterialsChanged: vi.fn() });
    await controller.open();

    const pendingStart = controller.start("demos");

    expect(openWindow).toHaveBeenCalledOnce();
    resolveSession(new Response(JSON.stringify({ ok: false, error: "test stop" }), { status: 500 }));
    await pendingStart;
    controller.destroy();
  });
});
