export type FwmDrawerSystemBrand =
  | "merivobox"
  | "legrabox"
  | "strongbox"
  | "strongmax"
  | "atira"
  | "artitech"
  | "comfort_box";

export type FwmDrawerSystemSize = "M" | "D" | "E" | "F";

export type FwmDrawerSystemPreset = {
  brand: FwmDrawerSystemBrand;
  size: FwmDrawerSystemSize;
  label: string;
  excelSource: string;
  referenceUrl: string;
  referenceNote: string;
  minFrontHeightMm: number;
  systemDepthMm: number;
  bottomDepthDeductionMm: number;
  bottomWidthDeductionMm: number;
  backWidthDeductionMm: number;
  backHeightDeductionMm: number;
  cutleryInsertWidthDeductionMm: number;
  cutleryInsertDepthDeductionMm: number;
  innerDrawerFrontDeductionMm: number;
  innerDrawerCrossRailDeductionMm: number;
  pricePerSet: number;
  priceWithMargin: number;
  codeLabel: string;
};

type BrandOption = { label: string; value: FwmDrawerSystemBrand };

export const DEFAULT_FWM_DRAWER_SYSTEM_BRAND: FwmDrawerSystemBrand = "merivobox";
export const DEFAULT_FWM_DRAWER_SYSTEM_SIZE: FwmDrawerSystemSize = "M";

export const FWM_DRAWER_SYSTEM_BRAND_OPTIONS: readonly BrandOption[] = [
  { label: "MERIVOBOX", value: "merivobox" },
  { label: "LEGRABOX", value: "legrabox" },
  { label: "STRONGBOX", value: "strongbox" },
  { label: "STRONGMAX", value: "strongmax" },
  { label: "ATIRA", value: "atira" },
  { label: "ARTITECH", value: "artitech" },
  { label: "COMFORT BOX", value: "comfort_box" }
] as const;

const blumFrontHeightReference = "https://publications.blum.com/2024/catalogue/th/595/";
const merivoboxCuttingReference = "https://publications.blum.com/2022/catalogue/en/265/";
const atiraReference = "https://store.ney.co.uk/media/pdf/55/b3/e9/Innotech-Atira-144mm.pdf";
const artitechReference = "https://web.hettich.com/fileadmin/Company_website/HNZ/Media/220125_Hettich_New_Zealand_ArciTech_Drawer_System_-_Stocked_Range_Catalogue_WEB.pdf";
const strongboxReference = "https://www.demos-trade.eu/strongbox/";
const strongmaxReference = "https://brooton.ee/wp-content/uploads/2023/02/Brochure-StrongMax_18-A4-web.pdf";
const comfortBoxReference = "https://www.rejsltd.co.uk/comfort-drawer-system/comfort-box-front-drawer-push-open-rectangular";

function preset(
  input: Omit<FwmDrawerSystemPreset, "excelSource"> & { excelRows: string }
): FwmDrawerSystemPreset {
  return {
    ...input,
    excelSource: `Tabulka KUCHYNE-2024 verze V (2).xlsx / 1. Rozmery / ${input.excelRows}`
  };
}

