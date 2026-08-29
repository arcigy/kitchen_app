// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import type { FurnQuoteModulePackage } from "../core/module-package/module-package-types";
import { renderModuleCatalogPreview, resolveModuleCatalogPreviewImage } from "./moduleCatalogPreview";

function modulePackage(
  moduleType: string,
  previewImage?: string,
  options: { modulePackageId?: string; variant?: string } = {}
): FurnQuoteModulePackage {
  return {
    format: "furnquote-module",
    packageVersion: 1,
    module: {
      modulePackageId: options.modulePackageId ?? `${moduleType}_package`,
      moduleType,
      familyName: moduleType,
      displayName: moduleType,
      category: "custom",
      version: "1.0.0",
      isSystemModule: true,
      tags: []
    },
    parameters: {
      parameters: options.variant ? [{
        key: "variant",
        label: "Variant",
        type: "select",
        defaultValue: options.variant,
        affects: "geometry"
      }] : []
    },
    placement: { allowedContexts: ["custom"] },
    constraints: { dimensionRules: {}, validationRules: [] },
    snapping: { enabled: false, snapTargets: [], priority: [], snapDistanceMm: 0, rotationSnapDeg: 90 },
    geometry: { mode: "trusted-runtime", runtimeBuilderKey: "test.v1" },
    materials: { slots: [] },
    components: { slots: [] },
    bom: { rules: [] },
    pricing: {},
    ui: { previewImage, groups: [], controls: [] },
    exports: {},
    assets: { files: [] },
    compatibility: {},
    integrity: {
      createdAt: "2026-07-20T00:00:00.000Z",
      updatedAt: "2026-07-20T00:00:00.000Z",
      author: "test"
    }
  };
}

describe("module catalog previews", () => {
  it("uses package metadata first and falls back to the built-in image for stored FWM packages", () => {
    expect(resolveModuleCatalogPreviewImage(modulePackage("fwm_catalog_base_drawers", " /custom/preview.png ")))
      .toBe("/custom/preview.png");
    expect(resolveModuleCatalogPreviewImage(modulePackage("fwm_catalog_base_drawers")))
      .toBe("/module-icons/furniture/v4/types/fwm_catalog_base_drawers.png");
    expect(resolveModuleCatalogPreviewImage(modulePackage(
      "fwm_catalog_base_drawers",
      "/module-icons/furniture/fwm_catalog_base_drawers.png"
    ))).toBe("/module-icons/furniture/v4/types/fwm_catalog_base_drawers.png");
  });

  it("replaces a broken preview with the generated SVG fallback", () => {
    const host = document.createElement("span");
    const fallbackSvg = vi.fn(() => '<svg data-fallback="true"></svg>');

    renderModuleCatalogPreview({
      host,
      modulePackage: modulePackage("fwm_catalog_base_drawers"),
      fallbackSvg
    });

    const image = host.querySelector("img");
    expect(image?.getAttribute("src")).toBe("/module-icons/furniture/v4/types/fwm_catalog_base_drawers.png");
    expect(image?.getAttribute("alt")).toBe("");
    expect(host.dataset.loadingSkeleton).toBe("icon");
    expect(fallbackSvg).not.toHaveBeenCalled();

    image?.dispatchEvent(new Event("load"));
    expect(host.dataset.loadingSkeleton).toBeUndefined();
    expect(image?.dataset.previewState).toBe("loaded");

    image?.dispatchEvent(new Event("error"));
    expect(fallbackSvg).toHaveBeenCalledOnce();
    expect(host.querySelector("svg")?.dataset.fallback).toBe("true");
  });

  it("supports eager high-priority loading for compact pickers", () => {
    const host = document.createElement("span");
    renderModuleCatalogPreview({
      host,
      modulePackage: modulePackage("fwm_catalog_base_drawers"),
      fallbackSvg: () => "fallback",
      loading: "eager",
      fetchPriority: "high"
    });

    const image = host.querySelector<HTMLImageElement>("img");
    expect(image?.loading).toBe("eager");
    expect(image?.getAttribute("fetchpriority")).toBe("high");
  });

  it("uses the exact DELFI variant preview instead of a generic stored family image", () => {
    expect(resolveModuleCatalogPreviewImage(modulePackage(
      "fwm_catalog_base_corner",
      "/module-icons/furniture/v2/fwm_catalog_base_corner.png",
      { modulePackageId: "client_delfi_base_corner_90_v1", variant: "corner_90" }
    ))).toBe("/module-icons/furniture/v4/variants/fwm_catalog_base_corner__corner_90.png");

    expect(resolveModuleCatalogPreviewImage(modulePackage(
      "fwm_catalog_wall_cabinet",
      "/custom/client-preview.png",
      { variant: "corner_open_chamfered" }
    ))).toBe("/custom/client-preview.png");

    expect(resolveModuleCatalogPreviewImage(modulePackage(
      "wall_corner_90",
      "/module-icons/furniture/v2/fwm_catalog_wall_cabinet.png",
      { modulePackageId: "wall_corner_90", variant: "corner_90" }
    ))).toBe("/module-icons/furniture/v4/variants/wall_corner_90.png");
  });

  it("renders the generated SVG immediately when no preview is available", () => {
    const host = document.createElement("span");
    const fallbackSvg = vi.fn(() => '<svg data-fallback="true"></svg>');

    renderModuleCatalogPreview({
      host,
      modulePackage: modulePackage("unknown_module"),
      fallbackSvg
    });

    expect(fallbackSvg).toHaveBeenCalledOnce();
    expect(host.querySelector("svg")?.dataset.fallback).toBe("true");
  });
});
