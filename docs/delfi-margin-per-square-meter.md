# Delfi: marža na 1 m² (Odoo #28)

V etape Marže pribudne pre Delfi údaj **Marža na 1 m²**. Používa celkovú sumu
marže projektu vrátane doplnkov, spotrebičov a práce, vydelenú čistou plochou
všetkých dosiek s hrúbkou aspoň 16 mm. Počíta aj čelá, chrbty, dná, sokle
a pracovné dosky, ak spĺňajú túto hrúbku. Nákupný odpad sa do plochy nezapočítava.
Plocha z kusovníka je už súčtom kusov; opätovne sa nenásobí ich počtom.

Výsledok vychádza z efektívnych cien priradených v projekte a jeho meny.
Priradená cena môže vyriešiť chýbajúcu cenu pôvodného katalógu. Chýbajúca
efektívna cena, neznáma hrúbka alebo plocha či zlyhanie zostavenia časti
projektu výsledok pozastaví s vysvetlením. Pri nulovej ploche sa zobrazí pomlčka.
Samotné ceny, marže, exportné súčty a uložený formát projektu sa nemenia.

## Zapnutie iba pre Delfi

Predvolené zapnutie používa overené stabilné ID `client_delfi`. Identita bola
overená cez serverový profil prihláseného účtu Delfi na develop. Ostatné firmy
vrátane `client_arcigy_demo` zostávajú bez zmeny.

Ak má Delfi v inom prostredí odlišné ID, serverová premenná
`ARCIGY_DELFI_CLIENT_ID` ho môže nahradiť. Musí obsahovať overené ID tej istej
firmy, nikdy zobrazovaný názov. Explicitne prázdna hodnota funkciu vypne.

`src/custom/delfi/projectMargins.ts` vlastní pravidlo hrúbky a presné porovnanie
ID. Existujúci serverový endpoint Marže vyberá pravidlo zo svojho overeného
`ClientContext`. Názov firmy, parametre URL, telo požiadavky ani importovaný
projekt ho nemôžu zapnúť. Frontend zobrazí kartu iba pri serverom vrátenom
`summary.sheetMaterial`; ostatné firmy dostanú pôvodný súhrn a rozloženie.
Rovnaké pravidlo platí pri čítaní aj uložení marží. Rola viewer ostáva bez zápisu.

Nevyžaduje sa migrácia ani zápis do živých zákazníckych dát. Výsledok sa
neukladá do projektu alebo FQP; po načítaní sa odvodí z aktuálneho kusovníka,
cien a nastavení firmy. Vypnutie konfigurácie odstráni kartu bez zmeny dát.

## Manuálne overenie

1. V Delfi otvorte ocenený projekt a etapu Marže. Porovnajte sumu marže delenú
   zobrazenou plochou s údajom Marža na 1 m². Podržte kurzor nad kartou pre vysvetlenie.
2. Porovnajte dosky hrúbky 15, 16 a 18 mm. Do plochy patria posledné dve;
   marža z tenších dosiek a spotrebičov stále patrí do celkovej sumy marže.
3. Zmeňte percento marže a dodatočnú prácu. Výsledok sa prepočíta, plocha ostane
   rovnaká. Zmeňte rozmery skrinky, uložte projekt a otvorte Marže znova.
4. Uložte a znovu otvorte projekt; preneste ho aj cez FQP. Porovnajte výsledok.
5. Skúste prázdny projekt a projekt bez kompletnej ceny: zobrazí sa pomlčka
   s dôvodom. Preverte menšie okno a zobrazenie v češtine.
6. Prihláste sa do inej firmy: karta ani zmenené rozloženie sa nesmú zobraziť.
   Otvorenie projektu Delfi z inej firmy musí zostať odmietnuté.

## Automatické overenie

- Regresné testy výpočtu: hranica 16 mm, všetky skupiny dosiek, kusy, výrezy,
  nákupný odpad, doplnky, spotrebiče, práca, CZK, projektové ceny a neúplné údaje.
- Testy servera: vypnutý tenant, presné ID, čítanie/zápis, cudzí tenant,
  podvrhnuté údaje, uloženie a import zašifrovaného FQP.
- `npm run test:pricing-ui` overuje pôvodný prehľad pre bežnú testovaciu firmu.
  Pre druhý beh na izolovanom localhost serveri s úložiskom file nastavte
  `ARCIGY_DELFI_CLIENT_ID` na ID syntetickej testovacej firmy a v testovacom
  procese `ARCIGY_UI_EXPECT_DELFI_MARGIN=1`. Nezapínajte takto reálnu inú firmu.
  Tento beh overí kartu, prepočty, opätovné otvorenie a menšie okno.
- Povinné kontroly: typecheck, kompletné unit testy, build, i18n a UI regresia
  vrátane save/load a úplného FQP roundtripu.