export const FWM_DRAWER_SYSTEM_PRESETS: Record<FwmDrawerSystemBrand, Partial<Record<FwmDrawerSystemSize, FwmDrawerSystemPreset>>> = {
  merivobox: {
    M: preset({
      brand: "merivobox",
      size: "M",
      label: "MERIVOBOX M",
      excelRows: "rows 100-109, price row 75",
      referenceUrl: `${blumFrontHeightReference} ; ${merivoboxCuttingReference}`,
      referenceNote: "Blum table: MERIVOBOX M min front height 136 mm; cutting table: 83 mm chipboard back, base NL-26, width LW-51.",
      minFrontHeightMm: 136,
      systemDepthMm: 500,
      bottomDepthDeductionMm: 26,
      bottomWidthDeductionMm: 51,
      backWidthDeductionMm: 51,
      backHeightDeductionMm: 83,
      cutleryInsertWidthDeductionMm: 3,
      cutleryInsertDepthDeductionMm: 0,
      innerDrawerFrontDeductionMm: 126,
      innerDrawerCrossRailDeductionMm: 111,
      pricePerSet: 669,
      priceWithMargin: 1338,
      codeLabel: "kod merivo M"
    }),
    E: preset({
      brand: "merivobox",
      size: "E",
      label: "MERIVOBOX E",
      excelRows: "rows 100-109, price row 76",
      referenceUrl: blumFrontHeightReference,
      referenceNote: "Blum table: MERIVOBOX E high-front pull-out min front height 236 mm.",
      minFrontHeightMm: 236,
      systemDepthMm: 500,
      bottomDepthDeductionMm: 26,
      bottomWidthDeductionMm: 51,
      backWidthDeductionMm: 51,
      backHeightDeductionMm: 184,
      cutleryInsertWidthDeductionMm: 3,
      cutleryInsertDepthDeductionMm: 0,
      innerDrawerFrontDeductionMm: 126,
      innerDrawerCrossRailDeductionMm: 111,
      pricePerSet: 806,
      priceWithMargin: 1612,
      codeLabel: "kod merivo E"
    })
  },
  legrabox: {
    M: preset({
      brand: "legrabox",
      size: "M",
      label: "LEGRABOX M",
      excelRows: "rows 111-120, price row 79",
      referenceUrl: blumFrontHeightReference,
      referenceNote: "Blum table: LEGRABOX M min front height 132 mm.",
      minFrontHeightMm: 132,
      systemDepthMm: 500,
      bottomDepthDeductionMm: 10,
      bottomWidthDeductionMm: 35,
      backWidthDeductionMm: 38,
      backHeightDeductionMm: 63,
      cutleryInsertWidthDeductionMm: 7,
      cutleryInsertDepthDeductionMm: 0,
      innerDrawerFrontDeductionMm: 126,
      innerDrawerCrossRailDeductionMm: 90,
      pricePerSet: 987,
      priceWithMargin: 1974,
      codeLabel: "kod legrabox M"
    }),
    F: preset({
      brand: "legrabox",
      size: "F",
      label: "LEGRABOX F",
      excelRows: "rows 111-120, price row 80",
      referenceUrl: blumFrontHeightReference,
      referenceNote: "Blum table: LEGRABOX F high-front pull-out min front height 285 mm.",
      minFrontHeightMm: 285,
      systemDepthMm: 500,
      bottomDepthDeductionMm: 10,
      bottomWidthDeductionMm: 35,
      backWidthDeductionMm: 38,
      backHeightDeductionMm: 212,
      cutleryInsertWidthDeductionMm: 7,
      cutleryInsertDepthDeductionMm: 0,
      innerDrawerFrontDeductionMm: 126,
      innerDrawerCrossRailDeductionMm: 90,
      pricePerSet: 1120,
      priceWithMargin: 2240,
      codeLabel: "kod legrabox F"
    })
  },
  strongbox: {
    M: preset({
      brand: "strongbox",
      size: "M",
      label: "STRONGBOX M",
      excelRows: "rows 122-131, price row 95",
      referenceUrl: strongboxReference,
      referenceNote: "Demos StrongBox lists drawer headroom range from 105 to 225 mm and H86/H204 product families.",
      minFrontHeightMm: 105,
      systemDepthMm: 500,
      bottomDepthDeductionMm: 7,
      bottomWidthDeductionMm: 75,
      backWidthDeductionMm: 89,
      backHeightDeductionMm: 70,
      cutleryInsertWidthDeductionMm: 2,
      cutleryInsertDepthDeductionMm: 19,
      innerDrawerFrontDeductionMm: 87,
      innerDrawerCrossRailDeductionMm: 71,
      pricePerSet: 598,
      priceWithMargin: 1196,
      codeLabel: "kod strongbox M"
    }),
    D: preset({
      brand: "strongbox",
      size: "D",
      label: "STRONGBOX D",
      excelRows: "rows 122-131, price row 96",
      referenceUrl: strongboxReference,
      referenceNote: "Demos StrongBox high drawer family reaches 225 mm headroom; mapped to Excel high back height.",
      minFrontHeightMm: 225,
      systemDepthMm: 500,
      bottomDepthDeductionMm: 7,
      bottomWidthDeductionMm: 75,
      backWidthDeductionMm: 89,
      backHeightDeductionMm: 188,
      cutleryInsertWidthDeductionMm: 2,
      cutleryInsertDepthDeductionMm: 19,
      innerDrawerFrontDeductionMm: 87,
      innerDrawerCrossRailDeductionMm: 71,
      pricePerSet: 640,
      priceWithMargin: 1280,
      codeLabel: "kod strongbox D"
    })
  },
  strongmax: {
    M: preset({
      brand: "strongmax",
      size: "M",
      label: "STRONGMAX M",
      excelRows: "rows 133-142, price row 91",
      referenceUrl: strongmaxReference,
      referenceNote: "StrongMax 18 brochure lists low side height 89 mm.",
      minFrontHeightMm: 89,
      systemDepthMm: 500,
      bottomDepthDeductionMm: 20,
      bottomWidthDeductionMm: 21,
      backWidthDeductionMm: 42,
      backHeightDeductionMm: 59,
      cutleryInsertWidthDeductionMm: 0,
      cutleryInsertDepthDeductionMm: 7,
      innerDrawerFrontDeductionMm: 87,
      innerDrawerCrossRailDeductionMm: 55,
      pricePerSet: 506,
      priceWithMargin: 1012,
      codeLabel: "kod strongmax M"
    }),
    D: preset({
      brand: "strongmax",
      size: "D",
      label: "STRONGMAX D",
      excelRows: "rows 133-142, price row 92",
      referenceUrl: strongmaxReference,
      referenceNote: "StrongMax 18 brochure lists high side height 185 mm.",
      minFrontHeightMm: 185,
      systemDepthMm: 500,
      bottomDepthDeductionMm: 20,
      bottomWidthDeductionMm: 21,
      backWidthDeductionMm: 42,
      backHeightDeductionMm: 155,
      cutleryInsertWidthDeductionMm: 0,
      cutleryInsertDepthDeductionMm: 7,
      innerDrawerFrontDeductionMm: 87,
      innerDrawerCrossRailDeductionMm: 55,
      pricePerSet: 714,
      priceWithMargin: 1428,
      codeLabel: "kod strongmax D"
    })
  },
  atira: {
    M: preset({
      brand: "atira",
      size: "M",
      label: "ATIRA M",
      excelRows: "rows 144-153, price row 83",
      referenceUrl: atiraReference,
      referenceNote: "InnoTech Atira technical sheet lists standard drawer front height 70 mm.",
      minFrontHeightMm: 70,
      systemDepthMm: 470,
      bottomDepthDeductionMm: 10,
      bottomWidthDeductionMm: 72.5,
      backWidthDeductionMm: 84,
      backHeightDeductionMm: 65.5,
      cutleryInsertWidthDeductionMm: 68,
      cutleryInsertDepthDeductionMm: 18,
      innerDrawerFrontDeductionMm: 78.5,
      innerDrawerCrossRailDeductionMm: 111.5,
      pricePerSet: 609,
      priceWithMargin: 1218,
      codeLabel: "kod atira M"
    }),
    D: preset({
      brand: "atira",
      size: "D",
      label: "ATIRA D",
      excelRows: "rows 144-153, price row 84",
      referenceUrl: atiraReference,
      referenceNote: "InnoTech Atira technical sheet lists standard drawer front height 144 mm.",
      minFrontHeightMm: 144,
      systemDepthMm: 470,
      bottomDepthDeductionMm: 10,
      bottomWidthDeductionMm: 72.5,
      backWidthDeductionMm: 84,
      backHeightDeductionMm: 144,
      cutleryInsertWidthDeductionMm: 68,
      cutleryInsertDepthDeductionMm: 18,
      innerDrawerFrontDeductionMm: 78.5,
      innerDrawerCrossRailDeductionMm: 111.5,
      pricePerSet: 746,
      priceWithMargin: 1492,
      codeLabel: "kod atira D"
    })
  },
  artitech: {
    M: preset({
      brand: "artitech",
      size: "M",
      label: "ARTITECH M",
      excelRows: "rows 155-164, price row 87",
      referenceUrl: artitechReference,
      referenceNote: "ArciTech catalogue lists standard drawer height 94 mm.",
      minFrontHeightMm: 94,
      systemDepthMm: 500,
      bottomDepthDeductionMm: 24.5,
      bottomWidthDeductionMm: 73.5,
      backWidthDeductionMm: 85,
      backHeightDeductionMm: 84.5,
      cutleryInsertWidthDeductionMm: 68,
      cutleryInsertDepthDeductionMm: 27,
      innerDrawerFrontDeductionMm: 88,
      innerDrawerCrossRailDeductionMm: 92.5,
      pricePerSet: 701,
      priceWithMargin: 1402,
      codeLabel: "kod artitech M"
    }),
    D: preset({
      brand: "artitech",
      size: "D",
      label: "ARTITECH D",
      excelRows: "rows 155-164, price row 88",
      referenceUrl: artitechReference,
      referenceNote: "ArciTech catalogue lists pot-and-pan drawer height 186 mm.",
      minFrontHeightMm: 186,
      systemDepthMm: 500,
      bottomDepthDeductionMm: 24.5,
      bottomWidthDeductionMm: 73.5,
      backWidthDeductionMm: 85,
      backHeightDeductionMm: 208,
      cutleryInsertWidthDeductionMm: 68,
      cutleryInsertDepthDeductionMm: 27,
      innerDrawerFrontDeductionMm: 88,
      innerDrawerCrossRailDeductionMm: 92.5,
      pricePerSet: 864,
      priceWithMargin: 1728,
      codeLabel: "kod artitech D"
    })
  },
  comfort_box: {
    M: preset({
      brand: "comfort_box",
      size: "M",
      label: "COMFORT BOX M",
      excelRows: "rows 166-175, price row 97",
      referenceUrl: comfortBoxReference,
      referenceNote: "Comfort Box product specification lists 2D front adjustment H=86.",
      minFrontHeightMm: 86,
      systemDepthMm: 500,
      bottomDepthDeductionMm: 5,
      bottomWidthDeductionMm: 75,
      backWidthDeductionMm: 89,
      backHeightDeductionMm: 70,
      cutleryInsertWidthDeductionMm: 2,
      cutleryInsertDepthDeductionMm: 15,
      innerDrawerFrontDeductionMm: 87,
      innerDrawerCrossRailDeductionMm: 70,
      pricePerSet: 701,
      priceWithMargin: 1402,
      codeLabel: "kod comfort box M"
    }),
    D: preset({
      brand: "comfort_box",
      size: "D",
      label: "COMFORT BOX D",
      excelRows: "rows 166-175, price row 98",
      referenceUrl: comfortBoxReference,
      referenceNote: "Comfort Box product specification lists high fronts H=140, H=164, H=204; Excel high profile maps to H=204.",
      minFrontHeightMm: 204,
      systemDepthMm: 500,
      bottomDepthDeductionMm: 5,
      bottomWidthDeductionMm: 75,
      backWidthDeductionMm: 89,
      backHeightDeductionMm: 188,
      cutleryInsertWidthDeductionMm: 2,
      cutleryInsertDepthDeductionMm: 15,
      innerDrawerFrontDeductionMm: 87,
      innerDrawerCrossRailDeductionMm: 70,
      pricePerSet: 782,
      priceWithMargin: 1564,
      codeLabel: "kod comfort box D"
    })
  }
};

