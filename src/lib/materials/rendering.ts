import * as THREE from "three";
import { findMaterialById, getMaterialRenderProfile } from "../../data/materials";
import { getPbrMaterial } from "../../materials/pbrMaterials";

export type MaterialDimensionsMm = {
  width: number;
  height: number;
  depth: number;
};

function makeSolidMaterial(hex: string, roughness = 0.85) {
  return new THREE.MeshStandardMaterial({
    color: new THREE.Color(hex),
    roughness: Math.max(0, Math.min(1, roughness)),
    metalness: 0.0
  });
}

function makeDvdMaterialSet(insideHex: string, outsideHex: string, roughnessInside = 0.78, roughnessOutside = 0.94) {
  const outside = makeSolidMaterial(outsideHex, roughnessOutside);
  const inside = makeSolidMaterial(insideHex, roughnessInside);
  return [outside, outside, outside, outside, inside, outside];
}

export function buildCatalogMaterialVisual(
  materialId: number,
  dimsMm?: Partial<MaterialDimensionsMm>
): THREE.Material | THREE.Material[] {
  const material = findMaterialById(materialId);
  const profile = getMaterialRenderProfile(materialId);

  if (profile?.kind === "oak_pbr") {
    const width = Math.max(1, dimsMm?.width ?? 2500);
    const height = Math.max(1, dimsMm?.height ?? 2500);
    return getPbrMaterial({
      fallbackColor: profile.fallbackColor,
      ref: { id: "wood_veneer_oak_7760_1k", rotationDeg: 0, tintStrength: profile.tintStrength ?? 0 },
      uvRepeat: {
        x: Math.max(0.0001, width / 2500),
        y: Math.max(0.0001, height / 2500)
      },
      normalScale: 0.75,
      envMapIntensity: 0.9
    });
  }

  if (profile?.kind === "dvd") {
    return makeDvdMaterialSet(
      profile.insideColor,
      profile.outsideColor,
      profile.roughnessInside,
      profile.roughnessOutside
    );
  }

  if (profile?.kind === "solid") {
    return makeSolidMaterial(profile.color, profile.roughness);
  }

  // Fallback keeps rendering stable even if the catalog grows before a profile is assigned.
  if (material?.type === "front") return makeSolidMaterial("#a98a72", 0.9);
  if (material?.type === "worktop" || material?.name.toLowerCase().includes("oak")) {
    return getPbrMaterial({
      fallbackColor: "#c49a6c",
      ref: { id: "wood_veneer_oak_7760_1k", rotationDeg: 0, tintStrength: 0 },
      uvRepeat: { x: 1, y: 1 },
      normalScale: 0.75,
      envMapIntensity: 0.9
    });
  }
  return makeSolidMaterial("#d9dee5", 0.86);
}
