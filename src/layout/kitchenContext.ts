import type { ClientCatalog } from "../core/catalog/catalog-types"

export interface KitchenContext {
  // Identity
  name: string

  // Base modules - dimensions
  heightMm: number              // module height without plinth
  worktopDepthMm: number        // real worktop depth
  worktopFrontOffsetMm: number  // worktop front overhang
  worktopBackOffsetMm: number   // worktop back gap from wall
  worktopThicknessMm: number
  worktopCornerCutMm: number    // worktop corner cut for L/U kitchens
  worktopOverhangSideMm: number // side overhang on open end

  // Derived - never set manually, use resolveContext()
  moduleDepthMm: number   // = worktopDepthMm - worktopFrontOffsetMm - worktopBackOffsetMm
  moduleHeightMm: number  // = heightMm - worktopThicknessMm

  // Plinth
  plinthHeightMm: number
  plinthDepthMm: number

  // Upper modules
  upperStartHeightMm: number  // floor height where upper cabinet bottom starts
  upperDepthMm: number
  upperHeightMm: number

  // Doors and panels
  doorOverlayMm: number
  backPanelThicknessMm: number
  endPanelThicknessMm: number

  // Kitchen materials
  frontsMaterialId: string
  corpusMaterialId: string
  backMaterialId: string
  drawerBottomMaterialId: string
  worktopMaterialId: string
  handleComponentId: string

  // Layout behavior
  fillerStrategy: 'auto' | 'warn' | 'ignore'
  gapWarningMm: number   // gap smaller than this = warning
  overlapErrorMm: number // overlap larger than this = error
}

const FALLBACK_KITCHEN_DEFAULTS = {
  carcassMaterialId: "mat.board.body.dtd.grey.18",
  frontMaterialId: "mat.board.front.veneer.oak_natural.19",
  worktopMaterialId: "mat.board.worktop.laminate_oak.38",
  backPanelMaterialId: "mat.board.back.hdf.grey.6",
  drawerBottomMaterialId: "mat.board.drawer_bottom.hdf.white.8",
  defaultHandleComponentId: "cmp.handle.bar.160.black",
  defaultWorktopThicknessMm: 38,
  defaultBackPanelThicknessMm: 8,
  defaultPlinthHeightMm: 150
} as const

export function makeDefaultKitchenContext(catalog?: Pick<ClientCatalog, "kitchenDefaults">): KitchenContext {
  const defaults = catalog?.kitchenDefaults ?? FALLBACK_KITCHEN_DEFAULTS
  const worktopDepthMm = 620
  const worktopFrontOffsetMm = 20
  const worktopBackOffsetMm = 20
  const worktopThicknessMm = defaults.defaultWorktopThicknessMm ?? FALLBACK_KITCHEN_DEFAULTS.defaultWorktopThicknessMm
  const heightMm = 820

  const handleComponentId = defaults.defaultHandleComponentId ?? FALLBACK_KITCHEN_DEFAULTS.defaultHandleComponentId

  return {
    name: 'Kuchy\u0148a 1',

    heightMm,
    worktopDepthMm,
    worktopFrontOffsetMm,
    worktopBackOffsetMm,
    worktopThicknessMm,
    worktopCornerCutMm: 45,
    worktopOverhangSideMm: 30,

    moduleDepthMm: worktopDepthMm - worktopFrontOffsetMm - worktopBackOffsetMm,
    moduleHeightMm: heightMm - worktopThicknessMm,

    plinthHeightMm: defaults.defaultPlinthHeightMm ?? FALLBACK_KITCHEN_DEFAULTS.defaultPlinthHeightMm,
    plinthDepthMm: 50,

    upperStartHeightMm: 1400,
    upperDepthMm: 320,
    upperHeightMm: 720,

    doorOverlayMm: 18,
    backPanelThicknessMm: defaults.defaultBackPanelThicknessMm ?? FALLBACK_KITCHEN_DEFAULTS.defaultBackPanelThicknessMm,
    endPanelThicknessMm: 18,

    frontsMaterialId: defaults.frontMaterialId ?? FALLBACK_KITCHEN_DEFAULTS.frontMaterialId,
    corpusMaterialId: defaults.carcassMaterialId ?? FALLBACK_KITCHEN_DEFAULTS.carcassMaterialId,
    backMaterialId: defaults.backPanelMaterialId ?? FALLBACK_KITCHEN_DEFAULTS.backPanelMaterialId,
    drawerBottomMaterialId: defaults.drawerBottomMaterialId ?? FALLBACK_KITCHEN_DEFAULTS.drawerBottomMaterialId,
    worktopMaterialId: defaults.worktopMaterialId ?? FALLBACK_KITCHEN_DEFAULTS.worktopMaterialId,
    handleComponentId,

    fillerStrategy: 'warn',
    gapWarningMm: 50,
    overlapErrorMm: 2,
  }
}

