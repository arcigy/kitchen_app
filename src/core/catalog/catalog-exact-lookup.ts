import type { ClientContext } from "../client/client-context";
import type { ClientCatalogRepository } from "./catalog-repository";
import type { ComponentDefinition, MaterialDefinition } from "./catalog-types";

export type MaterialExactLookupResult = {
  material: MaterialDefinition | null;
  unitPrice: number | null;
};

export type ComponentExactLookupResult = {
  component: ComponentDefinition | null;
  unitPrice: number | null;
};

type CachedLookupResult =
  | { kind: "material"; value: MaterialExactLookupResult }
  | { kind: "component"; value: ComponentExactLookupResult };

type CacheEntry = {
  clientId: string;
  expiresAt: number;
  result: CachedLookupResult;
};

type CacheGeneration = {
  global: number;
  client: number;
};

const registeredCaches = new Set<CatalogExactLookupCache>();

export type CatalogExactLookupCacheOptions = {
  maxEntries?: number;
  ttlMs?: number;
  missingTtlMs?: number;
  now?: () => number;
};

export class CatalogExactLookupCache {
  private readonly entries = new Map<string, CacheEntry>();
  private readonly clientGenerations = new Map<string, number>();
  private readonly maxEntries: number;
  private readonly ttlMs: number;
  private readonly missingTtlMs: number;
  private readonly now: () => number;
  private globalGeneration = 0;
  private disposed = false;

  constructor(options: CatalogExactLookupCacheOptions = {}) {
    this.maxEntries = Math.max(1, Math.floor(options.maxEntries ?? 1_000));
    this.ttlMs = Math.max(1, Math.floor(options.ttlMs ?? 5 * 60_000));
    this.missingTtlMs = Math.max(1, Math.floor(options.missingTtlMs ?? 30_000));
    this.now = options.now ?? Date.now;
    registeredCaches.add(this);
  }

  get(clientId: string, kind: CachedLookupResult["kind"], code: string): CachedLookupResult | undefined {
    if (this.disposed) return undefined;
    const key = cacheKey(clientId, kind, code);
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(key);
      return undefined;
    }

    this.entries.delete(key);
    this.entries.set(key, entry);
    return structuredClone(entry.result);
  }

  set(clientId: string, kind: CachedLookupResult["kind"], code: string, result: CachedLookupResult): void {
    if (this.disposed) return;
    const key = cacheKey(clientId, kind, code);
    const missing = result.kind === "material" ? result.value.material === null : result.value.component === null;
    const ttl = missing ? this.missingTtlMs : this.ttlMs;
    this.entries.delete(key);
    this.entries.set(key, {
      clientId,
      expiresAt: this.now() + ttl,
      result: structuredClone(result)
    });

    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value as string | undefined;
      if (!oldest) break;
      this.entries.delete(oldest);
    }
  }

  captureGeneration(clientId: string): CacheGeneration {
    if (this.disposed) return { global: Number.NaN, client: Number.NaN };
    return {
      global: this.globalGeneration,
      client: this.clientGenerations.get(clientId) ?? 0
    };
  }

  isGenerationCurrent(clientId: string, generation: CacheGeneration): boolean {
    if (this.disposed) return false;
    return generation.global === this.globalGeneration
      && generation.client === (this.clientGenerations.get(clientId) ?? 0);
  }

  invalidateClient(clientId: string): void {
    if (this.disposed) return;
    this.clientGenerations.set(clientId, (this.clientGenerations.get(clientId) ?? 0) + 1);
    for (const [key, entry] of this.entries) {
      if (entry.clientId === clientId) this.entries.delete(key);
    }
  }

  clear(): void {
    this.globalGeneration += 1;
    this.clientGenerations.clear();
    this.entries.clear();
  }

  dispose(): void {
    if (this.disposed) return;
    this.clear();
    this.disposed = true;
    registeredCaches.delete(this);
  }

  get size(): number {
    return this.entries.size;
  }
}

export function invalidateCatalogExactLookupCaches(clientId: string): void {
  for (const cache of registeredCaches) cache.invalidateClient(clientId);
}

function cacheKey(clientId: string, kind: CachedLookupResult["kind"], code: string): string {
  return `${clientId}\u0000${kind}\u0000${code}`;
}

function normalizeCode(code: string): string {
  const normalized = code.trim();
  if (!normalized) throw new Error("id is required.");
  return normalized;
}

export function createCatalogExactLookupService(args: {
  repository: ClientCatalogRepository;
  cache: CatalogExactLookupCache;
}) {
  return {
    async lookupMaterial(ctx: ClientContext, code: string): Promise<MaterialExactLookupResult> {
      const normalizedCode = normalizeCode(code);
      const cached = args.cache.get(ctx.clientId, "material", normalizedCode);
      if (cached?.kind === "material") return cached.value;

      for (let attempt = 0; attempt < 3; attempt += 1) {
        const generation = args.cache.captureGeneration(ctx.clientId);
        const material = await args.repository.getMaterialByCode(ctx, normalizedCode);
        const value: MaterialExactLookupResult = {
          material,
          unitPrice: material ? await args.repository.getPrice(ctx, material.id) : null
        };
        if (!args.cache.isGenerationCurrent(ctx.clientId, generation)) continue;
        args.cache.set(ctx.clientId, "material", normalizedCode, { kind: "material", value });
        return structuredClone(value);
      }
      throw new Error("Catalog changed repeatedly during material lookup. Retry the request.");
    },

    async lookupComponent(ctx: ClientContext, code: string): Promise<ComponentExactLookupResult> {
      const normalizedCode = normalizeCode(code);
      const cached = args.cache.get(ctx.clientId, "component", normalizedCode);
      if (cached?.kind === "component") return cached.value;

      for (let attempt = 0; attempt < 3; attempt += 1) {
        const generation = args.cache.captureGeneration(ctx.clientId);
        const component = await args.repository.getComponentByCode(ctx, normalizedCode);
        const value: ComponentExactLookupResult = {
          component,
          unitPrice: component ? await args.repository.getPrice(ctx, component.id) : null
        };
        if (!args.cache.isGenerationCurrent(ctx.clientId, generation)) continue;
        args.cache.set(ctx.clientId, "component", normalizedCode, { kind: "component", value });
        return structuredClone(value);
      }
      throw new Error("Catalog changed repeatedly during component lookup. Retry the request.");
    }
  };
}
