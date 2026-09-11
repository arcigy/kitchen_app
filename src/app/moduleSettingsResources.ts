import * as THREE from "three";

/** Builders can share cached materials/textures with the project. Own only clones. */
export function ownModulePreviewResources(root: THREE.Group): () => void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Map<THREE.Material, THREE.Material>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points)) return;
    object.geometry = object.geometry.clone();
    geometries.add(object.geometry);
    const cloneMaterial = (source: THREE.Material) => {
      let owned = materials.get(source);
      if (!owned) { owned = source.clone(); materials.set(source, owned); }
      return owned;
    };
    object.material = Array.isArray(object.material) ? object.material.map(cloneMaterial) : cloneMaterial(object.material);
  });
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => material.dispose());
    root.removeFromParent();
  };
}
