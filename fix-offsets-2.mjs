import fs from 'fs';

let code = fs.readFileSync('src/app.ts', 'utf8');

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

fs.writeFileSync('src/app.ts', code);
