# Olepenie a cenové opravy

Pracovná implementácia nad auditom `manufacturing-math-audit-2026-09-23.md`.
Všetky zmeny a reprodukcie sú lokálne; tento dokument nie je potvrdením nasadenia.

## Používanie

V rozšírených nastaveniach skrinky zapnite **Olepenie**. Náhľad aj zoznam
zobrazujú každú hranu opracovateľného dielca: farbou skupinu, sivou hranu bez
olepenia a oranžovou výber. Sklenené čelá nemajú ABS hrany. Filter **Dielec**
umožňuje vybrať aj zakryté hrany; Ctrl/Shift rozširuje výber.

**Pridať do skupiny** priradí vybrané hrany, **Odobrať olepenie** ich ponechá
bez olepenia a **Obnoviť predvolené** vráti konštrukčné pravidlo. Skupina má
vlastný názov a materiál. Je spoločná pre celý projekt vrátane vlastných dosiek.
Zmena materiálu skupiny sa preto prejaví všade, kde sa používa. Novú skupinu
možno vytvoriť aj bez materiálu; cena vtedy ostáva neúplná.

Vlastné dosky otvárajú rovnaký editor z vlastností a nástroja olepenia. Pri
tvarovanej doske sa vyberá skutočný obrys, pri ohnutej doske rozvinutý dielec.
Karta **Materiály** zobrazuje pomenované skupiny, súčet ich metrov a úpravu
materiálu. Počet skupín nie je obmedzený na pôvodné dve.

Úpravy v okne sú pracovným návrhom až do uloženia. Späť/Znova funguje v okne;
uložená zmena hrán a skupín tvorí jeden krok projektovej histórie. Zrušenie
neprepíše projekt. Zmena konštrukcie s neplatnými starými hranami vyžaduje
odstránenie neplatných väzieb; systém ich potichu nepriradí inému dielcu.

## Jediný zdroj množstiev a ukladanie

Náhľad a kusovník používajú rovnaké fyzické hrany z výrobných dielcov.
Identifikátor hrany závisí od dielca a topológie, nie od jej dĺžky. Zmena
rozmerov preto prepočíta metre bez straty priradenia. Výber materiálu ani
chýbajúca cena nemení fyzickú spotrebu. Existujúce individuálne priradenia
materiálov sa zachovávajú, explicitné zaradenie hrany používa vybranú skupinu.

Server ukladá zmeny skupín a väzby hrán atomicky. Kontroluje pôvodný stav
menenej skupiny aj revíziu materiálov pri zápise; súbežnú zmenu tej istej
skupiny odmietne, ostatné projektové materiály zachová. Nové ceny berie z
autorizovaného katalógu, existujúce zo zachyteného projektového materiálu.
Klient nemôže zmenou skupiny podstrčiť inú cenu.

Uložený vnorený snímok rozloženia používa aktuálne projektové materiály;
nemôže ich pri otvorení prepísať staršou kópiou. Oneskorené načítanie
materiálov zachová lokálne zmeny skupín. Recovery draft obsahuje aj čakajúcu
transakciu skupín. Nezlučiteľný súbežný serverový zásah má prednosť a draft
sa archivuje podľa existujúcej politiky obnovy.

## Reporty 39–41

Reporty pochádzajú od Aleša Rohricha, DELFI, Chrome 153 na Windows;
prostredie a verzia aplikácie nie sú v historických záznamoch určené.
Prílohy zostávajú mimo repozitára. Ich kompletný historický katalóg chýba;
reprodukcia množstiev a oprava zachytených cien netvrdí úplnú rekonštrukciu
pôvodnej cenovej ponuky.

- **39, metre korpusu a dvierok:** spoločný odhad nesprávne zaradil obvody
  všetkých dosiek pod hrany frontov. Nový súpis meria opracované hrany
  jednotlivých dielcov. Audit obsahuje nezávislé aritmetické príklady a
  pokrytie 9 rodín / 71 variantov.
- **40, pracovná doska:** parser tisícových oddeľovačov čítal `2 099 Kč`
  ako `2 Kč`. Oprava z uloženého dodávateľského pozorovania obnoví
  `806,2223929325908 Kč/m²` pre formát 4100 × 635 mm. Diel dlhý 1850 mm
  vyžaduje polovicu dosky, teda **1049,50 Kč**. Nákup sa zaokrúhľuje po
  poloviciach samostatne pre každý diel; odrezky neznižujú cenu ďalšieho
  dielu. Rozmery rezov rešpektujú vonkajšie rozmery rohov a šikmé úseky.
  Diel nad nákupným formátom vyvolá chybu namiesto vymysleného spoja.
- **41, sokel:** doskovému materiálu bola vynútená jednotka bm, ktorá
  zneplatnila cenu za plochu. Uložené pozorovanie 1115,88 Kč / doska
  2800 × 2070 mm obnoví **192,52587991718428 Kč/m²**; sokel 600 × 100 mm
  stojí **11,551552795 Kč** pred maržou. Skutočné lineárne soklové profily
  naďalej používajú bm. Bežné spodné, zásuvkové, vysoké a fľašové skrinky
  majú samostatnú voľbu predného, ľavého a pravého sokla; geometria, spotreba
  aj príchytky rešpektujú rovnaký výber. Rohové konštrukcie si zachovávajú
  svoje pravidlá a ich hrany možno upravovať v režime olepenia.

## Overenie

Analytické testy kontrolujú obvody, rôzne materiály skupín, cenu pri opakovanom
počte kusov, chýbajúcu cenu, kopírovanie vlastnej dosky a neplatné väzby.
Trojuholníková vlastná doska so stranami 300/400/500 mm má presne 1,2 bm;
odobratím prepony zostáva 0,7 bm. Samostatné testy chránia atómové uloženie,
konflikty, autoritu cien, oneskorenú odpoveď materiálov a obnovu draftu.

Celá unit sada: **417 súborov, 2814 úspešných testov, 1 existujúci preskočený**.
`npm run typecheck`, `npm run build`, `npm run test:pricing-contract` a
kompletná `npm run test:ui-regression` prešli. Build hlási existujúcu veľkosť
hlavného balíka. Testy používajú izolované súborové úložisko a syntetický účet.
Rozšírený scenár nastavení modulu prešiel **71 kontrolami**, vrátane výberu,
odobratia/Späť, skupín v Materiáloch, vlastnej trojuholníkovej dosky, FQP
roundtripu a obnovy po refreshe pred automatickým uložením na server.
Test pred refreshom overí v IndexedDB konkrétnu väzbu aj čakajúcu zmenu skupiny,
potvrdí ich neprítomnosť na serveri a po obnove úspešný spoločný zápis.
Ručne overené kliknutie na hranu v 3D: 6,304 bm → odobratie 628 mm →
5,676 bm → Späť → 6,304 bm; aktuálne chyby konzoly 0.

Graphify nebolo možné aktualizovať: príkaz `graphify update .` končí 127,
nástroj nie je nainštalovaný. Bridge je podľa používateľa funkčný a ďalšie
vyšetrovanie spojenia bolo na jeho pokyn ukončené.

Odoo hlásenia 39, 40 a 41 boli po kontrolách cez arcigy-feedback označené
ako Zapracované. Opätovné načítanie potvrdilo stav implemented; nasadenie
sa tým nepotvrdzuje.
