import type {
  AssistantClientContext,
  AssistantToolCall,
  AssistantToolDefinition,
  AssistantToolResult,
  AssistantTurnResponse,
  AssistantWorkflowState
} from "../../assistant/types";
import { assistantMarkdownToSafeHtml } from "./assistantMarkdown";
import { actionIconMarkup, type ActionIconId } from "../actionIcons";
import { bindIconTooltip } from "../iconTooltips";
import {
  appendAssistantDebugEvent,
  appendServerDebugTrace,
  completeAssistantDebugTrace,
  createAssistantDebugTraceBundle,
  serializeAssistantDebugTrace,
  type AssistantDebugTraceBundle
} from "./assistantDebugTrace";

type ChatbotDockArgs = {
  appRoot: HTMLElement;
};

const launcherId = "arcigy-chatbot-launcher";
const panelId = "arcigy-chatbot-panel";
const animationMs = 230;

export function createChatbotDock(args: ChatbotDockArgs): void {
  document.getElementById(launcherId)?.remove();
  document.getElementById(panelId)?.remove();
  args.appRoot.classList.remove("chatbot-docked");

  const launcher = document.createElement("button");
  launcher.id = launcherId;
  launcher.className = "chatbot-launcher";
  launcher.type = "button";
  launcher.setAttribute("aria-label", "Open assistant");
  launcher.innerHTML = `<span>A</span>`;
  document.body.appendChild(launcher);
  requestAnimationFrame(() => launcher.classList.add("is-visible"));

  launcher.addEventListener("click", () => openDockedChatbot(args.appRoot));
}

export function renderChatbotOnly(root: HTMLElement): void {
  root.className = "chatbot-window-shell";
  root.innerHTML = "";
  const panel = createChatbotPanel({ standalone: true, onClose: null });
  root.appendChild(panel);
}

function openDockedChatbot(appRoot: HTMLElement): void {
  const launcher = document.getElementById(launcherId);
  launcher?.classList.add("is-leaving");
  window.setTimeout(() => launcher?.remove(), animationMs);
  document.getElementById(panelId)?.remove();
  appRoot.classList.add("chatbot-docked");

  let closing = false;
  const panel = createChatbotPanel({
    standalone: false,
    onClose: () => {
      if (closing) return;
      closing = true;
      panel.classList.add("is-closing");
      appRoot.classList.remove("chatbot-docked");
      window.setTimeout(() => {
        panel.remove();
        createChatbotDock({ appRoot });
      }, animationMs);
    }
  });
  panel.id = panelId;
  document.body.appendChild(panel);
}

