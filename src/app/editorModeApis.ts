export type EditorTopbarApi = {
  clear: () => void;
  addRow: (args?: { title?: string; className?: string }) => HTMLElement;
  addGroup: (title?: string, args?: { row?: HTMLElement }) => HTMLElement;
  addSpacer: (args?: { row?: HTMLElement }) => void;
  toolButton: (
    toolsEl: HTMLElement,
    args: { title: string; iconSvg: string; label?: string; variant?: "success" | "danger"; onClick?: () => void }
  ) => HTMLButtonElement;
};

export type EditorPropsApi = {
  setTitle: (title: string) => void;
  section: () => HTMLElement;
  row: (sectionEl: HTMLElement, label: string, inputEl: HTMLElement) => HTMLElement;
};
