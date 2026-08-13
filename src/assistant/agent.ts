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
import { assistantCopy } from "./assistantLocale";
import { validateAssistantToolCall } from "./toolValidation";
import type { ClientCatalog } from "../core/catalog/catalog-types";
import type { ClientRole } from "../core/client/client-types";
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

type AgentInput = AssistantTurnRequest & {
  ragChunks: AssistantRagChunk[];
  catalog?: Pick<ClientCatalog, "clientId" | "modules" | "vendorCatalog" | "kitchenDefaults">;
  actorRole?: ClientRole;
};

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

function isLivePriceQuestion(message: string): boolean {
  const normalized = normalizeIntentText(message);
  return /(kolko|aka|aky|suma|cena|cenu|stoja|stoji|nacen|price|cost|total).{0,48}(cena|cenu|stoja|stoji|suma|nacen|price|cost|dokopy|spolu|total)|(cena|cenu|stoja|stoji|suma|nacen|price|cost).{0,48}(oznacen|vybran|vyber|dokopy|spolu|total)/u.test(normalized);
}

function selectedModuleIds(input: AgentInput): string[] {
  return input.clientContext.selectedParams
    .filter((item) => item.kind === "module")
    .map((item) => item.id);
}

function normalizeIntentText(value: string): string {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/gu, "").toLowerCase().replace(/\s+/gu, " ").trim();
}

