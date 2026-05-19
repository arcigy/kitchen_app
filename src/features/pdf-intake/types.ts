export type PageType = "furniture_schedule" | "floor_plan" | "measurement_floor_plan" | "visualization" | "irrelevant";

export interface PageClassificationInput {
  pageNumber: number;
  extractedText: string;
}

export interface PageClassification {
  pageNumber: number;
  predictedType: PageType;
  confidence: number;
  reasons: string[];
  extractedTextPreview: string;
}

export interface PageClassifier {
  classifyPage(input: PageClassificationInput): Promise<PageClassification>;
}

export interface PdfPageExtraction {
  pageNumber: number;
  extractedText: string;
  thumbnailDataUrl: string;
  width: number;
  height: number;
}

export interface PdfExtractionResult {
  fileName: string;
  totalPages: number;
  pages: PdfPageExtraction[];
}

export interface PageReviewItem extends PageClassification {
  finalType: PageType;
  wasManuallyEdited: boolean;
  expectedType?: PageType;
  extractedText: string;
  thumbnailDataUrl: string;
}

export type RoomType =
  | "kitchen"
  | "kitchen_living_room"
  | "living_room"
  | "bedroom"
  | "bathroom"
  | "wc"
  | "guest_wc"
  | "entry_hall"
  | "hallway"
  | "corridor_stairs"
  | "stairs"
  | "office"
  | "children_room"
  | "boiler_room"
  | "utility_room"
  | "utility_laundry"
  | "laundry"
  | "laundry_room"
  | "walk_in_closet"
  | "unknown";

export type FurnitureType =
  | "wardrobe"
  | "kitchen"
  | "cabinet"
  | "built_in_cabinet"
  | "shelves"
  | "tv_unit"
  | "vanity"
  | "desk"
  | "bench"
  | "dresser"
  | "wall_panel"
  | "laundry_cabinet"
  | "partition"
  | "island"
  | "countertop"
  | "mirror"
  | "tv"
  | "appliance"
  | "sink"
  | "toilet"
  | "bathtub"
  | "shower"
  | "decor"
  | "drying_rack"
  | "picture"
  | "air_conditioner"
  | "armchair"
  | "rug"
  | "lighting"
  | "bed"
  | "sofa"
  | "table"
  | "chair"
  | "unknown";

export interface ContextFloor {
  id: string;
  label: string;
  pageNumbers: number[];
  confidence: number;
  reasons: string[];
}

export type ViewKind = "2d_plan" | "3d_floor_plan" | "room_visualization" | "technical_sheet" | "unknown";
export type DocumentKind = "floor_plan" | "measurement_floor_plan" | "furniture_technical_sheet" | "visualization" | "unknown";

export interface ProjectPageReference {
  pageNumber: number;
  pageType: PageType;
  viewKind: ViewKind;
  documentKind: DocumentKind;
  roomIds: string[];
  floorIds: string[];
  title: string;
}

export type FurnitureImportance = "primary" | "secondary" | "irrelevant" | "unknown";
export type FurnitureCategory = FurnitureType;
export type FurnitureInventoryStatus = "detected" | "manual" | "ignored";

export interface FurnitureInventoryItem {
  itemId: string;
  displayName: string;
  category: FurnitureCategory;
  importance: FurnitureImportance;
  roomId?: string;
  floorId?: string;
  sourcePageNumbers: number[];
  sourceTexts: string[];
  confidence: number;
  reasons: string[];
  status: FurnitureInventoryStatus;
}

export interface RoomFurnitureInventoryRoom {
  roomId: string;
  roomNumber?: string;
  roomNameOriginal?: string;
  roomType: string;
  floorId?: string;
  items: FurnitureInventoryItem[];
  sourcePageNumbers: number[];
  confidence: number;
  warnings: string[];
}

export interface RoomFurnitureInventory {
  fileName: string;
  rooms: RoomFurnitureInventoryRoom[];
  unassignedItems: FurnitureInventoryItem[];
  cleanupActions?: CleanupActionAudit[];
  summary: {
    totalRooms: number;
    totalPrimaryItems: number;
    totalSecondaryItems: number;
    totalUnassignedItems: number;
    roomsWithoutFurniture: number;
  };
}

export interface CleanupActionAudit {
  actionId: string;
  source: "heuristic" | "ai";
  actionType: "assign_room" | "merge_duplicate" | "keep_separate" | "room_status";
  modelName?: string;
  inputSummary: string;
  confidence: number;
  reason: string;
  itemIds?: string[];
  roomId?: string;
  status?: string;
}

