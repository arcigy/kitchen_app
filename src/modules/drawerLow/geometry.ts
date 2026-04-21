import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Vector3
} from "three";
import type { DrawerLowParams } from "./types";
import { resolveDrawerFrontHeights } from "./frontHeights";

const MM_TO_M = 0.001;

type GrainDirection = "none" | "width" | "height" | "depth";

type DrawerLowMaterials = {
  bodyMaterialId?: number;
  frontMaterialId?: number;
  drawerMaterialId?: number;
  bodyColor?: string;
  frontColor?: string;
  drawerColor?: string;
  partOverrides?: Record<string, unknown>;
};

function getNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getMaterials(params: DrawerLowParams): DrawerLowMaterials {
  const value = params.materials;
  return value && typeof value === "object" && !Array.isArray(value) ? (value as DrawerLowMaterials) : {};
}

function parseColor(value: unknown, fallback: string) {
  return new Color(typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback);
}

function mixColors(a: Color, b: Color, amount: number) {
  return a.clone().lerp(b, clamp(amount, 0, 1));
}

function setMeshMetadata(
  mesh: Mesh,
  size: { width: number; height: number; depth: number },
  paramKeys: string[],
  grainAlong: GrainDirection = "none"
) {
  mesh.userData.selectable = true;
  mesh.userData.dimensionsMm = {
    width: size.width / MM_TO_M,
    height: size.height / MM_TO_M,
    depth: size.depth / MM_TO_M
  };
  mesh.userData.grainAlong = grainAlong;
  mesh.userData.paramKeys = [...paramKeys];
}

function setPrimitiveMetadata(
  mesh: Mesh,
  sizeMm: { width: number; height: number; depth: number },
  paramKeys: string[]
) {
  mesh.userData.selectable = true;
  mesh.userData.dimensionsMm = { ...sizeMm };
  mesh.userData.grainAlong = "none";
  mesh.userData.paramKeys = [...paramKeys];
}

function buildDrawerLowMaterials(params: DrawerLowParams) {
  const materials = getMaterials(params);
  const bodyColor = parseColor(materials.bodyColor, "#b88b5a");
  const frontColor = parseColor(materials.frontColor, "#005fb8");
  const drawerColor = parseColor(materials.drawerColor, "#d8dde6");

  const body = new MeshStandardMaterial({ color: bodyColor, roughness: 0.85, metalness: 0 });
  const front = new MeshStandardMaterial({ color: frontColor, roughness: 0.65, metalness: 0 });
  const drawer = new MeshStandardMaterial({ color: drawerColor, roughness: 0.8, metalness: 0 });
  const hardware = new MeshStandardMaterial({ color: 0x3a3f4b, roughness: 0.55, metalness: 0.25 });
  const handle = new MeshStandardMaterial({ color: 0x3a3f4b, roughness: 0.55, metalness: 0.1 });
  const screw = new MeshStandardMaterial({ color: 0x8a93a3, roughness: 0.35, metalness: 0.75 });
  const leg = new MeshStandardMaterial({ color: 0x2a2f3a, roughness: 0.6, metalness: 0.1 });
  const clip = new MeshStandardMaterial({ color: 0x606772, roughness: 0.7, metalness: 0.05 });
  const clipScrew = new MeshStandardMaterial({ color: 0x3a3f4b, roughness: 0.45, metalness: 0.35 });
  const kick = body.clone();
  kick.color = parseColor(materials.bodyColor, "#ffffff");
  const back = new MeshStandardMaterial({
    color: mixColors(new Color("#f4f4f4"), bodyColor, 0.14),
    roughness: 0.85,
    metalness: 0
  });

  const partOverrides = materials.partOverrides ?? {};
  const resolveOverride = (partName: string, fallback: MeshStandardMaterial) => {
    const override = partOverrides[partName];
    if (typeof override === "string" && /^#[0-9a-f]{6}$/i.test(override)) {
      return new MeshStandardMaterial({
        color: new Color(override),
        roughness: fallback.roughness,
        metalness: fallback.metalness
      });
    }
    if (typeof override === "number" && Number.isFinite(override)) {
      if (override === materials.frontMaterialId) return front;
      if (override === materials.drawerMaterialId) return drawer;
      if (override === materials.bodyMaterialId) return body;
    }
    return fallback;
  };

  return {
    body,
    front,
    drawer,
    hardware,
    handle,
    screw,
    leg,
    clip,
    clipScrew,
    kick,
    back,
    resolveOverride
  };
}

