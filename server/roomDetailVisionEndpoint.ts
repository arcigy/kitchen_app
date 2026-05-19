import type http from "node:http";
import { parseRoomDetailVisionJson } from "../src/features/pdf-intake/roomDetailVision";

interface RoomDetailVisionRequest {
  room?: {
    roomId?: string;
    roomType?: string;
    roomNameOriginal?: string;
    sourcePageNumbers?: number[];
  };
  sourcePages?: Array<{
    pageNumber?: number;
    imageDataUrl?: string;
    extractedText?: string;
    title?: string;
  }>;
  existingTextExtraction?: unknown;
}

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models";
const OPENAI_CHAT_COMPLETIONS_ENDPOINT = "https://api.openai.com/v1/chat/completions";
const DEFAULT_GEMINI_MODEL = "gemini-flash-lite-latest";
const DEFAULT_OPENAI_MODEL = "gpt-4.1-mini";

export async function handleRoomDetailVision(req: http.IncomingMessage, res: http.ServerResponse, readJsonBody: (req: http.IncomingMessage) => Promise<unknown>, sendJson: (res: http.ServerResponse, status: number, data: unknown) => void): Promise<void> {
  const openAiApiKey = process.env.OPENAI_API_KEY || process.env.openai_api_key;
  const geminiApiKey = process.env.GEMINI_API_KEY || process.env.gemini_api_key;
  if (!openAiApiKey && !geminiApiKey) {
    sendJson(res, 503, { ok: false, error: "Vision provider not configured" });
    return;
  }

  const body = validateVisionRequest(await readJsonBody(req));
  const provider = openAiApiKey ? "openai" : "gemini";
  const openAiModel = process.env.OPENAI_VISION_MODEL || DEFAULT_OPENAI_MODEL;
  const geminiModel = normalizeGeminiModel(process.env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL);
  const model = provider === "openai" ? openAiModel : geminiModel;

  console.log("[room-detail-vision] request", {
    provider,
    model,
    roomType: body.room.roomType,
    roomId: body.room.roomId,
    sourcePages: body.sourcePages.map((page) => page.pageNumber)
  });

  const prompt = createVisionPrompt(body);
  let jsonText: string;
  let usedModel = model;
  try {
    jsonText = provider === "openai"
      ? await callOpenAiVision({ apiKey: openAiApiKey!, model: openAiModel, body, prompt })
      : await callGeminiVision({ apiKey: geminiApiKey!, model: geminiModel, body, prompt });
  } catch (error) {
    if (!openAiApiKey || !geminiApiKey) throw error;
    console.log("[room-detail-vision] OpenAI failed, falling back to Gemini", {
      roomId: body.room.roomId,
      model: openAiModel,
      fallbackModel: geminiModel,
      error: error instanceof Error ? error.message : String(error)
    });
    jsonText = await callGeminiVision({ apiKey: geminiApiKey, model: geminiModel, body, prompt });
    usedModel = geminiModel;
  }
  const extraction = parseRoomDetailVisionJson(jsonText);
  sendJson(res, 200, { ok: true, modelName: usedModel, extraction });
}

function validateVisionRequest(value: unknown): {
  room: Required<NonNullable<RoomDetailVisionRequest["room"]>>;
  sourcePages: Array<Required<NonNullable<RoomDetailVisionRequest["sourcePages"]>[number]>>;
  existingTextExtraction: unknown;
} {
  const body = value as RoomDetailVisionRequest;
  if (!body || typeof body !== "object") throw new Error("Expected JSON body.");
  if (!body.room || typeof body.room !== "object") throw new Error("Missing room.");
  if (typeof body.room.roomId !== "string") throw new Error("Missing room.roomId.");
  if (typeof body.room.roomType !== "string") throw new Error("Missing room.roomType.");
  if (!Array.isArray(body.room.sourcePageNumbers)) throw new Error("Missing room.sourcePageNumbers.");
  if (!Array.isArray(body.sourcePages)) throw new Error("Missing sourcePages.");

  return {
    room: {
      roomId: body.room.roomId,
      roomType: body.room.roomType,
      roomNameOriginal: typeof body.room.roomNameOriginal === "string" ? body.room.roomNameOriginal : "",
      sourcePageNumbers: body.room.sourcePageNumbers
    },
    sourcePages: body.sourcePages.map((page) => {
      if (typeof page.pageNumber !== "number") throw new Error("Missing sourcePage.pageNumber.");
      if (typeof page.imageDataUrl !== "string") throw new Error("Missing sourcePage.imageDataUrl.");
      if (typeof page.extractedText !== "string") throw new Error("Missing sourcePage.extractedText.");
      if (typeof page.title !== "string") throw new Error("Missing sourcePage.title.");
      return {
        pageNumber: page.pageNumber,
        imageDataUrl: page.imageDataUrl,
        extractedText: page.extractedText.slice(0, 6000),
        title: page.title
      };
    }),
    existingTextExtraction: body.existingTextExtraction
  };
}

