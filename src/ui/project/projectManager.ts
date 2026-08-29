import type { ProjectMetadata, ProjectVersionMetadata } from "../../core/project/project-types";
import type { ProjectSaveFile } from "../../core/project-save/project-save-types";
import type { ClientRole, OrganizationUser } from "../../core/client/client-types";
import { findOrganizationUser, organizationUserInitial, organizationUserName } from "../../core/client/organization-users";
import { createAccountMenu } from "../account/accountMenu";
import { createButtonElement } from "../domElements";
import { mountLoadingSkeleton } from "../loadingSkeleton";
import { getAppContextMenuController } from "../contextMenu";
import { t } from "../../i18n";
import {
  createProject,
  deleteProject,
  downloadProject,
  importProjectFile,
  listProjectVersions,
  listProjects,
  loadProject,
  loadProjectVersion,
  ProjectApiError,
  restoreProjectVersion,
  type CreateProjectRequest
} from "../../app/project/projectApi";
import { createProjectRecoveryStore } from "../../app/project/projectRecoveryStore";

export type ProjectManagerSelection =
  | { kind: "blank" }
  | { kind: "created"; project: ProjectMetadata }
  | { kind: "loaded"; save: ProjectSaveFile }
  | { kind: "recovery"; projectId: string; workspaceId: string };

type ProjectManagerArgs = {
  root: HTMLElement;
  clientId: string;
  clientName: string;
  organizationUsers: OrganizationUser[];
  currentUserId: string;
  currentUserRole: ClientRole;
  onSelect: (selection: ProjectManagerSelection) => void | Promise<void>;
};

export function createProjectVersionActionButton(label: string): HTMLButtonElement {
  return createButtonElement(label);
}

export function createProjectDeleteActionButton(onDelete: () => void): HTMLButtonElement {
  const button = createButtonElement(t("Delete project"));
  button.classList.add("project-manager-project-menu-danger");
  button.addEventListener("click", () => {
    onDelete();
  });
  return button;
}

export function createProjectDeleteDialog(
  projectName: string,
  onConfirm: () => Promise<void>
): HTMLElement {
  const overlay = document.createElement("div");
  overlay.className = "project-delete-overlay";

  const dialog = document.createElement("section");
  dialog.className = "project-delete-dialog";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", "project-delete-title");

  const icon = document.createElement("span");
  icon.className = "project-delete-dialog__icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = "!";

  const title = document.createElement("h2");
  title.id = "project-delete-title";
  title.textContent = t("Delete project?");

  const description = document.createElement("p");
  description.textContent = t("All saves, versions and files for this project will be removed.");

  const projectLabel = document.createElement("strong");
  projectLabel.className = "project-delete-dialog__project";
  projectLabel.textContent = projectName;

  const warning = document.createElement("p");
  warning.className = "project-delete-dialog__warning";
  warning.textContent = t("This action cannot be undone.");

  const error = document.createElement("p");
  error.className = "project-delete-dialog__error";
  error.hidden = true;

  const actions = document.createElement("div");
  actions.className = "project-delete-dialog__actions";
  const cancel = createButtonElement(t("Cancel"));
  cancel.classList.add("project-delete-dialog__cancel");
  const confirm = createButtonElement(t("Yes, delete project"));
  confirm.classList.add("project-delete-dialog__confirm");
  actions.append(cancel, confirm);

  const close = () => overlay.remove();
  cancel.addEventListener("click", close);
  overlay.addEventListener("click", (event) => {
    if (event.target === overlay) close();
  });
  confirm.addEventListener("click", async () => {
    cancel.disabled = true;
    confirm.disabled = true;
    confirm.textContent = t("Deleting…");
    error.hidden = true;
    try {
      await onConfirm();
      close();
    } catch (deleteError) {
      error.textContent = deleteError instanceof Error ? deleteError.message : String(deleteError);
      error.hidden = false;
      cancel.disabled = false;
      confirm.disabled = false;
      confirm.textContent = t("Try again");
    }
  });

  dialog.append(icon, title, description, projectLabel, warning, error, actions);
  overlay.appendChild(dialog);
  return overlay;
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

function beginProjectLoading(root: HTMLElement, label: string) {
  return mountLoadingSkeleton(root, { variant: "screen", label, mode: "overlay" });
}

function message(key: string, values: Record<string, string | number> = {}): string {
  return t(key).replace(/\{(\w+)\}/g, (_, name: string) => String(values[name] ?? ""));
}

function editedAgo(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const seconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (seconds < 45) return t("Edited a few seconds ago");
  if (seconds < 90) return t("Edited a minute ago");
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return message("Edited {count} minutes ago", { count: minutes });
  if (minutes < 90) return t("Edited an hour ago");
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return message("Edited {count} hours ago", { count: hours });
  if (hours < 48) return t("Edited a day ago");
  const days = Math.floor(hours / 24);
  if (days < 30) return message("Edited {count} days ago", { count: days });
  const months = Math.floor(days / 30);
  if (months < 12) return months === 1 ? t("Edited a month ago") : message("Edited {count} months ago", { count: months });
  const years = Math.floor(months / 12);
  return years === 1 ? t("Edited a year ago") : message("Edited {count} years ago", { count: years });
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
  return message("{walls} walls / {floors} floors / {modules} modules", {
    walls: snapshot?.walls?.length ?? 0,
    floors: snapshot?.floors?.length ?? 0,
    modules: snapshot?.instances?.length ?? 0
  });
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
    empty.textContent = t("No preview");
    preview.appendChild(empty);
  }
  const meta = document.createElement("p");
  meta.textContent = message("Version {version} - {edited} - {summary}", { version: version.versionNumber, edited: editedAgo(version.updatedAt), summary: describeSave(save) });
  target.append(preview, meta, renderActor(users, version.savedByUserId, t("Saved by")));
}

