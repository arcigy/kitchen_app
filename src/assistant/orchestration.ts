import type {
  AssistantClientContext,
  AssistantPlan,
  AssistantRagChunk,
  AssistantTaskClassification,
  AssistantToolCall,
  AssistantToolResult,
  AssistantValidationReport,
  AssistantWorkflowState,
  AssistantWorkflowStep
} from "./types";
import { assistantToolMetadataForOrchestrator, getAssistantToolDefinition, highestAssistantRiskLevel } from "./toolRegistry";
import { validateAssistantToolCall } from "./toolValidation";
import { callOpenAiStructured } from "./openaiResponses";
import type { AssistantDebugRecorder } from "./debugTrace";

type OrchestrationInput = {
  message: string;
  clientContext: AssistantClientContext;
  conversation?: Array<{ role: string; content: string }>;
  ragChunks: AssistantRagChunk[];
  debug?: AssistantDebugRecorder;
};

type TriageOutput = AssistantTaskClassification & { assistantMessage: string };
type PlannerStepOutput = {
  id: string;
  label: string;
  toolId: string;
  inputJson: string;
  dependsOn: string[];
  expectedEvidence: string[];
  onFailure: "retry" | "replan" | "stop";
};
type PlannerOutput = { goal: string; successCriteria: string[]; steps: PlannerStepOutput[]; assistantMessage: string };
export type AnalyzerOutput = {
  mode: "complete" | "verify" | "repair" | "replan" | "failed";
  confidence: number;
  summary: string;
  missingChecks: string[];
  evidence: string[];
  failedStepIds: string[];
  repairInstruction: string | null;
  nextCalls: Array<{ toolId: string; inputJson: string; reason: string }>;
};

const triageSchema = {
  type: "object",
  properties: {
    mode: { type: "string", enum: ["answer", "workflow", "clarify"] },
    normalizedGoal: { type: "string" },
    rationale: { type: "string" },
    successCriteria: { type: "array", items: { type: "string" } },
    clarificationQuestion: { type: ["string", "null"] },
    assistantMessage: { type: "string" }
  },
  required: ["mode", "normalizedGoal", "rationale", "successCriteria", "clarificationQuestion", "assistantMessage"],
  additionalProperties: false
};

const plannerStepSchema = {
  type: "object",
  properties: {
    id: { type: "string" },
    label: { type: "string" },
    toolId: { type: "string" },
    inputJson: { type: "string" },
    dependsOn: { type: "array", items: { type: "string" } },
    expectedEvidence: { type: "array", items: { type: "string" } },
    onFailure: { type: "string", enum: ["retry", "replan", "stop"] }
  },
  required: ["id", "label", "toolId", "inputJson", "dependsOn", "expectedEvidence", "onFailure"],
  additionalProperties: false
};

const plannerSchema = {
  type: "object",
  properties: {
    goal: { type: "string" },
    successCriteria: { type: "array", items: { type: "string" } },
    steps: { type: "array", items: plannerStepSchema },
    assistantMessage: { type: "string" }
  },
  required: ["goal", "successCriteria", "steps", "assistantMessage"],
  additionalProperties: false
};

const analyzerSchema = {
  type: "object",
  properties: {
    mode: { type: "string", enum: ["complete", "verify", "repair", "replan", "failed"] },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    summary: { type: "string" },
    missingChecks: { type: "array", items: { type: "string" } },
    evidence: { type: "array", items: { type: "string" } },
    failedStepIds: { type: "array", items: { type: "string" } },
    repairInstruction: { type: ["string", "null"] },
    nextCalls: {
      type: "array",
      items: {
        type: "object",
        properties: {
          toolId: { type: "string" },
          inputJson: { type: "string" },
          reason: { type: "string" }
        },
        required: ["toolId", "inputJson", "reason"],
        additionalProperties: false
      }
    }
  },
  required: ["mode", "confidence", "summary", "missingChecks", "evidence", "failedStepIds", "repairInstruction", "nextCalls"],
  additionalProperties: false
};

const finalMessageSchema = {
  type: "object",
  properties: { assistantMessage: { type: "string" } },
  required: ["assistantMessage"],
  additionalProperties: false
};

