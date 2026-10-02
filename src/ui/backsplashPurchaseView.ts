import type { ProjectMaterialScope } from "../core/project-materials/project-material-types";
const escape=(value:string)=>value.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
export function renderBacksplashPurchases(scopes:readonly ProjectMaterialScope[]):string{
  const rows=scopes.flatMap(scope=>scope.items).filter(item=>item.backsplashPurchase);
  const groups=[...new Map(rows.map(item=>[item.backsplashPurchase!.groupId,item.backsplashPurchase!])).values()];
  return groups.map(group=>`<section data-backsplash-purchase="true"><h3>${escape(group.materialLabel)}</h3><p>Čistá plocha ${group.netAreaM2.toFixed(3)} m² · nákup ${group.purchasedPieces} dosiek · ${group.purchasedAreaM2.toFixed(3)} m²</p><p>Formát ${group.stockLengthMm} × ${group.stockWidthMm} mm · ${group.cost===null?"Cena nezadaná":`${group.cost.toFixed(2)} ${escape(group.currency)}`}</p>${group.error?`<p role="alert">${escape(group.error)} Cena je neúplná.</p>`:""}
    <details><summary>Výrobné dielce a rezný rozpis</summary>${rows.filter(item=>item.backsplashPurchase!.groupId===group.groupId).map(item=>`<p>${escape(item.label)} · ${escape(item.description)}</p>`).join("")}
    ${group.sheets.map(sheet=>`<figure><figcaption>${sheet.fraction===.5?"Polovičná doska":"Celá doska"} · ${sheet.lengthMm} × ${sheet.widthMm} mm</figcaption><svg role="img" aria-label="Rozloženie dielcov" viewBox="0 0 ${sheet.lengthMm} ${sheet.widthMm}" style="width:100%;max-height:180px;background:#eceff2">${sheet.placements.map((part,i)=>`<rect x="${part.xMm}" y="${part.yMm}" width="${part.lengthMm}" height="${part.widthMm}" fill="${i%2?"#b9d4c9":"#91bbae"}" stroke="#304e45" stroke-width="3"><title>${escape(rows.find(row=>row.id===part.partId)?.label??part.partId)} · ${part.lengthMm} × ${part.widthMm} mm${part.rotated?" · otočený":""}</title></rect>`).join("")}</svg></figure>`).join("")}</details></section>`).join("");
}

export function renderWorktopPurchases(scopes: readonly ProjectMaterialScope[]): string {
  return scopes.flatMap(scope => scope.items).filter(item => item.worktopPurchase).map(item => {
    const purchase = item.worktopPurchase!;
    return `<section data-worktop-purchase><h3>${escape(purchase.materialLabel)}</h3><p>Čistá plocha dielca: ${purchase.netAreaM2.toFixed(3)} m² · účtovaná nákupná plocha: ${purchase.areaM2.toFixed(3)} m²</p><p>Nákup ${purchase.pieces} dosky z formátu ${purchase.stockLengthMm} × ${purchase.stockWidthMm} mm · ${purchase.cost === null ? "Cena nezadaná" : `${purchase.cost.toFixed(2)} ${escape(purchase.currency)}`}</p><small>Cena za m² sa násobí nákupnou plochou celých alebo polovičných dosiek. Prerez sa už nepridáva.</small>${purchase.error ? `<p role="alert">${escape(purchase.error)} Cena je neúplná.</p>` : ""}</section>`;
  }).join("");
}
