import type { ProjectMetadata, ProjectVersionMetadata } from "../../core/project/project-types";
import type { ProjectSaveFile } from "../../core/project-save/project-save-types";
import type { OrganizationUser } from "../../core/client/client-types";
import { findOrganizationUser, organizationUserInitial, organizationUserName } from "../../core/client/organization-users";
import { createAccountMenu } from "../account/accountMenu";
import { createButtonElement } from "../domElements";
import {
  createProject,
  downloadProject,
  importProjectFile,
  listProjectVersions,
  listProjects,
  loadProject,
  loadProjectVersion,
  restoreProjectVersion,
  type CreateProjectRequest
} from "../../app/project/projectApi";

export type ProjectManagerSelection =
  | { kind: "blank" }
  | { kind: "created"; project: ProjectMetadata }
  | { kind: "loaded"; save: ProjectSaveFile };

type ProjectManagerArgs = {
  root: HTMLElement;
  clientName: string;
  organizationUsers: OrganizationUser[];
  currentUserId: string;
  onSelect: (selection: ProjectManagerSelection) => void;
};

export function createProjectVersionActionButton(label: string): HTMLButtonElement {
  return createButtonElement(label);
}

function field(label: string, required = false) {
  const wrap = document.createElement("label");
  wrap.className = "project-manager-field";
  const span = document.createElement("span");
  span.textContent = required ? `${label} *` : label;
  const input = document.createElement("input");
  input.type = "text";
  input.autocomplete = "off";
  wrap.append(span, input);
  return { wrap, input };
}

function setStatus(root: HTMLElement, message: string, tone: "muted" | "error" = "muted") {
  const status = root.querySelector<HTMLElement>("[data-project-manager-status]");
  if (!status) return;
  status.textContent = message;
  status.dataset.tone = tone;
}

function setProgress(root: HTMLElement, percent: number | null): void {
  const progress = root.querySelector<HTMLElement>("[data-project-manager-progress]");
  const bar = root.querySelector<HTMLElement>("[data-project-manager-progress-bar]");
  if (!progress || !bar) return;
  if (percent === null) {
    progress.hidden = true;
    progress.setAttribute("aria-valuenow", "0");
    bar.style.width = "0%";
    return;
  }
  const value = Math.max(0, Math.min(100, Math.round(percent)));
  progress.hidden = false;
  progress.setAttribute("aria-valuenow", String(value));
  bar.style.width = `${value}%`;
}

function beginProjectLoadProgress(root: HTMLElement, label: string) {
  let percent = 8;
  let timer: number | null = null;
  const render = () => {
    setProgress(root, percent);
    setStatus(root, `${label} ${percent}%`);
  };
  render();
  timer = window.setInterval(() => {
    const step = percent < 45 ? 7 : percent < 75 ? 4 : percent < 92 ? 2 : 0;
    percent = Math.min(94, percent + step);
    render();
  }, 260);
  return {
    done() {
      if (timer !== null) window.clearInterval(timer);
      percent = 100;
      setProgress(root, 100);
      setStatus(root, `${label} 100%`);
    },
    fail(message: string) {
      if (timer !== null) window.clearInterval(timer);
      setProgress(root, null);
      setStatus(root, message, "error");
    }
  };
}

function editedAgo(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 45) return "Edited few seconds ago";
  if (seconds < 90) return "Edited a minute ago";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `Edited ${minutes} minutes ago`;
  if (minutes < 90) return "Edited an hour ago";
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Edited ${hours} hours ago`;
  if (hours < 48) return "Edited a day ago";
  const days = Math.floor(hours / 24);
  if (days < 30) return `Edited ${days} days ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return months === 1 ? "Edited a month ago" : `Edited ${months} months ago`;
  const years = Math.floor(months / 12);
  return years === 1 ? "Edited a year ago" : `Edited ${years} years ago`;
}

function openFilePicker(onFile: (file: File) => Promise<void>): void {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".fqp";
  input.addEventListener("change", () => {
    const file = input.files?.[0] ?? null;
    if (file) void onFile(file);
    input.remove();
  });
  input.click();
}

function describeSave(save: ProjectSaveFile): string {
  const layout = save.appState?.layout as { snapshot?: { walls?: unknown[]; floors?: unknown[]; instances?: unknown[] } } | null | undefined;
  const snapshot = layout?.snapshot;
  return `${snapshot?.walls?.length ?? 0} walls / ${snapshot?.floors?.length ?? 0} floors / ${snapshot?.instances?.length ?? 0} modules`;
}