function addBoxPart(args: {
  group: Group;
  name: string;
  size: { width: number; height: number; depth: number };
  position: Vector3;
  material: MeshStandardMaterial;
  paramKeys: string[];
  grainAlong?: GrainDirection;
}) {
  const mesh = new Mesh(new BoxGeometry(args.size.width, args.size.height, args.size.depth), args.material);
  mesh.name = args.name;
  mesh.position.copy(args.position);
  setMeshMetadata(mesh, args.size, args.paramKeys, args.grainAlong ?? "none");
  args.group.add(mesh);
  return mesh;
}

export function buildDrawerLow(params: DrawerLowParams): Group {
  const group = new Group();
  group.name = "drawerLowModule";

  const width = getNumber(params.width, 800) * MM_TO_M;
  const height = getNumber(params.height, 720) * MM_TO_M;
  const depth = getNumber(params.depth, 560) * MM_TO_M;
  const boardThickness = getNumber(params.boardThickness, 18) * MM_TO_M;
  const backThickness = getNumber(params.backThickness, 6) * MM_TO_M;
  const backGrooveDepth = clamp(Math.max(0, getNumber(params.backGrooveDepthMm, 8)) * MM_TO_M, 0, boardThickness);
  const backGrooveWidth = clamp(
    Math.max(0, getNumber(params.backGrooveWidthMm, 8)) * MM_TO_M,
    backThickness,
    Math.max(backThickness, depth * 0.25)
  );
  const backGrooveClearance = clamp(
    Math.max(0, getNumber(params.backGrooveClearanceMm, 1)) * MM_TO_M,
    0,
    Math.max(0, boardThickness)
  );
  const plinthHeight = Math.max(0, getNumber(params.plinthHeight, 100)) * MM_TO_M;
  const plinthSetback = Math.max(0, getNumber(params.plinthSetbackMm, 60)) * MM_TO_M;
  const frontGap = Math.max(0, getNumber(params.frontGap, 2)) * MM_TO_M;
  const sideGap = Math.max(0, getNumber(params.sideGap, 2)) * MM_TO_M;
  const bottomGap = Math.max(0, getNumber(params.bottomGap, 2)) * MM_TO_M;
  const sideClearance = Math.max(0, getNumber(params.sideClearanceMm, 4)) * MM_TO_M;
  const drawerBackReserve = Math.max(0, getNumber(params.drawerBackReserveMm, 8)) * MM_TO_M;
  const drawerBoxThickness = Math.max(0, getNumber(params.drawerBoxThickness, 13)) * MM_TO_M;
  const frontThickness = Math.max(0, getNumber(params.frontThicknessMm, 19)) * MM_TO_M;
  const drawerFrontHeights = resolveDrawerFrontHeights(params).map((value) => value * MM_TO_M);
  const drawerCount = Math.max(1, Math.round(getNumber(params.drawerCount, drawerFrontHeights.length || 3)));
  const materials = buildDrawerLowMaterials(params);

  const carcassHeight = height - plinthHeight;
  const sideGeometry = new BoxGeometry(boardThickness, carcassHeight, depth);
  const leftSide = new Mesh(sideGeometry, materials.resolveOverride("leftSide", materials.body));
  leftSide.name = "leftSide";
  leftSide.position.set(-(width / 2 - boardThickness / 2), plinthHeight + carcassHeight / 2, 0);
  setMeshMetadata(leftSide, { width: boardThickness, height: carcassHeight, depth }, ["width", "height", "depth", "boardThickness", "plinthHeight"], "height");
  group.add(leftSide);

  const rightSide = new Mesh(sideGeometry.clone(), materials.resolveOverride("rightSide", materials.body));
  rightSide.name = "rightSide";
  rightSide.position.set(width / 2 - boardThickness / 2, plinthHeight + carcassHeight / 2, 0);
  setMeshMetadata(rightSide, { width: boardThickness, height: carcassHeight, depth }, ["width", "height", "depth", "boardThickness", "plinthHeight"], "height");
  group.add(rightSide);

  const innerWidth = width - 2 * boardThickness;
  const bottom = new Mesh(
    new BoxGeometry(innerWidth, boardThickness, depth),
    materials.resolveOverride("bottom", materials.body)
  );
  bottom.name = "bottom";
  bottom.position.set(0, plinthHeight + boardThickness / 2, 0);
  setMeshMetadata(bottom, { width: innerWidth, height: boardThickness, depth }, ["width", "depth", "boardThickness", "plinthHeight"], "width");
  group.add(bottom);

  const topRailDepth = Math.min(depth * 0.25, Math.max(0.06, boardThickness * 3));
  addBoxPart({
    group,
    name: "topRailFront",
    size: { width: innerWidth, height: boardThickness, depth: topRailDepth },
    position: new Vector3(0, height - boardThickness / 2, depth / 2 - topRailDepth / 2),
    material: materials.resolveOverride("topRailFront", materials.body),
    paramKeys: ["width", "depth", "height", "boardThickness"],
    grainAlong: "width"
  });
  addBoxPart({
    group,
    name: "topRailBack",
    size: { width: innerWidth, height: boardThickness, depth: topRailDepth },
    position: new Vector3(0, height - boardThickness / 2, -depth / 2 + topRailDepth / 2),
    material: materials.resolveOverride("topRailBack", materials.body),
    paramKeys: ["width", "depth", "height", "boardThickness"],
    grainAlong: "width"
  });

  const backWidth = Math.max(0.001, innerWidth + 2 * backGrooveDepth - backGrooveClearance);
  const innerBackHeight = Math.max(0.001, carcassHeight - 2 * boardThickness + 2 * backGrooveDepth - backGrooveClearance);
  const backPanelDepthOffset = -depth / 2 + Math.max(Math.max(backThickness, backGrooveWidth) / 2, boardThickness / 2);
  const back = new Mesh(
    new BoxGeometry(backWidth, innerBackHeight, backThickness),
    materials.back
  );
  back.name = "back";
  back.position.set(0, plinthHeight + boardThickness + Math.max(0.001, carcassHeight - 2 * boardThickness) / 2, backPanelDepthOffset);
  back.userData.allowOverlapWith = ["leftSide", "rightSide", "bottom", "topRailBack"];
  back.userData.allowOverlapReason = "back panel in groove";
  setMeshMetadata(
    back,
    { width: backWidth, height: innerBackHeight, depth: backThickness },
    [
      "width",
      "height",
      "depth",
      "boardThickness",
      "backThickness",
      "backGrooveDepthMm",
      "backGrooveWidthMm",
      "backGrooveOffsetMm",
      "backGrooveClearanceMm",
      "plinthHeight"
    ],
    "width"
  );
  group.add(back);

  const kickDepth = Math.min(boardThickness, depth * 0.2);
  const kickInset = Math.min(plinthSetback, depth / 2);
  const kickFrontCenterZ = depth / 2 - kickDepth / 2 - kickInset;
  const kickClipFrontZ = kickFrontCenterZ - kickDepth / 2;

  if (plinthHeight > 0) {
    const legRadius = 0.02;
    const legGeometry = new CylinderGeometry(legRadius, legRadius, plinthHeight, 18);
    const legOffsetX = 0.03;
    const backLegInset = 0.06;
    const frontLegZ = Math.min(depth / 2 - backLegInset, kickClipFrontZ - legRadius - 0.01);
    const backLegZ = -depth / 2 + backLegInset;

    const addLeg = (name: string, x: number, z: number) => {
      const leg = new Mesh(legGeometry, materials.leg);
      leg.name = name;
      leg.position.set(x, plinthHeight / 2, z);
      setPrimitiveMetadata(
        leg,
        { width: legRadius * 2 * 1000, height: plinthHeight / MM_TO_M, depth: legRadius * 2 * 1000 },
        ["plinthHeight", "plinthSetbackMm", "depth", "width"]
      );
      group.add(leg);
    };

    const leftLegX = -width / 2 + legOffsetX;
    const rightLegX = width / 2 - legOffsetX;
    addLeg("leg_FL", leftLegX, frontLegZ);
    addLeg("leg_FR", rightLegX, frontLegZ);
    addLeg("leg_BL", leftLegX, backLegZ);
    addLeg("leg_BR", rightLegX, backLegZ);

    const collarRadius = legRadius + 0.004;
    const collarLength = 0.016;
    const collarGap = Math.PI * 0.35;
    const collarGeometry = new CylinderGeometry(
      collarRadius,
      collarRadius,
      collarLength,
      24,
      1,
      true,
      collarGap / 2,
      Math.PI * 2 - collarGap
    );
    const padWidth = 0.03;
    const padHeight = 0.012;
    const padDepth = 0.012;
    const armHeight = 0.01;
    const armWidth = 0.016;
    const screwRadius = 0.0018;
    const collarY = Math.max(
      collarLength / 2,
      Math.min(plinthHeight - collarLength / 2 - 0.004, Math.max(0.04, plinthHeight * 0.35))
    );

    const addKickClip = (name: string, x: number) => {
      const clipGroup = new Group();
      clipGroup.name = `${name}_group`;
      clipGroup.position.set(x, collarY, frontLegZ);

      const collar = new Mesh(collarGeometry, materials.clip);
      collar.name = `${name}_collar`;
      collar.rotation.y = Math.PI;
      setMeshMetadata(
        collar,
        { width: collarRadius * 2, height: collarLength, depth: collarRadius * 2 },
        ["plinthHeight", "plinthSetbackMm", "depth", "width", "boardThickness"]
      );
      clipGroup.add(collar);

      const padOffsetZ = kickClipFrontZ - 0.001 - padDepth / 2 - frontLegZ;
      const pad = new Mesh(new BoxGeometry(padWidth, padHeight, padDepth), materials.clip);
      pad.name = `${name}_pad`;
      pad.position.set(0, 0, padOffsetZ);
      setMeshMetadata(pad, { width: padWidth, height: padHeight, depth: padDepth }, ["plinthHeight", "plinthSetbackMm", "depth", "boardThickness"]);
      clipGroup.add(pad);

      const armStartZ = legRadius + 0.003;
      const armDepth = Math.max(0.005, padOffsetZ - padDepth / 2 - armStartZ);
      const arm = new Mesh(new BoxGeometry(armWidth, armHeight, armDepth), materials.clip);
      arm.name = `${name}_arm`;
      arm.position.set(0, -padHeight / 2 + armHeight / 2, armStartZ + armDepth / 2);
      setMeshMetadata(arm, { width: armWidth, height: armHeight, depth: armDepth }, ["plinthHeight", "plinthSetbackMm", "depth"]);
      clipGroup.add(arm);

      const clipScrewLength = padDepth + Math.min(kickDepth * 0.85, 0.016);
      const clipScrewGeometry = new CylinderGeometry(screwRadius, screwRadius, clipScrewLength, 12);
      const clipScrewZ = padOffsetZ - padDepth / 2 + clipScrewLength / 2;
      for (const [index, y] of [-0.003, 0.003].entries()) {
        const clipScrew = new Mesh(clipScrewGeometry, materials.clipScrew);
        clipScrew.name = `${name}_screw_${index + 1}`;
        clipScrew.rotation.x = Math.PI / 2;
        clipScrew.position.set(0, y, clipScrewZ);
        setMeshMetadata(
          clipScrew,
          { width: screwRadius * 2, height: screwRadius * 2, depth: clipScrewLength },
          ["plinthHeight", "plinthSetbackMm", "depth", "boardThickness"]
        );
        clipGroup.add(clipScrew);
      }

      group.add(clipGroup);
    };

    addKickClip("kickClip_FL", leftLegX);
    addKickClip("kickClip_FR", rightLegX);
  }

  addBoxPart({
    group,
    name: "kick",
    size: { width, height: plinthHeight, depth: kickDepth },
    position: new Vector3(0, plinthHeight / 2, kickFrontCenterZ),
    material: materials.resolveOverride("kick", materials.kick),
    paramKeys: ["width", "plinthHeight", "plinthSetbackMm", "depth", "boardThickness"],
    grainAlong: "width"
  });

  const frontWidth = width - 2 * sideGap;
  const frontCenterZ = depth / 2 + frontThickness / 2;
  let frontCursor = plinthHeight + bottomGap;

  const handleLengthMm = Math.max(0, getNumber(params.handleLengthMm, 160)) * MM_TO_M;
  const handleSizeMm = Math.max(0, getNumber(params.handleSizeMm, 12)) * MM_TO_M;
  const handleProjectionMm = Math.max(0, getNumber(params.handleProjectionMm, 14)) * MM_TO_M;
  const handlePositionMm = Math.max(0, getNumber(params.handlePositionMm, 60)) * MM_TO_M;
  const handleType = typeof params.handleType === "string" ? params.handleType : "none";

  const addHandleScrews = (name: string, count: 1 | 2, spacing: number, y: number, projection: number) => {
    const totalDepth = Math.max(0.01, frontThickness + projection + 0.004);
    const headGeometry = new CylinderGeometry(0.004, 0.004, 0.0025, 16);
    const shaftGeometry = new CylinderGeometry(0.0016, 0.0016, totalDepth, 12);
    const headZ = frontCenterZ - frontThickness / 2 - 0.0025 / 2 - 0.0005;
    const shaftZ = frontCenterZ + totalDepth / 2 - 0.0005;
    const offsets = count === 2 ? [-spacing / 2, spacing / 2] : [0];
    for (const [index, offsetX] of offsets.entries()) {
      const head = new Mesh(headGeometry, materials.screw);
      head.name = `${name}_screw_${index + 1}_head`;
      head.rotation.x = Math.PI / 2;
      head.position.set(offsetX, y, headZ);
      setMeshMetadata(
        head,
        { width: 0.008, height: 0.008, depth: 0.0025 },
        ["handleType", "handlePositionMm", "frontThicknessMm", "handleLengthMm", "handleSizeMm", "handleProjectionMm"]
      );
      group.add(head);

      const shaft = new Mesh(shaftGeometry, materials.screw);
      shaft.name = `${name}_screw_${index + 1}_shaft`;
      shaft.rotation.x = Math.PI / 2;
      shaft.position.set(offsetX, y, shaftZ);
      setMeshMetadata(
        shaft,
        { width: 0.0032, height: 0.0032, depth: totalDepth },
        ["handleType", "handlePositionMm", "frontThicknessMm", "handleLengthMm", "handleSizeMm", "handleProjectionMm"]
      );
      group.add(shaft);
    }
  };

  for (let index = 0; index < drawerCount; index += 1) {
    const frontHeight = drawerFrontHeights[index] ?? drawerFrontHeights[drawerFrontHeights.length - 1] ?? 0.18;
    const frontName = `front_${index + 1}`;
    const front = new Mesh(
      new BoxGeometry(frontWidth, frontHeight, frontThickness),
      materials.resolveOverride(frontName, materials.front)
    );
    front.name = frontName;
    front.position.set(0, frontCursor + frontHeight / 2, frontCenterZ);
    setMeshMetadata(
      front,
      { width: frontWidth, height: frontHeight, depth: frontThickness },
      [
        "width",
        "height",
        "depth",
        "frontThicknessMm",
        "sideGap",
        "topGap",
        "bottomGap",
        "frontGap",
        "drawerCount",
        "drawerFrontHeights",
        "frontStackPreset",
        "topFrontHeightMm",
        "handleType",
        "handlePositionMm",
        "handleLengthMm",
        "handleSizeMm",
        "handleProjectionMm"
      ],
      "height"
    );
    group.add(front);

    if (handleType !== "none") {
      if (handleType === "gola") {
        const golaHeight = clamp(handleSizeMm, 0.006, 0.05);
        const golaDepth = clamp(handleProjectionMm, 0.006, 0.04);
        const golaWidth = clamp(handleLengthMm > 0 ? handleLengthMm : frontWidth, 0.06, frontWidth);
        addBoxPart({
          group,
          name: `gola_${index + 1}`,
          size: { width: golaWidth, height: golaHeight, depth: golaDepth },
          position: new Vector3(0, front.position.y + frontHeight / 2 - golaHeight / 2 - 0.002, frontCenterZ - frontThickness / 2 - golaDepth / 2 + 0.002),
          material: materials.handle,
          paramKeys: ["handleType", "handleLengthMm", "handleSizeMm", "handleProjectionMm", "frontThicknessMm"]
        });
      } else {
        const handleY = front.position.y + frontHeight / 2 - handlePositionMm;
        if (handleType === "bar") {
          const barWidth = clamp(handleLengthMm > 0 ? handleLengthMm : Math.min(frontWidth * 0.6, 0.35), 0.06, frontWidth * 0.95);
          const barHeight = clamp(handleSizeMm > 0 ? handleSizeMm : 0.012, 0.006, 0.05);
          const barDepth = clamp(handleProjectionMm > 0 ? handleProjectionMm : 0.012, 0.006, 0.06);
          addBoxPart({
            group,
            name: `handle_${index + 1}`,
            size: { width: barWidth, height: barHeight, depth: barDepth },
            position: new Vector3(0, handleY, frontCenterZ + frontThickness / 2 + barDepth / 2),
            material: materials.handle,
            paramKeys: ["handleType", "handlePositionMm", "handleLengthMm", "handleSizeMm", "handleProjectionMm", "frontThicknessMm"]
          });
          addHandleScrews(`handle_${index + 1}`, 2, Math.min(barWidth * 0.75, Math.max(0.06, barWidth - 0.08)), handleY, barDepth);
        } else if (handleType === "knob") {
          const knobRadius = clamp((handleSizeMm > 0 ? handleSizeMm : 0.024) / 2, 0.006, 0.03);
          const knobDepth = clamp(handleProjectionMm > 0 ? handleProjectionMm : 0.018, 0.008, 0.06);
          const knob = new Mesh(new CylinderGeometry(knobRadius, knobRadius, knobDepth, 18), materials.handle);
          knob.name = `handle_${index + 1}`;
          knob.rotation.x = Math.PI / 2;
          knob.position.set(0, handleY, frontCenterZ + frontThickness / 2 + knobDepth / 2);
          setMeshMetadata(
            knob,
            { width: knobRadius * 2, height: knobRadius * 2, depth: knobDepth },
            ["handleType", "handlePositionMm", "handleSizeMm", "handleProjectionMm", "frontThicknessMm"]
          );
          group.add(knob);
          addHandleScrews(`handle_${index + 1}`, 1, 0, handleY, knobDepth);
        } else if (handleType === "cup") {
          const cupWidth = clamp(handleLengthMm > 0 ? handleLengthMm : Math.min(frontWidth * 0.45, 0.22), 0.06, frontWidth * 0.9);
          const cupDepth = clamp(handleProjectionMm > 0 ? handleProjectionMm : 0.02, 0.01, 0.05);
          const cupRadius = Math.max(0.006, cupDepth / 2);
          const cup = new Mesh(
            new CylinderGeometry(cupRadius, cupRadius, cupWidth, 24, 1, true, 0, Math.PI),
            materials.handle
          );
          cup.name = `handle_${index + 1}`;
          cup.rotation.z = Math.PI / 2;
          cup.rotation.y = Math.PI;
          const cupScaleY = handleSizeMm > 0 ? clamp(handleSizeMm / (2 * cupRadius), 0.35, 2.5) : 1;
          cup.scale.set(1, cupScaleY, 1);
          cup.position.set(0, handleY, frontCenterZ + frontThickness / 2 + cupRadius);
          setMeshMetadata(
            cup,
            { width: cupWidth, height: 2 * cupRadius * cupScaleY, depth: 2 * cupRadius },
            ["handleType", "handlePositionMm", "handleLengthMm", "handleSizeMm", "handleProjectionMm", "frontThicknessMm"]
          );
          group.add(cup);
          addHandleScrews(`handle_${index + 1}`, 2, Math.min(cupWidth * 0.7, Math.max(0.06, cupWidth - 0.08)), handleY, cupDepth);
        }
      }
    }

    const railWidth = 0.008;
    const railHeight = 0.012;
    const drawerHalfGap = Math.max(0.004, sideClearance / 2);
    const frontSpacing = Math.max(0.006, frontGap * 2);
    const drawerFrontInset = Math.max(0.012, Math.min(0.032, Math.max(sideClearance, 0.012)));
    const drawerOuterWidth = Math.max(0.05, innerWidth - 2 * drawerHalfGap);
    const drawerOuterHeight = Math.max(0.05, frontHeight - frontSpacing);
    const drawerFrontPlaneZ = depth / 2 - drawerFrontInset;
    const drawerDepthSpan = Math.max(0.05, drawerFrontPlaneZ - (backPanelDepthOffset + backThickness / 2));
    const drawerDepth = Math.max(0.1, drawerDepthSpan - clamp(drawerBackReserve, 0.005, 0.05));
    const drawerBottomWidth = Math.max(0.02, drawerOuterWidth - 2 * drawerBoxThickness);
    const drawerBottomDepth = Math.max(0.05, drawerDepth - drawerBoxThickness);
    const drawerSideHeight = Math.min(drawerOuterHeight, Math.max(0.03, getNumber(params.drawerBoxSideHeight, 110) * MM_TO_M));
    const drawerCenterY = clamp(
      frontCursor + frontHeight / 2,
      plinthHeight + boardThickness + 0.002 + drawerOuterHeight / 2,
      height - boardThickness - 0.002 - drawerOuterHeight / 2
    );
    const drawerCenter = new Vector3(0, drawerCenterY, drawerFrontPlaneZ - 0.001 - drawerDepth / 2);
    const drawerSideCenterY = drawerCenter.y - drawerOuterHeight / 2 + drawerSideHeight / 2;

    const leftDrawerSide = new Mesh(
      new BoxGeometry(drawerBoxThickness, drawerSideHeight, drawerDepth),
      materials.hardware
    );
    leftDrawerSide.name = `drawer_${index + 1}_sideL`;
    leftDrawerSide.position.set(drawerCenter.x - drawerOuterWidth / 2 + drawerBoxThickness / 2, drawerSideCenterY, drawerCenter.z);
    setMeshMetadata(
      leftDrawerSide,
      { width: drawerBoxThickness, height: drawerSideHeight, depth: drawerDepth },
      ["drawerBoxThickness", "drawerBoxSideHeight", "sideClearanceMm", "drawerBackReserveMm", "width", "depth", "drawerCount"],
      "depth"
    );
    group.add(leftDrawerSide);

    const rightDrawerSide = leftDrawerSide.clone();
    rightDrawerSide.geometry = new BoxGeometry(drawerBoxThickness, drawerSideHeight, drawerDepth);
    rightDrawerSide.name = `drawer_${index + 1}_sideR`;
    rightDrawerSide.position.x = drawerCenter.x + drawerOuterWidth / 2 - drawerBoxThickness / 2;
    setMeshMetadata(
      rightDrawerSide,
      { width: drawerBoxThickness, height: drawerSideHeight, depth: drawerDepth },
      ["drawerBoxThickness", "drawerBoxSideHeight", "sideClearanceMm", "drawerBackReserveMm", "width", "depth", "drawerCount"],
      "depth"
    );
    group.add(rightDrawerSide);

    const drawerBottom = new Mesh(
      new BoxGeometry(drawerBottomWidth, drawerBoxThickness, drawerBottomDepth),
      materials.resolveOverride(`drawer_${index + 1}_bottom`, materials.drawer)
    );
    drawerBottom.name = `drawer_${index + 1}_bottom`;
    drawerBottom.position.set(drawerCenter.x, drawerCenter.y - drawerOuterHeight / 2 + drawerBoxThickness / 2, drawerCenter.z + drawerBoxThickness / 2);
    setMeshMetadata(
      drawerBottom,
      { width: drawerBottomWidth, height: drawerBoxThickness, depth: drawerBottomDepth },
      ["drawerBoxThickness", "sideClearanceMm", "drawerBackReserveMm", "width", "depth", "drawerCount"],
      "depth"
    );
    group.add(drawerBottom);

    const drawerBack = new Mesh(
      new BoxGeometry(drawerBottomWidth, drawerSideHeight, drawerBoxThickness),
      materials.hardware
    );
    drawerBack.name = `drawer_${index + 1}_back`;
    drawerBack.position.set(drawerCenter.x, drawerSideCenterY, drawerCenter.z - drawerDepth / 2 + drawerBoxThickness / 2);
    setMeshMetadata(
      drawerBack,
      { width: drawerBottomWidth, height: drawerSideHeight, depth: drawerBoxThickness },
      ["drawerBoxThickness", "drawerBoxSideHeight", "sideClearanceMm", "drawerBackReserveMm", "width", "depth", "drawerCount"],
      "width"
    );
    group.add(drawerBack);

    const railDepth = Math.max(0.2, drawerDepth - 0.005);
    const railY = drawerCenter.y - drawerOuterHeight / 2 - railHeight / 2 - 0.001;
    const railZ = drawerFrontPlaneZ - 0.001 - railDepth / 2;
    addBoxPart({
      group,
      name: `drawer_${index + 1}_railL`,
      size: { width: railWidth, height: railHeight, depth: railDepth },
      position: new Vector3(-drawerOuterWidth / 2 + railWidth / 2, railY, railZ),
      material: materials.handle,
      paramKeys: ["sideClearanceMm", "drawerBackReserveMm", "width", "depth", "drawerCount"]
    });
    addBoxPart({
      group,
      name: `drawer_${index + 1}_railR`,
      size: { width: railWidth, height: railHeight, depth: railDepth },
      position: new Vector3(drawerOuterWidth / 2 - railWidth / 2, railY, railZ),
      material: materials.handle,
      paramKeys: ["sideClearanceMm", "drawerBackReserveMm", "width", "depth", "drawerCount"]
    });

    frontCursor += frontHeight + frontGap;
  }

  return group;
}
