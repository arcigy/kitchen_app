import type http from "node:http";
import {
  createPageVisionValidatorPrompt,
  parsePageVisionValidationJson
} from "../src/features/pdf-intake/pageVisionValidator";
import type { PageVisionValidationInput } from "../src/features/pdf-intake/types";

interface PageVisionValidatorRequest {
  pages?: Array<{
    pageNumber?: number;
    imageDataUrl?: string;
    extractedText?: string;
    title?: string;
  }>;
}

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const DEFAULT_GEMINI_PAGE_VALIDATOR_MODEL = "gemini-2.5-flash-lite";

export async function handlePageVisionValidator(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  readJsonBody: (req: http.IncomingMessage) => Promise<unknown>,
  sendJson: (res: http.ServerResponse, status: number, data: unknown) => void
): Promise<void> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.gemini_api_key;
  if (!apiKey) {
    sendJson(res, 503, { ok: false, error: "Gemini page vision provider not configured" });
    return;
  }

  const pages = validateRequest(await readJsonBody(req));
  const model = normalizeGeminiModel(process.env.GEMINI_PAGE_VALIDATOR_MODEL || DEFAULT_GEMINI_PAGE_VALIDATOR_MODEL);

  console.log("[page-vision-validator] request", {
    model,
    pages: pages.map((page) => page.pageNumber)
  });

  const jsonText = await callGeminiPageVision({
    apiKey,
    model,
    pages,
    prompt: createPageVisionValidatorPrompt(pages)
  });
  const results = parsePageVisionValidationJson(jsonText);
  sendJson(res, 200, { ok: true, modelName: model, results });
}

function validateRequest(value: unknown): PageVisionValidationInput[] {
  const body = value as PageVisionValidatorRequest;
  if (!body || typeof body !== "object") throw new Error("Expected JSON body.");
  if (!Array.isArray(body.pages)) throw new Error("Missing pages array.");
  if (body.pages.length === 0) throw new Error("Pages array cannot be empty.");
  if (body.pages.length > 8) throw new Error("Validate at most 8 pages per request.");

  return body.pages.map((page) => {
    if (typeof page.pageNumber !== "number" || !Number.isInteger(page.pageNumber)) throw new Error("Missing integer pageNumber.");
    if (typeof page.imageDataUrl !== "string") throw new Error(`Missing imageDataUrl for page ${page.pageNumber}.`);
    if (typeof page.extractedText !== "string") throw new Error(`Missing extractedText for page ${page.pageNumber}.`);
    return {
      pageNumber: page.pageNumber,
      imageDataUrl: page.imageDataUrl,
      extractedText: page.extractedText.slice(0, 2000),
      title: typeof page.title === "string" ? page.title : ""
    };
  });
}

async function callGeminiPageVision(input: {
  apiKey: string;
  model: string;
  pages: PageVisionValidationInput[];
  prompt: string;
}): Promise<string> {
  const parts = [
    { text: input.prompt },
    ...input.pages.flatMap((page) => {
      const inlineData = dataUrlToInlineData(page.imageDataUrl);
      return [
        { text: `Page ${page.pageNumber}\nTitle: ${page.title ?? ""}\nExtracted text:\n${page.extractedText}` },
        { inlineData }
      ];
    })
  ];

  const response = await fetch(`${GEMINI_ENDPOINT}/${input.model}:generateContent`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": input.apiKey
    },
    body: JSON.stringify({
      contents: [{ role: "user", parts }],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0
      }
    })
  });

  const responseText = await response.text();
  if (!response.ok) throw new Error(`Gemini page vision request failed: HTTP ${response.status}${geminiErrorMessage(responseText)}`);

  const parsed = JSON.parse(responseText) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = parsed.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();
  if (!text) throw new Error("Gemini page vision response did not include JSON text.");
  return text;
}

function normalizeGeminiModel(model: string): string {
  return model.trim().replace(/^models\//u, "");
}

function dataUrlToInlineData(dataUrl: string): { mimeType: string; data: string } {
  const match = /^data:([^;,]+);base64,(.+)$/u.exec(dataUrl);
  if (!match) throw new Error("Expected imageDataUrl to be a base64 data URL.");
  return {
    mimeType: match[1],
    data: match[2]
  };
}

function geminiErrorMessage(responseText: string): string {
  try {
    const parsed = JSON.parse(responseText) as { error?: { message?: string; status?: string } };
    const status = parsed.error?.status ? ` ${parsed.error.status}` : "";
    const message = parsed.error?.message ? `: ${parsed.error.message.split("\n")[0]}` : "";
    return `${status}${message}`;
  } catch {
    return "";
  }
}