function renderActor(users: readonly OrganizationUser[], userId: string, label: string): HTMLElement {
  const user = findOrganizationUser(users, userId);
  const row = document.createElement("span");
  row.className = "project-manager-actor";
  const avatar = document.createElement("span");
  avatar.className = "project-manager-actor-avatar";
  if (user?.photoUrl) {
    const image = document.createElement("img");
    image.src = user.photoUrl;
    image.alt = "";
    avatar.appendChild(image);
  } else {
    avatar.textContent = organizationUserInitial(user);
  }
  const text = document.createElement("span");
  text.textContent = `${label}: ${organizationUserName(users, userId)}`;
  row.append(avatar, text);
  return row;
}

function renderVersionPreview(target: HTMLElement, save: ProjectSaveFile, version: ProjectVersionMetadata, users: readonly OrganizationUser[]): void {
  target.innerHTML = "";
  const preview = document.createElement("div");
  preview.className = "project-version-preview";
  if (save.project.preview?.imageDataUrl) {
    const image = document.createElement("img");
    image.src = save.project.preview.imageDataUrl;
    image.alt = "";
    preview.appendChild(image);
  } else {
    const empty = document.createElement("span");
    empty.textContent = "Bez nahladu";
    preview.appendChild(empty);
  }
  const meta = document.createElement("p");
  meta.textContent = `Version ${version.versionNumber} - ${editedAgo(version.updatedAt)} - ${describeSave(save)}`;
  target.append(preview, meta, renderActor(users, version.savedByUserId, "Saved by"));
}

async function openVersionsDialog(root: HTMLElement, project: ProjectMetadata, users: readonly OrganizationUser[], onRestored: () => Promise<void>): Promise<void> {
  const overlay = document.createElement("div");
  overlay.className = "project-version-overlay";
  overlay.innerHTML = `
    <section class="project-version-dialog" role="dialog" aria-modal="true" aria-label="Stare verzie projektu">
      <header>
        <div>
          <strong>Staré verzie</strong>
          <span>${project.name}</span>
        </div>
        <button type="button" data-version-close>Zavrieť</button>
      </header>
      <div class="project-version-body">
        <div class="project-version-list" data-version-list>
          <p>Nacitavam verzie...</p>
        </div>
        <div class="project-version-detail" data-version-detail>
          <p>Vyber verziu a daj Pozrieť.</p>
        </div>
      </div>
    </section>
  `;
  root.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector<HTMLButtonElement>("[data-version-close]")?.addEventListener("click", close);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) close();
  });
  const list = overlay.querySelector<HTMLElement>("[data-version-list]");
  const detail = overlay.querySelector<HTMLElement>("[data-version-detail]");
  if (!list || !detail) return;
  try {
    const versions = await listProjectVersions(project.projectId);
    list.innerHTML = "";
    if (versions.length === 0) {
      list.innerHTML = "<p>Projekt este nema ulozenu ziadnu verziu.</p>";
      return;
    }
    for (const version of versions) {
      const item = document.createElement("article");
      item.className = "project-version-item";
      item.innerHTML = `
        <div>
          <strong>Version ${version.versionNumber}</strong>
          <span>${editedAgo(version.updatedAt)}</span>
        </div>
      `;
      item.querySelector("div")?.appendChild(renderActor(users, version.savedByUserId, "Saved by"));
      const preview = createProjectVersionActionButton("");
      preview.textContent = "Pozrieť";
      preview.addEventListener("click", async () => {
        setStatus(root, `Nacitavam verziu ${version.versionNumber}...`);
        try {
          renderVersionPreview(detail, await loadProjectVersion(project.projectId, version.versionNumber), version, users);
          setStatus(root, "Verzia je nacitana na nahlad.");
        } catch (error) {
          setStatus(root, error instanceof Error ? error.message : String(error), "error");
        }
      });
      const restore = createProjectVersionActionButton("");
      restore.textContent = "Obnoviť";
      restore.addEventListener("click", async () => {
        const confirmed = window.confirm(`Chceš obnoviť projekt "${project.name}" na verziu ${version.versionNumber}? Aktuálny stav sa uloží ako nová verzia v histórii.`);
        if (!confirmed) return;
        setStatus(root, `Obnovujem verziu ${version.versionNumber}...`);
        try {
          await restoreProjectVersion(project.projectId, version.versionNumber);
          await onRestored();
          setStatus(root, `Projekt je obnoveny na verziu ${version.versionNumber}.`);
          close();
        } catch (error) {
          setStatus(root, error instanceof Error ? error.message : String(error), "error");
        }
      });
      const actions = document.createElement("div");
      actions.append(preview, restore);
      item.appendChild(actions);
      list.appendChild(item);
    }
  } catch (error) {
    list.innerHTML = "";
    const message = document.createElement("p");
    message.textContent = error instanceof Error ? error.message : String(error);
    list.appendChild(message);
  }
}

