import { t } from "../i18n";
import type { ClientContext } from "../core/client/client-context";
import type { ClientProfile } from "../core/client/client-types";
import type { ClientCatalog } from "../core/catalog/catalog-types";
import type { FurnQuoteModulePackage } from "../core/module-package/module-package-types";
import type { ProjectMetadata } from "../core/project/project-types";
import type { ProjectSaveFile } from "../core/project-save/project-save-types";
import type { ProjectRecoveryEnvelopeV1, ProjectRecoveryScope } from "./project/projectRecoveryTypes";
import { createButtonElement, createCheckboxElement, createHtmlButtonElement } from "./propsPanelElements";

export type AppArgs = {
  viewerEl: HTMLElement;
  ribbonEl: HTMLElement;
  propertiesEl: HTMLElement;
  clientContext: ClientContext;
  clientCatalog: ClientCatalog;
  modulePackages: FurnQuoteModulePackage[];
  clientProfile?: ClientProfile | undefined;
  initialProject?: ProjectMetadata | null;
  initialProjectSave?: ProjectSaveFile | null;
  initialRecovery?: ProjectRecoveryEnvelopeV1 | null;
  recoveryScope?: ProjectRecoveryScope;
  recoveryNotice?: string | null;
  openProjectManager?: () => void;
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
    copyBtn: createButtonElement(""),
    copyStatusEl: document.createElement("div"),
    measureBtn: createButtonElement(""),
    clearMeasuresBtn: createButtonElement(""),
    axisLockEl: createCheckboxElement(true),
    measureReadoutEl: document.createElement("div"),
    resetBtn: createButtonElement(""),
    exportBtn: createButtonElement(""),
    exportSceneBtn: createButtonElement(""),
    ...initialArgs
  };
}

