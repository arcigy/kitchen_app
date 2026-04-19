export interface KitchenContext {
  // Identifikácia
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

// Vráti warning ak odvodené alebo vstupné rozmery nedávajú zmysel.
export function validateContext(ctx: KitchenContext): string[] {
  const warnings: string[] = []

  if (!ctx.name.trim())
    warnings.push('name je prázdny')
  if (ctx.heightMm <= 0)
    warnings.push(`heightMm je ${ctx.heightMm}mm — musí byť väčší ako 0`)
  if (ctx.worktopDepthMm <= 0)
    warnings.push(`worktopDepthMm je ${ctx.worktopDepthMm}mm — musí byť väčší ako 0`)
  if (ctx.worktopFrontOffsetMm < 0)
    warnings.push(`worktopFrontOffsetMm je ${ctx.worktopFrontOffsetMm}mm — nesmie byť záporný`)
  if (ctx.worktopBackOffsetMm < 0)
    warnings.push(`worktopBackOffsetMm je ${ctx.worktopBackOffsetMm}mm — nesmie byť záporný`)
  if (ctx.worktopThicknessMm < 0)
    warnings.push(`worktopThicknessMm je ${ctx.worktopThicknessMm}mm — nesmie byť záporný`)
  if (ctx.worktopCornerCutMm < 0)
    warnings.push(`worktopCornerCutMm je ${ctx.worktopCornerCutMm}mm — nesmie byť záporný`)
  if (ctx.worktopOverhangSideMm < 0)
    warnings.push(`worktopOverhangSideMm je ${ctx.worktopOverhangSideMm}mm — nesmie byť záporný`)
  if (ctx.moduleDepthMm <= 0)
    warnings.push(`moduleDepthMm je ${ctx.moduleDepthMm}mm — skontroluj frontOffset a backOffset`)
  if (ctx.moduleHeightMm <= 0)
    warnings.push(`moduleHeightMm je ${ctx.moduleHeightMm}mm — skontroluj heightMm a worktopThicknessMm`)
  if (ctx.plinthHeightMm < 0)
    warnings.push(`plinthHeightMm je ${ctx.plinthHeightMm}mm — nesmie byť záporný`)
  if (ctx.plinthDepthMm < 0)
    warnings.push(`plinthDepthMm je ${ctx.plinthDepthMm}mm — nesmie byť záporný`)
  if (ctx.plinthDepthMm >= ctx.moduleDepthMm)
    warnings.push(`plinthDepthMm (${ctx.plinthDepthMm}) je väčší ako moduleDepthMm (${ctx.moduleDepthMm})`)
  if (ctx.upperStartHeightMm <= ctx.heightMm)
    warnings.push(`upperStartHeightMm (${ctx.upperStartHeightMm}) je nižší ako výška spodných modulov (${ctx.heightMm})`)
  if (ctx.upperDepthMm <= 0)
    warnings.push(`upperDepthMm je ${ctx.upperDepthMm}mm — musí byť väčší ako 0`)
  if (ctx.upperHeightMm <= 0)
    warnings.push(`upperHeightMm je ${ctx.upperHeightMm}mm — musí byť väčší ako 0`)
  if (ctx.doorOverlayMm < 0)
    warnings.push(`doorOverlayMm je ${ctx.doorOverlayMm}mm — nesmie byť záporný`)
  if (ctx.backPanelThicknessMm < 0)
    warnings.push(`backPanelThicknessMm je ${ctx.backPanelThicknessMm}mm — nesmie byť záporný`)
  if (ctx.endPanelThicknessMm < 0)
    warnings.push(`endPanelThicknessMm je ${ctx.endPanelThicknessMm}mm — nesmie byť záporný`)
  if (!ctx.faceMaterialId.trim())
    warnings.push('faceMaterialId je prázdny')
  if (!ctx.corpusMaterialId.trim())
    warnings.push('corpusMaterialId je prázdny')
  if (!ctx.interiorMaterialId.trim())
    warnings.push('interiorMaterialId je prázdny')
  if (!ctx.worktopMaterialId.trim())
    warnings.push('worktopMaterialId je prázdny')
  if (!ctx.backPanelMaterialId.trim())
    warnings.push('backPanelMaterialId je prázdny')
  if (!ctx.plinthMaterialId.trim())
    warnings.push('plinthMaterialId je prázdny')
  if (!ctx.endPanelMaterialId.trim())
    warnings.push('endPanelMaterialId je prázdny')
  if (ctx.fillerStrategy !== 'auto' && ctx.fillerStrategy !== 'warn' && ctx.fillerStrategy !== 'ignore')
    warnings.push(`fillerStrategy je neplatný: ${ctx.fillerStrategy}`)
  if (ctx.gapWarningMm < 0)
    warnings.push(`gapWarningMm je ${ctx.gapWarningMm}mm — nesmie byť záporný`)
  if (ctx.overlapErrorMm < 0)
    warnings.push(`overlapErrorMm je ${ctx.overlapErrorMm}mm — nesmie byť záporný`)

  return warnings
}
