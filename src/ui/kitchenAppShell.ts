const navItems = [
  {
    id: "design",
    label: "Design",
    viewBox: "0 0 24 24",
    icon: `<path d="M12 3.6 19.2 7.7v8.4L12 20.4l-7.2-4.3V7.7L12 3.6Z" /><path d="M12 12v8.4" /><path d="m4.8 7.9 7.2 4.1 7.2-4.1" /><path d="m12 3.6 7.2 4.1" />`
  },
  {
    id: "sheets",
    label: "Sheets",
    imgSrc: "/cad-icons/sheets.svg"
  },
  {
    id: "documents",
    label: "Documents",
    imgSrc: "/cad-icons/documents.svg"
  },
  {
    id: "visualisation",
    label: "Visualisation",
    imgSrc: "/cad-icons/visualisation.svg"
  },
  {
    id: "schedules",
    label: "Schedules",
    viewBox: "0 0 24 24",
    icon: `<path d="M5.3 5.5h13.4v13.3H5.3V5.5Z" /><path d="M5.3 9.1h13.4" /><path d="M8.3 3.9v3.1" /><path d="M15.7 3.9v3.1" /><path d="M8.4 12.1h2.2" /><path d="M13.4 12.1h2.2" /><path d="M8.4 15.4h2.2" /><path d="M13.4 15.4h2.2" />`
  },
  {
    id: "quantities",
    label: "Quantities",
    imgSrc: "/cad-icons/quantities.svg"
  },
  {
    id: "materials",
    label: "Materials",
    imgSrc: "/cad-icons/material.svg"
  },
  {
    id: "settings",
    label: "Settings",
    imgSrc: "/cad-icons/nastavenia.svg"
  }
];

