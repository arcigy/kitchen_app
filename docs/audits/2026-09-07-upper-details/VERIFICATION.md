# Overenie opráv — 8. 9. 2026

Dodávacia vetva: `codex/fix-upper-module-details`. Základ: develop `26dece28`, obsahujúci samostatnú opravu katalógu [PR 140](https://github.com/arcigy/kitchen_app/pull/140).

## Finálne výsledky

- Plná povinná sada: **2422 úspešných, 0 zlyhaných, 1 existujúci vynechaný test**.
- Typová kontrola, lint a produkčný build prešli. Zostávajú existujúce upozornenia na veľkosť balíka a import i18n.
- Všetkých **14 UI kontrol** prešlo na izolovanom súborovom úložisku. Nová kontrola má **18 úspešných scenárov** a **0 chýb konzoly/stránky**.
- UI zahŕňa skutočné kliknutie na kótu a zadanie 0, Späť/Znova, tri rohové varianty, Escape pred náhľadom, niku a opakované prepnutie pôdorys/3D. Existujúce kontroly overujú ceny, materiály, export/import a obnovu projektu.
- Regresie prvého snapshotu a súvisiace projektové kontroly: 20 úspešných testov. Výber modulu neukladá ani nepotvrdzuje rozpracovanú kuchyňu.
- Graphify bol aktualizovaný. Jeho chýbajúci SQL parser a čiastočné parsovanie dvoch testových súborov nepredstavujú chybu typovej kontroly aplikácie.

## Testy pred implementáciou a odstránené blokovanie

Pôvodné regresie reprodukovali 40 zlyhaní, potom 24 odmietnutí skutočných rohových katalógových balíkov a dva prípady priečky/nestabilnej klikateľnej kóty. Následná oprava katalógu odstránila štyri serverové zlyhania potvrdené aj na nezmenenom develope. Jej vlastné testy najprv reprodukovali zbytočné kopírovanie, duplicitné čítanie balíkov, súbežné vytváranie a neúplný JSON.

Po odstránení prípravného načítania katalógu zachytil UI test ďalší prípad: materiály a marže nového projektu vracali 404, pretože prvý snapshot ešte neexistoval. Dva regresné testy najprv zlyhali; oprava eviduje existenciu snapshotu a odložený panel obnoví po uložení. Staršie uloženia bez revízie ostávajú podporované. Chyby konzoly sa nefiltrujú a časové limity sa nezvyšovali.

## Rozsah a opakovanie

Ručný postup je v [README.md](README.md) a zázname 631 v `MANUAL_TEST_LOG.csv`. Hlavní vlastníci: `upperWallPlacement.ts`, `kitchenPlacementController.ts`, `keyboardInputHandlers.ts`, `fwmFurniture/geometry.ts`, `planSnap.ts`, `kitchenRunDimensionOverlay.ts`, `projectActions.ts` a `moduleCommercialPropsController.ts`.

Lokálne surové výsledky: `.tmp/release-full-tests.json`, `.tmp/first-snapshot-red.json`, `.tmp/first-snapshot-green.json` a v tomto priečinku `DETAILS-UI.json`, `UI-REGRESSION.json` a pôvodné `RED*.json`. Generované reporty a snímky nie sú súčasťou publikovaného kódu. Pôdorys bol vizuálne skontrolovaný; poloha rohov v 3D sa overuje zo skutočnej geometrie, nie zo zle vycentrovanej detailnej snímky kamery.

Publikovanie prebieha cez chránený PR do developu. Stav CI, merge a nasadenia je na GitHube. Bez zmien produkcie, hesiel alebo tenantových dát.
