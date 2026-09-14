import { describe, expect, it } from "vitest";
import { DELFI_CLIENT_ID, DELFI_SHEET_MATERIAL_MARGIN_POLICY, resolveDelfiSheetMaterialMarginPolicy } from "./projectMargins";

describe("Delfi margin policy", () => {
  it("enables the verified Delfi tenant by default and keeps other companies unchanged", () => {
    expect(resolveDelfiSheetMaterialMarginPolicy(DELFI_CLIENT_ID)).toBe(DELFI_SHEET_MATERIAL_MARGIN_POLICY);
    for (const other of ["client_arcigy_demo", "client_pino_nobilia_vkh_2026", "client_delfi_copy", "Delfi", ""]) {
      expect(resolveDelfiSheetMaterialMarginPolicy(other)).toBeUndefined();
    }
  });
  it("requires an exact tenant ID from trusted configuration", () => {
    expect(resolveDelfiSheetMaterialMarginPolicy("tenant-delfi-fixture", "tenant-delfi-fixture"))
      .toBe(DELFI_SHEET_MATERIAL_MARGIN_POLICY);
    for (const other of ["tenant-other", "Delfi", "delfi", "tenant-delfi-fixture-copy", ""]) {
      expect(resolveDelfiSheetMaterialMarginPolicy(other, "tenant-delfi-fixture")).toBeUndefined();
    }
  });

  it.each(["", " "])("supports explicitly disabling the policy (%s)", (configured) => {
    expect(resolveDelfiSheetMaterialMarginPolicy(DELFI_CLIENT_ID, configured)).toBeUndefined();
    expect(resolveDelfiSheetMaterialMarginPolicy("", configured)).toBeUndefined();
  });
});
