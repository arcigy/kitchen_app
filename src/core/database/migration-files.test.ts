import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { REQUIRED_DATABASE_MIGRATION_VERSION } from "./migration-version";

describe("database migration files", () => {
  it("contains the required CapRover core migration", async () => {
    const sql = await readFile(path.join(process.cwd(), "db", "migrations", `${REQUIRED_DATABASE_MIGRATION_VERSION}.sql`), "utf-8");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS schema_migrations");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS arcigy_projects");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS arcigy_project_saves");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS arcigy_project_versions");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS arcigy_project_activity_events");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS arcigy_assets");
  });
});
