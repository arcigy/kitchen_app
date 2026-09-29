// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { createReleaseNewsController } from "./releaseNewsController";
import { RELEASE_NOTICES } from "../core/release-news/releaseNewsCatalog";
import { setCurrentLanguage } from "../i18n";

function createScaleControl(): HTMLElement {
  const section = document.createElement("section");
  section.className = "workspace-settings-ui-scale";
  return section;
}

const response = { notices: [...RELEASE_NOTICES], acknowledgedNoticeIds: [] };

afterEach(() => { document.body.innerHTML = ""; });

describe("release news dialog", () => {
  it("opens the newest unread notice automatically and acknowledges it only on confirmation", async () => {
    setCurrentLanguage("sk");
    const fetcher = vi.fn(async (input: RequestInfo | URL) => input === "/api/release-news"
      ? new Response(JSON.stringify(response), { status: 200 })
      : new Response(JSON.stringify({ acknowledgement: { noticeId: RELEASE_NOTICES[0].id } }), { status: 200 }));
    const controller = createReleaseNewsController({ fetcher: fetcher as typeof fetch, uiScale: { createControl: createScaleControl } });
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull());
    expect(document.querySelector("h2")?.textContent).toBe(RELEASE_NOTICES[0].title.sk);
    document.querySelector<HTMLButtonElement>(".release-news-acknowledge")?.click();
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull());
    expect(fetcher).toHaveBeenCalledWith(`/api/release-news/${RELEASE_NOTICES[0].id}/acknowledgement`, expect.objectContaining({ method: "PUT" }));
    controller.dispose();
  });

  it("lets Escape close without acknowledging and preserves an unread prompt after API failure", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(response), { status: 200 }));
    const controller = createReleaseNewsController({ fetcher: fetcher as typeof fetch, uiScale: { createControl: createScaleControl } });
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull());
    document.querySelector('[role="dialog"]')?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
    controller.dispose();

    const failedFetch = vi.fn(async (input: RequestInfo | URL) => input === "/api/release-news"
      ? new Response(JSON.stringify(response), { status: 200 })
      : new Response("failed", { status: 503 }));
    const failedController = createReleaseNewsController({ fetcher: failedFetch as typeof fetch, uiScale: { createControl: createScaleControl } });
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull());
    document.querySelector<HTMLButtonElement>(".release-news-acknowledge")?.click();
    await vi.waitFor(() => expect(document.querySelector<HTMLElement>("[data-news-error]")?.hidden).toBe(false));
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
    const getCallCount = failedFetch.mock.calls.filter(([input]) => input === "/api/release-news").length;
    expect(getCallCount).toBe(1);
    document.querySelector('[role="dialog"]')?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    failedController.dispose();
  });

  it("opens the archive manually without acknowledging and offers display settings", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify(response), { status: 200 }));
    const controller = createReleaseNewsController({ fetcher: fetcher as typeof fetch, uiScale: { createControl: createScaleControl } });
    await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).not.toBeNull());
    document.querySelector('[role="dialog"]')?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    document.dispatchEvent(new Event("arcigy:open-release-news"));
    await vi.waitFor(() => expect(document.querySelectorAll(".release-news-date").length).toBe(RELEASE_NOTICES.length));
    expect(fetcher).toHaveBeenCalledTimes(1);
    document.dispatchEvent(new Event("arcigy:open-account-settings"));
    expect(document.querySelector(".workspace-settings-ui-scale")).not.toBeNull();
    controller.dispose();
  });
});
