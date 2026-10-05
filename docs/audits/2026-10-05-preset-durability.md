# Audit trvanlivosti presetov, 5. október 2026

Pôvodný audit odhalil dve reprodukovateľné cesty odstránenia klientskych presetov. Nižšie je historický stav auditu; implementácia a nové dôkazy sú v závere. Aktuálna oprava chráni import, refresh a súbežné zápisy a umožňuje bezpečné opakovanie po strate odpovede.

## Overené na hlavnom serveri bez zápisov

CapRover API potvrdilo aplikáciu `kitchenapp`, nasadenie 16, jednu repliku, `APP_ENV=prod`, `DATABASE_SCHEMA=prod`, PostgreSQL a samostatný zapisovateľný persistentný mount `/app/storage` vo volume `kitchenapp-prod-storage`. Verejné `/health` a `/ready` vrátili `ok: true`; readiness uvádza PostgreSQL. Develop má samostatnú schému aj volume. Tieto kontroly potvrdzujú konfiguráciu, nie existenciu obnoviteľnej zálohy.

Definícia `kitchenapp-db` má jednu repliku a persistentný mount `/var/lib/postgresql/data` vo volume `kitchenapp-db-data`. V `serverRepositories.ts` sa pri PostgreSQL konfigurácii používa aj PostgreSQL repository modulových balíkov; presety sú súčasťou JSONB balíka v `arcigy_module_packages`. V definíciách CapRover sa nenašla samostatná backup aplikácia. To nevylučuje zálohu spravovanú mimo CapRover; serverové timery, WAL a cieľ záloh neboli dostupné na overenie.

Aktuálny vzdialený `main` je `04f97da3e16ee89c15baa1475977efbc94249d04`; kód rizikového refreshu aj PostgreSQL repository sa zhoduje s kontrolovanými cestami. Presnú identitu zdrojového kódu bežiaceho kontajnera sa nepodarilo overiť. SSH odmietlo dostupnú identitu. Audit nemenil aplikácie, produkčné dáta ani konfiguráciu.

## Reprodukované riziká

1. `scripts/assignClientModules.ts`, `selectedRefreshPackages()`: najprv vráti refresh so zachovanými klientskymi presetmi, potom čisté systémové balíky s rovnakými ID. Posledný zápis vyhrá. Pri `--refresh-packages --write` sa uložený klientsky preset stratil. Aj `--modules all` vyberie čisté šablóny. Navyše zápisy nepoužívajú očakávaný hash, takže môžu prepísať preset vytvorený počas refreshu.
2. `src/core/module-package/module-package-service.ts`, `importPackage()`: import balíka s existujúcim ID uloží celý prinesený balík bez kontroly revízie alebo zachovania doterajších presetov. Opätovný import pôvodnej šablóny odstránil predtým úspešne uložený klientsky preset.
3. Obnova produkčných dát nie je preukázaná. Persistentný volume nepokrýva stratu hosta alebo chybné prepísanie JSONB. Podľa `docs/BACKUP_AND_RESTORE.md` chýba overené prevádzkové potvrdenie off-host záloh, PITR a obnovy reálnej zálohy. V tomto audite nebol prístup, ktorý by tieto kontroly doložil.

Tieto prvé dve chyby boli vykonané na syntetickom klientovi v dočasnom priečinku, ktorý sa následne odstránil. Nebol to test zápisom u DELFI. Samotné bežné ukladanie presetu sa pri teste nestrácalo; rizikom je neskoršie prepísanie balíka.

## Overené ochrany a ich hranice

- Dva súbežné zápisy z rovnakej revízie: jeden úspech, druhý konflikt; úspešný preset zostal uložený.
- Nová inštancia file repository načítala úspešne uložený preset. Iný klient ho nevidel.
- PostgreSQL cesta aktualizácie presetu obsahuje podmienený UPDATE podľa klienta, balíka a pôvodného hash. Jej SQL kontrakt prešiel testom; reálna súbežnosť na produkčnej databáze nebola vykonaná.
- 6 súvisiacich testovacích súborov, 44 testov prešlo. Doterajšie testy chránia zachovanie presetov v pomocnej funkcii, ale nepokrývajú následné prepísanie v celom CLI.
- V deploy workflow sa nenašiel automatický refresh/seed modulov. Audit nezistil dôkaz, že klient už presety stratil.

Lokálny reproduktor je v ignorovanom `.tmp/preset-safety-audit/reproduce.ts` a volá skutočnú službu aj CLI. Jeho výsledok: `refreshDeletesClientPreset=true`, `reimportDeletesClientPreset=true`. Neobsahuje klientské dáta ani prihlasovacie údaje.

## Potrebná oprava

