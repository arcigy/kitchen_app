import {
  isComponentAllowedForCategory,
  isMaterialAllowedForCategory
} from "./project-material-business";
import type {
  MaterialAssignmentCategory,
  ProjectMaterialAssignment,
  ProjectMaterialScopeItem
} from "./project-material-types";
import { projectMaterialScopeAssignmentId } from "./project-material-assignment-resolution";

export type ProjectMaterialCopyCandidate = {
  key: string;
  displayName: string;
  searchLabel: string;
  catalogCode: string;
  assignment: ProjectMaterialAssignment;
};

export type ProjectMaterialCandidateResolution =
  | { ok: true; candidate: ProjectMaterialCopyCandidate }
  | { ok: false; reason: "empty" | "not_found" | "ambiguous" };

function assignmentDefinition(assignment: ProjectMaterialAssignment) {
  return assignment.kind === "material"
    ? assignment.snapshots.material?.definition ?? null
    : assignment.snapshots.component?.definition ?? null;
}

function assignmentCatalogId(assignment: ProjectMaterialAssignment): string {
  return assignment.kind === "material" ? assignment.materialId ?? "" : assignment.componentId ?? "";
}

function assignmentCatalogCode(assignment: ProjectMaterialAssignment): string {
  const definition = assignmentDefinition(assignment);
  if (!definition) return assignmentCatalogId(assignment);
  return definition.entityType === "material"
    ? definition.materialCode ?? definition.supplierSource?.supplierProductId ?? definition.id
    : definition.componentCode ?? definition.supplierSource?.supplierProductId ?? definition.id;
}

function compatibleWithCategory(
  assignment: ProjectMaterialAssignment,
  category: MaterialAssignmentCategory
): boolean {
  const definition = assignmentDefinition(assignment);
  if (!definition || !definition.isActive) return false;
  return definition.entityType === "material"
    ? isMaterialAllowedForCategory(definition, category)
    : isComponentAllowedForCategory(definition, category);
}

function normalizeSearchValue(value: string): string {
  return value.trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

export function collectProjectMaterialCopyCandidates(
  assignments: readonly ProjectMaterialAssignment[],
  category: MaterialAssignmentCategory
): ProjectMaterialCopyCandidate[] {
  const newestFirst = [...assignments].sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  const unique = new Map<string, Omit<ProjectMaterialCopyCandidate, "searchLabel">>();
  for (const assignment of newestFirst) {
    if (!compatibleWithCategory(assignment, category)) continue;
    const definition = assignmentDefinition(assignment);
    const catalogId = assignmentCatalogId(assignment);
    if (!definition || !catalogId) continue;
    const key = `${assignment.kind}:${catalogId}`;
    if (unique.has(key)) continue;
    unique.set(key, {
      key,
      displayName: definition.displayName || definition.name || catalogId,
      catalogCode: assignmentCatalogCode(assignment),
      assignment: structuredClone(assignment)
    });
  }

  const nameCounts = new Map<string, number>();
  for (const candidate of unique.values()) {
    const normalized = normalizeSearchValue(candidate.displayName);
    nameCounts.set(normalized, (nameCounts.get(normalized) ?? 0) + 1);
  }

  return [...unique.values()]
    .map((candidate) => ({
      ...candidate,
      searchLabel: (nameCounts.get(normalizeSearchValue(candidate.displayName)) ?? 0) > 1
        ? `${candidate.displayName} · ${candidate.catalogCode}`
        : candidate.displayName
    }))
    .sort((left, right) => left.searchLabel.localeCompare(right.searchLabel));
}

export function resolveProjectMaterialCopyCandidate(
  candidates: readonly ProjectMaterialCopyCandidate[],
  value: string
): ProjectMaterialCandidateResolution {
  const normalized = normalizeSearchValue(value);
  if (!normalized) return { ok: false, reason: "empty" };
  const exactLabels = candidates.filter((candidate) => normalizeSearchValue(candidate.searchLabel) === normalized);
  if (exactLabels.length === 1) return { ok: true, candidate: exactLabels[0]! };
  if (exactLabels.length > 1) return { ok: false, reason: "ambiguous" };
  const exactNames = candidates.filter((candidate) => normalizeSearchValue(candidate.displayName) === normalized);
  if (exactNames.length === 1) return { ok: true, candidate: exactNames[0]! };
  if (exactNames.length > 1) return { ok: false, reason: "ambiguous" };
  return { ok: false, reason: "not_found" };
}

export function copyProjectMaterialAssignmentToScope(
  source: ProjectMaterialAssignment,
  scopeId: string,
  item: Pick<ProjectMaterialScopeItem, "id" | "category" | "variantKey">,
  updatedAt: string
): ProjectMaterialAssignment {
  const copied = structuredClone(source);
  return {
    ...copied,
    assignmentId: projectMaterialScopeAssignmentId(scopeId, item),
    category: item.category,
    ...(item.variantKey ? { variantKey: item.variantKey } : {}),
    source: "user",
    updatedAt
  };
}
