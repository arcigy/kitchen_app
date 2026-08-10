import { CZECH_SYSTEM_TEXT } from "./czechCatalog";

/** Canonical application languages. `cz` is accepted only as a legacy profile value. */
export type AppLanguage = "en" | "cs" | "sk";
export type AppLocale = "en-GB" | "cs-CZ" | "sk-SK";

const STORAGE_KEY = "kitchen.app.language";
const listeners = new Set<(language: AppLanguage) => void>();
const textSources = new WeakMap<Node, string>();
const attributeSources = new WeakMap<HTMLElement, Map<string, string>>();
let domI18nState: { observer: MutationObserver; unsubscribe: () => void; removeWindowListener: () => void } | null = null;

const LOCALES: Record<AppLanguage, AppLocale> = {
  en: "en-GB",
  cs: "cs-CZ",
  sk: "sk-SK"
};

const EXACT_CS_TEXT: Record<string, string> = {
  ...CZECH_SYSTEM_TEXT,
  File: "Soubor", Architecture: "Architektura", Modify: "Upravit", View: "Zobrazení", Manage: "Správa",
  Layout: "Rozvržení", Edit: "Úpravy", Project: "Projekt", Select: "Vybrat", Wall: "Stěna",
  Door: "Dveře", Column: "Sloup", Stair: "Schodiště", Room: "Místnost", Wardrobe: "Skříň",
  Selection: "Výběr", Output: "Výstup", Align: "Zarovnat", Trim: "Oříznout", Dimension: "Kóta",
  Section: "Řez", Measure: "Měřit", Floor: "Podlaha", Underlay: "Podklad", Kitchen: "Kuchyně",
  Undo: "Zpět", Redo: "Znovu", Move: "Přesunout", Rotate: "Otočit", Duplicate: "Duplikovat",
  Delete: "Smazat", Export: "Export", Copy: "Kopírovat", Catalog: "Katalog", BOM: "Kusovník",
  Floorplan: "Půdorys", Properties: "Vlastnosti", Walls: "Stěny", Modules: "Moduly", Worktops: "Pracovní desky",
  Sections: "Řezy", Type: "Typ", Length: "Délka", Direction: "Směr", Default: "Výchozí", Mirrored: "Zrcadleně",
  Name: "Název", Save: "Uložit", Settings: "Nastavení", Language: "Jazyk", English: "Angličtina",
  Slovak: "Slovenština", Czech: "Čeština", Install: "Nainstalovat", Pricing: "Ocenění", Material: "Materiál",
  Currency: "Měna", Cost: "Cena", Total: "Celkem", Totals: "Součty", Components: "Komponenty",
  "Open assistant": "Otevřít asistenta", "Arcigy assistant": "Asistent Arcigy", "Close assistant": "Zavřít asistenta",
  "Assistant message": "Zpráva pro asistenta", "Send message": "Odeslat zprávu", "Add attachment": "Přidat přílohu",
  "Preview context": "Náhled kontextu", Voice: "Hlas", "Assistant options": "Možnosti asistenta",
  "Arcigy kitchen offer": "Nabídka kuchyně Arcigy", Generated: "Vygenerováno", Page: "Strana"
};

