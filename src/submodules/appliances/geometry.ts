import * as THREE from "three";
import type { ClientCatalog } from "../../core/catalog/catalog-types";
import { normalizeApplianceSubmoduleParams, type ApplianceSubmoduleParams } from "./types";

const MM = 0.001;

function material(color: number, roughness = 0.55, metalness = 0.1, opacity = 1) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness,
    metalness,
    transparent: opacity < 1,
    opacity
  });
}

function addBox(
  group: THREE.Group,
  name: string,
  sizeMm: { width: number; height: number; depth: number },
  centerMm: { x: number; y: number; z: number },
  mat: THREE.Material,
  params: ApplianceSubmoduleParams,
  paramKeys: string[]
) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(sizeMm.width * MM, sizeMm.height * MM, sizeMm.depth * MM),
    mat
  );
  mesh.name = name;
  mesh.position.set(centerMm.x * MM, centerMm.y * MM, centerMm.z * MM);
  mesh.userData.dimensionsMm = sizeMm;
  mesh.userData.partName = name;
  mesh.userData.boardName = name;
  mesh.userData.materialGroup = "appliance";
  mesh.userData.materialSlotId = "appliance";
  mesh.userData.paramKeys = paramKeys;
  mesh.userData.submoduleKind = "appliance";
  mesh.userData.applianceSubmoduleType = params.applianceSubmoduleType;
  mesh.userData.applianceBrand = params.brand;
  mesh.userData.applianceModel = params.model;
  group.add(mesh);
  return mesh;
}

function addCylinder(
  group: THREE.Group,
  name: string,
  radiusMm: number,
  lengthMm: number,
  centerMm: { x: number; y: number; z: number },
  mat: THREE.Material,
  params: ApplianceSubmoduleParams,
  paramKeys: string[],
  axis: "x" | "y" | "z" = "z"
) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radiusMm * MM, radiusMm * MM, lengthMm * MM, 40),
    mat
  );
  mesh.name = name;
  if (axis === "x") mesh.rotation.z = Math.PI / 2;
  if (axis === "z") mesh.rotation.x = Math.PI / 2;
  mesh.position.set(centerMm.x * MM, centerMm.y * MM, centerMm.z * MM);
  const diameter = radiusMm * 2;
  mesh.userData.dimensionsMm =
    axis === "x" ? { width: lengthMm, height: diameter, depth: diameter } :
    axis === "y" ? { width: diameter, height: lengthMm, depth: diameter } :
    { width: diameter, height: diameter, depth: lengthMm };
  mesh.userData.partName = name;
  mesh.userData.boardName = name;
  mesh.userData.materialGroup = "appliance";
  mesh.userData.materialSlotId = "appliance";
  mesh.userData.paramKeys = paramKeys;
  mesh.userData.submoduleKind = "appliance";
  mesh.userData.applianceSubmoduleType = params.applianceSubmoduleType;
  mesh.userData.applianceBrand = params.brand;
  mesh.userData.applianceModel = params.model;
  group.add(mesh);
  return mesh;
}

function addTorus(
  group: THREE.Group,
  name: string,
  radiusMm: number,
  tubeMm: number,
  centerMm: { x: number; y: number; z: number },
  mat: THREE.Material,
  params: ApplianceSubmoduleParams,
  paramKeys: string[],
  plane: "front" | "top" = "top"
) {
  const mesh = new THREE.Mesh(
    new THREE.TorusGeometry(radiusMm * MM, tubeMm * MM, 16, 96),
    mat
  );
  mesh.name = name;
  if (plane === "top") mesh.rotation.x = Math.PI / 2;
  mesh.position.set(centerMm.x * MM, centerMm.y * MM, centerMm.z * MM);
  const diameter = (radiusMm + tubeMm) * 2;
  mesh.userData.dimensionsMm =
    plane === "top" ? { width: diameter, height: tubeMm * 2, depth: diameter } :
    { width: diameter, height: diameter, depth: tubeMm * 2 };
  mesh.userData.partName = name;
  mesh.userData.boardName = name;
  mesh.userData.materialGroup = "appliance";
  mesh.userData.materialSlotId = "appliance";
  mesh.userData.paramKeys = paramKeys;
  mesh.userData.submoduleKind = "appliance";
  mesh.userData.applianceSubmoduleType = params.applianceSubmoduleType;
  mesh.userData.applianceBrand = params.brand;
  mesh.userData.applianceModel = params.model;
  group.add(mesh);
  return mesh;
}

