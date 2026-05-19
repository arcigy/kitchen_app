# `.fqm.source.json` Template

Copy this shape when creating a new system module package source template. Replace placeholders and remove sections that are truly not applicable. Keep the result valid JSON.

```json
{
  "format": "furnquote-module",
  "packageVersion": 1,
  "module": {
    "modulePackageId": "example_module_family_v1",
    "moduleType": "example_module",
    "familyName": "Example Module",
    "displayName": "Example Module",
    "description": "System module definition for Example Module.",
    "category": "custom",
    "version": "1.0.0",
    "isSystemModule": true,
    "tags": ["example"]
  },
  "parameters": {
    "parameters": [
      {
        "key": "type",
        "label": "Type",
        "type": "string",
        "required": true,
        "defaultValue": "example_module",
        "group": "general",
        "affects": "all"
      },
      {
        "key": "width",
        "label": "Width",
        "type": "number",
        "required": true,
        "defaultValue": 800,
        "min": 100,
        "max": 3000,
        "step": 10,
        "unit": "mm",
        "group": "dimensions",
        "affects": "geometry"
      },
      {
        "key": "height",
        "label": "Height",
        "type": "number",
        "required": true,
        "defaultValue": 720,
        "min": 100,
        "max": 3000,
        "step": 10,
        "unit": "mm",
        "group": "dimensions",
        "affects": "geometry"
      },
      {
        "key": "depth",
        "label": "Depth",
        "type": "number",
        "required": true,
        "defaultValue": 560,
        "min": 100,
        "max": 1500,
        "step": 10,
        "unit": "mm",
        "group": "dimensions",
        "affects": "geometry"
      },
      {
        "key": "frontMaterialId",
        "label": "Front material",
        "type": "material",
        "required": false,
        "group": "materials",
        "affects": "visual"
      },
      {
        "key": "handleComponentId",
        "label": "Handle",
        "type": "component",
        "required": false,
        "group": "components",
        "affects": "visual"
      }
    ]
  },
  "placement": {
    "allowedContexts": ["floor"],
    "requiredAnchors": ["floor"],
    "requiresFloor": true,
    "allowFreePlacement": true,
    "collision": {
      "allowOverlap": false
    }
  },
  "constraints": {
    "dimensionRules": {
      "width": { "min": 100, "max": 3000, "step": 10 },
      "height": { "min": 100, "max": 3000, "step": 10 },
      "depth": { "min": 100, "max": 1500, "step": 10 }
    },
    "dependencyRules": [],
    "validationRules": []
  },
  "snapping": {
    "enabled": true,
    "snapTargets": ["floor", "grid"],
    "priority": ["grid"],
    "snapDistanceMm": 50,
    "rotationSnapDeg": 90
  },
  "geometry": {
    "mode": "trusted-runtime",
    "runtimeBuilderKey": "exampleModule.v1"
  },
  "materials": {
    "slots": [
      {
        "slotId": "front",
        "label": "Front material",
        "required": false,
        "defaultFrom": "catalog.kitchenDefaults.frontMaterialId",
        "allowedMaterialTags": ["front"],
        "affects": ["visual", "bom", "pricing"]
      }
    ]
  },
  "components": {
    "slots": [
      {
        "slotId": "handle",
        "label": "Handle",
        "componentType": "handle",
        "required": false,
        "defaultFrom": "catalog.kitchenDefaults.defaultHandleComponentId",
        "affects": ["geometry", "visual", "bom", "pricing"]
      }
    ]
  },
  "behavior": {
    "contextBindings": [
      {
        "contextType": "custom",
        "required": false,
        "scope": "optional",
        "autoAssign": "none",
        "liveSync": false,
        "forbidCrossContextAdjacency": false,
        "parameterSync": [],
        "materialSync": [],
        "componentSync": [],
        "commercialSelectionSync": [],
        "overridePolicy": {
          "allowUserOverride": true,
          "warnWhenDetachedFromContext": false
        }
      }
    ]
  },
  "bom": {
    "rules": [
      {
        "id": "front-area",
        "itemType": "material",
        "source": "materialSlot",
        "sourceKey": "front",
        "quantityFormula": {
          "type": "area",
          "widthParam": "width",
          "heightParam": "height"
        }
      }
    ]
  },
  "pricing": {
    "pricingRefs": [],
    "marginCategory": "custom",
    "quoteGroup": "custom-modules"
  },
  "ui": {
    "icon": "exampleModule-icon.png",
    "previewImage": "exampleModule-preview.png",
    "groups": [
      { "id": "dimensions", "label": "Dimensions", "order": 1 },
      { "id": "materials", "label": "Materials", "order": 2 },
      { "id": "components", "label": "Components", "order": 3 }
    ],
    "controls": [
      { "parameterKey": "width", "controlType": "number", "groupId": "dimensions", "order": 1 },
      { "parameterKey": "height", "controlType": "number", "groupId": "dimensions", "order": 2 },
      { "parameterKey": "depth", "controlType": "number", "groupId": "dimensions", "order": 3 },
      { "parameterKey": "frontMaterialId", "controlType": "materialPicker", "groupId": "materials", "order": 1 },
      { "parameterKey": "handleComponentId", "controlType": "componentPicker", "groupId": "components", "order": 1 }
    ]
  },
  "exports": {
    "exportTags": ["custom"],
    "manufacturingCode": "EXAMPLE_MODULE"
  },
  "manufacturing": {
    "cncStrategy": "custom",
    "edgeBandingStrategy": "custom"
  },
  "assets": {
    "files": [
      {
        "assetId": "icon",
        "fileName": "exampleModule-icon.png",
        "mimeType": "image/png",
        "sizeBytes": 0
      },
      {
        "assetId": "preview",
        "fileName": "exampleModule-preview.png",
        "mimeType": "image/png",
        "sizeBytes": 0
      }
    ]
  },
  "compatibility": {
    "requiredRuntimeBuilderKeys": ["exampleModule.v1"],
    "requiredCatalogFeatures": ["materials", "components"]
  },
  "integrity": {
    "createdAt": "2026-05-19T00:00:00.000Z",
    "updatedAt": "2026-05-19T00:00:00.000Z",
    "author": "Arcigy"
  }
}
```