function compactRag(chunks: AssistantRagChunk[]) {
  return chunks.slice(0, 6).map((chunk) => ({ source: chunk.source, title: chunk.title, text: chunk.text.slice(0, 1200) }));
}

function parseToolInput(value: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function sanitizePlannedSteps(steps: PlannerStepOutput[]): AssistantWorkflowStep[] {
  const seen = new Set<string>();
  const sanitized: AssistantWorkflowStep[] = [];
  for (const [index, step] of steps.entries()) {
    const id = step.id.trim() || `step_${index + 1}`;
    if (seen.has(id)) continue;
    const input = parseToolInput(step.inputJson);
    if (!input) continue;
    const call = { id, toolId: step.toolId, input };
    const validation = validateAssistantToolCall(call);
    if (!validation.definition || validation.errors.length > 0) continue;
    seen.add(id);
    sanitized.push({
      id,
      label: step.label.trim() || validation.definition.effect,
      toolId: step.toolId,
      input,
      dependsOn: step.dependsOn.filter((dependency) => dependency !== id),
      expectedEvidence: step.expectedEvidence.filter(Boolean),
      onFailure: step.onFailure,
      riskLevel: validation.definition.riskLevel
    });
  }
  const ids = new Set(sanitized.map((step) => step.id));
  return sanitized.map((step) => ({ ...step, dependsOn: step.dependsOn.filter((id) => ids.has(id)) }));
}

export async function classifyAssistantTask(input: OrchestrationInput): Promise<TriageOutput | null> {
  const tools = assistantToolMetadataForOrchestrator().map(({ id, title, operation, domain, description }) => ({ id, title, operation, domain, description }));
  const output = await callOpenAiStructured<TriageOutput>({
    role: "communicator",
    schemaName: "arcigy_task_classification",
    schema: triageSchema,
    instructions: [
      "You are the Arcigy user-facing communicator and task classifier. Write Slovak user text.",
      "Classify as workflow whenever satisfying the request requires at least one available tool, including every GET/read/inspection tool.",
      "Classify as answer only when a direct conversational answer is sufficient and no tool is needed.",
      "Classify as clarify only when one missing user decision materially changes the requested result and cannot be read with a tool.",
      "Do not plan tool calls. State measurable success criteria for workflow tasks. Do not claim any action happened.",
      "Any user-facing text must be concise Slovak CommonMark. No greetings, filler, role-play, hidden reasoning or invented status messages."
    ].join("\n"),
    input: {
      userMessage: input.message,
      recentConversation: input.conversation?.slice(-8) ?? [],
      liveContextSummary: input.clientContext,
      availableToolMetadata: tools,
      knowledge: compactRag(input.ragChunks)
    },
    debug: input.debug
  });
  if (!output) return null;
  return {
    ...output,
    clarificationQuestion: output.clarificationQuestion ?? undefined,
    successCriteria: output.successCriteria.filter(Boolean)
  };
}

export async function planAssistantWorkflow(
  input: OrchestrationInput,
  classification: AssistantTaskClassification,
  feedback?: { validation: AssistantValidationReport; priorWorkflow: AssistantWorkflowState; toolResults: AssistantToolResult[] }
): Promise<{ workflow: AssistantWorkflowState; assistantMessage: string; toolCalls: AssistantToolCall[] } | null> {
  const role = feedback && feedback.priorWorkflow.iteration >= 2 ? "escalation" : "orchestrator";
  const metadata = assistantToolMetadataForOrchestrator();
  const output = await callOpenAiStructured<PlannerOutput>({
    role,
    schemaName: "arcigy_atomic_workflow",
    schema: plannerSchema,
    instructions: [
      "You are the Arcigy workflow orchestrator. You never execute tools and never address the user as if work is complete.",
      "Compose only the supplied atomic tools. Each step must have one tool and strict JSON input encoded in inputJson.",
      "Use GET/read tools first whenever ids, current selection, view, parameter schema, catalog candidates or project state are unknown.",
      "Use exact stable ids returned by prior steps; never invent ids. If an id is unavailable now, plan a read step and make the dependent mutation a later iteration instead of using placeholders.",
      "Prefer narrow queries over full-scene reads. Add independent verification steps after every mutation using each tool's verificationTools metadata.",
      "Respect dependsOn, confirmation, tenant scope, reversibility and max iteration boundaries. Do not bypass an editor owner.",
      "If feedback exists, use its toolResults as observations, repair only failed or unverified work and never repeat completed mutations."
    ].join("\n"),
    input: {
      goal: classification.normalizedGoal,
      successCriteria: classification.successCriteria,
      userMessage: input.message,
      liveContext: input.clientContext,
      toolMetadata: metadata,
      knowledge: compactRag(input.ragChunks),
      feedback: feedback ?? null
    },
    debug: input.debug
  });
  if (!output) return null;
  const steps = sanitizePlannedSteps(output.steps);
  if (steps.length === 0) return null;
  const workflow: AssistantWorkflowState = {
    workflowId: `wf_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`,
    goal: output.goal.trim() || classification.normalizedGoal,
    successCriteria: output.successCriteria.filter(Boolean).length > 0 ? output.successCriteria.filter(Boolean) : classification.successCriteria,
    steps,
    iteration: feedback ? feedback.priorWorkflow.iteration + 1 : 1,
    maxIterations: feedback?.priorWorkflow.maxIterations ?? 5,
    status: feedback ? "repairing" : "planned",
    completedStepIds: feedback?.priorWorkflow.completedStepIds ?? [],
    lastError: feedback?.validation.repairInstruction
  };
  const toolCalls = readyWorkflowToolCalls(workflow);
  return { workflow, assistantMessage: output.assistantMessage, toolCalls };
}

export function readyWorkflowToolCalls(workflow: AssistantWorkflowState): AssistantToolCall[] {
  const completed = new Set(workflow.completedStepIds);
  return workflow.steps
    .filter((step) => !completed.has(step.id) && step.dependsOn.every((dependency) => completed.has(dependency)))
    .map((step) => ({ id: step.id, toolId: step.toolId, input: step.input }));
}

export function hasRemainingWorkflowSteps(workflow: AssistantWorkflowState): boolean {
  const completed = new Set(workflow.completedStepIds);
  return workflow.steps.some((step) => !completed.has(step.id));
}

function deterministicAnalysis(results: AssistantToolResult[]): AssistantValidationReport {
  const failed = results.filter((result) => !result.ok);
  return {
    confidence: failed.length === 0 ? 0.86 : 0.35,
    done: failed.length === 0,
    summary: failed.length === 0 ? "Všetky vykonané a kontrolné kroky prešli." : `Zlyhalo ${failed.length} krokov.`,
    missingChecks: failed.map((result) => result.error ?? `${result.toolId} failed`),
    failedStepIds: failed.map((result) => result.callId ?? result.toolId),
    evidence: results.filter((result) => result.ok).map((result) => result.stateDeltaSummary ?? `${result.toolId}: OK`),
    repairInstruction: failed.length === 0 ? undefined : "Oprav iba zlyhané vstupy a potom zopakuj nezávislú kontrolu.",
    nextAction: failed.length === 0 ? undefined : "replan"
  };
}

export function analyzePricingReadWorkflow(
  workflow: AssistantWorkflowState,
  results: AssistantToolResult[]
): AssistantValidationReport | null {
  const pricingResult = [...results].reverse().find((result) => result.ok && result.toolId === "pricing.getSummary");
  if (!pricingResult || workflow.steps.some((step) => getAssistantToolDefinition(step.toolId)?.operation === "write")) return null;
  const output = recordValue(pricingResult.output);
  const quote = recordValue(output?.quote);
  const finalPrice = quote?.finalPrice;
  if (typeof finalPrice !== "number" || !Number.isFinite(finalPrice)) return null;
  const entities = Array.isArray(output?.entities) ? output.entities : [];
  const incompleteEntities = entities
    .map(recordValue)
    .filter((entity): entity is Record<string, unknown> => entity?.pricingStatus === "incomplete");
  const marginView = recordValue(quote?.marginView);
  const marginSummary = recordValue(marginView?.summary);
  const reportedMissingCount = marginSummary?.missingPriceCount;
  const missingPriceCount = typeof reportedMissingCount === "number"
    ? Math.max(0, Math.round(reportedMissingCount))
    : incompleteEntities.length;
  const formattedPrice = `${finalPrice.toLocaleString("sk-SK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
  const incompleteSummary = missingPriceCount > 0
    ? ` Aktuálny BOM nie je úplný, pretože ${missingPriceCount} ${missingPriceCount === 1 ? "položka nemá" : "položky nemajú"} priradenú cenu.`
    : "";
  return {
    confidence: missingPriceCount > 0 ? 0.94 : 0.99,
    done: true,
    summary: `Aktuálna vypočítaná cena projektu je ${formattedPrice}.${incompleteSummary}`,
    missingChecks: [],
    evidence: [pricingResult.stateDeltaSummary ?? "Cena bola prepočítaná zo živého BOM."]
  };
}

export function sanitizeAnalyzerCalls(output: AnalyzerOutput): AssistantToolCall[] {
  const calls: AssistantToolCall[] = [];
  for (const [index, candidate] of output.nextCalls.entries()) {
    const input = parseToolInput(candidate.inputJson);
    if (!input) continue;
    const call = { id: `analysis_${Date.now().toString(36)}_${index}`, toolId: candidate.toolId, input };
    const validation = validateAssistantToolCall(call);
    const metadata = assistantToolMetadataForOrchestrator().find((tool) => tool.id === call.toolId);
    if (validation.errors.length === 0 && metadata && metadata.operation !== "write") calls.push(call);
  }
  return calls;
}

export async function analyzeAssistantWorkflow(args: {
  input: OrchestrationInput;
  workflow: AssistantWorkflowState;
  toolResults: AssistantToolResult[];
}): Promise<{ validation: AssistantValidationReport; nextCalls: AssistantToolCall[]; mode: AnalyzerOutput["mode"] }> {
  const deterministic = deterministicAnalysis(args.toolResults);
  const pricingRead = analyzePricingReadWorkflow(args.workflow, args.toolResults);
  if (pricingRead) return { validation: pricingRead, nextCalls: [], mode: "complete" };
  const authoritativeReadOnly = deterministic.done && args.workflow.steps.every((step) => {
    const operation = getAssistantToolDefinition(step.toolId)?.operation;
    return operation === "read" || operation === "verify";
  });
  if (authoritativeReadOnly) return { validation: deterministic, nextCalls: [], mode: "complete" };
  const independentTools = assistantToolMetadataForOrchestrator().filter((tool) => tool.operation === "verify" || tool.operation === "read");
  let output: AnalyzerOutput | null = null;
  try {
    output = await callOpenAiStructured<AnalyzerOutput>({
      role: "analyzer",
      schemaName: "arcigy_workflow_analysis",
      schema: analyzerSchema,
      instructions: [
        "You are Arcigy's independent workflow analyzer. Do not trust a mutation's success message as sufficient proof.",
        "Compare the original success criteria, planned evidence, live context and every callId result.",
        "Request narrow independent read/verify tools when evidence is missing. You must never request a write tool.",
        "For every mutation repair, return repair or replan with precise failedStepIds and repairInstruction so the orchestrator creates the corrected workflow.",
        "Never repeat a successful mutation. Return complete only when every success criterion has explicit evidence.",
        "If repeated failures need a new plan, return replan with one precise repairInstruction. Stop at the iteration limit."
      ].join("\n"),
      input: {
        workflow: args.workflow,
        toolResults: args.toolResults,
        refreshedLiveContext: args.input.clientContext,
        independentToolMetadata: independentTools,
        iterationRemaining: Math.max(0, args.workflow.maxIterations - args.workflow.iteration)
      },
      debug: args.input.debug
    });
  } catch {
    output = null;
  }
  if (!output) return { validation: deterministic, nextCalls: [], mode: deterministic.done ? "complete" : "replan" };
  const validation: AssistantValidationReport = {
    confidence: output.confidence,
    done: output.mode === "complete",
    summary: output.summary,
    missingChecks: output.missingChecks,
    nextAction: output.mode === "complete" ? undefined : output.mode,
    evidence: output.evidence,
    failedStepIds: output.failedStepIds,
    repairInstruction: output.repairInstruction ?? undefined
  };
  return { validation, nextCalls: sanitizeAnalyzerCalls(output), mode: output.mode };
}

export function workflowToPlan(workflow: AssistantWorkflowState): AssistantPlan {
  return {
    goal: workflow.goal,
    steps: workflow.steps.map((step) => ({ label: step.label, toolId: step.toolId, riskLevel: step.riskLevel })),
    touchedObjects: workflow.steps.flatMap((step) => [step.input.id, step.input.instanceId, step.input.groupId]).filter((value): value is string => typeof value === "string"),
    riskLevel: highestAssistantRiskLevel(workflow.steps.map((step) => step.toolId)),
    requiresConfirmation: workflow.steps.some((step) => getAssistantToolDefinition(step.toolId)?.requiresConfirmation === true)
  };
}

export async function composeFinalAssistantMessage(args: {
  message: string;
  workflow: AssistantWorkflowState;
  validation: AssistantValidationReport;
  toolResults: AssistantToolResult[];
  debug?: AssistantDebugRecorder;
}): Promise<string | null> {
  const output = await callOpenAiStructured<{ assistantMessage: string }>({
    role: "communicator",
    schemaName: "arcigy_final_message",
    schema: finalMessageSchema,
    instructions: [
      "You are Arcigy's final Slovak communicator.",
      "Report only actions and evidence present in the supplied execution record. State failures or remaining uncertainty directly.",
      "Return polished CommonMark Markdown, never HTML. Use a short outcome heading, compact bullets and a verification section when evidence exists.",
      "Do not mention internal tool ids, prompts, model roles or chain-of-thought. Do not greet, role-play, add filler or describe actions that were only planned.",
      "Lead with whether the user's goal was completed, then summarize material changes, verification and save state."
    ].join("\n"),
    input: {
      message: args.message,
      workflow: args.workflow,
      validation: args.validation,
      toolResults: args.toolResults
    },
    debug: args.debug
  });
  return output?.assistantMessage?.trim() || formatVerifiedAssistantResult(args);
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function formatToolResultEvidence(result: AssistantToolResult): string[] {
  const output = recordValue(result.output);
  if (!result.ok || !output) return [];
  if (result.toolId === "context.queryObjects") {
    const total = typeof output.total === "number" ? output.total : null;
    return total === null ? [] : [`**Počet nájdených objektov:** ${total}`];
  }
  if (result.toolId === "context.getCurrentView") {
    const values = [
      typeof output.activeViewerTab === "string" ? `pohľad **${output.activeViewerTab}**` : null,
      typeof output.viewMode === "string" ? `režim **${output.viewMode}**` : null,
      typeof output.projection === "string" ? `projekcia **${output.projection}**` : null,
      typeof output.renderMode === "string" ? `zobrazenie **${output.renderMode}**` : null
    ].filter((value): value is string => !!value);
    return values.length > 0 ? [`Aktuálne je nastavený ${values.join(", ")}.`] : [];
  }
  if (result.toolId === "context.getSelection") {
    const selected = Array.isArray(output.selectedParams) ? output.selectedParams : [];
    if (selected.length === 0) return ["V editore momentálne nie je označený žiadny objekt."];
    const labels = selected.slice(0, 12).map((item) => {
      const value = recordValue(item);
      const label = typeof value?.label === "string" ? value.label : "objekt";
      const id = typeof value?.id === "string" ? value.id : null;
      return id ? `**${label}** (${id})` : `**${label}**`;
    });
    return [`Označené objekty: ${labels.join(", ")}.`];
  }
  if (result.toolId === "validation.inspectProject") {
    const valid = output.valid === true;
    const diagnostics = Array.isArray(output.diagnostics) ? output.diagnostics : [];
    const checked = recordValue(output.checked);
    const checkedParts = checked ? [
      typeof checked.modules === "number" ? `${checked.modules} modulov` : null,
      typeof checked.kitchenGroups === "number" ? `${checked.kitchenGroups} kuchýň` : null,
      typeof checked.worktops === "number" ? `${checked.worktops} pracovných dosiek` : null
    ].filter((value): value is string => !!value) : [];
    const checkedText = checkedParts.length > 0 ? ` Skontrolované: ${checkedParts.join(", ")}.` : "";
    return [valid
      ? `Projekt prešiel validáciou bez chýb.${checkedText}`
      : `Validácia našla **${diagnostics.length}** problémov.${checkedText}`];
  }
  if (result.toolId === "project.getMetadata") {
    const project = recordValue(output.project);
    const name = typeof project?.name === "string" ? project.name : null;
    const revision = typeof output.saveRevision === "number" ? output.saveRevision : null;
    return [name || revision !== null
      ? `Otvorený projekt: ${name ? `**${name}**` : "bez názvu"}${revision !== null ? `, revízia **${revision}**` : ""}.`
      : "Načítal som aktuálne metadáta projektu."];
  }
  if (result.toolId === "pricing.getSummary") {
    const quote = recordValue(output.quote);
    const finalPrice = quote?.finalPrice;
    if (typeof finalPrice !== "number" || !Number.isFinite(finalPrice)) return [];
    const entities = Array.isArray(output.entities) ? output.entities : [];
    const incomplete = entities
      .map(recordValue)
      .filter((entity): entity is Record<string, unknown> => entity?.pricingStatus === "incomplete");
    const marginView = recordValue(quote?.marginView);
    const marginSummary = recordValue(marginView?.summary);
    const reportedMissingCount = marginSummary?.missingPriceCount;
    const missingPriceCount = typeof reportedMissingCount === "number"
      ? Math.max(0, Math.round(reportedMissingCount))
      : incomplete.length;
    const formattedPrice = `${finalPrice.toLocaleString("sk-SK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
    const evidence = [`**Aktuálna vypočítaná cena:** ${formattedPrice}`];
    if (missingPriceCount > 0) {
      const labels = incomplete
        .map((entity) => typeof entity.label === "string" ? entity.label : null)
        .filter((label): label is string => !!label)
        .slice(0, 4);
      evidence.push(
        `**Upozornenie:** ${missingPriceCount} ${missingPriceCount === 1 ? "položka nemá" : "položky nemajú"} cenu, takže výsledná suma nie je úplná${labels.length > 0 ? ` (${labels.join(", ")})` : ""}.`
      );
    }
    return evidence;
  }
  return result.stateDeltaSummary ? [result.stateDeltaSummary] : [];
}

export function formatVerifiedAssistantResult(args: {
  workflow: AssistantWorkflowState;
  validation: AssistantValidationReport;
  toolResults: AssistantToolResult[];
}): string {
  const completed = args.validation.done && args.workflow.status === "complete";
  const directProjectMetadata = args.toolResults.length === 1 && args.toolResults[0]?.ok && args.toolResults[0].toolId === "project.getMetadata"
    ? recordValue(args.toolResults[0].output)
    : null;
  const directProject = recordValue(directProjectMetadata?.project);
  if (completed && typeof directProject?.name === "string" && directProject.name.trim()) {
    return `Tento projekt sa volá **${directProject.name.trim()}**.`;
  }
  const lines = [completed ? "## Hotovo" : "## Úlohu sa nepodarilo dokončiť", "", args.validation.summary.trim()];
  const exactEvidence = args.toolResults.flatMap(formatToolResultEvidence);
  const evidence = (exactEvidence.length > 0 ? exactEvidence : args.validation.evidence ?? [])
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 8);
  if (evidence.length > 0) {
    lines.push("", "### Overenie", "", ...evidence.map((item) => `- ${item}`));
  }
  const saved = args.toolResults.some((result) => result.ok && result.toolId === "project.save");
  if (saved) lines.push("", "**Projekt bol uložený.**");
  const missing = args.validation.missingChecks.map((item) => item.trim()).filter(Boolean).slice(0, 6);
  if (!completed && missing.length > 0) {
    lines.push("", "### Čo zostalo nevyriešené", "", ...missing.map((item) => `- ${item}`));
  }
  return lines.join("\n");
}
