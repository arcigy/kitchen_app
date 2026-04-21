import type { BoardFamily, EdgeFamily, MaterialDefinition, MaterialPreview, MaterialType } from "./types";

type SharedMaterialArgs = {
  id: string;
  name: string;
  displayName: string;
  category: string;
  baseMaterial: MaterialDefinition["baseMaterial"];
  decor: string;
  color: string;
  finish: string;
  availableThicknessesMm: number[];
  defaultThicknessMm: number;
  tags: string[];
  recommendedUse: string;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function resolvePreviewColor(args: Pick<SharedMaterialArgs, "decor" | "color" | "baseMaterial">): string {
  const token = `${args.decor} ${args.color}`.toLowerCase();

  if (token.includes("white marble")) return "#ebe7e1";
  if (token.includes("black stone")) return "#2f3137";
  if (token.includes("halifax oak")) return "#a97f57";
  if (token.includes("oak natural")) return "#caa272";
  if (token.includes("walnut")) return "#6d513f";
  if (token.includes("cashmere")) return "#cdc0b1";
  if (token.includes("sand beige")) return "#d8c4ac";
  if (token.includes("graphite")) return "#5a6068";
  if (token.includes("anthracite")) return "#4c5159";
  if (token.includes("olive")) return "#6f7757";
  if (token.includes("blue")) return "#3f628f";
  if (token.includes("green")) return "#6b8f62";
  if (token.includes("grey")) return "#c8ccd1";
  if (token.includes("black")) return "#23262c";
  if (token.includes("birch")) return "#dbc29d";
  if (token.includes("oak")) return "#c69a69";
  if (token.includes("white")) return "#f3f3ef";

  switch (args.baseMaterial) {
    case "hdf":
      return "#d9dde2";
    case "mdf":
      return "#d8d2c9";
    case "plywood":
    case "multiplex":
      return "#d3b58f";
    case "laminate":
      return "#b08e6d";
    case "compact":
      return "#f1f1ee";
    case "veneer":
      return "#b48a61";
    case "abs":
      return "#d7d9de";
    case "dtd":
    case "acrylic":
    default:
      return "#cfcfcf";
  }
}

function resolvePreviewAppearance(args: Pick<SharedMaterialArgs, "decor" | "color" | "finish" | "baseMaterial">): MaterialPreview {
  const finish = args.finish.toLowerCase();
  const roughness =
    finish.includes("high gloss")
      ? 0.16
      : finish.includes("compact")
        ? 0.38
        : finish.includes("supermat")
          ? 0.9
          : finish.includes("veneer")
            ? 0.74
            : finish.includes("woodgrain")
              ? 0.82
              : finish.includes("stone")
                ? 0.68
                : finish.includes("painted")
                  ? 0.72
                  : finish.includes("satin")
                    ? 0.62
                    : 0.78;
  const metalness = finish.includes("high gloss") ? 0.04 : finish.includes("compact") ? 0.06 : 0.02;

  return {
    colorHex: resolvePreviewColor(args),
    roughness: clamp(roughness, 0, 1),
    metalness: clamp(metalness, 0, 1)
  };
}

function defineBoard(
  boardFamily: BoardFamily,
  args: SharedMaterialArgs & {
    grainDirectionRelevant: boolean;
  }
): MaterialDefinition {
  return {
    id: args.id,
    entityType: "material",
    materialType: "board",
    name: args.name,
    displayName: args.displayName,
    category: args.category,
    baseMaterial: args.baseMaterial,
    decor: args.decor,
    color: args.color,
    finish: args.finish,
    pricingBasis: "sheet_area",
    pricingUnit: "m2",
    availableThicknessesMm: [...args.availableThicknessesMm],
    defaultThicknessMm: args.defaultThicknessMm,
    isActive: true,
    tags: args.tags,
    preview: resolvePreviewAppearance(args),
    boardFamily,
    recommendedUse: args.recommendedUse,
    grainDirectionRelevant: args.grainDirectionRelevant
  };
}

function defineEdge(
  edgeFamily: EdgeFamily,
  args: SharedMaterialArgs & {
    recommendedBoardMatch: string;
  }
): MaterialDefinition {
  return {
    id: args.id,
    entityType: "material",
    materialType: "edge",
    name: args.name,
    displayName: args.displayName,
    category: args.category,
    baseMaterial: args.baseMaterial,
    decor: args.decor,
    color: args.color,
    finish: args.finish,
    pricingBasis: "linear_length",
    pricingUnit: "lm",
    availableThicknessesMm: [...args.availableThicknessesMm],
    defaultThicknessMm: args.defaultThicknessMm,
    isActive: true,
    tags: args.tags,
    preview: resolvePreviewAppearance(args),
    edgeFamily,
    recommendedUse: args.recommendedUse,
    recommendedBoardMatch: args.recommendedBoardMatch
  };
}

export const materialDefinitions: MaterialDefinition[] = [
  defineBoard("body", {
    id: "mat.board.body.dtd.white.18",
    name: "DTD White 18",
    displayName: "DTD White 18 mm",
    category: "Body Boards",
    baseMaterial: "dtd",
    decor: "White",
    color: "White",
    finish: "Melamine",
    availableThicknessesMm: [18, 25],
    defaultThicknessMm: 18,
    grainDirectionRelevant: false,
    recommendedUse: "Standard white carcass panels for base and tall modules.",
    tags: ["body", "carcass", "white", "melamine", "standard"]
  }),
  defineBoard("body", {
    id: "mat.board.body.dtd.grey.18",
    name: "DTD Grey 18",
    displayName: "DTD Grey 18 mm",
    category: "Body Boards",
    baseMaterial: "dtd",
    decor: "Grey",
    color: "Grey",
    finish: "Melamine",
    availableThicknessesMm: [18, 25],
    defaultThicknessMm: 18,
    grainDirectionRelevant: false,
    recommendedUse: "Neutral mid-grey carcass decor for contemporary kitchens.",
    tags: ["body", "carcass", "grey", "melamine", "modern"]
  }),
  defineBoard("body", {
    id: "mat.board.body.dtd.anthracite.18",
    name: "DTD Anthracite 18",
    displayName: "DTD Anthracite 18 mm",
    category: "Body Boards",
    baseMaterial: "dtd",
    decor: "Anthracite",
    color: "Anthracite",
    finish: "Melamine",
    availableThicknessesMm: [18, 25],
    defaultThicknessMm: 18,
    grainDirectionRelevant: false,
    recommendedUse: "Premium dark carcass board for modern modules and contrasts.",
    tags: ["body", "carcass", "anthracite", "melamine", "premium"]
  }),
  defineBoard("body", {
    id: "mat.board.body.dtd.black.18",
    name: "DTD Black 18",
    displayName: "DTD Black 18 mm",
    category: "Body Boards",
    baseMaterial: "dtd",
    decor: "Black",
    color: "Black",
    finish: "Melamine",
    availableThicknessesMm: [18, 25],
    defaultThicknessMm: 18,
    grainDirectionRelevant: false,
    recommendedUse: "Accent carcass board for premium black interiors and open modules.",
    tags: ["body", "carcass", "black", "melamine", "accent"]
  }),
  defineBoard("body", {
    id: "mat.board.body.dtd.oak_natural.18",
    name: "DTD Oak Natural 18",
    displayName: "DTD Oak Natural 18 mm",
    category: "Body Boards",
    baseMaterial: "dtd",
    decor: "Oak Natural",
    color: "Oak",
    finish: "Woodgrain Melamine",
    availableThicknessesMm: [18, 25],
    defaultThicknessMm: 18,
    grainDirectionRelevant: true,
    recommendedUse: "Warm woodgrain carcass decor for visible side panels and shelving.",
    tags: ["body", "carcass", "oak", "woodgrain", "warm"]
  }),
  defineBoard("body", {
    id: "mat.board.body.dtd.halifax_oak.18",
    name: "DTD Halifax Oak 18",
    displayName: "DTD Halifax Oak 18 mm",
    category: "Body Boards",
    baseMaterial: "dtd",
    decor: "Halifax Oak",
    color: "Oak Brown",
    finish: "Textured Woodgrain",
    availableThicknessesMm: [18, 25],
    defaultThicknessMm: 18,
    grainDirectionRelevant: true,
    recommendedUse: "Premium textured oak decor for exposed carcass and design-driven modules.",
    tags: ["body", "carcass", "oak", "halifax", "premium"]
  }),
  defineBoard("body", {
    id: "mat.board.body.plywood.birch.18",
    name: "Plywood Birch 18",
    displayName: "Plywood Birch 18 mm",
    category: "Body Boards",
    baseMaterial: "plywood",
    decor: "Birch",
    color: "Light Birch",
    finish: "Natural Sanded",
    availableThicknessesMm: [15, 18, 21],
    defaultThicknessMm: 18,
    grainDirectionRelevant: true,
    recommendedUse: "Higher-end carcass and structural panels with visible layered edge aesthetic.",
    tags: ["body", "carcass", "plywood", "birch", "structural"]
  }),
  defineBoard("body", {
    id: "mat.board.body.moisture_resistant.green.18",
    name: "Moisture Resistant Green Board 18",
    displayName: "Moisture Resistant Green Board 18 mm",
    category: "Body Boards",
    baseMaterial: "mdf",
    decor: "Green Core",
    color: "Green",
    finish: "Raw Technical Board",
    availableThicknessesMm: [18, 22],
    defaultThicknessMm: 18,
    grainDirectionRelevant: false,
    recommendedUse: "Service zones, sink modules and humid kitchen areas requiring better moisture resistance.",
    tags: ["body", "carcass", "moisture-resistant", "green", "technical"]
  }),

  defineBoard("front", {
    id: "mat.board.front.mdf.white_supermat.19",
    name: "MDF White Supermat 19",
    displayName: "MDF White Supermat 19 mm",
    category: "Front Boards",
    baseMaterial: "mdf",
    decor: "White Supermat",
    color: "White",
    finish: "Supermat Lacquer",
    availableThicknessesMm: [18, 19, 22],
    defaultThicknessMm: 19,
    grainDirectionRelevant: false,
    recommendedUse: "Matte lacquered fronts for clean modern kitchens.",
    tags: ["front", "mdf", "white", "supermat", "lacquer"]
  }),
  defineBoard("front", {
    id: "mat.board.front.mdf.cashmere_supermat.19",
    name: "MDF Cashmere Supermat 19",
    displayName: "MDF Cashmere Supermat 19 mm",
    category: "Front Boards",
    baseMaterial: "mdf",
    decor: "Cashmere Supermat",
    color: "Cashmere",
    finish: "Supermat Lacquer",
    availableThicknessesMm: [18, 19, 22],
    defaultThicknessMm: 19,
    grainDirectionRelevant: false,
    recommendedUse: "Warm neutral front finish for premium kitchen door and drawer fronts.",
    tags: ["front", "mdf", "cashmere", "supermat", "premium"]
  }),
  defineBoard("front", {
    id: "mat.board.front.mdf.graphite_supermat.19",
    name: "MDF Graphite Supermat 19",
    displayName: "MDF Graphite Supermat 19 mm",
    category: "Front Boards",
    baseMaterial: "mdf",
    decor: "Graphite Supermat",
    color: "Graphite",
    finish: "Supermat Lacquer",
    availableThicknessesMm: [18, 19, 22],
    defaultThicknessMm: 19,
    grainDirectionRelevant: false,
    recommendedUse: "Dark supermat front board for contemporary minimal kitchens.",
    tags: ["front", "mdf", "graphite", "supermat", "dark"]
  }),
  defineBoard("front", {
    id: "mat.board.front.mdf.blue_supermat.19",
    name: "MDF Blue Supermat 19",
    displayName: "MDF Blue Supermat 19 mm",
    category: "Front Boards",
    baseMaterial: "mdf",
    decor: "Blue Supermat",
    color: "Blue",
    finish: "Supermat Lacquer",
    availableThicknessesMm: [18, 19, 22],
    defaultThicknessMm: 19,
    grainDirectionRelevant: false,
    recommendedUse: "Statement color front board for custom kitchens and islands.",
    tags: ["front", "mdf", "blue", "supermat", "statement"]
  }),
  defineBoard("front", {
    id: "mat.board.front.mdf.olive_supermat.19",
    name: "MDF Olive Supermat 19",
    displayName: "MDF Olive Supermat 19 mm",
    category: "Front Boards",
    baseMaterial: "mdf",
    decor: "Olive Supermat",
    color: "Olive",
    finish: "Supermat Lacquer",
    availableThicknessesMm: [18, 19, 22],
    defaultThicknessMm: 19,
    grainDirectionRelevant: false,
    recommendedUse: "Muted olive front board for warmer design concepts.",
    tags: ["front", "mdf", "olive", "supermat", "designer"]
  }),
  defineBoard("front", {
    id: "mat.board.front.mdf.sand_beige_supermat.19",
    name: "MDF Sand Beige Supermat 19",
    displayName: "MDF Sand Beige Supermat 19 mm",
    category: "Front Boards",
    baseMaterial: "mdf",
    decor: "Sand Beige Supermat",
    color: "Sand Beige",
    finish: "Supermat Lacquer",
    availableThicknessesMm: [18, 19, 22],
    defaultThicknessMm: 19,
    grainDirectionRelevant: false,
    recommendedUse: "Soft beige matte fronts for understated premium kitchens.",
    tags: ["front", "mdf", "beige", "supermat", "neutral"]
  }),
  defineBoard("front", {
    id: "mat.board.front.acrylic.white_gloss.18",
    name: "Acrylic Gloss White 18",
    displayName: "Acrylic Gloss White 18 mm",
    category: "Front Boards",
    baseMaterial: "acrylic",
    decor: "White Gloss",
    color: "White",
    finish: "High Gloss",
    availableThicknessesMm: [18, 19],
    defaultThicknessMm: 18,
    grainDirectionRelevant: false,
    recommendedUse: "High-gloss slab fronts for bright reflective kitchens.",
    tags: ["front", "acrylic", "white", "gloss", "high-gloss"]
  }),
  defineBoard("front", {
    id: "mat.board.front.acrylic.black_gloss.18",
    name: "Acrylic Gloss Black 18",
    displayName: "Acrylic Gloss Black 18 mm",
    category: "Front Boards",
    baseMaterial: "acrylic",
    decor: "Black Gloss",
    color: "Black",
    finish: "High Gloss",
    availableThicknessesMm: [18, 19],
    defaultThicknessMm: 18,
    grainDirectionRelevant: false,
    recommendedUse: "Reflective premium black fronts for dramatic kitchen compositions.",
    tags: ["front", "acrylic", "black", "gloss", "premium"]
  }),
  defineBoard("front", {
    id: "mat.board.front.veneer.oak_natural.19",
    name: "Veneer Oak Natural 19",
    displayName: "Veneer Oak Natural 19 mm",
    category: "Front Boards",
    baseMaterial: "veneer",
    decor: "Oak Natural",
    color: "Oak",
    finish: "Natural Veneer",
    availableThicknessesMm: [19, 22],
    defaultThicknessMm: 19,
    grainDirectionRelevant: true,
    recommendedUse: "Premium veneered fronts with visible grain continuity.",
    tags: ["front", "veneer", "oak", "natural", "premium"]
  }),
  defineBoard("front", {
    id: "mat.board.front.veneer.walnut.19",
    name: "Veneer Walnut 19",
    displayName: "Veneer Walnut 19 mm",
    category: "Front Boards",
    baseMaterial: "veneer",
    decor: "Walnut",
    color: "Walnut Brown",
    finish: "Natural Veneer",
    availableThicknessesMm: [19, 22],
    defaultThicknessMm: 19,
    grainDirectionRelevant: true,
    recommendedUse: "Dark premium veneer fronts for warm luxury kitchens.",
    tags: ["front", "veneer", "walnut", "premium", "woodgrain"]
  }),

  defineBoard("back", {
    id: "mat.board.back.hdf.white.6",
    name: "HDF White 6",
    displayName: "HDF White 6 mm",
    category: "Back Panels",
    baseMaterial: "hdf",
    decor: "White",
    color: "White",
    finish: "Painted Smooth",
    availableThicknessesMm: [6, 8],
    defaultThicknessMm: 6,
    grainDirectionRelevant: false,
    recommendedUse: "Standard white back panel for carcass backs and service closings.",
    tags: ["back", "hdf", "white", "standard", "back-panel"]
  }),
  defineBoard("back", {
    id: "mat.board.back.hdf.grey.6",
    name: "HDF Grey 6",
    displayName: "HDF Grey 6 mm",
    category: "Back Panels",
    baseMaterial: "hdf",
    decor: "Grey",
    color: "Grey",
    finish: "Painted Smooth",
    availableThicknessesMm: [6, 8],
    defaultThicknessMm: 6,
    grainDirectionRelevant: false,
    recommendedUse: "Grey back panel used with darker carcass interiors.",
    tags: ["back", "hdf", "grey", "standard", "back-panel"]
  }),
  defineBoard("back", {
    id: "mat.board.back.hdf.white.8",
    name: "HDF White 8",
    displayName: "HDF White 8 mm",
    category: "Back Panels",
    baseMaterial: "hdf",
    decor: "White",
    color: "White",
    finish: "Painted Smooth",
    availableThicknessesMm: [6, 8],
    defaultThicknessMm: 8,
    grainDirectionRelevant: false,
    recommendedUse: "Thicker white back panel for larger spans and premium stability.",
    tags: ["back", "hdf", "white", "8mm", "stiffened"]
  }),
  defineBoard("back", {
    id: "mat.board.back.hdf.grey.8",
    name: "HDF Grey 8",
    displayName: "HDF Grey 8 mm",
    category: "Back Panels",
    baseMaterial: "hdf",
    decor: "Grey",
    color: "Grey",
    finish: "Painted Smooth",
    availableThicknessesMm: [6, 8],
    defaultThicknessMm: 8,
    grainDirectionRelevant: false,
    recommendedUse: "Thicker grey back panel for dark interiors and premium builds.",
    tags: ["back", "hdf", "grey", "8mm", "premium"]
  }),

  defineBoard("drawer_box", {
    id: "mat.board.drawer_box.plywood.birch.13",
    name: "Plywood Birch 13",
    displayName: "Drawer Box Plywood Birch 13 mm",
    category: "Drawer Box Boards",
    baseMaterial: "plywood",
    decor: "Birch",
    color: "Light Birch",
    finish: "Natural Sanded",
    availableThicknessesMm: [13, 15],
    defaultThicknessMm: 13,
    grainDirectionRelevant: true,
    recommendedUse: "Standard premium drawer box side and front/back panel stock.",
    tags: ["drawer-box", "plywood", "birch", "premium", "drawer"]
  }),
  defineBoard("drawer_box", {
    id: "mat.board.drawer_box.plywood.grey.13",
    name: "Plywood Grey 13",
    displayName: "Drawer Box Plywood Grey 13 mm",
    category: "Drawer Box Boards",
    baseMaterial: "plywood",
    decor: "Grey",
    color: "Grey",
    finish: "Painted Plywood",
    availableThicknessesMm: [13, 15],
    defaultThicknessMm: 13,
    grainDirectionRelevant: true,
    recommendedUse: "Grey coated plywood for drawer boxes matched to modern grey interiors.",
    tags: ["drawer-box", "plywood", "grey", "drawer", "coated"]
  }),
  defineBoard("drawer_box", {
    id: "mat.board.drawer_box.plywood.white.13",
    name: "Plywood White 13",
    displayName: "Drawer Box Plywood White 13 mm",
    category: "Drawer Box Boards",
    baseMaterial: "plywood",
    decor: "White",
    color: "White",
    finish: "Painted Plywood",
    availableThicknessesMm: [13, 15],
    defaultThicknessMm: 13,
    grainDirectionRelevant: true,
    recommendedUse: "White finished plywood for bright drawer box interiors.",
    tags: ["drawer-box", "plywood", "white", "drawer", "painted"]
  }),
  defineBoard("drawer_box", {
    id: "mat.board.drawer_box.multiplex.birch.15",
    name: "Birch Multiplex 15",
    displayName: "Drawer Box Birch Multiplex 15 mm",
    category: "Drawer Box Boards",
    baseMaterial: "multiplex",
    decor: "Birch",
    color: "Birch",
    finish: "Natural Sanded",
    availableThicknessesMm: [13, 15],
    defaultThicknessMm: 15,
    grainDirectionRelevant: true,
    recommendedUse: "Heavier-duty drawer box construction for premium and utility drawers.",
    tags: ["drawer-box", "multiplex", "birch", "premium", "heavy-duty"]
  }),

  defineBoard("drawer_bottom", {
    id: "mat.board.drawer_bottom.hdf.white.8",
    name: "HDF White 8",
    displayName: "Drawer Bottom HDF White 8 mm",
    category: "Drawer Bottom Boards",
    baseMaterial: "hdf",
    decor: "White",
    color: "White",
    finish: "Painted Smooth",
    availableThicknessesMm: [6, 8],
    defaultThicknessMm: 8,
    grainDirectionRelevant: false,
    recommendedUse: "Economic drawer bottom panel for standard kitchen drawers.",
    tags: ["drawer-bottom", "hdf", "white", "drawer", "standard"]
  }),
  defineBoard("drawer_bottom", {
    id: "mat.board.drawer_bottom.hdf.grey.8",
    name: "HDF Grey 8",
    displayName: "Drawer Bottom HDF Grey 8 mm",
    category: "Drawer Bottom Boards",
    baseMaterial: "hdf",
    decor: "Grey",
    color: "Grey",
    finish: "Painted Smooth",
    availableThicknessesMm: [6, 8],
    defaultThicknessMm: 8,
    grainDirectionRelevant: false,
    recommendedUse: "Grey drawer bottom for dark interiors and drawer boxes.",
    tags: ["drawer-bottom", "hdf", "grey", "drawer", "dark"]
  }),
  defineBoard("drawer_bottom", {
    id: "mat.board.drawer_bottom.plywood.birch.8",
    name: "Plywood Birch 8",
    displayName: "Drawer Bottom Plywood Birch 8 mm",
    category: "Drawer Bottom Boards",
    baseMaterial: "plywood",
    decor: "Birch",
    color: "Birch",
    finish: "Natural Sanded",
    availableThicknessesMm: [6, 8, 10],
    defaultThicknessMm: 8,
    grainDirectionRelevant: true,
    recommendedUse: "Premium stronger drawer bottom for wider drawers and organizer inserts.",
    tags: ["drawer-bottom", "plywood", "birch", "premium", "stiff"]
  }),
  defineBoard("drawer_bottom", {
    id: "mat.board.drawer_bottom.hdf.anthracite.8",
    name: "HDF Anthracite 8",
    displayName: "Drawer Bottom HDF Anthracite 8 mm",
    category: "Drawer Bottom Boards",
    baseMaterial: "hdf",
    decor: "Anthracite",
    color: "Anthracite",
    finish: "Painted Smooth",
    availableThicknessesMm: [6, 8],
    defaultThicknessMm: 8,
    grainDirectionRelevant: false,
    recommendedUse: "Anthracite drawer bottoms for dark premium kitchen interiors.",
    tags: ["drawer-bottom", "hdf", "anthracite", "premium", "drawer"]
  }),

  defineBoard("shelf", {
    id: "mat.board.shelf.dtd.white.18",
    name: "Shelf DTD White 18",
    displayName: "Shelf DTD White 18 mm",
    category: "Shelf Boards",
    baseMaterial: "dtd",
    decor: "White",
    color: "White",
    finish: "Melamine",
    availableThicknessesMm: [18, 25],
    defaultThicknessMm: 18,
    grainDirectionRelevant: false,
    recommendedUse: "Standard white shelf board for carcass internals and open storage.",
    tags: ["shelf", "dtd", "white", "melamine", "standard"]
  }),
  defineBoard("shelf", {
    id: "mat.board.shelf.dtd.grey.18",
    name: "Shelf DTD Grey 18",
    displayName: "Shelf DTD Grey 18 mm",
    category: "Shelf Boards",
    baseMaterial: "dtd",
    decor: "Grey",
    color: "Grey",
    finish: "Melamine",
    availableThicknessesMm: [18, 25],
    defaultThicknessMm: 18,
    grainDirectionRelevant: false,
    recommendedUse: "Grey shelf board for coordinated interiors in grey kitchens.",
    tags: ["shelf", "dtd", "grey", "melamine", "modern"]
  }),
  defineBoard("shelf", {
    id: "mat.board.shelf.dtd.oak_natural.18",
    name: "Shelf DTD Oak Natural 18",
    displayName: "Shelf DTD Oak Natural 18 mm",
    category: "Shelf Boards",
    baseMaterial: "dtd",
    decor: "Oak Natural",
    color: "Oak",
    finish: "Woodgrain Melamine",
    availableThicknessesMm: [18, 25],
    defaultThicknessMm: 18,
    grainDirectionRelevant: true,
    recommendedUse: "Decor shelf board used for visible open kitchen shelves.",
    tags: ["shelf", "oak", "woodgrain", "visible", "decor"]
  }),
  defineBoard("shelf", {
    id: "mat.board.shelf.plywood.birch.18",
    name: "Shelf Plywood Birch 18",
    displayName: "Shelf Plywood Birch 18 mm",
    category: "Shelf Boards",
    baseMaterial: "plywood",
    decor: "Birch",
    color: "Birch",
    finish: "Natural Sanded",
    availableThicknessesMm: [15, 18, 21],
    defaultThicknessMm: 18,
    grainDirectionRelevant: true,
    recommendedUse: "Premium shelf board for open shelving and utility modules.",
    tags: ["shelf", "plywood", "birch", "premium", "open-shelf"]
  }),

  defineBoard("worktop", {
    id: "mat.board.worktop.laminate_oak.38",
    name: "Laminate Oak 38",
    displayName: "Laminate Worktop Oak 38 mm",
    category: "Worktop Boards",
    baseMaterial: "laminate",
    decor: "Oak",
    color: "Oak",
    finish: "Laminate Woodgrain",
    availableThicknessesMm: [28, 38],
    defaultThicknessMm: 38,
    grainDirectionRelevant: true,
    recommendedUse: "Standard laminate worktop with warm oak decor.",
    tags: ["worktop", "laminate", "oak", "38mm", "woodgrain"]
  }),
  defineBoard("worktop", {
    id: "mat.board.worktop.laminate_walnut.38",
    name: "Laminate Walnut 38",
    displayName: "Laminate Worktop Walnut 38 mm",
    category: "Worktop Boards",
    baseMaterial: "laminate",
    decor: "Walnut",
    color: "Walnut Brown",
    finish: "Laminate Woodgrain",
    availableThicknessesMm: [28, 38],
    defaultThicknessMm: 38,
    grainDirectionRelevant: true,
    recommendedUse: "Premium darker laminate worktop for wood-rich kitchen designs.",
    tags: ["worktop", "laminate", "walnut", "38mm", "premium"]
  }),
  defineBoard("worktop", {
    id: "mat.board.worktop.laminate_white_marble.38",
    name: "Laminate White Marble 38",
    displayName: "Laminate Worktop White Marble 38 mm",
    category: "Worktop Boards",
    baseMaterial: "laminate",
    decor: "White Marble",
    color: "White Marble",
    finish: "Laminate Stone",
    availableThicknessesMm: [28, 38],
    defaultThicknessMm: 38,
    grainDirectionRelevant: false,
    recommendedUse: "Decorative stone-effect worktop for bright premium kitchens.",
    tags: ["worktop", "laminate", "marble", "stone-look", "premium"]
  }),
  defineBoard("worktop", {
    id: "mat.board.worktop.laminate_black_stone.38",
    name: "Laminate Black Stone 38",
    displayName: "Laminate Worktop Black Stone 38 mm",
    category: "Worktop Boards",
    baseMaterial: "laminate",
    decor: "Black Stone",
    color: "Black",
    finish: "Laminate Stone",
    availableThicknessesMm: [28, 38],
    defaultThicknessMm: 38,
    grainDirectionRelevant: false,
    recommendedUse: "Dark stone-look worktop for contrast-heavy kitchen concepts.",
    tags: ["worktop", "laminate", "black", "stone-look", "design"]
  }),
  defineBoard("worktop", {
    id: "mat.board.worktop.compact.black.12",
    name: "Compact Black 12",
    displayName: "Compact Worktop Black 12 mm",
    category: "Worktop Boards",
    baseMaterial: "compact",
    decor: "Black",
    color: "Black",
    finish: "Compact Laminate",
    availableThicknessesMm: [10, 12],
    defaultThicknessMm: 12,
    grainDirectionRelevant: false,
    recommendedUse: "Slim premium compact worktop for contemporary kitchens and islands.",
    tags: ["worktop", "compact", "black", "12mm", "premium"]
  }),
  defineBoard("worktop", {
    id: "mat.board.worktop.compact.white.12",
    name: "Compact White 12",
    displayName: "Compact Worktop White 12 mm",
    category: "Worktop Boards",
    baseMaterial: "compact",
    decor: "White",
    color: "White",
    finish: "Compact Laminate",
    availableThicknessesMm: [10, 12],
    defaultThicknessMm: 12,
    grainDirectionRelevant: false,
    recommendedUse: "Slim white compact worktop for minimalist premium kitchens.",
    tags: ["worktop", "compact", "white", "12mm", "premium"]
  }),

  defineEdge("body", {
    id: "mat.edge.body.abs.white.0_8",
    name: "ABS Body White 0.8",
    displayName: "ABS Body Edge White 0.8 mm",
    category: "Body Edge Bands",
    baseMaterial: "abs",
    decor: "White",
    color: "White",
    finish: "Satin",
    availableThicknessesMm: [0.5, 0.8, 2],
    defaultThicknessMm: 0.8,
    recommendedUse: "Standard carcass edging for white melamine body boards.",
    recommendedBoardMatch: "mat.board.body.dtd.white.18",
    tags: ["edge", "body", "white", "abs", "standard"]
  }),
  defineEdge("body", {
    id: "mat.edge.body.abs.white.2",
    name: "ABS Body White 2",
    displayName: "ABS Body Edge White 2 mm",
    category: "Body Edge Bands",
    baseMaterial: "abs",
    decor: "White",
    color: "White",
    finish: "Satin",
    availableThicknessesMm: [0.5, 0.8, 2],
    defaultThicknessMm: 2,
    recommendedUse: "Heavy-duty visible carcass edge for white side panels and shelves.",
    recommendedBoardMatch: "mat.board.body.dtd.white.18",
    tags: ["edge", "body", "white", "abs", "thick"]
  }),
  defineEdge("body", {
    id: "mat.edge.body.abs.grey.0_8",
    name: "ABS Body Grey 0.8",
    displayName: "ABS Body Edge Grey 0.8 mm",
    category: "Body Edge Bands",
    baseMaterial: "abs",
    decor: "Grey",
    color: "Grey",
    finish: "Satin",
    availableThicknessesMm: [0.5, 0.8, 2],
    defaultThicknessMm: 0.8,
    recommendedUse: "Standard carcass edging for grey boards.",
    recommendedBoardMatch: "mat.board.body.dtd.grey.18",
    tags: ["edge", "body", "grey", "abs", "standard"]
  }),
  defineEdge("body", {
    id: "mat.edge.body.abs.grey.2",
    name: "ABS Body Grey 2",
    displayName: "ABS Body Edge Grey 2 mm",
    category: "Body Edge Bands",
    baseMaterial: "abs",
    decor: "Grey",
    color: "Grey",
    finish: "Satin",
    availableThicknessesMm: [0.5, 0.8, 2],
    defaultThicknessMm: 2,
    recommendedUse: "Durable grey visible edge for premium carcass applications.",
    recommendedBoardMatch: "mat.board.body.dtd.grey.18",
    tags: ["edge", "body", "grey", "abs", "durable"]
  }),
  defineEdge("body", {
    id: "mat.edge.body.abs.anthracite.0_8",
    name: "ABS Body Anthracite 0.8",
    displayName: "ABS Body Edge Anthracite 0.8 mm",
    category: "Body Edge Bands",
    baseMaterial: "abs",
    decor: "Anthracite",
    color: "Anthracite",
    finish: "Satin",
    availableThicknessesMm: [0.5, 0.8, 2],
    defaultThicknessMm: 0.8,
    recommendedUse: "Standard edge band for anthracite carcass boards.",
    recommendedBoardMatch: "mat.board.body.dtd.anthracite.18",
    tags: ["edge", "body", "anthracite", "abs", "standard"]
  }),
  defineEdge("body", {
    id: "mat.edge.body.abs.anthracite.2",
    name: "ABS Body Anthracite 2",
    displayName: "ABS Body Edge Anthracite 2 mm",
    category: "Body Edge Bands",
    baseMaterial: "abs",
    decor: "Anthracite",
    color: "Anthracite",
    finish: "Satin",
    availableThicknessesMm: [0.5, 0.8, 2],
    defaultThicknessMm: 2,
    recommendedUse: "Premium thick edge for exposed dark carcass details.",
    recommendedBoardMatch: "mat.board.body.dtd.anthracite.18",
    tags: ["edge", "body", "anthracite", "abs", "premium"]
  }),
  defineEdge("body", {
    id: "mat.edge.body.abs.black.0_8",
    name: "ABS Body Black 0.8",
    displayName: "ABS Body Edge Black 0.8 mm",
    category: "Body Edge Bands",
    baseMaterial: "abs",
    decor: "Black",
    color: "Black",
    finish: "Satin",
    availableThicknessesMm: [0.5, 0.8, 2],
    defaultThicknessMm: 0.8,
    recommendedUse: "Thin black edging for dark carcass interiors and accents.",
    recommendedBoardMatch: "mat.board.body.dtd.black.18",
    tags: ["edge", "body", "black", "abs", "dark"]
  }),
  defineEdge("body", {
    id: "mat.edge.body.abs.oak_natural.2",
    name: "ABS Body Oak Natural 2",
    displayName: "ABS Body Edge Oak Natural 2 mm",
    category: "Body Edge Bands",
    baseMaterial: "abs",
    decor: "Oak Natural",
    color: "Oak",
    finish: "Woodgrain",
    availableThicknessesMm: [0.8, 2],
    defaultThicknessMm: 2,
    recommendedUse: "Visible edging for natural oak decor carcass and shelf parts.",
    recommendedBoardMatch: "mat.board.body.dtd.oak_natural.18",
    tags: ["edge", "body", "oak", "woodgrain", "visible"]
  }),
  defineEdge("body", {
    id: "mat.edge.body.abs.halifax_oak.2",
    name: "ABS Body Halifax Oak 2",
    displayName: "ABS Body Edge Halifax Oak 2 mm",
    category: "Body Edge Bands",
    baseMaterial: "abs",
    decor: "Halifax Oak",
    color: "Oak Brown",
    finish: "Woodgrain",
    availableThicknessesMm: [0.8, 2],
    defaultThicknessMm: 2,
    recommendedUse: "Textured oak matched edging for premium Halifax Oak boards.",
    recommendedBoardMatch: "mat.board.body.dtd.halifax_oak.18",
    tags: ["edge", "body", "halifax", "oak", "premium"]
  }),

  defineEdge("front", {
    id: "mat.edge.front.abs.white.1",
    name: "ABS Front White 1",
    displayName: "ABS Front Edge White 1 mm",
    category: "Front Edge Bands",
    baseMaterial: "abs",
    decor: "White",
    color: "White",
    finish: "Supermat Match",
    availableThicknessesMm: [1, 2],
    defaultThicknessMm: 1,
    recommendedUse: "Standard front edging for matte white fronts.",
    recommendedBoardMatch: "mat.board.front.mdf.white_supermat.19",
    tags: ["edge", "front", "white", "1mm", "supermat"]
  }),
  defineEdge("front", {
    id: "mat.edge.front.abs.white.2",
    name: "ABS Front White 2",
    displayName: "ABS Front Edge White 2 mm",
    category: "Front Edge Bands",
    baseMaterial: "abs",
    decor: "White",
    color: "White",
    finish: "Supermat Match",
    availableThicknessesMm: [1, 2],
    defaultThicknessMm: 2,
    recommendedUse: "Premium thicker edge for high-use white front panels.",
    recommendedBoardMatch: "mat.board.front.mdf.white_supermat.19",
    tags: ["edge", "front", "white", "2mm", "premium"]
  }),
  defineEdge("front", {
    id: "mat.edge.front.abs.cashmere.1",
    name: "ABS Front Cashmere 1",
    displayName: "ABS Front Edge Cashmere 1 mm",
    category: "Front Edge Bands",
    baseMaterial: "abs",
    decor: "Cashmere",
    color: "Cashmere",
    finish: "Supermat Match",
    availableThicknessesMm: [1, 2],
    defaultThicknessMm: 1,
    recommendedUse: "Matched edging for cashmere matte fronts.",
    recommendedBoardMatch: "mat.board.front.mdf.cashmere_supermat.19",
    tags: ["edge", "front", "cashmere", "1mm", "matched"]
  }),
  defineEdge("front", {
    id: "mat.edge.front.abs.cashmere.2",
    name: "ABS Front Cashmere 2",
    displayName: "ABS Front Edge Cashmere 2 mm",
    category: "Front Edge Bands",
    baseMaterial: "abs",
    decor: "Cashmere",
    color: "Cashmere",
    finish: "Supermat Match",
    availableThicknessesMm: [1, 2],
    defaultThicknessMm: 2,
    recommendedUse: "Premium visible edging for cashmere fronts in high-traffic kitchens.",
    recommendedBoardMatch: "mat.board.front.mdf.cashmere_supermat.19",
    tags: ["edge", "front", "cashmere", "2mm", "premium"]
  }),
  defineEdge("front", {
    id: "mat.edge.front.abs.blue.1",
    name: "ABS Front Blue 1",
    displayName: "ABS Front Edge Blue 1 mm",
    category: "Front Edge Bands",
    baseMaterial: "abs",
    decor: "Blue",
    color: "Blue",
    finish: "Supermat Match",
    availableThicknessesMm: [1, 2],
    defaultThicknessMm: 1,
    recommendedUse: "Matched edging for colored blue matte fronts.",
    recommendedBoardMatch: "mat.board.front.mdf.blue_supermat.19",
    tags: ["edge", "front", "blue", "1mm", "matched"]
  }),
  defineEdge("front", {
    id: "mat.edge.front.abs.blue.2",
    name: "ABS Front Blue 2",
    displayName: "ABS Front Edge Blue 2 mm",
    category: "Front Edge Bands",
    baseMaterial: "abs",
    decor: "Blue",
    color: "Blue",
    finish: "Supermat Match",
    availableThicknessesMm: [1, 2],
    defaultThicknessMm: 2,
    recommendedUse: "Premium edging for thicker and more durable blue fronts.",
    recommendedBoardMatch: "mat.board.front.mdf.blue_supermat.19",
    tags: ["edge", "front", "blue", "2mm", "premium"]
  }),
  defineEdge("front", {
    id: "mat.edge.front.abs.graphite.1",
    name: "ABS Front Graphite 1",
    displayName: "ABS Front Edge Graphite 1 mm",
    category: "Front Edge Bands",
    baseMaterial: "abs",
    decor: "Graphite",
    color: "Graphite",
    finish: "Supermat Match",
    availableThicknessesMm: [1, 2],
    defaultThicknessMm: 1,
    recommendedUse: "Matched edge band for graphite matte fronts.",
    recommendedBoardMatch: "mat.board.front.mdf.graphite_supermat.19",
    tags: ["edge", "front", "graphite", "1mm", "dark"]
  }),

  defineEdge("drawer_box", {
    id: "mat.edge.drawer_box.abs.grey.1",
    name: "ABS Drawer Box Grey 1",
    displayName: "ABS Drawer Box Edge Grey 1 mm",
    category: "Drawer Box Edge Bands",
    baseMaterial: "abs",
    decor: "Grey",
    color: "Grey",
    finish: "Satin",
    availableThicknessesMm: [1, 2],
    defaultThicknessMm: 1,
    recommendedUse: "Standard drawer box edging for grey plywood drawer systems.",
    recommendedBoardMatch: "mat.board.drawer_box.plywood.grey.13",
    tags: ["edge", "drawer-box", "grey", "1mm", "drawer"]
  }),
  defineEdge("drawer_box", {
    id: "mat.edge.drawer_box.abs.white.1",
    name: "ABS Drawer Box White 1",
    displayName: "ABS Drawer Box Edge White 1 mm",
    category: "Drawer Box Edge Bands",
    baseMaterial: "abs",
    decor: "White",
    color: "White",
    finish: "Satin",
    availableThicknessesMm: [1, 2],
    defaultThicknessMm: 1,
    recommendedUse: "White edged drawer box finish for bright drawer interiors.",
    recommendedBoardMatch: "mat.board.drawer_box.plywood.white.13",
    tags: ["edge", "drawer-box", "white", "1mm", "drawer"]
  }),

  defineEdge("shelf", {
    id: "mat.edge.shelf.abs.white.2",
    name: "ABS Shelf White 2",
    displayName: "ABS Shelf Edge White 2 mm",
    category: "Shelf Edge Bands",
    baseMaterial: "abs",
    decor: "White",
    color: "White",
    finish: "Satin",
    availableThicknessesMm: [1, 2],
    defaultThicknessMm: 2,
    recommendedUse: "Durable front edge for white shelf boards.",
    recommendedBoardMatch: "mat.board.shelf.dtd.white.18",
    tags: ["edge", "shelf", "white", "2mm", "durable"]
  }),
  defineEdge("shelf", {
    id: "mat.edge.shelf.abs.oak_natural.2",
    name: "ABS Shelf Oak Natural 2",
    displayName: "ABS Shelf Edge Oak Natural 2 mm",
    category: "Shelf Edge Bands",
    baseMaterial: "abs",
    decor: "Oak Natural",
    color: "Oak",
    finish: "Woodgrain",
    availableThicknessesMm: [1, 2],
    defaultThicknessMm: 2,
    recommendedUse: "Visible oak edging for open decorative shelves.",
    recommendedBoardMatch: "mat.board.shelf.dtd.oak_natural.18",
    tags: ["edge", "shelf", "oak", "2mm", "visible"]
  }),

  defineEdge("worktop", {
    id: "mat.edge.worktop.abs_oak.2",
    name: "ABS Worktop Oak 2",
    displayName: "ABS Worktop Edge Oak 2 mm",
    category: "Worktop Edge Bands",
    baseMaterial: "abs",
    decor: "Oak",
    color: "Oak",
    finish: "Woodgrain",
    availableThicknessesMm: [1.5, 2, 3],
    defaultThicknessMm: 2,
    recommendedUse: "Front edge treatment for laminate oak worktops.",
    recommendedBoardMatch: "mat.board.worktop.laminate_oak.38",
    tags: ["edge", "worktop", "oak", "2mm", "worktop"]
  }),
  defineEdge("worktop", {
    id: "mat.edge.worktop.abs_black_stone.2",
    name: "ABS Worktop Black Stone 2",
    displayName: "ABS Worktop Edge Black Stone 2 mm",
    category: "Worktop Edge Bands",
    baseMaterial: "abs",
    decor: "Black Stone",
    color: "Black",
    finish: "Stone Match",
    availableThicknessesMm: [1.5, 2, 3],
    defaultThicknessMm: 2,
    recommendedUse: "Matched edging for black stone laminate worktops.",
    recommendedBoardMatch: "mat.board.worktop.laminate_black_stone.38",
    tags: ["edge", "worktop", "black", "stone", "worktop"]
  })
];

export function getMaterialDefinitionById(id: string): MaterialDefinition | null {
  return materialDefinitions.find((material) => material.id === id) ?? null;
}

export function getMaterialDefinitionsByType(materialType: MaterialType): MaterialDefinition[] {
  return materialDefinitions.filter((material) => material.materialType === materialType);
}
