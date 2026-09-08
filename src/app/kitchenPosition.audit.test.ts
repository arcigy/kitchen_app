import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { makeAppState, type LayoutSnapshot } from '../layout/appState';
import { captureLayoutSnapshot, restoreLayoutSnapshot, type HistoryHelpers } from '../layout/historyManager';
import { getSystemSeedCatalog } from '../core/catalog/catalog-repository';
import { makeDefaultKitchenContext, resolveContext, type KitchenContext } from '../layout/kitchenContext';
import { applyKitchenContextToModuleParams } from '../layout/kitchenMaterialSync';
import { offsetKitchenWorktopPath } from '../layout/worktopGeometry';
import { buildFwmFurniture } from '../modules/fwmFurniture/geometry';
import { makeDefaultFwmFurnitureParams, normalizeFwmFurnitureParams, type FwmFurnitureParams } from '../modules/fwmFurniture/types';
import type { ModuleParams } from '../model/cabinetTypes';
import type { KitchenWorktopInstance, LayoutInstance } from './localTypes';
import { createKitchenPlacementController } from './kitchenPlacementController';
import { createInstanceRebuilder } from './instanceRebuilder';
import { ensurePickAndOutline, footprintExtentsMatchXZ, instanceLayoutWorldBox, moduleRootLocalBox } from './moduleVisualGeometry';
import { getModulePlanPolygon } from './planSnap';

