import * as THREE from "three";
import type { KitchenGroup, KitchenWorktopInstance, LayoutInstance } from "../layout/appState";
import type { ModuleParams } from "../model/cabinetTypes";
import { disposeObject3D } from "./dispose";

export type WebsiteShowcaseSnapshotStage = "initial" | "final";

export type WebsiteShowcaseJsonValue =
  | string
  | number
  | boolean
  | null
  | WebsiteShowcaseJsonValue[]
  | { [key: string]: WebsiteShowcaseJsonValue };

type Vec2 = [number, number];
type Vec3 = [number, number, number];
type Vec4 = [number, number, number, number];
type Mat4 = [number, number, number, number, number, number, number, number, number, number, number, number, number, number, number, number];

export type WebsiteShowcaseGeometryV1 = {
  kind: "bufferGeometry";
  positions: number[];
  indices: number[];
  normals?: number[];
  uvs?: number[];
  groups?: Array<{ start: number; count: number; materialIndex: number }>;
  topologyKey: string;
};

export type WebsiteShowcaseTransformV1 = {
  matrix: Mat4;
  position: Vec3;
  quaternion: Vec4;
  scale: Vec3;
};

export type WebsiteShowcaseBoundsV1 = {
  min: Vec3;
  max: Vec3;
  center: Vec3;
  size: Vec3;
};

export type WebsiteShowcaseMaterialV1 = {
  name: string;
  type: string;
  color?: string;
  emissive?: string;
  emissiveIntensity?: number;
  roughness?: number;
  metalness?: number;
  transmission?: number;
  ior?: number;
  opacity: number;
  transparent: boolean;
  side: number;
  maps?: Record<string, WebsiteShowcaseTextureV1>;
  metadata: Record<string, WebsiteShowcaseJsonValue>;
};

export type WebsiteShowcaseTextureV1 = {
  uri?: string;
  colorSpace?: string;
  repeat: Vec2;
  offset: Vec2;
  rotation: number;
  wrapS: number;
  wrapT: number;
};

export type WebsiteShowcasePartStateV1 = {
  transform: WebsiteShowcaseTransformV1;
  bounds: WebsiteShowcaseBoundsV1;
  geometry?: WebsiteShowcaseGeometryV1;
};

export type WebsiteShowcasePartV1 = {
  id: string;
  name: string;
  semanticName: string;
  path: string;
  classification: string;
  geometry: WebsiteShowcaseGeometryV1;
  materials: WebsiteShowcaseMaterialV1[];
  metadata: Record<string, WebsiteShowcaseJsonValue>;
  states: {
    closed?: WebsiteShowcasePartStateV1;
    opened?: WebsiteShowcasePartStateV1;
  };
  exploded: {
    offsetM: Vec3;
    order: number;
    assemblyGroupId: string;
  };
};

export type WebsiteShowcaseExportV1 = {
  format: "arcigy-website-showcase";
  version: 1;
  meta: {
    stage: WebsiteShowcaseSnapshotStage;
    exportedAt: string;
    unit: "meters";
    coordinateSystem: "three_y_up_right_handed";
    stableIdVersion: 1;
    scenarioKey: string;
    warnings: string[];
  };
  workflow: {
    sequence: Array<{
      id: "worktop" | "coarse-blocks" | "detailed-modules" | "parameter-transition" | "opened-modules" | "materials" | "ai-render";
      source: string;
      external?: boolean;
    }>;
    pairing: {
      moduleKey: "modules[].id";
      partKey: "modules[].parts[].id";
      compatibleTopology: "geometry.topologyKey";
      topologyChangeMode: "crossfade";
      openedFallback: "closed";
    };
  };
  kitchenGroups: Array<{
    id: string;
    name: string;
    instanceIds: string[];
    context: Record<string, WebsiteShowcaseJsonValue>;
  }>;
  worktops: Array<{
    id: string;
    kitchenGroupId: string;
    params: Record<string, WebsiteShowcaseJsonValue>;
    pathM: Array<{ x: number; z: number }>;
    part: WebsiteShowcasePartV1;
    bounds: WebsiteShowcaseBoundsV1;
  }>;
  modules: Array<{
    id: string;
    type: string;
    kitchenGroupId: string | null;
    kitchenPlacement: Record<string, WebsiteShowcaseJsonValue> | null;
    params: Record<string, WebsiteShowcaseJsonValue>;
    metadata: Record<string, WebsiteShowcaseJsonValue>;
    transform: WebsiteShowcaseTransformV1;
    coarseBox: {
      id: string;
      centerLocalM: Vec3;
      sizeM: Vec3;
      transform: WebsiteShowcaseTransformV1;
      bounds: WebsiteShowcaseBoundsV1;
    };
    openable: boolean;
    parts: WebsiteShowcasePartV1[];
  }>;
};

