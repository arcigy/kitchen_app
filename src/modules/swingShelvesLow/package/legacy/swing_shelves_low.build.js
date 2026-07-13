function swingShelvesLowBuildV2(n) {
  const e = new St();
  e.name = "swingShelvesLowModule";
  const widthMm = Math.max(300, Number(n.width) || 800);
  const heightMm = Math.max(50, Number(n.height) || 700);
  const worktopThicknessMm = Math.max(0, Number(n.worktopThicknessMm ?? 38) || 0);
  const heightCarcassMm = Math.max(50, Number(n.heightCarcass ?? heightMm - worktopThicknessMm) || heightMm - worktopThicknessMm);
  const depthMm = Math.max(200, Number(n.depth) || 560);
  const boardThicknessMm = Math.max(5, Number(n.boardThickness) || 18);
  const shelfThicknessMm = Math.max(5, Number(n.shelfThickness ?? boardThicknessMm) || boardThicknessMm);
  const backThicknessMm = Math.max(3, Number(n.backThickness) || 6);
  const frontThicknessMm = Math.max(5, Number(n.frontThicknessMm ?? 18) || 18);
  const plinthHeightMm = Math.max(0, Number(n.plinthHeight ?? 100) || 0);
  const plinthSetbackMm = Math.max(0, Number(n.plinthSetbackMm ?? 60) || 0);
  const sideGapMm = Math.max(0, Number(n.sideGap ?? 2) || 0);
  const topGapMm = Math.max(0, Number(n.topGap ?? 2) || 0);
  const bottomGapMm = Math.max(0, Number(n.bottomGap ?? 2) || 0);
  const frontGapMm = Math.max(0, Number(n.frontGap ?? 2) || 0);
  const grooveDepthMm = Math.max(0, Number(n.backGrooveDepthMm ?? 8) || 0);
  const grooveWidthMm = Math.max(0, Number(n.backGrooveWidthMm ?? 8) || 0);
  const grooveClearanceMm = Math.max(0, Number(n.backGrooveClearanceMm ?? 1) || 0);
  n.height = Math.max(50, Math.round(heightCarcassMm + worktopThicknessMm));
  n.heightCarcass = Math.max(50, Math.round(heightCarcassMm));
  const t = widthMm * Qt;
  const i = n.heightCarcass * Qt;
  const o = depthMm * Qt;
  const r = boardThicknessMm * Qt;
  const a = shelfThicknessMm * Qt;
  const s = backThicknessMm * Qt;
  const l = frontThicknessMm * Qt;
  const c = plinthHeightMm * Qt;
  const d = sideGapMm * Qt;
  const h = topGapMm * Qt;
  const f = bottomGapMm * Qt;
  const m = frontGapMm * Qt;
  const v = Math.min(r, Math.max(0, grooveDepthMm) * Qt);
  const M = Math.min(Math.max(s, grooveWidthMm * Qt), Math.max(s, o * 0.25));
  const p = Math.max(0, grooveClearanceMm * Qt);
  const grooveOffset = Math.max(0, (Number(n.backGrooveOffsetMm ?? 12) || 0) * Qt);
  const u = Math.max(0.05, i - c);
  const b = Math.max(0.05, t - 2 * r);
  const backWidth = Math.max(0.05, b + 2 * v - p);
  const backHeight = Math.max(0.05, u - 2 * r + 2 * v - p);
  const backZ = -o / 2 + Math.max(Math.max(s, M) / 2, r / 2) + grooveOffset;
  const shelfBackLimitZ = backZ + s / 2 + 2e-3;
  const shelfFrontLimitZ = o / 2 - Math.max(4e-3, r / 2);
  const x = Math.max(0.05, shelfFrontLimitZ - shelfBackLimitZ);
  const shelfCenterZ = shelfBackLimitZ + x / 2;
  const bodyMaterial = n.materials.bodyPbr ? Ui({ fallbackColor: n.materials.bodyColor, ref: n.materials.bodyPbr }) : new Xe({ color: Zl(n.materials.bodyColor), roughness: 0.85, metalness: 0 });
  const frontMaterial = new Xe({ color: Zl(n.materials.frontColor), roughness: 0.65, metalness: 0 });
  const backMaterial = new Xe({ color: Zl(n.materials.backInsideColor ?? "#f4f4f4"), roughness: 0.86, metalness: 0.02 });
  const hardwareMaterial = new Xe({ color: 3817291, roughness: 0.45, metalness: 0.35 });
  const legMaterial = new Xe({ color: 2764602, roughness: 0.6, metalness: 0.1 });
  const clipMaterial = new Xe({ color: 6317938, roughness: 0.7, metalness: 0.05 });
  const markPart = (mesh, dimensions, grain = "none") => {
    mesh.userData.selectable = true;
    mesh.userData.dimensionsMm = {
      width: dimensions.width / Qt,
      height: dimensions.height / Qt,
      depth: dimensions.depth / Qt
    };
    mesh.userData.grainAlong = grain;
    if (n.materials.bodyPbr) {
      Oi(mesh.geometry, { x: dimensions.width, y: dimensions.height, z: dimensions.depth }, grain, {
        texScaleM: Ii(n.materials.bodyPbr.id)
      });
    }
  };
  const setParamKeys = (mesh, paramKeys) => {
    mesh.userData ?? (mesh.userData = {});
    mesh.userData.paramKeys = [...paramKeys];
  };
  const createPanel = (name, width, height, depth, material, position, paramKeys, grain = "none") => {
    const mesh = new oe(new Se(width, height, depth), material);
    mesh.name = name;
    mesh.position.set(position.x, position.y, position.z);
    markPart(mesh, { width, height, depth }, grain);
    setParamKeys(mesh, paramKeys);
    e.add(mesh);
    return mesh;
  };
  createPanel("leftSide", r, u, o, bodyMaterial, { x: -(t / 2 - r / 2), y: c + u / 2, z: 0 }, [
    "width",
    "heightCarcass",
    "depth",
    "plinthHeight",
    "boardThickness",
    "worktopThicknessMm"
  ], "height");
  createPanel("rightSide", r, u, o, bodyMaterial, { x: t / 2 - r / 2, y: c + u / 2, z: 0 }, [
    "width",
    "heightCarcass",
    "depth",
    "plinthHeight",
    "boardThickness",
    "worktopThicknessMm"
  ], "height");
  createPanel("bottom", b, r, o, bodyMaterial, { x: 0, y: c + r / 2, z: 0 }, [
    "width",
    "depth",
    "boardThickness",
    "plinthHeight"
  ], "width");
  createPanel("top", b, r, o, bodyMaterial, { x: 0, y: i - r / 2, z: 0 }, [
    "width",
    "heightCarcass",
    "depth",
    "boardThickness",
    "worktopThicknessMm"
  ], "width");
  createPanel("back", backWidth, backHeight, s, backMaterial, {
    x: 0,
    y: c + r + backHeight / 2,
    z: backZ
  }, [
    "width",
    "heightCarcass",
    "depth",
    "boardThickness",
    "backThickness",
    "backGrooveDepthMm",
    "backGrooveWidthMm",
    "backGrooveClearanceMm",
    "plinthHeight"
  ], "width");
  if (c > 0) {
    createPanel("plinth", b, c, r, bodyMaterial, {
      x: 0,
      y: c / 2,
      z: o / 2 - plinthSetbackMm * Qt - r / 2
    }, ["width", "plinthHeight", "plinthSetbackMm", "depth", "boardThickness"], "width");
  }
  const shelfCount = Math.max(0, Math.round(Number(n.shelfCount ?? 4)) - 1);
  const internalShelfClearHeight = Math.max(0.05, u - 2 * r - shelfCount * a);
  const rawShelfGapsMm = Array.isArray(n.shelfGaps) ? n.shelfGaps.map((value) => Number(value)).filter((value) => Number.isFinite(value) && value >= 0) : [];
  const shelfGapHeights = shelfCount === 0 ? [] : n.shelfAutoFit === true ? Array.from({ length: shelfCount + 1 }, () => internalShelfClearHeight / (shelfCount + 1)) : (() => {
    const resolvedGaps = rawShelfGapsMm.length === shelfCount + 1 ? rawShelfGapsMm.slice(0, shelfCount + 1) : rawShelfGapsMm.slice(0, shelfCount);
    const consumedHeight = resolvedGaps.reduce((sum, value) => sum + value * Qt, 0);
    const topGapHeight = Math.max(
      5e-3,
      internalShelfClearHeight - consumedHeight
    );
    return rawShelfGapsMm.length === shelfCount + 1 ? resolvedGaps.map((value) => value * Qt) : [...resolvedGaps.map((value) => value * Qt), topGapHeight];
  })();
  let shelfCursorY = c + r;
  for (let index = 0; index < shelfCount; index += 1) {
    const gapHeight = shelfGapHeights[index] ?? internalShelfClearHeight / Math.max(1, shelfCount + 1);
    shelfCursorY += gapHeight;
    createPanel(`shelf-${index + 1}-x`, b, a, x, bodyMaterial, {
      x: 0,
      y: shelfCursorY + a / 2,
      z: shelfCenterZ
    }, ["shelfCount", "shelfThickness", "shelfAutoFit", "shelfGaps", "heightCarcass", "depth"], "width");
    shelfCursorY += a;
  }
  const handleCatalogId = typeof n.handleComponentId === "string" && n.handleComponentId.trim().length > 0 ? n.handleComponentId.trim() : null;
  const hingeCatalogId = typeof n.hingeComponentId === "string" && n.hingeComponentId.trim().length > 0 ? n.hingeComponentId.trim() : "cmp.hinge.clip_on.softclose";
  const doorHeight = Math.max(0.08, u - h - f);
  const doorCenterY = c + f + doorHeight / 2;
  const doorZ = o / 2 + l / 2;
  const handleLength = Math.max(0.06, (Number(n.handleLengthMm ?? 160) || 160) * Qt);
  const handleThickness = Math.max(6e-3, (Number(n.handleSizeMm ?? 12) || 12) * Qt);
  const handleProjection = Math.max(6e-3, (Number(n.handleProjectionMm ?? 14) || 14) * Qt);
  const handleOffsetTop = Math.max(0, (Number(n.handlePositionMm ?? 60) || 60) * Qt);
  const hingeCountPerDoor = Math.max(1, Math.min(6, Math.round(Number(n.hingeCountPerDoor ?? 2) || 2)));
  const hingeTopOffset = Math.max(0, (Number(n.hingeTopOffsetMm ?? 110) || 110) * Qt);
  const hingeBottomOffset = Math.max(0, (Number(n.hingeBottomOffsetMm ?? 110) || 110) * Qt);
  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
  const addHandle = (pivot, doorWidth, hingeSide, name) => {
    if (n.handleType === "none" || !handleCatalogId) return;
    const resolvedHandleLength = Math.min(handleLength, Math.max(0.06, doorWidth - 0.08));
    const handleCenterY = clamp(doorHeight / 2 - handleOffsetTop, -doorHeight / 2 + 0.03, doorHeight / 2 - 0.03);
    const handleCenterX = hingeSide === "left" ? clamp(doorWidth - resolvedHandleLength / 2 - 0.04, resolvedHandleLength / 2 + 0.02, doorWidth - resolvedHandleLength / 2 - 0.02) : clamp(-doorWidth + resolvedHandleLength / 2 + 0.04, -doorWidth + resolvedHandleLength / 2 + 0.02, -(resolvedHandleLength / 2 + 0.02));
    if (n.handleType === "knob") {
      const knobRadius = Math.min(Math.max(handleThickness / 2, 6e-3), 0.03);
      const knobDepth = Math.min(Math.max(handleProjection, 8e-3), 0.06);
      const knob = new oe(new wt(knobRadius, knobRadius, knobDepth, 18), hardwareMaterial);
      knob.name = name;
      knob.userData.catalogComponentId = handleCatalogId;
      knob.userData.componentType = "handle";
      knob.rotation.x = Math.PI / 2;
      knob.position.set(handleCenterX, handleCenterY, l / 2 + knobDepth / 2 + 1e-3);
      markPart(knob, { width: knobRadius * 2, height: knobRadius * 2, depth: knobDepth });
      setParamKeys(knob, ["handleComponentId", "handlePositionMm", "handleLengthMm", "handleSizeMm", "handleProjectionMm"]);
      pivot.add(knob);
      return;
    }
    const handle = new oe(new Se(resolvedHandleLength, handleThickness, handleProjection), hardwareMaterial);
    handle.name = name;
    handle.userData.catalogComponentId = handleCatalogId;
    handle.userData.componentType = "handle";
    handle.position.set(handleCenterX, handleCenterY, l / 2 + handleProjection / 2 + 1e-3);
    markPart(handle, { width: resolvedHandleLength, height: handleThickness, depth: handleProjection });
    setParamKeys(handle, ["handleComponentId", "handlePositionMm", "handleLengthMm", "handleSizeMm", "handleProjectionMm"]);
    pivot.add(handle);
  };
  const addHinges = (pivot, doorWidth, hingeSide, namePrefix) => {
    const availableHeight = Math.max(0.05, doorHeight - hingeTopOffset - hingeBottomOffset);
    const step = hingeCountPerDoor === 1 ? 0 : availableHeight / (hingeCountPerDoor - 1);
    const hingeWidth = 0.062;
    const hingeHeight = 0.034;
    const hingeThickness = 25e-4;
    const cupDiameter = 0.035;
    const cupDepth = Math.max(4e-3, Math.min(l * 0.55, 0.012));
    const armWidth = 0.018;
    const armHeight = 0.012;
    const armDepth = 0.03;
    const hingeEdgeInset = 6e-3;
    const sideOffset = hingeSide === "left" ? hingeWidth / 2 + hingeEdgeInset : -hingeWidth / 2 - hingeEdgeInset;
    const doorPlateZ = -l / 2 - hingeThickness / 2 - 15e-4;
    const cupZ = -l / 2 + cupDepth / 2 + 5e-4;
    const armZ = -l / 2 - hingeThickness - armDepth / 2 - 15e-4;
    for (let index = 0; index < hingeCountPerDoor; index += 1) {
      const localY = doorHeight / 2 - hingeTopOffset - index * step;
      const doorPlate = new oe(new Se(hingeWidth, hingeHeight, hingeThickness), hardwareMaterial);
      doorPlate.name = `${namePrefix}_hinge_${index + 1}`;
      doorPlate.userData.catalogComponentId = hingeCatalogId;
      doorPlate.userData.componentType = "hinge";
      doorPlate.position.set(
        clamp(sideOffset, -doorWidth + hingeWidth / 2 + 1e-3, doorWidth - hingeWidth / 2 - 1e-3),
        localY,
        doorPlateZ
      );
      markPart(doorPlate, { width: hingeWidth, height: hingeHeight, depth: hingeThickness });
      setParamKeys(doorPlate, ["hingeComponentId", "hingeCountPerDoor", "hingeTopOffsetMm", "hingeBottomOffsetMm", "doorOpen"]);
      pivot.add(doorPlate);
      const hingeCup = new oe(new wt(cupDiameter / 2, cupDiameter / 2, cupDepth, 18), hardwareMaterial);
      hingeCup.name = `${namePrefix}_hinge_${index + 1}_cup`;
      hingeCup.userData.catalogComponentId = hingeCatalogId;
      hingeCup.userData.componentType = "hinge";
      hingeCup.rotation.x = Math.PI / 2;
      hingeCup.position.set(
        clamp(sideOffset, -doorWidth + cupDiameter / 2 + 1e-3, doorWidth - cupDiameter / 2 - 1e-3),
        localY,
        cupZ
      );
      markPart(hingeCup, { width: cupDiameter, height: cupDiameter, depth: cupDepth });
      setParamKeys(hingeCup, ["hingeComponentId", "hingeCountPerDoor", "hingeTopOffsetMm", "hingeBottomOffsetMm", "doorOpen"]);
      pivot.add(hingeCup);
      const hingeArm = new oe(new Se(armWidth, armHeight, armDepth), hardwareMaterial);
      hingeArm.name = `${namePrefix}_hinge_${index + 1}_arm`;
      hingeArm.userData.catalogComponentId = hingeCatalogId;
      hingeArm.userData.componentType = "hinge";
      hingeArm.position.set(
        clamp(sideOffset, -doorWidth + armWidth / 2 + 1e-3, doorWidth - armWidth / 2 - 1e-3),
        localY,
        armZ
      );
      markPart(hingeArm, { width: armWidth, height: armHeight, depth: armDepth });
      setParamKeys(hingeArm, ["hingeComponentId", "hingeCountPerDoor", "hingeTopOffsetMm", "hingeBottomOffsetMm", "doorOpen"]);
      pivot.add(hingeArm);
    }
  };
  const addDoor = (name, hingeSide, centerX, doorWidth) => {
    const pivot = new St();
    pivot.name = `${name}_pivot`;
    pivot.position.set(centerX + (hingeSide === "left" ? -doorWidth / 2 : doorWidth / 2), doorCenterY, doorZ);
    pivot.rotation.y = n.doorOpen === true ? hingeSide === "left" ? -Math.PI / 2 : Math.PI / 2 : 0;
    const door = new oe(new Se(doorWidth, doorHeight, l), frontMaterial);
    door.name = name;
    door.position.set(hingeSide === "left" ? doorWidth / 2 : -doorWidth / 2, 0, 0);
    markPart(door, { width: doorWidth, height: doorHeight, depth: l }, "height");
    setParamKeys(door, [
      "width",
      "heightCarcass",
      "frontThicknessMm",
      "sideGap",
      "topGap",
      "bottomGap",
      "frontGap",
      "doorDouble",
      "doorOpen"
    ]);
    pivot.add(door);
    addHandle(pivot, doorWidth, hingeSide, `${name}_handle`);
    addHinges(pivot, doorWidth, hingeSide, name);
    e.add(pivot);
  };
  const doorOpeningWidth = Math.max(0.08, t - 2 * d);
  if (n.doorDouble === true) {
    const leafWidth = Math.max(0.05, (doorOpeningWidth - m) / 2);
    addDoor("door_front_z", "left", -leafWidth / 2 - m / 2, leafWidth);
    addDoor("door_front_x", "right", leafWidth / 2 + m / 2, leafWidth);
  } else {
    addDoor("door_front", "left", 0, doorOpeningWidth);
  }
  if (c > 0) {
    const legRadius = 0.02;
    const legHeight = c;
    const drawerLegReveal = 4e-3;
    const plinthBackZ = o / 2 - plinthSetbackMm * Qt - r;
    const frontZ = Math.max(
      -o / 2 + legRadius,
      Math.min(o / 2 - legRadius - 0.01, plinthBackZ - legRadius + drawerLegReveal)
    );
    const rearZ = -o / 2 + legRadius + 0.04;
    const sideX = t / 2 - legRadius - 0.03;
    const legPositions = [
      { name: "leg_FL", x: -sideX, z: frontZ, front: true },
      { name: "leg_FR", x: sideX, z: frontZ, front: true },
      { name: "leg_BL", x: -sideX, z: rearZ, front: false },
      { name: "leg_BR", x: sideX, z: rearZ, front: false }
    ];
    if (widthMm > 600) {
      legPositions.push({ name: "leg_BC", x: 0, z: rearZ, front: false });
    }
    if (widthMm > 900) {
      legPositions.push({ name: "leg_FC", x: 0, z: frontZ, front: true });
    }
    const clipCatalogId = typeof n.clipComponentId === "string" && n.clipComponentId.trim().length > 0 ? n.clipComponentId.trim() : "cmp.clip.plinth.standard";
    const legCatalogId = typeof n.legComponentId === "string" && n.legComponentId.trim().length > 0 ? n.legComponentId.trim() : "cmp.leg.adjustable.100.black";
    const mergeClipGeometries = (parts) => {
      const geometries = parts.map((part) => {
        part.updateMatrix();
        const geometry = part.geometry.clone();
        geometry.applyMatrix4(part.matrix);
        return geometry.index ? geometry.toNonIndexed() : geometry;
      }).filter(Boolean);
      if (geometries.length === 0) return null;
      const merged = geometries[0].clone();
      const attributes = ["position", "normal", "uv"];
      attributes.forEach((attributeName) => {
        const entries = geometries.map((geometry) => geometry.getAttribute(attributeName)).filter(Boolean);
        if (entries.length === 0) {
          merged.deleteAttribute?.(attributeName);
          return;
        }
        const BufferArray = entries[0].array.constructor;
        const totalLength = entries.reduce((sum, entry) => sum + entry.array.length, 0);
        const mergedArray = new BufferArray(totalLength);
        let offset = 0;
        entries.forEach((entry) => {
          mergedArray.set(entry.array, offset);
          offset += entry.array.length;
        });
        merged.setAttribute(attributeName, new entries[0].constructor(mergedArray, entries[0].itemSize, entries[0].normalized));
      });
      merged.setIndex(null);
      merged.computeBoundingBox?.();
      merged.computeBoundingSphere?.();
      merged.computeVertexNormals?.();
      return merged;
    };
    const clipOuterRadius = legRadius + 4e-3;
    const clipCollarHeight = 0.016;
    const clipArcGap = Math.PI * 0.35;
    const clipCollarGeometry = new wt(
      clipOuterRadius,
      clipOuterRadius,
      clipCollarHeight,
      24,
      1,
      true,
      clipArcGap / 2,
      Math.PI * 2 - clipArcGap
    );
    const clipPadWidth = 0.03;
    const clipPadHeight = 0.012;
    const clipPadDepth = 0.012;
    const clipPadGeometry = new Se(clipPadWidth, clipPadHeight, clipPadDepth);
    const clipArmHeight = 0.01;
    const clipArmWidth = 0.016;
    const clipHeight = Math.max(
      clipCollarHeight / 2,
      Math.min(legHeight - clipCollarHeight / 2 - 4e-3, Math.max(0.04, legHeight * 0.35))
    );
    const clipArmStart = legRadius + 3e-3;
    const clipFaceGap = 3e-3;
    const createFrontClip = (name, legX, legZ) => {
      const padOffset = Math.max(5e-3, plinthBackZ - legZ - clipPadDepth / 2 - clipFaceGap);
      const armDepth = Math.max(5e-3, padOffset - clipPadDepth / 2 - clipArmStart - 2e-3);
      const collar = new oe(clipCollarGeometry, clipMaterial);
      collar.rotation.y = Math.PI;
      const pad = new oe(clipPadGeometry, clipMaterial);
      pad.position.set(0, 0, padOffset);
      const arm = new oe(new Se(clipArmWidth, clipArmHeight, armDepth), clipMaterial);
      arm.position.set(0, -clipPadHeight / 2 + clipArmHeight / 2, clipArmStart + 1e-3 + armDepth / 2);
      const mergedClip = mergeClipGeometries([collar, pad, arm]);
      if (!mergedClip) return;
      const clip = new oe(mergedClip, clipMaterial);
      clip.name = `${name}_clip`;
      clip.userData.catalogComponentId = clipCatalogId;
      clip.userData.componentType = "plinth_clip";
      clip.position.set(legX, clipHeight, legZ);
      markPart(clip, { width: clipPadWidth, height: clipPadHeight, depth: Math.max(clipPadDepth, armDepth + clipArmStart) });
      setParamKeys(clip, ["width", "plinthHeight", "plinthSetbackMm", "depth", "boardThickness", "clipComponentId", "legComponentId"]);
      e.add(clip);
    };
    for (const legPosition of legPositions) {
      const leg = new oe(new wt(legRadius, legRadius, legHeight, 18), legMaterial);
      leg.name = legPosition.name;
      leg.userData.catalogComponentId = legCatalogId;
      leg.userData.componentType = "leg";
      leg.position.set(legPosition.x, legHeight / 2, legPosition.z);
      markPart(leg, { width: legRadius * 2, height: legHeight, depth: legRadius * 2 });
      setParamKeys(leg, ["width", "plinthHeight", "plinthSetbackMm", "depth", "legComponentId"]);
      e.add(leg);
      if (legPosition.front) {
        createFrontClip(legPosition.name, legPosition.x, legPosition.z);
      }
    }
  }
  return e;
}
