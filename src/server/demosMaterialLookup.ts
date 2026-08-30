import type http from "node:http";
import { fetchExternalBytes, fetchExternalText } from "./external-http";

const DEMOS_CZ_ORIGIN = "https://www.demos-trade.cz";
const DEMOS_TRACKER_ID = "39755-295903";
const FETCH_TIMEOUT_MS = 8_000;
const MAX_TEXT_RESPONSE_BYTES = 4 * 1024 * 1024;
const MAX_IMAGE_RESPONSE_BYTES = 12 * 1024 * 1024;

type SendJson = (res: http.ServerResponse, status: number, data: unknown) => void;

type LuigiHit = {
  url?: string;
  attributes?: Record<string, unknown>;
};

type DemosMaterialKind =
  | "dtd"
  | "mdf"
  | "hdf"
  | "plywood"
  | "multiplex"
  | "solid_wood"
  | "laminate"
  | "compact"
  | "veneer"
  | "acrylic"
  | "abs";

type DemosMaterialResult = {
  ok: true;
  query: string;
  source: "demos-cz";
  pageUrl: string;
  productId: string | null;
  assortmentCode: string;
  title: string;
  brand: string | null;
  categoryPath: string[];
  materialKind: DemosMaterialKind;
  availability: {
    label: string;
    inStock: boolean;
    tooltip: string | null;
  };
  price: {
    amountWithoutVat: number | null;
    amountWithVat: number | null;
    pricePerM2WithoutVat: number | null;
    currency: "CZK";
  };
  board: {
    thicknessMm: number | null;
    formatMm: { width: number; height: number } | null;
    decorCode: string | null;
    decorName: string | null;
    structure: string | null;
    colorTone: string | null;
    decorType: string | null;
    materialProperty: string | null;
  };
  image: {
    originalUrl: string | null;
    previewUrl: string | null;
  };
  scrapedAt: string;
};

const fetchText = async (url: string): Promise<string> => {
  const { response, text } = await fetchExternalText(url, {
    headers: {
      "accept": "text/html,application/xhtml+xml,application/json",
      "user-agent": "Mozilla/5.0 ArcigyKitchenMaterialScraper/1.0"
    }
  }, { timeoutMs: FETCH_TIMEOUT_MS, maxBytes: MAX_TEXT_RESPONSE_BYTES });
  if (!response.ok) throw new Error(`Demos request failed: ${response.status}`);
  return text;
};

const decodeHtml = (value: string): string => {
  return value
    .replaceAll("<", "")
    .replaceAll(">", "")
    .replace(/&(?:nbsp|quot|#039|apos);/g, (entity) => ({
      "&nbsp;": " ",
      "&quot;": "\"",
      "&#039;": "'",
      "&apos;": "'"
    })[entity] ?? "")
    .replace(/\s+/g, " ")
    .trim();
};

const normalizeText = (value: string): string => {
  return decodeHtml(value)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
};

const normalizeSearchText = (value: string): string => normalizeText(value).replace(/[^a-z0-9,.]+/g, " ").trim();

const firstString = (value: unknown): string | null => {
  if (typeof value === "string") return decodeHtml(value);
  if (typeof value === "number") return String(value);
  if (Array.isArray(value)) {
    const first = value.find((item) => typeof item === "string" || typeof item === "number");
    return typeof first === "string" || typeof first === "number" ? decodeHtml(String(first)) : null;
  }
  return null;
};

const allStrings = (value: unknown): string[] => {
  if (typeof value === "string" || typeof value === "number") return [decodeHtml(String(value))];
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string | number => typeof item === "string" || typeof item === "number")
    .map((item) => decodeHtml(String(item)));
};

const firstNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = firstString(value);
  return text ? parseCzechNumber(text) : null;
};

const getAttributeStrings = (attributes: Record<string, unknown>, aliases: string[]): string[] => {
  const normalizedAliases = new Set(aliases.map(normalizeText));
  for (const [key, value] of Object.entries(attributes)) {
    if (normalizedAliases.has(normalizeText(key))) return allStrings(value);
  }
  return [];
};

const getAttributeString = (attributes: Record<string, unknown>, aliases: string[]): string | null => {
  return getAttributeStrings(attributes, aliases)[0] ?? null;
};

const getAttributeNumber = (attributes: Record<string, unknown>, aliases: string[]): number | null => {
  const normalizedAliases = new Set(aliases.map(normalizeText));
  for (const [key, value] of Object.entries(attributes)) {
    if (normalizedAliases.has(normalizeText(key))) return firstNumber(value);
  }
  return null;
};

