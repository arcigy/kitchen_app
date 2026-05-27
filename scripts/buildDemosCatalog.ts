import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import type {
  BoardFamily,
  ComponentDefinition,
  ComponentGeometryArchetype,
  ComponentGeometryDefinition,
  ComponentType,
  KitchenDefaults,
  MaterialDefinition,
  PriceList
} from "../src/core/catalog/catalog-types";
import type { MaterialBase } from "../src/data/pricing/types";

type CsvRecord = Record<string, string>;

type DemosCatalogGeneratedData = {
  materials: MaterialDefinition[];
  components: ComponentDefinition[];
  componentGeometry: ComponentGeometryDefinition[];
  priceList: PriceList;
  kitchenDefaults: KitchenDefaults;
  summary: {
    materials: Record<string, number>;
    components: Record<string, number>;
    activeMaterials: number;
    activeComponents: number;
  };
};

const DEFAULT_BOARDS_CSV = "C:/Users/laube/Documents/New project 7/data/demos-categorized/plosne_materialy_categorized.csv";
const DEFAULT_COMPONENTS_CSV = "C:/Users/laube/Documents/New project 7/data/demos-categorized/komponenty_categorized.csv";
const OUTPUT_PATH = path.join(process.cwd(), "src/system/catalog-templates/demosCatalog.generated.ts");
const DEMOS_PREVIEW_COLOR_CACHE_PATH = path.join(process.cwd(), "backend/materials/demos_preview_color_cache.json");

