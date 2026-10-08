# ARCIGY MASTER ORCHESTRATOR

Ovládanie prebieha v pripnutom chate `ARCIGY — MASTER ORCHESTRATOR`. Stačí napísať novú požiadavku, požiadať o stav alebo o spojenie hotových úloh. Master registruje úlohy a vytvára samostatné natívne chaty v projekte Arcigy_app.

## Bežné používanie

- „Pridaj možnosť kopírovania kuchynských skriniek.“ založí novú úlohu a plánovanie.
- „Ukáž stav všetkých úloh.“ načíta register aj dostupný živý stav.
- „Otvor ARC-003.“ otvorí existujúci task chat.
- „Schvaľujem plán ARC-003.“ dovolí implementáciu konkrétnej uloženej verzie plánu.
- „Pozastav ARC-003.“ vyžiada zastavenie a zachová prácu.
- „Pokračuj na ARC-003.“ obnoví existujúcu úlohu po overení stavu.
- „Spoj všetky hotové úlohy.“ spustí samostatného integračného agenta. Sample úlohy sa automaticky nezahŕňajú.

V task chate možno diskutovať priamo. Plánovanie používa technicky obmedzený read-only CLI proces, ktorý natívny chat spustí a ktorého plán zobrazí. Cez dostupný nástroj create_thread nemožno zapnúť natívny Plan mode. Natívny chat a CLI plánovač majú rozdielne reálne session ID.

## Modely

Výber modelu je explicitný pre každý LLM beh a pokračovanie. Plány pripravuje Sol high alebo pri náročnosti Astra xhigh. Vykonanie schváleného plánu začína najmä na Luna high, náročnejšie na Sol medium. Terra je vylúčená. [Politika modelov](MODEL_POLICY.md) ukladá výsledky a prispôsobuje ďalší výber podľa overenej kvality, času a dostupných tokenov. Kredity bez meraného zdroja ostávajú neznáme.

## Čo je uložené

`coordinator.py` je Python 3 stdlib koordinátor. SQLite transakcie chránia číslovanie, stav a históriu; zápisy súborov sú atomické. `planner.py` spúšťa read-only Codex a uchováva výsledok aj diagnostiku. Nevyžaduje ďalší platený účet ani API kľúč; používa nainštalovaný Codex s existujúcim prihlásením.

- `state/ledger.sqlite3`: autoritatívny register a história.
- `tasks/ARC-NNN/`: pôvodná požiadavka, plán, stav, planner logy.
- `integrations/`: záznamy integrácií.
- `logs/`: výsledky konkrétnych kontrol viazané na commit SHA.
- `config.json`: nastaviteľná kapacita a príkazy validácie.

Runtime adresáre sú ignorované v Gite. Zachovávajú sa na tomto Macu pri reštarte aplikácie; nejde o cloudovú zálohu. Reštartuje sa čítaním `list`, `reconcile` a overením uložených session cez natívne nástroje. Koordinátor nevyhodnocuje starý PID ako dôkaz bežiaceho procesu.

## Hranice

Predvolená kapacita sú tri pracujúce úlohy. Čakajúce úlohy sa evidujú; nový požiadavkový text sa nestratí. Kapacita je nastaviteľná, nejde o deklaráciu limitu predplatného. Pravidelná kontrola frontu je v desktop aplikácii nastavená každých 10 minút; pri nezmenenom stave neposiela oznámenie. Vyžaduje dostupný lokálny host a aplikáciu, nie je serverom bežiacim pri vypnutom Macu.

Natívne implementačné chaty nemajú cez dostupné nástroje hard-interrupt. Orchestrátor preto rozlišuje vyžiadané a potvrdené zastavenie a až po potvrdení uvoľní kapacitu. Read-only planner vie zastaviť vlastný proces aj potomkov.

Bežná validácia vyžaduje skutočne overené izolované fixture prostredie. Hlavné servery 5180/5191, zákaznícke storage a zdedené produkčné .env sa nesmú použiť. Bez bezpečného prostredia sa testy označia NOT RUN a úloha neprejde do READY_FOR_INTEGRATION. Pozri SAFETY.md.

Integrácia ostáva na samostatnej lokálnej vetve, dokým nie je autorizovaný PR a následné nasadenie. Push develop už v tomto repozitári spúšťa deploy. Inštalačné sample commity sa nikdy nemergujú do develop/main.

## Dokumentácia a overenie

- [Pracovný postup mastera](ORCHESTRATOR.md)
- [Plánovanie](PLANNING.md), [implementácia](IMPLEMENTATION.md), [integrácia](INTEGRATION.md)
- [Konfigurácia](CONFIG.md) a [bezpečnosť](SAFETY.md)
- [Výsledky inštalácie](VERIFICATION.md)

Lokálne testy infraštruktúry:

```sh
python3 -m unittest discover -s .codex-orchestrator -p 'test_*.py' -v
```

Testy používajú dočasné Git repozitáre. Planner unit testy simulujú CLI na overenie zlyhaní; samostatný živý inštalačný test overuje skutočný Codex sandbox a natívne chaty.
