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
    const form = content.children[1]!;
    expect(form.className).toBe("auth-form");

    const companyInput = form.children[0]!.children[1]!;
    expect(companyInput.type).toBe("text");
    expect(companyInput.value).toBe("");
    expect(companyInput.name).toBe("company");
    expect(companyInput.autocomplete).toBe("organization");
    expect(companyInput.placeholder).toBe("Zadajte firmu");
    expect(companyInput.required).toBe(true);

    const usernameInput = form.children[1]!.children[1]!;
    expect(usernameInput.type).toBe("text");
    expect(usernameInput.value).toBe("");
    expect(usernameInput.name).toBe("username");
    expect(usernameInput.autocomplete).toBe("username");
    expect(usernameInput.placeholder).toBe("Zadajte meno používateľa");
    expect(usernameInput.required).toBe(true);

    const passwordInput = form.children[2]!.children[1]!;
    expect(passwordInput.type).toBe("password");
    expect(passwordInput.placeholder).toBe("Zadajte heslo");
    expect(passwordInput.name).toBe("password");
    expect(passwordInput.autocomplete).toBe("current-password");
    expect(passwordInput.required).toBe(true);

    const submit = form.children[4]!;
    expect(submit.type).toBe("submit");
    expect(submit.textContent).toBe("Prihlásiť sa do pracoviska");
    expect(form.children).toHaveLength(5);
    expect(content.textContent).not.toContain("Dostupné účty");
    expect(content.textContent).not.toContain("Branislav");
    expect(content.textContent).not.toContain("Andrej");
  });

  it("sends company, username, and password to the browser login endpoint", async () => {
    installFakeDocument();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response("", { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        ok: true,
        session: {
          version: 1,
          userId: "user-test",
          clientId: "client-test",
          role: "owner",
          displayName: "Test User",
          issuedAt: "2026-01-01T00:00:00.000Z",
          expiresAt: "2026-01-08T00:00:00.000Z"
        }
      }), { status: 200, headers: { "Content-Type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const root = new FakeElement() as FakeElement & HTMLElement;
    const sessionPromise = requireClientSession(root);
    await Promise.resolve();
    await Promise.resolve();

    const form = root.children[0]!.children[1]!.children[1]!;
    const companyInput = form.children[0]!.children[1]!;
    const usernameInput = form.children[1]!.children[1]!;
    const passwordInput = form.children[2]!.children[1]!;
    companyInput.value = "Arcigy Kitchen";
    usernameInput.value = "arcigy";
    passwordInput.value = "test-password";
    form.dispatch("submit", { preventDefault: () => undefined });

    await expect(sessionPromise).resolves.toMatchObject({ clientId: "client-test", userId: "user-test" });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "/api/auth/login", expect.objectContaining({
      body: JSON.stringify({ company: "Arcigy Kitchen", username: "arcigy", password: "test-password" })
    }));
  });
});
