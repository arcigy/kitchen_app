import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { REQUIRED_DATABASE_MIGRATION_VERSION } from "./migration-version";

describe("database migration files", () => {
  it("contains the core and required Supplier Bridge migrations", async () => {
    const coreSql = await readFile(path.join(process.cwd(), "db", "migrations", "0001_core.sql"), "utf-8");
    expect(coreSql).toContain("CREATE TABLE IF NOT EXISTS schema_migrations");
    expect(coreSql).toContain("CREATE TABLE IF NOT EXISTS arcigy_projects");
    expect(coreSql).toContain("CREATE TABLE IF NOT EXISTS arcigy_project_saves");
    expect(coreSql).toContain("CREATE TABLE IF NOT EXISTS arcigy_project_versions");
    expect(coreSql).toContain("CREATE TABLE IF NOT EXISTS arcigy_project_activity_events");
    expect(coreSql).toContain("CREATE TABLE IF NOT EXISTS arcigy_assets");

    const supplierSql = await readFile(path.join(process.cwd(), "db", "migrations", "0002_supplier_bridge.sql"), "utf-8");
    expect(supplierSql).toContain("CREATE TABLE IF NOT EXISTS arcigy_supplier_sync_sessions");
    expect(supplierSql).toContain("CREATE TABLE IF NOT EXISTS arcigy_supplier_sync_items");
    expect(supplierSql).toContain("CREATE TABLE IF NOT EXISTS arcigy_supplier_product_candidates");
    expect(supplierSql).toContain("CREATE TABLE IF NOT EXISTS arcigy_supplier_price_observations");
    expect(supplierSql).toContain("CREATE TABLE IF NOT EXISTS arcigy_material_supplier_mappings");
    expect(supplierSql).toContain("CREATE TABLE IF NOT EXISTS arcigy_supplier_bridge_tokens");

    const exactCatalogSql = await readFile(path.join(process.cwd(), "db", "migrations", "0003_supplier_exact_catalog.sql"), "utf-8");
    expect(exactCatalogSql).toContain("CREATE TABLE IF NOT EXISTS arcigy_supplier_catalog_items");
    expect(exactCatalogSql).toContain("CREATE TABLE IF NOT EXISTS arcigy_material_supplier_assignments");

    const clientSuppliersSql = await readFile(path.join(process.cwd(), "db", "migrations", `${REQUIRED_DATABASE_MIGRATION_VERSION}.sql`), "utf-8");
    expect(clientSuppliersSql).toContain("CREATE TABLE IF NOT EXISTS arcigy_suppliers");
    expect(clientSuppliersSql).toContain("CREATE TABLE IF NOT EXISTS arcigy_client_suppliers");
    expect(clientSuppliersSql).toContain("PRIMARY KEY (client_id, supplier_id)");
  });
});
