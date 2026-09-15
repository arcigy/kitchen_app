import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

const addonRoot = path.join(process.cwd(), "odoo-addons", "arcigy_user_activity");

describe("Arcigy user activity Odoo addon", () => {
  it("keeps the Odoo 19 manifest, security and views wired", async () => {
    const [manifest, access, groups, views] = await Promise.all([
      readFile(path.join(addonRoot, "__manifest__.py"), "utf8"),
      readFile(path.join(addonRoot, "security", "ir.model.access.csv"), "utf8"),
      readFile(path.join(addonRoot, "security", "groups.xml"), "utf8"),
      readFile(path.join(addonRoot, "views", "user_activity_views.xml"), "utf8")
    ]);
    expect(manifest).toContain('"version": "19.0.1.0.0"');
    expect(manifest).toContain('"views/user_activity_views.xml"');
    expect(groups).toContain("group_user_activity_integration");
    expect(groups).toContain("group_user_activity_manager");
    expect(access).not.toMatch(/,1,1,|,1,0,1|,1,0,0,1/);
    expect(views).toContain('res_model">arcigy.user.activity.presence');
    expect(views).toContain('res_model">arcigy.user.activity.daily');
    expect(views).toContain('res_model">arcigy.user.activity.interval');
  });

  it("keeps ingest bounded, role-gated, idempotent and elevated only after validation", async () => {
    const model = await readFile(path.join(addonRoot, "models", "user_activity.py"), "utf8");
    expect(model).toContain("MAX_BATCH_ITEMS = 500");
    expect(model).toContain('has_group("arcigy_user_activity.group_user_activity_integration")');
    expect(model).toContain('set(payload) != {"environment", "source_updated_at", "items"}');
    expect(model).toContain('existing.source_updated_token >= values["source_updated_token"]');
    expect(model).toContain('unique(environment, client_external_id, user_external_id, activity_date)');
    expect(model.indexOf("if set(item) != KIND_KEYS[kind]:")).toBeLessThan(model.indexOf("model = self.sudo()"));
  });
});