// Existing position regressions retained for the root anchor and wall/history integration.
// Real FWM geometry + production rebuild, placement, history and plan helpers.
function fixture(angle = 0) {
  const catalog = getSystemSeedCatalog();
  const S = makeAppState(makeDefaultFwmFurnitureParams('fwm_catalog_base_drawers') as ModuleParams);
  S.mode = 'layout'; S.viewMode = '2d';
  S.kitchenCtx = resolveContext({...makeDefaultKitchenContext(catalog), worktopDepthMm:620, worktopFrontOffsetMm:20, worktopBackOffsetMm:20});
  S.kitchenGroups.push({id:'k',name:'Kitchen',ctx:structuredClone(S.kitchenCtx),instanceIds:[]});
  const layoutRoot = new THREE.Group();
  const radians = angle * Math.PI / 180;
  const dir = new THREE.Vector3(Math.cos(radians),0,-Math.sin(radians));
  const normal = new THREE.Vector3(-dir.z,0,dir.x);
  const path = [{x:0,z:0},{x:dir.x*4000,z:dir.z*4000}];
  const makeWorktop = (params: KitchenWorktopInstance['params']) => ({id:'w',kitchenGroupId:'k',params,
    root:new THREE.Group(),mesh:new THREE.Mesh(),outline:new THREE.Line()} as KitchenWorktopInstance);
  S.kitchenWorktops.push(makeWorktop({path,justification:'back',mirrored:false,depthMm:620,thicknessMm:38,heightMm:820,overhangSideMm:20,materialId:''}));
  let rebuilder: ReturnType<typeof createInstanceRebuilder>;
  const placement = createKitchenPlacementController({S, catalog, instances:S.instances, kitchenWorktops:S.kitchenWorktops,
    walls:[],floors:[],wallSolvedOutlines:new Map(),
    getKitchenWorktopBackGuidePath:(params,back=20)=>offsetKitchenWorktopPath(params.path.map(p=>new THREE.Vector3(p.x/1000,0,p.z/1000)),back/1000),
    rebuildInstance:(inst,opts)=>rebuilder.rebuildInstance(inst,opts),
    rebuildKitchenGroupWorktops:(_id,ctx)=>{S.kitchenWorktops[0].params.depthMm=ctx!.worktopDepthMm;},
    rebuildKitchenWorktop:vi.fn(),updateLayoutPanel:vi.fn(),getWallSolvedJoinPolys:()=>[],getWallUnionPolys:()=>null,
    getLayoutTool:()=> 'select',getWallChainStart:()=>null,commitHistory:vi.fn()});
  const setup = (inst: LayoutInstance) => ensurePickAndOutline(inst,{flattenToPlan:S.viewMode==='2d',viewMode:S.viewMode,getModuleLocalBackCenter:placement.getModuleLocalBackCenter});
  const create = (params:ModuleParams, opts:{id?:string}={}) => {
    const root = new THREE.Group(); const module = buildFwmFurniture(params as FwmFurnitureParams,catalog); root.add(module);
    const inst = {id:opts.id??`m${S.instances.length}`,params:structuredClone(params),root,module,kitchenGroupId:'k',kitchenPlacement:null,
      localBox:moduleRootLocalBox(root,module),pick:new THREE.Mesh(),outline:new THREE.LineSegments()} as LayoutInstance;
    setup(inst); return inst;
  };
  const rebuildContext: Parameters<typeof createInstanceRebuilder>[0] = {
    S,instances:S.instances,args:{errorsEl:{} as HTMLElement},buildModule:p=>buildFwmFurniture(p as FwmFurnitureParams,catalog),
    normalizeModuleParamsForSource:(p)=>normalizeFwmFurnitureParams(p as FwmFurnitureParams) as ModuleParams,
    validateModule:()=>[],renderErrors:vi.fn(),disposeObject3D:vi.fn(),tagModuleGeometry:vi.fn(),ensurePickAndOutline:setup,
    moduleRootLocalBox,instanceWorldBox:i=>instanceLayoutWorldBox(i,placement.getModuleLocalBackCenter),footprintExtentsMatchXZ,
    getModuleLocalKitchenAnchor:placement.getModuleLocalKitchenAnchor,preserveWorldKitchenAnchor:placement.preserveWorldKitchenAnchor,
    inferKitchenPlacementBinding:placement.inferKitchenPlacementBinding,isCornerKitchenModule:placement.isCornerKitchenModule,
    findInstance:id=>S.instances.find(i=>i.id===id)??null,
    anyOverlap:()=>false,applyWallConstraints:(_i,p)=>p,chooseResizeAnchorSide:()=>null,collectAdjacentModuleInfos:()=>[],
    inferTallResizeAnchorSide:()=>null,instanceFitsLayoutBounds:()=>true,moduleOverlapsKitchenWorktops:()=>false,moduleOverlapsWalls:()=>false,
    preserveAnchoredResizeSide:vi.fn(),propagateCornerResizeToPinnedNeighbors:()=>({movedIds:[]}),propagateModuleResizeToPinnedNeighbors:()=>({movedIds:[]}),
    lastRebuildDebug:null,updateLayoutPanel:vi.fn()
  };
  rebuilder = createInstanceRebuilder(rebuildContext);
  const add = (along=1.2) => {
    const params = {...makeDefaultFwmFurnitureParams('fwm_catalog_base_drawers'),width:600,drawerCount:2} as ModuleParams;
    applyKitchenContextToModuleParams(params,S.kitchenCtx,catalog,null);
    const inst = create(params); S.instances.push(inst); layoutRoot.add(inst.root);
    expect(placement.applyKitchenPlacementBinding(inst,{worktopId:'w',segmentIndex:0,offsetAlongM:along},S.kitchenCtx.worktopBackOffsetMm)).toBe(true);
    S.kitchenGroups[0].instanceIds.push(inst.id); return inst;
  };
  const change = (patch:Partial<KitchenContext>) => {
    const prev = structuredClone(S.kitchenCtx); S.kitchenCtx=resolveContext({...prev,...patch}); S.kitchenGroups[0].ctx=structuredClone(S.kitchenCtx);
    expect(placement.rebuildKitchenGroupLayout('k',S.kitchenCtx,prev)).toBe(true);
  };
  const anchor = (inst:LayoutInstance) => {inst.root.updateMatrixWorld(true);return placement.getModuleWorldKitchenAnchor(inst).clone();};
  const expectedAnchor = (along=1.2) => dir.clone().multiplyScalar(along).addScaledVector(normal,S.kitchenCtx.worktopBackOffsetMm/1000);
  const check = (inst:LayoutInstance,along=1.2) => {
    expect(anchor(inst).distanceTo(expectedAnchor(along))*1000).toBeLessThan(.01);
    // 270° and -90° represent the same physical orientation.
    expect(Math.sin(inst.root.rotation.y)).toBeCloseTo(Math.sin(radians),7);
    expect(Math.cos(inst.root.rotation.y)).toBeCloseTo(Math.cos(radians),7);
  };
  const helpers = {
    layoutRoot,createInstance:create,setSelectedWall:vi.fn(),setSelectedModule:vi.fn(),updateSelectionHighlights:vi.fn(),disposeObject3D:vi.fn(),
    createWallMesh:vi.fn(),createWallOutline:vi.fn(),rebuildWall:vi.fn(),rebuildWallPlanMesh:vi.fn(),clearToolHud:vi.fn(),mountProps:vi.fn(),updateLayoutPanel:vi.fn(),
    restoreWorktops:(tops:NonNullable<LayoutSnapshot['worktops']>)=>S.kitchenWorktops.splice(0,S.kitchenWorktops.length,...tops.map(t=>({...makeWorktop(structuredClone(t.params)),id:t.id,kitchenGroupId:t.kitchenGroupId}))),
    // New restoration seam; old history ignores it, exposing the actual missing reconciliation.
    restoreKitchenModulePlacements:()=> (placement as unknown as {restoreKitchenModulePlacements:()=>void}).restoreKitchenModulePlacements()
  } as HistoryHelpers;
  const restore = (snap=captureLayoutSnapshot(S))=>{restoreLayoutSnapshot(S,helpers,JSON.parse(JSON.stringify(snap)));return S.instances[0];};
  return {S,placement,rebuilder,rebuildContext,create,add,change,anchor,check,restore,setup};
}

