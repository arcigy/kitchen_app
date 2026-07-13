export class ProjectMaterialRevisionConflictError extends Error {
  readonly code = "PROJECT_MATERIAL_REVISION_CONFLICT";

  constructor(
    readonly expectedRevision: number,
    readonly actualRevision: number
  ) {
    super(`Project material assignments revision conflict: expected ${expectedRevision}, current revision is ${actualRevision}.`);
    this.name = "ProjectMaterialRevisionConflictError";
  }
}

export class ProjectMaterialAssignmentAuthorityError extends ProjectMaterialRevisionConflictError {
  constructor(incomingRevision: number, storedRevision: number) {
    super(incomingRevision, storedRevision);
    this.name = "ProjectMaterialAssignmentAuthorityError";
    this.message = "Project material assignments may only be changed through the dedicated materials endpoint.";
  }
}
