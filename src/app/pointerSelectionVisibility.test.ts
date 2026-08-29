import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { isObjectVisibleThroughSelection, pickVisibleSelectionUserDataValue } from "./pointerSelectionVisibility";

describe("pointer selection visibility", () => {
  it("returns true when the object is visible through the selection ancestor", () => {
    const selection = new THREE.Object3D();
    const group = new THREE.Object3D();
    const child = new THREE.Object3D();
    selection.add(group);
    group.add(child);

    expect(isObjectVisibleThroughSelection(child, selection)).toBe(true);
  });

  it("returns false when an ancestor before the selection is hidden", () => {
    const selection = new THREE.Object3D();
    const group = new THREE.Object3D();
    const child = new THREE.Object3D();
    group.visible = false;
    selection.add(group);
    group.add(child);

    expect(isObjectVisibleThroughSelection(child, selection)).toBe(false);
  });

  it("returns false when the object is not under the selection", () => {
    const selection = new THREE.Object3D();
    const child = new THREE.Object3D();

    expect(isObjectVisibleThroughSelection(child, selection)).toBe(false);
  });

  it("picks the first visible user data value matching the expected kind", () => {
    const selection = new THREE.Object3D();
    const wrongKind = new THREE.Object3D();
    const hiddenGroup = new THREE.Object3D();
    const hiddenMatch = new THREE.Object3D();
    const visibleMatch = new THREE.Object3D();
    wrongKind.userData = { kind: "other", action: "wrong" };
    hiddenMatch.userData = { kind: "control", action: "hidden" };
    visibleMatch.userData = { kind: "control", action: "visible" };
    hiddenGroup.visible = false;
    selection.add(wrongKind);
    selection.add(hiddenGroup);
    hiddenGroup.add(hiddenMatch);
    selection.add(visibleMatch);

    expect(
      pickVisibleSelectionUserDataValue<"visible" | "hidden" | "wrong">(
        [{ object: wrongKind }, { object: hiddenMatch }, { object: visibleMatch }],
        selection,
        { kind: "control", valueKey: "action" }
      )
    ).toBe("visible");
  });
});
