import { isTransientPostgresError } from "../core/database/postgres-error";

export const DATABASE_UNAVAILABLE_MESSAGE = "Database temporarily unavailable. Please retry.";
export const INTERNAL_SERVER_ERROR_MESSAGE = "Internal server error.";

export function databaseUnavailableStatus(error: unknown): 503 | null {
  return isTransientPostgresError(error) ? 503 : null;
}

export function publicServerErrorMessage(error: unknown, status: number): string {
  if (status === 503 && isTransientPostgresError(error)) return DATABASE_UNAVAILABLE_MESSAGE;
  if (status >= 500) return INTERNAL_SERVER_ERROR_MESSAGE;
  return error instanceof Error ? error.message : String(error);
}
