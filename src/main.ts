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

  if (!shouldAutoStartWorkspace()) {
    finishBootLoading();
    const { renderProjectManager } = await import("./ui/project/projectManager");
    renderProjectManager({
      root: appRoot,
      clientName: clientProfile.company.name,
      organizationUsers: clientProfile.organization.users,
      currentUserId: clientContext.userId,
      currentUserRole: clientContext.role,
      onSelect: async (selection) => {
        await launchWorkspace({
          clientContext,
          clientProfile,
          initialProject: selection.kind === "created" ? selection.project : null,
          initialProjectSave: selection.kind === "loaded" ? selection.save : null
        });
      }
    });
    void import("./app/catalogLoader")
      .then(({ prefetchClientAppDataForApp }) => prefetchClientAppDataForApp(clientContext.clientId))
      .catch(() => {
        // Opening a project retries through the normal workspace error path.
      });
    createChatbotDock({ appRoot });
    return;
  }

  await launchWorkspace({ clientContext, clientProfile, initialProject: null, initialProjectSave: null });
}

type LaunchWorkspaceArgs = {
  clientContext: ClientContext;
  clientProfile: ClientProfile;
  initialProject: ProjectMetadata | null;
  initialProjectSave: ProjectSaveFile | null;
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

async function launchWorkspaceInner(args: LaunchWorkspaceArgs): Promise<"local" | "network" | "persistent_cache" | "session_cache"> {
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
      openProjectManager
    });
    const { getClientAppDataLoadSource } = await import("./app/catalogLoader");
    return getClientAppDataLoadSource(appData) ?? "network";
  } catch (error) {
    finishWorkspaceLoading();
    throw error;
  }
}
