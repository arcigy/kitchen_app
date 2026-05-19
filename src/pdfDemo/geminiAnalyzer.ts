import { analysisFromModules, type PdfDemoAnalysis, type PdfDemoModule } from "./analyzer";
import type { PdfTextObservation } from "./pdfText";

export interface GeminiPdfDocument {
  name: string;
  description: string;
  file: File;
  text: string;
  observations: PdfTextObservation[];
}

export interface GeminiAnalysisOptions {
  apiKey: string;
  model: string;
  documents: GeminiPdfDocument[];
}

interface GeminiKitchenResponse {
  modules: Array<{
    label: string;
    type: string;
    xMm: number;
    yMm: number;
    widthMm: number;
    depthMm: number;
    sourcePdf: string;
    confidence: number;
  }>;
  warnings: string[];
}

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";

export async function analyzeKitchenWithGemini(options: GeminiAnalysisOptions): Promise<PdfDemoAnalysis> {
  const model = options.model.trim() || "gemini-2.5-flash";
  const body = await createGeminiRequestBody(options.documents);
  const response = await fetch(`${GEMINI_ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": options.apiKey
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Gemini request failed (${response.status}): ${detail.slice(0, 500)}`);
  }

  const payload = await response.json() as GeminiGenerateContentResponse;
  const text = payload.candidates?.[0]?.content?.parts?.find((part) => typeof part.text === "string")?.text;
  if (!text) {
    throw new Error("Gemini returned no JSON text.");
  }

  const parsed = parseGeminiResponse(text);
  const modules = parsed.modules.map<PdfDemoModule>((module, index) => ({
    id: `gemini-module-${index + 1}`,
    label: module.label || `M${index + 1}`,
    xMm: Math.round(module.xMm),
    yMm: Math.round(module.yMm),
    widthMm: Math.round(module.widthMm),
    depthMm: Math.round(module.depthMm),
    sourceName: module.sourcePdf || "Gemini"
  }));

  if (modules.length === 0) {
    throw new Error("Gemini returned zero modules.");
  }

  return analysisFromModules(modules, [
    `Gemini model: ${model}. Coordinates are interpreted as real millimeters from the detected kitchen origin.`,
    ...parsed.warnings
  ]);
}

async function createGeminiRequestBody(documents: GeminiPdfDocument[]): Promise<GeminiRequestBody> {
  const parts: GeminiPart[] = [
    {
      text: [
        "Analyze these architectural kitchen PDF drawings.",
        "Return only JSON matching the schema.",
        "Goal: exact 2D placement of kitchen modules next to each other in real 1:1 millimeter dimensions.",
        "Use visual PDF information first. Use extracted text observations as a helper for dimension labels and their drawing positions.",
        "Coordinate system: xMm grows right, yMm grows down from the kitchen origin. If uncertain, still return best estimate and add warnings.",
        "Do not invent generic marketplace modules. Treat this as a customer-specific kitchen layout."
      ].join("\n")
    },
    {
      text: `Extracted text observations:\n${JSON.stringify(createObservationPayload(documents), null, 2)}`
    }
  ];

  for (const document of documents) {
    parts.push({
      text: `PDF description for ${document.name}: ${document.description || "(none)"}`
    });
    parts.push({
      inlineData: {
        mimeType: "application/pdf",
        data: await fileToBase64(document.file)
      }
    });
  }

  return {
    contents: [{ parts }],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json",
      responseJsonSchema: {
        type: "object",
        properties: {
          modules: {
            type: "array",
            items: {
              type: "object",
              properties: {
                label: { type: "string" },
                type: { type: "string" },
                xMm: { type: "integer" },
                yMm: { type: "integer" },
                widthMm: { type: "integer" },
                depthMm: { type: "integer" },
                sourcePdf: { type: "string" },
                confidence: { type: "number" }
              },
              required: ["label", "type", "xMm", "yMm", "widthMm", "depthMm", "sourcePdf", "confidence"]
            }
          },
          warnings: {
            type: "array",
            items: { type: "string" }
          }
        },
        required: ["modules", "warnings"]
      }
    }
  };
}

function createObservationPayload(documents: GeminiPdfDocument[]): object {
  return documents.map((document) => ({
    pdf: document.name,
    description: document.description,
    textPreview: document.text.slice(0, 6000),
    observations: document.observations.slice(0, 400)
  }));
}

function parseGeminiResponse(text: string): GeminiKitchenResponse {
  const parsed = JSON.parse(text) as Partial<GeminiKitchenResponse>;
  const modules = Array.isArray(parsed.modules) ? parsed.modules.filter(isGeminiModule) : [];
  const warnings = Array.isArray(parsed.warnings)
    ? parsed.warnings.filter((warning): warning is string => typeof warning === "string")
    : [];

  return { modules, warnings };
}

function isGeminiModule(module: unknown): module is GeminiKitchenResponse["modules"][number] {
  if (!module || typeof module !== "object") return false;

  const candidate = module as Record<string, unknown>;
  return (
    typeof candidate.label === "string" &&
    typeof candidate.type === "string" &&
    typeof candidate.xMm === "number" &&
    typeof candidate.yMm === "number" &&
    typeof candidate.widthMm === "number" &&
    typeof candidate.depthMm === "number" &&
    typeof candidate.sourcePdf === "string" &&
    typeof candidate.confidence === "number"
  );
}

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";

  for (let index = 0; index < bytes.length; index += 1) {
    binary += String.fromCharCode(bytes[index]);
  }

  return btoa(binary);
}

interface GeminiRequestBody {
  contents: Array<{
    parts: GeminiPart[];
  }>;
  generationConfig: {
    temperature: number;
    responseMimeType: "application/json";
    responseJsonSchema: object;
  };
}

type GeminiPart =
  | { text: string }
  | {
      inlineData: {
        mimeType: "application/pdf";
        data: string;
      };
    };

interface GeminiGenerateContentResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
  }>;
}
