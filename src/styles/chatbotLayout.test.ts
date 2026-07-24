import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const mainSource = new URL("../main.ts", import.meta.url);
const chatbotStyles = new URL("./chatbot.css", import.meta.url);
const legacyStyles = new URL("../style.css", import.meta.url);

describe("chatbot layout ownership", () => {
  it("loads the dedicated chatbot stylesheet after the legacy global stylesheet", () => {
    const source = readFileSync(mainSource, "utf8");
    expect(source.indexOf('import "./style.css"')).toBeGreaterThanOrEqual(0);
    expect(source.indexOf('import "./styles/chatbot.css"')).toBeGreaterThan(source.indexOf('import "./style.css"'));
  });

  it("lays out conversation items as a normal vertical chat instead of centering them", () => {
    const css = readFileSync(chatbotStyles, "utf8");
    expect(css).toMatch(/\.chatbot-body\s*\{[^}]*display:\s*flex;[^}]*flex-direction:\s*column;[^}]*align-items:\s*stretch;/s);
    expect(css).toMatch(/\.chatbot-message\.user\s*\{[^}]*align-self:\s*flex-end;/s);
    expect(css).toMatch(/\.chatbot-message\.assistant\s*\{[^}]*align-self:\s*flex-start;/s);
    expect(css).toMatch(/\.chatbot-message\.assistant\s*\{[^}]*padding:\s*0;[^}]*border:\s*0;[^}]*background:\s*transparent;[^}]*box-shadow:\s*none;/s);
    expect(css).toMatch(/\.chatbot-activity\s*\{[^}]*border:\s*0;[^}]*background:\s*transparent;[^}]*box-shadow:\s*none;/s);
  });

  it("keeps every chatbot window background plain and grid-free", () => {
    for (const source of [chatbotStyles, legacyStyles]) {
      const css = readFileSync(source, "utf8");
      const windowShell = css.match(/\.chatbot-window-shell\s*\{([^}]*)\}/s)?.[1] ?? "";
      expect(windowShell).toMatch(/background:\s*#ffffff;/);
      expect(windowShell).not.toMatch(/gradient|background-size/);
    }
  });
});