export type WebsiteShowcaseExportArgs = {
  stage: WebsiteShowcaseSnapshotStage;
  modules: readonly LayoutInstance[];
  worktops: readonly KitchenWorktopInstance[];
  kitchenGroups: readonly KitchenGroup[];
  buildModule: (params: ModuleParams) => THREE.Group;
  exportedAt?: string;
};

type MaterialLike = THREE.Material & {
  color?: THREE.Color;
  emissive?: THREE.Color;
  emissiveIntensity?: number;
  roughness?: number;
  metalness?: number;
  transmission?: number;
  ior?: number;
  map?: THREE.Texture | null;
  normalMap?: THREE.Texture | null;
  roughnessMap?: THREE.Texture | null;
  metalnessMap?: THREE.Texture | null;
  emissiveMap?: THREE.Texture | null;
  alphaMap?: THREE.Texture | null;
};

type RawPart = {
  matchKey: string;
  name: string;
  semanticName: string;
  path: string;
  classification: string;
  geometry: WebsiteShowcaseGeometryV1;
  materials: WebsiteShowcaseMaterialV1[];
  metadata: Record<string, WebsiteShowcaseJsonValue>;
  state: WebsiteShowcasePartStateV1;
};

const roundFinite = (value: number, fallback = 0): number => {
  if (!Number.isFinite(value)) return fallback;
  return Math.round(value * 1_000_000) / 1_000_000;
};

const vec3 = (value: THREE.Vector3): Vec3 => [roundFinite(value.x), roundFinite(value.y), roundFinite(value.z)];

function transformFromMatrix(matrix: THREE.Matrix4): WebsiteShowcaseTransformV1 {
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  matrix.decompose(position, quaternion, scale);
  return {
    matrix: matrix.elements.map((value) => roundFinite(value)) as Mat4,
    position: vec3(position),
    quaternion: [roundFinite(quaternion.x), roundFinite(quaternion.y), roundFinite(quaternion.z), roundFinite(quaternion.w)],
    scale: vec3(scale)
  };
}

function boundsToJson(box: THREE.Box3): WebsiteShowcaseBoundsV1 {
  if (box.isEmpty()) {
    return { min: [0, 0, 0], max: [0, 0, 0], center: [0, 0, 0], size: [0, 0, 0] };
  }
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  return { min: vec3(box.min), max: vec3(box.max), center: vec3(center), size: vec3(size) };
}

function sanitizedJsonValue(value: unknown, depth = 0, ancestors = new WeakSet<object>()): WebsiteShowcaseJsonValue | undefined {
  if (value === null) return null;
  if (typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? roundFinite(value) : null;
  if (typeof value === "bigint") return value.toString();
  if (typeof value !== "object" || depth > 7) return undefined;
  if (value instanceof Date) return value.toISOString();
  if (value instanceof THREE.Color) return `#${value.getHexString()}`;
  if (value instanceof THREE.Vector2) return [roundFinite(value.x), roundFinite(value.y)];
  if (value instanceof THREE.Vector3) return vec3(value);
  if (value instanceof THREE.Vector4 || value instanceof THREE.Quaternion) {
    return [roundFinite(value.x), roundFinite(value.y), roundFinite(value.z), roundFinite(value.w)];
  }
  if (value instanceof THREE.Matrix4) return value.elements.map((entry) => roundFinite(entry));
  if (value instanceof THREE.Object3D || value instanceof THREE.Material || value instanceof THREE.Texture) return undefined;
  if (ArrayBuffer.isView(value)) {
    return Array.from(value as unknown as ArrayLike<number>, (entry) => roundFinite(Number(entry))).slice(0, 4096);
  }
  if (ancestors.has(value)) return undefined;
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return value
        .slice(0, 1024)
        .map((entry) => sanitizedJsonValue(entry, depth + 1, ancestors))
        .filter((entry): entry is WebsiteShowcaseJsonValue => entry !== undefined);
    }
    const result: Record<string, WebsiteShowcaseJsonValue> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort().slice(0, 512)) {
      const next = sanitizedJsonValue((value as Record<string, unknown>)[key], depth + 1, ancestors);
      if (next !== undefined) result[key] = next;
    }
    return result;
  } finally {
    ancestors.delete(value);
  }
}

