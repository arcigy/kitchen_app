// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { assistantMarkdownToSafeHtml } from "./assistantMarkdown";

describe("assistant markdown", () => {
  it("renders useful markdown blocks and inline formatting", () => {
    const html = assistantMarkdownToSafeHtml([
      "## Hotovo",
      "",
      "- **Korpus:** H15554",
      "- Overené cez `kitchen.getSummary`",
      "",
      "| Kontrola | Stav |",
      "| --- | --- |",
      "| Kolízie | Žiadne |"
    ].join("\n"));

    expect(html).toContain("<h2>Hotovo</h2>");
    expect(html).toContain("<strong>Korpus:</strong>");
    expect(html).toContain("<code>kitchen.getSummary</code>");
    expect(html).toContain("<table>");
  });

  it("escapes raw html and rejects unsafe links", () => {
    const html = assistantMarkdownToSafeHtml('<img src=x onerror=alert(1)> [zlé](javascript:alert(1)) [dobré](https://arcigy.example)');

    expect(html).toContain("&lt;img");
    expect(html).not.toContain("javascript:");
    expect(html).toContain('href="https://arcigy.example"');
  });

  it("renders fenced code as escaped text", () => {
    const html = assistantMarkdownToSafeHtml("```json\n{\"x\":\"<tag>\"}\n```");

    expect(html).toContain('data-language="json"');
    expect(html).toContain("&lt;tag&gt;");
  });
});
