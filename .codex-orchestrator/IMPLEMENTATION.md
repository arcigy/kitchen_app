# Implementácia

Pokračuj v rovnakom natívnom task chate. Pred spustením implementačného ťahu master vyberie execution model podľa MODEL_POLICY.md a odovzdá model/thinking v send_message_to_thread. Silné plánovanie neznamená pokračovať automaticky na rovnakom drahom modeli. Pri priamom schválení používateľom v task chate ulož APPROVED; ak aktuálny model nezodpovedá novému výberu, implementáciu prenechaj nasledujúcemu správne nakonfigurovanému ťahu, ktorý odošle master pri spracovaní frontu. Najprv over schválenie plánu cez `begin ID`, pridelený worktree, vetvu a Git stav. Upravuj iba pridelený worktree. Natívneho implementátora izoluje pracovný postup a Git worktree; nejde o OS ochranu pred úmyselným prístupom k ostatným priečinkom.

Postupuj podľa schváleného plánu, AGENTS.md a docs/git-github-codex-workflow.md. Aplikačný kód patrí vlastníckym controllerom a modulom, nie do src/app.ts. Chráň ceny, BOM, export, tenant dáta a modulové rozdiely.

Pred službami a testami čítaj SAFETY.md. Tracked .env sa môže objaviť aj v čerstvom worktree. Nepoužívaj ho na pripojenie k produkcii. Bez bezpečného lokálneho fixture prostredia sú potrebné testy NOT RUN, nikdy PASSED. Nesmieš používať hlavné storage ani cudzie porty.

Používateľ autorizoval malé task commity. Pridávaj konkrétne súbory, nikdy `git add -A` v hlavnom projekte. Necommituj .env, runtime orchestration, dist, exporty ani zákaznícke dáta. Zaznamenaj SHA, spusti `validate ID` a potom `ready ID`. READY_FOR_INTEGRATION vyžaduje čistú task vetvu, schválený aktuálny plán a úspešné kontroly rovnakého SHA. UI zmena vyžaduje aj browser kontrolu a nula aktuálnych console errors.

Ak kontrola zlyhá, oprav príčinu v rozsahu plánu alebo nastav BLOCKED s konkrétnou príčinou. Rozpracovanú prácu zachovaj. Implementátor nemerguje develop, nenasadzuje a nepushuje produkčné vetvy.

Po overení dokončenia master uloží quality_pass pre routing_id implementačného behu s SHA a výsledkami požadovaných kontrol. Pri neúspechu odlíši chybu riešenia od chyby prostredia; len prvá je podkladom na automatické zvýšenie modelu. Ďalší pokus dostane nový routing_id a zachová predchádzajúcu prácu.
