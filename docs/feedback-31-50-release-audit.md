# Audit reportov #31–#50 a kandidáta vydania

Stav k 30. 9. 2026. Kontrolované boli aktuálne Odoo záznamy a projektový kód.
Prílohy obsahujú neúplný historický kontext: pôvodná verzia aplikácie ani celý
historický katalóg cien nie sú k dispozícii. Preto sa dnešná implementácia
neprezentuje ako presná reprodukcia historickej ponuky.

| Report | Aktuálny záznam a implementácia | Overenie a hranice |
| --- | --- | --- |
| #31 – malé až nečitelné fonty | Odoo je `working`; pôvodné nastavenie veľkosti UI už bolo v develop cez PR #171. Prázdne ikonové tlačidlá rieši spoločný inline SVG sprite z PR #172. Kandidát pridáva cestu k nastaveniu aj z domovského menu účtu a ikonu pre novinky. | `npm run test:action-icons`, `test:release-news-ui`, `uiScaleController` a účet UI testy. Historická snímka je pri DPR 0,667; stará verzia nie je známa. Zostáva overiť po merge/deploy, nie iba lokálne. |
| #32 – automatické počítanie hrán | Odoo `implemented`; oprava je už v develop cez PR #171. Množstvo hrán je odvodené z výrobných dielcov a zmena rozmeru ho prepočíta; chýbajúci materiál ponechá cenu neúplnú. | Základné regresie sú v baseline develop. Znovu sa preveruje celou `npm test` a UI regresiou tejto vetvy. |
| #33 – práca modulu | Odoo `implemented`; baseline develop už podporuje prioritu sadzby skrinka → preset → typ modulu, nulu a neúplnú cenu. | Nadväzujúce snapshoty a zdieľané výpočty overujú testy #50 a celá sada `npm test`; presný výsledok tejto finálnej sady bude zaznamenaný nižšie po dokončení. |
| #34 – montáž modulu | Odoo `implemented`; predmontáž je samostatná fixná práca bez ďalšej marže v kandidátovom výpočte a exporte. | `projectMargins.test.ts`, `projectManufacturingPricing.test.ts`, `test:feedback-50-ui`; staré projekty si ponechávajú historické ceny. |
| #35 – ďalšie materiály | Odoo `implemented`; vlastné dielce, väzby na skrinku, orientácia, presahy, duplikovanie a odpojenie sú súčasťou kandidáta. | `customFurnitureGeometry.test.ts`, save/load a plný roundtrip; úplný historický katalóg chýba. |
| #36 – združené materiály | Odoo `implemented`; receptúry vrstiev a operácií, výsledná hrúbka a cenové snapshoty. | Modulové, projektové a uložené snapshot regresie v `project-save`, module-package a manufacturing testoch. |
| #37 – lakované materiály | Odoo `implemented`; výsledný povrch sa účtuje ako jeden materiál bez zdvojenia vrstiev v zákazníckej ponuke. | Cenové a exportné testy v celej sade; presná historická skladba/katalóg chýba. |
| #38 – Test upozornení Arcigy podpory | Aktuálny Odoo stav `new`; je to technický test služby podpory, nie produktová chyba. | Zámerne bez produktovej zmeny a bez zmeny stavu reportu. |
| #39 – počty metrov korpusu a dvierok | Odoo `implemented`; skutočné výrobné dielce a jednotlivé hrany nahrádzajú spoločný odhad. Editor skupín zachováva materiálové väzby a atomické undo/recovery. | Edge-banding/mat. quantity testy, `test:feedback-42-49-ui`; report `docs/edge-banding-and-pricing-2026-09-23.md`. Historický katalóg chýba, preto sa potvrdzuje množstvo, nie historická cena. |
| #40 – cena pracovnej dosky | Odoo `implemented`; opravené čítanie tisícových oddeľovačov a nákup po 0,5/1 formáte. Záznam 2 099 Kč pri 4100×635 mm a diel 1850 mm dáva 0,5 formátu a 1 049,50 Kč. | `supplierMaterialPricingRepair.test.ts`, `worktopPurchase.ts`, geometrické a UI testy. Každý beh sa účtuje samostatne; odrezok sa neprenáša na ďalší beh; presah formátu zostáva chyba. |
| #41 – cena sokla | Odoo `implemented`; doskový sokel sa oceňuje v m², lineárny profil v bm. Zaznamenaná doska 1115,88 Kč pri 2800×2070 mm dáva pri 600×100 mm základ približne 11,55 Kč. | `supplierMaterialPricingRepair.test.ts`, materiálové a BOM regresie. Cenová oprava používa uložené dodávateľské pozorovanie; chýbajúce údaje sa nedopĺňajú odhadom. |
| #42 – zástena | Odoo `implemented`; automatická zástena, skupiny dielcov, ručné výnimky, výrezy a spoločný rezný/nákupný rozpis. | `backsplashCutLayout.test.ts`, `backsplashPurchase.test.ts`, `test:feedback-42-49-ui`; heuristika rezu nie je dôkazom absolútneho minima. |
| #43 – meniť cenu a počet kusov | Odoo `implemented`; projektové množstvá, jednotkové ceny a reset bez prepísania firemného katalógu; násobenie podľa počtu skriniek. | `project-component-operations.test.ts`, `projectAssignedPricing` testy, UI + FQP/roundtrip regresie. |
| #44 – spojovací materiál | Odoo `implemented`; samostatný montážny balíček, predvolene jeden na skrinku; neurčité staré priradenie sa nekopíruje do novej kategórie. | FWM manufacturing/BOM, project component, save/load a #42–49 UI testy. Cena balíčka sa vyžaduje od firemného katalógu. |
| #45 – doplnkové komponenty | Odoo `implemented`; samostatné podložky, soklové klipy, podpery, závesy a balíček; podložky 1:1 s príslušným kovaním, vlastné množstvo má prednosť. | `legLayout.test.ts`, FWM `manufacturingMath`/`edgeBanding`, cenový kontrakt. Kandidát dopĺňa chýbajúce systémové identity aj do starého klientského katalógu, ale nepridáva ceny; bez firemnej ceny stav zostáva neúplný. |
| #46 – závesné kovanie horných skriniek | Odoo `implemented`; samostatná voľba a nastaviteľný počet, predvolene dva na skrinku. | FWM výpočtové/UI regresie, #42–49 UI scenár; bez dodávateľskej ceny sa nič neodhadne. |
| #47 – ostatné komponenty | Odoo `implemented`; počet a pozície nôh, klipy a samostatné komponenty sa zhodujú s geometriou a BOM. | `legLayout.test.ts`, `manufacturingMath.test.ts`, #42–49 UI scenár a project-save roundtrip. |
| #48 – cena/marža výsuvov | Odoo `implemented`; cenu určuje presný projektový variant a jeho snapshot aj po zmene katalógu. | reportované 3×859,54 Kč = 2 578,62 Kč; pri 150 % prirážke predaj 6 446,55 Kč. `test:feedback-50-ui`, priradenia a exportné testy. Historické priradenie 264 mm nemožno kompletne obnoviť; dnešná geometria sa nemaskuje za historickú. |
| #49 – marža na m² pri upozorneniach | Odoo `implemented`; metrika zostáva viditeľná ako priebežná hodnota, pri nulovej/neplatnej ploche sa nedelí nulou a upozornenia zostávajú. | `projectMargins.test.ts`, `marginsPhasePanel.test.ts`, UI materiálové testy; hranica je doska ≥16 mm. |
| #50 – práca | Odoo `implemented`; práca sa oddeľuje od nákupných nákladov, sadzby presetov sú snapshotované a zmena katalógu nepreceňuje existujúce skrinky. | 1000 nákup + 500 prirážka + 200 práca = predaj 1700, príspevok 700; `projectMargins.test.ts`, `projectManufacturingPricing.test.ts`, preset/API/FQP/UI a exportné testy. PostgreSQL repo aj migrácia sa skúšajú v jednorazovom backup/restore cvičení. |

