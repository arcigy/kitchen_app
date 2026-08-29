import type { ModuleParams } from "../model/cabinetTypes";
import type {
  FurnQuoteModulePackage,
  ModuleInternalEditBoardRule,
  ModuleInternalEditingDefinition,
  ModuleInternalEditSubmoduleRule,
  ModuleInternalEditSubmoduleTool
} from "../core/module-package/module-package-types";

const AVAILABLE_TALL_TOOLS: ModuleInternalEditSubmoduleTool[] = ["drawer", "shelf", "oven", "sink", "microwave", "door"];

const BOARD_LEVEL_PLANNED: ModuleInternalEditBoardRule[] = [
  {
    operation: "delete_board",
    status: "planned",
    allowedMaterialGroups: ["carcass", "front", "back", "shelf", "plinth"],
    note: "Board deletion needs a tested board adapter so BOM, dimensions, material groups and undo/redo stay correct."
  },
  {
    operation: "resize_board",
    status: "planned",
    allowedMaterialGroups: ["carcass", "front", "back", "shelf", "plinth"],
    note: "Board resize must rebuild the module from domain parameters or an override layer, not by scaling a mesh only."
  },
  {
    operation: "trim_board",
    status: "planned",
    allowedMaterialGroups: ["carcass", "front", "back", "shelf", "plinth"],
    note: "Trim must use real board edge references and update selected-object bounds, BOM and manufacturing metadata."
  },
  {
    operation: "extend_board",
    status: "planned",
    allowedMaterialGroups: ["carcass", "front", "back", "shelf", "plinth"],
    note: "Extend must use the same board adapter as trim and must be undoable through the global editor history."
  }
];

function submoduleRule(
  tool: ModuleInternalEditSubmoduleTool,
  label: string,
  status: "available" | "planned",
  insertionMode: ModuleInternalEditSubmoduleRule["insertionMode"],
  note: string,
  allowedWhen: string[] = []
): ModuleInternalEditSubmoduleRule {
  return { tool, label, status, insertionMode, allowedWhen, note };
}

export function createModuleInternalEditingDefinition(args: {
  moduleType: string;
  geometryKind: string;
  kitchenRole?: string;
  tags?: readonly string[];
  hasWorktop?: boolean;
}): ModuleInternalEditingDefinition {
  const tags = new Set((args.tags ?? []).map((tag) => tag.toLowerCase()));
  const isKitchen = tags.has("kitchen");
  const isTallHost = args.moduleType === "fwm_catalog_tall_cabinet";
  if (isTallHost) {
    return {
      enabled: true,
      hostKind: "composed_tall",
      defaultEditor: "slot_stack",
      submoduleTools: AVAILABLE_TALL_TOOLS.map((tool) => submoduleRule(
        tool,
        tool === "drawer" ? "Suflik" : tool === "shelf" ? "Policka" : tool === "oven" ? "Rura" : tool === "sink" ? "Drez" : tool === "microwave" ? "Mikrovlnka" : "Dvierka",
        "available",
        "vertical_slot",
        "Available in the custom tall slot editor. Inserted submodules remain selectable as one submodule and keep independent slot height/offset parameters."
      )),
      boardOperations: BOARD_LEVEL_PLANNED,
      note: "Generic composed tall host. Users can open the module editor and insert/move/copy/align/delete supported slot submodules."
    };
  }

  if (!isKitchen) {
    return {
      enabled: false,
      hostKind: "none",
      submoduleTools: [],
      boardOperations: [],
      note: "No internal module editor is exposed for this non-kitchen package yet."
    };
  }

  const submoduleTools: ModuleInternalEditSubmoduleRule[] = [];
  if (args.geometryKind === "sink" || tags.has("sink")) {
    submoduleTools.push(submoduleRule(
      "sink",
      "Drez",
      "planned",
      "worktop_cutout",
      "Allowed only for sink-capable base/worktop hosts. The next implementation slice must create a tested cutout/placement adapter instead of toggling a visual mesh only.",
      ["geometryKind=sink", "host has or accepts worktop cutout"]
    ));
  }
  if (args.geometryKind === "appliance" || tags.has("appliance")) {
    submoduleTools.push(
      submoduleRule("dishwasher", "Umyvacka riadu", "planned", "cabinet_opening", "Allowed in compatible base appliance openings with service rules."),
      submoduleRule("cooktop", "Varna doska", "planned", "worktop_cutout", "Allowed only on/through a worktop surface."),
      submoduleRule("oven", "Rura", "planned", "cabinet_opening", "Allowed in compatible appliance openings."),
      submoduleRule("microwave", "Mikrovlnka", "planned", "cabinet_opening", "Allowed in compatible appliance openings.")
    );
  }

  const canEditBoards = ["base", "sink", "appliance", "corner", "tall"].includes(args.geometryKind);
  return {
    enabled: submoduleTools.length > 0 || canEditBoards,
    hostKind: args.hasWorktop ? "base_cabinet" : "fixed_parametric",
    defaultEditor: submoduleTools.length > 0 ? "surface_insert" : "board_level",
    submoduleTools,
    boardOperations: canEditBoards ? BOARD_LEVEL_PLANNED : [],
    note: submoduleTools.length > 0
      ? "Module declares which inserted submodules are valid, but only available tools may be exposed as active UI actions."
      : "Module can later receive board-level editing through a tested adapter; no submodule insert is currently valid."
  };
}

export function getModuleInternalEditingDefinition(modulePackage: FurnQuoteModulePackage | null | undefined): ModuleInternalEditingDefinition {
  return modulePackage?.internalEditing ?? {
    enabled: false,
    hostKind: "none",
    submoduleTools: [],
    boardOperations: [],
    note: "No internal editing definition is available for this module package."
  };
}

export function hasAvailableInternalSubmoduleTool(
  modulePackage: FurnQuoteModulePackage | null | undefined,
  tool: ModuleInternalEditSubmoduleTool
) {
  return getModuleInternalEditingDefinition(modulePackage).submoduleTools.some((item) => item.tool === tool && item.status === "available");
}

export function isModuleInternalEditingEnabled(modulePackage: FurnQuoteModulePackage | null | undefined) {
  const definition = getModuleInternalEditingDefinition(modulePackage);
  return definition.enabled && (
    definition.submoduleTools.some((tool) => tool.status === "available") ||
    definition.boardOperations.some((operation) => operation.status === "available")
  );
}

export function isTallStackInternalEditParams(params: ModuleParams | null | undefined) {
  return params?.type === "fwm_catalog_tall_cabinet";
}
