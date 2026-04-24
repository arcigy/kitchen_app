export type AppLanguage = "en" | "sk";

const STORAGE_KEY = "kitchen.app.language";

const EXACT_SK_TEXT: Record<string, string> = {
  "Kitchen Layout 2026 - Floor Plan": "Kitchen Layout 2026 - Pôdorys",
  "Project 1": "Projekt 1",
  File: "Súbor",
  Architecture: "Architektúra",
  Modify: "Upraviť",
  View: "Zobrazenie",
  Manage: "Správa",
  Layout: "Rozloženie",
  Edit: "Úpravy",
  Project: "Projekt",
  Select: "Vybrať",
  Wall: "Stena",
  Align: "Zarovnať",
  Trim: "Orezať",
  Section: "Rez",
  Measure: "Merať",
  Floor: "Podlaha",
  Underlay: "Podklad",
  Kitchen: "Kuchyňa",
  Undo: "Späť",
  Redo: "Znova",
  Move: "Posunúť",
  Rotate: "Otočiť",
  Duplicate: "Duplikovať",
  Delete: "Zmazať",
  "2D View": "2D pohľad",
  "2D top view": "2D pohľad zhora",
  "Reset Defaults": "Resetovať predvolené",
  Reset: "Resetovať",
  "Export JSON": "Export JSON",
  Export: "Export",
  "Copy Export": "Kopírovať export",
  Copy: "Kopírovať",
  "Pricing Catalog": "Cenový katalóg",
  Catalog: "Katalóg",
  BOM: "Kusovník",
  "Reset View": "Resetovať pohľad",
  Floorplan: "Pôdorys",
  Properties: "Vlastnosti",
  Walls: "Steny",
  Modules: "Moduly",
  Worktops: "Pracovné dosky",
  Sections: "Rezy",
  Type: "Typ",
  Length: "Dĺžka",
  Direction: "Smer",
  Default: "Predvolené",
  Mirrored: "Zrkadlovo",
  "Cut line": "Rezná línia",
  Model: "Model",
  Ortho: "Orto",
  Lighting: "Osvetlenie",
  "Render mode": "Režim renderu",
  "Save PNG": "Uložiť PNG",
  "HDRI: off": "HDRI: vyp.",
  "Outdoor day (2K)": "Vonkajší deň (2K)",
  "Sunset (1K)": "Západ slnka (1K)",
  "HDRI background": "HDRI pozadie",
  "No imported modules installed. Run `npm run import:modpkg -- \"<path-to.modpkg>\"` and reload the app.":
    "Nie sú nainštalované žiadne importované moduly. Spusti `npm run import:modpkg -- \"<path-to.modpkg>\"` a znovu načítaj appku.",
  "No modules imported": "Žiadne importované moduly",
  "Click a part…": "Klikni na diel…",
  "Hide selected": "Skryť vybrané",
  "Show selected": "Zobraziť vybrané",
  "Material override": "Prepis materiálu",
  "(no override)": "(bez prepisu)",
  Overlaps: "Kolízie",
  "show allowed": "zobraziť povolené",
  "No overlaps.": "Žiadne kolízie.",
  Highlight: "Zvýrazniť",
  Visible: "Viditeľné",
  Hidden: "Skryté",
  "Click a module…": "Klikni na modul…",
  "Commercial BOM & Costs": "Obchodný kusovník a náklady",
  "Copy Pricing JSON": "Kopírovať JSON cien",
  Copied: "Skopírované",
  Totals: "Súčty",
  Boards: "Dosky",
  "Edge Bands": "Hranovacie pásky",
  Hardware: "Kovanie",
  Labor: "Práca",
  "Final Cost": "Konečný náklad",
  "Inputs & Formulas": "Vstupy a vzorce",
  "Boards By Material": "Dosky podľa materiálu",
  Components: "Komponenty",
  Module: "Modul",
  Final: "Spolu",
  Material: "Materiál",
  "Catalog ID": "Katalógové ID",
  Group: "Skupina",
  "Net m2": "Čisté m2",
  "Priced m2": "Účtované m2",
  "Unit price": "Jedn. cena",
  Cost: "Cena",
  Component: "Komponent",
  Pieces: "Kusy",
  Field: "Pole",
  Value: "Hodnota",
  Currency: "Mena",
  "Board waste multiplier": "Koeficient odpadu dosiek",
  "Labor fixed per module": "Fixná práca na modul",
  "Formula / board priced quantity": "Vzorec / účtované množstvo dosiek",
  "Formula / item cost": "Vzorec / cena položky",
  "Formula / subtotal": "Vzorec / medzisúčet",
  "Formula / final": "Vzorec / konečná cena",
  "Item Breakdown": "Rozpis položiek",
  Item: "Položka",
  "Material / Component": "Materiál / Komponent",
  Thickness: "Hrúbka",
  ID: "ID",
  Qty: "Množstvo",
  "Priced Qty": "Účtované množstvo",
  "Item cost": "Cena položky",
  Formula: "Vzorec",
  "Display Name": "Zobrazovaný názov",
  Base: "Základ",
  Decor: "Dekor",
  Finish: "Povrch",
  Thicknesses: "Hrúbky",
  Unit: "Jednotka",
  Brand: "Značka",
  Series: "Séria",
  Variant: "Variant",
  Geometry: "Geometria",
  Materials: "Materiály",
  "Window": "Okno",
  Calibrate: "Kalibrovať",
  "Reset scale": "Resetovať mierku",
  Remove: "Odstrániť",
  "English": "English",
  "Slovak": "Slovenčina",
  Save: "Uložiť",
  "Save As…": "Uložiť ako…",
  Settings: "Nastavenia",
  Language: "Jazyk",
  "Export Layout JSON…": "Exportovať layout JSON…",
  "Export Scene JSON…": "Exportovať scene JSON…",
  "Export PNG Snapshot…": "Exportovať PNG náhľad…",
  "Copy JSON to Clipboard": "Kopírovať JSON do schránky",
  Drawer: "Zásuvková skrinka",
  Corner: "Rohová skrinka",
  General: "Všeobecné",
  Dimensions: "Rozmery",
  "Fronts & Doors": "Čelá a dvierka",
  Drawers: "Zásuvky",
  Placement: "Umiestnenie",
  Other: "Ostatné",
  Identity: "Identita",
  Assembly: "Zostava",
  Pricing: "Ocenenie",
  State: "Stav",
  Metadata: "Metadáta",
  "IFC Export": "IFC export",
  "Primary module identity and behavior parameters.": "Základné parametre identity a správania modulu.",
  "Overall sizing, spacing, thicknesses and clearances.": "Celkové rozmery, medzery, hrúbky a vôle.",
  "Material and finish parameters.": "Parametre materiálov a povrchov.",
  "Front, handle and opening-related parameters.": "Parametre čiel, úchytiek a otvárania.",
  "Drawer stack, boxes and runner-related parameters.": "Parametre stĺpca zásuviek, boxov a výsuvov.",
  "Scene placement and mounting parameters.": "Parametre umiestnenia a osadenia v scéne.",
  "Parameters that do not fit the main module groups.": "Parametre, ktoré nepatria do hlavných skupín modulu.",
  "Fixed identity metadata required for each exported module instance.":
    "Pevné identifikačné metadáta vyžadované pre každú exportovanú inštanciu modulu.",
  "Nominal module dimensions in millimeters.": "Nominálne rozmery modulu v milimetroch.",
  "Assembly context and kitchen-specific placement role for the module.":
    "Kontext zostavy a kuchynská rola umiestnenia pre modul.",
  "Scene placement metadata for the exported module instance.": "Metadáta umiestnenia v scéne pre exportovanú inštanciu modulu.",
  "Pricing overrides and commercial state used by downstream systems.":
    "Prepísania cien a obchodný stav používaný nadväznými systémami.",
  "Lifecycle and validation state flags for the module.": "Príznaky životného cyklu a validácie modulu.",
  "Human-facing metadata kept alongside the technical module export.":
    "Používateľské metadáta uchovávané spolu s technickým exportom modulu.",
  "IFC export defaults and BIM classification metadata.": "Predvolené IFC exportu a BIM klasifikačné metadáta.",
  "Part Parameters": "Parametre dielov",
  "Board material and thickness per slot. Thickness options follow the selected catalog material.":
    "Materiál dosky a hrúbka pre každý slot. Možnosti hrúbky sa riadia zvoleným katalógovým materiálom.",
  "System Parameters": "Systémové parametre",
  "Imported package snapshot. Locked fields are derived from the reference importer rules.":
    "Snapshot importovaného balíka. Zamknuté polia vychádzajú z pravidiel referenčného importéra.",
  "Imported module parameters.": "Parametre importovaného modulu.",
  "Imported system parameters.": "Importované systémové parametre.",
  System: "Systém",
  Locked: "Zamknuté",
  Enabled: "Zapnuté",
  Disabled: "Vypnuté",
  "Cabinet Panels": "Korpusové diely",
  Fronts: "Čelá",
  "Back Panels": "Zadné diely",
  "Drawer Box Panels": "Diely boxu zásuvky",
  "Drawer Box Bottoms": "Dná zásuviek",
  Shelves: "Police",
  "Board Parts": "Doskové diely",
  calculated: "vypočítaná",
  override: "prepis",
  manual: "ručná",
  catalog: "katalógová",
  kitchen: "kuchyňa",
  generic: "všeobecné",
  wardrobe: "šatník",
  bathroom: "kúpeľňa",
  laundry: "práčovňa",
  base: "spodný",
  wall: "horný",
  tall: "vysoký",
  "ALLOWED: ": "POVOLENÉ: ",
  "Copied.": "Skopírované.",
  "Copy failed (browser permission).": "Kopírovanie zlyhalo (oprávnenie prehliadača).",
  "Running Blender (up to 60s)â€¦": "Spúšťa sa Blender (max. 60 s)…",
  "Running Blender (up to 60s)…": "Spúšťa sa Blender (max. 60 s)…",
  "Blender export failed.": "Export z Blenderu zlyhal.",
  "Backend did not return previewUrl.": "Backend nevrátil previewUrl.",
  "Done. Copied JSON.": "Hotovo. JSON bol skopírovaný.",
  "Done. Copy failed.": "Hotovo. Kopírovanie zlyhalo."
};

