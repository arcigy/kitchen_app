import { isComponentAllowedForCategory } from "../core/project-materials/project-material-business";
import type { ClientCatalog } from "../core/catalog/catalog-types";
import { projectComponentUnit, validateProjectComponentValues, type ProjectComponentValues } from "../core/project-materials/project-component-values";
import type { ProjectComponentOperation, ProjectComponentTarget } from "../core/project-materials/project-component-operations";
import type { ProjectMaterialAssignment, ProjectMaterialScopeItem } from "../core/project-materials/project-material-types";
import { convertPriceCurrency, isPriceCurrency, type PriceCurrency } from "../core/pricing/currency";

export type ProjectComponentEdit = { assignmentId?: string; target?: ProjectComponentTarget };
export function openProjectComponentDialog(args: {
  catalog: ClientCatalog; currency: PriceCurrency; assignment?: ProjectMaterialAssignment | null;
  target?: ProjectComponentTarget; item?: ProjectMaterialScopeItem; addScopeId?: string;
  commit: (operation: ProjectComponentOperation) => Promise<void>;
}): Promise<void> {
  return new Promise(resolve => {
    const dialog = document.createElement("dialog"); dialog.className = "project-component-dialog";
    dialog.style.cssText = "width:min(480px,calc(100vw - 32px));padding:24px;border:1px solid #d1d5db;border-radius:12px";
    const form = document.createElement("form"); form.style.cssText = "display:grid;gap:12px";
    const title = document.createElement("h2"); title.textContent = args.addScopeId ? "Pridať komponent" : args.item?.label ?? args.assignment?.snapshots.component?.definition.displayName ?? "Projektové hodnoty";
    form.append(title);
    const helper = document.createElement("p"); helper.textContent = args.addScopeId === "project" ? "Samostatná položka sa započíta do projektu raz."
      : args.target?.scopeId.startsWith("module:") || args.addScopeId?.startsWith("module:") ? "Množstvo zadávate na jednu skrinku. Výpočet ho násobí počtom kusov skrinky." : "Prázdne pole použije uloženú cenu produktu. Katalóg zostane zachovaný.";
    form.append(helper);
    const row = (label: string, input: HTMLElement) => {
      const node = document.createElement("label"); node.style.cssText = "display:grid;gap:4px"; node.textContent = label;
      input.setAttribute("aria-label", label); node.append(input); form.append(node); return node;
    };
    const label = document.createElement("input"); label.required = !!args.addScopeId; label.value = args.assignment?.extraComponent?.label ?? "";
    const catalogSelect = document.createElement("select"); catalogSelect.add(new Option(args.addScopeId ? "Vlastná položka" : "Ponechať uložený komponent", ""));
    for (const component of args.catalog.components.filter(item => item.isActive && (args.addScopeId || args.assignment?.extraComponent || isComponentAllowedForCategory(item, args.item?.category ?? args.assignment?.category ?? "other_component")))) catalogSelect.add(new Option(component.displayName, component.id));
    row("Komponent z katalógu", catalogSelect);
    if (args.addScopeId) row("Názov položky", label);
    const unit = document.createElement("select");
    for (const [value, text] of [["pcs", "kus"], ["set", "sada"], ["lm", "bežný meter"], ["profile", "celý profil"]]) unit.add(new Option(text!, value));
    unit.value = args.assignment ? projectComponentUnit(args.assignment) : "pcs";
    row("Jednotka", unit);
    const quantity = document.createElement("input"); quantity.type = "number"; quantity.min = "0"; quantity.step = "any";
    quantity.value = args.assignment?.projectValues?.quantity == null ? args.addScopeId ? "1" : "" : String(args.assignment.projectValues.quantity);
    quantity.placeholder = String((args.item?.quantity ?? 0) / (args.item?.moduleQuantity ?? 1));
    const derived = !args.assignment?.extraComponent && ["leg", "plinth_clip"].includes(args.item?.category ?? args.assignment?.category ?? "");
    const editableQuantity = !!args.addScopeId || !!args.assignment?.extraComponent || (!!args.target && !derived);
    if (editableQuantity) row("Vlastné množstvo", quantity);
    if (derived) {
      const note = document.createElement("p"); note.textContent = "Počet nôh a klipov upravte vo vlastnostiach modulu v časti Nohy a závesné kovanie. Náhradné kusy pridajte ako samostatný komponent."; form.append(note);
    }
    const price = document.createElement("input"); price.type = "number"; price.min = "0"; price.step = "any";
    const old = args.assignment?.projectValues;
    price.value = old?.unitPrice == null ? "" : String(convertPriceCurrency(old.unitPrice, old.currency ?? args.currency, args.currency));
    const snapshot = args.assignment?.snapshots.component;
    price.placeholder = snapshot?.unitPrice != null && isPriceCurrency(snapshot.currency) ? String(convertPriceCurrency(snapshot.unitPrice, snapshot.currency, args.currency)) : "Cena nezadaná";
    row(`Vlastná jednotková nákupná cena (${args.currency})`, price);
    const included = document.createElement("input"); included.type = "checkbox"; included.checked = old?.includedInPackage === true;
    row("Zahrnuté v balení – neúčtovať druhýkrát", included);
    const appliance = document.createElement("input"); appliance.type = "checkbox"; appliance.checked = old?.excludeFromConstructionLabor === true;
    row("Spotrebič – nezahrnúť do základu konštrukčnej práce", appliance);
    const error = document.createElement("p"); error.setAttribute("role", "alert"); form.append(error);
    const actions = document.createElement("div"); actions.style.cssText = "display:flex;gap:8px;flex-wrap:wrap";
    const button = (text: string, type: "button" | "submit" = "button") => { const node = document.createElement("button"); node.type = type; node.textContent = text; actions.append(node); return node; };
    const save = button("Uložiť", "submit"), reset = args.addScopeId ? null : button("Obnoviť automatiku"), cancel = button("Zrušiť");
    form.append(actions); dialog.append(form); document.body.append(dialog);
    const close = () => { dialog.close(); dialog.remove(); resolve(); };
    cancel.addEventListener("click", close); dialog.addEventListener("cancel", () => { dialog.remove(); resolve(); });
    const commit = async (operation: ProjectComponentOperation) => {
      save.disabled = true; if (reset) reset.disabled = true;
      try { await args.commit(operation); close(); }
      catch (failure) { error.textContent = failure instanceof Error ? failure.message : "Uloženie zlyhalo."; }
      finally { save.disabled = false; if (reset) reset.disabled = false; }
    };
    reset?.addEventListener("click", () => void commit({ type: "set_component_values", assignmentId: args.assignment?.assignmentId, target: args.target, values: null }));
    catalogSelect.addEventListener("change", () => {
      const component = args.catalog.components.find(item => item.id === catalogSelect.value);
      if (component) { label.value = component.displayName; unit.value = component.pricingUnit; price.placeholder = String(args.catalog.priceList.prices[component.id] ?? "Cena nezadaná"); }
    });
    form.addEventListener("submit", event => {
      event.preventDefault();
      try {
        const values: ProjectComponentValues = { unit: unit.value as ProjectComponentValues["unit"] };
        if (editableQuantity && quantity.value.trim()) values.quantity = Number(quantity.value);
        if (price.value.trim()) { values.unitPrice = Number(price.value); values.currency = args.currency; }
        if (included.checked) values.includedInPackage = true;
        if (appliance.checked) values.excludeFromConstructionLabor = true;
        validateProjectComponentValues(values);
        void commit(args.addScopeId ? { type: "add_component", id: crypto.randomUUID(), scopeId: args.addScopeId,
          label: label.value, componentId: catalogSelect.value || undefined, values }
          : { type: "set_component_values", assignmentId: args.assignment?.assignmentId, target: args.target, componentId: catalogSelect.value || undefined, values });
      } catch (failure) { error.textContent = failure instanceof Error ? failure.message : "Neplatná hodnota."; }
    });
    dialog.showModal();
  });
}
