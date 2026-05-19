import * as THREE from "three";
import type { ClientCatalog } from "../../core/catalog/catalog-types";
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

function findLegacyMaterial(catalog: Pick<ClientCatalog, "legacyMaterials">, materialId: number) {
  return catalog.legacyMaterials.find((material) => material.id === materialId) ?? null;
}

function getMaterialRenderProfile(materialId: number | null | undefined) {
  switch (materialId) {
    case 1:
      return { kind: "solid" as const, color: "#f6f6f6", roughness: 0.86 };
    case 2:
      return { kind: "solid" as const, color: "#d9dee5", roughness: 0.86 };
    case 3:
      return { kind: "solid" as const, color: "#a98a72", roughness: 0.9 };
    case 4:
      return { kind: "dvd" as const, insideColor: "#f4f4f4", outsideColor: "#bf8f62", roughnessInside: 0.78, roughnessOutside: 0.94 };
    case 5:
      return { kind: "solid" as const, color: "#d1d7e0", roughness: 0.88 };
    case 6:
      return { kind: "oak_pbr" as const, fallbackColor: "#b5885e", tintStrength: 0 };
    case 7:
      return { kind: "oak_pbr" as const, fallbackColor: "#c49a6c", tintStrength: 0 };
    default:
      return null;
  }
}

export function buildCatalogMaterialVisual(
  materialId: number,
  dimsMm: Partial<MaterialDimensionsMm> | undefined,
  catalog: Pick<ClientCatalog, "legacyMaterials">
): THREE.Material | THREE.Material[] {
  const material = findLegacyMaterial(catalog, materialId);
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