Refresh musí zostaviť jeden výsledok na ID, zachovať klientské presety aj pri `all` a používať podmienený zápis voči načítanej revízii. Import musí pri existujúcom ID chrániť klientské presety a odmietnuť súbežné prepísanie; odlišný balík alebo nekompatibilné parametre vyžadujú viditeľné rozhodnutie, nie tiché odstránenie. Pridať test celého CLI, súbežný create/refresh, reimport a čítanie po reštarte. Pre neistý výsledok vytvorenia je potrebná identita operácie, aby opakovanie nevytvorilo druhý preset po strate odpovede. Potvrdenie úspechu má nasledovať až po dokončení autoritatívneho zápisu; sekundárna aktualizácia katalógu nesmie viesť k slepému zopakovaniu už uloženého presetu.

Pred produkčnou opravou zaznamenať tenantovo oddelený inventár presetov, vytvoriť a overiť obnoviteľnú zálohu databázy aj súborov a otestovať obnovu mimo produkcie. Dovtedy nepoužívať refresh existujúcich balíkov ani reimport pôvodných šablón u aktívneho klienta. Tento audit neoprávňuje nasadenie ani zásah do produkčných dát.

## Implementácia po výslovnom pokyne na opravu a release

- Import aj refresh uchovávajú existujúce presety vrátane sadzieb a identít zápisov. Refresh zostavuje jeden výsledok na ID, vrátane `all` a vlastných ID. Nezlučiteľná schéma sa odmietne pred zápisom.
- Obe repository kontrolujú revíziu a zachovanie presetov. Nový balík používa insertion-only zápis. PostgreSQL chráni aj legacy upsert atomickou podmienkou; normalizácia historického balíka nestratí jeho presety. File repository dokončí pomocné súbory pred atomickým uložením autoritatívneho JSON s fsync.
- Vytvorenie presetu a úprava sadzby majú identitu operácie uloženú spolu s presetom. Presná opakovaná požiadavka toho istého používateľa vráti pôvodný výsledok aj po strate odpovede alebo zlyhaní odvodeného katalógu. Iný obsah alebo používateľ sa odmietne. Staršia opakovaná úprava nesmie vrátiť novšiu sadzbu späť.
- Frontend zdieľa súbežné kliknutia a pri neistom výsledku ponechá presný request aj rozpracovaný formulár. Nové načítanie revízie nemení identitu neovereného zápisu. Čakanie je obmedzené na 30 sekúnd. Ledger je v pamäti stránky; nejde o obnovu rozpracovanej operácie po zatvorení prehliadača.
- Server odmieta neplatné parametre, ceny, identity operácií a klienta z payloadu. Validácia ponecháva platné nulové hodnoty neaktívnych polí a existujúce JSON metadáta. Viewer a iný tenant nemôžu zapisovať ani opakovať cudzí zápis.

## Nové dôkazy

Celý unit suite: 441 súborov, 2 978 úspešných testov a jeden preskočený. Typecheck, lint, build, čisté `npm ci`, runtime dependency policy a secret scan prešli. Build má pôvodné upozornenie na veľkosť bundlu.

Celá `npm run test:ui-regression` prešla na čerstvom izolovanom serveri: preset scenár 34 kontrol, nadväzujúci #50 32 kontrol a materiálové scenáre 19 kontrol. Komerčný panel prešiel 54 kombináciami so 6/30/100 skrinkami, dvoma veľkosťami okna a troma CSS ekvivalentmi zoomu; navigácia pri čakajúcom čítaní 16,75 ms, aktuálne chyby konzoly 0.

Pred release bol skontrolovaný existujúci CodeQL alert #29 (`js/double-escaping`) v staršom generovanom PDF.js worker bundle. Týka sa normalizácie názvu vloženej prílohy PDF; aplikácia pri podklade číta a renderuje prvú stránku, nepoužíva tento názov pre zápis súborov. Oprava presetov túto cestu nemení. Alert nebol potichu uzavretý ani vyradený z analýzy. Otvorené secret-scanning alerts sú nulové; historické alerts 1–3 majú stav revoked.

Rozšírený browser scenár presetov prešiel 34 kontrolami vrátane reálnej straty odpovede po dokončenom zápise, zachovania formulára, presného retry bez duplicity, reimportu a opätovného otvorenia. Existujúci scenár #50 bol upravený: reimport už nesmie odstrániť firemný preset; overuje zachovanie presetu aj sadzieb uložených skriniek.

`test:db-restore-drill` teraz vykonáva aj skutočné PostgreSQL preset scenáre: osem súbežných opakovaní create a labor, konflikty rôznych operácií, tenant isolation, CLI refresh podľa ID/typu/all, reimport, ochranu upsertu, legacy normalizáciu a nové spojenie. Následný pg_dump/pg_restore overuje presné hashe, presety a identity operácií. Lokálna skúška prešla; schéma mala 7 migrácií, 30 tabuliek, 71 constraints a 57 indexov, RPO 0.