## Kitchen-Owned Variant

Use this `behavior` block for a module that must belong to one kitchen group and inherit kitchen settings:

```json
{
  "behavior": {
    "contextBindings": [
      {
        "contextType": "kitchenGroup",
        "required": true,
        "scope": "single",
        "autoAssign": "activeKitchenGroup",
        "liveSync": true,
        "forbidCrossContextAdjacency": true,
        "parameterSync": [
          { "targetParameter": "height", "source": "ctx.heightMm" },
          { "targetParameter": "heightCarcass", "source": "ctx.moduleHeightMm" },
          { "targetParameter": "depth", "source": "ctx.moduleDepthMm" },
          { "targetParameter": "plinthHeight", "source": "ctx.plinthHeightMm" },
          { "targetParameter": "plinthSetbackMm", "source": "ctx.plinthDepthMm" },
          {
            "targetParameter": "worktopThicknessMm",
            "source": "ctx.worktopThicknessMm",
            "transform": "resolvedWorktopThickness"
          }
        ],
        "materialSync": [
          {
            "targetSlot": "carcass",
            "source": "ctx.corpusMaterialId",
            "family": "body",
            "thicknessParameter": "boardThickness",
            "aliases": ["body", "shelf"]
          },
          {
            "targetSlot": "front",
            "source": "ctx.frontsMaterialId",
            "family": "front",
            "thicknessParameter": "frontThicknessMm",
            "aliases": ["front"]
          },
          {
            "source": "ctx.backMaterialId",
            "family": "back",
            "thicknessParameter": "backThickness",
            "aliases": ["back"]
          },
          {
            "source": "ctx.drawerBottomMaterialId",
            "family": "drawer_bottom",
            "aliases": ["drawer_bottom"]
          }
        ],
        "componentSync": [
          {
            "targetSlot": "handle",
            "targetParameter": "handleComponentId",
            "source": "ctx.handleComponentId",
            "componentType": "handle",
            "transforms": ["handleGeometryKind", "componentNominalLength"]
          }
        ],
        "commercialSelectionSync": [
          { "source": "materialSnapshot" }
        ],
        "overridePolicy": {
          "allowUserOverride": false,
          "warnWhenDetachedFromContext": true
        }
      }
    ]
  }
}
```

Before using this block, make sure every target parameter exists in `parameters.parameters` and every target slot exists in `materials.slots` or `components.slots`.