function createChatbotPanel(args: { standalone: boolean; onClose: (() => void) | null }): HTMLElement {
  const shell = document.createElement("aside");
  shell.className = args.standalone ? "chatbot-panel standalone" : "chatbot-panel";
  shell.setAttribute("aria-label", "Arcigy assistant");
  shell.innerHTML = `
    <header class="chatbot-header">
      <div>
        <span class="chatbot-app-icon">A</span>
        <strong>Arcigy Assistant</strong>
      </div>
      <div class="chatbot-header-actions">
        <button type="button" class="chatbot-debug-button" data-chatbot-copy-debug aria-label="Kopírovať debug JSON" title="Kopírovať kompletný debug JSON" disabled>{ }</button>
        <button type="button" data-chatbot-menu aria-haspopup="menu" aria-expanded="false" aria-label="Assistant options">
          <span></span><span></span><span></span>
        </button>
        ${args.standalone ? "" : `<button type="button" data-chatbot-close aria-label="Close assistant">×</button>`}
      </div>
      <div class="chatbot-menu" data-chatbot-menu-panel role="menu" hidden>
        <button type="button" data-chatbot-popout role="menuitem">Otvoriť v novom okne</button>
      </div>
    </header>
    <main class="chatbot-body" data-chatbot-body>
      <div class="chatbot-empty" data-chatbot-empty>
        <div class="chatbot-mark" aria-hidden="true">
          <i></i><i></i><i></i>
        </div>
        <strong>Čo dnes navrhneme?</strong>
        <p>Opíšte výsledok. Rozmery a rozhodnutia premením na bezpečné kroky v otvorenom projekte.</p>
        <div class="chatbot-suggestions">
          <button type="button" data-chatbot-prompt="Koľko modulov je v aktuálnej kuchyni?">Spočítať moduly</button>
          <button type="button" data-chatbot-prompt="Ukáž mi aktuálny výber spredu v 3D.">Zobraziť výber</button>
          <button type="button" data-chatbot-prompt="Skontroluj aktuálny projekt a nájdi problémy.">Skontrolovať projekt</button>
        </div>
      </div>
    </main>
    <footer class="chatbot-composer-wrap">
      <div class="chatbot-context">
        <span class="chatbot-context-icon">A</span>
        <span>Arcigy Kitchen Layout</span>
      </div>
      <form class="chatbot-composer">
        <textarea placeholder="Pýtajte sa na čokoľvek..." rows="1" aria-label="Assistant message"></textarea>
        <div class="chatbot-composer-actions">
          <button type="button" data-chatbot-attachment aria-label="Add attachment">+</button>
          <span></span>
          <button type="button" data-chatbot-preview-context aria-label="Preview context">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.8 12s3.3-5.2 9.2-5.2S21.2 12 21.2 12s-3.3 5.2-9.2 5.2S2.8 12 2.8 12Z"/><circle cx="12" cy="12" r="2.4"/></svg>
          </button>
          <button type="button" data-chatbot-voice aria-label="Voice">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v9"/><path d="M8 9v2a4 4 0 0 0 8 0V9"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3"/></svg>
          </button>
          <button type="submit" class="chatbot-send" data-chatbot-send aria-label="Send message">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14"/><path d="M7 10l5-5 5 5"/></svg>
          </button>
        </div>
      </form>
    </footer>
  `;

  setChatbotActionIcon(shell, "[data-chatbot-copy-debug]", "debug");
  setChatbotActionIcon(shell, "[data-chatbot-menu]", "menu");
  setChatbotActionIcon(shell, "[data-chatbot-close]", "close");
  setChatbotActionIcon(shell, "[data-chatbot-attachment]", "attachment");
  setChatbotActionIcon(shell, "[data-chatbot-preview-context]", "previewContext");
  setChatbotActionIcon(shell, "[data-chatbot-voice]", "voice");
  setChatbotActionIcon(shell, "[data-chatbot-send]", "send");

  const menuButton = shell.querySelector<HTMLButtonElement>("[data-chatbot-menu]");
  const menuPanel = shell.querySelector<HTMLElement>("[data-chatbot-menu-panel]");
  const closeMenu = () => {
    if (!menuButton || !menuPanel) return;
    menuPanel.hidden = true;
    menuButton.setAttribute("aria-expanded", "false");
  };
  menuButton?.addEventListener("click", (event) => {
    event.stopPropagation();
    if (!menuPanel) return;
    const open = menuPanel.hidden;
    menuPanel.hidden = !open;
    menuButton.setAttribute("aria-expanded", String(open));
  });
  menuPanel?.addEventListener("click", (event) => event.stopPropagation());
  shell.querySelector<HTMLButtonElement>("[data-chatbot-close]")?.addEventListener("click", () => args.onClose?.());
  shell.querySelector<HTMLButtonElement>("[data-chatbot-popout]")?.addEventListener("click", () => {
    closeMenu();
    args.onClose?.();
    const url = new URL(window.location.href);
    url.search = "?chatbot=1";
    url.hash = "";
    window.open(url.toString(), "arcigy-chatbot", "popup,width=460,height=860");
  });
  bindAssistantChat(shell);
  document.addEventListener("click", closeMenu);
  return shell;
}

function setChatbotActionIcon(shell: HTMLElement, selector: string, iconId: ActionIconId): void {
  const button = shell.querySelector<HTMLButtonElement>(selector);
  if (!button) return;
  button.innerHTML = actionIconMarkup(iconId);
  bindIconTooltip(button);
}