export function createViewerTabs(viewerEl: HTMLElement) {
  const viewerTabbar = document.createElement("div");
  viewerTabbar.className = "viewer-tabbar";

  const floorplanTab = createButtonElement("Floorplan");
  floorplanTab.className = "viewer-tab";

  const view3dTab = createButtonElement("3D");
  view3dTab.className = "viewer-tab";

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
        button = createButtonElement("");
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
export type ViewerProjectionMode = "perspective" | "axonometric";

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
    getProjection?: () => ViewerProjectionMode;
    setProjection?: (mode: ViewerProjectionMode) => void;
    getIs3dView?: () => boolean;
    hidden?: {
      hasHiddenObjects: () => boolean;
      isShowHidden: () => boolean;
      toggleShowHidden: () => void;
    };
  }
) {
  const viewerControlIcon = (title: string, svg: string, extraClass = "") => {
    return createHtmlButtonElement(svg, {
      ariaLabel: title,
      className: ["viewer-toolbar-button", extraClass].filter(Boolean).join(" "),
      title
    });
  };

  const downbar = document.createElement("div");
  downbar.className = "viewer-downbar";

  const displayWrap = document.createElement("div");
  displayWrap.className = "viewer-display";

  const button = createButtonElement("");
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
    label.textContent = "3D View 1";
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
    const item = createButtonElement(t(viewerDisplayLabels[mode]));
    item.dataset.mode = mode;
    item.setAttribute("role", "menuitem");
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

  const toolbarControls = document.createElement("div");
  toolbarControls.className = "viewer-toolbar-controls";
  let projectionBtn: HTMLButtonElement | null = null;
  let fullscreenBtn: HTMLButtonElement | null = null;
  toolbarControls.append(
    viewerControlIcon(
      "Orbit",
      `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.2 8.3a7.1 7.1 0 0 1 9.9-.4" /><path d="m15.9 4.9 2.1 3.3-3.8.6" /><path d="M16.8 15.7a7.1 7.1 0 0 1-9.9.4" /><path d="m8.1 19.1-2.1-3.3 3.8-.6" /><path d="M12 6.5v3.1M12 14.4v3.1M6.5 12h3.1M14.4 12h3.1" /></svg>`
    ),
    viewerControlIcon(
      "Display",
      `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.8 12s3.2-5 8.2-5 8.2 5 8.2 5-3.2 5-8.2 5-8.2-5-8.2-5Z" /><circle cx="12" cy="12" r="2.4" /></svg><span class="viewer-toolbar-caret">⌄</span>`
    ),
    viewerControlIcon(
      "Grid",
      `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4.5v15M10 4.5v15M14 4.5v15M18 4.5v15" /><path d="M4.5 6h15M4.5 10h15M4.5 14h15M4.5 18h15" /></svg>`
    ),
    viewerControlIcon(
      "Select Box",
      `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 6h10v10H7z" /><path d="M9 18h8V8" /><path d="m8.2 8.2 7.6 7.6" /></svg>`
    ),
    viewerControlIcon(
      "Snap",
      `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v16" /><path d="M4 12h16" /><path d="m8.2 8.2 3.8 3.8 3.8-3.8" /><path d="m8.2 15.8 3.8-3.8 3.8 3.8" /></svg>`,
      "accent"
    ),
    viewerControlIcon(
      "Target",
      `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="5.2" /><path d="M12 3.8v3M12 17.2v3M3.8 12h3M17.2 12h3" /></svg>`
    )
  );
  if (args.getProjection && args.setProjection) {
    projectionBtn = viewerControlIcon(
      "Projection",
      `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8.4 12 4l7 4.4v7.2L12 20l-7-4.4Z" /><path d="M12 12.4V20" /><path d="m5 8.4 7 4 7-4" /><path d="M8.2 6.4 15.8 11" /></svg>`
    );
    projectionBtn.addEventListener("click", () => {
      if (projectionBtn?.disabled) return;
      const next = args.getProjection?.() === "axonometric" ? "perspective" : "axonometric";
      args.setProjection?.(next);
      syncProjection();
    });
    toolbarControls.appendChild(projectionBtn);
  }
  downbar.appendChild(toolbarControls);

  const scale = createButtonElement("1:100");
  scale.className = "viewer-scale-button";
  scale.title = "Scale";
  scale.setAttribute("aria-label", "Scale 1:100");
  const scaleCaret = document.createElement("span");
  scaleCaret.textContent = "⌄";
  scaleCaret.setAttribute("aria-hidden", "true");
  scale.appendChild(scaleCaret);
  downbar.appendChild(scale);

  fullscreenBtn = viewerControlIcon(
    "Fullscreen",
    `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 4.5h-4v4" /><path d="M4.5 4.5 9 9" /><path d="M15.5 4.5h4v4" /><path d="M19.5 4.5 15 9" /><path d="M8.5 19.5h-4v-4" /><path d="M4.5 19.5 9 15" /><path d="M15.5 19.5h4v-4" /><path d="M19.5 19.5 15 15" /></svg>`,
    "fullscreen"
  );
  downbar.appendChild(fullscreenBtn);

  let showHiddenBtn: HTMLButtonElement | null = null;
  if (args.hidden) {
    showHiddenBtn = createButtonElement(t("Show Hidden"));
    showHiddenBtn.className = "viewer-downbar-button";
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

  const syncProjection = () => {
    if (!projectionBtn || !args.getProjection) return;
    const projection = args.getProjection();
    const is3dView = args.getIs3dView?.() ?? true;
    projectionBtn.classList.toggle("active", projection === "axonometric");
    projectionBtn.disabled = !is3dView;
    projectionBtn.title = projection === "axonometric" ? "Axonometric projection" : "Perspective projection";
    projectionBtn.setAttribute("aria-label", projectionBtn.title);
  };

  const localFullscreenClass = "viewer-local-fullscreen";
  const isViewerFullscreen = () => viewerEl.classList.contains(localFullscreenClass);
  const syncFullscreen = () => {
    if (!fullscreenBtn) return;
    const active = isViewerFullscreen();
    fullscreenBtn.classList.toggle("active", active);
    fullscreenBtn.title = active ? "Exit fullscreen" : "Fullscreen";
    fullscreenBtn.setAttribute("aria-label", fullscreenBtn.title);
  };
  const toggleFullscreen = async () => {
    if (!fullscreenBtn) return;
    fullscreenBtn.disabled = true;
    try {
      viewerEl.classList.toggle(localFullscreenClass, !isViewerFullscreen());
    } finally {
      fullscreenBtn.disabled = false;
      syncFullscreen();
    }
  };
  fullscreenBtn.addEventListener("click", () => {
    void toggleFullscreen();
  });

  viewerEl.appendChild(downbar);
  sync();
  syncHidden();
  syncProjection();
  syncFullscreen();

  return { downbar, sync: () => { sync(); syncHidden(); syncProjection(); syncFullscreen(); } };
}
