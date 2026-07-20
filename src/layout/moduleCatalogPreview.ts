import type { FurnQuoteModulePackage } from "../core/module-package/module-package-types";
import { getFwmModulePreviewImage } from "../modules/fwmFurniture/modulePreviewImages";

export function resolveModuleCatalogPreviewImage(modulePackage: FurnQuoteModulePackage): string | undefined {
  const declaredPreview = modulePackage.ui.previewImage?.trim();
  return declaredPreview || getFwmModulePreviewImage(modulePackage.module.moduleType);
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
