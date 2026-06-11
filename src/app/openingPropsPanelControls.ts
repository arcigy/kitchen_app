import type { OpeningHandleType } from "./localTypes";
import type { PropertiesPanelApi } from "./toolPropsPanels";
import { createHtmlButtonElement, createInputElement, createSelectElement } from "./propsPanelElements";

type OpeningSwingDirection = "left" | "right";
type OpeningSwingSide = "inward" | "outward";

type OpeningSwingEditableParams = {
  swingDirection: OpeningSwingDirection;
  swingSide: OpeningSwingSide;
};

type OpeningHandleEditableParams = {
  handleType: OpeningHandleType;
  handleOffsetMm: number;
  handleHeightMm: number;
};

type OpeningMaterialEditableParams = {
  materialId: string;
};

type OpeningMaterialOption = {
  id: string;
  name: string;
};

type OpeningNumberRow<T extends object, K extends keyof T> = {
  label: string;
  key: K;
  min?: number;
};

export type OpeningSwingLabels = {
  controlsRow: string;
  directionRow: string;
  sideRow: string;
  handednessButton: string;
  sideButton: string;
  handednessToLeft: string;
  handednessToRight: string;
  sideToInward: string;
  sideToOutward: string;
  includeButtonAriaLabel?: boolean;
};

const HANDLE_TYPE_OPTIONS: Array<{ value: OpeningHandleType; label: string }> = [
  { value: "lever", label: "Paka" },
  { value: "knob", label: "Gula" },
  { value: "bar", label: "Madlo" },
  { value: "none", label: "Bez klucky" }
];

export function appendOpeningNumberRows<T extends object, K extends keyof T>(
  props: PropertiesPanelApi,
  section: HTMLElement,
  params: T,
  rows: Array<OpeningNumberRow<T, K>>,
  apply: (commit: boolean, patch: Partial<T>) => void
) {
  for (const row of rows) {
    const input = createInputElement("number", String(Math.round(Number(params[row.key] ?? 0))), { step: "1" });
    props.row(section, row.label, input);

    const read = () => {
      const next = Number(input.value);
      if (!Number.isFinite(next)) return false;
      const rounded = Math.round(next);
      params[row.key] = (row.min == null ? rounded : Math.max(row.min, rounded)) as T[K];
      return true;
    };

    const applyValue = (commit: boolean) => {
      if (!read()) return;
      apply(commit, { [row.key]: params[row.key] } as unknown as Partial<T>);
    };

    input.addEventListener("input", () => applyValue(false));
    input.addEventListener("change", () => applyValue(true));
    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") applyValue(true);
    });
  }
}

export function appendOpeningSwingRows<T extends OpeningSwingEditableParams>(
  props: PropertiesPanelApi,
  section: HTMLElement,
  params: T,
  apply: (commit: boolean, patch: Partial<T>) => void,
  labels: OpeningSwingLabels
) {
  const swingControls = document.createElement("div");
  swingControls.className = "door-swing-controls";
  const makeSwingButton = (html: string, label: string) =>
    createHtmlButtonElement(html, {
      ariaLabel: labels.includeButtonAriaLabel ? label : undefined,
      className: "door-swing-button",
      title: label
    });
  const handednessButton = makeSwingButton("&#8596;", labels.handednessButton);
  const sideButton = makeSwingButton("&#8597;", labels.sideButton);
  swingControls.append(handednessButton, sideButton);
  props.row(section, labels.controlsRow, swingControls);

  const swing = createSelectElement(params.swingDirection, [
    { value: "left", label: "Lave" },
    { value: "right", label: "Prave" }
  ]);

  const swingSide = createSelectElement(params.swingSide, [
    { value: "inward", label: "Dovnutra" },
    { value: "outward", label: "Von" }
  ]);

  const syncSwingControls = () => {
    swing.value = params.swingDirection;
    swingSide.value = params.swingSide;
    handednessButton.title = params.swingDirection === "right" ? labels.handednessToLeft : labels.handednessToRight;
    sideButton.title = params.swingSide === "outward" ? labels.sideToInward : labels.sideToOutward;
  };

  handednessButton.addEventListener("click", () => {
    params.swingDirection = params.swingDirection === "right" ? "left" : "right";
    syncSwingControls();
    apply(true, { swingDirection: params.swingDirection } as Partial<T>);
  });
  sideButton.addEventListener("click", () => {
    params.swingSide = params.swingSide === "outward" ? "inward" : "outward";
    syncSwingControls();
    apply(true, { swingSide: params.swingSide } as Partial<T>);
  });
  swing.addEventListener("change", () => {
    params.swingDirection = swing.value === "right" ? "right" : "left";
    syncSwingControls();
    apply(true, { swingDirection: params.swingDirection } as Partial<T>);
  });
  props.row(section, labels.directionRow, swing);
  swingSide.addEventListener("change", () => {
    params.swingSide = swingSide.value === "outward" ? "outward" : "inward";
    syncSwingControls();
    apply(true, { swingSide: params.swingSide } as Partial<T>);
  });
  props.row(section, labels.sideRow, swingSide);
  syncSwingControls();
}

export function appendOpeningHandleRows<T extends OpeningHandleEditableParams>(
  props: PropertiesPanelApi,
  section: HTMLElement,
  params: T,
  apply: (commit: boolean, patch: Partial<T>) => void
) {
  const typeSelect = createSelectElement(params.handleType, HANDLE_TYPE_OPTIONS);
  typeSelect.addEventListener("change", () => {
    const next = HANDLE_TYPE_OPTIONS.find((option) => option.value === typeSelect.value)?.value ?? "lever";
    params.handleType = next;
    apply(true, { handleType: next } as Partial<T>);
  });
  props.row(section, "Typ klucky", typeSelect);

  appendOpeningNumberRows(
    props,
    section,
    params,
    [
      { label: "Vyska klucky (mm)", key: "handleHeightMm", min: 0 },
      { label: "Odsadenie klucky (mm)", key: "handleOffsetMm", min: 0 }
    ],
    apply
  );
}

export function appendOpeningMaterialRow<T extends OpeningMaterialEditableParams>(
  props: PropertiesPanelApi,
  section: HTMLElement,
  params: T,
  options: OpeningMaterialOption[],
  apply: (commit: boolean, patch: Partial<T>) => void,
  config: { label?: string; normalize?: (value: string) => string } = {}
) {
  params.materialId = config.normalize ? config.normalize(params.materialId) : params.materialId;
  const material = createSelectElement(
    params.materialId,
    options.map((option) => ({ value: option.id, label: option.name }))
  );
  material.addEventListener("change", () => {
    params.materialId = config.normalize ? config.normalize(material.value) : material.value;
    material.value = params.materialId;
    apply(true, { materialId: material.value } as Partial<T>);
  });
  props.row(section, config.label ?? "Material", material);
}