function addHorizontalFrame(
  group: THREE.Group,
  name: string,
  sizeMm: { width: number; height: number; depth: number },
  bottomYmm: number,
  holesMm: Array<{ x: number; z: number; width: number; depth: number }>,
  mat: THREE.Material,
  params: ApplianceSubmoduleParams,
  paramKeys: string[]
) {
  const halfW = sizeMm.width / 2;
  const halfD = sizeMm.depth / 2;
  const shape = new THREE.Shape();
  shape.moveTo(-halfW * MM, halfD * MM);
  shape.lineTo(halfW * MM, halfD * MM);
  shape.lineTo(halfW * MM, -halfD * MM);
  shape.lineTo(-halfW * MM, -halfD * MM);
  shape.lineTo(-halfW * MM, halfD * MM);

  for (const hole of holesMm) {
    const minX = hole.x - hole.width / 2;
    const maxX = hole.x + hole.width / 2;
    const minZ = hole.z - hole.depth / 2;
    const maxZ = hole.z + hole.depth / 2;
    const path = new THREE.Path();
    path.moveTo(minX * MM, -minZ * MM);
    path.lineTo(maxX * MM, -minZ * MM);
    path.lineTo(maxX * MM, -maxZ * MM);
    path.lineTo(minX * MM, -maxZ * MM);
    path.lineTo(minX * MM, -minZ * MM);
    shape.holes.push(path);
  }

  const mesh = new THREE.Mesh(
    new THREE.ExtrudeGeometry(shape, { depth: sizeMm.height * MM, bevelEnabled: false }),
    mat
  );
  mesh.name = name;
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.set(0, bottomYmm * MM, 0);
  mesh.userData.dimensionsMm = sizeMm;
  mesh.userData.partName = name;
  mesh.userData.boardName = name;
  mesh.userData.materialGroup = "appliance";
  mesh.userData.materialSlotId = "appliance";
  mesh.userData.paramKeys = paramKeys;
  mesh.userData.submoduleKind = "appliance";
  mesh.userData.applianceSubmoduleType = params.applianceSubmoduleType;
  mesh.userData.applianceBrand = params.brand;
  mesh.userData.applianceModel = params.model;
  group.add(mesh);
  return mesh;
}

export function buildApplianceSubmodule(params: ApplianceSubmoduleParams, catalog: ClientCatalog): THREE.Group {
  void catalog;
  const p = normalizeApplianceSubmoduleParams(params);
  const group = new THREE.Group();
  group.name = `appliance_submodule_${p.applianceSubmoduleType}`;
  group.userData.submoduleKind = "appliance";
  group.userData.applianceSubmoduleType = p.applianceSubmoduleType;
  group.userData.applianceParams = { ...p };

  if (p.applianceSubmoduleType === "microwave") {
    buildMicrowave(group, p);
  } else if (p.applianceSubmoduleType === "oven") {
    buildOven(group, p);
  } else if (p.applianceSubmoduleType === "sink") {
    buildSink(group, p);
  } else if (p.applianceSubmoduleType === "cooktop") {
    buildCooktop(group, p);
  } else {
    buildPlaceholderAppliance(group, p);
  }

  group.updateMatrixWorld(true);
  return group;
}

function addRequiredOpeningEnvelope(group: THREE.Group, p: ApplianceSubmoduleParams, name: string) {
  const openingMat = material(0x5b8fd9, 0.8, 0.02, 0.12);
  const opening = addBox(
    group,
    name,
    { width: p.hostOpeningWidthMm, height: p.hostOpeningHeightMm, depth: p.hostOpeningDepthMm },
    { x: 0, y: p.hostOpeningHeightMm / 2, z: 0 },
    openingMat,
    p,
    ["hostOpeningWidthMm", "hostOpeningHeightMm", "hostOpeningDepthMm", "placementRule"]
  );
  opening.userData.materialGroup = "placement";
  opening.userData.materialSlotId = "placement";
  opening.userData.placementRule = p.placementRule;
  opening.userData.hiddenByDefault = true;
  opening.visible = false;
}

