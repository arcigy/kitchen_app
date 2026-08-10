import type { AuthenticatedClientSession } from "../core/client/client-types";
import { getCurrentLanguage, setCurrentLanguage, t } from "../i18n";
import { createButtonElement, createInputElement } from "./propsPanelElements";

type AuthApiResponse = {
  ok: boolean;
  session?: AuthenticatedClientSession;
  error?: string;
};

type LoginResult =
  | { ok: true; session: AuthenticatedClientSession }
  | { ok: false; message: string };

export function resolveLoginFailureMessage(status: number | null): string {
  if (status === null) return t("The sign-in server is unavailable. Start the local environment with npm run dev.");
  if (status === 401 || status === 429) return t("Incorrect sign-in details.");
  return t("Sign-in failed on the server. Try again or restart the local environment.");
}

function isClientSession(value: unknown): value is AuthenticatedClientSession {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate.version === 1 &&
    typeof candidate.userId === "string" &&
    typeof candidate.clientId === "string" &&
    typeof candidate.role === "string" &&
    typeof candidate.displayName === "string" &&
    typeof candidate.issuedAt === "string" &&
    typeof candidate.expiresAt === "string"
  );
}

async function readAuthResponse(response: Response): Promise<AuthApiResponse> {
  try {
    const parsed = (await response.json()) as unknown;
    if (!parsed || typeof parsed !== "object") return { ok: false };
    const record = parsed as Record<string, unknown>;
    return {
      ok: record.ok === true,
      session: isClientSession(record.session) ? record.session : undefined,
      error: typeof record.error === "string" ? record.error : undefined
    };
  } catch {
    return { ok: false };
  }
}

export function clearClientSession(): void {
  void fetch("/api/auth/logout", { method: "POST", credentials: "include" });
}

export async function requireClientSession(root: HTMLElement): Promise<AuthenticatedClientSession> {
  const serverSession = await readServerSession();
  if (serverSession) return serverSession;

  return await renderLogin(root);
}

async function readServerSession(): Promise<AuthenticatedClientSession | null> {
  try {
    const response = await fetch("/api/auth/session", { method: "GET", credentials: "include" });
    if (!response.ok) return null;
    const data = await readAuthResponse(response);
    return data.ok && data.session ? data.session : null;
  } catch {
    return null;
  }
}

async function renderLogin(root: HTMLElement): Promise<AuthenticatedClientSession> {
  setCurrentLanguage(getCurrentLanguage());
  root.innerHTML = "";
  root.className = "auth-shell";

  const panel = document.createElement("main");
  panel.className = "auth-panel";

  const visual = document.createElement("section");
  visual.className = "auth-visual";
  visual.setAttribute("aria-hidden", "true");
  visual.innerHTML = `
    <div class="auth-brand-card">
      <span>A</span>
      <div>
        <strong>Arcigy Kitchen</strong>
        <small>${t("Project workspace")}</small>
      </div>
    </div>
    <div class="auth-preview-window">
      <div class="auth-preview-top">
        <i></i><i></i><i></i>
      </div>
      <div class="auth-preview-body">
        <div class="auth-preview-sidebar"></div>
        <div class="auth-preview-canvas">
          <span></span>
          <span></span>
          <span></span>
        </div>
        <div class="auth-preview-props"></div>
      </div>
    </div>
    <div class="auth-visual-meta">
      <strong>${t("Arcigy organisation")}</strong>
      <span>${t("Projects, versions and activity are linked to a specific team member.")}</span>
    </div>
  `;

  const content = document.createElement("section");
  content.className = "auth-content";

  const heading = document.createElement("div");
  heading.className = "auth-heading";
  heading.innerHTML = `
    <span>${t("Sign in")}</span>
    <h1>${t("Welcome back")}</h1>
    <p>${t("Choose your profile and continue to the Arcigy workspace.")}</p>
  `;

  const profiles = document.createElement("div");
  profiles.className = "auth-profiles";
  profiles.innerHTML = `
    <button type="button" class="auth-profile-card is-active" data-auth-user="branislav" aria-label="${t("Select Branislav")}">
      <img src="/organization/branislav.png" alt="" />
      <span><strong>Branislav</strong><small>${t("Project architect")}</small></span>
    </button>
    <button type="button" class="auth-profile-card" data-auth-user="andrej" aria-label="${t("Select Andrej")}">
      <img src="/organization/andrej.png" alt="" />
      <span><strong>Andrej</strong><small>${t("Technical creator")}</small></span>
    </button>
    <button type="button" class="auth-profile-card" data-auth-user="pino_nobilia" aria-label="${t("Select PINO Nobilia")}">
      <img src="/organization/pino-nobilia.png" alt="" />
      <span><strong>PINO</strong><small>${t("Tenant catalogue VKH 2026")}</small></span>
    </button>
  `;

  const form = document.createElement("form");
  form.className = "auth-form";

  const usernameLabel = document.createElement("label");
  const usernameText = document.createElement("span");
  usernameText.textContent = t("User");
  const usernameInput = createInputElement("text", "branislav", {
    autocomplete: "username",
    name: "username",
    required: true
  });
  usernameLabel.append(usernameText, usernameInput);

  const passwordLabel = document.createElement("label");
  const passwordText = document.createElement("span");
  passwordText.textContent = t("Password");
  const passwordInput = createInputElement("password", "", {
    autocomplete: "current-password",
    name: "password",
    placeholder: t("Enter password"),
    required: true
  });
  passwordLabel.append(passwordText, passwordInput);

  const error = document.createElement("div");
  error.className = "auth-error";
  error.setAttribute("role", "alert");

  const submit = createButtonElement(t("Sign in to workspace"), { type: "submit" });

  const hint = document.createElement("p");
  hint.className = "auth-hint";
  hint.innerHTML = `<strong>${t("Available accounts")}</strong><span>branislav / branislav2026</span><span>andrej / andrej2026</span><span>pino_nobilia / ${t("tenant password")}</span>`;

  form.append(usernameLabel, passwordLabel, hint, error, submit);
  content.append(heading, profiles, form);
  panel.append(visual, content);
  root.appendChild(panel);
  passwordInput.focus();

  const syncActiveProfile = () => {
    const value = usernameInput.value.trim().toLowerCase();
    profiles.querySelectorAll<HTMLButtonElement>(".auth-profile-card").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.authUser === value);
    });
  };

  profiles.querySelectorAll<HTMLButtonElement>("[data-auth-user]").forEach((button) => {
    button.addEventListener("click", () => {
      usernameInput.value = button.dataset.authUser ?? "";
      syncActiveProfile();
      passwordInput.focus();
      passwordInput.select();
    });
  });
  usernameInput.addEventListener("input", syncActiveProfile);

  return await new Promise<AuthenticatedClientSession>((resolve) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      error.textContent = "";
      submit.disabled = true;

      void login(usernameInput.value, passwordInput.value).then((result) => {
        if (!result.ok) {
          error.textContent = result.message;
          submit.disabled = false;
          passwordInput.select();
          return;
        }

        root.className = "";
        resolve(result.session);
      });
    });
  });
}

async function login(username: string, password: string): Promise<LoginResult> {
  try {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    if (!response.ok) return { ok: false, message: resolveLoginFailureMessage(response.status) };
    const data = await readAuthResponse(response);
    return data.ok && data.session
      ? { ok: true, session: data.session }
      : { ok: false, message: resolveLoginFailureMessage(response.status) };
  } catch {
    return { ok: false, message: resolveLoginFailureMessage(null) };
  }
}
