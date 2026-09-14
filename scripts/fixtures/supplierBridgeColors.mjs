// Minimal public product DOM structures inspected on 2026-09-14.
// Synthetic names/prices/identifiers; no supplier accounts or customer data.
export const supplierColorFixtures = [
  {
    supplierId: "demos", label: "Démos", code: "175718", category: "corpus",
    url: "https://www.demos24plus.com/product/175718/",
    imageUrl: "https://www.demos24plus.com/content/images/product/default/244894.jpeg",
    html(image) { return `<h1 class="box-detail__top__title">Test board</h1><span class="box-detail__top__code__value">175718</span><img class="image-product" src="${image}"><table class="table-params"><tbody><tr><td>Tloušťka materiálu</td><td>18 mm</td></tr></tbody></table><div class="box-detail-add__prices"><span class="js-online-partner-price-without-vat">100 Kč</span> / m2</div>`; }
  },
  {
    supplierId: "hranipex", label: "Hranipex", code: "100733X00042100L03", category: "edge_front",
    url: "https://www.hranipex.cz/cs/produkt/hu-100733-abs-hrana-bila-hladka-mat-2225/",
    imageUrl: "https://hosting.photorobot.com/images/4748478675156992/decor/NORMAL/swatch?fm=webp&w=1368&h=200&q=85",
    html(image) { return `<h1>HU 100733 Test edge</h1><div class="productGallery-main"><picture><img src="${image}"></picture></div><table><tbody><tr class="variantsTable-rowTop"><td>100733X00023100L03 23x1mm</td></tr><tr><td data-price>8 Kč</td></tr><tr class="variantsTable-rowTop"><td>100733X00042100L03 42x1mm</td></tr><tr><td data-price>12 Kč</td></tr></tbody></table>`; }
  },
  {
    supplierId: "jaf_holz", label: "JAF Holz", code: "14016/5726", category: "corpus",
    url: "https://www.jafholz.cz/shop/plosne-materialy/laminovane-materialy/dtd-laminovane/dtd-optiboard-trend-collection-25726-ommn-hneda-cameroon---vybehovy-dekor~p15226257",
    imageUrl: "https://d1cvtajkxcatn5.cloudfront.net/cache-buster-123/pim/05%20dekore/test.webp",
    html(image) { return `<main><section><h1>Test board</h1><div>Artiklové číslo <span>14016/5726</span></div><div>Délka 2 790 mm Šířka 1 300 mm Tloušťka 18 mm</div><div class="js-lightbox__item"><picture><img data-srcset="${image} 1x"></picture></div></section></main>`; }
  },
  {
    supplierId: "schachermayer", label: "Schachermayer", code: "103344240", category: "worktop",
    url: "https://webshop.schachermayer.com/cat/cs-CZ/product/stolov-deska-1400-800-25-mm-sv-tle-ed/103344240",
    imageUrl: "https://webshop.schachermayer.com/cdn/derivates/5/268/319/table.jpg",
    html(image) { return `<div class="article-details-container-layout"><h1>Test worktop</h1><div>Obj.č.: 103344240</div><div class="grid-article-image"><div class="p-galleria-item"><img src="${image}"></div></div><div>Vaše cena CZK 100 za 1 KS</div></div>`; }
  }
];
