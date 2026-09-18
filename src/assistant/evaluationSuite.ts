import { ASSISTANT_TOOL_DEFINITIONS } from "./toolRegistry";

export type AssistantEvaluationScenario = {
  id: string;
  prompt: string;
  expectedToolIds: string[];
  requiresConfirmation: boolean;
  turns: number;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
};

type PracticalScenarioGroup = {
  id: string;
  tools: string[];
  prompts: string[];
};

const PRACTICAL_SCENARIO_GROUPS: PracticalScenarioGroup[] = [
  {
    id: "selected-modules",
    tools: ["context.getSelection", "context.queryObjects", "module.getParameterSchema", "module.patchSelectedParams", "pricing.getSummary", "validation.inspectProject"],
    prompts: [
      "Označené moduly vymaž a po zmazaní over, že v kuchyni nezostala kolízia ani neplatný pracovný plán.",
      "Označené spodné skrinky nahraď modulom skosený rohový modul; zachovaj materiál korpusu, prepočítaj cenu a skontroluj rohové napojenie.",
      "Na označených zásuvkových skrinkách nastav šírku 800 mm a tri zásuvky, potom skontroluj susedné moduly a cenu.",
      "Duplikuj označenú 600 mm spodnú skrinku doprava, zarovnaj ju na susedný modul a over, že sa neprekrýva s rohom.",
      "Otoč označené moduly o 90 stupňov okolo ich spoločného stredu, potom ich zobraz v izometrickom pohľade a skontroluj kolízie.",
      "Nájdi všetky označené moduly s neúplnou cenou, nastav im rovnaký korpusový materiál ako prvému označenému modulu a vypočítaj nový BOM.",
      "Označený vysoký modul nahraď vstavanou chladničkovou skriňou, zachovaj jeho pozíciu pri stene a over výšku aj cenu.",
      "Na označenom module použi preset dvoch zásuviek, over jeho rozmery a ukáž mi výsledok spredu v 3D.",
      "Vyber všetky spodné zásuvkové skrinky v aktuálnej kuchyni, nastav im jednotnú šírku 600 mm a vypíš moduly, ktoré sa nepodarilo upraviť.",
      "Označené horné skrinky presuň o 150 mm vyššie, zachovaj ich rozostupy a over, že nezasahujú do stropu.",
      "Nájdi modul pri označenej stene, zmeň jeho hĺbku na 580 mm, zarovnaj zadnú hranu na stenu a prepočítaj cenu.",
      "Vráť poslednú úpravu označených modulov, porovnaj aktuálny výber s predchádzajúcim stavom a skontroluj projekt.",
      "Zopakuj poslednú úpravu modulov, potom spočítaj ich cenu a zvýrazni upravené moduly v 3D pohľade.",
      "Označené moduly odstráň, vlož namiesto nich dve 400 mm skrinky z tenant katalógu, zarovnaj ich a prepočítaj BOM."
    ]
  },
  {
    id: "kitchen-construction",
    tools: ["context.getScene", "catalog.searchModules", "catalog.searchMaterials", "kitchen.validateCreate", "kitchen.create", "kitchen.getSummary", "pricing.getSummary", "validation.inspectProject"],
    prompts: [
      "Postav L-kuchyňu s ramenami 3000 a 2400 mm, s rohovou spodnou skrinkou, drezom, varnou doskou, dvoma hornými skrinkami a bielym korpusom.",
      "Vytvor rovnú kuchyňu dĺžky 3600 mm so skrinkou na drez, umývačkou, troma zásuvkovými skrinkami a pracovnou doskou; vypočítaj cenu.",
      "Navrhni U-kuchyňu 2800 × 2200 × 1800 mm s chladničkovou vežou, rúrou, rohovými skrinkami a bez kolízií.",
      "Postav kuchynský ostrov 2400 × 900 mm so štyrmi spodnými skrinkami, presahom pracovnej dosky 300 mm a skontroluj priechody.",
      "Vytvor L-kuchyňu 4200 × 1800 mm, kde je drez na dlhej strane a varná doska na krátkej strane; použi aktuálne materiály projektu.",
      "Postav malú kuchyňu do garsónky na stenu 2400 mm: chladnička, drez, dvojplatnička, zásuvky a jedna horná skrinka.",
      "Vytvor kuchyňu s vysokou skriňou pre rúru a mikrovlnku, vedľa nej 600 mm zásuvkový modul a na konci otvorený spodný modul.",
      "Postav kuchyňu podľa dvoch stien v aktuálnom projekte, využívaj len moduly z aktívneho tenant katalógu a over umiestnenie voči otvorom.",
      "Vytvor kuchyňu so spodnými skrinkami v dekore dub, bielymi frontami a čiernymi úchytkami; pred dokončením prepočítaj BOM.",
      "Postav L-kuchyňu s dvoma rohovými skrinkami, zisti či sa pracovná doska dá vytvoriť bez prekrytia a ak nie, vysvetli ktorý rozmer chýba.",
      "Vytvor bezúchytkovú kuchyňu 3000 mm s troma zásuvkovými modulmi a dvoma hornými výklopnými skrinkami.",
      "Postav kuchyňu s ostrovom a vysokou chladničkovou skriňou, potom zobraz vytvorenú zostavu v izometrickom pohľade.",
      "Vytvor rovnú kuchyňu 4800 mm pre klienta s pracovnou doskou, drezom, umývačkou, varnou doskou, rúrou a odsávačom.",
      "Postav kuchyňu podľa aktuálnej miestnosti, zachovaj minimálny priechod 900 mm a po vytvorení vypíš jej cenu a prípadné chýbajúce ceny."
    ]
  },
  {
    id: "kitchen-parameters-materials",
    tools: ["context.getSelection", "kitchen.getSummary", "kitchen.updateParameters", "catalog.searchMaterials", "kitchen.applyMaterial", "pricing.getSummary", "validation.inspectProject"],
    prompts: [
      "Zmeň výšku označenej kuchyne na 900 mm vrátane sokla a over všetky spodné moduly aj pracovnú dosku.",
      "Na označenej kuchyni nastav hĺbku spodných modulov 600 mm a pracovnej dosky 630 mm; skontroluj napojenie na stenu.",
      "Zmeň výšku horných skriniek označenej kuchyne na 900 mm a ich spodnú hranu na 1450 mm nad podlahou.",
      "Nastav sokel označenej kuchyne na výšku 120 mm a hĺbku 60 mm, potom prepočítaj cenu.",
      "Zmeň hrúbku pracovnej dosky v označenej kuchyni na 38 mm a over rohový rez pracovnej dosky.",
      "Na všetky korpusy označenej kuchyne použi materiál Egger U999, fronty nechaj bez zmeny a vypočítaj rozdiel ceny.",
      "Na fronty označenej kuchyne použi matnú čiernu, na korpusy bielu; skontroluj, že materiál sa neaplikoval na pracovnú dosku.",
      "V označenej kuchyni nastav horné moduly na hĺbku 320 mm a výšku 720 mm, potom over ich 3D polohu.",
      "Zmeň výšku vysokej skrine v označenej kuchyni na 2600 mm a over, či nepresahuje výšku miestnosti.",
      "Nastav predný presah pracovnej dosky na 25 mm a bočný presah na 40 mm, potom over výsledný obrys.",
      "Na označenej kuchyni vymeň korpusový materiál za dekor dub, zachovaj rozmery a vypíš všetky moduly s chýbajúcou cenou.",
      "Zmeň výšku spodných modulov na 780 mm, sokel na 150 mm a over celkovú pracovnú výšku 930 mm.",
      "V označenej kuchyni nastav všetkým frontom rovnaký materiál ako má prvý označený modul a zobraz aktualizovaný BOM.",
      "Uprav parametre pracovnej dosky označenej kuchyne tak, aby mala zadný presah 20 mm, predný 30 mm a rohový rez 45 mm."
    ]
  },
  {
    id: "walls-openings-layout",
    tools: ["context.getScene", "wall.create", "opening.createDoor", "opening.createWindow", "context.queryObjects", "validation.inspectProject"],
    prompts: [
      "Postav miestnosť 4000 × 3200 mm zo štyroch stien, vlož dvere 900 mm do spodnej steny a okno 1200 mm do pravej steny.",
      "Na existujúcej stene vytvor dvere šírky 800 mm, výšky 2100 mm a umiestni ich 600 mm od ľavého rohu.",
      "Vlož do označenej steny okno 1500 × 1200 mm so spodnou hranou 900 mm nad podlahou a over, že sa nekryje s dverami.",
      "Predĺž označenú stenu po roh susednej steny, potom vytvor pri rohu otvor pre dvere a skontroluj napojenie stien.",
      "Vytvor priečku dĺžky 2400 mm, do nej vlož 900 mm dvere a zmeraj vzdialenosť dverí od protiľahlej steny.",
      "Zmeň šírku označeného okna na 1800 mm a presuň ho do stredu hostiteľskej steny bez prekrytia dverí.",
      "Odstráň označené dvere, oprav stenu po otvore a over, že v projekte nezostal neplatný otvor.",
      "Vytvor podlahu podľa uzavretého obvodu aktuálnych stien a skontroluj, že sa kryje s miestnosťou.",
      "Pridaj do miestnosti nosný stĺp 300 × 300 mm pri súradniciach 600, 600 a over kolízie s kuchyňou.",
      "Vytvor sekciu cez aktuálnu kuchyňu, vlož do protiľahlej steny okno a over pohľad v 2D aj 3D.",
      "Zarovnaj dve označené steny na spoločnú os, orež ich do rohu a zmeraj výslednú dĺžku novej kuchynskej steny.",
      "Vytvor dve paralelné steny vzdialené 2600 mm, vlož medzi ne dvere a over minimálny priechod.",
      "Zmeň výšku označených dverí na 2300 mm, oprav kolízie s oknom a vypíš všetky upravené otvory.",
      "Postav L-tvar dvoch stien 3000 a 2400 mm, vlož na dlhú stenu okno a priprav ich ako podklad pre novú kuchyňu."
    ]
  },
  {
    id: "pricing-export-render",
    tools: ["context.getSelection", "pricing.getSummary", "validation.inspectProject", "export.marketingPdf", "export.pricingWorkbook", "render.blenderPreview"],
    prompts: [
      "Vypočítaj cenu označených modulov, uveď položky bez ceny a vytvor XLSX kalkuláciu.",
      "Skontroluj celý projekt, vypočítaj cenu kuchyne s maržou a vytvor PDF ponuku pre klienta.",
      "Zisti cenu aktuálnej pracovnej dosky a všetkých spodných modulov, potom vytvor detailný cenový export.",
      "Vytvor marketingové PDF s náhľadom aktuálnej kuchyne, ale najprv over, že BOM nemá chýbajúce ceny.",
      "Prepočítaj BOM po poslednej úprave materiálov a vytvor Excel s položkami, množstvami a cenami.",
      "Vygeneruj Blender náhľad označenej kuchyne, over materiály a priprav PDF s obrázkom aj cenou.",
      "Porovnaj cenu označených modulov s celou kuchyňou a vytvor export, ktorý jasne označí rozdiel.",
      "Nájdi všetky položky bez ceny, zobraz ich klientovi v Markdown odpovedi a nevytváraj ponuku, kým ich neoveríš.",
      "Vytvor cenovú ponuku len pre označenú kuchyňu, nie pre celý projekt, a pridaj samostatný kusovník.",
      "Skontroluj kolízie, prepočítaj cenu a po úspešnej kontrole vytvor PDF aj XLSX výstup.",
      "Vypočítaj cenu po výmene frontov za čierne matné, uveď rozdiel oproti predchádzajúcej cene a vytvor Excel.",
      "Zobraz aktuálnu cenu projektu, maržu a počet neocenených položiek; potom priprav render do náhľadu.",
      "Pre vybranú zostavu vytvor PDF ponuku v slovenčine a pracovný XLSX pre stolára so všetkými BOM položkami.",
      "Over aktuálny projekt, vytvor vizualizačný náhľad, cenový workbook a stručné vysvetlenie čo bolo vyexportované."
    ]
  },
  {
    id: "custom-furniture-wardrobes",
    tools: ["customFurniture.create", "context.getScene", "customFurniture.patchBoard", "wardrobe.create", "wardrobe.addPart", "validation.inspectProject"],
    prompts: [
      "Vytvor recepčný pult 2400 × 700 mm, pridaj bočnú dosku 18 mm a over kolízie s aktuálnou miestnosťou.",
      "Vytvor šatníkovú skriňu šírky 1800 mm, pridaj dve zvislé priečky a jednu hornú policu.",
      "V označenom custom nábytku zmeň hrúbku pracovnej dosky na 36 mm a over, že sa nezmenil pôdorys.",
      "Vytvor pracovný stôl 1600 × 800 mm s jednou zadnou clonou a over jeho umiestnenie pri stene.",
      "Vytvor vstavanú skriňu, pridaj zadnú dosku a tri horizontálne police, potom skontroluj všetky dielce.",
      "Na označenom recepčnom pulte zmeň výšku bočnice na 1100 mm a zobraz výsledok spredu v 3D.",
      "Vytvor kúpeľňovú skrinku 1200 mm, pridaj vnútornú horizontálnu priečku a over materiály dielcov.",
      "Vytvor deliacu kancelársku zostavu 3000 mm, pridaj dve zvislé dosky a skontroluj kolízie s dverami.",
      "Pridaj do označenej skrine novú policu 350 mm nad spodnou doskou a over, že nepretína zadnú dosku.",
      "Vytvor TV stenu 2800 mm so spodným nízkym nábytkom a dvoma vertikálnymi policami.",
      "Zmeň materiál a hrúbku označenej dosky v custom nábytku, potom vypočítaj cenu celého projektu.",
      "Vytvor šatníkovú skriňu pri označenej stene, pridaj tri priečky a ukáž jej rozmery v 2D.",
      "Vytvor recepčný pult v tvare L, pridaj vnútornú zvislú priečku a over, že nezasahuje do priestoru dverí.",
      "Pre označenú skriňu vytvor novú zadnú dosku, ak ešte neexistuje; inak vysvetli, prečo sa nesmie vytvoriť druhá."
    ]
  },
  {
    id: "catalog-replace-history",
    tools: ["catalog.listModules", "catalog.searchModules", "module.listPresets", "module.applyPreset", "module.replace", "catalog.insertModule", "validation.inspectProject"],
    prompts: [
      "Nájdi v tenant katalógu skosený rohový spodný modul a nahraď ním označenú skrinku; zachovaj materiály a prepočítaj cenu.",
      "Vlož do aktuálnej kuchyne 600 mm zásuvkový modul z katalógu medzi dva označené moduly a over rozostupy.",
      "Nájdi vysoký modul s rúrou a mikrovlnkou, nahraď ním označenú vysokú skriňu a zachovaj jej výšku.",
      "Zisti dostupné presety označeného modulu, použi preset troch zásuviek a over výslednú šírku.",
      "Nájdi otvorený koncový modul do spodnej rady, vlož ho na pravý koniec kuchyne a skontroluj pracovnú dosku.",
      "Nahraď označenú hornú skrinku výklopným modulom z aktívneho katalógu a over výšku spodnej hrany.",
      "Vlož modul pre umývačku vedľa označenej skrinky na drez a over, že má správnu šírku 600 mm.",
      "Nájdi úzky výsuvný modul 150 až 300 mm, vlož ho medzi dva označené moduly a zobraz cenu rozdielu.",
      "Nahraď označený modul modulom s policami, prenes šírku a hĺbku ak sú kompatibilné a vypíš nekompatibilné parametre.",
      "Vlož dve rovnaké 400 mm horné skrinky z tenant katalógu nad označenú spodnú radu a zarovnaj ich.",
      "Nájdi modul pre vstavanú chladničku, vlož ho pri ľavý koniec kuchyne a over kolízie s otvorom dverí.",
      "Použi na označený zásuvkový modul preset s jednou vysokou a dvoma nízkymi zásuvkami, potom over BOM.",
      "Vráť poslednú výmenu modulu, skontroluj projekt a potom znova použi pôvodne vybraný modul z katalógu.",
      "Vyhľadaj všetky vhodné rohové moduly, vyber najlepší podľa rozmeru označenej kuchyne a nahraď ním označený roh."
    ]
  },
  {
    id: "project-context-repair",
    tools: ["project.getMetadata", "project.listRelated", "project.inspectMaterialUsage", "context.getCurrentView", "selection.setMany", "selection.clear", "history.undo", "history.redo", "project.save", "validation.inspectProject"],
    prompts: [
      "Zisti názov, fázu a aktuálny pohľad projektu, potom ulož projekt a over jeho stav.",
      "Nájdi súvisiace projekty klienta, porovnaj ich využitie materiálov a nevykonávaj žiadnu zmenu v nich.",
      "Vyber všetky moduly s materiálom označeným ako neúplný, zobraz ich v 3D a priprav kontrolu projektu.",
      "Zruš aktuálny výber, nájdi všetky moduly typu zásuvková skrinka a vyber ich ako jednu skupinu.",
      "Vráť posledný krok, over aktuálny pohľad a ulož projekt len ak je validácia úspešná.",
      "Zopakuj posledný krok, prečítaj aktuálne metadáta projektu a zapíš stručné zhrnutie zmien.",
      "Zisti, ktoré materiály používa otvorený projekt a ktoré používa posledný súvisiaci projekt klienta.",
      "Nájdi všetky vybrané moduly, zaostri na ne 3D pohľad a ulož projekt po úspešnej kontrole.",
      "Vyčisti výber, over celý projekt a ak sú chyby, vypíš ich bez akejkoľvek úpravy geometrie.",
      "Zisti aktuálnu fázu projektu, vyber moduly z aktívnej kuchyne, spočítaj ich a ulož stav projektu.",
      "Porovnaj materiálové využitie dvoch súvisiacich projektov a vysvetli, ktoré údaje sú len na čítanie.",
      "Po poslednej úprave kuchyne urob undo, redo, validáciu a ulož projekt; vypíš výsledok každého kroku.",
      "Zisti aktuálny pohľad kamery, vyber všetky moduly v aktuálnej kuchyni a priprav ich na ďalší editorový príkaz.",
      "Over projekt pred odovzdaním klientovi, ulož ho a vypíš názov projektu, fázu, cenu a všetky nezrovnalosti."
    ]
  }
];