const parseCzechNumber = (value: string): number | null => {
  const normalized = value
    .replace(/\u00a0/g, " ")
    .replace(/[^\d,. -]/g, "")
    .replace(/\s+/g, "")
    .replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
};

const parseDimensionsFromText = (value: string): { formatMm: { width: number; height: number } | null; thicknessMm: number | null } => {
  const match = normalizeText(value).match(/(\d{3,5})\s*(?:x|\/|-)\s*(\d{3,5})\s*(?:(?:x|\/|-)\s*(\d+(?:[,.]\d+)?))?/i);
  if (!match) return { formatMm: null, thicknessMm: null };
  const width = parseCzechNumber(match[1]!) ?? 0;
  const height = parseCzechNumber(match[2]!) ?? 0;
  const thicknessMm = match[3] ? parseCzechNumber(match[3]) : null;
  return {
    formatMm: width > 0 && height > 0 ? { width, height } : null,
    thicknessMm
  };
};

const scoreHit = (query: string, hit: LuigiHit): number => {
  const attributes = hit.attributes ?? {};
  const title = firstString(attributes.title_cleaned) ?? firstString(attributes.title_no_slash) ?? firstString(attributes.title) ?? "";
  const productCode = (firstString(attributes.product_code) ?? "").replace(/\D/g, "");
  const queryCode = query.replace(/\D/g, "");
  const normalizedTitle = normalizeSearchText(title);
  const normalizedQuery = normalizeSearchText(query);
  const tokens = normalizedQuery.split(/\s+/).filter((token) => token.length > 1);
  const categoryText = normalizeSearchText([
    ...allStrings(attributes.all_categories),
    ...allStrings(attributes.category),
    firstString(attributes.main_category_lvl_1),
    firstString(attributes.main_category_lvl_2),
    firstString(attributes.main_category_lvl_3)
  ].filter(Boolean).join(" "));
  let score = 0;

  if (queryCode && productCode === queryCode) score += 1_000;
  if (normalizedTitle === normalizedQuery) score += 900;
  if (normalizedTitle.includes(normalizedQuery)) score += 350;
  if (tokens.length > 0) {
    const matches = tokens.filter((token) => normalizedTitle.includes(token)).length;
    score += Math.round((matches / tokens.length) * 300);
  }
  const queryPrefix = tokens[0] ?? "";
  if (queryPrefix && normalizedTitle.startsWith(queryPrefix)) score += 160;
  if (/(plosne materialy|laminovane desky|mdf|dtd|hdf|pracovni desky|prekliz|preglej|dyhov|kompakt|laminat|hrany|abs)/.test(categoryText)) {
    score += 90;
  }
  if (/(sluzby|vyprodej|nahradni dily)/.test(categoryText)) score -= 120;
  return score;
};

const searchDemos = async (query: string): Promise<LuigiHit | null> => {
  const url = new URL("https://live.luigisbox.tech/autocomplete/v2");
  url.searchParams.set("tracker_id", DEMOS_TRACKER_ID);
  url.searchParams.set("type", "item:12");
  url.searchParams.set("q", query);
  url.searchParams.set("hostname", "www.demos-trade.cz");
  const raw = await fetchText(url.toString());
  const data = JSON.parse(raw) as { hits?: LuigiHit[] };
  const hits = Array.isArray(data.hits) ? data.hits : [];
  return hits.sort((left, right) => scoreHit(query, right) - scoreHit(query, left))[0] ?? null;
};

const getHitPageUrl = (hit: LuigiHit): string | null => {
  const webUrl = firstString(hit.attributes?.web_url);
  if (webUrl?.startsWith(`${DEMOS_CZ_ORIGIN}/`)) return webUrl;
  return null;
};

const parseDataLayerProduct = (html: string): Record<string, unknown> | null => {
  const match = html.match(/window\.dataLayer\.push\(\s*(\{[\s\S]*?"ec\.productDetail"[\s\S]*?\})\s*\);/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1]!) as { ecommerce?: { detail?: { products?: Record<string, unknown>[] } } };
    return parsed.ecommerce?.detail?.products?.[0] ?? null;
  } catch {
    return null;
  }
};

const parseParamsTable = (html: string): Record<string, string> => {
  const params: Record<string, string> = {};
  const rows = html.matchAll(/<tr[^>]*>\s*<(?:td|th)[^>]*>\s*([\s\S]*?)\s*<\/(?:td|th)>\s*<td[^>]*>\s*([\s\S]*?)\s*<\/td>\s*<\/tr>/g);
  for (const row of rows) {
    const key = decodeHtml(row[1] ?? "");
    const value = decodeHtml(row[2] ?? "");
    if (key && value) params[key] = value;
  }
  return params;
};

