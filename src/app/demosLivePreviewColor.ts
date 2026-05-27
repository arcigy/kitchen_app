import * as THREE from "three";

type MaterialRequestRecord = {
  demosReferenceImageUrl?: unknown;
  colorTransform?: unknown;
  baseColor?: unknown;
};

type SampledColor = {
  hex: string;
  samples: string[];
};

type PendingColor = {
  promise: Promise<SampledColor | null>;
};

const STORAGE_KEY = "arcigy.demos.previewColor.v1";
const HEX_RE = /^#[0-9a-fA-F]{6}$/;
const SYNC_INTERVAL_MS = 450;

const samplePoints = [
  [0.5, 0.5],
  [0.25, 0.25],
  [0.75, 0.25],
  [0.25, 0.75],
  [0.75, 0.75]
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function normalizeHex(value: unknown): string | null {
  return typeof value === "string" && HEX_RE.test(value) ? value.toLowerCase() : null;
}

function darken(hex: string, amount = 0.42): string {
  const safe = hex.slice(1);
  const channels = [safe.slice(0, 2), safe.slice(2, 4), safe.slice(4, 6)].map((part) =>
    Math.max(0, Math.round(parseInt(part, 16) * amount))
  );
  return `#${channels.map((part) => part.toString(16).padStart(2, "0")).join("")}`;
}

function proxyImageUrl(url: string): string {
  return `/api/material-proof/reference-image?url=${encodeURIComponent(url)}`;
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map((part) => Math.round(part).toString(16).padStart(2, "0")).join("")}`;
}

function averagePatch(data: Uint8ClampedArray, width: number, height: number, cx: number, cy: number): string {
  const radius = Math.max(3, Math.round(Math.min(width, height) * 0.08));
  const x0 = Math.max(0, Math.round(cx * width) - radius);
  const x1 = Math.min(width - 1, Math.round(cx * width) + radius);
  const y0 = Math.max(0, Math.round(cy * height) - radius);
  const y1 = Math.min(height - 1, Math.round(cy * height) + radius);
  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;

  for (let y = y0; y <= y1; y += 1) {
    for (let x = x0; x <= x1; x += 1) {
      const index = (y * width + x) * 4;
      const alpha = data[index + 3] ?? 255;
      if (alpha < 16) continue;
      r += data[index] ?? 0;
      g += data[index + 1] ?? 0;
      b += data[index + 2] ?? 0;
      count += 1;
    }
  }

  return count > 0 ? rgbToHex(r / count, g / count, b / count) : "#b98a55";
}

function averageHexColors(colors: string[]): string {
  const parsed = colors.map((hex) => hex.slice(1)).filter((value) => value.length === 6);
  if (parsed.length === 0) return "#b98a55";
  const sum = parsed.reduce(
    (acc, value) => {
      acc.r += parseInt(value.slice(0, 2), 16);
      acc.g += parseInt(value.slice(2, 4), 16);
      acc.b += parseInt(value.slice(4, 6), 16);
      return acc;
    },
    { r: 0, g: 0, b: 0 }
  );
  return rgbToHex(sum.r / parsed.length, sum.g / parsed.length, sum.b / parsed.length);
}

function readCache(): Record<string, SampledColor> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter(([, value]) => isRecord(value) && normalizeHex(value.hex))
    ) as Record<string, SampledColor>;
  } catch {
    return {};
  }
}

function writeCache(cache: Record<string, SampledColor>): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // Cache failure should not affect live material color.
  }
}

async function sampleImageColor(url: string): Promise<SampledColor | null> {
  const image = new Image();
  image.decoding = "async";
  image.src = proxyImageUrl(url);

  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = () => reject(new Error("Could not load Demos reference image."));
  });

  const width = 96;
  const height = 96;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(image, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height).data;
  const samples = samplePoints.map(([x, y]) => averagePatch(pixels, width, height, x, y));
  return { hex: averageHexColors(samples), samples };
}

async function readServerCachedColor(url: string): Promise<SampledColor | null> {
  try {
    const response = await fetch(`/api/material-proof/color-cache?url=${encodeURIComponent(url)}`, {
      credentials: "include",
      headers: { Accept: "application/json" }
    });
    if (!response.ok) return null;
    const data = await response.json() as { color?: { hex?: string; samples?: string[] } | null };
    const hex = normalizeHex(data.color?.hex);
    if (!hex) return null;
    const samples = Array.isArray(data.color?.samples)
      ? data.color.samples.filter((value): value is string => !!normalizeHex(value))
      : [];
    return { hex, samples };
  } catch {
    return null;
  }
}

function writeServerCachedColor(url: string, sampled: SampledColor): void {
  void fetch("/api/material-proof/color-cache", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ url, hex: sampled.hex, samples: sampled.samples })
  }).catch(() => undefined);
}

function materialRequest(mesh: THREE.Mesh): MaterialRequestRecord | null {
  const data = mesh.userData as Record<string, unknown>;
  return isRecord(data.materialRequest) ? data.materialRequest as MaterialRequestRecord : null;
}

function isDemosBoardMesh(mesh: THREE.Mesh): boolean {
  const request = materialRequest(mesh);
  if (!request || typeof request.demosReferenceImageUrl !== "string") return false;
  const tags = Array.isArray(mesh.userData.tags) ? mesh.userData.tags.map(String) : [];
  return !tags.some((tag) => /handle|hardware|metal|leg|wall|floor|underlay/i.test(tag));
}

function updateMaterialRequest(mesh: THREE.Mesh, sampled: SampledColor): void {
  const request = materialRequest(mesh);
  if (!request) return;
  request.baseColor = sampled.hex;
  if (!isRecord(request.colorTransform)) request.colorTransform = {};
  const transform = request.colorTransform as Record<string, unknown>;
  transform.baseColorHex = sampled.hex;
  transform.grainColorHex = darken(sampled.hex);
  transform.colorSourceMethod = "demos_image_average";
  transform.sampledColors = sampled.samples;
  mesh.userData.livePreviewColorHex = sampled.hex;
  mesh.userData.livePreviewColorSource = "demos_image_average";
}

function applyColor(mesh: THREE.Mesh, sampled: SampledColor): void {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  for (const material of materials) {
    if (material instanceof THREE.MeshStandardMaterial || material instanceof THREE.MeshPhysicalMaterial) {
      material.color.set(sampled.hex);
      material.needsUpdate = true;
    }
  }
  updateMaterialRequest(mesh, sampled);
}

export function createDemosLivePreviewColorController(root: THREE.Object3D) {
  const cache = readCache();
  const pending = new Map<string, PendingColor>();
  let lastSync = 0;

  function enqueue(url: string): void {
    if (pending.has(url)) return;
    const useDiskCache = window.localStorage.getItem("arcigy.demos.persistPreviewColorToDisk") === "true";
    const promise = (useDiskCache ? readServerCachedColor(url) : Promise.resolve(null))
      .then((cached) => cached ?? sampleImageColor(url))
      .then((sampled) => {
        if (sampled) {
          cache[url] = sampled;
          writeCache(cache);
          if (useDiskCache) writeServerCachedColor(url, sampled);
        }
        pending.delete(url);
        return sampled;
      })
      .catch(() => {
        pending.delete(url);
        return null;
      });
    pending.set(url, { promise });
  }

  function sync(force = false): void {
    const now = performance.now();
    if (!force && now - lastSync < SYNC_INTERVAL_MS) return;
    lastSync = now;

    root.traverse((object) => {
      if (!(object instanceof THREE.Mesh) || !isDemosBoardMesh(object)) return;
      const request = materialRequest(object);
      const url = typeof request?.demosReferenceImageUrl === "string" ? request.demosReferenceImageUrl : "";
      if (!url) return;

      const sampled = cache[url];
      if (sampled) {
        if (object.userData.livePreviewColorHex !== sampled.hex) applyColor(object, sampled);
        return;
      }

      enqueue(url);
    });
  }

  return { sync };
}