const PARAM_LABELS_SK: Record<string, string> = {
  assemblyContext: "Kontext zostavy",
  autoFit: "Automatické prispôsobenie",
  backGrooveClearanceMm: "Vôľa drážky chrbta (mm)",
  backGrooveDepthMm: "Hĺbka drážky chrbta (mm)",
  backGrooveOffsetMm: "Odsadenie drážky chrbta (mm)",
  backGrooveWidthMm: "Šírka drážky chrbta (mm)",
  backThickness: "Hrúbka chrbta",
  boardThickness: "Hrúbka dosky",
  bottomGap: "Spodná medzera",
  clipComponentId: "ID klipu",
  depth: "Hĺbka",
  displayName: "Zobrazovaný názov",
  doorDouble: "Dvojité dvierka",
  doorOpen: "Otvorené dvierka",
  drawerBackReserveMm: "Rezerva zadnej steny zásuvky (mm)",
  drawerBoxSideHeight: "Výška boku zásuvkového boxu",
  drawerBoxThickness: "Hrúbka zásuvkového boxu",
  drawerCount: "Počet zásuviek",
  drawerFrontHeights: "Výšky čiel zásuviek",
  exportToIfc: "Exportovať do IFC",
  family: "Rodina",
  frontGap: "Predná medzera",
  frontStackPreset: "Predvoľba skladby čiel",
  frontThicknessMm: "Hrúbka čela (mm)",
  handleComponentId: "ID úchytky",
  handleLengthMm: "Dĺžka úchytky (mm)",
  handlePositionMm: "Pozícia úchytky (mm)",
  handleProjectionMm: "Vyčnievanie úchytky (mm)",
  handleSizeMm: "Veľkosť úchytky (mm)",
  handleType: "Typ úchytky",
  height: "Výška",
  heightCarcass: "Výška korpusu",
  heightMm: "Výška (mm)",
  hingeBottomOffsetMm: "Spodné odsadenie pántu (mm)",
  hingeComponentId: "ID pántu",
  hingeCountPerDoor: "Počet pántov na dvierka",
  hingeTopOffsetMm: "Horné odsadenie pántu (mm)",
  ifcClass: "IFC trieda",
  ifcDescription: "IFC popis",
  ifcName: "IFC názov",
  ifcObjectType: "IFC typ objektu",
  ifcPredefinedType: "IFC preddefinovaný typ",
  ifcTag: "IFC tag",
  isActive: "Aktívny",
  isLocked: "Uzamknutý",
  isValid: "Platný",
  isVisible: "Viditeľný",
  kitchenModuleRole: "Rola kuchynského modulu",
  legComponentId: "ID nožičky",
  legDiameterMm: "Priemer nožičky (mm)",
  legInsetMm: "Odsadenie nožičky (mm)",
  lengthX: "Dĺžka X",
  lengthZ: "Dĺžka Z",
  materials: "Materiály",
  notes: "Poznámky",
  plinthHeight: "Výška sokla",
  plinthSetbackMm: "Odsadenie sokla (mm)",
  positionXmm: "Pozícia X (mm)",
  positionYmm: "Pozícia Y (mm)",
  positionZmm: "Pozícia Z (mm)",
  priceSource: "Zdroj ceny",
  pricingEnabled: "Ocenenie zapnuté",
  quantity: "Množstvo",
  requiresWorktop: "Vyžaduje pracovnú dosku",
  rotationZDeg: "Rotácia Z (°)",
  shelfAutoFit: "Automatické prispôsobenie políc",
  shelfCount: "Počet políc",
  shelfGaps: "Medzery medzi policami",
  sideClearanceMm: "Bočná vôľa (mm)",
  sideGap: "Bočná medzera",
  tags: "Tagy",
  topFrontHeightMm: "Výška horného čela (mm)",
  topGap: "Horná medzera",
  type: "Typ",
  typeId: "ID typu",
  updatedAt: "Aktualizované",
  validationErrors: "Chyby validácie",
  variant: "Variant",
  version: "Verzia",
  width: "Šírka",
  widthMm: "Šírka (mm)",
  worktopThicknessMm: "Hrúbka pracovnej dosky (mm)",
  code: "Kód",
  createdAt: "Vytvorené",
  classificationCode: "Klasifikačný kód",
  classificationSystem: "Klasifikačný systém",
  costOverride: "Prepis nákladov",
  customPriceOverride: "Prepis predajnej ceny",
  depthMm: "Hĺbka (mm)"
};

