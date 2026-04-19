import fs from 'fs';

let code = fs.readFileSync('src/app.ts', 'utf8');

// 1. replace offsetLabel etc. with offsetItems
code = code.replace(
  /offsetLabel:\s*document\.createElement\("div"\),[\s\S]*?offsetTickB:\s*document\.createElement\("div"\),/m,
  `offsetItems: Array.from({ length: 2 }).map(() => ({
      refWallId: null as string | null,
      label: document.createElement("div"),
      input: document.createElement("input"),
      line: document.createElement("div"),
      tickA: document.createElement("div"),
      tickB: document.createElement("div")
    })),`
);

// 2. remove offsetRefWallId
code = code.replace(/offsetRefWallId:\s*null\s*as\s*string\s*\|\s*null,/m, '');

// 3. Update DOM appending logic (around 1991)
code = code.replace(
  /const oLabel = wallEditHud\.offsetLabel;[\s\S]*?root\.appendChild\(oInput\);\n  }/m,
  `for (const off of wallEditHud.offsetItems) {
      const lineBase = (el, color = "rgba(92, 140, 255, 0.95)") => {
        el.style.position = "absolute";
        el.style.height = "1px";
        el.style.background = color;
        el.style.transformOrigin = "0 0";
        el.style.display = "none";
        el.style.pointerEvents = "none";
      };
      lineBase(off.line);
      lineBase(off.tickA);
      lineBase(off.tickB);
      root.appendChild(off.line);
      root.appendChild(off.tickA);
      root.appendChild(off.tickB);

      const oLabel = off.label;
      oLabel.style.position = "absolute";
      oLabel.style.transform = "translate(-50%, -50%)";
      oLabel.style.display = "none";
      oLabel.style.pointerEvents = "auto";
      oLabel.style.cursor = "pointer";
      oLabel.style.padding = "2px 6px";
      oLabel.style.borderRadius = "8px";
      oLabel.style.border = "1px solid rgba(36, 40, 54, 0.95)";
      oLabel.style.background = "rgba(18, 20, 26, 0.92)";
      oLabel.style.color = "rgba(230, 232, 238, 0.98)";
      oLabel.style.fontSize = "12px";
      oLabel.style.lineHeight = "18px";
      oLabel.style.userSelect = "none";
      oLabel.style.whiteSpace = "nowrap";
      root.appendChild(oLabel);

      const oInput = off.input;
      oInput.type = "text";
      oInput.inputMode = "numeric";
      oInput.placeholder = "mm";
      oInput.style.position = "absolute";
      oInput.style.display = "none";
      oInput.style.pointerEvents = "auto";
      oInput.style.zIndex = "12";
      oInput.style.width = "88px";
      oInput.style.height = "22px";
      oInput.style.borderRadius = "7px";
      oInput.style.border = "1px solid rgba(36, 40, 54, 0.95)";
      oInput.style.background = "#0f1117";
      oInput.style.color = "var(--text)";
      oInput.style.padding = "0 6px";
      oInput.style.fontSize = "12px";
      oInput.style.outline = "none";
      root.appendChild(oInput);
    }
  }`
);

