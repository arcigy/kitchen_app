import * as THREE from "three";

const neutralModuleColor = 0xd8dbe0;

function makeNeutralMaterial(source: THREE.Material) {
  const material = new THREE.MeshStandardMaterial({
    color: neutralModuleColor,
    roughness: 0.78,
    metalness: 0.02,
    transparent: source.transparent,
    opacity: source.opacity,
    side: source.side
  });
  material.name = "unassignedModuleMaterial";
  material.userData.materialUnassigned = true;
  return material;
}

function clearMaterialMetadata(mesh: THREE.Mesh) {
  delete mesh.userData.catalogMaterialId;
  delete mesh.userData.catalogMaterialName;
  delete mesh.userData.materialRequest;
  delete mesh.userData.renderColorHex;
  mesh.userData.materialUnassigned = true;
}

function ensureEditableTags(mesh: THREE.Mesh) {
  const current = mesh.userData.tags;
  if (Array.isArray(current) && current.some((tag) => typeof tag === "string")) return;

  const group = typeof mesh.userData.materialGroup === "string" ? mesh.userData.materialGroup : "";
  if (!group) return;
  mesh.userData.tags = group === "hardware" || group === "appliance"
    ? [group]
    : ["module", group];
}

export function applyUnassignedModuleMaterials(root: THREE.Object3D) {
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    clearMaterialMetadata(object);
    ensureEditableTags(object);
    object.material = Array.isArray(object.material)
      ? object.material.map((material) => makeNeutralMaterial(material))
      : makeNeutralMaterial(object.material);
  });
}
