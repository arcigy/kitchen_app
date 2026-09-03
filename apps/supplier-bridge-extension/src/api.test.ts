import { afterEach, describe, expect, it, vi } from "vitest";
import { loadSupplierBridgeSession, loginExtension, SupplierBridgeApiError } from "./api";

describe("Supplier Bridge API errors", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("keeps the safe server message and request ID from a failed response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ ok: false, error: "Internal server error." }),
      { status: 500, headers: { "X-Request-Id": "request-abc" } }
    )));

    const failure = await loadSupplierBridgeSession("https://arcigy.example", "session-1", "access-token")
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(SupplierBridgeApiError);
    expect(failure).toMatchObject({ message: "Internal server error.", status: 500, requestId: "request-abc" });
  });

  it("sends the company discriminator when signing the Bridge in", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      accessToken: "token",
      session: {
        userId: "user_branislav",
        clientId: "client_arcigy_demo",
        role: "owner",
        displayName: "Branislav",
        issuedAt: "2026-09-03T12:00:00.000Z",
        expiresAt: "2026-09-10T12:00:00.000Z"
      }
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await loginExtension("https://arcigy.example", "Arcigy firma", "branislav", "safe-password");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://arcigy.example/api/auth/extension-login",
      expect.objectContaining({ body: JSON.stringify({ company: "Arcigy firma", username: "branislav", password: "safe-password" }) })
    );
  });
});
