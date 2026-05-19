import { chromium } from "playwright";
import { installAuthSession } from "./uiAuthSession.mjs";

const baseUrl = process.env.PRICING_UI_BASE_URL ?? "http://127.0.0.1:5180/";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await installAuthSession(page);

  try {
    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => !!window.__kitchenDebug, null, { timeout: 30000 });

    const result = await page.evaluate(async () => {
      const [{ createDrawerLowControls }, { makeDefaultDrawerLowParams }, { getSystemSeedCatalog }] = await Promise.all([
        import("/src/modules/drawerLow/controls.ts"),
        import("/src/modules/drawerLow/types.ts"),
        import("/src/core/catalog/catalog-repository.ts")
      ]);

      const host = document.createElement("div");
      document.body.appendChild(host);

      const params = makeDefaultDrawerLowParams();
      const clientCatalog = getSystemSeedCatalog();
      let changes = 0;
      const render = () => {
        host.innerHTML = "";
        createDrawerLowControls(host, params, {
          onChange: () => {
            changes += 1;
            render();
            return true;
          },
          getWorktopThicknessMm: () => 0,
          clientCatalog,
          textInputCommitMode: "explicit",
          commitBoundary: host
        });
      };
      render();

      const text = host.innerText;
      const blockedLabels = [
        "Board Thickness",
        "Back Thickness",
        "Front Thickness",
        "Drawer Box Thickness",
        "Drawer Bottom Thickness",
        "Worktop Thickness"
      ];
      const visibleBlockedLabels = blockedLabels.filter((label) => text.toLowerCase().includes(label.toLowerCase()));

      const partSection = [...host.querySelectorAll("section")].find((section) => {
        const title = section.querySelector(".portable-section__title")?.textContent?.trim().toLowerCase() ?? "";
        return title === "part parameters" || title === "parametre dielov";
      });
      const partRows = partSection ? [...partSection.querySelectorAll(".portable-field")].filter((row) => row.querySelectorAll("select").length >= 2) : [];
      const firstRow = partRows.find((row) => {
        const materialSelect = row.querySelectorAll("select")[0];
        return materialSelect && [...materialSelect.options].some((option) => (option.textContent || "").includes("DTD Grey"));
      }) ?? partRows[0];
      const [firstMaterialSelect, firstThicknessSelect] = firstRow ? [...firstRow.querySelectorAll("select")] : [null, null];

      const getSystemSelect = (id) => host.querySelector(`#${id}`);
      const getSystemCheckbox = (id) => {
        const field = host.querySelector(`label[for="${id}"]`)?.closest(".portable-field");
        return field ? field.querySelector('input[type="checkbox"]') : null;
      };

      const assemblySelect = getSystemSelect("portable_assemblyContext");
      const kitchenRoleSelectBefore = getSystemSelect("portable_kitchenModuleRole");
      const requiresWorktopCheckboxBefore = getSystemCheckbox("portable_requiresWorktop");

      if (!assemblySelect || !kitchenRoleSelectBefore || !requiresWorktopCheckboxBefore) {
        return {
          ok: false,
          reason: "Missing kitchen system controls",
          text: text.slice(0, 3000)
        };
      }

      assemblySelect.value = "generic";
      assemblySelect.dispatchEvent(new Event("change", { bubbles: true }));

      const kitchenRoleSelectHidden = getSystemSelect("portable_kitchenModuleRole");
      const requiresWorktopCheckboxHidden = getSystemCheckbox("portable_requiresWorktop");

      const assemblySelectAfter = getSystemSelect("portable_assemblyContext");
      if (!assemblySelectAfter) {
        return {
          ok: false,
          reason: "Assembly context control disappeared after remount",
          text: host.innerText.slice(0, 3000)
        };
      }

      assemblySelectAfter.value = "kitchen";
      assemblySelectAfter.dispatchEvent(new Event("change", { bubbles: true }));

      const kitchenRoleSelectAfter = getSystemSelect("portable_kitchenModuleRole");
      const requiresWorktopCheckboxAfter = getSystemCheckbox("portable_requiresWorktop");

      if (!firstMaterialSelect || !firstThicknessSelect) {
        return {
          ok: false,
          reason: "Missing material or thickness select",
          text: text.slice(0, 3000)
        };
      }

      const greyOption = [...firstMaterialSelect.options].find((option) => (option.textContent || "").includes("DTD Grey"));
      if (!greyOption) {
        return {
          ok: false,
          reason: "Missing DTD Grey option",
          text: text.slice(0, 3000)
        };
      }

      firstMaterialSelect.value = greyOption.value;
      firstMaterialSelect.dispatchEvent(new Event("change", { bubbles: true }));

      const hasEightMm = [...firstThicknessSelect.options].some((option) => (option.textContent || "").includes("8 mm"));
      const currentThicknessValue = firstThicknessSelect.value;
      const thicknessOption = [...firstThicknessSelect.options].find((option) => option.value !== currentThicknessValue);
      if (thicknessOption) {
        firstThicknessSelect.value = thicknessOption.value;
        firstThicknessSelect.dispatchEvent(new Event("change", { bubbles: true }));
      }

      return {
        ok: true,
        hasPartParameters: /part parameters|parametre dielov/i.test(text),
        hasBackPanelsGroup: /Back Panels|Zadné diely/i.test(text),
        hasSystemParameters: /assembly context|kontext zostavy/i.test(text),
        visibleBlockedLabels,
        changeEvents: changes,
        hasEightMm,
        assemblyContext: params.assemblyContext ?? null,
        kitchenModuleRole: params.kitchenModuleRole ?? null,
        requiresWorktop: params.requiresWorktop ?? null,
        kitchenControlsHiddenOutsideKitchen: !kitchenRoleSelectHidden && !requiresWorktopCheckboxHidden,
        kitchenControlsRestoredInsideKitchen: Boolean(kitchenRoleSelectAfter && requiresWorktopCheckboxAfter),
        boardMaterials: params.commercialSelections?.boardMaterials ?? {},
        boardThicknesses: params.commercialSelections?.boardThicknesses ?? {}
      };
    });

    if (!result?.ok) {
      throw new Error(JSON.stringify(result, null, 2));
    }
    if (!result.hasPartParameters) throw new Error("Part Parameters section did not render.");
    if (!result.hasSystemParameters) throw new Error("System Parameters section did not render.");
    if (!result.hasBackPanelsGroup) throw new Error("Back Panels group did not render.");
    if (result.assemblyContext !== "kitchen") throw new Error(`Expected assemblyContext kitchen, got ${result.assemblyContext}.`);
    if (result.kitchenModuleRole !== "base") throw new Error(`Expected kitchenModuleRole base, got ${result.kitchenModuleRole}.`);
    if (result.requiresWorktop !== true) throw new Error(`Expected requiresWorktop true, got ${result.requiresWorktop}.`);
    if (!result.kitchenControlsHiddenOutsideKitchen) throw new Error("Kitchen-specific controls did not hide outside kitchen context.");
    if (!result.kitchenControlsRestoredInsideKitchen) throw new Error("Kitchen-specific controls did not restore after switching back to kitchen.");
    if ((result.visibleBlockedLabels?.length ?? 0) > 0) {
      throw new Error(`Legacy thickness fields still visible: ${result.visibleBlockedLabels.join(", ")}`);
    }
    if ((result.changeEvents ?? 0) < 1) {
      throw new Error(`Expected at least 1 change event, got ${result.changeEvents ?? 0}.`);
    }
    if (Object.keys(result.boardMaterials ?? {}).length === 0) {
      throw new Error("Material change did not update commercialSelections.boardMaterials.");
    }
    if (Object.keys(result.boardThicknesses ?? {}).length === 0) {
      throw new Error("Thickness change did not update commercialSelections.boardThicknesses.");
    }

    console.log(JSON.stringify({ ok: true, baseUrl, result }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