const SYSTEM_DESCRIPTION_SK: Record<string, string> = {
  "Stable identifier of the module type used across exports and downstream mappings.":
    "Stabilný identifikátor typu modulu používaný naprieč exportmi a nadväznými mapovaniami.",
  "Technical module type.": "Technický typ modulu.",
  "Human-readable module name.": "Čitateľný názov modulu.",
  "Higher-level module family.": "Nadradená rodina modulu.",
  "Internal or catalog code.": "Interný alebo katalógový kód.",
  "Concrete module variant.": "Konkrétny variant modulu.",
  "Module data-model/export version.": "Verzia dátového modelu/exportu modulu.",
  "Nominal width in mm.": "Nominálna šírka v mm.",
  "Nominal height in mm.": "Nominálna výška v mm.",
  "Nominal depth in mm.": "Nominálna hĺbka v mm.",
  "Top-level assembly/domain this module belongs to.": "Vrcholová zostava/doména, do ktorej modul patrí.",
  "Kitchen role used when assemblyContext is kitchen.": "Kuchynská rola použitá, keď je assemblyContext kitchen.",
  "Whether the module should receive a worktop board in kitchen composition flows.":
    "Či má modul dostať pracovnú dosku v kuchynských skladbách.",
  "X position in mm.": "Pozícia X v mm.",
  "Y position in mm.": "Pozícia Y v mm.",
  "Z position in mm.": "Pozícia Z v mm.",
  "Rotation around Z in degrees.": "Rotácia okolo osi Z v stupňoch.",
  "Sales price override.": "Prepis predajnej ceny.",
  "Pricing enabled flag.": "Príznak zapnutého ocenenia.",
  "Final price source.": "Zdroj výslednej ceny.",
  "Internal cost override.": "Prepis interných nákladov.",
  "Quantity.": "Množstvo.",
  "Active state.": "Aktívny stav.",
  "Visibility state.": "Stav viditeľnosti.",
  "Lock state.": "Stav uzamknutia.",
  "Validation state.": "Stav validácie.",
  "Validation errors/warnings.": "Chyby/varovania validácie.",
  "Internal note.": "Interná poznámka.",
  "Module tags.": "Tagy modulu.",
  "Creation timestamp.": "Čas vytvorenia.",
  "Update timestamp.": "Čas poslednej úpravy.",
  "IFC export flag.": "Príznak IFC exportu.",
  "IFC class.": "IFC trieda.",
  "IFC predefined type.": "IFC preddefinovaný typ.",
  "IFC name.": "IFC názov.",
  "IFC description.": "IFC popis.",
  "IFC object type.": "IFC typ objektu.",
  "IFC tag.": "IFC tag.",
  "Classification code.": "Klasifikačný kód.",
  "Classification system.": "Klasifikačný systém."
};