Pred release bola cez oprávnené SSH vytvorená čerstvá šifrovaná off-host záloha celej produkčnej databázy, globals, storage a konfigurácie. SHA-256 archívov bol overený a databáza obnovená do izolovaného PostgreSQL bez siete. Inventár obnovených presetov sa presne zhodoval so snapshotom: 42 balíkov a 24 presetov. Obnovilo sa aj všetkých 8 projektov a 7 migrácií. Záloha a recovery key zostávajú mimo Git, oddelene a so súkromnými oprávneniami. Produkčný disk mal približne 8,4 GiB voľných; žiadne volumes ani images neboli prerezané.

Táto skúška preukazuje obnoviteľnosť konkrétnej zálohy, nie pravidelné zálohovanie alebo PITR. Zmena nevyžaduje novú databázovú migráciu. Úplnú odolnosť voči strate hosta, administrátorskému SQL alebo všetkým budúcim zmenám nemožno tvrdiť iba na základe týchto testov. Nasadenie sa eviduje osobitne presným main SHA a online overením.

## Doplnená kontrola firemného katalógu pred main release

Pri kontrole staršieho otvoreného PR #154 bol nájdený ďalší reprodukovateľný problém: preset služba znova vytvárala katalógový modul zo systémového balíka. Regresný test pred opravou zlyhal, pretože sa zmenili vlastné ID, názov, popis, šírka, tags a pricingRef. Nová pomocná funkcia mení iba packageHash existujúceho modulu. Zachováva jeho disabled stav a všetky firemné obchodné údaje.

Produkčný preset zápis teraz používa jednu PostgreSQL transakciu. Zamkne klientsky katalóg a potom balík v rovnakom poradí pre všetky moduly, pripraví validovanú zmenu proti zamknutej aktuálnej revízii, uloží balík a upraví iba modules JSON. COMMIT nasleduje až po úspechu oboch zápisov. Cache sa invaliduje až po COMMIT. Presný retry s uloženou identitou operácie nemení ani databázové revízie. File režim naďalej obnovuje zlyhanú odvodenú publikáciu pomocou durable receipt.

Rozšírený skutočný PostgreSQL drill používa aj skutočný katalógový repository. Overuje firemné metadáta, dva súbežné zápisy do odlišných modulov, nulový zápis pri presnom create/labor retry a vynútené zlyhanie katalógu pomocou triggera. Pri chybe sa tvorba presetu aj úprava práce kompletne vrátili späť; následný retry prešiel. Viewer je odmietnutý aj priamo na transakčnej repository hranici. Následná obnova zo zálohy opäť prešla.

Kontrola pravidelných záloh našla pripravené GitHub secrets pre Backblaze a bucket arcigy-kitchen-backup-2026. Zálohovací worker je iba v staršej pracovnej vetve, bez aktívneho GitHub workflow alebo serverového backup service/timer. Tieto nastavenia preto nie sú dôkazom vykonávaného zálohovania. Produkcia má WAL archive_mode=off. Manuálna šifrovaná off-host záloha a overená obnova uvedená vyššie zostávajú samostatným dôkazom.

Po doplnení katalógovej opravy prešiel celý unit suite s limitom štyroch workerov: 441 súborov, 2 979 úspešných testov a jeden existujúci preskočený. Prvý lokálny beh súbežne s buildom prekročil predvolené päťsekundové limity siedmich testov; išlo o timeouty, bez nezhody hodnôt. Obmedzený celý beh prešiel bez zvýšenia timeoutov alebo vynechania testov. Typecheck, lint, build a secret scan prešli. Lokálny browser načítal 23 kategórií záťažového projektu so 100 skrinkami a 30 dielcami, s nulovými aktuálnymi chybami konzoly.

Celá UI regresia po doplnení transakčného zápisu prešla na čerstvom izolovanom serveri. Presety 34 kontrol, #50 32 kontrol, materiály 19 kontrol; komerčný panel všetkých 54 kombinácií. Navigácia počas čakajúceho čítania reagovala za 16,14 ms, aktuálne chyby konzoly 0.

Doplnený red/green test katalogových aliasov: ak firma používa dve rôzne katalógové identity odkazujúce na ten istý balík, zmení sa hash oboch referencií a zachovajú sa ich vlastné údaje. Iný balík rovnakého typu sa nemení. Opakovaná operácia so všetkými aktuálnymi hashmi nemení revíziu.

Po doplnení aliasového scenára prešli všetky 442 unit súbory: 2 980 úspešných testov, jeden existujúci preskočený. Typecheck, build a skutočný PostgreSQL dump/restore drill opäť prešli. Frontend a transakčný protokol sa touto doplnkovou opravou nemenili.
