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
    <p>${t("Enter your company credentials to continue to the Arcigy workspace.")}</p>
  `;

  const form = document.createElement("form");
  form.className = "auth-form";

  const companyLabel = document.createElement("label");
  const companyText = document.createElement("span");
  companyText.textContent = t("Company");
  const companyInput = createInputElement("text", "", {
    autocomplete: "organization",
    name: "company",
    placeholder: t("Enter company"),
    required: true
  });
  companyLabel.append(companyText, companyInput);

  const usernameLabel = document.createElement("label");
  const usernameText = document.createElement("span");
  usernameText.textContent = t("User");
  const usernameInput = createInputElement("text", "", {
    autocomplete: "username",
    name: "username",
    placeholder: t("Enter username"),
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
  error.id = "auth-error";
  error.setAttribute("role", "alert");

  const submit = createButtonElement(t("Sign in to workspace"), { type: "submit" });

  form.setAttribute("aria-describedby", error.id);
  form.append(companyLabel, usernameLabel, passwordLabel, error, submit);
  content.append(heading, form);
  panel.append(visual, content);
  root.appendChild(panel);
  passwordInput.focus();

  return await new Promise<AuthenticatedClientSession>((resolve) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      error.textContent = "";
      submit.disabled = true;

      void login(companyInput.value, usernameInput.value, passwordInput.value).then((result) => {
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

async function login(company: string, username: string, password: string): Promise<LoginResult> {
  try {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ company, username, password })
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