function normalizeLanguage(value: string | null | undefined): AppLanguage {
  return value === "sk" ? "sk" : "en";
}

export function getCurrentLanguage(): AppLanguage {
  try {
    return normalizeLanguage(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return "en";
  }
}

export function setCurrentLanguage(language: AppLanguage): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, language);
  } catch {
    // ignore
  }
  document.documentElement.lang = language;
}

export function initDomI18n(root: ParentNode = document.body): void {
  const language = getCurrentLanguage();
  document.documentElement.lang = language;
  if (language !== "sk") return;

  const translateNode = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = node.nodeValue ?? "";
      const next = translatePreservingWhitespace(text);
      if (next !== text) node.nodeValue = next;
      return;
    }

    if (!(node instanceof HTMLElement)) return;
    if (node.closest("[data-i18n-skip]")) return;
    if (node instanceof HTMLTextAreaElement) return;

    translateAttribute(node, "title");
    translateAttribute(node, "aria-label");
    translateAttribute(node, "placeholder");

    if (
      node instanceof HTMLInputElement &&
      (node.type === "button" || node.type === "submit" || node.type === "reset") &&
      node.value.trim()
    ) {
      node.value = translateText(node.value);
    }

    for (const child of Array.from(node.childNodes)) {
      translateNode(child);
    }
  };

  translateNode(root as Node);

  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === "characterData") {
        translateNode(record.target);
        continue;
      }
      if (record.type === "attributes" && record.target instanceof HTMLElement) {
        translateNode(record.target);
        continue;
      }
      for (const added of Array.from(record.addedNodes)) {
        translateNode(added);
      }
    }
  });

  observer.observe(root, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["title", "aria-label", "placeholder", "value"]
  });
}

