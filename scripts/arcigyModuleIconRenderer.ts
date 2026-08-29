import * as THREE from "three";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import { getSystemSeedCatalog } from "../src/core/catalog/catalog-repository";
import {
  applyModuleParameterPreset,
  buildModulePackageGeometryFromPackage,
  createDefaultModulePackageParameters
} from "../src/core/module-package/runtime/module-runtime-adapter";
import { extendedFurnitureModulePackages } from "../src/system/module-packages/extendedFurniture";
import {
  ARCIGY_MODULE_ICON_STYLE,
  resolveArcigyModuleIconTargets,
  type ArcigyModuleIconTarget
} from "../src/modules/fwmFurniture/moduleIconRenderContract";

type RenderedIcon = { id: string; outputPath: string; dataUrl: string; hasTransparentBackground: boolean };

declare global {
  interface Window {
    renderArcigyModuleIcons: (ids?: string[]) => Promise<RenderedIcon[]>;
    arcigyModuleIconRendererReady: boolean;
  }
}

const boardColors: Record<string, number> = {
  corpus: 0xe8e7e2,
  body: 0xe8e7e2,
  carcass: 0xe8e7e2,
  shelf: 0xe8e7e2,
  front: 0xa9774d,
  back: 0xc7c6c0,
  plinth: 0x34373b,
  drawer_bottom: 0xd7d5ce,
  hardware: 0x15171a
};

function canonicalMaterialGroup(mesh: THREE.Mesh) {
  const value = String(mesh.userData.materialGroup ?? mesh.userData.materialSlotId ?? "corpus").toLowerCase();
  if (value === "carcass" || value === "body" || value === "shelf") return "corpus";
  return value;
}

function previewMaterial(mesh: THREE.Mesh) {
  const group = canonicalMaterialGroup(mesh);
  const hardware = group === "hardware";
  return new THREE.MeshStandardMaterial({
    color: boardColors[group] ?? boardColors.corpus,
    roughness: hardware ? 0.52 : 0.88,
    metalness: hardware ? 0.32 : 0,
    side: THREE.DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1
  });
}

function addConsistentBoardEdges(root: THREE.Object3D, sizePx: number) {
  root.updateMatrixWorld(true);
  const meshes: THREE.Mesh[] = [];
  root.traverse((object) => {
    if (object instanceof THREE.Mesh && object.visible) meshes.push(object);
  });
  for (const mesh of meshes) {
    const group = canonicalMaterialGroup(mesh);
    mesh.material = previewMaterial(mesh);
    if (group === "hardware") continue;
    const requestedThreshold = Number(mesh.userData.moduleEdgeThresholdAngleDeg);
    const threshold = Number.isFinite(requestedThreshold)
      ? Math.max(1, Math.min(89, requestedThreshold))
      : ARCIGY_MODULE_ICON_STYLE.edgeThresholdAngleDeg;
    const sourceEdges = new THREE.EdgesGeometry(mesh.geometry as THREE.BufferGeometry, threshold);
    const geometry = new LineSegmentsGeometry().fromEdgesGeometry(sourceEdges);
    sourceEdges.dispose();
    const material = new LineMaterial({
      color: ARCIGY_MODULE_ICON_STYLE.edgeColor,
      linewidth: ARCIGY_MODULE_ICON_STYLE.edgeWidthPx,
      worldUnits: false,
      depthTest: true,
      depthWrite: false,
      alphaToCoverage: true
    });
    material.resolution.set(sizePx, sizePx);
    const lines = new LineSegments2(geometry, material);
    lines.name = "__arcigy_module_icon_edges";
    lines.renderOrder = 4;
    mesh.add(lines);
  }
}

function findPackage(target: ArcigyModuleIconTarget) {
  const modulePackage = extendedFurnitureModulePackages.find((candidate) =>
    target.modulePackageId
      ? candidate.module.modulePackageId === target.modulePackageId
      : candidate.module.moduleType === target.moduleType
  );
  if (!modulePackage) throw new Error(`Module package not found for icon target ${target.id}`);
  return modulePackage;
}

function buildTarget(target: ArcigyModuleIconTarget) {
  const modulePackage = findPackage(target);
  const baseParameters = {
    ...createDefaultModulePackageParameters(modulePackage),
    ...target.parameters
  };
  const parameters = target.presetId
    ? applyModuleParameterPreset({ modulePackage, parameters: baseParameters, presetId: target.presetId })
    : baseParameters;
  return buildModulePackageGeometryFromPackage({
    modulePackage,
    parameters,
    catalog: getSystemSeedCatalog()
  });
}

