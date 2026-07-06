import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { attachPostgresPoolErrorHandler } from "./postgres-pool-error-handler";

describe("postgres pool error handler", () => {
  it("handles idle client errors instead of leaving the pool without an error listener", () => {
    const pool = new EventEmitter();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      attachPostgresPoolErrorHandler(pool as never, "project-db", "dev");
      expect(pool.listenerCount("error")).toBe(1);
      pool.emit("error", new Error("Connection terminated unexpectedly"));
      expect(warn).toHaveBeenCalledWith('[project-db] idle client error in schema "dev": Connection terminated unexpectedly');
    } finally {
      warn.mockRestore();
    }
  });
});