function sanitizedJsonObject(value: unknown): Record<string, WebsiteShowcaseJsonValue> {
  const sanitized = sanitizedJsonValue(value);
  return sanitized && typeof sanitized === "object" && !Array.isArray(sanitized)
    ? sanitized as Record<string, WebsiteShowcaseJsonValue>
    : {};
}

function stableToken(value: unknown, fallback = "part"): string {
  const raw = typeof value === "string" ? value.trim() : "";
  return (raw || fallback).replace(/[\\/:#]+/g, "_").replace(/\s+/g, "_");
}

function hashNumbers(values: readonly number[]): string {
  let hash = 0x811c9dc5;
  for (const value of values) {
    hash ^= Math.round(value) & 0xff;
    hash = Math.imul(hash, 0x01000193);
    hash ^= (Math.round(value) >>> 8) & 0xff;
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function hashString(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function readAttribute(attribute: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, itemSize: 2 | 3): number[] {
  const values = new Array<number>(attribute.count * itemSize);
  for (let index = 0; index < attribute.count; index += 1) {
    values[index * itemSize] = roundFinite(attribute.getX(index));
    values[index * itemSize + 1] = roundFinite(attribute.getY(index));
    if (itemSize === 3) values[index * itemSize + 2] = roundFinite(attribute.getZ(index));
  }
  return values;
}

function serializeGeometry(geometry: THREE.BufferGeometry): WebsiteShowcaseGeometryV1 | null {
  const position = geometry.getAttribute("position");
  if (!position || position.itemSize !== 3) return null;
  const positions = readAttribute(position, 3);
  const index = geometry.getIndex();
  const indices = index
    ? Array.from(index.array as ArrayLike<number>, (value) => Number(value))
    : Array.from({ length: position.count }, (_, itemIndex) => itemIndex);
  const normal = geometry.getAttribute("normal");
  const uv = geometry.getAttribute("uv");
  const groups = geometry.groups.length
    ? geometry.groups.map((group) => ({ start: group.start, count: group.count, materialIndex: group.materialIndex ?? 0 }))
    : undefined;
  const topologyNumbers = [position.count, indices.length, normal?.count ?? 0, uv?.count ?? 0, ...(groups ?? []).flatMap((group) => [group.start, group.count, group.materialIndex]), ...indices];
  return {
    kind: "bufferGeometry",
    positions,
    indices,
    ...(normal && normal.itemSize === 3 && normal.count === position.count ? { normals: readAttribute(normal, 3) } : {}),
    ...(uv && uv.itemSize === 2 && uv.count === position.count ? { uvs: readAttribute(uv, 2) } : {}),
    ...(groups ? { groups } : {}),
    topologyKey: `${position.count}:${indices.length}:${hashNumbers(topologyNumbers)}`
  };
}

function textureUri(texture: THREE.Texture): string | undefined {
  const textureData = texture.userData as Record<string, unknown>;
  for (const candidate of [textureData.uri, textureData.url, textureData.src]) {
    if (typeof candidate === "string" && candidate.length <= 4096) return candidate;
  }
  const image = (texture as THREE.Texture & { image?: unknown }).image;
  if (image && typeof image === "object") {
    const record = image as Record<string, unknown>;
    for (const candidate of [record.currentSrc, record.src]) {
      if (typeof candidate === "string" && candidate.length <= 4096) return candidate;
    }
  }
  return undefined;
}

function serializeTexture(texture: THREE.Texture): WebsiteShowcaseTextureV1 {
  const uri = textureUri(texture);
  return {
    ...(uri ? { uri } : {}),
    ...(texture.colorSpace ? { colorSpace: String(texture.colorSpace) } : {}),
    repeat: [roundFinite(texture.repeat.x), roundFinite(texture.repeat.y)],
    offset: [roundFinite(texture.offset.x), roundFinite(texture.offset.y)],
    rotation: roundFinite(texture.rotation),
    wrapS: texture.wrapS,
    wrapT: texture.wrapT
  };
}

function serializeMaterials(material: THREE.Material | THREE.Material[]): WebsiteShowcaseMaterialV1[] {
  return (Array.isArray(material) ? material : [material]).map((entry) => {
    const source = entry as MaterialLike;
    const maps: Record<string, WebsiteShowcaseTextureV1> = {};
    for (const [key, texture] of Object.entries({
      baseColor: source.map,
      normal: source.normalMap,
      roughness: source.roughnessMap,
      metallic: source.metalnessMap,
      emissive: source.emissiveMap,
      alpha: source.alphaMap
    })) {
      if (texture instanceof THREE.Texture) maps[key] = serializeTexture(texture);
    }
    return {
      name: entry.name || "",
      type: entry.type,
      ...(source.color ? { color: `#${source.color.getHexString()}` } : {}),
      ...(source.emissive ? { emissive: `#${source.emissive.getHexString()}` } : {}),
      ...(typeof source.emissiveIntensity === "number" ? { emissiveIntensity: roundFinite(source.emissiveIntensity) } : {}),
      ...(typeof source.roughness === "number" ? { roughness: roundFinite(source.roughness) } : {}),
      ...(typeof source.metalness === "number" ? { metalness: roundFinite(source.metalness) } : {}),
      ...(typeof source.transmission === "number" ? { transmission: roundFinite(source.transmission) } : {}),
      ...(typeof source.ior === "number" ? { ior: roundFinite(source.ior) } : {}),
      opacity: roundFinite(entry.opacity, 1),
      transparent: entry.transparent,
      side: entry.side,
      ...(Object.keys(maps).length ? { maps } : {}),
      metadata: sanitizedJsonObject(entry.userData)
    };
  });
}

function objectPath(object: THREE.Object3D, root: THREE.Object3D): string {
  const segments: string[] = [];
  let current: THREE.Object3D | null = object;
  while (current && current !== root) {
    segments.push(stableToken(current.name || current.type, current.type));
    current = current.parent;
  }
  return segments.reverse().join("/");
}

function isVisibleWithin(object: THREE.Object3D, root: THREE.Object3D): boolean {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (!current.visible || current.userData.visibilityHidden === true) return false;
    if (current === root) return true;
    current = current.parent;
  }
  return false;
}

function isHelperMesh(mesh: THREE.Mesh): boolean {
  const name = mesh.name || "";
  const kind = String(mesh.userData.kind ?? "");
  const materialGroup = String(mesh.userData.materialGroup ?? "");
  return materialGroup === "placement"
    || kind === "modulePlan"
    || kind === "kitchenWorktopOutline"
    || /(?:^|_)(pick|outline|helper|debug|preview|selection|overlap)(?:_|$)/i.test(name);
}

function classifyPart(metadata: Record<string, WebsiteShowcaseJsonValue>): string {
  const componentType = typeof metadata.componentType === "string" ? metadata.componentType : "";
  if (componentType) return componentType;
  const materialGroup = typeof metadata.materialGroup === "string" ? metadata.materialGroup : "";
  return materialGroup || "part";
}

function stateForMesh(mesh: THREE.Mesh, worldMatrix: THREE.Matrix4, geometry: WebsiteShowcaseGeometryV1): WebsiteShowcasePartStateV1 {
  mesh.geometry.computeBoundingBox();
  const localBox = mesh.geometry.boundingBox?.clone() ?? new THREE.Box3();
  const worldBox = localBox.applyMatrix4(worldMatrix);
  return { transform: transformFromMatrix(worldMatrix), bounds: boundsToJson(worldBox), geometry };
}

function collectVariantParts(root: THREE.Object3D, placementMatrix: THREE.Matrix4 | null, warnings: string[]): Map<string, RawPart> {
  root.updateMatrixWorld(true);
  const candidates: Array<Omit<RawPart, "matchKey"> & { identityBase: string }> = [];
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || !isVisibleWithin(object, root) || isHelperMesh(object)) return;
    const geometry = serializeGeometry(object.geometry);
    if (!geometry) {
      warnings.push(`Skipped mesh without position geometry: ${object.name || "unnamed"}`);
      return;
    }
    const metadata = sanitizedJsonObject(object.userData);
    const semantic = String(object.userData.primitiveId ?? object.userData.boardName ?? object.userData.partName ?? object.name ?? "part");
    const path = objectPath(object, root);
    const matrix = placementMatrix ? placementMatrix.clone().multiply(object.matrixWorld) : object.matrixWorld.clone();
    candidates.push({
      identityBase: stableToken(semantic),
      name: object.name || semantic,
      semanticName: semantic,
      path,
      classification: classifyPart(metadata),
      geometry,
      materials: serializeMaterials(object.material),
      metadata,
      state: stateForMesh(object, matrix, geometry)
    });
  });
  candidates.sort((left, right) => left.identityBase.localeCompare(right.identityBase) || left.path.localeCompare(right.path));
  const occurrences = new Map<string, number>();
  const result = new Map<string, RawPart>();
  for (const candidate of candidates) {
    const occurrence = (occurrences.get(candidate.identityBase) ?? 0) + 1;
    occurrences.set(candidate.identityBase, occurrence);
    const matchKey = `${candidate.identityBase}:${occurrence}`;
    const { identityBase: _identityBase, ...raw } = candidate;
    result.set(matchKey, { ...raw, matchKey });
  }
  return result;
}

function sameNumberArray(left: readonly number[] | undefined, right: readonly number[] | undefined): boolean {
  if (!left || !right) return left === right;
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) if (left[index] !== right[index]) return false;
  return true;
}

