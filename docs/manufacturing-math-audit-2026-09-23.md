# Audit výpočtu materiálov a olepenia — 23. 9. 2026

## Rozsah

Toto je prvá časť opravy. Následný editor hrán, zdieľané skupiny a cenové
reporty 40–41 sú zdokumentované v [pokračovaní auditu](edge-banding-and-pricing-2026-09-23.md).

Audit pokrýva všetkých 9 aktuálne registrovaných kuchynských rodín, ich 71
ponúkaných variantov a 18 kombinácií publikovaných balíkov a presetov.
Oprava sa týka výpočtu dielov, olepenia, kovania a následných súhrnov materiálu
a ceny. Samostatné pracovné dosky, dodávateľské ceny/balenia a komunikácia so
starými vydaniami Bridge nie sú touto opravou vyhlásené za overené.

## Príčina a opravy

| Zistenie | Opravené správanie |
| --- | --- |
| Spoločný výpočet sčítaval celý obvod všetkých dosiek, vrátane chrbta a dna zásuviek, do jednej položky hrán frontov. Korpus tak dostával nulu. | Každá opracovaná doska má vlastnú položku olepenia a väzbu na pôvodný diel. Hrany frontov a ostatných dielov zostávajú oddelené. |
| Kusovník používal paralelné odhady rozmerov: nesprávne medzery dvierok, rovnaké výšky rôznych zásuviek, nepresné dná, police a rohové výstuhy, ktoré v zostave neboli. | Rozmery, plocha, počet a obrys pochádzajú zo skutočných dielov zavretej zostavy. Výsuvy používajú výšky zodpovedajúcich zásuviek. |
| Rodina dodávateľského materiálu prepisovala konštrukčnú rolu dielu. | Použitie dosky alebo hrany na korpuse/frontoch určuje kategóriu aj vtedy, keď oba používajú rovnaký produkt. |
| Chýbajúca cena vyradila položku aj z fyzických množstiev cenového súhrnu. | Množstvo zostáva viditeľné a kalkulácia zostáva označená ako neúplná. Nepriradená cena neznamená nulovú spotrebu. |
| Sokel chýbal v celkovom počte a ploche dosiek, pretože sa samostatne zobrazuje v bežných metroch. | Súhrn dosiek zahŕňa aj sokel; jeho vlastný riadok naďalej používa metre. |
| Počet opakovaných skriniek sa ignoroval. | Dosky, olepenie, kovanie a práca sa násobia raz. Kópie majú osobitné väzby dielov pre export. |
| Odhad kovania nezodpovedal rohovým konštrukciám. | Počítajú sa zostavy kovania, nie samostatné zobrazovacie časti jedného závesu/príchytky. Roh 90° má v aktuálnej geometrii 7 nožičiek, 4 príchytky, 4 závesy a 2 úchytky. |
| Orezanie importovanej rohovej skrinky sploštilo dosku na nulovú hrúbku. | Doska ležiaca celá mimo hraničnej roviny sa najprv presunie dovnútra; zachová si hrúbku. Výrobná hrúbka importovaných/skosených dielov používa parameter materiálu, nie skreslený obal zobrazovacieho telesa. |
| Zadné skosenie alebo mierne vychýlené bočné hrany rohových políc mohli vstúpiť do viditeľného olepenia. | Obrys sa meria po orezaní. Skryté zadné skosenie a zadné uzatváracie panely sa neolepujú. |

## Pravidlá olepenia

Sú zachované konštrukčné pravidlá súčasných modulov: plné čelá po obvode,
odhalené predné hrany korpusu a políc, horné hrany zásuvkových bočníc,
horná a bočné hrany sokla. HDF chrbty, dná zásuviek, zadné výstuhy a sklenené
čelá nevytvárajú ABS olepenie. Otvorené a tvarované moduly používajú odkrytú
časť svojho obrysu. Nejde o optimalizáciu nárezu ani o novú všeobecnú rezervu
materiálu. Existujúca 10 % rezerva dolného rohu 90° zostáva zachovaná.

## Nezávislé aritmetické príklady

Horná skrinka 600 × 750 × 400 mm, hrúbka 18 mm, dve police, jedny dvierka,
medzery 2 mm, bez sokla:

- Čelo: 596 × 746 mm; olepenie `2 × (596 + 746) / 1000 = 2,684 m`.
- Korpus a police: `(2 × 750 + 4 × 564) / 1000 = 3,756 m`.
- Plocha korpusu: `(2 × 750 × 381 + 2 × 564 × 381 + 2 × 564 × 373) / 1 000 000`.
- Chrbát 564 × 714 mm nezvyšuje olepenie.

Dvoje dvierka pri šírke 900 mm, bočných medzerách 4 mm a stredovej medzere
3 mm majú šírku `(900 − 2 × 4 − 3) / 2 = 444,5 mm` na krídlo.

V prehliadači bola bežným ovládaním vložená spodná skrinka šírky 600 mm,
výšky korpusu 632 mm, sokla 150 mm a jednej police. Materiály zobrazili
2,45 bm hrán frontov a 3,86 bm ostatných hrán; presné hodnoty sú 2,448 m
a 3,856 m. Nespárované hrany zostali viditeľné s upozornením na chýbajúci produkt.

Súkromné hlásenie bolo reprodukované na uložených parametroch: pôvodný
výpočet zopakoval hlásenú nulu korpusu a nadhodnotenie frontov. Historický
kompletný katalóg nebol dostupný, preto toto porovnanie dokladá množstvá,
nie obnovenie historickej zákazníckej cenovej ponuky. Súkromné vstupy ani
výstupy nie sú súčasťou repozitára.

## Overenie

- `manufacturingMath.test.ts`: 114 testov vrátane všetkých 71 variantov,
  publikovaných presetov, analytických príkladov, chýbajúcich priradení,
  kovania rohov, násobenia počtom kusov a väzieb hrán na dosky.
- Celá unit sada: 409 súborov, 2 768 úspešných testov, 1 existujúci preskočený.
  Použité `npm test -- --maxWorkers=2`, aby súbežná záťaž nespôsobovala timeouty.
- `npm run typecheck`, `npm run build`, `npm run test:pricing-contract`: úspešné.
  Build upozorňuje na veľkosť hlavného aplikačného balíka.
- Kontrola Materiálov v prehliadači: správne oddelené hrany, aktuálne chyby konzoly 0.
- Kompletná `npm run test:ui-regression`: úspešná vrátane modulových rozmerov, vlastností, cien, uloženia/načítania, FQP exportu/importu a obnovy projektu. Izolovaný server používal dočasné súborové úložisko a syntetického testovacieho klienta.
- Aktualizáciu Graphify nebolo možné vykonať: nástroj nie je nainštalovaný.

## Doručenie

Oprava je v existujúcej pracovnej kópii `Arcigy_app-release-delfi-20260921`.
Neobsahuje zmeny klientskych dát ani nasadenie do produkcie. Výmena Bridge
sama osebe chybu spoločného výpočtu olepenia neopraví. Výrobný súpis aj
cena sa musia pri otvorení projektu znova prepočítať opravenou aplikáciou.