type ChatbotState = {
  conversation: Array<{ role: "user" | "assistant" | "tool"; content: string }>;
  workflow: AssistantWorkflowState | null;
  busy: boolean;
  debugTrace: AssistantDebugTraceBundle | null;
};

function fallbackContext(): AssistantClientContext {
  return {
    projectId: null,
    phaseId: null,
    viewMode: "unknown",
    activeViewerTab: "unknown",
    layoutTool: "select",
    selectedKind: null,
    selectedKitchenGroupId: null,
    activeKitchenGroupId: null,
    selectedInstanceIds: [],
    selectedWallIds: [],
    selectedParams: [],
    catalogSummary: { materialCount: 0, componentCount: 0, moduleCount: 0, moduleTypes: [] }
  };
}

function bridge() {
  return window.__arcigyAssistant ?? null;
}

function getToolDefinitions(): AssistantToolDefinition[] {
  return bridge()?.getToolDefinitions() ?? [];
}

export function shouldRenderAssistantPlan(
  response: Pick<AssistantTurnResponse, "plan" | "requiresConfirmation">,
  definitions: AssistantToolDefinition[]
): boolean {
  if (!response.plan) return false;
  if (response.requiresConfirmation) return true;
  const byId = new Map(definitions.map((definition) => [definition.id, definition]));
  return response.plan.steps.some((step) => {
    if (!step.toolId) return true;
    return byId.get(step.toolId)?.readOnly !== true;
  });
}

function getContextSnapshot(): AssistantClientContext {
  return bridge()?.getContextSnapshot() ?? fallbackContext();
}

function appendMessage(body: HTMLElement, role: "user" | "assistant" | "tool", text: string): HTMLElement {
  body.querySelector("[data-chatbot-empty]")?.remove();
  const message = document.createElement("div");
  message.className = `chatbot-message ${role}`;
  if (role === "assistant") {
    const content = document.createElement("div");
    content.className = "chatbot-markdown";
    content.innerHTML = assistantMarkdownToSafeHtml(text);
    message.appendChild(content);
  } else {
    message.textContent = text;
  }
  body.appendChild(message);
  body.scrollTop = body.scrollHeight;
  return message;
}

type ActivityState = "thinking" | "executing" | "verifying" | "waiting" | "error";

function setActivity(body: HTMLElement, state: ActivityState | null, title = "", detail = ""): void {
  let activity = body.querySelector<HTMLElement>("[data-chatbot-activity]");
  if (!state) {
    activity?.remove();
    return;
  }
  if (!activity) {
    activity = document.createElement("section");
    activity.dataset.chatbotActivity = "";
    activity.className = "chatbot-activity";
    activity.setAttribute("aria-live", "polite");
    body.appendChild(activity);
  }
  activity.dataset.state = state;
  activity.innerHTML = `<span class="chatbot-activity-indicator" aria-hidden="true"><i></i><i></i><i></i></span><div><strong>${escapeHtml(title)}</strong>${detail ? `<span>${escapeHtml(detail)}</span>` : ""}</div>`;
  body.scrollTop = body.scrollHeight;
}

