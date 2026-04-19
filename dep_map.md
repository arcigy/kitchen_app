### `src/app.ts`
- **Exports**: startApp
- **Local Imports**:
  - `./model/cabinetTypes`: makeDefaultCornerShelfLowerParams, makeDefaultDrawerLowParams, makeDefaultNestedDrawerLowParams, makeDefaultFlapShelvesLowParams, makeDefaultFridgeTallParams, makeDefaultMicrowaveOvenTallParams, makeDefaultOvenBaseLowParams, makeDefaultShelvesParams, makeDefaultSwingShelvesLowParams, makeDefaultTopDrawersDoorsLowParams, validateModule
  - `./geometry/buildModule`: buildModule
  - `./scene/createScene`: createScene
  - `./ui/createPartPanel`: createPartPanel, type GrainAlong, type OverlapRow
  - `./ui/createLayoutPanel`: createLayoutPanel
  - `./scene/disposeObject3D`: disposeObject3D
  - `./ui/createDrawerLowControls`: createDrawerLowControls
  - `./ui/createFridgeTallControls`: createFridgeTallControls
  - `./ui/createShelvesControls`: createShelvesControls
  - `./ui/createCornerShelfLowerControls`: createCornerShelfLowerControls
  - `./ui/createNestedDrawerLowControls`: createNestedDrawerLowControls
  - `./ui/createFlapShelvesLowControls`: createFlapShelvesLowControls
  - `./ui/createSwingShelvesLowControls`: createSwingShelvesLowControls
  - `./ui/createOvenBaseLowControls`: createOvenBaseLowControls
  - `./ui/createMicrowaveOvenTallControls`: createMicrowaveOvenTallControls
  - `./ui/createTopDrawersDoorsLowControls`: createTopDrawersDoorsLowControls
  - `./rendering/ssgiPipeline`: createSsgiPipeline, type SsgiPipeline
  - `./rendering/photoPathTracer`: createPhotoPathTracer, type PhotoPathTracer
  - `./scene/exportSceneJson`: exportSceneToJson
  - `./ui/createTopbar`: createTopbar
  - `./ui/loadUnderlay`: loadUnderlayToCanvas
  - `./walls2d/solver`: solveWallNetwork
  - `./model/cabinetTypes`: ModuleParams

### `src/geometry/buildCornerShelfLower.ts`
- **Exports**: buildCornerShelfLower
- **Local Imports**:
  - `../model/cabinetTypes`: computeShelfHeightsFromGaps
  - `../materials/pbrMaterials`: getPbrMaterialWorldSizeM, getPbrWoodMaterial
  - `../materials/uvGrain`: applyBoxGrainUv
  - `../model/cabinetTypes`: CornerShelfLowerParams

### `src/geometry/buildDrawerLow.ts`
- **Exports**: buildDrawerLow
- **Local Imports**:
  - `../materials/pbrMaterials`: getPbrMaterialWorldSizeM, getPbrWoodMaterial
  - `../materials/uvGrain`: applyBoxGrainUv
  - `../model/cabinetTypes`: DrawerLowParams

### `src/geometry/buildFlapShelvesLow.ts`
- **Exports**: buildFlapShelvesLow
- **Local Imports**:
  - `../model/cabinetTypes`: computeShelfHeightsFromGaps
  - `../model/cabinetTypes`: FlapShelvesLowParams

### `src/geometry/buildFridgeTall.ts`
- **Exports**: buildFridgeTall
- **Local Imports**:
  - `../materials/pbrMaterials`: getPbrMaterialWorldSizeM, getPbrWoodMaterial, type PbrMaterialRef
  - `../materials/uvGrain`: applyBoxGrainUv
  - `../model/cabinetTypes`: FridgeTallParams

### `src/geometry/buildMicrowaveOvenTall.ts`
- **Exports**: buildMicrowaveOvenTall
- **Local Imports**:
  - `../materials/pbrMaterials`: getPbrMaterialWorldSizeM, getPbrWoodMaterial
  - `../materials/uvGrain`: applyBoxGrainUv
  - `../model/cabinetTypes`: MicrowaveOvenTallParams

### `src/geometry/buildModule.ts`
- **Exports**: buildModule
- **Local Imports**:
  - `../model/cabinetTypes`: normalizeModuleParams
  - `./buildDrawerLow`: buildDrawerLow
  - `./buildCornerShelfLower`: buildCornerShelfLower
  - `./buildShelves`: buildShelves
  - `./buildFridgeTall`: buildFridgeTall
  - `./buildNestedDrawerLow`: buildNestedDrawerLow
  - `./buildFlapShelvesLow`: buildFlapShelvesLow
  - `./buildSwingShelvesLow`: buildSwingShelvesLow
  - `./buildOvenBaseLow`: buildOvenBaseLow
  - `./buildMicrowaveOvenTall`: buildMicrowaveOvenTall
  - `./buildTopDrawersDoorsLow`: buildTopDrawersDoorsLow
  - `../model/cabinetTypes`: ModuleParams

