export const moduleType = "fridge_tall";
export const displayName = "Fridge";
export const edgeBomSnapshot = {
  "schemaVersion": "module-edge-bom.v1",
  "moduleType": "fridge_tall",
  "displayName": "Fridge",
  "generatedAt": "2026-04-24T13:35:45.700Z",
  "items": [
    {
      "id": "carcass-side-left-edge-front",
      "itemType": "edge_band",
      "category": "carcass",
      "name": "Carcass Side Left front Edge Band",
      "description": "Carcass Side Left front edge band",
      "pricingBasis": "linear_length",
      "pricingUnit": "lm",
      "quantity": 1,
      "pricingQuantity": 1.816,
      "formulas": {
        "edgeLengthMm": "partMap(carcass-side-left).edgeTargets.front",
        "quantity": "1",
        "pricingQuantity": "(edgeLengthMm * quantity) / 1000"
      },
      "metrics": {
        "edgeLengthLm": 1.816
      },
      "materialSlotId": "left-side",
      "materialGroup": "body",
      "material": {
        "role": "body",
        "key": "mat.edge.body.abs.white.0_8",
        "catalogId": "mat.edge.body.abs.white.0_8",
        "entityType": "material",
        "materialType": "edge",
        "category": "Body Edge Bands",
        "family": "body",
        "name": "ABS Body White 0.8",
        "displayName": "ABS Body Edge White 0.8 mm",
        "colorHex": "#f3f3ef",
        "baseMaterial": "abs",
        "decor": "White",
        "color": "White",
        "finish": "Satin",
        "defaultThicknessMm": 0.8,
        "availableThicknessesMm": [
          0.5,
          0.8,
          2
        ],
        "preview": {
          "colorHex": "#f3f3ef",
          "roughness": 0.62,
          "metalness": 0.02
        },
        "assignmentSource": "catalog"
      },
      "catalogRef": {
        "entityType": "material",
        "catalogId": "mat.edge.body.abs.white.0_8",
        "displayName": "ABS Body Edge White 0.8 mm",
        "group": "body",
        "pricingBasis": "linear_length",
        "pricingUnit": "lm"
      },
      "pricingLookup": {
        "catalogType": "edge_band",
        "key": "mat.edge.body.abs.white.0_8",
        "sourceCatalogId": "mat.edge.body.abs.white.0_8",
        "sourceEntityType": "material",
        "resolution": "catalog_id"
      },
      "sourcePartIds": [
        "carcass-side-left"
      ],
      "notes": [
        "edgeId=front",
        "reason=Front vertical edge is visible at the carcass opening."
      ]
    },
    {
      "id": "carcass-side-right-edge-front",
      "itemType": "edge_band",
      "category": "carcass",
      "name": "Carcass Side Right front Edge Band",
      "description": "Carcass Side Right front edge band",
      "pricingBasis": "linear_length",
      "pricingUnit": "lm",
      "quantity": 1,
      "pricingQuantity": 1.816,
      "formulas": {
        "edgeLengthMm": "partMap(carcass-side-right).edgeTargets.front",
        "quantity": "1",
        "pricingQuantity": "(edgeLengthMm * quantity) / 1000"
      },
      "metrics": {
        "edgeLengthLm": 1.816
      },
      "materialSlotId": "right-side",
      "materialGroup": "body",
      "material": {
        "role": "body",
        "key": "mat.edge.body.abs.white.0_8",
        "catalogId": "mat.edge.body.abs.white.0_8",
        "entityType": "material",
        "materialType": "edge",
        "category": "Body Edge Bands",
        "family": "body",
        "name": "ABS Body White 0.8",
        "displayName": "ABS Body Edge White 0.8 mm",
        "colorHex": "#f3f3ef",
        "baseMaterial": "abs",
        "decor": "White",
        "color": "White",
        "finish": "Satin",
        "defaultThicknessMm": 0.8,
        "availableThicknessesMm": [
          0.5,
          0.8,
          2
        ],
        "preview": {
          "colorHex": "#f3f3ef",
          "roughness": 0.62,
          "metalness": 0.02
        },
        "assignmentSource": "catalog"
      },
      "catalogRef": {
        "entityType": "material",
        "catalogId": "mat.edge.body.abs.white.0_8",
        "displayName": "ABS Body Edge White 0.8 mm",
        "group": "body",
        "pricingBasis": "linear_length",
        "pricingUnit": "lm"
      },
      "pricingLookup": {
        "catalogType": "edge_band",
        "key": "mat.edge.body.abs.white.0_8",
        "sourceCatalogId": "mat.edge.body.abs.white.0_8",
        "sourceEntityType": "material",
        "resolution": "catalog_id"
      },
      "sourcePartIds": [
        "carcass-side-right"
      ],
      "notes": [
        "edgeId=front",
        "reason=Front vertical edge is visible at the carcass opening."
      ]
    },
    {
      "id": "carcass-top-edge-front",
      "itemType": "edge_band",
      "category": "carcass",
      "name": "Carcass Top front Edge Band",
      "description": "Carcass Top front edge band",
      "pricingBasis": "linear_length",
      "pricingUnit": "lm",
      "quantity": 1,
      "pricingQuantity": 0.564,
      "formulas": {
        "edgeLengthMm": "partMap(carcass-top).edgeTargets.front",
        "quantity": "1",
        "pricingQuantity": "(edgeLengthMm * quantity) / 1000"
      },
      "metrics": {
        "edgeLengthLm": 0.564
      },
      "materialSlotId": "top-panel",
      "materialGroup": "body",
      "material": {
        "role": "body",
        "key": "mat.edge.body.abs.white.0_8",
        "catalogId": "mat.edge.body.abs.white.0_8",
        "entityType": "material",
        "materialType": "edge",
        "category": "Body Edge Bands",
        "family": "body",
        "name": "ABS Body White 0.8",
        "displayName": "ABS Body Edge White 0.8 mm",
        "colorHex": "#f3f3ef",
        "baseMaterial": "abs",
        "decor": "White",
        "color": "White",
        "finish": "Satin",
        "defaultThicknessMm": 0.8,
        "availableThicknessesMm": [
          0.5,
          0.8,
          2
        ],
        "preview": {
          "colorHex": "#f3f3ef",
          "roughness": 0.62,
          "metalness": 0.02
        },
        "assignmentSource": "catalog"
      },
      "catalogRef": {
        "entityType": "material",
        "catalogId": "mat.edge.body.abs.white.0_8",
        "displayName": "ABS Body Edge White 0.8 mm",
        "group": "body",
        "pricingBasis": "linear_length",
        "pricingUnit": "lm"
      },
      "pricingLookup": {
        "catalogType": "edge_band",
        "key": "mat.edge.body.abs.white.0_8",
        "sourceCatalogId": "mat.edge.body.abs.white.0_8",
        "sourceEntityType": "material",
        "resolution": "catalog_id"
      },
      "sourcePartIds": [
        "carcass-top"
      ],
      "notes": [
        "edgeId=front",
        "reason=Front horizontal edge is visible at the opening line."
      ]
    },
    {
      "id": "carcass-bottom-edge-front",
      "itemType": "edge_band",
      "category": "carcass",
      "name": "Carcass Bottom front Edge Band",
      "description": "Carcass Bottom front edge band",
      "pricingBasis": "linear_length",
      "pricingUnit": "lm",
      "quantity": 1,
      "pricingQuantity": 0.564,
      "formulas": {
        "edgeLengthMm": "partMap(carcass-bottom).edgeTargets.front",
        "quantity": "1",
        "pricingQuantity": "(edgeLengthMm * quantity) / 1000"
      },
      "metrics": {
        "edgeLengthLm": 0.564
      },
      "materialSlotId": "bottom-panel",
      "materialGroup": "body",
      "material": {
        "role": "body",
        "key": "mat.edge.body.abs.white.0_8",
        "catalogId": "mat.edge.body.abs.white.0_8",
        "entityType": "material",
        "materialType": "edge",
        "category": "Body Edge Bands",
        "family": "body",
        "name": "ABS Body White 0.8",
        "displayName": "ABS Body Edge White 0.8 mm",
        "colorHex": "#f3f3ef",
        "baseMaterial": "abs",
        "decor": "White",
        "color": "White",
        "finish": "Satin",
        "defaultThicknessMm": 0.8,
        "availableThicknessesMm": [
          0.5,
          0.8,
          2
        ],
        "preview": {
          "colorHex": "#f3f3ef",
          "roughness": 0.62,
          "metalness": 0.02
        },
        "assignmentSource": "catalog"
      },
      "catalogRef": {
        "entityType": "material",
        "catalogId": "mat.edge.body.abs.white.0_8",
        "displayName": "ABS Body Edge White 0.8 mm",
        "group": "body",
        "pricingBasis": "linear_length",
        "pricingUnit": "lm"
      },
      "pricingLookup": {
        "catalogType": "edge_band",
        "key": "mat.edge.body.abs.white.0_8",
        "sourceCatalogId": "mat.edge.body.abs.white.0_8",
        "sourceEntityType": "material",
        "resolution": "catalog_id"
      },
      "sourcePartIds": [
        "carcass-bottom"
      ],
      "notes": [
        "edgeId=front",
        "reason=Front horizontal edge remains exposed above the plinth line."
      ]
    },
    {
      "id": "door-front-upper-edge-left",
      "itemType": "edge_band",
      "category": "front",
      "name": "Door Front Upper left Edge Band",
      "description": "Door Front Upper left edge band",
      "pricingBasis": "linear_length",
      "pricingUnit": "lm",
      "quantity": 1,
      "pricingQuantity": 0.7,
      "formulas": {
        "edgeLengthMm": "partMap(door-front-upper).edgeTargets.left",
        "quantity": "1",
        "pricingQuantity": "(edgeLengthMm * quantity) / 1000"
      },
      "metrics": {
        "edgeLengthLm": 0.7
      },
      "materialSlotId": "freezer-door-front",
      "materialGroup": "front",
      "material": {
        "role": "front",
        "key": "mat.edge.front.abs.white.1",
        "catalogId": "mat.edge.front.abs.white.1",
        "entityType": "material",
        "materialType": "edge",
        "category": "Front Edge Bands",
        "family": "front",
        "name": "ABS Front White 1",
        "displayName": "ABS Front Edge White 1 mm",
        "colorHex": "#f3f3ef",
        "baseMaterial": "abs",
        "decor": "White",
        "color": "White",
        "finish": "Supermat Match",
        "defaultThicknessMm": 1,
        "availableThicknessesMm": [
          1,
          2
        ],
        "preview": {
          "colorHex": "#f3f3ef",
          "roughness": 0.9,
          "metalness": 0.02
        },
        "assignmentSource": "catalog"
      },
      "catalogRef": {
        "entityType": "material",
        "catalogId": "mat.edge.front.abs.white.1",
        "displayName": "ABS Front Edge White 1 mm",
        "group": "front",
        "pricingBasis": "linear_length",
        "pricingUnit": "lm"
      },
      "pricingLookup": {
        "catalogType": "edge_band",
        "key": "mat.edge.front.abs.white.1",
        "sourceCatalogId": "mat.edge.front.abs.white.1",
        "sourceEntityType": "material",
        "resolution": "catalog_id"
      },
      "sourcePartIds": [
        "door-front-upper"
      ],
      "notes": [
        "edgeId=left",
        "reason=Perimeter edge of the upper visible door front."
      ]
    },
    {
      "id": "door-front-upper-edge-right",
      "itemType": "edge_band",
      "category": "front",
      "name": "Door Front Upper right Edge Band",
      "description": "Door Front Upper right edge band",
      "pricingBasis": "linear_length",
      "pricingUnit": "lm",
      "quantity": 1,
      "pricingQuantity": 0.7,
      "formulas": {
        "edgeLengthMm": "partMap(door-front-upper).edgeTargets.right",
        "quantity": "1",
        "pricingQuantity": "(edgeLengthMm * quantity) / 1000"
      },
      "metrics": {
        "edgeLengthLm": 0.7
      },
      "materialSlotId": "freezer-door-front",
      "materialGroup": "front",
      "material": {
        "role": "front",
        "key": "mat.edge.front.abs.white.1",
        "catalogId": "mat.edge.front.abs.white.1",
        "entityType": "material",
        "materialType": "edge",
        "category": "Front Edge Bands",
        "family": "front",
        "name": "ABS Front White 1",
        "displayName": "ABS Front Edge White 1 mm",
        "colorHex": "#f3f3ef",
        "baseMaterial": "abs",
        "decor": "White",
        "color": "White",
        "finish": "Supermat Match",
        "defaultThicknessMm": 1,
        "availableThicknessesMm": [
          1,
          2
        ],
        "preview": {
          "colorHex": "#f3f3ef",
          "roughness": 0.9,
          "metalness": 0.02
        },
        "assignmentSource": "catalog"
      },
      "catalogRef": {
        "entityType": "material",
        "catalogId": "mat.edge.front.abs.white.1",
        "displayName": "ABS Front Edge White 1 mm",
        "group": "front",
        "pricingBasis": "linear_length",
        "pricingUnit": "lm"
      },
      "pricingLookup": {
        "catalogType": "edge_band",
        "key": "mat.edge.front.abs.white.1",
        "sourceCatalogId": "mat.edge.front.abs.white.1",
        "sourceEntityType": "material",
        "resolution": "catalog_id"
      },
      "sourcePartIds": [
        "door-front-upper"
      ],
      "notes": [
        "edgeId=right",
        "reason=Perimeter edge of the upper visible door front."
      ]
    },
    {
      "id": "door-front-upper-edge-top",
      "itemType": "edge_band",
      "category": "front",
      "name": "Door Front Upper top Edge Band",
      "description": "Door Front Upper top edge band",
      "pricingBasis": "linear_length",
      "pricingUnit": "lm",
      "quantity": 1,
      "pricingQuantity": 0.6,
      "formulas": {
        "edgeLengthMm": "partMap(door-front-upper).edgeTargets.top",
        "quantity": "1",
        "pricingQuantity": "(edgeLengthMm * quantity) / 1000"
      },
      "metrics": {
        "edgeLengthLm": 0.6
      },
      "materialSlotId": "freezer-door-front",
      "materialGroup": "front",
      "material": {
        "role": "front",
        "key": "mat.edge.front.abs.white.1",
        "catalogId": "mat.edge.front.abs.white.1",
        "entityType": "material",
        "materialType": "edge",
        "category": "Front Edge Bands",
        "family": "front",
        "name": "ABS Front White 1",
        "displayName": "ABS Front Edge White 1 mm",
        "colorHex": "#f3f3ef",
        "baseMaterial": "abs",
        "decor": "White",
        "color": "White",
        "finish": "Supermat Match",
        "defaultThicknessMm": 1,
        "availableThicknessesMm": [
          1,
          2
        ],
        "preview": {
          "colorHex": "#f3f3ef",
          "roughness": 0.9,
          "metalness": 0.02
        },
        "assignmentSource": "catalog"
      },
      "catalogRef": {
        "entityType": "material",
        "catalogId": "mat.edge.front.abs.white.1",
        "displayName": "ABS Front Edge White 1 mm",
        "group": "front",
        "pricingBasis": "linear_length",
        "pricingUnit": "lm"
      },
      "pricingLookup": {
        "catalogType": "edge_band",
        "key": "mat.edge.front.abs.white.1",
        "sourceCatalogId": "mat.edge.front.abs.white.1",
        "sourceEntityType": "material",
        "resolution": "catalog_id"
      },
      "sourcePartIds": [
        "door-front-upper"
      ],
      "notes": [
        "edgeId=top",
        "reason=Perimeter edge of the upper visible door front."
      ]
    },
    {
      "id": "door-front-upper-edge-bottom",
      "itemType": "edge_band",
      "category": "front",
      "name": "Door Front Upper bottom Edge Band",
      "description": "Door Front Upper bottom edge band",
      "pricingBasis": "linear_length",
      "pricingUnit": "lm",
      "quantity": 1,
      "pricingQuantity": 0.6,
      "formulas": {
        "edgeLengthMm": "partMap(door-front-upper).edgeTargets.bottom",
        "quantity": "1",
        "pricingQuantity": "(edgeLengthMm * quantity) / 1000"
      },
      "metrics": {
        "edgeLengthLm": 0.6
      },
      "materialSlotId": "freezer-door-front",
      "materialGroup": "front",
      "material": {
        "role": "front",
        "key": "mat.edge.front.abs.white.1",
        "catalogId": "mat.edge.front.abs.white.1",
        "entityType": "material",
        "materialType": "edge",
        "category": "Front Edge Bands",
        "family": "front",
        "name": "ABS Front White 1",
        "displayName": "ABS Front Edge White 1 mm",
        "colorHex": "#f3f3ef",
        "baseMaterial": "abs",
        "decor": "White",
        "color": "White",
        "finish": "Supermat Match",
        "defaultThicknessMm": 1,
        "availableThicknessesMm": [
          1,
          2
        ],
        "preview": {
          "colorHex": "#f3f3ef",
          "roughness": 0.9,
          "metalness": 0.02
        },
        "assignmentSource": "catalog"
      },
      "catalogRef": {
        "entityType": "material",
        "catalogId": "mat.edge.front.abs.white.1",
        "displayName": "ABS Front Edge White 1 mm",
        "group": "front",
        "pricingBasis": "linear_length",
        "pricingUnit": "lm"
      },
      "pricingLookup": {
        "catalogType": "edge_band",
        "key": "mat.edge.front.abs.white.1",
        "sourceCatalogId": "mat.edge.front.abs.white.1",
        "sourceEntityType": "material",
        "resolution": "catalog_id"
      },
      "sourcePartIds": [
        "door-front-upper"
      ],
      "notes": [
        "edgeId=bottom",
        "reason=Perimeter edge of the upper visible door front."
      ]
    },
    {
      "id": "door-front-lower-edge-left",
      "itemType": "edge_band",
      "category": "front",
      "name": "Door Front Lower left Edge Band",
      "description": "Door Front Lower left edge band",
      "pricingBasis": "linear_length",
      "pricingUnit": "lm",
      "quantity": 1,
      "pricingQuantity": 1.114,
      "formulas": {
        "edgeLengthMm": "partMap(door-front-lower).edgeTargets.left",
        "quantity": "1",
        "pricingQuantity": "(edgeLengthMm * quantity) / 1000"
      },
      "metrics": {
        "edgeLengthLm": 1.114
      },
      "materialSlotId": "fridge-door-front",
      "materialGroup": "front",
      "material": {
        "role": "front",
        "key": "mat.edge.front.abs.white.1",
        "catalogId": "mat.edge.front.abs.white.1",
        "entityType": "material",
        "materialType": "edge",
        "category": "Front Edge Bands",
        "family": "front",
        "name": "ABS Front White 1",
        "displayName": "ABS Front Edge White 1 mm",
        "colorHex": "#f3f3ef",
        "baseMaterial": "abs",
        "decor": "White",
        "color": "White",
        "finish": "Supermat Match",
        "defaultThicknessMm": 1,
        "availableThicknessesMm": [
          1,
          2
        ],
        "preview": {
          "colorHex": "#f3f3ef",
          "roughness": 0.9,
          "metalness": 0.02
        },
        "assignmentSource": "catalog"
      },
      "catalogRef": {
        "entityType": "material",
        "catalogId": "mat.edge.front.abs.white.1",
        "displayName": "ABS Front Edge White 1 mm",
        "group": "front",
        "pricingBasis": "linear_length",
        "pricingUnit": "lm"
      },
      "pricingLookup": {
        "catalogType": "edge_band",
        "key": "mat.edge.front.abs.white.1",
        "sourceCatalogId": "mat.edge.front.abs.white.1",
        "sourceEntityType": "material",
        "resolution": "catalog_id"
      },
      "sourcePartIds": [
        "door-front-lower"
      ],
      "notes": [
        "edgeId=left",
        "reason=Perimeter edge of the lower visible door front."
      ]
    },
    {
      "id": "door-front-lower-edge-right",
      "itemType": "edge_band",
      "category": "front",
      "name": "Door Front Lower right Edge Band",
      "description": "Door Front Lower right edge band",
      "pricingBasis": "linear_length",
      "pricingUnit": "lm",
      "quantity": 1,
      "pricingQuantity": 1.114,
      "formulas": {
        "edgeLengthMm": "partMap(door-front-lower).edgeTargets.right",
        "quantity": "1",
        "pricingQuantity": "(edgeLengthMm * quantity) / 1000"
      },
      "metrics": {
        "edgeLengthLm": 1.114
      },
      "materialSlotId": "fridge-door-front",
      "materialGroup": "front",
      "material": {
        "role": "front",
        "key": "mat.edge.front.abs.white.1",
        "catalogId": "mat.edge.front.abs.white.1",
        "entityType": "material",
        "materialType": "edge",
        "category": "Front Edge Bands",
        "family": "front",
        "name": "ABS Front White 1",
        "displayName": "ABS Front Edge White 1 mm",
        "colorHex": "#f3f3ef",
        "baseMaterial": "abs",
        "decor": "White",
        "color": "White",
        "finish": "Supermat Match",
        "defaultThicknessMm": 1,
        "availableThicknessesMm": [
          1,
          2
        ],
        "preview": {
          "colorHex": "#f3f3ef",
          "roughness": 0.9,
          "metalness": 0.02
        },
        "assignmentSource": "catalog"
      },
      "catalogRef": {
        "entityType": "material",
        "catalogId": "mat.edge.front.abs.white.1",
        "displayName": "ABS Front Edge White 1 mm",
        "group": "front",
        "pricingBasis": "linear_length",
        "pricingUnit": "lm"
      },
      "pricingLookup": {
        "catalogType": "edge_band",
        "key": "mat.edge.front.abs.white.1",
        "sourceCatalogId": "mat.edge.front.abs.white.1",
        "sourceEntityType": "material",
        "resolution": "catalog_id"
      },
      "sourcePartIds": [
        "door-front-lower"
      ],
      "notes": [
        "edgeId=right",
        "reason=Perimeter edge of the lower visible door front."
      ]
    },
    {
      "id": "door-front-lower-edge-top",
      "itemType": "edge_band",
      "category": "front",
      "name": "Door Front Lower top Edge Band",
      "description": "Door Front Lower top edge band",
      "pricingBasis": "linear_length",
      "pricingUnit": "lm",
      "quantity": 1,
      "pricingQuantity": 0.6,
      "formulas": {
        "edgeLengthMm": "partMap(door-front-lower).edgeTargets.top",
        "quantity": "1",
        "pricingQuantity": "(edgeLengthMm * quantity) / 1000"
      },
      "metrics": {
        "edgeLengthLm": 0.6
      },
      "materialSlotId": "fridge-door-front",
      "materialGroup": "front",
      "material": {
        "role": "front",
        "key": "mat.edge.front.abs.white.1",
        "catalogId": "mat.edge.front.abs.white.1",
        "entityType": "material",
        "materialType": "edge",
        "category": "Front Edge Bands",
        "family": "front",
        "name": "ABS Front White 1",
        "displayName": "ABS Front Edge White 1 mm",
        "colorHex": "#f3f3ef",
        "baseMaterial": "abs",
        "decor": "White",
        "color": "White",
        "finish": "Supermat Match",
        "defaultThicknessMm": 1,
        "availableThicknessesMm": [
          1,
          2
        ],
        "preview": {
          "colorHex": "#f3f3ef",
          "roughness": 0.9,
          "metalness": 0.02
        },
        "assignmentSource": "catalog"
      },
      "catalogRef": {
        "entityType": "material",
        "catalogId": "mat.edge.front.abs.white.1",
        "displayName": "ABS Front Edge White 1 mm",
        "group": "front",
        "pricingBasis": "linear_length",
        "pricingUnit": "lm"
      },
      "pricingLookup": {
        "catalogType": "edge_band",
        "key": "mat.edge.front.abs.white.1",
        "sourceCatalogId": "mat.edge.front.abs.white.1",
        "sourceEntityType": "material",
        "resolution": "catalog_id"
      },
      "sourcePartIds": [
        "door-front-lower"
      ],
      "notes": [
        "edgeId=top",
        "reason=Perimeter edge of the lower visible door front."
      ]
    },
    {
      "id": "door-front-lower-edge-bottom",
      "itemType": "edge_band",
      "category": "front",
      "name": "Door Front Lower bottom Edge Band",
      "description": "Door Front Lower bottom edge band",
      "pricingBasis": "linear_length",
      "pricingUnit": "lm",
      "quantity": 1,
      "pricingQuantity": 0.6,
      "formulas": {
        "edgeLengthMm": "partMap(door-front-lower).edgeTargets.bottom",
        "quantity": "1",
        "pricingQuantity": "(edgeLengthMm * quantity) / 1000"
      },
      "metrics": {
        "edgeLengthLm": 0.6
      },
      "materialSlotId": "fridge-door-front",
      "materialGroup": "front",
      "material": {
        "role": "front",
        "key": "mat.edge.front.abs.white.1",
        "catalogId": "mat.edge.front.abs.white.1",
        "entityType": "material",
        "materialType": "edge",
        "category": "Front Edge Bands",
        "family": "front",
        "name": "ABS Front White 1",
        "displayName": "ABS Front Edge White 1 mm",
        "colorHex": "#f3f3ef",
        "baseMaterial": "abs",
        "decor": "White",
        "color": "White",
        "finish": "Supermat Match",
        "defaultThicknessMm": 1,
        "availableThicknessesMm": [
          1,
          2
        ],
        "preview": {
          "colorHex": "#f3f3ef",
          "roughness": 0.9,
          "metalness": 0.02
        },
        "assignmentSource": "catalog"
      },
      "catalogRef": {
        "entityType": "material",
        "catalogId": "mat.edge.front.abs.white.1",
        "displayName": "ABS Front Edge White 1 mm",
        "group": "front",
        "pricingBasis": "linear_length",
        "pricingUnit": "lm"
      },
      "pricingLookup": {
        "catalogType": "edge_band",
        "key": "mat.edge.front.abs.white.1",
        "sourceCatalogId": "mat.edge.front.abs.white.1",
        "sourceEntityType": "material",
        "resolution": "catalog_id"
      },
      "sourcePartIds": [
        "door-front-lower"
      ],
      "notes": [
        "edgeId=bottom",
        "reason=Perimeter edge of the lower visible door front."
      ]
    },
    {
      "id": "plinth-front-edge-left",
      "itemType": "edge_band",
      "category": "plinth",
      "name": "Plinth Front left Edge Band",
      "description": "Plinth Front left edge band",
      "pricingBasis": "linear_length",
      "pricingUnit": "lm",
      "quantity": 1,
      "pricingQuantity": 0.1,
      "formulas": {
        "edgeLengthMm": "partMap(plinth-front).edgeTargets.left",
        "quantity": "1",
        "pricingQuantity": "(edgeLengthMm * quantity) / 1000"
      },
      "metrics": {
        "edgeLengthLm": 0.1
      },
      "materialSlotId": "plinth",
      "materialGroup": "body",
      "material": {
        "role": "body",
        "key": "mat.edge.body.abs.white.0_8",
        "catalogId": "mat.edge.body.abs.white.0_8",
        "entityType": "material",
        "materialType": "edge",
        "category": "Body Edge Bands",
        "family": "body",
        "name": "ABS Body White 0.8",
        "displayName": "ABS Body Edge White 0.8 mm",
        "colorHex": "#f3f3ef",
        "baseMaterial": "abs",
        "decor": "White",
        "color": "White",
        "finish": "Satin",
        "defaultThicknessMm": 0.8,
        "availableThicknessesMm": [
          0.5,
          0.8,
          2
        ],
        "preview": {
          "colorHex": "#f3f3ef",
          "roughness": 0.62,
          "metalness": 0.02
        },
        "assignmentSource": "catalog"
      },
      "catalogRef": {
        "entityType": "material",
        "catalogId": "mat.edge.body.abs.white.0_8",
        "displayName": "ABS Body Edge White 0.8 mm",
        "group": "body",
        "pricingBasis": "linear_length",
        "pricingUnit": "lm"
      },
      "pricingLookup": {
        "catalogType": "edge_band",
        "key": "mat.edge.body.abs.white.0_8",
        "sourceCatalogId": "mat.edge.body.abs.white.0_8",
        "sourceEntityType": "material",
        "resolution": "catalog_id"
      },
      "sourcePartIds": [
        "plinth-front"
      ],
      "notes": [
        "edgeId=left",
        "reason=Plinth side return can remain visible at a cabinet run termination."
      ]
    },
    {
      "id": "plinth-front-edge-right",
      "itemType": "edge_band",
      "category": "plinth",
      "name": "Plinth Front right Edge Band",
      "description": "Plinth Front right edge band",
      "pricingBasis": "linear_length",
      "pricingUnit": "lm",
      "quantity": 1,
      "pricingQuantity": 0.1,
      "formulas": {
        "edgeLengthMm": "partMap(plinth-front).edgeTargets.right",
        "quantity": "1",
        "pricingQuantity": "(edgeLengthMm * quantity) / 1000"
      },
      "metrics": {
        "edgeLengthLm": 0.1
      },
      "materialSlotId": "plinth",
      "materialGroup": "body",
      "material": {
        "role": "body",
        "key": "mat.edge.body.abs.white.0_8",
        "catalogId": "mat.edge.body.abs.white.0_8",
        "entityType": "material",
        "materialType": "edge",
        "category": "Body Edge Bands",
        "family": "body",
        "name": "ABS Body White 0.8",
        "displayName": "ABS Body Edge White 0.8 mm",
        "colorHex": "#f3f3ef",
        "baseMaterial": "abs",
        "decor": "White",
        "color": "White",
        "finish": "Satin",
        "defaultThicknessMm": 0.8,
        "availableThicknessesMm": [
          0.5,
          0.8,
          2
        ],
        "preview": {
          "colorHex": "#f3f3ef",
          "roughness": 0.62,
          "metalness": 0.02
        },
        "assignmentSource": "catalog"
      },
      "catalogRef": {
        "entityType": "material",
        "catalogId": "mat.edge.body.abs.white.0_8",
        "displayName": "ABS Body Edge White 0.8 mm",
        "group": "body",
        "pricingBasis": "linear_length",
        "pricingUnit": "lm"
      },
      "pricingLookup": {
        "catalogType": "edge_band",
        "key": "mat.edge.body.abs.white.0_8",
        "sourceCatalogId": "mat.edge.body.abs.white.0_8",
        "sourceEntityType": "material",
        "resolution": "catalog_id"
      },
      "sourcePartIds": [
        "plinth-front"
      ],
      "notes": [
        "edgeId=right",
        "reason=Plinth side return can remain visible at a cabinet run termination."
      ]
    },
    {
      "id": "plinth-front-edge-top",
      "itemType": "edge_band",
      "category": "plinth",
      "name": "Plinth Front top Edge Band",
      "description": "Plinth Front top edge band",
      "pricingBasis": "linear_length",
      "pricingUnit": "lm",
      "quantity": 1,
      "pricingQuantity": 0.564,
      "formulas": {
        "edgeLengthMm": "partMap(plinth-front).edgeTargets.top",
        "quantity": "1",
        "pricingQuantity": "(edgeLengthMm * quantity) / 1000"
      },
      "metrics": {
        "edgeLengthLm": 0.564
      },
      "materialSlotId": "plinth",
      "materialGroup": "body",
      "material": {
        "role": "body",
        "key": "mat.edge.body.abs.white.0_8",
        "catalogId": "mat.edge.body.abs.white.0_8",
        "entityType": "material",
        "materialType": "edge",
        "category": "Body Edge Bands",
        "family": "body",
        "name": "ABS Body White 0.8",
        "displayName": "ABS Body Edge White 0.8 mm",
        "colorHex": "#f3f3ef",
        "baseMaterial": "abs",
        "decor": "White",
        "color": "White",
        "finish": "Satin",
        "defaultThicknessMm": 0.8,
        "availableThicknessesMm": [
          0.5,
          0.8,
          2
        ],
        "preview": {
          "colorHex": "#f3f3ef",
          "roughness": 0.62,
          "metalness": 0.02
        },
        "assignmentSource": "catalog"
      },
      "catalogRef": {
        "entityType": "material",
        "catalogId": "mat.edge.body.abs.white.0_8",
        "displayName": "ABS Body Edge White 0.8 mm",
        "group": "body",
        "pricingBasis": "linear_length",
        "pricingUnit": "lm"
      },
      "pricingLookup": {
        "catalogType": "edge_band",
        "key": "mat.edge.body.abs.white.0_8",
        "sourceCatalogId": "mat.edge.body.abs.white.0_8",
        "sourceEntityType": "material",
        "resolution": "catalog_id"
      },
      "sourcePartIds": [
        "plinth-front"
      ],
      "notes": [
        "edgeId=top",
        "reason=Top edge remains visually exposed at the plinth line."
      ]
    }
  ],
  "summary": {
    "totalItems": 15,
    "edgeLengthLm": 11.552
  },
  "notes": [
    "carcass-side-left: skipped back(concealed), top(concealed), bottom(concealed) based on explicit edgeTargets metadata.",
    "carcass-side-right: skipped back(concealed), top(concealed), bottom(concealed) based on explicit edgeTargets metadata.",
    "carcass-top: skipped left(concealed), right(concealed), back(concealed) based on explicit edgeTargets metadata.",
    "carcass-bottom: skipped left(concealed), right(concealed), back(concealed) based on explicit edgeTargets metadata.",
    "plinth-front: skipped bottom(non_candidate) based on explicit edgeTargets metadata."
  ]
} as const;

export function generateEdgeBom() {
  return edgeBomSnapshot;
}

export function summarizeEdgeBom() {
  return edgeBomSnapshot.summary;
}