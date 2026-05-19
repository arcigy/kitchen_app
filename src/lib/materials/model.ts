import type { ClientCatalog } from "../../core/catalog/catalog-types";
import type { Material } from "../../types/material";

export type MaterialRole = "body" | "front" | "drawer";

type MaterialRecord = {
  bodyMaterialId?: number | null;
  frontMaterialId?: number | null;
  drawerMaterialId?: number | null;
  bodyKey?: string;
  frontKey?: string;
  drawerKey?: string;
  bodyName?: string;
  frontName?: string;
  drawerName?: string;
};

export type BoardMaterialPresetId = "DTD1" | "DTD2" | "DTD3" | "MDF" | "DVD" | "DTD16";

const legacyKeyToId = new Map<string, number | null>([
  ["1", 1],
  ["2", 2],
  ["3", 3],
  ["4", 4],
  ["5", 5],
  ["6", 6],
  ["7", 7],
  ["carcass_default", 2],
  ["front_default", 3],
  ["drawer_default", 5],
  ["drawer_unused", null],
  ["mat_white_melamine", 1],
  ["mat_oak_natural", 7],
  ["mat_grey_corpus", 2],
  ["mat_worktop_oak", 6]
]);

const legacyPresetIdToMaterialId = new Map<BoardMaterialPresetId, number | null>([
  ["DTD1", 7],
  ["DTD2", 1],
  ["DTD3", 2],
  ["MDF", 3],
  ["DVD", 4],
  ["DTD16", 5]
]);

function findMaterialById(catalog: Pick<ClientCatalog, "legacyMaterials">, id: number | null | undefined): Material | null {
  if (typeof id !== "number" || !Number.isFinite(id)) return null;
  return catalog.legacyMaterials.find((material) => material.id === id) ?? null;
}

function isBoardMaterialPresetId(value: unknown): value is BoardMaterialPresetId {
  return typeof value === "string" && legacyPresetIdToMaterialId.has(value as BoardMaterialPresetId);
}

const materialIdFieldByRole: Record<MaterialRole, keyof MaterialRecord> = {
  body: "bodyMaterialId",
  front: "frontMaterialId",
  drawer: "drawerMaterialId"
};

const legacyKeyFieldByRole: Record<MaterialRole, keyof MaterialRecord> = {
  body: "bodyKey",
  front: "frontKey",
  drawer: "drawerKey"
};

const legacyNameFieldByRole: Record<MaterialRole, keyof MaterialRecord> = {
  body: "bodyName",
  front: "frontName",
  drawer: "drawerName"
};

export function getMaterialRoleId(materials: MaterialRecord, role: MaterialRole): number | null {
  const field = materialIdFieldByRole[role];
  const value = materials[field];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function getMaterialIdField(role: MaterialRole): keyof MaterialRecord {
  return materialIdFieldByRole[role];
}

export function resolveMaterialIdFromUnknown(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
    const resolvedLegacyKeyId = legacyKeyToId.get(value) ?? null;
    if (resolvedLegacyKeyId !== null) return resolvedLegacyKeyId;
    if (isBoardMaterialPresetId(value)) return legacyPresetIdToMaterialId.get(value) ?? null;
  }
  return null;
}

export function ensureMaterialRoleSelection(materials: MaterialRecord, role: MaterialRole, catalog: Pick<ClientCatalog, "legacyMaterials">) {
  const clientCatalog = catalog;
  const idField = materialIdFieldByRole[role];
  const legacyKeyField = legacyKeyFieldByRole[role];
  const legacyNameField = legacyNameFieldByRole[role];
  const record = materials as Record<string, unknown>;
  const resolvedId = resolveMaterialIdFromUnknown(record[idField] ?? record[legacyKeyField] ?? null);
  record[idField] = resolvedId;

  const material = resolvedId === null ? null : findMaterialById(clientCatalog, resolvedId);
  if (!material) {
    if (resolvedId === null) {
      record[legacyKeyField] = role === "drawer" ? "drawer_unused" : "";
      record[legacyNameField] = "";
    }
    return resolvedId;
  }

  record[legacyKeyField] = String(material.id);
  record[legacyNameField] = material.name;
  return material.id;
}

export function setMaterialRoleSelection(materials: MaterialRecord, role: MaterialRole, materialId: number | null, catalog: Pick<ClientCatalog, "legacyMaterials">) {
  const clientCatalog = catalog;
  const idField = materialIdFieldByRole[role];
  const legacyKeyField = legacyKeyFieldByRole[role];
  const legacyNameField = legacyNameFieldByRole[role];
  const record = materials as Record<string, unknown>;
  record[idField] = materialId;

  if (materialId === null) {
    record[legacyKeyField] = role === "drawer" ? "drawer_unused" : "";
    record[legacyNameField] = "";
    return;
  }

  const material = findMaterialById(clientCatalog, materialId);
  if (!material) {
    record[legacyKeyField] = "";
    record[legacyNameField] = "";
    return;
  }

  record[legacyKeyField] = String(material.id);
  record[legacyNameField] = material.name;
}
