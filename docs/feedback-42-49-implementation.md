# Reporty #42–49: implementácia a overenie

Implementácia schváleného plánu v pracovnej kópii `Arcigy_app-release-delfi-20260921`.
Predchádzajúce úpravy olepenia, prepočtov a stien zostali zachované. Zmeny nie sú
produkčným nasadením. `src/app.ts` pripája kontroléry; výpočty a editorové správanie
vlastnia samostatné moduly.

## Hotové správanie

| Report | Výsledok |
| --- | --- |
| #42 | Kuchyňa → Zástena → Celá kuchyňa / Vybrať stenu. Náhľad dielcov a upraviteľné spoje, spoločný editor vlastných dosiek, automatické sledovanie zdrojov, ručné výnimky a reset, potlačenie vymazaných dielcov, výrezy a nákupný rozpis v Materiáloch. |
| #43 | Projektová cena, množstvo, jednotka a reset. Množstvo na skrinku sa násobí jej počtom; samostatné doplnky projektu raz. Katalóg sa neupravuje. |
| #44 | Samostatný montážny balíček, predvolene jeden na skrinku, spoločné aj individuálne priradenie komponentu. |
| #45 | Samostatné pánty, podložky pántov, nohy, podložky nôh, klipy a policové podpery. Podložky predvolene 1 : 1, aj po projektovej zmene počtu pántov; vlastné množstvo a zahrnutie v balení majú prednosť. |
| #46 | Závesné kovanie horných skriniek, predvolene dva závesy, nastaviteľný počet a komponent. |
| #47 | Počet nôh celkom / z toho predné mení geometriu, kusovník a cenu. Každá predná noha má klip. Bočné klipy vychádzajú zo skutočných úchytov a zobrazovacie súčiastky sa neduplikujú. |
| #48 | Presný variant výsuvov a uložený cenový snímok zostávajú autoritou aj bez dodávateľského ID v aktuálnom katalógu. Sada sa nenásobí počtom svojich súčiastok. |
| #49 | Marža/m² zostáva viditeľná pri chýbajúcich cenách ako Priebežná hodnota. Delí sa známou fyzickou plochou dosiek ≥ 16 mm; neplatná alebo nulová plocha má vysvetlenie. |

## Zástena a výroba

Generátor pokrýva pracovnú dosku pri stenách aktívnej kuchyne, vrátane medzery pre
spotrebič. Vynecháva ostrovy, vysoké skrine a úseky bez nadväzujúcich spodných
modulov. Výška vychádza zo skutočného povrchu pracovnej dosky a spodkov horných
skriniek, prípadne nastavenia ich výšky v kuchyni. Rohové spoje zohľadňujú aj
individuálne zmenenú hrúbku nadväzujúcej dosky.

Opakované vloženie aktualizuje skupinu. Parametre zmenené ručne sa uchovajú;
Obnoviť automatiku vráti konkrétny parameter. Automatické otvory sledujú okná a
dvere popri vlastných výrezoch. Vymazané automatické dielce a otvory sa samovoľne
nevrátia. Odstránenie zdroja ponechá poslednú platnú geometriu s upozornením.

Spoločné odčítanie polygónov používa geometria, čistá plocha aj olepenie vnútorných
hrán. Otvory fungujú aj vo vlastnej doske vedenej cez roh; úplné odčítanie dosky
vracia platnú prázdnu geometriu.

Rezný rozpis zoskupuje materiál, hrúbku a cenový snímok. Skúša povolené orientácie
v šiestich deterministických poradiach, rešpektuje dekor a šírku rezu (3 mm).
Polovičný formát má polovicu dĺžky a celú šírku. Výstup obsahuje umiestnenie každého
dielca; nejde o odhad nákupu iba zo súčtu plôch. Rozpis je heuristický, nie dôkaz
absolútneho minima nákupu. Výrezy nemenia polotovar a spoločný prerez sa nepridáva
znova. Chýbajúci formát alebo nevyrobiteľný dielec označí cenu ako neúplnú.

Materiál zvolený priamo v editore má uložený snímok ceny a formátu. Snímok prežije
zmenu či odstránenie položky z katalógu. Materiálové priradenie konkrétnej dosky
používa vlastný projektový snímok.

## Dáta a zodpovednosti

