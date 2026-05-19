import * as THREE from "three";

export type ViewDisplayMode = "solid" | "realistic" | "wireframe";

type MaterialDisplayState = {
  wireframe?: boolean;
  transparent: boolean;
  opacity: number;
  depthWrite: boolean;
  envMapIntensity?: number;
  metalness?: number;
  roughness?: number;
};

type EdgeLine = THREE.LineSegments<THREE.BufferGeometry, THREE.LineBasicMaterial>;
type WallCutoutBounds = { holeX0: number; holeX1: number; holeY0: number; holeY1: number };

const EDGE_USER_DATA_KEY = "viewDisplayEdgeLine";
const HIDDEN_PREVIEW_COLOR = 0xff00c8;

function eachMaterial(material: THREE.Material | THREE.Material[], fn: (material: THREE.Material) => void) {
  if (Array.isArray(material)) {
    for (const item of material) fn(item);
    return;
  }
  fn(material);
}

function hasWireframe(material: THREE.Material): material is THREE.Material & { wireframe: boolean } {
  return "wireframe" in material && typeof (material as { wireframe?: unknown }).wireframe === "boolean";
}

function hasPbrControls(material: THREE.Material): material is THREE.Material & {
  envMapIntensity?: number;
  metalness?: number;
  roughness?: number;
} {
  return "roughness" in material || "metalness" in material || "envMapIntensity" in material;
}

function getWallCutoutBounds(mesh: THREE.Mesh): WallCutoutBounds[] {
  const bounds = mesh.userData.wallCutoutBounds;
  if (!Array.isArray(bounds)) return [];
  return bounds.filter((item): item is WallCutoutBounds =>
    typeof item?.holeX0 === "number" &&
    typeof item?.holeX1 === "number" &&
    typeof item?.holeY0 === "number" &&
    typeof item?.holeY1 === "number"
  );
}

function isCutoutOutlinePoint(point: THREE.Vector3, bounds: WallCutoutBounds, eps = 0.003) {
  const near = (value: number, target: number) => Math.abs(value - target) <= eps;
  const within = (value: number, min: number, max: number) => value >= min - eps && value <= max + eps;
  return (
    ((near(point.x, bounds.holeX0) || near(point.x, bounds.holeX1)) && within(point.y, bounds.holeY0, bounds.holeY1)) ||
    ((near(point.y, bounds.holeY0) || near(point.y, bounds.holeY1)) && within(point.x, bounds.holeX0, bounds.holeX1))
  );
}

function isCutoutOutlineSegment(a: THREE.Vector3, b: THREE.Vector3, boundsList: WallCutoutBounds[]) {
  return boundsList.some((bounds) => isCutoutOutlinePoint(a, bounds) && isCutoutOutlinePoint(b, bounds));
}

function makeDisplayEdgeGeometry(mesh: THREE.Mesh) {
  const edgeGeometry = new THREE.EdgesGeometry(mesh.geometry, 1);
  const cutoutBounds = getWallCutoutBounds(mesh);
  if (cutoutBounds.length === 0) return edgeGeometry;

  const position = edgeGeometry.getAttribute("position");
  const points: THREE.Vector3[] = [];
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  for (let index = 0; index + 1 < position.count; index += 2) {
    a.fromBufferAttribute(position, index);
    b.fromBufferAttribute(position, index + 1);
    if (isCutoutOutlineSegment(a, b, cutoutBounds)) continue;
    points.push(a.clone(), b.clone());
  }
  edgeGeometry.dispose();
  return new THREE.BufferGeometry().setFromPoints(points);
}