const EXACT_SK_TEXT: Record<string, string> = {
  "Local recovery draft – server will be verified on open": "Lokálny obnovovací koncept – server sa overí pri otvorení.",
  "Local recovery data are not shown without a valid sign-in.": "Lokálne obnovovacie dáta sa bez platného prihlásenia nezobrazujú.",
  "Server is unavailable. Marked local recovery projects are shown.": "Server nie je dostupný. Zobrazujú sa označené lokálne obnovovacie projekty.",
  Open: "Otvoriť",
  Print: "Tlačiť",
  "Cloud status": "Stav cloudu",
  Share: "Zdieľať",
  "Arcigy Kitchen": "Arcigy Kitchen",
  Workspace: "Pracovisko",
  Structure: "Konštrukcia",
  Systems: "Systémy",
  Insert: "Vložiť",
  Annotate: "Anotovať",
  Analyze: "Analyzovať",
  "Massing & Site": "Hmoty a pozemok",
  Collaborate: "Spolupracovať",
  Visualisation: "Vizualizácia",
  "Ribbon toolbar": "Panel nástrojov",
  "Main navigation": "Hlavná navigácia",
  "Module catalog": "Katalóg modulov",
  "3D viewer": "3D zobrazenie",
  "Reset view": "Obnoviť pohľad",
  "Viewer navigation tools": "Nástroje navigácie zobrazenia",
  "Zoom out": "Oddialiť",
  "Zoom in": "Priblížiť",
  Pan: "Posunúť",
  Orbit: "Otáčať",
  "Fit view": "Prispôsobiť pohľad",
  "View cube": "Kocka pohľadov",
  "Rotate view left": "Otočiť pohľad doľava",
  "Rotate view right": "Otočiť pohľad doprava",
  Front: "Predný",
  Right: "Pravý",
  Left: "Ľavý",
  Bottom: "Spodný",
  "Top front edge view": "Pohľad na hornú prednú hranu",
  "Top back edge view": "Pohľad na hornú zadnú hranu",
  "Top left edge view": "Pohľad na hornú ľavú hranu",
  "Top right edge view": "Pohľad na hornú pravú hranu",
  "Front left edge view": "Pohľad na prednú ľavú hranu",
  "Front right edge view": "Pohľad na prednú pravú hranu",
  "Back left edge view": "Pohľad na zadnú ľavú hranu",
  "Back right edge view": "Pohľad na zadnú pravú hranu",
  "Bottom front edge view": "Pohľad na spodnú prednú hranu",
  "Bottom back edge view": "Pohľad na spodnú zadnú hranu",
  "Bottom left edge view": "Pohľad na spodnú ľavú hranu",
  "Bottom right edge view": "Pohľad na spodnú pravú hranu",
  "Top front left view": "Pohľad zhora spredu zľava",
  "Top front right view": "Pohľad zhora spredu sprava",
  "Top back left view": "Pohľad zhora zozadu zľava",
  "Top back right view": "Pohľad zhora zozadu sprava",
  "Bottom front left view": "Pohľad zdola spredu zľava",
  "Bottom front right view": "Pohľad zdola spredu sprava",
  "Bottom back left view": "Pohľad zdola zozadu zľava",
  "Bottom back right view": "Pohľad zdola zozadu sprava",
  "Materials and components": "Materiály a komponenty",
  "Project margins": "Marže projektu",
  "Project overview": "Prehľad projektu",
  Warnings: "Upozornenia",
  "BOM / pricing": "Kusovník / kalkulácia",
  "On demand": "Na vyžiadanie",
  "Live calculation": "Priebežný výpočet",
  Off: "Vypnuté",
  "Refresh impact": "Dopad obnovenia",
  Reduced: "Obmedzený",
  "100+ modules": "Viac ako 100 modulov",
  "BOM items": "Položky kusovníka",
  "Calculated only when opened": "Vypočíta sa až po otvorení",
  Manual: "Manuálne",
  "Open BOM": "Otvoriť kusovník",
  "Sheet preview": "Náhľad výkresu",
  "A101 - Floor plan level 1": "A101 – Pôdorys úrovne 1",
  "Recent activity": "Nedávna aktivita",
  "No recent changes": "Žiadne nedávne zmeny",
  now: "teraz",
  "0 changes": "0 zmien",
  "Drawings serve as an underlay. The system will add exported drawings here automatically later.": "Výkresy slúžia ako podklad. Systém sem neskôr automaticky pridá exportované výkresy.",
  "Open source module": "Otvoriť zdrojový modul",
  "Copy row": "Kopírovať riadok",
  Schedules: "Výkazy",
  "Tables of modules, materials, edge banding, components and views.": "Tabuľky modulov, materiálov, olepovania hrán, komponentov a pohľadov.",
  Documents: "Dokumenty",
  Size: "Rozmer",
  Position: "Poloha",
  "No modules": "Žiadne moduly",
  "The module schedule appears here after modules are added.": "Výkaz modulov sa tu zobrazí po vložení modulov.",
  "Detailed bill of materials for this module.": "Podrobný kusovník pre tento modul.",
  "Part ID": "ID dielca",
  Part: "Dielec",
  "3D": "3D",
  Status: "Stav",
  Ready: "Pripravené",
  "Catalog name": "Názov katalógu",
  "Component ID": "ID komponentu",
  Use: "Použitie",
  "Catalog ref": "Katalógový odkaz",
  "Floor plan": "Pôdorys",
  "Model view": "Pohľad na model",
  Elevation: "Nárys",
  "DXF export later": "Export DXF neskôr",
  "View ID": "ID pohľadu",
  "No records yet.": "Zatiaľ nie sú k dispozícii žiadne záznamy.",
  "Left side": "Ľavý bok",
  "Right side": "Pravý bok",
  front: "predná",
  "front, left, right": "predná, ľavá, pravá",
  "Back panel": "Zadný panel",
  Podorys: "Pôdorys",
  Pohlad: "Pohľad",
  Rez: "Rez",
  Detail: "Detail",
  "Project base": "Základ projektu",
  "Generated placeholder": "Vygenerovaná zástupná položka",
  "Manual placeholder": "Ručne vytvorená zástupná položka",
  "Ready as underlay": "Pripravené ako podklad",
  "Waiting for auto sheet": "Čaká na automatický výkres",
  "Waiting for section export": "Čaká na export rezu",
  "No file linked": "Nie je pripojený žiadny súbor",
  "Imported PDF": "Importované PDF",
  "Imported locally": "Importované lokálne",
  "The sign-in server is unavailable. Start the local environment with npm run dev.": "Prihlasovací server nie je dostupný. Spustite lokálne prostredie cez npm run dev.",
  "Incorrect sign-in details.": "Nesprávne prihlasovacie údaje.",
  "Sign-in failed on the server. Try again or restart the local environment.": "Prihlásenie na serveri zlyhalo. Skúste to znova alebo reštartujte lokálne prostredie.",
  "Project workspace": "Pracovisko projektu",
  "Arcigy organisation": "Organizácia Arcigy",
  "Projects, versions and activity are linked to a specific team member.": "Projekty, verzie a aktivita sú viazané na konkrétneho člena tímu.",
  "Sign in": "Prihlásenie",
  "Welcome back": "Vitajte späť",
  "Choose your profile and continue to the Arcigy workspace.": "Vyberte si profil a pokračujte do pracoviska Arcigy.",
  "Select Branislav": "Vybrať Branislava",
  "Project architect": "Projektový architekt",
  "Select Andrej": "Vybrať Andreja",
  "Technical creator": "Technický tvorca",
  "Select PINO Nobilia": "Vybrať PINO Nobilia",
  "Tenant catalogue VKH 2026": "Tenantový katalóg VKH 2026",
  User: "Používateľ",
  Password: "Heslo",
  "Enter password": "Zadajte heslo",
  "Sign in to workspace": "Prihlásiť sa do pracoviska",
  "Available accounts": "Dostupné účty",
  "tenant password": "tenantové heslo",
  Sheets: "Výkresy",
  Views: "Pohľady",
  "Import PDF": "Importovať PDF",
  "Choose a drawing or PDF underlay for the layout.": "Vyberte výkres alebo PDF podklad pre rozloženie.",
  "Schedule type": "Typ výkazu",
  "Module schedule": "Výkaz modulov",
  "Material boards": "Materiálové dosky",
  "Project margins could not be initialized.": "Marže projektu sa nepodarilo inicializovať.",
  "Loading project margins": "Načítavam marže projektu",
  "Loading margin summary": "Načítavam súhrn marží",
  "Margins could not be loaded.": "Marže sa nepodarilo načítať.",
  "Margins cannot be opened safely.": "Marže sa nedajú bezpečne otvoriť.",
  "New project": "Nový projekt",
  Cancel: "Zrušiť",
  "Blank workspace": "Prázdne pracovisko",
  "Import .fqp": "Importovať .fqp",
  "Choose an existing project or create a new one.": "Vyberte existujúci projekt alebo vytvorte nový.",
  "Create and open": "Vytvoriť a otvoriť",
  "Loading projects…": "Načítavam projekty…",
  "Project name": "Názov projektu",
  Address: "Adresa",
  City: "Mesto",
  Contact: "Kontakt",
  Email: "E-mail",
  Phone: "Telefón",
  Note: "Poznámka",
  "Loading project list…": "Načítavam zoznam projektov…",
  "Project manager is ready.": "Správca projektov je pripravený.",
  "Please enter the project name, address and contact.": "Vyplňte názov projektu, adresu a kontakt.",
  "Creating project": "Vytváram projekt",
  "Opening blank workspace": "Otváram prázdne pracovisko",
  "Importing project": "Importujem projekt",
  "Delete project?": "Odstrániť projekt?",
  "All saves, versions and files for this project will be removed.": "Odstránia sa všetky uloženia, verzie a súbory tohto projektu.",
  "This action cannot be undone.": "Táto akcia sa nedá vrátiť späť.",
  "Yes, delete project": "Áno, odstrániť projekt",
  "Deleting…": "Odstraňujem…",
  "Try again": "Skúsiť znova",
  "No preview": "Bez náhľadu",
  "Loading versions…": "Načítavam verzie…",
  "Select a version and choose Preview.": "Vyberte verziu a zvoľte Náhľad.",
  "This project has no saved version yet.": "Tento projekt ešte nemá uloženú žiadnu verziu.",
  Preview: "Náhľad",
  Restore: "Obnoviť",
  "Project actions": "Akcie projektu",
  "Open project": "Otvoriť projekt",
  "Export project": "Exportovať projekt",
  "View saved versions": "Zobraziť uložené verzie",
  "No saved projects yet.": "Zatiaľ tu nie sú žiadne uložené projekty.",
  "Edited a few seconds ago": "Upravené pred niekoľkými sekundami",
  "Edited a minute ago": "Upravené pred minútou",
  "Edited {count} minutes ago": "Upravené pred {count} minútami",
  "Edited an hour ago": "Upravené pred hodinou",
  "Edited {count} hours ago": "Upravené pred {count} hodinami",
  "Edited a day ago": "Upravené pred dňom",
  "Edited {count} days ago": "Upravené pred {count} dňami",
  "Edited a month ago": "Upravené pred mesiacom",
  "Edited {count} months ago": "Upravené pred {count} mesiacmi",
  "Edited a year ago": "Upravené pred rokom",
  "Edited {count} years ago": "Upravené pred {count} rokmi",
  "{walls} walls / {floors} floors / {modules} modules": "{walls} stien / {floors} podláh / {modules} modulov",
  "Version {version} - {edited} - {summary}": "Verzia {version} – {edited} – {summary}",
  "Version {version}": "Verzia {version}",
  "Saved project versions": "Uložené verzie projektu",
  "Saved versions": "Uložené verzie",
  Close: "Zavrieť",
  "Saved by": "Uložil",
  "Created by": "Vytvoril",
  "Loading version {version}…": "Načítavam verziu {version}…",
  "Version loaded for preview.": "Verzia je načítaná na náhľad.",
  "Restore project \"{project}\" to version {version}? The current state will be saved as a new history version.": "Obnoviť projekt \"{project}\" na verziu {version}? Aktuálny stav sa uloží ako nová verzia v histórii.",
  "Restoring version {version}…": "Obnovujem verziu {version}…",
  "Project restored to version {version}.": "Projekt je obnovený na verziu {version}.",
  "Preview version": "Náhľad verzie",
  "Restore version": "Obnoviť verziu",
  "Loading project": "Načítavam projekt",
  "Preparing complete .fqp file…": "Pripravujem kompletný súbor .fqp…",
  "Project file downloaded.": "Súbor projektu bol stiahnutý.",
  "Deleting project \"{project}\"…": "Odstraňujem projekt \"{project}\"…",
  "Project deleted.": "Projekt bol odstránený.",
  "Signing out…": "Odhlasujem používateľa…",
  "Blender material export": "Export materiálov z Blenderu",
  "Ready.": "Pripravené.",
  "Open .blend": "Otvoriť .blend",
  "Open PNG": "Otvoriť PNG",
  "Open preview": "Otvoriť náhľad",
  "Blender preview": "Náhľad z Blenderu",
  "Unable to open the exported file.": "Exportovaný súbor sa nedá otvoriť.",
  "Preparing website animation export…": "Pripravujem export animácie pre web…",
  "Initial website snapshot exported.": "Úvodná snímka pre web bola exportovaná.",
  "Final website snapshot exported.": "Finálna snímka pre web bola exportovaná.",
  "Running Blender (up to 60s)…": "Spúšťam Blender (max. 60 s)…",
  "Backend did not return previewUrl.": "Backend nevrátil previewUrl.",
  "Could not open .blend.": "Súbor .blend sa nedá otvoriť.",
  "Could not open PNG.": "PNG sa nedá otvoriť.",
  "Done. JSON copied.": "Hotovo. JSON bol skopírovaný.",
  "Done.": "Hotovo.",
  "Blender export failed.": "Export z Blenderu zlyhal.",
  "Canvas 2D context is not available.": "Kontext Canvas 2D nie je k dispozícii.",
  "Total labor": "Práca spolu",
  "Combined margin": "Kombinovaná marža",
  "Final quoted price": "Finálna cenová ponuka",
  "This design has no items for this section.": "Tento návrh nemá pre túto sekciu žiadne položky.",
  "No rows are available yet.": "Zatiaľ nie sú k dispozícii žiadne riadky.",
  "Kitchen price quotation": "Cenová ponuka kuchyne",
  "A clearly prepared quotation from the current design, using the same pricing logic as the BOM and Create Sheet export.": "Prehľadne spracovaná ponuka z aktuálneho návrhu s rovnakou cenovou logikou ako v kusovníku a exporte Create Sheet.",
  "The quotation is based on accurately priced board materials, edges and catalogue components. The result includes material, labor, any additional project work and margin.": "Ponuka vychádza z presne nacenených doskových materiálov, hrán a katalógových komponentov. Výsledok zahŕňa materiál, prácu, prípadnú dodatočnú projektovú prácu a maržu.",
  "Selected finishes and fittings focus on a premium impression, clean detail, everyday durability and a consistent appearance across the whole composition.": "Vybrané povrchy a kovania sa zameriavajú na prémiový dojem, čistý detail, každodennú odolnosť a konzistentný vzhľad celej zostavy.",
  "Pricing summary": "Prehľad kalkulácie",
  "Edge banding": "Olepovanie hrán",
  "Module labor": "Práca na moduloch",
  "Additional project labor": "Dodatočná práca na projekte",
  "Subtotal before margin": "Medzisúčet pred maržou",
  "Used materials": "Použité materiály",
  "{quantity} m² net, {pricedQuantity} m² billed, {unitPrice} / m², total {cost}.": "{quantity} m² netto, {pricedQuantity} m² fakturované, {unitPrice} / m², spolu {cost}.",
  "Edges and finishing elements": "Hrany a dokončovacie prvky",
  "{quantity} lm, {unitPrice} / lm, total {cost}.": "{quantity} bm, {unitPrice} / bm, spolu {cost}.",
  "Catalogue components": "Katalógové komponenty",
  "{quantity} pcs, {unitPrice} / pc, total {cost}.": "{quantity} ks, {unitPrice} / ks, spolu {cost}.",
  "Module overview": "Prehľad modulov",
  "Quotation note": "Poznámka k ponuke",
  "This PDF output is a marketing-formatted quotation from the current design. Its final price matches the Create Sheet result and the BOM panel in the application.": "Tento PDF výstup je marketingovo upravená cenová ponuka z aktuálneho návrhu. Jeho finálna cena zodpovedá výsledku Create Sheet a panelu kusovníka v aplikácii.",
  "kitchen-quotation": "cenová-ponuka",
  "Delete project": "Odstrániť projekt",
  Edges: "Hrany",
  Total: "Spolu",
  "New Project": "Nový projekt",
  "Open Project": "Otvoriť projekt",
  "Save Project": "Uložiť projekt",
  "Project Manager": "Správca projektov",
  "Download Project File": "Stiahnuť súbor projektu",
  "Load Project File": "Načítať súbor projektu",
  "Export Blender Material Preview...": "Exportovať náhľad materiálov z Blenderu…",
  "Czech": "Čeština",
  "Kitchen modules": "Kuchynské moduly",
  "Kitchen group active": "Kuchynská skupina je aktívna",
  "Create or open a kitchen first": "Najprv vytvorte alebo otvorte kuchyňu",
  "Active kitchen": "Aktívna kuchyňa",
  "New kitchen": "Nová kuchyňa",
  "Tall module editor": "Editor vysokých modulov",
  "Custom tall module": "Vlastný vysoký modul",
  "Search module": "Hľadať modul",
  "Tall builder": "Nástroj pre vysoké moduly",
  "Move selected submodule": "Presunúť vybraný podmodul",
  "Copy selected submodule": "Kopírovať vybraný podmodul",
  "Align selected submodule vertically": "Zvisle zarovnať vybraný podmodul",
  "Edit modules": "Upravovať moduly",
  "Editor tools": "Nástroje editora",
  "Move selected module (M)": "Presunúť vybraný modul (M)",
  "Align module (A)": "Zarovnať modul (A)",
  "Back to kitchen": "Späť do kuchyne",
  "Confirm module": "Potvrdiť modul",
  Confirm: "Potvrdiť",
  "Cancel module": "Zrušiť modul",
  Margins: "Marže",
  "Open Materials": "Otvoriť materiály",
  "Open Margins": "Otvoriť marže",
  "Loading project materials…": "Načítavam materiály projektu…",
  "Loading material warnings…": "Načítavam upozornenia materiálov…",
  "Materials could not be loaded.": "Materiály sa nepodarilo načítať.",
  "Materials cannot be opened safely because the project could not be saved.": "Materiály sa nedajú bezpečne otvoriť, pretože sa projekt nepodarilo uložiť.",
  "Arcigy kitchen offer": "Ponuka kuchyne Arcigy",
  Generated: "Vygenerované",
  Page: "Strana",
  "Kitchen Layout 2026 - Floor Plan": "Kitchen Layout 2026 - Pôdorys",
  "Project 1": "Projekt 1",
  File: "Súbor",
  Architecture: "Architektúra",
  Modify: "Upraviť",
  View: "Zobrazenie",
  Manage: "Správa",
  Layout: "Rozloženie",
  Edit: "Úpravy",
  Project: "Projekt",
  Select: "Vybrať",
  Wall: "Stena",
  Door: "Dvere",
  Column: "St\u013ap",
  Stair: "Schodisko",
  "Living Wall": "Ob\u00fdva\u010dkov\u00e1 stena",
  Room: "Izba",
  Wardrobe: "Skri\u0148a",
  Selection: "V\u00fdber",
  Output: "V\u00fdstup",
  Align: "Zarovnať",
  Trim: "Orezať",
  Dimension: "K\u00f3ta",
  Section: "Rez",
  Measure: "Merať",
  Floor: "Podlaha",
  Underlay: "Podklad",
  Kitchen: "Kuchyňa",
  Undo: "Späť",
  Redo: "Znova",
  Move: "Posunúť",
  Rotate: "Otočiť",
  Duplicate: "Duplikovať",
  Delete: "Zmazať",
  "2D View": "2D pohľad",
  "2D top view": "2D pohľad zhora",
  "Reset Defaults": "Resetovať predvolené",
  Reset: "Resetovať",
  "Export JSON": "Export JSON",
  Export: "Export",
  "Copy Export": "Kopírovať export",
  Copy: "Kopírovať",
  "Pricing Catalog": "Cenový katalóg",
  Catalog: "Katalóg",
  BOM: "Kusovník",
  "Reset View": "Resetovať pohľad",
  Floorplan: "Pôdorys",
  Properties: "Vlastnosti",
  Walls: "Steny",
  Modules: "Moduly",
  Worktops: "Pracovné dosky",
  Sections: "Rezy",
  Type: "Typ",
  Length: "Dĺžka",
  Direction: "Smer",
  Default: "Predvolené",
  Mirrored: "Zrkadlovo",
  "Cut line": "Rezná línia",
  Model: "Model",
  Name: "N\u00e1zov",
  Hide: "Skry\u0165",
  Unhide: "Odkry\u0165",
  Isolate: "Izolova\u0165",
  "Unhide All": "Odkry\u0165 v\u0161etko",
  "Show Hidden": "Zobrazi\u0165 skryt\u00e9",
  Solid: "Pln\u00e9",
  Realistic: "Realistick\u00e9",
  Wireframe: "Dr\u00f4tov\u00fd model",
  "View display: Solid": "Zobrazenie: pln\u00e9",
  "View display: Realistic": "Zobrazenie: realistick\u00e9",
  "View display: Wireframe": "Zobrazenie: dr\u00f4tov\u00fd model",
  "Thickness (mm)": "Hr\u00fabka (mm)",
  Justification: "Zarovnanie",
  Center: "Stred",
  Exterior: "Exteri\u00e9r",
  "Finish face: exterior": "Poh\u013eadov\u00e1 strana: exteri\u00e9r",
  "Flip exterior": "Prehodi\u0165 exteri\u00e9r",
  "Back edge": "Zadn\u00e1 hrana",
  "Top Height": "Horn\u00e1 v\u00fd\u0161ka",
  "Height (mm)": "V\u00fd\u0161ka (mm)",
  "Worktop depth (mm)": "H\u013abka pracovnej dosky (mm)",
  "Worktop front offset (mm)": "Predn\u00e9 odsadenie pracovnej dosky (mm)",
  "Worktop back offset (mm)": "Zadn\u00e9 odsadenie pracovnej dosky (mm)",
  Fronts: "\u010cel\u00e1",
  Corpus: "Korpus",
  Back: "Chrb\u00e1t",
  "Drawer bottoms": "Dn\u00e1 z\u00e1suviek",
  "Worktop thickness": "Hr\u00fabka pracovnej dosky",
  North: "Sever",
  East: "V\u00fdchod",
  South: "Juh",
  West: "Z\u00e1pad",
  Ortho: "Orto",
  Lighting: "Osvetlenie",
  "Render mode": "Režim renderu",
  "Save PNG": "Uložiť PNG",
  "HDRI: off": "HDRI: vyp.",
  "Outdoor day (2K)": "Vonkajší deň (2K)",
  "Sunset (1K)": "Západ slnka (1K)",
  "HDRI background": "HDRI pozadie",
  "No imported modules installed. Run `npm run import:modpkg -- \"<path-to.modpkg>\"` and reload the app.":
    "Nie sú nainštalované žiadne importované moduly. Spusti `npm run import:modpkg -- \"<path-to.modpkg>\"` a znovu načítaj appku.",
  "No modules imported": "Žiadne importované moduly",
  "Click a part…": "Klikni na diel…",
  "Hide selected": "Skryť vybrané",
  "Show selected": "Zobraziť vybrané",
  "Material override": "Prepis materiálu",
  "(no override)": "(bez prepisu)",
  Overlaps: "Kolízie",
  "show allowed": "zobraziť povolené",
  "No overlaps.": "Žiadne kolízie.",
  Highlight: "Zvýrazniť",
  Visible: "Viditeľné",
  Hidden: "Skryté",
  "Click a module…": "Klikni na modul…",
  "Commercial BOM & Costs": "Obchodný kusovník a náklady",
  "Copy Pricing JSON": "Kopírovať JSON cien",
  "Create Sheet": "Vytvoriť hárok",
  Copied: "Skopírované",
  Totals: "Súčty",
  Boards: "Dosky",
  "Edge Bands": "Hranovacie pásky",
  Hardware: "Kovanie",
  Labor: "Práca",
  "Final Cost": "Konečný náklad",
  "Inputs & Formulas": "Vstupy a vzorce",
  "Boards By Material": "Dosky podľa materiálu",
  Components: "Komponenty",
  Module: "Modul",
  Final: "Spolu",
  Material: "Materiál",
  "Catalog ID": "Katalógové ID",
  Group: "Skupina",
  "Net m2": "Čisté m2",
  "Priced m2": "Účtované m2",
  "Unit price": "Jedn. cena",
  Cost: "Cena",
  Component: "Komponent",
  Pieces: "Kusy",
  Field: "Pole",
  Value: "Hodnota",
  Currency: "Mena",
  "Board waste multiplier": "Koeficient odpadu dosiek",
  "Labor fixed per module": "Fixná práca na modul",
  "Formula / board priced quantity": "Vzorec / účtované množstvo dosiek",
  "Formula / item cost": "Vzorec / cena položky",
  "Formula / subtotal": "Vzorec / medzisúčet",
  "Formula / final": "Vzorec / konečná cena",
  "Item Breakdown": "Rozpis položiek",
  Item: "Položka",
  "Material / Component": "Materiál / Komponent",
  Thickness: "Hrúbka",
  ID: "ID",
  Qty: "Množstvo",
  "Priced Qty": "Účtované množstvo",
  "Item cost": "Cena položky",
  Formula: "Vzorec",
  "Display Name": "Zobrazovaný názov",
  Base: "Základ",
  Decor: "Dekor",
  Finish: "Povrch",
  Thicknesses: "Hrúbky",
  Unit: "Jednotka",
  Brand: "Značka",
  Series: "Séria",
  Variant: "Variant",
  Geometry: "Geometria",
  Materials: "Materiály",
  "Window": "Okno",
  Calibrate: "Kalibrovať",
  "Reset scale": "Resetovať mierku",
  Remove: "Odstrániť",
  "English": "English",
  "Slovak": "Slovenčina",
  Save: "Uložiť",
  "Save As…": "Uložiť ako…",
  Settings: "Nastavenia",
  Language: "Jazyk",
  Install: "Inštalovať",
  "Export Layout JSON…": "Exportovať layout JSON…",
  "Export Scene JSON…": "Exportovať scene JSON…",
  "Website animation export": "Export animácie pre web",
  "Export initial / wrong parameters…": "Exportovať prvú verziu / zlé parametre…",
  "Export final / corrected parameters…": "Exportovať finálnu verziu / správne parametre…",
  "Export PNG Snapshot…": "Exportovať PNG náhľad…",
  "Copy JSON to Clipboard": "Kopírovať JSON do schránky",
  Drawer: "Zásuvková skrinka",
  Corner: "Rohová skrinka",
  Fridge: "Chladnička",
  Shelves: "Police",
  Nested: "Vnorený modul",
  Flap: "Výklop",
  "Flap Top": "Horný výklop",
  Swing: "Otváravý modul",
  "Shelf Doors": "Policová skrinka s dvierkami",
  "Oven Base": "Spodná skrinka pre rúru",
  "Micro Tall": "Vysoká skrinka pre mikrovlnku",
  "Top Doors": "Horné dvierka",
  General: "Všeobecné",
  Dimensions: "Rozmery",
  "Fronts & Doors": "Čelá a dvierka",
  Drawers: "Zásuvky",
  Placement: "Umiestnenie",
  Other: "Ostatné",
  Identity: "Identita",
  Assembly: "Zostava",
  Pricing: "Ocenenie",
  State: "Stav",
  Metadata: "Metadáta",
  "IFC Export": "IFC export",
  "Primary module identity and behavior parameters.": "Základné parametre identity a správania modulu.",
  "Overall sizing, spacing, thicknesses and clearances.": "Celkové rozmery, medzery, hrúbky a vôle.",
  "Material and finish parameters.": "Parametre materiálov a povrchov.",
  "Front, handle and opening-related parameters.": "Parametre čiel, úchytiek a otvárania.",
  "Drawer stack, boxes and runner-related parameters.": "Parametre stĺpca zásuviek, boxov a výsuvov.",
  "Scene placement and mounting parameters.": "Parametre umiestnenia a osadenia v scéne.",
  "Parameters that do not fit the main module groups.": "Parametre, ktoré nepatria do hlavných skupín modulu.",
  "Fixed identity metadata required for each exported module instance.":
    "Pevné identifikačné metadáta vyžadované pre každú exportovanú inštanciu modulu.",
  "Nominal module dimensions in millimeters.": "Nominálne rozmery modulu v milimetroch.",
  "Assembly context and kitchen-specific placement role for the module.":
    "Kontext zostavy a kuchynská rola umiestnenia pre modul.",
  "Scene placement metadata for the exported module instance.": "Metadáta umiestnenia v scéne pre exportovanú inštanciu modulu.",
  "Pricing overrides and commercial state used by downstream systems.":
    "Prepísania cien a obchodný stav používaný nadväznými systémami.",
  "Lifecycle and validation state flags for the module.": "Príznaky životného cyklu a validácie modulu.",
  "Human-facing metadata kept alongside the technical module export.":
    "Používateľské metadáta uchovávané spolu s technickým exportom modulu.",
  "IFC export defaults and BIM classification metadata.": "Predvolené IFC exportu a BIM klasifikačné metadáta.",
  "Part Parameters": "Parametre dielov",
  "Board material and thickness per slot. Thickness options follow the selected catalog material.":
    "Materiál dosky a hrúbka pre každý slot. Možnosti hrúbky sa riadia zvoleným katalógovým materiálom.",
  "System Parameters": "Systémové parametre",
  "Imported package snapshot. Locked fields are derived from the reference importer rules.":
    "Snapshot importovaného balíka. Zamknuté polia vychádzajú z pravidiel referenčného importéra.",
  "Imported module parameters.": "Parametre importovaného modulu.",
  "Imported system parameters.": "Importované systémové parametre.",
  System: "Systém",
  Locked: "Zamknuté",
  Enabled: "Zapnuté",
  Disabled: "Vypnuté",
  "Cabinet Panels": "Korpusové diely",
  "Back Panels": "Zadné diely",
  "Drawer Box Panels": "Diely boxu zásuvky",
  "Drawer Box Bottoms": "Dná zásuviek",
  "Board Parts": "Doskové diely",
  calculated: "vypočítaná",
  override: "prepis",
  manual: "ručná",
  catalog: "katalógová",
  kitchen: "kuchyňa",
  generic: "všeobecné",
  wardrobe: "šatník",
  bathroom: "kúpeľňa",
  laundry: "práčovňa",
  base: "spodný",
  wall: "horný",
  tall: "vysoký",
  "ALLOWED: ": "POVOLENÉ: ",
  "Copied.": "Skopírované.",
  "Copy failed (browser permission).": "Kopírovanie zlyhalo (oprávnenie prehliadača).",
  "Done. Copied JSON.": "Hotovo. JSON bol skopírovaný.",
  "Done. Copy failed.": "Hotovo. Kopírovanie zlyhalo.",
  "Linked measures": "Prepojené miery",
  "Wall start": "Začiatok steny",
  "Wall end": "Koniec steny",
  "Move wall": "Posunúť stenu",
  Draw: "Kresliť",
  Discard: "Zrušiť",
  Line: "Čiara",
  Rectangle: "Obdĺžnik",
  Circle: "Kruh",
  "Pick Lines": "Vybrať čiary",
  "Floor boundary": "Obrys podlahy",
  Boundary: "Obrys",
  "Ortho ON": "Orto ZAP",
  "Ortho OFF": "Orto VYP",
  Centerline: "Osová čiara",
  End: "Koniec",
  Face: "Strana",
  "Place module": "Vložiť modul",
  "Rotate -90°": "Otočiť -90°",
  "Rotate +90°": "Otočiť +90°",
  "Cancel (Esc)": "Zrušiť (Esc)",
  "Place (Click plan)": "Umiestniť (klikni do plánu)",
  "Move cursor in 2D plan. Click to place. Esc to cancel.":
    "Pohni kurzorom v 2D pláne. Kliknutím umiestniš. Esc zruší.",
  "Placement: canceled.": "Umiestnenie: zrušené.",
  "Placement: invalid (overlap/constraint). Move cursor.":
    "Umiestnenie: neplatné (kolízia/obmedzenie). Posuň kurzor.",
  "Placement: placed.": "Umiestnenie: vložené.",
  "Placement: move cursor, click to place. Esc cancels.":
    "Umiestnenie: pohni kurzorom, klikni pre vloženie. Esc zruší."
};

