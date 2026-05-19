import * as THREE from "three";
import type { ClientContext } from "../core/client/client-context";
import { exportSceneToJson, type ExportSceneArgs } from "../core/exportScene";
import { downloadCanvasPng, saveTextFile, saveTextFileAs, type WritableHandle } from "../core/filePersistence";
import { createClientProjectPhaseScope } from "../core/storage/storage-types";
import { attachFileMenu } from "../ui/createFileMenu";
import type { AppArgs } from "./bootstrap";

type HdriSettings = {
  id: string | null;
  background: boolean;
};

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
  onLanguageChange: () => void;
};

type BlenderExportResponse = {
  ok: boolean;
  error?: string;
  previewUrl?: string;
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
      previewUrl: typeof record.previewUrl === "string" ? record.previewUrl : undefined
    };
  } catch {
    return null;
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
        hdriPath: hdri.id,
        hdriStrength: 5,
        hdriBackground: hdri.background,
        hdriBackgroundStrength: 5,
        hdriRotationDeg: 60
      },
      colorManagement: { viewTransform: "AgX", exposure: 0.5, look: "Medium High Contrast" },
      lighting: { sunDirection, sunStrength: 5, sunAngle: 30 },
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

  args.appArgs.exportSceneBtn.addEventListener("click", async () => {
    args.appArgs.copyStatusEl.textContent = "";
    const statusEl = document.getElementById("blenderStatus");
    const spinnerEl = document.getElementById("blenderSpinner");
    const errorEl = document.getElementById("blenderError");
    const previewLinkEl = document.getElementById("blenderPreviewLink") as HTMLAnchorElement | null;
    const previewImg = document.getElementById("blenderPreview") as HTMLImageElement | null;

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
    };

    const { payload, json } = buildSceneExportJson();

    args.appArgs.exportSceneBtn.disabled = true;
    setUi("running", "Running Blender (up to 60s)...");
    if (previewImg) previewImg.removeAttribute("src");

    try {
      const ctrl = new AbortController();
      const t = window.setTimeout(() => ctrl.abort(), 65_000);
      const res = await fetch("/api/blender/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sceneJson: payload, projectId: storageScope.projectId, phaseId: storageScope.phaseId }),
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

      setUi("done", `Done. ${copyOk ? "Copied JSON." : "Copy failed."}`);
      args.appArgs.copyStatusEl.textContent = "";
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setUi("error", "Blender export failed.", msg);
      args.appArgs.copyStatusEl.textContent = "";
    } finally {
      args.appArgs.exportSceneBtn.disabled = false;
    }
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
      exportPng: downloadViewportPng,
      copyJson: copyCurrentExport,
      onLanguageChange: args.onLanguageChange
    });
  }

  return {
    buildLayoutExportJson,
    buildSceneExportJson,
    copyCurrentExport,
    downloadViewportPng,
    exportLayoutJsonFile,
    exportSceneJsonFile,
    saveLayoutFile,
    saveLayoutFileAs
  };
}
