import type { ClientCatalog } from "../core/catalog/catalog-types";
import type { ProjectMaterialAssignmentsState } from "../core/project-materials/project-material-types";
import type { EdgeGroupChange } from "../core/edge-banding/edgeGroupTransaction";
/** New material choices use tenant catalog prices. An existing project snapshot
 * remains authoritative for renames and shared groups after catalog removal. */
export function authorizeEdgeGroupChanges(changes: EdgeGroupChange[], stored: ProjectMaterialAssignmentsState, catalog: ClientCatalog): EdgeGroupChange[] {
  return changes.map(change => {
    if (!change.after) return change;
    const after=structuredClone(change.after);
    if (!after.materialId) { after.snapshots={}; return {...change,after}; }
    const compatible=stored.assignments.filter(a=>a.materialId===after.materialId && (a.category==="edge_front"||a.category==="edge_other"));
    const existing=(compatible.find(a=>a.assignmentId===after.assignmentId)??compatible[0])?.snapshots.material;
    if (existing) after.snapshots={material:structuredClone(existing)};
    else {
      const material=catalog.materials.find(m=>m.id===after.materialId&&m.isActive&&m.materialType==="edge"&&m.pricingUnit==="lm");
      if (!material) throw new Error("Zvolený materiál olepenia nie je dostupný v katalógu projektu.");
      const price=catalog.priceList.prices[material.id];
      after.snapshots={material:{definition:structuredClone(material),unitPrice:typeof price==="number"&&Number.isFinite(price)&&price>=0?price:null,currency:catalog.priceList.currency,priceListId:catalog.priceList.id,capturedAt:after.snapshots.material?.capturedAt??after.updatedAt}};
    }
    return {...change,after};
  });
}