function renderPlan(body: HTMLElement, response: AssistantTurnResponse, onApply: () => void): void {
  if (!response.plan) return;
  const workflowId = response.workflow?.workflowId ?? "single";
  let card = Array.from(body.querySelectorAll<HTMLElement>("[data-chatbot-plan]"))
    .find((candidate) => candidate.dataset.workflowId === workflowId);
  if (!card) {
    card = document.createElement("section");
    card.dataset.chatbotPlan = "";
    card.dataset.workflowId = workflowId;
    body.appendChild(card);
  }
  card.className = "chatbot-plan";
  const completed = new Set(response.workflow?.completedStepIds ?? []);
  const list = response.workflow
    ? response.workflow.steps.map((step) => `<li class="${completed.has(step.id) ? "is-complete" : ""}"><span>${completed.has(step.id) ? "✓" : ""}</span><div>${escapeHtml(step.label)}</div></li>`).join("")
    : response.plan.steps.map((step) => `<li><span></span><div>${escapeHtml(step.label)}</div></li>`).join("");
  const riskLabel = response.plan.riskLevel === "high" ? "Vyžaduje potvrdenie" : response.plan.riskLevel === "medium" ? "Kontrolovaná zmena" : "Bezpečné čítanie";
  card.innerHTML = `
    <header><div><span>Plán</span><strong>${escapeHtml(response.plan.goal)}</strong></div><small data-risk="${response.plan.riskLevel}">${riskLabel}</small></header>
    <ol>${list}</ol>
    ${response.requiresConfirmation ? `<div class="chatbot-confirm"><p>Zmena sa vykoná až po vašom potvrdení.</p><button type="button" data-chatbot-apply>Potvrdiť a vykonať</button></div>` : ""}
  `;
  card.querySelector<HTMLButtonElement>("[data-chatbot-apply]")?.addEventListener("click", (event) => {
    const button = event.currentTarget as HTMLButtonElement;
    button.disabled = true;
    button.textContent = "Vykonávam…";
    onApply();
  }, { once: true });
  body.scrollTop = body.scrollHeight;
}

async function postAssistantTurn(
  pathname: "/api/assistant/turn" | "/api/assistant/continue",
  state: ChatbotState,
  message: string,
  cycle: number,
  toolResults?: AssistantToolResult[]
) {
  const payload = {
    message,
    clientContext: getContextSnapshot(),
    conversation: state.conversation.slice(-12),
    toolResults,
    toolDefinitions: getToolDefinitions(),
    workflow: state.workflow,
    debugTraceId: state.debugTrace?.traceId,
    debugCycle: cycle
  };
  const startedAt = Date.now();
  if (state.debugTrace) {
    appendAssistantDebugEvent(state.debugTrace, {
      stage: "assistant_http_request",
      actor: { kind: "client", role: "chatbot_ui", model: null },
      input: { pathname, payload }
    });
  }
  try {
    const response = await fetch(pathname, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload)
    });
    const data = await response.json() as AssistantTurnResponse | { ok: false; error?: string };
    if (!response.ok || !data.ok) throw new Error(!data.ok ? data.error ?? `HTTP ${response.status}` : `HTTP ${response.status}`);
    if (state.debugTrace) {
      appendServerDebugTrace(state.debugTrace, data.debugTrace);
      appendAssistantDebugEvent(state.debugTrace, {
        stage: "assistant_http_response",
        actor: { kind: "client", role: "chatbot_ui", model: null },
        durationMs: Date.now() - startedAt,
        input: { pathname, cycle },
        output: {
          status: response.status,
          phase: data.phase ?? null,
          turnId: data.debugTrace?.turnId ?? null
        }
      });
    }
    return data;
  } catch (error) {
    if (state.debugTrace) {
      appendAssistantDebugEvent(state.debugTrace, {
        stage: "assistant_http_response",
        status: "failed",
        actor: { kind: "client", role: "chatbot_ui", model: null },
        durationMs: Date.now() - startedAt,
        input: { pathname, cycle },
        error: {
          name: error instanceof Error ? error.name : "Error",
          message: error instanceof Error ? error.message : String(error)
        }
      });
    }
    throw error;
  }
}

