import type { FurnQuoteModulePackage } from "../core/module-package/module-package-types";
import {
  getFwmModulePreviewImage,
  resolveFwmModulePreviewImage
} from "../modules/fwmFurniture/modulePreviewImages";

function defaultModuleVariant(modulePackage: FurnQuoteModulePackage): unknown {
  return modulePackage.parameters.parameters.find((parameter) => parameter.key === "variant")?.defaultValue;
}

export function resolveModuleCatalogPreviewImage(modulePackage: FurnQuoteModulePackage): string | undefined {
  const declaredPreview = modulePackage.ui.previewImage?.trim();
  const moduleType = modulePackage.module.moduleType;
  const genericBuiltInPreview = getFwmModulePreviewImage(moduleType);
  const builtInPreview = resolveFwmModulePreviewImage({
    moduleType,
    modulePackageId: modulePackage.module.modulePackageId,
    variant: defaultModuleVariant(modulePackage)
  });
  const legacyBuiltInPreview = `/module-icons/furniture/${moduleType}.png`;
  const usesGeneratedFurniturePreview = declaredPreview?.startsWith("/module-icons/furniture/") === true;
  const usesManagedPreview = !declaredPreview
    || declaredPreview === legacyBuiltInPreview
    || declaredPreview === genericBuiltInPreview
    || usesGeneratedFurniturePreview;
  if (builtInPreview && usesManagedPreview) return builtInPreview;
  return declaredPreview || builtInPreview;
}

export function renderModuleCatalogPreview(args: {
  host: HTMLElement;
  modulePackage: FurnQuoteModulePackage;
  fallbackSvg: () => string;
}): void {
  const previewImage = resolveModuleCatalogPreviewImage(args.modulePackage);
  if (!previewImage) {
    args.host.innerHTML = args.fallbackSvg();
    return;
  }

  const image = document.createElement("img");
  image.className = "module-catalog-card-preview";
  image.src = previewImage;
  image.alt = "";
  image.loading = "lazy";
  image.decoding = "async";
  image.draggable = false;
  image.addEventListener("error", () => {
    args.host.innerHTML = args.fallbackSvg();
  }, { once: true });
  args.host.replaceChildren(image);
}
