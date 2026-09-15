import { readFileSync } from "node:fs";
import postcss from "postcss";
import { describe, expect, it } from "vitest";

const css = postcss.parse(readFileSync(new URL("./designTokens.css", import.meta.url), "utf8"));
const light: Record<string, string> = {};
const dark: Record<string, string> = {};
css.walkRules((rule) => {
  if (rule.parent?.type !== "root") return;
  const tokens = rule.selector === ":root" ? light : dark;
  rule.walkDecls((decl) => { tokens[decl.prop] = decl.value; });
});

function luminance(hex: string): number {
  const channels = hex.slice(1).match(/../g)!.map((value) => {
    const channel = parseInt(value, 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722;
}

function contrast(a: string, b: string): number {
  const [low, high] = [luminance(a), luminance(b)].sort((x, y) => x - y);
  return (high + 0.05) / (low + 0.05);
}

describe("Arcigy appearance palette", () => {
  for (const [theme, tokens] of [["light", light], ["dark", { ...light, ...dark }]] as const) {
    it(`${theme}: keeps text, secondary text and status labels readable on their surfaces`, () => {
      for (const surface of ["--bg", "--surface", "--surface-2", "--surface-3"]) {
        for (const text of ["--text", "--text-secondary", "--muted"]) {
          expect(contrast(tokens[text], tokens[surface]), `${text} on ${surface}`).toBeGreaterThanOrEqual(4.5);
        }
      }
      for (const status of ["accent", "success", "danger", "warning"]) {
        expect(contrast(tokens[`--${status}`], tokens[`--${status}-soft`]), status).toBeGreaterThanOrEqual(4.5);
      }
      expect(contrast(tokens["--tooltip-text"], tokens["--tooltip-bg"])).toBeGreaterThanOrEqual(4.5);
      expect(contrast(tokens["--tooltip-muted"], tokens["--tooltip-bg"])).toBeGreaterThanOrEqual(4.5);
    });

    it(`${theme}: keeps primary gradient labels and keyboard focus distinguishable`, () => {
      for (const end of ["--accent-start", "--accent-end"]) {
        expect(contrast(tokens["--on-accent"], tokens[end])).toBeGreaterThanOrEqual(4.5);
      }
      for (const surface of ["--surface", "--surface-2"]) {
        expect(contrast(tokens["--focus"], tokens[surface])).toBeGreaterThanOrEqual(3);
        expect(contrast(tokens["--border-strong"], tokens[surface])).toBeGreaterThanOrEqual(3);
      }
    });
  }

  it("has one palette owner so legacy CSS cannot silently reset an active theme", () => {
    for (const path of ["./base.css", "../style.css"]) {
      expect(readFileSync(new URL(path, import.meta.url), "utf8")).not.toMatch(/--(?:bg|text|surface|accent)\s*:/);
    }
    const main = readFileSync(new URL("../main.ts", import.meta.url), "utf8");
    expect(main.indexOf('import "./styles/designTokens.css"')).toBeLessThan(main.indexOf('import "./styles/base.css"'));
  });
});
