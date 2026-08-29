import type { PricingUnit } from "../../core/catalog/catalog-types";
import type { ProjectMaterialAssignment } from "../../core/project-materials/project-material-types";
import { resolveEffectiveProjectMaterialAssignment } from "../../core/project-materials/project-material-assignment-resolution";
import {
  convertPriceCurrency,
  isPriceCurrency,
  type PriceCurrency
} from "../../core/pricing/currency";
import {
  MATERIAL_ASSIGNMENT_CATEGORIES,
  getMaterialAssignmentCategoryDefinition
} from "../../core/project-materials/project-material-business";
import {
  normalizeProjectMarginSettingsState,
  projectMarginTargetId,
  resolveEffectiveProjectMarginPercent,
  type ProjectMarginCategory,
  type ProjectMarginSettingsState,
  type ProjectMarginTarget
} from "../../core/project-margins/project-margin-types";
import {
  isProjectMarginCategory,
  validateProjectMarginSettingsState
} from "../../core/project-margins/project-margin-validation";
import type { PortableQuoteBomItem } from "../../modules/runtime/portableCommercial";
import type { ProjectPricingView } from "./projectPricing";
import { projectMaterialCategoryForBomItem } from "./projectMaterialCategory";

export type ProjectMarginItemSource = "override" | "group" | "fallback";

export type ProjectMarginWarning = {
  code: "missing_price" | "unsupported_currency" | "unclassified_item" | "orphaned_override" | "pricing_incomplete";
  message: string;
  targetId?: string;
};

export type ProjectMarginItemView = {
  targetId: string;
  scopeId: string;
  itemId: string;
  category: ProjectMarginCategory;
  label: string;
  scopeLabel: string;
  resourceLabel: string;
  quantity: number;
  unit: PricingUnit;
  baseCost: number;
  marginPercent: number;
  marginAmount: number;
  finalPrice: number;
  source: ProjectMarginItemSource;
  missingPrice: boolean;
};

export type ProjectMarginGroupView = {
  category: ProjectMarginCategory;
  label: string;
  description: string;
  baseCost: number;
  marginPercent: number;
  combinedMarginPercent: number;
  marginAmount: number;
  finalPrice: number;
  overrideCount: number;
  missingPriceCount: number;
  items: ProjectMarginItemView[];
};

export type ProjectMarginSummaryView = {
  baseCost: number;
  marginAmount: number;
  combinedMarginPercent: number;
  finalPrice: number;
  overrideCount: number;
  missingPriceCount: number;
};

export type ProjectMarginsView = {
  revision: number;
  editable: boolean;
  currency: PriceCurrency;
  priceAuthority: string;
  settings: ProjectMarginSettingsState;
  summary: ProjectMarginSummaryView;
  groups: ProjectMarginGroupView[];
  warnings: ProjectMarginWarning[];
};

export type ProjectMarginSettingsOperation =
  | { type: "set_default"; marginPercent: number }
  | { type: "set_group"; category: ProjectMarginCategory; marginPercent: number }
  | { type: "set_item"; target: ProjectMarginTarget; marginPercent: number }
  | { type: "reset_group"; category: ProjectMarginCategory }
  | { type: "reset_item"; target: ProjectMarginTarget }
  | { type: "set_additional_labor"; additionalLaborCost: number };

type DraftMarginItem = Omit<ProjectMarginItemView, "marginAmount" | "finalPrice"> & {
  costCents: number;
  percentHundredths: number;
  marginCents: number;
};

const MONEY_DENOMINATOR = 10_000n;

