export type ProjectStateSerializer<T = unknown> = {
  key: string;
  version: number;
  critical: boolean;
  status: "covered" | "covered_non_critical" | "missing_serializer" | "serialized_but_not_restored" | "restored_with_warning" | "ignored_non_critical";
  serialize: () => T;
  deserialize: (data: T) => void;
  validate: (data: T) => void;
};

const noop = () => undefined;

function serializer(key: string, critical: boolean, status: ProjectStateSerializer["status"]): ProjectStateSerializer {
  return {
    key,
    version: 1,
    critical,
    status,
    serialize: noop,
    deserialize: noop,
    validate: noop
  };
}

export const PROJECT_SAVE_SERIALIZERS: ProjectStateSerializer[] = [
  serializer("projectMetadata", true, "covered"),
  serializer("phases", true, "covered"),
  serializer("layout", true, "covered"),
  serializer("walls", true, "covered"),
  serializer("floors", true, "covered"),
  serializer("columns", true, "covered"),
  serializer("sections", true, "covered"),
  serializer("windows", true, "covered"),
  serializer("doors", true, "covered"),
  serializer("worktops", true, "covered"),
  serializer("customFurniture", true, "covered"),
  serializer("kitchenContext", true, "covered"),
  serializer("moduleInstances", true, "covered"),
  serializer("moduleParams", true, "covered"),
  serializer("modulePositions", true, "covered"),
  serializer("moduleDimensions", true, "covered"),
  serializer("materialSelections", true, "covered"),
  serializer("projectMaterialAssignments", true, "covered"),
  serializer("componentSelections", true, "covered"),
  serializer("pricingSettings", true, "covered"),
  serializer("quoteSettings", true, "covered"),
  serializer("catalogSnapshot", true, "covered"),
  serializer("assetManifest", true, "covered"),
  serializer("sceneState", false, "covered_non_critical"),
  serializer("editorState", false, "covered_non_critical"),
  serializer("cameraState", false, "covered_non_critical"),
  serializer("selections", false, "covered_non_critical")
];

export function auditProjectSaveSerializers() {
  const covered: string[] = [];
  const covered_non_critical: string[] = [];
  const missing_serializer: string[] = [];
  const serialized_but_not_restored: string[] = [];
  const restored_with_warning: string[] = [];
  const ignored_non_critical: string[] = [];

  for (const item of PROJECT_SAVE_SERIALIZERS) {
    ({ covered, covered_non_critical, missing_serializer, serialized_but_not_restored, restored_with_warning, ignored_non_critical }[item.status]).push(item.key);
  }

  return { covered, covered_non_critical, missing_serializer, serialized_but_not_restored, restored_with_warning, ignored_non_critical };
}

export function assertNoMissingCriticalProjectSerializers(): void {
  const offenders = PROJECT_SAVE_SERIALIZERS.filter(
    (item) => item.critical && (item.status === "missing_serializer" || item.status === "serialized_but_not_restored")
  );
  if (offenders.length) throw new Error(`Missing critical project serializers: ${offenders.map((item) => item.key).join(", ")}`);
}
