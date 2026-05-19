import { applyImportedPageTypes, createEvaluationReport, applyGroundTruth, getEvaluationStatus, parseGroundTruthJson } from "./evaluation";
import {
  buildAiCleanupInput,
  createAiCleanupAudit,
  generateAiCleanupSuggestions,
  type AiCleanupSuggestion
} from "./aiCleanup";
import { downloadEvaluationReportJson, downloadGroundTruthJson, downloadPageReviewJson } from "./exportPageReview";
import { evaluateProjectContext } from "./projectContextEvaluation";
import { createProjectContextExport, parseProjectContextJson, projectContextFileStem } from "./projectContextExport";
import { buildProjectContext } from "./projectContextBuilder";
import {
  buildDocumentMap,
  DOCUMENT_MAP_PAGE_TYPES,
  parseDocumentMapJson,
  type DocumentMapOverrides
} from "./documentMapBuilder";
import { evaluateDocumentMap } from "./documentMapEvaluation";
import {
  buildRoomFurnitureInventory,
  createInventoryCleanupReview,
  evaluateRoomFurnitureInventory,
  flattenInventoryItems,
  getFurnitureImportance,
  parseRoomFurnitureInventoryJson
} from "./roomFurnitureInventory";
import { buildRoomDetailExtraction } from "./roomDetailExtraction";
import { buildRoomFurnitureStructure, parseRoomFurnitureStructureJson } from "./roomFurnitureStructure";
import { evaluateRoomFurnitureStructure } from "./roomFurnitureStructureEvaluation";
import {
  buildRoomDetailVisionInput,
  runRoomDetailVisionExtraction,
  shouldRunVisionFallback
} from "./roomDetailVision";
import {
  PAGE_TYPES,
  type ContextFurniture,
  type ContextRoom,
  type CleanupActionAudit,
  type EvaluationReport,
  type FurnitureType,
  type PageReviewFilter,
  type PageReviewItem,
  type PageType,
  type ProjectContext,
  type ProjectContextEvaluationReport,
  type ProjectContextExport,
  type FurnitureCategory,
  type FurnitureImportance,
  type FurnitureInventoryItem,
  type InventoryCleanupReview,
  type InventoryDuplicateGroupStatus,
  type InventoryRoomCleanupStatus,
  type RoomFurnitureInventory,
  type RoomFurnitureInventoryEvaluationReport,
  type RoomDetailExtraction,
  type RoomFurnitureStructure,
  type RoomFurnitureStructureEvaluationReport,
  type DocumentMap,
  type DocumentMapEvaluationReport,
  type DocumentMapPageType,
  type DocumentMapRoom,
  type ExtraExtractedParameter,
  type RoomPageLink,
  type FurnitureGroupCategory,
  type FurnitureGroupBaseCategory,
  type ApproxFurnitureModuleBaseCategory,
  type AssociatedFurnitureCategory,
  type AssociatedFurnitureRelation,
  type StandaloneFurnitureCategory,
  type FurnitureInventoryStatus,
  type RoomType
} from "./types";

interface PageReviewOptions {
  fileName: string;
  pages: PageReviewItem[];
}

const FILTERS: Array<{ value: PageReviewFilter; label: string }> = [
  { value: "all", label: "Show all" },
  { value: "relevant", label: "Relevant only" },
  { value: "furniture_schedule", label: "Furniture schedules" },
  { value: "floor_plan", label: "Furniture floor plans" },
  { value: "measurement_floor_plan", label: "Measured floor plans" },
  { value: "visualization", label: "Visualizations" },
  { value: "irrelevant", label: "Irrelevant" }
];

const TYPE_LABELS: Record<PageType, string> = {
  furniture_schedule: "furniture_schedule",
  floor_plan: "floor_plan",
  measurement_floor_plan: "measurement_floor_plan",
  visualization: "visualization",
  irrelevant: "irrelevant"
};
const DOCUMENT_MAP_TYPE_LABELS: Record<DocumentMapPageType, string> = {
  furniture_floor_plan: "furniture_floor_plan",
  measurement_floor_plan: "measurement_floor_plan",
  technical_floor_plan: "technical_floor_plan",
  furniture_technical_sheet: "furniture_technical_sheet",
  visualization: "visualization",
  irrelevant: "irrelevant",
  unknown: "unknown"
};

const ROOM_TYPES: RoomType[] = ["kitchen", "living_room", "kitchen_living_room", "bedroom", "bathroom", "wc", "guest_wc", "entry_hall", "hallway", "corridor_stairs", "stairs", "office", "children_room", "boiler_room", "laundry_room", "utility_room", "utility_laundry", "laundry", "walk_in_closet", "unknown"];
const ROOM_FUNCTION_TYPES: Array<Exclude<RoomType, "unknown">> = ["kitchen", "living_room", "kitchen_living_room", "bedroom", "bathroom", "wc", "guest_wc", "entry_hall", "hallway", "corridor_stairs", "stairs", "office", "children_room", "boiler_room", "laundry_room", "utility_room", "utility_laundry", "laundry", "walk_in_closet"];
const FURNITURE_TYPES: FurnitureType[] = ["kitchen", "wardrobe", "cabinet", "built_in_cabinet", "shelves", "tv_unit", "vanity", "desk", "bed", "bench", "dresser", "wall_panel", "laundry_cabinet", "partition", "island", "countertop", "mirror", "tv", "sofa", "table", "chair", "armchair", "rug", "lighting", "appliance", "sink", "toilet", "bathtub", "shower", "decor", "drying_rack", "picture", "air_conditioner", "unknown"];
const INVENTORY_IMPORTANCE: FurnitureImportance[] = ["primary", "secondary", "irrelevant", "unknown"];
const INVENTORY_STATUS: FurnitureInventoryStatus[] = ["detected", "manual", "ignored"];
const FURNITURE_GROUP_CATEGORIES: FurnitureGroupCategory[] = ["wardrobe_set", "kitchen_set", "bathroom_set", "office_set", "children_room_set", "wall_panel_set", "storage_set", "laundry_set", "unknown_set"];
const FURNITURE_GROUP_BASE_CATEGORIES: FurnitureGroupBaseCategory[] = ["wardrobe", "kitchen", "cabinet", "shelves", "desk", "vanity", "wall_panel", "storage", "unknown"];
const APPROX_MODULE_CATEGORIES: ApproxFurnitureModuleBaseCategory[] = ["wardrobe", "cabinet", "shelves", "drawer_unit", "bench", "panel", "countertop", "appliance_tower", "unknown"];
const ASSOCIATED_FURNITURE_CATEGORIES: AssociatedFurnitureCategory[] = ["mirror", "tv", "lighting", "appliance", "sink", "decor", "handle", "plinth", "unknown"];
const ASSOCIATED_FURNITURE_RELATIONS: AssociatedFurnitureRelation[] = ["integrated", "nearby", "context", "material_reference", "unknown"];
const STANDALONE_FURNITURE_CATEGORIES: StandaloneFurnitureCategory[] = ["bench", "table", "chair", "sofa", "bed", "armchair", "loose_cabinet", "appliance", "unknown"];

interface CleanupSuggestion {
  id: string;
  label: string;
  safe: boolean;
  action: "assign_room" | "merge_duplicate" | "review_duplicate" | "review_room_without_primary" | "manual_room_assignment";
  itemId?: string;
  roomId?: string;
  duplicateGroupId?: string;
  duplicateItemIds?: string[];
}

export class PageReview {
  private filter: PageReviewFilter = "all";
  private selectedPageNumber: number;
  private readonly selectedPages = new Set<number>();
  private readonly roomOverrides: Record<string, Partial<Pick<ContextRoom, "type" | "functions" | "roomNumber" | "nameOriginal" | "floorId" | "area">>> = {};
  private readonly furnitureOverrides: Record<string, Partial<Pick<ContextFurniture, "type" | "roomId" | "pageNumber">>> = {};
  private readonly pageRoomOverrides: Record<number, string[] | undefined> = {};
  private readonly manualRooms: ContextRoom[] = [];
  private readonly deletedRoomIds = new Set<string>();
  private readonly manualFurniture: ContextFurniture[] = [];
  private readonly deletedFurnitureIds = new Set<string>();
  private readonly inventoryOverrides: Record<string, Partial<Pick<FurnitureInventoryItem, "category" | "importance" | "roomId" | "status">>> = {};
  private readonly manualInventoryItems: FurnitureInventoryItem[] = [];
  private readonly deletedInventoryItemIds = new Set<string>();
  private readonly duplicateCleanupStatuses: Record<string, InventoryDuplicateGroupStatus> = {};
  private readonly roomCleanupStatuses: Record<string, InventoryRoomCleanupStatus> = {};
  private cleanupSuggestions: CleanupSuggestion[] = [];
  private cleanupSuggestionStatus = "No auto cleanup suggestions generated.";
  private cleanupSafeAppliedCount = 0;
  private aiCleanupSuggestions: AiCleanupSuggestion[] = [];
  private readonly selectedAiSuggestionIds = new Set<string>();
  private aiCleanupStatus = "No AI cleanup suggestions generated.";
  private aiHighConfidenceAppliedCount = 0;
  private readonly cleanupActions: CleanupActionAudit[] = [];
  private groundTruthText = "";
  private groundTruthStatus = "No ground truth imported.";
  private pageTypeImportText = "";
  private pageTypeImportStatus = "No page-review/ground-truth types imported.";
  private expectedProjectContextText = "";
  private expectedProjectContextStatus = "No expected ProjectContext imported.";
  private expectedProjectContext: ProjectContextExport | null = null;
  private expectedInventoryText = "";
  private expectedInventoryStatus = "No expected Room Furniture Inventory imported.";
  private expectedInventory: RoomFurnitureInventory | null = null;
  private expectedFurnitureStructureText = "";
  private expectedFurnitureStructureStatus = "No expected Room Furniture Structure imported.";
  private expectedFurnitureStructure: RoomFurnitureStructure | null = null;
  private expectedDocumentMapText = "";
  private expectedDocumentMapStatus = "No expected Document Map imported.";
  private expectedDocumentMap: DocumentMap | null = null;
  private readonly documentMapPageOverrides: NonNullable<DocumentMapOverrides["pageOverrides"]> = {};
  private readonly documentMapRoomOverrides: NonNullable<DocumentMapOverrides["roomOverrides"]> = {};
  private readonly documentMapPageRoomOverrides: NonNullable<DocumentMapOverrides["pageRoomOverrides"]> = {};
  private readonly documentMapExtraParameters: Record<string, ExtraExtractedParameter[]> = {};
  private inventoryFilter: "all" | "primary" | "secondary" | "unassigned" | "low_confidence" | "ignored" = "all";
  private detailRoomId = "";
  private roomDetailVisionExtraction: RoomDetailExtraction | null = null;
  private roomDetailRawVisionResponse: RoomDetailExtraction | null = null;
  private roomDetailStatus = "text-only";
  private readonly furnitureStructureOverrides: Record<string, Partial<Pick<RoomFurnitureStructure["furnitureGroups"][number], "groupCategory" | "baseCategory" | "approximateModuleCount" | "needsDeepExtraction">>> = {};
  private readonly furnitureStructureModuleOverrides: Record<string, Partial<Pick<RoomFurnitureStructure["furnitureGroups"][number]["modules"][number], "baseCategory" | "needsDeepExtraction">>> = {};
  private readonly furnitureStructureAssociatedOverrides: Record<string, Partial<Pick<RoomFurnitureStructure["furnitureGroups"][number]["associatedItems"][number], "category" | "relation">>> = {};
  private readonly furnitureStructureStandaloneOverrides: Record<string, Partial<Pick<RoomFurnitureStructure["standaloneItems"][number], "category" | "needsDeepExtraction">>> = {};
  private projectContextAccepted = false;
  private projectContextStatus = "Najprv dokonči page review a potom potvrď build Project Context.";
  private contextStep = 1;
  private contextDebugVisible = false;
  private relevantPageFilter: "all" | "unassigned" | "floor_plan" | "measurement_floor_plan" | "furniture_schedule" | "visualization" = "all";

  constructor(private readonly root: HTMLElement, private readonly options: PageReviewOptions) {
    this.selectedPageNumber = options.pages[0]?.pageNumber ?? 1;
    this.bindEvents();
    this.render();
  }

  render(): void {
    const visiblePages = this.options.pages.filter((page) => matchesFilter(page, this.filter));
    const selectedPage = this.options.pages.find((page) => page.pageNumber === this.selectedPageNumber) ?? visiblePages[0] ?? this.options.pages[0];
    const evaluation = createEvaluationReport({
      fileName: this.options.fileName,
      pages: this.options.pages
    });
    const documentMap = this.buildDocumentMap();
    const documentMapEvaluation = this.expectedDocumentMap
      ? evaluateDocumentMap(documentMap, this.expectedDocumentMap)
      : null;
    const projectContext = this.projectContextAccepted ? this.buildProjectContext() : createEmptyProjectContext();
    const projectContextExport = this.projectContextAccepted ? this.createCurrentProjectContextExport(projectContext) : null;
    const projectContextEvaluation = this.projectContextAccepted && projectContextExport && this.expectedProjectContext
      ? evaluateProjectContext(projectContextExport, this.expectedProjectContext)
      : null;
    const inventory = this.projectContextAccepted ? this.buildRoomFurnitureInventory(projectContext) : createEmptyRoomFurnitureInventory(this.options.fileName);
    const inventoryEvaluation = this.projectContextAccepted && this.expectedInventory
      ? evaluateRoomFurnitureInventory(inventory, this.expectedInventory)
      : null;
    const inventoryCleanup = createInventoryCleanupReview({
      inventory,
      context: projectContext,
      pages: this.options.pages,
      duplicateGroupStatuses: this.duplicateCleanupStatuses,
      roomCleanupStatuses: this.roomCleanupStatuses
    });
    const textRoomDetailExtraction = this.projectContextAccepted
      ? this.buildRoomDetailExtraction(projectContext, inventory)
      : null;
    const roomDetailExtraction = this.roomDetailVisionExtraction && textRoomDetailExtraction && this.roomDetailVisionExtraction.roomId === textRoomDetailExtraction.roomId
      ? this.roomDetailVisionExtraction
      : textRoomDetailExtraction;
    const furnitureStructure = roomDetailExtraction
      ? this.applyFurnitureStructureOverrides(buildRoomFurnitureStructure({
        roomDetailExtraction,
        roomInventory: inventory,
        projectContext
      }))
      : null;
    const furnitureStructureEvaluation = furnitureStructure && this.expectedFurnitureStructure
      ? evaluateRoomFurnitureStructure(furnitureStructure, this.expectedFurnitureStructure)
      : null;

    if (selectedPage) this.selectedPageNumber = selectedPage.pageNumber;

    this.root.innerHTML = `
      <section class="pdf-intake-review">
        <aside class="pdf-intake-list">
          <div class="pdf-intake-review-head">
            <div>
              <h2>Page review</h2>
              <p>${escapeHtml(this.options.fileName)} - ${this.options.pages.length} pages</p>
            </div>
            <div class="pdf-intake-export-actions">
              <button class="pdf-intake-primary" type="button" data-export-review>Export page review JSON</button>
              <button type="button" data-export-ground-truth>Export ground truth JSON</button>
              <button type="button" data-export-evaluation>Export evaluation report JSON</button>
            </div>
          </div>
          ${renderBulkControls(this.selectedPages.size)}
          <div class="pdf-intake-filters">
            ${FILTERS.map((filter) => `
              <button class="${filter.value === this.filter ? "active" : ""}" type="button" data-filter="${filter.value}">
                ${filter.label}
              </button>
            `).join("")}
          </div>
          <div class="pdf-intake-page-list">
            ${visiblePages.map((page) => renderPageListItem(page, page.pageNumber === this.selectedPageNumber, this.selectedPages.has(page.pageNumber))).join("")}
          </div>
          <details class="pdf-intake-sidebar-tools">
            <summary>Import & evaluation tools</summary>
          ${renderPageTypeImportControls(this.pageTypeImportText, this.pageTypeImportStatus)}
          ${renderGroundTruthControls(this.groundTruthText, this.groundTruthStatus)}
          ${renderMetricsPanel(evaluation)}
          </details>
        </aside>
        <section class="pdf-intake-preview">
          ${selectedPage ? renderSelectedPage(selectedPage, projectContext, this.pageRoomOverrides[selectedPage.pageNumber]) : `<div class="pdf-intake-empty">No pages match this filter.</div>`}
          ${renderDocumentMapPanel({
            documentMap,
            expectedText: this.expectedDocumentMapText,
            expectedStatus: this.expectedDocumentMapStatus,
            evaluation: documentMapEvaluation
          })}
          ${this.projectContextAccepted
            ? renderProjectContextWizard({
              projectContext,
              pages: this.options.pages,
              currentStep: this.contextStep,
              debugVisible: this.contextDebugVisible,
              relevantPageFilter: this.relevantPageFilter,
              expectedText: this.expectedProjectContextText,
              expectedStatus: this.expectedProjectContextStatus,
              evaluation: projectContextEvaluation,
              inventory,
              inventoryEvaluation,
              inventoryCleanup,
              roomDetailExtraction,
              furnitureStructure,
              furnitureStructureEvaluation,
              detailRoomId: this.detailRoomId,
              roomDetailStatus: this.roomDetailStatus,
              cleanupSuggestions: this.cleanupSuggestions,
              cleanupSuggestionStatus: this.cleanupSuggestionStatus,
              cleanupSafeAppliedCount: this.cleanupSafeAppliedCount,
              aiCleanupSuggestions: this.aiCleanupSuggestions,
              selectedAiSuggestionIds: this.selectedAiSuggestionIds,
              aiCleanupStatus: this.aiCleanupStatus,
              aiHighConfidenceAppliedCount: this.aiHighConfidenceAppliedCount,
              inventoryFilter: this.inventoryFilter,
              expectedInventoryText: this.expectedInventoryText,
              expectedInventoryStatus: this.expectedInventoryStatus,
              expectedFurnitureStructureText: this.expectedFurnitureStructureText,
              expectedFurnitureStructureStatus: this.expectedFurnitureStructureStatus
            })
            : renderProjectContextGate(this.projectContextStatus, this.options.pages)}
        </section>
      </section>
    `;
  }

