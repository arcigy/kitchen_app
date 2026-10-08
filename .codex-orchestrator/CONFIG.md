# Konfigurácia orchestrátora Arcigy

Overené pri inštalácii 8. októbra 2026. Hodnoty opisujú lokálne prostredie, nie produkčné oprávnenia.

## Kapacita a runtime

`config.json` nastavuje `max_concurrency: 3`. Počítač má 15 logických CPU a 24 GiB RAM. Tri súbežné úlohy sú konzervatívny východiskový limit, ktorý necháva priestor aplikácii, prehliadaču a testom. Je konfigurovateľný; nejde o prísľub dostupnej kapacity modelu, účtu ani nástrojov. Náročné prehliadačové a renderovacie testy môžu vyžadovať nižšiu súbežnosť.

Táto relácia nástrojov poskytuje samostatný limit štyroch súčasne aktívnych agentov vrátane rodiča. Tento limit sa nemení úpravou `max_concurrency` a nepredstavuje štyroch dodatočných podagentov.

| Súčasť | Zistená hodnota |
| --- | --- |
| Node.js | 22.23.2 |
| npm | 10.9.8 |
| Python | 3.9.6, bez štandardného `tomllib` |
| Codex CLI | 0.159.0-alpha.12.1 |
| Predvolený model používateľa | `gpt-6-astra` |
| Predvolená intenzita uvažovania | `high` |
| Predvolená servisná úroveň | `default` |

Používateľ následne výslovne požiadal vedomý výber modelu pre každý beh. Nové natívne chaty a pokračovania dostávajú explicitné model a thinking podľa MODEL_POLICY.md. CLI planner tiež dostáva explicitné -m a model_reasoning_effort; --ignore-user-config naďalej izoluje ostatné lokálne nastavenia.

## Rozdelenie zodpovedností

Natívny chat úlohy slúži na koordináciu, zobrazenie plánu a komunikáciu. Plán pripravuje CLI worker s `codex exec --sandbox read-only`, výstupom JSONL a uložením záverečnej odpovede. Plánovanie nesmie spúšťať aplikačné služby ani meniť projekt.

Vystavený nástroj `create_thread` nemá parameter na zapnutie natívneho Plan režimu. Čítací CLI plánovač preto nie je potvrdením, že natívny chat beží v Plan režime. Nástroje pre natívne chaty zároveň nevystavujú všeobecný príkaz na ich tvrdé prerušenie. Pozastavenie v registri musí zabrániť novému prideľovaniu práce; zastavenie už bežiaceho natívneho chatu vyžaduje dostupné ovládanie používateľa. Vlastný CLI proces možno ukončiť iba cez jeho overené vlastníctvo.

Runtime register používa lokálny SQLite v ignorovanom adresári `state/`. Aj `tasks/` a `logs/` sú ignorované. Ide o stav orchestrátora, nie databázu aplikácie. Do registrov, plánov ani logov nepatria hodnoty `.env`, tokeny, heslá alebo súkromné klientské dáta. Kontroluje sa aj obsah ignorovaných výstupov; ignorovanie Gitom neznamená ochranu tajomstiev.

## Architektúra aplikácie

Aplikácia používa TypeScript, Three.js, Vite a priamo DOM, bez UI frameworku. `src/app.ts` je kompozičná vrstva; správanie patrí do príslušných controllerov v `src/app/`, do `src/layout/`, `src/ui/`, `src/modules/` alebo `src/core/`. Moduly majú vlastnú geometriu, ovládanie a typy. Ceny, BOM, renderovanie a rozdiely zákazníckych modulov sa musia zachovať.

Katalógy a projektové súbory používajú súborové úložisko oddelené podľa klienta. Profil klienta používa prehliadačové `localStorage`; aktuálny používateľský repozitár používa seed v pamäti. V kontrolovaných závislostiach a vstupných bodoch sa nenašla samostatná databázová služba aplikácie. Kritické hranice sú `ClientContext`, `ClientCatalog`, vlastníctvo projektov/fáz a serverové šifrovanie `.fqp`.

## Služby a izolované testy

Pri kontrole boli obsadené `127.0.0.1:5180` a `127.0.0.1:5191`. Ich procesy patria existujúcemu prostrediu a orchestrátor ich nesmie zastaviť ani použiť na zápisové testy.

| Nastavenie | Skutočné správanie |
| --- | --- |
| `npm run dev` | Vite na `127.0.0.1:5180` |
| `npm run dev:local` | Spustí worker aj Vite, frontend port je pevne 5180 |
| `BLENDER_WORKER_HOST` | Host workera, predvolene `127.0.0.1` |
| `BLENDER_WORKER_PORT` | Port workera, predvolene `5191` |
| `vite.config.ts` | Proxy `/api` a `/storage` pevne na `http://127.0.0.1:5191`; `strictPort: false` |
| `KITCHEN_UI_BASE_URL` | URL pre smoke a kitchen UI testy |
| `PRICING_UI_BASE_URL` | URL pre pricing, module-properties a portable-material UI testy |
| `KITCHEN_APP_PROJECT_ROOT` | Podporuje ho `src/server/workerServer.ts`, nie aktuálny vstup cez `server/workerServer.ts` |

`scripts/worker.ts` načíta `.env.local` a `.env` z pracovného adresára a potom importuje `server/workerServer.ts`. Tento worker určuje koreň dát cez `process.cwd()`. Samotná zmena portu alebo `KITCHEN_APP_PROJECT_ROOT` preto neizoluje dáta. Bezpečné prostredie potrebuje vlastný pracovný adresár, overené testovacie dáta, čisté prostredie procesu, vlastnú Vite proxy a explicitný `--strictPort`. Obidve UI URL premenné musia smerovať na ten istý izolovaný frontend.

Časť PDF UI skriptov vytvára a maže fixture projekty pod `process.cwd()/storage`. Presmerovanie URL bez oddeleného pracovného adresára nestačí. Kopírovanie existujúceho `storage/` alebo `.env` nie je automatická príprava testov.

## Kontroly a CI

Po štrukturálnej alebo UI zmene sa vyžaduje:

```sh
npm run typecheck
npm test
npm run build
npm run test:ui-regression
```

Po UI zmene treba navyše načítať izolovanú aplikáciu v prehliadači a potvrdiť nulový počet aktuálnych chýb konzoly. `test:ui-regression` spája šesť samostatných UI sád a vyžaduje pripravený frontend, backend aj testovacie prihlásenie. Nenahrádza ho samotný build. Ak nie je bezpečne pripravené prostredie, výsledok je `NOT RUN` s konkrétnym dôvodom, nikdy `PASS`.

Aktuálny CI workflow sa spúšťa pre PR do `staging` a `main`, nie do `develop`. Kontroluje typecheck, voliteľný lint, testy a build na Node 22. Deploy workflow používa Node 20 a reaguje na push do `main` aj `develop`. Integráciu možno pripraviť lokálne; push alebo vzdialený merge s následným nasadením potrebuje samostatné explicitné oprávnenie. Inštalácia orchestrátora workflow súbory nemení.