async function executeToolCalls(
  calls: AssistantToolCall[],
  confirmed: boolean,
  state: ChatbotState
): Promise<AssistantToolResult[]> {
  const activeBridge = bridge();
  if (!activeBridge) {
    return calls.map((call) => {
      const result = { ok: false, toolId: call.toolId, callId: call.id, error: "Live editor bridge is not available." };
      if (state.debugTrace) {
        appendAssistantDebugEvent(state.debugTrace, {
          stage: "tool_execution",
          status: "failed",
          actor: { kind: "executor", role: "deterministic_editor_executor", model: null },
          input: { ...call, confirmed },
          output: result
        });
      }
      return result;
    });
  }
  const results: AssistantToolResult[] = [];
  const definitions = new Map(getToolDefinitions().map((definition) => [definition.id, definition]));
  for (const call of calls) {
    const startedAt = Date.now();
    const result = await activeBridge.executeToolCall({ ...call, confirmed });
    results.push(result);
    if (state.debugTrace) {
      const definition = definitions.get(call.toolId);
      appendAssistantDebugEvent(state.debugTrace, {
        stage: "tool_execution",
        status: result.ok ? "completed" : "failed",
        actor: {
          kind: "executor",
          role: definition ? `deterministic_executor:${definition.ownerSystem}` : "deterministic_editor_executor",
          model: null
        },
        durationMs: Date.now() - startedAt,
        input: {
          call: { ...call, confirmed },
          definition: definition ?? null
        },
        output: result,
        ...(result.ok ? {} : {
          error: {
            name: "AssistantToolExecutionError",
            message: result.error ?? "Tool execution failed."
          }
        })
      });
    }
  }
  return results;
}

async function copyText(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(value);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("Clipboard copy is not available.");
}

function setBusy(shell: HTMLElement, busy: boolean): void {
  const form = shell.querySelector<HTMLFormElement>(".chatbot-composer");
  const textarea = shell.querySelector<HTMLTextAreaElement>("textarea");
  const send = shell.querySelector<HTMLButtonElement>(".chatbot-send");
  if (textarea) textarea.disabled = busy;
  if (send) send.disabled = busy;
  form?.classList.toggle("is-busy", busy);
}

