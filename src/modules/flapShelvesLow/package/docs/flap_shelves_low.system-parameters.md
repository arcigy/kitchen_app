# System Parameters

## Identity

Fixed identity metadata required for each exported module instance.

- `typeId`: "flap_shelves_low__type"
- `type`: "flap_shelves_low"
- `displayName`: "Flap"
- `family`: "wall"
- `code`: null
- `variant`: null
- `version`: "1.0.0"

## Dimensions

Nominal module dimensions in millimeters.

- `widthMm`: 900
- `heightMm`: 720
- `depthMm`: 560

## Assembly

Assembly context and kitchen-only module role for the exported module.

- `assemblyContext`: "kitchen"
- `kitchenModuleRole`: "top"

## Placement

Scene placement metadata plus placement-level flags such as requiresWorktop.

- `requiresWorktop`: false
- `positionXmm`: 0
- `positionYmm`: 0
- `positionZmm`: 0
- `rotationZDeg`: 0

## Pricing

Pricing overrides and commercial state used by downstream systems.

- `customPriceOverride`: null
- `pricingEnabled`: true
- `priceSource`: "calculated"
- `costOverride`: null
- `quantity`: 1

## State

Lifecycle and validation state flags for the module.

- `isActive`: true
- `isVisible`: true
- `isLocked`: false
- `isValid`: true
- `validationErrors`: []

## Metadata

Human-facing metadata kept alongside the technical module export.

- `notes`: null
- `tags`: ["wall","flap_shelves_low"]
- `createdAt`: "2026-04-24T17:27:40.819Z"
- `updatedAt`: "2026-04-24T17:27:40.819Z"

## IFC Export

IFC export defaults and BIM classification metadata.

- `exportToIfc`: true
- `ifcClass`: "IfcFurniture"
- `ifcPredefinedType`: null
- `ifcName`: "Flap"
- `ifcDescription`: "Flap (flap_shelves_low)"
- `ifcObjectType`: "wall"
- `ifcTag`: "flap_shelves_low__type"
- `classificationCode`: null
- `classificationSystem`: null
