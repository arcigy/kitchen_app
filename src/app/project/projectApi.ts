import type { ProjectMetadata, ProjectVersionMetadata } from "../../core/project/project-types";
import type { ProjectSaveFile } from "../../core/project-save/project-save-types";
import { toSafeProjectFileName } from "../../core/project-save/project-save-file";

async function readJson<T>(response: Response): Promise<T> {
  const text = await response.text();
  let data: T;
  try {
    data = text ? JSON.parse(text) as T : ({} as T);
  } catch {
    if (!response.ok) throw new Error(text.trim() || `HTTP ${response.status}`);
    throw new Error("Server returned an invalid response.");
  }
  if (!response.ok) {
    const error = data && typeof data === "object" && "error" in data ? String((data as { error?: unknown }).error) : `HTTP ${response.status}`;
    throw new Error(error);
  }
  return data;
}

export type CreateProjectRequest = {
  name: string;
  address: string;
  city?: string;
  postalCode?: string;
  country?: string;
  contactName: string;
  email?: string;
  phone?: string;
  notes?: string;
};

export async function createProject(input: CreateProjectRequest): Promise<ProjectMetadata> {
  const data = await readJson<{ project: ProjectMetadata }>(await fetch("/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(input)
  }));
  return data.project;
}

export async function listProjects(): Promise<ProjectMetadata[]> {
  const data = await readJson<{ projects: ProjectMetadata[] }>(await fetch("/api/projects", { credentials: "include" }));
  return data.projects;
}

export async function deleteProject(projectId: string): Promise<void> {
  await readJson<{ ok: true }>(await fetch(`/api/projects/${encodeURIComponent(projectId)}`, {
    method: "DELETE",
    credentials: "include"
  }));
}

export async function saveProject(
  projectId: string,
  appState: ProjectSaveFile["appState"],
  editingSessionId?: string,
  bomSnapshot?: unknown
): Promise<ProjectSaveFile> {
  const data = await readJson<{ save: ProjectSaveFile }>(await fetch(`/api/projects/${encodeURIComponent(projectId)}/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ appState, editingSessionId, bomSnapshot, appVersion: import.meta.env?.VITE_APP_VERSION })
  }));
  return data.save;
}

export async function loadProject(projectId: string): Promise<ProjectSaveFile> {
  const data = await readJson<{ save: ProjectSaveFile }>(await fetch(`/api/projects/${encodeURIComponent(projectId)}/load`, { credentials: "include" }));
  return data.save;
}

export async function listProjectVersions(projectId: string): Promise<ProjectVersionMetadata[]> {
  const data = await readJson<{ versions: ProjectVersionMetadata[] }>(await fetch(`/api/projects/${encodeURIComponent(projectId)}/versions`, { credentials: "include" }));
  return data.versions;
}

export async function loadProjectVersion(projectId: string, versionNumber: number): Promise<ProjectSaveFile> {
  const data = await readJson<{ save: ProjectSaveFile }>(await fetch(`/api/projects/${encodeURIComponent(projectId)}/versions/${versionNumber}/load`, { credentials: "include" }));
  return data.save;
}

export async function restoreProjectVersion(projectId: string, versionNumber: number): Promise<ProjectSaveFile> {
  const data = await readJson<{ save: ProjectSaveFile }>(await fetch(`/api/projects/${encodeURIComponent(projectId)}/versions/${versionNumber}/restore`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({})
  }));
  return data.save;
}

export async function downloadProject(project: ProjectMetadata): Promise<void> {
  const response = await fetch(`/api/projects/${encodeURIComponent(project.projectId)}/download`, { credentials: "include" });
  if (!response.ok) throw new Error(await response.text());
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = toSafeProjectFileName(project.name, project.projectId);
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function importProjectFile(file: File): Promise<ProjectSaveFile> {
  const envelope = await file.text();
  const data = await readJson<{ save: ProjectSaveFile }>(await fetch("/api/projects/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ envelope })
  }));
  return data.save;
}
