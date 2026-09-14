// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BridgeRuntimeResponse } from "../messages";

const { adapter } = vi.hoisted(() => {
  Object.assign(globalThis, { __SUPPLIER_BRIDGE_DEBUG__: false, __SUPPLIER_BRIDGE_VERSION__: "test", __ARCIGY_ORIGINS__: [], __SUPPLIER_SIMULATOR_ORIGINS__: [] });
  return { adapter: { supplierId: "hranipex", detectSession: () => ({ status: "unknown" }), extractExactProduct: vi.fn() } };
});
vi.mock("../suppliers/registry", () => ({ exactAdapterForUrl: () => adapter }));
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });

describe("supplier content capture response", () => {
  it("returns success when the exact variant has no error (null is success)", async () => {
    const addListener = vi.fn();
    vi.stubGlobal("chrome", { runtime: { onMessage: { addListener } } });
    adapter.extractExactProduct.mockReturnValue({ ok: true, errorCode: null, result: {
      supplierId: "hranipex", requestedProductId: "100733X00042100L03", foundProductId: "100733X00042100L03", exactIdMatch: true,
      product: { name: "Test edge", manufacturer: null, decorCode: "HU 100733", surfaceCode: null, productType: "edge_band", thicknessMm: 1, dimensions: { widthMm: 42 }, availability: { status: "available" }, previewImageUrl: "https://hosting.photorobot.com/images/4748478675156992/decor/NORMAL/image" },
      pricing: { customerPrice: null, normalizedPrice: null }, source: { pageUrl: "https://www.hranipex.cz/cs/produkt/test/", pageType: "product_detail", observedAt: "2026-09-14T12:00:00.000Z" }, diagnostics: { warnings: [] }
    } });
    await import("./supplierCapture");
    const listener = addListener.mock.calls[0]![0] as (message: unknown, sender: unknown, respond: (response: BridgeRuntimeResponse) => void) => boolean;
    const response = await new Promise<BridgeRuntimeResponse>((resolve) => listener({ channel: "arcigy-supplier-bridge", type: "CAPTURE_EXACT_SUPPLIER_PRODUCT", requestedProductId: "100733X00042100L03", expectedProductType: "edge_band", expectedManufacturer: null, expectedThicknessMm: null }, {}, resolve));
    expect(response).toMatchObject({ ok: true, errorCode: null, capture: { errorCode: null, candidates: [{ supplierProductCode: "100733X00042100L03", previewImageUrl: "https://hosting.photorobot.com/images/4748478675156992/decor/NORMAL/image" }] } });
  });
});