export interface RoomFurnitureInventoryEvaluationReport {
  fileName: string;
  roomsWithFurnitureFound: number;
  primaryItems: {
    expected: number;
    found: number;
    missing: string[];
  };
  secondaryItems: {
    expected: number;
    found: number;
    missing: string[];
  };
  wrongCategory: Array<{ expectedItemId: string; actualItemId?: string; expectedCategory: FurnitureCategory; actualCategory?: FurnitureCategory }>;
  wrongImportance: Array<{ expectedItemId: string; actualItemId?: string; expectedImportance: FurnitureImportance; actualImportance?: FurnitureImportance }>;
  wrongRoomAssignments: Array<{ expectedItemId: string; actualItemId?: string; expectedRoomId?: string; actualRoomId?: string }>;
  unassignedPrimaryItems: FurnitureInventoryItem[];
  lowConfidencePrimaryItems: FurnitureInventoryItem[];
  readiness: {
    level: "green" | "yellow" | "red";
    primaryReadiness: number;
    reasons: string[];
  };
}

export type DetailedFurnitureCategory =
  | "wardrobe"
  | "built_in_cabinet"
  | "cabinet"
  | "shelves"
  | "bench"
  | "mirror"
  | "wall_panel"
  | "kitchen"
  | "desk"
  | "tv_unit"
  | "vanity"
  | "countertop"
  | "appliance"
  | "sink"
  | "toilet"
  | "bathtub"
  | "shower"
  | "bed"
  | "chair"
  | "table"
  | "sofa"
  | "armchair"
  | "unknown";

export type DetailedFurnitureImportance = "primary" | "secondary" | "unknown";

export type DetailedFurnitureComponent =
  | "closed_cabinet"
  | "open_shelves"
  | "hanger_section"
  | "drawers"
  | "bench"
  | "mirror"
  | "wall_panel"
  | "unknown";

export interface DetailedFurnitureItem {
  itemId: string;
  displayName: string;
  category: DetailedFurnitureCategory;
  importance: DetailedFurnitureImportance;
  dimensions: {
    widthMm?: number | null;
    heightMm?: number | null;
    depthMm?: number | null;
    rawDimensionTexts: string[];
  };
  components: DetailedFurnitureComponent[];
  materials: Array<{
    rawText: string;
    brand?: string;
    code?: string;
    decorName?: string;
    confidence: number;
  }>;
  sourcePageNumbers: number[];
  sourceTexts: string[];
  confidence: number;
  needsHumanReview: boolean;
  reasons: string[];
}

export interface RoomDetailExtraction {
  fileName: string;
  roomId: string;
  roomType: string;
  roomNameOriginal?: string;
  sourcePageNumbers: number[];
  items: DetailedFurnitureItem[];
  warnings: string[];
  confidence: number;
}

export type FurnitureGroupCategory =
  | "wardrobe_set"
  | "kitchen_set"
  | "bathroom_set"
  | "office_set"
  | "children_room_set"
  | "wall_panel_set"
  | "storage_set"
  | "laundry_set"
  | "unknown_set";

export type FurnitureGroupBaseCategory =
  | "wardrobe"
  | "kitchen"
  | "cabinet"
  | "shelves"
  | "desk"
  | "vanity"
  | "wall_panel"
  | "storage"
  | "unknown";

export type ApproxFurnitureModuleBaseCategory =
  | "wardrobe"
  | "cabinet"
  | "shelves"
  | "drawer_unit"
  | "bench"
  | "panel"
  | "countertop"
  | "appliance_tower"
  | "unknown";

export interface ApproxFurnitureModule {
  moduleId: string;
  baseCategory: ApproxFurnitureModuleBaseCategory;
  label?: string;
  sourcePageNumbers: number[];
  confidence: number;
  needsDeepExtraction: boolean;
  reasons: string[];
}

export type AssociatedFurnitureCategory =
  | "mirror"
  | "tv"
  | "lighting"
  | "appliance"
  | "sink"
  | "decor"
  | "handle"
  | "plinth"
  | "unknown";

export type AssociatedFurnitureRelation =
  | "integrated"
  | "nearby"
  | "context"
  | "material_reference"
  | "unknown";

export interface AssociatedFurnitureItem {
  itemId: string;
  category: AssociatedFurnitureCategory;
  relation: AssociatedFurnitureRelation;
  sourcePageNumbers: number[];
  confidence: number;
  reasons: string[];
}

