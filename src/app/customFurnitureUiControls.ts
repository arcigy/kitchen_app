import * as THREE from "three";
import type { ClientCatalog, MaterialDefinition } from "../core/catalog/catalog-types";
import { createInputElement, createSelectElement } from "./propsPanelElements";

export function numberInput(value: number, onChange: (next: number) => void) {
  const input = createInputElement("number", String(Math.round(value)));
  input.addEventListener("change", () => {
    const next = Number(input.value);
    if (Number.isFinite(next)) onChange(next);
  });
  return input;
}

export function textInput(value: string, onChange: (next: string) => void) {
  const input = createInputElement("text", value);
  input.addEventListener("change", () => onChange(input.value.trim() || value));
  return input;
}

export function selectInput<T extends string>(
  value: T,
  options: Array<{ value: T; label: string }>,
  onChange: (next: T) => void
) {
  const select = createSelectElement(value, options);
  select.addEventListener("change", () => onChange(select.value as T));
  return select;
}

export function materialSelect(
  catalog: ClientCatalog,
  materialId: string,
  materialType: "board" | "edge",
  onChange: (next: string) => void
) {
  const options = catalog.materials
    .filter((material) => material.materialType === materialType && material.isActive)
    .sort((left, right) => left.displayName.localeCompare(right.displayName));
  const select = createSelectElement(
    options.some((material) => material.id === materialId) ? materialId : options[0]?.id ?? "",
    options.map((material) => ({ value: material.id, label: material.displayName }))
  );
  select.addEventListener("change", () => onChange(select.value));
  return select;
}

export function firstMaterial(catalog: ClientCatalog, materialType: "board" | "edge", fallback?: string) {
  if (fallback && catalog.materials.some((material) => material.id === fallback && material.materialType === materialType)) return fallback;
  return catalog.materials.find((material) => material.materialType === materialType && material.isActive)?.id ?? "";
}

export function materialFor(catalog: ClientCatalog, materialId: string, materialType: "board" | "edge"): MaterialDefinition | null {
  const material = catalog.materials.find((item) => item.id === materialId && item.materialType === materialType) ?? null;
  return material ?? catalog.materials.find((item) => item.materialType === materialType && item.isActive) ?? null;
}

export function makeMeshMaterial(catalog: ClientCatalog, materialId: string, selected: boolean) {
  const material = materialFor(catalog, materialId, "board");
  return new THREE.MeshStandardMaterial({
    color: material?.preview.colorHex ?? "#d8d4ca",
    roughness: material?.preview.roughness ?? 0.72,
    metalness: material?.preview.metalness ?? 0.02,
    emissive: selected ? new THREE.Color(0x5a4100) : new THREE.Color(0x000000),
    emissiveIntensity: selected ? 0.18 : 0
  });
}
