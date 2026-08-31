import type { ClientCatalog } from "../core/catalog/catalog-types";
import type { PriceCurrency } from "../core/pricing/currency";
import type { KitchenContext } from "../layout/kitchenContext";
import type { KitchenWorktopInstance, LayoutInstance } from "../layout/appState";
import type { CustomFurnitureInstance } from "../layout/customFurnitureTypes";
import {
  buildProjectPricingViews,
  type ProjectPricingView
} from "../layout/bom/projectPricing";
import {
  buildProjectQuoteSummary,
  type ProjectQuoteSettingsInput
} from "../layout/bom/projectQuote";

type ProjectPricingSummaryInput = {
  catalog: ClientCatalog;
  currency: PriceCurrency;
  customFurniture: CustomFurnitureInstance[];
  instances: LayoutInstance[];
  kitchenContext: KitchenContext;
  quoteSettings: ProjectQuoteSettingsInput;
  worktops: KitchenWorktopInstance[];
};

export type ProjectPricingSummaryControllerContext = {
  getPricingInput: () => ProjectPricingSummaryInput;
  root: ParentNode;
};

type PricingSummaryElements = {
  calculationState: HTMLElement;
  finalPrice: HTMLElement;
  itemCount: HTMLElement;
  missingPriceCount: HTMLElement;
  recalculateButton: HTMLButtonElement;
};

function formatCurrency(value: number, currency: PriceCurrency) {
  return new Intl.NumberFormat("sk-SK", {
    style: "currency",
    currency,
    maximumFractionDigits: 0
  }).format(value);
}

function findElements(root: ParentNode): PricingSummaryElements | null {
  const summary = root.querySelector<HTMLElement>("[data-project-pricing-summary]");
  const calculationState = root.querySelector<HTMLElement>("[data-project-pricing-state]");
  const finalPrice = root.querySelector<HTMLElement>("[data-project-pricing-final-price]");
  const itemCount = root.querySelector<HTMLElement>("[data-project-pricing-item-count]");
  const missingPriceCount = root.querySelector<HTMLElement>("[data-project-pricing-missing-count]");
  const recalculateButton = root.querySelector<HTMLButtonElement>("[data-recalculate-project-price]");
  if (!summary || !calculationState || !finalPrice || !itemCount || !missingPriceCount || !recalculateButton) {
    return null;
  }
  return { calculationState, finalPrice, itemCount, missingPriceCount, recalculateButton };
}

function missingPrices(entries: readonly ProjectPricingView[]) {
  return entries.reduce(
    (count, entry) => count + entry.result.pricing.items.filter((item) => item.itemCost == null).length,
    0
  );
}

function waitForPaint() {
  return new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
}

/**
 * Owns the compact, explicit pricing action in the project overview. The
 * calculation deliberately happens only after the user requests it, so normal
 * editing never blocks on pricing work.
 */
export function createProjectPricingSummaryController(ctx: ProjectPricingSummaryControllerContext) {
  const elements = findElements(ctx.root);
  let calculating = false;

  const setIdle = () => {
    if (!elements) return;
    elements.recalculateButton.disabled = false;
    elements.recalculateButton.textContent = "Prepočítať cenu";
  };

  const recalculate = async () => {
    if (!elements || calculating) return;
    calculating = true;
    elements.calculationState.textContent = "Prepočítavam cenu…";
    elements.recalculateButton.disabled = true;
    elements.recalculateButton.textContent = "Prepočítavam…";
    await waitForPaint();

    try {
      const input = ctx.getPricingInput();
      const entries = buildProjectPricingViews(
        input.instances,
        input.worktops,
        input.customFurniture,
        input.kitchenContext,
        input.catalog
      );
      const summary = buildProjectQuoteSummary(entries, input.quoteSettings);
      const missingCount = missingPrices(entries);
      const itemCount = entries.reduce((count, entry) => count + entry.result.pricing.items.length, 0);

      elements.finalPrice.textContent = formatCurrency(summary.finalPrice, input.currency);
      elements.itemCount.textContent = String(itemCount);
      elements.missingPriceCount.textContent = String(missingCount);
      elements.calculationState.textContent = missingCount > 0
        ? "Cena je vypočítaná, niektoré položky ešte nemajú cenu."
        : "Cena je aktuálna.";
    } catch {
      elements.calculationState.textContent = "Cenu sa nepodarilo prepočítať. Skontrolujte materiály a komponenty.";
    } finally {
      calculating = false;
      setIdle();
    }
  };

  elements?.recalculateButton.addEventListener("click", () => {
    void recalculate();
  });

  return { recalculate };
}
