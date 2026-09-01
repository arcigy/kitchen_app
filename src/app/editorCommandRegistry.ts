export type EditorCommandGroup =
  | "file"
  | "architecture"
  | "kitchen"
  | "living-wall"
  | "room"
  | "modify"
  | "visualisation"
  | "view";

export type EditorCommandId =
  | "select"
  | "undo"
  | "redo"
  | "move"
  | "rotate"
  | "align"
  | "trim"
  | "dimension"
  | "duplicate"
  | "unpin-worktop"
  | "hide"
  | "isolate"
  | "unhide-all"
  | "delete"
  | "wall"
  | "door"
  | "window"
  | "column"
  | "floor"
  | "stair"
  | "kitchen-catalog"
  | "led-strip"
  | "led-under-upper"
  | "led-plinth-joint"
  | "led-shelf-joint"
  | "fit-gap"
  | "living-wall-catalog"
  | "room-catalog"
  | "wardrobe"
  | "custom-furniture"
  | "section"
  | "measure"
  | "underlay"
  | "toggle-2d"
  | "reset-view"
  | "export-json"
  | "export-scene"
  | "copy-export"
  | "pricing"
  | "bom"
  | "install"
  | "reset-defaults"
  | "materials"
  | "camera";

export type EditorCommandState = {
  active: boolean;
  available: boolean;
  disabledReason?: string;
};

export type EditorCommandDescriptor = {
  id: EditorCommandId;
  group: EditorCommandGroup;
  label: string;
  keywords?: readonly string[];
  iconSvg?: string;
  execute: () => void | Promise<void>;
  getState?: () => Partial<EditorCommandState>;
};

export type EditorCommandRegistry = ReturnType<typeof createEditorCommandRegistry>;

const DEFAULT_STATE: EditorCommandState = { active: false, available: true };

export function createEditorCommandRegistry(descriptors: readonly EditorCommandDescriptor[]) {
  const commands = new Map<EditorCommandId, EditorCommandDescriptor>();
  const listeners = new Set<() => void>();

  for (const descriptor of descriptors) {
    if (commands.has(descriptor.id)) throw new Error(`Duplicate editor command: ${descriptor.id}`);
    commands.set(descriptor.id, descriptor);
  }

  const get = (id: EditorCommandId) => commands.get(id) ?? null;
  const getState = (id: EditorCommandId): EditorCommandState => ({
    ...DEFAULT_STATE,
    ...(commands.get(id)?.getState?.() ?? {})
  });

  const list = (group?: EditorCommandGroup) => [...commands.values()]
    .filter((command) => !group || command.group === group);

  const search = (query: string) => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return list();
    return list().filter((command) =>
      [command.label, command.group, command.id, ...(command.keywords ?? [])]
        .some((value) => value.toLocaleLowerCase().includes(normalized))
    );
  };

  const execute = async (id: EditorCommandId) => {
    const command = commands.get(id);
    if (!command) return false;
    if (!getState(id).available) return false;
    await command.execute();
    notify();
    return true;
  };

  const notify = () => listeners.forEach((listener) => listener());
  const subscribe = (listener: () => void) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  return { execute, get, getState, list, notify, search, subscribe };
}
