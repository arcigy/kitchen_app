import * as THREE from "three";

export type PortableGeometryPart = {
  id: string;
  label: string;
  kind: "panel" | "front" | "drawer-box" | "back-panel" | "hardware" | "support";
  materialRole: "body" | "front" | "drawer" | "hardware";
  sizeMm: {
    width: number;
    height: number;
    depth: number;
    thickness: number;
  };
  quantity: number;
  paramKeys: string[];
  formulas: Record<string, string>;
  notes?: string[];
};

export type PortableGeometrySnapshot = {
  moduleType: string;
  displayName: string;
  dimensions: {
    widthMm: number;
    heightMm: number;
    depthMm: number;
    worktopThicknessMm: number;
    plinthHeightMm: number;
  };
  parameterEffects: Array<{
    parameter: string;
    effect: string;
  }>;
  parts: PortableGeometryPart[];
};

const MM_TO_M = 0.001;

function getNumber(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function evaluateFormula(
  expression: string | undefined,
  context: Record<string, unknown>,
  fallback: number
): number {
  if (!expression) return fallback;
  try {
    const evaluator = new Function("context", `with (context) { return (${expression}); }`) as (
      context: Record<string, unknown>
    ) => unknown;
    const next = evaluator(context);
    return typeof next === "number" && Number.isFinite(next) ? next : fallback;
  } catch {
    return fallback;
  }
}

function resolveSnapshotDimensions(params: Record<string, unknown>, snapshot: PortableGeometrySnapshot) {
  return {
    widthMm: getNumber(params.width, getNumber(params.lengthX, snapshot.dimensions.widthMm)),
    heightMm: getNumber(params.height, snapshot.dimensions.heightMm),
    depthMm: getNumber(params.depth, getNumber(params.lengthZ, snapshot.dimensions.depthMm)),
    worktopThicknessMm: getNumber(params.worktopThicknessMm, snapshot.dimensions.worktopThicknessMm),
    plinthHeightMm: getNumber(params.plinthHeight, snapshot.dimensions.plinthHeightMm)
  };
}

function resolveDrawerFrontHeights(params: Record<string, unknown>, snapshot: PortableGeometrySnapshot): number[] {
  const raw = params.drawerFrontHeights;
  if (Array.isArray(raw)) {
    const values = raw.filter((entry): entry is number => typeof entry === "number" && Number.isFinite(entry));
    if (values.length > 0) return values;
  }
  return snapshot.parts.filter((part) => part.kind === "front").map((part) => part.sizeMm.height);
}

function resolvePartSize(
  part: PortableGeometryPart,
  params: Record<string, unknown>,
  snapshot: PortableGeometrySnapshot,
  drawerHeights: number[]
) {
  const dimensions = resolveSnapshotDimensions(params, snapshot);
  const boardThickness = getNumber(params.boardThickness, 18);
  const backThickness = getNumber(params.backThickness, 8);
  const frontThicknessMm = getNumber(params.frontThicknessMm, part.sizeMm.thickness);
  const frontGap = getNumber(params.frontGap, 2);
  const sideGap = getNumber(params.sideGap, 2);
  const topGap = getNumber(params.topGap, 2);
  const bottomGap = getNumber(params.bottomGap, 2);
  const drawerBoxThickness = getNumber(params.drawerBoxThickness, part.sizeMm.thickness);
  const drawerBoxSideHeight = getNumber(params.drawerBoxSideHeight, part.sizeMm.height);
  const drawerBackReserveMm = getNumber(params.drawerBackReserveMm, 8);
  const formulaContext: Record<string, unknown> = {
    ...params,
    width: dimensions.widthMm,
    height: dimensions.heightMm,
    depth: dimensions.depthMm,
    lengthX: dimensions.widthMm,
    lengthZ: dimensions.depthMm,
    boardThickness,
    backThickness,
    frontThicknessMm,
    frontGap,
    sideGap,
    topGap,
    bottomGap,
    plinthHeight: dimensions.plinthHeightMm,
    plinthHeightMm: dimensions.plinthHeightMm,
    worktopThicknessMm: dimensions.worktopThicknessMm,
    drawerBoxThickness,
    drawerBoxSideHeight,
    drawerBackReserveMm,
    drawerFrontHeights: drawerHeights
  };

  return {
    width: Math.max(1, evaluateFormula(part.formulas.width, formulaContext, part.sizeMm.width)),
    height: Math.max(1, evaluateFormula(part.formulas.height, formulaContext, part.sizeMm.height)),
    depth: Math.max(1, evaluateFormula(part.formulas.depth, formulaContext, part.sizeMm.depth)),
    thickness: Math.max(1, evaluateFormula(part.formulas.thickness, formulaContext, part.sizeMm.thickness))
  };
}

function getMaterial(part: PortableGeometryPart) {
  if (part.materialRole === "front") {
    return new THREE.MeshStandardMaterial({ color: 0x5b7dd3, roughness: 0.6, metalness: 0.05 });
  }
  if (part.materialRole === "drawer") {
    return new THREE.MeshStandardMaterial({ color: 0xd8a25f, roughness: 0.7, metalness: 0.05 });
  }
  if (part.materialRole === "hardware") {
    return new THREE.MeshStandardMaterial({ color: 0x434955, roughness: 0.45, metalness: 0.3 });
  }
  return new THREE.MeshStandardMaterial({ color: 0xb8bcc7, roughness: 0.78, metalness: 0.02 });
}

function placePart(args: {
  part: PortableGeometryPart;
  index: number;
  size: { width: number; height: number; depth: number; thickness: number };
  params: Record<string, unknown>;
  snapshot: PortableGeometrySnapshot;
  drawerHeights: number[];
}): THREE.Vector3 {
  const { part, index, size, params, snapshot, drawerHeights } = args;
  const dims = resolveSnapshotDimensions(params, snapshot);
  const widthMm = dims.widthMm;
  const heightMm = dims.heightMm;
  const depthMm = dims.depthMm;
  const plinthHeightMm = dims.plinthHeightMm;
  const frontGap = getNumber(params.frontGap, 2);
  const frontThicknessMm = getNumber(params.frontThicknessMm, size.thickness);
  const plinthSetbackMm = getNumber(params.plinthSetbackMm, 0);
  const boardThickness = getNumber(params.boardThickness, 18);

  const frontParts = snapshot.parts.filter((entry) => entry.kind === "front");
  const frontIndex =
    part.kind === "front" || part.kind === "drawer-box" || (part.kind === "hardware" && /handle/i.test(part.id))
      ? Math.max(
          0,
          snapshot.parts
            .filter((entry) => entry.kind === "front")
            .findIndex((entry) => entry.id === part.id.replace("drawer-box", "drawer-front"))
        )
      : -1;

  let drawerCursor = plinthHeightMm + getNumber(params.bottomGap, 2);
  const drawerCenters = drawerHeights.map((drawerHeight) => {
    const center = drawerCursor + drawerHeight / 2;
    drawerCursor += drawerHeight + frontGap;
    return center;
  });

  if (/left/i.test(part.id)) {
    return new THREE.Vector3(
      (-widthMm / 2 + size.thickness / 2) * MM_TO_M,
      (plinthHeightMm + size.height / 2) * MM_TO_M,
      0
    );
  }

  if (/right/i.test(part.id)) {
    return new THREE.Vector3(
      (widthMm / 2 - size.thickness / 2) * MM_TO_M,
      (plinthHeightMm + size.height / 2) * MM_TO_M,
      0
    );
  }

  if (/back/i.test(part.id)) {
    return new THREE.Vector3(0, (plinthHeightMm + size.height / 2 + boardThickness) * MM_TO_M, (-depthMm / 2 + size.depth / 2) * MM_TO_M);
  }

  if (/plinth|kick/i.test(part.id)) {
    return new THREE.Vector3(0, size.height * 0.5 * MM_TO_M, (depthMm / 2 - size.depth / 2 - plinthSetbackMm) * MM_TO_M);
  }

  if (/top/i.test(part.id)) {
    return new THREE.Vector3(0, (heightMm - dims.worktopThicknessMm - size.thickness / 2) * MM_TO_M, 0);
  }

  if (/bottom/i.test(part.id)) {
    return new THREE.Vector3(0, (plinthHeightMm + size.thickness / 2) * MM_TO_M, 0);
  }

  if (part.kind === "front") {
    const resolvedIndex = frontIndex >= 0 ? frontIndex : Math.min(index, Math.max(0, frontParts.length - 1));
    const centerY = drawerCenters[resolvedIndex] ?? plinthHeightMm + size.height / 2;
    return new THREE.Vector3(0, centerY * MM_TO_M, (depthMm / 2 + size.depth / 2) * MM_TO_M);
  }

  if (part.kind === "drawer-box") {
    const resolvedIndex = frontIndex >= 0 ? frontIndex : 0;
    const centerY = drawerCenters[resolvedIndex] ?? plinthHeightMm + size.height / 2;
    return new THREE.Vector3(0, centerY * MM_TO_M, (depthMm / 2 - frontThicknessMm - size.depth / 2 - 12) * MM_TO_M);
  }

  if (part.kind === "hardware" && /handle/i.test(part.id)) {
    const centerY = drawerCenters[0] ?? (heightMm / 2);
    return new THREE.Vector3(0, centerY * MM_TO_M, (depthMm / 2 + size.depth / 2 + frontThicknessMm) * MM_TO_M);
  }

  return new THREE.Vector3(
    (((index % 3) - 1) * (widthMm * 0.15)) * MM_TO_M,
    (heightMm + 40 + Math.floor(index / 3) * 50) * MM_TO_M,
    0
  );
}

export function buildPortableModuleGroup(
  params: Record<string, unknown>,
  snapshot: PortableGeometrySnapshot
): THREE.Group {
  const group = new THREE.Group();
  group.name = `${snapshot.moduleType}PortableModule`;
  const drawerHeights = resolveDrawerFrontHeights(params, snapshot);

  snapshot.parts.forEach((part, index) => {
    const size = resolvePartSize(part, params, snapshot, drawerHeights);
    const quantity = Math.max(1, Math.round(part.quantity));
    for (let copyIndex = 0; copyIndex < quantity; copyIndex += 1) {
      const geometry = new THREE.BoxGeometry(
        Math.max(size.width, 1) * MM_TO_M,
        Math.max(size.height, 1) * MM_TO_M,
        Math.max(size.depth, 1) * MM_TO_M
      );
      const mesh = new THREE.Mesh(geometry, getMaterial(part));
      mesh.name = quantity === 1 ? part.id : `${part.id}_${copyIndex + 1}`;
      mesh.position.copy(placePart({ part, index, size, params, snapshot, drawerHeights }));
      if (quantity > 1 && !/handle/i.test(part.id)) {
        mesh.position.x += (copyIndex - (quantity - 1) / 2) * Math.max(size.width * 1.1, 60) * MM_TO_M;
      }
      mesh.userData.selectable = true;
      mesh.userData.paramKeys = [...part.paramKeys];
      mesh.userData.dimensionsMm = {
        width: size.width,
        height: size.height,
        depth: size.depth
      };
      mesh.userData.portablePart = {
        id: part.id,
        label: part.label,
        kind: part.kind,
        materialRole: part.materialRole,
        notes: part.notes ?? []
      };
      group.add(mesh);
    }
  });

  return group;
}
