# Prerezy v Materiáloch

## Plán a vlastníctvo

Rozšíriť existujúci `materialsPhaseController` a `materialsPhasePanel` o
samostatný blok projektových prerezov dosiek a hrán. Serverové nastavenia
naďalej vlastní `marginsPhaseController` a existujúci endpoint marží.
Malý panel prerezov použije jeho načítanie, kontrolu oprávnení, revíziu,
frontu zápisov a obnovu po konflikte. `app.ts` pridá iba spätné prepojenie
na existujúce projektové cenové nastavenia.

Úprava z Materiálov zmení iba spoločné percentá a zapnutie existujúceho
výrobného režimu. Predmontáž, receptúry, individuálne percentá materiálov
a marže zostanú zachované. Žiadny nový formát uloženého stavu ani druhé
úložisko percent nevznikne. Otvorenie karty samo ceny nezmení.

Testy: nulové/desatinné/nevyplnené/neplatné hodnoty, zachovanie ostatných
sadzieb, oprávnenia, konflikt revízií, čakanie na zápis pri odchode,
zhoda s Maržami, cena po prereze, opätovné otvorenie a FQP roundtrip.
Ručná cesta: Materiály → Prerezy → uložiť → Marže → späť do Materiálov.

Mimo tejto úpravy: nákupné pravidlá pracovných dosiek, individuálne
percentá pri každom materiáli a oddelenie zapnutia predmontáže od prerezov.
Tie vyžadujú samostatnú zmenu cenového modelu opísanú v predchádzajúcom audite.

## Výsledok

Materiály zobrazujú blok **Prerezy** priamo pod nadpisom: **Prerez dosiek**,
**Prerez hrán**, zapnutie existujúceho výrobného režimu a **Uložiť prerezy**.
Zapísaná hodnota sa bez ďalšieho nastavenia objaví aj v Maržiach a naopak.
Prázdne pole je chýbajúca sadzba, nula platná sadzba bez prerezu; podporená
je bodka aj desatinná čiarka. Neplatná alebo záporná hodnota sa neodošle.

Panel používa existujúci serverový výpočet. Neúplná cena sa tak označí aj
po úspešnom uložení percent. Vysvetlenie výpočtu upozorňuje na predmontáž
a nákupný formát pracovných dosiek. Bez uloženého projektu panel zobrazí
pokyn vytvoriť alebo otvoriť uložený projekt.

Pri uložení sa nové percentá zlúčia s aktuálnymi výrobnými nastaveniami
v spoločnom vlastníkovi marží. Konflikt načíta aktuálnu revíziu a umožní
opakovať úpravu; neprepíše cudzie novšie sadzby. Odchod z Materiálov počká
na odoslaný zápis. Aktualizácie zoznamu materiálov ani stavu dodávateľa
nevytvárajú formulár nanovo, takže nestrácajú rozpracovanú hodnotu a fokus.

V `app.ts` pribudol iba jeden riadok pre synchronizáciu cenových nastavení;
aktuálna dĺžka kompozičného súboru je 5499 riadkov.

## Cielené overenie

- 13 nových kontrol pre hodnoty, zachovanie nastavení, read-only projekt,
  konflikt revízií, výpadok siete, duplicitné odoslanie, čakanie pri odchode
  a zachovanie fokusu pri aktualizácii Materiálov.
- Rozšírený existujúci pricing UI scenár: 87 kontrol. Overuje skutočný
  prepočet cien po zmene percent, zachovanie kovania a práce, synchronizáciu
  oboma smermi, refresh, uloženie projektu a export/import percent cez FQP.
- Vizuálne skontrolované rozloženia 1600 × 1000 a 1080 × 900; konzoly
  cenového scenára bez chýb. Podklady sú v `.tmp/material-waste-ui/`.
- Doplnená regresia pre opätovné zapnutie výrobných sadzieb v Maržiach
  po vypnutí v Materiáloch. Pôvodný formulár pri zapnutí zahodil uložené
  individuálne prerezy, sadzby predmontáže podľa typu/presetu a receptúry;
  teraz mení existujúce nastavenia bez ich resetovania. Test preukázal
  chybu pred opravou a následne prešiel.

## Záverečné overenie

- Celá unit sada: 420 súborov, 2843 úspešných testov a 1 existujúci skip.
  Spustená s dvoma workermi; neobmedzený súbeh s buildom spôsobil časové
  limity troch nesúvisiacich testov. Pri opakovaní bez tejto záťaže prešli.
- Kontrola typov a produkčné zostavenie prešli; build má existujúce
  upozornenie na veľkosť hlavného balíka.
- Celá `npm run test:ui-regression` prešla vrátane 87 cenových kontrol,
  uloženia/načítania, úplného FQP roundtripu a obnovy rozpracovaného projektu.
- Lokálna aplikácia načítaná v prehliadači; aktuálne chyby konzoly: 0.
- Graphify nie je v prostredí nainštalovaný, aktualizácia grafu preto nie je
  dostupná. Zmeny sú lokálne v `Arcigy_app-release-delfi-20260921`.