  private bindEvents(): void {
    this.root.addEventListener("click", (event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;

      const filter = target.closest<HTMLElement>("[data-filter]");
      if (filter?.dataset.filter) {
        this.filter = filter.dataset.filter as PageReviewFilter;
        const firstVisible = this.options.pages.find((page) => matchesFilter(page, this.filter));
        if (firstVisible) this.selectedPageNumber = firstVisible.pageNumber;
        this.render();
        return;
      }

      const pageButton = target.closest<HTMLElement>("[data-page-number]");
      if (pageButton?.dataset.pageNumber) {
        this.selectedPageNumber = Number(pageButton.dataset.pageNumber);
        this.render();
        return;
      }

      if (target.closest("[data-export-review]")) {
        downloadPageReviewJson({
          fileName: this.options.fileName,
          pages: this.options.pages
        });
        return;
      }

      if (target.closest("[data-export-ground-truth]")) {
        downloadGroundTruthJson({
          fileName: this.options.fileName,
          pages: this.options.pages
        });
        return;
      }

      if (target.closest("[data-export-evaluation]")) {
        downloadEvaluationReportJson({
          fileName: this.options.fileName,
          pages: this.options.pages
        });
        return;
      }

      if (target.closest("[data-import-ground-truth]")) {
        this.importGroundTruthFromText();
        return;
      }

      if (target.closest("[data-import-page-types]")) {
        this.importPageTypesFromText();
        return;
      }

      if (target.closest("[data-export-document-map]")) {
        this.downloadProjectContextJson("document-map", this.buildDocumentMap());
        return;
      }

      if (target.closest("[data-export-expected-document-map]")) {
        this.downloadProjectContextJson("expected-document-map", this.buildDocumentMap());
        return;
      }

      if (target.closest("[data-export-document-map-evaluation]")) {
        if (!this.expectedDocumentMap) return;
        this.downloadProjectContextJson("document-map-evaluation", evaluateDocumentMap(this.buildDocumentMap(), this.expectedDocumentMap));
        return;
      }

      if (target.closest("[data-import-expected-document-map]")) {
        this.importExpectedDocumentMapFromText();
        return;
      }

      const addDocumentMapParamButton = target.closest<HTMLElement>("[data-add-document-map-param]");
      if (addDocumentMapParamButton?.dataset.addDocumentMapParam) {
        const roomId = addDocumentMapParamButton.dataset.addDocumentMapParam;
        this.documentMapExtraParameters[roomId] = [
          ...(this.documentMapExtraParameters[roomId] ?? []),
          {
            keyOriginal: "note",
            keyNormalized: "note",
            valueOriginal: "",
            valueNormalized: "",
            unit: null,
            sourcePageNumber: this.selectedPageNumber,
            confidence: 1,
            reason: "manual document map parameter"
          }
        ];
        this.renderPreservingListScroll();
        return;
      }

      if (target.closest("[data-export-project-context]")) {
        this.downloadProjectContextJson("project-context", this.createCurrentProjectContextExport());
        return;
      }

      if (target.closest("[data-export-expected-project-context]")) {
        this.downloadProjectContextJson("expected-project-context", this.createCurrentProjectContextExport());
        return;
      }

      if (target.closest("[data-export-project-context-evaluation]")) {
        if (!this.expectedProjectContext) return;
        const report = evaluateProjectContext(this.createCurrentProjectContextExport(), this.expectedProjectContext);
        this.downloadProjectContextJson("project-context-evaluation", report);
        return;
      }

      if (target.closest("[data-import-expected-project-context]")) {
        this.importExpectedProjectContextFromText();
        return;
      }

      if (target.closest("[data-export-room-furniture-inventory]")) {
        this.downloadProjectContextJson("room-furniture-inventory", this.buildRoomFurnitureInventory(this.buildProjectContext()));
        return;
      }

      if (target.closest("[data-export-room-detail-extraction]")) {
        const context = this.buildProjectContext();
        const textExtraction = this.buildRoomDetailExtraction(context, this.buildRoomFurnitureInventory(context));
        this.downloadProjectContextJson("room-detail-extraction", this.roomDetailVisionExtraction?.roomId === textExtraction.roomId ? this.roomDetailVisionExtraction : textExtraction);
        return;
      }

      if (target.closest("[data-export-room-furniture-structure]")) {
        const context = this.buildProjectContext();
        const inventory = this.buildRoomFurnitureInventory(context);
        const textExtraction = this.buildRoomDetailExtraction(context, inventory);
        const detailExtraction = this.roomDetailVisionExtraction?.roomId === textExtraction.roomId ? this.roomDetailVisionExtraction : textExtraction;
        this.downloadProjectContextJson("room-furniture-structure", this.applyFurnitureStructureOverrides(buildRoomFurnitureStructure({
          roomDetailExtraction: detailExtraction,
          roomInventory: inventory,
          projectContext: context
        })));
        return;
      }

      if (target.closest("[data-export-expected-room-furniture-structure]")) {
        const context = this.buildProjectContext();
        const inventory = this.buildRoomFurnitureInventory(context);
        const textExtraction = this.buildRoomDetailExtraction(context, inventory);
        const detailExtraction = this.roomDetailVisionExtraction?.roomId === textExtraction.roomId ? this.roomDetailVisionExtraction : textExtraction;
        this.downloadProjectContextJson("expected-room-furniture-structure", this.applyFurnitureStructureOverrides(buildRoomFurnitureStructure({
          roomDetailExtraction: detailExtraction,
          roomInventory: inventory,
          projectContext: context
        })));
        return;
      }

      if (target.closest("[data-export-room-furniture-structure-evaluation]")) {
        if (!this.expectedFurnitureStructure) return;
        const context = this.buildProjectContext();
        const inventory = this.buildRoomFurnitureInventory(context);
        const textExtraction = this.buildRoomDetailExtraction(context, inventory);
        const detailExtraction = this.roomDetailVisionExtraction?.roomId === textExtraction.roomId ? this.roomDetailVisionExtraction : textExtraction;
        const structure = this.applyFurnitureStructureOverrides(buildRoomFurnitureStructure({
          roomDetailExtraction: detailExtraction,
          roomInventory: inventory,
          projectContext: context
        }));
        this.downloadProjectContextJson("room-furniture-structure-evaluation", evaluateRoomFurnitureStructure(structure, this.expectedFurnitureStructure));
        return;
      }

      if (target.closest("[data-import-expected-room-furniture-structure]")) {
        this.importExpectedFurnitureStructureFromText();
        return;
      }

      if (target.closest("[data-export-room-furniture-structure-audit]")) {
        const context = this.buildProjectContext();
        const inventory = this.buildRoomFurnitureInventory(context);
        const textExtraction = this.buildRoomDetailExtraction(context, inventory);
        const detailExtraction = this.roomDetailVisionExtraction?.roomId === textExtraction.roomId ? this.roomDetailVisionExtraction : textExtraction;
        const structure = this.applyFurnitureStructureOverrides(buildRoomFurnitureStructure({
          roomDetailExtraction: detailExtraction,
          roomInventory: inventory,
          projectContext: context
        }));
        this.downloadProjectContextJson("room-furniture-structure-audit", {
          fileName: this.options.fileName,
          roomId: detailExtraction.roomId,
          rawTextExtraction: textExtraction,
          rawVisionResponse: this.roomDetailRawVisionResponse,
          transformedStructure: structure,
          groupingReport: {
            groupCount: structure.furnitureGroups.length,
            standaloneCount: structure.standaloneItems.length,
            unassignedCandidateCount: structure.unassignedCandidates.length,
            groupCategories: structure.furnitureGroups.map((group) => group.groupCategory),
            reasons: structure.furnitureGroups.flatMap((group) => group.reasons),
            warnings: structure.warnings
          }
        });
        return;
      }

      if (target.closest("[data-run-room-text-extraction]")) {
        this.roomDetailVisionExtraction = null;
        this.roomDetailRawVisionResponse = null;
        this.roomDetailStatus = "text-only";
        this.renderPreservingListScroll();
        return;
      }

      if (target.closest("[data-run-room-vision-fallback]")) {
        void this.runRoomDetailVisionFallback(false);
        return;
      }

      if (target.closest("[data-run-room-text-vision]")) {
        void this.runRoomDetailVisionFallback(true);
        return;
      }

      if (target.closest("[data-generate-room-furniture-structure]")) {
        this.roomDetailStatus = `${this.roomDetailStatus}; furniture structure generated`;
        this.renderPreservingListScroll();
        return;
      }

      if (target.closest("[data-export-expected-room-furniture-inventory]")) {
        this.downloadProjectContextJson("expected-room-furniture-inventory", this.buildRoomFurnitureInventory(this.buildProjectContext()));
        return;
      }

      if (target.closest("[data-export-room-furniture-inventory-evaluation]")) {
        if (!this.expectedInventory) return;
        const inventory = this.buildRoomFurnitureInventory(this.buildProjectContext());
        this.downloadProjectContextJson("room-furniture-inventory-evaluation", evaluateRoomFurnitureInventory(inventory, this.expectedInventory));
        return;
      }

      if (target.closest("[data-import-expected-room-furniture-inventory]")) {
        this.importExpectedInventoryFromText();
        return;
      }

      if (target.closest("[data-add-inventory-item]")) {
        const id = `manual_inventory_${Date.now()}`;
        this.manualInventoryItems.push({
          itemId: id,
          displayName: "Manual Item",
          category: "unknown",
          importance: "unknown",
          sourcePageNumbers: [this.selectedPageNumber],
          sourceTexts: ["manual item"],
          confidence: 1,
          reasons: ["manual item"],
          status: "manual"
        });
        this.renderPreservingListScroll();
        return;
      }

      const deleteInventoryButton = target.closest<HTMLElement>("[data-delete-inventory-item]");
      if (deleteInventoryButton?.dataset.deleteInventoryItem) {
        this.deletedInventoryItemIds.add(deleteInventoryButton.dataset.deleteInventoryItem);
        this.renderPreservingListScroll();
        return;
      }

      if (target.closest("[data-generate-auto-cleanup]")) {
        const context = this.buildProjectContext();
        const inventory = this.buildRoomFurnitureInventory(context);
        const cleanup = createInventoryCleanupReview({
          inventory,
          context,
          pages: this.options.pages,
          duplicateGroupStatuses: this.duplicateCleanupStatuses,
          roomCleanupStatuses: this.roomCleanupStatuses
        });
        this.cleanupSuggestions = createAutoCleanupSuggestions(cleanup);
        this.cleanupSafeAppliedCount = 0;
        this.cleanupSuggestionStatus = `Generated ${this.cleanupSuggestions.length} suggestions, ${this.cleanupSuggestions.filter((suggestion) => suggestion.safe).length} safe.`;
        this.renderPreservingListScroll();
        return;
      }

      if (target.closest("[data-apply-safe-cleanup]")) {
        this.cleanupSafeAppliedCount = this.applySafeCleanupSuggestions();
        this.cleanupSuggestionStatus = `Applied ${this.cleanupSafeAppliedCount} safe suggestions out of ${this.cleanupSuggestions.length}.`;
        this.renderPreservingListScroll();
        return;
      }

      if (target.closest("[data-generate-ai-cleanup]")) {
        void this.generateAiCleanupSuggestions();
        return;
      }

      if (target.closest("[data-apply-high-confidence-ai-cleanup]")) {
        this.aiHighConfidenceAppliedCount = this.applyHighConfidenceAiSuggestions();
        this.aiCleanupStatus = `Applied ${this.aiHighConfidenceAppliedCount} high confidence AI suggestions out of ${this.aiCleanupSuggestions.length}.`;
        this.renderPreservingListScroll();
        return;
      }

      const assignSuggestedButton = target.closest<HTMLElement>("[data-cleanup-assign-suggested]");
      if (assignSuggestedButton?.dataset.cleanupAssignSuggested && assignSuggestedButton.dataset.suggestedRoomId) {
        const itemId = assignSuggestedButton.dataset.cleanupAssignSuggested;
        this.inventoryOverrides[itemId] = {
          ...this.inventoryOverrides[itemId],
          roomId: assignSuggestedButton.dataset.suggestedRoomId
        };
        this.renderPreservingListScroll();
        return;
      }

      const ignoreCleanupItemButton = target.closest<HTMLElement>("[data-cleanup-ignore-item]");
      if (ignoreCleanupItemButton?.dataset.cleanupIgnoreItem) {
        const itemId = ignoreCleanupItemButton.dataset.cleanupIgnoreItem;
        this.inventoryOverrides[itemId] = {
          ...this.inventoryOverrides[itemId],
          status: "ignored"
        };
        this.renderPreservingListScroll();
        return;
      }

      const mergeDuplicateButton = target.closest<HTMLElement>("[data-cleanup-merge-duplicate]");
      if (mergeDuplicateButton?.dataset.cleanupMergeDuplicate && mergeDuplicateButton.dataset.duplicateItems) {
        this.duplicateCleanupStatuses[mergeDuplicateButton.dataset.cleanupMergeDuplicate] = "merged";
        for (const itemId of mergeDuplicateButton.dataset.duplicateItems.split(",").slice(1)) {
          this.inventoryOverrides[itemId] = {
            ...this.inventoryOverrides[itemId],
            status: "ignored"
          };
        }
        this.renderPreservingListScroll();
        return;
      }

      const keepDuplicateButton = target.closest<HTMLElement>("[data-cleanup-keep-duplicate]");
      if (keepDuplicateButton?.dataset.cleanupKeepDuplicate) {
        this.duplicateCleanupStatuses[keepDuplicateButton.dataset.cleanupKeepDuplicate] = "keep_separate";
        this.renderPreservingListScroll();
        return;
      }

      const ignoreDuplicateButton = target.closest<HTMLElement>("[data-cleanup-ignore-duplicate]");
      if (ignoreDuplicateButton?.dataset.cleanupIgnoreDuplicate && ignoreDuplicateButton.dataset.duplicateItems) {
        this.duplicateCleanupStatuses[ignoreDuplicateButton.dataset.cleanupIgnoreDuplicate] = "ignored_duplicate";
        for (const itemId of ignoreDuplicateButton.dataset.duplicateItems.split(",").slice(1)) {
          this.inventoryOverrides[itemId] = {
            ...this.inventoryOverrides[itemId],
            status: "ignored"
          };
        }
        this.renderPreservingListScroll();
        return;
      }

      const addRoomFurnitureButton = target.closest<HTMLElement>("[data-cleanup-add-room-furniture]");
      if (addRoomFurnitureButton?.dataset.cleanupAddRoomFurniture) {
        const roomId = addRoomFurnitureButton.dataset.cleanupAddRoomFurniture;
        const room = this.buildProjectContext().rooms.find((candidate) => candidate.id === roomId);
        const id = `manual_inventory_${Date.now()}`;
        this.manualInventoryItems.push({
          itemId: id,
          displayName: `${room?.type ?? "Room"} Cabinet`,
          category: "cabinet",
          importance: "primary",
          roomId,
          floorId: room?.floorId,
          sourcePageNumbers: room?.pageNumbers.slice(0, 1) ?? [this.selectedPageNumber],
          sourceTexts: ["manual cleanup item"],
          confidence: 1,
          reasons: ["manual cleanup item"],
          status: "manual"
        });
        this.renderPreservingListScroll();
        return;
      }

      const noCustomFurnitureButton = target.closest<HTMLElement>("[data-cleanup-room-no-custom]");
      if (noCustomFurnitureButton?.dataset.cleanupRoomNoCustom) {
        this.roomCleanupStatuses[noCustomFurnitureButton.dataset.cleanupRoomNoCustom] = "no_custom_furniture";
        this.renderPreservingListScroll();
        return;
      }

      const needsAiRoomButton = target.closest<HTMLElement>("[data-cleanup-room-needs-ai]");
      if (needsAiRoomButton?.dataset.cleanupRoomNeedsAi) {
        this.roomCleanupStatuses[needsAiRoomButton.dataset.cleanupRoomNeedsAi] = "needs_ai_vision_later";
        this.renderPreservingListScroll();
        return;
      }

      if (target.closest("[data-accept-page-review]")) {
        this.projectContextAccepted = true;
        this.projectContextStatus = "Page review je potvrdený. Project Context sa stavia iba z relevantných typov strán.";
        this.contextStep = 1;
        this.renderPreservingListScroll();
        return;
      }

      const contextStepButton = target.closest<HTMLElement>("[data-context-step]");
      if (contextStepButton?.dataset.contextStep) {
        this.contextStep = Number(contextStepButton.dataset.contextStep);
        this.renderPreservingListScroll();
        return;
      }

      if (target.closest("[data-toggle-context-debug]")) {
        this.contextDebugVisible = !this.contextDebugVisible;
        this.renderPreservingListScroll();
        return;
      }

      if (target.closest("[data-add-context-room]")) {
        const id = `manual_room_${Date.now()}`;
        this.manualRooms.push({
          id,
          type: "unknown",
          functions: [],
          nameOriginal: "New room",
          pageNumbers: [],
          confidence: 1,
          reasons: ["manual room"]
        });
        this.renderPreservingListScroll();
        return;
      }

      const deleteRoomButton = target.closest<HTMLElement>("[data-delete-context-room]");
      if (deleteRoomButton?.dataset.deleteContextRoom) {
        const roomId = deleteRoomButton.dataset.deleteContextRoom;
        this.deletedRoomIds.add(roomId);
        for (const [pageNumber, assignedRoomIds] of Object.entries(this.pageRoomOverrides)) {
          const nextRoomIds = (assignedRoomIds ?? []).filter((assignedRoomId) => assignedRoomId !== roomId);
          this.pageRoomOverrides[Number(pageNumber)] = nextRoomIds.length > 0 ? nextRoomIds : undefined;
        }
        for (const item of Object.values(this.furnitureOverrides)) {
          if (item.roomId === roomId) item.roomId = undefined;
        }
        this.renderPreservingListScroll();
        return;
      }

      if (target.closest("[data-add-context-furniture]")) {
        const id = `manual_furniture_${Date.now()}`;
        this.manualFurniture.push({
          id,
          type: "unknown",
          pageNumber: this.selectedPageNumber,
          confidence: 1,
          reasons: ["manual furniture item"]
        });
        this.renderPreservingListScroll();
        return;
      }

      const deleteFurnitureButton = target.closest<HTMLElement>("[data-delete-context-furniture]");
      if (deleteFurnitureButton?.dataset.deleteContextFurniture) {
        this.deletedFurnitureIds.add(deleteFurnitureButton.dataset.deleteContextFurniture);
        this.renderPreservingListScroll();
        return;
      }

      const markPageIrrelevantButton = target.closest<HTMLElement>("[data-mark-page-irrelevant]");
      if (markPageIrrelevantButton?.dataset.markPageIrrelevant) {
        const pageNumber = Number(markPageIrrelevantButton.dataset.markPageIrrelevant);
        const page = this.options.pages.find((item) => item.pageNumber === pageNumber);
        if (page) {
          page.finalType = "irrelevant";
          page.wasManuallyEdited = true;
        }
        this.pageRoomOverrides[pageNumber] = undefined;
        this.renderPreservingListScroll();
        return;
      }

      if (target.closest("[data-select-visible-pages]")) {
        for (const page of this.options.pages) {
          if (matchesFilter(page, this.filter)) this.selectedPages.add(page.pageNumber);
        }
        this.renderPreservingListScroll();
        return;
      }

      if (target.closest("[data-clear-page-selection]")) {
        this.selectedPages.clear();
        this.renderPreservingListScroll();
        return;
      }

      if (target.closest("[data-apply-bulk-type]")) {
        const select = this.root.querySelector<HTMLSelectElement>("[data-bulk-page-type]");
        if (!select || !isPageType(select.value)) return;

        for (const page of this.options.pages) {
          if (!this.selectedPages.has(page.pageNumber)) continue;
          page.finalType = select.value;
          page.wasManuallyEdited = page.finalType !== page.predictedType;
        }

        this.invalidateProjectContext();
        this.renderPreservingListScroll();
      }
    });

    this.root.addEventListener("change", (event) => {
      const target = event.target;
      if (target instanceof HTMLInputElement && target.dataset.selectPage !== undefined) {
        const pageNumber = Number(target.dataset.selectPage);
        if (target.checked) {
          this.selectedPages.add(pageNumber);
        } else {
          this.selectedPages.delete(pageNumber);
        }
        this.updateBulkCount();
        return;
      }

      if (target instanceof HTMLInputElement && target.dataset.aiCleanupSelect !== undefined) {
        if (target.checked) {
          this.selectedAiSuggestionIds.add(target.dataset.aiCleanupSelect);
        } else {
          this.selectedAiSuggestionIds.delete(target.dataset.aiCleanupSelect);
        }
        return;
      }

      if (target instanceof HTMLInputElement && target.dataset.structureGroupDeepFor) {
        const groupId = target.dataset.structureGroupDeepFor;
        this.furnitureStructureOverrides[groupId] = {
          ...this.furnitureStructureOverrides[groupId],
          needsDeepExtraction: target.checked
        };
        this.renderPreservingListScroll();
        return;
      }

      if (target instanceof HTMLInputElement && target.dataset.structureModuleDeepFor) {
        const moduleId = target.dataset.structureModuleDeepFor;
        this.furnitureStructureModuleOverrides[moduleId] = {
          ...this.furnitureStructureModuleOverrides[moduleId],
          needsDeepExtraction: target.checked
        };
        this.renderPreservingListScroll();
        return;
      }

      if (!(target instanceof HTMLSelectElement) || !target.dataset.pageTypeFor) return;

      const pageNumber = Number(target.dataset.pageTypeFor);
      const page = this.options.pages.find((item) => item.pageNumber === pageNumber);
      if (!page || !isPageType(target.value)) return;

      page.finalType = target.value;
      page.wasManuallyEdited = page.finalType !== page.predictedType;
      if (this.invalidateProjectContext()) {
        this.renderPreservingListScroll();
        return;
      }
      this.syncPageTypeControls(page);
      return;
    });

    this.root.addEventListener("input", (event) => {
      const target = event.target;
      if (target instanceof HTMLTextAreaElement && target.dataset.groundTruthText !== undefined) {
        this.groundTruthText = target.value;
        return;
      }

      if (target instanceof HTMLTextAreaElement && target.dataset.pageTypeImportText !== undefined) {
        this.pageTypeImportText = target.value;
        return;
      }

      if (target instanceof HTMLTextAreaElement && target.dataset.expectedProjectContextText !== undefined) {
        this.expectedProjectContextText = target.value;
        return;
      }

      if (target instanceof HTMLTextAreaElement && target.dataset.expectedInventoryText !== undefined) {
        this.expectedInventoryText = target.value;
        return;
      }

      if (target instanceof HTMLTextAreaElement && target.dataset.expectedFurnitureStructureText !== undefined) {
        this.expectedFurnitureStructureText = target.value;
        return;
      }

      if (target instanceof HTMLTextAreaElement && target.dataset.expectedDocumentMapText !== undefined) {
        this.expectedDocumentMapText = target.value;
        return;
      }

      if (target instanceof HTMLInputElement && target.dataset.roomNameFor) {
        this.roomOverrides[target.dataset.roomNameFor] = {
          ...this.roomOverrides[target.dataset.roomNameFor],
          nameOriginal: target.value
        };
        return;
      }

      if (target instanceof HTMLInputElement && target.dataset.roomNumberFor) {
        this.roomOverrides[target.dataset.roomNumberFor] = {
          ...this.roomOverrides[target.dataset.roomNumberFor],
          roomNumber: target.value.trim() || undefined
        };
        return;
      }

      if (target instanceof HTMLInputElement && target.dataset.roomAreaFor) {
        const area = Number(target.value.replace(",", "."));
        this.roomOverrides[target.dataset.roomAreaFor] = {
          ...this.roomOverrides[target.dataset.roomAreaFor],
          area: Number.isFinite(area) ? area : undefined
        };
        return;
      }

      if (target instanceof HTMLInputElement && target.dataset.structureModuleCountFor) {
        const count = Number(target.value);
        const groupId = target.dataset.structureModuleCountFor;
        this.furnitureStructureOverrides[groupId] = {
          ...this.furnitureStructureOverrides[groupId],
          approximateModuleCount: Number.isFinite(count) ? count : null
        };
        return;
      }

      if (target instanceof HTMLInputElement && target.dataset.documentMapParamKeyFor && target.dataset.paramIndex) {
        this.updateDocumentMapExtraParameter(target.dataset.documentMapParamKeyFor, Number(target.dataset.paramIndex), { keyOriginal: target.value, keyNormalized: target.value.trim() || null });
        return;
      }

      if (target instanceof HTMLInputElement && target.dataset.documentMapParamValueFor && target.dataset.paramIndex) {
        this.updateDocumentMapExtraParameter(target.dataset.documentMapParamValueFor, Number(target.dataset.paramIndex), { valueOriginal: target.value, valueNormalized: target.value.trim() || null });
        return;
      }
    });

    this.root.addEventListener("change", (event) => {
      const target = event.target;
      if (target instanceof HTMLInputElement && target.dataset.pageTypeImportFile !== undefined) {
        const file = target.files?.[0];
        if (!file) return;

        void file.text()
          .then((text) => {
            this.pageTypeImportText = text;
            this.importPageTypesFromText();
          })
          .catch((error) => {
            this.pageTypeImportStatus = error instanceof Error ? error.message : "Page type import failed.";
            this.render();
          });
        return;
      }

      if (target instanceof HTMLInputElement && target.dataset.expectedProjectContextFile !== undefined) {
        const file = target.files?.[0];
        if (!file) return;

        void file.text()
          .then((text) => {
            this.expectedProjectContextText = text;
            this.importExpectedProjectContextFromText();
          })
          .catch((error) => {
            this.expectedProjectContextStatus = error instanceof Error ? error.message : "Expected ProjectContext file import failed.";
            this.render();
          });
        return;
      }

      if (target instanceof HTMLInputElement && target.dataset.expectedInventoryFile !== undefined) {
        const file = target.files?.[0];
        if (!file) return;

        void file.text()
          .then((text) => {
            this.expectedInventoryText = text;
            this.importExpectedInventoryFromText();
          })
          .catch((error) => {
            this.expectedInventoryStatus = error instanceof Error ? error.message : "Expected inventory file import failed.";
            this.render();
          });
        return;
      }

      if (target instanceof HTMLInputElement && target.dataset.expectedFurnitureStructureFile !== undefined) {
        const file = target.files?.[0];
        if (!file) return;

        void file.text()
          .then((text) => {
            this.expectedFurnitureStructureText = text;
            this.importExpectedFurnitureStructureFromText();
          })
          .catch((error) => {
            this.expectedFurnitureStructureStatus = error instanceof Error ? error.message : "Expected furniture structure file import failed.";
            this.render();
          });
        return;
      }

      if (target instanceof HTMLInputElement && target.dataset.expectedDocumentMapFile !== undefined) {
        const file = target.files?.[0];
        if (!file) return;

        void file.text()
          .then((text) => {
            this.expectedDocumentMapText = text;
            this.importExpectedDocumentMapFromText();
          })
          .catch((error) => {
            this.expectedDocumentMapStatus = error instanceof Error ? error.message : "Expected Document Map file import failed.";
            this.render();
          });
        return;
      }

      if (target instanceof HTMLSelectElement && target.dataset.documentMapPageTypeFor) {
        const pageNumber = Number(target.dataset.documentMapPageTypeFor);
        if (!isDocumentMapPageType(target.value)) return;
        this.documentMapPageOverrides[pageNumber] = {
          ...this.documentMapPageOverrides[pageNumber],
          pageType: target.value
        };
        this.renderPreservingListScroll();
        return;
      }

      if (target instanceof HTMLSelectElement && target.dataset.documentMapFloorFor) {
        const pageNumber = Number(target.dataset.documentMapFloorFor);
        this.documentMapPageOverrides[pageNumber] = {
          ...this.documentMapPageOverrides[pageNumber],
          floorId: target.value || null
        };
        this.renderPreservingListScroll();
        return;
      }

      if (target instanceof HTMLSelectElement && target.dataset.documentMapRoomTypeFor) {
        const roomId = target.dataset.documentMapRoomTypeFor;
        this.documentMapRoomOverrides[roomId] = {
          ...this.documentMapRoomOverrides[roomId],
          roomType: target.value
        };
        this.renderPreservingListScroll();
        return;
      }

      if (target instanceof HTMLSelectElement && target.dataset.documentMapPageRoomFor) {
        const pageNumber = Number(target.dataset.documentMapPageRoomFor);
        this.documentMapPageRoomOverrides[pageNumber] = target.value || null;
        this.renderPreservingListScroll();
        return;
      }

      if (target instanceof HTMLInputElement && target.dataset.documentMapPrimaryFor) {
        const pageNumber = Number(target.dataset.documentMapPrimaryFor);
        this.documentMapPageOverrides[pageNumber] = {
          ...this.documentMapPageOverrides[pageNumber],
          isPrimaryFurniturePlan: target.checked
        };
        this.renderPreservingListScroll();
        return;
      }

      if (target instanceof HTMLSelectElement && target.dataset.roomTypeFor) {
        if (!isRoomType(target.value)) return;
        this.roomOverrides[target.dataset.roomTypeFor] = {
          ...this.roomOverrides[target.dataset.roomTypeFor],
          type: target.value,
          functions: target.value === "unknown" ? [] : [target.value as Exclude<RoomType, "unknown">]
        };
        this.renderPreservingListScroll();
        return;
      }

      if (target instanceof HTMLSelectElement && target.dataset.roomFunctionsFor) {
        const functions = Array.from(target.selectedOptions)
          .map((option) => option.value)
          .filter(isRoomFunctionType);
        this.roomOverrides[target.dataset.roomFunctionsFor] = {
          ...this.roomOverrides[target.dataset.roomFunctionsFor],
          functions,
          type: functions[0] ?? "unknown"
        };
        this.renderPreservingListScroll();
        return;
      }

      if (target instanceof HTMLSelectElement && target.dataset.roomFloorFor) {
        this.roomOverrides[target.dataset.roomFloorFor] = {
          ...this.roomOverrides[target.dataset.roomFloorFor],
          floorId: target.value || undefined
        };
        this.renderPreservingListScroll();
        return;
      }

      if (target instanceof HTMLSelectElement && target.dataset.contextPageFilter) {
        this.relevantPageFilter = target.value as typeof this.relevantPageFilter;
        this.renderPreservingListScroll();
        return;
      }

      if (target instanceof HTMLSelectElement && target.dataset.inventoryFilter) {
        this.inventoryFilter = target.value as typeof this.inventoryFilter;
        this.renderPreservingListScroll();
        return;
      }

      if (target instanceof HTMLSelectElement && target.dataset.detailRoomSelect !== undefined) {
        this.detailRoomId = target.value;
        this.roomDetailVisionExtraction = null;
        this.roomDetailRawVisionResponse = null;
        this.roomDetailStatus = "text-only";
        this.renderPreservingListScroll();
        return;
      }

      if (target instanceof HTMLSelectElement && target.dataset.structureGroupCategoryFor) {
        if (!isFurnitureGroupCategory(target.value)) return;
        const groupId = target.dataset.structureGroupCategoryFor;
        this.furnitureStructureOverrides[groupId] = {
          ...this.furnitureStructureOverrides[groupId],
          groupCategory: target.value
        };
        this.renderPreservingListScroll();
        return;
      }

      if (target instanceof HTMLSelectElement && target.dataset.structureGroupBaseFor) {
        if (!isFurnitureGroupBaseCategory(target.value)) return;
        const groupId = target.dataset.structureGroupBaseFor;
        this.furnitureStructureOverrides[groupId] = {
          ...this.furnitureStructureOverrides[groupId],
          baseCategory: target.value
        };
        this.renderPreservingListScroll();
        return;
      }

      if (target instanceof HTMLSelectElement && target.dataset.structureModuleCategoryFor) {
        if (!isApproxModuleCategory(target.value)) return;
        const moduleId = target.dataset.structureModuleCategoryFor;
        this.furnitureStructureModuleOverrides[moduleId] = {
          ...this.furnitureStructureModuleOverrides[moduleId],
          baseCategory: target.value
        };
        this.renderPreservingListScroll();
        return;
      }

      if (target instanceof HTMLSelectElement && target.dataset.structureAssociatedCategoryFor) {
        if (!isAssociatedFurnitureCategory(target.value)) return;
        const itemId = target.dataset.structureAssociatedCategoryFor;
        this.furnitureStructureAssociatedOverrides[itemId] = {
          ...this.furnitureStructureAssociatedOverrides[itemId],
          category: target.value
        };
        this.renderPreservingListScroll();
        return;
      }

      if (target instanceof HTMLSelectElement && target.dataset.structureAssociatedRelationFor) {
        if (!isAssociatedFurnitureRelation(target.value)) return;
        const itemId = target.dataset.structureAssociatedRelationFor;
        this.furnitureStructureAssociatedOverrides[itemId] = {
          ...this.furnitureStructureAssociatedOverrides[itemId],
          relation: target.value
        };
        this.renderPreservingListScroll();
        return;
      }

      if (target instanceof HTMLSelectElement && target.dataset.structureStandaloneCategoryFor) {
        if (!isStandaloneFurnitureCategory(target.value)) return;
        const itemId = target.dataset.structureStandaloneCategoryFor;
        this.furnitureStructureStandaloneOverrides[itemId] = {
          ...this.furnitureStructureStandaloneOverrides[itemId],
          category: target.value
        };
        this.renderPreservingListScroll();
        return;
      }

      if (target instanceof HTMLSelectElement && target.dataset.inventoryCategoryFor) {
        if (!isFurnitureType(target.value)) return;
        const itemId = target.dataset.inventoryCategoryFor;
        this.inventoryOverrides[itemId] = {
          ...this.inventoryOverrides[itemId],
          category: target.value,
          importance: getFurnitureImportance(target.value)
        };
        this.renderPreservingListScroll();
        return;
      }

      if (target instanceof HTMLSelectElement && target.dataset.inventoryImportanceFor) {
        if (!isFurnitureImportance(target.value)) return;
        this.inventoryOverrides[target.dataset.inventoryImportanceFor] = {
          ...this.inventoryOverrides[target.dataset.inventoryImportanceFor],
          importance: target.value
        };
        this.renderPreservingListScroll();
        return;
      }

      if (target instanceof HTMLSelectElement && target.dataset.inventoryRoomFor) {
        this.inventoryOverrides[target.dataset.inventoryRoomFor] = {
          ...this.inventoryOverrides[target.dataset.inventoryRoomFor],
          roomId: target.value || undefined
        };
        this.renderPreservingListScroll();
        return;
      }

      if (target instanceof HTMLSelectElement && target.dataset.inventoryStatusFor) {
        if (!isFurnitureInventoryStatus(target.value)) return;
        this.inventoryOverrides[target.dataset.inventoryStatusFor] = {
          ...this.inventoryOverrides[target.dataset.inventoryStatusFor],
          status: target.value
        };
        this.renderPreservingListScroll();
        return;
      }

      if (target instanceof HTMLSelectElement && target.dataset.furnitureTypeFor) {
        if (!isFurnitureType(target.value)) return;
        this.furnitureOverrides[target.dataset.furnitureTypeFor] = {
          ...this.furnitureOverrides[target.dataset.furnitureTypeFor],
          type: target.value
        };
        this.renderPreservingListScroll();
        return;
      }

      if (target instanceof HTMLSelectElement && target.dataset.furnitureRoomFor) {
        this.furnitureOverrides[target.dataset.furnitureRoomFor] = {
          ...this.furnitureOverrides[target.dataset.furnitureRoomFor],
          roomId: target.value || undefined
        };
        this.renderPreservingListScroll();
        return;
      }

      if (target instanceof HTMLSelectElement && target.dataset.pageRoomFor) {
        const pageNumber = Number(target.dataset.pageRoomFor);
        this.pageRoomOverrides[pageNumber] = target.value ? [target.value] : undefined;
        this.renderPreservingListScroll();
        return;
      }

      if (target instanceof HTMLSelectElement && target.dataset.pageRoomsFor) {
        const pageNumber = Number(target.dataset.pageRoomsFor);
        const roomIds = Array.from(target.selectedOptions).map((option) => option.value).filter(Boolean);
        this.pageRoomOverrides[pageNumber] = roomIds.length > 0 ? roomIds : [];
        this.renderPreservingListScroll();
        return;
      }

      if (!(target instanceof HTMLInputElement) || target.dataset.groundTruthFile === undefined) return;

      const file = target.files?.[0];
      if (!file) return;

      void file.text()
        .then((text) => {
          this.groundTruthText = text;
          this.importGroundTruthFromText();
        })
        .catch((error) => {
          this.groundTruthStatus = error instanceof Error ? error.message : "Ground truth file import failed.";
          this.render();
        });
    });
  }