function projectCard(project: ProjectMetadata, users: readonly OrganizationUser[], onLoad: () => void, onDownload: () => void, onVersions: () => void): HTMLElement {
  const card = document.createElement("article");
  card.className = "project-manager-project-card";
  const button = document.createElement("button");
  button.type = "button";
  button.className = "project-manager-project";
  const preview = document.createElement("span");
  preview.className = "project-manager-project-preview";
  if (project.preview?.imageDataUrl) {
    const image = document.createElement("img");
    image.src = project.preview.imageDataUrl;
    image.alt = "";
    preview.appendChild(image);
  } else {
    const emptyPreview = document.createElement("span");
    emptyPreview.className = "project-manager-project-placeholder";
    emptyPreview.textContent = project.name.slice(0, 1).toUpperCase();
    preview.appendChild(emptyPreview);
  }
  const footer = document.createElement("span");
  footer.className = "project-manager-project-footer";
  const icon = document.createElement("span");
  icon.className = "project-manager-file-icon";
  icon.textContent = "A";
  const copy = document.createElement("span");
  copy.className = "project-manager-project-copy";
  const title = document.createElement("strong");
  title.textContent = project.name;
  const date = document.createElement("small");
  date.textContent = editedAgo(project.updatedAt);
  copy.append(title, date, renderActor(users, project.createdByUserId, "Created by"), renderActor(users, project.updatedByUserId, "Saved by"));
  footer.append(icon, copy);
  button.append(preview, footer);
  button.addEventListener("click", onLoad);
  const menuButton = document.createElement("button");
  menuButton.type = "button";
  menuButton.className = "project-manager-project-menu-button";
  menuButton.textContent = "...";
  menuButton.title = "Projektove akcie";
  const menu = document.createElement("div");
  menu.className = "project-manager-project-menu";
  menu.hidden = true;
  const openItem = document.createElement("button");
  openItem.type = "button";
  openItem.textContent = "Otvoriť projekt";
  openItem.addEventListener("click", () => {
    menu.hidden = true;
    onLoad();
  });
  const exportItem = document.createElement("button");
  exportItem.type = "button";
  exportItem.textContent = "Exportovať projekt";
  exportItem.addEventListener("click", () => {
    menu.hidden = true;
    onDownload();
  });
  const versionsItem = document.createElement("button");
  versionsItem.type = "button";
  versionsItem.textContent = "Pozrieť staré verzie";
  versionsItem.addEventListener("click", () => {
    menu.hidden = true;
    onVersions();
  });
  menu.append(openItem, exportItem, versionsItem);
  menuButton.addEventListener("click", (event) => {
    event.stopPropagation();
    document.querySelectorAll<HTMLElement>(".project-manager-project-menu").forEach((item) => {
      if (item !== menu) item.hidden = true;
    });
    menu.hidden = !menu.hidden;
  });
  card.append(button, menuButton, menu);
  return card;
}

function renderProjects(root: HTMLElement, projects: ProjectMetadata[], users: readonly OrganizationUser[], onLoad: (projectId: string) => Promise<void>, onRefresh?: () => Promise<void>): void {
  const list = root.querySelector<HTMLElement>("[data-project-manager-list]");
  if (!list) return;
  list.innerHTML = "";
  if (projects.length === 0) {
    const empty = document.createElement("p");
    empty.className = "project-manager-empty";
    empty.textContent = "Zatial tu nie su ziadne ulozene projekty.";
    list.appendChild(empty);
    return;
  }
  for (const project of projects) {
    const loadCard = async () => {
      const buttons = card.querySelectorAll<HTMLButtonElement>("button");
      buttons.forEach((item) => { item.disabled = true; });
      const progress = beginProjectLoadProgress(root, "Nacitavam projekt");
      try {
        await onLoad(project.projectId);
        progress.done();
      } catch (error) {
        progress.fail(error instanceof Error ? error.message : String(error));
        buttons.forEach((item) => { item.disabled = false; });
      }
    };
    const downloadCard = async () => {
      const buttons = card.querySelectorAll<HTMLButtonElement>("button");
      buttons.forEach((item) => { item.disabled = true; });
      setStatus(root, "Pripravujem kompletny .fqp subor...");
      try {
        await downloadProject(project);
        setStatus(root, "Projektovy subor je stiahnuty.");
      } catch (error) {
        setStatus(root, error instanceof Error ? error.message : String(error), "error");
      } finally {
        buttons.forEach((item) => { item.disabled = false; });
      }
    };
    const card = projectCard(project, users, loadCard, downloadCard, () => {
      void openVersionsDialog(root, project, users, async () => {
        if (onRefresh) await onRefresh();
      });
    });
    list.appendChild(card);
  }
}

function collectProjectInput(form: HTMLFormElement): CreateProjectRequest {
  const value = (name: string) => String(new FormData(form).get(name) ?? "").trim();
  return {
    name: value("name"),
    address: value("address"),
    city: value("city"),
    contactName: value("contactName"),
    email: value("email"),
    phone: value("phone"),
    notes: value("notes")
  };
}