function buildMicrowave(group: THREE.Group, p: ApplianceSubmoduleParams) {
  const bodyMat = material(0x171a1d, 0.52, 0.32);
  const blackGlassMat = material(0x07090b, 0.18, 0.12, 0.78);
  const smokedGlassMat = material(0x202326, 0.36, 0.08, 0.55);
  const glossPanelMat = material(0x050607, 0.16, 0.22);
  const lineMat = material(0x55595d, 0.48, 0.08);
  const knobMat = material(0xd7d7d4, 0.28, 0.6);
  const handleMat = material(0x08090b, 0.3, 0.42);
  const footMat = material(0x060708, 0.55, 0.25);

  const frontZ = p.depth / 2;
  const controlW = Math.max(70, p.width * 0.17);
  const controlX = p.width / 2 - controlW / 2 - 8;
  const doorW = Math.max(120, p.width - controlW - 34);
  const doorX = -p.width / 2 + doorW / 2 + 8;
  const glassW = Math.max(120, doorW - 52);
  const glassH = Math.max(90, p.height - 104);
  const glassX = doorX - 8;
  const glassY = p.height * 0.57;

  addBox(group, "microwave_body", { width: p.width, height: p.height, depth: p.depth }, { x: 0, y: p.height / 2, z: 0 }, bodyMat, p, ["width", "height", "depth", "brand", "model"]);
  addBox(group, "microwave_front_black_glass", { width: p.width, height: p.height, depth: 18 }, { x: 0, y: p.height / 2, z: frontZ + 9 }, blackGlassMat, p, ["width", "height", "depth"]);
  addBox(group, "microwave_door_smoked_window", { width: glassW, height: glassH, depth: 22 }, { x: glassX, y: glassY, z: frontZ + 22 }, smokedGlassMat, p, ["width", "height", "depth"]);

  const ribCount = 28;
  for (let index = 0; index < ribCount; index += 1) {
    const y = glassY - glassH * 0.42 + (index / (ribCount - 1)) * glassH * 0.84;
    addBox(
      group,
      `microwave_window_rib_${index + 1}`,
      { width: glassW - 16, height: 1.4, depth: 4 },
      { x: glassX, y, z: frontZ + 35 },
      lineMat,
      p,
      ["width", "height"]
    );
  }

  addBox(group, "microwave_control_panel_gloss", { width: controlW, height: p.height - 28, depth: 24 }, { x: controlX, y: p.height / 2, z: frontZ + 24 }, glossPanelMat, p, ["width", "height"]);
  addBox(group, "microwave_control_panel_left_seam", { width: 4, height: p.height - 26, depth: 28 }, { x: controlX - controlW / 2, y: p.height / 2, z: frontZ + 27 }, handleMat, p, ["width", "height"]);
  addBox(group, "microwave_vertical_handle", { width: 22, height: Math.max(125, p.height * 0.55), depth: 26 }, { x: controlX - controlW / 2 - 22, y: p.height * 0.52, z: frontZ + 45 }, handleMat, p, ["width", "height"]);
  addCylinder(group, "microwave_handle_top_mount", 11, 18, { x: controlX - controlW / 2 - 22, y: p.height * 0.71, z: frontZ + 52 }, handleMat, p, ["width", "height"], "z");
  addCylinder(group, "microwave_handle_bottom_mount", 11, 18, { x: controlX - controlW / 2 - 22, y: p.height * 0.33, z: frontZ + 52 }, handleMat, p, ["width", "height"], "z");

  for (const [index, y] of [p.height * 0.64, p.height * 0.34].entries()) {
    addCylinder(group, `microwave_knob_${index + 1}_outer`, Math.max(21, controlW * 0.28), 16, { x: controlX, y, z: frontZ + 44 }, knobMat, p, ["brand", "model", "powerW"], "z");
    addCylinder(group, `microwave_knob_${index + 1}_inner`, Math.max(15, controlW * 0.2), 20, { x: controlX, y, z: frontZ + 48 }, glossPanelMat, p, ["brand", "model", "powerW"], "z");
    addBox(group, `microwave_knob_${index + 1}_indicator`, { width: 2, height: Math.max(18, controlW * 0.24), depth: 4 }, { x: controlX, y: y + Math.max(12, controlW * 0.18), z: frontZ + 59 }, knobMat, p, ["powerW"]);
  }

  addBox(group, "microwave_brand_badge", { width: Math.max(46, p.width * 0.09), height: 7, depth: 3 }, { x: glassX, y: p.height * 0.17, z: frontZ + 38 }, lineMat, p, ["brand", "model"]);

  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 5; col += 1) {
      addBox(
        group,
        `microwave_left_vent_${row + 1}_${col + 1}`,
        { width: 3, height: 9, depth: 18 },
        { x: -p.width / 2 + 1.5, y: p.height * 0.24 + row * 18, z: -p.depth * 0.28 + col * 18 },
        footMat,
        p,
        ["depth", "height"]
      );
    }
  }

  for (const [index, x] of [-p.width * 0.36, -p.width * 0.05, p.width * 0.34].entries()) {
    addBox(group, `microwave_foot_${index + 1}`, { width: 38, height: 12, depth: 28 }, { x, y: 6, z: frontZ - 18 }, footMat, p, ["width", "depth"]);
  }

  addRequiredOpeningEnvelope(group, p, "microwave_required_opening_envelope");
}