function sameGeometry(left: WebsiteShowcaseGeometryV1, right: WebsiteShowcaseGeometryV1): boolean {
  return left.topologyKey === right.topologyKey
    && sameNumberArray(left.positions, right.positions)
    && sameNumberArray(left.indices, right.indices)
    && sameNumberArray(left.normals, right.normals)
    && sameNumberArray(left.uvs, right.uvs);
}

function sameTransform(left: WebsiteShowcaseTransformV1, right: WebsiteShowcaseTransformV1): boolean {
  return sameNumberArray(left.matrix, right.matrix);
}

function cloneWithOpened(params: ModuleParams, opened: boolean): ModuleParams {
  const clone = structuredClone(params) as ModuleParams;
  const record = clone as unknown as Record<string, unknown>;
  record.opened = opened;
  if ("doorOpen" in record) record.doorOpen = opened;
  if ("flapOpen" in record) record.flapOpen = opened;
  return clone;
}

function assemblyGroupId(moduleId: string, metadata: Record<string, WebsiteShowcaseJsonValue>, semanticName: string): string {
  const submoduleKind = typeof metadata.submoduleKind === "string" ? metadata.submoduleKind : null;
  const drawerIndex = typeof metadata.parentDrawerIndex === "number" ? metadata.parentDrawerIndex : null;
  if (submoduleKind || drawerIndex !== null) return `module:${moduleId}:submodule:${submoduleKind ?? "drawer"}:${drawerIndex ?? "unknown"}`;
  return `module:${moduleId}:part:${stableToken(semanticName)}`;
}

