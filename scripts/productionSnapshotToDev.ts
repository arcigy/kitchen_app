import type { Client } from "pg";

type Queryable = Pick<Client, "query">;

type RelationRow = { table_name: string };
type ForeignKeyRow = { child_table: string; parent_table: string; parent_schema: string };
type TableFingerprint = { count: string; digest: string };

export type ProductionSnapshotResult = {
  copiedTables: Array<{ table: string; rows: number }>;
  skippedTables: string[];
};

const SOURCE_SCHEMA = "prod";
const TARGET_SCHEMA = "dev";
const SKIPPED_TABLES = new Set(["schema_migrations", "arcigy_auth_sessions"]);
const IDENTIFIER = /^[a-z_][a-z0-9_]*$/;

function quoteIdentifier(value: string): string {
  if (!IDENTIFIER.test(value)) throw new Error("Unsafe database identifier.");
  return `"${value}"`;
}

export function assertProductionSnapshotTarget(sourceSchema: string, targetSchema: string): void {
  if (sourceSchema !== SOURCE_SCHEMA || targetSchema !== TARGET_SCHEMA) {
    throw new Error("Production snapshot is limited to prod -> dev.");
  }
}

export function orderTablesByForeignKey(
  tables: readonly string[],
  foreignKeys: readonly Pick<ForeignKeyRow, "child_table" | "parent_table">[]
): string[] {
  const tableSet = new Set(tables);
  const dependencies = new Map(tables.map((table) => [table, new Set<string>()]));
  for (const { child_table: child, parent_table: parent } of foreignKeys) {
    if (!tableSet.has(child) || !tableSet.has(parent) || child === parent) continue;
    dependencies.get(child)!.add(parent);
  }

  const ordered: string[] = [];
  const ready = [...tables].filter((table) => dependencies.get(table)!.size === 0).sort();
  while (ready.length > 0) {
    const table = ready.shift()!;
    ordered.push(table);
    for (const [child, parents] of dependencies) {
      if (!parents.delete(table) || parents.size !== 0 || ordered.includes(child) || ready.includes(child)) continue;
      ready.push(child);
      ready.sort();
    }
  }
  if (ordered.length !== tables.length) throw new Error("Production snapshot found a cyclic foreign-key dependency.");
  return ordered;
}