const COMPONENT_GEOMETRY: Record<ComponentType, { id: string; displayName: string; archetype: ComponentGeometryArchetype }> = {
  runner: { id: "geo.demos.runner.generic", displayName: "Démos výsuv / zásuvkový systém", archetype: "runner_pair" },
  handle: { id: "geo.demos.handle.generic", displayName: "Démos úchytka / madlo", archetype: "handle_bar" },
  leg: { id: "geo.demos.leg.generic", displayName: "Démos nožička / rektifikácia", archetype: "leg_adjustable" },
  plinth_clip: { id: "geo.demos.plinth_clip.generic", displayName: "Démos soklová príchytka", archetype: "plinth_clip" },
  fastener: { id: "geo.demos.fastener.generic", displayName: "Démos ostatný komponent", archetype: "fastener" },
  hinge: { id: "geo.demos.hinge.generic", displayName: "Démos pánt / záves", archetype: "hinge" },
  push_system: { id: "geo.demos.push_system.generic", displayName: "Démos push systém", archetype: "push_system" },
  hanging_bracket: { id: "geo.demos.hanging_bracket.generic", displayName: "Démos závesné kovanie", archetype: "hanging_bracket" },
  shelf_support: { id: "geo.demos.shelf_support.generic", displayName: "Démos policová podpera", archetype: "shelf_support" },
  drawer_insert: { id: "geo.demos.drawer_insert.generic", displayName: "Démos organizér zásuvky", archetype: "drawer_insert" },
  lift_up: { id: "geo.demos.lift_up.generic", displayName: "Démos výklop", archetype: "lift_up" },
  waste_system: { id: "geo.demos.waste_system.generic", displayName: "Démos odpadový systém", archetype: "waste_system" },
  lighting: { id: "geo.demos.lighting.generic", displayName: "Démos osvetlenie", archetype: "lighting_profile" }
};

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === "\"") {
      if (quoted && line[index + 1] === "\"") {
        current += "\"";
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      values.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  values.push(current);
  return values;
}

async function readCsv(filePath: string): Promise<CsvRecord[]> {
  const raw = await readFile(filePath, "utf-8");
  const rows: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    if (char === "\"") {
      if (quoted && raw[index + 1] === "\"") index += 1;
      else quoted = !quoted;
    }
    if ((char === "\n" || char === "\r") && !quoted) {
      if (current.length > 0) rows.push(current);
      current = "";
      if (char === "\r" && raw[index + 1] === "\n") index += 1;
    } else {
      current += char;
    }
  }
  if (current.length > 0) rows.push(current);

  const headers = parseCsvLine(rows[0] ?? "");
  return rows.slice(1).map((line) => {
    const values = parseCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
}

function numberValue(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value.replace(",", ".").replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function text(record: CsvRecord, key: string): string {
  const value = (record[key] ?? "").trim();
  return /^(none|null|nan|undefined)$/i.test(value) ? "" : value;
}

function safeId(prefix: string, record: CsvRecord, used: Set<string>): string {
  const code = text(record, "sortiment_code") || text(record, "listing_lb_id") || hashText(text(record, "url")).slice(0, 10);
  const base = `${prefix}.${code.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "")}`;
  let id = base;
  let index = 2;
  while (used.has(id)) {
    id = `${base}_${index}`;
    index += 1;
  }
  used.add(id);
  return id;
}

function hashText(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function colorHexFromText(value: string): string {
  const hash = hashText(value);
  return `#${hash.slice(0, 6)}`;
}

type PreviewColorCache = Record<string, { hex: string; samples?: string[]; updatedAt?: string }>;

const HEX_RE = /^#[0-9a-fA-F]{6}$/;

async function readPreviewColorCache(): Promise<PreviewColorCache> {
  try {
    const parsed = JSON.parse(await readFile(DEMOS_PREVIEW_COLOR_CACHE_PATH, "utf-8")) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>).filter(([, value]) => {
        return !!value && typeof value === "object" && !Array.isArray(value) && HEX_RE.test(String((value as Record<string, unknown>).hex ?? ""));
      })
    ) as PreviewColorCache;
  } catch {
    return {};
  }
}

function normalizedWords(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function hasWord(value: string, words: string[]): boolean {
  return words.some((word) => new RegExp(`(^|\\s)${word}(\\s|$)`).test(value));
}

function extractDecorName(name: string): string {
  const withoutDimensions = name.replace(/\b\d{3,4}\s*[x/]\s*\d{3,4}(?:\s*[x/]\s*\d{1,3})?\b/gi, " ");
  const tokens = withoutDimensions
    .split(/\s+/)
    .filter((token) => {
      const plain = normalizedWords(token);
      if (!plain) return false;
      if (/^\d+(?:[.,]\d+)?$/.test(plain)) return false;
      if (/^[a-z]\d{2,}[a-z0-9]*$/.test(plain)) return false;
      if (/^\d{2,}[a-z]*$/.test(plain)) return false;
      return !["dtdl", "dtddl", "dtdu", "dtd", "mdf", "hdf", "buk", "bu", "bs", "su", "hu", "rw", "ad", "pn", "sn", "pe", "sm", "st", "pa", "um", "ln", "mp", "pw", "pg", "kg", "mm"].includes(plain);
    });
  return tokens.join(" ").trim() || name;
}

function estimateBoardColor(value: string): { label: string; hex: string } {
  const textValue = normalizedWords(value);
  const rules: Array<{ label: string; hex: string; words: string[] }> = [
    { label: "White", hex: "#f2f0e8", words: ["white", "biela", "bily", "bila", "sneh", "alpine"] },
    { label: "Black", hex: "#1f2020", words: ["black", "cierna", "cerny", "cerna", "noir", "onyx"] },
    { label: "Anthracite", hex: "#34373a", words: ["anthracite", "antracit", "graphite", "grafit", "charcoal", "basalt"] },
    { label: "Grey", hex: "#8f9496", words: ["grey", "gray", "siva", "sedy", "seda", "silver", "strieb", "mouse", "platinum", "platinium", "aluminium"] },
    { label: "Blue", hex: "#2f6fae", words: ["blue", "modra", "modry", "azure", "navy", "indigo"] },
    { label: "Green", hex: "#5f7f62", words: ["green", "zelena", "zeleny", "olive", "emerald", "khaki", "sage"] },
    { label: "Red", hex: "#9b3a32", words: ["red", "cervena", "cerveny", "burgundy", "spice"] },
    { label: "Pink", hex: "#c48c92", words: ["pink", "ruzova", "ruzovy", "rose"] },
    { label: "Yellow", hex: "#d7b54b", words: ["yellow", "zlta", "zlty", "gold", "honey", "amber"] },
    { label: "Orange", hex: "#b8743e", words: ["orange", "oranzova", "oranzovy", "copper", "terracotta"] },
    { label: "Purple", hex: "#6f557f", words: ["purple", "violet", "fialova", "fialovy", "lila"] },
    { label: "Beige", hex: "#cfc0a7", words: ["beige", "bezova", "bezovy", "cashmere", "kasmirova", "kasmirovy", "sand", "cream", "ivory", "biscotti", "vanilla"] },
    { label: "Concrete", hex: "#9a9690", words: ["concrete", "beton", "cement"] },
    { label: "Stone", hex: "#8e8780", words: ["stone", "kamen", "marble", "mramor", "travertin", "slate"] },
    { label: "Walnut", hex: "#765036", words: ["walnut", "orech", "noce"] },
    { label: "Oak", hex: "#b98a55", words: ["oak", "dub", "baroque", "hudson", "sonoma", "artisan", "arvadonna"] },
    { label: "Beech", hex: "#d7b98a", words: ["beech", "buk"] },
    { label: "Cherry", hex: "#9f5a3d", words: ["cherry", "ceresna", "tresen"] },
    { label: "Maple", hex: "#d8c8a5", words: ["maple", "javor"] },
    { label: "Birch", hex: "#d7c49c", words: ["birch", "breza"] },
    { label: "Ash", hex: "#c7b89d", words: ["ash", "jasan"] },
    { label: "Chestnut", hex: "#8b5a3d", words: ["chestnut", "gastan"] },
    { label: "Wenge", hex: "#3b2820", words: ["wenge"] },
    { label: "Pine", hex: "#d0b37c", words: ["pine", "borovica"] },
    { label: "Elm", hex: "#a77b54", words: ["elm", "brest"] }
  ];
  const matched = rules.find((rule) => hasWord(textValue, rule.words));
  if (matched) return { label: matched.label, hex: matched.hex };
  return { label: "Mixed decor", hex: "#a8835a" };
}

function materialBase(record: CsvRecord): MaterialBase {
  const value = `${text(record, "name")} ${text(record, "usage_subcategory")} ${text(record, "source_path")}`.toLowerCase();
  if (value.includes("hdf")) return "hdf";
  if (value.includes("mdf")) return "mdf";
  if (value.includes("preglej")) return "plywood";
  if (value.includes("multiplex")) return "multiplex";
  if (value.includes("masív") || value.includes("masiv") || value.includes("škárov")) return "solid_wood";
  if (value.includes("dyh")) return "veneer";
  if (value.includes("akryl")) return "acrylic";
  if (value.includes("kompakt")) return "compact";
  if (value.includes("lamin")) return "laminate";
  return "dtd";
}

function boardFamily(record: CsvRecord, base: MaterialBase, thickness: number): BoardFamily {
  const category = text(record, "usage_category");
  const subcategory = text(record, "usage_subcategory").toLowerCase();
  const name = text(record, "name").toLowerCase();
  if (category.includes("Kuchynské pracovné")) return "worktop";
  if (category.includes("Dvierka")) return "front";
  if (subcategory.includes("lesk") || subcategory.includes("akryl") || subcategory.includes("dyhované")) return "front";
  if ((base === "hdf" || base === "mdf") && thickness <= 10) return thickness <= 8 ? "drawer_bottom" : "back";
  if (subcategory.includes("mdf") || subcategory.includes("hdf")) return "back";
  if (category.includes("Povrchové") || category.includes("Dekoratívne")) return "shelf";
  return "body";
}

function materialCategory(family: BoardFamily): string {
  if (family === "back" || family === "drawer_bottom") return "Démos dosky: chrbty MDF/HDF";
  if (family === "worktop") return "Démos dosky: pracovné dosky";
  if (family === "front") return "Démos dosky: dvierka/fronty";
  if (family === "shelf") return "Démos dosky: police/dekor";
  return "Démos dosky: korpusové dosky";
}

function parseBoardPrice(record: CsvRecord, lengthMm: number, widthMm: number): number {
  const extra = text(record, "extra_price_text").match(/m²\s+([\d,.]+)/i);
  if (extra?.[1]) return numberValue(extra[1]) ?? 0;
  const raw = numberValue(text(record, "price_without_vat")) ?? 0;
  const unit = text(record, "price_unit") || text(record, "unit");
  if (unit === "ks" && lengthMm > 0 && widthMm > 0) {
    const area = (lengthMm / 1000) * (widthMm / 1000);
    return area > 0 ? Number((raw / area).toFixed(2)) : raw;
  }
  return raw;
}

function createMaterial(record: CsvRecord, usedIds: Set<string>, previewColorCache: PreviewColorCache): MaterialDefinition {
  const id = safeId("mat.demos", record, usedIds);
  const thickness = numberValue(text(record, "thickness_mm")) ?? numberValue(text(record, "param:Hrúbka materiálu (mm)")) ?? 18;
  const lengthMm = numberValue(text(record, "length_mm")) ?? 0;
  const widthMm = numberValue(text(record, "width_mm")) ?? 0;
  const base = materialBase(record);
  const family = boardFamily(record, base, thickness);
  const price = parseBoardPrice(record, lengthMm, widthMm);
  const active = price > 0 && ["body", "front", "back", "drawer_bottom", "worktop"].includes(family);
  const decor = text(record, "param:Názov dekoru") || extractDecorName(text(record, "name"));
  const finish = text(record, "param:Štruktúra materiálu") || text(record, "param:Povrch") || text(record, "usage_subcategory");
  const estimatedColor = estimateBoardColor(
    [
      text(record, "param:Farebný odtieň"),
      text(record, "param:Farba"),
      decor,
      text(record, "name"),
      text(record, "usage_subcategory")
    ].join(" ")
  );
  const imageUrl = text(record, "texture_image_url");
  const cachedPreviewColor = imageUrl ? previewColorCache[imageUrl]?.hex : undefined;
  const previewColorHex = cachedPreviewColor && HEX_RE.test(cachedPreviewColor) ? cachedPreviewColor : "#a8835a";
  return {
    id,
    entityType: "material",
    materialType: "board",
    name: text(record, "name"),
    displayName: text(record, "name"),
    category: materialCategory(family),
    baseMaterial: base,
    decor,
    color: estimatedColor.label,
    finish,
    pricingBasis: "sheet_area",
    pricingUnit: "m2",
    availableThicknessesMm: [thickness],
    defaultThicknessMm: thickness,
    isActive: active,
    tags: [
      "demos-sk",
      "demos-board",
      `demos-${family}`,
      text(record, "usage_category"),
      text(record, "usage_subcategory"),
      text(record, "brand")
    ].filter(Boolean),
    preview: { colorHex: previewColorHex, roughness: 0.58, metalness: 0 },
    boardFamily: family,
    recommendedUse: text(record, "usage_subcategory"),
    grainDirectionRelevant: true,
    supplierSource: {
      supplier: "demos-sk",
      supplierProductId: text(record, "sortiment_code"),
      url: text(record, "url"),
      imageUrl,
      usageCategory: text(record, "usage_category"),
      usageSubcategory: text(record, "usage_subcategory"),
      sourceCategory: text(record, "source_category"),
      rawUnit: text(record, "unit")
    }
  };
}

function componentType(record: CsvRecord): ComponentType {
  const category = text(record, "usage_category");
  const haystack = `${category} ${text(record, "usage_subcategory")} ${text(record, "source_path")} ${text(record, "name")}`.toLowerCase();
  if (category.includes("Úchytky")) return "handle";
  if (category.includes("Nohy")) return "leg";
  if (category.includes("Zásuvky")) return "runner";
  if (category.includes("Závesy")) return "hinge";
  if (category.includes("Osvetlenie")) return "lighting";
  if (haystack.includes("odpad") || haystack.includes("kôš") || haystack.includes("kos")) return "waste_system";
  if (haystack.includes("polic")) return "shelf_support";
  if (haystack.includes("závesné") || haystack.includes("zavesne")) return "hanging_bracket";
  return "fastener";
}

function componentCategory(type: ComponentType, active: boolean): string {
  if (!active) return "Démos komponenty: ostatné nepoužívané";
  if (type === "handle") return "Démos komponenty: kľučky a úchytky";
  if (type === "leg") return "Démos komponenty: nožičky";
  if (type === "hinge") return "Démos komponenty: pánty a závesy";
  if (type === "runner") return "Démos komponenty: koľajnice a výsuvy";
  return "Démos komponenty: ostatné nepoužívané";
}

function createComponent(record: CsvRecord, usedIds: Set<string>): ComponentDefinition | null {
  if (text(record, "record_type") === "special_order_or_service") return null;
  const id = safeId("cmp.demos", record, usedIds);
  const type = componentType(record);
  const price = numberValue(text(record, "price_without_vat")) ?? 0;
  const active = price > 0 && ["handle", "leg", "hinge", "runner"].includes(type);
  const geometry = COMPONENT_GEOMETRY[type];
  return {
    id,
    entityType: "component",
    componentType: type,
    geometryId: geometry.id,
    name: text(record, "name"),
    displayName: text(record, "name"),
    brand: text(record, "brand") || "Démos",
    series: text(record, "source_category"),
    variant: text(record, "usage_subcategory"),
    color: text(record, "param:Farba") || text(record, "param:Povrchová úprava") || "",
    pricingBasis: "piece",
    pricingUnit: "pcs",
    defaultQuantity: 1,
    isActive: active,
    tags: [
      "demos-sk",
      active ? "demos-used" : "demos-unused",
      componentCategory(type, active),
      text(record, "usage_category"),
      text(record, "usage_subcategory"),
      text(record, "brand")
    ].filter(Boolean),
    preview: { colorHex: colorHexFromText(`${text(record, "name")} ${text(record, "param:Farba")}`), roughness: 0.32, metalness: 0.6 },
    nominalLengthMm: numberValue(text(record, "length_mm")) ?? numberValue(text(record, "param:Dĺžka (mm)")) ?? undefined,
    nominalHeightMm: numberValue(text(record, "height_mm")) ?? numberValue(text(record, "param:Výška (mm)")) ?? undefined,
    recommendedUse: text(record, "usage_subcategory"),
    notes: active ? undefined : ["Nepoužívané v aktuálnych parametroch modulov."],
    supplierSource: {
      supplier: "demos-sk",
      supplierProductId: text(record, "sortiment_code"),
      url: text(record, "url"),
      imageUrl: text(record, "product_image_url"),
      usageCategory: text(record, "usage_category"),
      usageSubcategory: text(record, "usage_subcategory"),
      sourceCategory: text(record, "source_category"),
      rawUnit: text(record, "unit")
    }
  };
}

function countByCategory<T extends { category?: string; componentType?: ComponentType; boardFamily?: BoardFamily; isActive: boolean }>(
  items: T[],
  key: (item: T) => string
): Record<string, number> {
  return items.reduce<Record<string, number>>((acc, item) => {
    const label = key(item);
    acc[label] = (acc[label] ?? 0) + 1;
    return acc;
  }, {});
}

function chooseDefault<T extends { id: string; isActive: boolean }>(items: T[], predicate: (item: T) => boolean): string {
  const found = items.find((item) => item.isActive && predicate(item));
  if (!found) throw new Error("Démos catalog default could not be resolved.");
  return found.id;
}

function chooseDefaultSorted<T extends { id: string; isActive: boolean }>(
  items: T[],
  predicate: (item: T) => boolean,
  compare: (a: T, b: T) => number
): string {
  const found = items.filter((item) => item.isActive && predicate(item)).sort(compare)[0];
  if (!found) throw new Error("Démos catalog default could not be resolved.");
  return found.id;
}

async function main() {
  const boardsCsv = process.env.DEMOS_BOARDS_CSV || DEFAULT_BOARDS_CSV;
  const componentsCsv = process.env.DEMOS_COMPONENTS_CSV || DEFAULT_COMPONENTS_CSV;
  const [boardRows, componentRows, previewColorCache] = await Promise.all([
    readCsv(boardsCsv),
    readCsv(componentsCsv),
    readPreviewColorCache()
  ]);
  const materialIds = new Set<string>();
  const componentIds = new Set<string>();
  const prices: Record<string, number> = {};
  const materials = boardRows.map((record) => {
    const material = createMaterial(record, materialIds, previewColorCache);
    prices[material.id] = parseBoardPrice(
      record,
      numberValue(text(record, "length_mm")) ?? 0,
      numberValue(text(record, "width_mm")) ?? 0
    );
    return material;
  });
  const drawerBoxMaterials = materials
    .filter((material) => material.isActive && material.boardFamily === "body" && material.defaultThicknessMm <= 18)
    .map((material): MaterialDefinition => {
      const code = material.supplierSource?.supplierProductId?.toLowerCase().replace(/[^a-z0-9]+/g, "_") ?? hashText(material.id).slice(0, 10);
      const baseId = `mat.demos.drawer_box.${code}`;
      let id = baseId;
      let index = 2;
      while (materialIds.has(id)) {
        id = `${baseId}_${index}`;
        index += 1;
      }
      materialIds.add(id);
      prices[id] = prices[material.id] ?? 0;
      return {
        ...material,
        id,
        category: "Démos dosky: zásuvkové bočnice",
        boardFamily: "drawer_box",
        tags: [...material.tags.filter((tag) => tag !== "demos-body"), "demos-drawer_box"]
      };
    });
  materials.push(...drawerBoxMaterials);
  const components = componentRows.flatMap((record) => {
    const component = createComponent(record, componentIds);
    if (!component) return [];
    prices[component.id] = numberValue(text(record, "price_without_vat")) ?? 0;
    return [component];
  });
  const componentGeometry: ComponentGeometryDefinition[] = Object.values(COMPONENT_GEOMETRY).map((definition) => {
    const type = Object.entries(COMPONENT_GEOMETRY).find(([, value]) => value.id === definition.id)?.[0] as ComponentType;
    return {
      id: definition.id,
      displayName: definition.displayName,
      componentType: type,
      archetype: definition.archetype,
      sourceGeometry: "catalog_demo",
      dimensionsMm: {},
      notes: ["Generic Démos geometry placeholder; detailed geometry remains module/runtime responsibility."]
    };
  });
  const priceList: PriceList = {
    id: "demos-sk-2026",
    name: "Démos SK katalóg",
    currency: "EUR",
    isActive: true,
    prices
  };
  const backPanelMaterialId = chooseDefaultSorted(
    materials,
    (item) => (item.boardFamily === "back" || item.boardFamily === "drawer_bottom") && item.defaultThicknessMm <= 10,
    (a, b) => Math.abs(a.defaultThicknessMm - 8) - Math.abs(b.defaultThicknessMm - 8)
  );
  const drawerBottomMaterialId = chooseDefaultSorted(
    materials,
    (item) => (item.boardFamily === "drawer_bottom" || item.boardFamily === "back") && item.defaultThicknessMm <= 8,
    (a, b) => Math.abs(a.defaultThicknessMm - 6) - Math.abs(b.defaultThicknessMm - 6)
  );
  const kitchenDefaults: KitchenDefaults = {
    carcassMaterialId: chooseDefault(materials, (item) => item.boardFamily === "body" && item.defaultThicknessMm === 18),
    frontMaterialId: chooseDefault(materials, (item) => item.boardFamily === "front"),
    worktopMaterialId: chooseDefault(materials, (item) => item.boardFamily === "worktop"),
    plinthMaterialId: chooseDefault(materials, (item) => item.boardFamily === "body" && item.defaultThicknessMm === 18),
    backPanelMaterialId,
    drawerBottomMaterialId,
    defaultHandleComponentId: chooseDefault(components, (item) => item.componentType === "handle" && /[A-Za-zÁ-ž]/.test(item.displayName) && !/^\d+$/.test(item.displayName)),
    defaultHingeComponentId: chooseDefault(components, (item) => item.componentType === "hinge" && item.displayName.toLowerCase().includes("záves")),
    defaultDrawerSystemComponentId: chooseDefault(components, (item) => item.componentType === "runner" && item.displayName.toLowerCase().includes("výsuv")),
    defaultWorktopThicknessMm: materials.find((item) => item.id === chooseDefault(materials, (material) => material.boardFamily === "worktop"))?.defaultThicknessMm ?? 38,
    defaultCarcassThicknessMm: 18,
    defaultBackPanelThicknessMm: materials.find((item) => item.id === backPanelMaterialId)?.defaultThicknessMm ?? 8,
    defaultPlinthHeightMm: 150
  };
  const data: DemosCatalogGeneratedData = {
    materials,
    components,
    componentGeometry,
    priceList,
    kitchenDefaults,
    summary: {
      materials: countByCategory(materials, (item) => item.category),
      components: countByCategory(components, (item) => componentCategory(item.componentType, item.isActive)),
      activeMaterials: materials.filter((item) => item.isActive).length,
      activeComponents: components.filter((item) => item.isActive).length
    }
  };
  const payload = Buffer.from(JSON.stringify(data));
  const compressed = gzipSync(payload);
  const base64 = compressed.toString("base64");
  const chunks = base64.match(/.{1,120}/g) ?? [];
  const body = `export const DEMOS_CATALOG_GENERATED_META = ${JSON.stringify({
    generatedAt: new Date().toISOString(),
    boardsCsv: path.basename(boardsCsv),
    componentsCsv: path.basename(componentsCsv),
    materials: materials.length,
    components: components.length,
    activeMaterials: data.summary.activeMaterials,
    activeComponents: data.summary.activeComponents
  }, null, 2)} as const;\n\nexport const DEMOS_CATALOG_GENERATED_GZIP_BASE64 = [\n${chunks.map((chunk) => `  "${chunk}"`).join(",\n")}\n].join("");\n`;
  await mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, body, "utf-8");
  console.log(`Generated ${materials.length} materials and ${components.length} components into ${OUTPUT_PATH}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