function buildOven(group: THREE.Group, p: ApplianceSubmoduleParams) {
  const bodyMat = material(0x101113, 0.46, 0.28);
  const glassMat = material(0x050607, 0.2, 0.24, 0.8);
  const controlMat = material(0x141619, 0.35, 0.28);
  const metalMat = material(0xc0c0bc, 0.22, 0.65);
  const displayMat = material(0x0b1014, 0.2, 0.18);
  const redLedMat = material(0xff5a45, 0.45, 0.02);
  const darkLineMat = material(0x272a2d, 0.55, 0.12);
  const frontZ = p.depth / 2;
  const controlH = Math.max(80, p.height * 0.19);
  const handleW = Math.max(360, p.width * 0.72);

  addBox(group, "oven_body", { width: p.width, height: p.height, depth: p.depth }, { x: 0, y: p.height / 2, z: 0 }, bodyMat, p, ["width", "height", "depth", "brand", "model"]);
  addBox(group, "oven_front_black_glass", { width: p.width - 18, height: p.height - controlH - 18, depth: 18 }, { x: 0, y: (p.height - controlH - 18) / 2 + 8, z: frontZ + 9 }, glassMat, p, ["width", "height", "depth"]);
  addBox(group, "oven_control_bar", { width: p.width, height: controlH, depth: 24 }, { x: 0, y: p.height - controlH / 2, z: frontZ + 18 }, controlMat, p, ["width", "height"]);
  addBox(group, "oven_handle", { width: handleW, height: 28, depth: 34 }, { x: 0, y: p.height - controlH - 28, z: frontZ + 44 }, metalMat, p, ["width", "height"]);
  addBox(group, "oven_handle_shadow", { width: handleW + 24, height: 12, depth: 6 }, { x: 0, y: p.height - controlH - 48, z: frontZ + 28 }, darkLineMat, p, ["width", "height"]);

  for (const [name, x] of [["oven_knob_left", -p.width * 0.32], ["oven_knob_right", p.width * 0.32]] as const) {
    addCylinder(group, name, Math.max(26, p.width * 0.045), 18, { x, y: p.height - controlH / 2, z: frontZ + 38 }, metalMat, p, ["brand", "model", "powerW"], "z");
    addCylinder(group, `${name}_inner`, Math.max(17, p.width * 0.03), 22, { x, y: p.height - controlH / 2, z: frontZ + 44 }, controlMat, p, ["brand", "model", "powerW"], "z");
    addBox(group, `${name}_pointer`, { width: 3, height: 22, depth: 4 }, { x, y: p.height - controlH / 2 + 28, z: frontZ + 56 }, metalMat, p, ["powerW"]);
  }

  addBox(group, "oven_digital_display", { width: 82, height: 28, depth: 5 }, { x: 0, y: p.height - controlH / 2 + 2, z: frontZ + 32 }, displayMat, p, ["brand", "model", "powerW"]);
  for (let index = 0; index < 4; index += 1) {
    addBox(group, `oven_display_digit_${index + 1}`, { width: 7, height: 14, depth: 3 }, { x: -22 + index * 15, y: p.height - controlH / 2 + 2, z: frontZ + 36 }, redLedMat, p, ["powerW"]);
  }
  addBox(group, "oven_door_reflection_upper", { width: p.width * 0.5, height: 3, depth: 3 }, { x: 0, y: p.height * 0.42, z: frontZ + 22 }, darkLineMat, p, ["width", "height"]);
  addBox(group, "oven_door_reflection_lower", { width: p.width * 0.36, height: 3, depth: 3 }, { x: 0, y: p.height * 0.2, z: frontZ + 22 }, darkLineMat, p, ["width", "height"]);
  addBox(group, "oven_brand_badge", { width: 42, height: 7, depth: 3 }, { x: 0, y: p.height * 0.08, z: frontZ + 24 }, metalMat, p, ["brand", "model"]);
  addRequiredOpeningEnvelope(group, p, "oven_required_opening_envelope");
}

