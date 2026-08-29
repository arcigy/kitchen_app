import * as THREE from "three";

import {
  PBR_TEXTURE_FILES,
  type PbrMaterialId,
  type PbrTextureFile
} from "./pbrMaterialManifest";

export type { PbrMaterialId } from "./pbrMaterialManifest";

export type PbrMaterialRef = {
  id: PbrMaterialId;
  rotationDeg?: 0 | 90 | 180 | 270;
  tintColor?: string; // "#RRGGBB"
  tintStrength?: number; // 0..1
};

export type LoadedSet = {
  baseColor: THREE.Texture;
  normal: THREE.Texture;
  roughness: THREE.Texture;
};

type TextureLoad = (
  url: string,
  onLoad: (texture: THREE.Texture) => void,
  onError: () => void
) => void;

const loader = new THREE.TextureLoader();
const textureCache = new Map<string, Promise<LoadedSet | null>>();
const materialCache = new Map<string, THREE.MeshStandardMaterial>();
export const PBR_TEXTURE_CACHE_LIMIT = 16;
export const PBR_MATERIAL_CACHE_LIMIT = 256;
const cacheMetrics = {
  materialHits: 0,
  materialMisses: 0,
  materialEvictions: 0,
  textureHits: 0,
  textureMisses: 0,
  textureEvictions: 0
};

function touchEntry<K, V>(cache: Map<K, V>, key: K, value: V): void {
  cache.delete(key);
  cache.set(key, value);
}

function trimTextureCache(): void {
  while (textureCache.size > PBR_TEXTURE_CACHE_LIMIT) {
    const oldestKey = textureCache.keys().next().value as string | undefined;
    if (!oldestKey) break;
    const evicted = textureCache.get(oldestKey);
    textureCache.delete(oldestKey);
    cacheMetrics.textureEvictions += 1;
    void evicted?.then((set) => {
      set?.baseColor.dispose();
      set?.normal.dispose();
      set?.roughness.dispose();
    });
  }
}

function trimMaterialCache(): void {
  while (materialCache.size > PBR_MATERIAL_CACHE_LIMIT) {
    const oldestKey = materialCache.keys().next().value as string | undefined;
    if (!oldestKey) break;
    // Do not dispose here: an evicted material may still be assigned to a live
    // mesh. Removing the strong cache reference bounds the cache safely.
    materialCache.delete(oldestKey);
    cacheMetrics.materialEvictions += 1;
  }
}

const MATERIAL_META: Record<PbrMaterialId, { worldSizeM: number }> = {
  // Source: Poliigon "Wood Veneer Oak 7760" (user-provided): 2.5m x 2.5m
  wood_veneer_oak_7760_1k: { worldSizeM: 2.5 },
  // Source: Poliigon "Plaster Painted 7664" (user-provided). Tile size set to 30cm x 30cm.
  plaster_painted_7664_1k: { worldSizeM: 0.3 },
  // Source: Poliigon "Wood Floor Ash 4186" (user-provided): 2.5m x 2.5m
  wood_floor_ash_4186_1k: { worldSizeM: 2.5 }
};

export function getPbrMaterialWorldSizeM(id: PbrMaterialId) {
  return MATERIAL_META[id].worldSizeM;
}

function keyOf(ref: PbrMaterialRef) {
  const tint = (ref.tintColor ?? "").toLowerCase();
  const strength = Math.round(((ref.tintStrength ?? 0) * 1000)) / 1000;
  return `${ref.id}:${ref.rotationDeg ?? 0}:${tint}:${strength}`;
}

function applyTransform(tex: THREE.Texture, rotationDeg: number, repeat?: { x: number; y: number }) {
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  if (repeat) tex.repeat.set(Math.max(0.0001, repeat.x), Math.max(0.0001, repeat.y));
  tex.center.set(0.5, 0.5);
  tex.rotation = (rotationDeg * Math.PI) / 180;
  tex.needsUpdate = true;
}

function cloneForUse(tex: THREE.Texture) {
  const c = tex.clone();
  c.image = tex.image;
  c.needsUpdate = true;
  return c;
}

