import "./styles/base.css";
import "./styles/appBoot.css";
import "./styles/loadingSkeleton.css";
import "./styles/authShell.css";
import "./styles/projectManager.css";
import "./styles/auth.css";
import "./styles/editorShell.css";
import "./styles/classicEditorChrome.css";
import "./styles/contextMenu.css";
import "./style.css";
import "./styles/chatbot.css";
import { renderKitchenAppShell } from "./ui/kitchenAppShell";
import { createChatbotDock, renderChatbotOnly } from "./ui/chatbot/chatbotShell";
import type { ClientContext } from "./core/client/client-context";
import type { ClientProfile } from "./core/client/client-types";
import type { ProjectMetadata } from "./core/project/project-types";
import type { ProjectSaveFile } from "./core/project-save/project-save-types";
import { browserJourneyNow, reportBrowserJourney, type BrowserJourneyMetric } from "./app/clientJourneyTelemetry";
import { sampleBrowserRuntimeMemory, startBrowserRuntimeTelemetry } from "./app/browserRuntimeTelemetry";
import { installStaleAssetRecovery } from "./app/staleAssetRecovery";
import { installIconTooltips } from "./ui/iconTooltips";
import { mountLoadingSkeleton, type LoadingSkeletonHandle } from "./ui/loadingSkeleton";
import type { ProjectRecoveryEnvelopeV1, ProjectRecoveryScope } from "./app/project/projectRecoveryTypes";
import { clearLastWorkspacePointer } from "./app/project/projectRecoveryStore";

installStaleAssetRecovery();
installIconTooltips();

const app = document.getElementById("app");

if (!app) {
  throw new Error("Missing required DOM element (app).");
}

const appRoot = app;
let bootSkeleton: LoadingSkeletonHandle | null = null;
let workspaceSkeleton: LoadingSkeletonHandle | null = null;

renderBootLoading("Kontrolujem prihlásenie");
void start().catch((error: unknown) => {
  console.error("Failed to start app", error);
  bootSkeleton?.clear();
  workspaceSkeleton?.clear();
  const message = error instanceof Error ? error.message : String(error);
  appRoot.innerHTML = `
    <div style="padding:16px;font-family:sans-serif;color:#111">
      <strong>App start failed</strong>
      <pre style="white-space:pre-wrap">${escapeHtml(message)}</pre>
    </div>
  `;
});

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#39;"
    };
    return entities[char] ?? char;
  });
}

function renderBootLoading(status: string): void {
  bootSkeleton?.clear();
  appRoot.className = "app-boot-shell";
  bootSkeleton = mountLoadingSkeleton(appRoot, { variant: "screen", label: status });
}

function setBootStatus(status: string): void {
  bootSkeleton?.setStatus(status);
}

function finishBootLoading(): void {
  bootSkeleton?.clear();
  bootSkeleton = null;
}

function showWorkspaceLoading(status: string): void {
  workspaceSkeleton?.clear();
  workspaceSkeleton = mountLoadingSkeleton(appRoot, { variant: "workspace", label: status, mode: "overlay" });
}

function finishWorkspaceLoading(): void {
  workspaceSkeleton?.clear();
  workspaceSkeleton = null;
}

function shouldAutoStartWorkspace(): boolean {
  const params = new URLSearchParams(window.location.search);
  return params.get("workspace") === "1" || window.localStorage.getItem("arcigy.kitchen.autostartWorkspace") === "1";
}

function openProjectManager(): void {
  window.localStorage.removeItem("arcigy.kitchen.autostartWorkspace");
  clearLastWorkspacePointer();
  const url = new URL(window.location.href);
  url.searchParams.delete("workspace");
  window.location.href = `${url.pathname}${url.search}${url.hash}`;
}

