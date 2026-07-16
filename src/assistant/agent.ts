import type {
  AssistantPlan,
  AssistantRagChunk,
  AssistantToolCall,
  AssistantToolResult,
  AssistantTurnRequest,
  AssistantTurnResponse,
  AssistantValidationReport
} from "./types";
import { assistantToolSummary } from "./toolRegistry";
import type { ClientCatalog } from "../core/catalog/catalog-types";
import { fetchExternalText } from "../server/external-http";
import {
  applyPinoResolvedQueryToParams,
  resolvePinoModuleDescription
} from "./pinoModuleResolver";

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
    "Si Arcigy Kitchen agent. Odpovedaj stručne po slovensky.",
    "Nesmieš tvrdiť fakty o appke bez RAG alebo live context dôkazu.",
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

function sanitizeToolCalls(calls: unknown): AssistantToolCall[] {
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
    .filter((call) => call.toolId);
}

export async function runAssistantTurn(input: AgentInput): Promise<AssistantTurnResponse> {
  const validation = validateFromToolResults(input.toolResults);
  if (validation) {
    return {
      ok: true,
      assistantMessage: validation.done ? "Hotovo. Zmeny prebehli a kontrola je v poriadku." : `Niečo zlyhalo: ${validation.missingChecks.join("; ")}`,
      plan: null,
      toolCalls: [],
      validation,
      requiresConfirmation: false,
      ragSources: input.ragChunks.slice(0, 4).map((chunk) => ({ source: chunk.source, title: chunk.title }))
    };
  }

  const fallback = buildFallbackPlan(input);
  let generated: Partial<AssistantTurnResponse> | null = null;
  try {
    generated = await callGeminiJson(input);
  } catch {
    generated = null;
  }

  const assistantMessage = typeof generated?.assistantMessage === "string" ? generated.assistantMessage : fallback.message;
  const plan = generated?.plan && typeof generated.plan === "object" ? generated.plan : fallback.plan;
  const toolCalls = sanitizeToolCalls(generated?.toolCalls).length > 0 ? sanitizeToolCalls(generated?.toolCalls) : fallback.calls;
  const requiresConfirmation = typeof generated?.requiresConfirmation === "boolean" ? generated.requiresConfirmation : fallback.confirm;

  return {
    ok: true,
    assistantMessage,
    plan,
    toolCalls,
    validation: null,
    requiresConfirmation,
    ragSources: input.ragChunks.slice(0, 4).map((chunk) => ({ source: chunk.source, title: chunk.title }))
  };
}