function explodedOffset(partId: string, partCenter: Vec3, moduleCenter: Vec3, moduleSize: Vec3): Vec3 {
  const direction = new THREE.Vector3(partCenter[0] - moduleCenter[0], partCenter[1] - moduleCenter[1], partCenter[2] - moduleCenter[2]);
  if (direction.lengthSq() < 0.0001) {
    const hash = hashString(partId);
    direction.set(((hash & 255) / 255) * 2 - 1, 0.35, ((((hash >>> 8) & 255) / 255) * 2) - 1);
  }
  direction.normalize();
  const distance = Math.min(0.45, Math.max(0.12, Math.max(...moduleSize) * 0.28));
  direction.multiplyScalar(distance);
  direction.y = Math.abs(direction.y) * 0.55 + 0.055 + (hashString(partId) % 5) * 0.012;
  return vec3(direction);
}

function assemblyPriority(part: WebsiteShowcasePartV1): number {
  const group = typeof part.metadata.materialGroup === "string" ? part.metadata.materialGroup : part.classification;
  if (["corpus", "carcass", "body", "plinth", "back"].includes(group)) return 10;
  if (["shelf", "drawer_bottom"].includes(group)) return 20;
  if (group === "front") return 30;
  if (group === "hardware") return 40;
  return 25;
}

