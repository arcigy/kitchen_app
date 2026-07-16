import { afterEach, describe, expect, it, vi } from "vitest";
import { ExternalResponseTooLargeError, fetchExternalBytes, fetchExternalText } from "./external-http";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("bounded external HTTP", () => {
  it("reads a bounded text response and disables redirects by default", async () => {
    const fetchMock = vi.fn(async (_input: string | URL, init?: RequestInit) => {
      expect(init?.redirect).toBe("error");
      return new Response("ok", { status: 200, headers: { "content-length": "2" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchExternalText("https://example.test/data", {}, { timeoutMs: 1_000, maxBytes: 10 });
    expect(result.text).toBe("ok");
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("rejects a declared response larger than the limit", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("small", {
      status: 200,
      headers: { "content-length": "999" }
    })));

    await expect(fetchExternalBytes("https://example.test/data", {}, { timeoutMs: 1_000, maxBytes: 10 }))
      .rejects.toBeInstanceOf(ExternalResponseTooLargeError);
  });

  it("rejects a streamed response that grows past the limit", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(8));
        controller.enqueue(new Uint8Array(8));
        controller.close();
      }
    }))));

    await expect(fetchExternalBytes("https://example.test/data", {}, { timeoutMs: 1_000, maxBytes: 10 }))
      .rejects.toBeInstanceOf(ExternalResponseTooLargeError);
  });

  it("aborts a stalled external request", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_input: string | URL, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(init.signal?.reason), { once: true });
    })));

    const pending = fetchExternalBytes("https://example.test/data", {}, { timeoutMs: 50, maxBytes: 10 });
    const assertion = expect(pending).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(51);
    await assertion;
  });
});
