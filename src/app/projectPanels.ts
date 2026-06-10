import type { ClientCatalog } from "../core/catalog/catalog-types";
import type { KitchenContext } from "../layout/kitchenContext";
import type { KitchenWorktopInstance, LayoutInstance } from "../layout/appState";
import type { CustomFurnitureInstance } from "../layout/customFurnitureTypes";
import { mountPricingCatalogPanel } from "../ui/pricingCatalogPanel";

type BomPanelArgs = {
  instances: LayoutInstance[];
  kitchenWorktops: KitchenWorktopInstance[];
  customFurniture: CustomFurnitureInstance[];
  kitchenCtx: KitchenContext;
  catalog: ClientCatalog;
};

function mountPanelError(container: HTMLElement, message: string) {
  container.innerHTML = "";
  const error = document.createElement("p");
  error.textContent = message;
  error.style.margin = "0";
  error.style.color = "#ef4444";
  container.appendChild(error);
}

export function openBomPanel(args: BomPanelArgs) {
  const overlay = document.createElement("div");
  overlay.className = "bom-modal";

  const panel = document.createElement("div");
  panel.className = "bom-modal__panel";
  overlay.appendChild(panel);

  const header = document.createElement("div");
  header.className = "bom-modal__header";
  panel.appendChild(header);

  const title = document.createElement("h2");
  title.textContent = "Načítavam kusovník";
  title.className = "bom-modal__title";
  header.appendChild(title);

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.textContent = "Zavrieť";
  closeBtn.className = "bom-modal__close";
  header.appendChild(closeBtn);

  const content = document.createElement("div");
  content.className = "bom-modal__content";
  content.textContent =
    args.instances.length + args.kitchenWorktops.length + args.customFurniture.length > 0
      ? "Loading BOM..."
      : "Nie sú umiestnené žiadne moduly.";
  panel.appendChild(content);

  const close = () => overlay.remove();
  closeBtn.addEventListener("click", close);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) close();
  });

  document.body.appendChild(overlay);
  void import("../ui/bomDevPanel")
    .then(({ mountBomDevPanel }) => {
      if (!overlay.isConnected) return;
      title.textContent = "Kusovník";
      content.innerHTML = "";
      mountBomDevPanel(content, args.instances, args.kitchenWorktops, args.customFurniture, args.kitchenCtx, args.catalog);
    })
    .catch(() => mountPanelError(content, "BOM could not be loaded."));
}

export function openPricingCatalog(catalog: ClientCatalog) {
  const overlay = document.createElement("div");
  overlay.className = "pricing-catalog-modal";
  overlay.style.position = "fixed";
  overlay.style.inset = "0";
  overlay.style.zIndex = "1000";
  overlay.style.background = "rgba(0,0,0,0.72)";
  overlay.style.display = "grid";
  overlay.style.gridTemplateRows = "1fr";
  overlay.style.padding = "20px";

  const panel = document.createElement("div");
  panel.className = "pricing-catalog-modal__panel";
  panel.style.width = "calc(100vw - 40px)";
  panel.style.height = "calc(100vh - 40px)";
  panel.style.overflow = "auto";
  panel.style.background = "#0b0f14";
  panel.style.border = "1px solid #303746";
  panel.style.borderRadius = "14px";
  panel.style.boxShadow = "0 24px 80px rgba(0,0,0,0.45)";
  panel.style.padding = "20px";
  overlay.appendChild(panel);

  const header = document.createElement("div");
  header.style.display = "flex";
  header.style.alignItems = "center";
  header.style.justifyContent = "space-between";
  header.style.gap = "12px";
  header.style.marginBottom = "14px";
  panel.appendChild(header);

  const title = document.createElement("h2");
  title.textContent = "Cenový katalóg";
  title.style.margin = "0";
  title.style.color = "#eef2ff";
  title.style.font = "700 16px system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
  header.appendChild(title);

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.textContent = "Zavrieť";
  closeBtn.className = "pricing-catalog-modal__close";
  closeBtn.style.background = "#0e1118";
  closeBtn.style.color = "#eef2ff";
  closeBtn.style.border = "1px solid #303746";
  closeBtn.style.borderRadius = "6px";
  closeBtn.style.padding = "7px 10px";
  header.appendChild(closeBtn);

  const content = document.createElement("div");
  panel.appendChild(content);

  const close = () => overlay.remove();
  closeBtn.addEventListener("click", close);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) close();
  });

  mountPricingCatalogPanel(content, catalog);
  document.body.appendChild(overlay);
}