// Call after changing worktopDepth, frontOffset, backOffset, or height.
export function resolveContext(ctx: KitchenContext): KitchenContext {
  return {
    ...ctx,
    handleComponentId:
      typeof ctx.handleComponentId === 'string' && ctx.handleComponentId.trim().length > 0
        ? ctx.handleComponentId
        : FALLBACK_KITCHEN_DEFAULTS.defaultHandleComponentId,
    moduleDepthMm: ctx.worktopDepthMm - ctx.worktopFrontOffsetMm - ctx.worktopBackOffsetMm,
    moduleHeightMm: ctx.heightMm - ctx.worktopThicknessMm,
  }
}

export function validateContext(ctx: KitchenContext): string[] {
  const warnings: string[] = []

  if (!ctx.name.trim())
    warnings.push('name is empty')
  if (ctx.heightMm <= 0)
    warnings.push(`heightMm is ${ctx.heightMm}mm - must be greater than 0`)
  if (ctx.worktopDepthMm <= 0)
    warnings.push(`worktopDepthMm is ${ctx.worktopDepthMm}mm - must be greater than 0`)
  if (ctx.worktopFrontOffsetMm < 0)
    warnings.push(`worktopFrontOffsetMm is ${ctx.worktopFrontOffsetMm}mm - cannot be negative`)
  if (ctx.worktopBackOffsetMm < 0)
    warnings.push(`worktopBackOffsetMm is ${ctx.worktopBackOffsetMm}mm - cannot be negative`)
  if (ctx.worktopThicknessMm < 0)
    warnings.push(`worktopThicknessMm is ${ctx.worktopThicknessMm}mm - cannot be negative`)
  if (ctx.worktopCornerCutMm < 0)
    warnings.push(`worktopCornerCutMm is ${ctx.worktopCornerCutMm}mm - cannot be negative`)
  if (ctx.worktopOverhangSideMm < 0)
    warnings.push(`worktopOverhangSideMm is ${ctx.worktopOverhangSideMm}mm - cannot be negative`)
  if (ctx.moduleDepthMm <= 0)
    warnings.push(`moduleDepthMm is ${ctx.moduleDepthMm}mm - check frontOffset and backOffset`)
  if (ctx.moduleHeightMm <= 0)
    warnings.push(`moduleHeightMm is ${ctx.moduleHeightMm}mm - check heightMm and worktopThicknessMm`)
  if (ctx.plinthHeightMm < 0)
    warnings.push(`plinthHeightMm is ${ctx.plinthHeightMm}mm - cannot be negative`)
  if (ctx.plinthDepthMm < 0)
    warnings.push(`plinthDepthMm is ${ctx.plinthDepthMm}mm - cannot be negative`)
  if (ctx.plinthDepthMm >= ctx.moduleDepthMm)
    warnings.push(`plinthDepthMm (${ctx.plinthDepthMm}) is greater than moduleDepthMm (${ctx.moduleDepthMm})`)
  if (ctx.upperStartHeightMm <= ctx.heightMm)
    warnings.push(`upperStartHeightMm (${ctx.upperStartHeightMm}) is lower than base module height (${ctx.heightMm})`)
  if (ctx.upperDepthMm <= 0)
    warnings.push(`upperDepthMm is ${ctx.upperDepthMm}mm - must be greater than 0`)
  if (ctx.upperHeightMm <= 0)
    warnings.push(`upperHeightMm is ${ctx.upperHeightMm}mm - must be greater than 0`)
  if (ctx.doorOverlayMm < 0)
    warnings.push(`doorOverlayMm is ${ctx.doorOverlayMm}mm - cannot be negative`)
  if (ctx.backPanelThicknessMm < 0)
    warnings.push(`backPanelThicknessMm is ${ctx.backPanelThicknessMm}mm - cannot be negative`)
  if (ctx.endPanelThicknessMm < 0)
    warnings.push(`endPanelThicknessMm is ${ctx.endPanelThicknessMm}mm - cannot be negative`)
  if (!ctx.frontsMaterialId.trim())
    warnings.push('frontsMaterialId is empty')
  if (!ctx.corpusMaterialId.trim())
    warnings.push('corpusMaterialId is empty')
  if (!ctx.backMaterialId.trim())
    warnings.push('backMaterialId is empty')
  if (!ctx.drawerBottomMaterialId.trim())
    warnings.push('drawerBottomMaterialId is empty')
  if (!ctx.worktopMaterialId.trim())
    warnings.push('worktopMaterialId is empty')
  if (!ctx.handleComponentId.trim())
    warnings.push('handleComponentId is empty')
  if (ctx.fillerStrategy !== 'auto' && ctx.fillerStrategy !== 'warn' && ctx.fillerStrategy !== 'ignore')
    warnings.push(`fillerStrategy is invalid: ${ctx.fillerStrategy}`)
  if (ctx.gapWarningMm < 0)
    warnings.push(`gapWarningMm is ${ctx.gapWarningMm}mm - cannot be negative`)
  if (ctx.overlapErrorMm < 0)
    warnings.push(`overlapErrorMm is ${ctx.overlapErrorMm}mm - cannot be negative`)

  return warnings
}
