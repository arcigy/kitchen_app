import { findMaterialById, findMaterialIdByLegacyKey, findMaterialIdByLegacyPresetId, isBoardMaterialPresetId } from "../../data/materials";

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
    const resolvedLegacyKeyId = findMaterialIdByLegacyKey(value);
    if (resolvedLegacyKeyId !== null) return resolvedLegacyKeyId;
    if (isBoardMaterialPresetId(value)) return findMaterialIdByLegacyPresetId(value);
  }
  return null;
}

export function ensureMaterialRoleSelection(materials: MaterialRecord, role: MaterialRole) {
  const idField = materialIdFieldByRole[role];
  const legacyKeyField = legacyKeyFieldByRole[role];
  const legacyNameField = legacyNameFieldByRole[role];
  const record = materials as Record<string, unknown>;
  const resolvedId = resolveMaterialIdFromUnknown(record[idField] ?? record[legacyKeyField] ?? null);
  record[idField] = resolvedId;

  const material = resolvedId === null ? null : findMaterialById(resolvedId);
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

export function setMaterialRoleSelection(materials: MaterialRecord, role: MaterialRole, materialId: number | null) {
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

  const material = findMaterialById(materialId);
  if (!material) {
    record[legacyKeyField] = "";
    record[legacyNameField] = "";
    return;
  }

  record[legacyKeyField] = String(material.id);
  record[legacyNameField] = material.name;
}
