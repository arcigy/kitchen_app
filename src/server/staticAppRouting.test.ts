import { describe, expect, it } from "vitest";
import { shouldServeSpaIndex, staticCacheControl } from "./staticAppRouting";

describe("static app routing", () => {
  it("returns a real missing-asset response instead of HTML for removed build chunks", () => {
    expect(shouldServeSpaIndex("/assets/app-old.js")).toBe(false);
    expect(shouldServeSpaIndex("/assets/styles-old.css")).toBe(false);
    expect(shouldServeSpaIndex("/manifest.webmanifest")).toBe(false);
  });

  it("keeps extensionless application routes on the SPA index", () => {
    expect(shouldServeSpaIndex("/material-proof")).toBe(true);
    expect(shouldServeSpaIndex("/projects/example")).toBe(true);
  });

  it("never stores HTML while keeping hashed assets immutable", () => {
    expect(staticCacheControl("/app/dist/index.html")).toBe("no-store");
    expect(staticCacheControl("/app/dist/assets/app-current.js")).toBe("public, max-age=31536000, immutable");
  });
});
