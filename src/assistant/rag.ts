import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { Pool, type PoolClient } from "pg";
import {
  quotePgIdentifier,
  resolveDatabaseConfig,
  type ArcigyDatabaseConfig
} from "../core/database/database-config";
import { attachPostgresPoolErrorHandler } from "../core/database/postgres-pool-error-handler";
import type { ClientContext } from "../core/client/client-context";
import type { ClientCatalog } from "../core/catalog/catalog-types";
import type { AssistantRagChunk } from "./types";
import { buildPinoCatalogAssistantRagChunks, normalizePinoSearchText } from "./pinoModuleResolver";

export type AssistantRagIndex = {
  chunks: AssistantRagChunk[];
  persisted: boolean;
};

const RAG_TABLE = "assistant_rag_chunks";
const MAX_TRANSIENT_TENANT_INDEXES = 64;
const MAX_FILE_BYTES = 180_000;
const MAX_CHUNK_CHARS = 1500;
const SOURCE_GLOBS = [
  "AGENTS.md",
  "docs",
  "src/modules",
  "src/core/catalog",
  "src/core/module-package",
  "src/ui/chatbot",
  "src/app/assistantBridge.ts"
];

const poolCache = new Map<string, Pool>();
const transientCacheByClient = new Map<string, AssistantRagIndex>();

function getTransientIndex(clientId: string): AssistantRagIndex | null {
  const index = transientCacheByClient.get(clientId);
  if (!index) return null;
  transientCacheByClient.delete(clientId);
  transientCacheByClient.set(clientId, index);
  return index;
}

function setTransientIndex(clientId: string, index: AssistantRagIndex): void {
  transientCacheByClient.delete(clientId);
  transientCacheByClient.set(clientId, index);
  while (transientCacheByClient.size > MAX_TRANSIENT_TENANT_INDEXES) {
    const oldestClientId = transientCacheByClient.keys().next().value as string | undefined;
    if (!oldestClientId) break;
    transientCacheByClient.delete(oldestClientId);
  }
}

function getPool(connectionString: string, schema: string): Pool {
  const key = `${connectionString}#${schema}`;
  const existing = poolCache.get(key);
  if (existing) return existing;
  const pool = new Pool({ connectionString, max: 4, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5_000 });
  attachPostgresPoolErrorHandler(pool, "assistant-rag", schema);
  poolCache.set(key, pool);
  return pool;
}

async function ensureTable(pool: Pool, schema: string): Promise<void> {
  const client = await pool.connect();
  const qualifiedTable = `${quotePgIdentifier(schema)}.${quotePgIdentifier(RAG_TABLE)}`;
  try {
    await client.query(`CREATE SCHEMA IF NOT EXISTS ${quotePgIdentifier(schema)}`);
    await client.query(`
      CREATE TABLE IF NOT EXISTS ${qualifiedTable} (
        client_id text NOT NULL,
        chunk_id text NOT NULL,
        source text NOT NULL,
        title text NOT NULL,
        text text NOT NULL,
        tags jsonb NOT NULL DEFAULT '[]'::jsonb,
        updated_at timestamptz NOT NULL,
        PRIMARY KEY (client_id, chunk_id)
      )
    `);
  } finally {
    client.release();
  }
}

