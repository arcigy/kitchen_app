import type {
  AssistantCapabilityBoundary,
  AssistantOrchestratorToolMetadata,
  AssistantRiskLevel,
  AssistantToolDefinition
} from "./types";
import type { ClientRole } from "../core/client/client-types";

const point2dSchema = {
  type: "object",
  properties: {
    x: { type: "number" },
    z: { type: "number" }
  },
  required: ["x", "z"],
  additionalProperties: false
};

const semanticKitchenLayoutSchema = {
  type: "object",
  properties: {
    shape: { type: "string", enum: ["straight", "L", "U"] },
    originMm: point2dSchema,
    orientationDeg: { type: "number", enum: [0, 90, 180, 270] },
    runsMm: { type: "array", minItems: 1, items: { type: "number", minimum: 300, maximum: 30000 } },
    turns: { type: "array", items: { type: "string", enum: ["left", "right"] } }
  },
  required: ["shape", "runsMm", "turns"],
  additionalProperties: false
};

const kitchenContextPatchSchema = {
  type: "object",
  properties: {
    name: { type: "string", minLength: 1, maxLength: 160 },
    wallHeightMm: { type: "number", minimum: 1 },
    heightMm: { type: "number", minimum: 1 },
    worktopDepthMm: { type: "number", minimum: 1 },
    worktopFrontOffsetMm: { type: "number", minimum: 0 },
    worktopBackOffsetMm: { type: "number", minimum: 0 },
    worktopThicknessMm: { type: "number", minimum: 1 },
    worktopCornerCutMm: { type: "number", minimum: 0 },
    worktopOverhangSideMm: { type: "number", minimum: 0 },
    plinthHeightMm: { type: "number", minimum: 0 },
    plinthDepthMm: { type: "number", minimum: 0 },
    upperStartHeightMm: { type: "number", minimum: 1 },
    upperDepthMm: { type: "number", minimum: 1 },
    upperHeightMm: { type: "number", minimum: 1 },
    doorOverlayMm: { type: "number", minimum: 0 },
    backPanelThicknessMm: { type: "number", minimum: 0 },
    endPanelThicknessMm: { type: "number", minimum: 0 },
    frontsMaterialId: { type: "string", minLength: 1 },
    corpusMaterialId: { type: "string", minLength: 1 },
    backMaterialId: { type: "string", minLength: 1 },
    drawerBottomMaterialId: { type: "string", minLength: 1 },
    worktopMaterialId: { type: "string", minLength: 1 },
    handleComponentId: { type: "string", minLength: 1 },
    fillerStrategy: { type: "string", enum: ["auto", "warn", "ignore"] },
    gapWarningMm: { type: "number", minimum: 0 },
    overlapErrorMm: { type: "number", minimum: 0 }
  },
  additionalProperties: false
};

const semanticKitchenModuleSchema = {
  type: "object",
  properties: {
    modulePackageId: { type: "string", minLength: 1 },
    zone: { type: "string", enum: ["lower", "upper"] },
    runIndex: { type: "number", minimum: 0 },
    cornerIndex: { type: "number", minimum: 1 },
    anchor: { type: "string", enum: ["auto", "start", "center", "end"] },
    offsetAlongMm: { type: "number", minimum: 0 },
    gapMm: { type: "number", minimum: 0 },
    parameterOverrides: { type: "object" }
  },
  required: ["modulePackageId", "zone"],
  additionalProperties: false
};

const semanticKitchenCreateSchema = {
  type: "object",
  properties: {
    name: { type: "string", minLength: 1, maxLength: 160 },
    source: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["text", "photo"] },
        scaleConfirmed: { type: "boolean" }
      },
      required: ["kind"],
      additionalProperties: false
    },
    layout: semanticKitchenLayoutSchema,
    contextPatch: kitchenContextPatchSchema,
    worktop: {
      type: "object",
      properties: {
        depthMm: { type: "number", minimum: 1 },
        thicknessMm: { type: "number", minimum: 1 },
        heightMm: { type: "number", minimum: 1 },
        overhangSideMm: { type: "number", minimum: 0 },
        materialId: { type: "string", minLength: 1 },
        justification: { type: "string", enum: ["back", "center", "front"] },
        mirrored: { type: "boolean" },
        segmentDepthsMm: { type: "array", items: { type: "number", minimum: 1 } }
      },
      additionalProperties: false
    },
    modules: { type: "array", items: semanticKitchenModuleSchema }
  },
  required: ["name", "layout"],
  additionalProperties: false
};

const doorOpeningPatchSchema = {
  type: "object",
  properties: {
    wallId: { type: "string", minLength: 1 },
    widthMm: { type: "number", minimum: 1 },
    heightMm: { type: "number", minimum: 1 },
    centerMm: { type: "number" },
    frameWidthMm: { type: "number", minimum: 0 },
    offsetFromInteriorMm: { type: "number", minimum: 0 },
    panelThicknessMm: { type: "number", minimum: 1 },
    swingDirection: { type: "string", enum: ["left", "right"] },
    swingSide: { type: "string", enum: ["inward", "outward"] },
    swingAngleDeg: { type: "number", minimum: 1, maximum: 180 },
    handleType: { type: "string", enum: ["none", "knob", "bar", "lever"] },
    handleOffsetMm: { type: "number", minimum: 0 },
    handleHeightMm: { type: "number", minimum: 0 },
    materialId: { type: "string", minLength: 1 }
  },
  additionalProperties: false
};

const windowOpeningPatchSchema = {
  type: "object",
  properties: {
    wallId: { type: "string", minLength: 1 },
    widthMm: { type: "number", minimum: 1 },
    heightMm: { type: "number", minimum: 1 },
    sillHeightMm: { type: "number", minimum: 0 },
    centerMm: { type: "number" },
    frameWidthMm: { type: "number", minimum: 0 },
    offsetFromInteriorMm: { type: "number", minimum: 0 },
    sashWidthMm: { type: "number", minimum: 0 },
    sashProfileDepthMm: { type: "number", minimum: 1 },
    frameProfileDepthMm: { type: "number", minimum: 1 },
    swingDirection: { type: "string", enum: ["left", "right"] },
    swingSide: { type: "string", enum: ["inward", "outward"] },
    swingAngleDeg: { type: "number", minimum: 1, maximum: 180 },
    handleType: { type: "string", enum: ["none", "knob", "bar", "lever"] },
    handleOffsetMm: { type: "number", minimum: 0 },
    handleHeightMm: { type: "number", minimum: 0 },
    materialId: { type: "string", minLength: 1 }
  },
  additionalProperties: false
};

const customFurniturePointSchema = {
  type: "object",
  properties: { x: { type: "number" }, z: { type: "number" } },
  required: ["x", "z"],
  additionalProperties: false
};

const measurePointSchema = {
  type: "object",
  properties: { x: { type: "number" }, y: { type: "number" }, z: { type: "number" } },
  required: ["x", "z"],
  additionalProperties: false
};

const alignLineSelectorSchema = {
  type: "object",
  properties: {
    targetKind: { type: "string", enum: ["wall", "module", "worktop"] },
    targetId: { type: "string", minLength: 1 },
    lineRole: { type: "string", enum: ["center", "exterior", "interior", "back", "front", "edge", "endA", "endB"] },
    segmentIndex: { type: "integer", minimum: 0 }
  },
  required: ["targetKind", "targetId", "lineRole"],
  additionalProperties: false
};

