import { describe, expect, it } from "vitest";
import { LED_STRIP_MENU_ITEMS } from "./ledStripMenu";

describe("LED strip menu", () => {
  it("keeps the four placement modes ordered with custom last", () => {
    expect(LED_STRIP_MENU_ITEMS.map((item) => item.mode)).toEqual(["underUpper", "plinthJoint", "shelfJoint", "custom"]);
    expect(LED_STRIP_MENU_ITEMS.at(-1)).toMatchObject({ label: "Vlastný" });
  });
});
