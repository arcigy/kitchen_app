// @vitest-environment jsdom

import { describe, expect, it } from "vitest";
import { mountLoadingSkeleton } from "./loadingSkeleton";

describe("loading skeleton", () => {
  it("renders an accessible phase skeleton and clears only its own mount", () => {
    const host = document.createElement("section");
    const first = mountLoadingSkeleton(host, { variant: "phase", label: "Loading materials" });
    expect(host.getAttribute("aria-busy")).toBe("true");
    expect(host.querySelector('[data-loading-skeleton="phase"]')).not.toBeNull();

    const second = mountLoadingSkeleton(host, { variant: "phase", label: "Loading current materials" });
    first.clear();
    expect(second.isCurrent()).toBe(true);
    expect(host.getAttribute("aria-busy")).toBe("true");

    second.clear();
    expect(host.getAttribute("aria-busy")).toBeNull();
    expect(host.children).toHaveLength(0);
  });

  it("uses class mode for an icon without replacing the image host", () => {
    const host = document.createElement("span");
    host.appendChild(document.createElement("img"));
    const skeleton = mountLoadingSkeleton(host, { variant: "icon", label: "Loading icon" });

    expect(host.dataset.loadingSkeleton).toBe("icon");
    expect(host.querySelector("img")).not.toBeNull();
    skeleton.clear();
    expect(host.dataset.loadingSkeleton).toBeUndefined();
  });

  it("anchors overlay loading to its host without rendering a guessed workspace layout", () => {
    const host = document.createElement("section");
    const skeleton = mountLoadingSkeleton(host, {
      variant: "workspace",
      label: "Opening project",
      mode: "overlay"
    });

    expect(host.classList.contains("arcigy-loading-skeleton-host--overlay")).toBe(true);
    expect(host.querySelector("[data-loading-skeleton-activity]")).not.toBeNull();
    expect(host.querySelector(".arcigy-loading-skeleton__body")).toBeNull();

    skeleton.clear();
    expect(host.classList.contains("arcigy-loading-skeleton-host--overlay")).toBe(false);
  });

  it("uses the stable activity loader for a screen rather than guessed columns", () => {
    const host = document.createElement("main");
    mountLoadingSkeleton(host, { variant: "screen", label: "Starting app" });

    expect(host.querySelector("[data-loading-skeleton-activity]")).not.toBeNull();
    expect(host.querySelector(".arcigy-loading-skeleton__sidebar")).toBeNull();
  });

  it("removes a stale direct overlay before mounting the next loading state", () => {
    const host = document.createElement("main");
    mountLoadingSkeleton(host, { variant: "workspace", label: "First", mode: "overlay" });
    const current = mountLoadingSkeleton(host, { variant: "workspace", label: "Second", mode: "overlay" });

    expect(host.querySelectorAll(":scope > [data-loading-skeleton]")).toHaveLength(1);
    expect(current.isCurrent()).toBe(true);
  });
});