function buildSink(group: THREE.Group, p: ApplianceSubmoduleParams) {
  const blackMat = material(0x141514, 0.72, 0.18);
  const cavityMat = material(0x080909, 0.58, 0.18);
  const edgeMat = material(0x252725, 0.62, 0.14);
  const metalMat = material(0xd7d7d2, 0.24, 0.66);
  const drainMat = material(0x111212, 0.42, 0.32);
  const topY = p.height;
  const rim = 28;
  const bowlW = Math.max(260, p.width * 0.43);
  const bowlD = Math.max(300, p.depth - 92);
  const bowlX = p.width / 2 - bowlW / 2 - 54;
  const drainerW = Math.max(260, p.width - bowlW - 96);
  const drainerX = -p.width / 2 + drainerW / 2 + 48;

  addHorizontalFrame(
    group,
    "sink_outer_rim",
    { width: p.width, height: 18, depth: p.depth },
    topY - 18,
    [{ x: bowlX, z: 0, width: bowlW - 8, depth: bowlD - 8 }],
    edgeMat,
    p,
    ["width", "height", "depth"]
  );
  addBox(group, "sink_drainer_board", { width: drainerW, height: 8, depth: p.depth - 104 }, { x: drainerX, y: topY - 4, z: 0 }, blackMat, p, ["width", "depth"]);
  for (let index = 0; index < 6; index += 1) {
    addBox(
      group,
      `sink_drainer_groove_${index + 1}`,
      { width: drainerW - 58, height: 3, depth: 6 },
      { x: drainerX, y: topY - 1.5, z: -bowlD * 0.33 + index * (bowlD * 0.13) },
      cavityMat,
      p,
      ["width", "depth"]
    );
  }

  addBox(group, "sink_bowl_bottom", { width: bowlW - rim * 2, height: 14, depth: bowlD - rim * 2 }, { x: bowlX, y: 7, z: 0 }, cavityMat, p, ["width", "height", "depth"]);
  addBox(group, "sink_bowl_left_wall", { width: 22, height: p.height - 18, depth: bowlD }, { x: bowlX - bowlW / 2 + 11, y: p.height / 2 - 4, z: 0 }, blackMat, p, ["width", "height", "depth"]);
  addBox(group, "sink_bowl_right_wall", { width: 22, height: p.height - 18, depth: bowlD }, { x: bowlX + bowlW / 2 - 11, y: p.height / 2 - 4, z: 0 }, blackMat, p, ["width", "height", "depth"]);
  addBox(group, "sink_bowl_back_wall", { width: bowlW, height: p.height - 18, depth: 22 }, { x: bowlX, y: p.height / 2 - 4, z: -bowlD / 2 + 11 }, blackMat, p, ["width", "height", "depth"]);
  addBox(group, "sink_bowl_front_wall", { width: bowlW, height: p.height - 18, depth: 22 }, { x: bowlX, y: p.height / 2 - 4, z: bowlD / 2 - 11 }, blackMat, p, ["width", "height", "depth"]);
  addTorus(group, "sink_drain_ring", 42, 7, { x: bowlX, y: 20, z: 0 }, metalMat, p, ["width", "depth"], "top");
  addTorus(group, "sink_drain_inner_ring", 25, 5, { x: bowlX, y: 23, z: 0 }, drainMat, p, ["width", "depth"], "top");
  for (let index = 0; index < 12; index += 1) {
    const angle = (index / 12) * Math.PI * 2;
    addBox(
      group,
      `sink_drain_slot_${index + 1}`,
      { width: 4, height: 4, depth: 28 },
      { x: bowlX + Math.cos(angle) * 18, y: 29, z: Math.sin(angle) * 18 },
      drainMat,
      p,
      ["width", "depth"]
    );
  }
  addBox(group, "sink_small_brand_badge", { width: 42, height: 3, depth: 10 }, { x: -p.width / 2 + 84, y: topY - 1.5, z: 0 }, metalMat, p, ["brand", "model"]);
  addRequiredOpeningEnvelope(group, p, "sink_required_opening_envelope");
}