async function openVersionsDialog(root: HTMLElement, project: ProjectMetadata, users: readonly OrganizationUser[], onRestored: () => Promise<void>): Promise<void> {
  const overlay = document.createElement("div");
  overlay.className = "project-version-overlay";
  overlay.innerHTML = `
    <section class="project-version-dialog" role="dialog" aria-modal="true" aria-label="${t("Saved project versions")}">
      <header>
        <div>
          <strong>${t("Saved versions")}</strong>
          <span>${project.name}</span>
        </div>
        <button type="button" data-version-close>${t("Close")}</button>
      </header>
      <div class="project-version-body">
        <div class="project-version-list" data-version-list>
          <p>${t("Loading versions…")}</p>
        </div>
        <div class="project-version-detail" data-version-detail>
          <p>${t("Select a version and choose Preview.")}</p>
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
      list.innerHTML = `<p>${t("This project has no saved version yet.")}</p>`;
      return;
    }
    for (const version of versions) {
      const item = document.createElement("article");
      item.className = "project-version-item";
      item.innerHTML = `
        <div>
          <strong>${message("Version {version}", { version: version.versionNumber })}</strong>
          <span>${editedAgo(version.updatedAt)}</span>
        </div>
      `;
      item.querySelector("div")?.appendChild(renderActor(users, version.savedByUserId, t("Saved by")));
      const preview = createProjectVersionActionButton("");
      preview.textContent = t("Preview");
      preview.addEventListener("click", async () => {
        setStatus(root, message("Loading version {version}…", { version: version.versionNumber }));
        try {
          renderVersionPreview(detail, await loadProjectVersion(project.projectId, version.versionNumber), version, users);
          setStatus(root, t("Version loaded for preview."));
        } catch (error) {
          setStatus(root, error instanceof Error ? error.message : String(error), "error");
        }
      });
      const restore = createProjectVersionActionButton("");
      restore.textContent = t("Restore");
      restore.addEventListener("click", async () => {
        const confirmed = window.confirm(message("Restore project \"{project}\" to version {version}? The current state will be saved as a new history version.", { project: project.name, version: version.versionNumber }));
        if (!confirmed) return;
        setStatus(root, message("Restoring version {version}…", { version: version.versionNumber }));
        try {
          await restoreProjectVersion(project.projectId, version.versionNumber);
          await onRestored();
          setStatus(root, message("Project restored to version {version}.", { version: version.versionNumber }));
          close();
        } catch (error) {
          setStatus(root, error instanceof Error ? error.message : String(error), "error");
        }
      });
      const actions = document.createElement("div");
      actions.append(preview, restore);
      getAppContextMenuController().register(item, () => [
        { id: "project-version-preview", label: t("Preview version"), execute: () => preview.click() },
        { id: "project-version-restore", label: t("Restore version"), execute: () => restore.click() }
      ]);
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

export function projectCard(
  project: ProjectMetadata,
  users: readonly OrganizationUser[],
  onLoad: () => void,
  onDownload: () => void,
  onVersions: () => void,
  onDelete?: () => void,
  cachedRecovery = false
): HTMLElement {
  const card = document.createElement("article");
  card.className = "project-manager-project-card";
  card.classList.toggle("project-manager-project-card--cached", cachedRecovery);
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
  copy.append(title, date, renderActor(users, project.createdByUserId, t("Created by")), renderActor(users, project.updatedByUserId, t("Saved by")));
  if (cachedRecovery) {
    const cached = document.createElement("small");
    cached.className = "project-manager-project-cached";
    cached.textContent = t("Local recovery draft – server will be verified on open");
    copy.appendChild(cached);
  }
  footer.append(icon, copy);
  button.append(preview, footer);
  button.addEventListener("click", onLoad);
  const menuButton = document.createElement("button");
  menuButton.type = "button";
  menuButton.className = "project-manager-project-menu-button";
  menuButton.textContent = "...";
  menuButton.title = t("Project actions");
  const menu = document.createElement("div");
  menu.className = "project-manager-project-menu";
  menu.hidden = true;
  const openItem = document.createElement("button");
  openItem.type = "button";
  openItem.textContent = t("Open project");
  openItem.addEventListener("click", () => {
    menu.hidden = true;
    onLoad();
  });
  const exportItem = document.createElement("button");
  exportItem.type = "button";
  exportItem.textContent = t("Export project");
  exportItem.addEventListener("click", () => {
    menu.hidden = true;
    onDownload();
  });
  const versionsItem = document.createElement("button");
  versionsItem.type = "button";
  versionsItem.textContent = t("View saved versions");
  versionsItem.addEventListener("click", () => {
    menu.hidden = true;
    onVersions();
  });
  menu.append(openItem, exportItem, versionsItem);
  if (onDelete) {
    const deleteItem = createProjectDeleteActionButton(() => {
      menu.hidden = true;
      onDelete();
    });
    menu.appendChild(deleteItem);
  }
  menuButton.addEventListener("click", (event) => {
    event.stopPropagation();
    document.querySelectorAll<HTMLElement>(".project-manager-project-menu").forEach((item) => {
      if (item !== menu) item.hidden = true;
    });
    menu.hidden = !menu.hidden;
  });
  getAppContextMenuController().register(card, () => [
    { id: "project-open", label: t("Open project"), iconId: "open", execute: onLoad },
    { id: "project-export", label: t("Export project"), iconId: "exportJson", execute: onDownload },
    { id: "project-versions", label: t("View saved versions"), execute: onVersions },
    ...(onDelete ? [
      { type: "separator" as const, id: "project-delete-separator" },
      { id: "project-delete", label: t("Delete project"), iconId: "delete" as const, danger: true, execute: onDelete }
    ] : [])
  ]);
  card.append(button, menuButton, menu);
  return card;
}

function renderProjects(
  root: HTMLElement,
  projects: ProjectMetadata[],
  users: readonly OrganizationUser[],
  onLoad: (projectId: string) => Promise<void>,
  canDeleteProjects: boolean,
  onRefresh?: () => Promise<void>,
  recoveryWorkspaceIds: ReadonlyMap<string, string> = new Map(),
  recoveryIdentity?: { clientId: string; userId: string }
): void {
  const list = root.querySelector<HTMLElement>("[data-project-manager-list]");
  if (!list) return;
  list.innerHTML = "";
  if (projects.length === 0) {
    const empty = document.createElement("p");
    empty.className = "project-manager-empty";
    empty.textContent = t("No saved projects yet.");
    list.appendChild(empty);
    return;
  }
  for (const project of projects) {
    const loadCard = async () => {
      const buttons = card.querySelectorAll<HTMLButtonElement>("button");
      buttons.forEach((item) => { item.disabled = true; });
      const loading = beginProjectLoading(root, t("Loading project"));
      try {
        await onLoad(project.projectId);
        loading.clear();
      } catch (error) {
        loading.clear();
        setStatus(root, error instanceof Error ? error.message : String(error), "error");
        buttons.forEach((item) => { item.disabled = false; });
      }
    };
    const downloadCard = async () => {
      const buttons = card.querySelectorAll<HTMLButtonElement>("button");
      buttons.forEach((item) => { item.disabled = true; });
      setStatus(root, t("Preparing complete .fqp file…"));
      try {
        await downloadProject(project);
        setStatus(root, t("Project file downloaded."));
      } catch (error) {
        setStatus(root, error instanceof Error ? error.message : String(error), "error");
      } finally {
        buttons.forEach((item) => { item.disabled = false; });
      }
    };
    const deleteCard = async () => {
      const buttons = card.querySelectorAll<HTMLButtonElement>("button");
      buttons.forEach((item) => { item.disabled = true; });
      setStatus(root, message("Deleting project \"{project}\"…", { project: project.name }));
      try {
        await deleteProject(project.projectId);
        if (recoveryIdentity) {
          await createProjectRecoveryStore().clearProject(recoveryIdentity.clientId, recoveryIdentity.userId, project.projectId);
        }
        if (onRefresh) await onRefresh();
        setStatus(root, t("Project deleted."));
      } catch (error) {
        setStatus(root, error instanceof Error ? error.message : String(error), "error");
        buttons.forEach((item) => { item.disabled = false; });
        throw error;
      }
    };
    const cachedRecovery = recoveryWorkspaceIds.has(project.projectId);
    const card = projectCard(project, users, loadCard, downloadCard, () => {
      void openVersionsDialog(root, project, users, async () => {
        if (onRefresh) await onRefresh();
      });
    }, canDeleteProjects ? () => {
      root.appendChild(createProjectDeleteDialog(project.name, deleteCard));
    } : undefined, cachedRecovery);
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
          <button class="project-manager-primary" type="button" data-project-manager-new>${t("New project")}</button>
          <button type="button" data-project-manager-blank>${t("Blank workspace")}</button>
          <button type="button" data-project-manager-import>${t("Import .fqp")}</button>
        </div>
        <div class="project-manager-load-state">
          <p class="project-manager-status" data-project-manager-status data-tone="muted">${t("Choose an existing project or create a new one.")}</p>
        </div>
      </section>

      <section class="project-manager-create-panel" data-project-manager-create-panel hidden>
        <form class="project-manager-form" data-project-manager-form>
          <div class="project-manager-form-grid"></div>
          <button class="project-manager-primary" type="submit">${t("Create and open")}</button>
        </form>
      </section>

      <section class="project-manager-library">
        <div class="project-manager-list" data-project-manager-list>
          <p class="project-manager-empty">${t("Loading projects…")}</p>
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
      onLogoutStart: () => setStatus(args.root, t("Signing out…")),
      onLogoutError: (message) => setStatus(args.root, message, "error")
    });
  }
  const fields = {
    name: field(t("Project name"), true),
    address: field(t("Address"), true),
    city: field(t("City")),
    contactName: field(t("Contact"), true),
    email: field(t("Email")),
    phone: field(t("Phone")),
    notes: field(t("Note"))
  };
  for (const [name, item] of Object.entries(fields)) {
    item.input.name = name;
    formGrid?.appendChild(item.wrap);
  }

  const loadProjects = async () => {
    setStatus(args.root, t("Loading project list…"));
    const list = args.root.querySelector<HTMLElement>("[data-project-manager-list]");
    const loading = list ? mountLoadingSkeleton(list, { variant: "project-list", label: t("Loading project list…") }) : null;
    try {
      const projects = await listProjects();
      loading?.clear();
      renderProjects(args.root, projects, args.organizationUsers, async (projectId) => {
        const save = await loadProject(projectId);
        await args.onSelect({ kind: "loaded", save });
      }, args.currentUserRole === "owner" || args.currentUserRole === "admin", loadProjects, new Map(), {
        clientId: args.clientId,
        userId: args.currentUserId
      });
      setStatus(args.root, t("Project manager is ready."));
    } catch (error) {
      loading?.clear();
      const canUseLocalRecovery = error instanceof TypeError || (error instanceof ProjectApiError && error.status >= 500);
      if (!canUseLocalRecovery) {
        if (list) list.innerHTML = `<p class="project-manager-empty">${t("Local recovery data are not shown without a valid sign-in.")}</p>`;
        setStatus(args.root, error instanceof Error ? error.message : String(error), "error");
        return;
      }
      const ownRecoverable = await createProjectRecoveryStore()
        .listRecoverableProjects(args.clientId, args.currentUserId)
        .catch(() => []);
      const workspaceIds = new Map(ownRecoverable.map((item) => [item.project.projectId, item.scope.workspaceId]));
      renderProjects(args.root, ownRecoverable.map((item) => item.project), args.organizationUsers, async (projectId) => {
        const workspaceId = workspaceIds.get(projectId);
        if (workspaceId) await args.onSelect({ kind: "recovery", projectId, workspaceId });
      }, false, undefined, workspaceIds, { clientId: args.clientId, userId: args.currentUserId });
      setStatus(
        args.root,
        ownRecoverable.length > 0
          ? t("Server is unavailable. Marked local recovery projects are shown.")
          : error instanceof Error ? error.message : String(error),
        "error"
      );
    }
  };

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = collectProjectInput(form);
    if (!input.name || !input.address || !input.contactName) {
      setStatus(args.root, t("Please enter the project name, address and contact."), "error");
      return;
    }
    const submit = form.querySelector<HTMLButtonElement>("button[type='submit']");
    if (submit) submit.disabled = true;
    const loading = beginProjectLoading(args.root, t("Creating project"));
    try {
      await args.onSelect({ kind: "created", project: await createProject(input) });
      loading.clear();
    } catch (error) {
      loading.clear();
      setStatus(args.root, error instanceof Error ? error.message : String(error), "error");
      if (submit) submit.disabled = false;
    }
  });

  args.root.querySelector<HTMLButtonElement>("[data-project-manager-blank]")?.addEventListener("click", async () => {
    const loading = beginProjectLoading(args.root, t("Opening blank workspace"));
    try {
      await args.onSelect({ kind: "blank" });
      loading.clear();
    } catch (error) {
      loading.clear();
      setStatus(args.root, error instanceof Error ? error.message : String(error), "error");
    }
  });
  args.root.querySelector<HTMLButtonElement>("[data-project-manager-new]")?.addEventListener("click", () => {
    const panel = args.root.querySelector<HTMLElement>("[data-project-manager-create-panel]");
    if (panel) panel.hidden = !panel.hidden;
  });
  args.root.querySelector<HTMLButtonElement>("[data-project-manager-import]")?.addEventListener("click", () => {
    openFilePicker(async (file) => {
      const loading = beginProjectLoading(args.root, t("Importing project"));
      try {
        const save = await importProjectFile(file);
        await args.onSelect({ kind: "loaded", save });
        loading.clear();
      } catch (error) {
        loading.clear();
        setStatus(args.root, error instanceof Error ? error.message : String(error), "error");
      }
    });
  });
  void loadProjects();
}