function exportModule(args: WebsiteShowcaseExportArgs, instance: LayoutInstance, warnings: string[]): WebsiteShowcaseExportV1["modules"][number] | null {
  if (instance.root.userData.visibilityHidden === true) return null;
  instance.root.updateMatrixWorld(true);
  const placementMatrix = instance.root.matrixWorld.clone();
  let closed: THREE.Group | null = null;
  let opened: THREE.Group | null = null;
  let closedOwned = false;
  let openedOwned = false;
  try {
    try {
      closed = args.buildModule(cloneWithOpened(instance.params, false));
      closedOwned = true;
    } catch (error: unknown) {
      warnings.push(`Module ${instance.id}: closed rebuild failed; current geometry used. ${error instanceof Error ? error.message : String(error)}`);
      closed = instance.module;
    }
    try {
      opened = args.buildModule(cloneWithOpened(instance.params, true));
      openedOwned = true;
    } catch (error: unknown) {
      warnings.push(`Module ${instance.id}: opened rebuild failed. ${error instanceof Error ? error.message : String(error)}`);
    }

    const closedParts = closed
      ? collectVariantParts(closed, closed === instance.module ? null : placementMatrix, warnings)
      : new Map<string, RawPart>();
    const openedParts = opened ? collectVariantParts(opened, placementMatrix, warnings) : new Map<string, RawPart>();
    if (!closedParts.size && !openedParts.size) {
      warnings.push(`Module ${instance.id}: no exportable meshes.`);
      return null;
    }

    const localBox = closedOwned && closed
      ? new THREE.Box3().setFromObject(closed)
      : instance.localBox.clone();
    const centerLocal = localBox.getCenter(new THREE.Vector3());
    const sizeLocal = localBox.getSize(new THREE.Vector3());
    const coarseMatrix = placementMatrix.clone().multiply(new THREE.Matrix4().makeTranslation(centerLocal.x, centerLocal.y, centerLocal.z));
    const coarseWorldBox = localBox.clone().applyMatrix4(placementMatrix);
    const moduleCenter = vec3(coarseWorldBox.getCenter(new THREE.Vector3()));
    const moduleSize = vec3(coarseWorldBox.getSize(new THREE.Vector3()));

    const parts: WebsiteShowcasePartV1[] = [];
    const keys = Array.from(new Set([...closedParts.keys(), ...openedParts.keys()])).sort();
    for (const matchKey of keys) {
      const closedPart = closedParts.get(matchKey);
      const openedPart = openedParts.get(matchKey);
      const base = closedPart ?? openedPart;
      if (!base) continue;
      const id = `module:${instance.id}:part:${matchKey}`;
      const closedState = closedPart
        ? { transform: closedPart.state.transform, bounds: closedPart.state.bounds }
        : undefined;
      const openedChanged = openedPart && (!closedPart || !sameTransform(closedPart.state.transform, openedPart.state.transform) || !sameGeometry(closedPart.geometry, openedPart.geometry));
      const openedState = openedChanged && openedPart
        ? {
            transform: openedPart.state.transform,
            bounds: openedPart.state.bounds,
            ...(!closedPart || !sameGeometry(base.geometry, openedPart.geometry) ? { geometry: openedPart.geometry } : {})
          }
        : undefined;
      const center = (closedState ?? openedState)?.bounds.center ?? moduleCenter;
      parts.push({
        id,
        name: base.name,
        semanticName: base.semanticName,
        path: base.path,
        classification: base.classification,
        geometry: base.geometry,
        materials: base.materials,
        metadata: base.metadata,
        states: { ...(closedState ? { closed: closedState } : {}), ...(openedState ? { opened: openedState } : {}) },
        exploded: {
          offsetM: explodedOffset(id, center, moduleCenter, moduleSize),
          order: 0,
          assemblyGroupId: assemblyGroupId(instance.id, base.metadata, base.semanticName)
        }
      });
    }
    const assemblyOrder = [...parts].sort((left, right) =>
      assemblyPriority(left) - assemblyPriority(right)
      || (left.states.closed?.bounds.center[1] ?? 0) - (right.states.closed?.bounds.center[1] ?? 0)
      || left.id.localeCompare(right.id)
    );
    assemblyOrder.forEach((part, index) => { part.exploded.order = index; });
    parts.sort((left, right) => left.id.localeCompare(right.id));

    return {
      id: instance.id,
      type: String((instance.params as { type?: unknown }).type ?? "unknown"),
      kitchenGroupId: instance.kitchenGroupId,
      kitchenPlacement: instance.kitchenPlacement ? sanitizedJsonObject(instance.kitchenPlacement) : null,
      params: sanitizedJsonObject(instance.params),
      metadata: sanitizedJsonObject(closed?.userData ?? instance.module.userData),
      transform: transformFromMatrix(placementMatrix),
      coarseBox: {
        id: `module:${instance.id}:coarse-box`,
        centerLocalM: vec3(centerLocal),
        sizeM: vec3(sizeLocal),
        transform: transformFromMatrix(coarseMatrix),
        bounds: boundsToJson(coarseWorldBox)
      },
      openable: parts.some((part) => !!part.states.opened),
      parts
    };
  } finally {
    if (closedOwned && closed) disposeObject3D(closed);
    if (openedOwned && opened) disposeObject3D(opened);
  }
}

