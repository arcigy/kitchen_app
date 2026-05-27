import type { ProjectActions } from "../../app/project/projectActions";
import type { ProjectSaveFile } from "../../core/project-save/project-save-types";
import { showToast } from "../toast";

type ExitChoice = "save" | "discard" | "cancel";

function openExitDialog(): Promise<ExitChoice> {
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "project-exit-overlay";
    overlay.innerHTML = `
      <section class="project-exit-dialog" role="dialog" aria-modal="true" aria-label="Zatvorit projekt">
        <strong>Zatvorit projekt?</strong>
        <p>Pred odchodom z workspace si vyber, ci sa ma projekt ulozit.</p>
        <div>
          <button type="button" data-project-exit="cancel">Zrusit</button>
          <button type="button" data-project-exit="discard">Zavriet bez ulozenia</button>
          <button type="button" data-project-exit="save">Ulozit a zavriet</button>
        </div>
      </section>
    `;

    const finish = (choice: ExitChoice) => {
      overlay.remove();
      resolve(choice);
    };

    overlay.querySelector<HTMLButtonElement>("[data-project-exit='cancel']")?.addEventListener("click", () => finish("cancel"));
    overlay.querySelector<HTMLButtonElement>("[data-project-exit='discard']")?.addEventListener("click", () => finish("discard"));
    overlay.querySelector<HTMLButtonElement>("[data-project-exit='save']")?.addEventListener("click", () => finish("save"));
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) finish("cancel");
    });
    overlay.addEventListener("keydown", (event) => {
      if (event.key === "Escape") finish("cancel");
    });

    document.body.appendChild(overlay);
    overlay.querySelector<HTMLButtonElement>("[data-project-exit='save']")?.focus();
  });
}

export function createProjectExitGuard(
  actions: ProjectActions,
  openProjectManager: () => void,
  options: { formatSavedMessage?: (save: ProjectSaveFile, fallback: string) => string } = {}
) {
  let saveInProgress = false;

  const saveWithLock = async (successMessage = "Projekt je ulozeny.") => {
    if (saveInProgress) {
      showToast("Projekt sa prave uklada. Pockaj na dokoncenie.", "info");
      return false;
    }
    saveInProgress = true;
    document.body.classList.add("project-save-blocking");
    showToast("Ukladam projekt...", "info");
    try {
      const save = await actions.save();
      showToast(options.formatSavedMessage?.(save, successMessage) ?? successMessage, "success");
      return true;
    } catch (error) {
      showToast(error instanceof Error ? error.message : String(error), "error");
      return false;
    } finally {
      saveInProgress = false;
      document.body.classList.remove("project-save-blocking");
    }
  };

  const leaveProject = async () => {
    if (saveInProgress) {
      showToast("Projekt sa prave uklada. Odchod bude mozny az po ulozeni.", "info");
      return;
    }
    const choice = await openExitDialog();
    if (choice === "cancel") return;
    if (choice === "save") {
      const saved = await saveWithLock("Projekt je ulozeny. Zatvaram workspace.");
      if (!saved) return;
    }
    openProjectManager();
  };

  const beforeUnload = (event: BeforeUnloadEvent) => {
    if (!saveInProgress) return;
    event.preventDefault();
    event.returnValue = "";
  };
  window.addEventListener("beforeunload", beforeUnload);

  return {
    saveWithLock,
    leaveProject,
    dispose: () => window.removeEventListener("beforeunload", beforeUnload)
  };
}