export function createViewDisplayController(scene: THREE.Scene) {
  let mode: ViewDisplayMode = "solid";
  const materialStates = new WeakMap<THREE.Material, MaterialDisplayState>();
  const edgeLines = new WeakMap<THREE.Mesh, EdgeLine>();
  const edgeMeshes = new Set<THREE.Mesh>();
  const edgeMaterial = new THREE.LineBasicMaterial({
    color: 0x1d2630,
    transparent: true,
    opacity: 0.55,
    depthTest: true,
    depthWrite: false
  });

  const rememberMaterial = (material: THREE.Material) => {
    const state = materialStates.get(material);
    if (state) return state;
    const nextState: MaterialDisplayState = {
      wireframe: hasWireframe(material) ? material.wireframe : undefined,
      transparent: material.transparent,
      opacity: material.opacity,
      depthWrite: material.depthWrite,
      envMapIntensity: hasPbrControls(material) ? material.envMapIntensity : undefined,
      metalness: hasPbrControls(material) ? material.metalness : undefined,
      roughness: hasPbrControls(material) ? material.roughness : undefined
    };
    materialStates.set(material, nextState);
    return nextState;
  };

  const restoreMaterialDisplay = (material: THREE.Material) => {
    const state = materialStates.get(material);
    if (!state) {
      if (hasWireframe(material)) material.wireframe = false;
      material.opacity = 1;
      material.depthWrite = true;
      material.needsUpdate = true;
      return;
    }
    if (hasWireframe(material) && typeof state.wireframe === "boolean") {
      material.wireframe = state.wireframe;
    }
    material.transparent = state.transparent;
    material.opacity = state.opacity;
    material.depthWrite = state.depthWrite;
    if (hasPbrControls(material)) {
      if (typeof state.envMapIntensity === "number") material.envMapIntensity = state.envMapIntensity;
      if (typeof state.metalness === "number") material.metalness = state.metalness;
      if (typeof state.roughness === "number") material.roughness = state.roughness;
    }
    material.needsUpdate = true;
  };

  const suppressRealisticMaterial = (material: THREE.Material) => {
    rememberMaterial(material);
    if (!hasPbrControls(material)) return;
    material.envMapIntensity = 0;
    material.metalness = 0;
    material.roughness = 1;
    material.needsUpdate = true;
  };

  const hideSurfaceForWireframe = (material: THREE.Material) => {
    rememberMaterial(material);
    if (hasWireframe(material)) {
      material.wireframe = false;
    }
    material.transparent = true;
    material.opacity = 0;
    material.depthWrite = false;
    material.needsUpdate = true;
  };

  const removeEdgeLine = (mesh: THREE.Mesh) => {
    const edge = edgeLines.get(mesh);
    if (!edge) return;
    edge.removeFromParent();
    edge.geometry.dispose();
    edge.material.dispose();
    edgeLines.delete(mesh);
    edgeMeshes.delete(mesh);
  };

  const ensureEdgeLine = (mesh: THREE.Mesh) => {
    const geometry = mesh.geometry;
    if (!geometry) return;

    let edge = edgeLines.get(mesh);
    if (edge && edge.userData.sourceGeometryUuid !== geometry.uuid) {
      removeEdgeLine(mesh);
      edge = undefined;
    }

    if (!edge) {
      edge = new THREE.LineSegments(makeDisplayEdgeGeometry(mesh), edgeMaterial.clone());
      edge.name = `${mesh.name || "mesh"}_edgeLines`;
      edge.userData[EDGE_USER_DATA_KEY] = true;
      edge.userData.sourceGeometryUuid = geometry.uuid;
      edge.renderOrder = (mesh.renderOrder || 0) + 1;
      edge.matrixAutoUpdate = false;
      edgeLines.set(mesh, edge);
      edgeMeshes.add(mesh);
      mesh.add(edge);
    }

    edge.visible = true;
    edge.material.color.setHex(mesh.userData.visibilityHiddenPreview ? HIDDEN_PREVIEW_COLOR : 0x1d2630);
  };

  const applyOpeningMeshDisplay = (mesh: THREE.Mesh) => {
    if (mesh.name === "windowPick" || mesh.name === "doorPick") {
      removeEdgeLine(mesh);
      return;
    }
    if (mode === "wireframe") {
      if (mesh.userData.viewDisplaySkipMaterialRestore) {
        removeEdgeLine(mesh);
        eachMaterial(mesh.material, (material) => {
          if (hasWireframe(material)) material.wireframe = false;
          material.needsUpdate = true;
        });
        return;
      }
      eachMaterial(mesh.material, (material) => {
        hideSurfaceForWireframe(material);
      });
      ensureEdgeLine(mesh);
      return;
    }

    removeEdgeLine(mesh);
    if (mesh.userData.viewDisplaySkipMaterialRestore) return;
    eachMaterial(mesh.material, (material) => {
      restoreMaterialDisplay(material);
      if (mode === "solid") suppressRealisticMaterial(material);
    });
  };

  const applyToMesh = (mesh: THREE.Mesh) => {
    if (mesh.userData.kind === "window" || mesh.userData.kind === "door") {
      applyOpeningMeshDisplay(mesh);
      return;
    }
    if (mesh.userData.viewDisplaySkipEdges) {
      if (!mesh.userData.viewDisplaySkipMaterialRestore) {
        eachMaterial(mesh.material, restoreMaterialDisplay);
      }
      removeEdgeLine(mesh);
      return;
    }
    eachMaterial(mesh.material, (material) => {
      if (mode === "wireframe") hideSurfaceForWireframe(material);
      else restoreMaterialDisplay(material);
      if (mode === "solid") suppressRealisticMaterial(material);
    });

    if (mode === "solid" || mode === "wireframe") {
      ensureEdgeLine(mesh);
    } else {
      removeEdgeLine(mesh);
    }
  };

  const sync = () => {
    const seen = new Set<THREE.Mesh>();
    scene.traverse((object) => {
      if (object.userData[EDGE_USER_DATA_KEY]) return;
      if (!(object instanceof THREE.Mesh)) return;
      seen.add(object);
      applyToMesh(object);
    });
    for (const mesh of Array.from(edgeMeshes)) {
      if (!seen.has(mesh)) removeEdgeLine(mesh);
    }
  };

  const dispose = () => {
    scene.traverse((object) => {
      if (object instanceof THREE.Mesh) removeEdgeLine(object);
    });
    edgeMaterial.dispose();
  };

  return {
    getMode: () => mode,
    setMode(nextMode: ViewDisplayMode) {
      mode = nextMode;
      sync();
    },
    sync,
    dispose
  };
}
