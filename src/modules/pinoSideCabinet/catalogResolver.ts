import type { ClientCatalog } from "../../core/catalog/catalog-types";
import {
  resolveVendorProductVariant,
  type VendorProductResolution
} from "../../core/catalog/vendor-product-resolver";
import {
  getPinoSideCabinetDefinition,
  normalizePinoSideCabinetParams,
  type PinoSideCabinetParams
} from "./types";
import {
  createPinoSideCabinetPlacementCandidate,
  getPinoSideCabinetCapability,
  validatePinoSideCabinetPlacementCandidate,
  type PinoSideCabinetPlacementCandidate
} from "./rules";

export type PinoSideCabinetCatalogResolution = VendorProductResolution & {
  placement: ReturnType<typeof validatePinoSideCabinetPlacementCandidate>;
  capability: ReturnType<typeof getPinoSideCabinetCapability>;
};

export function resolvePinoSideCabinetCatalogVariant(
  catalog: Pick<ClientCatalog, "vendorCatalog">,
  params: PinoSideCabinetParams,
  placementCandidate?: PinoSideCabinetPlacementCandidate
): PinoSideCabinetCatalogResolution {
  const normalized = normalizePinoSideCabinetParams(params);
  const definition = getPinoSideCabinetDefinition(normalized.definitionId);
  const capability = getPinoSideCabinetCapability(normalized);
  const resolution = resolveVendorProductVariant(catalog, {
    moduleType: normalized.type,
    articleFamily: definition.articleFamily,
    widthMm: normalized.width,
    variantCode: definition.variantCode,
    productTemplateName: definition.productTemplateName,
    catalogKey: normalized.catalogKey
  });
  const placement = validatePinoSideCabinetPlacementCandidate(
    normalized,
    placementCandidate ?? createPinoSideCabinetPlacementCandidate(normalized)
  );
  return {
    ...resolution,
    capability,
    placement
  };
}
