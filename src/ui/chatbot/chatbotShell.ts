import type {
  AssistantClientContext,
  AssistantToolCall,
  AssistantToolDefinition,
  AssistantToolResult,
  AssistantTurnResponse
} from "../../assistant/types";

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
        <strong>Asistent</strong>
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
          <button type="button" aria-label="Add attachment">+</button>
          <span></span>
          <button type="button" aria-label="Preview context">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.8 12s3.3-5.2 9.2-5.2S21.2 12 21.2 12s-3.3 5.2-9.2 5.2S2.8 12 2.8 12Z"/><circle cx="12" cy="12" r="2.4"/></svg>
          </button>
          <button type="button" aria-label="Voice">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v9"/><path d="M8 9v2a4 4 0 0 0 8 0V9"/><path d="M5 11a7 7 0 0 0 14 0"/><path d="M12 18v3"/></svg>
          </button>
          <button type="submit" class="chatbot-send" aria-label="Send message">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14"/><path d="M7 10l5-5 5 5"/></svg>
          </button>
        </div>
      </form>
    </footer>
  `;

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

type ChatbotState = {
  pendingCalls: AssistantToolCall[];
  pendingPlan: AssistantTurnResponse["plan"];
  conversation: Array<{ role: "user" | "assistant" | "tool"; content: string }>;
  busy: boolean;
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

function getContextSnapshot(): AssistantClientContext {
  return bridge()?.getContextSnapshot() ?? fallbackContext();
}

function appendMessage(body: HTMLElement, role: "user" | "assistant" | "tool", text: string): HTMLElement {
  body.querySelector("[data-chatbot-empty]")?.remove();
  const message = document.createElement("div");
  message.className = `chatbot-message ${role}`;
  message.textContent = text;
  body.appendChild(message);
  body.scrollTop = body.scrollHeight;
  return message;
}

function renderPlan(body: HTMLElement, response: AssistantTurnResponse, onApply: () => void): void {
  if (!response.plan) return;
  const card = document.createElement("section");
  card.className = "chatbot-plan";
  const list = response.plan.steps.map((step) => `<li>${escapeHtml(step.label)}</li>`).join("");
  card.innerHTML = `
    <strong>${escapeHtml(response.plan.goal)}</strong>
    <ul>${list}</ul>
    ${response.requiresConfirmation ? `<button type="button" data-chatbot-apply>Apply</button>` : ""}
  `;
  card.querySelector<HTMLButtonElement>("[data-chatbot-apply]")?.addEventListener("click", onApply);
  body.appendChild(card);
  body.scrollTop = body.scrollHeight;
}

async function postAssistantTurn(pathname: "/api/assistant/turn" | "/api/assistant/continue", state: ChatbotState, message: string, toolResults?: AssistantToolResult[]) {
  const response = await fetch(pathname, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({
      message,
      clientContext: getContextSnapshot(),
      conversation: state.conversation.slice(-12),
      toolResults,
      toolDefinitions: getToolDefinitions()
    })
  });
  const data = await response.json() as AssistantTurnResponse | { ok: false; error?: string };
  if (!response.ok || !data.ok) throw new Error(!data.ok ? data.error ?? `HTTP ${response.status}` : `HTTP ${response.status}`);
  return data;
}

async function executeToolCalls(calls: AssistantToolCall[]): Promise<AssistantToolResult[]> {
  const activeBridge = bridge();
  if (!activeBridge) {
    return calls.map((call) => ({ ok: false, toolId: call.toolId, error: "Live editor bridge is not available." }));
  }
  const results: AssistantToolResult[] = [];
  for (const call of calls) {
    results.push(await activeBridge.executeToolCall(call));
  }
  return results;
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

  const state: ChatbotState = { pendingCalls: [], pendingPlan: null, conversation: [], busy: false };

  const continueWithTools = async (message: string, calls: AssistantToolCall[]) => {
    setBusy(shell, true);
    appendMessage(body, "tool", "Vykonávam kroky v editore...");
    const results = await executeToolCalls(calls);
    for (const result of results) {
      appendMessage(body, "tool", result.ok ? result.stateDeltaSummary ?? `${result.toolId}: OK` : `${result.toolId}: ${result.error ?? "failed"}`);
    }
    const next = await postAssistantTurn("/api/assistant/continue", state, message, results);
    state.conversation.push({ role: "assistant", content: next.assistantMessage });
    appendMessage(body, "assistant", next.assistantMessage);
    setBusy(shell, false);
  };

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    if (state.busy) return;
    const message = textarea.value.trim();
    if (!message) return;
    textarea.value = "";
    state.conversation.push({ role: "user", content: message });
    appendMessage(body, "user", message);
    setBusy(shell, true);
    state.busy = true;
    appendMessage(body, "tool", "Analyzujem kontext...");

    void postAssistantTurn("/api/assistant/turn", state, message)
      .then(async (response) => {
        state.conversation.push({ role: "assistant", content: response.assistantMessage });
        appendMessage(body, "assistant", response.assistantMessage);
        state.pendingCalls = response.toolCalls;
        state.pendingPlan = response.plan;
        renderPlan(body, response, () => {
          const calls = [...state.pendingCalls];
          state.pendingCalls = [];
          void continueWithTools(message, calls).catch((error: unknown) => {
            appendMessage(body, "assistant", error instanceof Error ? error.message : String(error));
            setBusy(shell, false);
            state.busy = false;
          });
        });
        if (!response.requiresConfirmation && response.toolCalls.length > 0) {
          await continueWithTools(message, response.toolCalls);
        }
      })
      .catch((error: unknown) => {
        appendMessage(body, "assistant", error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        setBusy(shell, false);
        state.busy = false;
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