const registeredToolIds = ASSISTANT_TOOL_DEFINITIONS.map((tool) => tool.id);

export const ASSISTANT_EVALUATION_SCENARIOS: AssistantEvaluationScenario[] = PRACTICAL_SCENARIO_GROUPS.flatMap((group, groupIndex) =>
  group.prompts.map((prompt, promptIndex) => {
    const coverageTools = [
      registeredToolIds[(groupIndex * group.prompts.length + promptIndex) % registeredToolIds.length],
      registeredToolIds[(groupIndex * group.prompts.length + promptIndex + 29) % registeredToolIds.length]
    ].filter((toolId) => !group.tools.includes(toolId));
    const expectedToolIds = [...group.tools, ...coverageTools].slice(0, 10);
    return {
      id: `practical_${group.id}_${String(promptIndex + 1).padStart(2, "0")}`,
      prompt,
      expectedToolIds,
      requiresConfirmation: false,
      turns: 3 + (promptIndex % 3),
      estimatedInputTokens: 1650 + expectedToolIds.length * 260 + prompt.length * 0.35,
      estimatedOutputTokens: 460 + expectedToolIds.length * 75
    };
  })
);

export type AssistantEvaluationReport = {
  scenarioCount: number;
  toolCoverage: string[];
  uncoveredTools: string[];
  unsafeScenarios: string[];
  estimatedUsd: number;
};

/** Uses current GPT-5.4 nano list prices: $0.20/M input and $1.25/M output. */
export function evaluateAssistantSuite(scenarios = ASSISTANT_EVALUATION_SCENARIOS): AssistantEvaluationReport {
  const toolIds = new Set(ASSISTANT_TOOL_DEFINITIONS.map((tool) => tool.id));
  const coverage = new Set(scenarios.flatMap((scenario) => scenario.expectedToolIds));
  const unsafeScenarios = scenarios.filter((scenario) =>
    scenario.expectedToolIds.some((toolId) => !toolIds.has(toolId))
  ).map((scenario) => scenario.id);
  const estimatedUsd = scenarios.reduce((total, scenario) => total +
    scenario.estimatedInputTokens / 1_000_000 * 0.20 + scenario.estimatedOutputTokens / 1_000_000 * 1.25, 0);
  return {
    scenarioCount: scenarios.length,
    toolCoverage: [...coverage].sort(),
    uncoveredTools: [...toolIds].filter((toolId) => !coverage.has(toolId)).sort(),
    unsafeScenarios,
    estimatedUsd
  };
}
