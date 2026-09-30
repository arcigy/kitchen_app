# Report #50: práca v marži a sadzby presetov

Dátum: 2026-09-25. Stav: lokálne implementované a overené, bez produkčného nasadenia.

## Použitie

Pri vytváraní presetu je dostupná **Práca za jeden modul** a mena EUR/CZK. Nula je platná hodnota; prázdne pole preberá firemnú sadzbu typu modulu. Uložený preset je spoločný pre projekty danej firmy.

Vo vlastnostiach skrinky aj v rozšírenom editore je **Práca za modul**. Rozpis uvádza zdroj, sadzbu, počet kusov a výslednú sumu. **Uložiť pre túto skrinku** vytvorí vlastnú sadzbu; **Obnoviť zdedenú sadzbu** odstráni túto výnimku. V rozšírenom editore zostáva zmena v náhľade až do uloženia modulu.

Časť **Práca uložená v presete** umožňuje načítať a upraviť aktuálnu firemnú sadzbu. **Uložiť do presetu** mení knižnicu, nie vložené skrinky. **Prevziať sadzbu z presetu** vedome nahradí sadzbu vybranej skrinky; hromadné prevzatie preskočí skrinky s vlastnou sadzbou. Prevzatie mení iba prácu, nie konfiguráciu ani rozmery.

## Výpočet a kompatibilita

- Príspevok označený v UI ako marža je predaj mínus nákup materiálov a komponentov. Účtovaná práca vstupuje do tejto sumy celá. Mzdy a réžia sa týmto výpočtom neodpočítavajú.
- Nákup 1 000 Kč + prirážka 500 Kč + práca 200 Kč = predaj 1 700 Kč a marža 700 Kč.
- Nová predmontáž je sadzba za jednu skrinku krát počet kusov, bez ďalšej prirážky. Dodatočná projektová práca sa po novom zadaní účtuje raz ako konečná suma.
- Tri skrinky po 200 Kč a projektová práca 100 Kč znamenajú 700 Kč práce. Prepočet meny a zaokrúhlenie sa vykonajú pri výpočte výslednej sumy.
- Staré projekty bez nových údajov zachovávajú predajné ceny vrátane historickej prirážky práce a historických sadzieb uložených za celý riadok. Samotné otvorenie vlastností neukladá migráciu. Nová práca nevyžaduje zapnutie výrobných prerezov.
- Pôvodné exportné polia `baseCost`, `marginAmount` a `combinedMarginPercent` si zachovávajú význam nákladového základu a prirážky. Nové `contribution` nesie `purchaseCost`, `laborRevenue`, `contributionAmount` a `contributionPercent`. Súhrn obsahuje aj menu. XLSX/PDF používajú spoločný výsledok; XLSX odlišuje prirážku od marže vrátane práce.
- Marža na m² používa opravenú maržu a existujúce pravidlo dosiek hrúbky aspoň 16 mm. Neúplné ceny zostávajú označené; nulová plocha nevedie k deleniu nulou.

## Dáta a vlastníci správania

- `src/core/project-manufacturing/module-labor.ts`: validácia, priorita sadzieb, prevzatie presetu, meny a násobenie množstvom.
- `params.moduleLabor`: snímok pri konkrétnej skrinke s identitou balíka a presetu, verziou a hashom, zdedenou sadzbou a prípadnou vlastnou hodnotou. Zhoda geometrie nenahrádza identitu presetu. Nové použitie načíta aktuálny preset; duplikát kopíruje snímok. Zmena alebo vymazanie presetu neodstraňuje uloženú sadzbu.
- `src/app/moduleLaborLegacyState.ts`: nezapisujúci prevod pôvodnej sadzby pre editor. Historický riadkový súčet sa rozdelí počtom kusov iba pri príprave novej jednotkovej sadzby.
- `src/core/module-package/runtime/moduleLaborControls.ts`: vlastná a firemná sadzba, jasné akcie, chybové stavy a ochrana rozpracovaného vstupu pred oneskorenou odpoveďou servera.
- `src/app/moduleParameterPresetService.ts` a existujúca služba balíkov: firemná knižnica; POST vytvorenia presetu a PATCH `/api/modules/:package/parameter-presets/:preset/labor`.
- API overuje firmu, oprávnenia, sumu, menu a revíziu. Súbežný zápis vracia 409. Súborové úložisko chráni zápis zámkom, PostgreSQL podmieneným zápisom s kontrolou tenant/hash. PostgreSQL vetva je overená mockovaným SQL kontraktom, nie živou databázou.
- Aktualizácia metadát balíka zachováva jeho priložené aktíva. Súborový zoznam ignoruje pomocné súbory zámkov.
- `src/layout/bom/projectContribution.ts`, `projectManufacturingPricing.ts`, `projectMargins.ts` a `projectQuote.ts`: spoločné výpočty pre UI, API a export. `src/app.ts` obsahuje iba prepojenie existujúceho stavu výrobných sadzieb.
- Validácia projektu, existujúca história, serverové uloženie, FQP a lokálny draft prenášajú snímok spolu s parametrami skrinky. Staré mapy výrobných sadzieb sa automaticky nemažú; pri novej sadzbe skrinky už nie sú druhým miestom úprav.

