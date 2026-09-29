import type { ClientCatalog } from "../../core/catalog/catalog-types";
import type { CustomFurnitureParams } from "../customFurnitureTypes";

/** Selecting a material captures its price once; later catalogue changes cannot silently reprice it. */
export function captureBacksplashMaterialSnapshots(params: CustomFurnitureParams, catalog: ClientCatalog): void {
  const source = params.backsplash;
  if (!source) return;
  const capture = (id: string) => {
    const definition = catalog.materials.find(material => material.id === id && material.materialType === "board");
    return definition ? { definition: structuredClone(definition), unitPrice: catalog.priceList.prices[id] ?? null,
      currency: catalog.priceList.currency, priceListId: catalog.priceList.id, capturedAt: new Date().toISOString() } : undefined;
  };
  if (source.materialSnapshot?.definition.id !== source.materialId) source.materialSnapshot = capture(source.materialId);
  for (const board of params.boards) {
    const binding = board.backsplashSource;
    if (!binding) continue;
    if (binding.materialSnapshot?.definition.id === board.materialId) continue;
    binding.materialSnapshot = board.materialId === source.materialId && source.materialSnapshot
      ? structuredClone(source.materialSnapshot) : capture(board.materialId);
  }
}