function cameraDirection(target: ArcigyModuleIconTarget) {
  const azimuth = THREE.MathUtils.degToRad(target.cameraAzimuthDeg ?? ARCIGY_MODULE_ICON_STYLE.cameraAzimuthDeg);
  const elevation = THREE.MathUtils.degToRad(ARCIGY_MODULE_ICON_STYLE.cameraElevationDeg);
  const horizontal = Math.cos(elevation);
  return new THREE.Vector3(
    Math.sin(azimuth) * horizontal,
    Math.sin(elevation),
    Math.cos(azimuth) * horizontal
  ).normalize();
}

function frameCamera(camera: THREE.PerspectiveCamera, root: THREE.Object3D, target: ArcigyModuleIconTarget) {
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(root);
  if (box.isEmpty()) throw new Error("Cannot frame empty module geometry.");
  const center = box.getCenter(new THREE.Vector3());
  const direction = cameraDirection(target);
  const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), direction).normalize();
  const viewUp = new THREE.Vector3().crossVectors(direction, right).normalize();
  let halfWidth = 0;
  let halfHeight = 0;
  let halfDepth = 0;
  for (const x of [box.min.x, box.max.x]) {
    for (const y of [box.min.y, box.max.y]) {
      for (const z of [box.min.z, box.max.z]) {
        const offset = new THREE.Vector3(x, y, z).sub(center);
        halfWidth = Math.max(halfWidth, Math.abs(offset.dot(right)));
        halfHeight = Math.max(halfHeight, Math.abs(offset.dot(viewUp)));
        halfDepth = Math.max(halfDepth, Math.abs(offset.dot(direction)));
      }
    }
  }
  const halfFov = THREE.MathUtils.degToRad(camera.fov * 0.5);
  const halfHorizontalFov = Math.atan(Math.tan(halfFov) * camera.aspect);
  const distance = (
    Math.max(halfHeight / Math.tan(halfFov), halfWidth / Math.tan(halfHorizontalFov)) + halfDepth
  ) * ARCIGY_MODULE_ICON_STYLE.framePadding;
  camera.position.copy(center).addScaledVector(direction, distance);
  camera.up.set(0, 1, 0);
  camera.near = Math.max(0.001, distance * 0.02);
  camera.far = distance * 8;
  camera.lookAt(center.x, center.y * 0.94, center.z);
  camera.updateProjectionMatrix();
}

function disposeRoot(root: THREE.Object3D) {
  root.traverse((object) => {
    const renderable = object as THREE.Mesh | LineSegments2;
    renderable.geometry?.dispose();
    const material = renderable.material;
    if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
    else material?.dispose();
  });
}

async function renderTarget(target: ArcigyModuleIconTarget): Promise<RenderedIcon> {
  const size = ARCIGY_MODULE_ICON_STYLE.outputSizePx;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(size, size, false);
  renderer.setPixelRatio(1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, ARCIGY_MODULE_ICON_STYLE.backgroundAlpha);
  document.body.replaceChildren(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = null;
  scene.add(new THREE.HemisphereLight(0xffffff, 0xc7c9cd, 2.25));
  const key = new THREE.DirectionalLight(0xffffff, 2.7);
  key.position.set(4, 7, 5);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xffffff, 1.1);
  fill.position.set(-4, 3, -2);
  scene.add(fill);

  const root = buildTarget(target);
  scene.add(root);
  const camera = new THREE.PerspectiveCamera(ARCIGY_MODULE_ICON_STYLE.cameraFovDeg, 1, 0.001, 100);
  frameCamera(camera, root, target);
  addConsistentBoardEdges(root, size);
  renderer.render(scene, camera);
  const gl = renderer.getContext();
  const corner = new Uint8Array(4);
  gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, corner);
  const dataUrl = renderer.domElement.toDataURL("image/png");

  disposeRoot(root);
  renderer.dispose();
  return { id: target.id, outputPath: target.outputPath, dataUrl, hasTransparentBackground: corner[3] === 0 };
}

window.renderArcigyModuleIcons = async (ids: string[] = []) => {
  const results: RenderedIcon[] = [];
  for (const target of resolveArcigyModuleIconTargets(ids)) results.push(await renderTarget(target));
  return results;
};
window.arcigyModuleIconRendererReady = true;
