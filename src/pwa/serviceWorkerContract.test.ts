import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("PWA service worker runtime cache contract", () => {
  it("contains cache failures and never stores authenticated API or project responses", async () => {
    const source = await readFile(path.join(process.cwd(), "public", "sw.js"), "utf-8");

    expect(source).toContain('const SHELL_CACHE = "arcigy-kitchen-shell-v2"');
    expect(source).toContain('url.pathname.startsWith("/api/")');
    expect(source).toContain('url.pathname.startsWith("/storage/")');
    expect(source).toContain("continueInBackground(event, cacheResponse(");
    expect(source).toContain("await cache.put(request, response.clone())");
    expect(source).toMatch(/async function cacheResponse[\s\S]*?catch \{/);
    expect(source).toMatch(/function continueInBackground[\s\S]*?event\.waitUntil\(promise\)[\s\S]*?catch \{/);
  });

  it("ships the default avatar referenced by PostgreSQL-backed profiles", async () => {
    await expect(access(path.join(process.cwd(), "public", "organization", "default-user.svg"))).resolves.toBeUndefined();
    const repository = await readFile(
      path.join(process.cwd(), "src", "core", "client", "client-postgres-repository.ts"),
      "utf-8"
    );
    expect(repository).toContain('photoUrl: row.photo_asset_id ?? "/organization/default-user.svg"');
  });
});
