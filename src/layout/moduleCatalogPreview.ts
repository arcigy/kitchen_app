import type { FurnQuoteModulePackage } from "../core/module-package/module-package-types";
import {
  getFwmModulePreviewImage,
  resolveFwmModulePreviewImage
} from "../modules/fwmFurniture/modulePreviewImages";
import { mountLoadingSkeleton } from "../ui/loadingSkeleton";

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

type CatalogPreviewLoading = "eager" | "lazy";
type CatalogPreviewFetchPriority = "high" | "low" | "auto";

export function renderCatalogPreviewImage(args: {
  host: HTMLElement;
  previewImage?: string;
  fallbackSvg: () => string;
  loading?: CatalogPreviewLoading;
  fetchPriority?: CatalogPreviewFetchPriority;
}): void {
  if (!args.previewImage) {
    args.host.innerHTML = args.fallbackSvg();
    return;
  }

  const image = document.createElement("img");
  image.className = "module-catalog-card-preview";
  image.alt = "";
  image.loading = args.loading ?? "lazy";
  image.decoding = "async";
  image.draggable = false;
  image.setAttribute("fetchpriority", args.fetchPriority ?? "auto");

  const loadingSkeleton = mountLoadingSkeleton(args.host, {
    variant: "icon",
    label: "Načítavam ikonu modulu"
  });
  const ownsHost = () => image.parentElement === args.host;
  const markLoaded = () => {
    if (!ownsHost()) return;
    loadingSkeleton.clear();
    image.dataset.previewState = "loaded";
  };
  image.addEventListener("load", markLoaded, { once: true });
  image.addEventListener("error", () => {
    if (!ownsHost()) return;
    loadingSkeleton.clear();
    args.host.innerHTML = args.fallbackSvg();
  }, { once: true });

  args.host.replaceChildren(image);
  image.src = args.previewImage;
  if (image.complete && image.naturalWidth > 0) markLoaded();
}

export function renderModuleCatalogPreview(args: {
  host: HTMLElement;
  modulePackage: FurnQuoteModulePackage;
  fallbackSvg: () => string;
  loading?: CatalogPreviewLoading;
  fetchPriority?: CatalogPreviewFetchPriority;
}): void {
  renderCatalogPreviewImage({
    host: args.host,
    previewImage: resolveModuleCatalogPreviewImage(args.modulePackage),
    fallbackSvg: args.fallbackSvg,
    loading: args.loading,
    fetchPriority: args.fetchPriority
  });
}