function translateAttribute(node: HTMLElement, attribute: "title" | "aria-label" | "placeholder") {
  const current = node.getAttribute(attribute);
  if (!current) return;
  const next = translateText(current);
  if (next !== current) node.setAttribute(attribute, next);
}

function translatePreservingWhitespace(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return text;
  const translated = translateText(trimmed);
  if (translated === trimmed) return text;
  const start = text.indexOf(trimmed);
  if (start < 0) return translated;
  return `${text.slice(0, start)}${translated}${text.slice(start + trimmed.length)}`;
}

export function t(text: string): string {
  return getCurrentLanguage() === "sk" ? translateText(text) : text;
}

export function translateParamLabel(key: string): string {
  if (getCurrentLanguage() !== "sk") return fallbackFormatKeyLabel(key);
  return PARAM_LABELS_SK[key] ?? fallbackFormatKeyLabel(key);
}

export function translateParamDescription(description: string): string {
  if (getCurrentLanguage() !== "sk") return description;
  const exact = EXACT_SK_TEXT[description] ?? SYSTEM_DESCRIPTION_SK[description];
  if (exact) return exact;
  const exportedMatch = description.match(/^Exported parameter (.+)\.$/);
  if (exportedMatch) {
    return `Exportovaný parameter ${translatePhraseKey(exportedMatch[1] ?? "")}.`;
  }
  return translateText(description);
}

