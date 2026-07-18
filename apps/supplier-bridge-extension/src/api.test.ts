import { afterEach, describe, expect, it, vi } from "vitest";
import { loadSupplierBridgeSession, SupplierBridgeApiError } from "./api";

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
});
