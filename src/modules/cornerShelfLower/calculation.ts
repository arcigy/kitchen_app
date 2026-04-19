import type { CornerShelfLowerParams } from "../../model/cabinetTypes";
import type { KitchenContext } from "../../layout/kitchenContext";
import type { BOMPart, BOMResult } from "../../layout/bom/bomTypes";

const FIT_EPS_MM = 0.2;

export function calculateBOM(
  params: CornerShelfLowerParams,
  ctx: KitchenContext
): BOMResult {
  void ctx;

  const bodyMaterialId = params.materials.bodyKey || "corpus_default";
  const frontMaterialId = params.materials.frontKey || "front_default";
  const backMaterialId = "back_panel_default";

  const openingHeightMm = params.height - params.plinthHeight;
  const parts: BOMPart[] = [];

  addPart(parts, {
    name: "Koncový bok",
    widthMm: params.depth,
    heightMm: openingHeightMm,
    thicknessMm: params.boardThickness,
    materialId: bodyMaterialId,
    quantity: 2
  });

  addPart(parts, {
    name: "Zadný panel X",
    widthMm: safeDimMm(params.lengthX - params.boardThickness - params.backThickness - FIT_EPS_MM),
    heightMm: openingHeightMm,
    thicknessMm: params.backThickness,
    materialId: backMaterialId,
    quantity: 1
  });

  addPart(parts, {
    name: "Zadný panel Z",
    widthMm: safeDimMm(params.lengthZ - params.boardThickness - params.backThickness - FIT_EPS_MM),
    heightMm: openingHeightMm,
    thicknessMm: params.backThickness,
    materialId: backMaterialId,
    quantity: 1
  });

  const lPanelDepthMm = safeDimMm(params.depth - params.backThickness - FIT_EPS_MM);
  const lPanelXLenMm = safeDimMm(params.lengthX - params.boardThickness - params.backThickness - FIT_EPS_MM);
  const lPanelZLenMm = params.lengthZ - params.boardThickness - params.depth - FIT_EPS_MM;

  addPart(parts, {
    name: "Dno X časť",
    widthMm: lPanelXLenMm,
    heightMm: lPanelDepthMm,
    thicknessMm: params.boardThickness,
    materialId: bodyMaterialId,
    quantity: 1
  });

  if (lPanelZLenMm > 0.1) {
    addPart(parts, {
      name: "Dno Z časť",
      widthMm: lPanelZLenMm,
      heightMm: lPanelDepthMm,
      thicknessMm: params.boardThickness,
      materialId: bodyMaterialId,
      quantity: 1
    });
  }

  addPart(parts, {
    name: "Vrchná doska X časť",
    widthMm: lPanelXLenMm,
    heightMm: lPanelDepthMm,
    thicknessMm: params.boardThickness,
    materialId: bodyMaterialId,
    quantity: 1
  });

  if (lPanelZLenMm > 0.1) {
    addPart(parts, {
      name: "Vrchná doska Z časť",
      widthMm: lPanelZLenMm,
      heightMm: lPanelDepthMm,
      thicknessMm: params.boardThickness,
      materialId: bodyMaterialId,
      quantity: 1
    });
  }

  if (params.plinthHeight > 0) {
    const kickDepthMm = Math.min(params.boardThickness, params.depth * 0.2);
    const cornerWidthMm = params.boardThickness + 2;
    const kickXLenMm = params.lengthX - params.depth - 2 * params.boardThickness - 2 - FIT_EPS_MM;
    const kickZLenMm = params.lengthZ - params.depth - 2 * params.boardThickness - 2 - FIT_EPS_MM;

    addPart(parts, {
      name: "Rohový sokel",
      widthMm: cornerWidthMm,
      heightMm: params.plinthHeight,
      thicknessMm: kickDepthMm,
      materialId: bodyMaterialId,
      quantity: 2
    });

    if (kickXLenMm > 0.1) {
      addPart(parts, {
        name: "Sokel X",
        widthMm: kickXLenMm,
        heightMm: params.plinthHeight,
        thicknessMm: kickDepthMm,
        materialId: bodyMaterialId,
        quantity: 1
      });
    }

    if (kickZLenMm > 0.1) {
      addPart(parts, {
        name: "Sokel Z",
        widthMm: kickZLenMm,
        heightMm: params.plinthHeight,
        thicknessMm: kickDepthMm,
        materialId: bodyMaterialId,
        quantity: 1
      });
    }
  }

  const internalShelfCount = Math.max(0, Math.max(1, Math.round(params.shelfCount)) - 1);
  if (internalShelfCount > 0) {
    const shelfDepthMm = safeDimMm(params.depth - params.backThickness);
    const shelfXLenMm = safeDimMm(params.lengthX - params.boardThickness - params.backThickness);
    const shelfZLenMm = Math.max(0, params.lengthZ - params.boardThickness - params.depth);

    addPart(parts, {
      name: "Vnútorná polica X časť",
      widthMm: shelfXLenMm,
      heightMm: shelfDepthMm,
      thicknessMm: params.shelfThickness,
      materialId: bodyMaterialId,
      quantity: internalShelfCount
    });

    if (shelfZLenMm > 0.1) {
      addPart(parts, {
        name: "Vnútorná polica Z časť",
        widthMm: shelfZLenMm,
        heightMm: shelfDepthMm,
        thicknessMm: params.shelfThickness,
        materialId: bodyMaterialId,
        quantity: internalShelfCount
      });
    }
  }

  const doorHeightMm = Math.max(100, openingHeightMm);
  const outerXLenMm = Math.max(0, params.lengthX - params.depth);
  const outerZLenMm = Math.max(0, params.lengthZ - params.depth);
  if (outerXLenMm > 0.1) {
    addPart(parts, {
      name: "Dvierka Z čelo",
      widthMm: Math.max(50, outerXLenMm),
      heightMm: doorHeightMm,
      thicknessMm: params.boardThickness,
      materialId: frontMaterialId,
      quantity: 1
    });

    if (params.doorDouble && outerZLenMm > 0.1) {
      const buttOffsetMm = Math.min(params.boardThickness, Math.max(0, outerZLenMm - 60));
      addPart(parts, {
        name: "Dvierka X čelo",
        widthMm: Math.max(50, outerZLenMm - buttOffsetMm),
        heightMm: doorHeightMm,
        thicknessMm: params.boardThickness,
        materialId: frontMaterialId,
        quantity: 1
      });
    }
  }

  return {
    moduleType: "cornerShelfLower",
    parts,
    hardware: [],
    totalPrice: 0
  };
}

function addPart(parts: BOMPart[], part: Omit<BOMPart, "areaMm2" | "pricePerM2" | "totalPrice">) {
  const widthMm = roundMm1(part.widthMm);
  const heightMm = roundMm1(part.heightMm);
  const thicknessMm = roundMm1(part.thicknessMm);

  parts.push({
    ...part,
    widthMm,
    heightMm,
    thicknessMm,
    areaMm2: roundMm1(widthMm * heightMm),
    pricePerM2: 0,
    totalPrice: 0
  });
}

function safeDimMm(value: number) {
  return Math.max(10, value);
}

function roundMm1(value: number) {
  return Math.round(value * 10) / 10;
}
