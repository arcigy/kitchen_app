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
