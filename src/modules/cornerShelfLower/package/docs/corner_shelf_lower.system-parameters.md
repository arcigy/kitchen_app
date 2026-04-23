# System Parameters

## Identity

Fixed identity metadata required for each exported module instance.

- `typeId`: "corner_shelf_lower__type"
- `type`: "corner_shelf_lower"
- `displayName`: "Corner"
- `family`: "base"
- `code`: null
- `variant`: "double_door"
- `version`: "1.0.0"

## Dimensions

Nominal module dimensions in millimeters.

- `widthMm`: 1000
- `heightMm`: 720
- `depthMm`: 1000

## Assembly

Assembly context and kitchen-only module role for the exported module.

- `assemblyContext`: "kitchen"
- `kitchenModuleRole`: "base"

## Placement

Scene placement metadata plus placement-level flags such as requiresWorktop.

- `requiresWorktop`: true
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
- `tags`: ["base","corner_shelf_lower"]
- `createdAt`: "2026-04-22T22:34:04.656Z"
- `updatedAt`: "2026-04-22T22:34:04.656Z"

## IFC Export

IFC export defaults and BIM classification metadata.

- `exportToIfc`: true
- `ifcClass`: "IfcFurniture"
- `ifcPredefinedType`: null
- `ifcName`: "Corner"
- `ifcDescription`: "Corner (corner_shelf_lower)"
- `ifcObjectType`: "base"
- `ifcTag`: "corner_shelf_lower__type"
- `classificationCode`: null
- `classificationSystem`: null