const EXACT_SK_TEXT_OVERRIDES: Record<string, string> = {
  "Lift-up flap": "Horn\u00fd v\u00fdklop",
  "Double hinged": "Dvojkr\u00eddlov\u00e9 dvierka",
  "Draw worktop": "Kresliť pracovnú dosku",
  "Edit kitchen": "Upraviť kuchyňu",
  "Kitchen group": "Kuchynská skupina",
  "New group": "Nová skupina",
  "Edit group": "Upraviť skupinu",
  "Accept group": "Potvrdiť skupinu",
  Accept: "Potvrdiť",
  New: "Nová",
  "Finish kitchen": "Dokončiť kuchyňu",
  "Kitchen settings": "Nastavenie kuchyne",
  "Upper module height (mm)": "Výška horných modulov (mm)",
  "Upper module position (mm)": "Začiatok horných modulov (mm)",
  Finish: "Dokončiť",
  Low: "Spodné",
  Tall: "Vysoké",
  Top: "Horné",
  Worktop: "Pracovná doska"
};

const PARAM_LABELS_SK: Record<string, string> = {
  assemblyContext: "Kontext zostavy",
  autoFit: "Automatické prispôsobenie",
  backGrooveClearanceMm: "Vôľa drážky chrbta (mm)",
  backGrooveDepthMm: "Hĺbka drážky chrbta (mm)",
  backGrooveOffsetMm: "Odsadenie drážky chrbta (mm)",
  backGrooveWidthMm: "Šírka drážky chrbta (mm)",
  backThickness: "Hrúbka chrbta",
  boardThickness: "Hrúbka dosky",
  bottomGap: "Spodná medzera",
  clipComponentId: "ID klipu",
  depth: "Hĺbka",
  displayName: "Zobrazovaný názov",
  doorDouble: "Dvojité dvierka",
  doorOpen: "Otvorené dvierka",
  drawerBackReserveMm: "Rezerva zadnej steny zásuvky (mm)",
  drawerBoxSideHeight: "Výška boku zásuvkového boxu",
  drawerBoxThickness: "Hrúbka zásuvkového boxu",
  drawerCount: "Počet zásuviek",
  drawerFrontHeights: "Výšky čiel zásuviek",
  exportToIfc: "Exportovať do IFC",
  family: "Rodina",
  frontGap: "Predná medzera",
  frontStackPreset: "Predvoľba skladby čiel",
  frontThicknessMm: "Hrúbka čela (mm)",
  handleComponentId: "ID úchytky",
  handleLengthMm: "Dĺžka úchytky (mm)",
  handlePositionMm: "Pozícia úchytky (mm)",
  handleProjectionMm: "Vyčnievanie úchytky (mm)",
  handleSizeMm: "Veľkosť úchytky (mm)",
  handleType: "Typ úchytky",
  height: "Výška",
  heightCarcass: "Výška korpusu",
  heightMm: "Výška (mm)",
  hingeBottomOffsetMm: "Spodné odsadenie pántu (mm)",
  hingeComponentId: "ID pántu",
  hingeCountPerDoor: "Počet pántov na dvierka",
  hingeTopOffsetMm: "Horné odsadenie pántu (mm)",
  ifcClass: "IFC trieda",
  ifcDescription: "IFC popis",
  ifcName: "IFC názov",
  ifcObjectType: "IFC typ objektu",
  ifcPredefinedType: "IFC preddefinovaný typ",
  ifcTag: "IFC tag",
  isActive: "Aktívny",
  isLocked: "Uzamknutý",
  isValid: "Platný",
  isVisible: "Viditeľný",
  kitchenModuleRole: "Rola kuchynského modulu",
  legComponentId: "ID nožičky",
  legDiameterMm: "Priemer nožičky (mm)",
  legInsetMm: "Odsadenie nožičky (mm)",
  lengthX: "Dĺžka X",
  lengthZ: "Dĺžka Z",
  materials: "Materiály",
  notes: "Poznámky",
  plinthHeight: "Výška sokla",
  plinthSetbackMm: "Odsadenie sokla (mm)",
  positionXmm: "Pozícia X (mm)",
  positionYmm: "Pozícia Y (mm)",
  positionZmm: "Pozícia Z (mm)",
  priceSource: "Zdroj ceny",
  pricingEnabled: "Ocenenie zapnuté",
  quantity: "Množstvo",
  requiresWorktop: "Vyžaduje pracovnú dosku",
  rotationZDeg: "Rotácia Z (°)",
  shelfAutoFit: "Automatické prispôsobenie políc",
  shelfCount: "Počet políc",
  shelfGaps: "Medzery medzi policami",
  sideClearanceMm: "Bočná vôľa (mm)",
  sideGap: "Bočná medzera",
  tags: "Tagy",
  topFrontHeightMm: "Výška horného čela (mm)",
  topGap: "Horná medzera",
  type: "Typ",
  typeId: "ID typu",
  updatedAt: "Aktualizované",
  validationErrors: "Chyby validácie",
  variant: "Variant",
  version: "Verzia",
  width: "Šírka",
  widthMm: "Šírka (mm)",
  worktopThicknessMm: "Hrúbka pracovnej dosky (mm)",
  code: "Kód",
  createdAt: "Vytvorené",
  classificationCode: "Klasifikačný kód",
  classificationSystem: "Klasifikačný systém",
  costOverride: "Prepis nákladov",
  customPriceOverride: "Prepis predajnej ceny",
  depthMm: "Hĺbka (mm)"
};

