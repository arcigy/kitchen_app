# Rohy vrchných modulov, kóty, Escape a pôdorys niky

Požiadavka: tri rohové vrchné varianty musia ísť vložiť do nakresleného rohu stien. Kóta meria od líca steny na strane modulu; nula znamená dotyk. Escape zruší aj zatiaľ nerozmiestnený katalógový modul. Vysoká otvorená/koncová nika má pôdorys celého korpusu.

## Nálezy a opravy

| Nález pred opravou | Oprava a ochrana |
|---|---|
| Rohové varianty spoločnej hornej rodiny nemali povinný príznak rohu. Rozpoznali sa ako rovná skrinka. | Existujúci vlastník pravidiel rozpoznáva explicitné rohové varianty aj v starších parametroch bez balíka. |
| Po rozpoznaní rohu ho katalógová rodina odmietala: povoľuje kontext `kitchen_wall`. | Umiestnenie používa deklarovaný kontext balíka, pričom geometria naďalej vyžaduje dve podopierajúce kolmé steny. Pravidlá balíka sa neobchádzajú. |
| Pri priebežnom napojení stien bol začiatok kóty na vzdialenom líci priečky. Pri stene 100 mm bola kóta o 100 mm nesprávna. | Spoločný výpočet umiestnenia a kót používa odkryté úseky líca. Priečka rozdelí úseky; nulová medzera nesmie presunúť modul ani reťazec cez priečku. |
| V kuchynskom režime sa Escape dostal k zrušeniu výberu skôr ako k zrušeniu vkladania. | Vkladanie má prioritu pred výberom aj v prípade, že navigácia už označila kláves ako spracovaný. Písanie do vstupu si zachováva prioritu. |
| Pôdorys niky sa odvodil z jej 8 mm zadnej dosky. | Autor geometrie odovzdá celý vonkajší obrys z rovnakých údajov, z ktorých vyrába korpus. Obrys používajú kreslenie, výber aj priestorové referencie. |
| Klikateľné plochy kót sa rušili pri numerickom šume kamery. | Zaokrúhľuje sa výhradne podpis vykreslenia, nie geometria ani zadané rozmery. Zmena 1 mm stále obnoví kótu. |
| Výber prvého modulu v novom projekte žiadal materiály a marže pred existenciou prvého uloženia (HTTP 404). | Stav projektu rozlišuje metadáta od skutočného snapshotu vrátane starších projektov bez revízie. Panel počká a automaticky pokračuje po úspešnom uložení; samotný výber nepotvrdí rozpracovanú kuchyňu. |

## Testy pred implementáciou

- Prvý reprodukčný beh: 40 zlyhaní — 24 orientácií/variantov rohu, dve strany nulovej medzery, 12 variantov niky a dve cesty Escape. Chyby v príprave testov boli opravené pred zaznamenaním tohto behu.
- Test celého katalógového balíka následne reprodukoval 24 odmietnutí rohov v pravidlách kontextu.
- Dva ďalšie reprodukčné testy zachytili zámenu úsekov pri priečke a opakované nahrádzanie klikateľnej plochy kóty.
- Regresie používajú skutočnú geometriu a systémový katalóg, štyri otočenia rohu, oba smery kreslenia stien, priame/skosené/zaoblené niky, zmenu rozmerov a opakované prepnutie viditeľnosti.

## Zachovanie existujúceho správania

Balík zahŕňa potrebnú, doteraz lokálnu logiku opory vrchných modulov: výška/dĺžka steny, otvory, presun, úprava rozmerov, uloženie a obnova väzby. Nové polia väzby sú voliteľné a existujúce projekty ostávajú čitateľné. Nevykonáva sa prepis tenantových dát, zmena hesiel ani migrácia databázy. Staršie lokálne zmeny pracovných dosiek, spodných skosených modulov, prihlasovania a vlastností sa do tohto balíka nepreberajú.

## Ručný test

1. V kuchyni prepnúť na Vrchné. Nakresliť dve kolmé steny, vyskúšať oba smery kreslenia. Vložiť horný roh 90°, skosený horný roh a skosenú rohovú niku. Skúsiť ich aj na jednej rovnej stene: vloženie sa má odmietnuť.
2. Bežný vrchný modul vložiť pri stene aj mimo dosky. Kliknúť na jeho medzeru od priečnej steny, zapísať 0. Skontrolovať dotyk v pôdoryse i 3D, potom Späť/Znova.
3. Zvoliť modul v katalógu a stlačiť Escape ešte pred pohybom myši. Kliknutie do plánu už nesmie nič vložiť. Zopakovať s viditeľným náhľadom.
4. Vložiť vysokú otvorenú/koncovú niku. Meniť šírku, tvar a stranu. Porovnať pôdorys s 3D; prepínať pohľady a obnoviť uložený projekt.
5. Pri priečke uprostred dlhej steny nastaviť nulu na jednej strane. Moduly na druhej strane sa nesmú pohnúť.
6. V úplne novom projekte vybrať modul pred prvým uložením. Panel materiálov a marží má oznámiť čakanie bez chýb konzoly. Po uložení sa načíta automaticky. Starší uložený projekt musí panel načítať hneď.

Výsledky automatických kontrol sú uvedené v `VERIFICATION.md`.
