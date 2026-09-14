// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { extractSupplierPreviewImage } from "./supplierPreviewImage";
import { demosExactIdAdapter } from "./demos/demosExactIdAdapter";
import { hranipexExactIdAdapter } from "./hranipex/hranipexExactIdAdapter";
import { jafHolzExactIdAdapter } from "./jaf-holz/jafHolzExactIdAdapter";
import { schachermayerExactIdAdapter } from "./schachermayer/schachermayerExactIdAdapter";
import { parseSupplierPageCapture } from "../messages";

vi.hoisted(() => Object.assign(globalThis, {
  __SUPPLIER_BRIDGE_DEBUG__: true, __SUPPLIER_BRIDGE_VERSION__: "test",
  __ARCIGY_ORIGINS__: [], __SUPPLIER_SIMULATOR_ORIGINS__: []
}));

const images = {
  demos: "https://www.demos24plus.com/content/images/product/default/244894.jpeg",
  hranipex: "https://hosting.photorobot.com/images/4748478675156992/decor/NORMAL/swatch?fm=webp&w=1368&h=200&q=85",
  jaf_holz: "https://d1cvtajkxcatn5.cloudfront.net/cache-buster-172077901210/pim/05%20dekore/egger/wood/image-thumb__1__product-teaser/decor.webp",
  schachermayer: "https://webshop.schachermayer.com/cdn/derivates/5/268/319/DV005-ppic_Tischplatte.jpg"
};
const context = (requestedProductId: string) => ({ requestedProductId, expectedProductType: "board" as const, expectedManufacturer: null, expectedThicknessMm: null });
beforeEach(() => { document.body.innerHTML = ""; });

describe("supplier surface images observed on Czech portals", () => {
  it("keeps each supported supplier image through the content-script message boundary", () => {
    for (const [supplierId, previewImageUrl] of Object.entries(images)) {
      const capture = parseSupplierPageCapture({ supplierId, pageType: "product", warnings: [], errorCode: null, candidates: [{
        supplierProductCode: "TEST", normalizedProduct: { displayName: "Test board", productType: "board", manufacturer: null, decorCode: null, surfaceCode: null, thicknessMm: 18, widthMm: null, lengthMm: null, availability: "unknown" },
        previewImageUrl, sourcePageType: "product", sourcePath: "/product/test", observedAt: "2026-09-14T12:00:00.000Z", price: null
      }] });
      expect(capture?.candidates[0]?.previewImageUrl, supplierId).toBe(previewImageUrl);
    }
  });

  it("reads the matching Démos search row without taking a neighbouring decor", () => {
    document.body.innerHTML = `<h1>Search</h1><main class="lb-search__main"><table><tbody>
      <tr class="lb-product"><td class="list-products-line__item__cell--code">OTHER</td><td><img src="${images.demos.replace("244894", "999999")}"></td></tr>
      <tr class="lb-product"><td class="list-products-line__item__cell--code">175718</td><td class="list-products-line__item__cell--title"><h2>Dub</h2></td><td><img src="${images.demos}"></td></tr>
    </tbody></table></main>`;
    const result = demosExactIdAdapter.extractExactProduct(document, context("175718"));
    expect(result.result?.product.previewImageUrl).toBe(images.demos);
  });

  it("skips an already loaded placeholder and tries lazy attributes and picture sources", () => {
    document.body.innerHTML = `<picture><source data-srcset="${images.jaf_holz} 1x"><img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///w=="></picture>`;
    Object.defineProperty(document.querySelector("img"), "currentSrc", { value: "data:image/gif;base64,placeholder" });
    expect(extractSupplierPreviewImage(document, "jaf_holz", "https://www.jafholz.cz/", ["img"])).toBe(images.jaf_holz);
    document.body.innerHTML = `<img src="/not-a-product.jpg" data-src="${images.demos}">`;
    expect(extractSupplierPreviewImage(document, "demos", "https://www.demos24plus.com/", ["img"])).toBe(images.demos);
  });

  it("extracts Hranipex's shared decor for the exact size, requiring selection when ambiguous", () => {
    document.body.innerHTML = `<h1>HU 100733 ABS Hrana Bílá</h1><div class="productGallery-main"><picture><img src="${images.hranipex}"></picture></div><table><tbody>
      <tr class="variantsTable-rowTop"><td>100733X00023100L03 23x1mm</td></tr><tr><td data-price>8 Kč</td></tr>
      <tr class="variantsTable-rowTop"><td>100733X00042100L03 42x1mm</td></tr><tr><td data-price>12 Kč</td></tr>
    </tbody></table>`;
    const result = hranipexExactIdAdapter.extractExactProduct(document, { ...context("100733X00042100L03"), expectedProductType: "edge_band" });
    expect(result.result?.product).toMatchObject({ previewImageUrl: images.hranipex, dimensions: { widthMm: 42 }, thicknessMm: 1 });
    expect(hranipexExactIdAdapter.extractExactProduct(document, context("__ARCIGY_CURRENT_PRODUCT__"))).toMatchObject({ ok: false, errorCode: "SUPPLIER_VARIANT_REQUIRED" });
  });

  it("reads JAF's primary detail gallery and validates its article before related products", () => {
    document.body.innerHTML = `<main><section><h1>DTD test</h1><div>Artiklové číslo <span>14016/5726</span></div><div>Délka 2 790 mm Šířka 1 300 mm Tloušťka 19 mm</div>
      <div class="js-lightbox__item"><picture><img src="data:image/gif;base64,placeholder" data-srcset="${images.jaf_holz} 1x"></picture></div></section>
      <section class="product-teaser js-product"><h3>Related edge</h3><div>Artiklové číslo <span>25322/0019</span></div><img src="${images.jaf_holz.replace("decor.webp", "other.webp")}"></section></main>`;
    const result = jafHolzExactIdAdapter.extractExactProduct(document, context("14016/5726"));
    expect(result).toMatchObject({ ok: true, result: { foundProductId: "14016/5726", source: { pageType: "product_detail" }, product: { previewImageUrl: images.jaf_holz, thicknessMm: 19, dimensions: { lengthMm: 2790, widthMm: 1300 } } } });
    expect(jafHolzExactIdAdapter.extractExactProduct(document, context("25322/0019"))).toMatchObject({ ok: false, errorCode: "SUPPLIER_PRODUCT_ID_MISMATCH" });
    expect(jafHolzExactIdAdapter.extractExactProduct(document, context("__ARCIGY_CURRENT_PRODUCT__")).result?.foundProductId).toBe("14016/5726");
  });

  it("reads Schachermayer's product gallery without taking its logo", () => {
    document.body.innerHTML = `<img src="https://webshop.schachermayer.com/cdn/logo.svg"><div class="article-details-container-layout"><h1>Stolová deska</h1><div>Obj.č.: 103344240</div><div class="grid-article-image"><div class="p-galleria-item"><img src="${images.schachermayer}"></div></div></div>`;
    expect(schachermayerExactIdAdapter.extractExactProduct(document, context("103344240")).result?.product.previewImageUrl).toBe(images.schachermayer);
  });
});
