/** UI-only copy for the independently bundled Supplier Bridge extension. */
export type SupplierBridgeLanguage = "sk" | "cs" | "en";

export function normalizeSupplierBridgeLanguage(value: unknown): SupplierBridgeLanguage {
  return value === "cs" || value === "cz" ? "cs" : value === "en" ? "en" : "sk";
}

/**
 * Keep every rendered string explicit in all supported languages. Dynamic
 * catalogue/project names deliberately stay untouched because they are tenant
 * data, not system UI copy.
 */
export function extensionCopy(language: SupplierBridgeLanguage, sk: string, cs: string, en: string): string {
  return language === "cs" ? cs : language === "en" ? en : sk;
}