export function renderKitchenAppShell(root: HTMLElement): void {
  root.className = "archux-app";
  root.innerHTML = `
    <header id="ribbon" aria-label="Ribbon toolbar"></header>

    <div id="main" class="archux-main">
      <nav class="archux-side-nav" aria-label="Main navigation">
        ${navItems
          .map(
            (item, index) => `
              <button class="archux-side-nav-item${index === 0 ? " active" : ""}" type="button" data-workspace-nav="${item.id}">
                ${
                  "imgSrc" in item
                    ? `<img class="archux-side-icon-img" src="${item.imgSrc}" alt="" aria-hidden="true" />`
                    : `<svg class="archux-side-icon${"filled" in item && item.filled ? " filled" : ""}" viewBox="${item.viewBox}" aria-hidden="true">${item.icon}</svg>`
                }
                <span>${item.label}</span>
              </button>
            `
          )
          .join("")}
      </nav>

      <aside id="moduleCatalog" class="archux-module-catalog" aria-label="Module catalog" hidden></aside>

      <div id="viewer" aria-label="3D viewer">
        <button id="resetViewBtn" type="button" title="Reset view">Reset view</button>
        <div class="archux-view-tools" role="toolbar" aria-label="Viewer navigation tools">
          <button class="archux-view-tool active" type="button" data-viewer-tool="select" aria-label="Select">
            <svg viewBox="0 0 32 32" aria-hidden="true">
              <path d="M8.7 5.4 23.9 19.8l-8.4.6-3.8 7.2Z" />
              <path d="m17.4 19.7 5.2 7" />
            </svg>
          </button>
          <button class="archux-view-tool" type="button" data-viewer-tool="pan" aria-label="Pan">
            <svg viewBox="0 0 32 32" aria-hidden="true">
              <path d="M11.2 15.3V8.4a2.1 2.1 0 0 1 4.2 0v5.7" />
              <path d="M15.4 14.2V6.9a2.1 2.1 0 0 1 4.2 0v7.9" />
              <path d="M19.6 15V9.1a2.1 2.1 0 0 1 4.1 0v9.8" />
              <path d="M11.2 15.4 9.3 13.5a2.15 2.15 0 0 0-3.1 3l6.5 7.6a7.1 7.1 0 0 0 5.4 2.5h.9a6.7 6.7 0 0 0 6.7-6.7v-4.2" />
            </svg>
          </button>
          <button class="archux-view-tool" type="button" data-viewer-tool="zoom-out" aria-label="Zoom out">
            <svg viewBox="0 0 32 32" aria-hidden="true">
              <circle cx="13.7" cy="13.7" r="8.1" />
              <path d="M19.7 19.7 26.6 26.6" />
              <path d="M9.4 13.7H18" />
            </svg>
          </button>
          <button class="archux-view-tool" type="button" data-viewer-tool="zoom-in" aria-label="Zoom in">
            <svg viewBox="0 0 32 32" aria-hidden="true">
              <circle cx="13.7" cy="13.7" r="8.1" />
              <path d="M19.7 19.7 26.6 26.6" />
              <path d="M9.4 13.7H18" />
              <path d="M13.7 9.4V18" />
            </svg>
          </button>
          <button class="archux-view-tool" type="button" data-viewer-tool="orbit" aria-label="Orbit">
            <svg viewBox="0 0 32 32" aria-hidden="true">
              <path d="M8.4 10.5 16 6.1l7.6 4.4v9L16 23.9l-7.6-4.4Z" />
              <path d="M16 14.9v9" />
              <path d="m8.4 10.5 7.6 4.4 7.6-4.4" />
              <path d="M10.5 21.1a10.8 10.8 0 0 0 13.7-2" />
              <path d="m25.2 16.7-.7 3.9-3.7-.9" />
            </svg>
          </button>
          <button class="archux-view-tool" type="button" data-viewer-tool="fit" aria-label="Fit view">
            <svg viewBox="0 0 32 32" aria-hidden="true">
              <path d="M6.5 13V6.5H13" />
              <path d="M25.5 13V6.5H19" />
              <path d="M6.5 19v6.5H13" />
              <path d="M19 25.5h6.5V19" />
              <path d="M12 20 20 12" />
              <path d="M15.3 11.7H20v4.7" />
            </svg>
          </button>
        </div>
        <div class="archux-view-cube" role="group" aria-label="View cube">
          <button class="archux-view-cube-roll roll-left" type="button" data-view-rotate="ccw" aria-label="Rotate view left">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.5 7.2a6.5 6.5 0 1 1-1.6 6.6" /><path d="M8.6 3.8v3.6H5" /></svg>
          </button>
          <button class="archux-view-cube-roll roll-right" type="button" data-view-rotate="cw" aria-label="Rotate view right">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15.5 7.2a6.5 6.5 0 1 0 1.6 6.6" /><path d="M15.4 3.8v3.6H19" /></svg>
          </button>
          <div class="archux-view-cube-orbit" aria-hidden="true">
            <span class="orbit-n">N</span>
            <span class="orbit-e">E</span>
            <span class="orbit-s">S</span>
            <span class="orbit-w">W</span>
          </div>
          <div class="archux-view-cube-shell-shadow" aria-hidden="true"></div>
          <div class="archux-view-cube-shell">
            <button class="archux-view-cube-face face-front" type="button" data-view-target="front">FRONT</button>
            <button class="archux-view-cube-face face-back" type="button" data-view-target="back">BACK</button>
            <button class="archux-view-cube-face face-right" type="button" data-view-target="right">RIGHT</button>
            <button class="archux-view-cube-face face-left" type="button" data-view-target="left">LEFT</button>
            <button class="archux-view-cube-face face-top" type="button" data-view-target="top">TOP</button>
            <button class="archux-view-cube-face face-bottom" type="button" data-view-target="bottom">BOTTOM</button>
            <button class="archux-view-cube-hit hit-edge hit-top-front" type="button" data-view-target="top-front" aria-label="Top front edge view"></button>
            <button class="archux-view-cube-hit hit-edge hit-top-back" type="button" data-view-target="top-back" aria-label="Top back edge view"></button>
            <button class="archux-view-cube-hit hit-edge hit-top-left" type="button" data-view-target="top-left" aria-label="Top left edge view"></button>
            <button class="archux-view-cube-hit hit-edge hit-top-right" type="button" data-view-target="top-right" aria-label="Top right edge view"></button>
            <button class="archux-view-cube-hit hit-edge hit-front-left" type="button" data-view-target="front-left" aria-label="Front left edge view"></button>
            <button class="archux-view-cube-hit hit-edge hit-front-right" type="button" data-view-target="front-right" aria-label="Front right edge view"></button>
            <button class="archux-view-cube-hit hit-edge hit-back-left" type="button" data-view-target="back-left" aria-label="Back left edge view"></button>
            <button class="archux-view-cube-hit hit-edge hit-back-right" type="button" data-view-target="back-right" aria-label="Back right edge view"></button>
            <button class="archux-view-cube-hit hit-edge hit-bottom-front" type="button" data-view-target="bottom-front" aria-label="Bottom front edge view"></button>
            <button class="archux-view-cube-hit hit-edge hit-bottom-back" type="button" data-view-target="bottom-back" aria-label="Bottom back edge view"></button>
            <button class="archux-view-cube-hit hit-edge hit-bottom-left" type="button" data-view-target="bottom-left" aria-label="Bottom left edge view"></button>
            <button class="archux-view-cube-hit hit-edge hit-bottom-right" type="button" data-view-target="bottom-right" aria-label="Bottom right edge view"></button>
            <button class="archux-view-cube-hit hit-corner hit-top-front-left" type="button" data-view-target="top-front-left" aria-label="Top front left view"></button>
            <button class="archux-view-cube-hit hit-corner hit-top-front-right" type="button" data-view-target="top-front-right" aria-label="Top front right view"></button>
            <button class="archux-view-cube-hit hit-corner hit-top-back-left" type="button" data-view-target="top-back-left" aria-label="Top back left view"></button>
            <button class="archux-view-cube-hit hit-corner hit-top-back-right" type="button" data-view-target="top-back-right" aria-label="Top back right view"></button>
            <button class="archux-view-cube-hit hit-corner hit-bottom-front-left" type="button" data-view-target="bottom-front-left" aria-label="Bottom front left view"></button>
            <button class="archux-view-cube-hit hit-corner hit-bottom-front-right" type="button" data-view-target="bottom-front-right" aria-label="Bottom front right view"></button>
            <button class="archux-view-cube-hit hit-corner hit-bottom-back-left" type="button" data-view-target="bottom-back-left" aria-label="Bottom back left view"></button>
            <button class="archux-view-cube-hit hit-corner hit-bottom-back-right" type="button" data-view-target="bottom-back-right" aria-label="Bottom back right view"></button>
          </div>
        </div>
      </div>

      <aside id="properties" aria-label="Properties"></aside>

      <footer class="archux-bottom" aria-label="Project overview">
        <section class="archux-levels archux-view-list">
          <strong>VIEWS</strong>
          <div class="archux-view-list-scroll">
            <button type="button" data-bottom-view-key="floorplan"><span>Floorplan</span></button>
            <button type="button" data-bottom-view-key="3d" class="active"><span>3D</span></button>
            <button type="button" data-bottom-view-key="elevation:north"><span>North</span></button>
            <button type="button" data-bottom-view-key="elevation:east"><span>East</span></button>
            <button type="button" data-bottom-view-key="elevation:south"><span>South</span></button>
            <button type="button" data-bottom-view-key="elevation:west"><span>West</span></button>
          </div>
        </section>
        <section class="archux-area archux-live-price">
          <strong>BOM / PRICING</strong>
          <div class="archux-price-total">
            <span>Status</span>
            <b>On demand</b>
          </div>
          <div class="archux-price-breakdown">
            <p><span>Live calculation</span><b>Off</b></p>
            <p><span>Refresh impact</span><b>Reduced</b></p>
            <p><span>100+ modules</span><b>Ready</b></p>
          </div>
          <div class="archux-bom-preview">
            <span>BOM ITEMS</span>
            <div>
              <p><span>Calculated only when opened</span><b>Manual</b></p>
            </div>
            <button class="archux-activity-open" type="button" data-open-bom-panel>Open BOM</button>
          </div>
        </section>
        <section class="archux-sheet">
          <strong>SHEET PREVIEW</strong>
          <div></div>
          <span>A101 - Floor Plan Level 1</span>
        </section>
        <section class="archux-activity">
          <strong>RECENT ACTIVITY</strong>
          <div class="archux-activity-list" data-recent-activity>
            <p><span>No recent changes</span><b>now</b></p>
          </div>
          <button class="archux-activity-open" type="button" data-recent-activity-count>0 changes</button>
        </section>
      </footer>
    </div>
  `;
}