export function translateEnumLabel(value: string): string {
  if (getCurrentLanguage() !== "sk") return value;
  return EXACT_SK_TEXT[value] ?? value;
}

function translatePhraseKey(value: string): string {
  const normalized = value.trim().replace(/\s+mm$/i, "Mm");
  const camel = normalized.replace(/\s+([a-z])/gi, (_, chr: string) => chr.toUpperCase());
  return PARAM_LABELS_SK[camel] ?? value;
}

function fallbackFormatKeyLabel(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (char) => char.toUpperCase());
}

export function translateText(text: string): string {
  if (getCurrentLanguage() !== "sk" || !text) return text;

  const exact = EXACT_SK_TEXT[text] ?? SYSTEM_DESCRIPTION_SK[text];
  if (exact) return exact;

  const prefixMap: Array<[RegExp, string]> = [
    [/^View:\s*/, "Pohľad: "],
    [/^Walls:\s*/, "Steny: "],
    [/^Modules:\s*/, "Moduly: "],
    [/^Worktops:\s*/, "Pracovné dosky: "],
    [/^Sections:\s*/, "Rezy: "],
    [/^Type:\s*/, "Typ: "],
    [/^Length:\s*/, "Dĺžka: "],
    [/^Direction:\s*/, "Smer: "],
    [/^Cut line:\s*/, "Rezná línia: "],
    [/^Position:\s*/, "Pozícia: "],
    [/^Boundary lines:\s*/, "Hraničné čiary: "],
    [/^Reference:\s*/, "Referencia: "],
    [/^Target:\s*/, "Cieľ: "],
    [/^Step:\s*/, "Krok: "],
    [/^Samples:\s*/, "Vzorky: "],
    [/^Underlay:\s*/, "Podklad: "],
    [/^Normal:\s*/, "Normála: "],
    [/^Measure:\s*/, "Meranie: "],
    [/^Hover \(/, "Náhľad ("],
    [/^Measure 3D \(/, "Meranie 3D ("],
    [/^Measure 3D hover \(/, "3D náhľad ("],
    [/^Measuring \(/, "Meranie ("],
    [/^First point \(/, "Prvý bod ("]
  ];

  for (const [pattern, replacement] of prefixMap) {
    if (pattern.test(text)) {
      return text
        .replace(pattern, replacement)
        .replace(/\bwall\(s\)\b/g, "stena/y")
        .replace(/\bmodule\(s\)\b/g, "modul/y")
        .replace(/\bFloorplan\b/g, "Pôdorys")
        .replace(/\bElevation\b/g, "Pohľad")
        .replace(/\bDefault\b/g, "Predvolené")
        .replace(/\bMirrored\b/g, "Zrkadlovo")
        .replace(/\bON\b/g, "Zap")
        .replace(/\bOFF\b/g, "Vyp")
        .replace(/\bloaded\b/g, "načítaný")
        .replace(/\bclick first point\b/gi, "klikni prvý bod")
        .replace(/\bpick second point\b/gi, "vyber druhý bod");
    }
  }

  const moduleSystemSummary = text.match(/^Module (.+) exposes (\d+) system parameter\(s\)\.$/);
  if (moduleSystemSummary) {
    return `Modul ${moduleSystemSummary[1]} obsahuje ${moduleSystemSummary[2]} systémových parametrov.`;
  }

  if (text.includes(" â€” ")) {
    return translateText(text.replaceAll(" â€” ", " — "));
  }

  return text
    .replace(/\bON\b/g, "Zap")
    .replace(/\bOFF\b/g, "Vyp")
    .replace(/\bFloorplan\b/g, "Pôdorys")
    .replace(/\bDefault\b/g, "Predvolené")
    .replace(/\bMirrored\b/g, "Zrkadlovo")
    .replace(/\bCopied JSON\b/g, "JSON bol skopírovaný");
}