function round(value: number, digits = 2): number {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function moneyCents(value: number): number {
  const cents = Math.round(value * 100);
  if (!Number.isSafeInteger(cents) || cents < 0) throw new Error("Project margin cost is outside the supported money range.");
  return cents;
}

function percentageHundredths(value: number): number {
  return Math.round(value * 100);
}

function itemScopeId(entry: ProjectPricingView): string {
  return entry.kind === "module" ? `module:${entry.instanceId}` : `addition:${entry.instanceId}`;
}

function resourceLabel(item: PortableQuoteBomItem): string {
  return item.material?.displayName ?? item.component?.displayName ?? "Neocenená položka";
}

type AssignedPriceResolution = {
  baseCost: number | null;
  resourceLabel: string;
  warning?: string;
};

function assignedPriceResolution(
  assignments: readonly ProjectMaterialAssignment[],
  scopeId: string,
  category: ProjectMarginCategory,
  item: PortableQuoteBomItem,
  targetCurrency: PriceCurrency
): AssignedPriceResolution | null {
  if (category === "labor") return null;
  const effective = resolveEffectiveProjectMaterialAssignment(assignments, scopeId, { id: item.id, category });
  const assignment = effective.assignment;
  if (!assignment) return null;
  const snapshot = assignment.kind === "material"
    ? assignment.snapshots.material
    : assignment.snapshots.component;
  if (!snapshot) {
    return { baseCost: null, resourceLabel: "Nepriradená položka" };
  }
  const label = snapshot.definition.displayName || snapshot.definition.name || "Priradená položka";
  const quantity = item.pricingQuantity;
  if (snapshot.unitPrice == null || !Number.isFinite(quantity) || quantity < 0) {
    return { baseCost: null, resourceLabel: label };
  }
  if (!isPriceCurrency(snapshot.currency)) {
    return {
      baseCost: null,
      resourceLabel: label,
      warning: `Priradená položka ${label} používa nepodporovanú menu ${snapshot.currency}.`
    };
  }
  return {
    baseCost: convertPriceCurrency(snapshot.unitPrice * quantity, snapshot.currency, targetCurrency),
    resourceLabel: label
  };
}

function bomBaseCost(
  value: number | null | undefined,
  sourceCurrency: unknown,
  targetCurrency: PriceCurrency
): number | null {
  if (value == null || !isPriceCurrency(sourceCurrency)) return null;
  return convertPriceCurrency(value, sourceCurrency, targetCurrency);
}

function itemLabel(item: PortableQuoteBomItem): string {
  return item.description?.trim() || item.name?.trim() || item.id;
}

function itemSource(state: ProjectMarginSettingsState, target: ProjectMarginTarget): ProjectMarginItemSource {
  const targetId = projectMarginTargetId(target);
  if (state.itemOverrides.some((override) => override.targetId === targetId)) return "override";
  if (state.groupMargins[target.category] !== undefined) return "group";
  return "fallback";
}

function draftItem(args: {
  state: ProjectMarginSettingsState;
  target: ProjectMarginTarget;
  label: string;
  scopeLabel: string;
  resourceLabel: string;
  quantity: number;
  unit: PricingUnit;
  baseCost: number;
  missingPrice: boolean;
}): DraftMarginItem {
  const marginPercent = resolveEffectiveProjectMarginPercent(args.state, args.target);
  const costCents = moneyCents(args.baseCost);
  return {
    targetId: projectMarginTargetId(args.target),
    ...args.target,
    label: args.label,
    scopeLabel: args.scopeLabel,
    resourceLabel: args.resourceLabel,
    quantity: args.quantity,
    unit: args.unit,
    baseCost: costCents / 100,
    marginPercent,
    source: itemSource(args.state, args.target),
    missingPrice: args.missingPrice,
    costCents,
    percentHundredths: percentageHundredths(marginPercent),
    marginCents: 0
  };
}

/** Allocate the rounded project margin back to lines without a one-cent drift. */
function allocateMarginCents(items: DraftMarginItem[]): void {
  const allocations = items.map((item) => {
    const numerator = BigInt(item.costCents) * BigInt(item.percentHundredths);
    return {
      item,
      floor: numerator / MONEY_DENOMINATOR,
      remainder: numerator % MONEY_DENOMINATOR
    };
  });
  const totalNumerator = allocations.reduce(
    (total, allocation) => total + BigInt(allocation.item.costCents) * BigInt(allocation.item.percentHundredths),
    0n
  );
  const roundedTotal = (totalNumerator + MONEY_DENOMINATOR / 2n) / MONEY_DENOMINATOR;
  const floorTotal = allocations.reduce((total, allocation) => total + allocation.floor, 0n);
  let centsToAllocate = Number(roundedTotal - floorTotal);
  allocations.sort((left, right) => {
    if (left.remainder !== right.remainder) return left.remainder > right.remainder ? -1 : 1;
    return left.item.targetId.localeCompare(right.item.targetId);
  });
  for (const allocation of allocations) {
    const cents = allocation.floor + (centsToAllocate > 0 ? 1n : 0n);
    if (centsToAllocate > 0) centsToAllocate -= 1;
    const numeric = Number(cents);
    if (!Number.isSafeInteger(numeric)) throw new Error("Project margin is outside the supported money range.");
    allocation.item.marginCents = numeric;
  }
}

function combinedPercent(baseCents: number, marginCents: number): number {
  return baseCents === 0 ? 0 : round((marginCents / baseCents) * 100, 2);
}

function groupMetadata(category: ProjectMarginCategory): { label: string; description: string } {
  if (category === "labor") return { label: "Práca", description: "Modulová a dodatočná projektová práca" };
  const definition = getMaterialAssignmentCategoryDefinition(category);
  return { label: definition.label, description: definition.description };
}

const ORDERED_CATEGORIES: readonly ProjectMarginCategory[] = [
  ...MATERIAL_ASSIGNMENT_CATEGORIES.map((definition) => definition.category),
  "labor"
];

export function buildProjectMarginsView(
  entries: readonly ProjectPricingView[],
  inputState: ProjectMarginSettingsState | unknown,
  options: {
    editable?: boolean;
    warnings?: readonly string[];
    currency?: PriceCurrency;
    materialAssignments?: readonly ProjectMaterialAssignment[];
  } = {}
): ProjectMarginsView {
  const state = normalizeProjectMarginSettingsState(inputState);
  validateProjectMarginSettingsState(state);
  const warnings: ProjectMarginWarning[] = (options.warnings ?? []).map((message) => ({
    code: "pricing_incomplete",
    message
  }));
  const drafts: DraftMarginItem[] = [];
  const seenTargetIds = new Set<string>();
  const currency = options.currency ?? "EUR";
  const materialAssignments = options.materialAssignments ?? [];

  for (const entry of entries) {
    const scopeId = itemScopeId(entry);
    if (entry.result.pricing.pricingStatus === "incomplete") {
      warnings.push(...entry.result.pricing.validationErrors.map((message) => ({
        code: "pricing_incomplete" as const,
        message: `${entry.label}: ${message}`
      })));
    }
    for (const item of entry.result.pricing.items) {
      let category = projectMaterialCategoryForBomItem(item);
      if (!category) {
        category = "other_component";
        warnings.push({
          code: "unclassified_item",
          message: `${entry.label}: položka ${itemLabel(item)} nemá známu cenovú skupinu a je dočasne vedená medzi ostatnými položkami.`
        });
      }
      const target = { scopeId, itemId: item.id, category } satisfies ProjectMarginTarget;
      const targetId = projectMarginTargetId(target);
      if (seenTargetIds.has(targetId)) {
        throw new Error(`Duplicate project margin target ${targetId} in the current BOM.`);
      }
      seenTargetIds.add(targetId);
      const assignedPrice = assignedPriceResolution(materialAssignments, scopeId, category, item, currency);
      if (assignedPrice?.warning) {
        warnings.push({
          code: "unsupported_currency",
          targetId,
          message: assignedPrice.warning
        });
      }
      const baseCost = assignedPrice
        ? assignedPrice.baseCost
        : bomBaseCost(item.itemCost, entry.result.pricing.priceInputs.currency, currency);
      const missingPrice = baseCost == null;
      if (missingPrice) {
        warnings.push({
          code: "missing_price",
          targetId: projectMarginTargetId(target),
          message: `${entry.label}: položka ${itemLabel(item)} nemá platnú nákupnú cenu.`
        });
      }
      drafts.push(draftItem({
        state,
        target,
        label: itemLabel(item),
        scopeLabel: entry.label,
        resourceLabel: assignedPrice?.resourceLabel ?? resourceLabel(item),
        quantity: Number.isFinite(item.pricingQuantity) ? item.pricingQuantity : 0,
        unit: item.pricingUnit,
        baseCost: baseCost ?? 0,
        missingPrice
      }));
    }

    const laborTarget = { scopeId, itemId: "labor", category: "labor" } satisfies ProjectMarginTarget;
    const laborTargetId = projectMarginTargetId(laborTarget);
    if (seenTargetIds.has(laborTargetId)) throw new Error(`Duplicate project margin target ${laborTargetId} in the current BOM.`);
    seenTargetIds.add(laborTargetId);
    drafts.push(draftItem({
      state,
      target: laborTarget,
      label: "Práca modulu",
      scopeLabel: entry.label,
      resourceLabel: "Práca",
      quantity: 1,
      unit: "custom",
      baseCost: bomBaseCost(
        entry.result.pricing.laborCostFixed,
        entry.result.pricing.priceInputs.currency,
        currency
      ) ?? 0,
      missingPrice: false
    }));
  }

  const projectLaborTarget = { scopeId: "project", itemId: "additional-labor", category: "labor" } satisfies ProjectMarginTarget;
  const projectLaborTargetId = projectMarginTargetId(projectLaborTarget);
  if (seenTargetIds.has(projectLaborTargetId)) throw new Error(`Duplicate project margin target ${projectLaborTargetId} in the current BOM.`);
  seenTargetIds.add(projectLaborTargetId);
  drafts.push(draftItem({
    state,
    target: projectLaborTarget,
    label: "Dodatočná práca projektu",
    scopeLabel: "Projekt",
    resourceLabel: "Práca",
    quantity: 1,
    unit: "custom",
    baseCost: state.additionalLaborCost,
    missingPrice: false
  }));

  allocateMarginCents(drafts);
  const activeTargetIds = new Set(drafts.map((item) => item.targetId));
  for (const override of state.itemOverrides) {
    if (!activeTargetIds.has(override.targetId)) {
      warnings.push({
        code: "orphaned_override",
        targetId: override.targetId,
        message: `Individuálna marža ${override.targetId} už nemá zodpovedajúcu položku v aktuálnom BOM.`
      });
    }
  }

  const items: ProjectMarginItemView[] = drafts.map(({ costCents, percentHundredths: _percent, marginCents, ...item }) => ({
    ...item,
    marginAmount: marginCents / 100,
    finalPrice: (costCents + marginCents) / 100
  }));
  const groups = ORDERED_CATEGORIES.map((category) => {
    const groupItems = items.filter((item) => item.category === category);
    const baseCents = groupItems.reduce((total, item) => total + moneyCents(item.baseCost), 0);
    const marginCents = groupItems.reduce((total, item) => total + moneyCents(item.marginAmount), 0);
    const metadata = groupMetadata(category);
    return {
      category,
      ...metadata,
      baseCost: baseCents / 100,
      marginPercent: state.groupMargins[category] ?? state.defaultMarginPercent,
      combinedMarginPercent: combinedPercent(baseCents, marginCents),
      marginAmount: marginCents / 100,
      finalPrice: (baseCents + marginCents) / 100,
      overrideCount: groupItems.filter((item) => item.source === "override").length,
      missingPriceCount: groupItems.filter((item) => item.missingPrice).length,
      items: groupItems
    } satisfies ProjectMarginGroupView;
  });
  const baseCents = groups.reduce((total, group) => total + moneyCents(group.baseCost), 0);
  const marginCents = groups.reduce((total, group) => total + moneyCents(group.marginAmount), 0);
  const groupOverrideCount = Object.keys(state.groupMargins).length;

  return {
    revision: state.revision,
    editable: options.editable ?? true,
    currency,
    priceAuthority: "Nákupné ceny vychádzajú z materiálov a komponentov aktuálne priradených v projekte. Skupinové priradenie sa dedí do jednotlivých častí, kým ho neprepíše vlastné priradenie.",
    settings: structuredClone(state),
    summary: {
      baseCost: baseCents / 100,
      marginAmount: marginCents / 100,
      combinedMarginPercent: combinedPercent(baseCents, marginCents),
      finalPrice: (baseCents + marginCents) / 100,
      overrideCount: groupOverrideCount + state.itemOverrides.length,
      missingPriceCount: groups.reduce((total, group) => total + group.missingPriceCount, 0)
    },
    groups,
    warnings
  };
}

function normalizedPercent(value: number): number {
  return round(value, 2);
}

export function applyProjectMarginSettingsOperation(
  currentValue: ProjectMarginSettingsState | unknown,
  operation: ProjectMarginSettingsOperation,
  validTargetIds: ReadonlySet<string>,
  updatedAt = new Date().toISOString()
): ProjectMarginSettingsState {
  const current = normalizeProjectMarginSettingsState(currentValue);
  validateProjectMarginSettingsState(current);
  const next: ProjectMarginSettingsState = {
    ...structuredClone(current),
    initialized: true,
    revision: current.revision + 1,
    updatedAt
  };

  if (operation.type === "set_default") {
    next.defaultMarginPercent = normalizedPercent(operation.marginPercent);
  } else if (operation.type === "set_group") {
    if (!isProjectMarginCategory(operation.category)) throw new Error("Unsupported project margin category.");
    next.groupMargins[operation.category] = normalizedPercent(operation.marginPercent);
    next.itemOverrides = next.itemOverrides.filter((override) => override.category !== operation.category);
  } else if (operation.type === "reset_group") {
    if (!isProjectMarginCategory(operation.category)) throw new Error("Unsupported project margin category.");
    delete next.groupMargins[operation.category];
    next.itemOverrides = next.itemOverrides.filter((override) => override.category !== operation.category);
  } else if (operation.type === "set_additional_labor") {
    next.additionalLaborCost = round(operation.additionalLaborCost, 2);
  } else {
    if (!isProjectMarginCategory(operation.target.category)) throw new Error("Unsupported project margin category.");
    const targetId = projectMarginTargetId(operation.target);
    if (operation.type === "set_item" && !validTargetIds.has(targetId)) {
      throw new Error("Project margin target no longer exists in the current BOM.");
    }
    next.itemOverrides = next.itemOverrides.filter((override) => override.targetId !== targetId);
    if (operation.type === "set_item") {
      next.itemOverrides.push({
        targetId,
        scopeId: operation.target.scopeId,
        itemId: operation.target.itemId,
        category: operation.target.category,
        marginPercent: normalizedPercent(operation.marginPercent)
      });
    }
  }

  validateProjectMarginSettingsState(next);
  return next;
}

export function projectMarginTargetIds(view: ProjectMarginsView): ReadonlySet<string> {
  return new Set(view.groups.flatMap((group) => group.items.map((item) => item.targetId)));
}
