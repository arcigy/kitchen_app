type ModuleDescriptorOption = {
  type: string;
};

export function createEditorShell(args: {
  formEl: HTMLElement;
  partsEl: HTMLElement;
  hasImportedModules: boolean;
  availableModuleDescriptors: readonly ModuleDescriptorOption[];
}) {
  args.formEl.innerHTML = "";

  const buildUi = document.createElement("div");
  const layoutUi = document.createElement("div");
  buildUi.style.display = "none";
  args.formEl.appendChild(buildUi);
  args.formEl.appendChild(layoutUi);

  const modelWrap = document.createElement("div");
  modelWrap.className = "field";

  const modelLabel = document.createElement("label");
  modelLabel.textContent = "Model";
  modelLabel.htmlFor = "modelType";

  const modelSelect = document.createElement("select");
  modelSelect.id = "modelType";
  modelSelect.style.width = "120px";
  modelSelect.style.height = "36px";
  modelSelect.style.borderRadius = "10px";
  modelSelect.style.border = "1px solid var(--border)";
  modelSelect.style.background = "#0f1117";
  modelSelect.style.color = "var(--text)";

  if (args.hasImportedModules) {
    modelSelect.innerHTML = args.availableModuleDescriptors
      .map((descriptor) => `<option value="${descriptor.type}">${descriptor.type}</option>`)
      .join("");
  } else {
    modelSelect.innerHTML = `<option value="">No modules imported</option>`;
    modelSelect.disabled = true;
  }

  modelWrap.appendChild(modelLabel);
  modelWrap.appendChild(modelSelect);
  buildUi.appendChild(modelWrap);

  const editorHost = document.createElement("div");
  buildUi.appendChild(editorHost);

  const viewWrap = document.createElement("div");
  viewWrap.className = "field";
  const viewLabel = document.createElement("label");
  viewLabel.textContent = "2D top view";
  viewLabel.htmlFor = "view2d";
  const view2d = document.createElement("input");
  view2d.id = "view2d";
  view2d.type = "checkbox";
  view2d.checked = true;
  view2d.style.justifySelf = "start";
  viewWrap.appendChild(viewLabel);
  viewWrap.appendChild(view2d);
  layoutUi.appendChild(viewWrap);

  const instanceEditorHost = document.createElement("div");
  layoutUi.appendChild(instanceEditorHost);

  const windowEditorHost = document.createElement("div");
  windowEditorHost.style.display = "none";
  layoutUi.appendChild(windowEditorHost);

  args.partsEl.innerHTML = "";
  const partsBuildHost = document.createElement("div");
  const partsLayoutHost = document.createElement("div");
  partsLayoutHost.style.display = "none";
  args.partsEl.appendChild(partsBuildHost);
  args.partsEl.appendChild(partsLayoutHost);

  return {
    buildUi,
    layoutUi,
    modelSelect,
    editorHost,
    view2d,
    instanceEditorHost,
    windowEditorHost,
    partsBuildHost,
    partsLayoutHost
  };
}
