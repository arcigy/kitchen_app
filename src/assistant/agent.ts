import type {
  AssistantPlan,
  AssistantRagChunk,
  AssistantTaskClassification,
  AssistantToolCall,
  AssistantToolResult,
  AssistantTurnRequest,
  AssistantTurnResponse,
  AssistantValidationReport,
  AssistantWorkflowState
} from "./types";
import {
  assistantToolSummary,
  getAssistantToolDefinition,
  highestAssistantRiskLevel
} from "./toolRegistry";
import { validateAssistantToolCall } from "./toolValidation";
import type { ClientCatalog } from "../core/catalog/catalog-types";
import { fetchExternalText } from "../server/external-http";
import {
  applyPinoResolvedQueryToParams,
  resolvePinoModuleDescription
} from "./pinoModuleResolver";
import {
  analyzeAssistantWorkflow,
  classifyAssistantTask,
  composeFinalAssistantMessage,
  formatVerifiedAssistantResult,
  hasRemainingWorkflowSteps,
  planAssistantWorkflow,
  readyWorkflowToolCalls,
  workflowToPlan
} from "./orchestration";
import { openAiAssistantFailureMessage } from "./openaiResponses";
import { createAssistantDebugRecorder, type AssistantDebugRecorder } from "./debugTrace";

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_FLASH_MODEL = "gemini-2.5-flash";
const DEFAULT_LITE_MODEL = "gemini-2.5-flash-lite";

type AgentInput = AssistantTurnRequest & {
  ragChunks: AssistantRagChunk[];
  catalog?: Pick<ClientCatalog, "clientId" | "modules" | "vendorCatalog" | "kitchenDefaults">;
};

function normalizeGeminiModel(model: string): string {
  return model.trim().replace(/^models\//u, "");
}

function isLikelyFullKitchenRequest(message: string): boolean {
  const m = message.toLowerCase();
  return /(cel[auú]|kompletn|vytvor|navrhni|vlo[zž]).*(kuchy|kitchen)|u kuchy|cela kuchy/iu.test(m);
}

function isLikelyModulePatch(message: string): boolean {
  if (isLikelyCatalogInsertRequest(message)) return false;
  const m = message.toLowerCase();
  return /(nastav|zme[nň]|daj|uprav|material|kovan|[šs]ufl[ií]k|width|[ší]rka)/iu.test(m);
}

function isLikelyCatalogInsertRequest(message: string): boolean {
  const m = message.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return /(vloz|pridaj|daj).*(modul|skrinku|bocn|vysok|spodn|mikrovln|rura|trouba|sufl|zasuv|polic)/u.test(m);
}

function isHowToQuestion(message: string): boolean {
  return /^(kde|ako|kam|co|čo|preco|prečo|where|how|what)\b/iu.test(message.trim());
}

function selectedModuleIds(input: AgentInput): string[] {
  return input.clientContext.selectedParams
    .filter((item) => item.kind === "module")
    .map((item) => item.id);
}

function normalizeIntentText(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/gu, "").toLowerCase().replace(/\s+/gu, " ").trim();
}