code = code.replace(
  /lineBase\(wallEditHud\.offsetLine[\s\S]*?root\.appendChild\(wallEditHud\.offsetTickB\);/m,
  ''
);

// 4. Update hide logic in updateWallEditHud
code = code.replace(
  /wallEditHud\.offsetRefWallId = null;\s*wallEditHud\.offsetLine\.style\.display = "none";\s*wallEditHud\.offsetTickA\.style\.display = "none";\s*wallEditHud\.offsetTickB\.style\.display = "none";\s*wallEditHud\.offsetLabel\.style\.display = "none";/m,
  `for (const off of wallEditHud.offsetItems) {
      off.refWallId = null;
      off.line.style.display = "none";
      off.tickA.style.display = "none";
      off.tickB.style.display = "none";
      off.label.style.display = "none";
    }`
);

// 5. Update best logic
code = code.replace(
  /let best: { w: WallInstance; dist: number; signed: number; overlapMin: number; overlapMax: number } \| null = null;[\s\S]*?if \(!best \|\| dist < best\.dist\) best = { w: other, dist, signed, overlapMin, overlapMax };\n      }\n\n      if \(best\) {[\s\S]*?wallEditHud\.offsetLabel\.style\.display = "none";\n        }\n      }/m,
  `let bestPos: { w: WallInstance; dist: number; signed: number; overlapMin: number; overlapMax: number } | null = null;
      let bestNeg: { w: WallInstance; dist: number; signed: number; overlapMin: number; overlapMax: number } | null = null;
      for (const other of walls) {
        if (other.id === w.id) continue;
        const oa = fromMmPoint(other.params.aMm);
        const ob = fromMmPoint(other.params.bMm);
        const od = ob.clone().sub(oa);
        if (od.lengthSq() < 1e-8) continue;
        od.normalize();
        const parallel = Math.abs(od.dot(selDir)) > 0.985;
        if (!parallel) continue;

        const toA = oa.dot(selDir);
        const toB = ob.dot(selDir);
        const minO = Math.min(toA, toB);
        const maxO = Math.max(toA, toB);
        const overlapMin = Math.max(minSel, minO);
        const overlapMax = Math.min(maxSel, maxO);
        if (overlapMax - overlapMin < 0.08) continue;

        const oMid = oa.clone().add(ob).multiplyScalar(0.5);
        const signed = oMid.clone().sub(mid).dot(selN);
        const dist = Math.abs(signed);
        if (signed > 0 && (!bestPos || dist < bestPos.dist)) bestPos = { w: other, dist, signed, overlapMin, overlapMax };
        if (signed < 0 && (!bestNeg || dist < bestNeg.dist)) bestNeg = { w: other, dist, signed, overlapMin, overlapMax };
      }

      const bests = [bestPos, bestNeg].filter((x) => x !== null) as NonNullable<typeof bestPos>[];
      for (let i = 0; i < bests.length && i < wallEditHud.offsetItems.length; i++) {
        const best = bests[i];
        const off = wallEditHud.offsetItems[i];
        const ref = best.w;
        off.refWallId = ref.id;

        const sign = best.signed >= 0 ? 1 : -1;
        const refA = fromMmPoint(ref.params.aMm);
        const refB = fromMmPoint(ref.params.bMm);
        const tRefA = refA.dot(selDir);
        const tRefB = refB.dot(selDir);
        const overlapT = (best.overlapMin + best.overlapMax) / 2;

        const selDen = tB - tA;
        const refDen = tRefB - tRefA;
        const uSel = Math.abs(selDen) < 1e-8 ? 0.5 : clamp((overlapT - tA) / selDen, 0, 1);
        const uRef = Math.abs(refDen) < 1e-8 ? 0.5 : clamp((overlapT - tRefA) / refDen, 0, 1);

        const pSel = a.clone().lerp(b, uSel);
        const pRef = refA.clone().lerp(refB, uRef);

        const tSel = w.params.thicknessMm / 1000;
        const tRef = ref.params.thicknessMm / 1000;
        const faceOffsetM = (tSel + tRef) / 2;
        const faceDistM = Math.max(0, best.dist - faceOffsetM);
        const faceDistMm = Math.round(faceDistM * 1000);

        const p0 = pSel.clone().addScaledVector(selN, (tSel / 2) * sign);
        const p1 = pRef.clone().addScaledVector(selN, (-tRef / 2) * sign);

        const s0 = worldToScreen(p0, cam(), rect);
        const s1 = worldToScreen(p1, cam(), rect);
        setLine(off.line, s0, s1);

        const ddx = s1.x - s0.x;
        const ddy = s1.y - s0.y;
        const dlen = Math.max(0.001, Math.hypot(ddx, ddy));
        const ux = ddx / dlen;
        const uy = ddy / dlen;
        const vx = -uy;
        const vy = ux;
        const tick = 6;
        setLine(
          off.tickA,
          { x: s0.x - vx * tick, y: s0.y - vy * tick },
          { x: s0.x + vx * tick, y: s0.y + vy * tick }
        );
        setLine(
          off.tickB,
          { x: s1.x - vx * tick, y: s1.y - vy * tick },
          { x: s1.x + vx * tick, y: s1.y + vy * tick }
        );

        off.label.textContent = \`\${faceDistMm} mm\`;
        off.label.style.left = \`\${(s0.x + s1.x) / 2 + vx * 16}px\`;
        off.label.style.top = \`\${(s0.y + s1.y) / 2 + vy * 16}px\`;
        if (off.input.style.display !== "block") {
          off.label.style.display = "block";
        } else {
          off.label.style.display = "none";
        }
      }`
);

// 6. fix other occurrences like hiding offsets
code = code.replace(
  /wallEditHud\.offsetLabel\.style\.display = "none";\s*wallEditHud\.offsetInput\.style\.display = "none";/g,
  `for (const off of wallEditHud.offsetItems) {
      off.label.style.display = "none";
      off.input.style.display = "none";
    }`
);

// 7. fix event listeners
code = code.replace(
  /wallEditHud\.offsetLabel\.addEventListener[\s\S]*?wallEditHud\.offsetInput\.addEventListener\("blur", \(\) => {\n    wallEditHud\.offsetInput\.style\.display = "none";\n  }\);/m,
  `for (const off of wallEditHud.offsetItems) {
    off.label.addEventListener("pointerdown", (ev) => {
      if (selectedKind !== "wall" || !selectedWallId) return;
      if (mode !== "layout" || viewMode !== "2d") return;
      if (layoutTool === "wall" && wallDraw.active) return;
      ev.preventDefault();
      ev.stopPropagation();

      off.input.value = String(off.label.textContent?.replace(/[^0-9\\-]/g, "") ?? "");
      off.input.style.left = off.label.style.left;
      off.input.style.top = off.label.style.top;
      off.input.style.transform = "translate(-50%, -50%)";
      off.input.style.display = "block";
      off.input.focus();
      off.input.select();
    });

    off.input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        commitWallOffsetMm(off.input.value, off.refWallId);
        off.input.blur();
        ev.preventDefault();
      } else if (ev.key === "Escape") {
        off.input.style.display = "none";
        off.input.blur();
        ev.preventDefault();
      }
    });
    off.input.addEventListener("blur", () => {
      off.input.style.display = "none";
    });
  }`
);

// 8. fix commitWallOffsetMm
code = code.replace(
  /const commitWallOffsetMm = \(raw: string\) => {/m,
  `const commitWallOffsetMm = (raw: string, refId: string | null) => {`
);
code = code.replace(
  /const refId = wallEditHud\.offsetRefWallId;/m,
  `` // we pass it now
);

fs.writeFileSync('src/app.ts', code);
