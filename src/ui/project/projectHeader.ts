import type { ProjectMetadata } from "../../core/project/project-types";

export function createProjectHeader(host: HTMLElement, options: { describeUser?: (userId: string) => string } = {}) {
  const el = document.createElement("div");
  el.className = "project-header";
  const slot = host.querySelector(".revit-projectlabel");
  if (slot) slot.appendChild(el);
  else host.prepend(el);

  const render = (project: ProjectMetadata | null, status = "") => {
    if (!project) {
      el.textContent = "No project created.";
      return;
    }
    const location = [project.location.address, project.location.city].filter(Boolean).join(", ");
    const savedBy = options.describeUser ? ` | Ulozil: ${options.describeUser(project.updatedByUserId)}` : "";
    el.textContent = `Projekt: ${project.name} | Miesto: ${location} | Kontakt: ${project.contact.name} | Stav: ${project.status}${savedBy}${status ? ` | ${status}` : ""}`;
  };

  render(null);
  return { element: el, render };
}
