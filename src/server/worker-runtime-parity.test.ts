import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("runtime and injectable worker parity", () => {
  it("keeps both worker entrypoints on one shared security pipeline", async () => {
    const [files, pipeline, router] = await Promise.all([
      Promise.all([
      readFile(path.join(process.cwd(), "server", "workerServer.ts"), "utf-8"),
      readFile(path.join(process.cwd(), "src", "server", "workerServer.ts"), "utf-8")
      ]),
      readFile(path.join(process.cwd(), "src", "server", "workerRequestPipeline.ts"), "utf-8"),
      readFile(path.join(process.cwd(), "src", "server", "workerApiRouter.ts"), "utf-8")
    ]);

    for (const source of files) {
      expect(source).toContain("createWorkerRequestHandler({");
      expect(source).toContain("handleWorkerApiRequest(req, res, url");
      expect(source).toContain("checkReadiness: checkDatabaseReadiness");
      expect(source).toContain("handleApplicationRequest: (req, res, url)");
      expect(source).toContain("createServerAuthSessionStore");
      expect(source).toContain("sessionLookup:");
      expect(source).toContain(".isActive(session)");
      expect(source).not.toContain("registerRequestObservability(req, res)");
      expect(source).not.toContain("shouldRejectRequestOrigin(req, url.pathname)");
      expect(source).not.toContain("requestBudget.acquire(req, url)");
      expect(source).not.toContain("handleProjectApi(req, res, url");
    }

    expect(pipeline).toContain('url.pathname === "/api/auth/session"');
    expect(pipeline).toContain("handleClientJourneyMetricsApi(req, res, url");
    expect(pipeline).toContain("context.requestMetrics.render() + context.clientJourneyMetrics.render()");
    expect(pipeline).toContain('url.pathname === "/ready"');
    expect(pipeline).toContain("getServerErrorStatus");
    expect(pipeline).toContain("publicServerErrorMessage");
    expect(pipeline).toContain('res.setHeader("Retry-After", "2")');
    expect(pipeline).toContain("context.requestMetrics.register(req, res)");
    expect(pipeline).toContain("registerMutationAudit(req, res, url, requestId)");
    expect(pipeline).toContain("context.requestBudget.acquire(req, url)");

    expect(router).toContain("handleClientAppDataRevisionApi(req, res, url");
    expect(router).toContain("handleCatalogExactLookupApi(req, res, url");
    expect(router).toContain("handleModulePackageApi(req, res, url");
    expect(router).toContain("handleProjectMaterialsApi(req, res, url");
    expect(router).toContain("handleSupplierBridgeApi(req, res, url");
    expect(router).toContain("handleProjectApi(req, res, url");
    expect(router).toContain("handleAssistantApi(req, res, url");
  });
});