- `src/layout/backsplash/`: generátor, vstupy zo scény, cenové snímky.
- `src/app/backsplash*.ts`: výber steny, návrh a nastavenia v spoločnom editore.
- `src/layout/bom/backsplashCutLayout.ts`, `backsplashPurchase.ts`: rozpis a spoločné účtovanie nákupu.
- `src/core/project-materials/project-component-*.ts`: projektové množstvá, jednotky, ceny a validované operácie.
- `src/layout/bom/projectAssignedPricing.ts`: oceňovanie priradení podľa položky a variantu, odvodené doplnky.
- `src/modules/fwmFurniture/leg*.ts`: rozmiestnenie a kontrola počtov nôh.
- `src/core/project-save/backsplash-validation.ts`: validácia zdrojov, výrezov a snímkov.

Existujúce oprávnenia a revízie API zostávajú autoritou. Neplatná zmena počtu nôh
cez cenové API sa odmietne bez zmeny projektu; staršia revízia vráti konflikt.
Nové hodnoty sa prenášajú cez históriu, uloženie, obnovu draftu a šifrovaný FQP.
Staré projekty bez explicitných počtov zachovávajú pôvodné rozmiestnenie nôh.
Nejednoznačné staré priradenie spojovacieho materiálu sa nekopíruje do nových rolí.

## Overenie

- `npm run typecheck`: úspešné vrátane rozšírenia a simulátora.
- `npm test -- --maxWorkers=2`: 426 súborov, 2 904 úspešných testov; jeden existujúci preskočený test starého značkového zásuvkového systému.
- `npm run build`: úspešné; existujúce upozornenie na veľkosť aplikačného balíka.
- `npm run test:ui-regression`: úspešný celý finálny beh po doplnení cenových snímkov a väzby podložiek, vrátane všetkých projektových prenosov a obnovy.
- `npm run test:feedback-42-49-ui`: 24 kontrol, konzola bez chýb; scenár je zaradený aj do úplnej UI regresie.
- Konzola otvorenej lokálnej aplikácie na `http://127.0.0.1:5288/`: bez chýb.
- `git diff --check`: úspešné.

Cielené regresie overujú rovné, L a U zostavy, šikmú stenu, výškové zmeny, okná a
dvere, spotrebičovú medzeru, vysokú skriňu, ručné výnimky, reset, odpojené zdroje,
spoločný nákup a neprípustné formáty. Rozpis má kontrolu jedného umiestnenia každého
dielca, hraníc a neprekrývania. Geometrické otvory sa overujú aj prienikom lúča.

Cenová regresia: 3 × 859,54 Kč = 2 578,62 Kč; pri prirážke 150 % predaj
6 446,55 Kč. Overené sú aj násobenie skriniek, nulová cena, nesprávny variant,
rôzne snímky rovnakého dodávateľského ID, vlastné množstvá a doplnky v balení.

Nový UI scenár používa skutočné ovládacie prvky: kliknutie na stenu, zrušenie
náhľadu, vytvorenie skupiny, Späť/Znova, opakované vloženie, 5/3 a 5/2 nohy,
serverový kusovník vrátane bočných klipov, nákupný formát v Materiáloch, vlastný
komponent, revízny konflikt, neplatný zápis, uloženie, celý FQP prenos a obnovenie
neuloženého nastavenia spolu so zástenou.

## Podklady a hranice reprodukcie

Reporty #42–49 boli prevzaté cez arcigy-feedback. Všetkých 24 príloh má overené
SHA-256 a sú mimo Git. Historická verzia aplikácie a kompletný historický katalóg
nie sú dostupné; dnešný katalóg sa nevydáva za pôvodný. Testy používajú izolované
syntetické projekty a oddelené lokálne úložisko.

Pri prepočte staršieho reportového stavu dnešnou geometriou vzniká čelo 251 mm,
zatiaľ čo historické priradenie uvádzalo 264 mm. Normalizácia s externou pracovnou
doskou je opravená; odlišné varianty sa nezamieňajú. Regresia platného variantu
264 mm je samostatná, presne rozmerovo definovaná.

Po úspešnom kompletnom overení boli všetky reporty #42–49 cez arcigy-feedback
označené ako Zapracované; každý obsahuje vlastný súpis opravy a výsledky testov.
To neznamená produkčné nasadenie; commit/release evidencia patrí následnému
odsúhlasenému publikačnému postupu.
