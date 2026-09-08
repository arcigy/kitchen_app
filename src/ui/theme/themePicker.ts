import { t } from "../../i18n";
import { getThemeController, type ThemePreference } from "./themeController";

// Native radio controls retain standard keyboard behavior. The custom element's
// lifecycle removes the subscription when login or project screens are replaced.
export function createThemePicker(): HTMLElement {
  if (!customElements.get("arcigy-theme-picker")) {
    customElements.define("arcigy-theme-picker", class extends HTMLElement {
      private unsubscribe?: () => void;
      connectedCallback() {
        this.replaceChildren();
        const controller = getThemeController();
        const fieldset = document.createElement("fieldset");
        fieldset.className = "theme-picker";
        const legend = document.createElement("legend");
        legend.textContent = t("Appearance");
        fieldset.append(legend);
        const choices: [ThemePreference, string][] = [["system", "System theme"], ["light", "Light theme"], ["dark", "Dark theme"]];
        const name = "theme-" + crypto.randomUUID();
        const inputs = choices.map(([value, text]) => {
          const label = document.createElement("label");
          const input = document.createElement("input");
          input.type = "radio";
          input.name = name;
          input.value = value;
          input.addEventListener("change", () => { if (input.checked) controller.setPreference(value); });
          const caption = document.createElement("span");
          caption.textContent = t(text);
          label.append(input, caption);
          fieldset.append(label);
          return input;
        });
        const sync = () => {
          for (const input of inputs) input.checked = input.value === controller.getPreference();
        };
        sync();
        this.unsubscribe = controller.subscribe(sync);
        this.append(fieldset);
      }
      disconnectedCallback() { this.unsubscribe?.(); }
    });
  }
  return document.createElement("arcigy-theme-picker");
}
