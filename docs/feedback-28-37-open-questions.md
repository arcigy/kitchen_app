# Otvorené klientské vstupy: reporty #28–37

Funkcie pre reporty #28 až #37 sú pripravené na použitie s údajmi zadanými vo firemnom katalógu a projektových nastaveniach. Nasledujúce vstupy sa zámerne neodhadujú; pri ich absencii aplikácia označí príslušnú kalkuláciu ako neúplnú.

| Oblasť | Potrebný podklad |
| --- | --- |
| Predmontáž | Sadzby podľa typu modulu a presetu, prípadne potvrdené individuálne výnimky. |
| Prerez | Predvolené percentá pre dosky a hrany a výnimky podľa materiálu. |
| Hranovanie | Potvrdené výrobné pravidlá pre ďalšie typy dielcov; aplikácia nevytvára neoverené pravidlá z obvodu dosky. |
| Marža na m² | Potvrdenie definície ukazovateľa pri doskách od 16 mm. |
| Receptúry | Vzorové skladby vrstiev, operácií a ich sadzieb. |
| Výroba | Potvrdené minimá operácií, ak sa majú uplatňovať. |
| Supplier Bridge | Presný postup, účet bez citlivých údajov, firma, mena a čas výskytu, ak sa chyba prihlásenia zopakuje. |

Tieto údaje patria do konfigurácie firmy alebo projektu. Neuchovávajú sa v zdrojovom kóde ani v Gite.

## Základný manuálny postup

V testovacom projekte zapnite výrobné sadzby, vyplňte prerez dosiek a hrán a nastavte predmontáž pre skrinku; overte nulovú aj chýbajúcu sadzbu. Vytvorte krycí bok, priraďte ho ku skrinke, duplikujte skrinku, odstráňte pôvodnú a vyskúšajte Späť/Znova. Overte uloženie, otvorenie a `.fqp` roundtrip s receptúrou. V Nastaveniach prepnite veľkosť rozhrania a pri zväčšení prehliadača skontrolujte ovládacie prvky. V Supplier Bridge overte medzery okolo názvu firmy a používateľa; nesprávna firma musí zostať odmietnutá.