export const ASSISTANT_TOOL_DEFINITIONS: AssistantToolDefinition[] = [
  {
    id: "context.getSelection",
    title: "Read current selection",
    description: "Reads active view, selected objects and selected parameters from the live editor.",
    ownerSystem: "editor-context",
    effect: "Returns a fresh snapshot of project/view/selection state. It does not mutate the editor.",
    preconditions: ["The live editor bridge must be mounted."],
    postconditions: ["No project or selection state changes."],
    examples: [{}],
    readOnly: true,
    riskLevel: "low",
    requiresConfirmation: false,
    inputSchema: { type: "object", properties: {}, additionalProperties: false }
  },
  {
    id: "context.getScene",
    title: "Read editable scene",
    description: "Lists the current project entities with stable ids, parameters and module transforms.",
    ownerSystem: "editor-context",
    effect: "Returns walls, floors, columns, sections, worktops, kitchen groups and module instances from live AppState.",
    preconditions: ["The live editor bridge must be mounted."],
    postconditions: ["No project or selection state changes."],
    units: { coordinates: "millimetres", rotationYDeg: "degrees" },
    examples: [{}],
    readOnly: true,
    riskLevel: "low",
    requiresConfirmation: false,
    inputSchema: { type: "object", properties: {}, additionalProperties: false }
  },
  {
    id: "context.getCurrentView",
    title: "Read current viewer state",
    description: "Reads the active viewer tab, editor view mode, projection, render mode, navigation tool, camera transform and orbit target.",
    ownerSystem: "scene/view-navigation",
    effect: "Returns a fresh read-only camera and viewer snapshot in metres/degrees without changing navigation.",
    preconditions: ["The live viewer and camera must be mounted."],
    postconditions: ["No camera, viewer or project state changes."],
    examples: [{}],
    readOnly: true,
    operation: "read",
    domain: "view",
    tags: ["GET", "camera", "viewer", "projection"],
    riskLevel: "low",
    requiresConfirmation: false,
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    outputSchema: { type: "object", description: "Current view, camera and navigation state." }
  },
  {
    id: "view.focusObjects",
    title: "Focus exact objects in 3D",
    description: "Selects exact modules and frames them from a named 3D direction so the requested objects are clearly visible.",
    ownerSystem: "selection-controller/view-navigation",
    effect: "Uses stable module IDs and computes the camera from their real combined bounds; AI never supplies camera coordinates.",
    preconditions: ["All instanceIds must exist and grouped modules must belong to one kitchen and one kitchen edit layer."],
    postconditions: ["The requested modules are selected and visible from the requested semantic direction."],
    examples: [{ instanceIds: ["m1", "m2"], perspective: "front", padding: 1.25 }],
    readOnly: false,
    operation: "write",
    domain: "view",
    tags: ["PATCH", "camera", "selection", "semantic-view"],
    riskLevel: "low",
    requiresConfirmation: false,
    reversible: true,
    verificationTools: ["context.getSelection", "context.getCurrentView"],
    inputSchema: {
      type: "object",
      properties: {
        instanceIds: { type: "array", minItems: 1, items: { type: "string", minLength: 1 } },
        perspective: { type: "string", enum: ["front", "back", "left", "right", "top", "isometric"] },
        padding: { type: "number", minimum: 0.5, maximum: 3 }
      },
      required: ["instanceIds", "perspective"],
      additionalProperties: false
    }
  },
  {
    id: "context.queryObjects",
    title: "Query project objects",
    description: "Filters live project objects by kind, ids, kitchen group and text instead of returning the entire scene.",
    ownerSystem: "editor-context",
    effect: "Returns matching stable ids, labels, parameters and transforms from current AppState, capped by limit.",
    preconditions: ["The live editor bridge must be mounted."],
    postconditions: ["No project or selection state changes."],
    examples: [{ kinds: ["module"], kitchenGroupId: "kg1", text: "drawer", limit: 50 }],
    readOnly: true,
    operation: "read",
    domain: "scene",
    tags: ["GET", "filter", "objects"],
    riskLevel: "low",
    requiresConfirmation: false,
    inputSchema: {
      type: "object",
      properties: {
        kinds: { type: "array", items: { type: "string", enum: ["module", "wall", "floor", "column", "section", "window", "door", "kitchenGroup", "worktop", "customFurniture"] } },
        ids: { type: "array", items: { type: "string" } },
        kitchenGroupId: { type: "string" },
        text: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 500 }
      },
      additionalProperties: false
    },
    outputSchema: { type: "object", description: "Filtered objects plus total and truncation metadata." }
  },
  {
    id: "context.getObject",
    title: "Read one project object",
    description: "Reads one exact live object by stable kind and id.",
    ownerSystem: "editor-context",
    effect: "Returns the object's current parameters, relationships and transform or a not-found error.",
    preconditions: ["kind and id must identify one live project object."],
    postconditions: ["No project or selection state changes."],
    examples: [{ kind: "module", id: "i12" }],
    readOnly: true,
    operation: "verify",
    domain: "scene",
    tags: ["GET", "object", "verification"],
    riskLevel: "low",
    requiresConfirmation: false,
    inputSchema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["module", "wall", "floor", "column", "section", "window", "door", "kitchenGroup", "worktop", "customFurniture"] },
        id: { type: "string", minLength: 1 }
      },
      required: ["kind", "id"],
      additionalProperties: false
    },
    outputSchema: { type: "object", description: "One exact live project object." }
  },
  {
    id: "project.getMetadata",
    title: "Read current project metadata",
    description: "Reads the open project identity, active phase, editing session, save revision and last save time.",
    ownerSystem: "project-service",
    effect: "Returns project service state without creating a revision.",
    preconditions: ["Project actions must be mounted."],
    postconditions: ["No project state changes."],
    examples: [{}],
    readOnly: true,
    operation: "verify",
    domain: "project",
    tags: ["GET", "project", "save", "verification"],
    riskLevel: "low",
    requiresConfirmation: false,
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    outputSchema: { type: "object", description: "Current project service metadata." }
  },
  {
    id: "project.listRelated",
    title: "List related customer projects",
    description: "Lists tenant-scoped projects related to the current customer contact without loading another project.",
    ownerSystem: "project-service",
    effect: "Calls the authenticated project list and matches contact name, email, phone or company; returns metadata only.",
    preconditions: ["The user must be authenticated.", "Automatic matching requires an open project with contact metadata."],
    postconditions: ["The open project, save revision and editing session remain unchanged."],
    examples: [{ sameContactOnly: true, search: "Novak" }],
    readOnly: true,
    operation: "read",
    domain: "project",
    tags: ["GET", "project", "customer", "tenant"],
    riskLevel: "low",
    requiresConfirmation: false,
    inputSchema: {
      type: "object",
      properties: {
        sameContactOnly: { type: "boolean" },
        search: { type: "string" },
        limit: { type: "number", minimum: 1, maximum: 200 }
      },
      additionalProperties: false
    }
  },
  {
    id: "project.inspectMaterialUsage",
    title: "Inspect material in another project",
    description: "Reads one tenant project save without opening it and finds exact material IDs/usages by code, ID or name.",
    ownerSystem: "project-service/project-save-contract",
    effect: "Uses authenticated read-only inspection, never restores the save, and returns matched definitions plus usage paths for a copy-material workflow.",
    preconditions: ["projectId should come from project.listRelated.", "The project must belong to the authenticated tenant."],
    postconditions: ["The current project, selection, save revision and editing session remain unchanged."],
    examples: [{ projectId: "project_previous", query: "H7788" }],
    readOnly: true,
    operation: "read",
    domain: "project",
    tags: ["GET", "material", "cross-project", "no-restore"],
    riskLevel: "low",
    requiresConfirmation: false,
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", minLength: 1 },
        query: { type: "string", minLength: 1 }
      },
      required: ["projectId", "query"],
      additionalProperties: false
    }
  },
  {
    id: "module.getParameterSchema",
    title: "Read module parameter schema",
    description: "Returns editable parameter definitions, defaults, constraints and effects for a live instance or enabled module package.",
    ownerSystem: "module-package-runtime",
    effect: "Resolves the authoritative runtime module package and reports user-visible parameters without mutating a module.",
    preconditions: ["Provide instanceId or modulePackageId that resolves to an enabled runtime package."],
    postconditions: ["No module or project state changes."],
    examples: [{ instanceId: "i12", includeTechnical: false }],
    readOnly: true,
    operation: "read",
    domain: "module",
    tags: ["GET", "parameters", "schema", "constraints"],
    riskLevel: "low",
    requiresConfirmation: false,
    inputSchema: {
      type: "object",
      properties: {
        instanceId: { type: "string", minLength: 1 },
        modulePackageId: { type: "string", minLength: 1 },
        includeTechnical: { type: "boolean" }
      },
      additionalProperties: false
    },
    outputSchema: { type: "object", description: "Resolved module package metadata and parameter definitions." }
  },
  {
    id: "module.listPresets",
    title: "List module presets",
    description: "Returns every selectable preset from a module's authoritative parameter package.",
    ownerSystem: "module-package-runtime",
    effect: "Returns select parameters, allowed values and current values without guessing undocumented presets.",
    preconditions: ["instanceId must identify a live module with a registered package."],
    postconditions: ["No module or project state changes."],
    examples: [{ instanceId: "m1" }],
    readOnly: true,
    operation: "read",
    domain: "module",
    tags: ["GET", "preset", "options"],
    riskLevel: "low",
    requiresConfirmation: false,
    inputSchema: {
      type: "object",
      properties: { instanceId: { type: "string", minLength: 1 } },
      required: ["instanceId"],
      additionalProperties: false
    }
  },
  {
    id: "module.applyPreset",
    title: "Apply module preset",
    description: "Applies one exact allowed option from the module package and rebuilds the module.",
    ownerSystem: "module-package-runtime/instance-rebuilder",
    effect: "Verifies the value against module.listPresets, then runs the standard validated parameter rebuild with rollback on failure.",
    preconditions: ["The value must be listed for the select parameter."],
    postconditions: ["The module uses the preset and the mutation is undoable."],
    examples: [{ instanceId: "m1", parameterKey: "drawerSystem", value: "merivobox" }],
    readOnly: false,
    operation: "write",
    domain: "module",
    tags: ["PATCH", "preset", "validated"],
    riskLevel: "medium",
    requiresConfirmation: false,
    reversible: true,
    verificationTools: ["context.getObject", "pricing.getSummary"],
    inputSchema: {
      type: "object",
      properties: {
        instanceId: { type: "string", minLength: 1 },
        parameterKey: { type: "string", minLength: 1 },
        value: { type: "string" }
      },
      required: ["instanceId", "parameterKey", "value"],
      additionalProperties: false
    }
  },
  {
    id: "module.replace",
    title: "Replace module type",
    description: "Changes an existing module to another enabled package while preserving its stable ID and kitchen placement.",
    ownerSystem: "module-package-runtime/instance-rebuilder/kitchen-placement-controller",
    effect: "Applies package and kitchen defaults, optionally preserves dimensions, validates overrides, rebuilds in place and reapplies the old binding; failure restores the original module.",
    preconditions: ["instanceId must exist.", "The replacement must be enabled and have the same lower/upper/tall role."],
    postconditions: ["The instance ID and valid placement remain while geometry, BOM and pricing use the replacement package."],
    examples: [{ instanceId: "m1", modulePackageId: "swing_shelves_low_v1", preserveDimensions: true, parameterOverrides: {} }],
    readOnly: false,
    operation: "write",
    domain: "module",
    tags: ["PATCH", "replace", "stable-id", "transactional"],
    riskLevel: "medium",
    requiresConfirmation: false,
    reversible: true,
    verificationTools: ["context.getObject", "kitchen.getSummary", "pricing.getSummary"],
    inputSchema: {
      type: "object",
      properties: {
        instanceId: { type: "string", minLength: 1 },
        modulePackageId: { type: "string", minLength: 1 },
        preserveDimensions: { type: "boolean" },
        parameterOverrides: { type: "object" }
      },
      required: ["instanceId", "modulePackageId"],
      additionalProperties: false
    }
  },
  {
    id: "catalog.searchModules",
    title: "Search available modules",
    description: "Filters enabled tenant modules by free text, category, module type, tags and default dimensions.",
    ownerSystem: "catalog-service",
    effect: "Returns ranked tenant-scoped module candidates and package ids; it never inserts a module.",
    preconditions: ["An authenticated tenant catalog must be loaded."],
    postconditions: ["No catalog or project state changes."],
    examples: [{ query: "spodná zásuvková", category: "base", widthMm: 600, limit: 20 }],
    readOnly: true,
    operation: "read",
    domain: "catalog",
    tags: ["GET", "catalog", "filter", "modules"],
    riskLevel: "low",
    requiresConfirmation: false,
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        category: { type: "string" },
        moduleType: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
        widthMm: { type: "number", minimum: 1 },
        heightMm: { type: "number", minimum: 1 },
        depthMm: { type: "number", minimum: 1 },
        toleranceMm: { type: "number", minimum: 0, maximum: 5000 },
        limit: { type: "integer", minimum: 1, maximum: 200 }
      },
      additionalProperties: false
    },
    outputSchema: { type: "object", description: "Ranked enabled tenant module candidates." }
  },
  {
    id: "catalog.searchMaterials",
    title: "Search tenant materials",
    description: "Finds active tenant materials by ID, decor code, supplier, family, name or free text.",
    ownerSystem: "tenant-catalog",
    effect: "Returns exact material IDs and metadata that can be passed to kitchen material tools; it never invents or imports a material.",
    preconditions: ["The authenticated tenant catalog must be loaded."],
    postconditions: ["No catalog or project state changes."],
    examples: [{ query: "H15554", boardFamily: "body", limit: 20 }],
    readOnly: true,
    operation: "read",
    domain: "catalog",
    tags: ["GET", "material", "decor", "tenant"],
    riskLevel: "low",
    requiresConfirmation: false,
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        ids: { type: "array", items: { type: "string" } },
        boardFamily: { type: "string", enum: ["body", "front", "back", "drawer_box", "drawer_bottom", "shelf", "worktop"] },
        materialType: { type: "string", enum: ["board", "edge"] },
        supplierId: { type: "string" },
        limit: { type: "number", minimum: 1, maximum: 200 }
      },
      additionalProperties: false
    },
    outputSchema: { type: "object", description: "Matched active tenant materials with exact IDs and decor metadata." }
  },
  {
    id: "kitchen.validateCreate",
    title: "Validate semantic kitchen JSON",
    description: "Validates a compact straight, L or U kitchen intent before any geometry is created.",
    ownerSystem: "assistant-kitchen-controller",
    effect: "Converts run lengths and turns into a deterministic worktop path, resolves catalog module defaults and rejects missing photo scale, invalid materials, wrong module zones or bad run references without mutating the project.",
    preconditions: ["All real-world run lengths must be known in millimetres.", "For a photo source, scaleConfirmed must be true."],
    postconditions: ["Returns the exact derived path and normalized kitchen context; no scene state changes."],
    units: { runsMm: "millimetres", originMm: "millimetres", moduleOverrides: "module schema" },
    examples: [{ name: "U kitchen", source: { kind: "text" }, layout: { shape: "U", runsMm: [2400, 3200, 2400], turns: ["right", "right"] }, modules: [] }],
    readOnly: true,
    operation: "verify",
    domain: "kitchen",
    tags: ["GET", "validate", "semantic-json", "no-raw-geometry"],
    riskLevel: "low",
    requiresConfirmation: false,
    inputSchema: semanticKitchenCreateSchema,
    outputSchema: { type: "object", description: "Validated semantic plan and deterministic worktop path." }
  },
  {
    id: "kitchen.create",
    title: "Create kitchen from semantic JSON",
    description: "Creates a straight, L or U kitchen, its worktop and ordered lower/upper modules from compact JSON.",
    ownerSystem: "assistant-kitchen-controller/worktop-controller/kitchen-placement-controller",
    effect: "The app derives the path, module geometry, corner reservations, heights, rotations and collision-free run positions. If any module cannot fit, the entire command is rolled back.",
    preconditions: ["Run lengths must pass kitchen.validateCreate.", "Every package/material must be enabled for the tenant.", "The editor must be in layout mode."],
    postconditions: ["One kitchen group and worktop are created with zero same-layer overlap, all modules are bound to a run/corner, and one undo snapshot is committed."],
    units: { dimensions: "millimetres", orientationDeg: "quarter-turn degrees" },
    examples: [{ name: "L kitchen", layout: { shape: "L", runsMm: [3000, 2400], turns: ["left"] }, modules: [{ modulePackageId: "drawer_low_v1", zone: "lower", runIndex: 0, anchor: "auto" }] }],
    readOnly: false,
    operation: "write",
    domain: "kitchen",
    tags: ["POST", "semantic-json", "transactional", "no-raw-geometry"],
    riskLevel: "high",
    requiresConfirmation: true,
    reversible: true,
    verificationTools: ["kitchen.getSummary", "validation.inspectProject", "pricing.getSummary"],
    inputSchema: semanticKitchenCreateSchema,
    outputSchema: { type: "object", description: "Created group, worktop, modules and derived path IDs." }
  },
  {
    id: "kitchen.getSummary",
    title: "Inspect one kitchen",
    description: "Returns counts, lower/upper run occupancy, materials, unbound modules and exact overlap findings for one kitchen.",
    ownerSystem: "assistant-kitchen-controller/kitchen-placement-controller",
    effect: "Uses live placement bindings and run dimensions to independently report whether the kitchen is spatially valid.",
    preconditions: ["groupId must identify a live kitchen group."],
    postconditions: ["No project state changes."],
    examples: [{ groupId: "kg1" }],
    readOnly: true,
    operation: "verify",
    domain: "kitchen",
    tags: ["GET", "counts", "overlap", "analyzer"],
    riskLevel: "low",
    requiresConfirmation: false,
    inputSchema: {
      type: "object",
      properties: { groupId: { type: "string", minLength: 1 } },
      required: ["groupId"],
      additionalProperties: false
    },
    outputSchema: { type: "object", description: "Kitchen counts, runs, materials and deterministic validity report." }
  },
  {
    id: "kitchen.updateParameters",
    title: "Update kitchen parameters",
    description: "Changes editable kitchen-wide dimensions, offsets, heights, behavior or material defaults with dependent module/worktop rebuilds.",
    ownerSystem: "assistant-kitchen-controller/kitchen-placement-controller",
    effect: "Resolves derived values in the app, rebuilds only affected modules/worktops, reapplies placement bindings and commits one undo snapshot.",
    preconditions: ["groupId must exist.", "Material/component IDs in the patch must be active for the tenant."],
    postconditions: ["The group context and active edit context match; affected geometry remains bound and persisted."],
    examples: [{ groupId: "kg1", patch: { worktopDepthMm: 650, upperStartHeightMm: 1450 } }],
    readOnly: false,
    operation: "write",
    domain: "kitchen",
    tags: ["PATCH", "parameters", "derived-geometry"],
    riskLevel: "medium",
    requiresConfirmation: false,
    reversible: true,
    verificationTools: ["kitchen.getSummary", "validation.inspectProject"],
    inputSchema: {
      type: "object",
      properties: {
        groupId: { type: "string", minLength: 1 },
        patch: kitchenContextPatchSchema
      },
      required: ["groupId", "patch"],
      additionalProperties: false
    }
  },
  {
    id: "kitchen.applyMaterial",
    title: "Apply material across a kitchen",
    description: "Applies one exact tenant material to selected kitchen scopes such as every corpus, every front or the worktop.",
    ownerSystem: "assistant-kitchen-controller/kitchen-material-sync",
    effect: "Updates kitchen material defaults, synchronizes every affected module parameter/material slot, rebuilds visuals/BOM inputs and commits one undo snapshot.",
    preconditions: ["Material ID must come from catalog.searchMaterials.", "groupId must exist."],
    postconditions: ["Every requested scope in the kitchen reports the exact material ID and affected geometry/pricing is rebuilt."],
    examples: [{ groupId: "kg1", materialId: "mat.H15554", scopes: ["corpus"] }],
    readOnly: false,
    operation: "write",
    domain: "kitchen",
    tags: ["PATCH", "material", "batch", "BOM"],
    riskLevel: "medium",
    requiresConfirmation: false,
    reversible: true,
    verificationTools: ["kitchen.getSummary", "pricing.getSummary"],
    inputSchema: {
      type: "object",
      properties: {
        groupId: { type: "string", minLength: 1 },
        materialId: { type: "string", minLength: 1 },
        scopes: { type: "array", minItems: 1, items: { type: "string", enum: ["corpus", "fronts", "backs", "drawerBottoms", "worktop"] } }
      },
      required: ["groupId", "materialId", "scopes"],
      additionalProperties: false
    }
  },
  {
    id: "validation.inspectProject",
    title: "Inspect live project validity",
    description: "Independently checks live module parameters and core project relationships for analyzer evidence.",
    ownerSystem: "project-validation/module-validation",
    effect: "Returns structured diagnostics for duplicate ids, missing references and invalid module parameters without repairing them.",
    preconditions: ["The live project state must be loaded."],
    postconditions: ["No project state changes."],
    examples: [{}],
    readOnly: true,
    operation: "verify",
    domain: "validation",
    tags: ["GET", "validation", "analyzer", "verification"],
    riskLevel: "low",
    requiresConfirmation: false,
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    outputSchema: { type: "object", description: "Structured live-project diagnostics and validity flag." }
  },
  {
    id: "catalog.listModules",
    title: "List available modules",
    description: "Lists enabled tenant-scoped module definitions that may be inserted.",
    ownerSystem: "catalog-service",
    effect: "Returns catalog module ids, names, types, package ids, categories and default dimensions.",
    preconditions: ["An authenticated tenant catalog must be loaded."],
    postconditions: ["No catalog or project state changes."],
    examples: [{}],
    readOnly: true,
    riskLevel: "low",
    requiresConfirmation: false,
    inputSchema: { type: "object", properties: {}, additionalProperties: false }
  },
  {
    id: "pricing.getSummary",
    title: "Read project price",
    description: "Calculates the current BOM-backed project pricing and margin summary.",
    ownerSystem: "pricing-bom",
    effect: "Recalculates pricing from live modules, worktops and custom furniture using the tenant catalog and current project margins.",
    preconditions: ["The tenant catalog and current editor state must be loaded."],
    postconditions: ["No price settings or project state changes."],
    units: { monetaryValues: "tenant catalog currency", quantities: "BOM-defined units" },
    examples: [{}],
    readOnly: true,
    riskLevel: "low",
    requiresConfirmation: false,
    inputSchema: { type: "object", properties: {}, additionalProperties: false }
  },
  {
    id: "selection.set",
    title: "Select one entity",
    description: "Selects one existing entity by stable id through the editor selection controller.",
    ownerSystem: "selection-controller",
    effect: "Clears the previous selection and selects the requested module, wall, floor, column, section or kitchen group. Selecting a grouped module enters its existing kitchen edit workflow first.",
    preconditions: ["The entity id must exist and match the requested kind.", "Pinned entities may be rejected by the editor."],
    postconditions: ["Properties and selection highlights refresh; project history is unchanged."],
    examples: [{ kind: "module", id: "i12" }, { kind: "wall", id: "w3" }],
    readOnly: false,
    riskLevel: "low",
    requiresConfirmation: false,
    inputSchema: {
      type: "object",
      properties: {
        kind: { type: "string", enum: ["module", "wall", "floor", "column", "section", "kitchenGroup"] },
        id: { type: "string", minLength: 1 }
      },
      required: ["kind", "id"],
      additionalProperties: false
    }
  },
  {
    id: "selection.setMany",
    title: "Select multiple modules",
    description: "Creates one exact multi-selection from stable module IDs, entering the owning kitchen when necessary.",
    ownerSystem: "selection-controller",
    effect: "Clears the previous selection, selects the first module normally and adds the rest through the shared additive-selection command.",
    preconditions: ["Every instanceId must exist.", "Grouped modules must belong to one kitchen group and one kitchen edit layer (lower, upper or tall)."],
    postconditions: ["The live selectedInstanceIds exactly match the requested unique IDs."],
    examples: [{ instanceIds: ["m1", "m2", "m3"] }],
    readOnly: false,
    operation: "write",
    domain: "selection",
    tags: ["PATCH", "multi-select", "module"],
    riskLevel: "low",
    requiresConfirmation: false,
    reversible: true,
    verificationTools: ["context.getSelection"],
    inputSchema: {
      type: "object",
      properties: { instanceIds: { type: "array", minItems: 1, items: { type: "string", minLength: 1 } } },
      required: ["instanceIds"],
      additionalProperties: false
    }
  },
  {
    id: "selection.clear",
    title: "Clear selection",
    description: "Clears the current editor selection through the shared selection controller.",
    ownerSystem: "selection-controller",
    effect: "Deselects the active entity or entities and refreshes selection visuals.",
    preconditions: ["The live editor bridge must be mounted."],
    postconditions: ["No project history transaction is created."],
    examples: [{}],
    readOnly: false,
    riskLevel: "low",
    requiresConfirmation: false,
    inputSchema: { type: "object", properties: {}, additionalProperties: false }
  },
  {
    id: "module.patchSelectedParams",
    title: "Patch selected module parameters",
    description: "Updates parameters on selected kitchen module instances through the existing rebuild path.",
    ownerSystem: "module-editor",
    effect: "Normalizes and validates the merged parameters, rebuilds every requested module, preserves the back anchor, refreshes UI and commits one history snapshot.",
    preconditions: ["Every instance id must identify an existing module.", "The merged parameters must pass validateModule."],
    postconditions: ["All requested modules are rebuilt or the failing module is restored; a successful call is undoable."],
    units: { dimensions: "millimetres", angles: "module-parameter-specific" },
    examples: [{ instanceIds: ["i12"], patch: { widthMm: 800 } }],
    readOnly: false,
    riskLevel: "medium",
    requiresConfirmation: false,
    inputSchema: {
      type: "object",
      properties: {
        instanceIds: { type: "array", items: { type: "string" } },
        patch: { type: "object" },
        sourceKey: { type: "string" }
      },
      required: ["instanceIds", "patch"],
      additionalProperties: false
    }
  },
  {
    id: "editor.moveSelection",
    title: "Move selected entities",
    description: "Moves the current transform-capable selection by an exact X/Z delta using the existing transform controller.",
    ownerSystem: "transform-controller",
    effect: "Runs the same move resolver used by the editor, including wall connections, snapping, room/overlap validation and kitchen placement bindings.",
    preconditions: ["A movable module, wall, section, door or window must be selected.", "Locked Align relationships can block movement."],
    postconditions: ["A valid move is committed to undo history; an invalid move is restored to the last valid state."],
    units: { dxMm: "millimetres", dzMm: "millimetres" },
    examples: [{ dxMm: 200, dzMm: 0 }],
    readOnly: false,
    riskLevel: "medium",
    requiresConfirmation: false,
    inputSchema: {
      type: "object",
      properties: { dxMm: { type: "number" }, dzMm: { type: "number" } },
      required: ["dxMm", "dzMm"],
      additionalProperties: false
    }
  },
  {
    id: "editor.rotateSelection",
    title: "Rotate selected entities",
    description: "Rotates the current transform-capable selection by an exact angle using the existing transform controller.",
    ownerSystem: "transform-controller",
    effect: "Rotates selected modules/walls around the editor-computed pivot and applies collision/room validation.",
    preconditions: ["A rotatable module or wall selection must exist."],
    postconditions: ["A valid rotation is committed to undo history; invalid geometry is restored."],
    units: { angleDeg: "degrees, positive is counter-clockwise in plan" },
    examples: [{ angleDeg: 90 }],
    readOnly: false,
    riskLevel: "medium",
    requiresConfirmation: false,
    inputSchema: {
      type: "object",
      properties: { angleDeg: { type: "number", minimum: -360, maximum: 360 } },
      required: ["angleDeg"],
      additionalProperties: false
    }
  },
  {
    id: "editor.duplicateSelection",
    title: "Duplicate selection",
    description: "Duplicates the selected module(s) or wall through the shared layout actions controller.",
    ownerSystem: "layout-actions-controller",
    effect: "Creates editor-native duplicates using the existing placement/offset behavior and commits history when handled.",
    preconditions: ["A duplicatable module or wall must be selected."],
    postconditions: ["The duplicate becomes part of project state and can be undone."],
    examples: [{}],
    readOnly: false,
    riskLevel: "medium",
    requiresConfirmation: false,
    inputSchema: { type: "object", properties: {}, additionalProperties: false }
  },
  {
    id: "editor.deleteSelection",
    title: "Delete selection",
    description: "Deletes the current selection through the shared layout delete command.",
    ownerSystem: "layout-actions-controller",
    effect: "Deletes supported selected modules, walls, kitchen groups, floors, columns, sections, openings, underlays or delegated custom-editor entities.",
    preconditions: ["A deletable entity must be selected."],
    postconditions: ["Dependency cleanup and one undo history transaction follow the existing editor command."],
    examples: [{}],
    readOnly: false,
    riskLevel: "high",
    requiresConfirmation: true,
    inputSchema: { type: "object", properties: {}, additionalProperties: false }
  },
  {
    id: "history.undo",
    title: "Undo editor mutation",
    description: "Restores the previous layout history snapshot.",
    ownerSystem: "history-manager",
    effect: "Runs the same global undo operation used by the editor UI.",
    preconditions: ["Undo history must contain a previous snapshot."],
    postconditions: ["Project entities and selection are restored from the prior snapshot."],
    examples: [{}],
    readOnly: false,
    riskLevel: "medium",
    requiresConfirmation: false,
    inputSchema: { type: "object", properties: {}, additionalProperties: false }
  },
  {
    id: "history.redo",
    title: "Redo editor mutation",
    description: "Reapplies the next layout history snapshot.",
    ownerSystem: "history-manager",
    effect: "Runs the same global redo operation used by the editor UI.",
    preconditions: ["Redo history must contain a next snapshot."],
    postconditions: ["Project entities and selection are restored from the next snapshot."],
    examples: [{}],
    readOnly: false,
    riskLevel: "medium",
    requiresConfirmation: false,
    inputSchema: { type: "object", properties: {}, additionalProperties: false }
  },
  {
    id: "wall.create",
    title: "Create wall",
    description: "Creates one wall from exact plan endpoints using the wall controller.",
    ownerSystem: "wall-controller",
    effect: "Creates, solves and renders a wall; rejects a wall that would overlap a module; commits history on success.",
    preconditions: ["Endpoints must be distinct.", "The new wall must not overlap a module."],
    postconditions: ["The wall is added with tenant/editor defaults and is undoable."],
    units: { aMm: "millimetres", bMm: "millimetres", thicknessMm: "millimetres" },
    examples: [{ aMm: { x: 0, z: 0 }, bMm: { x: 3000, z: 0 }, thicknessMm: 150 }],
    readOnly: false,
    riskLevel: "medium",
    requiresConfirmation: false,
    inputSchema: {
      type: "object",
      properties: { aMm: point2dSchema, bMm: point2dSchema, thicknessMm: { type: "number", minimum: 10, maximum: 2000 } },
      required: ["aMm", "bMm"],
      additionalProperties: false
    }
  },
  {
    id: "opening.createDoor",
    title: "Create wall-hosted door",
    description: "Creates a door on an exact wall after checking wall bounds and conflicts with existing openings.",
    ownerSystem: "door-controls/opening-placement-validation",
    effect: "Adds one persisted door, rebuilds its host wall and records one history snapshot.",
    preconditions: ["wallId must identify an existing wall.", "The opening must fit entirely inside the host wall and not overlap another door or window."],
    postconditions: ["The new door is hosted on the requested wall and selected."],
    examples: [{ wallId: "wall_1", widthMm: 900, heightMm: 2100, centerMm: 1400 }],
    readOnly: false,
    requiresConfirmation: true,
    riskLevel: "medium",
    inputSchema: {
      type: "object",
      properties: doorOpeningPatchSchema.properties,
      required: ["wallId", "widthMm", "heightMm", "centerMm"],
      additionalProperties: false
    }
  },
  {
    id: "opening.createWindow",
    title: "Create wall-hosted window",
    description: "Creates a window on an exact wall after checking wall bounds and conflicts with existing openings.",
    ownerSystem: "window-controls/opening-placement-validation",
    effect: "Adds one persisted window, rebuilds its host wall and records one history snapshot.",
    preconditions: ["wallId must identify an existing wall.", "The opening must fit entirely inside the host wall and not overlap another door or window."],
    postconditions: ["The new window is hosted on the requested wall and selected."],
    examples: [{ wallId: "wall_1", widthMm: 1200, heightMm: 1000, sillHeightMm: 900, centerMm: 2500 }],
    readOnly: false,
    requiresConfirmation: true,
    riskLevel: "medium",
    inputSchema: {
      type: "object",
      properties: windowOpeningPatchSchema.properties,
      required: ["wallId", "widthMm", "heightMm", "sillHeightMm", "centerMm"],
      additionalProperties: false
    }
  },
  {
    id: "opening.updateDoor",
    title: "Update wall-hosted door",
    description: "Updates exact door parameters only when the resulting opening remains valid on its host wall.",
    ownerSystem: "door-controls/opening-placement-validation",
    effect: "Changes one persisted door and records one history snapshot.",
    preconditions: ["id must identify an existing door.", "The resulting opening must fit and not overlap another opening."],
    postconditions: ["The host wall is rebuilt from validated door parameters."],
    examples: [{ id: "door_1", patch: { widthMm: 800, swingDirection: "right" } }],
    readOnly: false,
    requiresConfirmation: true,
    riskLevel: "medium",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", minLength: 1 }, patch: doorOpeningPatchSchema },
      required: ["id", "patch"],
      additionalProperties: false
    }
  },
  {
    id: "opening.updateWindow",
    title: "Update wall-hosted window",
    description: "Updates exact window parameters only when the resulting opening remains valid on its host wall.",
    ownerSystem: "window-controls/opening-placement-validation",
    effect: "Changes one persisted window and records one history snapshot.",
    preconditions: ["id must identify an existing window.", "The resulting opening must fit and not overlap another opening."],
    postconditions: ["The host wall is rebuilt from validated window parameters."],
    examples: [{ id: "window_1", patch: { sillHeightMm: 950, widthMm: 1100 } }],
    readOnly: false,
    requiresConfirmation: true,
    riskLevel: "medium",
    inputSchema: {
      type: "object",
      properties: { id: { type: "string", minLength: 1 }, patch: windowOpeningPatchSchema },
      required: ["id", "patch"],
      additionalProperties: false
    }
  },
  {
    id: "opening.delete",
    title: "Delete wall-hosted opening",
    description: "Deletes one exact door or window and rebuilds its host wall.",
    ownerSystem: "opening-controls",
    effect: "Removes one persisted opening and records one history snapshot.",
    preconditions: ["kind and id must identify an existing opening."],
    postconditions: ["The host wall no longer contains the opening cutout."],
    examples: [{ kind: "door", id: "door_1" }],
    readOnly: false,
    requiresConfirmation: true,
    riskLevel: "medium",
    inputSchema: {
      type: "object",
      properties: { kind: { type: "string", enum: ["door", "window"] }, id: { type: "string", minLength: 1 } },
      required: ["kind", "id"],
      additionalProperties: false
    }
  },
  {
    id: "floor.create",
    title: "Create floor",
    description: "Creates a floor slab from a closed plan boundary through the floor controller.",
    ownerSystem: "floor-controller",
    effect: "Builds the floor geometry with the requested material and commits history.",
    preconditions: ["Boundary must contain at least three distinct points.", "materialId must exist in the tenant catalog."],
    postconditions: ["A new persisted floor entity is added and is undoable."],
    units: { boundary: "millimetres", heightMm: "millimetres", thicknessMm: "millimetres" },
    examples: [{ name: "Room floor", heightMm: 0, thicknessMm: 40, materialId: "mat.floor", boundary: [{ x: 0, z: 0 }, { x: 4000, z: 0 }, { x: 4000, z: 3000 }, { x: 0, z: 3000 }] }],
    readOnly: false,
    riskLevel: "medium",
    requiresConfirmation: false,
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", minLength: 1, maxLength: 160 },
        heightMm: { type: "number" },
        thicknessMm: { type: "number", minimum: 1, maximum: 5000 },
        materialId: { type: "string", minLength: 1 },
        boundary: { type: "array", minItems: 3, items: point2dSchema }
      },
      required: ["name", "heightMm", "thicknessMm", "materialId", "boundary"],
      additionalProperties: false
    }
  },
  {
    id: "column.create",
    title: "Create column",
    description: "Creates a square, rectangular or round column through the column controller.",
    ownerSystem: "column-controller",
    effect: "Normalizes column parameters, creates geometry and commits history.",
    preconditions: ["Dimensions must be positive.", "materialId must exist in the tenant catalog."],
    postconditions: ["A new persisted column entity is added and is undoable."],
    units: { xMm: "millimetres", zMm: "millimetres", dimensions: "millimetres" },
    examples: [{ name: "Column", shape: "square", xMm: 1200, zMm: 800, widthMm: 300, depthMm: 300, diameterMm: 300, heightMm: 2700, materialId: "mat.wall" }],
    readOnly: false,
    riskLevel: "medium",
    requiresConfirmation: false,
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", minLength: 1, maxLength: 160 },
        shape: { type: "string", enum: ["square", "rectangular", "round"] },
        xMm: { type: "number" }, zMm: { type: "number" },
        justifyX: { type: "string", enum: ["left", "center", "right"] },
        justifyY: { type: "string", enum: ["up", "center", "down"] },
        widthMm: { type: "number", minimum: 1 }, depthMm: { type: "number", minimum: 1 },
        diameterMm: { type: "number", minimum: 1 }, heightMm: { type: "number", minimum: 1 },
        materialId: { type: "string", minLength: 1 }
      },
      required: ["name", "shape", "xMm", "zMm", "widthMm", "depthMm", "diameterMm", "heightMm", "materialId"],
      additionalProperties: false
    }
  },
  {
    id: "section.create",
    title: "Create section line",
    description: "Creates a persistent section marker from two plan points.",
    ownerSystem: "section-controller",
    effect: "Creates the section line and its derived viewer tab, then commits history.",
    preconditions: ["Endpoints must be distinct."],
    postconditions: ["A new persisted section entity is added and is undoable."],
    units: { aMm: "millimetres", bMm: "millimetres" },
    examples: [{ name: "Section A", aMm: { x: 0, z: 0 }, bMm: { x: 3000, z: 0 }, mirrored: false }],
    readOnly: false,
    riskLevel: "medium",
    requiresConfirmation: false,
    inputSchema: {
      type: "object",
      properties: { name: { type: "string", minLength: 1, maxLength: 160 }, aMm: point2dSchema, bMm: point2dSchema, mirrored: { type: "boolean" } },
      required: ["name", "aMm", "bMm", "mirrored"],
      additionalProperties: false
    }
  },
  {
    id: "catalog.insertModule",
    title: "Insert tenant catalog module",
    description: "Creates one enabled tenant catalog module from its registered module package.",
    ownerSystem: "catalog-module-placement",
    effect: "Builds defaults from the registered package, applies tenant kitchen materials/defaults, validates overrides and inserts the module into the target kitchen group.",
    preconditions: ["modulePackageId must be enabled for the authenticated tenant.", "A target or active kitchen group must exist.", "parameterOverrides must pass module validation."],
    postconditions: ["One catalog-backed module is inserted, selected and committed to undo history."],
    units: { parameterOverrides: "module schema; dimensions are millimetres" },
    examples: [{ modulePackageId: "drawer_low_v1", groupId: "kg1", parameterOverrides: { widthMm: 800 } }],
    readOnly: false,
    riskLevel: "high",
    requiresConfirmation: true,
    inputSchema: {
      type: "object",
      properties: {
        modulePackageId: { type: "string", minLength: 1 },
        groupId: { type: "string", minLength: 1 },
        parameterOverrides: { type: "object" }
      },
      required: ["modulePackageId"],
      additionalProperties: false
    }
  },
  {
    id: "vendorCatalog.insertResolvedModule",
    title: "Insert resolved PINO module",
    description: "Inserts one exact tenant-scoped PINO/Nobilia module that was already resolved from the user's text description.",
    ownerSystem: "vendor-catalog-assistant",
    effect: "Verifies the resolved catalog/package identity, validates initial parameters, inserts the module into the active kitchen group and commits history.",
    preconditions: ["The authenticated tenant must have the matching PINO/Nobilia vendor entry and enabled module package.", "The user must explicitly confirm."],
    postconditions: ["One exact vendor module is inserted and selected; the mutation is undoable."],
    units: { initialParams: "module schema; dimensions are millimetres" },
    examples: [{ catalogKey: "GBS-FB", productTemplateId: "pino_side_cabinet_gbs_fb_page245", productTemplateName: "Side cabinet", moduleType: "pino_side_cabinet", modulePackageId: "pino_nobilia_side_cabinet_vkh_2026_v1", initialParams: { type: "pino_side_cabinet", widthMm: 600 } }],
    readOnly: false,
    riskLevel: "high",
    requiresConfirmation: true,
    inputSchema: {
      type: "object",
      properties: {
        catalogKey: { type: "string" },
        productTemplateId: { type: "string" },
        productTemplateName: { type: "string" },
        moduleType: { type: "string" },
        modulePackageId: { type: "string" },
        initialParams: { type: "object" }
      },
      required: ["catalogKey", "productTemplateId", "moduleType", "modulePackageId", "initialParams"],
      additionalProperties: false
    }
  },
  {
    id: "project.save",
    title: "Save current project",
    description: "Saves the current project through the authenticated project service.",
    ownerSystem: "project-service",
    effect: "Builds the authoritative app/BOM snapshot and writes a new save revision with the existing concurrency contract.",
    preconditions: ["A current project must already exist.", "Project relationships must pass server validation."],
    postconditions: ["The project save revision and saved-at timestamp advance; stale concurrent saves fail instead of overwriting."],
    examples: [{}],
    readOnly: false,
    riskLevel: "medium",
    requiresConfirmation: false,
    inputSchema: { type: "object", properties: {}, additionalProperties: false }
  },
  {
    id: "export.download",
    title: "Download project export",
    description: "Starts one existing deterministic browser export after explicit confirmation.",
    ownerSystem: "export-actions",
    effect: "Generates and downloads the selected export from current project state.",
    preconditions: ["The browser must allow file downloads.", "The user must explicitly confirm the requested download."],
    postconditions: ["The browser has started the selected download; the tool never changes project geometry."],
    examples: [{ format: "layout-json" }, { format: "viewport-png" }],
    readOnly: false,
    riskLevel: "medium",
    requiresConfirmation: true,
    inputSchema: {
      type: "object",
      properties: { format: { type: "string", enum: ["layout-json", "scene-json", "website-initial-json", "website-final-json", "viewport-png"] } },
      required: ["format"],
      additionalProperties: false
    }
  },
  {
    id: "measure.createDistance",
    title: "Create associative distance measure",
    description: "Creates one live distance measure from two explicit plan points in millimetres.",
    ownerSystem: "measure-tools",
    effect: "Adds a visible associative measurement through the existing measurement owner without changing geometry.",
    preconditions: ["Endpoints must be distinct finite plan points."],
    postconditions: ["Returns the created measure id and measured distance in millimetres."],
    examples: [{ aMm: { x: 0, z: 0 }, bMm: { x: 2400, z: 0 } }],
    readOnly: false,
    riskLevel: "low",
    requiresConfirmation: false,
    inputSchema: {
      type: "object",
      properties: { aMm: measurePointSchema, bMm: measurePointSchema },
      required: ["aMm", "bMm"],
      additionalProperties: false
    }
  },
  {
    id: "editor.alignLines",
    title: "Align two object lines",
    description: "Aligns an exact target line to an exact parallel reference line using the existing alignment and lock owner.",
    ownerSystem: "wall-controller/align-locks",
    effect: "Moves the target wall, module or worktop feature to the reference and creates or refreshes the shared alignment lock.",
    preconditions: ["Both selectors must resolve to live lines.", "The selected lines must be parallel.", "The target must not be protected by a locked alignment joint."],
    postconditions: ["Returns the editor alignment result and records one history snapshot."],
    examples: [{ reference: { targetKind: "wall", targetId: "wall_1", lineRole: "center" }, target: { targetKind: "module", targetId: "module_1", lineRole: "edge" } }],
    readOnly: false,
    riskLevel: "medium",
    requiresConfirmation: true,
    inputSchema: {
      type: "object",
      properties: { reference: alignLineSelectorSchema, target: alignLineSelectorSchema },
      required: ["reference", "target"],
      additionalProperties: false
    }
  },
  {
    id: "editor.trimWallsToCorner",
    title: "Trim or extend walls to a corner",
    description: "Moves the specified endpoints of two non-parallel walls to their shared centerline intersection through the existing trim geometry and connected-wall owner.",
    ownerSystem: "pointer-trim-geometry/wall-controller",
    effect: "Trims or extends both specified wall endpoints, preserving their connected endpoints, then records one history step.",
    preconditions: ["Both wall IDs must exist and differ.", "Both endpoint selectors must be a or b.", "Neither wall may be pinned.", "Wall centerlines must not be parallel."],
    postconditions: ["The selected endpoints coincide at the wall centerline intersection.", "Connected endpoint groups and wall visuals are rebuilt through the existing owner."],
    examples: [{ targetWallId: "wall_1", targetEndpoint: "b", cutterWallId: "wall_2", cutterEndpoint: "a" }],
    readOnly: false,
    riskLevel: "medium",
    requiresConfirmation: true,
    inputSchema: {
      type: "object",
      properties: {
        targetWallId: { type: "string", minLength: 1 },
        targetEndpoint: { type: "string", enum: ["a", "b"] },
        cutterWallId: { type: "string", minLength: 1 },
        cutterEndpoint: { type: "string", enum: ["a", "b"] }
      },
      required: ["targetWallId", "targetEndpoint", "cutterWallId", "cutterEndpoint"],
      additionalProperties: false
    }
  },
  {
    id: "render.blenderPreview",
    title: "Render Blender material preview",
    description: "Opens the existing material review and returns the completed Blender preview result after explicit confirmation.",
    ownerSystem: "export-actions/blender-render",
    effect: "Runs the current project scene through the approved Blender preview workflow without changing project geometry.",
    preconditions: ["The user must explicitly confirm the render.", "The material review must be confirmed before Blender starts.", "The Blender export service must be available."],
    postconditions: ["Returns completed preview URL and any output paths, a cancellation, or an exact render failure."],
    examples: [{}],
    readOnly: false,
    riskLevel: "medium",
    requiresConfirmation: true,
    inputSchema: { type: "object", properties: {}, additionalProperties: false }
  },
  {
    id: "export.marketingPdf",
    title: "Download marketing quotation PDF",
    description: "Generates the existing BOM-backed marketing quotation PDF after explicit confirmation.",
    ownerSystem: "bom-marketing-pdf",
    effect: "Creates and downloads a PDF based on the current project's priced BOM without changing project geometry or prices.",
    preconditions: ["The project must contain at least one priced entity.", "The user must explicitly confirm the PDF download."],
    postconditions: ["Returns the exact generated filename and page count after the browser download starts."],
    examples: [{}],
    readOnly: false,
    riskLevel: "medium",
    requiresConfirmation: true,
    inputSchema: { type: "object", properties: {}, additionalProperties: false }
  },
  {
    id: "export.pricingWorkbook",
    title: "Download pricing workbook",
    description: "Generates the existing BOM-backed Create Sheet workbook after explicit confirmation.",
    ownerSystem: "bom-pricing-workbook",
    effect: "Creates and downloads an XLSX workbook from the current project's priced BOM without changing project geometry or prices.",
    preconditions: ["The project must contain at least one priced entity.", "The user must explicitly confirm the workbook download."],
    postconditions: ["Returns the exact generated filename and worksheet names after the browser download starts."],
    examples: [{}],
    readOnly: false,
    riskLevel: "medium",
    requiresConfirmation: true,
    inputSchema: { type: "object", properties: {}, additionalProperties: false }
  },
  {
    id: "customFurniture.create",
    title: "Create custom furniture boundary",
    description: "Creates one named custom-furniture object from a closed plan boundary in millimetres.",
    ownerSystem: "custom-furniture-controller",
    effect: "Adds an editable persisted furniture object, selects it and records one history snapshot.",
    preconditions: ["boundary must contain at least three distinct plan points."],
    postconditions: ["The custom-furniture editor owns subsequent board and boundary editing."],
    examples: [{ name: "Reception counter", boundary: [{ x: 0, z: 0 }, { x: 2400, z: 0 }, { x: 2400, z: 700 }, { x: 0, z: 700 }] }],
    readOnly: false,
    riskLevel: "medium",
    requiresConfirmation: true,
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", minLength: 1, maxLength: 160 },
        boundary: { type: "array", minItems: 3, items: customFurniturePointSchema },
        baseConstraint: { type: "string", enum: ["projectBase", "furnitureBase", "furnitureTop", "absolute"] },
        baseOffsetMm: { type: "number" },
        topConstraint: { type: "string", enum: ["projectBase", "furnitureBase", "furnitureTop", "absolute"] },
        topOffsetMm: { type: "number" }
      },
      required: ["name", "boundary"],
      additionalProperties: false
    }
  },
  {
    id: "customFurniture.patchBoard",
    title: "Update custom furniture board",
    description: "Updates a named board through the custom-furniture controller.",
    ownerSystem: "custom-furniture-controller",
    effect: "Rebuilds the board and records history.",
    preconditions: ["Furniture and board IDs must exist."],
    postconditions: ["The board reflects the validated patch."],
    examples: [{ furnitureId: "cf1", boardId: "b1", patch: { thicknessMm: 18 } }],
    readOnly: false,
    riskLevel: "medium",
    requiresConfirmation: true,
    inputSchema: { type: "object", properties: { furnitureId: { type: "string", minLength: 1 }, boardId: { type: "string", minLength: 1 }, patch: { type: "object", minProperties: 1, additionalProperties: true } }, required: ["furnitureId", "boardId", "patch"], additionalProperties: false }
  }
  ,{
    id: "wardrobe.create", title: "Create wardrobe", description: "Creates a new editable wardrobe through the existing wardrobe editor.", ownerSystem: "wardrobe-edit-mode", effect: "Adds a default wardrobe with corpus, back and starter boards.", preconditions: ["The wardrobe editor must be available."], postconditions: ["Returns the wardrobe group ID and its starter part IDs."], examples: [{}], readOnly: false, riskLevel: "medium", requiresConfirmation: true, inputSchema: { type: "object", properties: {}, additionalProperties: false }
  },
  {
    id: "wardrobe.addPart", title: "Add wardrobe board", description: "Adds an internal vertical, horizontal or back board to a named wardrobe.", ownerSystem: "wardrobe-edit-mode", effect: "Creates and selects the requested board through the existing wardrobe geometry owner.", preconditions: ["The wardrobe group must exist.", "Only one back board is allowed."], postconditions: ["Returns the new part ID."], examples: [{ groupId: "wg_1", kind: "horizontal" }], readOnly: false, riskLevel: "medium", requiresConfirmation: true, inputSchema: { type: "object", properties: { groupId: { type: "string", minLength: 1 }, kind: { type: "string", enum: ["vertical", "horizontal", "back"] } }, required: ["groupId", "kind"], additionalProperties: false }
  }
];

