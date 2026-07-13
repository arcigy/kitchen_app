import { describe, expect, it } from "vitest";
import { isTransientPostgresError } from "./postgres-error";

describe("isTransientPostgresError", () => {
  it("recognizes nested connection timeouts and PostgreSQL availability codes", () => {
    expect(isTransientPostgresError(new Error("Connection terminated due to connection timeout", {
      cause: Object.assign(new Error("Connection terminated unexpectedly"), { code: "ECONNRESET" })
    }))).toBe(true);
    expect(isTransientPostgresError(Object.assign(new Error("too many clients"), { code: "53300" }))).toBe(true);
  });

  it("does not classify validation and migration failures as transient", () => {
    expect(isTransientPostgresError(new Error("Database schema is missing migration 0004"))).toBe(false);
    expect(isTransientPostgresError(new Error("Invalid project payload"))).toBe(false);
  });
});
