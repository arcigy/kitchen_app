export type ViewerToolMode = "select" | "pan" | "zoom-in" | "zoom-out" | "orbit" | "fit";

type ViewerToolModeControllerArgs = {
  canvasEl: HTMLElement;
  getInsertMode: () => boolean;
  syncNavigationControls: () => void;
};

const makeSvgCursor = (svg: string, hotX: number, hotY: number, fallback: string) =>
  `url("data:image/svg+xml,${encodeURIComponent(svg)}") ${hotX} ${hotY}, ${fallback}`;

const viewerCursors = {
  select: makeSvgCursor(
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><path d="M8.7 5.4 23.9 19.8l-8.4.6-3.8 7.2Z" fill="white" stroke="#111827" stroke-width="2.3" stroke-linejoin="round"/><path d="m17.4 19.7 5.2 7" fill="none" stroke="#111827" stroke-width="2.3" stroke-linecap="round"/></svg>`,
    8,
    5,
    "default"
  ),
  insert: makeSvgCursor(
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><path d="M16 5v22M5 16h22" fill="none" stroke="white" stroke-width="5" stroke-linecap="round"/><path d="M16 5v22M5 16h22" fill="none" stroke="#111827" stroke-width="2.6" stroke-linecap="round"/><circle cx="16" cy="16" r="3.1" fill="#6655ff" stroke="white" stroke-width="1.4"/></svg>`,
    16,
    16,
    "crosshair"
  ),
  pan: makeSvgCursor(
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><path d="M11.2 15.3V8.4a2.1 2.1 0 0 1 4.2 0v5.7M15.4 14.2V6.9a2.1 2.1 0 0 1 4.2 0v7.9M19.6 15V9.1a2.1 2.1 0 0 1 4.1 0v9.8M11.2 15.4 9.3 13.5a2.15 2.15 0 0 0-3.1 3l6.5 7.6a7.1 7.1 0 0 0 5.4 2.5h.9a6.7 6.7 0 0 0 6.7-6.7v-4.2" fill="white" stroke="#111827" stroke-width="2.3" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    13,
    10,
    "grab"
  ),
  panGrab: makeSvgCursor(
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><path d="M10.8 14.7V9.5a2.1 2.1 0 0 1 4.2 0v4.3M15 13.8V8a2.1 2.1 0 0 1 4.2 0v6.1M19.2 14.2v-4a2.1 2.1 0 0 1 4.1 0v8.2M10.9 14.9l-1.7-1.4a2.2 2.2 0 0 0-3.1 3.1l5.9 6.9a7 7 0 0 0 5.4 2.5h.7a6.4 6.4 0 0 0 6.4-6.4v-3.8" fill="white" stroke="#111827" stroke-width="2.45" stroke-linecap="round" stroke-linejoin="round"/><path d="M10.4 18.7h10.8" stroke="#111827" stroke-width="2.1" stroke-linecap="round"/></svg>`,
    13,
    12,
    "grabbing"
  ),
  zoomIn: makeSvgCursor(
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><circle cx="13.7" cy="13.7" r="8.1" fill="white" stroke="#111827" stroke-width="2.4"/><path d="M19.7 19.7 26.6 26.6M9.4 13.7H18M13.7 9.4V18" fill="none" stroke="#111827" stroke-width="2.4" stroke-linecap="round"/></svg>`,
    13,
    13,
    "zoom-in"
  ),
  zoomOut: makeSvgCursor(
    `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32"><circle cx="13.7" cy="13.7" r="8.1" fill="white" stroke="#111827" stroke-width="2.4"/><path d="M19.7 19.7 26.6 26.6M9.4 13.7H18" fill="none" stroke="#111827" stroke-width="2.4" stroke-linecap="round"/></svg>`,
    13,
    13,
    "zoom-out"
  )
};

export function createViewerToolModeController(args: ViewerToolModeControllerArgs) {
  let toolMode: ViewerToolMode = "select";
  let panActive = false;

  const syncButtons = () => {
    document.querySelectorAll<HTMLButtonElement>("[data-viewer-tool]").forEach((button) => {
      button.classList.toggle("active", button.dataset.viewerTool === toolMode);
    });
  };

  const syncCursor = () => {
    let cursor = viewerCursors.select;
    if (panActive) cursor = viewerCursors.panGrab;
    else if (toolMode === "pan" || toolMode === "orbit") cursor = viewerCursors.pan;
    else if (args.getInsertMode()) cursor = viewerCursors.insert;
    else if (toolMode === "zoom-in") cursor = viewerCursors.zoomIn;
    else if (toolMode === "zoom-out") cursor = viewerCursors.zoomOut;
    args.canvasEl.style.cursor = cursor;
  };

  const setToolMode = (next: ViewerToolMode) => {
    panActive = false;
    toolMode = next;
    syncButtons();
    syncCursor();
    args.syncNavigationControls();
  };

  const setPanActive = (active: boolean) => {
    panActive = active;
    syncCursor();
  };

  const cancel = () => {
    if (toolMode === "select" && !panActive) return;
    toolMode = "select";
    panActive = false;
    syncButtons();
    syncCursor();
    args.syncNavigationControls();
  };

  const installButtons = () => {
    document.querySelectorAll<HTMLButtonElement>("[data-viewer-tool]").forEach((button) => {
      button.addEventListener("click", () => {
        const tool = button.dataset.viewerTool as ViewerToolMode | undefined;
        if (!tool) return;
        setToolMode(tool);
      });
    });
    syncButtons();
  };

  return {
    cancel,
    getToolMode: () => toolMode,
    installButtons,
    setPanActive,
    setToolMode,
    syncCursor
  };
}