## Vydanie noviniek

Prvé oznámenie má stabilné ID `2026-09-kitchen-pricing-and-production`. Obsahuje
iba všeobecné zmeny cenového a výrobného správania, bez zákazníckych údajov alebo
ID reportov. Server uchováva potvrdenie pod `(client_id, user_id, notice_id)`;
opakované potvrdenie je idempotentné. Domovská obrazovka aj pracovný priestor
zdieľajú menu účtu, ktoré ponúka témy, nastavenia veľkosti UI, novinky a odhlásenie.

## Výsledok integračných kontrol

Lokálny kandidát z `origin/develop` prešiel finálnymi kontrolami:

- `npm run typecheck`, `npm test -- --maxWorkers=2`, `npm run build`,
  `npm run test:pricing-contract` a `npm run security:dependencies`.
- Unit suite: 434 súborov, 2 897 úspešných testov, 1 existujúci preskočený test
  po obmedzení paralelizmu na dva workery. Neobmedzený beh na lokálnom Macu
  zaznamenal 5-sekundové timeouty pri záťaži; žiadne nesprávne výsledky.
- `npm run test:ui-regression` na syntetickom používateľovi a file storage:
  úspešné novinky na domovskej obrazovke aj v pracovnom priestore, potvrdenie a
  opätovné otvorenie archívu, mobil/klávesnica, SK/CZ/EN, UI témy, projekty,
  cenové scenáre, save/load, FQP, obnova draftu a reporty #42–#50. V sledovaných
  UI scenároch bolo 0 chýb konzoly.
- `ARCIGY_RESTORE_DRILL_ISOLATED=true npm run test:db-restore-drill`: úspešná
  PostgreSQL 16 migrácia aj obnova, 7 migrácií, 30 tabuliek, 37 syntetických
  riadkov a overená tenant izolácia potvrdení noviniek.
- PR #175, #176 a #177 sú v `develop`. Presné SHA `5e353acb` prešlo `verify`
  a `CodeQL`; jeho development image `:144` obsahuje porovnané zdrojové súbory
  noviniek, cenových výpočtov a migrácie. Development po aplikovaní migrácie
  `dev.0007` vracia HTTP 200 na `/health` aj `/ready` s PostgreSQL storage.
- Na izolovanom development účte prešlo prvé zobrazenie noviniek, potvrdenie,
  potlačenie automatického zobrazenia na druhom zariadení, manuálne otvorenie
  archívu, mobilná šírka a nula chýb konzoly. Ceny 100 → 130 → 260, nákupné
  formáty dosiek a ostatné regresie prešli v jednotkových a lokálnych UI testoch.
- Pred rotáciou poverení sa vytvorila šifrovaná off-host záloha celej databázy,
  konfigurácií aplikácií a produkčného storage. Obnova celej databázy bola
  overená v izolovanom PostgreSQL 16. Migrácia `prod.0007` bola nanečisto
  aplikovaná dvakrát; existujúce riadky zostali zachované. Produkčná schéma
  zatiaľ zostáva na `0006`.

Produkčné vydanie ešte nie je dokázané: čaká na finálny development deploy
presného kandidáta, release PR do `main`, povinné CI/review, migráciu produkčnej
schémy a smoke test na `app.arcigy.com`. Report #31 zostáva `working` do
potvrdenia používateľskej čitateľnosti na nasadenej verzii; #38 je technický
test bez produktovej opravy.
