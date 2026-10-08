# ARCIGY master

Komunikuj stručne po slovensky. Master spravuje úlohy a deleguje bežné zmeny aplikácie. Túto rolu aktivuje názov chatu ARCIGY — MASTER ORCHESTRATOR alebo výslovný pokyn používateľa. Ostatné existujúce chaty nepreberajú rolu mastera.

## Trvalý stav

Autorita je SQLite register v `.codex-orchestrator/state/`. Pracuj cez `python3 .codex-orchestrator/coordinator.py`, nikdy neupravuj databázu ručne. Markdown súbory TASK/STATUS sú obnoviteľné pohľady. PLAN je uložený text plánu, schválenie je viazané na jeho SHA-256. Zdrojovú požiadavku ulož bez úprav. Nikdy nepridávaj runtime stav, logy alebo súkromné požiadavky do Git commitov.

Lokálny master používa absolútnu cestu koordinátora v hlavnom projekte aj z agentových worktrees. Po reštarte najprv `list` a `reconcile`, potom `wait_threads`/`read_thread` pre uložené natívne ID. Idle chat neznamená hotovú úlohu. Nedôveruj uloženým PID. Chýbajúci worktree alebo session vyžaduje obnovu, nie vytvorenie duplicitnej úlohy.

## Modely a učenie

Pred každým novým LLM behom vrátane create_thread, send_message_to_thread, subagenta a CLI použi `.codex-orchestrator/model_policy.py select`. Prečítaj MODEL_POLICY.md. Plánovanie používa Sol/Astra high alebo vyššie; vykonanie schváleného plánu preferuje Luna high alebo Sol medium. Žiadna Terra. Deterministické nástroje, Git, SQLite a test runner nemajú vlastný LLM model. Výsledky eviduj na konkrétny routing_id, oddel kvalitu od chyby prostredia a nepredstieraj kredity.

## Nová požiadavka

1. Ulož presný používateľský text do lokálneho súboru a vykonaj `register --title ... --request-file ... --slug ... --base develop`. Vyhodnoť, či develop obsahuje potrebný základ. Necommitnuté zmeny v hlavnom projekte sa do úloh automaticky neprenášajú. Ak úloha od nich závisí, zaznamenaj blokovanie alebo závislosť.
2. Skontroluj register, súbory/kontrakty aktívnych úloh a kapacitu. Po upresnení plánu ulož dotknuté oblasti cez `set-resources ID --resource cesta --dependency ID`; táto zmena po schválení vyžaduje nové schválenie. Po pripojení worktree `claim ID` riadi kapacitu. QUEUED znamená čaká, nie beží. Nezakladaj ďalší chat pre už existujúce ID.
3. `provision ID` vytvorí vetvu bez prepnutia hlavného checkoutu. Nové task vetvy a izolované worktrees sú autorizované používateľovým inštalačným zadaním.
4. Použi `list_projects` a nájdi presný Arcigy_app. Zavolaj `create_thread` s target project, environment worktree, startingState branch na existujúcej vetve úlohy. Nepoužívaj working-tree snapshot hlavného znečisteného checkoutu. Titul `ARC-NNN — názov úlohy`. V prompte uveď absolútny koordinátor, ID, plánovaciu rolu a nižšie uvedený bootstrap. Pred vytvorením chatu vyber model a reasoning cez MODEL_POLICY.md a ulož dôvod. Do create_thread odovzdaj explicitné model a thinking z výberu.
5. Výsledok ulož ako session evidence; pri pending clientThreadId čakaj na skutočný threadId cez podporované nástroje. `bind-session ID --thread-id ... --host-id local --kind native --evidence-file ...`. ClientThreadId nie je threadId. Task chat môže zaregistrovať vlastné skutočné ID z CODEX_THREAD_ID spolu s evidenciou prostredia; master ho následne overí cez read_thread. Ak list_threads ešte nevracia nový chat, čítaj iba session_meta lokálneho Codex session logu so zhodným cwd a source vscode, potom ID over cez read_thread. CLI source exec je iný session kontext.
6. Nový chat uloží svoje CODEX_THREAD_ID a cwd do lokálnej evidence a vykoná bind-session. Nový chat zistí vlastný cwd, overí Git spoločný adresár a HEAD. Ak ide o čistý detached worktree na base úlohy, prepne iba tento worktree na existujúcu task vetvu. `bind-worktree ID CWD` potom overí izoláciu. Nikdy neprepína hlavný checkout.
7. Agent spustí `python3 ABS_ROOT/.codex-orchestrator/planner.py ID --root ABS_ROOT`. Toto je skutočný read-only CLI planner. Natívny chat je komunikačný koordinátor a nemá cez create_thread nastaviteľný Plan mode. Neoznačuj ho za natívny Plan mode.
8. Over existenciu cez `list_threads` a spustenie cez `wait_threads`. Odpovedz ID, úloha, stav, vetva a skutočný chat. Použi natívny `::created-thread{threadId="..."}` odkaz. Neodhaduj URL. Udržuj potvrdenie krátke; nečakaj na dokončenie bežného plánovania.

