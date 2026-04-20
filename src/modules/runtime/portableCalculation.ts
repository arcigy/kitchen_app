export type PortableBomSnapshot = {
  items: Array<{
    id: string;
    category: "board" | "front" | "drawer" | "hardware" | "service";
    description: string;
    unit: "pcs";
    quantity: number;
    sizeMm?: {
      width: number;
      height: number;
      depth: number;
      thickness: number;
    };
    materialRole?: string;
  }>;
};

export type PortablePricingSnapshot = {
  totals?: {
    finalTotal?: number;
  };
};

export function buildPortableBomResult(args: {
  moduleType: string;
  bom: PortableBomSnapshot;
  pricing?: PortablePricingSnapshot | null;
}) {
  const { moduleType, bom, pricing } = args;
  const parts = bom.items
    .filter((item) => item.category !== "hardware" && item.category !== "service")
    .map((item) => {
      const widthMm = item.sizeMm?.width ?? 0;
      const heightMm = item.sizeMm?.height ?? 0;
      const thicknessMm = item.sizeMm?.thickness ?? item.sizeMm?.depth ?? 0;
      const areaMm2 = widthMm * heightMm;
      return {
        name: item.description,
        widthMm,
        heightMm,
        thicknessMm,
        materialId: item.materialRole ?? item.category,
        quantity: item.quantity,
        areaMm2,
        pricePerM2: 0,
        totalPrice: 0
      };
    });

  const hardware = bom.items
    .filter((item) => item.category === "hardware" || item.category === "service")
    .map((item) => ({
      name: item.description,
      hardwareId: item.id,
      quantity: item.quantity,
      pricePerPiece: 0,
      totalPrice: 0
    }));

  return {
    moduleType,
    parts,
    hardware,
    totalPrice: pricing?.totals?.finalTotal ?? 0
  };
}
