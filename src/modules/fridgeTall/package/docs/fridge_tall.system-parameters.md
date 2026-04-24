# System Parameters

## Identity

Fixed identity metadata required for each exported module instance.

- `typeId`: "fridge_tall__type"
- `type`: "fridge_tall"
- `displayName`: "Fridge"
- `family`: "tall"
- `code`: null
- `variant`: "integrated_fridge"
- `version`: "1.0.0"

## Dimensions

Nominal module dimensions in millimeters.

- `widthMm`: 600
- `heightMm`: 1916
- `depthMm`: 600

## Assembly

Assembly context and kitchen-only module role for the exported module.

- `assemblyContext`: "kitchen"
- `kitchenModuleRole`: "tall"

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
- `tags`: ["tall","fridge_tall"]
- `createdAt`: "2026-04-22T23:32:43.819Z"
- `updatedAt`: "2026-04-22T23:32:43.819Z"

## IFC Export

IFC export defaults and BIM classification metadata.

- `exportToIfc`: true
- `ifcClass`: "IfcFurniture"
- `ifcPredefinedType`: null
- `ifcName`: "Fridge"
- `ifcDescription`: "Fridge (fridge_tall)"
- `ifcObjectType`: "tall"
- `ifcTag`: "fridge_tall__type"
- `classificationCode`: null
- `classificationSystem`: null
