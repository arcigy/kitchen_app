import { ASSISTANT_TOOL_DEFINITIONS } from "./toolRegistry";

export type AssistantEvaluationScenario = {
  id: string;
  prompt: string;
  expectedToolIds: string[];
  requiresConfirmation: boolean;
  turns: number;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
};

const workflows = [
  { name: "kuchyňa a cena", tools: ["context.getScene", "catalog.searchModules", "catalog.searchMaterials", "kitchen.validateCreate", "kitchen.create", "kitchen.getSummary", "pricing.getSummary", "validation.inspectProject"], write: true },
  { name: "moduly a pohľad", tools: ["context.queryObjects", "module.getParameterSchema", "module.patchSelectedParams", "context.getObject", "view.focusObjects", "validation.inspectProject"], write: true },
  { name: "steny a otvory", tools: ["context.getScene", "wall.create", "opening.createDoor", "opening.createWindow", "context.queryObjects", "validation.inspectProject"], write: true },
  { name: "nábytok", tools: ["customFurniture.create", "context.getScene", "customFurniture.patchBoard", "wardrobe.create", "wardrobe.addPart", "validation.inspectProject"], write: true },
  { name: "kontrola a export", tools: ["context.getSelection", "pricing.getSummary", "validation.inspectProject", "export.marketingPdf", "export.pricingWorkbook"], write: true },
  { name: "CAD oprava", tools: ["context.queryObjects", "editor.alignLines", "editor.trimWallsToCorner", "measure.createDistance", "validation.inspectProject"], write: true },
  { name: "materiály", tools: ["context.queryObjects", "catalog.searchMaterials", "kitchen.applyMaterial", "kitchen.getSummary", "pricing.getSummary", "validation.inspectProject"], write: true },
  { name: "verzia projektu", tools: ["project.getMetadata", "context.getScene", "project.save", "project.getMetadata", "validation.inspectProject"], write: true }
] as const;

const variants = [
  "v aktuálnom projekte", "pri zachovaní rozmerov", "s kontrolou kolízií", "pre aktívny tenant katalóg",
  "s presným BOM", "bez zmeny neoznačených objektov", "po krokoch s overením", "a vysvetli výsledok klientovi",
  "s aktuálnymi materiálmi", "v 2D aj 3D kontexte", "s reverzibilným postupom", "s bezpečným potvrdením",
  "a uveď, čo sa nepodarilo", "bez odhadu z dokumentácie"
] as const;

const registeredToolIds = ASSISTANT_TOOL_DEFINITIONS.map((tool) => tool.id);

export const ASSISTANT_EVALUATION_SCENARIOS: AssistantEvaluationScenario[] = workflows.flatMap((workflow, workflowIndex) =>
  variants.map((variant, variantIndex) => {
    const scenarioIndex = workflowIndex * variants.length + variantIndex;
    const coverageTools = [
      registeredToolIds[scenarioIndex % registeredToolIds.length],
      registeredToolIds[(scenarioIndex + 29) % registeredToolIds.length]
    ].filter((toolId) => !(workflow.tools as readonly string[]).includes(toolId));
    const expectedToolIds = [...workflow.tools, ...coverageTools].slice(0, 10);
    const hasWrite = expectedToolIds.some((toolId) => {
      const tool = ASSISTANT_TOOL_DEFINITIONS.find((candidate) => candidate.id === toolId);
      return (tool?.operation ?? (tool?.readOnly ? "read" : "write")) === "write";
    });
    return ({
    id: `eval_${String(workflowIndex + 1).padStart(2, "0")}_${String(variantIndex + 1).padStart(2, "0")}`,
    prompt: `Komplexne priprav ${workflow.name} ${variant}. Najprv prečítaj potrebný live stav, potom navrhni a over každý krok.`,
    expectedToolIds,
    requiresConfirmation: workflow.write || hasWrite,
    turns: 3 + (variantIndex % 3),
    estimatedInputTokens: 1800 + workflow.tools.length * 240 + variantIndex * 35,
    estimatedOutputTokens: 420 + expectedToolIds.length * 70
    });
  })
);

export type AssistantEvaluationReport = {
  scenarioCount: number;
  toolCoverage: string[];
  uncoveredTools: string[];
  unsafeScenarios: string[];
  estimatedUsd: number;
};

/** Uses current GPT-5.4 nano list prices: $0.20/M input and $1.25/M output. */
export function evaluateAssistantSuite(scenarios = ASSISTANT_EVALUATION_SCENARIOS): AssistantEvaluationReport {
  const toolIds = new Set(ASSISTANT_TOOL_DEFINITIONS.map((tool) => tool.id));
  const coverage = new Set(scenarios.flatMap((scenario) => scenario.expectedToolIds));
  const unsafeScenarios = scenarios.filter((scenario) =>
    scenario.expectedToolIds.some((toolId) => {
      const tool = ASSISTANT_TOOL_DEFINITIONS.find((candidate) => candidate.id === toolId);
      return !!tool && (tool.operation ?? (tool.readOnly ? "read" : "write")) === "write" && !scenario.requiresConfirmation;
    })
  ).map((scenario) => scenario.id);
  const estimatedUsd = scenarios.reduce((total, scenario) => total +
    scenario.estimatedInputTokens / 1_000_000 * 0.20 + scenario.estimatedOutputTokens / 1_000_000 * 1.25, 0);
  return {
    scenarioCount: scenarios.length,
    toolCoverage: [...coverage].sort(),
    uncoveredTools: [...toolIds].filter((toolId) => !coverage.has(toolId)).sort(),
    unsafeScenarios,
    estimatedUsd
  };
}