const PARAM_LABELS_SK_OVERRIDES: Record<string, string> = {
  upperDepthMm: "H\u013abka horn\u00fdch modulov (mm)",
  __fridgeHandleSplitScaleVersion: "Verzia delenia úchytky chladničky",
  backMaterialId: "Materiál chrbta",
  corpusMaterialId: "Materiál korpusu",
  doorHandleOffsetFromSplitMm: "Odsadenie úchytky od delenia dverí (mm)",
  doorSystem: "Systém dvierok",
  drawerBottomMaterialId: "Materiál dna zásuvky",
  flapOpen: "Otvorený výklop",
  freezerDoorHeightMm: "Výška dverí mrazničky (mm)",
  fridgeBottomClearanceMm: "Spodná vôľa chladničky (mm)",
  fridgeDepthMm: "Hĺbka chladničky (mm)",
  fridgeDoorGapMm: "Medzera dverí chladničky (mm)",
  fridgeHeightMm: "Výška chladničky (mm)",
  fridgeSideClearanceMm: "Bočná vôľa chladničky (mm)",
  fridgeTopClearanceMm: "Horná vôľa chladničky (mm)",
  fridgeWidthMm: "Šírka chladničky (mm)",
  frontsMaterialId: "Materiál čiel",
  handleComponentId: "Úchytka",
  handleHorizontalPositionMm: "Vodorovná pozícia úchytky (mm)",
  hangingBracketComponentId: "Závesná konzola",
  liftUpComponentId: "Výklopný mechanizmus",
  plinthHeightMm: "Výška sokla (mm)",
  shelfSupportComponentId: "Podpera police",
  shelfThickness: "Hrúbka police",
  upperHeightMm: "Výška horných modulov (mm)",
  upperStartHeightMm: "Začiatok horných modulov (mm)",
  wallMounted: "Zavesené na stene",
  worktopBackOffsetMm: "Zadné odsadenie pracovnej dosky (mm)",
  worktopDepthMm: "Hĺbka pracovnej dosky (mm)",
  worktopFrontOffsetMm: "Predné odsadenie pracovnej dosky (mm)",
  worktopMaterialId: "Materiál pracovnej dosky"
};

