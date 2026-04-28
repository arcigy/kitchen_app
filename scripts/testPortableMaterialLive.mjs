import { chromium } from "playwright";

const baseUrl = process.env.PRICING_UI_BASE_URL ?? "http://127.0.0.1:5180/";

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

  try {
    await page.goto(baseUrl, { waitUntil: "networkidle" });

    const result = await page.evaluate(async () => {
      const [{ createDrawerLowControls }, { makeDefaultDrawerLowParams }, { buildDrawerLow }] = await Promise.all([
        import("/src/modules/drawerLow/controls.ts"),
        import("/src/modules/drawerLow/types.ts"),
        import("/src/modules/drawerLow/geometry.ts")
      ]);

      const host = document.createElement("div");
      document.body.appendChild(host);

      const params = makeDefaultDrawerLowParams();
      params.width = 1500;

      const getLeftSideColor = () => {
        const group = buildDrawerLow(params);
        const mesh = group.getObjectByName("leftSide");
        return mesh?.material?.color?.getHexString?.() ?? null;
      };

      const initialColor = getLeftSideColor();
      let rebuildCount = 0;

      createDrawerLowControls(host, params, {
        onChange: () => {
          rebuildCount += 1;
          getLeftSideColor();
          return true;
        },
        getWorktopThicknessMm: () => 0,
        textInputCommitMode: "explicit",
        commitBoundary: host
      });

      const slotField = [...host.querySelectorAll(".portable-field")].find((field) =>
        /Cabinet Panels|Korpusové diely/i.test(field.textContent || "")
      );
      if (!slotField) {
        return { ok: false, reason: "Missing Cabinet Panels control" };
      }

      const selects = [...slotField.querySelectorAll("select")];
      const materialSelect = selects[0];
      const thicknessSelect = selects[1];
      if (!materialSelect || !thicknessSelect) {
        return { ok: false, reason: "Missing material/thickness selectors" };
      }

      const greyOption = [...materialSelect.options].find((option) => (option.textContent || "").includes("DTD Grey"));
      if (!greyOption) {
        return { ok: false, reason: "Missing DTD Grey material option" };
      }

      materialSelect.value = greyOption.value;
      materialSelect.dispatchEvent(new Event("change", { bubbles: true }));
      const afterMaterialColor = getLeftSideColor();

      const currentThickness = thicknessSelect.value;
      const nextThicknessOption = [...thicknessSelect.options].find((option) => option.value !== currentThickness);
      if (nextThicknessOption) {
        thicknessSelect.value = nextThicknessOption.value;
        thicknessSelect.dispatchEvent(new Event("change", { bubbles: true }));
      }

      return {
        ok: true,
        initialColor,
        afterMaterialColor,
        rebuildCount,
        width: params.width,
        commercialSelections: params.commercialSelections ?? null
      };
    });

    if (!result?.ok) throw new Error(JSON.stringify(result, null, 2));
    if (!result.initialColor || !result.afterMaterialColor) {
      throw new Error(`Missing material colors: ${JSON.stringify(result, null, 2)}`);
    }
    if (result.initialColor === result.afterMaterialColor) {
      throw new Error(`Material change did not affect live module color: ${JSON.stringify(result, null, 2)}`);
    }
    if (result.width !== 1500) {
      throw new Error(`Width changed unexpectedly after material/thickness edits: ${JSON.stringify(result, null, 2)}`);
    }
    if ((result.rebuildCount ?? 0) < 1) {
      throw new Error(`Expected rebuild on material change: ${JSON.stringify(result, null, 2)}`);
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