export async function replaceAssistantRagIndex(
  client: Pick<PoolClient, "query">,
  schema: string,
  ctx: ClientContext,
  index: AssistantRagIndex
): Promise<void> {
  const qualifiedTable = `${quotePgIdentifier(schema)}.${quotePgIdentifier(RAG_TABLE)}`;
  await client.query("BEGIN");
  try {
    await client.query(`DELETE FROM ${qualifiedTable} WHERE client_id = $1`, [ctx.clientId]);
    for (const chunk of index.chunks) {
      await client.query(
        `INSERT INTO ${qualifiedTable} (client_id, chunk_id, source, title, text, tags, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::timestamptz)`,
        [ctx.clientId, chunk.id, chunk.source, chunk.title, chunk.text, JSON.stringify(chunk.tags), chunk.updatedAt]
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function listFiles(root: string, target: string): Promise<string[]> {
  const full = path.join(root, target);
  if (!(await fileExists(full))) return [];
  const statFiles: string[] = [];
  const entries = await readdir(full, { withFileTypes: true }).catch(async () => []);
  if (entries.length === 0) return [full];
  for (const entry of entries) {
    const child = path.join(target, entry.name);
    if (entry.isDirectory()) {
      if (["node_modules", "dist", "coverage", ".git", "storage"].includes(entry.name)) continue;
      statFiles.push(...await listFiles(root, child));
    } else if (/\.(md|json|ts|tsx)$/i.test(entry.name)) {
      statFiles.push(path.join(root, child));
    }
  }
  return statFiles;
}

function cleanText(raw: string): string {
  return raw.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function titleFromSource(source: string, text: string): string {
  const heading = /^#\s+(.+)$/m.exec(text)?.[1]?.trim();
  return heading || path.basename(source);
}

function tagsFromSource(source: string): string[] {
  const normalized = source.replaceAll("\\", "/");
  const tags: string[] = [];
  if (normalized.includes("/modules/")) tags.push("modules");
  if (normalized.includes("/docs/")) tags.push("docs");
  if (normalized.includes("catalog")) tags.push("catalog");
  if (normalized.includes("chatbot") || normalized.includes("assistant")) tags.push("assistant");
  if (normalized.endsWith(".json")) tags.push("schema");
  return tags;
}

function chunkText(source: string, raw: string, updatedAt: string): AssistantRagChunk[] {
  const text = cleanText(raw).slice(0, MAX_FILE_BYTES);
  if (!text) return [];
  const chunks: AssistantRagChunk[] = [];
  const paragraphs = text.split(/\n\s*\n/g);
  let current = "";
  let index = 0;
  const flush = () => {
    const body = current.trim();
    if (!body) return;
    chunks.push({
      id: `${source.replace(/[^a-z0-9]+/gi, "_").slice(0, 120)}_${index++}`,
      source,
      title: titleFromSource(source, text),
      text: body,
      tags: tagsFromSource(source),
      updatedAt
    });
    current = "";
  };
  for (const paragraph of paragraphs) {
    if ((current + "\n\n" + paragraph).length > MAX_CHUNK_CHARS) flush();
    current = current ? `${current}\n\n${paragraph}` : paragraph;
  }
  flush();
  return chunks;
}

export async function buildAssistantRagIndex(
  projectRoot: string,
  catalog?: Pick<ClientCatalog, "clientId" | "modules" | "vendorCatalog" | "kitchenDefaults">
): Promise<AssistantRagIndex> {
  const updatedAt = new Date().toISOString();
  const files = (await Promise.all(SOURCE_GLOBS.map((source) => listFiles(projectRoot, source)))).flat();
  const chunks: AssistantRagChunk[] = [];
  for (const file of files) {
    const rel = path.relative(projectRoot, file).replaceAll("\\", "/");
    const raw = await readFile(file, "utf-8").catch(() => "");
    chunks.push(...chunkText(rel, raw, updatedAt));
  }
  if (catalog) chunks.push(...buildPinoCatalogAssistantRagChunks(catalog));
  return { chunks, persisted: false };
}

export async function reindexAssistantRag(
  projectRoot: string,
  ctx: ClientContext,
  catalog?: Pick<ClientCatalog, "clientId" | "modules" | "vendorCatalog" | "kitchenDefaults">
): Promise<AssistantRagIndex> {
  const index = await buildAssistantRagIndex(projectRoot, catalog);
  setTransientIndex(ctx.clientId, index);
  const config = resolveDatabaseConfig();
  if (!config) return index;
  const pool = getPool(config.connectionString, config.schema);
  await ensureTable(pool, config.schema);
  const client = await pool.connect();
  try {
    await replaceAssistantRagIndex(client, config.schema, ctx, index);
    return { chunks: index.chunks, persisted: true };
  } finally {
    client.release();
  }
}

async function loadPersistedIndex(
  ctx: ClientContext,
  config: ArcigyDatabaseConfig
): Promise<AssistantRagIndex | null> {
  const pool = getPool(config.connectionString, config.schema);
  await ensureTable(pool, config.schema);
  const client = await pool.connect();
  const qualifiedTable = `${quotePgIdentifier(config.schema)}.${quotePgIdentifier(RAG_TABLE)}`;
  try {
    const result = await client.query<{
      chunk_id: string;
      source: string;
      title: string;
      text: string;
      tags: unknown;
      updated_at: Date;
    }>(`SELECT chunk_id, source, title, text, tags, updated_at FROM ${qualifiedTable} WHERE client_id = $1`, [ctx.clientId]);
    if (result.rows.length === 0) return null;
    return {
      persisted: true,
      chunks: result.rows.map((row) => ({
        id: row.chunk_id,
        source: row.source,
        title: row.title,
        text: row.text,
        tags: Array.isArray(row.tags) ? row.tags.filter((tag): tag is string => typeof tag === "string") : [],
        updatedAt: row.updated_at.toISOString()
      }))
    };
  } finally {
    client.release();
  }
}

function scoreChunk(queryTokens: string[], chunk: AssistantRagChunk): number {
  const haystack = normalizePinoSearchText(`${chunk.title}\n${chunk.tags.join(" ")}\n${chunk.text}`);
  let score = 0;
  for (const token of queryTokens) {
    if (token.length < 3) continue;
    let index = haystack.indexOf(token);
    while (index >= 0) {
      score += token.length;
      index = haystack.indexOf(token, index + token.length);
    }
  }
  return score;
}

export async function searchAssistantRag(args: {
  projectRoot: string;
  ctx: ClientContext;
  query: string;
  limit?: number;
  catalog?: Pick<ClientCatalog, "clientId" | "modules" | "vendorCatalog" | "kitchenDefaults">;
}): Promise<AssistantRagChunk[]> {
  const config = resolveDatabaseConfig();
  const persisted = config ? await loadPersistedIndex(args.ctx, config).catch(() => null) : null;
  const baseIndex = persisted
    ?? getTransientIndex(args.ctx.clientId)
    ?? await buildAssistantRagIndex(args.projectRoot, args.catalog);
  const tenantChunks = args.catalog ? buildPinoCatalogAssistantRagChunks(args.catalog) : [];
  const seenChunkIds = new Set(baseIndex.chunks.map((chunk) => chunk.id));
  const index = tenantChunks.length === 0
    ? baseIndex
    : {
        persisted: baseIndex.persisted,
        chunks: [
          ...baseIndex.chunks,
          ...tenantChunks.filter((chunk) => !seenChunkIds.has(chunk.id))
        ]
      };
  setTransientIndex(args.ctx.clientId, index);
  const queryTokens = normalizePinoSearchText(args.query).split(/[^a-z0-9]+/iu).filter(Boolean);
  return [...index.chunks]
    .map((chunk) => ({ chunk, score: scoreChunk(queryTokens, chunk) }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, args.limit ?? 6)
    .map((item) => item.chunk);
}
