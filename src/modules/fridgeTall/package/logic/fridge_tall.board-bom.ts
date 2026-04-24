export const moduleType = "fridge_tall";
export const displayName = "Fridge";
export const boardBomSnapshot = {
  "schemaVersion": "module-board-bom.v1",
  "moduleType": "fridge_tall",
  "displayName": "Fridge",
  "generatedAt": "2026-04-24T13:35:45.700Z",
  "items": [
    {
      "id": "carcass-side-left",
      "itemType": "board",
      "category": "carcass",
      "name": "DTD White 18 - Carcass Side Left",
      "description": "Carcass Side Left",
      "pricingBasis": "sheet_area",
      "pricingUnit": "m2",
      "quantity": 1,
      "pricingQuantity": 1.1986,
      "formulas": {
        "lengthMm": "partMap(carcass-side-left).dimensionsMm.length",
        "widthMm": "partMap(carcass-side-left).dimensionsMm.width",
        "thicknessMm": "boardThickness",
        "quantity": "1",
        "areaM2": "(lengthMm * widthMm * quantity) / 1000000",
        "wasteMultiplier": "1.1",
        "pricingQuantity": "areaM2 * wasteMultiplier"
      },
      "dimensionsMm": {
        "length": 1816,
        "width": 600,
        "thickness": 18
      },
      "metrics": {
        "areaM2": 1.0896,
        "billableAreaM2": 1.1986,
        "wasteMultiplier": 1.1
      },
      "materialSlotId": "left-side",
      "materialGroup": "body",
      "material": {
        "role": "body",
        "key": "mat.board.body.dtd.white.18",
        "catalogId": "mat.board.body.dtd.white.18",
        "entityType": "material",
        "materialType": "board",
        "category": "Body Boards",
        "family": "body",
        "name": "DTD White 18",
        "displayName": "DTD White 18 mm",
        "colorHex": "#f3f3ef",
        "baseMaterial": "dtd",
        "decor": "White",
        "color": "White",
        "finish": "Melamine",
        "defaultThicknessMm": 18,
        "availableThicknessesMm": [
          16,
          18,
          20,
          25
        ],
        "preview": {
          "colorHex": "#f3f3ef",
          "roughness": 0.78,
          "metalness": 0.02
        },
        "assignmentSource": "catalog"
      },
      "catalogRef": {
        "entityType": "material",
        "catalogId": "mat.board.body.dtd.white.18",
        "displayName": "DTD White 18 mm",
        "group": "body",
        "pricingBasis": "sheet_area",
        "pricingUnit": "m2"
      },
      "pricingLookup": {
        "catalogType": "board_sheet",
        "key": "mat.board.body.dtd.white.18",
        "sourceCatalogId": "mat.board.body.dtd.white.18",
        "sourceEntityType": "material",
        "resolution": "catalog_id"
      },
      "sourcePartIds": [
        "carcass-side-left"
      ],
      "notes": [
        "partType=side-panel",
        "materialParamKey=materials.bodyKey",
        "thicknessKey=boardThickness"
      ]
    },
    {
      "id": "carcass-side-right",
      "itemType": "board",
      "category": "carcass",
      "name": "DTD White 18 - Carcass Side Right",
      "description": "Carcass Side Right",
      "pricingBasis": "sheet_area",
      "pricingUnit": "m2",
      "quantity": 1,
      "pricingQuantity": 1.1986,
      "formulas": {
        "lengthMm": "partMap(carcass-side-right).dimensionsMm.length",
        "widthMm": "partMap(carcass-side-right).dimensionsMm.width",
        "thicknessMm": "boardThickness",
        "quantity": "1",
        "areaM2": "(lengthMm * widthMm * quantity) / 1000000",
        "wasteMultiplier": "1.1",
        "pricingQuantity": "areaM2 * wasteMultiplier"
      },
      "dimensionsMm": {
        "length": 1816,
        "width": 600,
        "thickness": 18
      },
      "metrics": {
        "areaM2": 1.0896,
        "billableAreaM2": 1.1986,
        "wasteMultiplier": 1.1
      },
      "materialSlotId": "right-side",
      "materialGroup": "body",
      "material": {
        "role": "body",
        "key": "mat.board.body.dtd.white.18",
        "catalogId": "mat.board.body.dtd.white.18",
        "entityType": "material",
        "materialType": "board",
        "category": "Body Boards",
        "family": "body",
        "name": "DTD White 18",
        "displayName": "DTD White 18 mm",
        "colorHex": "#f3f3ef",
        "baseMaterial": "dtd",
        "decor": "White",
        "color": "White",
        "finish": "Melamine",
        "defaultThicknessMm": 18,
        "availableThicknessesMm": [
          16,
          18,
          20,
          25
        ],
        "preview": {
          "colorHex": "#f3f3ef",
          "roughness": 0.78,
          "metalness": 0.02
        },
        "assignmentSource": "catalog"
      },
      "catalogRef": {
        "entityType": "material",
        "catalogId": "mat.board.body.dtd.white.18",
        "displayName": "DTD White 18 mm",
        "group": "body",
        "pricingBasis": "sheet_area",
        "pricingUnit": "m2"
      },
      "pricingLookup": {
        "catalogType": "board_sheet",
        "key": "mat.board.body.dtd.white.18",
        "sourceCatalogId": "mat.board.body.dtd.white.18",
        "sourceEntityType": "material",
        "resolution": "catalog_id"
      },
      "sourcePartIds": [
        "carcass-side-right"
      ],
      "notes": [
        "partType=side-panel",
        "materialParamKey=materials.bodyKey",
        "thicknessKey=boardThickness"
      ]
    },
    {
      "id": "carcass-top",
      "itemType": "board",
      "category": "carcass",
      "name": "DTD White 18 - Carcass Top",
      "description": "Carcass Top",
      "pricingBasis": "sheet_area",
      "pricingUnit": "m2",
      "quantity": 1,
      "pricingQuantity": 0.3722,
      "formulas": {
        "lengthMm": "partMap(carcass-top).dimensionsMm.length",
        "widthMm": "partMap(carcass-top).dimensionsMm.width",
        "thicknessMm": "boardThickness",
        "quantity": "1",
        "areaM2": "(lengthMm * widthMm * quantity) / 1000000",
        "wasteMultiplier": "1.1",
        "pricingQuantity": "areaM2 * wasteMultiplier"
      },
      "dimensionsMm": {
        "length": 600,
        "width": 564,
        "thickness": 18
      },
      "metrics": {
        "areaM2": 0.3384,
        "billableAreaM2": 0.3722,
        "wasteMultiplier": 1.1
      },
      "materialSlotId": "top-panel",
      "materialGroup": "body",
      "material": {
        "role": "body",
        "key": "mat.board.body.dtd.white.18",
        "catalogId": "mat.board.body.dtd.white.18",
        "entityType": "material",
        "materialType": "board",
        "category": "Body Boards",
        "family": "body",
        "name": "DTD White 18",
        "displayName": "DTD White 18 mm",
        "colorHex": "#f3f3ef",
        "baseMaterial": "dtd",
        "decor": "White",
        "color": "White",
        "finish": "Melamine",
        "defaultThicknessMm": 18,
        "availableThicknessesMm": [
          16,
          18,
          20,
          25
        ],
        "preview": {
          "colorHex": "#f3f3ef",
          "roughness": 0.78,
          "metalness": 0.02
        },
        "assignmentSource": "catalog"
      },
      "catalogRef": {
        "entityType": "material",
        "catalogId": "mat.board.body.dtd.white.18",
        "displayName": "DTD White 18 mm",
        "group": "body",
        "pricingBasis": "sheet_area",
        "pricingUnit": "m2"
      },
      "pricingLookup": {
        "catalogType": "board_sheet",
        "key": "mat.board.body.dtd.white.18",
        "sourceCatalogId": "mat.board.body.dtd.white.18",
        "sourceEntityType": "material",
        "resolution": "catalog_id"
      },
      "sourcePartIds": [
        "carcass-top"
      ],
      "notes": [
        "partType=top-panel",
        "materialParamKey=materials.bodyKey",
        "thicknessKey=boardThickness"
      ]
    },
    {
      "id": "carcass-bottom",
      "itemType": "board",
      "category": "carcass",
      "name": "DTD White 18 - Carcass Bottom",
      "description": "Carcass Bottom",
      "pricingBasis": "sheet_area",
      "pricingUnit": "m2",
      "quantity": 1,
      "pricingQuantity": 0.3722,
      "formulas": {
        "lengthMm": "partMap(carcass-bottom).dimensionsMm.length",
        "widthMm": "partMap(carcass-bottom).dimensionsMm.width",
        "thicknessMm": "boardThickness",
        "quantity": "1",
        "areaM2": "(lengthMm * widthMm * quantity) / 1000000",
        "wasteMultiplier": "1.1",
        "pricingQuantity": "areaM2 * wasteMultiplier"
      },
      "dimensionsMm": {
        "length": 600,
        "width": 564,
        "thickness": 18
      },
      "metrics": {
        "areaM2": 0.3384,
        "billableAreaM2": 0.3722,
        "wasteMultiplier": 1.1
      },
      "materialSlotId": "bottom-panel",
      "materialGroup": "body",
      "material": {
        "role": "body",
        "key": "mat.board.body.dtd.white.18",
        "catalogId": "mat.board.body.dtd.white.18",
        "entityType": "material",
        "materialType": "board",
        "category": "Body Boards",
        "family": "body",
        "name": "DTD White 18",
        "displayName": "DTD White 18 mm",
        "colorHex": "#f3f3ef",
        "baseMaterial": "dtd",
        "decor": "White",
        "color": "White",
        "finish": "Melamine",
        "defaultThicknessMm": 18,
        "availableThicknessesMm": [
          16,
          18,
          20,
          25
        ],
        "preview": {
          "colorHex": "#f3f3ef",
          "roughness": 0.78,
          "metalness": 0.02
        },
        "assignmentSource": "catalog"
      },
      "catalogRef": {
        "entityType": "material",
        "catalogId": "mat.board.body.dtd.white.18",
        "displayName": "DTD White 18 mm",
        "group": "body",
        "pricingBasis": "sheet_area",
        "pricingUnit": "m2"
      },
      "pricingLookup": {
        "catalogType": "board_sheet",
        "key": "mat.board.body.dtd.white.18",
        "sourceCatalogId": "mat.board.body.dtd.white.18",
        "sourceEntityType": "material",
        "resolution": "catalog_id"
      },
      "sourcePartIds": [
        "carcass-bottom"
      ],
      "notes": [
        "partType=bottom-panel",
        "materialParamKey=materials.bodyKey",
        "thicknessKey=boardThickness"
      ]
    },
    {
      "id": "carcass-back",
      "itemType": "board",
      "category": "back_panel",
      "name": "HDF Grey 6 - Carcass Back",
      "description": "Carcass Back",
      "pricingBasis": "sheet_area",
      "pricingUnit": "m2",
      "quantity": 1,
      "pricingQuantity": 1.1155,
      "formulas": {
        "lengthMm": "partMap(carcass-back).dimensionsMm.length",
        "widthMm": "partMap(carcass-back).dimensionsMm.width",
        "thicknessMm": "backThickness",
        "quantity": "1",
        "areaM2": "(lengthMm * widthMm * quantity) / 1000000",
        "wasteMultiplier": "1.1",
        "pricingQuantity": "areaM2 * wasteMultiplier"
      },
      "dimensionsMm": {
        "length": 1798,
        "width": 564,
        "thickness": 6
      },
      "metrics": {
        "areaM2": 1.0141,
        "billableAreaM2": 1.1155,
        "wasteMultiplier": 1.1
      },
      "materialSlotId": "back-panel",
      "materialGroup": "back",
      "material": {
        "role": "back",
        "key": "mat.board.back.hdf.grey.6",
        "catalogId": "mat.board.back.hdf.grey.6",
        "entityType": "material",
        "materialType": "board",
        "category": "Back Panels",
        "family": "back",
        "name": "HDF Grey 6",
        "displayName": "HDF Grey 6 mm",
        "colorHex": "#c8ccd1",
        "baseMaterial": "hdf",
        "decor": "Grey",
        "color": "Grey",
        "finish": "Painted Smooth",
        "defaultThicknessMm": 6,
        "availableThicknessesMm": [
          6,
          8
        ],
        "preview": {
          "colorHex": "#c8ccd1",
          "roughness": 0.72,
          "metalness": 0.02
        },
        "assignmentSource": "catalog"
      },
      "catalogRef": {
        "entityType": "material",
        "catalogId": "mat.board.back.hdf.grey.6",
        "displayName": "HDF Grey 6 mm",
        "group": "back",
        "pricingBasis": "sheet_area",
        "pricingUnit": "m2"
      },
      "pricingLookup": {
        "catalogType": "board_sheet",
        "key": "mat.board.back.hdf.grey.6",
        "sourceCatalogId": "mat.board.back.hdf.grey.6",
        "sourceEntityType": "material",
        "resolution": "catalog_id"
      },
      "sourcePartIds": [
        "carcass-back"
      ],
      "notes": [
        "Uses body material routing with dedicated fridge back thickness until the slot-based BOM phase.",
        "partType=back-panel",
        "materialParamKey=materials.bodyKey",
        "thicknessKey=backThickness"
      ]
    },
    {
      "id": "door-front-upper",
      "itemType": "board",
      "category": "front",
      "name": "MDF White Supermat 18 - Door Front Upper",
      "description": "Door Front Upper",
      "pricingBasis": "sheet_area",
      "pricingUnit": "m2",
      "quantity": 1,
      "pricingQuantity": 0.462,
      "formulas": {
        "lengthMm": "partMap(door-front-upper).dimensionsMm.length",
        "widthMm": "partMap(door-front-upper).dimensionsMm.width",
        "thicknessMm": "frontThicknessMm",
        "quantity": "1",
        "areaM2": "(lengthMm * widthMm * quantity) / 1000000",
        "wasteMultiplier": "1.1",
        "pricingQuantity": "areaM2 * wasteMultiplier"
      },
      "dimensionsMm": {
        "length": 700,
        "width": 600,
        "thickness": 18
      },
      "metrics": {
        "areaM2": 0.42,
        "billableAreaM2": 0.462,
        "wasteMultiplier": 1.1
      },
      "materialSlotId": "freezer-door-front",
      "materialGroup": "front",
      "material": {
        "role": "front",
        "key": "mat.board.front.mdf.white_supermat.18",
        "catalogId": "mat.board.front.mdf.white_supermat.18",
        "entityType": "material",
        "materialType": "board",
        "category": "Front Boards",
        "family": "front",
        "name": "MDF White Supermat 18",
        "displayName": "MDF White Supermat 18 mm",
        "colorHex": "#f3f3ef",
        "baseMaterial": "mdf",
        "decor": "White Supermat",
        "color": "White",
        "finish": "Supermat Lacquer",
        "defaultThicknessMm": 18,
        "availableThicknessesMm": [
          16,
          18,
          20
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
        "catalogId": "mat.board.front.mdf.white_supermat.18",
        "displayName": "MDF White Supermat 18 mm",
        "group": "front",
        "pricingBasis": "sheet_area",
        "pricingUnit": "m2"
      },
      "pricingLookup": {
        "catalogType": "board_sheet",
        "key": "mat.board.front.mdf.white_supermat.18",
        "sourceCatalogId": "mat.board.front.mdf.white_supermat.18",
        "sourceEntityType": "material",
        "resolution": "catalog_id"
      },
      "sourcePartIds": [
        "door-front-upper"
      ],
      "notes": [
        "partType=door-front",
        "materialParamKey=materials.frontKey",
        "thicknessKey=frontThicknessMm"
      ]
    },
    {
      "id": "door-front-lower",
      "itemType": "board",
      "category": "front",
      "name": "MDF White Supermat 18 - Door Front Lower",
      "description": "Door Front Lower",
      "pricingBasis": "sheet_area",
      "pricingUnit": "m2",
      "quantity": 1,
      "pricingQuantity": 0.7352,
      "formulas": {
        "lengthMm": "partMap(door-front-lower).dimensionsMm.length",
        "widthMm": "partMap(door-front-lower).dimensionsMm.width",
        "thicknessMm": "frontThicknessMm",
        "quantity": "1",
        "areaM2": "(lengthMm * widthMm * quantity) / 1000000",
        "wasteMultiplier": "1.1",
        "pricingQuantity": "areaM2 * wasteMultiplier"
      },
      "dimensionsMm": {
        "length": 1114,
        "width": 600,
        "thickness": 18
      },
      "metrics": {
        "areaM2": 0.6684,
        "billableAreaM2": 0.7352,
        "wasteMultiplier": 1.1
      },
      "materialSlotId": "fridge-door-front",
      "materialGroup": "front",
      "material": {
        "role": "front",
        "key": "mat.board.front.mdf.white_supermat.18",
        "catalogId": "mat.board.front.mdf.white_supermat.18",
        "entityType": "material",
        "materialType": "board",
        "category": "Front Boards",
        "family": "front",
        "name": "MDF White Supermat 18",
        "displayName": "MDF White Supermat 18 mm",
        "colorHex": "#f3f3ef",
        "baseMaterial": "mdf",
        "decor": "White Supermat",
        "color": "White",
        "finish": "Supermat Lacquer",
        "defaultThicknessMm": 18,
        "availableThicknessesMm": [
          16,
          18,
          20
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
        "catalogId": "mat.board.front.mdf.white_supermat.18",
        "displayName": "MDF White Supermat 18 mm",
        "group": "front",
        "pricingBasis": "sheet_area",
        "pricingUnit": "m2"
      },
      "pricingLookup": {
        "catalogType": "board_sheet",
        "key": "mat.board.front.mdf.white_supermat.18",
        "sourceCatalogId": "mat.board.front.mdf.white_supermat.18",
        "sourceEntityType": "material",
        "resolution": "catalog_id"
      },
      "sourcePartIds": [
        "door-front-lower"
      ],
      "notes": [
        "partType=door-front",
        "materialParamKey=materials.frontKey",
        "thicknessKey=frontThicknessMm"
      ]
    },
    {
      "id": "plinth-front",
      "itemType": "board",
      "category": "plinth",
      "name": "DTD White 18 - Plinth Front",
      "description": "Plinth Front",
      "pricingBasis": "sheet_area",
      "pricingUnit": "m2",
      "quantity": 1,
      "pricingQuantity": 0.062,
      "formulas": {
        "lengthMm": "partMap(plinth-front).dimensionsMm.length",
        "widthMm": "partMap(plinth-front).dimensionsMm.width",
        "thicknessMm": "boardThickness",
        "quantity": "1",
        "areaM2": "(lengthMm * widthMm * quantity) / 1000000",
        "wasteMultiplier": "1.1",
        "pricingQuantity": "areaM2 * wasteMultiplier"
      },
      "dimensionsMm": {
        "length": 564,
        "width": 100,
        "thickness": 18
      },
      "metrics": {
        "areaM2": 0.0564,
        "billableAreaM2": 0.062,
        "wasteMultiplier": 1.1
      },
      "materialSlotId": "plinth",
      "materialGroup": "body",
      "material": {
        "role": "body",
        "key": "mat.board.body.dtd.white.18",
        "catalogId": "mat.board.body.dtd.white.18",
        "entityType": "material",
        "materialType": "board",
        "category": "Body Boards",
        "family": "body",
        "name": "DTD White 18",
        "displayName": "DTD White 18 mm",
        "colorHex": "#f3f3ef",
        "baseMaterial": "dtd",
        "decor": "White",
        "color": "White",
        "finish": "Melamine",
        "defaultThicknessMm": 18,
        "availableThicknessesMm": [
          16,
          18,
          20,
          25
        ],
        "preview": {
          "colorHex": "#f3f3ef",
          "roughness": 0.78,
          "metalness": 0.02
        },
        "assignmentSource": "catalog"
      },
      "catalogRef": {
        "entityType": "material",
        "catalogId": "mat.board.body.dtd.white.18",
        "displayName": "DTD White 18 mm",
        "group": "body",
        "pricingBasis": "sheet_area",
        "pricingUnit": "m2"
      },
      "pricingLookup": {
        "catalogType": "board_sheet",
        "key": "mat.board.body.dtd.white.18",
        "sourceCatalogId": "mat.board.body.dtd.white.18",
        "sourceEntityType": "material",
        "resolution": "catalog_id"
      },
      "sourcePartIds": [
        "plinth-front"
      ],
      "notes": [
        "partType=plinth-panel",
        "materialParamKey=materials.bodyKey",
        "thicknessKey=boardThickness"
      ]
    }
  ],
  "summary": {
    "totalItems": 8,
    "boardAreaM2": 5.0149,
    "boardAreaM2Priced": 5.5163,
    "boardPieces": 8
  }
} as const;

export function generateBoardBom() {
  return boardBomSnapshot;
}

export function summarizeBoardBom() {
  return boardBomSnapshot.summary;
}