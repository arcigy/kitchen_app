export type AppArgs = {
  viewerEl: HTMLElement;
  ribbonEl: HTMLElement;
  propertiesEl: HTMLElement;
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

  const syncViewerTabs = (viewMode: "3d" | "2d") => {
    const isFloorplan = viewMode === "2d";
    floorplanTab.classList.toggle("viewer-tab-active", isFloorplan);
    view3dTab.classList.toggle("viewer-tab-active", !isFloorplan);
  };

  return { floorplanTab, view3dTab, syncViewerTabs };
}
