# Supplier Bridge material colours (0.3.17)

## Owner and preservation baseline

The existing exact-ID supplier adapters own image selection. The shared
`supplier-preview-image` contract validates the ephemeral URL in both the
extension message boundary and the authenticated server endpoint. The existing
`supplierBridgePreviewImage` owner decodes it and returns only HEX. The existing
project assignment/updater, catalog snapshots and FQP serializers remain the
authority for applying and saving the result. `app.ts` is unchanged.

Before this change, only Démos detail pages provided an image; message validation,
the assignment flow and the server rejected or skipped the other three suppliers.
Démos search rows lost their images. A repeated assignment of the same product
stopped before refreshing its colour. JAF's detail page was not extracted.

Intentionally extended: all four supported Czech suppliers can provide the
colour of boards, worktops and edge strips. Existing assignments can be refreshed
by explicitly assigning the same product again. Hranipex allows entry of the
exact size-variant code instead of guessing among multiple sizes on one page.
Preserved: tenant supplier permissions, exact IDs, prices/VAT/units, geometry,
project ownership, confirmation boundaries, snapshots, FQP and component finishes.
No live data migration or automatic recapture is performed.

## Live evidence, 2026-09-14

Inspected public product DOM in the browser; Démos used the existing authorized
supplier session. No account details, credentials, personalized prices or full
page dumps were saved as fixtures. Each public image also returned HTTP 200 to
the server without supplier credentials and decoded through the new sampler.

| Supplier | Verified source | Image handling | Sample result |
| --- | --- | --- | --- |
| Démos | [H3303 board, product 175718](https://www.demos24plus.com/product/175718/) | `img.image-product`; `/content/images/product/default/244894.jpeg`. Image ID differs from product ID; never synthesize it. Exact search-row image is supported too. | `#BF9D70` |
| Hranipex | [HU 100733 edge](https://www.hranipex.cz/cs/produkt/hu-100733-abs-hrana-bila-hladka-mat-2225/) | `.productGallery-main picture img`; `hosting.photorobot.com/images/4748478675156992/…`; responsive WebP, wide strip. Shared decor belongs to the exact requested size row. | `#FAF7F2` |
| JAF Holz | [DTD category](https://www.jafholz.cz/shop/plosne-materialy/laminovane-materialy/dtd-laminovane~c14208180), [detail 14016/5726](https://www.jafholz.cz/shop/plosne-materialy/laminovane-materialy/dtd-laminovane/dtd-optiboard-trend-collection-25726-ommn-hneda-cameroon---vybehovy-dekor~p15226257) | Primary detail gallery or exact result card; `data-srcset` / `picture source` behind a GIF placeholder; verified `d1cvtajkxcatn5.cloudfront.net` PIM path. Product-detail icons and related items are excluded. | Fundermax 0606 category swatch: `#F5F4F7` |
| Schachermayer | [Table board 103344240](https://webshop.schachermayer.com/cat/cs-CZ/product/stolov-deska-1400-800-25-mm-sv-tle-ed/103344240) | `.grid-article-image .p-galleria-item img`; `/cdn/derivates/…`. Logo and app-bar images are excluded. | `#E1E1DF` |

These are approximate colours from supplier photographs, not calibrated paint
codes. A supplier may change its photos, markup, CDN or access policy. Tests use
minimal synthetic DOM fixtures reflecting the observed structure; they do not
depend on live supplier prices or network availability.

## Processing and failure behaviour

- Try loaded image, lazy attributes, responsive sources and explicit image
  metadata within the selected product. An invalid placeholder does not prevent
  trying another source. Do not guess a colour from a decor name.
- Accept only verified HTTPS product-image paths belonging to the session's
  supplier. Reject credentials, other ports/hosts, traversal, placeholders and
  unrelated shared-CDN accounts. Redirects remain disabled.
- Bound transfer to 4 MiB and 8 seconds; bound decoding to 16 million pixels.
  Convert grayscale/CMYK to sRGB, respect orientation/transparency, resize while
  retaining aspect ratio and average the central surface. Avoid white-background
  bias while retaining white decors.
- Keep decoded bytes transient and clear buffers after processing. The bounded
  15-minute cache stores only HEX with a hashed tenant/supplier/image key.
- A failed/missing surface sample stops before candidate confirmation. Existing
  material remains assigned; retry is available. Hardware photographs do not
  overwrite component finishes.

## Manual test on develop

1. Update the unpacked Supplier Bridge to **0.3.17**, reload the extension in
   Chrome and refresh the open Arcigy/supplier tabs. The server update alone
   cannot update an already installed content script.
2. Open a test project and a supplier enabled for that company. In Bridge choose
   the project, open a specific board/worktop and click its target material group.
3. Verify the image-found message, resulting HEX swatch and colour on the assigned
   boards. Try a wood decor, white decor and dark/grey decor; check that another
   material group and hardware finishes remain unchanged.
4. Repeat for all enabled suppliers. For Hranipex paste the code beside the
   required edge size into **Kód rozmerového variantu**, then assign the edge.
   Do not confuse the decor code with the full size-variant code.
5. Assign the same product again: colour must be sampled again. Change supplier
   tabs and verify the assignment uses the supplier actually captured.
6. Test a missing/unavailable image: show a recoverable error and keep the old
   assignment. Retry after opening the valid product detail.
7. Save, close/reopen and export/import FQP; compare colour, assigned product,
   dimensions and prices. Check another company's supplier list and project
   isolation. Inspect the console for unexpected errors.

## Automated evidence and rollback

Unit fixtures cover all supplier message paths, lazy/responsive images, exact
JAF detail identity, Hranipex variant selection, blocked image URLs, grayscale,
white/transparent images, invalid/oversized responses and isolated caches.
HTTP regression derives synthetic image colours through the real endpoint,
confirms all four supplier assignments and checks FQP restoration without image
URLs. Unpacked-extension E2E covers actual capture/assignment UI, repeat capture,
Hranipex variant input and failure preservation using isolated supplier fixtures.
The full application UI suite includes save/load, FQP, material and recovery gates.

Rollback: revert this scoped PR through the protected workflow and restore the
previous extension build. No schema or customer-data rollback is required.