function exportWorktop(worktop: KitchenWorktopInstance, warnings: string[]): WebsiteShowcaseExportV1["worktops"][number] | null {
  if (worktop.root.userData.visibilityHidden === true || worktop.mesh.userData.visibilityHidden === true || !worktop.mesh.visible) return null;
  worktop.mesh.updateMatrixWorld(true);
  const geometry = serializeGeometry(worktop.mesh.geometry);
  if (!geometry) {
    warnings.push(`Worktop ${worktop.id}: mesh has no exportable geometry.`);
    return null;
  }
  const metadata = sanitizedJsonObject(worktop.mesh.userData);
  const state = stateForMesh(worktop.mesh, worktop.mesh.matrixWorld.clone(), geometry);
  const part: WebsiteShowcasePartV1 = {
    id: `worktop:${worktop.id}:part:worktop`,
    name: worktop.mesh.name || `worktop_${worktop.id}`,
    semanticName: "worktop",
    path: worktop.mesh.name || `worktop_${worktop.id}`,
    classification: "worktop",
    geometry,
    materials: serializeMaterials(worktop.mesh.material),
    metadata,
    states: { closed: { transform: state.transform, bounds: state.bounds } },
    exploded: {
      offsetM: [0, Math.max(0.18, worktop.params.thicknessMm / 1000 * 5), 0],
      order: 0,
      assemblyGroupId: `worktop:${worktop.id}`
    }
  };
  return {
    id: worktop.id,
    kitchenGroupId: worktop.kitchenGroupId,
    params: sanitizedJsonObject(worktop.params),
    pathM: worktop.params.path.map((point) => ({ x: roundFinite(point.x), z: roundFinite(point.z) })),
    part,
    bounds: state.bounds
  };
}

export function exportWebsiteShowcaseSnapshot(args: WebsiteShowcaseExportArgs): WebsiteShowcaseExportV1 {
  const warnings: string[] = [];
  const kitchenGroups = [...args.kitchenGroups]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((group) => ({
      id: group.id,
      name: group.name,
      instanceIds: [...group.instanceIds].sort(),
      context: sanitizedJsonObject(group.ctx)
    }));
  const modules = [...args.modules]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((instance) => exportModule(args, instance, warnings))
    .filter((module): module is NonNullable<typeof module> => module !== null);
  const worktops = [...args.worktops]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((worktop) => exportWorktop(worktop, warnings))
    .filter((worktop): worktop is NonNullable<typeof worktop> => worktop !== null);
  if (!modules.length) warnings.push("No module geometry was exported.");
  if (!worktops.length) warnings.push("No worktop geometry was exported.");
  const scenarioKey = kitchenGroups.length ? kitchenGroups.map((group) => group.id).join("+") : "ungrouped-kitchen";

  return {
    format: "arcigy-website-showcase",
    version: 1,
    meta: {
      stage: args.stage,
      exportedAt: args.exportedAt ?? new Date().toISOString(),
      unit: "meters",
      coordinateSystem: "three_y_up_right_handed",
      stableIdVersion: 1,
      scenarioKey,
      warnings: Array.from(new Set(warnings)).sort()
    },
    workflow: {
      sequence: [
        { id: "worktop", source: "worktops[].part.states.closed" },
        { id: "coarse-blocks", source: "modules[].coarseBox" },
        { id: "detailed-modules", source: "modules[].parts[].states.closed" },
        { id: "parameter-transition", source: "pair initial/final exports by stable IDs" },
        { id: "opened-modules", source: "modules[].parts[].states.opened with closed fallback" },
        { id: "materials", source: "modules/worktops part materials" },
        { id: "ai-render", source: "external generated image", external: true }
      ],
      pairing: {
        moduleKey: "modules[].id",
        partKey: "modules[].parts[].id",
        compatibleTopology: "geometry.topologyKey",
        topologyChangeMode: "crossfade",
        openedFallback: "closed"
      }
    },
    kitchenGroups,
    worktops,
    modules
  };
}
