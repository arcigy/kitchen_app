import "./styles/base.css";
import "./styles/chatbot.css";
import "./styles/appBoot.css";
import "./styles/authShell.css";
import "./styles/projectManager.css";
import "./styles/auth.css";
import "./styles/editorShell.css";
import "./styles/classicEditorChrome.css";
import "./style.css";
import { renderKitchenAppShell } from "./ui/kitchenAppShell";
import { createChatbotDock, renderChatbotOnly } from "./ui/chatbot/chatbotShell";
import type { ClientContext } from "./core/client/client-context";
import type { ClientProfile } from "./core/client/client-types";
import type { ProjectMetadata } from "./core/project/project-types";
import type { ProjectSaveFile } from "./core/project-save/project-save-types";
import { browserJourneyNow, reportBrowserJourney, type BrowserJourneyMetric } from "./app/clientJourneyTelemetry";
import { sampleBrowserRuntimeMemory, startBrowserRuntimeTelemetry } from "./app/browserRuntimeTelemetry";

const app = document.getElementById("app");

if (!app) {
  throw new Error("Missing required DOM element (app).");
}

const appRoot = app;
let bootProgress = 0;
let bootTarget = 8;
let bootTimer = 0;

renderBootLoading("Kontrolujem prihlasenie", 8);
void start().catch((error: unknown) => {
  console.error("Failed to start app", error);
  window.clearInterval(bootTimer);
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

function renderBootLoading(status: string, target: number): void {
  bootTarget = target;
  appRoot.className = "app-boot-shell";
  appRoot.innerHTML = `
    <main class="app-boot" aria-live="polite" aria-busy="true">
      <div class="app-boot-visual" aria-hidden="true">
        <div class="app-boot-grid"></div>
        <div class="app-boot-orbit">
          <span></span>
          <span></span>
          <span></span>
          <div class="app-boot-mark">A</div>
        </div>
        <div class="app-boot-scan"></div>
      </div>
      <div class="app-boot-copy">
        <span class="app-boot-kicker">Pripravujem pracovisko</span>
        <strong>Arcigy Kitchen</strong>
        <span data-boot-status>${status}</span>
      </div>
      <div class="app-boot-progress">
        <div class="app-boot-progress-head">
          <span>Nacitavam</span>
          <div class="app-boot-percent" data-boot-percent>0%</div>
        </div>
        <div class="app-boot-bar"><i data-boot-bar style="width: 0%"></i></div>
      </div>
      <div class="app-boot-steps">
        <span data-boot-step="8"><b></b>Auth</span>
        <span data-boot-step="38"><b></b>Catalog</span>
        <span data-boot-step="58"><b></b>Modules</span>
        <span data-boot-step="82"><b></b>3D</span>
      </div>
    </main>
  `;
  syncBootProgress();
  startBootProgress();
}

function syncBootProgress(): void {
  const percent = Math.max(0, Math.min(100, Math.round(bootProgress)));
  const percentEl = appRoot.querySelector<HTMLElement>("[data-boot-percent]");
  const barEl = appRoot.querySelector<HTMLElement>("[data-boot-bar]");
  if (percentEl) percentEl.textContent = `${percent}%`;
  if (barEl) barEl.style.width = `${percent}%`;
  appRoot.querySelectorAll<HTMLElement>("[data-boot-step]").forEach((step) => {
    const threshold = Number(step.dataset.bootStep ?? 0);
    step.classList.toggle("active", percent >= Math.max(0, threshold - 8));
    step.classList.toggle("done", percent >= threshold);
  });
}

function startBootProgress(): void {
  window.clearInterval(bootTimer);
  bootTimer = window.setInterval(() => {
    if (bootProgress >= bootTarget) return;
    bootProgress = Math.min(bootTarget, bootProgress + Math.max(0.35, (bootTarget - bootProgress) * 0.08));
    syncBootProgress();
  }, 70);
}

function setBootStatus(status: string, target = bootTarget): void {
  const statusEl = appRoot.querySelector<HTMLElement>("[data-boot-status]");
  if (statusEl) statusEl.textContent = status;
  bootTarget = Math.max(bootTarget, Math.min(96, target));
  if (bootProgress < bootTarget - 16) {
    bootProgress = Math.max(bootProgress, bootTarget - 16);
  }
  syncBootProgress();
}

function finishBootLoading(): void {
  bootTarget = 100;
  bootProgress = 100;
  syncBootProgress();
  window.clearInterval(bootTimer);
  bootTimer = 0;
}

function mountViewerStartupState(viewer: HTMLElement): HTMLElement {
  const status = document.createElement("div");
  status.className = "viewer-startup";
  status.innerHTML = `
    <div class="viewer-startup-mark" aria-hidden="true">
      <span></span>
      <span></span>
    </div>
    <div>
      <strong>Pripravujem 3D</strong>
      <p>Nacitavam modelovanie a nastroje</p>
    </div>
  `;
  viewer.appendChild(status);
  return status;
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
    window.clearInterval(bootTimer);
    renderChatbotOnly(appRoot);
    return;
  }

  const { requireClientSession } = await import("./app/authController");
  const { createClientContext } = await import("./core/client/client-context");
  const { loadCurrentClientProfileForApp } = await import("./app/clientProfileLoader");
  const session = await requireClientSession(appRoot);
  const clientContext = createClientContext(session);
  startBrowserRuntimeTelemetry();
  setBootStatus("Prihlasenie potvrdene", 22);

  if (window.location.pathname === "/material-proof") {
    setBootStatus("Spustam material proof", 78);
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
      onSelect: (selection) => {
        void launchWorkspace({
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
  setBootStatus("Zobrazujem pracovisko", 88);
  const appDataPromise = import("./app/catalogLoader").then(({ loadClientAppDataForApp }) => loadClientAppDataForApp(args.clientContext.clientId));
  const appModulePromise = import("./app");
  const i18nPromise = import("./i18n");
  const installPromise = import("./pwa/installController");

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

  const viewerStartup = mountViewerStartupState(viewer);
  const [appData, { startApp }, { initDomI18n }, { initializeInstallableApp }] = await Promise.all([
    appDataPromise,
    appModulePromise,
    i18nPromise,
    installPromise
  ]);

  initDomI18n(document.body);
  initializeInstallableApp();
  viewerStartup.remove();

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
}
