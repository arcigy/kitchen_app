import type { ReleaseNotice } from "./releaseNewsTypes";

// Keep this immutable ID stable: acknowledgements are keyed by it across devices.
export const RELEASE_NOTICES: readonly ReleaseNotice[] = [
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
