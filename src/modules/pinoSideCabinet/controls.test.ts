import { describe, expect, it, vi } from "vitest";
import { FakeElement } from "../../app/testUtils/propertiesPanelHarness";
import { createPinoSideCabinetControls } from "./controls";
import { createPinoSideCabinetPreviewCatalog } from "./previewCatalog";
import { makeDefaultPinoSideCabinetParams, normalizePinoSideCabinetParams } from "./types";

function installTaggedFakeDocument() {
  vi.stubGlobal("document", {
    createElement: (tagName: string) => {
      const element = new FakeElement();
      element.dataset.tagName = tagName;
      if (tagName === "input") element.type = "text";
      return element;
    },
    createTextNode: (text: string) => {
      const node = new FakeElement();
      node.textContent = text;
      return node;
    }
  });
}

function catalog() {
  return createPinoSideCabinetPreviewCatalog();
}

function walk(root: FakeElement, predicate: (node: FakeElement) => boolean): FakeElement[] {
  const out: FakeElement[] = [];
  const visit = (node: FakeElement) => {
    if (predicate(node)) out.push(node);
    for (const child of node.children) visit(child);
  };
  visit(root);
  return out;
}

function findRow(root: FakeElement, label: string): FakeElement {
  const row = walk(root, (node) =>
    node.className.includes("module-package-control") &&
    node.children[0]?.textContent === label
  )[0];
  if (!row) throw new Error(`Row "${label}" not found.`);
  return row;
}

function controlOfTag(row: FakeElement, tagName: string): FakeElement {
  const control = row.children.find((child) => child.dataset.tagName === tagName);
  if (!control) throw new Error(`Control ${tagName} not found.`);
  return control;
}

function mutedBlocks(root: FakeElement) {
  return walk(root, (node) => node.className.includes("muted")).map((node) => node.textContent);
}