### `src/geometry/buildNestedDrawerLow.ts`
- **Exports**: buildNestedDrawerLow
- **Local Imports**:
  - `./buildDrawerLow`: buildDrawerLow
  - `../model/cabinetTypes`: NestedDrawerLowParams, DrawerLowParams

### `src/geometry/buildOvenBaseLow.ts`
- **Exports**: buildOvenBaseLow
- **Local Imports**:
  - `../materials/pbrMaterials`: getPbrMaterialWorldSizeM, getPbrWoodMaterial
  - `../materials/uvGrain`: applyBoxGrainUv
  - `../model/cabinetTypes`: OvenBaseLowParams

### `src/geometry/buildShelves.ts`
- **Exports**: buildShelves
- **Local Imports**:
  - `../model/cabinetTypes`: computeShelfHeightsFromGaps
  - `../materials/pbrMaterials`: getPbrMaterialWorldSizeM, getPbrWoodMaterial
  - `../materials/uvGrain`: applyBoxGrainUv
  - `../model/cabinetTypes`: ShelvesParams

### `src/geometry/buildSwingShelvesLow.ts`
- **Exports**: buildSwingShelvesLow
- **Local Imports**:
  - `../model/cabinetTypes`: computeShelfHeightsFromGaps
  - `../model/cabinetTypes`: SwingShelvesLowParams

### `src/geometry/buildTopDrawersDoorsLow.ts`
- **Exports**: buildTopDrawersDoorsLow
- **Local Imports**:
  - `../model/cabinetTypes`: computeShelfHeightsFromGaps
  - `../materials/pbrMaterials`: getPbrMaterialWorldSizeM, getPbrWoodMaterial
  - `../materials/uvGrain`: applyBoxGrainUv
  - `../model/cabinetTypes`: TopDrawersDoorsLowParams

### `src/main.ts`
- **Exports**: (none)
- **Local Imports**:
  - `./app`: startApp

### `src/materials/pbrMaterials.ts`
- **Exports**: PbrMaterialId, PbrMaterialRef, getPbrMaterialWorldSizeM, getPbrWoodMaterial, getPbrMaterial
- **Local Imports**: (none)

### `src/materials/uvGrain.ts`
- **Exports**: applyBoxGrainUv
- **Local Imports**:
  - `../ui/createPartPanel`: GrainAlong

### `src/model/cabinetTypes.ts`
- **Exports**: MaterialParams, DrawerLowParams, NestedDrawerLowParams, ShelvesParams, CornerShelfLowerParams, FridgeTallParams, FlapShelvesLowParams, SwingShelvesLowParams, TopDrawersDoorsLowParams, OvenBaseLowParams, MicrowaveOvenTallParams, ModuleParams, makeDefaultDrawerLowParams, makeDefaultNestedDrawerLowParams, makeDefaultShelvesParams, makeDefaultCornerShelfLowerParams, makeDefaultFridgeTallParams, makeDefaultFlapShelvesLowParams, makeDefaultSwingShelvesLowParams, makeDefaultOvenBaseLowParams, makeDefaultMicrowaveOvenTallParams, makeDefaultTopDrawersDoorsLowParams, validateModule, normalizeModuleParams, validateDrawerLow, validateNestedDrawerLow, validateShelves, computeEqualDrawerFrontHeights, computeEqualNestedDrawerFrontHeights, validateCornerShelfLower, validateFridgeTall, validateFlapShelvesLow, validateSwingShelvesLow, validateOvenBaseLow, validateMicrowaveOvenTall, validateTopDrawersDoorsLow, computeEqualShelfGaps, computeShelfHeightsFromGaps
- **Local Imports**: (none)

### `src/rendering/photoPathTracer.ts`
- **Exports**: PhotoPathTracer, createPhotoPathTracer
- **Local Imports**: (none)

### `src/rendering/ssgiPipeline.ts`
- **Exports**: SsgiOptions, SsgiPipeline, createSsgiPipeline
- **Local Imports**: (none)

### `src/scene/createScene.ts`
- **Exports**: createScene
- **Local Imports**:
  - `../materials/pbrMaterials`: getPbrMaterial

### `src/scene/disposeObject3D.ts`
- **Exports**: disposeObject3D
- **Local Imports**: (none)

### `src/scene/exportSceneJson.ts`
- **Exports**: SceneExportV1, ExportSceneArgs, exportSceneToJson
- **Local Imports**: (none)

