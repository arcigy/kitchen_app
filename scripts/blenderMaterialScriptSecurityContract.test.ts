import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("Blender material script security contract", () => {
  it("uses a collision-resistant material cache key", async () => {
    const source = await readFile(
      path.join(process.cwd(), "blender", "scripts", "apply_materials_to_scene.py"),
      "utf8"
    );

    expect(source).toContain('hashlib.sha256(payload.encode("utf-8")).hexdigest()[:16]');
    expect(source).not.toContain("hashlib.sha1(");
  });
});
