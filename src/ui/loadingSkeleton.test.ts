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
});
