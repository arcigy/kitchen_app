import type { ClientCatalog } from "../core/catalog/catalog-types";
import type { ProjectSaveFile } from "../core/project-save/project-save-types";
import type { CommercialViewSource } from "../core/commercialViewSource";
import { normalizeProjectMarginSettingsState } from "../core/project-margins/project-margin-types";

export function commercialViewSource(save: ProjectSaveFile, catalog: ClientCatalog): CommercialViewSource {
  return {
    projectId: save.projectId,
    phaseId: save.activePhaseId,
    saveRevision: save.integrity?.saveRevision ?? 0,
    materialRevision: save.appState.materialAssignments.revision,
    marginRevision: normalizeProjectMarginSettingsState(save.appState.quoteSettings).revision,
    catalogVersion: String(catalog.meta.catalogVersion),
    catalogUpdatedAt: catalog.meta.updatedAt
  };
}
