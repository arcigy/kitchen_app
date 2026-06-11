import type { CustomFurnitureSharedDrawIconMap } from "./customFurnitureTopbarModel";

const ribbonIcon = (body: string) => `
<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" style="fill:none">
  ${body}
</svg>`;

export const CUSTOM_FURNITURE_TOOLBAR_ICONS = {
  line: ribbonIcon(`<path d="M5 18 19 6"/><circle cx="5" cy="18" r="1.4"/><circle cx="19" cy="6" r="1.4"/>`),
  rect: ribbonIcon(`<rect x="5" y="6" width="14" height="12" rx="1"/><circle cx="5" cy="6" r="1"/><circle cx="19" cy="18" r="1"/>`),
  polygon: ribbonIcon(`<path d="m12 4 7 5-2.6 8H7.6L5 9z"/><circle cx="12" cy="4" r="1"/><circle cx="5" cy="9" r="1"/>`),
  circle: ribbonIcon(`<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="1.2"/><path d="M12 12h7"/>`),
  arc: ribbonIcon(`<path d="M5 17a9 9 0 0 1 14 0"/><circle cx="5" cy="17" r="1.1"/><circle cx="19" cy="17" r="1.1"/><circle cx="12" cy="9" r="1.1"/>`),
  spline: ribbonIcon(`<path d="M4 16c3-8 5 6 8-1s5-1 8-7"/><circle cx="4" cy="16" r="1"/><circle cx="12" cy="15" r="1"/><circle cx="20" cy="8" r="1"/>`),
  pick: ribbonIcon(`<path d="M5 6h12"/><path d="M7 12h9"/><path d="m14 13 4 4"/><path d="m18 13-4 4"/><path d="M18 5v5"/>`),
  boundary: ribbonIcon(`<path d="M5 5h14v14H5z" stroke-dasharray="3 2"/><path d="M8 8h8v8H8z"/>`),
  pin: ribbonIcon(`<path d="M12 3v18"/><path d="M7 8h10"/><path d="M9 5h6"/><path d="m9 15 3 3 3-3"/>`),
  slope: ribbonIcon(`<path d="M4 18 19 6"/><path d="M11 6h8v8"/>`),
  span: ribbonIcon(`<path d="M5 6v12M19 6v12"/><path d="M7 12h10"/><path d="m7 12 2-2M7 12l2 2M17 12l-2-2M17 12l-2 2"/>`)
} as const;

export const CUSTOM_FURNITURE_SHARED_DRAW_ICONS: CustomFurnitureSharedDrawIconMap = {
  boundaryLine: CUSTOM_FURNITURE_TOOLBAR_ICONS.boundary,
  line: CUSTOM_FURNITURE_TOOLBAR_ICONS.line,
  rectangle: CUSTOM_FURNITURE_TOOLBAR_ICONS.rect,
  polygon: CUSTOM_FURNITURE_TOOLBAR_ICONS.polygon,
  circle: CUSTOM_FURNITURE_TOOLBAR_ICONS.circle,
  arc: CUSTOM_FURNITURE_TOOLBAR_ICONS.arc,
  spline: CUSTOM_FURNITURE_TOOLBAR_ICONS.spline,
  pickLines: CUSTOM_FURNITURE_TOOLBAR_ICONS.pick
};
