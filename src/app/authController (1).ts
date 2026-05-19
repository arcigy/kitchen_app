export type CustomerSession = {
  version: 1;
  accountId: string;
  customerId: string;
  displayName: string;
  customerLabel: string;
  authenticatedAt: string;
};

const SESSION_STORAGE_KEY = "arcigy:kitchen:customer-session:v1";

const seedAccount = {
  accountId: "account_arcigy_demo",
  customerId: "customer_arcigy_demo",
  username: "arcigy",
  passwordHash: "7ec57cf4f49ac56e7dc7388b4ac0722dea721924522f6a20a255b3bbf8d3f00d",
  displayName: "Arcigy",
  customerLabel: "Arcigy Kitchen"
} as const;

function isCustomerSession(value: unknown): value is CustomerSession {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    candidate.version === 1 &&
    candidate.accountId === seedAccount.accountId &&
    candidate.customerId === seedAccount.customerId &&
    typeof candidate.displayName === "string" &&
    typeof candidate.customerLabel === "string" &&
    typeof candidate.authenticatedAt === "string"
  );
}

export function getCustomerSession(): CustomerSession | null {
  const raw = window.localStorage.getItem(SESSION_STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as unknown;
    return isCustomerSession(parsed) ? parsed : null;
  } catch {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
    return null;
  }
}

export function clearCustomerSession(): void {
  window.localStorage.removeItem(SESSION_STORAGE_KEY);
}

export async function requireCustomerSession(root: HTMLElement): Promise<CustomerSession> {
  const activeSession = getCustomerSession();
  if (activeSession) return activeSession;

  return await renderLogin(root);
}

async function renderLogin(root: HTMLElement): Promise<CustomerSession> {
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
  usernameInput.value = seedAccount.username;
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

  return await new Promise<CustomerSession>((resolve) => {
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      error.textContent = "";
      submit.disabled = true;

      void authenticate(usernameInput.value, passwordInput.value).then((session) => {
        if (!session) {
          error.textContent = "Nespravne prihlasovacie udaje.";
          submit.disabled = false;
          passwordInput.select();
          return;
        }

        window.localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session));
        root.className = "";
        resolve(session);
      });
    });
  });
}

async function authenticate(username: string, password: string): Promise<CustomerSession | null> {
  if (username.trim().toLowerCase() !== seedAccount.username) return null;
  const passwordHash = await sha256(password);
  if (passwordHash !== seedAccount.passwordHash) return null;

  return {
    version: 1,
    accountId: seedAccount.accountId,
    customerId: seedAccount.customerId,
    displayName: seedAccount.displayName,
    customerLabel: seedAccount.customerLabel,
    authenticatedAt: new Date().toISOString()
  };
}

async function sha256(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const hash = await window.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
