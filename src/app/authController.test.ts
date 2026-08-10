import { afterEach, describe, expect, it, vi } from "vitest";
import { requireClientSession, resolveLoginFailureMessage } from "./authController";
import { FakeElement, installFakeDocument } from "./testUtils/propertiesPanelHarness";

describe("resolveLoginFailureMessage", () => {
  it("explains when the local auth server is unavailable", () => {
    expect(resolveLoginFailureMessage(null)).toContain("npm run dev");
  });

  it("keeps invalid credential errors generic", () => {
    expect(resolveLoginFailureMessage(401)).toBe("Nesprávne prihlasovacie údaje.");
    expect(resolveLoginFailureMessage(429)).toBe("Nesprávne prihlasovacie údaje.");
  });

  it("separates server failures from credential failures", () => {
    expect(resolveLoginFailureMessage(500)).toContain("serveri");
  });
});

describe("requireClientSession login form", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("renders the current login inputs and submit button when no server session exists", async () => {
    installFakeDocument();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("", { status: 401 }))
    );
    const root = new FakeElement() as FakeElement & HTMLElement;

    void requireClientSession(root);
    await Promise.resolve();
    await Promise.resolve();

    expect(root.className).toBe("auth-shell");
    const panel = root.children[0]!;
    expect(panel.className).toBe("auth-panel");
    const content = panel.children[1]!;
    const form = content.children[2]!;
    expect(form.className).toBe("auth-form");

    const usernameInput = form.children[0]!.children[1]!;
    expect(usernameInput.type).toBe("text");
    expect(usernameInput.value).toBe("branislav");
    expect(usernameInput.name).toBe("username");
    expect(usernameInput.autocomplete).toBe("username");
    expect(usernameInput.required).toBe(true);

    const passwordInput = form.children[1]!.children[1]!;
    expect(passwordInput.type).toBe("password");
    expect(passwordInput.placeholder).toBe("Zadajte heslo");
    expect(passwordInput.name).toBe("password");
    expect(passwordInput.autocomplete).toBe("current-password");
    expect(passwordInput.required).toBe(true);

    const submit = form.children[4]!;
    expect(submit.type).toBe("submit");
    expect(submit.textContent).toBe("Prihlásiť sa do pracoviska");
  });
});