export const ASSISTANT_CAPABILITY_BOUNDARIES: AssistantCapabilityBoundary[] = [
  {
    id: "project-and-scene",
    title: "Project and scene inspection",
    status: "available",
    ownerSystem: "editor-context/project-service",
    supportedByTools: ["context.getSelection", "context.getScene", "context.getCurrentView", "context.queryObjects", "context.getObject", "project.getMetadata", "project.listRelated", "project.inspectMaterialUsage", "validation.inspectProject", "project.save"],
    exactBehavior: "The chatbot can inspect the current editor/view, filter exact objects, list related customer projects, inspect another project's material usage without loading it, validate relationships and save the open project. Project create/import/delete remain intentionally unexposed."
  },
  {
    id: "selection-transform-history",
    title: "Selection, transform and history",
    status: "available",
    ownerSystem: "selection/transform/layout-actions/history",
    supportedByTools: ["selection.set", "selection.setMany", "selection.clear", "view.focusObjects", "editor.moveSelection", "editor.rotateSelection", "editor.duplicateSelection", "editor.deleteSelection", "history.undo", "history.redo"],
    exactBehavior: "Calls reuse the same editor controllers as pointer/keyboard actions, including exact multi-selection, semantic 3D framing, collision checks, locked align checks, dependency cleanup and snapshots."
  },
  {
    id: "primitive-creation",
    title: "Walls, floors, columns and sections",
    status: "available",
    ownerSystem: "wall/floor/column/section controllers",
    supportedByTools: ["wall.create", "floor.create", "column.create", "section.create"],
    exactBehavior: "Creates persisted editor entities with millimetre inputs and the same geometry/history owners as the UI."
  },
  {
    id: "modules-and-catalogs",
    title: "Modules and tenant catalogs",
    status: "available",
    ownerSystem: "module-editor/catalog-service",
    supportedByTools: ["catalog.listModules", "catalog.searchModules", "catalog.searchMaterials", "module.getParameterSchema", "module.listPresets", "module.applyPreset", "module.replace", "catalog.insertModule", "vendorCatalog.insertResolvedModule", "module.patchSelectedParams"],
    exactBehavior: "Filters enabled tenant modules/materials, reads authoritative schemas and presets, replaces modules in place with rollback, inserts registered packages after confirmation, and validates rebuilds."
  },
  {
    id: "pricing-bom",
    title: "Pricing and BOM",
    status: "available",
    ownerSystem: "pricing-bom",
    supportedByTools: ["pricing.getSummary"],
    exactBehavior: "Returns a fresh BOM-backed quote summary; it does not edit prices, margins or catalog records."
  },
  {
    id: "worktops-kitchen-groups",
    title: "Worktops and kitchen-group geometry",
    status: "available",
    ownerSystem: "kitchen-edit/worktop controllers",
    supportedByTools: ["kitchen.validateCreate", "kitchen.create", "kitchen.getSummary", "kitchen.updateParameters", "kitchen.applyMaterial", "context.getScene", "context.queryObjects", "context.getObject", "editor.deleteSelection"],
    exactBehavior: "The chatbot creates straight/L/U kitchens from compact run JSON, lets app owners derive all geometry and collision-free placements, inspects counts/overlaps, updates kitchen parameters and applies materials across exact scopes.",
    limitation: "Photo input still requires at least one reliable real-world scale and complete run dimensions; the system intentionally refuses to invent millimetres from an unscaled image."
  },
  {
    id: "openings-measures-align-trim",
    title: "Openings, measurements, align and trim",
    status: "partially-available",
    ownerSystem: "opening/measure/align/wall tools",
    supportedByTools: ["context.queryObjects", "context.getObject", "opening.createDoor", "opening.createWindow", "opening.updateDoor", "opening.updateWindow", "opening.delete", "measure.createDistance", "editor.alignLines", "editor.trimWallsToCorner", "editor.moveSelection", "editor.deleteSelection"],
    exactBehavior: "Doors and windows can be created, changed or deleted through host-wall bounds and overlap validation, shared wall rebuilds and history. The agent can create a live associative distance measure from exact plan points, align exact live wall, module or worktop lines through the existing lock-aware owner, and trim or extend exact wall endpoints to a non-parallel wall intersection through the shared connected-wall owner.",
    limitation: "The stable trim contract currently covers two wall centerlines only; arbitrary cutter geometry remains pointer-only."
  },
  {
    id: "custom-furniture-wardrobe",
    title: "Custom furniture and wardrobe",
    status: "partially-available",
    ownerSystem: "custom-furniture/wardrobe editors",
    supportedByTools: ["context.getScene", "context.queryObjects", "context.getObject", "customFurniture.create", "customFurniture.patchBoard", "wardrobe.create", "wardrobe.addPart", "editor.deleteSelection"],
    exactBehavior: "The agent can create a named custom-furniture boundary, update a named board through its controller, create a wardrobe and add an internal vertical, horizontal or back board through the wardrobe editor; state can be observed and a selected delegated entity can use shared delete.",
    limitation: "Custom-furniture drawing, trim/align and precise wardrobe-part parameter editing remain inside their dedicated editors."
  },
  {
    id: "render-export",
    title: "Rendering and exports",
    status: "partially-available",
    ownerSystem: "render/export controllers",
    supportedByTools: ["export.download", "render.blenderPreview", "export.marketingPdf", "export.pricingWorkbook"],
    exactBehavior: "The assistant can launch existing deterministic layout, scene, website-snapshot JSON, viewport PNG, BOM-backed marketing PDF and Create Sheet workbook downloads after confirmation. It can also open the mandatory material review and return the completed Blender preview URL/output paths, cancellation, or exact render failure.",
    limitation: "Customer-specific outputs and other long-running render flows do not yet expose a verifiable assistant job/result contract."
  }
];