describe("createPinoSideCabinetControls", () => {
  it("shows catalog price groups and pdf metadata for the selected side cabinet", () => {
    installTaggedFakeDocument();
    const params = makeDefaultPinoSideCabinetParams();
    const container = new FakeElement() as unknown as HTMLElement;

    createPinoSideCabinetControls(container, params, {
      onChange: vi.fn(() => true),
      clientCatalog: catalog(),
      getWorktopThicknessMm: () => 0
    });

    const priceSelect = controlOfTag(findRow(container as unknown as FakeElement, "Cenova skupina"), "select");
    expect(priceSelect.children.map((child) => child.textContent)).toEqual([
      "0 (930)",
      "1 (1010)",
      "2 (1077)",
      "3 (1157)",
      "4 (1310)",
      "5 (1499)"
    ]);

    const blocks = mutedBlocks(container as unknown as FakeElement).join("\n");
    expect(blocks).toContain("Katalogovy kluc: S-45-BK");
    expect(blocks).toContain("Clanok: S45BK");
    expect(blocks).toContain("PDF strana: 243");
    expect(blocks).toContain("Preview image: output/debug/side_cabinets/page_243.png");
    expect(blocks).toContain("Pricing ref: 03 BK");
    expect(blocks).toContain("Review/staging data");
    expect(blocks).toContain("Rucka:");
  });

  it("switches side cabinet selection and keeps catalog data in sync", () => {
    installTaggedFakeDocument();
    const params = makeDefaultPinoSideCabinetParams();
    const container = new FakeElement() as unknown as HTMLElement;
    const onChange = vi.fn(() => true);

    createPinoSideCabinetControls(container, params, {
      onChange,
      clientCatalog: catalog(),
      getWorktopThicknessMm: () => 0
    });

    const groupSelect = controlOfTag(findRow(container as unknown as FakeElement, "Skupina"), "select");
    groupSelect.value = "dish_storage";
    groupSelect.dispatch("change");

    const widthSelect = controlOfTag(findRow(container as unknown as FakeElement, "Sirka podla katalogu"), "select");
    widthSelect.value = "600";
    widthSelect.dispatch("change");

    const openedInput = controlOfTag(findRow(container as unknown as FakeElement, "Otvorene"), "input");
    openedInput.checked = true;
    openedInput.dispatch("change");

    expect(params.groupId).toBe("dish_storage");
    expect(params.definitionId).toBe("pino_side_cabinet_s_k_page243");
    expect(params.width).toBe(600);
    expect(params.catalogKey).toBe("S-60-K");
    expect(params.articleCode).toBe("S60K");
    expect(params.opened).toBe(true);

    const blocks = mutedBlocks(container as unknown as FakeElement).join("\n");
    expect(blocks).toContain("Katalogovy kluc: S-60-K");
    expect(blocks).toContain("Pricing ref: 03 K");
    expect(blocks).toContain("Interier:");
    expect(onChange).toHaveBeenCalledTimes(3);
  });

  it("shows appliance-specific controls and compatibility details for appliance side cabinets", () => {
    installTaggedFakeDocument();
    const params = normalizePinoSideCabinetParams({
      ...makeDefaultPinoSideCabinetParams(),
      groupId: "appliance_tall",
      definitionId: "pino_side_cabinet_gb_fb_page245",
      width: 600,
      applianceInstalled: true
    });
    const container = new FakeElement() as unknown as HTMLElement;

    createPinoSideCabinetControls(container, params, {
      onChange: vi.fn(() => true),
      clientCatalog: catalog(),
      getWorktopThicknessMm: () => 0
    });

    const applianceTypeRow = findRow(container as unknown as FakeElement, "Typ spotrebica");
    const applianceTypeSelect = controlOfTag(applianceTypeRow, "select");
    const applianceModuleRow = findRow(container as unknown as FakeElement, "Modul spotrebica");
    const applianceModuleSelect = controlOfTag(applianceModuleRow, "select");
    expect(applianceTypeRow.style.display).toBe("grid");
    expect(applianceModuleRow.style.display).toBe("grid");
    expect(applianceTypeSelect.children.map((child) => child.textContent)).toEqual([
      "Tall oven",
      "Tall microwave",
      "Compact appliance"
    ]);
    expect(applianceModuleSelect.children.map((child) => child.textContent)).toEqual([
      "fwm_oven_tower_module (Tall oven)",
      "fwm_microwave_tower_module (Tall microwave)",
      "pino_compact_appliance_insert (Compact appliance)"
    ]);

    expect(params.applianceCategory).toBe("oven_tall");
    expect(params.applianceModuleType).toBe("fwm_oven_tower_module");
    expect(params.applianceWidthMm).toBe(540);
    expect(params.applianceHeightMm).toBe(540);
    expect(params.applianceDepthMm).toBe(450);

    const blocks = mutedBlocks(container as unknown as FakeElement).join("\n");
    expect(findRow(container as unknown as FakeElement, "Vlozeny spotrebic").style.display).toBe("grid");
    expect(params.applianceInstalled).toBe(true);
    expect(blocks).toContain("Appliance host: compatible");
    expect(blocks).toContain("Appliance inserted: yes");
    expect(blocks).toContain("Opening clear:");
    expect(blocks).toContain("Vybrany typ: Tall oven");
  });

  it("switches to catalog profile handles and constrains placement to the integrated-strip rule", () => {
    installTaggedFakeDocument();
    const params = makeDefaultPinoSideCabinetParams();
    const container = new FakeElement() as unknown as HTMLElement;

    createPinoSideCabinetControls(container, params, {
      onChange: vi.fn(() => true),
      clientCatalog: catalog(),
      getWorktopThicknessMm: () => 0
    });

    const handleSelect = controlOfTag(findRow(container as unknown as FakeElement, "Rucka podla katalogu"), "select");
    handleSelect.value = "cmp.pino.handle.886";
    handleSelect.dispatch("change");

    const placementSelect = controlOfTag(findRow(container as unknown as FakeElement, "Poloha rucky"), "select");
    expect(params.handleComponentId).toBe("cmp.pino.handle.886");
    expect(params.handlePlacementCode).toBe("009");
    expect(placementSelect.children.map((child) => child.textContent)).toEqual([
      "009 - Integrated handle strip / handle rail."
    ]);

    const blocks = mutedBlocks(container as unknown as FakeElement).join("\n");
    expect(blocks).toContain("lista s uchyty");
    expect(blocks).toContain("Poloha uchytky 009");
  });

  it("flags incompatible appliance dimensions directly in the side-cabinet controls", () => {
    installTaggedFakeDocument();
    const params = normalizePinoSideCabinetParams({
      ...makeDefaultPinoSideCabinetParams(),
      groupId: "appliance_tall",
      definitionId: "pino_side_cabinet_gb_fb_page245",
      width: 600
    });
    const container = new FakeElement() as unknown as HTMLElement;

    createPinoSideCabinetControls(container, params, {
      onChange: vi.fn(() => true),
      clientCatalog: catalog(),
      getWorktopThicknessMm: () => 0
    });

    const widthInput = controlOfTag(findRow(container as unknown as FakeElement, "Sirka spotrebica (mm)"), "input");
    widthInput.value = "580";
    widthInput.dispatch("change");

    const heightInput = controlOfTag(findRow(container as unknown as FakeElement, "Vyska spotrebica (mm)"), "input");
    heightInput.value = "700";
    heightInput.dispatch("change");

    const depthInput = controlOfTag(findRow(container as unknown as FakeElement, "Hlbka spotrebica (mm)"), "input");
    depthInput.value = "700";
    depthInput.dispatch("change");

    const blocks = mutedBlocks(container as unknown as FakeElement).join("\n");
    expect(blocks).toContain("Appliance host: incompatible");
    expect(blocks).toContain("exceeds opening width");
    expect(blocks).toContain("exceeds opening height");
    expect(blocks).toContain("exceeds preview opening depth");
  });
});
