// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { hranipexExactIdAdapter } from "./hranipex/hranipexExactIdAdapter";
import { jafHolzExactIdAdapter } from "./jaf-holz/jafHolzExactIdAdapter";
import { exactAdapterForSupplier, supplierImplementationStatus } from "./registry";
import { schachermayerExactIdAdapter } from "./schachermayer/schachermayerExactIdAdapter";

vi.hoisted(() => Object.assign(globalThis, {
  __SUPPLIER_BRIDGE_DEBUG__: true,
  __SUPPLIER_BRIDGE_VERSION__: "test",
  __ARCIGY_ORIGINS__: ["http://127.0.0.1:5180"],
  __SUPPLIER_SIMULATOR_ORIGINS__: ["http://127.0.0.1:5192"]
}));

const context = (requestedProductId: string, expectedProductType: "board" | "hinge" | "edge_band") => ({ requestedProductId, expectedProductType, expectedManufacturer: null, expectedThicknessMm: null });

beforeEach(() => { document.body.innerHTML = ""; });

describe("verified Czech read-only supplier adapters", () => {
  it("registers all four adapters as verified read-only", () => {
    expect(supplierImplementationStatus).toEqual({ demos: "verified_read_only", hranipex: "verified_read_only", jaf_holz: "verified_read_only", schachermayer: "verified_read_only" });
    expect(["demos", "hranipex", "jaf_holz", "schachermayer"].every((id) => exactAdapterForSupplier(id)?.productionReady)).toBe(true);
  });

  it("extracts an exact JAF board result with customer m2 and list piece prices", () => {
    document.body.innerHTML = `<a href="/muj-ucet">Můj účet</a><section class="product-teaser js-product">
      <h3>Eurolight Egger broušený</h3><span>08130/0001</span><div>Tloušťka 38 mm</div><div>D x Š 2 800 x 2 070 mm</div>
      <div>Cena po slevě bez DPH 500,50 Kč /m²</div><div>Ceníková cena bez DPH 4 144,14 Kč /ks</div><div>Na objednávku</div>
      <button>Do košíku</button></section>`;
    expect(jafHolzExactIdAdapter.extractExactProduct(document, context("08130/0001", "board"))).toMatchObject({ ok: true, result: {
      foundProductId: "08130/0001", product: { manufacturer: "Egger", thicknessMm: 38, dimensions: { lengthMm: 2800, widthMm: 2070 }, availability: { status: "on_request" } },
      pricing: { customerPrice: { amount: 500.5, basis: "m2", vatMode: "excluded" }, listPrice: { amount: 4144.14 }, normalizedPrice: { amount: 500.5, unit: "m2" } }
    } });
  });

  it("extracts an exact Schachermayer customer price without touching order controls", () => {
    document.body.innerHTML = `<a href="/extranet/redirect/docs">Dokumenty</a><div>Můj účet</div><div class="article-details-container-layout">
      <h1>BLUM CLIP top pant</h1><div>Obj.č.: 103330187</div><div class="grid-article-price-information">CZK 40,33 <span>Vaše cena</span> za 1 KS</div>
      <div>370 KS IHNED K ODESLÁNÍ</div><button>Přidat do košíku</button></div><div role="combobox">Blum</div>`;
    expect(schachermayerExactIdAdapter.extractExactProduct(document, context("103330187", "hinge"))).toMatchObject({ ok: true, result: {
      foundProductId: "103330187", product: { manufacturer: "Blum", availability: { status: "available" } }, pricing: { customerPrice: { amount: 40.33, currency: "CZK", basis: "piece", vatMode: "excluded" } }
    } });
  });

  it("extracts only the exact Hranipex edge variant and its per-meter price", () => {
    document.body.innerHTML = `<a href="/cs/zakaznik/osobni-profil/">Profil</a><h1>HD 296149 ABS Hrana Kex</h1><table><tbody>
      <tr class="variantsTable-rowTop"><td><span>296149X50023100</span> 23x1mm</td></tr>
      <tr id="variant-296149X50023100" class="variantsTable-rowBottom"><td><span data-item-instock>Skladem</span></td><td data-roll>200 m</td><td data-price>8,66 Kč</td><td><button>Přidat do košíku</button></td></tr>
      <tr class="variantsTable-rowTop"><td><span>296149X50023200</span> 23x2mm</td></tr><tr class="variantsTable-rowBottom"><td data-price>10,00 Kč</td></tr>
    </tbody></table>`;
    expect(hranipexExactIdAdapter.extractExactProduct(document, context("296149X50023100", "edge_band"))).toMatchObject({ ok: true, result: {
      foundProductId: "296149X50023100", product: { decorCode: "HD 296149", thicknessMm: 1, dimensions: { widthMm: 23 }, availability: { status: "available" } },
      pricing: { customerPrice: { amount: 8.66, basis: "linear_meter", vatMode: "excluded" }, normalizedPrice: { unit: "linear_meter" } }
    } });
    expect(hranipexExactIdAdapter.extractExactProduct(document, context("missing", "edge_band"))).toEqual({ ok: false, errorCode: "SUPPLIER_PRODUCT_NOT_FOUND", result: null });
  });

  it("builds only read-only Czech search URLs", () => {
    const plans = [jafHolzExactIdAdapter.buildProductLookupPlan("08130/0001"), schachermayerExactIdAdapter.buildProductLookupPlan("103330187"), hranipexExactIdAdapter.buildProductLookupPlan("296149X50023100")];
    expect(plans).toEqual([
      { type: "search_form", searchPageUrl: "https://www.jafholz.cz/vyhledavani?q=08130%2F0001", productId: "08130/0001" },
      { type: "search_form", searchPageUrl: "https://webshop.schachermayer.com/cat/cs-CZ/products/v-echny-kategorie/1?sSearch=103330187", productId: "103330187" },
      { type: "search_form", searchPageUrl: "https://www.hranipex.cz/cs/vyhledavani/?q=296149X50023100", productId: "296149X50023100" }
    ]);
    expect(JSON.stringify(plans).toLowerCase()).not.toMatch(/cart|košík|objednat/);
  });
});
