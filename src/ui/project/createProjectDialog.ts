import type { CreateProjectRequest } from "../../app/project/projectApi";

type CreateProjectDialogArgs = {
  onCreate: (input: CreateProjectRequest) => Promise<void>;
};

function field(label: string, required = false) {
  const wrap = document.createElement("label");
  wrap.className = "project-dialog-field";
  const span = document.createElement("span");
  span.textContent = required ? `${label} *` : label;
  const input = document.createElement("input");
  input.type = "text";
  wrap.append(span, input);
  return { wrap, input };
}

export function openCreateProjectDialog(args: CreateProjectDialogArgs): void {
  const overlay = document.createElement("div");
  overlay.className = "project-dialog-overlay";
  const panel = document.createElement("form");
  panel.className = "project-dialog";
  overlay.appendChild(panel);

  const title = document.createElement("h2");
  title.textContent = "New Project";
  panel.appendChild(title);

  const name = field("Názov projektu", true);
  const address = field("Miesto / adresa", true);
  const city = field("Mesto");
  const postalCode = field("PSČ");
  const country = field("Krajina");
  const contactName = field("Kontaktná osoba", true);
  const email = field("Email");
  const phone = field("Telefón");
  const notes = field("Poznámka");
  panel.append(name.wrap, address.wrap, city.wrap, postalCode.wrap, country.wrap, contactName.wrap, email.wrap, phone.wrap, notes.wrap);

  const error = document.createElement("div");
  error.className = "project-dialog-error";
  panel.appendChild(error);

  const actions = document.createElement("div");
  actions.className = "project-dialog-actions";
  const cancel = document.createElement("button");
  cancel.type = "button";
  cancel.textContent = "Cancel";
  const submit = document.createElement("button");
  submit.type = "submit";
  submit.textContent = "Create";
  actions.append(cancel, submit);
  panel.appendChild(actions);

  const close = () => overlay.remove();
  cancel.addEventListener("click", close);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) close();
  });

  panel.addEventListener("submit", async (event) => {
    event.preventDefault();
    error.textContent = "";
    const input: CreateProjectRequest = {
      name: name.input.value,
      address: address.input.value,
      city: city.input.value,
      postalCode: postalCode.input.value,
      country: country.input.value,
      contactName: contactName.input.value,
      email: email.input.value,
      phone: phone.input.value,
      notes: notes.input.value
    };
    if (!input.name.trim() || !input.address.trim() || !input.contactName.trim()) {
      error.textContent = "Vyplň názov, adresu a kontaktnú osobu.";
      return;
    }
    submit.disabled = true;
    try {
      await args.onCreate(input);
      close();
    } catch (err: unknown) {
      error.textContent = err instanceof Error ? err.message : String(err);
      submit.disabled = false;
    }
  });

  document.body.appendChild(overlay);
  name.input.focus();
}
