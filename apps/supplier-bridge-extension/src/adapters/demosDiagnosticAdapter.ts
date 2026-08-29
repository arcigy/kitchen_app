import type { SupplierAdapter } from "./types";

export const demosDiagnosticAdapter: SupplierAdapter = {
  supplierId: "demos-diagnostic",
  productionReady: false,
  capabilities: new Set(),
  supportsUrl() {
    return false;
  },
  detectPage() {
    return "diagnostic";
  },
  async extractCurrentPage() {
    return {
      supplierId: "demos-diagnostic",
      pageType: "diagnostic",
      candidates: [],
      warnings: ["Real diagnostic fixtures are required before Démos extraction can be implemented."],
      errorCode: "REAL_FIXTURES_REQUIRED"
    };
  }
};
