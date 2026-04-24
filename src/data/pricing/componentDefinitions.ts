import type { ComponentDefinition, ComponentType, MaterialPreview } from "./types";

function resolveComponentGeometryId(
  componentType: ComponentType,
  args: Pick<ComponentDefinition, "id" | "nominalLengthMm" | "nominalHeightMm">
): string {
  if (componentType === "runner") {
    const length = typeof args.nominalLengthMm === "number" ? Math.round(args.nominalLengthMm) : 400;
    return args.id.includes(".premium_softclose")
      ? `geo.runner.pair.${length}.premium_softclose`
      : `geo.runner.pair.${length}.standard`;
  }

  if (componentType === "handle") {
    if (args.id.includes(".profile.")) return "geo.handle.profile.standard";
    if (args.id.includes(".knob.")) return "geo.handle.knob.round";
    const length = typeof args.nominalLengthMm === "number" ? Math.round(args.nominalLengthMm) : 160;
    return `geo.handle.bar.${length}`;
  }

  if (componentType === "leg") {
    const height = typeof args.nominalHeightMm === "number" ? Math.round(args.nominalHeightMm) : 100;
    return `geo.leg.adjustable.${height}`;
  }

  if (componentType === "plinth_clip") {
    return args.id.includes(".heavy") ? "geo.plinth_clip.heavy" : "geo.plinth_clip.standard";
  }

  if (componentType === "fastener") {
    if (args.id.includes("confirmat")) return "geo.fastener.confirmat";
    if (args.id.includes("euro_screw")) return "geo.fastener.euro_screw";
    if (args.id.includes("drawer_fixing_screw")) return "geo.fastener.drawer_fixing_screw";
    if (args.id.includes("handle_screw")) return "geo.fastener.handle_screw";
    if (args.id.includes("shelf_pin")) return "geo.fastener.shelf_pin";
    return "geo.fastener.carcass_standard";
  }

  if (componentType === "hinge") {
    if (args.id.includes(".corner.")) return "geo.hinge.corner.45.softclose";
    if (args.id.includes(".wide_angle.")) return "geo.hinge.wide_angle.155.softclose";
    return args.id.includes(".softclose") ? "geo.hinge.clip_on.softclose" : "geo.hinge.clip_on.standard";
  }

  if (componentType === "push_system") {
    return args.id.includes(".magnetic.") ? "geo.push_to_open.magnetic" : "geo.push_to_open.standard";
  }

  if (componentType === "hanging_bracket") {
    return args.id.includes(".heavy") ? "geo.hanging_bracket.wall.heavy" : "geo.hanging_bracket.wall.standard";
  }

  if (componentType === "shelf_support") {
    return args.id.includes(".glass.") ? "geo.shelf_support.glass" : "geo.shelf_support.standard";
  }

  if (componentType === "drawer_insert") {
    return args.id.includes(".premium.") ? "geo.drawer_insert.cutlery.premium" : "geo.drawer_insert.cutlery.standard";
  }

  if (componentType === "lift_up") {
    const length = typeof args.nominalLengthMm === "number" ? Math.round(args.nominalLengthMm) : 600;
    return args.id.includes(".softclose.") ? `geo.lift_up.${length}.softclose` : `geo.lift_up.${length}.standard`;
  }

  if (componentType === "waste_system") {
    const length = typeof args.nominalLengthMm === "number" ? Math.round(args.nominalLengthMm) : 400;
    return `geo.waste_bin.pull_out.${length}.standard`;
  }

  const length = typeof args.nominalLengthMm === "number" ? Math.round(args.nominalLengthMm) : 500;
  return `geo.led_profile.drawer.${length}`;
}

