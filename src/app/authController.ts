import type { AuthenticatedClientSession } from "../core/client/client-types";

type AuthApiResponse = {
  ok: boolean;
  session?: AuthenticatedClientSession;
  error?: string;
};

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
  const devSession = getLocalDevSession();
  if (devSession) return devSession;

  const serverSession = await readServerSession();
  if (serverSession) return serverSession;

  return await renderLogin(root);
}

function getLocalDevSession(): AuthenticatedClientSession | null {
  if (!import.meta.env.DEV) return null;
  if (window.location.hostname !== "127.0.0.1" && window.location.hostname !== "localhost") return null;
  const issuedAt = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 30).toISOString();
  return {
    version: 1,
    userId: "user_arcigy_owner",
    clientId: "client_arcigy_demo",
    role: "owner",
    displayName: "Arcigy",
    issuedAt,
    expiresAt
  };
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
  root.innerHTML = "";
  root.className = "auth-shell";

  const panel = document.createElement("main");
  panel.className = "auth-panel";

  const title = document.createElement("h1");
  title.textContent = "Arcigy Kitchen";

  const subtitle = document.createElement("p");
  subtitle.textContent = "Prihlaste sa do zakaznickeho pracoviska.";

  const form = document.createElement("form");
  form.className = "auth-form";

  const usernameLabel = document.createElement("label");
  usernameLabel.textContent = "Pouzivatel";
  const usernameInput = document.createElement("input");
  usernameInput.name = "username";
  usernameInput.autocomplete = "username";
  usernameInput.required = true;
  usernameInput.value = "arcigy";
  usernameLabel.appendChild(usernameInput);

  const passwordLabel = document.createElement("label");
  passwordLabel.textContent = "Heslo";
  const passwordInput = document.createElement("input");
  passwordInput.name = "password";
  passwordInput.type = "password";
  passwordInput.autocomplete = "current-password";
  passwordInput.required = true;
  passwordLabel.appendChild(passwordInput);

  const error = document.createElement("div");
  error.className = "auth-error";
  error.setAttribute("role", "alert");

  const submit = document.createElement("button");
  submit.type = "submit";
  submit.textContent = "Prihlasit";

  form.append(usernameLabel, passwordLabel, error, submit);
  panel.append(title, subtitle, form);
  root.appendChild(panel);
  passwordInput.focus();

  return await new Promise<AuthenticatedClientSession>((resolve) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      error.textContent = "";
      submit.disabled = true;

      void login(usernameInput.value, passwordInput.value).then((session) => {
        if (!session) {
          error.textContent = "Nespravne prihlasovacie udaje.";
          submit.disabled = false;
          passwordInput.select();
          return;
        }

        root.className = "";
        resolve(session);
      });
    });
  });
}

async function login(username: string, password: string): Promise<AuthenticatedClientSession | null> {
  try {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password })
    });
    if (!response.ok) return null;
    const data = await readAuthResponse(response);
    return data.ok && data.session ? data.session : null;
  } catch {
    return null;
  }
}
