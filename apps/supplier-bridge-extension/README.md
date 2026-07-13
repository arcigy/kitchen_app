# Arcigy Supplier Bridge – Phase 1 + exact-ID foundation

Manifest V3 Chrome extension for user-assisted material and price capture. The Arcigy backend owns sessions, items, candidates, price observations, mappings, token consumption, and final project updates. The extension keeps only a recoverable progress copy in `chrome.storage.local`; one-time and session access tokens are stored only in `chrome.storage.session`.

## Architecture

- Arcigy Materials UI creates `SupplierSyncSession` through the existing authenticated backend.
- An exact-origin Arcigy content script validates `window.postMessage` requests and forwards only `sessionId` plus the one-time bridge token.
- The MV3 service worker routes messages, talks to the backend, coordinates the user-opened supplier tab, and restores progress from storage. It contains no long-running job loop.
- The React Side Panel is the primary UI. The toolbar action only opens this panel.
- Capability-based supplier adapters extract only the currently visible page after an explicit user click.
- `MockSupplierAdapter` supports only the local simulator in a debug build.
- Exact-ID jobs preserve supplier product IDs as text, including leading zeroes, punctuation and slashes.
- The extension contains read-only adapters only for approved Czech origins. Which adapters appear to a user is controlled by the tenant-scoped `arcigy_client_suppliers` database assignment; the extension registry is not the client-visibility source of truth.
- Read-only exact-ID adapters are implemented for all four Czech portals. They use verified logged-in markers, exact search/result/detail selectors, customer prices, units and availability; they never invoke cart, quick-buy, order, login, logout or account actions.

## Local run

1. Start Arcigy and its worker with `npm run dev` (UI `http://127.0.0.1:5180`, API `http://127.0.0.1:5191`).
2. Start the independent simulator with `npm run dev:supplier-simulator` (`http://127.0.0.1:5192`).
3. Build the extension with `npm run build:debug`.
4. Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select `apps/supplier-bridge-extension/dist-debug`.
5. Open an existing Arcigy project, enter **Materiály**, and click a supplier enabled for the current tenant. Arcigy creates the project-scoped session, opens the supplier portal and attempts to open the Side Panel.
6. Find and open a product detail manually. In the Side Panel choose **Pridať aktuálny produkt** and then the target group such as Korpus, Fronty, Sokel or Chrbát. That explicit group click captures and confirms the visible product.

The simulator supports `/login`, `/search`, `/product/:id`, and `/cart`. Its debug selector covers logged-in/expired sessions, exact/multiple/no results, missing and delayed prices, sheet/m²/package/net/gross prices, SPA navigation, missing markup, unavailable products, and supplier timeout.

If automatic Side Panel opening is rejected by Chrome, click the Arcigy Supplier Bridge toolbar icon. `minimum_chrome_version` is 116 because this workflow uses `chrome.sidePanel.open()`.

## Diagnostic export

Use the debug Side Panel's **Diagnostický záznam** section while the real supplier page is open in the single Supplier Bridge tab. **Bezpečne analyzovať kartu dodávateľa** proposes sanitized search/product/price/unit/availability fields; manual field picking remains available. The full JSON preview is shown before a local download.

The export is limited to 64 KB and contains only the selected node, at most two parents and two siblings, approved `id`/`class`/`data-*`/`aria-*` attributes, shortened/redacted text, candidate selectors, pathname without query parameters, and extension version. It does not read or export cookies, browser storage, authorization data, passwords, request headers, full HTML, or account data. The file is never uploaded automatically.

## Builds and security

- `npm run build:debug` includes exact localhost Arcigy/API/simulator origins, the mock adapter, diagnostic recorder, and debug UI.
- `npm run build:production` includes only the exact configured Arcigy production origin and excludes localhost, simulator fixtures, mock adapter code, diagnostic recorder, and debug screens. Override the known deployment only with `SUPPLIER_BRIDGE_ARCIGY_PRODUCTION_ORIGIN=https://exact-origin.example` at build time.
- The manifest does not request `all_urls`, `cookies`, `debugger`, `webRequest`, or `offscreen`. Supplier access is optional and requested only after the user clicks **Otvoriť supplier**, only for that supplier's exact Czech origin.
- Capture waits for the supplier tab to finish loading, rejects navigation outside the configured origin, never reads browser profile files, and never performs cart, quick-buy, order, login, logout or account mutations.
- Logs are structured and remove token-, cookie-, authorization-, password-, secret-, and DOM-like fields.

## Maintaining real supplier adapters

1. Re-verify the authorized Chrome session or use the debug diagnostic analyzer after a supplier changes its logged-in search/result/product markup.
2. Store approved, sanitized fixtures as non-production test inputs; never copy cookies, tokens, full HTML, headers, or personal account data.
3. Document verified page types, stable selectors, real search URL behavior, login-expired signals, units, VAT labels, async rendering, and supported capabilities.
4. Keep the capability set read-only. Never use any supplier cart, quick-buy, order, favorites or account action.
5. Add fixture-driven unit tests, permission review for the exact real supplier origin, and unpacked-extension E2E coverage.
6. Keep an adapter production-ready only while its exact-ID and price extraction remains verified against the real Czech portal.

## Verification

Run `npm run typecheck`, `npm run lint`, `npm run test:supplier-bridge`, `npm run test:supplier-bridge:integration`, `npm run test:supplier-bridge:e2e`, `npm run build:debug`, `npm run build:production`, and `npm run build:supplier-simulator`.
