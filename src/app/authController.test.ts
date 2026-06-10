import { describe, expect, it } from "vitest";
import { resolveLoginFailureMessage } from "./authController";

describe("resolveLoginFailureMessage", () => {
  it("explains when the local auth server is unavailable", () => {
    expect(resolveLoginFailureMessage(null)).toContain("npm run dev");
  });

  it("keeps invalid credential errors generic", () => {
    expect(resolveLoginFailureMessage(401)).toBe("Nespravne prihlasovacie udaje.");
    expect(resolveLoginFailureMessage(429)).toBe("Nespravne prihlasovacie udaje.");
  });

  it("separates server failures from credential failures", () => {
    expect(resolveLoginFailureMessage(500)).toContain("serveri");
  });
});
