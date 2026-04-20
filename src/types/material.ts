export type MaterialCurrency = "EUR";

export interface Material {
  id: number;
  name: string;
  type: string;
  thickness_mm: number;
  price_eur_m2: number;
  currency: MaterialCurrency;
  vat_included: boolean;
  is_public: boolean;
}

export type MaterialId = Material["id"];
