import type { ProjectMetadata } from "../../core/project/project-types";
import type { ProjectSaveFile } from "../../core/project-save/project-save-types";

export const PROJECT_RECOVERY_SCHEMA_VERSION = 1 as const;

export type ProjectRecoveryScope = {
  clientId: string;
  userId: string;
  workspaceId: string;
  projectId: string | null;
};

export type ProjectRecoveryWorkspace = {
  kind: "blank" | "project";
  project: ProjectMetadata | null;
};

export type ProjectInteractionCheckpoint = {
  kind: "none" | "wall-draw" | "worktop-draw" | "section-draw" | "floor-edit" | "transform" | "custom-furniture";
  capturedAt: string;
  payload: unknown;
};

export type ProjectRecoveryWriter = {
  ownerId: string;
  fencingToken: number;
};

export type ProjectRecoveryEnvelopeV1 = {
  schemaVersion: typeof PROJECT_RECOVERY_SCHEMA_VERSION;
  appVersion: string | null;
  scope: ProjectRecoveryScope;
  baseServerRevision: number;
  sequence: number;
  writer?: ProjectRecoveryWriter;
  createdAt: string;
  updatedAt: string;
  appState: ProjectSaveFile["appState"];
  workspace: ProjectRecoveryWorkspace;
  interaction: ProjectInteractionCheckpoint | null;
  historyTail: unknown[];
};

export type ProjectRecoveryArchiveV1 = {
  archiveId: string;
  reason: "server-newer" | "revision-conflict" | "manual-copy";
  archivedAt: string;
  envelope: ProjectRecoveryEnvelopeV1;
};

export type LastWorkspacePointerV1 = {
  version: 1;
  clientId: string;
  userId: string;
  workspaceId: string;
  projectId: string | null;
  updatedAt: string;
};

export function projectRecoveryScopeKey(scope: ProjectRecoveryScope): string {
  return JSON.stringify([scope.clientId, scope.userId, scope.workspaceId, scope.projectId]);
}

export function projectRecoveryProjectKey(scope: Pick<ProjectRecoveryScope, "clientId" | "userId" | "projectId">): string {
  return JSON.stringify([scope.clientId, scope.userId, scope.projectId]);
}

export function isProjectRecoveryEnvelopeV1(value: unknown): value is ProjectRecoveryEnvelopeV1 {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const envelope = value as Partial<ProjectRecoveryEnvelopeV1>;
  const scope = envelope.scope as Partial<ProjectRecoveryScope> | undefined;
  const workspace = envelope.workspace as Partial<ProjectRecoveryWorkspace> | undefined;
  return (
    envelope.schemaVersion === PROJECT_RECOVERY_SCHEMA_VERSION &&
    (envelope.appVersion === null || typeof envelope.appVersion === "string") &&
    !!scope &&
    typeof scope.clientId === "string" && scope.clientId.length > 0 &&
    typeof scope.userId === "string" && scope.userId.length > 0 &&
    typeof scope.workspaceId === "string" && scope.workspaceId.length > 0 &&
    (scope.projectId === null || typeof scope.projectId === "string") &&
    Number.isSafeInteger(envelope.baseServerRevision) &&
    Number(envelope.baseServerRevision) >= 0 &&
    Number.isSafeInteger(envelope.sequence) &&
    Number(envelope.sequence) >= 0 &&
    (!envelope.writer || (
      typeof envelope.writer.ownerId === "string" &&
      envelope.writer.ownerId.length > 0 &&
      Number.isSafeInteger(envelope.writer.fencingToken) &&
      envelope.writer.fencingToken > 0
    )) &&
    typeof envelope.createdAt === "string" &&
    Number.isFinite(Date.parse(envelope.createdAt)) &&
    typeof envelope.updatedAt === "string" &&
    Number.isFinite(Date.parse(envelope.updatedAt)) &&
    !!envelope.appState &&
    typeof envelope.appState === "object" &&
    !!workspace &&
    (workspace.kind === "blank" || workspace.kind === "project") &&
    (workspace.project === null || typeof workspace.project === "object") &&
    (envelope.interaction === null || (
      !!envelope.interaction
      && typeof envelope.interaction === "object"
      && typeof envelope.interaction.capturedAt === "string"
      && Number.isFinite(Date.parse(envelope.interaction.capturedAt))
      && ["none", "wall-draw", "worktop-draw", "section-draw", "floor-edit", "transform", "custom-furniture"]
        .includes(envelope.interaction.kind)
    )) &&
    Array.isArray(envelope.historyTail)
  );
}
