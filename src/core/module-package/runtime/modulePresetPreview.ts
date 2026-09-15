import type { ClientCatalog } from "../../catalog/catalog-types";
import type { FurnQuoteModulePackage } from "../module-package-types";
import { applyModuleParameterPreset, buildModulePackageGeometryFromPackage } from "./module-runtime-adapter";
import { createArcigyModulePreviewRenderer } from "../../../modules/runtime/arcigyModulePreviewRenderer";

/** Serialize renders and retain only a small number of finished images. Failed jobs remain retryable. */
export function createModulePreviewCache<T>(render: (value: T) => Promise<string>, limit = 32, schedule: () => Promise<void> = idleTurn) {
  const images = new Map<string, string>();
  const pending = new Map<string, Promise<string>>();
  let tail: Promise<unknown> = Promise.resolve();
  return (key: string, value: T): Promise<string> => {
    const cached = images.get(key);
    if (cached) {
      images.delete(key);
      images.set(key, cached);
      return Promise.resolve(cached);
    }
    const running = pending.get(key);
    if (running) return running;
    const result = tail.then(schedule).then(() => render(value)).then(image => {
      images.set(key, image);
      while (images.size > limit) images.delete(images.keys().next().value!);
      return image;
    }).finally(() => pending.delete(key));
    pending.set(key, result);
    tail = result.catch(() => undefined);
    return result;
  };
}

function idleTurn(): Promise<void> {
  return new Promise(resolve => {
    if (typeof requestIdleCallback === "function") requestIdleCallback(() => resolve(), { timeout: 400 });
    else setTimeout(resolve, 16);
  });
}

type PreviewRequest = { modulePackage: FurnQuoteModulePackage; parameters: Record<string, unknown>; catalog: ClientCatalog };
let renderer: ReturnType<typeof createArcigyModulePreviewRenderer> | null = null;
let disposeTimer: ReturnType<typeof setTimeout> | undefined;

const renderPreview = createModulePreviewCache(async (request: PreviewRequest) => {
  clearTimeout(disposeTimer);
  try {
    renderer ??= createArcigyModulePreviewRenderer();
    const root = buildModulePackageGeometryFromPackage(request);
    const variant = String(request.parameters.variant ?? "");
    const cameraAzimuthDeg = variant.includes("chamfered") ? (variant.includes("open") ? -30 : -45) : undefined;
    return renderer.render(root, { cameraAzimuthDeg }).dataUrl;
  } catch (error) {
    renderer?.dispose();
    renderer = null;
    throw error;
  } finally {
    disposeTimer = setTimeout(() => { renderer?.dispose(); renderer = null; }, 30_000);
  }
});

export function modulePresetPreviewParameters(modulePackage: FurnQuoteModulePackage, parameters: Record<string, unknown>, presetId?: string) {
  return structuredClone(presetId ? applyModuleParameterPreset({ modulePackage, parameters, presetId }) : parameters);
}

export function requestModulePresetPreview(args: PreviewRequest & { presetId?: string }): Promise<string> {
  const parameters = modulePresetPreviewParameters(args.modulePackage, args.parameters, args.presetId);
  const key = JSON.stringify([args.catalog.clientId, args.catalog.meta, args.modulePackage, parameters]);
  return renderPreview(key, { ...args, modulePackage: structuredClone(args.modulePackage), parameters });
}
