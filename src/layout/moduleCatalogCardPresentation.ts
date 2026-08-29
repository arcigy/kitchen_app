export type ModuleCatalogCardPresentation = {
  gridClassName: string;
  cardClassName: string;
  labelClassName: string;
  metaClassName: string;
};

export function getModuleCatalogCardPresentation(hasMeta: boolean): ModuleCatalogCardPresentation {
  return {
    gridClassName: hasMeta ? "module-catalog-grid module-catalog-grid-vendor" : "module-catalog-grid",
    cardClassName: hasMeta ? "module-catalog-card module-catalog-card-vendor" : "module-catalog-card",
    labelClassName: "module-catalog-card-label",
    metaClassName: "module-catalog-card-meta muted"
  };
}