function buildDeterministicReadWorkflow(input: AgentInput): {
  classification: AssistantTaskClassification;
  workflow: AssistantWorkflowState;
  toolCalls: AssistantToolCall[];
  assistantMessage: string;
} | null {
  const message = normalizeIntentText(input.message);
  let toolId = "";
  let toolInput: Record<string, unknown> = {};
  let goal = "";
  let stepLabel = "";
  let successCriteria: string[] = [];

  if (/(kolko|pocet|spocitaj).{0,24}modul/u.test(message)) {
    toolId = "context.queryObjects";
    toolInput = { kinds: ["module"], limit: 500 };
    goal = "Zistiť presný počet modulov v otvorenom projekte.";
    stepLabel = "Prečítať moduly z otvoreného projektu a spočítať ich.";
    successCriteria = ["Odpoveď obsahuje počet modulov z čerstvého live kontextu."];
  } else if (/^(ako.{0,12}vola|aky.{0,12}(je )?nazov|co.{0,12}(je )?nazov|povedz.{0,12}nazov).{0,30}projekt|^nazov.{0,12}projekt/u.test(message)) {
    toolId = "project.getMetadata";
    goal = "Zistiť presný názov otvoreného projektu.";
    stepLabel = "Prečítať názov z aktuálnych projektových metadát.";
    successCriteria = ["Odpoveď obsahuje presný názov aktuálne otvoreného projektu."];
  } else if (/(aktualn|sucasn|teraj).{0,20}(pohlad|view)|ak[yae].{0,12}(pohlad|view)/u.test(message)) {
    toolId = "context.getCurrentView";
    goal = "Zistiť aktuálny pohľad a stav kamery.";
    stepLabel = "Prečítať aktuálny pohľad, projekciu a režim zobrazenia.";
    successCriteria = ["Odpoveď obsahuje aktuálny pohľad, projekciu a režim zobrazenia."];
  } else if (/(co|ktore|aky|aktualn).{0,24}(oznacen|vybran|vyber)|oznacen.{0,12}(objekt|modul)/u.test(message)) {
    toolId = "context.getSelection";
    goal = "Zistiť aktuálny výber v editore.";
    stepLabel = "Prečítať označené objekty a ich aktuálne parametre.";
    successCriteria = ["Odpoveď vychádza z čerstvého výberu a jeho parametrov."];
  } else if (/(skontroluj|over|valid).{0,30}(projekt|kuchyn)|problemy.{0,20}(projekt|kuchyn)/u.test(message)) {
    toolId = "validation.inspectProject";
    goal = "Skontrolovať otvorený projekt a nájsť chyby.";
    stepLabel = "Spustiť nezávislú kontrolu väzieb a parametrov projektu.";
    successCriteria = ["Odpoveď obsahuje výsledok nezávislej validácie projektu."];
  }

  if (!toolId) return null;
  const definition = getAssistantToolDefinition(toolId);
  if (!definition) return null;
  const stepId = `read_${Date.now().toString(36)}`;
  const workflow: AssistantWorkflowState = {
    workflowId: `wf_${Date.now().toString(36)}_read`,
    goal,
    successCriteria,
    steps: [{
      id: stepId,
      label: stepLabel || definition.effect,
      toolId,
      input: toolInput,
      dependsOn: [],
      expectedEvidence: definition.postconditions,
      onFailure: "stop",
      riskLevel: definition.riskLevel
    }],
    iteration: 1,
    maxIterations: 2,
    status: "planned",
    completedStepIds: []
  };
  return {
    classification: {
      mode: "workflow",
      normalizedGoal: goal,
      rationale: "Požiadavka potrebuje aktuálne dáta z editora.",
      successCriteria
    },
    workflow,
    toolCalls: [{ id: stepId, toolId, input: toolInput }],
    assistantMessage: ""
  };
}