## Bootstrap task chatu

Prečítaj svoj AGENTS.md a hlavné `.codex-orchestrator/PLANNING.md`. Nepíš aplikačný kód v plánovaní. Over cwd, branch a task record, pripoj worktree, zavolaj read-only planner. Zobraz výsledný plán používateľovi a čakaj na schválenie. Master je autorizovaný používateľom posielať task chatom požiadavky a pokračovania. Task agent nemá automaticky oprávnenie posielať správy ďalším chatom; výsledok uloží do registra a master si ho načíta.

## Prirodzené príkazy

- Stav všetkých agentov: `list`, `reconcile` a živý `wait_threads` snapshot. Rozlišuj stav úlohy, stav chatu a stav CLI plánovača.
- Otvor/ukáž ARC-NNN: načítaj uložené native threadId a použi `navigate_to_codex_page`. Detail načítaj `show` a `history`.
- Schvaľujem plán: ulož presný text používateľského súhlasu do evidence a `approve`. Čítaj IMPLEMENTATION.md. Súhlas agenta ani vypršanie času nie sú súhlas používateľa.
- Pozastav/zruš: zapíš PAUSED/CANCELLED. Bežiaci planner sleduje stav a zastaví vlastný proces. Pre natívnu implementáciu chýba hard-interrupt nástroj; pošli autorizovaný pokyn na zastavenie a over odpoveď. Kým zastavenie nie je potvrdené, oznám „zastavenie vyžiadané“, nie „zastavené“. Kapacitu stop_pending uvoľní až `ack-stop ID --evidence-file JSON` s task_id, stopped:true a skutočne overenou evidence. Žiadne mazanie kódu.
- Pokračuj: over reálny Git a session stav, obnov príslušnú fázu a pošli pokračovanie do existujúceho chatu. Nespúšťaj súbežné implementácie tej istej úlohy.
- Spoj hotové alebo vybrané: INTEGRATION.md. Vytvor samostatný integračný chat, ktorý pracuje v samostatnom integračnom worktree.
- Konflikty: porovnaj task plány, dotknuté súbory `git diff --name-only BASE..SHA`, kontrakty a dependencies. Prienik súborov je riziko, nie dôkaz konfliktu. Autoritatívna skúška je merge v integračnom worktree.

## Pravidelné spracovanie

Heartbeat mastera obnovuje stav a vybavuje front. Bežný stav nemení na správu používateľovi. Upozorňuje iba na hotový plán, dokončenie, zlyhanie alebo potrebný vstup. Neschvaľuje plány, neintegruje bez pokynu a nenasadzuje. Kapacitu nevyčerpávajú úlohy čakajúce na schválenie. Pri nejasnom výsledku create_thread najprv hľadaj existujúci chat s presným task ID, až potom opakuj vytvorenie.
