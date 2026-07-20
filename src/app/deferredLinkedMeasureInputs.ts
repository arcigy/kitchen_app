import type { MeasureSelectionTarget } from "./measureEditing";

export type AppendLinkedMeasureInputs = (
  section: HTMLElement,
  target: MeasureSelectionTarget | null
) => void;

export function createDeferredLinkedMeasureInputs() {
  let implementation: AppendLinkedMeasureInputs | null = null;

  return {
    append(section: HTMLElement, target: MeasureSelectionTarget | null) {
      implementation?.(section, target);
    },
    connect(next: AppendLinkedMeasureInputs) {
      implementation = next;
    }
  };
}