  private importGroundTruthFromText(): void {
    try {
      const groundTruth = parseGroundTruthJson(this.groundTruthText);
      applyGroundTruth(this.options.pages, groundTruth);
      this.groundTruthStatus = `Imported ${groundTruth.pages.length} expected page labels.`;
    } catch (error) {
      this.groundTruthStatus = error instanceof Error ? error.message : "Ground truth import failed.";
    }

    this.render();
  }

  private importPageTypesFromText(): void {
    try {
      const result = applyImportedPageTypes(this.options.pages, this.pageTypeImportText);
      this.pageTypeImportStatus = `Applied ${result.applied} page types, skipped ${result.skipped}.`;
      this.invalidateProjectContext();
    } catch (error) {
      this.pageTypeImportStatus = error instanceof Error ? error.message : "Page type import failed.";
    }

    this.render();
  }

  private importExpectedProjectContextFromText(): void {
    try {
      this.expectedProjectContext = parseProjectContextJson(this.expectedProjectContextText);
      this.expectedProjectContextStatus = `Imported expected ProjectContext: ${this.expectedProjectContext.rooms.length} rooms, ${this.expectedProjectContext.detectedFurniture.length} furniture.`;
    } catch (error) {
      this.expectedProjectContext = null;
      this.expectedProjectContextStatus = error instanceof Error ? error.message : "Expected ProjectContext import failed.";
    }

    this.render();
  }

  private importExpectedInventoryFromText(): void {
    try {
      this.expectedInventory = parseRoomFurnitureInventoryJson(this.expectedInventoryText);
      this.expectedInventoryStatus = `Imported expected inventory: ${flattenInventoryItems(this.expectedInventory).length} items.`;
    } catch (error) {
      this.expectedInventory = null;
      this.expectedInventoryStatus = error instanceof Error ? error.message : "Expected inventory import failed.";
    }

    this.render();
  }

  private importExpectedFurnitureStructureFromText(): void {
    try {
      this.expectedFurnitureStructure = parseRoomFurnitureStructureJson(this.expectedFurnitureStructureText);
      this.expectedFurnitureStructureStatus = `Imported expected structure: ${this.expectedFurnitureStructure.furnitureGroups.length} groups, ${this.expectedFurnitureStructure.standaloneItems.length} standalone items.`;
    } catch (error) {
      this.expectedFurnitureStructure = null;
      this.expectedFurnitureStructureStatus = error instanceof Error ? error.message : "Expected furniture structure import failed.";
    }

    this.render();
  }

  private importExpectedDocumentMapFromText(): void {
    try {
      this.expectedDocumentMap = parseDocumentMapJson(this.expectedDocumentMapText);
      this.expectedDocumentMapStatus = `Imported expected Document Map: ${this.expectedDocumentMap.pages.length} pages, ${this.expectedDocumentMap.floors.length} floors.`;
    } catch (error) {
      this.expectedDocumentMap = null;
      this.expectedDocumentMapStatus = error instanceof Error ? error.message : "Expected Document Map import failed.";
    }

    this.render();
  }

  private renderPreservingListScroll(): void {
    const list = this.root.querySelector<HTMLElement>(".pdf-intake-page-list");
    const scrollTop = list?.scrollTop ?? 0;

    this.render();

    const nextList = this.root.querySelector<HTMLElement>(".pdf-intake-page-list");
    if (nextList) nextList.scrollTop = scrollTop;
  }

