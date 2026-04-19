const fs = require('fs');
let code = fs.readFileSync('src/app.ts', 'utf8');

// Replace imports block
const newImports = `import * as THREE from "three";
import polygonClipping from "polygon-clipping";
import type { ModuleParams } from "./model/cabinetTypes";
import {
  makeDefaultCornerShelfLowerParams,
  makeDefaultDrawerLowParams,
  makeDefaultNestedDrawerLowParams,
  makeDefaultFlapShelvesLowParams,
  makeDefaultFridgeTallParams,
  makeDefaultMicrowaveOvenTallParams,
  makeDefaultOvenBaseLowParams,
  makeDefaultShelvesParams,
  makeDefaultSwingShelvesLowParams,
  makeDefaultTopDrawersDoorsLowParams,
  validateModule
} from "./model/cabinetTypes";
import { buildModule } from "./geometry/buildModule";
import { createScene } from "./core/scene";
import { createPartPanel, type GrainAlong, type OverlapRow } from "./ui/createPartPanel";
import { createLayoutPanel } from "./ui/createLayoutPanel";
import { disposeObject3D } from "./core/dispose";
import {
  createDrawerLowControls,
  createFridgeTallControls,
  createShelvesControls,
  createCornerShelfLowerControls,
  createNestedDrawerLowControls,
  createFlapShelvesLowControls,
  createSwingShelvesLowControls,
  createOvenBaseLowControls,
  createMicrowaveOvenTallControls,
  createTopDrawersDoorsLowControls
} from "./modules/_registry";
import { createSsgiPipeline, type SsgiPipeline } from "./rendering/ssgiPipeline";
import { createPhotoPathTracer, type PhotoPathTracer } from "./rendering/photoPathTracer";
import { exportSceneToJson } from "./core/exportScene";
import { createTopbar } from "./ui/createTopbar";
import { loadUnderlayToCanvas } from "./ui/loadUnderlay";
import { solveWallNetwork } from "./walls2d/solver";
import { makeAppState } from "./layout/appState";

type AppArgs = {`;

code = code.replace(/import \* as THREE.*?type AppArgs = \{/s, newImports);

fs.writeFileSync('src/app.ts', code);
console.log('Fixed imports');
