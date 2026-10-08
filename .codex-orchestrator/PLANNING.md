# Plánovanie

Každá nová úloha začína plánovaním. Natívny task chat zabezpečuje rozhovor s používateľom; plán vytvára `.codex-orchestrator/planner.py` cez `codex exec --sandbox read-only --ignore-user-config --ignore-rules`, s vypnutým apps a zakázanou eskaláciou. CLI thread ID sa ukladá z reálnej udalosti `thread.started` do `tasks/ID/planner.json`. Toto ID nie je ID natívneho chatu.

Planner číta relevantný kód a pravidlá, ale nepíše kód, nespúšťa služby a nečíta produkčné .env ani zákaznícke storage. Výsledok vráti ako finálny text. Rodičovský wrapper ho uloží cez koordinátor do `tasks/ID/PLAN.md`. Wrapper kontroluje pracovný strom pred a po plánovaní. Zlyhanie uchováva logy a blokuje úlohu.

Plán obsahuje pôvodné požiadavky, dotknuté komponenty, API a dátové dôsledky, súvisiace úlohy a konflikty, kroky implementácie, akceptačné kritériá, testy a riziká. Rozlišuj základ vetvy od necommitnutej práce v hlavnom projekte.

Úpravu požiadaviek ulož ako doplnenie, pôvodný text neprepisuj. Po prepracovaní plánu treba nové schválenie. Používateľ môže diskutovať priamo v natívnom chate. Pokračovanie CLI kontextu nie je potrebné, pretože ďalší plán dostane pôvodnú požiadavku, uložený plán a doplnenia; každý skutočný CLI session identifikátor ostáva v logoch.

Súhlas musí byť skutočná správa používateľa, uložená ako evidence. Automatizácia ani agent ju nesmú predstierať. Výnimka: používateľ výslovne autorizoval neškodné inštalačné testy vrátane implementácie a zlúčenia vzoriek. Toto oprávnenie sa nevzťahuje na bežné funkcie aplikácie.
