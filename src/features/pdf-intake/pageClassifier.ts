import type { PageClassification, PageClassificationInput, PageClassifier, PageType } from "./types";
import { normalizeText } from "./normalization";

const KEYWORDS: Record<PageType, string[]> = {
  furniture_schedule: [
    "vykaz nabytku",
    "nabytok",
    "nabytek",
    "furniture schedule",
    "furniture list",
    "mobiliar",
    "einbaumobel",
    "mobel",
    "mobelliste",
    "schrank",
    "kuche",
    "kuchyna",
    "kuchyne",
    "wardrobe",
    "cabinet",
    "skrina"
  ],
  floor_plan: [
    "plan mebeli",
    "furniture plan",
    "furniture layout",
    "furniture floor plan",
    "plan nabytku",
    "podorys nabytku",
    "pudorys nabytku",
    "dispozicia nabytku",
    "план мебели"
  ],
  measurement_floor_plan: [
    "obmerny plan",
    "obmerny podorys",
    "obmerovy plan",
    "obmerovy podorys",
    "obmer",
    "zameranie",
    "zamereni",
    "zamerovaci plan",
    "zameriavaci plan",
    "pasport",
    "pasportizacia",
    "pasportizace",
    "povodny stav",
    "existujuci stav",
    "stavebny stav",
    "stavebni stav",
    "skutkovy stav",
    "stav pred upravou",
    "stav pred rekonstrukciou",
    "stav pred rekonstrukci",
    "measurement plan",
    "measured floor plan",
    "measured plan",
    "measurement floor plan",
    "as built plan",
    "as-built plan",
    "existing plan",
    "existing floor plan",
    "existing conditions",
    "survey plan",
    "building survey",
    "measured survey",
    "dimension plan",
    "walls and dimensions",
    "dimensioned plan",
    "koty",
    "kotenie",
    "dimensions",
    "pudorys",
    "podorys",
    "floor plan",
    "grundriss",
    "bestandsplan",
    "bestand",
    "aufmass",
    "aufmassplan",
    "aufmass plan",
    "vermassung",
    "vermasster grundriss",
    "dispozicia",
    "dispozice",
    "1.np",
    "2.np",
    "prizemie",
    "patro",
    "обмерный план",
    "обмер",
    "план обмера",
    "план замера",
    "замерный план",
    "исходный план",
    "существующий план",
    "план существующего положения",
    "план до демонтажа"
  ],
  visualization: [
    "vizualizacia",
    "vizualizace",
    "render",
    "pohlad",
    "pohled",
    "interior",
    "visualisierung",
    "perspektiva",
    "perspektive",
    "визуализация"
  ],
  irrelevant: [
    "elektro",
    "elektroinstalacia",
    "zdravotechnika",
    "zti",
    "voda",
    "kanalizacia",
    "kurenie",
    "heating",
    "heizung",
    "statika",
    "rez",
    "section",
    "schnitt",
    "detail",
    "legenda",
    "technicka sprava",
    "technische beschreibung",
    "montaz",
    "montazny plan",
    "plan montaze",
    "installation plan",
    "installation",
    "demolition",
    "buracie prace",
    "sanitar",
    "santechnika",
    "plumbing",
    "lighting",
    "osvetlenie",
    "zasuvky",
    "vypinace",
    "rozvody",
    "розетки",
    "выключатели",
    "сантехника",
    "монтаж",
    "план монтажа",
    "освещение",
    "отопление"
  ]
};

const TYPE_PRIORITY: PageType[] = ["furniture_schedule", "floor_plan", "measurement_floor_plan", "visualization", "irrelevant"];
const TECHNICAL_NEGATIVE_KEYWORDS = KEYWORDS.irrelevant.filter((keyword) => keyword !== "detail" && keyword !== "legenda");

export class HeuristicPageClassifier implements PageClassifier {
  async classifyPage(input: PageClassificationInput): Promise<PageClassification> {
    return classifyPageHeuristically(input);
  }
}

export function classifyPageHeuristically(input: PageClassificationInput): PageClassification {
  const text = input.extractedText.trim();
  const extractedTextPreview = makePreview(text);

  if (!text) {
    return {
      pageNumber: input.pageNumber,
      predictedType: "irrelevant",
      confidence: 0.18,
      reasons: ["no extracted text"],
      extractedTextPreview
    };
  }

  const normalizedText = normalizeText(text);
  const scores = scoreText(normalizedText);
  const technicalMatches = matchKeywords(normalizedText, TECHNICAL_NEGATIVE_KEYWORDS);
  if (technicalMatches.length > 0 && scores.floor_plan.length === 0 && scores.furniture_schedule.length === 0 && scores.visualization.length === 0) {
    return {
      pageNumber: input.pageNumber,
      predictedType: "irrelevant",
      confidence: computeConfidence(technicalMatches.length, technicalMatches.length),
      reasons: technicalMatches.map((keyword) => `technical keyword: ${keyword}`),
      extractedTextPreview
    };
  }

  const ranked = TYPE_PRIORITY
    .map((type) => ({ type, score: scores[type].length }))
    .sort((left, right) => right.score - left.score || TYPE_PRIORITY.indexOf(left.type) - TYPE_PRIORITY.indexOf(right.type));
  const winner = ranked[0];

  if (!winner || winner.score === 0) {
    return {
      pageNumber: input.pageNumber,
      predictedType: "irrelevant",
      confidence: 0.32,
      reasons: ["no classification keywords found"],
      extractedTextPreview
    };
  }

  const runnerUpScore = ranked[1]?.score ?? 0;
  const confidence = computeConfidence(winner.score, winner.score - runnerUpScore);

  return {
    pageNumber: input.pageNumber,
    predictedType: winner.type,
    confidence,
    reasons: scores[winner.type].map((keyword) => `keyword: ${keyword}`),
    extractedTextPreview
  };
}

function scoreText(normalizedText: string): Record<PageType, string[]> {
  return PAGE_TYPE_RECORD((type) => matchKeywords(normalizedText, KEYWORDS[type]));
}

function matchKeywords(normalizedText: string, keywords: string[]): string[] {
  const matches: string[] = [];
  for (const keyword of keywords) {
    if (normalizedText.includes(normalizeText(keyword))) matches.push(keyword);
  }
  return matches;
}

function computeConfidence(matches: number, margin: number): number {
  const value = 0.52 + Math.min(matches, 5) * 0.08 + Math.min(Math.max(margin, 0), 4) * 0.04;
  return Math.round(Math.min(value, 0.94) * 100) / 100;
}

function makePreview(text: string): string {
  return text.replace(/\s+/g, " ").slice(0, 320);
}

function PAGE_TYPE_RECORD<T>(factory: (type: PageType) => T): Record<PageType, T> {
  return {
    furniture_schedule: factory("furniture_schedule"),
    floor_plan: factory("floor_plan"),
    measurement_floor_plan: factory("measurement_floor_plan"),
    visualization: factory("visualization"),
    irrelevant: factory("irrelevant")
  };
}
