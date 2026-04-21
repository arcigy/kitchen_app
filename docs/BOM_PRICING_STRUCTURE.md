# Commercial BOM And Pricing Structure

This document defines the BOM and pricing structure that `module-builder-dev` supports.

## 1. Supported BOM item types

Every commercial BOM item must be one of:

- `board`
- `edge_band`
- `hardware`

Every item must contain:

- `id`
- `itemType`
- `category`
- `name`
- `description`
- `pricingBasis`
- `pricingUnit`
- `quantity`
- `pricingQuantity`
- `formulas`
- `pricingLookup`
- `sourcePartIds`

Optional item enrichments:

- `dimensionsMm`
- `metrics`
- `materialSlotId`
- `materialGroup`
- `material`
- `component`
- `catalogRef`
- `notes`

## 2. Pricing basis rules

- `board` uses `pricingBasis = "sheet_area"` and `pricingUnit = "m2"`
- `edge_band` uses `pricingBasis = "linear_length"` and `pricingUnit = "lm"`
- `hardware` uses `pricingBasis = "piece"` and `pricingUnit = "pcs"`

## 3. Board pricing rules

Boards carry:

- `metrics.areaM2`
- `metrics.billableAreaM2`
- `metrics.wasteMultiplier`

Current pricing rule:

- `billableAreaM2 = areaM2 * 1.1`
- `pricingQuantity = billableAreaM2`

This means:

- BOM keeps real net board area
- pricing uses waste-adjusted area

## 4. Edge banding rules

Current `drawer_low` rules:

- MDF boards are never edge banded
- edge banding is applied only to:
  - `left-side` front edge
  - `right-side` front edge
  - `bottom-panel` front edge
  - `top-panel` front edge

No other board gets edge banding in this rule set.

## 5. Hardware counting rules

Current `drawer_low` rules:

- `drawer-handles = drawerCount`
- `handle-screws = drawerCount * 2`
- `adjustable-legs`
  - `width <= 600 => 4`
  - `width <= 900 => 5`
  - `width > 900 => 6`
- `plinth-clips = floor(adjustableLegCount / 2)`
- `carcass-fastener-set = max(12, 8 + drawerCount * 4)`
- every drawer box adds one `runner-pair`

## 6. Aggregates required by the pricing system

Commercial BOM payloads expose:

- `summary`
- `aggregates.boardsByMaterial`
- `aggregates.edgeBandsByMaterial`
- `aggregates.componentsByCatalogId`

These aggregates are the supported source for:

- board m2 per material
- edge lm per material
- component pcs per catalog component

## 7. Generic pricing calculator contract

The generic pricing calculator expects:

- a BOM in `module-quote-bom.v1` structure
- valid `pricingLookup.key`
- valid `pricingQuantity`
- optional exact `material` / `component` metadata

It returns:

- item-level unit prices and costs
- grouped totals for boards / edge bands / hardware
- top-level totals:
  - `materialCost`
  - `laborCostFixed`
  - `subtotalCost`
  - `marginAmount`
  - `finalPrice`
- explicit pricing inputs and formulas

## 8. Validation rules

The calculator marks pricing as incomplete when:

- `pricingLookup.key` is missing
- `pricingQuantity` is missing or invalid
- required board dimensions are missing
- unit price is missing in the catalog
- computed `itemCost` is non-finite
- module-specific front validation fails

In those cases:

- `pricingStatus = "incomplete"`
- errors are listed in `validationErrors`
- broken items keep their own `validationErrors`

## 9. Guidance for future modules

To stay compatible with this pricing pipeline:

1. Build BOM items in the same shape.
2. Always provide exact `pricingLookup.key`.
3. For boards, provide both net and billable metrics if waste applies.
4. Keep component counts as explicit hardware items.
5. Keep material and component identities stable through `catalogRef` and exact catalog IDs.