async function listTables(client: Queryable, schema: string): Promise<string[]> {
  const result = await client.query<RelationRow>(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = $1 AND table_type = 'BASE TABLE'
    ORDER BY table_name
  `, [schema]);
  return result.rows.map((row) => row.table_name);
}

async function foreignKeys(client: Queryable, schema: string): Promise<ForeignKeyRow[]> {
  const result = await client.query<ForeignKeyRow>(`
    SELECT child.relname AS child_table, parent.relname AS parent_table, parent_namespace.nspname AS parent_schema
    FROM pg_constraint fk_constraint
    JOIN pg_class child ON child.oid = fk_constraint.conrelid
    JOIN pg_namespace child_namespace ON child_namespace.oid = child.relnamespace
    JOIN pg_class parent ON parent.oid = fk_constraint.confrelid
    JOIN pg_namespace parent_namespace ON parent_namespace.oid = parent.relnamespace
    WHERE fk_constraint.contype = 'f' AND child_namespace.nspname = $1
    ORDER BY child.relname, parent.relname
  `, [schema]);
  return result.rows;
}

async function assertNoExternalReferences(client: Queryable, schema: string): Promise<void> {
  const result = await client.query<{ child_schema: string; child_table: string; parent_table: string }>(`
    SELECT child_namespace.nspname AS child_schema, child.relname AS child_table, parent.relname AS parent_table
    FROM pg_constraint fk_constraint
    JOIN pg_class child ON child.oid = fk_constraint.conrelid
    JOIN pg_namespace child_namespace ON child_namespace.oid = child.relnamespace
    JOIN pg_class parent ON parent.oid = fk_constraint.confrelid
    JOIN pg_namespace parent_namespace ON parent_namespace.oid = parent.relnamespace
    WHERE fk_constraint.contype = 'f' AND parent_namespace.nspname = $1 AND child_namespace.nspname <> $1
  `, [schema]);
  if (result.rows.length > 0) throw new Error("Production snapshot refuses tables referenced from another schema.");
}

async function assertMatchingTableShapes(client: Queryable, sourceTables: readonly string[], targetTables: readonly string[]): Promise<void> {
  if (sourceTables.join("\n") !== targetTables.join("\n")) {
    throw new Error("Production snapshot requires matching prod and dev table sets after migration.");
  }
  for (const table of sourceTables) {
    const result = await client.query<{ source_column: string; target_column: string; source_type: string; target_type: string }>(`
      WITH source AS (
        SELECT ordinal_position, column_name, udt_schema || '.' || udt_name AS column_type
        FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = $3
      ), target AS (
        SELECT ordinal_position, column_name, udt_schema || '.' || udt_name AS column_type
        FROM information_schema.columns
        WHERE table_schema = $2 AND table_name = $3
      )
      SELECT source.column_name AS source_column, target.column_name AS target_column,
        source.column_type AS source_type, target.column_type AS target_type
      FROM source
      FULL OUTER JOIN target ON target.ordinal_position = source.ordinal_position
      ORDER BY COALESCE(source.ordinal_position, target.ordinal_position)
    `, [SOURCE_SCHEMA, TARGET_SCHEMA, table]);
    const mismatches = result.rows.filter((row) => row.source_column !== row.target_column || row.source_type !== row.target_type);
    if (mismatches.length > 0) {
      const details = mismatches
        .map((row) => `${row.source_column ?? "missing"}:${row.source_type ?? "missing"} != ${row.target_column ?? "missing"}:${row.target_type ?? "missing"}`)
        .join(", ");
      throw new Error(`Production snapshot found a column mismatch for ${table}: ${details}.`);
    }
  }
}

async function tableFingerprint(client: Queryable, schema: string, table: string): Promise<TableFingerprint> {
  const relation = `${quoteIdentifier(schema)}.${quoteIdentifier(table)}`;
  const result = await client.query<TableFingerprint>(`
    SELECT count(*)::text AS count,
      md5(COALESCE(string_agg(md5(to_jsonb(snapshot_row)::text), '' ORDER BY md5(to_jsonb(snapshot_row)::text)), '')) AS digest
    FROM ${relation} AS snapshot_row
  `);
  const fingerprint = result.rows[0];
  if (!fingerprint) throw new Error(`Production snapshot could not fingerprint ${schema}.${table}.`);
  return fingerprint;
}

export async function snapshotProductionToDev(client: Queryable): Promise<ProductionSnapshotResult> {
  assertProductionSnapshotTarget(SOURCE_SCHEMA, TARGET_SCHEMA);
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ");
  try {
    await client.query("SET LOCAL lock_timeout = '5s'");
    await client.query("SET LOCAL statement_timeout = '120s'");
    await client.query("SELECT pg_advisory_xact_lock(hashtext('arcigy-prod-to-dev-snapshot-v1'))");

    const sourceTables = await listTables(client, SOURCE_SCHEMA);
    const targetTables = await listTables(client, TARGET_SCHEMA);
    const sourceForeignKeys = await foreignKeys(client, SOURCE_SCHEMA);
    const targetForeignKeys = await foreignKeys(client, TARGET_SCHEMA);
    await assertMatchingTableShapes(client, sourceTables, targetTables);
    if (sourceForeignKeys.some((key) => key.parent_schema !== SOURCE_SCHEMA)
      || targetForeignKeys.some((key) => key.parent_schema !== TARGET_SCHEMA)) {
      throw new Error("Production snapshot refuses cross-schema foreign keys.");
    }
    await assertNoExternalReferences(client, TARGET_SCHEMA);

    const copiedTables = sourceTables.filter((table) => !SKIPPED_TABLES.has(table));
    const copyOrder = orderTablesByForeignKey(copiedTables, sourceForeignKeys);
    const targetRelationList = sourceTables
      .filter((table) => table !== "schema_migrations")
      .map((table) => `${quoteIdentifier(TARGET_SCHEMA)}.${quoteIdentifier(table)}`)
      .join(", ");
    await client.query(`TRUNCATE TABLE ${targetRelationList} RESTART IDENTITY`);

    const copied: Array<{ table: string; rows: number }> = [];
    for (const table of copyOrder) {
      const relation = `${quoteIdentifier(table)}`;
      const inserted = await client.query(
        `INSERT INTO ${quoteIdentifier(TARGET_SCHEMA)}.${relation} SELECT * FROM ${quoteIdentifier(SOURCE_SCHEMA)}.${relation}`
      );
      const sourceFingerprint = await tableFingerprint(client, SOURCE_SCHEMA, table);
      const targetFingerprint = await tableFingerprint(client, TARGET_SCHEMA, table);
      if (sourceFingerprint.count !== targetFingerprint.count || sourceFingerprint.digest !== targetFingerprint.digest) {
        throw new Error(`Production snapshot verification mismatch for ${table}.`);
      }
      copied.push({ table, rows: inserted.rowCount ?? 0 });
    }
    await client.query("COMMIT");
    return { copiedTables: copied, skippedTables: [...SKIPPED_TABLES].sort() };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}