function buildCooktop(group: THREE.Group, p: ApplianceSubmoduleParams) {
  const glassMat = material(0x070807, 0.24, 0.24, 0.88);
  const edgeMat = material(0x1d1f1f, 0.46, 0.32);
  const zoneMat = material(0x353838, 0.55, 0.08);
  const redMat = material(0xcc1f2c, 0.42, 0.02);
  const labelMat = material(0x666967, 0.6, 0.04);
  const topY = p.height;
  const rightX = p.width * 0.27;

  addBox(group, "cooktop_body", { width: p.width, height: p.height, depth: p.depth }, { x: 0, y: p.height / 2, z: 0 }, glassMat, p, ["width", "height", "depth", "brand", "model"]);
  addBox(group, "cooktop_front_bevel", { width: p.width, height: 12, depth: 18 }, { x: 0, y: 6, z: p.depth / 2 - 9 }, edgeMat, p, ["width", "depth"]);
  addBox(group, "cooktop_back_bevel", { width: p.width, height: 10, depth: 14 }, { x: 0, y: topY - 5, z: -p.depth / 2 + 7 }, edgeMat, p, ["width", "depth"]);

  addTorus(group, "cooktop_zone_round_upper", Math.max(72, p.width * 0.12), 2.2, { x: rightX, y: topY + 3, z: -p.depth * 0.19 }, zoneMat, p, ["width", "depth"], "top");
  addTorus(group, "cooktop_zone_round_lower", Math.max(92, p.width * 0.155), 2.2, { x: rightX, y: topY + 3, z: p.depth * 0.2 }, zoneMat, p, ["width", "depth"], "top");

  const rectX = -p.width * 0.28;
  for (const [index, z] of [-p.depth * 0.22, p.depth * 0.23].entries()) {
    addBox(group, `cooktop_zone_rect_${index + 1}_top`, { width: p.width * 0.36, height: 4, depth: 3 }, { x: rectX, y: topY + 3, z: z - p.depth * 0.12 }, zoneMat, p, ["width", "depth"]);
    addBox(group, `cooktop_zone_rect_${index + 1}_bottom`, { width: p.width * 0.36, height: 4, depth: 3 }, { x: rectX, y: topY + 3, z: z + p.depth * 0.12 }, zoneMat, p, ["width", "depth"]);
    addBox(group, `cooktop_zone_rect_${index + 1}_left`, { width: 3, height: 4, depth: p.depth * 0.24 }, { x: rectX - p.width * 0.18, y: topY + 3, z }, zoneMat, p, ["width", "depth"]);
    addBox(group, `cooktop_zone_rect_${index + 1}_right`, { width: 3, height: 4, depth: p.depth * 0.24 }, { x: rectX + p.width * 0.18, y: topY + 3, z }, zoneMat, p, ["width", "depth"]);
    addBox(group, `cooktop_zone_rect_${index + 1}_cross`, { width: 6, height: 4, depth: 6 }, { x: rectX, y: topY + 4, z }, labelMat, p, ["width", "depth"]);
  }

  addBox(group, "cooktop_touch_display", { width: 124, height: 5, depth: 28 }, { x: 0, y: topY + 5, z: p.depth * 0.35 }, redMat, p, ["brand", "model", "powerW"]);
  for (let index = 0; index < 10; index += 1) {
    addBox(group, `cooktop_control_mark_${index + 1}`, { width: 4, height: 4, depth: 10 }, { x: -82 + index * 18, y: topY + 7, z: p.depth * 0.43 }, redMat, p, ["powerW"]);
  }
  addBox(group, "cooktop_left_label", { width: 54, height: 3, depth: 8 }, { x: -p.width * 0.42, y: topY + 4, z: -p.depth * 0.42 }, labelMat, p, ["brand", "model"]);
  addBox(group, "cooktop_brand_badge", { width: 74, height: 4, depth: 20 }, { x: p.width * 0.39, y: topY + 5, z: p.depth * 0.42 }, labelMat, p, ["brand", "model"]);
  addRequiredOpeningEnvelope(group, p, "cooktop_required_opening_envelope");
}

function buildPlaceholderAppliance(group: THREE.Group, p: ApplianceSubmoduleParams) {
  addBox(
    group,
    `${p.applianceSubmoduleType}_placeholder_body`,
    { width: p.width, height: p.height, depth: p.depth },
    { x: 0, y: p.height / 2, z: 0 },
    material(0x68717d, 0.55, 0.2),
    p,
    ["width", "height", "depth", "brand", "model"]
  );
}