export function renderProjectManager(args: ProjectManagerArgs): void {
  args.root.className = "project-manager-shell";
  args.root.innerHTML = `
    <main class="project-manager">
      <header class="project-manager-topbar">
        <div class="project-manager-brand">
          <span>A</span>
          <div>
            <strong>Arcigy Kitchen</strong>
            <small>${args.clientName}</small>
          </div>
        </div>
        <div class="project-manager-profile" data-project-manager-account></div>
      </header>

      <section class="project-manager-toolbar">
        <div class="project-manager-actions">
          <button class="project-manager-primary" type="button" data-project-manager-new>New project</button>
          <button type="button" data-project-manager-blank>Blank workspace</button>
          <button type="button" data-project-manager-import>Import .fqp</button>
        </div>
        <div class="project-manager-load-state">
          <p class="project-manager-status" data-project-manager-status data-tone="muted">Vyber existujuci projekt alebo vytvor novy.</p>
          <div class="project-manager-progress" data-project-manager-progress role="progressbar" aria-label="Nacitavanie projektu" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" hidden>
            <span data-project-manager-progress-bar></span>
          </div>
        </div>
      </section>

      <section class="project-manager-create-panel" data-project-manager-create-panel hidden>
        <form class="project-manager-form" data-project-manager-form>
          <div class="project-manager-form-grid"></div>
          <button class="project-manager-primary" type="submit">Vytvorit a otvorit</button>
        </form>
      </section>

      <section class="project-manager-library">
        <div class="project-manager-list" data-project-manager-list>
          <p class="project-manager-empty">Nacitavam projekty...</p>
        </div>
      </section>
    </main>
  `;

  const form = args.root.querySelector<HTMLFormElement>("[data-project-manager-form]");
  const formGrid = args.root.querySelector<HTMLElement>(".project-manager-form-grid");
  const accountMount = args.root.querySelector<HTMLElement>("[data-project-manager-account]");
  if (accountMount) {
    createAccountMenu({
      mount: accountMount,
      users: args.organizationUsers,
      currentUserId: args.currentUserId,
      showName: true,
      onLogoutStart: () => setStatus(args.root, "Odhlasujem pouzivatela..."),
      onLogoutError: (message) => setStatus(args.root, message, "error")
    });
  }
  const fields = {
    name: field("Nazov projektu", true),
    address: field("Adresa", true),
    city: field("Mesto"),
    contactName: field("Kontakt", true),
    email: field("Email"),
    phone: field("Telefon"),
    notes: field("Poznamka")
  };
  for (const [name, item] of Object.entries(fields)) {
    item.input.name = name;
    formGrid?.appendChild(item.wrap);
  }

  const loadProjects = async () => {
    setStatus(args.root, "Nacitavam zoznam projektov...");
    try {
      renderProjects(args.root, await listProjects(), args.organizationUsers, async (projectId) => {
        const save = await loadProject(projectId);
        args.onSelect({ kind: "loaded", save });
      }, loadProjects);
      setStatus(args.root, "Project manager pripraveny.");
    } catch (error) {
      renderProjects(args.root, [], args.organizationUsers, async () => undefined);
      setStatus(args.root, error instanceof Error ? error.message : String(error), "error");
    }
  };

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = collectProjectInput(form);
    if (!input.name || !input.address || !input.contactName) {
      setStatus(args.root, "Vypln nazov, adresu a kontakt.", "error");
      return;
    }
    setStatus(args.root, "Vytvaram projekt...");
    const submit = form.querySelector<HTMLButtonElement>("button[type='submit']");
    if (submit) submit.disabled = true;
    try {
      args.onSelect({ kind: "created", project: await createProject(input) });
    } catch (error) {
      setStatus(args.root, error instanceof Error ? error.message : String(error), "error");
      if (submit) submit.disabled = false;
    }
  });

  args.root.querySelector<HTMLButtonElement>("[data-project-manager-blank]")?.addEventListener("click", () => {
    args.onSelect({ kind: "blank" });
  });
  args.root.querySelector<HTMLButtonElement>("[data-project-manager-new]")?.addEventListener("click", () => {
    const panel = args.root.querySelector<HTMLElement>("[data-project-manager-create-panel]");
    if (panel) panel.hidden = !panel.hidden;
  });
  args.root.querySelector<HTMLButtonElement>("[data-project-manager-import]")?.addEventListener("click", () => {
    openFilePicker(async (file) => {
      const progress = beginProjectLoadProgress(args.root, "Importujem projekt");
      try {
        const save = await importProjectFile(file);
        progress.done();
        args.onSelect({ kind: "loaded", save });
      } catch (error) {
        progress.fail(error instanceof Error ? error.message : String(error));
      }
    });
  });
  void loadProjects();
}
