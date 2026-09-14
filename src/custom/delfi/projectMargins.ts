import type { ProjectMarginSheetMaterialPolicy } from "../../layout/bom/projectMargins";

export const DELFI_CLIENT_ID = "client_delfi";

/** Delfi's requested denominator includes physical board area from 16 mm. */
export const DELFI_SHEET_MATERIAL_MARGIN_POLICY: Readonly<ProjectMarginSheetMaterialPolicy> = {
  minimumThicknessMm: 16
};

/** Only the trusted server configuration identifies Delfi; names and request data never enable it. */
export function resolveDelfiSheetMaterialMarginPolicy(
  clientId: string,
  configuredDelfiClientId: string | undefined = DELFI_CLIENT_ID
): Readonly<ProjectMarginSheetMaterialPolicy> | undefined {
  const delfiClientId = configuredDelfiClientId?.trim();
  return delfiClientId && clientId === delfiClientId ? DELFI_SHEET_MATERIAL_MARGIN_POLICY : undefined;
}