export type StandaloneFurnitureCategory =
  | "bench"
  | "table"
  | "chair"
  | "sofa"
  | "bed"
  | "armchair"
  | "loose_cabinet"
  | "appliance"
  | "unknown";

export interface StandaloneFurnitureItem {
  itemId: string;
  category: StandaloneFurnitureCategory;
  displayName: string;
  sourcePageNumbers: number[];
  rawDimensionTexts: string[];
  materials: DetailedFurnitureItem["materials"];
  confidence: number;
  needsDeepExtraction: boolean;
  reasons: string[];
}

export interface FurnitureStructureCandidate {
  candidateId: string;
  category: string;
  sourcePageNumbers: number[];
  sourceTexts: string[];
  reason: string;
  confidence: number;
}

export interface FurnitureGroup {
  groupId: string;
  displayName: string;
  groupCategory: FurnitureGroupCategory;
  baseCategory: FurnitureGroupBaseCategory;
  roomId: string;
  sourcePageNumbers: number[];
  approximateModuleCount?: number | null;
  modules: ApproxFurnitureModule[];
  associatedItems: AssociatedFurnitureItem[];
  rawDimensionTexts: string[];
  materials: DetailedFurnitureItem["materials"];
  confidence: number;
  needsDeepExtraction: boolean;
  reasons: string[];
}

export interface RoomFurnitureStructure {
  fileName: string;
  roomId: string;
  roomType: string;
  roomNameOriginal?: string;
  sourcePageNumbers: number[];
  furnitureGroups: FurnitureGroup[];
  standaloneItems: StandaloneFurnitureItem[];
  unassignedCandidates: FurnitureStructureCandidate[];
  warnings: string[];
  confidence: number;
}

export interface RoomFurnitureStructureEvaluationReport {
  fileName: string;
  roomId: string;
  groups: {
    expected: number;
    found: number;
    missing: string[];
    wrongCategory: Array<{
      expectedGroupId: string;
      actualGroupId?: string;
      expectedCategory: FurnitureGroupCategory;
      actualCategory?: FurnitureGroupCategory;
    }>;
    moduleCountDifferences: Array<{
      expectedGroupId: string;
      actualGroupId?: string;
      expectedCount: number | null;
      actualCount: number | null;
      withinTolerance: boolean;
    }>;
    duplicateGroupCount: number;
  };
  standaloneItems: {
    expected: number;
    found: number;
    missing: string[];
  };
  associatedItems: {
    expected: number;
    found: number;
    missing: string[];
  };
  materials: {
    expected: number;
    found: number;
    missing: string[];
  };
  readinessForDeepExtraction: {
    level: "green" | "yellow" | "red";
    reasons: string[];
  };
}

export type DocumentMapPageType =
  | "furniture_floor_plan"
  | "measurement_floor_plan"
  | "technical_floor_plan"
  | "furniture_technical_sheet"
  | "visualization"
  | "irrelevant"
  | "unknown";

export type DocumentMapDocumentKind =
  | "furniture_plan"
  | "measurement_plan"
  | "furniture_technical_sheet"
  | "furniture_schedule_table"
  | "room_visualization"
  | "plumbing_plan"
  | "heating_plan"
  | "electrical_plan"
  | "lighting_plan"
  | "sockets_plan"
  | "switches_plan"
  | "ventilation_plan"
  | "demolition_plan"
  | "installation_plan"
  | "wall_finish_plan"
  | "flooring_plan"
  | "ceiling_plan"
  | "door_plan"
  | "sections"
  | "technical_report"
  | "unknown";

export type DocumentMapTechnicalSubtype =
  | "plumbing"
  | "heating"
  | "electrical"
  | "lighting"
  | "sockets"
  | "switches"
  | "ventilation"
  | "demolition"
  | "installation"
  | "wall_finish"
  | "flooring"
  | "ceiling"
  | "doors"
  | "sections"
  | "unknown";

export type RoomTableFormat = "row" | "column_block" | "mixed" | "none";

export interface KnownRoomParameters {
  areaM2?: number | null;
  perimeterM?: number | null;
  heightMm?: number | null;
  floorMaterial?: string | null;
  wallMaterial?: string | null;
  ceilingMaterial?: string | null;
  wallFinish?: string | null;
  floorFinish?: string | null;
  ceilingFinish?: string | null;
  lightingNotes?: string | null;
  electricalNotes?: string | null;
  plumbingNotes?: string | null;
  notes?: string | null;
}

