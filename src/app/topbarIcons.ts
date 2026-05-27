const icon = (body: string) => `
<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" style="fill:none">
  ${body}
</svg>`;

const imageIcon = (src: string) => `<img src="${src}" alt="" aria-hidden="true">`;

export const topbarIcons = {
  I_SELECT: icon(`<path d="M7 4.8l9.8 8.1-5 .8-2.3 4.7L7 4.8z"/><path d="M12.4 13.7l3.6 4.5"/>`),
  I_WALL: imageIcon("/cad-icons/stena.svg"),
  I_DOOR: imageIcon("/cad-icons/dvere.svg"),
  I_WINDOW: imageIcon("/cad-icons/window.svg"),
  I_COLUMN: imageIcon("/cad-icons/stlp.svg"),
  I_STAIR: imageIcon("/cad-icons/stairs.svg"),
  I_ALIGN: icon(`<path d="M18 4.5v15"/><path d="M6 7h8M6 12h11M6 17h8"/><path d="M15.5 7H18M15.5 17H18"/>`),
  I_TRIM: icon(`<path d="M5 6.5h10.5"/><path d="M5 17.5h8"/><path d="M16.5 5.5l3 3"/><path d="M11.3 13.7l7.2-7.2"/><path d="M13.2 13.2l5.3 5.3"/>`),
  I_SECTION: icon(`<path d="M4.5 7h15"/><path d="M7.5 10v8.5M16.5 10v8.5"/><path d="M7.5 10l2.5 2.5M7.5 10L5 12.5"/><path d="M16.5 10L14 12.5M16.5 10l2.5 2.5"/><path d="M10.5 15h3"/>`),
  I_DIM: icon(`<path d="M5.5 6.5v11M18.5 6.5v11"/><path d="M7.5 12h9"/><path d="M7.5 12l2-2M7.5 12l2 2M16.5 12l-2-2M16.5 12l-2 2"/><path d="M8.5 5h7M8.5 19h7"/>`),
  I_MEASURE: icon(`<path d="M5 15.5l10.5-10.5 3.5 3.5L8.5 19H5z"/><path d="M8.1 15.9l1.4 1.4M10.2 13.8l1 1M12.3 11.7l1.4 1.4M14.4 9.6l1 1M16.5 7.5l1.4 1.4"/>`),
  I_FLOOR: imageIcon("/cad-icons/strop.svg"),
  I_UNDERLAY: icon(`<path d="M7 3.8h7.8L18 7v13.2H7z"/><path d="M14.8 3.8V7H18"/><path d="M9.2 15.5l2-2 1.4 1.3 1.9-2.4 1.9 3.1z"/><path d="M9.2 10.2h5.6"/>`),
  I_CABINET: imageIcon("/cad-icons/kitchen.svg"),
  I_LIVING_WALL: imageIcon("/cad-icons/livingroomwall.svg"),
  I_WARDROBE: imageIcon("/cad-icons/wardrobe.svg"),
  I_GRID2D: icon(`<rect x="4.5" y="4.5" width="15" height="15" rx="1.2"/><path d="M9.5 4.5v15M14.5 4.5v15M4.5 9.5h15M4.5 14.5h15"/>`),
  I_UNDO: icon(`<path d="M8.8 7.5H4.8V3.8"/><path d="M4.8 7.5l3.6-3.4"/><path d="M5.2 13.2a6.5 6.5 0 1 0 2.2-4.9"/>`),
  I_REDO: icon(`<path d="M15.2 7.5h4V3.8"/><path d="M19.2 7.5l-3.6-3.4"/><path d="M18.8 13.2a6.5 6.5 0 1 1-2.2-4.9"/>`),
  I_MOVE: icon(`<path d="M12 3.8v16.4M3.8 12h16.4"/><path d="M12 3.8L9.5 6.3M12 3.8l2.5 2.5M12 20.2l-2.5-2.5M12 20.2l2.5-2.5M3.8 12l2.5-2.5M3.8 12l2.5 2.5M20.2 12l-2.5-2.5M20.2 12l-2.5 2.5"/>`),
  I_ROTATE: icon(`<path d="M17.6 8.3A6.8 6.8 0 0 0 5.5 12"/><path d="M15.1 8.3h2.8V5.5"/><path d="M6.4 15.7A6.8 6.8 0 0 0 18.5 12"/><path d="M8.9 15.7H6.1v2.8"/>`),
  I_DUP: icon(`<rect x="8" y="5.5" width="10.5" height="12.5" rx="1.2"/><path d="M5.5 8.5v12h10.5"/><path d="M11 10h4.5M11 13.5h3"/>`),
  I_HIDE: icon(`<path d="M3.5 12s3.3-5.2 8.5-5.2c1.8 0 3.3.5 4.6 1.3"/><path d="M20.5 12s-3.3 5.2-8.5 5.2c-1.8 0-3.3-.5-4.6-1.3"/><path d="M4.5 19.5l15-15"/><path d="M10.1 14a3 3 0 0 1 3.9-3.9"/>`),
  I_ISOLATE: icon(`<rect x="4.5" y="4.5" width="5.5" height="5.5" rx="1"/><rect x="14" y="4.5" width="5.5" height="5.5" rx="1"/><rect x="4.5" y="14" width="5.5" height="5.5" rx="1"/><path d="M15 15l4.5 4.5M19.5 15L15 19.5"/>`),
  I_UNHIDE: icon(`<path d="M3.5 12s3.3-5.2 8.5-5.2 8.5 5.2 8.5 5.2-3.3 5.2-8.5 5.2S3.5 12 3.5 12z"/><circle cx="12" cy="12" r="2.8"/>`),
  I_TRASH: icon(`<path d="M4.5 6.5h15"/><path d="M9 6.5V4.5h6v2"/><path d="M7.5 9l.8 10.5h7.4L16.5 9"/><path d="M10.5 11.5v5M13.5 11.5v5"/>`),
  I_RESET: icon(`<path d="M7 7.2A7 7 0 1 1 5.8 15"/><path d="M7 3.8v3.4h3.4"/><path d="M12 9v4l3 1.7"/>`),
  I_EXPORT: icon(`<path d="M12 4.5v9"/><path d="M8.8 10.8L12 14l3.2-3.2"/><path d="M5.5 17.5h13v2.5h-13z"/><path d="M7.5 15.8v1.7M16.5 15.8v1.7"/>`),
  I_COPY: icon(`<rect x="8" y="7" width="10.5" height="13" rx="1.2"/><path d="M5.5 17V4h10v1.5"/><path d="M11 11h4.5M11 14.5h3"/>`),
  I_BOM: icon(`<path d="M6.5 3.8h11v16.4h-11z"/><path d="M9.5 7.5h5M9.5 11.5h5M9.5 15.5h3.5"/><path d="M8 7.5h.1M8 11.5h.1M8 15.5h.1"/>`),
  I_INSTALL: icon(`<path d="M12 4.5v8.5"/><path d="M8.8 9.8L12 13l3.2-3.2"/><path d="M5.5 16.5h13v4h-13z"/><path d="M8.5 18.5h7"/>`),
  I_VIEW: icon(`<path d="M3.3 12s3.3-5.5 8.7-5.5 8.7 5.5 8.7 5.5-3.3 5.5-8.7 5.5S3.3 12 3.3 12z"/><circle cx="12" cy="12" r="2.8"/><path d="M18.8 5.2l1.7-1.7M3.5 20.5l1.7-1.7"/>`),
  I_DONE: icon(`<path d="M5 12.5l4 4L19 6.8"/>`),
  I_CANCEL: icon(`<path d="M6 6l12 12M18 6L6 18"/>`)
};
