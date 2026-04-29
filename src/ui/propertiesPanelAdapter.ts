import { bindLabelToControl } from "./formFieldA11y";

export function createPropertiesPanelAdapter(propertiesEl: HTMLElement) {
  return {
    setTitle(title: string) {
      propertiesEl.innerHTML = "";
      const titleEl = document.createElement("div");
      titleEl.className = "props-title";
      titleEl.textContent = title;
      propertiesEl.appendChild(titleEl);
    },
    section() {
      const sectionEl = document.createElement("div");
      sectionEl.className = "props-section";
      propertiesEl.appendChild(sectionEl);
      return sectionEl;
    },
    row(sectionEl: HTMLElement, label: string, inputEl: HTMLElement) {
      const rowEl = document.createElement("div");
      rowEl.className = "props-row";
      const labelEl = document.createElement("label");
      labelEl.textContent = label;
      bindLabelToControl(labelEl, inputEl, label);
      rowEl.appendChild(labelEl);
      rowEl.appendChild(inputEl);
      sectionEl.appendChild(rowEl);
      return rowEl;
    }
  };
}