export interface ExtraExtractedParameter {
  keyOriginal: string;
  keyNormalized?: string | null;
  valueOriginal: string;
  valueNormalized?: string | null;
  unit?: string | null;
  sourcePageNumber: number;
  confidence: number;
  reason: string;
}

export interface DocumentMapRoom {
  roomId: string;
  roomNumber?: string | null;
  nameOriginal?: string | null;
  roomType: string;
  floorId: string;
  knownParameters: KnownRoomParameters;
  extraParameters: ExtraExtractedParameter[];
  sourcePageNumbers: number[];
  confidence: number;
  warnings: string[];
}

export interface DocumentMapPage {
  pageNumber: number;
  pageTitleOriginal?: string | null;
  pageTitleNormalized?: string | null;
  pageType: DocumentMapPageType;
  documentKind: DocumentMapDocumentKind;
  technicalSubtype?: DocumentMapTechnicalSubtype | null;
  floorId?: string | null;
  floorOriginal?: string | null;
  roomHints: string[];
  roomNameOriginalHints: string[];
  isPrimaryFurniturePlan: boolean;
  isFallbackMeasurementPlan: boolean;
  roomsDetected: DocumentMapRoom[];
  roomTableDetected: boolean;
  roomTableFormat: RoomTableFormat;
  roomTableConfidence: number;
  excludeReason?: string | null;
  confidence: number;
  needsReview: boolean;
  reasons: string[];
  warnings: string[];
}

export interface DocumentMapFloor {
  floorId: string;
  floorOriginalLabels: string[];
  primaryFurniturePlanPages: number[];
  fallbackMeasurementPlanPages: number[];
  technicalPlanPages: number[];
  rooms: DocumentMapRoom[];
  confidence: number;
  warnings: string[];
}

export interface RoomPageLink {
  roomId?: string | null;
  roomType?: string | null;
  roomNameOriginal?: string | null;
  floorId?: string | null;
  pageNumbers: number[];
  linkTypes: Array<
    | "furniture_technical_sheet"
    | "visualization"
    | "furniture_floor_plan"
    | "measurement_floor_plan"
    | "technical_context"
  >;
  confidence: number;
  reasons: string[];
}

export interface DocumentMap {
  fileName: string;
  documentMapVersion: "1.0";
  pages: DocumentMapPage[];
  floors: DocumentMapFloor[];
  roomPageLinks: RoomPageLink[];
  warnings: string[];
  confidence: number;
}

export interface DocumentMapEvaluationReport {
  fileName: string;
  pageTypeAccuracy: number;
  relevantPageRecall: number;
  furnitureFloorPlanRecall: number;
  floorDetectionAccuracy: number;
  falsePositiveTechnicalAsFurniture: number;
  evaluatedPages: number;
  primaryFurniturePlan: {
    expectedFloors: number;
    foundFloors: number;
    missingFloorIds: string[];
  };
  rooms: {
    expected: number;
    found: number;
    missing: string[];
    roomTypeMatches: number;
    areaMatches: number;
    areaTolerance: number;
  };
  roomPageLinks: {
    expected: number;
    found: number;
    missing: string[];
  };
  warnings: string[];
}

export type PageVisionClassification =
  | "furniture_floor_plan"
  | "measurement_floor_plan"
  | "technical_floor_plan"
  | "furniture_technical_sheet"
  | "visualization"
  | "irrelevant"
  | "unknown";

export type WallVisibility = "high" | "medium" | "low" | "none" | "unknown";

export interface PageVisionValidationInput {
  pageNumber: number;
  imageDataUrl: string;
  extractedText: string;
  title?: string;
}

export interface PageVisionValidationResult {
  pageNumber: number;
  pageKind: PageVisionClassification;
  hasWalls: boolean;
  hasDimensionLines: boolean;
  hasFurniture: boolean;
  hasTechnicalSymbols: boolean;
  wallVisibility: WallVisibility;
  confidence: number;
  reason: string;
}

export type InventoryDuplicateGroupStatus = "open" | "merged" | "keep_separate" | "ignored_duplicate";
export type InventoryRoomCleanupStatus = "open" | "no_custom_furniture" | "needs_ai_vision_later";

export interface InventoryCleanupUnassignedPrimary {
  item: FurnitureInventoryItem;
  suggestedRoomId?: string;
  suggestedRoomLabel?: string;
  reasons: string[];
}

