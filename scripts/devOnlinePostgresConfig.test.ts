import { describe, expect, it } from "vitest";
import { localDatabaseUrl } from "./devOnlinePostgresConfig";

describe("online PostgreSQL runtime credentials", () => {
  it("uses the app credential while retaining the selected database and local tunnel", () => {
    expect(localDatabaseUrl("postgresql://new-role:new-password@srv-captain--kitchenapp-db/kitchenapp", "kitchenapp-db", 55432))
      .toBe("postgresql://new-role:new-password@127.0.0.1:55432/kitchenapp");
  });

  it.each([
    "postgresql://old:password@srv-captain--another-db/kitchenapp",
    "postgresql://old:password@srv-captain--kitchenapp-db/kitchenapp?sslmode=require",
    "postgresql://old:password@srv-captain--kitchenapp-db/",
    "postgresql://old@srv-captain--kitchenapp-db/kitchenapp",
    "not-a-url"
  ])("rejects an unsafe runtime URL without disclosing it", (url) => {
    expect(() => localDatabaseUrl(url, "kitchenapp-db", 55432))
      .toThrowError(/Runtime app DATABASE_URL/);
  });
});