const SYSTEM_DESCRIPTION_SK: Record<string, string> = {
  "Stable identifier of the module type used across exports and downstream mappings.":
    "Stabilný identifikátor typu modulu používaný naprieč exportmi a nadväznými mapovaniami.",
  "Technical module type.": "Technický typ modulu.",
  "Human-readable module name.": "Čitateľný názov modulu.",
  "Higher-level module family.": "Nadradená rodina modulu.",
  "Internal or catalog code.": "Interný alebo katalógový kód.",
  "Concrete module variant.": "Konkrétny variant modulu.",
  "Module data-model/export version.": "Verzia dátového modelu/exportu modulu.",
  "Nominal width in mm.": "Nominálna šírka v mm.",
  "Nominal height in mm.": "Nominálna výška v mm.",
  "Nominal depth in mm.": "Nominálna hĺbka v mm.",
  "Top-level assembly/domain this module belongs to.": "Vrcholová zostava/doména, do ktorej modul patrí.",
  "Kitchen role used when assemblyContext is kitchen.": "Kuchynská rola použitá, keď je assemblyContext kitchen.",
  "Whether the module should receive a worktop board in kitchen composition flows.":
    "Či má modul dostať pracovnú dosku v kuchynských skladbách.",
  "X position in mm.": "Pozícia X v mm.",
  "Y position in mm.": "Pozícia Y v mm.",
  "Z position in mm.": "Pozícia Z v mm.",
  "Rotation around Z in degrees.": "Rotácia okolo osi Z v stupňoch.",
  "Sales price override.": "Prepis predajnej ceny.",
  "Pricing enabled flag.": "Príznak zapnutého ocenenia.",
  "Final price source.": "Zdroj výslednej ceny.",
  "Internal cost override.": "Prepis interných nákladov.",
  "Quantity.": "Množstvo.",
  "Active state.": "Aktívny stav.",
  "Visibility state.": "Stav viditeľnosti.",
  "Lock state.": "Stav uzamknutia.",
  "Validation state.": "Stav validácie.",
  "Validation errors/warnings.": "Chyby/varovania validácie.",
  "Internal note.": "Interná poznámka.",
  "Module tags.": "Tagy modulu.",
  "Creation timestamp.": "Čas vytvorenia.",
  "Update timestamp.": "Čas poslednej úpravy.",
  "IFC export flag.": "Príznak IFC exportu.",
  "IFC class.": "IFC trieda.",
  "IFC predefined type.": "IFC preddefinovaný typ.",
  "IFC name.": "IFC názov.",
  "IFC description.": "IFC popis.",
  "IFC object type.": "IFC typ objektu.",
  "IFC tag.": "IFC tag.",
  "Classification code.": "Klasifikačný kód.",
  "Classification system.": "Klasifikačný systém."
};

