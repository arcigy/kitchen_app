import { validateSnapshot } from "../project-materials/project-material-validation";
const object=(value:unknown):value is Record<string,unknown>=>!!value&&typeof value==="object"&&!Array.isArray(value);
const fail=()=>{throw new Error("Neplatné údaje zásteny alebo výrezov dosky.");};
const finite=(value:unknown,min=-1e7,max=1e7)=>typeof value==="number"&&Number.isFinite(value)&&value>=min&&value<=max;
const strings=(value:unknown)=>Array.isArray(value)&&value.length<=10000&&value.every(v=>typeof v==="string"&&v.length<=2000);
const fields=["profile","workplane","thicknessMm","materialId","cutouts","baseOffsetMm","topOffsetMm"];
function profile(value:unknown){if(!Array.isArray(value)||value.length<3||value.length>10000||!value.every(p=>object(p)&&finite(p.x)&&finite(p.y)))fail();}
function cutouts(value:unknown){if(value===undefined)return;if(!Array.isArray(value)||value.length>1000)fail();const ids=new Set<string>();for(const item of value as unknown[]){if(!object(item)||typeof item.id!=="string"||!item.id||ids.has(item.id))fail();const cut=item as Record<string,unknown>;ids.add(cut.id as string);profile(cut.profile);if(cut.sourceOpeningId!==undefined&&typeof cut.sourceOpeningId!=="string")fail();}}
/** Validate new fields without changing the legacy custom-board contract or rejecting orphaned source references. */
export function validateBacksplashFurniture(params:Record<string,unknown>){
  if(params.backsplash!==undefined){
    const source=params.backsplash;if(!object(source)||params.groupKind!=="backsplash")fail();const s=source as Record<string,unknown>;
    if(s.scope!==undefined&&s.scope!=="all"&&s.scope!=="walls")fail();
    for(const key of ["materialOverride","thicknessOverride","detached"])if(s[key]!==undefined&&typeof s[key]!=="boolean")fail();
    if(typeof s.kitchenId!=="string"||!s.kitchenId||typeof s.materialId!=="string"||!strings(s.wallIds)||!strings(s.suppressedKeys)||!strings(s.orphanedWallIds))fail();
    validateSnapshot(s.materialSnapshot,s.materialId as string,"material","backsplash.materialSnapshot");
    for(const key of ["thicknessMm","maxLengthMm"])if(!finite(s[key],1))fail();
    for(const key of ["offsetMm","kerfMm"])if(!finite(s[key],0))fail();
    for(const key of ["stockLengthMm","stockWidthMm"])if(s[key]!==undefined&&!finite(s[key],0))fail();
    if(typeof s.allowHalf!=="boolean"||!["length","width","free"].includes(String(s.grain))||!object(s.joints))fail();
    for(const values of Object.values(s.joints as Record<string,unknown>))if(!Array.isArray(values)||values.length>1000||!values.every(v=>finite(v,0)))fail();
  }
  for(const value of Array.isArray(params.boards)?params.boards:[]){
    if(!object(value))continue;cutouts(value.cutouts);
    if(value.backsplashSource!==undefined){
      const s=value.backsplashSource;if(!object(s)||!params.backsplash)fail();const source=s as Record<string,unknown>;
      validateSnapshot(source.materialSnapshot,value.materialId as string,"material","board.backsplashSource.materialSnapshot");
      if(![source.key,source.wallId,source.worktopId].every(v=>typeof v==="string"&&v.length>0)||!strings(source.overrides)||!(source.overrides as string[]).every(v=>fields.includes(v))||!object(source.automatic))fail();
      if(source.suppressedOpeningIds!==undefined&&!strings(source.suppressedOpeningIds))fail();
      const automatic=source.automatic as Record<string,unknown>;profile(automatic.profile);cutouts(automatic.cutouts);
      if(!finite(automatic.thicknessMm,1)||typeof automatic.materialId!=="string"||!finite(automatic.baseOffsetMm)||!finite(automatic.topOffsetMm))fail();
      const plane=automatic.workplane;if(!object(plane)||plane.type!=="vertical"||![plane.aMm,plane.bMm].every(p=>object(p)&&finite(p.x)&&finite(p.z)))fail();
    }
  }
}
