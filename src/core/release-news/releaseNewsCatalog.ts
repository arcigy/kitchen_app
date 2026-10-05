import type { ReleaseNotice } from "./releaseNewsTypes";

// Keep this immutable ID stable: acknowledgements are keyed by it across devices.
export const RELEASE_NOTICES: readonly ReleaseNotice[] = [
  {
    id: "2026-10-presets-and-commercial-overview",
    date: "2026-10-05",
    title: { sk: "Uložené presety a prehľadnejšie marže", cs: "Uložené presety a přehlednější marže", en: "Saved presets and clearer margins" },
    summary: {
      sk: "Presety zostávajú zachované pri obnove modulov. V maržiach nájdete viac informácií na jednej obrazovke.",
      cs: "Presety zůstávají zachované při obnově modulů. V maržích najdete více informací na jedné obrazovce.",
      en: "Presets are retained when modules are refreshed. Margins show more information on one screen."
    },
    changes: [
      {
        sk: "Import alebo obnova modulového balíka zachová uložené presety, ich nastavenia a sadzby práce. Pri nekompatibilnej zmene aplikácia odmietne prepísanie.",
        cs: "Import nebo obnova modulového balíku zachová uložené presety, jejich nastavení a sazby práce. Při nekompatibilní změně aplikace odmítne přepsání.",
        en: "Importing or refreshing a module package retains saved presets, their settings, and labor rates. Incompatible changes are rejected."
      },
      {
        sk: "Opakovanie neúspešného uloženia po výpadku siete nevytvorí druhý preset. Súbežná zmena iného používateľa sa zobrazí ako konflikt.",
        cs: "Opakování neúspěšného uložení po výpadku sítě nevytvoří druhý preset. Souběžná změna jiného uživatele se zobrazí jako konflikt.",
        en: "Retrying a preset save after a network interruption does not create a duplicate. Concurrent edits are reported as conflicts."
      },
      {
        sk: "Marže majú kompaktné karty s nákladmi, maržou a predajnou cenou. Vyhľadávanie a filtre pomôžu nájsť konkrétnu skrinku, dielec alebo položku bez ceny.",
        cs: "Marže mají kompaktní karty s náklady, marží a prodejní cenou. Vyhledávání a filtry pomohou najít konkrétní skříňku, dílec nebo položku bez ceny.",
        en: "Compact margin cards show costs, margin, and selling price. Search and filters help find a cabinet, part, or unpriced item."
      },
      {
        sk: "Materiály sa sprístupnia počas výpočtu prerezov. Z čakajúceho načítavania možno odísť; pri chybe je dostupné Skúsiť znova.",
        cs: "Materiály se zpřístupní během výpočtu prořezů. Z čekajícího načítání lze odejít; při chybě je dostupné Zkusit znovu.",
        en: "Materials become available while waste is calculated. You can leave a pending load, and retry after an error."
      }
    ],
    tryIt: [
      {
        sk: "V testovacom projekte uložte preset, obnovte stránku a overte jeho nastavenia. Rozmery a materiály cieľovej skrinky zostávajú samostatné.",
        cs: "V testovacím projektu uložte preset, obnovte stránku a ověřte jeho nastavení. Rozměry a materiály cílové skříňky zůstávají samostatné.",
        en: "Save a preset in a test project, reload, and check its settings. Target cabinet dimensions and materials remain independent."
      },
      {
        sk: "Otvorte Marže, vyhľadajte názov skrinky a vyskúšajte filter Bez ceny. Projektové sadzby otvoríte cez Upraviť.",
        cs: "Otevřete Marže, vyhledejte název skříňky a vyzkoušejte filtr Bez ceny. Projektové sazby otevřete přes Upravit.",
        en: "Open Margins, search for a cabinet, and try the Unpriced filter. Use Edit to open project rates."
      }
    ]
  },
  {
    id: "2026-09-kitchen-pricing-and-production",
    date: "2026-09-30",
    title: {
      sk: "Presnejšia výroba a ceny",
      cs: "Přesnější výroba a ceny",
      en: "More accurate production and pricing"
    },
    summary: {
      sk: "Spresnili sme kusovník, nákup materiálu a spôsob započítania práce.",
      cs: "Zpřesnili jsme kusovník, nákup materiálu a způsob započítání práce.",
      en: "We improved the bill of materials, material purchasing, and labor pricing."
    },
    changes: [
      {
        sk: "Kusovník presnejšie počíta olepené hrany, pracovné dosky, zásteny a sokle.",
        cs: "Kusovník přesněji počítá olepené hrany, pracovní desky, zástěny a sokly.",
        en: "The bill of materials more accurately counts edged parts, worktops, backsplashes, and plinths."
      },
      {
        sk: "Nákupný formát dosky sa pri účtovaní celej alebo polovice dosky nezvyšuje o percentuálny prerez druhýkrát.",
        cs: "Nákupní formát desky se při účtování celé nebo poloviny desky nezvyšuje o procentuální prořez podruhé.",
        en: "Whole- or half-sheet purchasing is no longer charged with percentage waste a second time."
      },
      {
        sk: "Práca za modul a projektová práca majú samostatné, zrozumiteľné započítanie v cene.",
        cs: "Práce za modul a projektová práce mají samostatné a srozumitelné započítání v ceně.",
        en: "Module labor and project labor are accounted for separately and clearly in pricing."
      }
    ],
    tryIt: [
      {
        sk: "Otvorte testovací projekt alebo vytvorte nový; existujúcu cenovú ponuku nemeňte.",
        cs: "Otevřete testovací projekt nebo vytvořte nový; existující cenovou nabídku neměňte.",
        en: "Open a test project or create a new one; do not change an existing customer quote."
      },
      {
        sk: "V Materiáloch vyberte pracovnú dosku s nákupným formátom a porovnajte cenu pred a po opakovanom prepočte.",
        cs: "V Materiálech vyberte pracovní desku s nákupním formátem a porovnejte cenu před a po opakovaném přepočtu.",
        en: "In Materials, select a worktop with a purchase format and compare its price before and after recalculation."
      },
      {
        sk: "V testovacom projekte upravte prácu za modul; skontrolujte súčet aj rozpis marže.",
        cs: "V testovacím projektu upravte práci za modul; zkontrolujte součet i rozpis marže.",
        en: "In the test project, change module labor and check both the total and margin breakdown."
      }
    ]
  }
];

export function findReleaseNotice(id: string): ReleaseNotice | undefined {
  return RELEASE_NOTICES.find((notice) => notice.id === id);
}