export function getAssistantToolDefinition(toolId: string): AssistantToolDefinition | null {
  return ASSISTANT_TOOL_DEFINITIONS.find((tool) => tool.id === toolId) ?? null;
}

export function assistantToolSummary(): string {
  return ASSISTANT_TOOL_DEFINITIONS
    .map((tool) => [
      `${tool.id}: ${tool.description}`,
      `owner=${tool.ownerSystem} risk=${tool.riskLevel} confirm=${tool.requiresConfirmation}`,
      `effect=${tool.effect}`,
      `preconditions=${tool.preconditions.join(" | ")}`,
      `inputSchema=${JSON.stringify(tool.inputSchema)}`,
      `example=${JSON.stringify(tool.examples[0] ?? {})}`
    ].join("\n"))
    .join("\n");
}

const reversibleToolIds = new Set([
  "module.patchSelectedParams",
  "editor.moveSelection",
  "editor.rotateSelection",
  "editor.duplicateSelection",
  "editor.deleteSelection",
  "wall.create",
  "floor.create",
  "column.create",
  "section.create",
  "catalog.insertModule",
  "vendorCatalog.insertResolvedModule"
]);

const verificationToolsByToolId: Record<string, string[]> = {
  "module.patchSelectedParams": ["context.getObject", "validation.inspectProject"],
  "editor.moveSelection": ["context.queryObjects", "validation.inspectProject"],
  "editor.rotateSelection": ["context.queryObjects", "validation.inspectProject"],
  "editor.duplicateSelection": ["context.queryObjects", "validation.inspectProject"],
  "editor.deleteSelection": ["context.queryObjects", "validation.inspectProject"],
  "wall.create": ["context.queryObjects", "validation.inspectProject"],
  "floor.create": ["context.queryObjects", "validation.inspectProject"],
  "column.create": ["context.queryObjects", "validation.inspectProject"],
  "section.create": ["context.queryObjects", "validation.inspectProject"],
  "catalog.insertModule": ["context.queryObjects", "pricing.getSummary", "validation.inspectProject"],
  "vendorCatalog.insertResolvedModule": ["context.queryObjects", "pricing.getSummary", "validation.inspectProject"],
  "project.save": ["project.getMetadata"]
};

