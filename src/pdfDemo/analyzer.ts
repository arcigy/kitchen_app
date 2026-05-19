export interface PdfDemoSource {
  id: string;
  name: string;
  description: string;
  text: string;
}

export interface PdfDemoModule {
  id: string;
  label: string;
  xMm: number;
  yMm: number;
  widthMm: number;
  depthMm: number;
  sourceName: string;
}

export interface PdfDemoAnalysis {
  modules: PdfDemoModule[];
  notes: string[];
  bounds: {
    widthMm: number;
    depthMm: number;
  };
}

const DEFAULT_WIDTHS_MM = [600, 600, 800, 450];
const DEFAULT_DEPTH_MM = 600;

export function analyzePdfKitchenDemo(sources: PdfDemoSource[]): PdfDemoAnalysis {
  const notes: string[] = [
    "Demo parser: extracts common cabinet-width numbers from PDF text and descriptions. Real AI/CV is not connected yet."
  ];
  const combinedText = sources.map((source) => `${source.description}\n${source.text}`).join("\n");
  const widths = extractLikelyModuleWidths(combinedText);
  const moduleWidths = widths.length > 0 ? widths : DEFAULT_WIDTHS_MM;
  const sourceName = sources[0]?.name ?? "demo";
  const lShape = /\b(l|roh|corner|kút|kut|l-shape|l shape)\b/i.test(combinedText);
  const modules = layoutModules(moduleWidths, sourceName, lShape);

  if (widths.length === 0) {
    notes.push("No reliable module dimensions found. Using default demo row: 600, 600, 800, 450 mm.");
  }

  if (lShape) {
    notes.push("Detected possible corner/L layout from description or PDF text.");
  }

  return {
    modules,
    notes,
    bounds: getBounds(modules)
  };
}

export function analysisFromModules(modules: PdfDemoModule[], notes: string[]): PdfDemoAnalysis {
  return {
    modules,
    notes,
    bounds: getBounds(modules)
  };
}

export function extractLikelyModuleWidths(text: string): number[] {
  const values: number[] = [];
  const matches = text.matchAll(/(?<!\d)(\d+(?:[.,]\d+)?)\s*(mm|cm|m)?(?!\d)/gi);

  for (const match of matches) {
    const raw = Number.parseFloat(match[1].replace(",", "."));
    const unit = match[2]?.toLowerCase() ?? "mm";
    const valueMm = toMillimeters(raw, unit);

    if (valueMm >= 250 && valueMm <= 1200 && Number.isFinite(valueMm)) {
      values.push(roundToNearest(valueMm, 10));
    }
  }

  return compactWidths(values).slice(0, 12);
}

function toMillimeters(value: number, unit: string): number {
  if (unit === "m") return value * 1000;
  if (unit === "cm") return value * 10;
  return value;
}

function compactWidths(values: number[]): number[] {
  const result: number[] = [];

  for (const value of values) {
    const previous = result[result.length - 1];
    if (previous !== value) {
      result.push(value);
    }
  }

  return result;
}

function layoutModules(widths: number[], sourceName: string, lShape: boolean): PdfDemoModule[] {
  let xMm = 0;
  let yMm = 0;
  const cornerIndex = lShape ? Math.max(2, Math.ceil(widths.length / 2)) : widths.length + 1;

  return widths.map((widthMm, index) => {
    if (index === cornerIndex) {
      xMm = widths.slice(0, cornerIndex).reduce((sum, width) => sum + width, 0) - DEFAULT_DEPTH_MM;
      yMm = DEFAULT_DEPTH_MM;
    }

    const module: PdfDemoModule = {
      id: `module-${index + 1}`,
      label: `M${index + 1}`,
      xMm,
      yMm,
      widthMm,
      depthMm: DEFAULT_DEPTH_MM,
      sourceName
    };

    if (index >= cornerIndex) {
      yMm += widthMm;
    } else {
      xMm += widthMm;
    }

    return module;
  });
}

function getBounds(modules: PdfDemoModule[]): PdfDemoAnalysis["bounds"] {
  const widthMm = Math.max(...modules.map((module) => module.xMm + module.widthMm), DEFAULT_DEPTH_MM);
  const depthMm = Math.max(...modules.map((module) => module.yMm + module.depthMm), DEFAULT_DEPTH_MM);
  return { widthMm, depthMm };
}

function roundToNearest(value: number, step: number): number {
  return Math.round(value / step) * step;
}
