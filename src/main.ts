import "./style.css";

const app = document.getElementById("app");

if (!app) {
  throw new Error("Missing required DOM element (app).");
}

const appRoot = app;

void start().catch((error: unknown) => {
  console.error("Failed to start app", error);
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

async function start(): Promise<void> {
  const { requireClientSession } = await import("./app/authController");
  const { createClientContext } = await import("./core/client/client-context");
  const { createLocalClientRepository } = await import("./core/client/client-repository");
  const { createClientService } = await import("./core/client/client-service");
  const session = await requireClientSession(appRoot);
  const clientContext = createClientContext(session);
  const { loadClientCatalogForApp, loadClientModulePackagesForApp } = await import("./app/catalogLoader");
  const clientCatalog = await loadClientCatalogForApp();
  const modulePackages = await loadClientModulePackagesForApp();
  const clientProfile = createClientService({
    context: clientContext,
    repository: createLocalClientRepository()
  }).getCurrentClientProfile();

  if (window.location.pathname === "/pdf-intake") {
    const { startPdfIntakePage } = await import("./features/pdf-intake/PdfIntakePage");
    startPdfIntakePage(appRoot);
    return;
  }

  if (window.location.pathname === "/pdf-demo") {
    const { startPdfKitchenDemo } = await import("./pdfDemo/pdfKitchenDemo");
    startPdfKitchenDemo(appRoot);
    return;
  }

  const { startApp } = await import("./app");
  const { initDomI18n } = await import("./i18n");
  const { initializeInstallableApp } = await import("./pwa/installController");

  renderKitchenAppShell(appRoot);

  const viewer = document.getElementById("viewer");
  const ribbon = document.getElementById("ribbon");
  const properties = document.getElementById("properties");

  if (!viewer || !ribbon || !properties) {
    throw new Error("Missing required DOM elements (viewer/ribbon/properties).");
  }

  initDomI18n(document.body);
  initializeInstallableApp();

  startApp({
    viewerEl: viewer,
    ribbonEl: ribbon,
    propertiesEl: properties,
    clientContext,
    clientCatalog,
    modulePackages,
    clientProfile
  });
}

function renderKitchenAppShell(root: HTMLElement): void {
  root.className = "";
  root.innerHTML = `
    <header id="ribbon" aria-label="Ribbon toolbar"></header>

    <div id="main">
      <aside id="properties" aria-label="Properties"></aside>
      <div id="viewer" aria-label="3D viewer">
        <button id="resetViewBtn" type="button" title="Reset view">Reset view</button>
      </div>
    </div>
  `;
}
