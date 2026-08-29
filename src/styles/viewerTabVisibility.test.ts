import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const editorShellCss = readFileSync(new URL("./editorShell.css", import.meta.url), "utf8");
const appCss = readFileSync(new URL("../style.css", import.meta.url), "utf8");

const hiddenLegacyViewerTabs = /\.viewer-tabbar,\s*#resetViewBtn\s*\{[^}]*display:\s*none\s*!important;?[^}]*\}/;

describe("legacy viewer tab visibility", () => {
  it("keeps the removed top view switcher hidden in both editor style layers", () => {
    expect(editorShellCss).toMatch(hiddenLegacyViewerTabs);
    expect(appCss).toMatch(hiddenLegacyViewerTabs);
  });
});
