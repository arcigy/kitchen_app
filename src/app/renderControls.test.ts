import { afterEach, describe, expect, it, vi } from "vitest";
import { createRenderControls } from "./renderControls";
import { FakeElement, installFakeDocument } from "./testUtils/propertiesPanelHarness";

describe("render controls", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("keeps lighting, render mode, photo, and HDRI control behavior", () => {
    installFakeDocument();
    const layoutUi = new FakeElement() as FakeElement & HTMLElement;
    const ctx = {
      layoutUi,
      enableSsgi: true,
      enablePhoto: true,
      getRenderMode: () => "realtime" as const,
      setRenderMode: vi.fn(),
      setDaylightIntensity: vi.fn(),
      getShadowAlgorithm: () => "pcfsoft",
      setShadowAlgorithm: vi.fn(),
      setHdri: vi.fn(),
      disposeSsgi: vi.fn(),
      disposePhoto: vi.fn(),
      resetPhoto: vi.fn(),
      downloadViewportPng: vi.fn()
    };

    const { photoSamples, photoStatus } = createRenderControls(ctx);

    const host = layoutUi.children[0]!;
    expect(host.className).toBe("field");
    expect(host.children[0]!.textContent).toBe("Lighting");

    const day = host.children[1]!.children[1]!;
    expect(day.type).toBe("range");
    expect(day.min).toBe("0");
    expect(day.max).toBe("25");
    expect(day.step).toBe("0.1");
    expect(day.value).toBe("9");
    day.value = "12.5";
    day.dispatch("input");
    expect(ctx.setDaylightIntensity).toHaveBeenCalledWith(12.5);

    const shadows = host.children[2]!.children[1]!;
    expect(shadows.children.map((child) => [child.value, child.textContent])).toEqual([
      ["pcfsoft", "Shadows: PCFSoft"],
      ["vsm", "Shadows: VSM (experimental)"]
    ]);
    shadows.value = "vsm";
    shadows.dispatch("change");
    expect(ctx.setShadowAlgorithm).toHaveBeenCalledWith("vsm");

    const renderMode = host.children[3]!.children[1]!;
    expect(renderMode.children.map((child) => [child.value, child.textContent])).toEqual([
      ["realtime", "Render: realtime"],
      ["realtime_ssgi", "Render: realtime + SSGI (experimental)"],
      ["photo_pathtrace", "Render: photo mode (path tracing)"]
    ]);
    const photoWrap = host.children[4]!;
    expect(photoWrap.style.display).toBe("none");
    renderMode.value = "photo_pathtrace";
    renderMode.dispatch("change");
    expect(ctx.setRenderMode).toHaveBeenCalledWith("photo_pathtrace");
    expect(ctx.disposeSsgi).toHaveBeenCalledOnce();
    expect(ctx.disposePhoto).not.toHaveBeenCalled();
    expect(photoWrap.style.display).toBe("");

    const photoControls = photoWrap.children[0]!;
    expect(photoSamples.type).toBe("number");
    expect(photoSamples.min).toBe("1");
    expect(photoSamples.max).toBe("4096");
    expect(photoSamples.step).toBe("1");
    expect(photoSamples.value).toBe("256");
    expect(photoControls.children[0]).toBe(photoSamples);
    expect(photoControls.children[1]!.type).toBe("button");
    expect(photoControls.children[1]!.textContent).toBe("Reset");
    expect(photoControls.children[2]!.textContent).toBe("Save PNG");
    photoControls.children[1]!.dispatch("click");
    photoControls.children[2]!.dispatch("click");
    expect(ctx.resetPhoto).toHaveBeenCalledOnce();
    expect(ctx.downloadViewportPng).toHaveBeenCalledOnce();
    expect(photoWrap.children[1]).toBe(photoStatus);

    const hdri = host.children[5]!.children[1]!;
    expect(hdri.children.map((child) => [child.value, child.textContent])).toEqual([
      ["", "HDRI: off"],
      ["/hdri/OutdoorFieldBaseballDayClear001/HdrOutdoorFieldBaseballDayClear001_HDR_2K.exr", "Outdoor day (2K)"],
      ["/hdri/SkySunset007/HdrSkySunset007_HDR_1K.exr", "Sunset (1K)"]
    ]);
    const hdriBg = host.children[6]!.children[1]!;
    expect(hdriBg.type).toBe("checkbox");
    expect(hdriBg.checked).toBe(false);
    const hdriIntensity = host.children[7]!.children[1]!;
    expect(hdriIntensity.type).toBe("range");
    expect(hdriIntensity.value).toBe("0.15");

    hdri.value = "/hdri/SkySunset007/HdrSkySunset007_HDR_1K.exr";
    hdriIntensity.value = "0.4";
    hdri.dispatch("change");
    expect(hdriBg.checked).toBe(true);
    expect(ctx.setHdri).toHaveBeenLastCalledWith({
      id: "/hdri/SkySunset007/HdrSkySunset007_HDR_1K.exr",
      background: true,
      envIntensity: 0.4,
      backgroundIntensity: 1
    });
  });
});