export interface InventoryDuplicateGroup {
  groupId: string;
  category: FurnitureCategory;
  roomId?: string;
  sourcePageNumbers: number[];
  items: FurnitureInventoryItem[];
  status: InventoryDuplicateGroupStatus;
  reasons: string[];
}

export interface InventoryCleanupRoomWithoutFurniture {
  roomId: string;
  roomLabel: string;
  roomType: string;
  relatedPageNumbers: number[];
  status: InventoryRoomCleanupStatus;
}

export interface InventoryCleanupReview {
  unassignedPrimaryItems: InventoryCleanupUnassignedPrimary[];
  duplicateGroups: InventoryDuplicateGroup[];
  roomsWithoutPrimary: InventoryCleanupRoomWithoutFurniture[];
  readiness: {
    unassignedPrimaryCount: number;
    duplicateGroupCount: number;
    roomsWithoutPrimaryCount: number;
    readyForDetailedExtraction: boolean;
  };
}

export interface ContextRoom {
  id: string;
  type: RoomType;
  functions?: Exclude<RoomType, "unknown">[];
  roomNumber?: string;
  nameOriginal: string;
  area?: number;
  floorId?: string;
  pageNumbers: number[];
  confidence: number;
  reasons: string[];
}

export interface ContextFurniture {
  id: string;
  type: FurnitureType;
  roomId?: string;
  pageNumber: number;
  confidence: number;
  reasons: string[];
}

export interface ProjectContext {
  floors: ContextFloor[];
  rooms: ContextRoom[];
  furniture: ContextFurniture[];
  unassignedPages: number[];
}

export interface ProjectContextRelatedPage {
  pageNumber: number;
  floorIds: string[];
  roomIds: string[];
  furnitureIds: string[];
}

export interface ProjectContextExport {
  fileName: string;
  floors: Array<ContextFloor & { relatedPages: number[] }>;
  rooms: Array<ContextRoom & { nameNormalized: RoomType; functions: Exclude<RoomType, "unknown">[]; areaM2?: number; relatedPages: number[] }>;
  detectedFurniture: Array<ContextFurniture & { typeNormalized: FurnitureType; relatedPages: number[] }>;
  relatedPages: ProjectContextRelatedPage[];
  unassignedPages: number[];
  confidence: number;
  reasons: string[];
}

export interface ProjectContextEvaluationReport {
  fileName: string;
  floorDetection: {
    expected: number;
    found: number;
    missing: string[];
    accuracy: number;
  };
  roomDetection: {
    expected: number;
    found: number;
    missing: string[];
    nameNormalizedMatches: number;
    areaMatches: number;
    areaTolerance: number;
  };
  furnitureDetection: {
    expected: number;
    found: number;
    missing: string[];
    typeNormalizedMatches: number;
    roomAssignmentMatches: number;
    wrongRoomAssignments: Array<{ expectedFurnitureId: string; expectedRoomId?: string; actualRoomId?: string }>;
  };
  relatedPageAssignment: {
    expected: number;
    correct: number;
    wrong: number;
    missing: number;
    mistakes: Array<{ expectedOwnerId: string; pageNumber: number; status: "wrong" | "missing" }>;
  };
  unassignedPages: number[];
}

export type EvaluationStatus = "correct" | "wrong" | "unknown";

export type ConfusionMatrix = Record<PageType, Record<PageType, number>>;

export interface GroundTruthPage {
  pageNumber: number;
  expectedType: PageType;
}

export interface GroundTruthPayload {
  fileName: string;
  pages: GroundTruthPage[];
}

export interface EvaluationMistake {
  pageNumber: number;
  expectedType: PageType;
  predictedType: PageType;
  finalType: PageType;
  reasons: string[];
}

export interface EvaluationErrorSummary {
  expectedType: PageType;
  predictedType: PageType;
  count: number;
}

export interface EvaluationReport {
  fileName: string;
  totalPages: number;
  evaluatedPages: number;
  accuracy: number;
  confusionMatrix: ConfusionMatrix;
  mistakes: EvaluationMistake[];
  correctCount: number;
  wrongCount: number;
  frequentErrors: EvaluationErrorSummary[];
}

export type PageReviewFilter =
  | "all"
  | "relevant"
  | "furniture_schedule"
  | "floor_plan"
  | "measurement_floor_plan"
  | "visualization"
  | "irrelevant";

export const PAGE_TYPES: PageType[] = [
  "furniture_schedule",
  "floor_plan",
  "measurement_floor_plan",
  "visualization",
  "irrelevant"
];
