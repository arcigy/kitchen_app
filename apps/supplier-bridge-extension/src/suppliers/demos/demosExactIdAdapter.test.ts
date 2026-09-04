// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { demosExactIdAdapter } from "./demosExactIdAdapter";

vi.hoisted(() => {
  Object.assign(globalThis, {
    __SUPPLIER_BRIDGE_DEBUG__: true,
    __SUPPLIER_BRIDGE_VERSION__: "test",
    __ARCIGY_ORIGINS__: ["http://127.0.0.1:5180"],
    __SUPPLIER_SIMULATOR_ORIGINS__: ["http://127.0.0.1:5192"]
  });
});

beforeEach(() => { document.body.innerHTML = ""; });

describe("Démos exact-ID read-only adapter", () => {
  it("recognizes the verified Czech login and logged-in catalog markers", () => {
    document.body.innerHTML = '<form action="/login/check/"><input id="front_login_form_login"><input id="front_login_form_password" type="password"></form>';
    expect(demosExactIdAdapter.detectSession(document, new URL("https://www.demos24plus.com/login/")).status).toBe("logged_out");
    document.body.innerHTML = '<input id="js-product-search-autocomplete-input-lbx"><a href="/cart/">Cart</a>';
    expect(demosExactIdAdapter.detectSession(document, new URL("https://www.demos24plus.com/")).status).toBe("logged_in");
  });

  it("builds only read-only detail/search URLs and never a cart action", () => {
    expect(demosExactIdAdapter.buildProductLookupPlan("514616")).toEqual({ type: "direct_url", url: "https://www.demos24plus.com/product/514616/" });
    expect(demosExactIdAdapter.buildProductLookupPlan("0001/A-2")).toEqual({ type: "search_form", searchPageUrl: "https://www.demos24plus.com/search?q=0001%2FA-2", productId: "0001/A-2" });
    const plans = JSON.stringify([demosExactIdAdapter.buildProductLookupPlan("514616"), demosExactIdAdapter.buildProductLookupPlan("0001/A-2")]).toLowerCase();
    expect(plans).not.toContain("quick-add");
    expect(plans).not.toContain("/cart");
  });

  it("extracts the exact partner price and normalizes a board sheet to m2", () => {
    document.body.innerHTML = `
      <input id="js-product-search-autocomplete-input-lbx"><a href="/cart/">Cart</a>
      <h1 class="box-detail__top__title">HDF White 2800/2070/3</h1>
      <strong class="box-detail__top__code__value">59678</strong>
      <div class="box-detail__image"><img itemprop="image" src="/content/images/product/default/365157.jpg"></div>
      <div class="box-detail-add__prices">
        <span class="js-online-base-price-without-vat">100,00 Kč</span>
        <span class="js-online-partner-price-without-vat">50,00 Kč</span>
        <span class="js-online-partner-price-with-vat">60,50 Kč</span>
        Sleva 50 %
      </div>
      <div class="box-detail-add__availability"><strong>Skladem</strong>: 10 ks</div>
      <dl><dt>Značka</dt><dd>Kronospan</dd><dt>Jednotka (MJ)</dt><dd>ks</dd></dl>
      <table class="table-params"><tbody>
        <tr><td>Formát materiálu (mm)</td><td>2800 x 2070</td></tr>
        <tr><td>Tloušťka materiálu (mm)</td><td>3</td></tr>
        <tr><td>Číslo dekoru</td><td>101</td></tr>
        <tr><td>Struktura materiálu</td><td>PE</td></tr>
      </tbody></table>
    `;
    const extracted = demosExactIdAdapter.extractExactProduct(document, { requestedProductId: "59678", expectedProductType: "board", expectedManufacturer: null, expectedThicknessMm: 3 });
    expect(extracted).toMatchObject({ ok: true, result: {
      exactIdMatch: true,
      foundProductId: "59678",
      product: { manufacturer: "Kronospan", decorCode: "101", surfaceCode: "PE", previewImageUrl: "https://www.demos24plus.com/content/images/product/default/365157.jpg", thicknessMm: 3, availability: { status: "available" } },
      pricing: { customerPrice: { amount: 50, currency: "CZK", basis: "piece", vatMode: "excluded" }, listPrice: { amount: 100 }, normalizedPrice: { unit: "m2", confidence: "calculated" } }
    } });
    expect(extracted.result!.pricing.normalizedPrice!.amount).toBeCloseTo(50 / 5.796, 6);
  });

  it("keeps a Démos product image hosted on the Slovak image CDN for backend colour extraction", () => {
    document.body.innerHTML = `
      <h1 class="box-detail__top__title">DTD Červená 2800/2070/18</h1>
      <strong class="box-detail__top__code__value">279469</strong>
      <div class="box-detail__image"><img itemprop="image" src="https://www.demos-trade.sk/content/images/product/original/279469.jpg"></div>
      <div class="box-detail-add__availability">Skladem</div>
      <dl><dt>Jednotka (MJ)</dt><dd>ks</dd></dl>
      <table class="table-params"><tbody>
        <tr><td>Formát materiálu (mm)</td><td>2800 x 2070</td></tr>
        <tr><td>Tloušťka materiálu (mm)</td><td>18</td></tr>
      </tbody></table>
    `;

    expect(demosExactIdAdapter.extractExactProduct(document, {
      requestedProductId: "279469", expectedProductType: "board", expectedManufacturer: null, expectedThicknessMm: 18
    })).toMatchObject({ ok: true, result: {
      product: {
        previewImageUrl: "https://www.demos-trade.sk/content/images/product/original/279469.jpg",
        thicknessMm: 18
      }
    } });
  });

  it("uses the board thickness instead of an earlier veneer-thickness parameter", () => {
    document.body.innerHTML = `
      <h1 class="box-detail__top__title">DTDD Dub Radial LINEA 2800/2070/19</h1>
      <strong class="box-detail__top__code__value">540119</strong>
      <div class="box-detail-add__availability">Skladem</div>
      <dl><dt>Jednotka (MJ)</dt><dd>ks</dd></dl>
      <table class="table-params"><tbody>
        <tr><td>Tloušťka dýhy</td><td>0,6</td></tr>
        <tr><td>Tloušťka materiálu (mm)</td><td>19</td></tr>
      </tbody></table>
    `;

    expect(demosExactIdAdapter.extractExactProduct(document, {
      requestedProductId: "540119", expectedProductType: "board", expectedManufacturer: null, expectedThicknessMm: 19
    })).toMatchObject({ ok: true, result: { product: { thicknessMm: 19 } } });
  });

  it("extracts one exact search result and ignores purchase controls", () => {
    document.body.innerHTML = `
      <main class="lb-search__main"><table><tbody><tr class="list-products-line__item lb-product">
        <td class="list-products-line__item__cell--title"><h2>Exact edge</h2></td>
        <td class="list-products-line__item__cell--code">514616</td>
        <td class="js-local-warehouse-availability">Skladem: 5 m</td>
        <td class="js-central-warehouse-availability">Skladem: 10 m</td>
        <td class="list-products-line__item__cell--price-left">20,00 Kč / m</td>
        <td class="list-products-line__item__cell--price">8,00 Kč / m</td>
        <td><button class="js-add-product-to-cart">Do košíku</button></td>
      </tr></tbody></table></main>
    `;
    const extracted = demosExactIdAdapter.extractExactProduct(document, { requestedProductId: "514616", expectedProductType: "edge_band", expectedManufacturer: null, expectedThicknessMm: null });
    expect(extracted).toMatchObject({ ok: true, result: { foundProductId: "514616", pricing: { customerPrice: { amount: 8, basis: "linear_meter" } } } });
  });

  it("returns an explicit not-found error without substituting suggested products", () => {
    document.body.innerHTML = '<main class="lb-search__main"><p>Nenašli jsme žádné vhodné výsledky</p><tr class="lb-product"><td class="list-products-line__item__cell--code">999999</td></tr></main>';
    expect(demosExactIdAdapter.extractExactProduct(document, { requestedProductId: "000001", expectedProductType: "unknown", expectedManufacturer: null, expectedThicknessMm: null }))
      .toEqual({ ok: false, errorCode: "SUPPLIER_PRODUCT_NOT_FOUND", result: null });
  });
});
