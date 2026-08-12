import type {
  AssistantCapabilityDiscovery,
  AssistantCapabilityPack,
  AssistantClientContext,
  AssistantOrchestratorToolMetadata
} from "./types";
import { ASSISTANT_COST_POLICY } from "./costPolicy";

const COMMON_TOOL_IDS = ["context.getSelection", "context.queryObjects", "context.getObject", "validation.inspectProject"] as const;

export const ASSISTANT_CAPABILITY_PACKS: AssistantCapabilityPack[] = [
  { id: "project-scene", title: "Project and scene", domains: ["project", "scene", "context", "validation", "view"], keywords: ["projekt", "project", "scena", "scene", "vyber", "selection", "pohlad", "view", "stena", "wall"], toolIds: ["context.getSelection", "context.getScene", "context.getCurrentView", "context.queryObjects", "context.getObject", "project.getMetadata", "project.listRelated", "project.inspectMaterialUsage", "validation.inspectProject", "project.save", "selection.set", "selection.setMany", "selection.clear", "view.focusObjects"], description: "Current project, scene, selection, view and validation operations." },
  { id: "editor-layout", title: "Layout editor", domains: ["editor", "wall", "floor", "column", "section", "opening", "history"], keywords: ["presun", "move", "otoc", "rotate", "duplik", "delete", "zmaz", "undo", "redo", "stena", "wall", "podlaha", "floor", "stlp", "column", "rez", "section", "dvere", "door", "okno", "window"], toolIds: ["editor.moveSelection", "editor.rotateSelection", "editor.duplicateSelection", "editor.deleteSelection", "history.undo", "history.redo", "wall.create", "opening.createDoor", "opening.createWindow", "opening.updateDoor", "opening.updateWindow", "opening.delete", "floor.create", "column.create", "section.create"], description: "Shared layout mutations and validated wall-hosted openings through the existing editor and history owners." },
  { id: "modules-catalog", title: "Modules and catalog", domains: ["module", "catalog", "vendorCatalog"], keywords: ["modul", "module", "skrinka", "cabinet", "material", "dekor", "kovanie", "preset", "zasuv", "drawer", "pino", "nobilia"], toolIds: ["catalog.listModules", "catalog.searchModules", "catalog.searchMaterials", "module.getParameterSchema", "module.listPresets", "module.applyPreset", "module.replace", "catalog.insertModule", "vendorCatalog.insertResolvedModule", "module.patchSelectedParams"], description: "Tenant catalog search and registered module mutations." },
  { id: "kitchen-pricing", title: "Kitchen and pricing", domains: ["kitchen", "pricing"], keywords: ["kuchyn", "kitchen", "pracovna doska", "worktop", "korpus", "front", "cena", "pricing", "bom", "kusovnik"], toolIds: ["kitchen.validateCreate", "kitchen.create", "kitchen.getSummary", "kitchen.updateParameters", "kitchen.applyMaterial", "pricing.getSummary"], description: "Semantic kitchen creation, kitchen changes and BOM-backed pricing." }
];

function normalize(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/gu, "").toLowerCase();
}

function scorePack(message: string, context: AssistantClientContext, pack: AssistantCapabilityPack): number {
  const normalized = normalize(message);
  const keywordScore = pack.keywords.reduce((score, keyword) => score + (normalized.includes(normalize(keyword)) ? 1 : 0), 0);
  return keywordScore +
    (context.selectedInstanceIds.length > 0 && pack.id === "modules-catalog" ? 1 : 0) +
    (context.activeKitchenGroupId && pack.id === "kitchen-pricing" ? 1 : 0) +
    (context.selectedWallIds.length > 0 && pack.id === "editor-layout" ? 1 : 0);
}

export function discoverAssistantCapabilities(args: { message: string; clientContext: AssistantClientContext; availableTools: readonly AssistantOrchestratorToolMetadata[] }): AssistantCapabilityDiscovery {
  const availableToolIds = new Set(args.availableTools.map((tool) => tool.id));
  const scored = ASSISTANT_CAPABILITY_PACKS.map((pack) => ({ pack, score: scorePack(args.message, args.clientContext, pack) })).filter((item) => item.score > 0).sort((a, b) => b.score - a.score || a.pack.id.localeCompare(b.pack.id));
  const selectedPacks = (scored.length > 0 ? scored.slice(0, ASSISTANT_COST_POLICY.maxCapabilityPacksPerTurn).map((item) => item.pack) : ASSISTANT_CAPABILITY_PACKS).filter((pack) => pack.toolIds.some((id) => availableToolIds.has(id)));
  const toolIds = new Set<string>(COMMON_TOOL_IDS.filter((id) => availableToolIds.has(id)));
  for (const pack of selectedPacks) for (const toolId of pack.toolIds) if (availableToolIds.has(toolId)) toolIds.add(toolId);
  return { packIds: selectedPacks.map((pack) => pack.id), toolIds: [...toolIds], fallbackToFullRegistry: scored.length === 0, rationale: scored.length === 0 ? "No domain match; the complete registered capability set remains available." : "Selected the smallest matching capability packs plus required live-context verification tools." };
}
