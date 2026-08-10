import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const readSource = (relativePath: string) =>
  readFileSync(new URL(relativePath, import.meta.url), "utf8");

describe("coming-soon frontend bindings", () => {
  it("binds unfinished quick actions to the shared dialog", () => {
    const source = readSource("../app.ts");
    const topbarShellSource = readSource("./createTopbar.ts");

    expect(source).toContain('showComingSoonDialog("Tlač projektu")');
    expect(source).toContain('showComingSoonDialog("Cloud synchronizácia")');
    expect(source).toContain('createFeedbackReportController({');
    expect(source).toContain('showComingSoonDialog("Súbor")');
    expect(topbarShellSource).toContain("getShareButton: () => shareButton");
  });

  it("binds unfinished ribbon and workspace actions to the shared dialog", () => {
    const topbarSource = readSource("../app/classicTopbarController.ts");
    const workspaceSource = readSource("../app/workspaceNavigationController.ts");

    expect(topbarSource).toContain('showComingSoonDialog("Schodisko")');
    expect(topbarSource).toContain('showComingSoonDialog("Obývačková stena")');
    expect(workspaceSource).toContain('showComingSoonDialog(t("Documents"))');
    expect(workspaceSource).toContain('showComingSoonDialog(t("Settings"))');
    expect(workspaceSource).toContain("showComingSoonDialog(sheet.name)");
  });
});
