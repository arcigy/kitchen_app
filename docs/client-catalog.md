# Client Catalog

`ClientCatalog` is the tenant-scoped source of truth for materials, components, module visibility, pricing, and kitchen defaults.

Production and normal development must treat the online tenant database as the source of truth. Do not hardcode client module availability, materials, pricing, presets, or defaults in UI/runtime code. Local files and system templates are seed/import/test artifacts only unless a task explicitly says it is an isolated file-storage test.

## Storage

The production catalog is stored in the tenant database through `arcigy_client_catalogs`.

Legacy/file test catalogs may exist under:

```txt
storage/clients/{clientId}/catalog/
```

The file repository is not the normal runtime source of truth. Use it only for explicit tests, local migration rehearsals, or import/export fixtures. Normal app runtime must load the catalog through the server API backed by the tenant DB.

## Loading

The app loads the catalog before `startApp()` through `GET /api/catalog`.

The server validates the session cookie, derives `clientId` from the server-side session, and calls `ensureCatalogExists(ctx)`. If the tenant catalog does not exist yet, it is seeded from system templates and persisted under the client namespace. Later loads read the stored catalog.

## System Templates

System templates are allowed only for:

- seeding a new tenant catalog
- explicit demo/dev scripts
- tests
- system placeholder behavior that does not carry prices or client data

Runtime UI, BOM/pricing, module geometry, material rendering, and app composition must receive an explicit `ClientCatalog`. They must not silently call `getSystemSeedCatalog()`.

## Runtime Rules

- UI selections use the loaded `ClientCatalog`.
- BOM/pricing receives the same `ClientCatalog`.
- Module visibility is filtered by `catalog.modules.enabled`.
- The kitchen module picker must show only DB/catalog-enabled module packages. Do not add a second hardcoded whitelist in UI code.
- Runtime material/component fallback uses `ModuleRuntimeCatalogContext`.
- Missing runtime catalog is a programming error; the app must load or create the catalog through the service first.
