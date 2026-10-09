import { isDeepStrictEqual } from 'node:util';
import { chromium } from 'playwright';
import { mkdir,writeFile } from 'node:fs/promises';
import { installAuthSession } from './uiAuthSession.mjs';
const baseUrl=process.env.KITCHEN_UI_BASE_URL;
if(!baseUrl||!['localhost','127.0.0.1'].includes(new URL(baseUrl).hostname))throw new Error('Requires isolated localhost runtime');
if((await (await fetch(new URL('/ready',baseUrl))).json()).storage!=='file')throw new Error('Requires disposable file storage');
const output='.tmp/feedback-42-49-ui';await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true}),page=await browser.newPage({viewport:{width:1600,height:1000}}),errors=[],checks=[];
page.on('pageerror',error=>errors.push(String(error)));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
const assert=(ok,message)=>{if(!ok)throw new Error(message);checks.push(message);};
const snapshot=()=>page.evaluate(()=>window.__kitchenDebug.layoutSnapshot());
let projectId;
try{
 await installAuthSession(page,{autoStartWorkspace:false});await page.goto(baseUrl,{waitUntil:'domcontentloaded'});
 await page.waitForSelector('[data-project-manager-form]',{state:'attached'});if(!await page.locator('[data-project-manager-form]').isVisible())await page.locator('[data-project-manager-new]').click();
 await page.locator('input[name="name"]').fill(`QA Feedback 42–49 ${Date.now()}`);await page.locator('input[name="address"]').fill('QA');await page.locator('input[name="contactName"]').fill('QA');await page.locator('[data-project-manager-form] button[type="submit"]').click();await page.waitForFunction(()=>!!window.__kitchenDebug);
 // The backsplash fixture picks the 3D surface on the axis of a centered wall.
 // Keep its geometry explicit when the drawing default changes to interior.
 await page.getByRole('button',{name:/^(Stena|Wall)$/}).click();
 await page.locator('select').filter({has:page.locator('option[value="interior"]')}).selectOption('center');
 await page.keyboard.press('Escape');
 const fixture=await page.evaluate(()=>{const api=window.__kitchenDebug;const f=api.createKitchenScenario({path:[{x:0,z:0},{x:2400,z:0}],moduleType:'fwm_catalog_base_doors',offsetAlongMm:300});api.addKitchenModule(f.group.id,{type:'fwm_catalog_base_doors',offsetAlongMm:1500});api.createWall({aMm:{x:0,z:-50},bMm:{x:2600,z:-50},thicknessMm:100});api.selectKitchenGroup(f.group.id);return f;});
 // Production toolbar, preview and confirmation; fixture setup never creates a backsplash directly.
 await page.getByRole('button',{name:/^(Upraviť kuchyňu|Edit kitchen)$/}).click();
 const dialog=page.getByRole('dialog',{name:'Návrh zásteny'});
 await page.getByRole('button',{name:'Zástena · Vybrať stenu',exact:true}).click();
 const wallPoint=await page.evaluate(()=>window.__kitchenDebug.projectPlanPoint({x:1300,z:-50,y:1300}));await page.mouse.click(wallPoint.x,wallPoint.y);await dialog.waitFor();
 assert((await dialog.textContent()).includes('dielcov'),'Clicking a wall opens its backsplash preview');
 await dialog.getByRole('button',{name:'Zrušiť',exact:true}).click();assert(!(await snapshot()).customFurniture.some(f=>f.params.groupKind==='backsplash'),'Cancelling wall preview leaves the project unchanged');
 await page.getByRole('button',{name:'Zástena · Celá kuchyňa',exact:true}).click();
 await dialog.waitFor();
 assert((await dialog.textContent()).includes('dielcov'),'Automatic preview contains supported wall coverage');
 await dialog.getByLabel('Materiál zásteny',{exact:true}).selectOption({index:1});
 await dialog.getByLabel('Nákupná dĺžka (mm; 0 = materiál)',{exact:true}).fill('2800');await dialog.getByLabel('Nákupná šírka (mm; 0 = materiál)',{exact:true}).fill('1300');
 await dialog.getByRole('button',{name:'Potvrdiť zástenu',exact:true}).click();
 let layout=await snapshot();let backsplash=layout.customFurniture.find(f=>f.params.groupKind==='backsplash');assert(backsplash?.params.boards.length>0,'Confirmation creates an editable backsplash group');
 await page.screenshot({path:`${output}/backsplash.png`});
 const save=async()=>{const waiting=page.waitForResponse(r=>r.url().endsWith('/save')&&r.request().method()==='POST');await page.locator('button[data-quick-action="save"]').click();const response=await waiting;if(!response.ok())throw new Error(await response.text());const body=await response.json();projectId=body.save.projectId;return body.save;};
 await page.getByRole('button',{name:'Close Custom Furniture Editor',exact:true}).click();
 await page.locator('button[data-quick-action="undo"]').click();assert(!(await snapshot()).customFurniture.some(f=>f.params.groupKind==='backsplash'),'Undo removes the inserted backsplash group');
 await page.locator('button[data-quick-action="redo"]').click();assert((await snapshot()).customFurniture.filter(f=>f.params.groupKind==='backsplash').length===1,'Redo restores the group and source bindings');
 await page.evaluate(id=>window.__kitchenDebug.selectKitchenGroup(id),fixture.group.id);
 await page.getByRole('button',{name:'Zástena · Celá kuchyňa',exact:true}).click();await dialog.getByRole('button',{name:'Potvrdiť zástenu',exact:true}).click();
 layout=await snapshot();assert(layout.customFurniture.filter(f=>f.params.groupKind==='backsplash').length===1,'Repeated insertion updates the existing group without duplicates');
 await page.getByRole('button',{name:'Close Custom Furniture Editor',exact:true}).click();
 await page.evaluate(id=>window.__kitchenDebug.selectKitchenGroup(id),fixture.group.id);
 await page.getByRole('button',{name:/^(Upraviť kuchyňu|Edit kitchen)$/}).click();
 await page.evaluate(id=>window.__kitchenDebug.selectModule(id),fixture.instances[0].id);
 const hardware=page.locator('[data-module-hardware-controls]');await hardware.waitFor();
 await hardware.getByLabel('Počet nôh celkom',{exact:true}).fill('5');await hardware.getByLabel('Počet nôh celkom',{exact:true}).press('Tab');
 await hardware.getByLabel('Z toho predné',{exact:true}).fill('3');await hardware.getByLabel('Z toho predné',{exact:true}).press('Tab');
 assert((await snapshot()).instances.find(i=>i.id===fixture.instances[0].id).params.legCountFront===3,'Properties commit five legs with three front clips');
 await hardware.getByLabel('Z toho predné',{exact:true}).fill('2');await hardware.getByLabel('Z toho predné',{exact:true}).press('Tab');
 assert((await snapshot()).instances.find(i=>i.id===fixture.instances[0].id).params.legCountFront===2,'Properties redistribute five legs with two front clips');
 layout=await snapshot();const saved=await save();assert(JSON.stringify(saved.appState.layout.snapshot.customFurniture)===JSON.stringify(layout.customFurniture),'Save retains board geometry and automatic source data');
 const priceResponse=await page.request.get(new URL(`/api/projects/${projectId}/margins`,baseUrl).toString());assert(priceResponse.ok(),'Server calculates margins with backsplash sources');
 const materialResponse=await page.request.get(new URL(`/api/projects/${projectId}/materials`,baseUrl).toString());assert(materialResponse.ok(),'Server returns material scopes');const materials=await materialResponse.json();
 const scope=materials.view.scopes.find(s=>s.id===`module:${fixture.instances[0].id}`);
 assert(scope.items.find(i=>i.category==='leg').quantity===5 && scope.items.find(i=>i.category==='plinth_clip').quantity===4 && scope.items.find(i=>i.category==='plinth_clip').label.includes('predné 2, bočné 2, spolu 4'),'Server BOM matches five legs, two front clips and two actual side clips');
 await page.locator('[data-workspace-nav="materials"]').click();await page.locator('[data-backsplash-purchase]').waitFor();assert((await page.locator('[data-backsplash-purchase]').innerText()).includes('2800 × 1300'),'Materials show the actual stock format');
 await page.getByRole('button',{name:'Pridať komponent projektu',exact:true}).click();const component=page.locator('dialog.project-component-dialog');await component.getByLabel('Názov položky',{exact:true}).fill('Náhradné diely QA');await component.getByLabel('Jednotka',{exact:true}).selectOption('set');await component.getByLabel('Vlastné množstvo',{exact:true}).fill('3');await component.getByLabel(/Vlastná jednotková nákupná cena/).fill('10');await component.getByRole('button',{name:'Uložiť',exact:true}).click();await component.waitFor({state:'detached'});assert((await page.locator('section[aria-label="Samostatné komponenty"]').innerText()).includes('Náhradné diely QA'),'Project extra is editable and saved through the Materials API');
 const currentMaterials=(await (await page.request.get(new URL(`/api/projects/${projectId}/materials`,baseUrl).toString())).json()).view;
 const extra=currentMaterials.assignments.assignments.find(a=>a.extraComponent?.label==='Náhradné diely QA');assert(extra?.projectValues.quantity===3 && extra.projectValues.unit==='set' && extra.projectValues.unitPrice===10,'Project quantity, unit and price persist independently of the catalog');
 const endpoint=new URL(`/api/projects/${projectId}/materials`,baseUrl).toString();
 const stale=await page.request.put(endpoint,{data:{revision:currentMaterials.assignments.revision-1,operation:{type:'set_component_values',assignmentId:extra.assignmentId,values:{quantity:99}}}});assert(stale.status()===409,'Stale component edits are rejected by revision control');
 const invalid=await page.request.put(endpoint,{data:{revision:currentMaterials.assignments.revision,operation:{type:'set_component_values',target:{scopeId:`module:${fixture.instances[0].id}`,itemId:scope.items.find(i=>i.category==='leg').id,category:'leg'},values:{quantity:99}}}});const invalidBody=await invalid.json();assert(invalid.status()===422&&invalidBody.error==='Počet nôh a klipov upravte vo vlastnostiach modulu.',`API cannot detach leg quantities from physical module properties (${invalid.status()}: ${invalidBody.error})`);
 const unchanged=(await (await page.request.get(endpoint)).json()).view.assignments;assert(isDeepStrictEqual(unchanged,currentMaterials.assignments),'Rejected edits leave project assignments and revision unchanged');
 await page.screenshot({path:`${output}/materials.png`});await writeFile(`${output}/materials-shape.json`,JSON.stringify({keys:Object.keys(materials)},null,2));
 const download=await page.request.get(new URL(`/api/projects/${projectId}/download`,baseUrl).toString());assert(download.ok(),'FQP download succeeds');const envelope=await download.text();const imported=await page.request.post(new URL('/api/projects/import',baseUrl).toString(),{data:{envelope}});if(!imported.ok())throw new Error(await imported.text());const restored=(await imported.json()).save;assert(isDeepStrictEqual(restored.appState.layout.snapshot.customFurniture,saved.appState.layout.snapshot.customFurniture),'Encrypted FQP restores backsplash fields exactly');
 assert(restored.appState.materialAssignments.assignments.some(a=>a.extraComponent?.label==='Náhradné diely QA'&&a.projectValues.quantity===3&&a.projectValues.unit==='set'),'FQP retains component quantities and units');
 await page.locator('[data-workspace-nav="design"]').click();await page.evaluate(id=>window.__kitchenDebug.selectModule(id),fixture.instances[0].id);
 if(await page.getByRole('button',{name:/^(Upraviť kuchyňu|Edit kitchen)$/}).isVisible()){await page.getByRole('button',{name:/^(Upraviť kuchyňu|Edit kitchen)$/}).click();await page.evaluate(id=>window.__kitchenDebug.selectModule(id),fixture.instances[0].id);}
 const recoveryEditStarted=Date.now();await hardware.getByLabel('Z toho predné',{exact:true}).fill('3');await hardware.getByLabel('Z toho predné',{exact:true}).press('Tab');
 await page.waitForFunction(async({projectId,id,after})=>{
   const records=await new Promise(resolve=>{const request=indexedDB.open('arcigy-kitchen-project-recovery',2);request.onsuccess=()=>{const db=request.result;const query=db.transaction('active-drafts','readonly').objectStore('active-drafts').getAll();query.onsuccess=()=>{resolve(query.result);db.close();};query.onerror=()=>{resolve([]);db.close();};};request.onerror=()=>resolve([]);});
   const pointer=JSON.parse(localStorage.getItem('arcigy.kitchen.lastWorkspace.v1')??'null');
   return records.some(record=>{const draft=record.envelope??record;return Date.parse(draft.updatedAt)>=after&&draft.scope?.workspaceId===pointer?.workspaceId&&draft.scope?.projectId===projectId&&draft.appState?.layout?.snapshot?.instances?.find(i=>i.id===id)?.params.legCountFront===3&&draft.appState.layout.snapshot.customFurniture?.some(f=>f.params.groupKind==='backsplash');});
 },{projectId,id:fixture.instances[0].id,after:recoveryEditStarted},{timeout:15000});
 const readRecovery=()=>page.evaluate(()=>new Promise(resolve=>{const request=indexedDB.open('arcigy-kitchen-project-recovery',2);request.onsuccess=()=>{const db=request.result;const query=db.transaction('active-drafts','readonly').objectStore('active-drafts').getAll();query.onsuccess=()=>{resolve({records:query.result,pointer:localStorage.getItem('arcigy.kitchen.lastWorkspace.v1')});db.close();};};}));
 await writeFile(`${output}/recovery-before.json`,JSON.stringify({recovery:await readRecovery(),server:await (await page.request.get(new URL(`/api/projects/${projectId}/load`,baseUrl).toString())).json()},null,2));
 await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>!!window.__kitchenDebug&&!document.querySelector('.viewer-startup'));
 await page.waitForFunction(id=>window.__kitchenDebug.layoutSnapshot().instances.find(i=>i.id===id)?.params.legCountFront===3,fixture.instances[0].id,{timeout:15000});
 await writeFile(`${output}/recovery-after.json`,JSON.stringify(await readRecovery(),null,2));
 const recovered=await snapshot();await writeFile(`${output}/recovered-layout.json`,JSON.stringify(recovered,null,2));assert(recovered.instances.find(i=>i.id===fixture.instances[0].id).params.legCountFront===3&&recovered.customFurniture.some(f=>f.params.groupKind==='backsplash'),'Draft recovery restores unsaved leg configuration together with backsplash geometry');
 assert(errors.length===0,`No browser errors: ${errors.join('; ')}`);await writeFile(`${output}/results.json`,JSON.stringify({checks,errors,projectId},null,2));console.log(JSON.stringify({checks,errors,projectId},null,2));
}catch(error){await page.screenshot({path:`${output}/failure.png`}).catch(()=>{});await writeFile(`${output}/failure.txt`,String(error.stack)+'\n'+(await page.locator('body').innerText()).slice(0,18000)+'\nErrors: '+JSON.stringify(errors));throw error;}
finally{await browser.close();}
