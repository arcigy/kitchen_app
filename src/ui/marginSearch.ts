import type { ProjectMarginItemView } from "../layout/bom/projectMargins";

export type MarginSearchFilter = "all" | "missing" | "override";

export function matchesMarginSearch(item: ProjectMarginItemView, query: string, filter: MarginSearchFilter, categoryLabel = "", scopeNumber = ""): boolean {
  if (filter === "missing" && !item.missingPrice) return false;
  if (filter === "override" && item.source !== "override") return false;
  return matchesMarginText(query, item.label, item.scopeLabel, item.resourceLabel, categoryLabel, scopeNumber);
}

export function matchesMarginText(query: string, ...values: string[]): boolean {
  const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("sk");
  const text = normalize(values.join(" "));
  return normalize(query).split(/\s+/).filter(Boolean).every(word => text.includes(word));
}
