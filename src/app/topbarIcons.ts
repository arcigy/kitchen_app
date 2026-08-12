import { actionIconMarkup } from "../ui/actionIcons";

/**
 * Compatibility map for editor controllers. All action artwork is kept in the
 * shared SVG sprite so ribbon buttons never depend on font glyphs or the old
 * oversized CAD exports.
 */
export const topbarIcons = {
  I_SELECT: actionIconMarkup("select"),
  I_WALL: actionIconMarkup("wall"),
  I_DOOR: actionIconMarkup("door"),
  I_WINDOW: actionIconMarkup("window"),
  I_COLUMN: actionIconMarkup("column"),
  I_STAIR: actionIconMarkup("stair"),
  I_ALIGN: actionIconMarkup("align"),
  I_FIT_GAP: actionIconMarkup("fitGap"),
  I_TRIM: actionIconMarkup("trim"),
  I_SECTION: actionIconMarkup("section"),
  I_DIM: actionIconMarkup("dimension"),
  I_MEASURE: actionIconMarkup("measure"),
  I_FLOOR: actionIconMarkup("floor"),
  I_UNDERLAY: actionIconMarkup("underlay"),
  I_UNPIN_WORKTOP: actionIconMarkup("unpinWorktop"),
  I_CABINET: actionIconMarkup("cabinet"),
  I_LIVING_WALL: actionIconMarkup("livingWall"),
  I_WARDROBE: actionIconMarkup("wardrobe"),
  I_GRID2D: actionIconMarkup("grid2d"),
  I_UNDO: actionIconMarkup("undo"),
  I_REDO: actionIconMarkup("redo"),
  I_MOVE: actionIconMarkup("move"),
  I_ROTATE: actionIconMarkup("rotate"),
  I_DUP: actionIconMarkup("duplicate"),
  I_HIDE: actionIconMarkup("hide"),
  I_ISOLATE: actionIconMarkup("isolate"),
  I_UNHIDE: actionIconMarkup("unhide"),
  I_TRASH: actionIconMarkup("delete"),
  I_RESET: actionIconMarkup("resetDefaults"),
  I_RESET_VIEW: actionIconMarkup("resetView"),
  I_EXPORT: actionIconMarkup("exportJson"),
  I_BLENDER_REVIEW: actionIconMarkup("blenderReview"),
  I_COPY: actionIconMarkup("copyExport"),
  I_PRICING_CATALOG: actionIconMarkup("pricingCatalog"),
  I_BOM: actionIconMarkup("bom"),
  I_INSTALL: actionIconMarkup("install"),
  I_MATERIAL_EDIT: actionIconMarkup("materialEdit"),
  I_LED_STRIP: actionIconMarkup("ledStrip"),
  I_CAMERA: actionIconMarkup("camera"),
  I_VIEW: actionIconMarkup("previewContext"),
  I_DONE: actionIconMarkup("done"),
  I_CANCEL: actionIconMarkup("cancel")
};
