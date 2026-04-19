export interface KitchenContext {
  name: string

  // Spodné moduly — rozmery
  heightMm: number              // výška modulov (bez sokla)
  worktopDepthMm: number        // skutočná šírka pracovnej dosky
  worktopFrontOffsetMm: number  // presah dosky vpredu
  worktopBackOffsetMm: number   // medzera dosky vzadu od steny
  worktopThicknessMm: number
  worktopCornerCutMm: number    // zrez rohu dosky pri L/U kuchyni
  worktopOverhangSideMm: number // presah dosky na voľnom konci

  // Odvodené — NIKDY nenastavuj manuálne, počítaj cez resolveContext()
  moduleDepthMm: number   // = worktopDepthMm - worktopFrontOffsetMm - worktopBackOffsetMm
  moduleHeightMm: number  // = heightMm - worktopThicknessMm

  // Sokel
  plinthHeightMm: number
  plinthDepthMm: number

  // Vrchné moduly
  upperStartHeightMm: number  // výška od podlahy kde začína spodok hornej skrinky
  upperDepthMm: number
  upperHeightMm: number

  // Dvierka a panely
  doorOverlayMm: number
  backPanelThicknessMm: number
  endPanelThicknessMm: number

  // Materiály — len ID referencie
  faceMaterialId: string
  corpusMaterialId: string
  interiorMaterialId: string
  worktopMaterialId: string
  backPanelMaterialId: string
  plinthMaterialId: string
  endPanelMaterialId: string

  // Správanie layoutu
  fillerStrategy: 'auto' | 'warn' | 'ignore'
  gapWarningMm: number   // medzera menšia ako toto = warning
  overlapErrorMm: number // overlap väčší ako toto = error
}

export function makeDefaultKitchenContext(): KitchenContext {
  const worktopDepthMm = 620
  const worktopFrontOffsetMm = 20
  const worktopBackOffsetMm = 20
  const worktopThicknessMm = 40
  const heightMm = 820

  return {
    name: 'Kuchyňa 1',
    heightMm,
    worktopDepthMm,
    worktopFrontOffsetMm,
    worktopBackOffsetMm,
    worktopThicknessMm,
    worktopCornerCutMm: 45,
    worktopOverhangSideMm: 30,

    moduleDepthMm: worktopDepthMm - worktopFrontOffsetMm - worktopBackOffsetMm,
    moduleHeightMm: heightMm - worktopThicknessMm,

    plinthHeightMm: 150,
    plinthDepthMm: 50,

    upperStartHeightMm: 1400,
    upperDepthMm: 320,
    upperHeightMm: 720,

    doorOverlayMm: 18,
    backPanelThicknessMm: 8,
    endPanelThicknessMm: 18,

    faceMaterialId: 'mat_oak_natural',
    corpusMaterialId: 'mat_grey_corpus',
    interiorMaterialId: 'mat_white_melamine',
    worktopMaterialId: 'mat_worktop_oak',
    backPanelMaterialId: 'mat_white_melamine',
    plinthMaterialId: 'mat_grey_corpus',
    endPanelMaterialId: 'mat_oak_natural',

    fillerStrategy: 'warn',
    gapWarningMm: 50,
    overlapErrorMm: 2,
  }
}

// Vždy keď zmeníš worktopDepth, frontOffset, backOffset alebo height —
// zavolaj toto aby sa odvodené hodnoty prepočítali.
export function resolveContext(ctx: KitchenContext): KitchenContext {
  return {
    ...ctx,
    moduleDepthMm: ctx.worktopDepthMm - ctx.worktopFrontOffsetMm - ctx.worktopBackOffsetMm,
    moduleHeightMm: ctx.heightMm - ctx.worktopThicknessMm,
  }
}

// Vráti warning ak odvodené rozmery nedávajú zmysel.
export function validateContext(ctx: KitchenContext): string[] {
  const warnings: string[] = []
  if (ctx.moduleDepthMm <= 0)
    warnings.push(`moduleDepthMm je ${ctx.moduleDepthMm}mm — skontroluj frontOffset a backOffset`)
  if (ctx.moduleHeightMm <= 0)
    warnings.push(`moduleHeightMm je ${ctx.moduleHeightMm}mm — skontroluj heightMm a worktopThicknessMm`)
  if (ctx.plinthDepthMm >= ctx.moduleDepthMm)
    warnings.push(`plinthDepthMm (${ctx.plinthDepthMm}) je väčší ako moduleDepthMm (${ctx.moduleDepthMm})`)
  if (ctx.upperStartHeightMm <= ctx.heightMm)
    warnings.push(`upperStartHeightMm (${ctx.upperStartHeightMm}) je nižší ako výška spodných modulov (${ctx.heightMm})`)
  return warnings
}
