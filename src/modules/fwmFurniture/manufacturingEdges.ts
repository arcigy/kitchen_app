import { Mesh } from "three";
import { BODY_EDGE_GROUP, FRONT_EDGE_GROUP, contourEdgeEntities, type EdgeEntity } from "../../core/edge-banding/edgeEntities";
import type { PanelMeasurement } from "./panelMeasurement";
import type { FwmFurnitureParams } from "./types";

/** Physical edge entities consumed by both the preview and manufacturing BOM. */
export function manufacturingEdges(mesh: Mesh, role: string, panel: PanelMeasurement, params: FwmFurnitureParams): EdgeEntity[] {
  const edges = contourEdgeEntities(mesh.name, panel.boundary);
  const name = String(mesh.userData.boardName ?? mesh.name).toLowerCase();
  const material = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
  if (material?.userData.materialRole === "glass") return [];
  const points = edges.flatMap(e => [e.start,e.end]);
  const min = (axis: "x"|"y"|"z") => Math.min(...points.map(p=>p[axis]));
  const max = (axis: "x"|"y"|"z") => Math.max(...points.map(p=>p[axis]));
  const same = (a:number,b:number) => Math.abs(a-b)<.01;
  const at = (e:EdgeEntity,axis:"x"|"y"|"z",value:number) => same(e.start[axis],value)&&same(e.end[axis],value);
  const vertical = (e:EdgeEntity) => Math.abs(e.start.y-e.end.y) > .01;
  const selected = (e: EdgeEntity): boolean => {
    if (role === "back" || role === "drawer_bottom") return false;
    if (role === "front") return true;
    if (role === "plinth") return vertical(e) || at(e,"y",max("y"));
    if (mesh.userData.primitiveId && !mesh.userData.edgeBanding?.length) return false;
    if (/drawer_(left_side|right_side|back|front_inner)/.test(name)) return at(e,"y",max("y"));
    if (/top_back_rail|back_rail|support_back|back_corner/.test(name)) return false;
    if (name === "wall_open_end_rear_board") return at(e,"y",max("y"));
    if (/side|ending_panel|front_right_panel/.test(name) && !/shelf/.test(name)) return e.id === edges.filter(vertical).sort((a,b) => (b.start.z+b.end.z)-(a.start.z+a.end.z) || (b.start.x+b.end.x)-(a.start.x+a.end.x))[0]?.id;
    if ((mesh.userData.revitPlanProfileMm || mesh.userData.primitiveId) && /bottom|top|shelf/.test(name)) {
      if (params.type === "fwm_catalog_wall_open_end") return !at(e,"z",min("z")) && !at(e,"x",params.side === "left" ? max("x") : min("x"));
      if (params.type === "fwm_catalog_base_open_end" || params.type === "fwm_tall_open_end") return at(e,"z",max("z"));
      if (String(params.variant).includes("chamfered")) return Math.abs(e.start.x-e.end.x) > e.lengthMm*.1 && Math.abs(e.start.z-e.end.z)>e.lengthMm*.1
        && ((e.start.z+e.end.z)/2-min("z"))/(max("z")-min("z")) > ((e.start.x+e.end.x)/2-min("x"))/(max("x")-min("x"));
      return !at(e,"z",min("z")) && !at(e,"x",min("x")) && !at(e,"z",max("z")) && !at(e,"x",max("x"));
    }
    return same(min("y"),max("y")) ? at(e,"z",max("z")) : at(e,"y",max("y"));
  };
  return edges.map(e=>({...e,defaultGroupId:selected(e) ? role === "front" ? FRONT_EDGE_GROUP : BODY_EDGE_GROUP : null}));
}
