import type { CreateProjectInput, ProjectMetadata } from "./project-types";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function assertNonEmpty(value: unknown, message: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(message);
  return value.trim();
}

function assertString(value: unknown, message: string): void {
  if (typeof value !== "string") throw new Error(message);
}

function assertOptionalEmail(value: unknown): void {
  if (value === undefined || value === null || value === "") return;
  if (typeof value !== "string" || !EMAIL_RE.test(value.trim())) throw new Error("project contact email is invalid.");
}

export function assertValidCreateProjectInput(input: CreateProjectInput): void {
  assertNonEmpty(input.name, "project name is required.");
  assertOptionalEmail(input.contact?.email);
}

export function assertValidProjectMetadata(metadata: ProjectMetadata): void {
  assertNonEmpty(metadata.clientId, "project clientId is required.");
  assertNonEmpty(metadata.projectId, "projectId is required.");
  assertNonEmpty(metadata.name, "project name is required.");
  assertString(metadata.location?.address, "project location address must be a string.");
  assertString(metadata.contact?.name, "project contact name must be a string.");
  assertOptionalEmail(metadata.contact?.email);
  assertNonEmpty(metadata.activePhaseId, "activePhaseId is required.");
  if (!Array.isArray(metadata.phases) || !metadata.phases.includes(metadata.activePhaseId)) {
    throw new Error("activePhaseId must exist in project phases.");
  }
  if (!Array.isArray(metadata.phaseDetails) || !metadata.phaseDetails.some((phase) => phase.phaseId === metadata.activePhaseId)) {
    throw new Error("activePhaseId must exist in project phase details.");
  }
}
