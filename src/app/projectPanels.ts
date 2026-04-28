import { mountBomDevPanel } from "../ui/bomDevPanel";
import { mountPricingCatalogPanel } from "../ui/pricingCatalogPanel";

type BomPanelArgs = {
  instances: Parameters<typeof mountBomDevPanel>[1];
  kitchenWorktops: Parameters<typeof mountBomDevPanel>[2];
  kitchenCtx: Parameters<typeof mountBomDevPanel>[3];
};

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
  title.textContent = "BOM";
  title.className = "bom-modal__title";
  header.appendChild(title);

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.textContent = "Zavrieť";
  closeBtn.className = "bom-modal__close";
  header.appendChild(closeBtn);

  const content = document.createElement("div");
  content.className = "bom-modal__content";
  panel.appendChild(content);

  const close = () => overlay.remove();
  closeBtn.addEventListener("click", close);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) close();
  });

  mountBomDevPanel(content, args.instances, args.kitchenWorktops, args.kitchenCtx);
  document.body.appendChild(overlay);
}

export function openPricingCatalog() {
  const overlay = document.createElement("div");
  overlay.style.position = "fixed";
  overlay.style.inset = "0";
  overlay.style.zIndex = "1000";
  overlay.style.background = "rgba(0,0,0,0.72)";
  overlay.style.display = "grid";
  overlay.style.gridTemplateRows = "1fr";
  overlay.style.padding = "20px";

  const panel = document.createElement("div");
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
  title.textContent = "Pricing Catalog";
  title.style.margin = "0";
  title.style.color = "#eef2ff";
  title.style.font = "700 16px system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
  header.appendChild(title);

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.textContent = "Zavrieť";
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

  mountPricingCatalogPanel(content);
  document.body.appendChild(overlay);
}