### `src/server/blender/runBlenderExport.ts`
- **Exports**: RunBlenderExportResult, runBlenderExport
- **Local Imports**: (none)

### `src/server/workerServer.ts`
- **Exports**: startWorkerServer
- **Local Imports**:
  - `./blender/runBlenderExport`: runBlenderExport

### `src/ui/createCornerShelfLowerControls.ts`
- **Exports**: createCornerShelfLowerControls
- **Local Imports**:
  - `../model/cabinetTypes`: computeEqualShelfGaps
  - `../model/cabinetTypes`: CornerShelfLowerParams

### `src/ui/createDrawerLowControls.ts`
- **Exports**: createDrawerLowControls
- **Local Imports**:
  - `../model/cabinetTypes`: computeEqualDrawerFrontHeights
  - `../model/cabinetTypes`: DrawerLowParams

### `src/ui/createFlapShelvesLowControls.ts`
- **Exports**: createFlapShelvesLowControls
- **Local Imports**:
  - `../model/cabinetTypes`: computeEqualShelfGaps
  - `../model/cabinetTypes`: FlapShelvesLowParams

### `src/ui/createFridgeTallControls.ts`
- **Exports**: createFridgeTallControls
- **Local Imports**:
  - `../model/cabinetTypes`: FridgeTallParams

### `src/ui/createLayoutPanel.ts`
- **Exports**: LayoutRow, createLayoutPanel
- **Local Imports**:
  - `../model/cabinetTypes`: ModuleParams

### `src/ui/createMicrowaveOvenTallControls.ts`
- **Exports**: createMicrowaveOvenTallControls
- **Local Imports**:
  - `../model/cabinetTypes`: MicrowaveOvenTallParams

### `src/ui/createNestedDrawerLowControls.ts`
- **Exports**: createNestedDrawerLowControls
- **Local Imports**:
  - `../model/cabinetTypes`: computeEqualNestedDrawerFrontHeights
  - `../model/cabinetTypes`: NestedDrawerLowParams

### `src/ui/createOvenBaseLowControls.ts`
- **Exports**: createOvenBaseLowControls
- **Local Imports**:
  - `../model/cabinetTypes`: OvenBaseLowParams

### `src/ui/createPartPanel.ts`
- **Exports**: PartDimensionsMm, GrainAlong, PartRow, OverlapRow, createPartPanel
- **Local Imports**: (none)

### `src/ui/createRibbon.ts`
- **Exports**: createRibbon, ribbonGroup, ribbonActions, ribbonButton, ribbonRow
- **Local Imports**: (none)

### `src/ui/createShelvesControls.ts`
- **Exports**: createShelvesControls
- **Local Imports**:
  - `../model/cabinetTypes`: computeEqualShelfGaps
  - `../model/cabinetTypes`: ShelvesParams

### `src/ui/createSwingShelvesLowControls.ts`
- **Exports**: createSwingShelvesLowControls
- **Local Imports**:
  - `../model/cabinetTypes`: computeEqualShelfGaps
  - `../model/cabinetTypes`: SwingShelvesLowParams

### `src/ui/createTopbar.ts`
- **Exports**: createTopbar
- **Local Imports**: (none)

### `src/ui/createTopDrawersDoorsLowControls.ts`
- **Exports**: createTopDrawersDoorsLowControls
- **Local Imports**:
  - `../model/cabinetTypes`: computeEqualShelfGaps
  - `../model/cabinetTypes`: TopDrawersDoorsLowParams

### `src/ui/loadUnderlay.ts`
- **Exports**: UnderlaySource, loadUnderlayToCanvas
- **Local Imports**: (none)

### `src/vite-env.d.ts`
- **Exports**: (none)
- **Local Imports**: (none)

### `src/walls2d/geom.ts`
- **Exports**: Point, Line, EPS, add, sub, mul, dot, cross, len, len2, norm, perpLeft, dist, line, intersectLines, clamp, almostEq, almostPoint
- **Local Imports**: (none)

### `src/walls2d/model.ts`
- **Exports**: WallJustification, Wall, baseDir, spineDir, leftNormal, offsetsM, sideLineAtNode, rawEndCorners, sideToFace
- **Local Imports**:
  - `./geom`: add, mul, norm, perpLeft, sub, type Line, type Point

### `src/walls2d/solver.test.ts`
- **Exports**: (none)
- **Local Imports**:
  - `./solver`: solveWallNetwork
  - `./geom`: dist
  - `./model`: Wall

### `src/walls2d/solver.ts`
- **Exports**: WallEnd, WallSolvedEnd, WallSolved, solveWallNetwork
- **Local Imports**:
  - `./geom`: add, clamp, dist, intersectLines, mul, sub, type Point
  - `./model`: rawEndCorners, sideLineAtNode, spineDir, type Wall