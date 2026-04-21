import type {
  PortableCommercialPricingPayload,
  PortableMaterialsSnapshot,
  PortableQuoteBomPayload
} from "../../modules/runtime/portableCommercial";

export interface BOMResult {
  moduleType: string;
  displayName: string;
  quoteBom: PortableQuoteBomPayload;
  pricing: PortableCommercialPricingPayload;
  materialsSnapshot?: PortableMaterialsSnapshot | null;
}

export interface ProjectBOMResult {
  modules: Array<BOMResult & { instanceId: string }>;
  totals: {
    boardsCost: number;
    edgesCost: number;
    hardwareCost: number;
    laborCost: number;
    finalCost: number;
  };
}
