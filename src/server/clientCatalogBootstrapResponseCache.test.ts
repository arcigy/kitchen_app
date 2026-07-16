import { describe, expect, it } from "vitest";
import type { ClientCatalogBootstrapCacheKey } from "./clientCatalogBootstrapResponseCache";
import { ClientCatalogBootstrapResponseCache } from "./clientCatalogBootstrapResponseCache";

function key(clientId: string, storageRevision: string): ClientCatalogBootstrapCacheKey {
  return {
    clientId,
    revision: {
      catalogVersion: 1,
      updatedAt: "2026-07-16T00:00:00.000Z",
      storageRevision
    }
  };
}

describe("ClientCatalogBootstrapResponseCache", () => {
  it("evicts least-recently-used entries within both count and byte limits", () => {
    const cache = new ClientCatalogBootstrapResponseCache(2, 6);
    const first = key("client-first", "1");
    const second = key("client-second", "1");
    const third = key("client-third", "1");
    cache.set(first, Buffer.from("aa"));
    cache.set(second, Buffer.from("bb"));
    expect(cache.get(first)?.toString()).toBe("aa");

    cache.set(third, Buffer.from("cc"));

    expect(cache.get(first)?.toString()).toBe("aa");
    expect(cache.get(second)).toBeNull();
    expect(cache.get(third)?.toString()).toBe("cc");
  });

  it("does not retain a single response larger than the configured byte ceiling", () => {
    const cache = new ClientCatalogBootstrapResponseCache(2, 3);
    const oversized = key("client-oversized", "1");

    cache.set(oversized, Buffer.from("four"));

    expect(cache.get(oversized)).toBeNull();
  });

  it("clears rejected in-flight work so a later request can retry", async () => {
    const cache = new ClientCatalogBootstrapResponseCache();
    let attempts = 0;
    const create = async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("transient");
      return "ready";
    };

    await expect(cache.coalesce("same", create)).rejects.toThrow("transient");
    await expect(cache.coalesce("same", create)).resolves.toBe("ready");
    expect(attempts).toBe(2);
  });
});