const roleRank: Record<ClientRole, number> = { viewer: 0, designer: 1, admin: 2, owner: 3 };

export function minimumAssistantRole(tool: AssistantToolDefinition): ClientRole {
  return tool.minimumRole ?? ((tool.operation ?? (tool.readOnly ? "read" : "write")) === "write" ? "designer" : "viewer");
}

export function canRoleUseAssistantTool(role: ClientRole, tool: AssistantToolDefinition): boolean {
  return roleRank[role] >= roleRank[minimumAssistantRole(tool)];
}

export function assistantToolsForRole(role: ClientRole): AssistantToolDefinition[] {
  return ASSISTANT_TOOL_DEFINITIONS.filter((tool) => canRoleUseAssistantTool(role, tool));
}

export function assistantToolMetadataForOrchestrator(toolIds?: ReadonlySet<string>, role?: ClientRole): AssistantOrchestratorToolMetadata[] {
  return ASSISTANT_TOOL_DEFINITIONS
    .filter((tool) => (!toolIds || toolIds.has(tool.id)) && (!role || canRoleUseAssistantTool(role, tool)))
    .map((tool) => ({
    id: tool.id,
    title: tool.title,
    description: tool.description,
    ownerSystem: tool.ownerSystem,
    operation: tool.operation ?? (tool.readOnly ? "read" : "write"),
    domain: tool.domain ?? tool.id.split(".")[0] ?? "editor",
    effect: tool.effect,
    preconditions: [...tool.preconditions],
    postconditions: [...tool.postconditions],
    inputSchema: tool.inputSchema,
    outputSchema: tool.outputSchema ?? { type: "object" },
    riskLevel: tool.riskLevel,
    requiresConfirmation: tool.requiresConfirmation,
    reversible: tool.reversible ?? reversibleToolIds.has(tool.id),
    verificationTools: [...(tool.verificationTools ?? verificationToolsByToolId[tool.id] ?? [])],
    tags: [...(tool.tags ?? [])],
    minimumRole: minimumAssistantRole(tool)
  }));
}

export function highestAssistantRiskLevel(toolIds: string[]): AssistantRiskLevel {
  const rank: Record<AssistantRiskLevel, number> = { low: 0, medium: 1, high: 2 };
  return toolIds.reduce<AssistantRiskLevel>((highest, id) => {
    const next = getAssistantToolDefinition(id)?.riskLevel ?? "low";
    return rank[next] > rank[highest] ? next : highest;
  }, "low");
}
