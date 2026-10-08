# Výber modelov a učenie z výsledkov

Používateľ 8. októbra 2026 výslovne požiadal rozhodovanie o modeli a reasoning pri každom novom agentovom behu aj pokračovaní. Platí pre natívne chaty, subagentov a CLI workerov. Git, SQLite, kompilátor a ostatné deterministické nástroje nemajú vlastný model; samostatný LLM sa pre ne nespúšťa. Model samotného práve bežiaceho master ťahu sa tým spätne nemení.

## Východiskový výber

| Fáza | Bežná úloha | Náročná úloha |
| --- | --- | --- |
| Implementačný plán | GPT-6.1 Sol, high | GPT-6 Astra, xhigh; max pri potrebe |
| Vykonanie schváleného plánu | GPT-6 Luna, high | GPT-6.1 Sol, medium |
| Zložitá implementácia | GPT-6.1 Sol, high | Sol xhigh iba s konkrétnym dôvodom |
| Integrácia | GPT-6.1 Sol, medium | Sol high/xhigh podľa konfliktov |
| Rutinná koordinácia | GPT-6 Luna, high | Sol medium pri potrebe |

Terru nepoužívaj. Plánovanie nikdy nezlacňuj pod Sol high. Astra pri execution vyžaduje výnimočný konkrétny dôvod a overené zlyhania nižších nastavení tej istej úlohy; nie je bežným stupňom automatickej eskalácie. Používateľovo „0,01 %“ vyjadruje výnimočnosť, nie merateľnú garanciu podielu budúcich behov.

Zložitosť rozhodni podľa rozsahu, nejasnosti, počtu komponentov, rizika regresie, dátových hraníc a kvality schváleného plánu. Nerozhoduj iba podľa počtu riadkov požiadavky. Úzka zmena s presným plánom typicky patrí Lune high. Viac previazaných controllerov alebo nový kontrakt typicky Sol medium; nový nejasný návrh patrí silnejšiemu plánovaniu.

## Korekcia používateľa: Arcigy feedback a konektor

Používateľ 8. októbra 2026 označil Astra xhigh pre túto prácu za nadbytočnú: „myslím že je zbytočné používať xhigh astra na to. tam sú vačšinou jednoduché veci .“ Pri ARC-003 a bežných feedback opravách začni plánovanie na Sol high (simple/medium), vykonanie na Luna high alebo pri konkrétnej technickej náročnosti Sol medium. Samotné prepojenie Odoo a konektora nie je dôvod klasifikovať úlohu ako hard/complex a spustiť Astru. Silnejší model vyžaduje konkrétny náročný problém alebo overenú kvalitatívnu chybu nižšieho nastavenia. Táto korekcia výberu je používateľská preferencia, nie nameraný quality_fail ani dôkaz spotreby kreditov. Zrušený pôvodný beh zachovaj v histórii; nevytváraj z neho úspech ani zlyhanie kvality.

## Povinný postup pred LLM behom

1. Zavolaj `python3 .codex-orchestrator/model_policy.py select ARC-NNN --phase planning|execution|integration|coordination --complexity simple|medium|hard|complex|exceptional --reason "konkrétny dôvod"`.
2. Ulož vrátený routing_id k behu. Výsledok obsahuje model, reasoning, dôvod, počet použiteľných výsledkov a prípadný lacnejší experiment.
3. Native `create_thread`: explicitné `model` a `thinking`. Native `send_message_to_thread`: tiež explicitné `model` a `thinking`; tým sa rovnaký chat prepne z plánovacej na implementačnú konfiguráciu. Subagent potrebuje explicitný model/reasoning a nový kontext podľa dostupného API.
4. CLI planner vykoná výber sám a odovzdá `-m MODEL` a `-c model_reasoning_effort="EFFORT"`. Root config nemení.
5. Ak runtime nastavenie odmietne, zaznamenaj infrastructure_failure. Nevyhlasuj, že požadovaný model bežal, a neprepínaj ticho na iný.