function buildFallbackPlan(input: AgentInput): { message: string; plan: AssistantPlan | null; calls: AssistantToolCall[]; confirm: boolean } {
  if (isLikelyFullKitchenRequest(input.message)) {
    return {
      message: "Automaticke vlozenie celej kuchyne uz nie je dostupne. Mozem pripravit postup alebo vlozit konkretne moduly z katalogu po jednom.",
      plan: null,
      calls: [],
      confirm: false
    };
  }
  if (!isHowToQuestion(input.message) && isLikelyModulePatch(input.message)) {
    const ids = selectedModuleIds(input);
    if (ids.length === 0) {
      return {
        message: "Na úpravu modulu najprv označ konkrétny modul. Potom viem bezpečne meniť jeho parametre cez existujúci rebuild systém.",
        plan: null,
        calls: [],
        confirm: false
      };
    }
    const patch: Record<string, unknown> = {};
    const width = /(?:width|sirka|[ší]rka)\D{0,12}(\d{2,5})/iu.exec(input.message)?.[1];
    const drawerCount = /(?:[šs]ufl[ií]k(?:y|ov)?|drawer)\D{0,12}(\d{1,2})/iu.exec(input.message)?.[1];
    if (width) patch.width = Number(width);
    if (drawerCount) patch.drawerCount = Number(drawerCount);
    if (Object.keys(patch).length === 0) {
      return {
        message: "Rozumiem, že chceš upraviť označený modul, ale neviem z textu bezpečne vyčítať konkrétny parameter. Napíš napríklad `šírka 800` alebo `šuplíky 3`.",
        plan: null,
        calls: [],
        confirm: false
      };
    }
    const plan: AssistantPlan = {
      goal: "Upraviť parametre označeného modulu.",
      riskLevel: "medium",
      requiresConfirmation: false,
      touchedObjects: ids,
      steps: [
        { label: `Zmením parametre ${ids.join(", ")}: ${Object.keys(patch).join(", ")}.`, toolId: "module.patchSelectedParams", riskLevel: "medium" },
        { label: "Po rebuild-e overím výsledok z live contextu.", toolId: "context.getSelection", riskLevel: "low" }
      ]
    };
    return {
      message: `Idem upraviť označený modul: ${Object.entries(patch).map(([key, value]) => `${key}=${value}`).join(", ")}.`,
      plan,
      calls: [{ id: `tool_${Date.now()}_patch_module`, toolId: "module.patchSelectedParams", input: { instanceIds: ids, patch } }],
      confirm: false
    };
  }

  if (!isHowToQuestion(input.message) && isLikelyCatalogInsertRequest(input.message) && input.catalog?.vendorCatalog?.vendorId === "pino_nobilia") {
    const resolution = resolvePinoModuleDescription(input.catalog, input.message, { limit: 3 });
    const top = resolution.candidates[0] ?? null;
    if (resolution.status === "resolved" && top) {
      const initialParams = applyPinoResolvedQueryToParams(top, resolution.query);
      const plan: AssistantPlan = {
        goal: "Pripraviť presný PINO/Nobilia modul podľa slovného opisu.",
        riskLevel: "high",
        requiresConfirmation: true,
        touchedObjects: ["active-kitchen-group"],
        steps: [
          { label: `Vybral som ${top.entry.productTemplateName} (${top.entry.catalogKey}).`, riskLevel: "low" },
          { label: "Po potvrdení vložím presný tenant modul do aktívnej kuchyne.", toolId: "vendorCatalog.insertResolvedModule", riskLevel: "high" },
          { label: "Skontrolujem výsledok v editore.", toolId: "context.getSelection", riskLevel: "low" }
        ]
      };
      return {
        message: `Najlepší PINO kandidát je ${top.entry.productTemplateName} [${top.entry.catalogKey}] so šírkami ${top.entry.widthLabel}.`,
        plan,
        calls: [{
          id: `tool_${Date.now()}_insert_vendor_module`,
          toolId: "vendorCatalog.insertResolvedModule",
          input: {
            catalogKey: top.entry.catalogKey,
            productTemplateId: top.entry.productTemplateId,
            productTemplateName: top.entry.productTemplateName,
            moduleType: top.entry.moduleType,
            modulePackageId: top.entry.modulePackageId,
            initialParams
          }
        }],
        confirm: true
      };
    }
    if (top) {
      const candidateText = resolution.candidates
        .slice(0, 3)
        .map((candidate) => `${candidate.entry.productTemplateName} [${candidate.entry.catalogKey}]`)
        .join("; ");
      return {
        message: `Našiel som viac PINO kandidátov a nechcem vybrať zle: ${candidateText}. Spresni prosím šírku, počet zásuviek/výsuvov alebo spotrebič.`,
        plan: null,
        calls: [],
        confirm: false
      };
    }
  }

  const sources = input.ragChunks.slice(0, 3);
  const sourceText = sources.length > 0
    ? sources.map((chunk) => `- ${chunk.title}: ${chunk.text.slice(0, 360)}`).join("\n")
    : "";
  return {
    message: sourceText
      ? `Podľa znalostnej bázy:\n${sourceText}`
      : "Toto zatiaľ neviem bezpečne potvrdiť zo znalostnej bázy. Skús sa opýtať konkrétnejšie alebo označ objekt v editore.",
    plan: null,
    calls: [],
    confirm: false
  };
}

