import { describe, expect, it } from "vitest";
import {
  DATABASE_UNAVAILABLE_MESSAGE,
  INTERNAL_SERVER_ERROR_MESSAGE,
  databaseUnavailableStatus,
  getServerErrorStatus,
  publicServerErrorMessage
} from "./server-error-response";
import { RequestBodyTooLargeError } from "./request-json-body";

describe("server database error responses", () => {
  it("maps connection failures to a retryable sanitized response", () => {
    const error = new Error("Connection terminated due to connection timeout");
    expect(databaseUnavailableStatus(error)).toBe(503);
    expect(publicServerErrorMessage(error, 503)).toBe(DATABASE_UNAVAILABLE_MESSAGE);
  });

  it("leaves non-database errors to the owning route mapping", () => {
    const error = new Error("Invalid request");
    expect(databaseUnavailableStatus(error)).toBeNull();
    expect(publicServerErrorMessage(error, 400)).toBe("Invalid request");
  });

  it("does not expose internal server errors to clients", () => {
    expect(publicServerErrorMessage(new Error("password=secret host=private-db"), 500)).toBe(
      INTERNAL_SERVER_ERROR_MESSAGE
    );
  });

  it.each([
    [new Error("Expected JSON body."), 400],
    [new Error("Invalid storage URL."), 400],
    [new Error("Missing authenticated client session."), 401],
    [new Error("Project does not belong to the current client."), 403],
    [new Error("Storage file not found."), 404],
    [new RequestBodyTooLargeError(1024), 413],
    [new Error("Connection terminated due to connection timeout"), 503],
    [new Error("unexpected internal detail"), 500]
  ])("maps %s to HTTP %i consistently for every worker entrypoint", (error, expectedStatus) => {
    expect(getServerErrorStatus(error)).toBe(expectedStatus);
  });
});
