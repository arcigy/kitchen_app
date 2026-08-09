export const actionIconDetails = {
  select: { title: "Select", description: "Choose an object or return to the selection tool." },
  wall: { title: "Wall", description: "Start drawing a wall in the active plan." },
  door: { title: "Door", description: "Place or select a door opening." },
  window: { title: "Window", description: "Place or select a window opening." },
  column: { title: "Column", description: "Add a structural column to the plan." },
  stair: { title: "Stair", description: "Open the stair placement workflow when it is available." },
  floor: { title: "Floor", description: "Create or edit a floor boundary." },
  cabinet: { title: "Custom furniture", description: "Enter the custom furniture editor." },
  livingWall: { title: "Living wall", description: "Add a living-wall module or open its catalog." },
  wardrobe: { title: "Wardrobe", description: "Add a wardrobe or open the room-module catalog." },
  align: { title: "Align", description: "Align the selected objects using their available references." },
  fitGap: { title: "Fit selected module into gap", description: "Resize the selected kitchen module to the available gap." },
  trim: { title: "Trim", description: "Trim the active editable geometry." },
  section: { title: "Section", description: "Create or edit a section view." },
  dimension: { title: "Dimension", description: "Create a persistent dimension." },
  measure: { title: "Measure", description: "Measure a distance in the active view." },
  underlay: { title: "Underlay", description: "Show or configure the drawing underlay." },
  unpinWorktop: { title: "Unpin from worktop", description: "Detach selected modules from their worktop relation." },
  grid2d: { title: "2D view", description: "Switch the workspace to the floor-plan view." },
  undo: { title: "Undo", description: "Restore the most recent project change.", shortcut: "Ctrl+Z" },
  redo: { title: "Redo", description: "Reapply the most recently undone project change.", shortcut: "Ctrl+Y" },
  move: { title: "Move", description: "Move the selected objects with the active placement constraints." },
  rotate: { title: "Rotate", description: "Rotate the selected object around its active pivot." },
  duplicate: { title: "Duplicate", description: "Create a copy of the current selection." },
  hide: { title: "Hide", description: "Hide the selected object from the current view." },
  unhide: { title: "Unhide", description: "Show the selected hidden object again." },
  unhideAll: { title: "Unhide all", description: "Show every object hidden in the current view." },
  isolate: { title: "Isolate", description: "Temporarily show only the selected objects." },
  delete: { title: "Delete", description: "Remove the selected object through the normal undoable command." },
  resetDefaults: { title: "Reset defaults", description: "Restore the application's default settings." },
  resetView: { title: "Reset view", description: "Return the camera to its default view." },
  exportJson: { title: "Export JSON", description: "Export the current project data as JSON." },
  blenderReview: { title: "Blender material review", description: "Export the scene for the Blender material-review workflow." },
  copyExport: { title: "Copy export", description: "Copy the generated export data to the clipboard." },
  pricingCatalog: { title: "Pricing catalog", description: "Open the catalog used for pricing review." },
  bom: { title: "BOM", description: "Open the bill of materials for the current project." },
  install: { title: "Install app", description: "Install Arcigy as an application when the browser supports it." },
  materialEdit: { title: "Material", description: "Edit the material settings for the active selection." },
  camera: { title: "Camera", description: "Place or configure a camera for the current scene." },
  design: { title: "Design", description: "Open the project design workspace." },
  sheets: { title: "Sheets", description: "Open project drawing sheets." },
  documents: { title: "Documents", description: "Open project documents." },
  visualisation: { title: "Visualisation", description: "Open visualisation tools and outputs." },
  schedules: { title: "Schedules", description: "Open project schedules." },
  margins: { title: "Margins", description: "Open project margins and pricing controls." },
  materials: { title: "Materials", description: "Open project material settings." },
  open: { title: "Open", description: "Open an existing project." },
  print: { title: "Print", description: "Print the current project output." },
  save: { title: "Save", description: "Save the current project." },
  cloud: { title: "Cloud status", description: "Show the current cloud synchronization status." },
  theme: { title: "Theme", description: "Choose the application's visual theme." },
  settings: { title: "Settings", description: "Open account and application settings." },
  desktop: { title: "Desktop app", description: "Get the Arcigy desktop application." },
  community: { title: "Community profile", description: "Create or edit a community profile." },
  addAccount: { title: "Add account", description: "Add another account to this browser." },
  logout: { title: "Log out", description: "End the current signed-in session." },
  profileEdit: { title: "Edit profile", description: "Edit the current user profile." },
  chevronRight: { title: "More options", description: "Open the next level of options." },
  debug: { title: "Copy debug JSON", description: "Copy the safe diagnostic trace for the latest assistant request." },
  menu: { title: "Assistant options", description: "Open additional assistant actions." },
  close: { title: "Close", description: "Close this panel." },
  attachment: { title: "Add attachment", description: "Attach a file to the assistant message." },
  previewContext: { title: "Preview context", description: "Preview the project context that will be sent to the assistant." },
  voice: { title: "Voice", description: "Start voice input when it is available." },
  send: { title: "Send message", description: "Send the written message to the assistant." },
  done: { title: "Accept", description: "Accept and finish the active tool." },
  cancel: { title: "Cancel", description: "Cancel the active tool without applying its pending change." }
} as const;

export type ActionIconId = keyof typeof actionIconDetails;
export type ActionIconInfo = { title: string; description: string; shortcut?: string };

const spriteUrl = "/ui-icons/actions.svg";

export function actionIconMarkup(iconId: ActionIconId, className = ""): string {
  const classes = ["arcigy-action-icon", className].filter(Boolean).join(" ");
  return `<svg class="${classes}" data-action-icon="${iconId}" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><use href="${spriteUrl}#${iconId}"></use></svg>`;
}

export function actionIconInfo(iconId: string | undefined): ActionIconInfo | null {
  if (!iconId || !(iconId in actionIconDetails)) return null;
  return actionIconDetails[iconId as ActionIconId];
}
