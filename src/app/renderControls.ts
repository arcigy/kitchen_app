import { createButtonElement, createCheckboxElement, createInputElement, createRangeElement, createSelectElement } from "./propsPanelElements";

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

  const day = createRangeElement("9", { min: "0", max: "25", step: "0.1" });
  day.addEventListener("input", () => ctx.setDaylightIntensity(Number(day.value)));
  sunRow("Window daylight", day);

  const shadowSel = createSelectElement(ctx.getShadowAlgorithm() === "vsm" ? "vsm" : "pcfsoft", [
    { value: "pcfsoft", label: "Shadows: PCFSoft" },
    { value: "vsm", label: "Shadows: VSM (experimental)" }
  ]);
  shadowSel.addEventListener("change", () => {
    const next = shadowSel.value === "vsm" ? "vsm" : "pcfsoft";
    ctx.setShadowAlgorithm(next);
  });
  sunRow("Shadows", shadowSel);

  const renderModeSel = createSelectElement<RenderMode>(ctx.getRenderMode(), [
    { value: "realtime", label: "Render: realtime" },
    ...(ctx.enableSsgi ? [{ value: "realtime_ssgi" as const, label: "Render: realtime + SSGI (experimental)" }] : []),
    ...(ctx.enablePhoto ? [{ value: "photo_pathtrace" as const, label: "Render: photo mode (path tracing)" }] : [])
  ]);

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

  const photoSamples = createInputElement("number", "256", { min: "1", max: "4096", step: "1" });
  photoSamples.style.width = "110px";
  photoControls.appendChild(photoSamples);

  const photoReset = createButtonElement("Reset");
  photoControls.appendChild(photoReset);

  const photoSave = createButtonElement("Save PNG");
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

  const hdriSel = createSelectElement("", [
    { value: "", label: "HDRI: off" },
    { value: "/hdri/OutdoorFieldBaseballDayClear001/HdrOutdoorFieldBaseballDayClear001_HDR_2K.exr", label: "Outdoor day (2K)" },
    { value: "/hdri/SkySunset007/HdrSkySunset007_HDR_1K.exr", label: "Sunset (1K)" }
  ]);
  sunRow("HDRI", hdriSel);

  const hdriBg = createCheckboxElement(false);
  sunRow("HDRI background", hdriBg);

  const hdriIntensity = createRangeElement("0.15", { min: "0", max: "1", step: "0.01" });
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
