# Client Catalog

`ClientCatalog` is the tenant-scoped source of truth for materials, components, module visibility, pricing, and kitchen defaults.

## Storage

Catalog files are stored under:

```txt
storage/clients/{clientId}/catalog/
```

The file repository writes only through the tenant storage resolver and uses `ClientContext.clientId` as the source of truth.

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
- Runtime material/component fallback uses `ModuleRuntimeCatalogContext`.
- Missing runtime catalog is a programming error; the app must load or create the catalog through the service first.
