export function openProjectFilePicker(onFile: (file: File) => Promise<void>): void {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".fqp";
  input.addEventListener("change", async () => {
    const file = input.files?.[0] ?? null;
    if (file) await onFile(file);
    input.remove();
  });
  input.click();
}

export async function openProjectListDialog(args: {
  listProjects: () => Promise<Array<{ projectId: string; name: string; location?: { address?: string }; updatedAt: string }>>;
  onLoad: (projectId: string) => Promise<void>;
}): Promise<void> {
  const overlay = document.createElement("div");
  overlay.className = "project-dialog-overlay";
  const panel = document.createElement("div");
  panel.className = "project-dialog";
  overlay.appendChild(panel);
  const title = document.createElement("h2");
  title.textContent = "Load Project";
  panel.appendChild(title);
  const list = document.createElement("div");
  panel.appendChild(list);
  const error = document.createElement("div");
  error.className = "project-dialog-error";
  panel.appendChild(error);
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "Close";
  close.addEventListener("click", () => overlay.remove());
  panel.appendChild(close);
  document.body.appendChild(overlay);

  try {
    const projects = await args.listProjects();
    if (projects.length === 0) {
      list.textContent = "No projects.";
      return;
    }
    for (const project of projects) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "project-list-item";
      button.textContent = `${project.name} - ${project.location?.address ?? ""}`;
      button.addEventListener("click", async () => {
        button.disabled = true;
        try {
          await args.onLoad(project.projectId);
          overlay.remove();
        } catch (err: unknown) {
          error.textContent = err instanceof Error ? err.message : String(err);
          button.disabled = false;
        }
      });
      list.appendChild(button);
    }
  } catch (err: unknown) {
    error.textContent = err instanceof Error ? err.message : String(err);
  }
}