## Overenie

- Kontrola typov: úspešná.
- Celá sada: 432 súborov, 2 928 úspešných testov, jeden existujúci preskočený test.
- Produkčné zostavenie: úspešné; zostáva existujúce upozornenie na veľký JavaScript balík.
- Cielené prípady: dva projekty s 200 → zmena knižnice na 250 → staré snímky zostávajú, nové použitie 250; nula, dedenie, reset, dve rovnaké geometrie s odlišnými identitami, zachovanie vlastnej sadzby, EUR/CZK, chýbajúca cena, nulový menovateľ, stará cena pri viacerých kusoch, oprávnenia a súbežné zápisy. XLSX sa kontroluje načítaním skutočne vytvoreného súboru.
- Všetky časti `test:ui-regression` prešli: ovládanie, prístupnosť a vzhľad, moduly/presety, oceňovanie, materiály, úplné uloženie/načítanie/FQP, obnova draftu a reporty #42–50. Po úpravách dvoch starších testov sa beh dokončil od testov vlastností po posledný scenár. Prvý starší test ešte očakával prirážku k novo zadanej práci, druhý nečakal na načítanie aktuálneho presetu a používal nejednoznačný výber vstupného poľa. Očakávania boli upravené podľa nového správania, zachované sú kontroly konkrétnych súm, geometrie, zrušenia a ukladania.
- `npm run test:feedback-50-ui`: 30 kontrol, nulové chyby konzoly. Overené A/B pri 200, nové C pri 250, výslovné prevzatie, hromadná aktualizácia so zachovaním vlastných hodnôt, história, nula/reset, API suma 3 × 250, FQP, skutočný zápis sadzby do IndexedDB pred obnovou, náhľad/zrušenie/uloženie rozšíreného editora, duplikovanie cez toolbar a uložená ponuka po odstránení presetu.
- Samostatná kontrola v zabudovanom prehliadači: uložený preset 250 × 3 = 750 zostáva viditeľný aj po jeho odstránení z knižnice; nulové aktuálne chyby konzoly. Testovacie prihlásenie bolo po reštarte servera obnovené.

## Podklady a obmedzenia

Prílohy reportu #50 sa overili a zostávajú mimo Gitu. Historická verzia aplikácie a úplný pôvodný katalóg chýbajú, preto nejde o úplnú reprodukciu historického prostredia. Výpočet a nové správanie sa overujú na kontrolovaných podkladoch.

Záverečné UI testy používajú vlastný lokálny server a samostatné dočasné súborové úložisko. Počiatočný skúšobný beh vytvoril syntetické QA dáta v ignorovanom úložisku pracovnej kópie; finálne behy používajú adresár mimo repozitára. Klientovo úložisko ani otvorený projekt sa nemenili testovacími scenármi. Lokálna aplikácia na porte 5288 má aktualizovaný server.

Graphify v prostredí nie je nainštalovaný; väzby boli overené cieleným čítaním kódu a testami. V pracovnej kópii existovali ďalšie rozpracované zmeny; zostali zachované. Táto oprava zatiaľ nie je produkčne nasadená.
