import { isTransientPostgresError } from "../core/database/postgres-error";
import { ProjectMaterialRevisionConflictError } from "../core/project-materials/project-material-errors";
import { ProjectMarginRevisionConflictError } from "../core/project-margins/project-margin-errors";
import { ProjectIdempotencyConflictError, ProjectSaveRevisionConflictError } from "../core/project/project-write-consistency";
import { RequestBodyTooLargeError } from "./request-json-body";

export const DATABASE_UNAVAILABLE_MESSAGE = "Database temporarily unavailable. Please retry.";
export const INTERNAL_SERVER_ERROR_MESSAGE = "Internal server error.";
export const MALFORMED_JSON_MESSAGE = "Malformed JSON request body.";

export function databaseUnavailableStatus(error: unknown): 503 | null {
  return isTransientPostgresError(error) ? 503 : null;
}

const FORBIDDEN_ERROR_MESSAGE_PATTERNS = [
  "Current session cannot access the requested client.",
  "Current session cannot access the requested client storage.",
  "Project does not belong to the current client.",
  "Phase does not belong to the requested project.",
  "Project ownership metadata is missing.",
  "Project ownership metadata is invalid.",
  "Unsupported storage bucket.",
  "bucket is required.",
  "fileName contains an unsafe path segment.",
  "fileName is required.",
  "Unexpected clientId in request body.",
  "Imported project belongs to a different client.",
  "Project save belongs to a different client.",
  "File path is outside current client storage."
] as const;

export function getServerErrorStatus(error: unknown): number {
  const unavailable = databaseUnavailableStatus(error);
  if (unavailable) return unavailable;
  if (error instanceof RequestBodyTooLargeError) return 413;
  if (error instanceof SyntaxError) return 400;
  if (!(error instanceof Error)) return 500;

  if (
    error instanceof ProjectMaterialRevisionConflictError ||
    error instanceof ProjectMarginRevisionConflictError ||
    error instanceof ProjectSaveRevisionConflictError ||
    error instanceof ProjectIdempotencyConflictError
  ) return 409;
  if (error.message === "Missing authenticated client session.") return 401;
  if (error.message === "Imported projectId already exists.") return 409;
  if (error.message.startsWith("Invalid FurnQuote module package:")) return 400;
  if (error.message === "Module import body is required.") return 400;
  if (error.message.endsWith(" is required.")) return 400;
  if (error.message.includes("Invalid storage URL")) return 400;
  if (error.message.includes("Expected JSON body")) return 400;
  if (FORBIDDEN_ERROR_MESSAGE_PATTERNS.some((messagePattern) => error.message.includes(messagePattern))) return 403;
  if (error.message === "Storage file not found.") return 404;
  if ("code" in error && (error as NodeJS.ErrnoException).code === "ENOENT") return 404;
  return 500;
}

export function publicServerErrorMessage(error: unknown, status: number): string {
  if (status === 503 && isTransientPostgresError(error)) return DATABASE_UNAVAILABLE_MESSAGE;
  if (status === 400 && error instanceof SyntaxError) return MALFORMED_JSON_MESSAGE;
  if (status >= 500) return INTERNAL_SERVER_ERROR_MESSAGE;
  return error instanceof Error ? error.message : String(error);
}

export function publicServerErrorDetails(error: unknown): Record<string, unknown> {
  if (error instanceof ProjectSaveRevisionConflictError) {
    return {
      code: "PROJECT_SAVE_REVISION_CONFLICT",
      expectedRevision: error.expectedRevision,
      currentRevision: error.actualRevision
    };
  }
  if (error instanceof ProjectIdempotencyConflictError) {
    return { code: "PROJECT_IDEMPOTENCY_CONFLICT" };
  }
  return {};
}
