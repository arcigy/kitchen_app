import { describe, expect, it } from "vitest";
import { shouldUseDatabase } from "./serverRepositories";

describe("server repository database selection", () => {
  it("keeps explicit file storage on file repositories", () => {
    expect(shouldUseDatabase({ KITCHEN_PROJECT_STORAGE: "file" })).toBe(false);
  });

  it("fails explicit postgres storage without a database url", () => {
    expect(() => shouldUseDatabase({ KITCHEN_PROJECT_STORAGE: "postgres" })).toThrow(
      "DATABASE_URL, KITCHEN_PROJECT_DATABASE_URL, or complete POSTGRES_* env vars are required"
    );
  });

  it("uses postgres when storage and database config are both present", () => {
    expect(shouldUseDatabase({
      KITCHEN_PROJECT_STORAGE: "postgres",
      DATABASE_URL: "postgresql://kitchenapp:secret@srv-captain--kitchenapp-db:5432/kitchenapp",
      APP_ENV: "dev",
      DATABASE_SCHEMA: "dev"
    })).toBe(true);
  });
});
