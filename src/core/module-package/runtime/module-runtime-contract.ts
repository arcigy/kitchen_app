import type { Group } from "three";
import type { ClientCatalog } from "../../catalog/catalog-types";

export type TrustedModuleRuntimeBuilder = {
  key: string;
  moduleType: string;
  label: string;
  build(params: Record<string, unknown>, catalog: ClientCatalog): Group;
};

export type ModuleRuntimeBuildInput = {
  runtimeBuilderKey: string;
  parameters: Record<string, unknown>;
  catalog: ClientCatalog;
};
