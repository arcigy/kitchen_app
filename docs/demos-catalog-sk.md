# Démos SK Catalog

This branch replaces the default system catalog seed with a generated Démos SK catalog.

## Source Data

The generator reads the categorized scraper exports:

- `plosne_materialy_categorized.csv`
- `komponenty_categorized.csv`

Run:

```powershell
npm run build:demos-catalog
```

Optional overrides:

```powershell
$env:DEMOS_BOARDS_CSV="C:\path\plosne_materialy_categorized.csv"
$env:DEMOS_COMPONENTS_CSV="C:\path\komponenty_categorized.csv"
npm run build:demos-catalog
```

The generated app payload is stored in:

```txt
src/system/catalog-templates/demosCatalog.generated.ts
```

It is gzip/base64 compressed so the repository does not carry the raw 100 MB CSV exports.

## Runtime Catalog Shape

The system seed now uses:

- `materials`: Démos board records
- `components`: Démos component records
- `componentGeometry`: generic trusted geometry archetypes for Démos component types
- `priceList`: Démos EUR prices
- `kitchenDefaults`: defaults resolved from active Démos products

Existing file-backed clients with `meta.source: "system-seed"` are upgraded on catalog load if they do not already contain `mat.demos.*` and `cmp.demos.*` records. Client-custom catalogs are not overwritten silently.

## ID Rules

Every Démos record gets a stable catalog ID:

```txt
mat.demos.{sortiment_code}
cmp.demos.{sortiment_code}
```

If `sortiment_code` is missing, the generator falls back to a listing ID or URL hash. The normal catalog APIs can fetch by those IDs:

- `getMaterialById(ctx, materialId)`
- `getComponentById(ctx, componentId)`
- `createMaterialCatalog(...).getMaterialDefinitionById(id)`
- `createPricingCatalog(...).getComponentDefinitionById(id)`

## Board Split

Boards are visible through `MaterialDefinition.boardFamily` and category names:

| Group | Mapping |
| --- | --- |
| Korpusové dosky | `boardFamily: "body"` |
| Dosky na chrbát MDF/HDF | `boardFamily: "back"` or `"drawer_bottom"` |
| Dvierka/fronty | `boardFamily: "front"` |
| Pracovné dosky | `boardFamily: "worktop"` |
| Police/dekor | `boardFamily: "shelf"` |

The selectors already filter by `boardFamily`, so module parameters that request carcass/front/worktop/back materials now receive Démos boards.

## Component Split

Components are mapped into existing component types:

| UI/use group | `componentType` |
| --- | --- |
| Kľučky / úchytky / madlá | `handle` |
| Nožičky / rektifikácia | `leg` |
| Pánty / závesy | `hinge` |
| Koľajnice / výsuvy | `runner` |
| Ostatné nepoužívané | inactive components tagged `demos-unused` |

Inactive Démos components remain fetchable by ID, but they do not appear in normal module selectors because selectors require `isActive`.

## Supplier Metadata

Every generated material/component carries:

```ts
supplierSource: {
  supplier: "demos-sk",
  supplierProductId,
  url,
  imageUrl,
  usageCategory,
  usageSubcategory,
  sourceCategory,
  rawUnit
}
```

This keeps Démos identity and source links separate from core catalog logic.

## Important Boundaries

- The raw scraper CSV files are not runtime inputs.
- The app uses the generated system catalog payload.
- Parameters and selectors continue to use the existing core catalog contracts.
- Other/unused Démos products are not offered as selectable module components unless explicitly activated later.