function createComponentPreview(componentType: ComponentType, color: string): MaterialPreview {
  const normalizedColor = color.trim().toLowerCase();
  const metallicTypes = new Set<ComponentType>([
    "runner",
    "handle",
    "leg",
    "plinth_clip",
    "fastener",
    "hinge",
    "hanging_bracket",
    "shelf_support",
    "lift_up"
  ]);

  const base: MaterialPreview = metallicTypes.has(componentType)
    ? { colorHex: "#a7adb8", roughness: 0.32, metalness: 0.8 }
    : { colorHex: "#8b929f", roughness: 0.55, metalness: 0.2 };

  if (normalizedColor.includes("black")) {
    return { colorHex: "#1e232b", roughness: 0.45, metalness: 0.55 };
  }

  if (normalizedColor.includes("white")) {
    return metallicTypes.has(componentType)
      ? { colorHex: "#eceff3", roughness: 0.38, metalness: 0.55 }
      : { colorHex: "#f2f3ef", roughness: 0.62, metalness: 0.08 };
  }

  if (normalizedColor.includes("brass")) {
    return { colorHex: "#b68a3f", roughness: 0.28, metalness: 0.9 };
  }

  if (normalizedColor.includes("inox") || normalizedColor.includes("stainless")) {
    return { colorHex: "#b3bac3", roughness: 0.24, metalness: 0.9 };
  }

  if (normalizedColor.includes("aluminium") || normalizedColor.includes("aluminum")) {
    return { colorHex: "#a8adb5", roughness: 0.26, metalness: 0.86 };
  }

  if (normalizedColor.includes("nickel")) {
    return { colorHex: "#aeb3bb", roughness: 0.25, metalness: 0.88 };
  }

  if (normalizedColor.includes("galvanized")) {
    return { colorHex: "#9ca3ad", roughness: 0.3, metalness: 0.82 };
  }

  if (normalizedColor.includes("grey") || normalizedColor.includes("gray")) {
    return metallicTypes.has(componentType)
      ? { colorHex: "#757d88", roughness: 0.34, metalness: 0.72 }
      : { colorHex: "#7b8089", roughness: 0.56, metalness: 0.18 };
  }

  if (normalizedColor.includes("anthracite")) {
    return { colorHex: "#474d57", roughness: 0.4, metalness: 0.58 };
  }

  if (normalizedColor.includes("warm white")) {
    return { colorHex: "#f4f0de", roughness: 0.6, metalness: 0.06 };
  }

  return base;
}

function defineComponent(
  componentType: ComponentType,
  args: Omit<
    ComponentDefinition,
    "entityType" | "componentType" | "geometryId" | "pricingBasis" | "pricingUnit" | "isActive" | "preview"
  >
): ComponentDefinition {
  return {
    ...args,
    entityType: "component",
    componentType,
    geometryId: resolveComponentGeometryId(componentType, args),
    pricingBasis: "piece",
    pricingUnit: "pcs",
    isActive: true,
    preview: createComponentPreview(componentType, args.color)
  };
}

