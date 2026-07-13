import * as THREE from "three";
import type { ClientContext } from "../core/client/client-context";
import { exportSceneToJson, type ExportSceneArgs } from "../core/exportScene";
import { downloadCanvasPng, saveTextFile, saveTextFileAs, type WritableHandle } from "../core/filePersistence";
import { createClientProjectPhaseScope } from "../core/storage/storage-types";
import {
  exportWebsiteShowcaseSnapshot,
  type WebsiteShowcaseSnapshotStage
} from "../core/websiteShowcaseExport";
import type { KitchenGroup, KitchenWorktopInstance, LayoutInstance } from "../layout/appState";
import type { ModuleParams } from "../model/cabinetTypes";
import { attachFileMenu } from "../ui/createFileMenu";
import type { AppArgs } from "./bootstrap";
import { openBlenderMaterialReview } from "./blenderMaterialReview";

type HdriSettings = {
  id: string | null;
  background: boolean;
};

const DEFAULT_BLENDER_HDRI = "/hdri/OutdoorFieldBaseballDayClear001/HdrOutdoorFieldBaseballDayClear001_HDR_2K.exr";

type ExportAppArgs = Pick<
  Required<AppArgs>,
  "exportOutEl" | "copyBtn" | "copyStatusEl" | "exportBtn" | "exportSceneBtn"
>;

type ExportActionsArgs = {
  appArgs: ExportAppArgs;
  clientContext: ClientContext;
  fileTab: HTMLElement | null;
  projectMenuActions?: {
    newProject: () => void | Promise<void>;
    openProject: () => void | Promise<void>;
    saveProject: () => void | Promise<void>;
    downloadProject: () => void | Promise<void>;
    loadProjectFile: () => void | Promise<void>;
  };
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  getCamera: () => THREE.Camera;
  getCameraTarget: () => THREE.Vector3 | undefined;
  getHdriSettings: () => HdriSettings;
  getWindowOpening: () => NonNullable<ExportSceneArgs["window"]>["opening"];
  getDaylightIntensity: () => number;
  buildLayoutExportPayload: () => unknown;
  getWebsiteShowcaseModules: () => readonly LayoutInstance[];
  getWebsiteShowcaseWorktops: () => readonly KitchenWorktopInstance[];
  getWebsiteShowcaseKitchenGroups: () => readonly KitchenGroup[];
  buildWebsiteShowcaseModule: (params: ModuleParams) => THREE.Group;
  onLanguageChange: () => void;
};

type BlenderExportResponse = {
  ok: boolean;
  error?: string;
  previewUrl?: string;
  previewPath?: string;
  blendPath?: string;
};

type BlenderExportUi = {
  statusEl: HTMLElement | null;
  spinnerEl: HTMLElement | null;
  errorEl: HTMLElement | null;
  previewLinkEl: HTMLAnchorElement | null;
  previewImg: HTMLImageElement | null;
  openBlendBtn: HTMLButtonElement | null;
  openPngBtn: HTMLButtonElement | null;
};

const ensureBlenderExportPanel = (): BlenderExportUi => {
  let panel = document.getElementById("blenderExportPanel");
  if (!panel) {
    panel = document.createElement("div");
    panel.id = "blenderExportPanel";
    panel.className = "blender-export-panel";
    panel.innerHTML = `
      <div class="blender-export-header">Blender material export</div>
      <div id="blenderStatus" class="blender-status">Ready.</div>
      <div id="blenderSpinner" class="spinner" aria-hidden="true"></div>
      <div id="blenderError" class="blender-error"></div>
      <div class="blender-open-actions">
        <button id="blenderOpenBlend" type="button">Open .blend</button>
        <button id="blenderOpenPng" type="button">Open PNG</button>
      </div>
      <a id="blenderPreviewLink" class="blender-preview-link" href="#" target="_blank" rel="noreferrer">Open preview</a>
      <img id="blenderPreview" class="blender-preview-image" alt="Blender preview" />
    `;
    document.body.appendChild(panel);
  }

  return {
    statusEl: document.getElementById("blenderStatus"),
    spinnerEl: document.getElementById("blenderSpinner"),
    errorEl: document.getElementById("blenderError"),
    previewLinkEl: document.getElementById("blenderPreviewLink") as HTMLAnchorElement | null,
    previewImg: document.getElementById("blenderPreview") as HTMLImageElement | null,
    openBlendBtn: document.getElementById("blenderOpenBlend") as HTMLButtonElement | null,
    openPngBtn: document.getElementById("blenderOpenPng") as HTMLButtonElement | null
  };
};

const copyTextToClipboard = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
};

const parseBlenderExportResponse = (text: string): BlenderExportResponse | null => {
  try {
    const value = JSON.parse(text) as unknown;
    if (!value || typeof value !== "object") return null;
    const record = value as Record<string, unknown>;
    return {
      ok: record.ok === true,
      error: typeof record.error === "string" ? record.error : undefined,
      previewUrl: typeof record.previewUrl === "string" ? record.previewUrl : undefined,
      previewPath: typeof record.previewPath === "string" ? record.previewPath : undefined,
      blendPath: typeof record.blendPath === "string" ? record.blendPath : undefined
    };
  } catch {
    return null;
  }
};

