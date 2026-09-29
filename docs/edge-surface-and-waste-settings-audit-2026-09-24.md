# Plôšky olepenia a audit prerezov

Následná úprava: spoločné percentá prerezov sú už dostupné aj priamo
v Materiáloch. Implementáciu a overenie popisuje
`material-waste-controls-2026-09-24.md`; audit nákupných výnimiek nižšie
zostáva platný.

## Zmena náhľadu olepenia

Vlastníkom náhľadu je `src/app/edgeBandingPreview.ts`. Výrobnú geometriu
poskytuje existujúce meranie `panelMeasurement.ts`; vlastné dosky používajú
rovnaký náhľad cez `customBoardEdgeSettings.ts`. Nepribudla samostatná
implementácia výberu ani zásah do `app.ts`, väzieb hrán či cien.

Pôvodné zvýraznenie kreslilo úsečku na obryse jednej širokej steny dosky.
Nový náhľad tvorí štvoruholník medzi touto stenou a protiľahlou stenou:
dĺžka konkrétnej hrany × skutočná hrúbka dielca. Farebná výplň aj kliknutie
používajú tú istú plochu. Pri prekrytí sa vyberie najbližšia plocha v mieste
kliknutia, nie najbližšia obrysová čiara. Pohľad zboku má malú toleranciu
výberu. Otáčanie náhľadu nemení výber; zrušené gesto sa zahodí.

Posun k protiľahlej stene sa určí z vrcholov dosky, takže funguje aj pri
zrkadlenom meradle a obrátenom poradí trojuholníkov. Vlastná doska používa
svoju hrúbku vrátane šikmých strán profilu. Farby skupín, oranžový výber,
sivé neolepené plochy a zobrazenie zakrytých hrán zostávajú zachované.

## Požiadavka na prerez a maržu

Požadovaný postup je prirážka k nákladom:

`predaj = čisté množstvo × jednotková cena × (1 + prerez / 100) × (1 + prirážka / 100)`

Pre 1 m² dosky alebo 1 bm hrany s cenou 100, prerezom 30 % a prirážkou
100 % je základný materiál 100, prerez 30, náklad 130, prirážka 130 a
predaj 260. Osem testov v `materialWasteMarkup.test.ts` overuje celý prechod
od výrobného kusovníka k súhrnu marží: dosky/hrany, katalóg/projektový
cenový snímok, 1/3 kusy, opakovaný výpočet bez dvojitého prerezania.

### Stav nastavení v čase auditu, pred doplnením prerezov do Materiálov

- Dve spoločné percentá pre dosky a hrany existujú v **Marže → Výrobný
  cenník projektu**. Vyžadujú zapnutie explicitných sadzieb. V Materiáloch
  sa nezobrazujú.
- Dáta podporujú odlišný prerez podľa materiálu, ale používateľ nemá
  zodpovedajúce polia v Materiáloch.
- Zapnutie tohto režimu je previazané s explicitnými sadzbami predmontáže.
  Bez nich môžu ceny skrinky zostať neúplné aj po zadaní prerezov.
- Pri pracovnej doske nastavenej na nákup po celých/polovičných formátoch
  sa množstvo 1,3 m² z výrobného prepočtu prepíše nákupnou plochou.
  Reprodukcia: diel 1000 × 1000, formát 2000 × 1000, krok 0,5 ks,
  cena 100/m², prerez 30 %, prirážka 100 %. Náklad aj prirážka sú 100
  a výsledok 200; všeobecný percentuálny postup by dal 260.
  Prepis je v `portableCommercial.ts` aj pri projektovom priradení
  v `projectMargins.ts`. Pri lineárnom soklovom profile obdobne vyhrá
  čistá dĺžka nad percentuálnym množstvom; ten však nie je plošný materiál.

Záver auditu: základný percentuálny výpočet funguje, ale nastavenie ešte
nie je dostatočne dostupné a jednoznačné pre všetky spôsoby účtovania.
V tejto úprave náhľadu sa nákupné pravidlá nemenili.

### Odporúčaný ďalší krok

V Materiáloch ukázať projektové percentá dosiek/hrán a možnosť odlišnej
sadzby pri konkrétnom materiáli alebo skupine olepenia. Prázdne pole dedí
projektové percento, nula znamená výslovne bez prerezov. Oddeliť ich
zapnutie od predmontáže. Náhľad ceny má zrozumiteľne rozlíšiť čisté množstvo,
cenu spotreby, prerez, náklad po prereze, prirážku a predajnú cenu.

Pracovné dosky musia mať viditeľný spôsob účtovania: percento zo spotreby
alebo nákupný formát. Ak má byť percento ešte navyše k nákupnému formátu,
musí to byť výslovná voľba a zobrazený medzisúčet, aby nedochádzalo
k nechcenému dvojitému účtovaniu odpadu. Existujúce uložené ponuky nesmie
nové predvolené nastavenie potichu preceniť.

## Overenie

- 7 nových testov geometrie a výberu: 18 mm doska, transformácie a
  zrkadlenie, výrez v doske, vlastný trojuholník 300/400/500 mm,
  kliknutie cez celú hrúbku a hĺbka pri prekrývaní.
- 135 cielených testov náhľadu, hrán a výrobnej matematiky prešlo.
- Celá unit sada prešla: 418 súborov, 2821 testov, 1 existujúci skip;
  následne samostatne prešlo 8 nových testov prerezov a prirážky.
- Editor prešiel 71 kontrolami vrátane vlastných dosiek, skupín, Späť/Znova,
  uloženia, FQP a obnovy draftu. Ručne overený výber plochy v lokálnom
  prehliadači; chyby konzoly 0.
- Build prešiel s existujúcim upozornením na veľkosť hlavného balíka.
- `npm run typecheck` a celá `npm run test:ui-regression` prešli vrátane
  úplného projektového roundtripu a obnovy draftu. `git diff --check` je čistý.

Zmeny sú lokálne v pracovnom priečinku `Arcigy_app-release-delfi-20260921`.
Graphify nie je nainštalovaný; jeho aktualizácia preto nie je dostupná.
