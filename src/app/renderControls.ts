export type RenderMode = "realtime" | "realtime_ssgi" | "photo_pathtrace";

type RenderControlsContext = {
  layoutUi: HTMLElement;
  enableSsgi: boolean;
  enablePhoto: boolean;
  getRenderMode: () => RenderMode;
  setRenderMode: (mode: RenderMode) => void;
  setDaylightIntensity: (value: number) => void;
  getShadowAlgorithm: () => string;
  setShadowAlgorithm: (value: "pcfsoft" | "vsm") => void;
  setHdri: (settings: { id: string | null; background: boolean; envIntensity: number; backgroundIntensity: number }) => void;
  disposeSsgi: () => void;
  disposePhoto: () => void;
  resetPhoto: () => void;
  downloadViewportPng: () => void;
};

const isPhotoRenderMode = (mode: RenderMode) => mode === "photo_pathtrace";

export function createRenderControls(ctx: RenderControlsContext) {
  const sunHost = document.createElement("div");
  sunHost.className = "field";
  sunHost.style.display = "grid";
  sunHost.style.gap = "10px";
  sunHost.style.padding = "10px";
  sunHost.style.border = "1px solid var(--border)";
  sunHost.style.borderRadius = "12px";
  sunHost.style.background = "rgba(10,12,16,0.4)";

  const sunTitle = document.createElement("div");
  sunTitle.textContent = "Lighting";
  sunTitle.style.fontWeight = "600";
  sunHost.appendChild(sunTitle);

  const sunRow = (label: string, el: HTMLElement) => {
    const wrap = document.createElement("div");
    wrap.style.display = "grid";
    wrap.style.gridTemplateColumns = "160px 1fr";
    wrap.style.gap = "8px";
    wrap.style.alignItems = "center";
    const l = document.createElement("div");
    l.textContent = label;
    wrap.appendChild(l);
    wrap.appendChild(el);
    sunHost.appendChild(wrap);
  };

  const day = document.createElement("input");
  day.type = "range";
  day.min = "0";
  day.max = "25";
  day.step = "0.1";
  day.value = "9";
  day.addEventListener("input", () => ctx.setDaylightIntensity(Number(day.value)));
  sunRow("Window daylight", day);

  const shadowSel = document.createElement("select");
  shadowSel.innerHTML = `
    <option value="pcfsoft">Shadows: PCFSoft</option>
    <option value="vsm">Shadows: VSM (experimental)</option>
  `;
  shadowSel.value = ctx.getShadowAlgorithm();
  shadowSel.addEventListener("change", () => {
    const next = shadowSel.value === "vsm" ? "vsm" : "pcfsoft";
    ctx.setShadowAlgorithm(next);
  });
  sunRow("Shadows", shadowSel);

  const renderModeSel = document.createElement("select");
  renderModeSel.innerHTML = `
    <option value="realtime">Render: realtime</option>
    ${ctx.enableSsgi ? `<option value="realtime_ssgi">Render: realtime + SSGI (experimental)</option>` : ""}
    ${ctx.enablePhoto ? `<option value="photo_pathtrace">Render: photo mode (path tracing)</option>` : ""}
  `;
  renderModeSel.value = ctx.getRenderMode();

  const photoWrap = document.createElement("div");
  photoWrap.style.display = isPhotoRenderMode(ctx.getRenderMode()) ? "" : "none";
  photoWrap.style.paddingLeft = "168px";
  photoWrap.style.marginTop = "-6px";

  renderModeSel.addEventListener("change", () => {
    const v = renderModeSel.value as RenderMode;
    const nextMode = v === "realtime_ssgi" || v === "photo_pathtrace" ? v : "realtime";
    ctx.setRenderMode(nextMode);

    if (nextMode !== "realtime_ssgi") ctx.disposeSsgi();
    if (nextMode !== "photo_pathtrace") ctx.disposePhoto();

    photoWrap.style.display = isPhotoRenderMode(nextMode) ? "" : "none";
  });
  sunRow("Render mode", renderModeSel);
  sunHost.appendChild(photoWrap);

  const photoControls = document.createElement("div");
  photoControls.style.display = "flex";
  photoControls.style.flexWrap = "wrap";
  photoControls.style.gap = "8px";
  photoWrap.appendChild(photoControls);

  const photoSamples = document.createElement("input");
  photoSamples.type = "number";
  photoSamples.min = "1";
  photoSamples.max = "4096";
  photoSamples.step = "1";
  photoSamples.value = "256";
  photoSamples.style.width = "110px";
  photoControls.appendChild(photoSamples);

  const photoReset = document.createElement("button");
  photoReset.type = "button";
  photoReset.textContent = "Reset";
  photoControls.appendChild(photoReset);

  const photoSave = document.createElement("button");
  photoSave.type = "button";
  photoSave.textContent = "Save PNG";
  photoControls.appendChild(photoSave);

  const photoStatus = document.createElement("div");
  photoStatus.style.opacity = "0.9";
  photoStatus.style.fontSize = "12px";
  photoStatus.style.marginTop = "6px";
  photoWrap.appendChild(photoStatus);

  photoReset.addEventListener("click", () => {
    ctx.resetPhoto();
  });

  photoSave.addEventListener("click", () => {
    ctx.downloadViewportPng();
  });

  const hdriSel = document.createElement("select");
  hdriSel.innerHTML = `
    <option value="">HDRI: off</option>
    <option value="/hdri/OutdoorFieldBaseballDayClear001/HdrOutdoorFieldBaseballDayClear001_HDR_2K.exr">Outdoor day (2K)</option>
    <option value="/hdri/SkySunset007/HdrSkySunset007_HDR_1K.exr">Sunset (1K)</option>
  `;
  hdriSel.value = "";
  sunRow("HDRI", hdriSel);

  const hdriBg = document.createElement("input");
  hdriBg.type = "checkbox";
  hdriBg.checked = false;
  sunRow("HDRI background", hdriBg);

  const hdriIntensity = document.createElement("input");
  hdriIntensity.type = "range";
  hdriIntensity.min = "0";
  hdriIntensity.max = "1";
  hdriIntensity.step = "0.01";
  hdriIntensity.value = "0.15";
  sunRow("HDRI intensity", hdriIntensity);

  const applyHdri = () => {
    const id = hdriSel.value || null;
    const envIntensity = Number(hdriIntensity.value);
    if (id && !hdriBg.checked) hdriBg.checked = true;
    ctx.setHdri({ id, background: hdriBg.checked, envIntensity, backgroundIntensity: 1 });
  };

  hdriSel.addEventListener("change", applyHdri);
  hdriBg.addEventListener("change", applyHdri);
  hdriIntensity.addEventListener("input", applyHdri);

  ctx.layoutUi.appendChild(sunHost);

  return { photoSamples, photoStatus };
}
