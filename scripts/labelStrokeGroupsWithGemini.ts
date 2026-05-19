import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { chromium } from "playwright";

interface StrokeGroupSummaryFile {
  groups: Array<{
    groupId: string;
    colorName: string;
    colorHex: string;
    sourceColorHex?: string;
    representativeStrokeWidth: number;
    segmentCount: number;
    curveSegmentCount?: number;
    rectangleSegmentCount?: number;
    totalLength: number;
  }>;
}

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_MODEL = "gemini-2.5-flash-lite";

async function main(): Promise<void> {
  const [svgPath, summaryPath, outPathArg] = process.argv.slice(2);
  if (!svgPath || !summaryPath) {
    throw new Error("Usage: npm exec tsx scripts/labelStrokeGroupsWithGemini.ts <colored.svg> <segments.json> [out.json]");
  }

  const apiKey = process.env.GEMINI_API_KEY || process.env.gemini_api_key;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured.");

  const summary = JSON.parse(await readFile(summaryPath, "utf-8")) as StrokeGroupSummaryFile;
  const image = await renderSvgToPng(svgPath);
  const prompt = createPrompt(summary);
  const model = (process.env.GEMINI_STROKE_LABEL_MODEL || DEFAULT_MODEL).replace(/^models\//u, "");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 75_000);
  const response = await fetch(`${GEMINI_ENDPOINT}/${model}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey
    },
    signal: controller.signal,
    body: JSON.stringify({
      contents: [{
        role: "user",
        parts: [
          { text: prompt },
          { inlineData: { mimeType: "image/png", data: image.toString("base64") } }
        ]
      }],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0
      }
    })
  });
  clearTimeout(timeout);

  const responseText = await response.text();
  if (!response.ok) throw new Error(`Gemini stroke label request failed: HTTP ${response.status}: ${responseText}`);
  const parsed = JSON.parse(responseText) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const jsonText = parsed.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();
  if (!jsonText) throw new Error("Gemini response did not include JSON text.");
  const output = {
    modelName: model,
    sourceSvg: svgPath,
    sourceSummary: summaryPath,
    ...JSON.parse(jsonText)
  };
  const outPath = outPathArg ?? path.join(path.dirname(summaryPath), `${path.basename(summaryPath, ".json")}-ai-labels.json`);
  await writeFile(outPath, `${JSON.stringify(output, null, 2)}\n`, "utf-8");
  console.log(JSON.stringify(output, null, 2));
}

async function renderSvgToPng(svgPath: string): Promise<Buffer> {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
  await page.goto(`file:///${path.resolve(svgPath).replaceAll("\\", "/")}`, { waitUntil: "load" });
  const screenshot = await page.screenshot({ fullPage: false, type: "png" });
  await browser.close();
  return screenshot;
}

function createPrompt(summary: StrokeGroupSummaryFile): string {
  return `
You are labeling colored vector stroke groups from an architectural floor plan.

Goal:
Identify which color groups most likely represent:
- wall
- door
- window
- dimension
- furniture
- technical_symbol
- other
- unknown

Important:
- Use the image plus the group metadata.
- Thick continuous structural outlines are usually walls.
- Thin long annotation lines and ticks are usually dimensions.
- Door swings/arcs or openings may be door even if split across colors.
- Windows may be thin repeated lines inside wall openings.
- If uncertain, use unknown.
- Return JSON only.

Groups:
${summary.groups.map((group) => `- ${group.groupId}: debug ${group.colorName} ${group.colorHex}, original line color ${group.sourceColorHex ?? "unknown"}, width ${group.representativeStrokeWidth}, segments ${group.segmentCount}, curveSegments ${group.curveSegmentCount ?? 0}, rectangles ${group.rectangleSegmentCount ?? 0}, totalLength ${group.totalLength}`).join("\n")}

Return strict JSON:
{
  "labels": [
    {
      "groupId": "stroke_group_1",
      "colorName": "green",
      "label": "wall",
      "confidence": 0.0,
      "reason": ""
    }
  ],
  "warnings": []
}
`.trim();
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
