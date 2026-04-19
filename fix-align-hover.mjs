import fs from 'fs';

let code = fs.readFileSync('src/app.ts', 'utf8');

// Insert alignHighlights group
code = code.replace(
  /const selectionHighlights = new THREE\.Group\(\);\n  selectionHighlights\.name = "selectionHighlights";/m,
  `const alignHighlights = new THREE.Group();
  alignHighlights.name = "alignHighlights";
  alignHighlights.visible = false;
  layoutRoot.add(alignHighlights);
  
  const updateAlignHighlights = (hovered: AlignPickedLine | null) => {
    while (alignHighlights.children.length > 0) {
      const ch = alignHighlights.children.pop()!;
      alignHighlights.remove(ch);
      if ((ch as any).geometry) (ch as any).geometry.dispose();
      if ((ch as any).material) (ch as any).material.dispose();
    }
    
    if (layoutTool !== "align" || viewMode !== "2d") {
      alignHighlights.visible = false;
      return;
    }

    const createLine = (p: AlignPickedLine, color: number, opacity: number, y: number, dashed = false) => {
      const w = walls.find(x => x.id === p.wallId);
      if (!w) return;
      const dir = p.dir.clone().normalize();
      const p1 = p.p.clone().addScaledVector(dir, -10);
      const p2 = p.p.clone().addScaledVector(dir, 10);
      const pts = [new THREE.Vector3(p1.x, y, p1.z), new THREE.Vector3(p2.x, y, p2.z)];
      const geom = new THREE.BufferGeometry().setFromPoints(pts);
      const mat = dashed 
        ? new THREE.LineDashedMaterial({ color, transparent: true, opacity, depthWrite: false, dashSize: 0.1, gapSize: 0.1 })
        : new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false });
      const line = new THREE.Line(geom, mat);
      if (dashed) line.computeLineDistances();
      line.renderOrder = 70;
      alignHighlights.add(line);
    };

    if (alignState.ref) {
      createLine(alignState.ref, 0x3ddc97, 0.95, 0.04);
    }
    
    if (hovered) {
      createLine(hovered, 0x5c8cff, 0.8, 0.045);
    }

    if (alignState.ref && hovered && alignParallel(alignState.ref, hovered)) {
      const shift = alignShiftVec(alignState.ref, hovered);
      const movedHovered = {
        ...hovered,
        p: hovered.p.clone().add(shift)
      };
      createLine(movedHovered, 0xffd166, 0.8, 0.05, true);
    }
    
    alignHighlights.visible = alignHighlights.children.length > 0;
  };

  const selectionHighlights = new THREE.Group();
  selectionHighlights.name = "selectionHighlights";`
);

// Call updateAlignHighlights in pointermove
code = code.replace(
  /if \(mode === "layout" && layoutTool === "wall" && wallDraw\.active/m,
  `if (mode === "layout" && viewMode === "2d" && layoutTool === "align") {
      const rect = renderer.domElement.getBoundingClientRect();
      const x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      const y = -(((ev.clientY - rect.top) / rect.height) * 2 - 1);
      pointerNdc.set(x, y);
      raycaster.setFromCamera(pointerNdc, cam());
      const hitPoint = new THREE.Vector3();
      if (raycaster.ray.intersectPlane(groundPlane, hitPoint)) {
        const mouse = { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
        const picked = pickAlignLineAt(hitPoint, mouse, rect);
        updateAlignHighlights(picked);
      } else {
        updateAlignHighlights(null);
      }
    }

    if (mode === "layout" && layoutTool === "wall" && wallDraw.active`
);

// Also call it when alignment is clicked to clear hover / update ref
code = code.replace(
  /alignState\.ref = picked;\s*setUnderlayStatus/m,
  `alignState.ref = picked;
          updateAlignHighlights(null);
          setUnderlayStatus`
);

code = code.replace(
  /translateWallAndConnected\(w, dxMm, dzMm\);\n        }\n\n        alignState\.ref = null;\n        setUnderlayStatus/m,
  `translateWallAndConnected(w, dxMm, dzMm);
        }

        alignState.ref = null;
        updateAlignHighlights(null);
        setUnderlayStatus`
);

// Also clear it when tool changes to select or wall
code = code.replace(
  /alignState\.ref = null;\n    if \(viewMode !== "2d"\)/m,
  `alignState.ref = null;
    updateAlignHighlights(null);
    if (viewMode !== "2d")`
);

fs.writeFileSync('src/app.ts', code);
