type CatalogChoice = { id: string; displayName: string };

/** The field displays a name; only a validated catalog choice changes the saved ID. */
export function createCatalogNameInput(args: {
  value: string;
  choices: readonly CatalogChoice[];
  lookup: (id: string) => Promise<CatalogChoice | null>;
  onChange: (id: string) => void;
  placeholder: string;
}) {
  const wrap = document.createElement("div");
  wrap.className = "kitchen-properties-panel__lookup";
  const input = document.createElement("input");
  input.type = "text";
  input.className = "kitchen-properties-panel__material";
  input.placeholder = args.placeholder;
  input.autocomplete = "off";
  const list = document.createElement("datalist");
  list.id = `catalog-names-${crypto.randomUUID()}`;
  input.setAttribute("list", list.id);
  for (const name of new Set(args.choices.map(choice => choice.displayName))) {
    const option = document.createElement("option");
    option.value = name;
    list.append(option);
  }
  const status = document.createElement("small");
  status.className = "kitchen-properties-panel__lookup-status";
  status.setAttribute("role", "status");
  let selected = args.choices.find(choice => choice.id === args.value) ?? null;
  let generation = 0;
  input.value = selected?.displayName ?? "";
  const message = (text = "") => { status.textContent = text; status.hidden = !text; };
  message(args.value && !selected ? "Uložený materiál nie je dostupný v katalógu. Výber zostal zachovaný." : "");
  const commit = async () => {
    const query = input.value.trim();
    const ticket = ++generation;
    const matches = args.choices.filter(choice => choice.displayName.toLocaleLowerCase() === query.toLocaleLowerCase());
    if (matches.length > 1 && selected?.displayName.toLocaleLowerCase() !== query.toLocaleLowerCase()) {
      input.value = selected?.displayName ?? "";
      message("Názov nie je jednoznačný. Vyberte konkrétny materiál v sekcii Materiály.");
      return;
    }
    const named = matches.find(choice => choice.id === selected?.id) ?? matches[0];
    let choice: CatalogChoice | null = named ?? args.choices.find(choice => choice.id === query) ?? null;
    // Names come from the tenant choices. Exact-ID lookup is only a legacy
    // escape hatch; a misspelled human name must not become an HTTP 404 request.
    if (!choice && /^(?:mat|cmp)\./.test(query)) {
      message("Vyhľadávam materiál…");
      try { choice = await args.lookup(query); } catch { /* Keep the previous saved choice. */ }
    }
    if (ticket !== generation) return;
    if (!choice) {
      input.value = selected?.displayName ?? "";
      message("Materiál sa nenašiel. Pôvodný výber zostal zachovaný.");
      return;
    }
    selected = choice;
    input.value = choice.displayName;
    message();
    args.onChange(choice.id);
  };
  input.addEventListener("input", () => { generation += 1; message(); });
  input.addEventListener("change", () => { void commit(); });
  input.addEventListener("keydown", event => {
    if (event.key === "Enter") { event.preventDefault(); void commit(); }
  });
  wrap.append(input, list, status);
  // The tenant catalog supplies the available names. Merely opening properties must
  // neither request missing legacy IDs nor replace the project's saved selection.
  return wrap;
}
