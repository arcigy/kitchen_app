import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const frontendStylesheets = [
  new URL("../style.css", import.meta.url),
  new URL("./editorShell.css", import.meta.url)
];
const appComposition = new URL("../app.ts", import.meta.url);

describe("button cursor visibility", () => {
  it.each(frontendStylesheets)("removes cursor capture and magnetic motion from %s", (stylesheet) => {
    const css = readFileSync(stylesheet, "utf8");

    expect(css).not.toContain("cursor: none");
    expect(css).not.toContain("body.button-magnet-capturing");
    expect(css).not.toContain("button-magnet-active");
    expect(css).not.toContain("--button-magnet-");
    expect(css).not.toContain("--button-hover-scale");
    expect(css).toMatch(/#properties button[^}]+\{\s*cursor: pointer;/);
  });

  it("does not initialize magnetic buttons when the frontend starts", () => {
    const appSource = readFileSync(appComposition, "utf8");

    expect(appSource).not.toContain("setupMagneticButtons");
    expect(appSource).not.toContain('from "./app/magneticButtons"');
  });
});