async function callGeminiVision(input: {
  apiKey: string;
  model: string;
  body: ReturnType<typeof validateVisionRequest>;
  prompt: string;
}): Promise<string> {
  const parts = [
    { text: input.prompt },
    { text: `Existing text extraction JSON:\n${JSON.stringify(input.body.existingTextExtraction)}` },
    ...input.body.sourcePages.flatMap((page) => {
      const inlineData = dataUrlToInlineData(page.imageDataUrl);
      return [
        { text: `Page ${page.pageNumber}\nTitle: ${page.title}\nExtracted text:\n${page.extractedText}` },
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
        temperature: 0.1
      }
    })
  });

  const responseText = await response.text();
  if (!response.ok) throw new Error(`Gemini vision request failed: HTTP ${response.status}${geminiErrorMessage(responseText)}`);

  const parsed = JSON.parse(responseText) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = parsed.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim();
  if (!text) throw new Error("Gemini vision response did not include JSON text.");
  return text;
}

async function callOpenAiVision(input: {
  apiKey: string;
  model: string;
  body: ReturnType<typeof validateVisionRequest>;
  prompt: string;
}): Promise<string> {
  const content: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string; detail: "high" } }
  > = [
    { type: "text", text: input.prompt },
    { type: "text", text: `Existing text extraction JSON:\n${JSON.stringify(input.body.existingTextExtraction)}` }
  ];

  for (const page of input.body.sourcePages) {
    content.push({
      type: "text",
      text: `Page ${page.pageNumber}\nTitle: ${page.title}\nExtracted text:\n${page.extractedText}`
    });
    content.push({
      type: "image_url",
      image_url: {
        url: page.imageDataUrl,
        detail: "high"
      }
    });
  }

  const response = await fetch(OPENAI_CHAT_COMPLETIONS_ENDPOINT, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${input.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: input.model,
      messages: [
        {
          role: "user",
          content
        }
      ],
      response_format: { type: "json_object" },
      temperature: 0.1
    })
  });

  const responseText = await response.text();
  if (!response.ok) throw new Error(`OpenAI vision request failed: HTTP ${response.status}${openAiErrorMessage(responseText)}`);

  const parsed = JSON.parse(responseText) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };
  const text = parsed.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("OpenAI vision response did not include JSON text.");
  return text;
}

function normalizeGeminiModel(model: string): string {
  return model.trim().replace(/^models\//u, "");
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

function openAiErrorMessage(responseText: string): string {
  try {
    const parsed = JSON.parse(responseText) as { error?: { message?: string; type?: string } };
    const type = parsed.error?.type ? ` ${parsed.error.type}` : "";
    const message = parsed.error?.message ? `: ${parsed.error.message}` : "";
    return `${type}${message}`;
  } catch {
    return "";
  }
}

function dataUrlToInlineData(dataUrl: string): { mimeType: string; data: string } {
  const match = /^data:([^;,]+);base64,(.+)$/u.exec(dataUrl);
  if (!match) throw new Error("Expected source page imageDataUrl to be a base64 data URL.");
  return {
    mimeType: match[1],
    data: match[2]
  };
}

function createVisionPrompt(body: ReturnType<typeof validateVisionRequest>): string {
  return `
Analyze only the selected room.
Selected room:
- roomId: ${body.room.roomId}
- roomType: ${body.room.roomType}
- roomNameOriginal: ${body.room.roomNameOriginal}
- sourcePageNumbers: ${body.room.sourcePageNumbers.join(", ")}

Goal:
- Identify main custom furniture in this room from the provided technical sheets/images.
- Think in furniture structure terms: one assembly/group vs standalone purchased items vs integrated accessories.
- If one assembly is visible, describe it through high-level items/components only; do not extract deep module parameters.
- Do not do pricing.
- Do not infer furniture from other rooms.
- Do not invent dimensions.
- If a dimension cannot be safely mapped to widthMm, heightMm, or depthMm, put it only into rawDimensionTexts.
- Identify materials from visible text or extracted text.
- Keep uncertain items with needsHumanReview=true.
- Do not invent exact shelf/door/drawer counts. Use components only when the relation is clear.

Return strict JSON matching this TypeScript shape exactly:
{
  "fileName": string,
  "roomId": string,
  "roomType": string,
  "roomNameOriginal": string,
  "sourcePageNumbers": number[],
  "items": [
    {
      "itemId": string,
      "displayName": string,
      "category": "wardrobe" | "built_in_cabinet" | "cabinet" | "shelves" | "bench" | "mirror" | "wall_panel" | "kitchen" | "desk" | "tv_unit" | "unknown",
      "importance": "primary" | "secondary" | "unknown",
      "dimensions": {
        "widthMm": number | null,
        "heightMm": number | null,
        "depthMm": number | null,
        "rawDimensionTexts": string[]
      },
      "components": ["closed_cabinet" | "open_shelves" | "hanger_section" | "drawers" | "bench" | "mirror" | "wall_panel" | "unknown"],
      "materials": [
        {
          "rawText": string,
          "brand": string,
          "code": string,
          "decorName": string,
          "confidence": number
        }
      ],
      "sourcePageNumbers": number[],
      "sourceTexts": string[],
      "confidence": number,
      "needsHumanReview": boolean,
      "reasons": string[]
    }
  ],
  "warnings": string[],
  "confidence": number
}

Use stable item IDs like entry_hall_wardrobe_1, entry_hall_bench_1, entry_hall_shelves_1, entry_hall_mirror_1.
Return JSON only.
`.trim();
}
