# Project materials phase

The Materials phase assigns tenant catalog materials and components to one project. It does not own a second catalog and it does not calculate a project price.

## Sources of truth

- `ClientCatalog` is the tenant-owned material, component and price-list source.
- `ProjectSaveFile.appState.materialAssignments` is the project-owned assignment source.
- Every selected ID is stored together with a catalog definition and unit-price snapshot. A later catalog edit or deactivation therefore does not corrupt an older project.
- Quantities are recalculated on the server from the saved layout, kitchen context and module BOM. Client `bomSnapshot` data is never authoritative and is not used by the Materials API.

## Categories

The stable categories are corpus, front, worktop, plinth, back, drawer bottom, front/other edge, handle, hinge, runner, lift-up, leg, fastener and other component. Category definitions own the permitted catalog type, quantity unit and default source.

## API

- `GET /api/projects/:id/materials` returns only the project assignments, quantities, typed warnings and price-list metadata.
- `PUT /api/projects/:id/materials` atomically validates and replaces one category assignment. It also supports revision-safe `copy_assignment` for a live module/addition target and `remove_assignment` for an existing scoped override. General settings assignments cannot be removed. The request includes the last assignment revision; a stale revision returns `409`.
- `POST /api/projects/:id/materials/validate` validates a draft without changing the project.
- `GET /api/projects/:id/warnings` returns the same assignment validator output.
- `GET /api/materials/by-code/:code` and `GET /api/components/by-code/:code` are tenant-scoped exact lookups.
- `/api/catalog/lookup?kind=material|component&id=...` uses the same exact lookup service for existing clients.

The client never sends `clientId`; tenant scope is taken from the authenticated session. Lookup responses contain one record and its unit price, never the full catalog.

The generic project-save endpoint preserves the server copy of material assignments and cannot be used to bypass the dedicated assignment validation. Viewers cannot mutate either path.

## Lookup and failure behavior

Exact lookup checks catalog ID, explicit material/component code, then the supplier product ID. Ambiguous supplier aliases are resolved only when one canonical shortest ID exists; otherwise the lookup fails instead of selecting an arbitrary record. Results are cached per tenant with a bounded TTL/LRU cache and invalidated after a catalog write. Inactive records are returned so the validator can describe the real problem.

The input keeps a draft ID separate from the committed assignment. A missing, inactive or category-incompatible ID returns an error and leaves the committed assignment and snapshot unchanged.

## Save compatibility

Project save format v2 includes the assignment state in the active phase and `appState`. Loading v1 adds an uninitialized empty state; the first Materials open creates tenant defaults. File, PostgreSQL and encrypted `.fqp` loads migrate before validation.

The phase shows unit prices only (`EUR/m²`, `EUR/bm`, `EUR/ks`). Assignment validation requires the catalog price unit to match the category quantity unit, so a board priced by area cannot silently serve as a linear plinth item. Price multiplication, quote totals, exports and supplier scraping are intentionally outside this slice.

## Supplier-assisted material assignment

Materials uses a browse-first workflow. The user opens one supplier from the project, finds a product manually, opens its detail and assigns the currently visible product to a canonical project group from the Chrome Side Panel. The normal Materials UI does not ask for supplier product IDs and does not repeat a supplier selector for every group.

Available suppliers are tenant configuration, not a frontend constant. `arcigy_suppliers` is the shared supplier registry and `arcigy_client_suppliers` is the many-to-many client assignment. One supplier can therefore be enabled for several clients without becoming visible to every tenant. `GET /api/suppliers` returns only active assignments for the authenticated client, and session creation rejects a supplier that is not enabled for that client.

Explicit group selection upserts a tenant `SupplierCatalogItem`, a `MaterialSupplierAssignment`, and the project snapshot. Product name, supplier code, dimensions, thickness, availability and a compatible normalized price are copied from the read-only capture. The previous project price remains intact after a failed refresh. An unchanged amount/unit/VAT combination reuses the price-history row and updates its verification time; a changed combination creates a new observation.

The Chrome bridge uses one supplier tab, optional permissions for the selected Czech origin, stable page-load checks and sanitized local diagnostics. It cannot order, add to cart, change an account, store supplier credentials, read cookies or run a server-side supplier scraper.