const SK_TO_SOURCE_TEXT = new Map<string, string>();
for (const [source, translated] of Object.entries({ ...EXACT_SK_TEXT, ...EXACT_SK_TEXT_OVERRIDES, ...SYSTEM_DESCRIPTION_SK })) {
  if (!SK_TO_SOURCE_TEXT.has(translated)) SK_TO_SOURCE_TEXT.set(translated, source);
}

export function normalizeLanguage(value: string | null | undefined): AppLanguage {
  if (value === "en" || value === "sk") return value;
  return value === "cs" || value === "cz" ? "cs" : "sk";
}

export function localeForLanguage(language: AppLanguage): AppLocale {
  return LOCALES[language];
}

export function formatLocalizedCurrency(value: number, currency: string, options: Intl.NumberFormatOptions = {}): string {
  return new Intl.NumberFormat(localeForLanguage(getCurrentLanguage()), { style: "currency", currency, ...options }).format(value);
}

export function getCurrentLanguage(): AppLanguage {
  try {
    return normalizeLanguage(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return "sk";
  }
}

export function setCurrentLanguage(language: AppLanguage): void {
  const previousLanguage = getCurrentLanguage();
  try {
    window.localStorage.setItem(STORAGE_KEY, language);
  } catch {
    // ignore
  }
  if (typeof document !== "undefined" && document.documentElement) document.documentElement.lang = localeForLanguage(language);
  // Setting the active tenant language to the value already rendered must not
  // synchronously rewalk the entire editor DOM. Besides being needless work,
  // that can block a tab while a large project/catalogue is open.
  if (previousLanguage === language) return;
  for (const listener of listeners) listener(language);
  // The shell can be loaded through a different Vite module URL than an
  // embedded extension/test. A window event keeps every mounted DOM adapter
  // in sync even in that case.
  if (typeof window !== "undefined" && typeof window.dispatchEvent === "function" && typeof CustomEvent !== "undefined") {
    window.dispatchEvent(new CustomEvent("arcigy-language-change"));
  }
}

export function subscribeToLanguageChange(listener: (language: AppLanguage) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function initDomI18n(root: ParentNode = document.body): void {
  domI18nState?.observer.disconnect();
  domI18nState?.unsubscribe();
  domI18nState?.removeWindowListener();
  const language = getCurrentLanguage();
  document.documentElement.lang = localeForLanguage(language);

  const translateNode = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const text = textSources.get(node) ?? node.nodeValue ?? "";
      if (!textSources.has(node)) textSources.set(node, text);
      const next = translatePreservingWhitespace(text);
      if (next !== text) node.nodeValue = next;
      return;
    }

    if (!(node instanceof HTMLElement)) return;
    if (node.closest("[data-i18n-skip]")) return;
    if (node instanceof HTMLTextAreaElement) return;

    translateAttribute(node, "title");
    translateAttribute(node, "aria-label");
    translateAttribute(node, "placeholder");

    if (
      node instanceof HTMLInputElement &&
      (node.type === "button" || node.type === "submit" || node.type === "reset") &&
      node.value.trim()
    ) {
      node.value = translateText(node.value);
    }

    for (const child of Array.from(node.childNodes)) {
      translateNode(child);
    }
  };

  translateNode(root as Node);

  const pendingNodes = new Set<Node>();
  let translationTimer: number | null = null;
  const scheduleTranslation = (node: Node, delayMs = 180) => {
    pendingNodes.add(node);
    if (delayMs === 0 && translationTimer !== null) {
      window.clearTimeout(translationTimer);
      translationTimer = null;
    }
    if (translationTimer !== null) return;
    translationTimer = window.setTimeout(() => {
      translationTimer = null;
      const nodes = [...pendingNodes];
      pendingNodes.clear();
      const scheduledNodes = new Set(nodes);
      // A parent translation already covers its descendants. This turns a
      // large editor render into one cataloguing pass rather than a pass for
      // every inserted child node.
      for (const node of nodes) {
        let ancestor = node.parentNode;
        let covered = false;
        while (ancestor) {
          if (scheduledNodes.has(ancestor)) {
            covered = true;
            break;
          }
          ancestor = ancestor.parentNode;
        }
        if (!covered) translateNode(node);
      }
    }, delayMs);
  };
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      if (record.type === "characterData") {
        const source = textSources.get(record.target);
        if (source && translatePreservingWhitespace(source) !== record.target.nodeValue) {
          textSources.set(record.target, record.target.nodeValue ?? "");
        }
        scheduleTranslation(record.target);
        continue;
      }
      if (record.type === "attributes" && record.target instanceof HTMLElement) {
        scheduleTranslation(record.target);
        continue;
      }
      for (const added of Array.from(record.addedNodes)) {
        scheduleTranslation(added);
      }
    }
  });

  observer.observe(root, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ["title", "aria-label", "placeholder", "value"]
  });
  const onWindowLanguageChange = () => scheduleTranslation(root as Node, 0);
  window.addEventListener("arcigy-language-change", onWindowLanguageChange);
  domI18nState = {
    observer,
    // A live switch takes priority over bootstrap additions but remains
    // coalesced, so it cannot block active 3D interaction.
    unsubscribe: subscribeToLanguageChange(() => scheduleTranslation(root as Node, 0)),
    removeWindowListener: () => window.removeEventListener("arcigy-language-change", onWindowLanguageChange)
  };
}