Task chat koordinujúci CLI planner používa routing coordination pre vlastné administratívne kroky, zatiaľ čo samotný plán vždy dostane planning model. Ak natívny chat priamo navrhuje alebo zásadne prepracúva plán, aj jeho pokračovanie musí dostať planning model.

## Ako sa politika učí

SQLite uchováva každé rozhodnutie, výsledok a zmenu odporúčania. `model_policy.py history` a `status` ukážu históriu a aktuálny stav.

- `quality_pass`: výsledok potvrdený požadovanými testami alebo schválením plánu používateľom.
- `quality_fail`: konkrétna overená chyba uvažovania, nesplnené kritérium či regresia spôsobená riešením.
- `infrastructure_failure`: nedostupná sieť/model, chýbajúce závislosti, sandbox, prostredie alebo prerušený runtime. Samo osebe nezvyšuje model.
- `awaiting_review`: plán vznikol, ale ešte nebol schválený. Úspešný exit CLI nie je dôkaz kvality plánu.
- `cancelled`: používateľ zastavil beh; nejde o modelové zlyhanie.

Overené kvalitatívne zlyhanie posunie ďalší porovnateľný beh vyššie. Po aspoň troch overených úspechoch, ktoré sú pomalé alebo spotrebujú veľa meraných tokenov, politika skúsi o stupeň lacnejšiu konfiguráciu. Ak experiment zlyhá, vráti sa vyššie. Zníženie pri plánovaní stále rešpektuje silný model a high+ reasoning. Predvolené prahy 300 sekúnd a 30 000 tokenov sú nastaviteľné pracovné heuristiky v model-policy.json, nie nameraná hranica kvality modelov.

Výsledok zaznamenaj cez `outcome ROUTING_ID --file JSON`. Vždy uveď evidence a verified. Kvalitatívne výsledky vyžadujú verified:true. Čakajúci výsledok možno po kontrole raz finalizovať; rovnaké opakovanie nič neduplikuje a protichodné finálne výsledky sa odmietnu.

CLI planner automaticky meria trvanie a tokeny z turn.completed a zapisuje awaiting_review. Po používateľovom schválení master zoberie routing_id z planner.json a zapíše quality_pass s dôkazom súhlasu ku konkrétnemu plan_sha256. Po požiadavke na prepracovanie rozlíši novú požiadavku od skutočnej chyby plánu; zmena názoru nie je automaticky quality_fail.

Pri natívnej implementácii master po dokončení spojí routing_id, skutočný turn ID, čas z wait_threads/read_thread a validáciu rovnakého SHA. Zelené požadované testy a splnené akceptačné kritériá dovoľujú quality_pass. Samotné „hotovo“ od agenta nestačí. Merané tokeny sa doplnia iba ak ich poskytuje konkrétny runtime výstup; inak zostanú null. Pri zmene modelu zachovaj rovnaký task chat a rozpracované commity, nový beh dostane nové routing_id.

Inštalačné sample úlohy, syntetické testy a probe behy majú eligible:false. Nedovoľ, aby zlepšovali úspešnosť pre reálne úlohy. Historické behy pred zavedením politiky sa spätne neoznačujú ako riadené touto politikou.

## Spotreba a hranice

Zaznamenávajú sa skutočné vstupné, výstupné a cached input tokeny a čas. Credits sú null, kým runtime neposkytne skutočné číslo so zdrojom. API cenník nie je prevodník kreditov predplatného Codex; percento týždenného limitu nemožno spoľahlivo priradiť jednému paralelnému agentovi. Orchestrátor preto nikdy nevydáva odhad tokenov za namerané kredity.

Pamäť výsledkov ovplyvňuje ďalší výber. Na začiatku používa uvedené pravidlá, pretože zatiaľ nemá históriu reálnych produkčných úloh. S rastúcim počtom overených výsledkov sa výber prispôsobí. Nevyhlasuj úsporu ani presnosť odhadov bez porovnateľných nameraných behov.

Oficiálne zdroje: [výber modelov](https://developers.openai.com/api/docs/guides/model-selection), [reasoning](https://developers.openai.com/api/docs/guides/reasoning). Konkrétne podporované názvy a reasoning boli overené aj v natívnych tool schémach nainštalovaného prostredia.
