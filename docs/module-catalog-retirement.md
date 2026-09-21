# Firemný katalóg a vyradené moduly

Aplikácia na localhoste aj na serveri načítava moduly z katalógu prihlásenej
firmy cez API. Lokálny fallback na celý systémový katalóg je odstránený.
Chyba API nesmie vytvoriť náhradný zoznam demo modulov. Staršia cache aplikácie
sa po tejto zmene nepoužíva; nová cache naďalej overuje firmu a revíziu.

Systémové šablóny obsahujú iba deväť rodín používaných aktuálnym katalógom
Delfi (desať balíkov vrátane samostatnej vrchnej rohovej skrinky). Konkrétne
firemné varianty, nastavenia a zapnutie balíkov zostávajú vo firemnom úložisku.
Súkromné balíky Delfi nepatria do repozitára. Otvorenie existujúceho katalógu
nesmie pridávať systémové šablóny ani obnovovať zmazané priradenia. Prázdny
katalóg je platný stav.

Vyradených 61 identifikátorov je v `retired-module-types.ts`. Zákaz platí pre
import JSON aj FQM, validáciu balíkov, priame vykreslenie a katalógové výbery.
Dodávateľský popis, vyhľadávanie asistenta ani označenie starej položky ako
zapnutej nesmú vyradený modul obnoviť. Starý CLI import zdrojových `.modpkg`
balíkov je ukončený, pretože prepisoval register aplikácie zo starých manifestov.
Nové balíky sa importujú cez overený firemný katalóg.

Geometrické pomocné funkcie, ktoré používa súčasná rohová rodina, a dátové typy
pre čítanie historických projektov nie sú registrované ako samostatné moduly.
Projekty sa pri čistení katalógu nemažú ani automaticky nemenia na iné skrinky.
Testovacie fixture starých balíkov slúžia na kontrolu odmietnutia a izolácie.

## Manuálne overenie

1. Prihlásiť sa, otvoriť katalóg skríň a porovnať balíky s aktuálnymi
   priradeniami Delfi; skryté/zakázané priradenie musí zostať zakázané.
2. Obnoviť stránku a reštartovať server. Počet a identita priradení sa nezmení.
3. Vložiť aktuálnu spodnú, rohovú, vysokú a vrchnú skrinku; overiť 2D/3D,
   rozmery, otvorenie dvierok, kusovník a uloženie/otvorenie projektu.
4. Skúsiť import vyradeného modulu vrátane balíka s deklaratívnou geometriou.
   Import musí skončiť chybou bez zápisu balíka a bez zmeny katalógu.
5. V izolovanom testovacom úložisku odstrániť všetky priradenia a znovu
   načítať katalóg. Musí zostať prázdny.
6. Pri nedostupnosti API sa nesmie zobraziť systémový demo katalóg.