function buildPrompt(input: AgentInput): string {
  const rag = input.ragChunks.map((chunk) => `[${chunk.source}] ${chunk.title}\n${chunk.text}`).join("\n\n---\n\n");
  return [
    "Si Arcigy Kitchen agent. Odpovedaj stručne po slovensky a používaj čistý CommonMark Markdown bez HTML.",
    "Nesmieš tvrdiť fakty o appke bez RAG alebo live context dôkazu.",
    "Ak odpoveď vyžaduje aktuálne dáta alebo zmenu v editore, musíš vrátiť aspoň jeden platný tool call.",
    "Nikdy nepíš, že niečo práve robíš, počítaš, kontroluješ alebo vykonávaš, ak si nevrátil tool call, ktorý to reálne vykoná.",
    "Mutácie rob iba cez dostupné tools. High risk vždy vyžaduje confirmation.",
    "Vráť iba JSON objekt so shape: assistantMessage, plan|null, toolCalls[], validation|null, requiresConfirmation.",
    `Live context: ${JSON.stringify(input.clientContext)}`,
    `Tools:\n${assistantToolSummary()}`,
    `RAG:\n${rag}`,
    `User: ${input.message}`
  ].join("\n\n");
}

async function callGeminiJson(input: AgentInput): Promise<Partial<AssistantTurnResponse> | null> {
  if (process.env.NODE_ENV === "test" && process.env.GEMINI_ASSISTANT_TEST_LIVE !== "true") return null;
  const apiKey = process.env.GEMINI_API_KEY || process.env.gemini_api_key;
  if (!apiKey) return null;
  const model = normalizeGeminiModel(process.env.GEMINI_ASSISTANT_MODEL || (isLikelyFullKitchenRequest(input.message) ? DEFAULT_FLASH_MODEL : DEFAULT_LITE_MODEL));
  const { response, text } = await fetchExternalText(`${GEMINI_ENDPOINT}/${model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: buildPrompt(input) }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.1 }
    })
  }, { timeoutMs: 30_000, maxBytes: 2 * 1024 * 1024 });
  if (!response.ok) throw new Error(`Gemini assistant request failed: HTTP ${response.status}`);
  const parsed = JSON.parse(text) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const jsonText = parsed.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();
  if (!jsonText) return null;
  return JSON.parse(jsonText) as Partial<AssistantTurnResponse>;
}

function validateFromToolResults(results: AssistantToolResult[] | undefined): AssistantValidationReport | null {
  if (!results || results.length === 0) return null;
  const failed = results.filter((result) => !result.ok);
  return {
    confidence: failed.length === 0 ? 0.86 : 0.38,
    done: failed.length === 0,
    summary: failed.length === 0 ? "Nástroje prebehli úspešne." : `Zlyhalo ${failed.length} krokov.`,
    missingChecks: failed.map((result) => result.error ?? `${result.toolId} failed`),
    nextAction: failed.length === 0 ? undefined : "Skontrolovať vstupy a zopakovať len zlyhaný krok."
  };
}

export function sanitizeAssistantToolCalls(calls: unknown): AssistantToolCall[] {
  if (!Array.isArray(calls)) return [];
  return calls
    .map((call, index) => {
      const record = call && typeof call === "object" ? call as Record<string, unknown> : {};
      return {
        id: typeof record.id === "string" ? record.id : `tool_${Date.now()}_${index}`,
        toolId: typeof record.toolId === "string" ? record.toolId : "",
        input: record.input && typeof record.input === "object" && !Array.isArray(record.input) ? record.input as Record<string, unknown> : {}
      };
    })
    .filter((call) => call.toolId && validateAssistantToolCall(call).errors.length === 0);
}

function touchedObjectsFromCalls(calls: AssistantToolCall[]): string[] {
  const ids = new Set<string>();
  for (const call of calls) {
    for (const key of ["id", "groupId", "wallId", "instanceId", "modulePackageId"]) {
      const value = call.input[key];
      if (typeof value === "string" && value) ids.add(value);
    }
    const instanceIds = call.input.instanceIds;
    if (Array.isArray(instanceIds)) for (const id of instanceIds) if (typeof id === "string") ids.add(id);
  }
  return [...ids];
}

function enforceAuthoritativePlan(
  candidate: AssistantPlan | null,
  calls: AssistantToolCall[]
): { plan: AssistantPlan | null; requiresConfirmation: boolean } {
  if (calls.length === 0) return { plan: null, requiresConfirmation: false };
  const definitions = calls.map((call) => getAssistantToolDefinition(call.toolId)).filter((item): item is NonNullable<typeof item> => !!item);
  const requiresConfirmation = definitions.some((definition) => definition.requiresConfirmation);
  const riskLevel = highestAssistantRiskLevel(calls.map((call) => call.toolId));
  return {
    requiresConfirmation,
    plan: {
      goal: candidate?.goal?.trim() || "Vykonať požadované kroky v editore.",
      steps: calls.map((call) => {
        const definition = getAssistantToolDefinition(call.toolId)!;
        return { label: definition.effect, toolId: call.toolId, riskLevel: definition.riskLevel };
      }),
      touchedObjects: candidate?.touchedObjects?.length ? [...candidate.touchedObjects] : touchedObjectsFromCalls(calls),
      riskLevel,
      requiresConfirmation
    }
  };
}

async function runAssistantTurnInternal(
  input: AgentInput,
  debug: AssistantDebugRecorder
): Promise<AssistantTurnResponse> {
  const ragSources = input.ragChunks.slice(0, 4).map((chunk) => ({ source: chunk.source, title: chunk.title }));
  const orchestrationInput = {
    message: input.message,
    clientContext: input.clientContext,
    conversation: input.conversation,
    ragChunks: input.ragChunks,
    debug
  };

  if (input.workflow && input.toolResults && input.toolResults.length > 0) {
    const completedStepIds = new Set(input.workflow.completedStepIds);
    for (const result of input.toolResults) if (result.ok && result.callId) completedStepIds.add(result.callId);
    const workflow = { ...input.workflow, completedStepIds: [...completedStepIds], status: "verifying" as const };
    const analysis = await analyzeAssistantWorkflow({ input: orchestrationInput, workflow, toolResults: input.toolResults });
    if (analysis.validation.done) {
      const remainingCalls = readyWorkflowToolCalls(workflow);
      if (remainingCalls.length > 0) {
        const nextWorkflow = {
          ...workflow,
          iteration: workflow.iteration + 1,
          status: "executing" as const
        };
        const authoritative = enforceAuthoritativePlan(workflowToPlan(nextWorkflow), remainingCalls);
        return {
          ok: true,
          assistantMessage: "Doterajšie kroky prešli kontrolou. Pokračujem ďalšími závislými krokmi workflowu.",
          plan: authoritative.plan,
          toolCalls: remainingCalls,
          validation: analysis.validation,
          requiresConfirmation: authoritative.requiresConfirmation,
          ragSources,
          phase: "execute",
          classification: null,
          workflow: nextWorkflow
        };
      }
      if (hasRemainingWorkflowSteps(workflow)) {
        const failedWorkflow = { ...workflow, status: "failed" as const, lastError: "Workflow obsahuje nevykonateľnú alebo cyklickú závislosť." };
        return {
          ok: true,
          assistantMessage: "Workflow sa zastavil: zostávajúce kroky nemajú splnené závislosti.",
          plan: workflowToPlan(failedWorkflow),
          toolCalls: [],
          validation: {
            ...analysis.validation,
            done: false,
            summary: "Workflow obsahuje nevykonateľnú alebo cyklickú závislosť.",
            missingChecks: [...analysis.validation.missingChecks, "Skontrolovať dependsOn väzby workflowu."],
            nextAction: "replan"
          },
          requiresConfirmation: false,
          ragSources,
          phase: "failed",
          classification: null,
          workflow: failedWorkflow
        };
      }
      const completeWorkflow = { ...workflow, status: "complete" as const };
      const hasOnlyReadEvidence = input.toolResults.length > 0 && input.toolResults.every((result) => {
        const definition = getAssistantToolDefinition(result.toolId);
        return result.ok && definition && definition.operation !== "write";
      });
      const finalMessage = hasOnlyReadEvidence
        ? formatVerifiedAssistantResult({
            workflow: completeWorkflow,
            validation: analysis.validation,
            toolResults: input.toolResults
          })
        : await composeFinalAssistantMessage({
            message: input.message,
            workflow: completeWorkflow,
            validation: analysis.validation,
            toolResults: input.toolResults,
            debug
          }).catch(() => null);
      return {
        ok: true,
        assistantMessage: finalMessage ?? "Hotovo. Požadované kroky aj nezávislé kontroly prešli.",
        plan: workflowToPlan(completeWorkflow),
        toolCalls: [],
        validation: analysis.validation,
        requiresConfirmation: false,
        ragSources,
        phase: "complete",
        classification: null,
        workflow: completeWorkflow
      };
    }

    if (workflow.iteration >= workflow.maxIterations) {
      const failedWorkflow = { ...workflow, status: "failed" as const, lastError: analysis.validation.repairInstruction ?? analysis.validation.summary };
      const finalMessage = await composeFinalAssistantMessage({
        message: input.message,
        workflow: failedWorkflow,
        validation: analysis.validation,
        toolResults: input.toolResults,
        debug
      }).catch(() => null);
      return {
        ok: true,
        assistantMessage: finalMessage ?? `Úlohu sa nepodarilo spoľahlivo dokončiť v limite ${workflow.maxIterations} iterácií: ${analysis.validation.summary}`,
        plan: workflowToPlan(failedWorkflow),
        toolCalls: [],
        validation: analysis.validation,
        requiresConfirmation: false,
        ragSources,
        phase: "failed",
        classification: null,
        workflow: failedWorkflow
      };
    }

    if (analysis.nextCalls.length > 0) {
      const existingIds = new Set(workflow.steps.map((step) => step.id));
      const appended = analysis.nextCalls.filter((call) => !existingIds.has(call.id)).map((call) => {
        const definition = getAssistantToolDefinition(call.toolId)!;
        return {
          id: call.id,
          label: definition.effect,
          toolId: call.toolId,
          input: call.input,
          dependsOn: [],
          expectedEvidence: definition.postconditions,
          onFailure: "replan" as const,
          riskLevel: definition.riskLevel
        };
      });
      const nextWorkflow = {
        ...workflow,
        steps: [...workflow.steps, ...appended],
        iteration: workflow.iteration + 1,
        status: analysis.mode === "verify" ? "verifying" as const : "repairing" as const,
        lastError: analysis.validation.repairInstruction
      };
      const requiresConfirmation = analysis.nextCalls.some((call) => getAssistantToolDefinition(call.toolId)?.requiresConfirmation === true);
      return {
        ok: true,
        assistantMessage: analysis.mode === "verify" ? "Potrebujem ešte nezávisle overiť výsledok." : `Opravujem zlyhaný krok: ${analysis.validation.repairInstruction ?? analysis.validation.summary}`,
        plan: workflowToPlan(nextWorkflow),
        toolCalls: analysis.nextCalls,
        validation: analysis.validation,
        requiresConfirmation,
        ragSources,
        phase: analysis.mode === "verify" ? "verify" : "execute",
        classification: null,
        workflow: nextWorkflow
      };
    }

    if (analysis.mode === "replan" || analysis.mode === "repair") {
      const classification = {
        mode: "workflow" as const,
        normalizedGoal: workflow.goal,
        rationale: "Analyzer requested a corrected workflow.",
        successCriteria: workflow.successCriteria
      };
      const replanned = await planAssistantWorkflow(orchestrationInput, classification, {
        validation: analysis.validation,
        priorWorkflow: workflow,
        toolResults: input.toolResults
      }).catch(() => null);
      if (replanned) {
        const authoritative = enforceAuthoritativePlan(workflowToPlan(replanned.workflow), replanned.toolCalls);
        return {
          ok: true,
          assistantMessage: replanned.assistantMessage,
          plan: authoritative.plan,
          toolCalls: replanned.toolCalls,
          validation: analysis.validation,
          requiresConfirmation: authoritative.requiresConfirmation,
          ragSources,
          phase: "plan",
          classification,
          workflow: replanned.workflow
        };
      }
    }

    const failedWorkflow = { ...workflow, status: "failed" as const, lastError: analysis.validation.repairInstruction ?? analysis.validation.summary };
    return {
      ok: true,
      assistantMessage: `Kontrola našla nevyriešený problém: ${analysis.validation.summary}`,
      plan: workflowToPlan(failedWorkflow),
      toolCalls: [],
      validation: analysis.validation,
      requiresConfirmation: false,
      ragSources,
      phase: "failed",
      classification: null,
      workflow: failedWorkflow
    };
  }

  const deterministicRead = buildDeterministicReadWorkflow(input);
  if (deterministicRead) {
    const authoritative = enforceAuthoritativePlan(workflowToPlan(deterministicRead.workflow), deterministicRead.toolCalls);
    return {
      ok: true,
      assistantMessage: deterministicRead.assistantMessage,
      plan: authoritative.plan,
      toolCalls: deterministicRead.toolCalls,
      validation: null,
      requiresConfirmation: authoritative.requiresConfirmation,
      ragSources,
      phase: "plan",
      classification: deterministicRead.classification,
      workflow: deterministicRead.workflow
    };
  }

  let classification = null;
  let openAiFailure: string | null = null;
  try {
    classification = await classifyAssistantTask(orchestrationInput);
  } catch (error) {
    openAiFailure = openAiAssistantFailureMessage(error) ??
      "OpenAI API sa nepodarilo použiť. Požiadavku môžeš bezpečne zopakovať.";
    classification = null;
  }
  if (classification?.mode === "clarify") {
    return {
      ok: true,
      assistantMessage: classification.clarificationQuestion ?? classification.assistantMessage,
      plan: null,
      toolCalls: [],
      validation: null,
      requiresConfirmation: false,
      ragSources,
      phase: "clarify",
      classification,
      workflow: null
    };
  }
  if (classification?.mode === "answer") {
    return {
      ok: true,
      assistantMessage: classification.assistantMessage,
      plan: null,
      toolCalls: [],
      validation: null,
      requiresConfirmation: false,
      ragSources,
      phase: "answer",
      classification,
      workflow: null
    };
  }
  if (classification?.mode === "workflow") {
    let planned = null;
    try {
      planned = await planAssistantWorkflow(orchestrationInput, classification);
    } catch (error) {
      openAiFailure = openAiAssistantFailureMessage(error) ??
        "OpenAI API sa nepodarilo použiť. Požiadavku môžeš bezpečne zopakovať.";
    }
    if (planned) {
      const authoritative = enforceAuthoritativePlan(workflowToPlan(planned.workflow), planned.toolCalls);
      return {
        ok: true,
        assistantMessage: planned.assistantMessage,
        plan: authoritative.plan,
        toolCalls: planned.toolCalls,
        validation: null,
        requiresConfirmation: authoritative.requiresConfirmation,
        ragSources,
        phase: "plan",
        classification,
        workflow: planned.workflow
      };
    }
  }

  const validation = validateFromToolResults(input.toolResults);
  if (validation) {
    return {
      ok: true,
      assistantMessage: validation.done
        ? "## Hotovo\n\nVykonané kroky prešli kontrolou."
        : `## Úlohu sa nepodarilo dokončiť\n\n${validation.missingChecks.join("; ")}`,
      plan: null,
      toolCalls: [],
      validation,
      requiresConfirmation: false,
      ragSources,
      phase: validation.done ? "complete" : "failed",
      classification: null,
      workflow: input.workflow ?? null
    };
  }

  const fallback = buildFallbackPlan(input);
  if (openAiFailure && fallback.calls.length === 0) {
    return {
      ok: true,
      assistantMessage: `## AI služba nie je dostupná\n\n${openAiFailure}`,
      plan: null,
      toolCalls: [],
      validation: null,
      requiresConfirmation: false,
      ragSources: [],
      phase: "failed",
      classification: null,
      workflow: null
    };
  }
  let generated: Partial<AssistantTurnResponse> | null = null;
  const geminiStartedAt = Date.now();
  const geminiModel = normalizeGeminiModel(
    process.env.GEMINI_ASSISTANT_MODEL ||
    (isLikelyFullKitchenRequest(input.message) ? DEFAULT_FLASH_MODEL : DEFAULT_LITE_MODEL)
  );
  try {
    generated = await callGeminiJson(input);
    debug.record({
      stage: "legacy_gemini_fallback",
      status: generated ? "completed" : "skipped",
      actor: {
        kind: "model",
        role: "legacy_fallback",
        model: geminiModel
      },
      durationMs: Date.now() - geminiStartedAt,
      input: { message: input.message, clientContext: input.clientContext },
      output: generated ?? { reason: "Gemini fallback is not configured or returned no output." }
    });
  } catch (error) {
    generated = null;
    debug.record({
      stage: "legacy_gemini_fallback",
      status: "failed",
      actor: {
        kind: "model",
        role: "legacy_fallback",
        model: geminiModel
      },
      durationMs: Date.now() - geminiStartedAt,
      input: { message: input.message, clientContext: input.clientContext },
      error: {
        name: error instanceof Error ? error.name : "Error",
        message: error instanceof Error ? error.message : String(error)
      }
    });
  }

  const generatedCalls = sanitizeAssistantToolCalls(generated?.toolCalls);
  const toolCalls = generatedCalls.length > 0 ? generatedCalls : sanitizeAssistantToolCalls(fallback.calls);
  const generatedMessage = typeof generated?.assistantMessage === "string" ? generated.assistantMessage.trim() : "";
  const claimsUnverifiedAction = /(idem|pocitam|kontrolujem|vykonavam|upravujem|vkladam|vytvaram|menim|spracuvavam)/u
    .test(normalizeIntentText(generatedMessage));
  const assistantMessage = generatedMessage && (toolCalls.length > 0 || !claimsUnverifiedAction)
    ? generatedMessage
    : fallback.message;
  const candidatePlan = generated?.plan && typeof generated.plan === "object" ? generated.plan : fallback.plan;
  const authoritative = enforceAuthoritativePlan(candidatePlan, toolCalls);

  return {
    ok: true,
    assistantMessage,
    plan: authoritative.plan,
    toolCalls,
    validation: null,
    requiresConfirmation: authoritative.requiresConfirmation,
    ragSources,
    phase: authoritative.plan ? "plan" : "answer",
    classification: null,
    workflow: null
  };
}

