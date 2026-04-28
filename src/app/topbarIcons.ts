const icon = (d: string) => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;

export const topbarIcons = {
  I_SELECT: icon("M4 4h7v2H6v5H4V4zm14 0v7h-2V6h-5V4h7zM4 20v-7h2v5h5v2H4zm16-7v7h-7v-2h5v-5h2z"),
  I_WALL: icon("M4 6h16v2H4V6zm0 10h16v2H4v-2zM6 8h2v8H6V8zm10 0h2v8h-2V8z"),
  I_UNDERLAY: icon("M6 2h9l3 3v17H6V2zm9 1.5V6h2.5L15 3.5zM8 9h8v2H8V9zm0 4h8v2H8v-2z"),
  I_CABINET: icon("M4 6h16v14H4V6zm2 2v3h12V8H6zm0 5v5h5v-5H6zm7 0v5h5v-5h-5z"),
  I_GRID2D: icon("M4 4h16v16H4V4zm2 2v4h4V6H6zm6 0v4h6V6h-6zM6 12v6h4v-6H6zm6 0v6h6v-6h-6z"),
  I_DUP: icon("M7 7h10v10H7V7zm-3 3h2v10h10v2H4V10z"),
  I_TRASH: icon("M9 3h6l1 2h5v2H3V5h5l1-2zm1 6h2v10h-2V9zm4 0h2v10h-2V9z"),
  I_EXPORT: icon("M12 3v10l3-3 1.4 1.4L12 16.8 7.6 11.4 9 10l3 3V3h0zM5 19h14v2H5v-2z"),
  I_COPY: icon("M8 7h11v14H8V7zM5 3h11v2H7v12H5V3z"),
  I_RESET: icon("M12 6V3l-4 4 4 4V8c2.8 0 5 2.2 5 5a5 5 0 1 1-9.8-1H5.1A7 7 0 1 0 12 6z"),
  I_VIEW: icon("M12 5c5.5 0 9.5 5.5 9.5 7s-4 7-9.5 7S2.5 14.5 2.5 12 6.5 5 12 5zm0 3a4 4 0 1 0 0 8 4 4 0 0 0 0-8z"),
  I_BOM: icon("M5 3h14v18H5V3zm2 2v4h10V5H7zm0 6v2h10v-2H7zm0 4v2h6v-2H7z"),
  I_ALIGN: icon("M4 7h12v2H4V7zm0 8h12v2H4v-2zM18 6l4 3-4 3V6zm0 6l4 3-4 3v-6z"),
  I_TRIM: icon("M4 7h11v2H4V7zm0 8h8v2H4v-2zM18 5l4 4-2 2-4-4 2-2zm-4 4l4 4-2 2-4-4 2-2z"),
  I_DIM: icon("M3 7h18v2H3V7zm0 8h18v2H3v-2zM6 9v6H4V9h2zm16 0v6h-2V9h2z"),
  I_SECTION: icon("M4 6h16v2H4V6zm2 4h2v8H6v-8zm10 0h2v8h-2v-8zm-5 1 4 4-1.4 1.4L12 13.8V20h-2v-6.2l-1.6 1.6L7 14l4-4z"),
  I_FLOOR: icon("M4 15l8 4 8-4-8-4-8 4zm0-4l8 4 8-4-8-4-8 4z"),
  I_UNDO: icon("M12 5H7.8l1.6-1.6L8 2 4 6l4 4 1.4-1.4L7.8 7H12c3.3 0 6 2.7 6 6 0 1.1-.3 2.1-.8 3l1.7 1c.7-1.2 1.1-2.6 1.1-4 0-4.4-3.6-8-8-8z"),
  I_REDO: icon("M12 5c-4.4 0-8 3.6-8 8 0 1.4.4 2.8 1.1 4l1.7-1c-.5-.9-.8-1.9-.8-3 0-3.3 2.7-6 6-6h4.2l-1.6 1.6L16 10l4-4-4-4-1.4 1.4L16.2 5H12z"),
  I_DONE: icon("M9 16.2 4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4z"),
  I_CANCEL: icon("M18.3 5.7 12 12l6.3 6.3-1.4 1.4L10.6 13.4 4.3 19.7 2.9 18.3 9.2 12 2.9 5.7 4.3 4.3 10.6 10.6 16.9 4.3z"),
  I_MOVE: icon("M11 2h2v4h3l-4 4-4-4h3V2zm0 16H8l4-4 4 4h-3v4h-2v-4zM2 11h4V8l4 4-4 4v-3H2v-2zm16 0h4v2h-4v3l-4-4 4-4v3z"),
  I_ROTATE: icon("M12 5V2L7.8 6.2 12 10V7c2.8 0 5 2.2 5 5 0 1.3-.5 2.5-1.3 3.4l1.4 1.4A7 7 0 0 0 12 5zm-5.1 2.2A7 7 0 0 0 12 19v3l4.2-4.2L12 14v3a5 5 0 0 1-3.7-8.4L6.9 7.2z"),
  I_INSTALL: icon("M12 3v8.2l2.6-2.6 1.4 1.4-5 5-5-5 1.4-1.4 2.6 2.6V3h2zm-7 14h14v4H5v-4z")
};
