# Rozšírené nastavenia modulu

Pri jednom vybranom module otvorí tlačidlo **Rozšírené nastavenia** samostatné
okno s náhľadom a používateľskými parametrami. Kamera náhľadu a kóty sú iba
dočasné. Projekt v pozadí sa počas úprav nemení.

## Uloženie a presety

- **Uložiť** potvrdí celú pracovnú kópiu do otvoreného projektu ako jeden krok
  histórie. Okno zostane otvorené s novým uloženým stavom.
- **Uložiť a zavrieť** zatvorí okno až po úspešnom potvrdení modulu.
- **Zrušiť** pri zmenách ponúkne uloženie, zahodenie alebo pokračovanie.
  Kliknutie mimo okna ho nezatvorí.
- Ctrl/Cmd+Z a opakovanie počas úprav používajú iba históriu pracovnej kópie.
  Enter pri kóte potvrdí rozmer, Escape zruší rozpracované zadanie.
- Nový pomenovaný preset sa ukladá samostatne do katalógu aktuálnej firmy cez
  existujúci `POST /api/modules/:id/parameter-presets`. Zostane dostupný aj po
  zahodení modulu. Rozmery a materiály cieľa zachovávajú existujúce pravidlá.
- Potvrdenie modulu nenahrádza uloženie projektu. Projekt a FQP používajú
  doterajší postup, bez nového formátu alebo databázovej migrácie.

## Vlastníctvo a geometria

Vstup vlastní `src/app/selectedPropsPanels.ts`. Samostatný
`moduleSettingsController.ts` prepája ovládacie prvky, pracovnú kópiu,
náhľad a potvrdenie. `app.ts` sa nemení.

`moduleSettingsSession.ts` vlastní izolované hodnoty, lokálne undo/redo a
uložený stav. `moduleSettingsCommit.ts` používa existujúci rebuild s kontrolami
umiestnenia, susedov a pracovných dosiek. Odmietnuté uloženie obnoví parametre
aj dotknuté objekty scény bez kroku histórie.

Náhľad používa `createResolvedModuleControls` a
`buildModulePackageGeometryFromPackage` s balíkom a katalógom vybraného modulu.
Vlastné kópie geometrie a materiálov likviduje `moduleSettingsResources.ts`;
zdieľané textúry hlavnej scény nelikviduje.

`src/modules/runtime/parameterDimensions.ts` poskytuje typované väzby
parametrov na miestne 3D body. Rodinné poskytovatele dopĺňajú konštrukčné
referencie FWM a prenosných skriniek. Importovaný builder môže publikovať
`root.userData.parameterDimensions` s rovnakým kontraktom.

Každá väzba má stabilné ID, kľúč parametra, dva body v metroch, smer odsadenia
a prípadný prevod fyzického rozmeru na závislý parameter. Kóty sa merajú medzi
3D bodmi, nikdy z obrazovky. Napríklad predné a zadné skosenie rohu merajú
osový úsek; výšky zásuvkových čiel používajú inverzný prevod existujúceho
proporcionálneho delenia. Výška zostavy môže obsahovať explicitnú referenčnú
rovinu pracovnej dosky, hoci samotná doska nepatrí do geometrie modulu.

Bez jednoznačnej väzby ostáva parameter vo formulári. To platí aj pre staršie
balíky: chýbajúca kóta nebráni otvoreniu ani editovaniu. Interné parametre a
identifikačné kľúče nie sú ovládacími prvkami rozšíreného okna.

`moduleSettingsViewport.ts` premieta kotvy pri otáčaní a zoome a rozmiestňuje
editovateľné popisy. Čiary a zakončenia zdieľajú definíciu s
`dimensionOverlay.ts`; existujúce 2D kóty nemenia správanie.

## Overenie

Jednotkové testy pokrývajú izoláciu, históriu, odmietnuté uloženie, obnovenie
susedov a scény, presetové referencie, likvidáciu zdrojov, rovné aj rohové
skrinky, zrkadlené varianty, zásuvkové delenie a vysoké sekcie.

`scripts/testModuleSettingsUi.mjs` beží iba proti izolovanému localhostu so
súborovým úložiskom. Je súčasťou `npm run test:module-properties`, a tým aj
celej `npm run test:ui-regression`. Overuje oba vstupy, presety, manuálne
uloženie, zahodenie, neplatné hodnoty, oba druhy histórie, samostatný preset,
otáčanie/zoom, menšie okno, opakované otvorenie a obnovu projektu.

Manuálne: v upravovanej kuchyni vyberte jednu skrinku, otvorte rozšírené
nastavenia a porovnajte klikateľné kóty s formulárom. Vyskúšajte najmä rohové
skosenie, vysoké sekcie a zásuvky. Zmenu najprv zahoďte, potom ju uložte a
overte projektové Späť/Znova, opätovné otvorenie projektu a prenos FQP.