export async function runAssistantTurn(input: AgentInput): Promise<AssistantTurnResponse> {
  const debug = createAssistantDebugRecorder(input.debugTraceId);
  debug.record({
    stage: "assistant_turn_received",
    actor: { kind: "controller", role: "assistant_controller", model: null },
    input: {
      cycle: input.debugCycle ?? 0,
      message: input.message,
      clientContext: input.clientContext,
      conversation: input.conversation ?? [],
      workflow: input.workflow ?? null,
      toolResults: input.toolResults ?? [],
      ragChunks: input.ragChunks
    }
  });
  try {
    const response = await runAssistantTurnInternal(input, debug);
    if (response.classification) {
      debug.record({
        stage: "communicator_decision",
        actor: debug.hasModelStage("arcigy_task_classification")
          ? { kind: "model", role: "communicator", model: debug.modelForStage("arcigy_task_classification") }
          : { kind: "controller", role: "deterministic_router", model: null },
        output: response.classification
      });
    }
    if (response.workflow) {
      debug.record({
        stage: "workflow_state",
        actor: debug.hasModelStage("arcigy_atomic_workflow")
          ? { kind: "model", role: "orchestrator", model: debug.modelForStage("arcigy_atomic_workflow") }
          : { kind: "controller", role: "workflow_controller", model: null },
        output: response.workflow
      });
    }
    if (response.toolCalls.length > 0) {
      debug.record({
        stage: "tool_dispatch",
        actor: { kind: "controller", role: "workflow_controller", model: null },
        output: {
          requiresConfirmation: response.requiresConfirmation,
          calls: response.toolCalls
        }
      });
    }
    if (response.validation) {
      debug.record({
        stage: "analyzer_decision",
        actor: debug.hasModelStage("arcigy_workflow_analysis")
          ? { kind: "model", role: "analyzer", model: debug.modelForStage("arcigy_workflow_analysis") }
          : { kind: "analyzer", role: "deterministic_analyzer", model: null },
        output: response.validation
      });
    }
    debug.record({
      stage: "assistant_turn_response",
      actor: debug.hasModelStage("arcigy_final_message")
        ? { kind: "model", role: "final_communicator", model: debug.modelForStage("arcigy_final_message") }
        : { kind: "controller", role: "assistant_controller", model: null },
      output: {
        assistantMessage: response.assistantMessage,
        phase: response.phase ?? null,
        plan: response.plan,
        toolCalls: response.toolCalls,
        requiresConfirmation: response.requiresConfirmation,
        classification: response.classification ?? null,
        workflow: response.workflow ?? null,
        validation: response.validation,
        ragSources: response.ragSources
      }
    });
    return { ...response, debugTrace: debug.fragment() };
  } catch (error) {
    debug.record({
      stage: "assistant_turn_response",
      status: "failed",
      actor: { kind: "controller", role: "assistant_controller", model: null },
      error: {
        name: error instanceof Error ? error.name : "Error",
        message: error instanceof Error ? error.message : String(error)
      }
    });
    throw error;
  }
}