describe('kitchen module world-position contract',()=>{
  it('a rejected parameter edit keeps stored parameters and visible geometry in agreement',()=>{
    const f=fixture();const inst=f.add();const previousParams=structuredClone(inst.params);const previousModule=inst.module;
    inst.params={...inst.params,width:1};f.rebuildContext.validateModule=()=>['Width too small'];
    expect(f.rebuilder.rebuildInstance(inst,{previousParams,preserveBackAnchor:true})).toBe(false);
    expect(inst.params).toEqual(previousParams);expect(inst.module).toBe(previousModule);f.check(inst);
  });
  it.each([0,90,180,270,37])('preserves real FWM geometry after depth 580 → 710 → JSON restore at %s°',angle=>{
    const f=fixture(angle);const inst=f.add();f.change({worktopDepthMm:750});f.check(inst);
    const before=new THREE.Box3().setFromObject(inst.module);const restored=f.restore();f.check(restored);
    const after=new THREE.Box3().setFromObject(restored.module);
    expect(after.min.distanceTo(before.min)*1000).toBeLessThan(.01);expect(after.max.distanceTo(before.max)*1000).toBeLessThan(.01);
  });
  it.each([0,90,180,270,37])('keeps placement through repeated rebuilds, view switches and later insertion at %s°',angle=>{
    const f=fixture(angle);let inst=f.add();
    for(const depth of [750,680,800,620,750]){
      f.change({worktopDepthMm:depth});f.check(inst);
      for(const view of ['3d','2d'] as const){f.S.viewMode=view;f.setup(inst);f.check(inst);}
      const previousParams=structuredClone(inst.params);inst.params={...inst.params,opened:true,width:650} as ModuleParams;
      expect(f.rebuilder.rebuildInstance(inst,{preserveBackAnchor:true,previousParams,skipLayoutValidation:true})).toBe(true);f.check(inst);
      inst=f.restore();f.check(inst);
    }
    const later=f.add(2.1);f.check(later,2.1);f.check(inst);
    expect(later.params.depth).toBe(inst.params.depth);
  });
  it('repairs the legacy centered-root 65 mm drift using the saved binding',()=>{
    const f=fixture();const inst=f.add();const savedRoot=inst.root.position.clone();
    f.change({worktopDepthMm:750});const snap=captureLayoutSnapshot(f.S);
    // Old rebuild changed module.position +65 mm but serialized the previous root.
    snap.instances[0].positionMm={x:savedRoot.x*1000,y:0,z:savedRoot.z*1000};
    f.check(f.restore(snap));
  });
  it('serializes the visible geometry placement even without kitchen binding reconciliation',()=>{
    const f=fixture(37);const inst=f.add();f.change({worktopDepthMm:750});
    const saved=captureLayoutSnapshot(f.S).instances[0];
    const copy=f.create(saved.params);copy.root.position.set(saved.positionMm.x/1000,0,saved.positionMm.z/1000);
    copy.root.rotation.y=saved.rotationYDeg*Math.PI/180;copy.root.updateMatrixWorld(true);
    expect(f.anchor(copy).distanceTo(f.anchor(inst))*1000).toBeLessThan(.01);
  });
  it('material-only rebuild after resizing cannot discard a hidden geometry translation',()=>{
    const f=fixture(37);const inst=f.add();f.change({worktopDepthMm:750});const before=f.anchor(inst);
    expect(f.rebuilder.rebuildInstance(inst)).toBe(true);
    expect(f.anchor(inst).distanceTo(before)*1000).toBeLessThan(.01);
  });
  it.each([0,90,180,270,37])('explicit move keeps the new binding through later changes and restore at %s°',angle=>{
    const f=fixture(angle);const inst=f.add();
    expect(f.placement.applyKitchenPlacementBinding(inst,{worktopId:'w',segmentIndex:0,offsetAlongM:2.123456},20)).toBe(true);
    f.check(inst,2.123456);f.change({worktopDepthMm:750});f.check(inst,2.123456);f.check(f.restore(),2.123456);
  });
  it.each(['free','missing-worktop','other-kitchen'] as const)('does not snap a %s module on restore',kind=>{
    const f=fixture();const inst=f.add();inst.root.position.set(1.234567,0,.678912);inst.root.updateMatrixWorld(true);
    if(kind==='free')inst.kitchenPlacement=null;
    if(kind==='missing-worktop')inst.kitchenPlacement!.worktopId='missing';
    if(kind==='other-kitchen')f.S.kitchenWorktops[0].kitchenGroupId='another';
    const before=inst.root.position.clone();const after=f.restore();
    expect(after.root.position.distanceTo(before)*1000).toBeLessThan(.01);
  });
  it('restores kitchen context together with geometry for undo and redo',()=>{
    const f=fixture();f.add();const before=captureLayoutSnapshot(f.S);f.change({worktopBackOffsetMm:65,worktopDepthMm:750});
    const after=captureLayoutSnapshot(f.S);f.check(f.restore(before));expect(f.S.kitchenCtx.worktopBackOffsetMm).toBe(20);
    f.check(f.restore(after));expect(f.S.kitchenCtx.worktopBackOffsetMm).toBe(65);
  });
  it('failed resize preserves geometry, world anchor and binding',()=>{
    const f=fixture(37);const inst=f.add();const before=f.anchor(inst);const module=inst.module;const binding=structuredClone(inst.kitchenPlacement);
    const previousParams=structuredClone(inst.params);inst.params={...inst.params,depth:900} as ModuleParams;f.rebuildContext.instanceFitsLayoutBounds=()=>false;
    expect(f.rebuilder.rebuildInstance(inst,{preserveBackAnchor:true,previousParams})).toBe(false);
    expect(inst.module).toBe(module);expect(inst.params).toEqual(previousParams);expect(inst.kitchenPlacement).toEqual(binding);
    expect(f.anchor(inst).distanceTo(before)*1000).toBeLessThan(.01);
  });
});