function bindAssistantChat(shell: HTMLElement): void {
  const body = shell.querySelector<HTMLElement>("[data-chatbot-body]");
  const form = shell.querySelector<HTMLFormElement>(".chatbot-composer");
  const textarea = shell.querySelector<HTMLTextAreaElement>("textarea");
  if (!body || !form || !textarea) return;

  const state: ChatbotState = { conversation: [], workflow: null, busy: false, debugTrace: null };
  const maxClientCycles = 8;
  const debugButton = shell.querySelector<HTMLButtonElement>("[data-chatbot-copy-debug]");
  const updateDebugButton = () => {
    if (!debugButton) return;
    debugButton.disabled = !state.debugTrace;
    debugButton.title = state.debugTrace
      ? "Kopírovať kompletný debug JSON poslednej požiadavky"
      : "Debug JSON bude dostupný po odoslaní požiadavky";
  };
  debugButton?.addEventListener("click", () => {
    if (!state.debugTrace || !debugButton) return;
    void copyText(serializeAssistantDebugTrace(state.debugTrace))
      .then(() => {
        debugButton.classList.add("is-copied");
        debugButton.textContent = "✓";
        debugButton.setAttribute("aria-label", "Debug JSON skopírovaný");
        window.setTimeout(() => {
          debugButton.classList.remove("is-copied");
          debugButton.textContent = "{ }";
          debugButton.setAttribute("aria-label", "Kopírovať debug JSON");
        }, 1400);
      })
      .catch(() => {
        debugButton.textContent = "!";
        window.setTimeout(() => {
          debugButton.textContent = "{ }";
        }, 1400);
      });
  });
  updateDebugButton();

  let continueWithTools: (message: string, calls: AssistantToolCall[], confirmed: boolean, cycle: number) => Promise<void>;

  const handleResponse = async (message: string, response: AssistantTurnResponse, cycle: number): Promise<void> => {
    state.workflow = response.workflow ?? state.workflow;
    const showPlan = shouldRenderAssistantPlan(response, getToolDefinitions());
    const visibleResponse = response.phase === "answer" || response.phase === "clarify" || response.phase === "complete" || response.phase === "failed" || (!response.plan && response.toolCalls.length === 0);
    if (visibleResponse && response.assistantMessage.trim()) {
      state.conversation.push({ role: "assistant", content: response.assistantMessage });
      appendMessage(body, "assistant", response.assistantMessage);
    }
    if (response.toolCalls.length === 0) {
      if (showPlan) renderPlan(body, response, () => undefined);
      else body.querySelectorAll("[data-chatbot-plan]").forEach((plan) => plan.remove());
      setActivity(body, null);
      state.busy = false;
      setBusy(shell, false);
      if (state.debugTrace) completeAssistantDebugTrace(state.debugTrace);
      updateDebugButton();
      return;
    }
    const executeConfirmed = () => {
      void continueWithTools(message, [...response.toolCalls], true, cycle + 1).catch((error: unknown) => {
        appendMessage(body, "assistant", `## Nepodarilo sa pokračovať\n\n${error instanceof Error ? error.message : String(error)}`);
        setActivity(body, null);
        setBusy(shell, false);
        state.busy = false;
      });
    };
    if (showPlan) renderPlan(body, response, executeConfirmed);
    else body.querySelectorAll("[data-chatbot-plan]").forEach((plan) => plan.remove());
    if (response.requiresConfirmation) {
      setActivity(body, "waiting", "Čakám na potvrdenie", "Skontrolujte plán pred vykonaním zmien.");
      setBusy(shell, false);
      return;
    }
    await continueWithTools(message, response.toolCalls, false, cycle + 1);
  };

  continueWithTools = async (message: string, calls: AssistantToolCall[], confirmed: boolean, cycle: number) => {
    if (cycle > maxClientCycles) throw new Error("Assistant execution stopped at the client iteration safety limit.");
    state.busy = true;
    setBusy(shell, true);
    setActivity(body, "executing", "Vykonávam plán", `${calls.length} ${calls.length === 1 ? "krok" : "kroky"}`);
    const results = await executeToolCalls(calls, confirmed, state);
    const failedCount = results.filter((result) => !result.ok).length;
    setActivity(body, failedCount > 0 ? "error" : "verifying", failedCount > 0 ? "Kontrolujem chybu" : "Overujem výsledok", failedCount > 0 ? `${failedCount} krokov potrebuje opravu.` : "Porovnávam výsledok so zadaním.");
    const next = await postAssistantTurn("/api/assistant/continue", state, message, cycle, results);
    await handleResponse(message, next, cycle);
  };

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (state.busy) return;
    const message = textarea.value.trim();
    if (!message) return;
    textarea.value = "";
    state.debugTrace = createAssistantDebugTraceBundle({
      message,
      context: getContextSnapshot(),
      toolDefinitions: getToolDefinitions()
    });
    appendAssistantDebugEvent(state.debugTrace, {
      stage: "user_request_submitted",
      actor: { kind: "client", role: "chatbot_ui", model: null },
      input: { message }
    });
    updateDebugButton();
    state.conversation.push({ role: "user", content: message });
    appendMessage(body, "user", message);
    body.querySelectorAll<HTMLButtonElement>("[data-chatbot-apply]").forEach((button) => {
      button.disabled = true;
      button.textContent = "Plán bol nahradený";
    });
    setBusy(shell, true);
    state.busy = true;
    setActivity(body, "thinking", "Spracúvam zadanie", "Čítam aktuálny projekt a pripravujem bezpečný postup.");

    void postAssistantTurn("/api/assistant/turn", state, message, 0)
      .then(async (response) => {
        state.workflow = null;
        await handleResponse(message, response, 0);
      })
      .catch((error: unknown) => {
        if (state.debugTrace) completeAssistantDebugTrace(state.debugTrace);
        updateDebugButton();
        appendMessage(body, "assistant", `## Nepodarilo sa spracovať požiadavku\n\n${error instanceof Error ? error.message : String(error)}`);
        setActivity(body, null);
        setBusy(shell, false);
        state.busy = false;
      });
  });

  shell.querySelectorAll<HTMLButtonElement>("[data-chatbot-prompt]").forEach((button) => {
    button.addEventListener("click", () => {
      textarea.value = button.dataset.chatbotPrompt ?? "";
      form.requestSubmit();
    });
  });
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;"
  }[char] ?? char));
}
