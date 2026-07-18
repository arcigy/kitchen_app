export class ProjectMarginRevisionConflictError extends Error {
  readonly code = "PROJECT_MARGIN_REVISION_CONFLICT";

  constructor(
    readonly expectedRevision: number,
    readonly actualRevision: number
  ) {
    super(`Project margin settings revision conflict: expected ${expectedRevision}, current revision is ${actualRevision}.`);
    this.name = "ProjectMarginRevisionConflictError";
  }
}

export class ProjectMarginAuthorityError extends ProjectMarginRevisionConflictError {
  constructor(incomingRevision: number, storedRevision: number) {
    super(incomingRevision, storedRevision);
    this.name = "ProjectMarginAuthorityError";
    this.message = "Project margin settings may only be changed through the dedicated margins endpoint.";
  }
}
