import type http from "node:http";
import { describe, expect, it, vi } from "vitest";
import type { ClientCatalog } from "../core/catalog/catalog-types";
import { handleAssistantApi } from "./assistantEndpoint";

describe("assistant capability endpoint", () => {
  it("returns authenticated tool knowledge and tenant availability", async () => {
    const sendJson = vi.fn();
    const handled = await handleAssistantApi(
      { method: "GET", headers: { cookie: "session=test" } } as http.IncomingMessage,
      {} as http.ServerResponse,
      new URL("http://localhost/api/assistant/capabilities"),
      {
        projectRoot: ".",
        getContext: vi.fn(async () => ({ clientId: "client_a", userId: "user_a", role: "owner" as const })),
        getCatalog: vi.fn(async () => ({
          modules: [
            { id: "enabled", moduleType: "drawer_low", modulePackageId: "drawer_low_v1", name: "Drawer", enabled: true },
            { id: "disabled", moduleType: "hidden", modulePackageId: "hidden_v1", name: "Hidden", enabled: false }
          ]
        } as ClientCatalog)),
        readJsonBody: vi.fn(),
        sendJson
      }
    );

    expect(handled).toBe(true);
    expect(sendJson).toHaveBeenCalledOnce();
    const [, status, body] = sendJson.mock.calls[0]!;
    expect(status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      knowledgeVersion: "assistant-capabilities.v3",
      tenantAvailability: { enabledModulePackageIds: ["drawer_low_v1"] }
    });
    expect(body.tools).toHaveLength(49);
    expect(body.orchestratorToolMetadata).toHaveLength(49);
    expect(body.orchestration).toMatchObject({
      stages: ["communicator", "orchestrator", "executor", "analyzer", "communicator"],
      maxIterations: 5
    });
    expect(body.orchestration.models.find((item: { role: string }) => item.role === "executor")).toMatchObject({ model: null });
    expect(body.boundaries.some((item: { id: string }) => item.id === "render-export")).toBe(true);
    expect(body.capabilityPacks.map((item: { id: string }) => item.id)).toContain("kitchen-pricing");
  });

  it("exposes only read and verification capabilities to a viewer", async () => {
    const sendJson = vi.fn();
    await handleAssistantApi(
      { method: "GET", headers: { cookie: "session=test" } } as http.IncomingMessage,
      {} as http.ServerResponse,
      new URL("http://localhost/api/assistant/capabilities"),
      {
        projectRoot: ".",
        getContext: vi.fn(async () => ({ clientId: "client_a", userId: "user_a", role: "viewer" as const })),
        getCatalog: vi.fn(async () => ({ modules: [] } as unknown as ClientCatalog)),
        readJsonBody: vi.fn(),
        sendJson
      }
    );

    const [, status, body] = sendJson.mock.calls[0]!;
    expect(status).toBe(200);
    expect(body.tools.every((tool: { readOnly: boolean }) => tool.readOnly)).toBe(true);
    expect(body.orchestratorToolMetadata.every((tool: { operation: string }) => tool.operation !== "write")).toBe(true);
  });

  it("authorizes an exact vendor module only from the authenticated tenant catalog", async () => {
    const sendJson = vi.fn();
    const readJsonBody = vi.fn<() => Promise<unknown>>(async () => ({
      toolId: "vendorCatalog.insertResolvedModule",
      input: {
        catalogKey: "UA-60",
        productTemplateId: "tpl_ua",
        moduleType: "drawer_low",
        modulePackageId: "drawer_low_family_v1",
        initialParams: { type: "drawer_low" }
      }
    }));
    await handleAssistantApi(
      { method: "POST", headers: { cookie: "session=test" } } as http.IncomingMessage,
      {} as http.ServerResponse,
      new URL("http://localhost/api/assistant/tool-authorization"),
      {
        projectRoot: ".",
        getContext: vi.fn(async () => ({ clientId: "client_a", userId: "user_a", role: "owner" as const })),
        getCatalog: vi.fn(async () => ({
          modules: [{ id: "drawer", moduleType: "drawer_low", modulePackageId: "drawer_low_family_v1", name: "Drawer", enabled: true }],
          vendorCatalog: { productVariants: [{ catalogKey: "UA-60", productTemplateId: "tpl_ua" }] }
        } as ClientCatalog)),
        readJsonBody,
        sendJson
      }
    );

    expect(sendJson).toHaveBeenCalledWith(expect.anything(), 200, expect.objectContaining({ authorized: true }));

    readJsonBody.mockResolvedValueOnce({
      toolId: "vendorCatalog.insertResolvedModule",
      input: {
        catalogKey: "FOREIGN",
        productTemplateId: "tpl_ua",
        moduleType: "drawer_low",
        modulePackageId: "drawer_low_family_v1",
        initialParams: { type: "drawer_low" }
      }
    });
    await handleAssistantApi(
      { method: "POST", headers: { cookie: "session=test" } } as http.IncomingMessage,
      {} as http.ServerResponse,
      new URL("http://localhost/api/assistant/tool-authorization"),
      {
        projectRoot: ".",
        getContext: vi.fn(async () => ({ clientId: "client_a", userId: "user_a", role: "owner" as const })),
        getCatalog: vi.fn(async () => ({
          modules: [{ id: "drawer", moduleType: "drawer_low", modulePackageId: "drawer_low_family_v1", name: "Drawer", enabled: true }],
          vendorCatalog: { productVariants: [{ catalogKey: "UA-60", productTemplateId: "tpl_ua" }] }
        } as ClientCatalog)),
        readJsonBody,
        sendJson
      }
    );
    expect(sendJson).toHaveBeenLastCalledWith(expect.anything(), 403, expect.objectContaining({ authorized: false }));
  });

  it("rejects a viewer write even when the browser tries to authorize it directly", async () => {
    const sendJson = vi.fn();
    await handleAssistantApi(
      { method: "POST", headers: { cookie: "session=test" } } as http.IncomingMessage,
      {} as http.ServerResponse,
      new URL("http://localhost/api/assistant/tool-authorization"),
      {
        projectRoot: ".",
        getContext: vi.fn(async () => ({ clientId: "client_a", userId: "user_a", role: "viewer" as const })),
        getCatalog: vi.fn(async () => ({ modules: [] } as unknown as ClientCatalog)),
        readJsonBody: vi.fn(async () => ({ toolId: "project.save", input: {} })),
        sendJson
      }
    );

    expect(sendJson).toHaveBeenCalledWith(expect.anything(), 403, expect.objectContaining({ authorized: false }));
  });

  it("authorizes a semantic kitchen only when every referenced catalog item belongs to the tenant", async () => {
    const sendJson = vi.fn();
    const readJsonBody = vi.fn<() => Promise<unknown>>(async () => ({
      toolId: "kitchen.create",
      input: {
        name: "Kitchen A",
        layout: { shape: "straight", runsMm: [2400], turns: [] },
        contextPatch: { corpusMaterialId: "mat_body", handleComponentId: "handle_1" },
        modules: [{ modulePackageId: "drawer_low_v1", zone: "lower", runIndex: 0 }]
      }
    }));
    const catalog = {
      modules: [{ id: "drawer", moduleType: "drawer_low", modulePackageId: "drawer_low_v1", name: "Drawer", enabled: true }],
      materials: [{ id: "mat_body", isActive: true }],
      components: [{ id: "handle_1", isActive: true }]
    } as ClientCatalog;
    const deps = {
      projectRoot: ".",
      getContext: vi.fn(async () => ({ clientId: "client_a", userId: "user_a", role: "owner" as const })),
      getCatalog: vi.fn(async () => catalog),
      readJsonBody,
      sendJson
    };

    await handleAssistantApi(
      { method: "POST", headers: { cookie: "session=test" } } as http.IncomingMessage,
      {} as http.ServerResponse,
      new URL("http://localhost/api/assistant/tool-authorization"),
      deps
    );
    expect(sendJson).toHaveBeenLastCalledWith(expect.anything(), 200, expect.objectContaining({ authorized: true }));

    readJsonBody.mockResolvedValueOnce({
      toolId: "kitchen.create",
      input: {
        name: "Kitchen A",
        layout: { shape: "straight", runsMm: [2400], turns: [] },
        contextPatch: {},
        modules: [{ modulePackageId: "foreign_package", zone: "lower", runIndex: 0 }]
      }
    });
    await handleAssistantApi(
      { method: "POST", headers: { cookie: "session=test" } } as http.IncomingMessage,
      {} as http.ServerResponse,
      new URL("http://localhost/api/assistant/tool-authorization"),
      deps
    );
    expect(sendJson).toHaveBeenLastCalledWith(expect.anything(), 403, expect.objectContaining({ authorized: false }));
  });
});