const getParamValue = (params: Record<string, string>, attributes: Record<string, unknown>, aliases: string[]): string => {
  const normalizedAliases = new Set(aliases.map(normalizeText));
  for (const [key, value] of Object.entries(params)) {
    if (normalizedAliases.has(normalizeText(key))) return value;
  }
  return getAttributeString(attributes, aliases) ?? "";
};

const parseFirstPrice = (html: string): number | null => {
  const match = html.match(/box-detail-add__prices__big-price__main-item[\s\S]*?([\d\s\u00a0]+,\d{2})\s*(?:Kč|CZK)/i);
  return match ? parseCzechNumber(decodeHtml(match[1] ?? "")) : null;
};

const parseVatPrice = (html: string): number | null => {
  const matches = [...html.matchAll(/([\d\s\u00a0]+,\d{2})\s*(?:Kč|CZK)[\s\S]{0,80}s\s*DPH/gi)];
  const last = matches.at(-1);
  return last ? parseCzechNumber(decodeHtml(last[1] ?? "")) : null;
};

const parsePricePerM2 = (html: string): number | null => {
  const match = html.match(/Cena za[\s\S]{0,120}?m(?:²|2)[\s\S]{0,120}?([\d\s\u00a0]+,\d{2})\s*(?:Kč|CZK)[\s\S]{0,80}?bez DPH/i);
  return match ? parseCzechNumber(decodeHtml(match[1] ?? "")) : null;
};

const parseImageUrl = (html: string, kind: "original" | "preview"): string | null => {
  const regex = kind === "original"
    ? /<a[^>]+href="(https:\/\/www\.demos-trade\.cz\/content\/images\/product\/original\/[^"]+)"/
    : /<img[^>]+itemprop="image"[^>]+src="(https:\/\/www\.demos-trade\.cz\/content\/images\/product\/default\/[^"]+)"/;
  return html.match(regex)?.[1] ?? null;
};

const parseFormat = (value: string | undefined): { width: number; height: number } | null => {
  if (!value) return null;
  const parsed = parseDimensionsFromText(value);
  return parsed.formatMm;
};

const resolveCategoryPath = (attributes: Record<string, unknown>): string[] => {
  const path = allStrings(attributes.category_upto_lvl_5)[0]?.split("|").map((item) => item.trim()).filter(Boolean);
  if (path?.length) return path;
  const categories = allStrings(attributes.all_categories);
  if (categories.length) return categories;
  return allStrings(attributes.category);
};

const inferMaterialKind = (title: string, categoryPath: string[], materialProperty: string): DemosMaterialKind => {
  const text = normalizeSearchText([title, ...categoryPath, materialProperty].join(" "));
  if (/\bmdfl?\b|\bmdf\b/.test(text)) return "mdf";
  if (/\bhdf\b/.test(text)) return "hdf";
  if (/\bdtdl?\b|\bdrevotris|\bdrevotries|\bDTD\b/i.test([title, materialProperty].join(" "))) return "dtd";
  if (/multiplex/.test(text)) return "multiplex";
  if (/prekliz|preglej|plywood/.test(text)) return "plywood";
  if (/masiv|solid wood/.test(text)) return "solid_wood";
  if (/kompakt|compact/.test(text)) return "compact";
  if (/dyh|veneer/.test(text)) return "veneer";
  if (/akryl|acryl/.test(text)) return "acrylic";
  if (/\babs\b|hrana|hranovaci/.test(text)) return "abs";
  if (/laminat|lamino/.test(text)) return "laminate";
  return "dtd";
};

