# Integrácia

Spúšťa ju pokyn používateľa na spojenie vybraných alebo všetkých dokončených úloh. Master zavolá `start-integration ID... --base develop`, potom `provision ARC-INTEGRATION-NNN`. Vytvorí samostatný natívny integračný chat v Arcigy_app s worktree z existujúcej integračnej vetvy. Agent zaregistruje skutočné CODEX_THREAD_ID cez `bind-session`, svoj cwd cez `bind-worktree` a spustí `integrate --resume ARC-INTEGRATION-NNN`. Koordinátor vytvorí checkpoint a vykoná overené mergy. Agent používa svoj pripojený integračný worktree, nie hlavný checkout ani feature worktrees. CLI fallback bez natívneho chatu vie vytvoriť samostatný lokálny worktree. Koordinátorove worktrees nie sú automaticky natívne chaty; native threadId a worktree treba zaznamenať z reálnych nástrojov.

Vstupy musia mať schválený plán, čistú vetvu, overený konečný SHA a validácie viazané na SHA. Zoradenie musí rešpektovať závislosti. Pri konflikte zachovaj rozpracovaný merge a vetvy. Analyzuj obe strany. Nepoužívaj plošné ours/theirs, reset --hard, clean ani force-push. Ak sú požiadavky nezlučiteľné, vyžiadaj rozhodnutie používateľa.

Každý merge aj finálny výsledok potrebujú testy. `--resume` pokračuje v tom istom integračnom zázname. Pred pokračovaním over, či nie sú konflikty a či sa zdrojové SHA nezmenili. Ak develop pokročil, novú základňu zapracuj a znovu otestuj pred PR.

Do develop sa zmeny dostávajú cez PR podľa existujúcich pravidiel. Push develop spúšťa nasadenie; aktuálna inštalácia žiadne nasadenie neautorizuje. Lokálne integrované a otestované zmeny nie sú automaticky nasadené ani INTEGRATED v develop. Finalizuj iba po overení, že cieľ obsahuje výsledok a existuje evidencia PR/CI. Pôvodné task vetvy zachovaj.

Inštalačné sample úlohy možno integrovať a finalizovať výhradne na ich disposable integračnej vetve. Sample nevyhodnocuje funkčnosť kuchynskej aplikácie. Nikdy nemiešaj sample úlohy s produkčnými úlohami pri pokyne „spoj všetko“.