export const componentDefinitions: ComponentDefinition[] = [
  defineComponent("runner", {
    id: "cmp.runner.pair.300.standard",
    name: "Runner Pair 300 Standard",
    displayName: "Runner Pair 300 mm Standard",
    brand: "DemoLine",
    series: "StandardBox",
    variant: "300 mm pair",
    color: "Galvanized",
    defaultQuantity: 1,
    nominalLengthMm: 300,
    recommendedUse: "Basic drawer systems for shallow drawers up to 300 mm nominal length.",
    tags: ["runner", "pair", "standard", "300", "drawer"]
  }),
  defineComponent("runner", {
    id: "cmp.runner.pair.350.standard",
    name: "Runner Pair 350 Standard",
    displayName: "Runner Pair 350 mm Standard",
    brand: "DemoLine",
    series: "StandardBox",
    variant: "350 mm pair",
    color: "Galvanized",
    defaultQuantity: 1,
    nominalLengthMm: 350,
    recommendedUse: "Standard drawer runner set for compact base modules.",
    tags: ["runner", "pair", "standard", "350", "drawer"]
  }),
  defineComponent("runner", {
    id: "cmp.runner.pair.400.standard",
    name: "Runner Pair 400 Standard",
    displayName: "Runner Pair 400 mm Standard",
    brand: "DemoLine",
    series: "StandardBox",
    variant: "400 mm pair",
    color: "Galvanized",
    defaultQuantity: 1,
    nominalLengthMm: 400,
    recommendedUse: "Default standard runner pair for mid-depth kitchen drawers.",
    tags: ["runner", "pair", "standard", "400", "default"]
  }),
  defineComponent("runner", {
    id: "cmp.runner.pair.450.standard",
    name: "Runner Pair 450 Standard",
    displayName: "Runner Pair 450 mm Standard",
    brand: "DemoLine",
    series: "StandardBox",
    variant: "450 mm pair",
    color: "Galvanized",
    defaultQuantity: 1,
    nominalLengthMm: 450,
    recommendedUse: "Standard runner pair for deeper kitchen drawer boxes.",
    tags: ["runner", "pair", "standard", "450", "drawer"]
  }),
  defineComponent("runner", {
    id: "cmp.runner.pair.500.standard",
    name: "Runner Pair 500 Standard",
    displayName: "Runner Pair 500 mm Standard",
    brand: "DemoLine",
    series: "StandardBox",
    variant: "500 mm pair",
    color: "Galvanized",
    defaultQuantity: 1,
    nominalLengthMm: 500,
    recommendedUse: "Longer standard runner set for large and utility drawers.",
    tags: ["runner", "pair", "standard", "500", "deep-drawer"]
  }),
  defineComponent("runner", {
    id: "cmp.runner.pair.400.premium_softclose",
    name: "Runner Pair 400 Premium Softclose",
    displayName: "Runner Pair 400 mm Premium Softclose",
    brand: "MotionPro",
    series: "SilentSlide",
    variant: "400 mm softclose pair",
    color: "Galvanized",
    defaultQuantity: 1,
    nominalLengthMm: 400,
    recommendedUse: "Premium drawer set for soft-close kitchen drawer fronts.",
    notes: ["Full extension soft-close runner pair."],
    tags: ["runner", "pair", "softclose", "premium", "400"]
  }),
  defineComponent("runner", {
    id: "cmp.runner.pair.450.premium_softclose",
    name: "Runner Pair 450 Premium Softclose",
    displayName: "Runner Pair 450 mm Premium Softclose",
    brand: "MotionPro",
    series: "SilentSlide",
    variant: "450 mm softclose pair",
    color: "Galvanized",
    defaultQuantity: 1,
    nominalLengthMm: 450,
    recommendedUse: "Premium soft-close runner set for deeper drawer modules.",
    notes: ["Full extension soft-close runner pair."],
    tags: ["runner", "pair", "softclose", "premium", "450"]
  }),
  defineComponent("runner", {
    id: "cmp.runner.pair.500.premium_softclose",
    name: "Runner Pair 500 Premium Softclose",
    displayName: "Runner Pair 500 mm Premium Softclose",
    brand: "MotionPro",
    series: "SilentSlide",
    variant: "500 mm softclose pair",
    color: "Galvanized",
    defaultQuantity: 1,
    nominalLengthMm: 500,
    recommendedUse: "Premium long runner set for wide drawers and utility storage.",
    notes: ["Full extension soft-close runner pair."],
    tags: ["runner", "pair", "softclose", "premium", "500"]
  }),

  defineComponent("handle", {
    id: "cmp.handle.bar.160.black",
    name: "Bar Handle 160 Black",
    displayName: "Bar Handle 160 mm Black",
    brand: "Forma",
    series: "Barline",
    variant: "160 mm",
    color: "Black",
    defaultQuantity: 1,
    nominalLengthMm: 160,
    recommendedUse: "Standard black bar handle for slab fronts and drawer fronts.",
    tags: ["handle", "bar", "160", "black", "standard"]
  }),
  defineComponent("handle", {
    id: "cmp.handle.bar.160.inox",
    name: "Bar Handle 160 Inox",
    displayName: "Bar Handle 160 mm Inox",
    brand: "Forma",
    series: "Barline",
    variant: "160 mm",
    color: "Inox",
    defaultQuantity: 1,
    nominalLengthMm: 160,
    recommendedUse: "Stainless-look bar handle for mainstream kitchen fronts.",
    tags: ["handle", "bar", "160", "inox", "standard"]
  }),
  defineComponent("handle", {
    id: "cmp.handle.bar.160.brass",
    name: "Bar Handle 160 Brass",
    displayName: "Bar Handle 160 mm Brass",
    brand: "Forma",
    series: "Barline",
    variant: "160 mm",
    color: "Brass",
    defaultQuantity: 1,
    nominalLengthMm: 160,
    recommendedUse: "Premium warm-metal bar handle for accent kitchens.",
    tags: ["handle", "bar", "160", "brass", "premium"]
  }),
  defineComponent("handle", {
    id: "cmp.handle.bar.192.black",
    name: "Bar Handle 192 Black",
    displayName: "Bar Handle 192 mm Black",
    brand: "Forma",
    series: "Barline",
    variant: "192 mm",
    color: "Black",
    defaultQuantity: 1,
    nominalLengthMm: 192,
    recommendedUse: "Longer black bar handle for wide drawer fronts.",
    tags: ["handle", "bar", "192", "black", "wide"]
  }),
  defineComponent("handle", {
    id: "cmp.handle.bar.192.inox",
    name: "Bar Handle 192 Inox",
    displayName: "Bar Handle 192 mm Inox",
    brand: "Forma",
    series: "Barline",
    variant: "192 mm",
    color: "Inox",
    defaultQuantity: 1,
    nominalLengthMm: 192,
    recommendedUse: "Longer inox bar handle for wider drawers and integrated layouts.",
    tags: ["handle", "bar", "192", "inox", "wide"]
  }),
  defineComponent("handle", {
    id: "cmp.handle.bar.192.brass",
    name: "Bar Handle 192 Brass",
    displayName: "Bar Handle 192 mm Brass",
    brand: "Forma",
    series: "Barline",
    variant: "192 mm",
    color: "Brass",
    defaultQuantity: 1,
    nominalLengthMm: 192,
    recommendedUse: "Premium long brass handle for statement front compositions.",
    tags: ["handle", "bar", "192", "brass", "premium"]
  }),
  defineComponent("handle", {
    id: "cmp.handle.profile.aluminium",
    name: "Profile Handle Aluminium",
    displayName: "Profile Handle Aluminium",
    brand: "Linea",
    series: "Gola Mini",
    variant: "Aluminium profile",
    color: "Aluminium",
    defaultQuantity: 1,
    recommendedUse: "Minimalist profile handle for handle-less style kitchens.",
    notes: ["Supplied as cut-to-length profile in demo catalog as a single fitting."],
    tags: ["handle", "profile", "aluminium", "minimal", "premium"]
  }),
  defineComponent("handle", {
    id: "cmp.handle.profile.black",
    name: "Profile Handle Black",
    displayName: "Profile Handle Black",
    brand: "Linea",
    series: "Gola Mini",
    variant: "Black profile",
    color: "Black",
    defaultQuantity: 1,
    recommendedUse: "Dark minimalist profile handle for modern supermat fronts.",
    notes: ["Supplied as cut-to-length profile in demo catalog as a single fitting."],
    tags: ["handle", "profile", "black", "minimal", "modern"]
  }),
  defineComponent("handle", {
    id: "cmp.handle.knob.round.black",
    name: "Knob Handle Round Black",
    displayName: "Knob Handle Round Black",
    brand: "Forma",
    series: "Dot",
    variant: "Round knob",
    color: "Black",
    defaultQuantity: 1,
    recommendedUse: "Compact round knob for smaller fronts and accent furniture.",
    tags: ["handle", "knob", "round", "black", "compact"]
  }),
  defineComponent("handle", {
    id: "cmp.handle.knob.round.brass",
    name: "Knob Handle Round Brass",
    displayName: "Knob Handle Round Brass",
    brand: "Forma",
    series: "Dot",
    variant: "Round knob",
    color: "Brass",
    defaultQuantity: 1,
    recommendedUse: "Decorative brass knob for classic and premium fronts.",
    tags: ["handle", "knob", "round", "brass", "classic"]
  }),

  defineComponent("leg", {
    id: "cmp.leg.adjustable.100.black",
    name: "Adjustable Leg 100 Black",
    displayName: "Adjustable Leg 100 mm Black",
    brand: "BaseTech",
    series: "Level",
    variant: "100 mm adjustable",
    color: "Black",
    defaultQuantity: 1,
    nominalHeightMm: 100,
    recommendedUse: "Base cabinet support leg for standard plinth construction.",
    tags: ["leg", "adjustable", "100", "black", "base"]
  }),
  defineComponent("leg", {
    id: "cmp.leg.adjustable.100.white",
    name: "Adjustable Leg 100 White",
    displayName: "Adjustable Leg 100 mm White",
    brand: "BaseTech",
    series: "Level",
    variant: "100 mm adjustable",
    color: "White",
    defaultQuantity: 1,
    nominalHeightMm: 100,
    recommendedUse: "White support leg for light carcass interiors and open base details.",
    tags: ["leg", "adjustable", "100", "white", "base"]
  }),
  defineComponent("leg", {
    id: "cmp.leg.adjustable.150.black",
    name: "Adjustable Leg 150 Black",
    displayName: "Adjustable Leg 150 mm Black",
    brand: "BaseTech",
    series: "Level",
    variant: "150 mm adjustable",
    color: "Black",
    defaultQuantity: 1,
    nominalHeightMm: 150,
    recommendedUse: "Higher support leg for raised plinths and utility cabinets.",
    tags: ["leg", "adjustable", "150", "black", "utility"]
  }),
  defineComponent("leg", {
    id: "cmp.leg.adjustable.150.inox",
    name: "Adjustable Leg 150 Inox",
    displayName: "Adjustable Leg 150 mm Inox",
    brand: "BaseTech",
    series: "Level",
    variant: "150 mm adjustable",
    color: "Inox",
    defaultQuantity: 1,
    nominalHeightMm: 150,
    recommendedUse: "Decorative metallic leg for semi-exposed plinth-free installations.",
    tags: ["leg", "adjustable", "150", "inox", "decorative"]
  }),

  defineComponent("plinth_clip", {
    id: "cmp.clip.plinth.standard",
    name: "Plinth Clip Standard",
    displayName: "Plinth Clip Standard",
    brand: "BaseTech",
    series: "ClipFix",
    variant: "Standard clip",
    color: "Black",
    defaultQuantity: 1,
    recommendedUse: "Standard clip for fixing plinth panels to adjustable legs.",
    tags: ["plinth", "clip", "standard", "base", "mounting"]
  }),
  defineComponent("plinth_clip", {
    id: "cmp.clip.plinth.heavy",
    name: "Plinth Clip Heavy",
    displayName: "Plinth Clip Heavy Duty",
    brand: "BaseTech",
    series: "ClipFix",
    variant: "Heavy-duty clip",
    color: "Black",
    defaultQuantity: 1,
    recommendedUse: "Stronger clip for larger plinth sections and transport-stable assemblies.",
    tags: ["plinth", "clip", "heavy", "base", "mounting"]
  }),

  defineComponent("fastener", {
    id: "cmp.fastener.carcass.standard",
    name: "Carcass Fastener Standard",
    displayName: "Carcass Fastener Standard",
    brand: "FixPro",
    series: "CabinetCore",
    variant: "Standard carcass fixing",
    color: "Zinc",
    defaultQuantity: 1,
    recommendedUse: "Generic carcass assembly fastener counted per piece in demo calculations.",
    tags: ["fastener", "carcass", "standard", "assembly", "screw"]
  }),
  defineComponent("fastener", {
    id: "cmp.fastener.confirmat.7x50",
    name: "Confirmat 7x50",
    displayName: "Confirmat Screw 7x50",
    brand: "FixPro",
    series: "Confirmat",
    variant: "7x50 mm",
    color: "Zinc",
    defaultQuantity: 1,
    nominalLengthMm: 50,
    recommendedUse: "Board-to-board structural carcass connections.",
    tags: ["fastener", "confirmat", "7x50", "carcass", "structural"]
  }),
  defineComponent("fastener", {
    id: "cmp.fastener.shelf_pin.standard",
    name: "Shelf Pin Standard",
    displayName: "Shelf Pin Standard",
    brand: "FixPro",
    series: "ShelfFix",
    variant: "5 mm pin",
    color: "Nickel",
    defaultQuantity: 1,
    recommendedUse: "Adjustable shelf support pin for standard drilled shelf systems.",
    tags: ["fastener", "shelf-pin", "nickel", "shelf", "support"]
  }),
  defineComponent("fastener", {
    id: "cmp.fastener.handle_screw.m4",
    name: "Handle Screw M4",
    displayName: "Handle Screw M4",
    brand: "FixPro",
    series: "HandleFix",
    variant: "M4 machine screw",
    color: "Zinc",
    defaultQuantity: 1,
    recommendedUse: "Standard fixing screw for bar and knob handles.",
    tags: ["fastener", "handle", "m4", "screw", "front"]
  }),
  defineComponent("fastener", {
    id: "cmp.fastener.euro_screw.6_3x13",
    name: "Euro Screw 6.3x13",
    displayName: "Euro Screw 6.3x13",
    brand: "FixPro",
    series: "EuroLine",
    variant: "6.3x13 mm",
    color: "Zinc",
    defaultQuantity: 1,
    nominalLengthMm: 13,
    recommendedUse: "Hinge plates, runners and accessory mounting in pre-drilled system holes.",
    tags: ["fastener", "euro-screw", "6.3x13", "mounting", "system"]
  }),
  defineComponent("fastener", {
    id: "cmp.fastener.drawer_fixing_screw.3_5x16",
    name: "Drawer Fixing Screw 3.5x16",
    displayName: "Drawer Fixing Screw 3.5x16",
    brand: "FixPro",
    series: "DrawerFix",
    variant: "3.5x16 mm",
    color: "Zinc",
    defaultQuantity: 1,
    nominalLengthMm: 16,
    recommendedUse: "General screw for drawer runner and drawer part fixing.",
    tags: ["fastener", "drawer", "3.5x16", "runner", "mounting"]
  }),

  defineComponent("hinge", {
    id: "cmp.hinge.clip_on.standard",
    name: "Clip-On Hinge Standard",
    displayName: "Clip-On Hinge Standard",
    brand: "HingeWorks",
    series: "Clip",
    variant: "110 degree standard",
    color: "Nickel",
    defaultQuantity: 1,
    recommendedUse: "Basic hinge for standard kitchen doors without damping.",
    tags: ["hinge", "clip-on", "standard", "110", "door"]
  }),
  defineComponent("hinge", {
    id: "cmp.hinge.clip_on.softclose",
    name: "Clip-On Hinge Softclose",
    displayName: "Clip-On Hinge Softclose",
    brand: "HingeWorks",
    series: "Clip",
    variant: "110 degree softclose",
    color: "Nickel",
    defaultQuantity: 1,
    recommendedUse: "Standard soft-close hinge for premium kitchen doors.",
    tags: ["hinge", "clip-on", "softclose", "110", "door"]
  }),
  defineComponent("hinge", {
    id: "cmp.hinge.corner.45.softclose",
    name: "Corner Hinge 45 Softclose",
    displayName: "Corner Hinge 45 Degree Softclose",
    brand: "HingeWorks",
    series: "Angle",
    variant: "45 degree softclose",
    color: "Nickel",
    defaultQuantity: 1,
    recommendedUse: "Angled hinge for corner door applications.",
    tags: ["hinge", "corner", "45", "softclose", "door"]
  }),
  defineComponent("hinge", {
    id: "cmp.hinge.wide_angle.155.softclose",
    name: "Wide Angle Hinge 155 Softclose",
    displayName: "Wide Angle Hinge 155 Degree Softclose",
    brand: "HingeWorks",
    series: "Wide",
    variant: "155 degree softclose",
    color: "Nickel",
    defaultQuantity: 1,
    recommendedUse: "Wide opening hinge for pull-out adjacent doors and special access doors.",
    tags: ["hinge", "wide-angle", "155", "softclose", "premium"]
  }),
  defineComponent("hinge", {
    id: "cmp.hinge.fridge_integrated.softclose",
    name: "Integrated Fridge Hinge Softclose",
    displayName: "Integrated Fridge Hinge Softclose",
    brand: "HingeWorks",
    series: "Fridge",
    variant: "integrated appliance softclose",
    color: "Nickel",
    defaultQuantity: 1,
    recommendedUse:
      "Integrated refrigerator door hinge for fridge-front applications where the hinge assembly is supplied with the appliance system.",
    tags: ["hinge", "fridge", "integrated", "softclose", "appliance"]
  }),

  defineComponent("push_system", {
    id: "cmp.push_to_open.standard.grey",
    name: "Push-To-Open Standard Grey",
    displayName: "Push-To-Open Standard Grey",
    brand: "MotionPro",
    series: "Push",
    variant: "Standard mechanical",
    color: "Grey",
    defaultQuantity: 1,
    recommendedUse: "Basic push opener for handle-less door fronts.",
    tags: ["push", "push-to-open", "grey", "mechanical", "handle-less"]
  }),
  defineComponent("push_system", {
    id: "cmp.push_to_open.magnetic.white",
    name: "Push-To-Open Magnetic White",
    displayName: "Push-To-Open Magnetic White",
    brand: "MotionPro",
    series: "PushMag",
    variant: "Magnetic",
    color: "White",
    defaultQuantity: 1,
    recommendedUse: "Magnetic push opener for premium handle-less doors.",
    tags: ["push", "push-to-open", "magnetic", "white", "premium"]
  }),

  defineComponent("hanging_bracket", {
    id: "cmp.hanging_bracket.wall.standard",
    name: "Hanging Bracket Wall Standard",
    displayName: "Wall Hanging Bracket Standard",
    brand: "WallFix",
    series: "Cabinet Hang",
    variant: "Standard bracket",
    color: "Zinc",
    defaultQuantity: 1,
    recommendedUse: "Standard hidden hanging bracket for upper cabinets.",
    tags: ["hanging-bracket", "wall", "standard", "upper-cabinet", "mounting"]
  }),
  defineComponent("hanging_bracket", {
    id: "cmp.hanging_bracket.wall.heavy",
    name: "Hanging Bracket Wall Heavy",
    displayName: "Wall Hanging Bracket Heavy Duty",
    brand: "WallFix",
    series: "Cabinet Hang",
    variant: "Heavy-duty bracket",
    color: "Zinc",
    defaultQuantity: 1,
    recommendedUse: "Higher-load hanging bracket for wide wall modules and pantry accessories.",
    tags: ["hanging-bracket", "wall", "heavy", "upper-cabinet", "premium"]
  }),

  defineComponent("shelf_support", {
    id: "cmp.shelf_support.standard.nickel",
    name: "Shelf Support Standard Nickel",
    displayName: "Shelf Support Standard Nickel",
    brand: "FixPro",
    series: "ShelfFit",
    variant: "Standard",
    color: "Nickel",
    defaultQuantity: 4,
    recommendedUse: "Standard shelf support used in carcass shelf drilling systems.",
    tags: ["shelf-support", "nickel", "standard", "shelf", "support"]
  }),
  defineComponent("shelf_support", {
    id: "cmp.shelf_support.glass.nickel",
    name: "Shelf Support Glass Nickel",
    displayName: "Shelf Support Glass Nickel",
    brand: "FixPro",
    series: "ShelfFit",
    variant: "Glass shelf",
    color: "Nickel",
    defaultQuantity: 4,
    recommendedUse: "Specialized support for glass shelves and display cabinets.",
    tags: ["shelf-support", "glass", "nickel", "display", "support"]
  }),

  defineComponent("drawer_insert", {
    id: "cmp.drawer_insert.cutlery.standard.grey",
    name: "Cutlery Insert Standard Grey",
    displayName: "Drawer Insert Cutlery Standard Grey",
    brand: "OrganizeIt",
    series: "Tray",
    variant: "Standard cutlery tray",
    color: "Grey",
    defaultQuantity: 1,
    recommendedUse: "Basic grey organizer insert for standard drawer widths.",
    tags: ["drawer-insert", "cutlery", "grey", "standard", "organizer"]
  }),
  defineComponent("drawer_insert", {
    id: "cmp.drawer_insert.cutlery.premium.anthracite",
    name: "Cutlery Insert Premium Anthracite",
    displayName: "Drawer Insert Cutlery Premium Anthracite",
    brand: "OrganizeIt",
    series: "Tray Pro",
    variant: "Premium cutlery tray",
    color: "Anthracite",
    defaultQuantity: 1,
    recommendedUse: "Premium anthracite organizer with deeper compartments and cleaner finish.",
    tags: ["drawer-insert", "cutlery", "anthracite", "premium", "organizer"]
  }),

  defineComponent("lift_up", {
    id: "cmp.lift_up.standard.600",
    name: "Lift-Up Standard 600",
    displayName: "Lift-Up System Standard 600 mm",
    brand: "LiftMotion",
    series: "Avent",
    variant: "Standard 600 mm",
    color: "Grey",
    defaultQuantity: 1,
    nominalLengthMm: 600,
    recommendedUse: "Basic lift-up fitting for top flap wall units.",
    tags: ["lift-up", "standard", "600", "wall-unit", "flap"]
  }),
  defineComponent("lift_up", {
    id: "cmp.lift_up.softclose.600",
    name: "Lift-Up Softclose 600",
    displayName: "Lift-Up System Softclose 600 mm",
    brand: "LiftMotion",
    series: "Avent Silent",
    variant: "Softclose 600 mm",
    color: "Grey",
    defaultQuantity: 1,
    nominalLengthMm: 600,
    recommendedUse: "Premium flap fitting with soft-close and assisted opening.",
    tags: ["lift-up", "softclose", "600", "wall-unit", "premium"]
  }),

  defineComponent("waste_system", {
    id: "cmp.waste_bin.pull_out.400.standard",
    name: "Waste Bin Pull-Out 400 Standard",
    displayName: "Waste Bin Pull-Out 400 mm Standard",
    brand: "OrganizeIt",
    series: "EcoPull",
    variant: "400 mm base",
    color: "Grey",
    defaultQuantity: 1,
    nominalLengthMm: 400,
    recommendedUse: "Optional pull-out waste system for base sink and prep units.",
    tags: ["waste-system", "pull-out", "400", "optional", "base-unit"]
  }),
  defineComponent("lighting", {
    id: "cmp.led_profile.drawer.500.warmwhite",
    name: "LED Profile Drawer 500 Warm White",
    displayName: "LED Profile Drawer 500 mm Warm White",
    brand: "LightLine",
    series: "Glow",
    variant: "500 mm warm white",
    color: "Warm White",
    defaultQuantity: 1,
    nominalLengthMm: 500,
    recommendedUse: "Optional lighting accessory for premium drawer interiors and display modules.",
    tags: ["lighting", "led", "drawer", "500", "optional"]
  })
];

export function getComponentDefinitionById(id: string): ComponentDefinition | null {
  return componentDefinitions.find((component) => component.id === id) ?? null;
}