const scrapeDemosMaterial = async (query: string): Promise<DemosMaterialResult> => {
  const hit = await searchDemos(query);
  const pageUrl = hit ? getHitPageUrl(hit) : null;
  if (!hit || !pageUrl) throw new Error("Demos CZ material was not found.");

  const attributes = hit.attributes ?? {};
  const html = await fetchText(pageUrl);
  const params = parseParamsTable(html);
  const product = parseDataLayerProduct(html);
  const title = decodeHtml(
    html.match(/<h1[^>]*itemprop="name"[^>]*>([\s\S]*?)<\/h1>/)?.[1]
    ?? firstString(product?.name)
    ?? firstString(attributes.title_cleaned)
    ?? firstString(attributes.title_no_slash)
    ?? ""
  );
  const code = decodeHtml(
    html.match(/box-detail__top__code__value">\s*([\s\S]*?)\s*<\/strong>/)?.[1]
    ?? firstString(product?.sku)
    ?? firstString(attributes.product_code)
    ?? ""
  );
  const availabilityLabel = decodeHtml(
    html.match(/js-warehouse-availability-name">\s*<strong>([\s\S]*?)<\/strong>/)?.[1]
    ?? firstString(product?.availability)
    ?? getAttributeString(attributes, ["availability_rank_text"])
    ?? ""
  );
  const titleDimensions = parseDimensionsFromText(title);
  const formatValue = getParamValue(params, attributes, ["Formát materiálu (mm)", "Format materialu (mm)", "Rozměr", "Rozmer"]);
  const thicknessValue = getParamValue(params, attributes, ["Tloušťka materiálu (mm)", "Tloustka materialu (mm)", "Tloušťka", "Tloustka", "Hrúbka", "Hrubka"]);
  const materialProperty = getParamValue(params, attributes, ["Vlastnost materiálu", "Vlastnost materialu"]);
  const categoryPath = resolveCategoryPath(attributes);

  return {
    ok: true,
    query,
    source: "demos-cz",
    pageUrl,
    productId: typeof product?.id === "number" || typeof product?.id === "string" ? String(product.id) : hit.url ?? null,
    assortmentCode: code,
    title,
    brand: firstString(product?.brand) ?? firstString(attributes.brand),
    categoryPath,
    materialKind: inferMaterialKind(title, categoryPath, materialProperty),
    availability: {
      label: availabilityLabel,
      inStock: /skladem/i.test(availabilityLabel) || getAttributeNumber(attributes, ["availability"]) === 1,
      tooltip: decodeHtml(html.match(/box-expeditions-window__info__text">([\s\S]*?)<\/span>/)?.[1] ?? "") || getAttributeString(attributes, ["availability_tooltip"])
    },
    price: {
      amountWithoutVat: parseFirstPrice(html) ?? getAttributeNumber(attributes, ["price_amount"]),
      amountWithVat: parseVatPrice(html) ?? getAttributeNumber(attributes, ["price_with_vat_amount"]),
      pricePerM2WithoutVat: parsePricePerM2(html),
      currency: "CZK"
    },
    board: {
      thicknessMm: parseCzechNumber(thicknessValue) ?? titleDimensions.thicknessMm,
      formatMm: parseFormat(formatValue) ?? titleDimensions.formatMm,
      decorCode: getParamValue(params, attributes, ["Číslo dekoru", "Cislo dekoru"]) || null,
      decorName: getParamValue(params, attributes, ["Název dekoru", "Nazev dekoru"]) || null,
      structure: getParamValue(params, attributes, ["Struktura materiálu", "Struktura materialu"]) || null,
      colorTone: getParamValue(params, attributes, ["Barevný odstín", "Barevny odstin"]) || null,
      decorType: getParamValue(params, attributes, ["Typ dekoru"]) || null,
      materialProperty: materialProperty || null
    },
    image: {
      originalUrl: parseImageUrl(html, "original") ?? firstString(attributes.image_link),
      previewUrl: parseImageUrl(html, "preview") ?? firstString(attributes.image_link)
    },
    scrapedAt: new Date().toISOString()
  };
};

export async function handleDemosMaterialLookup(reqUrl: URL, res: http.ServerResponse, sendJson: SendJson): Promise<void> {
  const query = (reqUrl.searchParams.get("q") ?? "").trim();
  if (query.length < 2) return sendJson(res, 400, { ok: false, error: "q is required." });
  const material = await scrapeDemosMaterial(query);
  return sendJson(res, 200, { ok: true, material });
}

export async function handleDemosMaterialImage(reqUrl: URL, res: http.ServerResponse): Promise<void> {
  const imageUrl = reqUrl.searchParams.get("url") ?? "";
  let parsed: URL;
  try {
    parsed = new URL(imageUrl);
  } catch {
    res.statusCode = 400;
    res.end("Invalid image URL.");
    return;
  }
  if (parsed.protocol !== "https:" || parsed.hostname !== "www.demos-trade.cz" || !parsed.pathname.startsWith("/content/images/product/")) {
    res.statusCode = 400;
    res.end("Unsupported image URL.");
    return;
  }
  const { response, body } = await fetchExternalBytes(parsed, {
    headers: { "user-agent": "Mozilla/5.0 ArcigyKitchenMaterialScraper/1.0" }
  }, { timeoutMs: FETCH_TIMEOUT_MS, maxBytes: MAX_IMAGE_RESPONSE_BYTES });
  if (!response.ok) {
    res.statusCode = 502;
    res.end(`Failed to fetch Demos image: ${response.status}`);
    return;
  }
  const contentType = response.headers.get("content-type") || "image/jpeg";
  if (!contentType.toLowerCase().startsWith("image/")) {
    res.statusCode = 502;
    res.end("Demos image response has an invalid content type.");
    return;
  }
  res.statusCode = 200;
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.setHeader("Content-Type", contentType);
  res.end(Buffer.from(body));
}