function translateAttribute(node: HTMLElement, attribute: "title" | "aria-label" | "placeholder") {
  const current = node.getAttribute(attribute);
  if (!current) return;
  const sources = attributeSources.get(node) ?? new Map<string, string>();
  if (!attributeSources.has(node)) attributeSources.set(node, sources);
  const source = sources.get(attribute) ?? current;
  if (!sources.has(attribute)) sources.set(attribute, source);
  const next = translateText(source);
  if (next !== current) node.setAttribute(attribute, next);
}

function translatePreservingWhitespace(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return text;
  const translated = translateText(trimmed);
  if (translated === trimmed) return text;
  const start = text.indexOf(trimmed);
  if (start < 0) return translated;
  return `${text.slice(0, start)}${translated}${text.slice(start + trimmed.length)}`;
}

export function t(text: string): string {
  return translateText(text);
}

/**
 * Build-time guard for user-facing source keys. English is the source locale;
 * Slovak and Czech must both provide an explicit entry instead of falling back
 * to a raw key in the rendered UI.
 */
export function hasSystemTranslation(language: AppLanguage, key: string): boolean {
  if (language === "en") return true;
  const source = SK_TO_SOURCE_TEXT.get(key) ?? key;
  return language === "cs"
    ? Object.prototype.hasOwnProperty.call(EXACT_CS_TEXT, source)
    : Object.prototype.hasOwnProperty.call(EXACT_SK_TEXT_OVERRIDES, source)
      || Object.prototype.hasOwnProperty.call(EXACT_SK_TEXT, source)
      || Object.prototype.hasOwnProperty.call(SYSTEM_DESCRIPTION_SK, source);
}

export function translateParamLabel(key: string): string {
  if (getCurrentLanguage() === "en") return fallbackFormatKeyLabel(key);
  if (getCurrentLanguage() === "cs") return fallbackFormatKeyLabel(key);
  return PARAM_LABELS_SK_OVERRIDES[key] ?? PARAM_LABELS_SK[key] ?? fallbackFormatKeyLabel(key);
}

export function translateParamDescription(description: string): string {
  if (getCurrentLanguage() === "en") return description;
  if (getCurrentLanguage() === "cs") return translateText(description);
  const exact = EXACT_SK_TEXT_OVERRIDES[description] ?? EXACT_SK_TEXT[description] ?? SYSTEM_DESCRIPTION_SK[description];
  if (exact) return exact;
  const exportedMatch = description.match(/^Exported parameter (.+)\.$/);
  if (exportedMatch) {
    return `Exportovaný parameter ${translatePhraseKey(exportedMatch[1] ?? "")}.`;
  }
  return translateText(description);
}