function isDeleteIntent(message: string): boolean {
  return /\b(vymaz|zmaz|odstran|delete|remove)\b/iu.test(normalizeIntentText(message));
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

  if (isLivePriceQuestion(input.message)) {
    toolId = "pricing.getSummary";
    goal = assistantCopy(input.locale, "Zistiť aktuálnu BOM cenu otvoreného projektu z live dát.", "Zjistit aktuální BOM cenu otevřeného projektu z živých dat.", "Find the current BOM price of the open project from live data.");
    stepLabel = assistantCopy(input.locale, "Prepočítať aktuálnu cenu z live BOM a overiť úplnosť cien.", "Přepočítat aktuální cenu z živého BOM a ověřit úplnost cen.", "Recalculate the current price from the live BOM and verify price completeness.");
    successCriteria = [assistantCopy(input.locale, "Odpoveď obsahuje aktuálnu cenu z live BOM, nie text zo znalostnej bázy.", "Odpověď obsahuje aktuální cenu z živého BOM, ne text ze znalostní báze.", "The response contains the current price from the live BOM, not knowledge-base text.")];
  } else if (/(kolko|pocet|spocitaj).{0,24}modul/u.test(message)) {
    toolId = "context.queryObjects";
    toolInput = { kinds: ["module"], limit: 500 };
    goal = assistantCopy(input.locale, "Zistiť presný počet modulov v otvorenom projekte.", "Zjistit přesný počet modulů v otevřeném projektu.", "Find the exact number of modules in the open project.");
    stepLabel = assistantCopy(input.locale, "Prečítať moduly z otvoreného projektu a spočítať ich.", "Načíst moduly z otevřeného projektu a spočítat je.", "Read and count modules in the open project.");
    successCriteria = [assistantCopy(input.locale, "Odpoveď obsahuje počet modulov z čerstvého live kontextu.", "Odpověď obsahuje počet modulů z aktuálního živého kontextu.", "The response contains the module count from current live context.")];
  } else if (/^(ako.{0,12}vola|aky.{0,12}(je )?nazov|co.{0,12}(je )?nazov|povedz.{0,12}nazov).{0,30}projekt|^nazov.{0,12}projekt/u.test(message)) {
    toolId = "project.getMetadata";
    goal = assistantCopy(input.locale, "Zistiť presný názov otvoreného projektu.", "Zjistit přesný název otevřeného projektu.", "Find the exact name of the open project.");
    stepLabel = assistantCopy(input.locale, "Prečítať názov z aktuálnych projektových metadát.", "Načíst název z aktuálních metadat projektu.", "Read the name from the current project metadata.");
    successCriteria = [assistantCopy(input.locale, "Odpoveď obsahuje presný názov aktuálne otvoreného projektu.", "Odpověď obsahuje přesný název aktuálně otevřeného projektu.", "The response contains the exact name of the currently open project.")];
  } else if (/(aktualn|sucasn|teraj).{0,20}(pohlad|view)|ak[yae].{0,12}(pohlad|view)/u.test(message)) {
    toolId = "context.getCurrentView";
    goal = assistantCopy(input.locale, "Zistiť aktuálny pohľad a stav kamery.", "Zjistit aktuální pohled a stav kamery.", "Find the current view and camera state.");
    stepLabel = assistantCopy(input.locale, "Prečítať aktuálny pohľad, projekciu a režim zobrazenia.", "Načíst aktuální pohled, projekci a režim zobrazení.", "Read the current view, projection and display mode.");
    successCriteria = [assistantCopy(input.locale, "Odpoveď obsahuje aktuálny pohľad, projekciu a režim zobrazenia.", "Odpověď obsahuje aktuální pohled, projekci a režim zobrazení.", "The response contains the current view, projection and display mode.")];
  } else if (/(co|ktore|aky|aktualn).{0,24}(oznacen|vybran|vyber)|oznacen.{0,12}(objekt|modul)/u.test(message)) {
    toolId = "context.getSelection";
    goal = assistantCopy(input.locale, "Zistiť aktuálny výber v editore.", "Zjistit aktuální výběr v editoru.", "Find the current selection in the editor.");
    stepLabel = assistantCopy(input.locale, "Prečítať označené objekty a ich aktuálne parametre.", "Načíst označené objekty a jejich aktuální parametry.", "Read selected objects and their current parameters.");
    successCriteria = [assistantCopy(input.locale, "Odpoveď vychádza z čerstvého výberu a jeho parametrov.", "Odpověď vychází z aktuálního výběru a jeho parametrů.", "The response is based on the current selection and its parameters.")];
  } else if (/(skontroluj|over|valid).{0,30}(projekt|kuchyn)|problemy.{0,20}(projekt|kuchyn)/u.test(message)) {
    toolId = "validation.inspectProject";
    goal = assistantCopy(input.locale, "Skontrolovať otvorený projekt a nájsť chyby.", "Zkontrolovat otevřený projekt a najít chyby.", "Inspect the open project and find issues.");
    stepLabel = assistantCopy(input.locale, "Spustiť nezávislú kontrolu väzieb a parametrov projektu.", "Spustit nezávislou kontrolu vazeb a parametrů projektu.", "Run an independent validation of project links and parameters.");
    successCriteria = [assistantCopy(input.locale, "Odpoveď obsahuje výsledok nezávislej validácie projektu.", "Odpověď obsahuje výsledek nezávislé validace projektu.", "The response contains the result of independent project validation.")];
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
  const wantsDelete = isDeleteIntent(input.message);
  if (wantsDelete) {
    const ids = selectedModuleIds(input);
    if (ids.length === 0) {
      return {
        message: assistantCopy(input.locale, "Nemám vybraný žiadny modul na odstránenie. Najprv označ konkrétne moduly; potom ti ukážem plán na potvrdenie.", "Nemám vybraný žádný modul k odstranění. Nejprve označte konkrétní moduly; potom ukážu plán k potvrzení.", "No module is selected for deletion. Select the exact modules first; I will then show a plan for confirmation."),
        plan: null,
        calls: [],
        confirm: false
      };
    }
    return {
      message: assistantCopy(input.locale, `Pripravil som odstránenie ${ids.length} označených modulov. Nič som ešte nezmenil.`, `Připravil jsem odstranění ${ids.length} označených modulů. Zatím jsem nic nezměnil.`, `I prepared removal of ${ids.length} selected modules. Nothing has been changed yet.`),
      plan: {
        goal: assistantCopy(input.locale, "Odstrániť iba aktuálne označené moduly po potvrdení.", "Odstranit pouze aktuálně označené moduly po potvrzení.", "Remove only the currently selected modules after confirmation."),
        riskLevel: "high",
        requiresConfirmation: true,
        touchedObjects: ids,
        steps: [
          { label: assistantCopy(input.locale, "Po potvrdení odstránim presne označené moduly.", "Po potvrzení odstraním přesně označené moduly.", "After confirmation, remove exactly the selected modules."), toolId: "editor.deleteSelection", riskLevel: "high" },
          { label: assistantCopy(input.locale, "Overím stav výberu a projektu.", "Ověřím stav výběru a projektu.", "Verify selection and project state."), toolId: "validation.inspectProject", riskLevel: "low" }
        ]
      },
      calls: [{ id: `tool_${Date.now()}_delete_selection`, toolId: "editor.deleteSelection", input: {} }],
      confirm: true
    };
  }
  if (!isHowToQuestion(input.message) && isLikelyModulePatch(input.message)) {
    const ids = selectedModuleIds(input);
    if (ids.length === 0) {
      return {
        message: assistantCopy(input.locale, "Na úpravu modulu najprv označ konkrétny modul. Potom viem bezpečne meniť jeho parametre cez existujúci rebuild systém.", "Pro úpravu modulu nejprve označte konkrétní modul. Potom lze jeho parametry bezpečně změnit přes existující systém přestavby.", "To edit a module, first select a specific module. Its parameters can then be changed safely through the existing rebuild system."),
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
        message: assistantCopy(input.locale, "Rozumiem, že chceš upraviť označený modul, ale neviem z textu bezpečne vyčítať konkrétny parameter. Napíš napríklad `šírka 800` alebo `šuplíky 3`.", "Rozumím, že chcete upravit označený modul, ale z textu nelze bezpečně určit konkrétní parametr. Napište například `šířka 800` nebo `zásuvky 3`.", "I understand that you want to edit the selected module, but I cannot safely determine a specific parameter from the text. Try `width 800` or `drawers 3`."),
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

  const sources = input.ragChunks
    .filter((chunk) => /(^|\/)docs\/|\.md$/iu.test(chunk.source) && !/\.json$/iu.test(chunk.source))
    .slice(0, 3);
  const sourceText = sources.length > 0
    ? sources.map((chunk) => `- ${chunk.title}: ${chunk.text.slice(0, 360)}`).join("\n")
    : "";
  return {
    message: sourceText
      ? `${assistantCopy(input.locale, "Podľa znalostnej bázy:", "Podle znalostní báze:", "According to the knowledge base:")}\n${sourceText}`
      : assistantCopy(input.locale, "Toto zatiaľ neviem bezpečne potvrdiť zo znalostnej bázy. Skús sa opýtať konkrétnejšie alebo označ objekt v editore.", "Toto zatím nelze bezpečně potvrdit ze znalostní báze. Zeptejte se konkrétněji nebo označte objekt v editoru.", "I cannot safely confirm this from the knowledge base yet. Ask more specifically or select an object in the editor."),
    plan: null,
    calls: [],
    confirm: false
  };
}

function buildPrompt(input: AgentInput): string {
  const rag = input.ragChunks.map((chunk) => `[${chunk.source}] ${chunk.title}\n${chunk.text}`).join("\n\n---\n\n");
  return [
    `You are Arcigy Kitchen agent. Reply in ${input.locale === "cs-CZ" ? "professional Czech" : input.locale === "en-GB" ? "professional British English" : "professional Slovak"} and use clean CommonMark Markdown without HTML.`,
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

function validateFromToolResults(results: AssistantToolResult[] | undefined, locale: AgentInput["locale"]): AssistantValidationReport | null {
  if (!results || results.length === 0) return null;
  const failed = results.filter((result) => !result.ok);
  return {
    confidence: failed.length === 0 ? 0.86 : 0.38,
    done: failed.length === 0,
    summary: failed.length === 0
      ? assistantCopy(locale, "Nástroje prebehli úspešne.", "Nástroje proběhly úspěšně.", "The tools completed successfully.")
      : assistantCopy(locale, `Zlyhalo ${failed.length} krokov.`, `Selhaly ${failed.length} kroky.`, `${failed.length} steps failed.`),
    missingChecks: failed.map((result) => result.error ?? `${result.toolId} failed`),
    nextAction: failed.length === 0 ? undefined : assistantCopy(locale, "Skontrolovať vstupy a zopakovať len zlyhaný krok.", "Zkontrolujte vstupy a zopakujte pouze neúspěšný krok.", "Check the inputs and repeat only the failed step.")
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
  const requiresConfirmation = definitions.some((definition) =>
    definition.requiresConfirmation || (definition.operation ?? (definition.readOnly ? "read" : "write")) === "write"
  );
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

function hasClientDeliverable(toolResults: AssistantToolResult[]): boolean {
  return toolResults.some((result) => {
    if (!result.ok || result.toolId !== "render.blenderPreview") return false;
    const output = result.output;
    return !!output && typeof output === "object" && !Array.isArray(output)
      && (output as Record<string, unknown>).status === "completed"
      && typeof (output as Record<string, unknown>).previewUrl === "string";
  });
}

async function runAssistantTurnInternal(
  input: AgentInput,
  debug: AssistantDebugRecorder
): Promise<AssistantTurnResponse> {
  const assistantLocale = input.locale ?? "sk-SK";
  const ragSources = input.ragChunks.slice(0, 4).map((chunk) => ({ source: chunk.source, title: chunk.title }));
  const orchestrationInput = {
    locale: assistantLocale,
    message: input.message,
    clientContext: input.clientContext,
    conversation: input.conversation,
    ragChunks: input.ragChunks,
    actorRole: input.actorRole,
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
          assistantMessage: assistantCopy(assistantLocale, "Doterajšie kroky prešli kontrolou. Pokračujem ďalšími závislými krokmi workflowu.", "Dosavadní kroky prošly kontrolou. Pokračuji dalšími závislými kroky workflowu.", "The completed steps passed verification. Continuing with the next dependent workflow steps."),
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
        const dependencyError = assistantCopy(assistantLocale, "Workflow obsahuje nevykonateľnú alebo cyklickú závislosť.", "Workflow obsahuje neproveditelnou nebo cyklickou závislost.", "The workflow contains an unexecutable or cyclic dependency.");
        const failedWorkflow = { ...workflow, status: "failed" as const, lastError: dependencyError };
        return {
          ok: true,
          assistantMessage: assistantCopy(assistantLocale, "Workflow sa zastavil: zostávajúce kroky nemajú splnené závislosti.", "Workflow se zastavil: zbývající kroky nemají splněné závislosti.", "The workflow stopped because remaining steps have unmet dependencies."),
          plan: workflowToPlan(failedWorkflow),
          toolCalls: [],
          validation: {
            ...analysis.validation,
            done: false,
            summary: dependencyError,
            missingChecks: [...analysis.validation.missingChecks, assistantCopy(assistantLocale, "Skontrolovať väzby dependsOn workflowu.", "Zkontrolovat vazby dependsOn workflowu.", "Check the workflow's dependsOn links.")],
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
      const finalMessage = hasOnlyReadEvidence || hasClientDeliverable(input.toolResults)
          ? formatVerifiedAssistantResult({
            workflow: completeWorkflow,
            validation: analysis.validation,
            toolResults: input.toolResults
          })
          : await composeFinalAssistantMessage({
            locale: assistantLocale,
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
        locale: assistantLocale,
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

  if (isDeleteIntent(input.message)) {
    const fallback = buildFallbackPlan(input);
    const toolCalls = sanitizeAssistantToolCalls(fallback.calls);
    const authoritative = enforceAuthoritativePlan(fallback.plan, toolCalls);
    return {
      ok: true,
      assistantMessage: fallback.message,
      plan: authoritative.plan,
      toolCalls,
      validation: null,
      requiresConfirmation: authoritative.requiresConfirmation,
      ragSources: [],
      phase: authoritative.plan ? "plan" : "answer",
      classification: null,
      workflow: null
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
      assistantCopy(assistantLocale, "OpenAI API sa nepodarilo použiť. Požiadavku môžete bezpečne zopakovať.", "Rozhraní OpenAI API se nepodařilo použít. Požadavek můžete bezpečně zopakovat.", "The OpenAI API could not be used. You can safely retry the request.");
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
        assistantCopy(assistantLocale, "OpenAI API sa nepodarilo použiť. Požiadavku môžete bezpečne zopakovať.", "Rozhraní OpenAI API se nepodařilo použít. Požadavek můžete bezpečně zopakovat.", "The OpenAI API could not be used. You can safely retry the request.");
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

  const validation = validateFromToolResults(input.toolResults, input.locale);
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
  const toolCalls = sanitizeAssistantToolCalls(fallback.calls);
  const authoritative = enforceAuthoritativePlan(fallback.plan, toolCalls);

  return {
    ok: true,
    assistantMessage: fallback.message,
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
    return {
      ...response,
      capabilityDiscovery: response.workflow?.capabilityDiscovery,
      debugTrace: debug.fragment()
    };
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
