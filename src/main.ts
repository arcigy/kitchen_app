import "./styles/base.css";
import "./styles/chatbot.css";
import "./styles/appBoot.css";
import "./styles/authShell.css";
import "./styles/projectManager.css";
import "./styles/auth.css";
import "./style.css";
import { renderKitchenAppShell } from "./ui/kitchenAppShell";
import { createChatbotDock, renderChatbotOnly } from "./ui/chatbot/chatbotShell";
import type { ClientContext } from "./core/client/client-context";
import type { ClientProfile } from "./core/client/client-types";
import type { ProjectMetadata } from "./core/project/project-types";
import type { ProjectSaveFile } from "./core/project-save/project-save-types";

const app = document.getElementById("app");

if (!app) {
  throw new Error("Missing required DOM element (app).");
}

const appRoot = app;
let bootProgress = 0;
let bootTarget = 8;
let bootTimer = 0;

renderBootLoading("Kontrolujem prihlasenie", 8);
void start();

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
  const { createLocalClientRepository } = await import("./core/client/client-repository");
  const { createClientService } = await import("./core/client/client-service");
  const session = await requireClientSession(appRoot);
  const clientContext = createClientContext(session);
  setBootStatus("Prihlasenie potvrdene", 22);

  if (window.location.pathname === "/material-proof") {
    setBootStatus("Spustam material proof", 78);
    const { startMaterialProofMode } = await import("./app/materialProofMode");
    finishBootLoading();
    await startMaterialProofMode(appRoot);
    return;
  }

  if (window.location.pathname === "/pdf-intake") {
    setBootStatus("Spustam PDF intake", 84);
    const { startPdfIntakePage } = await import("./features/pdf-intake/PdfIntakePage");
    finishBootLoading();
    startPdfIntakePage(appRoot);
    return;
  }

  if (window.location.pathname === "/pdf-demo") {
    setBootStatus("Spustam PDF demo", 84);
    const { startPdfKitchenDemo } = await import("./pdfDemo/pdfKitchenDemo");
    finishBootLoading();
    startPdfKitchenDemo(appRoot);
    return;
  }

  const clientProfile = createClientService({
    context: clientContext,
    repository: createLocalClientRepository()
  }).getCurrentClientProfile();

  if (!shouldAutoStartWorkspace()) {
    finishBootLoading();
    const { renderProjectManager } = await import("./ui/project/projectManager");
    renderProjectManager({
      root: appRoot,
      clientName: clientProfile.company.name,
      organizationUsers: clientProfile.organization.users,
      currentUserId: clientContext.userId,
      onSelect: (selection) => {
        void launchWorkspace({
          clientContext,
          clientProfile,
          initialProject: selection.kind === "created" ? selection.project : null,
          initialProjectSave: selection.kind === "loaded" ? selection.save : null
        });
      }
    });
    createChatbotDock({ appRoot });
    return;
  }

  await launchWorkspace({ clientContext, clientProfile, initialProject: null, initialProjectSave: null });
}

async function launchWorkspace(args: {
  clientContext: ClientContext;
  clientProfile: ClientProfile;
  initialProject: ProjectMetadata | null;
  initialProjectSave: ProjectSaveFile | null;
}): Promise<void> {
  setBootStatus("Zobrazujem pracovisko", 88);
  const appDataPromise = import("./app/catalogLoader").then(({ loadClientAppDataForApp }) => loadClientAppDataForApp());
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
  const [{ clientCatalog, modulePackages }, { startApp }, { initDomI18n }, { initializeInstallableApp }] = await Promise.all([
    appDataPromise,
    appModulePromise,
    i18nPromise,
    installPromise
  ]);

  initDomI18n(document.body);
  initializeInstallableApp();
  viewerStartup.remove();

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
}
