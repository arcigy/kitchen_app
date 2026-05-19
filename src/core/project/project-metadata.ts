import type { ClientContext } from "../client/client-context";
import { sanitizeStorageId } from "../storage/storage-types";
import type { CreateProjectInput, ProjectMetadata, ProjectPhaseMetadata } from "./project-types";

function nowIso(): string {
  return new Date().toISOString();
}

function slugPart(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 36);
  return normalized || "project";
}

export function createProjectId(name: string, at = Date.now()): string {
  return sanitizeStorageId(`${slugPart(name)}_${at.toString(36)}`, "projectId");
}

export function createDefaultPhaseMetadata(createdAt = nowIso()): ProjectPhaseMetadata {
  return {
    phaseId: "phase_1",
    phaseName: "Fáza 1",
    phaseNumber: 1,
    status: "draft",
    createdAt,
    updatedAt: createdAt
  };
}

export function createProjectMetadata(ctx: ClientContext, input: CreateProjectInput, projectId = createProjectId(input.name)): ProjectMetadata {
  const createdAt = nowIso();
  const phase = createDefaultPhaseMetadata(createdAt);
  return {
    version: 1,
    clientId: sanitizeStorageId(ctx.clientId, "clientId"),
    projectId,
    name: input.name.trim(),
    location: {
      ...input.location,
      address: input.location.address.trim()
    },
    contact: {
      ...input.contact,
      name: input.contact.name.trim()
    },
    status: "draft",
    createdAt,
    updatedAt: createdAt,
    createdByUserId: ctx.userId,
    updatedByUserId: ctx.userId,
    activePhaseId: phase.phaseId,
    phases: [phase.phaseId],
    phaseDetails: [phase]
  };
}
