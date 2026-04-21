import { chromium } from "playwright";

const baseUrl = process.env.PRICING_UI_BASE_URL ?? "http://127.0.0.1:5180/";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

  try {
    await page.goto(baseUrl, { waitUntil: "networkidle" });

    const result = await page.evaluate(async () => {
      const [{ createDrawerLowControls }, { makeDefaultDrawerLowParams }] = await Promise.all([
        import("/src/modules/drawerLow/controls.ts"),
        import("/src/modules/drawerLow/types.ts")
      ]);

      const host = document.createElement("div");
      document.body.appendChild(host);

      const params = makeDefaultDrawerLowParams();
      let changes = 0;
      createDrawerLowControls(host, params, {
        onChange: () => {
          changes += 1;
          return true;
        },
        getWorktopThicknessMm: () => 0,
        textInputCommitMode: "explicit",
        commitBoundary: host
      });

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

      const partSection = [...host.querySelectorAll("section")].find((section) =>
        (section.textContent || "").toLowerCase().includes("part parameters")
      );
      const partRows = partSection ? [...partSection.querySelectorAll("div")].filter((row) => row.querySelectorAll("select").length === 2) : [];
      const firstRow = partRows[0];
      const [firstMaterialSelect, firstThicknessSelect] = firstRow ? [...firstRow.querySelectorAll("select")] : [null, null];
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
        hasPartParameters: text.toLowerCase().includes("part parameters"),
        hasBackPanelsGroup: text.includes("Back Panels"),
        visibleBlockedLabels,
        changeEvents: changes,
        hasEightMm,
        boardMaterials: params.commercialSelections?.boardMaterials ?? {},
        boardThicknesses: params.commercialSelections?.boardThicknesses ?? {}
      };
    });

    if (!result?.ok) {
      throw new Error(JSON.stringify(result, null, 2));
    }
    if (!result.hasPartParameters) throw new Error("Part Parameters section did not render.");
    if (!result.hasBackPanelsGroup) throw new Error("Back Panels group did not render.");
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