  private updateBulkCount(): void {
    const count = this.root.querySelector<HTMLElement>("[data-selected-page-count]");
    if (count) count.textContent = `${this.selectedPages.size} selected`;
  }

  private syncPageTypeControls(page: PageReviewItem): void {
    for (const select of this.root.querySelectorAll<HTMLSelectElement>(`select[data-page-type-for="${page.pageNumber}"]`)) {
      select.value = page.finalType;
    }

    const selectedMeta = this.root.querySelector<HTMLElement>("[data-selected-page-summary]");
    if (selectedMeta && page.pageNumber === this.selectedPageNumber) {
      selectedMeta.textContent = `Predicted: ${TYPE_LABELS[page.predictedType]} - Final: ${TYPE_LABELS[page.finalType]} - Expected: ${page.expectedType ? TYPE_LABELS[page.expectedType] : "unknown"} - Status: ${getEvaluationStatus(page)} - Confidence ${page.confidence.toFixed(2)}`;
    }

    const selectedEvaluation = this.root.querySelector<HTMLElement>("[data-selected-page-evaluation]");
    if (selectedEvaluation && page.pageNumber === this.selectedPageNumber) {
      selectedEvaluation.innerHTML = `predictedType: ${TYPE_LABELS[page.predictedType]}<br />finalType: ${TYPE_LABELS[page.finalType]}<br />expectedType: ${page.expectedType ? TYPE_LABELS[page.expectedType] : "unknown"}<br />status: ${getEvaluationStatus(page)}`;
    }
  }

  private buildDocumentMap(): DocumentMap {
    const map = buildDocumentMap({
      fileName: this.options.fileName,
      pages: this.options.pages,
      pageOverrides: this.documentMapPageOverrides,
      roomOverrides: this.documentMapRoomOverrides,
      pageRoomOverrides: this.documentMapPageRoomOverrides
    });

    const extraByRoom = this.documentMapExtraParameters;
    const patchRoom = (room: DocumentMapRoom): DocumentMapRoom => ({
      ...room,
      extraParameters: [
        ...room.extraParameters,
        ...(extraByRoom[room.roomId] ?? [])
      ]
    });

    return {
      ...map,
      pages: map.pages.map((page) => ({
        ...page,
        roomsDetected: page.roomsDetected.map(patchRoom)
      })),
      floors: map.floors.map((floor) => ({
        ...floor,
        rooms: floor.rooms.map(patchRoom)
      }))
    };
  }

  private updateDocumentMapExtraParameter(roomId: string, index: number, patch: Partial<ExtraExtractedParameter>): void {
    const parameters = this.documentMapExtraParameters[roomId] ?? [];
    const parameter = parameters[index];
    if (!parameter) return;
    parameters[index] = {
      ...parameter,
      ...patch
    };
    this.documentMapExtraParameters[roomId] = parameters;
  }

  private buildProjectContext(): ProjectContext {
    const context = buildProjectContext({
      pages: this.options.pages,
      roomOverrides: this.roomOverrides,
      furnitureOverrides: this.furnitureOverrides,
      pageRoomOverrides: this.pageRoomOverrides
    });

    const rooms = [...context.rooms, ...this.manualRooms]
      .filter((room) => !this.deletedRoomIds.has(room.id))
      .map((room) => ({
        ...room,
        ...this.roomOverrides[room.id],
        pageNumbers: Array.from(new Set([
          ...room.pageNumbers,
          ...Object.entries(this.pageRoomOverrides)
            .filter(([, roomIds]) => (roomIds ?? []).includes(room.id))
            .map(([pageNumber]) => Number(pageNumber))
        ])).sort((left, right) => left - right)
      }));

    const roomIds = new Set(rooms.map((room) => room.id));
    const furniture = [...context.furniture, ...this.manualFurniture]
      .filter((item) => !this.deletedFurnitureIds.has(item.id))
      .map((item) => {
        const override = this.furnitureOverrides[item.id];
        const next = { ...item, ...override };
        return {
          ...next,
          roomId: next.roomId && roomIds.has(next.roomId) ? next.roomId : undefined
        };
      });

    const assignedPages = new Set(rooms.flatMap((room) => room.pageNumbers));

    return {
      ...context,
      rooms,
      furniture,
      unassignedPages: this.options.pages
        .filter((page) => page.finalType !== "irrelevant" && !assignedPages.has(page.pageNumber))
        .map((page) => page.pageNumber)
    };
  }

  private createCurrentProjectContextExport(context = this.buildProjectContext()): ProjectContextExport {
    return createProjectContextExport({
      fileName: this.options.fileName,
      context
    });
  }

  private buildRoomFurnitureInventory(context: ProjectContext): RoomFurnitureInventory {
    return {
      ...buildRoomFurnitureInventory({
      fileName: this.options.fileName,
      context,
      pages: this.options.pages,
      itemOverrides: this.inventoryOverrides,
      manualItems: this.manualInventoryItems,
      deletedItemIds: this.deletedInventoryItemIds
      }),
      cleanupActions: this.cleanupActions
    };
  }

  private buildRoomDetailExtraction(context: ProjectContext, inventory: RoomFurnitureInventory): RoomDetailExtraction {
    return buildRoomDetailExtraction({
      fileName: this.options.fileName,
      context,
      inventory,
      pages: this.options.pages,
      roomId: this.detailRoomId || undefined,
      roomType: this.detailRoomId ? undefined : "entry_hall"
    });
  }

  private applyFurnitureStructureOverrides(structure: RoomFurnitureStructure): RoomFurnitureStructure {
    return {
      ...structure,
      furnitureGroups: structure.furnitureGroups.map((group) => {
        const groupOverride = this.furnitureStructureOverrides[group.groupId] ?? {};
        return {
          ...group,
          ...groupOverride,
          modules: group.modules.map((module) => ({
            ...module,
            ...(this.furnitureStructureModuleOverrides[module.moduleId] ?? {})
          })),
          associatedItems: group.associatedItems.map((item) => ({
            ...item,
            ...(this.furnitureStructureAssociatedOverrides[item.itemId] ?? {})
          }))
        };
      }),
      standaloneItems: structure.standaloneItems.map((item) => ({
        ...item,
        ...(this.furnitureStructureStandaloneOverrides[item.itemId] ?? {})
      }))
    };
  }

  private async runRoomDetailVisionFallback(resetText: boolean): Promise<void> {
    if (resetText) this.roomDetailVisionExtraction = null;
    if (resetText) this.roomDetailRawVisionResponse = null;
    this.roomDetailStatus = "checking vision fallback...";
    this.renderPreservingListScroll();

    try {
      const context = this.buildProjectContext();
      const inventory = this.buildRoomFurnitureInventory(context);
      const textExtraction = this.buildRoomDetailExtraction(context, inventory);
      const room = context.rooms.find((candidate) => candidate.id === textExtraction.roomId);
      if (!room) {
        this.roomDetailStatus = "selected room not found";
        this.renderPreservingListScroll();
        return;
      }

      if (!shouldRunVisionFallback(textExtraction)) {
        this.roomDetailStatus = "text-only result is ready; vision fallback not triggered";
        this.renderPreservingListScroll();
        return;
      }

      const result = await runRoomDetailVisionExtraction({
        textExtraction,
        visionInput: buildRoomDetailVisionInput({
          room,
          textExtraction,
          inventory,
          pages: this.options.pages,
          context
        })
      });

      if (!result) {
        this.roomDetailStatus = "vision not configured";
        this.renderPreservingListScroll();
        return;
      }

      this.roomDetailVisionExtraction = result.extraction;
      this.roomDetailRawVisionResponse = result.rawVisionResponse;
      this.roomDetailStatus = `vision result${result.modelName ? `: ${result.modelName}` : ""}`;
    } catch (error) {
      this.roomDetailStatus = error instanceof Error ? error.message : "vision fallback failed";
    }

    this.renderPreservingListScroll();
  }

  private applySafeCleanupSuggestions(): number {
    let applied = 0;

    for (const suggestion of this.cleanupSuggestions.filter((item) => item.safe)) {
      if (suggestion.action === "assign_room" && suggestion.itemId && suggestion.roomId) {
        this.inventoryOverrides[suggestion.itemId] = {
          ...this.inventoryOverrides[suggestion.itemId],
          roomId: suggestion.roomId
        };
        this.cleanupActions.push({
          actionId: suggestion.id,
          source: "heuristic",
          actionType: "assign_room",
          inputSummary: suggestion.label,
          confidence: 1,
          reason: "Applied safe heuristic suggestion.",
          itemIds: [suggestion.itemId],
          roomId: suggestion.roomId
        });
        applied += 1;
        continue;
      }

      if (suggestion.action === "merge_duplicate" && suggestion.duplicateGroupId && suggestion.duplicateItemIds && suggestion.duplicateItemIds.length > 1) {
        this.duplicateCleanupStatuses[suggestion.duplicateGroupId] = "merged";
        for (const itemId of suggestion.duplicateItemIds.slice(1)) {
          this.inventoryOverrides[itemId] = {
            ...this.inventoryOverrides[itemId],
            status: "ignored"
          };
        }
        this.cleanupActions.push({
          actionId: suggestion.id,
          source: "heuristic",
          actionType: "merge_duplicate",
          inputSummary: suggestion.label,
          confidence: 1,
          reason: "Applied safe heuristic duplicate merge.",
          itemIds: suggestion.duplicateItemIds
        });
        applied += 1;
      }
    }

    return applied;
  }

  private async generateAiCleanupSuggestions(): Promise<void> {
    this.aiCleanupStatus = "Generating AI cleanup suggestions...";
    this.renderPreservingListScroll();

    try {
      const context = this.buildProjectContext();
      const inventory = this.buildRoomFurnitureInventory(context);
      const cleanup = createInventoryCleanupReview({
        inventory,
        context,
        pages: this.options.pages,
        duplicateGroupStatuses: this.duplicateCleanupStatuses,
        roomCleanupStatuses: this.roomCleanupStatuses
      });
      const generation = await generateAiCleanupSuggestions(buildAiCleanupInput(cleanup, context, this.options.pages));
      this.aiCleanupSuggestions = generation.suggestions;
      this.selectedAiSuggestionIds.clear();
      for (const suggestion of generation.suggestions) {
        if (suggestion.tier === "high") this.selectedAiSuggestionIds.add(suggestion.id);
      }
      this.aiHighConfidenceAppliedCount = 0;
      this.aiCleanupStatus = `Generated ${generation.suggestions.length} AI suggestions, ${generation.suggestions.filter((suggestion) => suggestion.tier === "high").length} high confidence.`;
    } catch (error) {
      this.aiCleanupSuggestions = [];
      this.selectedAiSuggestionIds.clear();
      this.aiCleanupStatus = error instanceof Error ? error.message : "AI cleanup failed.";
    }

    this.renderPreservingListScroll();
  }

  private applyHighConfidenceAiSuggestions(): number {
    let applied = 0;

    for (const suggestion of this.aiCleanupSuggestions.filter((item) => item.tier === "high" && this.selectedAiSuggestionIds.has(item.id))) {
      if (suggestion.kind === "assignment" && suggestion.itemId && suggestion.suggestedRoomId) {
        this.inventoryOverrides[suggestion.itemId] = {
          ...this.inventoryOverrides[suggestion.itemId],
          roomId: suggestion.suggestedRoomId
        };
        this.cleanupActions.push(createAiCleanupAudit(suggestion));
        applied += 1;
        continue;
      }

      if (suggestion.kind === "duplicate" && suggestion.itemIds && suggestion.itemIds.length > 1) {
        if (suggestion.duplicateAction === "merge") {
          for (const itemId of suggestion.itemIds.slice(1)) {
            this.inventoryOverrides[itemId] = {
              ...this.inventoryOverrides[itemId],
              status: "ignored"
            };
          }
        }
        this.cleanupActions.push(createAiCleanupAudit(suggestion));
        applied += 1;
        continue;
      }

      if (suggestion.kind === "room_status" && suggestion.roomId && suggestion.roomStatus === "no_custom_furniture") {
        this.roomCleanupStatuses[suggestion.roomId] = "no_custom_furniture";
        this.cleanupActions.push(createAiCleanupAudit(suggestion));
        applied += 1;
      }
    }

    return applied;
  }

  private invalidateProjectContext(): boolean {
    if (!this.projectContextAccepted) return false;
    this.projectContextAccepted = false;
    this.projectContextStatus = "Typy strán sa zmenili. Znovu potvrď page review, aby sa Project Context prepočítal.";
    return true;
  }

