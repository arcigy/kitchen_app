import { t } from "../i18n";

export type UiScale = "standard" | "large";

const STORAGE_KEY = "arcigy.ui-scale.v1";
let sharedController: ReturnType<typeof createUiScaleController> | null = null;

function readStoredScale(storage: Storage | undefined): UiScale {
  try {
    return storage?.getItem(STORAGE_KEY) === "large" ? "large" : "standard";
  } catch {
    return "standard";
  }
}

/** Keeps accessibility scale local to the device and outside project/model data. */
export function createUiScaleController(args: {
  root?: HTMLElement;
  storage?: Storage;
} = {}) {
  const root = args.root ?? document.documentElement;
  const storage = args.storage ?? (typeof window !== "undefined" ? window.localStorage : undefined);
  let scale = readStoredScale(storage);

  const apply = () => {
    root.dataset.uiScale = scale;
    root.style.setProperty("--arcigy-ui-scale", scale === "large" ? "1.2" : "1");
  };
  const setScale = (next: UiScale) => {
    scale = next;
    apply();
    try { storage?.setItem(STORAGE_KEY, scale); } catch { /* private storage may be unavailable */ }
  };
  apply();

  const createControl = () => {
    const section = document.createElement("section");
    section.className = "workspace-settings-ui-scale";
    const heading = document.createElement("strong");
    heading.textContent = t("Interface size");
    const description = document.createElement("p");
    description.textContent = t("Enlarges controls, forms and tables. Model dimensions and drawing scale are unchanged.");
    section.append(heading, description);
    const choices = document.createElement("div");
    for (const option of [{ value: "standard", label: t("Standard") }, { value: "large", label: t("Large") }] as const) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = option.label;
      button.setAttribute("aria-pressed", String(scale === option.value));
      button.addEventListener("click", () => {
        setScale(option.value);
        for (const candidate of choices.querySelectorAll<HTMLButtonElement>("button")) {
          candidate.setAttribute("aria-pressed", String(candidate === button));
        }
      });
      choices.appendChild(button);
    }
    section.appendChild(choices);
    return section;
  };

  return { getScale: () => scale, setScale, createControl };
}

export function getUiScaleController(): ReturnType<typeof createUiScaleController> {
  sharedController ??= createUiScaleController();
  return sharedController;
}
