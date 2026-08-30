import { describe, expect, it } from "vitest";
import { boundedLimit, parseOdooDiagnostics } from "./odoo-feedback-reader";

describe("Odoo feedback reader", () => {
  it("reads only object diagnostics and bounds task listing", () => {
    expect(parseOdooDiagnostics(Buffer.from(JSON.stringify({ errors: [] })).toString("base64"))).toEqual({ errors: [] });
    expect(() => parseOdooDiagnostics(Buffer.from("[]").toString("base64"))).toThrow("not an object");
    expect(boundedLimit("4")).toBe(4);
    expect(boundedLimit("100")).toBe(20);
  });
});
