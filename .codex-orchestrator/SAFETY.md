# Bezpečnostné hranice orchestrátora

## Východiskový stav sa musí zachovať

Pri vstupnej kontrole 8. októbra 2026 bol checkout na `main`, commit `b6ef04c6c3dd5f2974f137209f74013c2f8b9641`. `git status` obsahoval 717 položiek: 678 modifikovaných a 39 netrackovaných položiek. Nettrackovaný adresár môže obsahovať viac súborov. Ignorovaných bolo 7 097 súborov, vrátane 693 súborov v `storage/`. Počas inštalácie môžu pribudnúť súbory orchestrátora; tieto čísla sú vstupný záznam, nie očakávaný konečný stav.

Existujúca práca sa nesmie stashovať, resetovať, hromadne stageovať, prepisovať ani automaticky prenášať do nových úloh. Žiadne `git clean`, `git reset --hard` ani automatická oprava ignore pravidiel. Pred operáciami s Gitom platí `docs/git-github-codex-workflow.md` a explicitný rozsah oprávnenia používateľa. Žiadny automatický priamy push do `main` alebo `develop`.

## Tracked `.env` je prekážka spustenia

`.env` je už trackovaný a lokálne modifikovaný. Nový Git worktree zdedí commitnutú verziu `.env`, aj keď ho dnešný `.gitignore` ignoruje. Worktree preto sám osebe nie je bezpečné runtime prostredie. Tiež je trackovaných 26 súborov pod `dist/`; ignorovanie neodstraňuje existujúce sledovanie Gitom.

Implementačný agent môže upravovať zdrojový kód bez spúšťania služieb. Koordinátor odmieta aplikačnú validáciu pri neprázdnych hodnotách v `.env`; agent nesmie spustiť služby, kým nie je pripravené overené izolované fixture prostredie bez reálnych tajomstiev. Kontrola má zisťovať prítomnosť a pôvod bez vypisovania hodnôt. `.env`, `.env.local`, súkromné klientské súbory ani produkčné úložisko sa automaticky nekopírujú. Čítací plánovač nesmie tieto súbory otvárať a nesmie importovať vstupný bod služby.

Tento dokument neurčuje, že samotná sandbox politika zabráni čítaniu tajomstiev. `read-only` obmedzuje zápis, nie automaticky všetky čítania alebo sieťové operácie. Potrebná je aj vhodná príprava pracovného adresára, obmedzenie nástrojov a dodržanie zákazu čítania citlivých dát.

## Izolácia služieb a dát

- Zachovať existujúce služby na portoch 5180 a 5191. Port je len adresa služby, nie dôkaz vlastníctva procesu.
- Zastavovať iba procesy vytvorené konkrétnou úlohou s overenou identitou. Nepoužívať plošné `pkill`, zabíjanie podľa názvu procesu ani uvoľňovanie cudzieho portu.
- Každá zápisová úloha potrebuje samostatný pracovný adresár, vlastné porty, vlastné testovacie storage a vlastný prehliadačový kontext.
- Aktuálny worker používa pracovný adresár ako koreň dát. Vite proxy je pevná. Presné obmedzenia a premenné uvádza `CONFIG.md`.
- Bez prípravy nesmie UI regresia pristupovať k existujúcej aplikácii. UI test môže meniť katalóg, projekt alebo súbory fixture.
- Žiadne migrácie, mazanie storage, externé AI volania s klientskymi dokumentmi ani pripájanie k produkčným službám bez osobitného explicitného oprávnenia.

## Plán, schválenie a pozastavenie

Plán sa schvaľuje pre konkrétnu úlohu a jeho konkrétnu verziu. Zmena plánu nesmie zdediť staré schválenie bez kontroly. Schválenie implementácie nepredstavuje automatické schválenie produkčného nasadenia, mazania dát alebo zásahu do nesúvisiacej práce.

Natívne API neposkytuje prepínač Plan režimu ani všeobecné tvrdé prerušenie natívneho chatu. Stav `PAUSED` alebo `CANCELLED` v registri preto nie je dôkazom zastavenia už bežiaceho natívneho agenta. Koordinátor musí zastaviť nové prideľovanie a uviesť, ak je potrebné používateľské zastavenie v UI. Vlastný CLI worker môže sledovať stav registra a ukončiť iba vlastnú procesovú skupinu.

Limit troch súbežných úloh je lokálne pravidlo koordinátora. Nesmie sa obchádzať tvrdením, že samostatný chat alebo interný podagent spotrebúva inú kategóriu kapacity. Exkluzívne zámky konfliktových oblastí a integračnej operácie majú zabrániť súbežným zápisom do tej istej práce.

## Integrácia a nasadenie

Pred integráciou treba overiť aktuálny diff, hranice úlohy, výsledky kontrol a konfliktové oblasti. Staging musí uvádzať konkrétne povolené súbory; nikdy automatické `git add -A` v pôvodnom špinavom checkoute. Výstupy, `.env`, súkromné dáta, runtime SQLite a logy nesmú byť súčasťou commitu.

Push do `develop` v tomto repozitári spúšťa CapRover deploy. Lokálna integrácia, príprava PR a vzdialený merge preto nie sú zameniteľné operácie. Produkčné alebo iné deployujúce operácie vyžadujú osobitné explicitné oprávnenie; všeobecné zadanie na inštaláciu orchestrátora ho neposkytuje. Existujúce CI a deploy workflow sa počas tejto inštalácie nemenia.

## Čo znamená výsledok testu

`PASS` vyžaduje skutočne vykonanú kontrolu nad príslušnou verziou práce. `NOT RUN` označuje nevykonanú kontrolu a musí uviesť dôvod, napríklad neschválenú `.env` fixture, chýbajúci izolovaný backend alebo nepripravené testovacie dáta. Neúspech treba zaznamenať ako `FAIL`, vrátane rozsahu a relevantného výstupu bez tajomstiev.

Úspešný test koordinátora nepotvrdzuje funkčnosť kuchynskej aplikácie ani produkčnú pripravenosť. Žiadna požadovaná kontrola sa nesmie vyhlásiť za vykonanú iba na základe existencie skriptu, staršieho reportu alebo plánu.
