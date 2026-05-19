import type { ProjectMetadata } from "../../core/project/project-types";

export function createProjectHeader(host: HTMLElement) {
  const el = document.createElement("div");
  el.className = "project-header";
  host.prepend(el);

  const render = (project: ProjectMetadata | null, status = "") => {
    if (!project) {
      el.textContent = "No project created.";
      return;
    }
    const location = [project.location.address, project.location.city].filter(Boolean).join(", ");
    el.textContent = `Projekt: ${project.name} | Miesto: ${location} | Kontakt: ${project.contact.name} | Stav: ${project.status}${status ? ` | ${status}` : ""}`;
  };

  render(null);
  return { element: el, render };
}
