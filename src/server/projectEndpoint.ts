import type http from "node:http";
import { createFileClientCatalogRepository } from "../core/catalog/catalog-file-repository";
import type { ClientContext } from "../core/client/client-context";
import { createFileModulePackageRepository } from "../core/module-package/module-package-repository";
import { createProjectService } from "../core/project/project-service";
import type { CreateProjectInput } from "../core/project/project-types";
import { PROJECT_FILE_MIME_TYPE, toSafeProjectFileName } from "../core/project-save/project-save-file";
import { createServerProjectRepository } from "./projectRepository";

type ReadJsonBody = (req: http.IncomingMessage) => Promise<unknown>;
type SendJson = (res: http.ServerResponse, status: number, data: unknown) => void;
type GetContext = (cookieHeader: string | string[] | undefined) => Promise<ClientContext>;

type ProjectEndpointDeps = {
  projectRoot: string;
  getContext: GetContext;
  readJsonBody: ReadJsonBody;
  sendJson: SendJson;
};

function isProjectRoute(pathname: string): boolean {
  return pathname === "/api/projects" || pathname === "/api/projects/import" || pathname.startsWith("/api/projects/");
}

function parseProjectRoute(pathname: string):
  | { projectId: string; action: "metadata" | "save" | "load" | "download" | "versions" }
  | { projectId: string; action: "loadVersion" | "restoreVersion"; versionNumber: number }
  | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] !== "api" || parts[1] !== "projects" || !parts[2]) return null;
  const projectId = decodeURIComponent(parts[2]);
  if (parts.length === 3) return { projectId, action: "metadata" };
  if (parts.length === 4 && ["save", "load", "download"].includes(parts[3])) {
    return { projectId, action: parts[3] as "save" | "load" | "download" };
  }
  if (parts.length === 4 && parts[3] === "versions") return { projectId, action: "versions" };
  if (parts.length === 6 && parts[3] === "versions" && ["load", "restore"].includes(parts[5])) {
    const versionNumber = Number(parts[4]);
    if (Number.isInteger(versionNumber) && versionNumber > 0) {
      return { projectId, action: parts[5] === "load" ? "loadVersion" : "restoreVersion", versionNumber };
    }
  }
  return null;
}

function assertNoClientIdPayload(body: unknown): void {
  if (body && typeof body === "object" && "clientId" in body) {
    throw new Error("Unexpected clientId in request body.");
  }
}

function getBodyRecord(body: unknown): Record<string, unknown> {
  if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Expected JSON body.");
  return body as Record<string, unknown>;
}

function asCreateProjectInput(body: unknown): CreateProjectInput {
  const record = getBodyRecord(body);
  return {
    name: String(record.name ?? ""),
    location: {
      address: String(record.address ?? record.locationAddress ?? ""),
      city: typeof record.city === "string" ? record.city : undefined,
      postalCode: typeof record.postalCode === "string" ? record.postalCode : undefined,
      country: typeof record.country === "string" ? record.country : undefined,
      notes: typeof record.notes === "string" ? record.notes : undefined
    },
    contact: {
      name: String(record.contactName ?? ""),
      email: typeof record.email === "string" ? record.email : undefined,
      phone: typeof record.phone === "string" ? record.phone : undefined,
      company: typeof record.company === "string" ? record.company : undefined
    }
  };
}

export async function handleProjectApi(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  url: URL,
  deps: ProjectEndpointDeps
): Promise<boolean> {
  if (!isProjectRoute(url.pathname)) return false;

  const ctx = await deps.getContext(req.headers.cookie);
  const repository = createServerProjectRepository({ projectRoot: deps.projectRoot });
  const service = createProjectService(repository);

  if (req.method === "POST" && url.pathname === "/api/projects") {
    const body = await deps.readJsonBody(req);
    assertNoClientIdPayload(body);
    const project = await service.createProject(ctx, asCreateProjectInput(body));
    deps.sendJson(res, 201, { ok: true, project });
    return true;
  }

  if (req.method === "GET" && url.pathname === "/api/projects") {
    deps.sendJson(res, 200, { ok: true, projects: await service.listProjects(ctx) });
    return true;
  }

  if (req.method === "POST" && url.pathname === "/api/projects/import") {
    const body = await deps.readJsonBody(req);
    assertNoClientIdPayload(body);
    const record = getBodyRecord(body);
    const envelopeText = typeof record.envelope === "string" ? record.envelope : JSON.stringify(record.envelope ?? body);
    const save = await service.importEncryptedProjectFile(ctx, envelopeText);
    deps.sendJson(res, 200, { ok: true, save });
    return true;
  }

  const route = parseProjectRoute(url.pathname);
  if (!route) return false;

  if (req.method === "GET" && route.action === "metadata") {
    deps.sendJson(res, 200, { ok: true, project: await service.getProject(ctx, route.projectId) });
    return true;
  }

  if (req.method === "POST" && route.action === "save") {
    const body = await deps.readJsonBody(req);
    assertNoClientIdPayload(body);
    const record = getBodyRecord(body);
    const project = await service.getProject(ctx, route.projectId);
    const appState = getBodyRecord(record.appState ?? {});
    const catalog = await createFileClientCatalogRepository(deps.projectRoot).ensureCatalogExists(ctx);
    const modulePackages = await createFileModulePackageRepository(deps.projectRoot).listPackages(ctx);
    const save = await service.saveCurrentProject(ctx, {
      projectId: project.projectId,
      activePhaseId: project.activePhaseId,
      project,
      catalog,
      modulePackages,
      layoutState: appState.layout ?? null,
      kitchenState: appState.kitchen ?? null,
      moduleInstances: Array.isArray(appState.modules) ? appState.modules : [],
      sceneState: appState.scene ?? null,
      editorState: appState.editor,
      recentActivity: appState.recentActivity,
      cameraState: appState.camera,
      selections: appState.selections,
      pricingSettings: appState.pricingSettings,
      quoteSettings: appState.quoteSettings,
      projectPreview: appState.projectPreview,
      editingSessionId: record.editingSessionId,
      bomSnapshot: record.bomSnapshot,
      appVersion: typeof record.appVersion === "string" ? record.appVersion : undefined
    });
    deps.sendJson(res, 200, { ok: true, save });
    return true;
  }

  if (req.method === "GET" && route.action === "load") {
    deps.sendJson(res, 200, { ok: true, save: await service.loadProject(ctx, route.projectId) });
    return true;
  }

  if (req.method === "GET" && route.action === "versions") {
    deps.sendJson(res, 200, { ok: true, versions: await service.listProjectVersions(ctx, route.projectId) });
    return true;
  }

  if (req.method === "GET" && route.action === "loadVersion") {
    deps.sendJson(res, 200, { ok: true, save: await service.loadProjectVersion(ctx, route.projectId, route.versionNumber) });
    return true;
  }

  if (req.method === "POST" && route.action === "restoreVersion") {
    deps.sendJson(res, 200, { ok: true, save: await service.restoreProjectVersion(ctx, route.projectId, route.versionNumber) });
    return true;
  }

  if (req.method === "GET" && route.action === "download") {
    const encrypted = await service.exportEncryptedProjectFile(ctx, route.projectId);
    const project = await service.getProject(ctx, route.projectId);
    res.statusCode = 200;
    res.setHeader("Content-Type", PROJECT_FILE_MIME_TYPE);
    res.setHeader("Content-Disposition", `attachment; filename="${toSafeProjectFileName(project.name)}"`);
    res.setHeader("Cache-Control", "no-store");
    res.end(encrypted);
    return true;
  }

  return false;
}
