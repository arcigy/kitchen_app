import * as THREE from "three";
import type { ClientCatalog, MaterialDefinition } from "../core/catalog/catalog-types";

export function numberInput(value: number, onChange: (next: number) => void) {
  const input = document.createElement("input");
  input.type = "number";
  input.value = String(Math.round(value));
  input.addEventListener("change", () => {
    const next = Number(input.value);
    if (Number.isFinite(next)) onChange(next);
  });
  return input;
}

export function textInput(value: string, onChange: (next: string) => void) {
  const input = document.createElement("input");
  input.type = "text";
  input.value = value;
  input.addEventListener("change", () => onChange(input.value.trim() || value));
  return input;
}

export function selectInput<T extends string>(
  value: T,
  options: Array<{ value: T; label: string }>,
  onChange: (next: T) => void
) {
  const select = document.createElement("select");
  for (const option of options) {
    const item = document.createElement("option");
    item.value = option.value;
    item.textContent = option.label;
    select.appendChild(item);
  }
  select.value = value;
  select.addEventListener("change", () => onChange(select.value as T));
  return select;
}

export function materialSelect(
  catalog: ClientCatalog,
  materialId: string,
  materialType: "board" | "edge",
  onChange: (next: string) => void
) {
  const select = document.createElement("select");
  const options = catalog.materials
    .filter((material) => material.materialType === materialType && material.isActive)
    .sort((left, right) => left.displayName.localeCompare(right.displayName));
  for (const material of options) {
    const option = document.createElement("option");
    option.value = material.id;
    option.textContent = material.displayName;
    select.appendChild(option);
  }
  select.value = options.some((material) => material.id === materialId) ? materialId : options[0]?.id ?? "";
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