export function normalizeFwmDrawerSystemBrand(value: unknown): FwmDrawerSystemBrand {
  const text = typeof value === "string" ? value.trim().toLowerCase().replace(/[\s-]+/g, "_") : "";
  if (text === "legrabox") return "legrabox";
  if (text === "strongbox" || text === "strong_box") return "strongbox";
  if (text === "strongmax" || text === "strong_max") return "strongmax";
  if (text === "atira" || text === "innotech_atira") return "atira";
  if (text === "artitech" || text === "arcitech" || text === "arci_tech") return "artitech";
  if (text === "comfort_box" || text === "comfortbox") return "comfort_box";
  return DEFAULT_FWM_DRAWER_SYSTEM_BRAND;
}

export function normalizeFwmDrawerSystemSize(value: unknown): FwmDrawerSystemSize {
  const text = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (text === "D" || text === "E" || text === "F") return text;
  return DEFAULT_FWM_DRAWER_SYSTEM_SIZE;
}

export function listFwmDrawerSystemPresetsForBrand(brandValue: unknown): FwmDrawerSystemPreset[] {
  const brand = normalizeFwmDrawerSystemBrand(brandValue);
  return Object.values(FWM_DRAWER_SYSTEM_PRESETS[brand])
    .filter((presetValue): presetValue is FwmDrawerSystemPreset => !!presetValue)
    .sort((left, right) => left.minFrontHeightMm - right.minFrontHeightMm);
}

export function resolveFwmDrawerSystemPreset(brandValue: unknown, sizeValue: unknown): FwmDrawerSystemPreset {
  const brand = normalizeFwmDrawerSystemBrand(brandValue);
  const requestedSize = normalizeFwmDrawerSystemSize(sizeValue);
  const brandPresets = FWM_DRAWER_SYSTEM_PRESETS[brand];
  return brandPresets[requestedSize] ?? listFwmDrawerSystemPresetsForBrand(brand)[0] ?? FWM_DRAWER_SYSTEM_PRESETS.merivobox.M!;
}

export function resolveFwmDrawerSystemPresetForFrontHeight(brandValue: unknown, frontHeightMm: number): FwmDrawerSystemPreset {
  const brandPresets = listFwmDrawerSystemPresetsForBrand(brandValue);
  const height = Number.isFinite(frontHeightMm) ? frontHeightMm : 0;
  let selected = brandPresets[0] ?? FWM_DRAWER_SYSTEM_PRESETS.merivobox.M!;
  for (const candidate of brandPresets) {
    if (height >= candidate.minFrontHeightMm) selected = candidate;
  }
  return selected;
}