  private downloadProjectContextJson(kind: string, payload: unknown): void {
    const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: "application/json" });
    const link = document.createElement("a");

    link.href = URL.createObjectURL(blob);
    link.download = `${projectContextFileStem(this.options.fileName)}-${kind}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
  }
}

function renderPageListItem(page: PageReviewItem, selected: boolean, bulkSelected: boolean): string {
  return `
    <article class="pdf-intake-page-card ${selected ? "selected" : ""}">
      <label class="pdf-intake-page-check" title="Select page for bulk change">
        <input type="checkbox" data-select-page="${page.pageNumber}" ${bulkSelected ? "checked" : ""} />
      </label>
      <button class="pdf-intake-page-select" type="button" data-page-number="${page.pageNumber}">
        <img src="${page.thumbnailDataUrl}" alt="Page ${page.pageNumber} thumbnail" />
      </button>
      <div class="pdf-intake-page-meta">
        <div class="pdf-intake-page-title">
          <strong>Page ${page.pageNumber}</strong>
          <span>${page.confidence.toFixed(2)}</span>
        </div>
        <div class="pdf-intake-page-predicted">Predicted: ${TYPE_LABELS[page.predictedType]}</div>
        <div class="pdf-intake-page-predicted">Expected: ${page.expectedType ? TYPE_LABELS[page.expectedType] : "unknown"}</div>
        <div class="pdf-intake-eval-status ${getEvaluationStatus(page)}">Status: ${getEvaluationStatus(page)}</div>
        <select data-page-type-for="${page.pageNumber}" aria-label="Final type for page ${page.pageNumber}">
          ${PAGE_TYPES.map((type) => `
            <option value="${type}" ${page.finalType === type ? "selected" : ""}>${TYPE_LABELS[type]}</option>
          `).join("")}
        </select>
        <div class="pdf-intake-reasons">${page.reasons.map(escapeHtml).join(", ")}</div>
      </div>
    </article>
  `;
}

function renderSelectedPage(page: PageReviewItem, projectContext: ProjectContext, selectedRoomIds: string[] | undefined): string {
  const assignedRoomIds = selectedRoomIds ?? findAssignedRooms(projectContext, page.pageNumber).map((room) => room.id);

  return `
    <div class="pdf-intake-preview-toolbar">
      <div>
        <h2>Page ${page.pageNumber}</h2>
        <p data-selected-page-summary>Predicted: ${TYPE_LABELS[page.predictedType]} - Final: ${TYPE_LABELS[page.finalType]} - Expected: ${page.expectedType ? TYPE_LABELS[page.expectedType] : "unknown"} - Status: ${getEvaluationStatus(page)} - Confidence ${page.confidence.toFixed(2)}</p>
      </div>
      <select data-page-type-for="${page.pageNumber}" aria-label="Final type for selected page">
        ${PAGE_TYPES.map((type) => `
          <option value="${type}" ${page.finalType === type ? "selected" : ""}>${TYPE_LABELS[type]}</option>
        `).join("")}
      </select>
    </div>
    <div class="pdf-intake-preview-body">
      <img src="${page.thumbnailDataUrl}" alt="Page ${page.pageNumber} preview" />
      <div class="pdf-intake-details">
        <h3>Classification reasons</h3>
        <ul>${page.reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join("")}</ul>
        <h3>Evaluation</h3>
        <p data-selected-page-evaluation>predictedType: ${TYPE_LABELS[page.predictedType]}<br />finalType: ${TYPE_LABELS[page.finalType]}<br />expectedType: ${page.expectedType ? TYPE_LABELS[page.expectedType] : "unknown"}<br />status: ${getEvaluationStatus(page)}</p>
        <h3>Extracted text preview</h3>
        <p>${escapeHtml(page.extractedTextPreview || "No text extracted from this page.")}</p>
        <h3>Page room assignment</h3>
        ${renderPageRoomAssignmentControl(page, projectContext.rooms, assignedRoomIds)}
      </div>
    </div>
  `;
}

function renderPageRoomAssignmentControl(page: PageReviewItem, rooms: ContextRoom[], assignedRoomIds: string[]): string {
  if (rooms.length === 0) {
    return `<p class="pdf-intake-status-line">Miestnosti sa zobrazia až po potvrdení page review.</p>`;
  }

  if (page.finalType === "floor_plan" || page.finalType === "measurement_floor_plan" || page.finalType === "visualization") {
    return `
      <label>${page.finalType === "visualization" ? "Vizualizácia" : "Pôdorys"} môže mať viac miestností
        <select data-page-rooms-for="${page.pageNumber}" multiple size="${Math.min(Math.max(rooms.length, 3), 8)}" aria-label="Room assignments for page ${page.pageNumber}">
          ${rooms.map((room) => `<option value="${escapeHtml(room.id)}" ${assignedRoomIds.includes(room.id) ? "selected" : ""}>${escapeHtml(roomLabel(room))}</option>`).join("")}
        </select>
      </label>
    `;
  }

  const selectedRoomId = assignedRoomIds[0];
  return `
    <label>Miestnosť
      <select data-page-room-for="${page.pageNumber}" aria-label="Room assignment for page ${page.pageNumber}">
        <option value="" ${selectedRoomId ? "" : "selected"}>Nepriradené</option>
        ${rooms.map((room) => `<option value="${escapeHtml(room.id)}" ${selectedRoomId === room.id ? "selected" : ""}>${escapeHtml(roomLabel(room))}</option>`).join("")}
      </select>
    </label>
  `;
}

function renderProjectContextGate(status: string, pages: PageReviewItem[]): string {
  const summary = PAGE_TYPES.map((type) => ({
    type,
    count: pages.filter((page) => page.finalType === type).length
  }));

  return `
    <section class="pdf-intake-context pdf-intake-context-gate">
      <header>
        <div>
          <h2>Project Context</h2>
          <p>Najprv dokonči page review. Miestnosti sa budú hľadať až po potvrdení a iba na stránkach označených ako floor_plan.</p>
        </div>
        <button class="pdf-intake-primary" type="button" data-accept-page-review>Accept page review & build context</button>
      </header>
      <div class="pdf-intake-summary-grid">
        ${summary.map((item) => `<div><strong>${item.count}</strong><span>${TYPE_LABELS[item.type]}</span></div>`).join("")}
      </div>
      <div class="pdf-intake-status-line">${escapeHtml(status)}</div>
    </section>
  `;
}

function createEmptyProjectContext(): ProjectContext {
  return {
    floors: [],
    rooms: [],
    furniture: [],
    unassignedPages: []
  };
}

function createEmptyRoomFurnitureInventory(fileName: string): RoomFurnitureInventory {
  return {
    fileName,
    rooms: [],
    unassignedItems: [],
    summary: {
      totalRooms: 0,
      totalPrimaryItems: 0,
      totalSecondaryItems: 0,
      totalUnassignedItems: 0,
      roomsWithoutFurniture: 0
    }
  };
}

interface DocumentMapPanelInput {
  documentMap: DocumentMap;
  expectedText: string;
  expectedStatus: string;
  evaluation: DocumentMapEvaluationReport | null;
}

function renderDocumentMapPanel(input: DocumentMapPanelInput): string {
  const map = input.documentMap;
  const floorIds = Array.from(new Set([
    ...map.floors.map((floor) => floor.floorId),
    ...map.pages.map((page) => page.floorId).filter((floorId): floorId is string => Boolean(floorId))
  ])).sort();
  const rooms = map.floors.flatMap((floor) => floor.rooms);

  return `
    <section class="pdf-intake-context pdf-intake-document-map">
      <header>
        <div>
          <h2>Document Map</h2>
          <p>Text-only mapa dokumentu: stranky, podlazia, miestnosti a prepojenia.</p>
        </div>
        <div class="pdf-intake-context-actions">
          <button type="button" data-export-document-map>Export document-map.json</button>
          <button type="button" data-export-expected-document-map>Export expected-document-map.json</button>
          <button type="button" data-export-document-map-evaluation ${input.evaluation ? "" : "disabled"}>Export document-map-evaluation.json</button>
        </div>
      </header>
      <div class="pdf-intake-summary-grid">
        <div><strong>${map.floors.length}</strong><span>floors</span></div>
        <div><strong>${rooms.length}</strong><span>rooms</span></div>
        <div><strong>${map.pages.filter((page) => page.pageType === "furniture_floor_plan").length}</strong><span>furniture plans</span></div>
        <div><strong>${map.pages.filter((page) => page.pageType === "measurement_floor_plan").length}</strong><span>measured plans</span></div>
        <div><strong>${map.pages.filter((page) => page.pageType === "technical_floor_plan").length}</strong><span>technical plans</span></div>
        <div><strong>${map.roomPageLinks.length}</strong><span>room links</span></div>
      </div>
      ${map.warnings.length > 0 ? `<div class="pdf-intake-needs-review">${map.warnings.slice(0, 8).map(escapeHtml).join(" / ")}</div>` : ""}
      <details class="pdf-intake-document-map-details">
        <summary>Review and edit Document Map details</summary>
        <div class="pdf-intake-document-map-grid">
          <section>
            <h3>Floors</h3>
            ${map.floors.length === 0 ? `<p>No floors detected.</p>` : map.floors.map(renderDocumentMapFloor).join("")}
          </section>
          <section>
            <h3>Rooms</h3>
            <div class="pdf-intake-document-map-card-grid">
              ${rooms.length === 0 ? `<p>No rooms detected.</p>` : rooms.map(renderDocumentMapRoom).join("")}
            </div>
          </section>
          <section>
            <h3>Pages</h3>
            <div class="pdf-intake-document-map-pages">
              ${map.pages.map((page) => renderDocumentMapPageRow(page, floorIds, rooms)).join("")}
            </div>
          </section>
          <section>
            <h3>Room Page Links</h3>
            <div class="pdf-intake-document-map-card-grid">
              ${map.roomPageLinks.length === 0 ? `<p>No room links.</p>` : map.roomPageLinks.map(renderDocumentMapLink).join("")}
            </div>
          </section>
        </div>
        ${renderExpectedDocumentMapControls(input.expectedText, input.expectedStatus)}
        ${renderDocumentMapEvaluation(input.evaluation)}
      </details>
    </section>
  `;
}

function renderDocumentMapFloor(floor: DocumentMap["floors"][number]): string {
  return `
    <article class="pdf-intake-context-card">
      <strong>${escapeHtml(floor.floorId)}</strong>
      <span>${floor.confidence.toFixed(2)} confidence</span>
      <small>primary: ${floor.primaryFurniturePlanPages.join(", ") || "none"}</small>
      <small>fallback: ${floor.fallbackMeasurementPlanPages.join(", ") || "none"}</small>
      <small>technical: ${floor.technicalPlanPages.join(", ") || "none"}</small>
      <small>rooms: ${floor.rooms.map((room) => `${room.roomNumber ?? "?"} ${room.roomType}`).join(", ") || "none"}</small>
    </article>
  `;
}

function renderDocumentMapPageRow(page: DocumentMap["pages"][number], floorIds: string[], rooms: DocumentMapRoom[]): string {
  return `
    <article class="pdf-intake-document-map-page-row ${page.needsReview ? "needs-review" : ""}">
      <div class="pdf-intake-document-map-page-title">
        <strong>Page ${page.pageNumber}</strong>
        <p>${escapeHtml(page.pageTitleOriginal ?? "No title")}</p>
        <small>${escapeHtml(page.documentKind)}${page.technicalSubtype ? ` / ${escapeHtml(page.technicalSubtype)}` : ""}</small>
      </div>
      <label>pageType
        <select data-document-map-page-type-for="${page.pageNumber}">
          ${DOCUMENT_MAP_PAGE_TYPES.map((type) => `<option value="${type}" ${page.pageType === type ? "selected" : ""}>${DOCUMENT_MAP_TYPE_LABELS[type]}</option>`).join("")}
        </select>
      </label>
      <label>floorId
        <select data-document-map-floor-for="${page.pageNumber}">
          <option value="" ${page.floorId ? "" : "selected"}>unknown</option>
          ${floorIds.map((floorId) => `<option value="${escapeHtml(floorId)}" ${page.floorId === floorId ? "selected" : ""}>${escapeHtml(floorId)}</option>`).join("")}
        </select>
      </label>
      <label>primary
        <input type="checkbox" data-document-map-primary-for="${page.pageNumber}" ${page.isPrimaryFurniturePlan ? "checked" : ""} />
      </label>
      <label>assign room
        <select data-document-map-page-room-for="${page.pageNumber}">
          <option value="">auto / unassigned</option>
          ${rooms.map((room) => `<option value="${escapeHtml(room.roomId)}">${escapeHtml(documentMapRoomLabel(room))}</option>`).join("")}
        </select>
      </label>
      <span>${page.confidence.toFixed(2)}</span>
      <small>${page.roomHints.length ? `hints: ${page.roomHints.map(escapeHtml).join(", ")}` : "no room hints"}</small>
      <small>${page.reasons.map(escapeHtml).join(", ")}</small>
    </article>
  `;
}

function renderDocumentMapRoom(room: DocumentMapRoom): string {
  return `
    <article class="pdf-intake-context-card pdf-intake-document-map-room">
      <strong>${escapeHtml(documentMapRoomLabel(room))}</strong>
      <label>roomType
        <select data-document-map-room-type-for="${escapeHtml(room.roomId)}">
          ${ROOM_TYPES.map((type) => `<option value="${type}" ${room.roomType === type ? "selected" : ""}>${type}</option>`).join("")}
        </select>
      </label>
      <small>area: ${room.knownParameters.areaM2 ?? "?"} m2 / pages: ${room.sourcePageNumbers.join(", ")}</small>
      <small>confidence: ${room.confidence.toFixed(2)}</small>
      ${room.extraParameters.length === 0 ? `<small>extra parameters: none</small>` : room.extraParameters.map((param, index) => `
        <label>extra key
          <input data-document-map-param-key-for="${escapeHtml(room.roomId)}" data-param-index="${index}" value="${escapeHtml(param.keyOriginal)}" />
        </label>
        <label>extra value
          <input data-document-map-param-value-for="${escapeHtml(room.roomId)}" data-param-index="${index}" value="${escapeHtml(param.valueOriginal)}" />
        </label>
      `).join("")}
      <button type="button" data-add-document-map-param="${escapeHtml(room.roomId)}">Add extra parameter</button>
    </article>
  `;
}

function renderDocumentMapLink(link: RoomPageLink): string {
  return `
    <article class="pdf-intake-context-card ${link.roomId ? "" : "needs-review"}">
      <strong>${escapeHtml(link.roomNameOriginal ?? link.roomType ?? "Unassigned")}</strong>
      <span>pages ${link.pageNumbers.join(", ")}</span>
      <small>${link.linkTypes.map(escapeHtml).join(", ")}</small>
      <small>${link.confidence.toFixed(2)} confidence</small>
      <small>${link.reasons.map(escapeHtml).join(", ")}</small>
    </article>
  `;
}

function renderExpectedDocumentMapControls(value: string, status: string): string {
  return `
    <section class="pdf-intake-context-expected">
      <div class="pdf-intake-ground-truth-row">
        <label>
          <span>Import expected Document Map JSON</span>
          <input type="file" accept="application/json,.json" data-expected-document-map-file />
        </label>
        <button type="button" data-import-expected-document-map>Import pasted document map</button>
      </div>
      <textarea data-expected-document-map-text rows="4" placeholder='{"fileName":"project.pdf","documentMapVersion":"1.0","pages":[],"floors":[],"roomPageLinks":[],"warnings":[],"confidence":0}'>${escapeHtml(value)}</textarea>
      <div class="pdf-intake-status-line">${escapeHtml(status)}</div>
    </section>
  `;
}

function renderDocumentMapEvaluation(evaluation: DocumentMapEvaluationReport | null): string {
  if (!evaluation) return `<section class="pdf-intake-context-eval-empty">Import expected Document Map JSON to evaluate text-only mapping.</section>`;

  return `
    <section class="pdf-intake-context-eval">
      <div class="pdf-intake-context-eval-grid">
        <div><strong>${Math.round(evaluation.pageTypeAccuracy * 100)}%</strong><span>page type accuracy</span></div>
        <div><strong>${Math.round(evaluation.relevantPageRecall * 100)}%</strong><span>relevant recall</span></div>
        <div><strong>${Math.round(evaluation.furnitureFloorPlanRecall * 100)}%</strong><span>furniture plan recall</span></div>
        <div><strong>${Math.round(evaluation.floorDetectionAccuracy * 100)}%</strong><span>floor accuracy</span></div>
        <div><strong>${evaluation.primaryFurniturePlan.foundFloors}/${evaluation.primaryFurniturePlan.expectedFloors}</strong><span>primary plans</span></div>
        <div><strong>${evaluation.falsePositiveTechnicalAsFurniture}</strong><span>technical false positives</span></div>
      </div>
      <div class="pdf-intake-context-eval-lists">
        <div><strong>Rooms</strong><span>${evaluation.rooms.found}/${evaluation.rooms.expected}; missing ${evaluation.rooms.missing.length}</span></div>
        <div><strong>Room links</strong><span>${evaluation.roomPageLinks.found}/${evaluation.roomPageLinks.expected}; missing ${evaluation.roomPageLinks.missing.length}</span></div>
        <div><strong>Warnings</strong><span>${evaluation.warnings.slice(0, 8).map(escapeHtml).join(" / ") || "none"}</span></div>
      </div>
    </section>
  `;
}

interface ProjectContextWizardRenderInput {
  projectContext: ProjectContext;
  pages: PageReviewItem[];
  currentStep: number;
  debugVisible: boolean;
  relevantPageFilter: "all" | "unassigned" | "floor_plan" | "measurement_floor_plan" | "furniture_schedule" | "visualization";
  expectedText: string;
  expectedStatus: string;
  evaluation: ProjectContextEvaluationReport | null;
  inventory: RoomFurnitureInventory;
  inventoryEvaluation: RoomFurnitureInventoryEvaluationReport | null;
  inventoryCleanup: InventoryCleanupReview;
  roomDetailExtraction: RoomDetailExtraction | null;
  furnitureStructure: RoomFurnitureStructure | null;
  furnitureStructureEvaluation: RoomFurnitureStructureEvaluationReport | null;
  detailRoomId: string;
  roomDetailStatus: string;
  cleanupSuggestions: CleanupSuggestion[];
  cleanupSuggestionStatus: string;
  cleanupSafeAppliedCount: number;
  aiCleanupSuggestions: AiCleanupSuggestion[];
  selectedAiSuggestionIds: Set<string>;
  aiCleanupStatus: string;
  aiHighConfidenceAppliedCount: number;
  inventoryFilter: "all" | "primary" | "secondary" | "unassigned" | "low_confidence" | "ignored";
  expectedInventoryText: string;
  expectedInventoryStatus: string;
  expectedFurnitureStructureText: string;
  expectedFurnitureStructureStatus: string;
}

function renderProjectContextWizard(input: ProjectContextWizardRenderInput): string {
  const steps = [
    ["1", "Poschodia a miestnosti"],
    ["2", "Relevantné stránky"],
    ["3", "Nábytok"],
    ["4", "Room Furniture Inventory"],
    ["5", "Summary & Export"]
  ];

  return `
    <section class="pdf-intake-context wizard">
      <header>
        <div>
          <h2>Project Context Review</h2>
          <p>Skontroluj najprv miestnosti, potom stránky, nábytok a nakoniec export.</p>
        </div>
        <button type="button" data-toggle-context-debug>${input.debugVisible ? "Hide debug" : "Show debug"}</button>
      </header>
      <nav class="pdf-intake-wizard-steps">
        ${steps.map(([step, label]) => `
          <button class="${input.currentStep === Number(step) ? "active" : ""}" type="button" data-context-step="${step}">
            <span>${step}</span>${label}
          </button>
        `).join("")}
      </nav>
      ${input.currentStep === 1 ? renderFloorsRoomsStep(input.projectContext, input.debugVisible) : ""}
      ${input.currentStep === 2 ? renderRelevantPagesStep(input.projectContext, input.pages, input.relevantPageFilter) : ""}
      ${input.currentStep === 3 ? renderFurnitureItemsStep(input.projectContext, input.pages, input.debugVisible) : ""}
      ${input.currentStep === 4 ? renderRoomFurnitureInventoryStep(input) : ""}
      ${input.currentStep === 5 ? renderSummaryStep(input) : ""}
    </section>
  `;
}

function renderFloorsRoomsStep(projectContext: ProjectContext, debugVisible: boolean): string {
  const floorGroups = [
    ...projectContext.floors.map((floor) => ({
      id: floor.id,
      label: floor.label,
      rooms: projectContext.rooms.filter((room) => room.floorId === floor.id),
      floor
    })),
    {
      id: "",
      label: "Bez poschodia",
      rooms: projectContext.rooms.filter((room) => !room.floorId),
      floor: null
    }
  ].filter((group) => group.rooms.length > 0 || group.floor);

  return `
    <section class="pdf-intake-wizard-step">
      <div class="pdf-intake-step-head">
        <div>
          <h3>Step 1: Floors & Rooms</h3>
          <p>Najprv over, či systém správne našiel miestnosti.</p>
        </div>
        <button type="button" data-add-context-room>Pridať miestnosť</button>
      </div>
      ${floorGroups.length === 0 ? `<div class="pdf-intake-needs-review">Needs review: nenašli sa žiadne miestnosti.</div>` : ""}
      <div class="pdf-intake-floor-groups">
        ${floorGroups.map((group) => `
          <section class="pdf-intake-floor-group">
            <h4>${escapeHtml(group.label)}</h4>
            ${group.floor && debugVisible ? `<p class="pdf-intake-debug">${group.floor.reasons.map(escapeHtml).join(", ")}</p>` : ""}
            ${group.rooms.length === 0 ? `<p>Žiadne miestnosti.</p>` : group.rooms.map((room) => renderWizardRoom(room, projectContext.floors, debugVisible)).join("")}
          </section>
        `).join("")}
      </div>
    </section>
  `;
}

function renderWizardRoom(room: ContextRoom, floors: ProjectContext["floors"], debugVisible: boolean): string {
  return `
    <article class="pdf-intake-review-row">
      <div class="pdf-intake-room-main">
        <label>Číslo<input data-room-number-for="${escapeHtml(room.id)}" value="${escapeHtml(room.roomNumber ?? "")}" /></label>
        <label>Názov z PDF<input data-room-name-for="${escapeHtml(room.id)}" value="${escapeHtml(room.nameOriginal)}" /></label>
        <label>Typ miestnosti
          <select data-room-type-for="${escapeHtml(room.id)}">
            ${ROOM_TYPES.map((type) => `<option value="${type}" ${room.type === type ? "selected" : ""}>${type}</option>`).join("")}
          </select>
        </label>
        <label>Funkcie miestnosti
          <select data-room-functions-for="${escapeHtml(room.id)}" multiple size="4">
            ${ROOM_FUNCTION_TYPES.map((type) => `<option value="${type}" ${roomFunctions(room).includes(type) ? "selected" : ""}>${type}</option>`).join("")}
          </select>
        </label>
        <label>Plocha m2<input data-room-area-for="${escapeHtml(room.id)}" value="${room.area ?? ""}" inputmode="decimal" /></label>
        <label>Poschodie
          <select data-room-floor-for="${escapeHtml(room.id)}">
            <option value="" ${room.floorId ? "" : "selected"}>Bez poschodia</option>
            ${floors.map((floor) => `<option value="${escapeHtml(floor.id)}" ${room.floorId === floor.id ? "selected" : ""}>${escapeHtml(floor.label)}</option>`).join("")}
          </select>
        </label>
        <span class="pdf-intake-confidence">Istota ${room.confidence.toFixed(2)}</span>
        <button type="button" data-delete-context-room="${escapeHtml(room.id)}">Zmazať</button>
      </div>
      ${debugVisible ? `<p class="pdf-intake-debug">${room.reasons.map(escapeHtml).join(", ")}</p>` : ""}
    </article>
  `;
}

function renderRelevantPagesStep(
  projectContext: ProjectContext,
  pages: PageReviewItem[],
  filter: ProjectContextWizardRenderInput["relevantPageFilter"]
): string {
  const relevantPages = pages.filter((page) => page.finalType !== "irrelevant");
  const pageRows = relevantPages
    .map((page) => ({ page, rooms: findAssignedRooms(projectContext, page.pageNumber) }))
    .filter(({ page, rooms }) => {
      if (filter === "all") return true;
      if (filter === "unassigned") return rooms.length === 0;
      return page.finalType === filter;
    });
  const unassigned = relevantPages.filter((page) => findAssignedRooms(projectContext, page.pageNumber).length === 0);

  return `
    <section class="pdf-intake-wizard-step">
      <div class="pdf-intake-step-head">
        <div>
          <h3>Step 2: Relevant Pages</h3>
          <p>Potom priraď stránky k miestnostiam.</p>
        </div>
        <label>Filter
          <select data-context-page-filter>
            ${["all", "unassigned", "floor_plan", "measurement_floor_plan", "furniture_schedule", "visualization"].map((value) => `<option value="${value}" ${filter === value ? "selected" : ""}>${value === "all" ? "Všetky" : value === "unassigned" ? "Nepriradené" : value}</option>`).join("")}
          </select>
        </label>
      </div>
      ${unassigned.length > 0 ? `<div class="pdf-intake-needs-review">Needs review: ${unassigned.length} relevantných strán je nepriradených.</div>` : ""}
      <div class="pdf-intake-page-review-list">
        ${pageRows.length === 0 ? `<p>Žiadne stránky pre tento filter.</p>` : pageRows.map(({ page, rooms }) => renderRelevantPageRow(page, rooms, projectContext)).join("")}
      </div>
    </section>
  `;
}

function renderRelevantPageRow(page: PageReviewItem, assignedRooms: ContextRoom[], projectContext: ProjectContext): string {
  return `
    <article class="pdf-intake-relevant-page ${assignedRooms.length > 0 ? "" : "needs-review"}">
      <img src="${page.thumbnailDataUrl}" alt="Page ${page.pageNumber}" />
      <div>
        <strong>Page ${page.pageNumber}</strong>
        <span>${TYPE_LABELS[page.finalType]}</span>
        <p>${escapeHtml(pageTitle(page))}</p>
      </div>
      ${renderPageRoomAssignmentControl(page, projectContext.rooms, assignedRooms.map((room) => room.id))}
      <span>Poschodie: ${assignedRooms.map((room) => room.floorId?.replace("_", " ")).filter(Boolean).join(", ") || "Nepriradené"}</span>
      <button type="button" data-mark-page-irrelevant="${page.pageNumber}">Označiť irrelevant</button>
    </article>
  `;
}

function renderFurnitureItemsStep(projectContext: ProjectContext, pages: PageReviewItem[], debugVisible: boolean): string {
  const roomGroups = [
    ...projectContext.rooms.map((room) => ({
      label: roomLabel(room),
      roomId: room.id,
      items: projectContext.furniture.filter((item) => item.roomId === room.id)
    })),
    {
      label: "Bez miestnosti",
      roomId: "",
      items: projectContext.furniture.filter((item) => !item.roomId)
    }
  ].filter((group) => group.items.length > 0 || group.roomId === "");

  return `
    <section class="pdf-intake-wizard-step">
      <div class="pdf-intake-step-head">
        <div>
          <h3>Step 3: Furniture Items</h3>
          <p>Nakoniec skontroluj nábytok.</p>
        </div>
        <button type="button" data-add-context-furniture>Pridať nábytok</button>
      </div>
      ${projectContext.furniture.some((item) => !item.roomId) ? `<div class="pdf-intake-needs-review">Needs review: niektorý nábytok nemá miestnosť.</div>` : ""}
      <div class="pdf-intake-furniture-groups">
        ${roomGroups.map((group) => `
          <section>
            <h4>${escapeHtml(group.label)}</h4>
            ${group.items.length === 0 ? `<p>Žiadne položky.</p>` : group.items.map((item) => renderFurnitureReviewItem(item, projectContext.rooms, pages, debugVisible)).join("")}
          </section>
        `).join("")}
      </div>
    </section>
  `;
}

function renderFurnitureReviewItem(item: ContextFurniture, rooms: ProjectContext["rooms"], pages: PageReviewItem[], debugVisible: boolean): string {
  const sourcePage = pages.find((page) => page.pageNumber === item.pageNumber);

  return `
    <article class="pdf-intake-review-row ${item.roomId ? "" : "needs-review"}">
      <div class="pdf-intake-room-main">
        <label>Typ nábytku
          <select data-furniture-type-for="${escapeHtml(item.id)}">
            ${FURNITURE_TYPES.map((type) => `<option value="${type}" ${item.type === type ? "selected" : ""}>${type}</option>`).join("")}
          </select>
        </label>
        <label>Miestnosť
          <select data-furniture-room-for="${escapeHtml(item.id)}">
            <option value="" ${item.roomId ? "" : "selected"}>Nepriradené</option>
            ${rooms.map((room) => `<option value="${escapeHtml(room.id)}" ${item.roomId === room.id ? "selected" : ""}>${escapeHtml(roomLabel(room))}</option>`).join("")}
          </select>
        </label>
        <span>Source page ${item.pageNumber}</span>
        <span class="pdf-intake-confidence">Istota ${item.confidence.toFixed(2)}</span>
        <button type="button" data-delete-context-furniture="${escapeHtml(item.id)}">Irrelevant / zmazať</button>
      </div>
      <p>Originálny text: ${escapeHtml(sourcePage?.extractedTextPreview || "manual item")}</p>
      ${debugVisible ? `<p class="pdf-intake-debug">${item.reasons.map(escapeHtml).join(", ")}</p>` : ""}
    </article>
  `;
}

function renderRoomFurnitureInventoryStep(input: ProjectContextWizardRenderInput): string {
  const allItems = flattenInventoryItems(input.inventory);
  const unassignedPrimary = allItems.filter((item) => item.importance === "primary" && !item.roomId && item.status !== "ignored");
  const lowConfidencePrimary = allItems.filter((item) => item.importance === "primary" && item.confidence < 0.55 && item.status !== "ignored");
  const filteredRooms = input.inventory.rooms.map((room) => ({
    ...room,
    items: filterInventoryItems(room.items, input.inventoryFilter)
  }));
  const filteredUnassigned = filterInventoryItems(input.inventory.unassignedItems, input.inventoryFilter);

  return `
    <section class="pdf-intake-wizard-step pdf-intake-inventory">
      <div class="pdf-intake-step-head">
        <div>
          <h3>Step 4: Room Furniture Inventory</h3>
          <p>Skontroluj nacenitelny nabytok po miestnostiach a odlis kontextove polozky.</p>
        </div>
        <div class="pdf-intake-context-actions">
          <button type="button" data-add-inventory-item>Pridat item</button>
          <button type="button" data-export-room-furniture-inventory>Export room-furniture-inventory.json</button>
          <button type="button" data-export-expected-room-furniture-inventory>Export expected-room-furniture-inventory.json</button>
          <button type="button" data-export-room-furniture-inventory-evaluation ${input.inventoryEvaluation ? "" : "disabled"}>Export room-furniture-inventory-evaluation.json</button>
        </div>
      </div>
      ${unassignedPrimary.length > 0 ? `<div class="pdf-intake-needs-review">Needs review: ${unassignedPrimary.length} primary items su bez miestnosti.</div>` : ""}
      ${lowConfidencePrimary.length > 0 ? `<div class="pdf-intake-needs-review">Needs review: ${lowConfidencePrimary.length} primary items ma nizku istotu.</div>` : ""}
      <div class="pdf-intake-inventory-toolbar">
        <label>Filter
          <select data-inventory-filter>
            ${["all", "primary", "secondary", "unassigned", "low_confidence", "ignored"].map((value) => `<option value="${value}" ${input.inventoryFilter === value ? "selected" : ""}>${inventoryFilterLabel(value as ProjectContextWizardRenderInput["inventoryFilter"])}</option>`).join("")}
          </select>
        </label>
        <div class="pdf-intake-summary-grid">
          <div><strong>${input.inventory.summary.totalRooms}</strong><span>miestnosti</span></div>
          <div><strong>${input.inventory.summary.totalPrimaryItems}</strong><span>primary</span></div>
          <div><strong>${input.inventory.summary.totalSecondaryItems}</strong><span>secondary</span></div>
          <div><strong>${input.inventory.summary.totalUnassignedItems}</strong><span>unassigned</span></div>
          <div><strong>${input.inventory.summary.roomsWithoutFurniture}</strong><span>bez nabytku</span></div>
          <div><strong>${allItems.length}</strong><span>items spolu</span></div>
        </div>
      </div>
      ${renderCleanupReviewMode(input.inventoryCleanup, input.projectContext.rooms, input.cleanupSuggestions, input.cleanupSuggestionStatus, input.cleanupSafeAppliedCount, input.aiCleanupSuggestions, input.selectedAiSuggestionIds, input.aiCleanupStatus, input.aiHighConfidenceAppliedCount)}
      ${renderRoomDetailExtractionPanel(
        input.roomDetailExtraction,
        input.furnitureStructure,
        input.furnitureStructureEvaluation,
        input.projectContext.rooms,
        input.detailRoomId,
        input.roomDetailStatus,
        input.expectedFurnitureStructureText,
        input.expectedFurnitureStructureStatus
      )}
      <div class="pdf-intake-inventory-grid">
        ${filteredRooms.map((room) => renderInventoryRoom(room, input.projectContext.rooms)).join("")}
        ${filteredUnassigned.length > 0 ? `
          <section class="pdf-intake-inventory-room needs-review">
            <h4>Nepriradene items</h4>
            ${renderInventoryItemGroups(filteredUnassigned, input.projectContext.rooms)}
          </section>
        ` : ""}
      </div>
      ${renderExpectedInventoryControls(input.expectedInventoryText, input.expectedInventoryStatus)}
      ${renderInventoryEvaluation(input.inventoryEvaluation)}
    </section>
  `;
}

function renderRoomDetailExtractionPanel(
  extraction: RoomDetailExtraction | null,
  structure: RoomFurnitureStructure | null,
  evaluation: RoomFurnitureStructureEvaluationReport | null,
  rooms: ContextRoom[],
  selectedRoomId: string,
  status: string,
  expectedStructureText: string,
  expectedStructureStatus: string
): string {
  const selectedValue = selectedRoomId || extraction?.roomId || "";
  return `
    <section class="pdf-intake-room-detail">
      <header>
        <div>
          <h4>Room Detail Extraction MVP</h4>
          <p>Text-only detail extraction pre jednu miestnost. Default je entry_hall / predsien.</p>
        </div>
        <div class="pdf-intake-context-actions">
          <button type="button" data-run-room-text-extraction>Run Text Extraction</button>
          <button type="button" data-run-room-vision-fallback>Run Vision Fallback</button>
          <button type="button" data-run-room-text-vision>Run Text + Vision</button>
          <button type="button" data-generate-room-furniture-structure ${structure ? "" : "disabled"}>Generate Furniture Structure</button>
          <label>Miestnost
            <select data-detail-room-select>
              <option value="" ${selectedRoomId ? "" : "selected"}>Auto: entry_hall</option>
              ${rooms.map((room) => `<option value="${escapeHtml(room.id)}" ${selectedValue === room.id ? "selected" : ""}>${escapeHtml(roomLabel(room))}</option>`).join("")}
            </select>
          </label>
          <button type="button" data-export-room-detail-extraction ${extraction ? "" : "disabled"}>Export room-detail-extraction.json</button>
          <button type="button" data-export-room-furniture-structure ${structure ? "" : "disabled"}>Export room-furniture-structure.json</button>
          <button type="button" data-export-room-furniture-structure-audit ${structure ? "" : "disabled"}>Export structure audit JSON</button>
          <button type="button" data-export-expected-room-furniture-structure ${structure ? "" : "disabled"}>Export expected-room-furniture-structure.json</button>
          <button type="button" data-export-room-furniture-structure-evaluation ${evaluation ? "" : "disabled"}>Export structure evaluation JSON</button>
        </div>
      </header>
      <div class="pdf-intake-status-line">Status: ${escapeHtml(status)}</div>
      ${extraction ? renderRoomDetailExtraction(extraction) : `<p>Najprv potvrď Project Context.</p>`}
      ${structure ? renderRoomFurnitureStructure(structure) : ""}
      ${renderExpectedFurnitureStructureControls(expectedStructureText, expectedStructureStatus)}
      ${renderFurnitureStructureEvaluation(evaluation)}
    </section>
  `;
}

function renderRoomDetailExtraction(extraction: RoomDetailExtraction): string {
  return `
    <div class="pdf-intake-room-detail-summary">
      <div><strong>${escapeHtml(extraction.roomNameOriginal ?? extraction.roomType)}</strong><span>${escapeHtml(extraction.roomType)}</span></div>
      <div><strong>${extraction.sourcePageNumbers.join(", ") || "none"}</strong><span>source pages</span></div>
      <div><strong>${extraction.items.length}</strong><span>detailed items</span></div>
      <div><strong>${extraction.confidence.toFixed(2)}</strong><span>confidence</span></div>
    </div>
    ${extraction.warnings.length > 0 ? `<div class="pdf-intake-needs-review">${extraction.warnings.map(escapeHtml).join(" / ")}</div>` : ""}
    <div class="pdf-intake-room-detail-items">
      ${extraction.items.length === 0 ? `<p>Ziadne detailne items pre tuto miestnost.</p>` : extraction.items.map(renderDetailedFurnitureItem).join("")}
    </div>
  `;
}

function renderDetailedFurnitureItem(item: RoomDetailExtraction["items"][number]): string {
  const dimensions = [
    item.dimensions.widthMm ? `W ${item.dimensions.widthMm}` : "",
    item.dimensions.depthMm ? `D ${item.dimensions.depthMm}` : "",
    item.dimensions.heightMm ? `H ${item.dimensions.heightMm}` : ""
  ].filter(Boolean).join(" / ") || "dimensions unknown";

  return `
    <article class="pdf-intake-room-detail-item ${item.needsHumanReview ? "needs-review" : ""}">
      <header>
        <div>
          <strong>${escapeHtml(item.displayName)}</strong>
          <span>${escapeHtml(item.category)} / ${escapeHtml(item.importance)}</span>
        </div>
        <span>${item.confidence.toFixed(2)} confidence</span>
      </header>
      <p>${escapeHtml(dimensions)}</p>
      <p>Components: ${item.components.map(escapeHtml).join(", ")}</p>
      <p>Materials: ${item.materials.length > 0 ? item.materials.map((material) => escapeHtml(material.rawText)).join(" / ") : "unknown"}</p>
      <p>Source pages: ${item.sourcePageNumbers.join(", ") || "none"}</p>
      ${item.needsHumanReview ? `<p class="pdf-intake-debug">Needs human review</p>` : ""}
    </article>
  `;
}

function renderRoomFurnitureStructure(structure: RoomFurnitureStructure): string {
  return `
    <section class="pdf-intake-furniture-structure">
      <header>
        <div>
          <h4>Furniture Structure</h4>
          <p>Stredna vrstva: zostavy, priblizne moduly, integrovane veci a samostatne kusy.</p>
        </div>
        <div class="pdf-intake-room-detail-summary">
          <div><strong>${structure.furnitureGroups.length}</strong><span>groups</span></div>
          <div><strong>${structure.standaloneItems.length}</strong><span>standalone</span></div>
          <div><strong>${structure.unassignedCandidates.length}</strong><span>unassigned</span></div>
          <div><strong>${structure.confidence.toFixed(2)}</strong><span>confidence</span></div>
        </div>
      </header>
      ${structure.warnings.length > 0 ? `<div class="pdf-intake-needs-review">${structure.warnings.map(escapeHtml).join(" / ")}</div>` : ""}
      <div class="pdf-intake-structure-grid">
        <section>
          <h5>Furniture Groups</h5>
          ${structure.furnitureGroups.length === 0 ? `<p>No furniture groups inferred.</p>` : structure.furnitureGroups.map(renderFurnitureGroup).join("")}
        </section>
        <section>
          <h5>Standalone Items</h5>
          ${structure.standaloneItems.length === 0 ? `<p>No standalone items.</p>` : structure.standaloneItems.map(renderStandaloneStructureItem).join("")}
        </section>
        <section>
          <h5>Unassigned Candidates</h5>
          ${structure.unassignedCandidates.length === 0 ? `<p>No uncertain candidates.</p>` : structure.unassignedCandidates.map(renderStructureCandidate).join("")}
        </section>
      </div>
    </section>
  `;
}

function renderExpectedFurnitureStructureControls(value: string, status: string): string {
  return `
    <section class="pdf-intake-context-expected">
      <div class="pdf-intake-ground-truth-row">
        <label>
          <span>Import expected Room Furniture Structure JSON</span>
          <input type="file" accept="application/json,.json" data-expected-furniture-structure-file />
        </label>
        <button type="button" data-import-expected-room-furniture-structure>Import pasted structure</button>
      </div>
      <textarea data-expected-furniture-structure-text rows="4" placeholder='{"fileName":"project.pdf","roomId":"room_1","furnitureGroups":[],"standaloneItems":[],"unassignedCandidates":[],"warnings":[],"confidence":0}'>${escapeHtml(value)}</textarea>
      <div class="pdf-intake-status-line">${escapeHtml(status)}</div>
    </section>
  `;
}

function renderFurnitureStructureEvaluation(evaluation: RoomFurnitureStructureEvaluationReport | null): string {
  if (!evaluation) {
    return `<section class="pdf-intake-context-eval-empty">Import expected Room Furniture Structure JSON to evaluate this room structure.</section>`;
  }

  return `
    <section class="pdf-intake-context-eval">
      <div class="pdf-intake-readiness ${evaluation.readinessForDeepExtraction.level}">
        <strong>${evaluation.readinessForDeepExtraction.level.toUpperCase()}</strong>
        <span>${evaluation.readinessForDeepExtraction.reasons.map(escapeHtml).join(" / ")}</span>
      </div>
      <div class="pdf-intake-context-eval-grid">
        <div><strong>${evaluation.groups.found}/${evaluation.groups.expected}</strong><span>groups found</span></div>
        <div><strong>${evaluation.groups.wrongCategory.length}</strong><span>wrong group category</span></div>
        <div><strong>${evaluation.groups.moduleCountDifferences.length}</strong><span>module count diff</span></div>
        <div><strong>${evaluation.standaloneItems.found}/${evaluation.standaloneItems.expected}</strong><span>standalone found</span></div>
        <div><strong>${evaluation.associatedItems.found}/${evaluation.associatedItems.expected}</strong><span>associated found</span></div>
        <div><strong>${evaluation.materials.found}/${evaluation.materials.expected}</strong><span>materials found</span></div>
        <div><strong>${evaluation.groups.duplicateGroupCount}</strong><span>duplicate groups</span></div>
      </div>
      <div class="pdf-intake-context-eval-lists">
        <div><strong>Missing groups</strong><span>${evaluation.groups.missing.length ? evaluation.groups.missing.map(escapeHtml).join(", ") : "none"}</span></div>
        <div><strong>Missing standalone</strong><span>${evaluation.standaloneItems.missing.length ? evaluation.standaloneItems.missing.map(escapeHtml).join(", ") : "none"}</span></div>
        <div><strong>Missing associated</strong><span>${evaluation.associatedItems.missing.length ? evaluation.associatedItems.missing.map(escapeHtml).join(", ") : "none"}</span></div>
        <div><strong>Missing materials</strong><span>${evaluation.materials.missing.length ? evaluation.materials.missing.map(escapeHtml).join(", ") : "none"}</span></div>
      </div>
    </section>
  `;
}

function renderFurnitureGroup(group: RoomFurnitureStructure["furnitureGroups"][number]): string {
  return `
    <article class="pdf-intake-room-detail-item ${group.needsDeepExtraction ? "needs-review" : ""}">
      <header>
        <div>
          <strong>${escapeHtml(group.displayName)}</strong>
          <span>pages ${group.sourcePageNumbers.join(", ") || "none"} / ${group.confidence.toFixed(2)}</span>
        </div>
        <label>Deep
          <input type="checkbox" data-structure-group-deep-for="${escapeHtml(group.groupId)}" ${group.needsDeepExtraction ? "checked" : ""} />
        </label>
      </header>
      <div class="pdf-intake-context-controls">
        <label>groupCategory
          <select data-structure-group-category-for="${escapeHtml(group.groupId)}">
            ${FURNITURE_GROUP_CATEGORIES.map((category) => `<option value="${category}" ${group.groupCategory === category ? "selected" : ""}>${category}</option>`).join("")}
          </select>
        </label>
        <label>baseCategory
          <select data-structure-group-base-for="${escapeHtml(group.groupId)}">
            ${FURNITURE_GROUP_BASE_CATEGORIES.map((category) => `<option value="${category}" ${group.baseCategory === category ? "selected" : ""}>${category}</option>`).join("")}
          </select>
        </label>
        <label>approx modules
          <input type="number" min="0" data-structure-module-count-for="${escapeHtml(group.groupId)}" value="${group.approximateModuleCount ?? ""}" />
        </label>
      </div>
      <p>Materials: ${group.materials.length > 0 ? group.materials.map((material) => escapeHtml(material.rawText)).join(" / ") : "unknown"}</p>
      <p>Raw dimensions: ${group.rawDimensionTexts.length > 0 ? group.rawDimensionTexts.map(escapeHtml).join(" / ") : "unknown"}</p>
      <div class="pdf-intake-structure-subgrid">
        <div>
          <strong>Approx modules</strong>
          ${group.modules.length === 0 ? `<p>none</p>` : group.modules.map(renderApproxModule).join("")}
        </div>
        <div>
          <strong>Associated items</strong>
          ${group.associatedItems.length === 0 ? `<p>none</p>` : group.associatedItems.map(renderAssociatedItem).join("")}
        </div>
      </div>
      <p class="pdf-intake-debug">${group.reasons.map(escapeHtml).join(" / ")}</p>
    </article>
  `;
}

function renderApproxModule(module: RoomFurnitureStructure["furnitureGroups"][number]["modules"][number]): string {
  return `
    <div class="pdf-intake-structure-row">
      <select data-structure-module-category-for="${escapeHtml(module.moduleId)}">
        ${APPROX_MODULE_CATEGORIES.map((category) => `<option value="${category}" ${module.baseCategory === category ? "selected" : ""}>${category}</option>`).join("")}
      </select>
      <span>${escapeHtml(module.label ?? module.moduleId)} / pages ${module.sourcePageNumbers.join(", ") || "none"}</span>
      <label>Deep <input type="checkbox" data-structure-module-deep-for="${escapeHtml(module.moduleId)}" ${module.needsDeepExtraction ? "checked" : ""} /></label>
    </div>
  `;
}

function renderAssociatedItem(item: RoomFurnitureStructure["furnitureGroups"][number]["associatedItems"][number]): string {
  return `
    <div class="pdf-intake-structure-row">
      <select data-structure-associated-category-for="${escapeHtml(item.itemId)}">
        ${ASSOCIATED_FURNITURE_CATEGORIES.map((category) => `<option value="${category}" ${item.category === category ? "selected" : ""}>${category}</option>`).join("")}
      </select>
      <select data-structure-associated-relation-for="${escapeHtml(item.itemId)}">
        ${ASSOCIATED_FURNITURE_RELATIONS.map((relation) => `<option value="${relation}" ${item.relation === relation ? "selected" : ""}>${relation}</option>`).join("")}
      </select>
      <span>pages ${item.sourcePageNumbers.join(", ") || "none"} / ${item.confidence.toFixed(2)}</span>
    </div>
  `;
}

function renderStandaloneStructureItem(item: RoomFurnitureStructure["standaloneItems"][number]): string {
  return `
    <article class="pdf-intake-room-detail-item ${item.needsDeepExtraction ? "needs-review" : ""}">
      <header>
        <div>
          <strong>${escapeHtml(item.displayName)}</strong>
          <span>pages ${item.sourcePageNumbers.join(", ") || "none"} / ${item.confidence.toFixed(2)}</span>
        </div>
      </header>
      <div class="pdf-intake-context-controls">
        <label>category
          <select data-structure-standalone-category-for="${escapeHtml(item.itemId)}">
            ${STANDALONE_FURNITURE_CATEGORIES.map((category) => `<option value="${category}" ${item.category === category ? "selected" : ""}>${category}</option>`).join("")}
          </select>
        </label>
      </div>
      <p>Raw dimensions: ${item.rawDimensionTexts.length > 0 ? item.rawDimensionTexts.map(escapeHtml).join(" / ") : "unknown"}</p>
      <p>Materials: ${item.materials.length > 0 ? item.materials.map((material) => escapeHtml(material.rawText)).join(" / ") : "unknown"}</p>
      <p class="pdf-intake-debug">${item.reasons.map(escapeHtml).join(" / ")}</p>
    </article>
  `;
}

function renderStructureCandidate(candidate: RoomFurnitureStructure["unassignedCandidates"][number]): string {
  return `
    <article class="pdf-intake-room-detail-item needs-review">
      <strong>${escapeHtml(candidate.category)}</strong>
      <p>pages ${candidate.sourcePageNumbers.join(", ") || "none"} / ${candidate.confidence.toFixed(2)}</p>
      <p>${escapeHtml(candidate.reason)}</p>
      <p>${escapeHtml(candidate.sourceTexts.join(" / ").slice(0, 220))}</p>
    </article>
  `;
}

function renderCleanupReviewMode(
  cleanup: InventoryCleanupReview,
  rooms: ContextRoom[],
  suggestions: CleanupSuggestion[],
  suggestionStatus: string,
  safeAppliedCount: number,
  aiSuggestions: AiCleanupSuggestion[],
  selectedAiSuggestionIds: Set<string>,
  aiStatus: string,
  aiAppliedCount: number
): string {
  const safeSuggestions = suggestions.filter((suggestion) => suggestion.safe);
  const highConfidenceAiSuggestions = aiSuggestions.filter((suggestion) => suggestion.tier === "high");
  return `
    <section class="pdf-intake-cleanup">
      <header>
        <div>
          <h4>Cleanup Review Mode</h4>
          <p>Vyčisti chaos pred detailnou AI extrakciou.</p>
        </div>
        <div class="pdf-intake-readiness ${cleanup.readiness.readyForDetailedExtraction ? "green" : "yellow"}">
          <strong>${cleanup.readiness.readyForDetailedExtraction ? "READY" : "NOT READY"}</strong>
          <span data-cleanup-readiness>${cleanup.readiness.unassignedPrimaryCount} unassigned primary / ${cleanup.readiness.duplicateGroupCount} duplicates / ${cleanup.readiness.roomsWithoutPrimaryCount} rooms without primary / ready ${cleanup.readiness.readyForDetailedExtraction}</span>
        </div>
      </header>
      <section class="pdf-intake-cleanup-actions-bar">
        <button type="button" data-generate-auto-cleanup>Generate Auto Cleanup Suggestions</button>
        <button type="button" data-apply-safe-cleanup ${safeSuggestions.length > 0 ? "" : "disabled"}>Apply Safe Suggestions Only</button>
        <span data-cleanup-suggestion-status>${escapeHtml(suggestionStatus)}</span>
        <span data-cleanup-suggestion-count>${suggestions.length}</span>
        <span data-cleanup-safe-suggestion-count>${safeSuggestions.length}</span>
        <span data-cleanup-safe-applied-count>${safeAppliedCount}</span>
      </section>
      <section class="pdf-intake-cleanup-actions-bar">
        <button type="button" data-generate-ai-cleanup>Generate AI Cleanup Suggestions</button>
        <button type="button" data-apply-high-confidence-ai-cleanup ${highConfidenceAiSuggestions.length > 0 ? "" : "disabled"}>Apply High Confidence AI Suggestions</button>
        <span data-ai-cleanup-status>${escapeHtml(aiStatus)}</span>
        <span data-ai-cleanup-suggestion-count>${aiSuggestions.length}</span>
        <span data-ai-cleanup-high-confidence-count>${highConfidenceAiSuggestions.length}</span>
        <span data-ai-cleanup-applied-count>${aiAppliedCount}</span>
      </section>
      ${renderAiCleanupSuggestions(aiSuggestions, selectedAiSuggestionIds)}
      ${suggestions.length > 0 ? `
        <section class="pdf-intake-cleanup-section">
          <h5>Auto Cleanup Suggestions</h5>
          ${suggestions.map((suggestion) => `
            <article class="pdf-intake-cleanup-row ${suggestion.safe ? "" : "needs-review"}">
              <div>
                <strong>${escapeHtml(suggestion.safe ? "Safe" : "Manual review")}</strong>
                <span>${escapeHtml(suggestion.label)}</span>
              </div>
            </article>
          `).join("")}
        </section>
      ` : ""}
      ${renderCleanupUnassignedPrimary(cleanup, rooms)}
      ${renderCleanupDuplicates(cleanup)}
      ${renderCleanupRoomsWithoutFurniture(cleanup)}
    </section>
  `;
}

function renderAiCleanupSuggestions(suggestions: AiCleanupSuggestion[], selectedIds: Set<string>): string {
  if (suggestions.length === 0) return "";

  return `
    <section class="pdf-intake-cleanup-section">
      <h5>AI Cleanup Suggestions</h5>
      ${suggestions.map((suggestion) => `
        <article class="pdf-intake-cleanup-row ${suggestion.tier === "high" ? "" : "needs-review"}">
          <div>
            <strong>${escapeHtml(suggestion.tier.toUpperCase())} / ${suggestion.confidence.toFixed(2)}</strong>
            <span>${escapeHtml(suggestion.label)}</span>
            <p>${escapeHtml(suggestion.reason)}</p>
          </div>
          <label class="pdf-intake-ai-checkbox">
            <input type="checkbox" data-ai-cleanup-select="${escapeHtml(suggestion.id)}" ${selectedIds.has(suggestion.id) ? "checked" : ""} ${suggestion.tier === "high" ? "" : "disabled"} />
            Apply
          </label>
        </article>
      `).join("")}
    </section>
  `;
}

function renderCleanupUnassignedPrimary(cleanup: InventoryCleanupReview, rooms: ContextRoom[]): string {
  return `
    <section class="pdf-intake-cleanup-section priority">
      <h5>1. Unassigned Primary Items</h5>
      ${cleanup.unassignedPrimaryItems.length === 0 ? `<p>Žiadne nepriradené primary items.</p>` : cleanup.unassignedPrimaryItems.map((entry) => `
        <article class="pdf-intake-cleanup-row needs-review">
          <div>
            <strong>${escapeHtml(entry.item.displayName)}</strong>
            <span>${escapeHtml(entry.item.category)} / page ${entry.item.sourcePageNumbers.join(", ")}</span>
            <p>${escapeHtml(entry.item.sourceTexts.join(" / ").slice(0, 220))}</p>
            <p>Suggested room: ${entry.suggestedRoomLabel ? escapeHtml(entry.suggestedRoomLabel) : "none"}</p>
          </div>
          <div class="pdf-intake-cleanup-actions">
            <button type="button" data-cleanup-assign-suggested="${escapeHtml(entry.item.itemId)}" data-suggested-room-id="${escapeHtml(entry.suggestedRoomId ?? "")}" ${entry.suggestedRoomId ? "" : "disabled"}>Assign suggested</button>
            <label>Assign manually
              <select data-inventory-room-for="${escapeHtml(entry.item.itemId)}">
                <option value="" selected>Nepriradené</option>
                ${rooms.map((room) => `<option value="${escapeHtml(room.id)}">${escapeHtml(roomLabel(room))}</option>`).join("")}
              </select>
            </label>
            <button type="button" data-cleanup-ignore-item="${escapeHtml(entry.item.itemId)}">Ignore</button>
          </div>
        </article>
      `).join("")}
    </section>
  `;
}

function renderCleanupDuplicates(cleanup: InventoryCleanupReview): string {
  return `
    <section class="pdf-intake-cleanup-section">
      <h5>2. Possible Duplicates</h5>
      ${cleanup.duplicateGroups.length === 0 ? `<p>Žiadne možné duplicity.</p>` : cleanup.duplicateGroups.map((group) => `
        <article class="pdf-intake-cleanup-row ${group.status === "open" ? "needs-review" : ""}">
          <div>
            <strong>${escapeHtml(group.category)} · ${group.items.length} items</strong>
            <span>pages ${group.sourcePageNumbers.join(", ")} / status ${group.status}</span>
            <p>${group.items.map((item) => `${item.displayName}: ${item.sourceTexts.join(" ").slice(0, 80)}`).map(escapeHtml).join(" | ")}</p>
          </div>
          <div class="pdf-intake-cleanup-actions">
            <button type="button" data-cleanup-merge-duplicate="${escapeHtml(group.groupId)}" data-duplicate-items="${escapeHtml(group.items.map((item) => item.itemId).join(","))}">Merge</button>
            <button type="button" data-cleanup-keep-duplicate="${escapeHtml(group.groupId)}">Keep separate</button>
            <button type="button" data-cleanup-ignore-duplicate="${escapeHtml(group.groupId)}" data-duplicate-items="${escapeHtml(group.items.map((item) => item.itemId).join(","))}">Ignore duplicate</button>
          </div>
        </article>
      `).join("")}
    </section>
  `;
}

function renderCleanupRoomsWithoutFurniture(cleanup: InventoryCleanupReview): string {
  return `
    <section class="pdf-intake-cleanup-section">
      <h5>3. Rooms Without Furniture</h5>
      ${cleanup.roomsWithoutPrimary.length === 0 ? `<p>Každá miestnosť má primary item alebo je vyriešená.</p>` : cleanup.roomsWithoutPrimary.map((room) => `
        <article class="pdf-intake-cleanup-row ${room.status === "open" || room.status === "needs_ai_vision_later" ? "needs-review" : ""}">
          <div>
            <strong>${escapeHtml(room.roomLabel)}</strong>
            <span>${escapeHtml(room.roomType)} / pages ${room.relatedPageNumbers.join(", ") || "none"} / status ${room.status}</span>
          </div>
          <div class="pdf-intake-cleanup-actions">
            <button type="button" data-cleanup-add-room-furniture="${escapeHtml(room.roomId)}">Add furniture manually</button>
            <button type="button" data-cleanup-room-no-custom="${escapeHtml(room.roomId)}">Mark no custom furniture</button>
            <button type="button" data-cleanup-room-needs-ai="${escapeHtml(room.roomId)}">Needs AI/vision later</button>
          </div>
        </article>
      `).join("")}
    </section>
  `;
}

function createAutoCleanupSuggestions(cleanup: InventoryCleanupReview): CleanupSuggestion[] {
  const suggestions: CleanupSuggestion[] = [];

  for (const entry of cleanup.unassignedPrimaryItems) {
    suggestions.push({
      id: `assign_${entry.item.itemId}`,
      label: entry.suggestedRoomId
        ? `Assign ${entry.item.displayName} to ${entry.suggestedRoomLabel}`
        : `Manual room assignment needed for ${entry.item.displayName}`,
      safe: Boolean(entry.suggestedRoomId),
      action: entry.suggestedRoomId ? "assign_room" : "manual_room_assignment",
      itemId: entry.item.itemId,
      roomId: entry.suggestedRoomId
    });
  }

  for (const group of cleanup.duplicateGroups.filter((item) => item.status === "open")) {
    const duplicateItemIds = group.items.map((item) => item.itemId);
    const safe = isSafeDuplicateGroup(group);
    suggestions.push({
      id: `duplicate_${group.groupId}`,
      label: safe
        ? `Merge duplicate ${group.category} items on pages ${group.sourcePageNumbers.join(", ")}`
        : `Review possible duplicate ${group.category} items on pages ${group.sourcePageNumbers.join(", ")}`,
      safe,
      action: safe ? "merge_duplicate" : "review_duplicate",
      duplicateGroupId: group.groupId,
      duplicateItemIds
    });
  }

  for (const room of cleanup.roomsWithoutPrimary.filter((item) => item.status === "open")) {
    suggestions.push({
      id: `room_without_primary_${room.roomId}`,
      label: `Review room without primary furniture: ${room.roomLabel}`,
      safe: false,
      action: "review_room_without_primary"
    });
  }

  return suggestions;
}

function isSafeDuplicateGroup(group: InventoryCleanupReview["duplicateGroups"][number]): boolean {
  if (group.items.length < 2) return false;
  const firstPages = group.items[0].sourcePageNumbers.join(",");
  const samePages = group.items.every((item) => item.sourcePageNumbers.join(",") === firstPages);
  const firstText = normalizedSuggestionText(group.items[0].sourceTexts.join(" "));
  const sameText = firstText.length > 0 && group.items.every((item) => normalizedSuggestionText(item.sourceTexts.join(" ")) === firstText);
  return samePages || sameText;
}

function normalizedSuggestionText(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

function renderInventoryRoom(room: RoomFurnitureInventory["rooms"][number], rooms: ContextRoom[]): string {
  return `
    <section class="pdf-intake-inventory-room ${room.items.length === 0 ? "empty" : ""}">
      <header>
        <div>
          <h4>${escapeHtml(room.roomNumber ? `${room.roomNumber} ${room.roomNameOriginal ?? room.roomType}` : room.roomNameOriginal ?? room.roomType)}</h4>
          <p>${escapeHtml(room.roomType)} / ${escapeHtml(room.floorId ?? "floor unknown")} / Istota ${room.confidence.toFixed(2)}</p>
        </div>
        <span>pages: ${room.sourcePageNumbers.join(", ") || "none"}</span>
      </header>
      ${room.items.length === 0 ? `<p>Ziadny nabytok pre tento filter.</p>` : renderInventoryItemGroups(room.items, rooms)}
      ${room.warnings.length > 0 ? `<p class="pdf-intake-debug">${room.warnings.map(escapeHtml).join(", ")}</p>` : ""}
    </section>
  `;
}

function renderInventoryItemGroups(items: FurnitureInventoryItem[], rooms: ContextRoom[]): string {
  const groups: Array<{ title: string; items: FurnitureInventoryItem[] }> = [
    { title: "Primary furniture", items: items.filter((item) => item.importance === "primary" && item.status !== "ignored") },
    { title: "Secondary/context items", items: items.filter((item) => item.importance === "secondary" && item.status !== "ignored") },
    { title: "Ignored/irrelevant items", items: items.filter((item) => item.status === "ignored" || item.importance === "irrelevant") },
    { title: "Unknown", items: items.filter((item) => item.importance === "unknown" && item.status !== "ignored") }
  ].filter((group) => group.items.length > 0);

  if (groups.length === 0) return `<p>Ziadne polozky.</p>`;

  return `
    <div class="pdf-intake-inventory-groups">
      ${groups.map((group) => `
        <div>
          <strong>${group.title}</strong>
          ${group.items.map((item) => renderInventoryItem(item, rooms)).join("")}
        </div>
      `).join("")}
    </div>
  `;
}

function renderInventoryItem(item: FurnitureInventoryItem, rooms: ContextRoom[]): string {
  return `
    <article class="pdf-intake-inventory-item ${item.roomId ? "" : "needs-review"} ${item.status === "ignored" ? "ignored" : ""}">
      <div class="pdf-intake-inventory-item-head">
        <strong>${escapeHtml(item.displayName)}</strong>
        <span>${item.confidence.toFixed(2)} confidence</span>
      </div>
      <div class="pdf-intake-inventory-controls">
        <label>Category
          <select data-inventory-category-for="${escapeHtml(item.itemId)}">
            ${FURNITURE_TYPES.map((type) => `<option value="${type}" ${item.category === type ? "selected" : ""}>${type}</option>`).join("")}
          </select>
        </label>
        <label>Importance
          <select data-inventory-importance-for="${escapeHtml(item.itemId)}">
            ${INVENTORY_IMPORTANCE.map((importance) => `<option value="${importance}" ${item.importance === importance ? "selected" : ""}>${importance}</option>`).join("")}
          </select>
        </label>
        <label>Miestnost
          <select data-inventory-room-for="${escapeHtml(item.itemId)}">
            <option value="" ${item.roomId ? "" : "selected"}>Nepriradene</option>
            ${rooms.map((room) => `<option value="${escapeHtml(room.id)}" ${item.roomId === room.id ? "selected" : ""}>${escapeHtml(roomLabel(room))}</option>`).join("")}
          </select>
        </label>
        <label>Status
          <select data-inventory-status-for="${escapeHtml(item.itemId)}">
            ${INVENTORY_STATUS.map((status) => `<option value="${status}" ${item.status === status ? "selected" : ""}>${status}</option>`).join("")}
          </select>
        </label>
        <button type="button" data-delete-inventory-item="${escapeHtml(item.itemId)}">Odstranit</button>
      </div>
      <p>Source pages: ${item.sourcePageNumbers.join(", ") || "none"}</p>
      <p>${escapeHtml(item.sourceTexts.join(" / ").slice(0, 220))}</p>
      <p class="pdf-intake-debug">${item.reasons.map(escapeHtml).join(", ")}</p>
    </article>
  `;
}

function filterInventoryItems(
  items: FurnitureInventoryItem[],
  filter: ProjectContextWizardRenderInput["inventoryFilter"]
): FurnitureInventoryItem[] {
  if (filter === "all") return items;
  if (filter === "primary") return items.filter((item) => item.importance === "primary" && item.status !== "ignored");
  if (filter === "secondary") return items.filter((item) => item.importance === "secondary" && item.status !== "ignored");
  if (filter === "unassigned") return items.filter((item) => !item.roomId && item.status !== "ignored");
  if (filter === "low_confidence") return items.filter((item) => item.confidence < 0.55 && item.status !== "ignored");
  return items.filter((item) => item.status === "ignored");
}

function inventoryFilterLabel(filter: ProjectContextWizardRenderInput["inventoryFilter"]): string {
  if (filter === "all") return "Vsetko";
  if (filter === "primary") return "Only primary";
  if (filter === "secondary") return "Only secondary";
  if (filter === "unassigned") return "Unassigned";
  if (filter === "low_confidence") return "Low confidence";
  return "Ignored";
}

function renderExpectedInventoryControls(value: string, status: string): string {
  return `
    <section class="pdf-intake-context-expected">
      <div class="pdf-intake-ground-truth-row">
        <label>
          <span>Import expected inventory JSON</span>
          <input type="file" accept="application/json,.json" data-expected-inventory-file />
        </label>
        <button type="button" data-import-expected-room-furniture-inventory>Import pasted inventory</button>
      </div>
      <textarea data-expected-inventory-text rows="4" placeholder='{"fileName":"project.pdf","rooms":[],"unassignedItems":[],"summary":{"totalRooms":0,"totalPrimaryItems":0,"totalSecondaryItems":0,"totalUnassignedItems":0,"roomsWithoutFurniture":0}}'>${escapeHtml(value)}</textarea>
      <div class="pdf-intake-status-line">${escapeHtml(status)}</div>
    </section>
  `;
}

function renderInventoryEvaluation(evaluation: RoomFurnitureInventoryEvaluationReport | null): string {
  if (!evaluation) {
    return `<section class="pdf-intake-context-eval-empty">Import expected Room Furniture Inventory JSON to evaluate inventory quality.</section>`;
  }

  return `
    <section class="pdf-intake-context-eval">
      <div class="pdf-intake-readiness ${evaluation.readiness.level}">
        <strong>${evaluation.readiness.level.toUpperCase()}</strong>
        <span>Primary readiness ${Math.round(evaluation.readiness.primaryReadiness * 100)}%. ${evaluation.readiness.reasons.map(escapeHtml).join(" ")}</span>
      </div>
      <div class="pdf-intake-context-eval-grid">
        <div><strong>${evaluation.primaryItems.found}/${evaluation.primaryItems.expected}</strong><span>primary found</span></div>
        <div><strong>${evaluation.secondaryItems.found}/${evaluation.secondaryItems.expected}</strong><span>secondary found</span></div>
        <div><strong>${evaluation.wrongCategory.length}</strong><span>wrong category</span></div>
        <div><strong>${evaluation.wrongImportance.length}</strong><span>wrong importance</span></div>
        <div><strong>${evaluation.wrongRoomAssignments.length}</strong><span>wrong room</span></div>
        <div><strong>${evaluation.unassignedPrimaryItems.length}</strong><span>unassigned primary</span></div>
      </div>
      <div class="pdf-intake-context-eval-lists">
        <div><strong>Missing primary</strong><span>${evaluation.primaryItems.missing.length ? evaluation.primaryItems.missing.map(escapeHtml).join(", ") : "none"}</span></div>
        <div><strong>Missing secondary</strong><span>${evaluation.secondaryItems.missing.length ? evaluation.secondaryItems.missing.map(escapeHtml).join(", ") : "none"}</span></div>
        <div><strong>Low confidence primary</strong><span>${evaluation.lowConfidencePrimaryItems.length}</span></div>
        <div><strong>Rooms with furniture</strong><span>${evaluation.roomsWithFurnitureFound}</span></div>
        <div><strong>File</strong><span>${escapeHtml(evaluation.fileName)}</span></div>
      </div>
    </section>
  `;
}

function renderSummaryStep(input: ProjectContextWizardRenderInput): string {
  const relevantPages = input.pages.filter((page) => page.finalType !== "irrelevant");
  const unassignedRelevantPages = relevantPages.filter((page) => findAssignedRooms(input.projectContext, page.pageNumber).length === 0);
  const furnitureWithoutRoom = input.projectContext.furniture.filter((item) => !item.roomId);
  const readiness = getReadiness(input.projectContext, relevantPages.length, unassignedRelevantPages.length, furnitureWithoutRoom.length);

  return `
    <section class="pdf-intake-wizard-step">
      <div class="pdf-intake-step-head">
        <div>
          <h3>Step 5: Summary & Export</h3>
          <p>Exportuj context pre ďalší krok.</p>
        </div>
      </div>
      <div class="pdf-intake-readiness ${readiness.level}">
        <strong>${readiness.label}</strong>
        <span>${readiness.reason}</span>
      </div>
      <div class="pdf-intake-summary-grid">
        <div><strong>${input.projectContext.floors.length}</strong><span>poschodia</span></div>
        <div><strong>${input.projectContext.rooms.length}</strong><span>miestnosti</span></div>
        <div><strong>${relevantPages.length}</strong><span>relevantné stránky</span></div>
        <div><strong>${unassignedRelevantPages.length}</strong><span>nepriradené stránky</span></div>
        <div><strong>${input.projectContext.furniture.length}</strong><span>nábytok</span></div>
        <div><strong>${furnitureWithoutRoom.length}</strong><span>nábytok bez miestnosti</span></div>
      </div>
      <div class="pdf-intake-context-actions">
        <button type="button" data-export-project-context>Export project-context.json</button>
        <button type="button" data-export-expected-project-context>Export expected-project-context.json</button>
        <button type="button" data-export-project-context-evaluation ${input.evaluation ? "" : "disabled"}>Export project-context-evaluation.json</button>
        <button type="button" data-export-room-furniture-inventory>Export room-furniture-inventory.json</button>
        <button type="button" data-export-expected-room-furniture-inventory>Export expected-room-furniture-inventory.json</button>
        <button type="button" data-export-room-furniture-inventory-evaluation ${input.inventoryEvaluation ? "" : "disabled"}>Export room-furniture-inventory-evaluation.json</button>
      </div>
      ${renderExpectedProjectContextControls(input.expectedText, input.expectedStatus)}
      ${renderProjectContextEvaluation(input.evaluation)}
    </section>
  `;
}

function renderExpectedProjectContextControls(value: string, status: string): string {
  return `
    <section class="pdf-intake-context-expected">
      <div class="pdf-intake-ground-truth-row">
        <label>
          <span>Import expected ProjectContext JSON</span>
          <input type="file" accept="application/json,.json" data-expected-project-context-file />
        </label>
        <button type="button" data-import-expected-project-context>Import pasted context</button>
      </div>
      <textarea data-expected-project-context-text rows="4" placeholder='{"fileName":"project.pdf","floors":[],"rooms":[],"detectedFurniture":[],"relatedPages":[],"unassignedPages":[],"confidence":0,"reasons":[]}'>${escapeHtml(value)}</textarea>
      <div class="pdf-intake-status-line">${escapeHtml(status)}</div>
    </section>
  `;
}

function renderProjectContextEvaluation(evaluation: ProjectContextEvaluationReport | null): string {
  if (!evaluation) {
    return `<section class="pdf-intake-context-eval-empty">Import expected ProjectContext JSON to evaluate context quality.</section>`;
  }

  return `
    <section class="pdf-intake-context-eval">
      <div class="pdf-intake-context-eval-grid">
        <div><strong>${evaluation.floorDetection.found}/${evaluation.floorDetection.expected}</strong><span>floors found</span></div>
        <div><strong>${evaluation.roomDetection.found}/${evaluation.roomDetection.expected}</strong><span>rooms found</span></div>
        <div><strong>${evaluation.furnitureDetection.found}/${evaluation.furnitureDetection.expected}</strong><span>furniture found</span></div>
        <div><strong>${evaluation.relatedPageAssignment.correct}/${evaluation.relatedPageAssignment.expected}</strong><span>page links correct</span></div>
      </div>
      <div class="pdf-intake-context-eval-lists">
        <div><strong>Missing rooms</strong><span>${evaluation.roomDetection.missing.length ? evaluation.roomDetection.missing.map(escapeHtml).join(", ") : "none"}</span></div>
        <div><strong>Missing furniture</strong><span>${evaluation.furnitureDetection.missing.length ? evaluation.furnitureDetection.missing.map(escapeHtml).join(", ") : "none"}</span></div>
        <div><strong>Wrong room assignments</strong><span>${evaluation.furnitureDetection.wrongRoomAssignments.length}</span></div>
        <div><strong>Wrong page assignments</strong><span>${evaluation.relatedPageAssignment.wrong}</span></div>
        <div><strong>Unassigned pages</strong><span>${evaluation.unassignedPages.length ? evaluation.unassignedPages.join(", ") : "none"}</span></div>
      </div>
    </section>
  `;
}

function renderFloor(floor: ProjectContext["floors"][number]): string {
  return `
    <article class="pdf-intake-context-card">
      <strong>${escapeHtml(floor.label)}</strong>
      <span>${floor.confidence.toFixed(2)} confidence</span>
      <small>pages: ${floor.pageNumbers.join(", ") || "unknown"}</small>
      <small>${floor.reasons.map(escapeHtml).join(", ")}</small>
    </article>
  `;
}

function renderRoom(room: ContextRoom, floors: ProjectContext["floors"]): string {
  return `
    <article class="pdf-intake-context-card">
      <input data-room-number-for="${escapeHtml(room.id)}" value="${escapeHtml(room.roomNumber ?? "")}" aria-label="Room number" />
      <input data-room-name-for="${escapeHtml(room.id)}" value="${escapeHtml(room.nameOriginal)}" aria-label="Room name" />
      <select data-room-type-for="${escapeHtml(room.id)}" aria-label="Room type">
        ${ROOM_TYPES.map((type) => `<option value="${type}" ${room.type === type ? "selected" : ""}>${type}</option>`).join("")}
      </select>
      <select data-room-floor-for="${escapeHtml(room.id)}" aria-label="Room floor">
        <option value="" ${room.floorId ? "" : "selected"}>floor unknown</option>
        ${floors.map((floor) => `<option value="${escapeHtml(floor.id)}" ${room.floorId === floor.id ? "selected" : ""}>${escapeHtml(floor.label)}</option>`).join("")}
      </select>
      <span>${room.confidence.toFixed(2)} confidence</span>
      <small>${room.roomNumber ? `room ${escapeHtml(room.roomNumber)} / ` : ""}${room.area ?? "?"} m2 / pages: ${room.pageNumbers.join(", ") || "unknown"}</small>
      <small>${room.reasons.map(escapeHtml).join(", ")}</small>
    </article>
  `;
}

function renderFurniture(item: ContextFurniture, rooms: ProjectContext["rooms"]): string {
  return `
    <article class="pdf-intake-context-card">
      <select data-furniture-type-for="${escapeHtml(item.id)}" aria-label="Furniture type">
        ${FURNITURE_TYPES.map((type) => `<option value="${type}" ${item.type === type ? "selected" : ""}>${type}</option>`).join("")}
      </select>
      <select data-furniture-room-for="${escapeHtml(item.id)}" aria-label="Furniture room">
        <option value="" ${item.roomId ? "" : "selected"}>room unknown</option>
        ${rooms.map((room) => `<option value="${escapeHtml(room.id)}" ${item.roomId === room.id ? "selected" : ""}>${escapeHtml(roomLabel(room))}</option>`).join("")}
      </select>
      <span>${item.confidence.toFixed(2)} confidence</span>
      <small>page ${item.pageNumber}</small>
      <small>${item.reasons.map(escapeHtml).join(", ")}</small>
    </article>
  `;
}

function findAssignedRooms(projectContext: ProjectContext, pageNumber: number): ContextRoom[] {
  return projectContext.rooms.filter((room) => room.pageNumbers.includes(pageNumber));
}

function pageTitle(page: PageReviewItem): string {
  return page.extractedText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) ?? page.extractedTextPreview;
}

function getReadiness(
  projectContext: ProjectContext,
  relevantPageCount: number,
  unassignedRelevantPageCount: number,
  furnitureWithoutRoomCount: number
): { level: "green" | "yellow" | "red"; label: string; reason: string } {
  if (projectContext.rooms.length === 0) {
    return { level: "red", label: "RED", reason: "Chýbajú miestnosti." };
  }

  if (relevantPageCount === 0) {
    return { level: "red", label: "RED", reason: "Chýbajú relevantné stránky." };
  }

  const allUnknown =
    projectContext.rooms.every((room) => room.type === "unknown") &&
    projectContext.furniture.every((item) => item.type === "unknown");

  if (allUnknown) {
    return { level: "red", label: "RED", reason: "Všetko je unknown." };
  }

  if (unassignedRelevantPageCount > 0 || furnitureWithoutRoomCount > 0) {
    return { level: "yellow", label: "YELLOW", reason: "Niektoré stránky alebo položky ešte nie sú priradené." };
  }

  return { level: "green", label: "GREEN", reason: "Context je pripravený na ďalší krok." };
}

function renderBulkControls(selectedCount: number): string {
  return `
    <section class="pdf-intake-bulk">
      <span data-selected-page-count>${selectedCount} selected</span>
      <select data-bulk-page-type aria-label="Bulk page type">
        ${PAGE_TYPES.map((type) => `<option value="${type}">${TYPE_LABELS[type]}</option>`).join("")}
      </select>
      <button type="button" data-apply-bulk-type>Apply to selected</button>
      <button type="button" data-select-visible-pages>Select visible</button>
      <button type="button" data-clear-page-selection>Clear</button>
    </section>
  `;
}

function renderGroundTruthControls(value: string, status: string): string {
  return `
    <section class="pdf-intake-ground-truth">
      <div class="pdf-intake-ground-truth-row">
        <label>
          <span>Import ground-truth JSON</span>
          <input type="file" accept="application/json,.json" data-ground-truth-file />
        </label>
        <button type="button" data-import-ground-truth>Import pasted JSON</button>
      </div>
      <textarea data-ground-truth-text rows="5" placeholder='{"fileName":"project.pdf","pages":[{"pageNumber":1,"expectedType":"floor_plan"}]}'>${escapeHtml(value)}</textarea>
      <div class="pdf-intake-status-line">${escapeHtml(status)}</div>
    </section>
  `;
}

function renderPageTypeImportControls(value: string, status: string): string {
  return `
    <section class="pdf-intake-ground-truth">
      <div class="pdf-intake-ground-truth-row">
        <label>
          <span>Import page-review.json / ground-truth.json as final types</span>
          <input type="file" accept="application/json,.json" data-page-type-import-file />
        </label>
        <button type="button" data-import-page-types>Apply pasted page types</button>
      </div>
      <textarea data-page-type-import-text rows="4" placeholder='{"fileName":"project.pdf","pages":[{"pageNumber":1,"finalType":"floor_plan"}]}'>${escapeHtml(value)}</textarea>
      <div class="pdf-intake-status-line">${escapeHtml(status)}</div>
    </section>
  `;
}

function renderMetricsPanel(evaluation: EvaluationReport): string {
  return `
    <section class="pdf-intake-metrics">
      <div class="pdf-intake-metrics-grid">
        <div><strong>${evaluation.evaluatedPages}</strong><span>evaluated</span></div>
        <div><strong>${evaluation.correctCount}</strong><span>correct</span></div>
        <div><strong>${evaluation.wrongCount}</strong><span>wrong</span></div>
        <div><strong>${Math.round(evaluation.accuracy * 10000) / 100}%</strong><span>accuracy</span></div>
      </div>
      <div class="pdf-intake-confusion">${renderConfusionMatrix(evaluation)}</div>
      <div class="pdf-intake-errors">
        <strong>Common mistakes</strong>
        ${evaluation.frequentErrors.length === 0
          ? `<p>No mistakes in evaluated pages.</p>`
          : `<ul>${evaluation.frequentErrors.map((error) => `<li>${TYPE_LABELS[error.expectedType]} -> ${TYPE_LABELS[error.predictedType]}: ${error.count}x</li>`).join("")}</ul>`}
      </div>
    </section>
  `;
}

function renderConfusionMatrix(evaluation: EvaluationReport): string {
  return `
    <table>
      <thead>
        <tr>
          <th>expected \\ predicted</th>
          ${PAGE_TYPES.map((type) => `<th>${TYPE_LABELS[type]}</th>`).join("")}
        </tr>
      </thead>
      <tbody>
        ${PAGE_TYPES.map((expected) => `
          <tr>
            <th>${TYPE_LABELS[expected]}</th>
            ${PAGE_TYPES.map((predicted) => `<td>${evaluation.confusionMatrix[expected][predicted]}</td>`).join("")}
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function matchesFilter(page: PageReviewItem, filter: PageReviewFilter): boolean {
  if (filter === "all") return true;
  if (filter === "relevant") return page.finalType !== "irrelevant";
  return page.finalType === filter;
}

function isPageType(value: string): value is PageType {
  return PAGE_TYPES.includes(value as PageType);
}

function isDocumentMapPageType(value: string): value is DocumentMapPageType {
  return DOCUMENT_MAP_PAGE_TYPES.includes(value as DocumentMapPageType);
}

function isRoomType(value: string): value is RoomType {
  return ROOM_TYPES.includes(value as RoomType);
}

function isRoomFunctionType(value: string): value is Exclude<RoomType, "unknown"> {
  return ROOM_FUNCTION_TYPES.includes(value as Exclude<RoomType, "unknown">);
}

function isFurnitureType(value: string): value is FurnitureType {
  return FURNITURE_TYPES.includes(value as FurnitureType);
}

function isFurnitureImportance(value: string): value is FurnitureImportance {
  return INVENTORY_IMPORTANCE.includes(value as FurnitureImportance);
}

function isFurnitureInventoryStatus(value: string): value is FurnitureInventoryStatus {
  return INVENTORY_STATUS.includes(value as FurnitureInventoryStatus);
}

function isFurnitureGroupCategory(value: string): value is FurnitureGroupCategory {
  return FURNITURE_GROUP_CATEGORIES.includes(value as FurnitureGroupCategory);
}

function isFurnitureGroupBaseCategory(value: string): value is FurnitureGroupBaseCategory {
  return FURNITURE_GROUP_BASE_CATEGORIES.includes(value as FurnitureGroupBaseCategory);
}

function isApproxModuleCategory(value: string): value is ApproxFurnitureModuleBaseCategory {
  return APPROX_MODULE_CATEGORIES.includes(value as ApproxFurnitureModuleBaseCategory);
}

function isAssociatedFurnitureCategory(value: string): value is AssociatedFurnitureCategory {
  return ASSOCIATED_FURNITURE_CATEGORIES.includes(value as AssociatedFurnitureCategory);
}

function isAssociatedFurnitureRelation(value: string): value is AssociatedFurnitureRelation {
  return ASSOCIATED_FURNITURE_RELATIONS.includes(value as AssociatedFurnitureRelation);
}

function isStandaloneFurnitureCategory(value: string): value is StandaloneFurnitureCategory {
  return STANDALONE_FURNITURE_CATEGORIES.includes(value as StandaloneFurnitureCategory);
}

function roomLabel(room: ContextRoom): string {
  return `${room.roomNumber ? `${room.roomNumber} ` : ""}${room.nameOriginal || room.type}`;
}

function documentMapRoomLabel(room: DocumentMapRoom): string {
  return `${room.floorId} ${room.roomNumber ? `${room.roomNumber} ` : ""}${room.nameOriginal || room.roomType}`;
}

function roomFunctions(room: ContextRoom): Array<Exclude<RoomType, "unknown">> {
  return room.functions ?? (room.type === "unknown" ? [] : [room.type]);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