async function start(): Promise<void> {
  if (new URLSearchParams(window.location.search).get("chatbot") === "1") {
    finishBootLoading();
    renderChatbotOnly(appRoot);
    return;
  }

  const { requireClientSession } = await import("./app/authController");
  const { createClientContext } = await import("./core/client/client-context");
  const { loadCurrentClientProfileForApp } = await import("./app/clientProfileLoader");
  const session = await requireClientSession(appRoot);
  const clientContext = createClientContext(session);
  startBrowserRuntimeTelemetry();
  setBootStatus("Prihlásenie potvrdené");

  if (window.location.pathname === "/material-proof") {
    setBootStatus("Spúšťam material proof");
    const { startMaterialProofMode } = await import("./app/materialProofMode");
    finishBootLoading();
    await startMaterialProofMode(appRoot);
    return;
  }

  const clientProfile = await loadCurrentClientProfileForApp(clientContext.clientId);
  const { initDomI18n, normalizeLanguage, setCurrentLanguage } = await import("./i18n");
  setCurrentLanguage(normalizeLanguage(clientProfile.defaults.language));
  // Project manager and login-adjacent views render before the workspace shell;
  // install the same live DOM translator here so a language switch is immediate
  // on every application surface, not only after workspace launch.
  initDomI18n(document.body);

  const { resolveLastWorkspace, resolveProjectWorkspace } = await import("./app/project/projectRecoveryBootstrap");
  const lastWorkspace = await resolveLastWorkspace(clientContext).catch((error: unknown) => {
    console.warn("Last workspace recovery was skipped.", error);
    return null;
  });
  if (lastWorkspace) {
    await launchWorkspace({
      clientContext,
      clientProfile,
      ...lastWorkspace,
      recoveryNotice: lastWorkspace.notice
    });
    return;
  }

  if (!shouldAutoStartWorkspace()) {
    finishBootLoading();
    const { renderProjectManager } = await import("./ui/project/projectManager");
    renderProjectManager({
      root: appRoot,
      clientId: clientContext.clientId,
      clientName: clientProfile.company.name,
      organizationUsers: clientProfile.organization.users,
      currentUserId: clientContext.userId,
      currentUserRole: clientContext.role,
      onSelect: async (selection) => {
        if (selection.kind === "recovery") {
          const resolution = await resolveProjectWorkspace({
            context: clientContext,
            projectId: selection.projectId,
            workspaceId: selection.workspaceId
          });
          await launchWorkspace({ clientContext, clientProfile, ...resolution, recoveryNotice: resolution.notice });
          return;
        }
        if (selection.kind === "loaded") {
          const resolution = await resolveProjectWorkspace({
            context: clientContext,
            projectId: selection.save.projectId,
            serverSave: selection.save
          });
          await launchWorkspace({ clientContext, clientProfile, ...resolution, recoveryNotice: resolution.notice });
          return;
        }
        const project = selection.kind === "created" ? selection.project : null;
        await launchWorkspace({
          clientContext,
          clientProfile,
          initialProject: project,
          initialProjectSave: null,
          initialRecovery: null,
          recoveryScope: {
            clientId: clientContext.clientId,
            userId: clientContext.userId,
            workspaceId: project ? `project:${project.projectId}` : `blank:${crypto.randomUUID()}`,
            projectId: project?.projectId ?? null
          },
          recoveryNotice: null
        });
      }
    });
    initDomI18n(appRoot);
    void import("./app/catalogLoader")
      .then(({ prefetchClientAppDataForApp }) => prefetchClientAppDataForApp(clientContext.clientId))
      .catch(() => {
        // Opening a project retries through the normal workspace error path.
      });
    createChatbotDock({ appRoot });
    return;
  }

  await launchWorkspace({
    clientContext,
    clientProfile,
    initialProject: null,
    initialProjectSave: null,
    initialRecovery: null,
    recoveryScope: {
      clientId: clientContext.clientId,
      userId: clientContext.userId,
      workspaceId: `blank:${crypto.randomUUID()}`,
      projectId: null
    },
    recoveryNotice: null
  });
}

type LaunchWorkspaceArgs = {
  clientContext: ClientContext;
  clientProfile: ClientProfile;
  initialProject: ProjectMetadata | null;
  initialProjectSave: ProjectSaveFile | null;
  initialRecovery: ProjectRecoveryEnvelopeV1 | null;
  recoveryScope: ProjectRecoveryScope;
  recoveryNotice: string | null;
};

async function launchWorkspace(args: LaunchWorkspaceArgs): Promise<void> {
  const startedAt = browserJourneyNow();
  const openType = args.initialProjectSave ? "loaded" : args.initialProject ? "created" : "blank";
  try {
    const source = await launchWorkspaceInner(args);
    const variant = `${openType}_${source}` as BrowserJourneyMetric["variant"];
    reportBrowserJourney({ journey: "project_open", variant, outcome: "success", durationMs: browserJourneyNow() - startedAt });
    sampleBrowserRuntimeMemory();
  } catch (error) {
    reportBrowserJourney({ journey: "project_open", variant: openType, outcome: "failure", durationMs: browserJourneyNow() - startedAt });
    throw error;
  }
}

async function launchWorkspaceInner(args: LaunchWorkspaceArgs): Promise<
  "local" | "network" | "persistent_cache" | "session_cache" | "unverified_persistent_cache" | "unverified_session_cache"
> {
  setBootStatus("Načítavam pracovisko");
  showWorkspaceLoading("Načítavam projekt");
  const appDataPromise = import("./app/catalogLoader").then(({ loadClientAppDataForApp }) => loadClientAppDataForApp(args.clientContext.clientId));
  const appModulePromise = import("./app");
  const i18nPromise = import("./i18n");
  const installPromise = import("./pwa/installController");

  try {
    const [appData, { startApp }, { initDomI18n }, { initializeInstallableApp }] = await Promise.all([
      appDataPromise,
      appModulePromise,
      i18nPromise,
      installPromise
    ]);

    finishWorkspaceLoading();
    finishBootLoading();
    appRoot.className = "";
    renderKitchenAppShell(appRoot);
    createChatbotDock({ appRoot });

    const viewer = document.getElementById("viewer");
    const ribbon = document.getElementById("ribbon");
    const properties = document.getElementById("properties");

    if (!viewer || !ribbon || !properties) {
      throw new Error("Missing required DOM elements (viewer/ribbon/properties).");
    }

    initDomI18n(document.body);
    initializeInstallableApp();
    const { clientCatalog, modulePackages } = appData;
    startApp({
      viewerEl: viewer,
      ribbonEl: ribbon,
      propertiesEl: properties,
      clientContext: args.clientContext,
      clientCatalog,
      modulePackages,
      clientProfile: args.clientProfile,
      initialProject: args.initialProject,
      initialProjectSave: args.initialProjectSave,
      initialRecovery: args.initialRecovery,
      recoveryScope: args.recoveryScope,
      recoveryNotice: args.recoveryNotice,
      openProjectManager
    });
    const { getClientAppDataLoadSource } = await import("./app/catalogLoader");
    const source = getClientAppDataLoadSource(appData) ?? "network";
    if (source === "unverified_persistent_cache" || source === "unverified_session_cache") {
      const { showToast } = await import("./ui/toast");
      showToast("Katalóg je načítaný z offline cache a jeho revíziu sa nepodarilo overiť. Ceny a materiály skontroluj po obnovení spojenia.", "info");
    }
    return source;
  } catch (error) {
    finishWorkspaceLoading();
    throw error;
  }
}