export function translateEnumLabel(value: string): string {
  if (getCurrentLanguage() === "en") return value;
  if (getCurrentLanguage() === "cs") return EXACT_CS_TEXT[value] ?? value;
  return EXACT_SK_TEXT_OVERRIDES[value] ?? EXACT_SK_TEXT[value] ?? value;
}

function translatePhraseKey(value: string): string {
  const normalized = value.trim().replace(/\s+mm$/i, "Mm");
  const camel = normalized.replace(/\s+([a-z])/gi, (_, chr: string) => chr.toUpperCase());
  return PARAM_LABELS_SK_OVERRIDES[camel] ?? PARAM_LABELS_SK[camel] ?? value;
}

function translateSlotToken(token: string): string {
  const exact: Record<string, string> = {
    "back-panel": "zadn\u00fd panel",
    "bottom-panel": "spodn\u00fd panel",
    "left-side": "\u013eav\u00e1 bo\u010dnica",
    "right-side": "prav\u00e1 bo\u010dnica",
    plinth: "sokel",
    "top-panel": "horn\u00fd panel",
    "drawer-front-1": "\u010delo z\u00e1suvky 1",
    "drawer-front-2": "\u010delo z\u00e1suvky 2",
    "drawer-front-3": "\u010delo z\u00e1suvky 3",
    "top-panel-z": "horn\u00fd panel Z",
    "top-panel-x-front": "horn\u00e1 predn\u00e1 prie\u010dka X",
    "top-panel-x-back": "horn\u00e1 zadn\u00e1 prie\u010dka X",
    "door-front-x": "\u010delo dvierok X",
    "door-front-z": "\u010delo dvierok Z"
  };
  if (exact[token]) return exact[token];

  const shelf = token.match(/^shelf-(\d+)-([xz])$/i);
  if (shelf) return `polica ${shelf[1]} ${shelf[2]!.toUpperCase()}`;

  const plinth = token.match(/^plinth-([xz])$/i);
  if (plinth) return `sokel ${plinth[1]!.toUpperCase()}`;

  return token;
}

function translatePartLabel(label: string): string {
  const exact: Record<string, string> = {
    "Left Side Panel": "\u013dav\u00e1 bo\u010dnica",
    "Right Side Panel": "Prav\u00e1 bo\u010dnica",
    "Door Front X": "\u010celo dvierok X",
    "Door Front Z": "\u010celo dvierok Z",
    "Top Rear Rail X": "Horn\u00e1 zadn\u00e1 prie\u010dka X",
    "Top Front Rail X": "Horn\u00e1 predn\u00e1 prie\u010dka X",
    "Top Panel Z": "Horn\u00fd panel Z",
    "Back Panel X": "Zadn\u00fd panel X",
    "Back Panel Z": "Zadn\u00fd panel Z",
    "Bottom Panel X": "Spodn\u00fd panel X",
    "Bottom Panel Z": "Spodn\u00fd panel Z"
  };
  if (exact[label]) return exact[label];

  const slot = label.match(/^Slot (.+)$/);
  if (slot) return `Slot ${translateSlotToken(slot[1] ?? "")}`;

  const drawerBottom = label.match(/^Drawer Box (\d+) Bottom Panel$/);
  if (drawerBottom) return `Box z\u00e1suvky ${drawerBottom[1]} - dno`;

  const drawerFrontBack = label.match(/^Drawer Box (\d+) Front\/Back Panels$/);
  if (drawerFrontBack) return `Box z\u00e1suvky ${drawerFrontBack[1]} - predn\u00fd\/zadn\u00fd diel`;

  const drawerSides = label.match(/^Drawer Box (\d+) Side Panels$/);
  if (drawerSides) return `Box z\u00e1suvky ${drawerSides[1]} - bo\u010dn\u00e9 diely`;

  const shelf = label.match(/^Shelf (\d+) ([XZ])$/);
  if (shelf) return `Polica ${shelf[1]} ${shelf[2]}`;

  const plinth = label.match(/^Plinth ([XZ])$/);
  if (plinth) return `Sokel ${plinth[1]}`;

  return label;
}

function fallbackFormatKeyLabel(key: string): string {
  return key
    .replace(/_/g, " ")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^./, (char) => char.toUpperCase());
}

export function translateText(text: string): string {
  if (!text) return text;
  const source = SK_TO_SOURCE_TEXT.get(text) ?? text;
  if (getCurrentLanguage() === "en") return source;

  if (getCurrentLanguage() === "cs") {
    return EXACT_CS_TEXT[source] ?? text;
  }

  const exact = EXACT_SK_TEXT_OVERRIDES[source] ?? EXACT_SK_TEXT[source] ?? SYSTEM_DESCRIPTION_SK[source];
  if (exact) return exact;

  const translatedPartLabel = translatePartLabel(text);
  if (translatedPartLabel !== text) return translatedPartLabel;

  const prefixMap: Array<[RegExp, string]> = [
    [/^View:\s*/, "Pohľad: "],
    [/^Walls:\s*/, "Steny: "],
    [/^Modules:\s*/, "Moduly: "],
    [/^Worktops:\s*/, "Pracovné dosky: "],
    [/^Sections:\s*/, "Rezy: "],
    [/^Type:\s*/, "Typ: "],
    [/^Length:\s*/, "Dĺžka: "],
    [/^Direction:\s*/, "Smer: "],
    [/^Cut line:\s*/, "Rezná línia: "],
    [/^Position:\s*/, "Pozícia: "],
    [/^Boundary lines:\s*/, "Hraničné čiary: "],
    [/^Reference:\s*/, "Referencia: "],
    [/^Target:\s*/, "Cieľ: "],
    [/^Step:\s*/, "Krok: "],
    [/^Samples:\s*/, "Vzorky: "],
    [/^Underlay:\s*/, "Podklad: "],
    [/^Normal:\s*/, "Normála: "],
    [/^Measure:\s*/, "Meranie: "],
    [/^Hover \(/, "Náhľad ("],
    [/^Measure 3D \(/, "Meranie 3D ("],
    [/^Measure 3D hover \(/, "3D náhľad ("],
    [/^Measuring \(/, "Meranie ("],
    [/^First point \(/, "Prvý bod ("]
  ];

  for (const [pattern, replacement] of prefixMap) {
    if (pattern.test(text)) {
      return text
        .replace(pattern, replacement)
        .replace(/\bwall\(s\)\b/g, "stena/y")
        .replace(/\bmodule\(s\)\b/g, "modul/y")
        .replace(/\bFloorplan\b/g, "Pôdorys")
        .replace(/\bElevation\b/g, "Pohľad")
        .replace(/\bDefault\b/g, "Predvolené")
        .replace(/\bMirrored\b/g, "Zrkadlovo")
        .replace(/\bON\b/g, "Zap")
        .replace(/\bOFF\b/g, "Vyp")
        .replace(/\bloaded\b/g, "načítaný")
        .replace(/\bclick first point\b/gi, "klikni prvý bod")
        .replace(/\bpick second point\b/gi, "vyber druhý bod");
    }
  }

  const moduleSystemSummary = text.match(/^Module (.+) exposes (\d+) system parameter\(s\)\.$/);
  if (moduleSystemSummary) {
    return `Modul ${moduleSystemSummary[1]} obsahuje ${moduleSystemSummary[2]} systémových parametrov.`;
  }

  if (text.includes(" — ")) {
    return translateText(text.replaceAll(" — ", " - "));
  }

  return text
    .replace(/\bON\b/g, "Zap")
    .replace(/\bOFF\b/g, "Vyp")
    .replace(/\bFloorplan\b/g, "Pôdorys")
    .replace(/\bDefault\b/g, "Predvolené")
    .replace(/\bMirrored\b/g, "Zrkadlovo")
    .replace(/\bCopied JSON\b/g, "JSON bol skopírovaný");
}
