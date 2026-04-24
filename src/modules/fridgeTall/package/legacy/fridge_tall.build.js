function fridgeTallBuildV2(n) {
  const e = B0(n);
  fridgeTallAlignDoorFrontsToCarcass(e);
  fridgeTallApplyLegVisuals(e, n);
  fridgeTallAddPlinthClips(e, n);
  fridgeTallWrapDoorWithPivot(e, "freezerDoorFront", n, "freezerDoor_handle", "nearTop");
  fridgeTallWrapDoorWithPivot(e, "fridgeDoorFront", n, "fridgeDoor_handle", "nearBottom");
  if (n.handleType === "none" || !(typeof n.handleComponentId === "string" && n.handleComponentId.length > 0)) {
    const removeHandle = (name) => {
      const handleObject = e.getObjectByName(name);
      if (handleObject?.parent) {
        handleObject.parent.remove(handleObject);
      }
    };
    removeHandle("freezerDoor_handle");
    removeHandle("fridgeDoor_handle");
  }
  return e;
}