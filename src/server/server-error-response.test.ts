import { describe, expect, it } from "vitest";
import {
  DATABASE_UNAVAILABLE_MESSAGE,
  INTERNAL_SERVER_ERROR_MESSAGE,
  databaseUnavailableStatus,
  publicServerErrorMessage
} from "./server-error-response";

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
});