const openDesktopFile = async (path: string) => {
  const res = await fetch("/api/blender/open-output", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path })
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Open failed (${res.status})`);
  }
};

export function createExportActions(args: ExportActionsArgs) {
  let layoutSaveHandle: WritableHandle | null = null;
  const storageScope = createClientProjectPhaseScope(args.clientContext);

  const attachStorageScope = (payload: unknown): unknown => {
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
      return { storage: storageScope, data: payload };
    }
    return { ...(payload as Record<string, unknown>), storage: storageScope };
  };

  const buildLayoutExportJson = () => {
    const json = JSON.stringify(attachStorageScope(args.buildLayoutExportPayload()), null, 2);
    args.appArgs.exportOutEl.value = json;
    return json;
  };

  const buildSceneExportPayload = () => {
    const hdri = args.getHdriSettings();
    const opening = args.getWindowOpening();
    const sunDirection = opening ? opening.inwardNormal.clone().normalize() : undefined;
    const daylightIntensity = args.getDaylightIntensity();

    return exportSceneToJson({
      scene: args.scene,
      camera: args.getCamera(),
      cameraTarget: args.getCameraTarget(),
      environment: {
        hdriPath: hdri.id || DEFAULT_BLENDER_HDRI,
        hdriStrength: hdri.id ? 0.08 : 0.055,
        hdriBackground: hdri.id ? hdri.background : true,
        hdriBackgroundStrength: hdri.id ? 0.75 : 0.6,
        hdriRotationDeg: 60
      },
      colorManagement: { viewTransform: "AgX", exposure: 0, look: "Medium High Contrast" },
      renderProfile: {
        preset: "interior_app",
        materialMode: "app",
        previewResolution: [1280, 960],
        finalResolution: [1920, 1440]
      },
      lighting: { sunDirection, sunStrength: 1.8, sunAngle: 4 },
      window: { opening, daylightIntensity },
      includeInvisible: false,
      storageScope
    });
  };

  const buildSceneExportJson = () => {
    const payload = buildSceneExportPayload();
    const json = JSON.stringify(payload, null, 2);
    args.appArgs.exportOutEl.value = json;
    return { payload, json };
  };

  const buildWebsiteShowcaseExportJson = (stage: WebsiteShowcaseSnapshotStage) => {
    const payload = exportWebsiteShowcaseSnapshot({
      stage,
      modules: args.getWebsiteShowcaseModules(),
      worktops: args.getWebsiteShowcaseWorktops(),
      kitchenGroups: args.getWebsiteShowcaseKitchenGroups(),
      buildModule: args.buildWebsiteShowcaseModule
    });
    const json = JSON.stringify(payload, null, 2);
    args.appArgs.exportOutEl.value = json;
    return { payload, json };
  };

  const downloadViewportPng = () => {
    downloadCanvasPng({ canvas: args.renderer.domElement, scope: storageScope, prefix: "kitchen" });
  };

  const saveLayoutFile = async () => {
    layoutSaveHandle = await saveTextFile({
      text: buildLayoutExportJson(),
      scope: storageScope,
      prefix: "kitchen-layout",
      extension: "json",
      handle: layoutSaveHandle
    });
  };

  const saveLayoutFileAs = async () => {
    layoutSaveHandle = await saveTextFileAs({
      text: buildLayoutExportJson(),
      scope: storageScope,
      prefix: "kitchen-layout",
      extension: "json"
    });
  };

  const exportLayoutJsonFile = async () => {
    await saveTextFileAs({ text: buildLayoutExportJson(), scope: storageScope, prefix: "kitchen-export", extension: "json" });
  };

  const exportSceneJsonFile = async () => {
    await saveTextFileAs({ text: buildSceneExportJson().json, scope: storageScope, prefix: "kitchen-scene", extension: "json" });
  };

  const exportWebsiteShowcaseFile = async (stage: WebsiteShowcaseSnapshotStage) => {
    args.appArgs.copyStatusEl.textContent = "Preparing website animation export...";
    try {
      const { json } = buildWebsiteShowcaseExportJson(stage);
      await saveTextFileAs({
        text: json,
        scope: storageScope,
        prefix: `kitchen-website-${stage}`,
        extension: "json"
      });
      args.appArgs.copyStatusEl.textContent = `Website ${stage} snapshot exported.`;
    } catch (error: unknown) {
      args.appArgs.copyStatusEl.textContent = error instanceof Error ? error.message : String(error);
      throw error;
    }
  };

  const copyCurrentExport = async () => {
    args.appArgs.copyStatusEl.textContent = "";
    const text = args.appArgs.exportOutEl.value.trim().length > 0 ? args.appArgs.exportOutEl.value : buildLayoutExportJson();
    args.appArgs.exportOutEl.value = text;
    const copied = await copyTextToClipboard(text);
    args.appArgs.copyStatusEl.textContent = copied ? "Copied." : "Copy failed (browser permission).";
  };

  args.appArgs.exportBtn.addEventListener("click", async () => {
    args.appArgs.copyStatusEl.textContent = "";
    const json = buildLayoutExportJson();
    const copied = await copyTextToClipboard(json);
    args.appArgs.copyStatusEl.textContent = copied ? "Copied." : "Copy failed (browser permission).";
  });

  const exportBlenderPreview = async () => {
    args.appArgs.copyStatusEl.textContent = "";
    const { statusEl, spinnerEl, errorEl, previewLinkEl, previewImg, openBlendBtn, openPngBtn } = ensureBlenderExportPanel();

    const setUi = (state: "idle" | "running" | "done" | "error", msg: string, detail?: string) => {
      if (statusEl) statusEl.textContent = msg;
      if (spinnerEl) spinnerEl.classList.toggle("visible", state === "running");
      if (errorEl) {
        if (state === "error" && detail) {
          errorEl.textContent = detail;
          (errorEl as HTMLElement).style.display = "block";
        } else {
          (errorEl as HTMLElement).style.display = "none";
          errorEl.textContent = "";
        }
      }
      if (previewLinkEl) previewLinkEl.style.display = state === "done" ? "inline" : "none";
      if (previewImg) previewImg.style.display = state === "done" ? "block" : "none";
      if (openBlendBtn) openBlendBtn.style.display = state === "done" ? "inline-block" : "none";
      if (openPngBtn) openPngBtn.style.display = state === "done" ? "inline-block" : "none";
    };

    const { payload } = buildSceneExportJson();
    const reviewedPayload = await openBlenderMaterialReview(payload);
    if (!reviewedPayload) {
      setUi("idle", "Ready.");
      args.appArgs.copyStatusEl.textContent = "";
      return;
    }
    const json = JSON.stringify(reviewedPayload, null, 2);
    args.appArgs.exportOutEl.value = json;

    args.appArgs.exportSceneBtn.disabled = true;
    setUi("running", "Running Blender (up to 60s)...");
    if (previewImg) previewImg.removeAttribute("src");

    try {
      const ctrl = new AbortController();
      const t = window.setTimeout(() => ctrl.abort(), 65_000);
      const res = await fetch("/api/blender/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sceneJson: reviewedPayload, projectId: storageScope.projectId, phaseId: storageScope.phaseId }),
        signal: ctrl.signal
      });
      window.clearTimeout(t);

      const text = await res.text();
      const data = parseBlenderExportResponse(text);

      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || text || `HTTP ${res.status}`);
      }

      const copyOk = await copyTextToClipboard(json);
      const previewUrl = data.previewUrl ?? null;
      if (!previewUrl) throw new Error("Backend did not return previewUrl.");

      if (previewLinkEl) previewLinkEl.href = previewUrl;
      if (previewImg) previewImg.src = previewUrl;
      if (openBlendBtn) {
        openBlendBtn.disabled = !data.blendPath;
        openBlendBtn.onclick = data.blendPath
          ? () => void openDesktopFile(data.blendPath as string).catch((error: unknown) => setUi("error", "Could not open .blend.", error instanceof Error ? error.message : String(error)))
          : null;
      }
      if (openPngBtn) {
        openPngBtn.disabled = !data.previewPath;
        openPngBtn.onclick = data.previewPath
          ? () => void openDesktopFile(data.previewPath as string).catch((error: unknown) => setUi("error", "Could not open PNG.", error instanceof Error ? error.message : String(error)))
          : null;
      }

      setUi("done", copyOk ? "Done. JSON copied." : "Done.");
      args.appArgs.copyStatusEl.textContent = "";
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setUi("error", "Blender export failed.", msg);
      args.appArgs.copyStatusEl.textContent = "";
    } finally {
      args.appArgs.exportSceneBtn.disabled = false;
    }
  };

  args.appArgs.exportSceneBtn.addEventListener("click", () => {
    void exportBlenderPreview();
  });

  args.appArgs.copyBtn.addEventListener("click", async () => {
    await copyCurrentExport();
  });

  if (args.fileTab) {
    attachFileMenu(args.fileTab, {
      ...args.projectMenuActions,
      save: saveLayoutFile,
      saveAs: saveLayoutFileAs,
      exportLayoutJson: exportLayoutJsonFile,
      exportSceneJson: exportSceneJsonFile,
      exportWebsiteInitial: () => exportWebsiteShowcaseFile("initial"),
      exportWebsiteFinal: () => exportWebsiteShowcaseFile("final"),
      exportBlenderPreview,
      exportPng: downloadViewportPng,
      copyJson: copyCurrentExport,
      onLanguageChange: args.onLanguageChange
    });
  }

  return {
    buildLayoutExportJson,
    buildSceneExportJson,
    buildWebsiteShowcaseExportJson,
    copyCurrentExport,
    downloadViewportPng,
    exportLayoutJsonFile,
    exportBlenderPreview,
    exportSceneJsonFile,
    exportWebsiteShowcaseFile,
    saveLayoutFile,
    saveLayoutFileAs
  };
}
