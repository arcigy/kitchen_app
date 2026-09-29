/** Kept separate from legacy markup fields so exported v4 pricing remains compatible. */
export type ProjectContribution = {
  purchaseCost: number;
  laborRevenue: number;
  contributionAmount: number;
  contributionPercent: number | null;
};

export function projectContribution(purchaseCost: number, finalPrice: number, laborRevenue: number): ProjectContribution {
  const cents = (value: number) => Math.round(value * 100);
  const purchase = cents(purchaseCost);
  const contribution = cents(finalPrice) - purchase;
  return {
    purchaseCost: purchase / 100,
    laborRevenue: cents(laborRevenue) / 100,
    contributionAmount: contribution / 100,
    contributionPercent: purchase > 0 ? Math.round(contribution / purchase * 10_000) / 100 : null
  };
}
