import * as THREE from "three";

type IconKind = "base" | "tall" | "wall" | "corner" | "drawer" | "shelf" | "sink" | "appliance";

type IconHints = {
  category?: string | null;
  displayName?: string | null;
  moduleType?: string | null;
  tags?: readonly string[] | null;
};

function pathBox(x: number, y: number, w: number, h: number, dx: number, dy: number) {
  return [
    `M${x} ${y} L${x + w} ${y} L${x + w} ${y + h} L${x} ${y + h} Z`,
    `M${x} ${y} L${x + dx} ${y + dy} L${x + w + dx} ${y + dy} L${x + w} ${y}`,
    `M${x + w} ${y} L${x + w + dx} ${y + dy} L${x + w + dx} ${y + h + dy} L${x + w} ${y + h}`
  ];
}

function textHints(hints: IconHints) {
  return `${hints.category ?? ""} ${hints.displayName ?? ""} ${hints.moduleType ?? ""} ${(hints.tags ?? []).join(" ")}`.toLowerCase();
}

function objectRatioKind(root: THREE.Object3D): "base" | "tall" | "wall" {
  const box = new THREE.Box3().setFromObject(root);
  if (box.isEmpty()) return "base";
  const size = box.getSize(new THREE.Vector3());
  if (size.y > Math.max(size.x, size.z) * 1.55) return "tall";
  if (size.y < Math.max(size.x, size.z) * 0.75) return "wall";
  return "base";
}

function resolveKind(root: THREE.Object3D, hints: IconHints): IconKind {
  const text = textHints(hints);
  const category = hints.category ?? "";
  if (category === "corner_cabinet" || /corner|roh/.test(text)) return "corner";
  if (/sink|drez/.test(text)) return "sink";
  if (/drawer|zasuv|šuf|suf/.test(text)) return "drawer";
  if (/fridge|chlad|oven|rúra|rura|micro|appliance|umyv|dish/.test(text)) return "appliance";
  if (/shelf|polic|polica/.test(text)) return "shelf";
  if (category === "tall_cabinet" || /tall|vysok/.test(text)) return "tall";
  if (category === "wall_cabinet" || /wall|upper|horn/.test(text)) return "wall";
  return objectRatioKind(root);
}

function baseShape(kind: IconKind) {
  if (kind === "tall" || kind === "appliance") return { x: 21, y: 8, w: 21, h: 34, dx: 10, dy: -6 };
  if (kind === "wall") return { x: 18, y: 15, w: 27, h: 18, dx: 11, dy: -6 };
  if (kind === "corner") return { x: 17, y: 18, w: 25, h: 22, dx: 12, dy: -7 };
  return { x: 18, y: 19, w: 27, h: 22, dx: 11, dy: -6 };
}

function detailPaths(kind: IconKind, shape: ReturnType<typeof baseShape>) {
  const { x, y, w, h, dx, dy } = shape;
  if (kind === "drawer") {
    const y1 = y + h * 0.34;
    const y2 = y + h * 0.66;
    return [
      `M${x + 3} ${y1.toFixed(1)} L${x + w - 3} ${y1.toFixed(1)}`,
      `M${x + 3} ${y2.toFixed(1)} L${x + w - 3} ${y2.toFixed(1)}`,
      `M${x + w / 2 - 4} ${(y + h * 0.2).toFixed(1)} L${x + w / 2 + 4} ${(y + h * 0.2).toFixed(1)}`,
      `M${x + w / 2 - 4} ${(y + h * 0.51).toFixed(1)} L${x + w / 2 + 4} ${(y + h * 0.51).toFixed(1)}`,
      `M${x + w / 2 - 4} ${(y + h * 0.82).toFixed(1)} L${x + w / 2 + 4} ${(y + h * 0.82).toFixed(1)}`
    ];
  }
  if (kind === "shelf") {
    return [
      `M${x + 3} ${y + h * 0.38} L${x + w - 3} ${y + h * 0.38}`,
      `M${x + 3} ${y + h * 0.68} L${x + w - 3} ${y + h * 0.68}`
    ];
  }
  if (kind === "sink") {
    return [
      `M${x + dx + 7} ${y + dy + 5} C${x + dx + 11} ${y + dy + 2}, ${x + dx + 20} ${y + dy + 2}, ${x + dx + 23} ${y + dy + 6}`,
      `M${x + dx + 12} ${y + dy + 6} L${x + dx + 18} ${y + dy + 6}`
    ];
  }
  if (kind === "appliance") {
    return [
      `M${x + 4} ${y + 5} L${x + w - 4} ${y + 5} L${x + w - 4} ${y + h - 4} L${x + 4} ${y + h - 4} Z`,
      `M${x + w - 7} ${y + 10} L${x + w - 7} ${y + h - 10}`
    ];
  }
  if (kind === "corner") {
    return [
      `M${x + w * 0.45} ${y} L${x + w * 0.45} ${y + h}`,
      `M${x + w * 0.45} ${y} L${x + w * 0.45 + dx} ${y + dy}`,
      `M${x + w + 4} ${y + 4} L${x + w + dx - 3} ${y + dy + 4}`
    ];
  }
  return [
    `M${x + w / 2} ${y + 4} L${x + w / 2} ${y + h - 3}`,
    `M${x + w / 2 - 4} ${y + h * 0.52} L${x + w / 2 + 4} ${y + h * 0.52}`
  ];
}

export function createAxonometricLineSvgFromObject(
  root: THREE.Object3D,
  opts: { width?: number; height?: number; hints?: IconHints } = {}
) {
  const width = opts.width ?? 64;
  const height = opts.height ?? 52;
  const kind = resolveKind(root, opts.hints ?? {});
  const shape = baseShape(kind);
  const d = [...pathBox(shape.x, shape.y, shape.w, shape.h, shape.dx, shape.dy), ...detailPaths(kind, shape)].join(" ");
  return `<svg viewBox="0 0 ${width} ${height}" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
