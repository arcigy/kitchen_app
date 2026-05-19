import * as THREE from "three";
import type { LayoutInstance, SectionInstance, WallInstance, WallParams } from "./localTypes";
import type { KitchenContext } from "../layout/kitchenContext";

type KeyboardInputHandlersContext = Record<string, any> & {
  walls: WallInstance[];
  instances: LayoutInstance[];
  sections: SectionInstance[];
  S: { kitchenEditMode: boolean; kitchenCtx: KitchenContext; kitchenGroups: Array<{ id: string; ctx: KitchenContext }> };
};

export function installKeyboardInputHandlers(ctx: KeyboardInputHandlersContext) {
  window.addEventListener("keydown", (ev) => {
    if (ev.defaultPrevented) return;
    if (ctx.isTypingTarget(ev.target) && ev.key !== "Escape") return;
    if (ev.key === "Escape" && ctx.isDoorPlacementActive?.()) {
      ctx.cancelDoorPlacement?.();
      ev.preventDefault();
      ev.stopPropagation();
      ev.stopImmediatePropagation();
      return;
    }
    if (ev.key === "Escape" && ctx.isWindowPlacementActive?.()) {
      ctx.cancelWindowPlacement?.();
      ev.preventDefault();
      ev.stopPropagation();
      ev.stopImmediatePropagation();
      return;
    }
    if ((ev.key === " " || ev.code === "Space") && ev.shiftKey && ctx.isDoorPlacementActive?.() && ctx.flipDoorPlacementSwingSide?.()) {
      ev.preventDefault();
      ev.stopPropagation();
      ev.stopImmediatePropagation();
      return;
    }
    if ((ev.key === " " || ev.code === "Space") && ctx.isDoorPlacementActive?.() && ctx.rotateDoorPlacement?.()) {
      ev.preventDefault();
      ev.stopPropagation();
      ev.stopImmediatePropagation();
      return;
    }
    if (ctx.S.kitchenEditMode && ctx.kitchenWorktopDraw.active && ctx.mode === "layout" && ctx.viewMode === "2d") {
      if (ev.key === " " || ev.code === "Space") {
        ctx.mirrorKitchenWorktopDraw();
        ev.preventDefault();
        return;
      }
      const isDigit = ev.key.length === 1 && ev.key >= "0" && ev.key <= "9";
      if (isDigit) {
        ctx.kitchenWorktopDraw.typedMm = `${ctx.kitchenWorktopDraw.typedMm}${ev.key}`.slice(0, 8);
        ctx.wallTypedHud.textContent = `${ctx.kitchenWorktopDraw.typedMm} mm`;
        ctx.wallTypedHud.style.left = `${ctx.kitchenWorktopDraw.lastPointerPx.x}px`;
        ctx.wallTypedHud.style.top = `${ctx.kitchenWorktopDraw.lastPointerPx.y}px`;
        ctx.wallTypedHud.style.display = "block";
        ctx.setUnderlayStatus(`Worktop: ${ctx.kitchenWorktopDraw.typedMm} mm (Enter = add point, Backspace = edit, Esc = confirm)`);
        ev.preventDefault();
        return;
      }
      if (ev.key === "Backspace") {
        ctx.kitchenWorktopDraw.typedMm = ctx.kitchenWorktopDraw.typedMm.slice(0, Math.max(0, ctx.kitchenWorktopDraw.typedMm.length - 1));
        if (ctx.kitchenWorktopDraw.typedMm.trim().length > 0) {
          ctx.wallTypedHud.textContent = `${ctx.kitchenWorktopDraw.typedMm} mm`;
          ctx.wallTypedHud.style.left = `${ctx.kitchenWorktopDraw.lastPointerPx.x}px`;
          ctx.wallTypedHud.style.top = `${ctx.kitchenWorktopDraw.lastPointerPx.y}px`;
          ctx.wallTypedHud.style.display = "block";
          ctx.setUnderlayStatus(`Worktop: ${ctx.kitchenWorktopDraw.typedMm} mm (Enter = add point, Backspace = edit, Esc = confirm)`);
        } else {
          ctx.wallTypedHud.style.display = "none";
          ctx.setUnderlayStatus("Worktop: click points or type mm + Enter. Esc = confirm.");
        }
        ev.preventDefault();
        return;
      }
      if (ev.key === "Enter" && ctx.kitchenWorktopDraw.typedMm.trim().length > 0) {
        if (ctx.commitKitchenWorktopTypedLength()) {
          ev.preventDefault();
          return;
        }
      }
    }
    if (ctx.mode === "layout" && ctx.layoutTool === "section" && ctx.viewMode === "2d" && ctx.activeViewerTab === "floorplan") {
      if (ev.key === " " || ev.code === "Space") {
        ctx.sectionDraw.mirrored = !ctx.sectionDraw.mirrored;
        ctx.updateSectionDrawPreview();
        ctx.setUnderlayStatus(`Section: smer ${ctx.sectionDraw.mirrored ? "mirrored" : "default"}.`);
        ev.preventDefault();
        return;
      }
    }
    if (ctx.S.kitchenEditMode) return;
    if (ctx.floorEdit.active) {
      if (ev.key === "Escape") {
        if (ctx.floorEdit.first) {
          ctx.floorEdit.first = null;
          ctx.floorEdit.hover = null;
          ctx.renderFloorBoundaryEdit();
        } else {
          ctx.discardFloorBoundaryEdit();
        }
        ev.preventDefault();
      }
      return;
    }

    if (ctx.mode === "layout") {
      if ((ev.ctrlKey || ev.metaKey) && !ev.altKey) {
        const k = ev.key;
        if (k === "z" || k === "Z") {
          if (ev.shiftKey) ctx.redo(ctx.S, ctx.helpers);
          else ctx.undo(ctx.S, ctx.helpers);
          ev.preventDefault();
          return;
        }
        if (k === "y" || k === "Y") {
          ctx.redo(ctx.S, ctx.helpers);
          ev.preventDefault();
          return;
        }
      }

      if (ctx.placement.active && ev.key === "Escape") {
        ctx.cancelPlacement(ctx.S, ctx.placementHelpers);
        ev.preventDefault();
        return;
      }

      if (ctx.transformState.kind) {
        if (ev.key === "Escape") {
          ctx.clearTransform({ restore: true, status: "Canceled." });
          ev.preventDefault();
          return;
        }

        if (ctx.transformState.kind === "rotate" && ctx.transformState.step === "rotating") {
          const isDigit = ev.key.length === 1 && ev.key >= "0" && ev.key <= "9";
          if (isDigit) {
            ctx.transformState.typed = `${ctx.transformState.typed}${ev.key}`.slice(0, 6);
            ctx.setUnderlayStatus(`Rotate: ${ctx.transformState.typed} deg (Enter)`);
            ev.preventDefault();
            return;
          }
          if (ev.key === "Backspace") {
            ctx.transformState.typed = ctx.transformState.typed.slice(0, -1);
            ctx.setUnderlayStatus(ctx.transformState.typed.length ? `Rotate: ${ctx.transformState.typed} deg (Enter)` : "Rotate: move mouse for direction, or type degrees + Enter.");
            ev.preventDefault();
            return;
          }
          if (ev.key === "Enter" && ctx.transformState.typed.trim().length > 0) {
            const n = Number(ctx.transformState.typed.trim().replace(",", "."));
            if (Number.isFinite(n) && n !== 0) {
              const sign = ctx.transformState.lastAngleSign || 1;
              const ang = (Math.abs(n) * Math.PI) / 180 * sign;
              ctx.applyRotateAngle(ang);
              ctx.setUnderlayStatus(`Rotate: ${sign < 0 ? "CW" : "CCW"} ${Math.abs(Math.round(n))} deg (click to finish)`);
            }
            ctx.transformState.typed = "";
            ev.preventDefault();
            return;
          }
        }
      }

      const nudgeStepM = () => {
        if (ctx.viewMode !== "2d") return 0;
        const c = ctx.cam();
        if (!(c instanceof THREE.OrthographicCamera)) return 0;
        const visibleW = Math.abs(c.right - c.left) / Math.max(1e-6, c.zoom);
        const visibleH = Math.abs(c.top - c.bottom) / Math.max(1e-6, c.zoom);
        const visible = Math.min(visibleW, visibleH);
        if (visible >= 20) return 1;
        if (visible >= 12) return 0.5;
        if (visible >= 7) return 0.25;
        if (visible >= 4) return 0.1;
        if (visible >= 2) return 0.05;
        return 0.01;
      };

      const nudgeSelection = (dxM: number, dzM: number) => {
        if (ctx.viewMode !== "2d" || ctx.layoutTool !== "select") return false;
        if (ctx.measureState.enabled) return false;
        if (ctx.dragState.active || ctx.windowDragState.active || ctx.doorDragState?.active || ctx.wallEditHud.drag || ctx.marquee.active) return false;
        if (ctx.underlayCal.active) return false;

        const dxMm = Math.round(dxM * 1000);
        const dzMm = Math.round(dzM * 1000);

        let moved = false;
        const prevWalls = new Map<string, WallParams>();
        for (const w of ctx.walls) prevWalls.set(w.id, JSON.parse(JSON.stringify(w.params)) as WallParams);
        const prevInstancePos = new Map<string, THREE.Vector3>();
        for (const inst of ctx.instances) prevInstancePos.set(inst.id, inst.root.position.clone());

        // Walls (single or multi)
        const wallIds = ctx.selectedWallIds.size > 0 ? Array.from(ctx.selectedWallIds) : ctx.selectedKind === "wall" && ctx.selectedWallId ? [ctx.selectedWallId] : [];
        if (wallIds.length > 0) {
          const touched = new Set<string>();
          const movedEnds = new Set<string>();
          const moveEnd = (w: WallInstance, which: "a" | "b") => {
            const k = `${w.id}:${which}`;
            if (movedEnds.has(k)) return;
            if (ctx.pinnedWallIds.has(w.id)) return;
            if (which === "a") w.params.aMm = { x: w.params.aMm.x + dxMm, z: w.params.aMm.z + dzMm };
            else w.params.bMm = { x: w.params.bMm.x + dxMm, z: w.params.bMm.z + dzMm };
            movedEnds.add(k);
            touched.add(w.id);
          };

          for (const id of wallIds) {
            const w = ctx.walls.find((x) => x.id === id) ?? null;
            if (!w) continue;
            if (ctx.pinnedWallIds.has(w.id)) continue;

            const oldA = { x: w.params.aMm.x, z: w.params.aMm.z };
            const oldB = { x: w.params.bMm.x, z: w.params.bMm.z };

            // Move selected wall (translate both endpoints)
            moveEnd(w, "a");
            moveEnd(w, "b");

            // Propagate corner moves: any wall endpoint connected to oldA/oldB follows.
            for (const other of ctx.walls) {
              if (other.id === w.id) continue;
              if (ctx.pinnedWallIds.has(other.id)) continue;
              const wa = ctx.wallEndpointWhich(other, oldA, ctx.wallJoinTolMm);
              if (wa) moveEnd(other, wa);
              const wb = ctx.wallEndpointWhich(other, oldB, ctx.wallJoinTolMm);
              if (wb) moveEnd(other, wb);
            }
          }

          for (const id of touched) {
            const w = ctx.walls.find((x) => x.id === id) ?? null;
            if (w) ctx.rebuildWall(w);
          }
          if (touched.size > 0) {
            ctx.rebuildWallPlanMesh();
            moved = true;
          }
        }

        // Modules (single or multi)
        const instIds =
          ctx.selectedInstanceIds.size > 0
            ? Array.from(ctx.selectedInstanceIds)
            : ctx.selectedKind === "module" && ctx.selectedInstanceId
              ? [ctx.selectedInstanceId]
              : [];
        if (instIds.length > 0) {
          for (const id of instIds) {
            const inst = ctx.findInstance(id);
            if (!inst) continue;
            const prev = inst.root.position.clone();
            const prevRotationY = inst.root.rotation.y;
            const prevKitchenPlacement = inst.kitchenPlacement ? structuredClone(inst.kitchenPlacement) : null;
            const desired = new THREE.Vector3(
              inst.root.position.x + dxMm / 1000,
              inst.root.position.y,
              inst.root.position.z + dzMm / 1000
            );
            const desiredInRoom = ctx.applyWallConstraints(inst, desired);
            let desiredPlaced = desiredInRoom.clone();
            if (instIds.length === 1 && inst.kitchenGroupId) {
              const kitchenConstraint = ctx.getKitchenPlacementConstraint(inst, desiredInRoom);
              if (kitchenConstraint) {
                desiredPlaced.copy(kitchenConstraint.position);
                inst.root.rotation.y = kitchenConstraint.rotationY;
                inst.kitchenPlacement = kitchenConstraint.kitchenPlacement ?? prevKitchenPlacement;
              }
            }
            const snapped =
              instIds.length === 1
                ? ctx.snapPositionDetailed(inst, desiredPlaced, {
                    stickyNeighborId: null,
                    snapDistanceM: inst.kitchenGroupId ? 0.12 : undefined
                  }).position
                : desiredPlaced;
            inst.root.position.copy(snapped);
            if (ctx.anyOverlap(inst, null) || ctx.moduleOverlapsWalls(inst) || ctx.moduleOverlapsKitchenWorktops(inst)) {
              inst.root.position.copy(prev);
              inst.root.rotation.y = prevRotationY;
              inst.kitchenPlacement = prevKitchenPlacement;
            } else {
              ctx.autoOrientModuleToRoomWallIfSnapped(inst);
              if (instIds.length === 1) {
                const actualDelta = inst.root.position.clone().sub(prev);
                ctx.nudgePinnedModuleChain(inst, actualDelta);
              }
              moved = true;
            }
          }
          if (moved) {
            for (const movedInst of ctx.instances) {
              if (!movedInst.kitchenGroupId) continue;
              const group = ctx.S.kitchenGroups.find((item) => item.id === movedInst.kitchenGroupId) ?? null;
              const backOffsetMm = group?.ctx.worktopBackOffsetMm ?? ctx.S.kitchenCtx.worktopBackOffsetMm;
              movedInst.kitchenPlacement = ctx.inferKitchenPlacementBinding(movedInst, movedInst.kitchenGroupId, backOffsetMm);
            }
            ctx.updateLayoutPanel();
          }
        }

        const sectionIds = ctx.selectedKind === "section" && ctx.selectedSectionId ? [ctx.selectedSectionId] : [];
        if (sectionIds.length > 0) {
          for (const id of sectionIds) {
            const section = ctx.sections.find((item) => item.id === id) ?? null;
            if (!section) continue;
            section.params.aMm = { x: section.params.aMm.x + dxMm, z: section.params.aMm.z + dzMm };
            section.params.bMm = { x: section.params.bMm.x + dxMm, z: section.params.bMm.z + dzMm };
            ctx.updateSectionVisual(section);
            moved = true;
          }
        }

        const modulesInvalid = ctx.instances.some(
          (i) =>
            !ctx.instanceFitsRoom(i) ||
            ctx.anyOverlap(i, null) ||
            ctx.moduleOverlapsWalls(i) ||
            ctx.moduleOverlapsKitchenWorktops(i)
        );

        // Never allow illegal module states (also blocks walls moving into existing modules).
        if (modulesInvalid) {
          for (const w of ctx.walls) {
            const p = prevWalls.get(w.id);
            if (p) w.params = JSON.parse(JSON.stringify(p)) as WallParams;
            ctx.rebuildWall(w);
          }
          for (const inst of ctx.instances) {
            const prev = prevInstancePos.get(inst.id);
            if (!prev) continue;
            inst.root.position.copy(prev);
          }
          ctx.rebuildWallPlanMesh();
          // best-effort: if a module nudge happened, it already reverted per-module on overlap;
          // so restoring walls is enough to eliminate illegal states.
          ctx.updateLayoutPanel();
          ctx.mountProps();
          return false;
        }

        if (moved) {
          ctx.mountProps();
          ctx.commitHistory(ctx.S);
        }
        return moved;
      };

      if (ev.key.startsWith("Arrow")) {
        const step = nudgeStepM();
        if (step > 0) {
          let dx = 0;
          let dz = 0;
          if (ev.key === "ArrowLeft") dx = -step;
          if (ev.key === "ArrowRight") dx = step;
          if (ev.key === "ArrowUp") dz = -step;
          if (ev.key === "ArrowDown") dz = step;
          if (dx !== 0 || dz !== 0) {
            const moved = nudgeSelection(dx, dz);
            if (moved) {
              ev.preventDefault();
              return;
            }
          }
        }
      }

      if ((ev.key === "m" || ev.key === "M") && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
        if (ctx.startTransformFromSelection("move")) {
          ev.preventDefault();
          return;
        }
      }

      if ((ev.key === "r" || ev.key === "R") && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
        if (ctx.startTransformFromSelection("rotate")) {
          ev.preventDefault();
          return;
        }
      }

      if ((ev.key === "w" || ev.key === "W") && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
        ctx.setToolWall();
        ev.preventDefault();
        return;
      }
      if ((ev.key === "a" || ev.key === "A") && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
        ctx.setToolAlign();
        ev.preventDefault();
        return;
      }
      if ((ev.key === "t" || ev.key === "T") && !ev.ctrlKey && !ev.metaKey && !ev.altKey) {
        ctx.setToolTrim();
        ev.preventDefault();
        return;
      }
      if (ev.key === " " || ev.code === "Space") {
        // Mirror wall side (Revit-like): works while drawing + when wall is selected.
        if (ctx.layoutTool === "wall") {
          ctx.wallDefault.exteriorSign = ctx.wallDefault.exteriorSign === 1 ? -1 : 1;
          ctx.setUnderlayStatus(`Wall: exterior ${ctx.wallDefault.exteriorSign === 1 ? "left" : "right"} of A->B.`);
          if (ctx.wallDraw.preview && ctx.wallDraw.a) {
            ctx.updateWallMeshWithJustification(
              ctx.wallDraw.preview,
              ctx.wallDraw.a,
              ctx.wallDraw.hoverB ?? ctx.wallDraw.a,
              ctx.wallDefault.thicknessMm,
              ctx.wallDefault.justification,
              ctx.wallDefault.exteriorSign
            );
          }
          ctx.mountProps();
          ev.preventDefault();
          return;
        }

        if (ctx.selectedKind === "wall" && ctx.selectedWallId) {
          const w = ctx.walls.find((x) => x.id === ctx.selectedWallId) ?? null;
          if (w) {
            w.params.exteriorSign = (w.params.exteriorSign ?? 1) === 1 ? -1 : 1;
            for (const ww of ctx.walls) ctx.rebuildWall(ww);
            ctx.rebuildWallPlanMesh();
            ctx.mountProps();
          }
          ev.preventDefault();
          return;
        }

        ctx.setToolSelect();
        ev.preventDefault();
        return;
      }

      if (ev.key === "Escape" && ctx.handleLayoutEscape(ev)) return;

      // Typed length while placing wall segment (Revit-style).
      if (ctx.layoutTool === "wall" && ctx.wallDraw.active && ctx.wallDraw.a && ctx.viewMode === "2d") {
        const isDigit = ev.key.length === 1 && ev.key >= "0" && ev.key <= "9";
        if (isDigit) {
          ctx.wallDraw.typedMm = `${ctx.wallDraw.typedMm}${ev.key}`.slice(0, 8);
          ctx.wallTypedHud.textContent = `${ctx.wallDraw.typedMm} mm`;
          ctx.wallTypedHud.style.left = `${ctx.wallDraw.lastPointerPx.x}px`;
          ctx.wallTypedHud.style.top = `${ctx.wallDraw.lastPointerPx.y}px`;
          ctx.wallTypedHud.style.display = "block";
          ctx.setUnderlayStatus(`Wall: ${ctx.wallDraw.typedMm} mm (Enter = place, Backspace = edit)`);
          ev.preventDefault();
          return;
        }
        if (ev.key === "Backspace") {
          ctx.wallDraw.typedMm = ctx.wallDraw.typedMm.slice(0, Math.max(0, ctx.wallDraw.typedMm.length - 1));
          if (ctx.wallDraw.typedMm.trim().length > 0) {
            ctx.wallTypedHud.textContent = `${ctx.wallDraw.typedMm} mm`;
            ctx.wallTypedHud.style.left = `${ctx.wallDraw.lastPointerPx.x}px`;
            ctx.wallTypedHud.style.top = `${ctx.wallDraw.lastPointerPx.y}px`;
            ctx.wallTypedHud.style.display = "block";
            ctx.setUnderlayStatus(`Wall: ${ctx.wallDraw.typedMm} mm (Enter = place, Backspace = edit)`);
          } else {
            ctx.wallTypedHud.style.display = "none";
            ctx.setUnderlayStatus("Wall: second point... (type mm + Enter, Shift = no axis snap, Esc = stop)");
          }
          ev.preventDefault();
          return;
        }
        if (ev.key === "Enter" && ctx.wallDraw.typedMm.trim().length > 0) {
          const mm = Math.max(1, Math.round(Number(ctx.wallDraw.typedMm)));
          if (Number.isFinite(mm) && ctx.wallDraw.a) {
            const a = ctx.wallDraw.a.clone();
            const hb = ctx.wallDraw.hoverB ? ctx.wallDraw.hoverB.clone() : a.clone().add(new THREE.Vector3(1, 0, 0));
            const dir = hb.clone().sub(a);
            if (dir.lengthSq() < 1e-8) dir.set(1, 0, 0);
            dir.normalize();
            const end = a.clone().addScaledVector(dir, mm / 1000);

            const bMm = { x: Math.round(end.x * 1000), z: Math.round(end.z * 1000) };
            const bExact = new THREE.Vector3(bMm.x / 1000, 0, bMm.z / 1000);

            // close loop when near chain start
            const closeTolM = 0.03;
            const cs = ctx.wallDraw.chainStart;
            const closes =
              !!cs && ctx.wallDraw.segments >= 2 && Math.hypot(bExact.x - cs.x, bExact.z - cs.z) <= closeTolM;
            const finalEnd = closes && cs ? cs.clone() : bExact;

            const w = ctx.addWall(a, finalEnd, ctx.wallDefault.thicknessMm);
            if (!w) {
              ev.preventDefault();
              return;
            }
            ctx.autoJoinAtMmPoint(w.params.aMm);
            ctx.autoJoinAtMmPoint(w.params.bMm);
            ctx.wallDraw.segments += 1;

            ctx.wallDraw.typedMm = "";
            ctx.wallTypedHud.style.display = "none";

            if (closes) {
              ctx.clearWallDrawState();
              ctx.setUnderlayStatus("Wall: chain closed.");
              ev.preventDefault();
              return;
            }

            ctx.wallDraw.active = true;
            ctx.wallDraw.a = new THREE.Vector3(w.params.bMm.x / 1000, 0, w.params.bMm.z / 1000);
            ctx.wallDraw.hoverB = ctx.wallDraw.a.clone();
        ctx.updateWallMeshWithJustification(
          ctx.wallDraw.preview!,
          ctx.wallDraw.a,
          ctx.wallDraw.a,
          ctx.wallDefault.thicknessMm,
          ctx.wallDefault.justification,
          ctx.wallDefault.exteriorSign
        );
            ctx.setUnderlayStatus("Wall: next point... (type mm + Enter, Shift = no axis snap, Esc = stop)");
            ctx.selectedKind = "wall";
            ctx.selectedWallId = w.id;
            ctx.mountProps();
            ev.preventDefault();
            return;
          }
        }
      }

      if (ev.key === "Delete" || ev.key === "Backspace") {
        if (ctx.deleteSelected()) {
          ev.preventDefault();
          return;
        }
      }
    }

  });
}
