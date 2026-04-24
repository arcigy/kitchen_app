export const moduleType = "flap_shelves_low";
export const displayName = "Flap";
export const boardBomSnapshot = {
  "schemaVersion": "module-board-bom.v1",
  "moduleType": "flap_shelves_low",
  "displayName": "Flap",
  "generatedAt": "2026-04-24T17:27:40.819Z",
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
      "pricingQuantity": 0.4435,
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
        "length": 720,
        "width": 560,
        "thickness": 18
      },
      "metrics": {
        "areaM2": 0.4032,
        "billableAreaM2": 0.4435,
        "wasteMultiplier": 1.1
      },
      "materialSlotId": "left-side",
      "materialGroup": "corpus",
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
        "materialParamKey=materials.body",
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
      "pricingQuantity": 0.4435,
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
        "length": 720,
        "width": 560,
        "thickness": 18
      },
      "metrics": {
        "areaM2": 0.4032,
        "billableAreaM2": 0.4435,
        "wasteMultiplier": 1.1
      },
      "materialSlotId": "right-side",
      "materialGroup": "corpus",
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
        "materialParamKey=materials.body",
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
      "pricingQuantity": 0.5322,
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
        "length": 864,
        "width": 560,
        "thickness": 18
      },
      "metrics": {
        "areaM2": 0.4838,
        "billableAreaM2": 0.5322,
        "wasteMultiplier": 1.1
      },
      "materialSlotId": "bottom-panel",
      "materialGroup": "corpus",
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
        "materialParamKey=materials.body",
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
      "pricingQuantity": 0.5322,
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
        "length": 864,
        "width": 560,
        "thickness": 18
      },
      "metrics": {
        "areaM2": 0.4838,
        "billableAreaM2": 0.5322,
        "wasteMultiplier": 1.1
      },
      "materialSlotId": "top-panel",
      "materialGroup": "corpus",
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
        "materialParamKey=materials.body",
        "thicknessKey=boardThickness"
      ]
    },
    {
      "id": "carcass-back",
      "itemType": "board",
      "category": "back_panel",
      "name": "HDF Grey 8 - Carcass Back",
      "description": "Carcass Back",
      "pricingBasis": "sheet_area",
      "pricingUnit": "m2",
      "quantity": 1,
      "pricingQuantity": 0.6672,
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
        "length": 864,
        "width": 702,
        "thickness": 8
      },
      "metrics": {
        "areaM2": 0.6065,
        "billableAreaM2": 0.6672,
        "wasteMultiplier": 1.1
      },
      "materialSlotId": "back-panel",
      "materialGroup": "back",
      "material": {
        "role": "back",
        "key": "mat.board.back.hdf.grey.8",
        "catalogId": "mat.board.back.hdf.grey.8",
        "entityType": "material",
        "materialType": "board",
        "category": "Back Panels",
        "family": "back",
        "name": "HDF Grey 8",
        "displayName": "HDF Grey 8 mm",
        "colorHex": "#c8ccd1",
        "baseMaterial": "hdf",
        "decor": "Grey",
        "color": "Grey",
        "finish": "Painted Smooth",
        "defaultThicknessMm": 8,
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
        "catalogId": "mat.board.back.hdf.grey.8",
        "displayName": "HDF Grey 8 mm",
        "group": "back",
        "pricingBasis": "sheet_area",
        "pricingUnit": "m2"
      },
      "pricingLookup": {
        "catalogType": "board_sheet",
        "key": "mat.board.back.hdf.grey.8",
        "sourceCatalogId": "mat.board.back.hdf.grey.8",
        "sourceEntityType": "material",
        "resolution": "catalog_id"
      },
      "sourcePartIds": [
        "carcass-back"
      ],
      "notes": [
        "partType=back-panel",
        "materialParamKey=materials.body",
        "thicknessKey=backThickness"
      ]
    },
    {
      "id": "shelf-1",
      "itemType": "board",
      "category": "carcass",
      "name": "Shelf DTD White 18 - Shelf 1",
      "description": "Shelf 1",
      "pricingBasis": "sheet_area",
      "pricingUnit": "m2",
      "quantity": 1,
      "pricingQuantity": 0.5322,
      "formulas": {
        "lengthMm": "partMap(shelf-1).dimensionsMm.length",
        "widthMm": "partMap(shelf-1).dimensionsMm.width",
        "thicknessMm": "shelfThickness",
        "quantity": "1",
        "areaM2": "(lengthMm * widthMm * quantity) / 1000000",
        "wasteMultiplier": "1.1",
        "pricingQuantity": "areaM2 * wasteMultiplier"
      },
      "dimensionsMm": {
        "length": 864,
        "width": 560,
        "thickness": 18
      },
      "metrics": {
        "areaM2": 0.4838,
        "billableAreaM2": 0.5322,
        "wasteMultiplier": 1.1
      },
      "materialSlotId": "shelf",
      "materialGroup": "shelves",
      "material": {
        "role": "body",
        "key": "mat.board.shelf.dtd.white.18",
        "catalogId": "mat.board.shelf.dtd.white.18",
        "entityType": "material",
        "materialType": "board",
        "category": "Shelf Boards",
        "family": "shelf",
        "name": "Shelf DTD White 18",
        "displayName": "Shelf DTD White 18 mm",
        "colorHex": "#f3f3ef",
        "baseMaterial": "dtd",
        "decor": "White",
        "color": "White",
        "finish": "Melamine",
        "defaultThicknessMm": 18,
        "availableThicknessesMm": [
          18,
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
        "catalogId": "mat.board.shelf.dtd.white.18",
        "displayName": "Shelf DTD White 18 mm",
        "group": "shelf",
        "pricingBasis": "sheet_area",
        "pricingUnit": "m2"
      },
      "pricingLookup": {
        "catalogType": "board_sheet",
        "key": "mat.board.shelf.dtd.white.18",
        "sourceCatalogId": "mat.board.shelf.dtd.white.18",
        "sourceEntityType": "material",
        "resolution": "catalog_id"
      },
      "sourcePartIds": [
        "shelf-1"
      ],
      "notes": [
        "partType=shelf-panel",
        "materialParamKey=materials.body",
        "thicknessKey=shelfThickness"
      ]
    },
    {
      "id": "shelf-2",
      "itemType": "board",
      "category": "carcass",
      "name": "Shelf DTD White 18 - Shelf 2",
      "description": "Shelf 2",
      "pricingBasis": "sheet_area",
      "pricingUnit": "m2",
      "quantity": 1,
      "pricingQuantity": 0.5322,
      "formulas": {
        "lengthMm": "partMap(shelf-2).dimensionsMm.length",
        "widthMm": "partMap(shelf-2).dimensionsMm.width",
        "thicknessMm": "shelfThickness",
        "quantity": "1",
        "areaM2": "(lengthMm * widthMm * quantity) / 1000000",
        "wasteMultiplier": "1.1",
        "pricingQuantity": "areaM2 * wasteMultiplier"
      },
      "dimensionsMm": {
        "length": 864,
        "width": 560,
        "thickness": 18
      },
      "metrics": {
        "areaM2": 0.4838,
        "billableAreaM2": 0.5322,
        "wasteMultiplier": 1.1
      },
      "materialSlotId": "shelf",
      "materialGroup": "shelves",
      "material": {
        "role": "body",
        "key": "mat.board.shelf.dtd.white.18",
        "catalogId": "mat.board.shelf.dtd.white.18",
        "entityType": "material",
        "materialType": "board",
        "category": "Shelf Boards",
        "family": "shelf",
        "name": "Shelf DTD White 18",
        "displayName": "Shelf DTD White 18 mm",
        "colorHex": "#f3f3ef",
        "baseMaterial": "dtd",
        "decor": "White",
        "color": "White",
        "finish": "Melamine",
        "defaultThicknessMm": 18,
        "availableThicknessesMm": [
          18,
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
        "catalogId": "mat.board.shelf.dtd.white.18",
        "displayName": "Shelf DTD White 18 mm",
        "group": "shelf",
        "pricingBasis": "sheet_area",
        "pricingUnit": "m2"
      },
      "pricingLookup": {
        "catalogType": "board_sheet",
        "key": "mat.board.shelf.dtd.white.18",
        "sourceCatalogId": "mat.board.shelf.dtd.white.18",
        "sourceEntityType": "material",
        "resolution": "catalog_id"
      },
      "sourcePartIds": [
        "shelf-2"
      ],
      "notes": [
        "partType=shelf-panel",
        "materialParamKey=materials.body",
        "thicknessKey=shelfThickness"
      ]
    },
    {
      "id": "door-front",
      "itemType": "board",
      "category": "front",
      "name": "MDF White Supermat 18 - Flap Front",
      "description": "Flap Front",
      "pricingBasis": "sheet_area",
      "pricingUnit": "m2",
      "quantity": 1,
      "pricingQuantity": 0.7057,
      "formulas": {
        "lengthMm": "partMap(door-front).dimensionsMm.length",
        "widthMm": "partMap(door-front).dimensionsMm.width",
        "thicknessMm": "frontThicknessMm",
        "quantity": "1",
        "areaM2": "(lengthMm * widthMm * quantity) / 1000000",
        "wasteMultiplier": "1.1",
        "pricingQuantity": "areaM2 * wasteMultiplier"
      },
      "dimensionsMm": {
        "length": 896,
        "width": 716,
        "thickness": 18
      },
      "metrics": {
        "areaM2": 0.6415,
        "billableAreaM2": 0.7057,
        "wasteMultiplier": 1.1
      },
      "materialSlotId": "door-front",
      "materialGroup": "fronts",
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
        "door-front"
      ],
      "notes": [
        "partType=door-front",
        "materialParamKey=materials.front",
        "thicknessKey=frontThicknessMm"
      ]
    }
  ],
  "summary": {
    "totalItems": 8,
    "boardAreaM2": 3.9896,
    "boardAreaM2Priced": 4.3887,
    "boardPieces": 8
  }
} as const;

export function generateBoardBom() {
  return boardBomSnapshot;
}

export function summarizeBoardBom() {
  return boardBomSnapshot.summary;
}