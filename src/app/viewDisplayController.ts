import * as THREE from "three";

export type ViewDisplayMode = "solid" | "realistic";

/** Retired/unknown saved display modes open as solid without changing project geometry. */
export function resolveViewDisplayMode(value: unknown): ViewDisplayMode {
  return value === "realistic" ? "realistic" : "solid";
}

type MaterialDisplayState = {
  transparent: boolean;
  opacity: number;
  depthWrite: boolean;
  polygonOffset: boolean;
  polygonOffsetFactor: number;
  polygonOffsetUnits: number;
  envMapIntensity?: number;
  metalness?: number;
  roughness?: number;
};

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

export function createViewDisplayController(scene: THREE.Scene) {
  let mode: ViewDisplayMode = "solid";
  const materialStates = new WeakMap<THREE.Material, MaterialDisplayState>();
  const rememberMaterial = (material: THREE.Material) => {
    const state = materialStates.get(material);
    if (state) return state;
    const nextState: MaterialDisplayState = {
      transparent: material.transparent,
      opacity: material.opacity,
      depthWrite: material.depthWrite,
      polygonOffset: material.polygonOffset,
      polygonOffsetFactor: material.polygonOffsetFactor,
      polygonOffsetUnits: material.polygonOffsetUnits,
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
      material.opacity = 1;
      material.depthWrite = true;
      material.polygonOffset = false;
      material.polygonOffsetFactor = 0;
      material.polygonOffsetUnits = 0;
      material.needsUpdate = true;
      return;
    }
    material.transparent = state.transparent;
    material.opacity = state.opacity;
    material.depthWrite = state.depthWrite;
    material.polygonOffset = state.polygonOffset;
    material.polygonOffsetFactor = state.polygonOffsetFactor;
    material.polygonOffsetUnits = state.polygonOffsetUnits;
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

  const makeSolidSurfaceOpaque = (material: THREE.Material) => {
    // A newly inserted module can inherit a transparent preview material while
    // the display mode is already Solid. Restore alone preserves that preview
    // flag, leaving the cabinet looking like a permanent wireframe. Solid is
    // deliberately an opaque presentation mode for all renderable surfaces.
    material.transparent = false;
    material.opacity = 1;
    material.depthWrite = true;
    material.needsUpdate = true;
  };

  const applyOpeningMeshDisplay = (mesh: THREE.Mesh) => {
    if (mesh.name === "windowPick" || mesh.name === "doorPick") {
      return;
    }
    if (mesh.userData.viewDisplaySkipMaterialRestore) return;
    eachMaterial(mesh.material, (material) => {
      restoreMaterialDisplay(material);
      if (mode === "solid") {
        suppressRealisticMaterial(material);
      }
    });
  };

  const applyToMesh = (mesh: THREE.Mesh) => {
    eachMaterial(mesh.material, (material) => {
      // Never restore a wireframe flag from an authored or cached material.
      if (hasWireframe(material) && material.wireframe) {
        material.wireframe = false;
        material.needsUpdate = true;
      }
    });
    if (mesh.userData.kind === "window" || mesh.userData.kind === "door") {
      applyOpeningMeshDisplay(mesh);
      return;
    }
    if (mesh.userData.viewDisplaySkipEdges) {
      if (!mesh.userData.viewDisplaySkipMaterialRestore) {
        eachMaterial(mesh.material, restoreMaterialDisplay);
      }
      return;
    }
    eachMaterial(mesh.material, (material) => {
      // Capture the authored material before Solid normalizes temporary
      // preview transparency, so Realistic can still restore it exactly.
      if (mode === "solid") rememberMaterial(material);
      restoreMaterialDisplay(material);
      if (mode === "solid") {
        makeSolidSurfaceOpaque(material);
        suppressRealisticMaterial(material);
      }
    });
  };

  const sync = () => {
    scene.traverse((object) => {
      if (object instanceof THREE.Mesh) applyToMesh(object);
    });
  };

  return {
    getMode: () => mode,
    setMode(nextMode: ViewDisplayMode) {
      mode = resolveViewDisplayMode(nextMode);
      sync();
    },
    sync
  };
}
