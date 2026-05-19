import { t } from "../i18n";
import type { ClientContext } from "../core/client/client-context";
import type { ClientProfile } from "../core/client/client-types";
import type { ClientCatalog } from "../core/catalog/catalog-types";
import type { FurnQuoteModulePackage } from "../core/module-package/module-package-types";

export type AppArgs = {
  viewerEl: HTMLElement;
  ribbonEl: HTMLElement;
  propertiesEl: HTMLElement;
  clientContext: ClientContext;
  clientCatalog: ClientCatalog;
  modulePackages: FurnQuoteModulePackage[];
  clientProfile?: ClientProfile | undefined;
  formEl?: HTMLElement;
  errorsEl?: HTMLElement;
  partsEl?: HTMLElement;
  exportOutEl?: HTMLTextAreaElement;
  copyBtn?: HTMLButtonElement;
  copyStatusEl?: HTMLElement;
  measureBtn?: HTMLButtonElement;
  clearMeasuresBtn?: HTMLButtonElement;
  axisLockEl?: HTMLInputElement;
  measureReadoutEl?: HTMLElement;
  resetBtn?: HTMLButtonElement;
  exportBtn?: HTMLButtonElement;
  exportSceneBtn?: HTMLButtonElement;
};

export function resolveAppArgs(initialArgs: AppArgs) {
  return {
    formEl: document.createElement("div"),
    errorsEl: document.createElement("div"),
    partsEl: document.createElement("div"),
    exportOutEl: document.createElement("textarea"),
    copyBtn: document.createElement("button"),
    copyStatusEl: document.createElement("div"),
    measureBtn: document.createElement("button"),
    clearMeasuresBtn: document.createElement("button"),
    axisLockEl: Object.assign(document.createElement("input"), { type: "checkbox", checked: true }),
    measureReadoutEl: document.createElement("div"),
    resetBtn: document.createElement("button"),
    exportBtn: document.createElement("button"),
    exportSceneBtn: document.createElement("button"),
    ...initialArgs
  };
}

export function createViewerTabs(viewerEl: HTMLElement) {
  const viewerTabbar = document.createElement("div");
  viewerTabbar.className = "viewer-tabbar";

  const floorplanTab = document.createElement("button");
  floorplanTab.type = "button";
  floorplanTab.className = "viewer-tab";
  floorplanTab.textContent = "Floorplan";

  const view3dTab = document.createElement("button");
  view3dTab.type = "button";
  view3dTab.className = "viewer-tab";
  view3dTab.textContent = "3D";

  viewerTabbar.append(floorplanTab, view3dTab);
  viewerEl.appendChild(viewerTabbar);

  const dynamicTabs = new Map<string, HTMLButtonElement>();

  const setExtraTabs = (tabs: Array<{ key: string; label: string; onClick: () => void }>) => {
    const nextKeys = new Set(tabs.map((tab) => tab.key));
    for (const [key, button] of dynamicTabs) {
      if (nextKeys.has(key)) continue;
      button.remove();
      dynamicTabs.delete(key);
    }

    for (const tab of tabs) {
      let button = dynamicTabs.get(tab.key) ?? null;
      if (!button) {
        button = document.createElement("button");
        button.type = "button";
        button.className = "viewer-tab";
        dynamicTabs.set(tab.key, button);
      }
      button.textContent = tab.label;
      button.onclick = tab.onClick;
      viewerTabbar.appendChild(button);
    }
  };

  const syncViewerTabs = (activeKey: string) => {
    floorplanTab.classList.toggle("viewer-tab-active", activeKey === "floorplan");
    view3dTab.classList.toggle("viewer-tab-active", activeKey === "3d");
    for (const [key, button] of dynamicTabs) {
      button.classList.toggle("viewer-tab-active", activeKey === key);
    }
  };

  return { viewerTabbar, floorplanTab, view3dTab, setExtraTabs, syncViewerTabs };
}

export type ViewerDisplayMode = "solid" | "realistic" | "wireframe";

const viewerDisplayLabels: Record<ViewerDisplayMode, string> = {
  solid: "Solid",
  realistic: "Realistic",
  wireframe: "Wireframe"
};

export function createViewerDownbar(
  viewerEl: HTMLElement,
  args: {
    getMode: () => ViewerDisplayMode;
    setMode: (mode: ViewerDisplayMode) => void;
    hidden?: {
      hasHiddenObjects: () => boolean;
      isShowHidden: () => boolean;
      toggleShowHidden: () => void;
    };
  }
) {
  const downbar = document.createElement("div");
  downbar.className = "viewer-downbar";

  const displayWrap = document.createElement("div");
  displayWrap.className = "viewer-display";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "viewer-display-button";
  button.setAttribute("aria-haspopup", "menu");
  button.setAttribute("aria-expanded", "false");

  const cube = document.createElement("span");
  cube.className = "viewer-display-cube";
  cube.setAttribute("aria-hidden", "true");

  const label = document.createElement("span");
  label.className = "viewer-display-label";

  const caret = document.createElement("span");
  caret.className = "viewer-display-caret";
  caret.textContent = "▾";
  caret.setAttribute("aria-hidden", "true");

  button.append(cube, label, caret);

  const menu = document.createElement("div");
  menu.className = "viewer-display-menu";
  menu.setAttribute("role", "menu");
  menu.hidden = true;

  const sync = () => {
    const mode = args.getMode();
    label.textContent = t(viewerDisplayLabels[mode]);
    button.title = t(`View display: ${viewerDisplayLabels[mode]}`);
    for (const item of Array.from(menu.querySelectorAll<HTMLButtonElement>("button"))) {
      item.classList.toggle("viewer-display-menu-active", item.dataset.mode === mode);
    }
  };

  const closeMenu = () => {
    menu.hidden = true;
    button.setAttribute("aria-expanded", "false");
  };

  const openMenu = () => {
    menu.hidden = false;
    button.setAttribute("aria-expanded", "true");
  };

  for (const mode of ["wireframe", "realistic", "solid"] as ViewerDisplayMode[]) {
    const item = document.createElement("button");
    item.type = "button";
    item.dataset.mode = mode;
    item.setAttribute("role", "menuitem");
    item.textContent = t(viewerDisplayLabels[mode]);
    item.addEventListener("click", () => {
      args.setMode(mode);
      sync();
      closeMenu();
    });
    menu.appendChild(item);
  }

  button.addEventListener("click", (event) => {
    event.stopPropagation();
    if (menu.hidden) openMenu();
    else closeMenu();
  });

  document.addEventListener("click", closeMenu);
  displayWrap.append(button, menu);
  downbar.appendChild(displayWrap);

  let showHiddenBtn: HTMLButtonElement | null = null;
  if (args.hidden) {
    showHiddenBtn = document.createElement("button");
    showHiddenBtn.type = "button";
    showHiddenBtn.className = "viewer-downbar-button";
    showHiddenBtn.textContent = t("Show Hidden");
    showHiddenBtn.title = t("Show Hidden");
    showHiddenBtn.addEventListener("click", () => {
      args.hidden?.toggleShowHidden();
      sync();
    });
    downbar.appendChild(showHiddenBtn);
  }

  const syncHidden = () => {
    if (!showHiddenBtn || !args.hidden) return;
    const active = args.hidden.isShowHidden();
    showHiddenBtn.classList.toggle("active", active);
    showHiddenBtn.disabled = !args.hidden.hasHiddenObjects() && !active;
  };

  viewerEl.appendChild(downbar);
  sync();
  syncHidden();

  return { downbar, sync: () => { sync(); syncHidden(); } };
}