function clamp01(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

function computeTintColor(fallbackColor: string, ref: PbrMaterialRef) {
  const strength = clamp01(ref.tintStrength ?? 0);
  if (strength <= 0) return new THREE.Color(1, 1, 1);

  const tint = new THREE.Color(ref.tintColor ?? fallbackColor);
  return new THREE.Color(1, 1, 1).lerp(tint, strength);
}

function urlFor(id: PbrMaterialId, file: PbrTextureFile) {
  return `/materials/${id}/${file}`;
}

export function loadPbrTextureSet(
  id: PbrMaterialId,
  loadTexture: TextureLoad = (url, onLoad, onError) => {
    loader.load(url, onLoad, undefined, onError);
  }
): Promise<LoadedSet | null> {
  const load = (url: string) =>
    new Promise<THREE.Texture | null>((resolve) => {
      loadTexture(url, resolve, () => resolve(null));
    });

  return Promise.all(PBR_TEXTURE_FILES.map((file) => load(urlFor(id, file)))).then(([baseColor, normal, roughness]) => {
    if (baseColor && normal && roughness) return { baseColor, normal, roughness };
    baseColor?.dispose();
    normal?.dispose();
    roughness?.dispose();
    return null;
  });
}

export async function recoverPbrTextureSet(load: () => Promise<LoadedSet | null>): Promise<LoadedSet | null> {
  try {
    return await load();
  } catch {
    return null;
  }
}

export function getCachedPbrTextureSet(
  id: PbrMaterialId,
  load: () => Promise<LoadedSet | null> = () => loadPbrTextureSet(id)
): Promise<LoadedSet | null> {
  const existing = textureCache.get(id);
  if (existing) {
    cacheMetrics.textureHits += 1;
    touchEntry(textureCache, id, existing);
    return existing;
  }
  cacheMetrics.textureMisses += 1;
  const pending = recoverPbrTextureSet(load);
  textureCache.set(id, pending);
  trimTextureCache();
  void pending.then((set) => {
    if (!set && textureCache.get(id) === pending) textureCache.delete(id);
  });
  return pending;
}

export function getPbrCacheStats() {
  return { materials: materialCache.size, textures: textureCache.size, ...cacheMetrics };
}

export function clearPbrCachesForTests(): void {
  textureCache.clear();
  materialCache.clear();
  Object.keys(cacheMetrics).forEach((key) => {
    cacheMetrics[key as keyof typeof cacheMetrics] = 0;
  });
}

export function getPbrWoodMaterial(params: { fallbackColor: string; ref: PbrMaterialRef }): THREE.MeshStandardMaterial {
  return getPbrMaterial(params);
}

export function getPbrMaterial(params: {
  fallbackColor: string;
  ref: PbrMaterialRef;
  uvRepeat?: { x: number; y: number };
  normalScale?: number;
  envMapIntensity?: number;
}): THREE.MeshStandardMaterial {
  const repeat = params.uvRepeat ? { x: params.uvRepeat.x, y: params.uvRepeat.y } : null;
  const ns = typeof params.normalScale === "number" ? Math.round(params.normalScale * 1000) / 1000 : 1;
  const ei = typeof params.envMapIntensity === "number" ? Math.round(params.envMapIntensity * 1000) / 1000 : 1;
  const k = `${keyOf(params.ref)}:${repeat ? `${Math.round(repeat.x * 1000) / 1000},${Math.round(repeat.y * 1000) / 1000}` : "1,1"}:${ns}:${ei}`;
  const existing = materialCache.get(k);
  if (existing) {
    cacheMetrics.materialHits += 1;
    touchEntry(materialCache, k, existing);
    return existing;
  }
  cacheMetrics.materialMisses += 1;

  const mat = new THREE.MeshStandardMaterial({
    color: computeTintColor(params.fallbackColor, params.ref),
    metalness: 0,
    roughness: 1
  });

  if (Number.isFinite(ns)) mat.normalScale.setScalar(Math.max(0, ns));
  if (Number.isFinite(ei)) mat.envMapIntensity = Math.max(0, ei);

  materialCache.set(k, mat);
  trimMaterialCache();

  const setPromise = getCachedPbrTextureSet(params.ref.id);

  void setPromise.then((set) => {
    if (!set) {
      if (materialCache.get(k) === mat) materialCache.delete(k);
      return;
    }
    const rot = params.ref.rotationDeg ?? 0;

    const baseColor = cloneForUse(set.baseColor);
    const normal = cloneForUse(set.normal);
    const roughness = cloneForUse(set.roughness);

    baseColor.colorSpace = THREE.SRGBColorSpace;
    applyTransform(baseColor, rot, repeat ?? undefined);
    applyTransform(normal, rot, repeat ?? undefined);
    applyTransform(roughness, rot, repeat ?? undefined);

    mat.map = baseColor;
    mat.normalMap = normal;
    mat.roughnessMap = roughness;
    mat.metalness = 0;
    mat.needsUpdate = true;
  });

  return mat;
}
