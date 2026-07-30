import initWasm, { GeneaQuiltEngine } from "../../../pkg/geneaquilt_wasm.js";
import {
  projectionToDerivedGedcom,
  canonicalDocumentToDerivedGedcom,
} from "../../domain/toGedcom.ts";
import { QuiltRenderer } from "../../quiltRenderer.js";
import {
  sliderValueToZoomSpeed,
  TRACKPAD_ZOOM_SPEED,
  zoomSpeedToSliderValue,
} from "../../zoomInteraction.js";
import type {
  AppTheme,
  SelectedRecordDetails,
  VisualizationAdapter,
  VisualizationContext,
  VisualizationExportMode,
  VisualizationInstance,
  VisualizationProjectionSummary,
  VisualizationSearchResult,
} from "../adapter.ts";
import { FitToggleState } from "../fitToggle.ts";
import {
  createVisualizationViewState,
  type VisualizationViewState,
} from "../viewport/viewState.ts";

interface GeneaQuiltScene {
  summary: {
    people: number;
    families: number;
    edges: number;
    layers: number;
    components: number;
  };
  bounds: { width_slots: number; height_layers: number };
  vertices: Array<{
    id: string;
    label: string;
    kind: "person" | "family";
    layer: number;
    order: number;
    component: number;
  }>;
  edges: Array<{ index: number; from: string; to: string }>;
}

type GeneaQuiltRanker = "original" | "v2";
type SearchScope = "all" | "names" | "attributes" | "ids";
type TraceMode = "all" | "predecessors" | "successors" | "none";
type TimelineScope = "all" | "people" | "families";

interface GeneaQuiltRecordDetails extends SelectedRecordDetails {
  layer: number;
  order: number;
  component: number;
  parentFamilies: string[];
  spouseFamilies: string[];
  predecessors: string[];
  successors: string[];
  properties: Array<{ key: string; values: string[] }>;
}

interface TimelineBin {
  year: number;
  total: number;
  people: number;
  families: number;
  active_total: number;
}

interface TimelineSummary {
  scope: TimelineScope;
  start_year: number;
  end_year: number;
  total_vertices_with_dates: number;
  active_vertices_with_dates: number;
  active_range: [number, number] | null;
  selected_range: [number, number] | null;
  bins: TimelineBin[];
}

interface TimelineFocus {
  scope: TimelineScope;
  start_year: number;
  end_year: number;
  matching_vertices_with_dates: number;
  matching_people: number;
  matching_families: number;
  vertex_ids: string[];
}

interface BringAndSlideSummary {
  focus_id: string;
  direction: "left" | "right";
  candidates: Array<{ id: string; label: string; relation: string }>;
}

interface QuiltCameraState {
  scale: number;
  offsetX: number;
  offsetY: number;
  rotationDegrees: number;
}

let wasmReady: Promise<unknown> | null = null;

export const geneaQuiltAdapter: VisualizationAdapter = {
  methodId: "geneaquilt",
  async mount(host, context) {
    wasmReady ??= initWasm();
    await wasmReady;
    return GeneaQuiltView.create(host, context);
  },
};

class GeneaQuiltView implements VisualizationInstance {
  readonly methodId = "geneaquilt";
  readonly #host: HTMLElement;
  readonly #source: string;
  readonly #renderer: QuiltRenderer;
  readonly #onSelectionChange: VisualizationContext["onSelectionChange"];
  readonly #projectionSummary: VisualizationProjectionSummary;
  readonly #fitToggle = new FitToggleState<QuiltCameraState>((camera) => ({ ...camera }));
  #engine: GeneaQuiltEngine;
  #scene: GeneaQuiltScene;
  #theme: AppTheme;
  #ranker: GeneaQuiltRanker = "original";
  #searchScope: SearchScope = "names";
  #traceMode: TraceMode = "all";
  #timelineScope: TimelineScope = "all";
  #timelineAction: "highlight" | "fit" = "highlight";
  #selectedId: string | null = null;
  #selectedDetails: GeneaQuiltRecordDetails | null = null;
  #pinnedIds: string[] = [];
  #searchQuery = "";
  #searchResults: VisualizationSearchResult[] = [];
  #visibleIds: string[] = [];
  #timelineSummary: TimelineSummary | null = null;
  #timelineFocus: TimelineFocus | null = null;
  #bringAndSlide: {
    left: BringAndSlideSummary | null;
    right: BringAndSlideSummary | null;
  } = { left: null, right: null };
  #isolateEnabled = false;
  #isolateDepth = 3;
  #zoomSpeedValue = zoomSpeedToSliderValue(TRACKPAD_ZOOM_SPEED);
  #rotationDegrees = 0;
  #toolsHost: HTMLElement | null = null;
  #toolsError: string | null = null;
  readonly #openToolSections = new Set(["focus"]);

  private constructor(
    host: HTMLElement,
    source: string,
    engine: GeneaQuiltEngine,
    renderer: QuiltRenderer,
    onSelectionChange: VisualizationContext["onSelectionChange"],
    projectionSummary: VisualizationProjectionSummary,
    scene: GeneaQuiltScene,
    theme: AppTheme,
  ) {
    this.#host = host;
    this.#source = source;
    this.#engine = engine;
    this.#renderer = renderer;
    this.#onSelectionChange = onSelectionChange;
    this.#projectionSummary = projectionSummary;
    this.#scene = scene;
    this.#theme = theme;
  }

  static create(host: HTMLElement, context: VisualizationContext): GeneaQuiltView {
    host.replaceChildren();
    const shell = document.createElement("div");
    shell.className = "geneaquilt-view";
    const canvas = document.createElement("canvas");
    canvas.className = "geneaquilt-view__canvas";
    canvas.tabIndex = 0;
    canvas.setAttribute("role", "img");
    canvas.setAttribute(
      "aria-label",
      "Interactive GeneaQuilt matrix. Use arrow keys to pan, plus or minus to zoom, and Home or 0 to fit. Use search or the relationship summary for a text alternative.",
    );
    const minimapShell = document.createElement("div");
    minimapShell.className = "geneaquilt-view__minimap";
    minimapShell.setAttribute("aria-label", "GeneaQuilt overview map");
    const minimap = document.createElement("canvas");
    minimapShell.append(minimap);
    shell.append(canvas, minimapShell);
    host.append(shell);

    const source = context.sourceGedcom
      ? context.sourceGedcom
      : context.projection
        ? projectionToDerivedGedcom(context.projection)
        : canonicalDocumentToDerivedGedcom(context.document);
    const engine = GeneaQuiltEngine.with_ranker(source, "original");
    const scene = parseScene(engine.scene_json());
    let view: GeneaQuiltView | null = null;
    const renderer = new QuiltRenderer(canvas, {
      minimapCanvas: minimap,
      onSelect: (id: string) => view?.select(id),
      onRotationChange: (degrees: number) => {
        if (view) view.#handleRotationChange(degrees);
      },
      onViewportChange: (ids: string[]) => {
        if (view) view.#handleViewportChange(ids);
      },
    });
    const projectionSummary: VisualizationProjectionSummary = context.projection
      ? {
          visiblePeople: context.projection.people.length,
          totalPeople: context.document.people.length,
          visibleFamilies: context.projection.families.length,
          totalFamilies: context.document.families.length,
          label: "Documented projection",
          rule: context.projection.rule,
        }
      : {
          visiblePeople: context.document.people.length,
          totalPeople: context.document.people.length,
          visibleFamilies: context.document.families.length,
          totalFamilies: context.document.families.length,
          label: "Whole genealogy",
          rule: "GeneaQuilt receives every Person and Family record in the active Genealogy Document.",
        };
    view = new GeneaQuiltView(
      host,
      source,
      engine,
      renderer,
      context.onSelectionChange,
      projectionSummary,
      scene,
      context.theme,
    );
    renderer.setTheme(context.theme);
    renderer.setScene(scene);
    if (context.focalPersonId) {
      view.select(context.focalPersonId, false);
      renderer.focusOnVertex(context.focalPersonId, { scale: 0.9 });
    }
    return view;
  }

  fit(animated = true): void {
    this.#renderer.fit({ animated });
  }

  toggleFit(animated = true): boolean {
    const action = this.#fitToggle.toggle(this.#renderer.getCameraState());
    if (action.kind === "restore") {
      this.#renderer.restoreCamera(action.state, { animated });
    } else {
      this.#renderer.fit({ animated });
    }
    return this.#fitToggle.isFitted;
  }

  zoomBy(multiplier: number): void {
    this.#renderer.zoomBy(multiplier);
  }

  setTheme(theme: AppTheme): void {
    this.#theme = theme;
    this.#renderer.setTheme(theme);
    this.#drawTimelineCanvas();
  }

  setExpandedNames(expanded: boolean): void {
    this.#renderer.setExpandedNames(expanded);
  }

  renderMethodTools(host: HTMLElement): void {
    this.#toolsHost = host;
    this.#syncTimeline(false);
    this.#renderMethodTools();
  }

  search(query: string): VisualizationSearchResult[] {
    this.#searchQuery = query;
    if (!query.trim()) {
      this.#searchResults = [];
      this.#syncFocusModel();
      if (this.#toolsAreOpen()) {
        this.#syncTimeline(false);
        this.#renderMethodTools();
      }
      return [];
    }
    this.#searchResults = parseSearchResults(this.#engine.search_json(query, this.#searchScope));
    this.#syncFocusModel();
    if (this.#toolsAreOpen()) {
      this.#syncTimeline(false);
      this.#renderMethodTools();
    }
    return this.#searchResults;
  }

  select(id: string, center = false): void {
    this.#selectedId = id;
    this.#applySelection();
    if (center) {
      this.#renderer.focusOnVertex(id, { animated: true });
    }
  }

  clearSelection(): void {
    this.#selectedId = null;
    this.#selectedDetails = null;
    this.#pinnedIds = [];
    this.#timelineFocus = null;
    this.#bringAndSlide = { left: null, right: null };
    this.#renderer.setInteraction(null);
    this.#renderer.setHighlightSummary(null);
    this.#renderer.setBringAndSlide(this.#bringAndSlide);
    this.#renderer.setIsolation(false, this.#isolateDepth);
    this.#isolateEnabled = false;
    this.#syncFocusModel();
    this.#syncTimeline(false);
    this.#onSelectionChange?.(null);
    this.#renderMethodTools();
  }

  projectionSummary(): VisualizationProjectionSummary {
    return this.#projectionSummary;
  }

  exportPng(mode: VisualizationExportMode = "current"): Promise<Blob> {
    return this.#renderer.exportPng({ mode });
  }

  exportInteractiveHtml(title: string): string | null {
    return this.#renderer.exportInteractiveHtml({ title, autoPrint: false });
  }

  captureViewState(): VisualizationViewState {
    return createVisualizationViewState(this.methodId, this.#renderer.getCameraState());
  }

  restoreViewState(state: VisualizationViewState): boolean {
    const { scale, offsetX, offsetY, rotationDegrees } = state.camera;
    if (
      state.methodId !== this.methodId ||
      !isFiniteNumber(scale) ||
      !isFiniteNumber(offsetX) ||
      !isFiniteNumber(offsetY) ||
      !isFiniteNumber(rotationDegrees) ||
      scale <= 0
    ) {
      return false;
    }
    this.#renderer.restoreCamera({ scale, offsetX, offsetY, rotationDegrees }, { animated: false });
    return true;
  }

  destroy(): void {
    if (this.#toolsHost?.isConnected) {
      this.#toolsHost.replaceChildren();
    }
    this.#toolsHost = null;
    this.#renderer.destroy();
    this.#engine.free();
    this.#host.replaceChildren();
  }

  #applySelection(): void {
    if (!this.#selectedId) {
      this.#renderer.setInteraction(null);
      this.#renderer.setHighlightSummary(null);
      this.#renderer.setBringAndSlide({ left: null, right: null });
      this.#selectedDetails = null;
      this.#onSelectionChange?.(null);
      this.#syncFocusModel();
      this.#syncTimeline(false);
      this.#renderMethodTools();
      return;
    }

    const interaction = JSON.parse(
      this.#engine.interaction_json(this.#selectedId, this.#traceMode),
    );
    const highlightIds = uniqueIds([this.#selectedId, ...this.#pinnedIds]);
    const highlights = JSON.parse(
      this.#engine.highlight_summary_json(JSON.stringify(highlightIds), this.#traceMode),
    );
    const details = parseDetails(this.#engine.vertex_details_json(this.#selectedId));
    this.#bringAndSlide =
      details.kind === "person"
        ? {
            left: parseBringAndSlide(this.#engine.bring_and_slide_json(this.#selectedId, "left")),
            right: parseBringAndSlide(this.#engine.bring_and_slide_json(this.#selectedId, "right")),
          }
        : { left: null, right: null };

    this.#selectedDetails = details;
    this.#renderer.setInteraction(interaction);
    this.#renderer.setHighlightSummary(highlights);
    this.#renderer.setBringAndSlide(this.#bringAndSlide);
    this.#renderer.setIsolation(this.#isolateEnabled, this.#isolateDepth);
    this.#syncFocusModel();
    this.#syncTimeline(false);
    this.#onSelectionChange?.(details);
    this.#renderMethodTools();
  }

  #syncFocusModel(): void {
    const highlightIds = uniqueIds([this.#selectedId, ...this.#pinnedIds]);
    const searchIds = uniqueIds(this.#searchResults.map((result) => result.id));
    const timelineIds = uniqueIds(this.#timelineFocus?.vertex_ids ?? []);
    const timelineActiveIds = this.#timelineFocus
      ? uniqueIds([...highlightIds, ...searchIds])
      : uniqueIds([...this.#visibleIds, ...highlightIds, ...searchIds]);
    this.#renderer.setFocusModel({
      primaryId: this.#selectedId,
      highlightIds,
      searchIds,
      visibleIds: this.#visibleIds,
      timelineIds,
      timelineActiveIds,
      timelineRange: this.#timelineFocus
        ? {
            startYear: this.#timelineFocus.start_year,
            endYear: this.#timelineFocus.end_year,
          }
        : null,
    });
  }

  #syncTimeline(render = true): void {
    const activeIds = this.#timelineFocus
      ? uniqueIds([
          this.#selectedId,
          ...this.#pinnedIds,
          ...this.#searchResults.map((result) => result.id),
        ])
      : uniqueIds([
          ...this.#visibleIds,
          this.#selectedId,
          ...this.#pinnedIds,
          ...this.#searchResults.map((result) => result.id),
        ]);
    this.#timelineSummary = parseTimelineSummary(
      this.#engine.timeline_json(
        JSON.stringify(activeIds),
        this.#selectedId ?? undefined,
        this.#timelineScope,
      ),
    );
    if (render) {
      this.#renderMethodTools();
    }
  }

  #handleViewportChange(ids: string[]): void {
    this.#visibleIds = ids;
    if (!this.#timelineFocus && this.#toolsAreOpen()) {
      this.#syncTimeline(false);
      this.#drawTimelineCanvas();
    }
  }

  #handleRotationChange(degrees: number): void {
    this.#rotationDegrees = degrees;
    const input = this.#toolsHost?.querySelector<HTMLInputElement>('[name="geneaquilt-rotation"]');
    const label = this.#toolsHost?.querySelector<HTMLElement>("[data-geneaquilt-rotation-value]");
    if (input) {
      input.value = String(Math.round(degrees));
    }
    if (label) {
      label.textContent = formatAngle(degrees);
    }
  }

  #switchRanker(ranker: GeneaQuiltRanker): void {
    if (ranker === this.#ranker) {
      return;
    }
    try {
      const nextEngine = GeneaQuiltEngine.with_ranker(this.#source, ranker);
      const nextScene = parseScene(nextEngine.scene_json());
      const previousEngine = this.#engine;
      this.#engine = nextEngine;
      this.#scene = nextScene;
      this.#ranker = ranker;
      this.#toolsError = null;
      this.#renderer.setScene(nextScene);
      previousEngine.free();
      if (
        this.#selectedId &&
        !nextScene.vertices.some((vertex) => vertex.id === this.#selectedId)
      ) {
        this.#selectedId = null;
        this.#pinnedIds = [];
      }
      this.#applySelection();
      this.#renderer.fit({ animated: false });
    } catch (error) {
      this.#toolsError = `The layout style could not be changed: ${formatError(error)}`;
      this.#renderMethodTools();
    }
  }

  #applyTimelineFocus(startYear: number, endYear: number, render = true): void {
    const start = Math.min(startYear, endYear);
    const end = Math.max(startYear, endYear);
    this.#timelineFocus = parseTimelineFocus(
      this.#engine.timeline_focus_json(start, end, this.#timelineScope),
    );
    this.#syncFocusModel();
    this.#syncTimeline(false);
    if (render) {
      if (this.#timelineAction === "fit" && this.#timelineFocus.vertex_ids.length) {
        this.#renderer.fitToVertexIds(this.#timelineFocus.vertex_ids, { animated: true });
      }
      this.#renderMethodTools();
    } else {
      this.#drawTimelineCanvas();
    }
  }

  #clearTimelineFocus(): void {
    this.#timelineFocus = null;
    this.#syncFocusModel();
    this.#syncTimeline(false);
    this.#renderMethodTools();
  }

  #renderMethodTools(): void {
    const host = this.#toolsHost;
    if (!host?.isConnected) {
      return;
    }
    for (const section of host.querySelectorAll<HTMLDetailsElement>("details[data-tool-section]")) {
      const id = section.dataset.toolSection;
      if (!id) continue;
      if (section.open) {
        this.#openToolSections.add(id);
      } else {
        this.#openToolSections.delete(id);
      }
    }

    const selected = this.#selectedDetails;
    const pinnedMarkup = this.#pinnedIds.length
      ? this.#pinnedIds
          .map(
            (id) =>
              `<li><span>${escapeMarkup(this.#labelForId(id))}</span><button class="text-button" type="button" data-remove-pin="${escapeMarkup(id)}">Remove</button></li>`,
          )
          .join("")
      : "<li><span>No pinned people or Families.</span></li>";
    const timeline = this.#timelineSummary;
    const timelineLabel = timeline?.bins.length
      ? `${timeline.start_year}-${timeline.end_year} · ${timeline.total_vertices_with_dates} dated ${timeline.scope === "people" ? "people" : timeline.scope === "families" ? "Families" : "items"}`
      : "No usable dates in this view";
    const leftCount = this.#bringAndSlide.left?.candidates.length ?? 0;
    const rightCount = this.#bringAndSlide.right?.candidates.length ?? 0;

    host.innerHTML = `
      <div class="geneaquilt-tools">
        ${this.#toolsError ? `<p class="method-tools-error" role="alert">${escapeMarkup(this.#toolsError)}</p>` : ""}
        <details data-tool-section="focus" ${this.#sectionOpen("focus")}>
          <summary>Find and focus</summary>
          <div class="method-tools-section">
            <div class="method-tools-grid">
              <label><span>Search in</span><select name="geneaquilt-search-scope">
                ${option("all", "All fields", this.#searchScope)}
                ${option("names", "Names", this.#searchScope)}
                ${option("attributes", "File details", this.#searchScope)}
                ${option("ids", "Record IDs", this.#searchScope)}
              </select></label>
              <label><span>Show relationships</span><select name="geneaquilt-trace-mode">
                ${option("all", "All", this.#traceMode)}
                ${option("predecessors", "Parents and earlier", this.#traceMode)}
                ${option("successors", "Children and later", this.#traceMode)}
                ${option("none", "None", this.#traceMode)}
              </select></label>
            </div>
            <label class="method-tools-check"><input name="geneaquilt-isolate" type="checkbox" ${this.#isolateEnabled ? "checked" : ""} /><span>Focus the quilt on the current selection</span></label>
            <label class="method-tools-range"><span>Focus depth</span><input name="geneaquilt-isolate-depth" type="range" min="0" max="8" step="1" value="${this.#isolateDepth}" /><strong data-geneaquilt-depth-value>${this.#isolateDepth}</strong></label>
            <div class="method-tools-actions">
              <button class="button pin-current" type="button" ${!this.#selectedId || this.#pinnedIds.includes(this.#selectedId) ? "disabled" : ""}>Pin current highlight</button>
              <button class="button clear-method-focus" type="button" ${!this.#selectedId && !this.#pinnedIds.length && !this.#timelineFocus ? "disabled" : ""}>Clear all focus</button>
            </div>
            <ul class="method-tools-pins">${pinnedMarkup}</ul>
            <p class="method-tools-note">${selected?.kind === "person" ? `Bring-and-Slide is ready: drag left from the selected person toward ${leftCount} parent or sibling choice${leftCount === 1 ? "" : "s"}, or right toward ${rightCount} husband, wife, or child choice${rightCount === 1 ? "" : "s"}.` : "Select a person to use Bring-and-Slide navigation."}</p>
          </div>
        </details>
        <details data-tool-section="view" ${this.#sectionOpen("view")}>
          <summary>View and layout</summary>
          <div class="method-tools-section">
            <label><span>Layout style</span><select name="geneaquilt-ranker">
              ${option("original", "Standard", this.#ranker)}
              ${option("v2", "Experimental", this.#ranker)}
            </select></label>
            <p class="method-tools-note">The experimental ranker changes generation assignment, not the Genealogy Document.</p>
            <label class="method-tools-range"><span>Trackpad zoom response</span><input name="geneaquilt-zoom-speed" type="range" min="0" max="100" step="1" value="${Math.round(this.#zoomSpeedValue)}" /><strong data-geneaquilt-zoom-value>${zoomSpeedLabel(this.#zoomSpeedValue)}</strong></label>
            <label class="method-tools-range"><span>Tilt</span><input name="geneaquilt-rotation" type="range" min="-90" max="90" step="1" value="${Math.round(this.#rotationDegrees)}" /><strong data-geneaquilt-rotation-value>${formatAngle(this.#rotationDegrees)}</strong></label>
            <div class="method-tools-actions">
              <button class="button rotate-preset" type="button">Tilt -15°</button>
              <button class="button rotation-reset" type="button">Reset tilt</button>
            </div>
          </div>
        </details>
        <details data-tool-section="timeline" ${this.#sectionOpen("timeline")}>
          <summary>Timeline</summary>
          <div class="method-tools-section">
            <div class="method-tools-grid">
              <label><span>Include</span><select name="geneaquilt-timeline-scope">
                ${option("all", "People and Families", this.#timelineScope)}
                ${option("people", "People", this.#timelineScope)}
                ${option("families", "Families", this.#timelineScope)}
              </select></label>
              <label><span>After dragging</span><select name="geneaquilt-timeline-action">
                ${option("highlight", "Highlight range", this.#timelineAction)}
                ${option("fit", "Highlight and fit", this.#timelineAction)}
              </select></label>
            </div>
            <div class="method-tools-timeline-heading"><span data-timeline-summary>${escapeMarkup(timelineLabel)}</span><button class="text-button clear-timeline" type="button" ${this.#timelineFocus ? "" : "disabled"}>Clear range</button></div>
            <canvas class="geneaquilt-timeline" aria-label="Timeline. Drag across years to highlight a date range."></canvas>
            <p class="method-tools-note">${this.#timelineFocus ? `${this.#timelineFocus.start_year}-${this.#timelineFocus.end_year}: ${this.#timelineFocus.matching_vertices_with_dates} dated items, including ${this.#timelineFocus.matching_people} people and ${this.#timelineFocus.matching_families} Families.` : "Drag across the chart to combine a date range with the current search and relationship focus."}</p>
          </div>
        </details>
        <details data-tool-section="record" ${this.#sectionOpen("record")}>
          <summary>Selected record details</summary>
          <div class="method-tools-section">
            ${selected ? selectedDetailsMarkup(selected) : '<p class="method-tools-note">Select a person or Family to inspect layout and Source GEDCOM details.</p>'}
          </div>
        </details>
      </div>
    `;
    this.#bindMethodTools();
    requestAnimationFrame(() => this.#drawTimelineCanvas());
  }

  #bindMethodTools(): void {
    const host = this.#toolsHost;
    if (!host) return;
    host.querySelectorAll<HTMLDetailsElement>("details[data-tool-section]").forEach((details) => {
      details.addEventListener("toggle", () => {
        const id = details.dataset.toolSection;
        if (!id) return;
        if (details.open) {
          this.#openToolSections.add(id);
          if (id === "timeline") {
            requestAnimationFrame(() => this.#drawTimelineCanvas());
          }
        } else {
          this.#openToolSections.delete(id);
        }
      });
    });
    host
      .querySelector<HTMLSelectElement>('[name="geneaquilt-search-scope"]')
      ?.addEventListener("change", (event) => {
        this.#searchScope = (event.currentTarget as HTMLSelectElement).value as SearchScope;
        this.search(this.#searchQuery);
      });
    host
      .querySelector<HTMLSelectElement>('[name="geneaquilt-trace-mode"]')
      ?.addEventListener("change", (event) => {
        this.#traceMode = (event.currentTarget as HTMLSelectElement).value as TraceMode;
        this.#applySelection();
      });
    host
      .querySelector<HTMLInputElement>('[name="geneaquilt-isolate"]')
      ?.addEventListener("change", (event) => {
        this.#isolateEnabled = (event.currentTarget as HTMLInputElement).checked;
        this.#renderer.setIsolation(this.#isolateEnabled, this.#isolateDepth);
      });
    host
      .querySelector<HTMLInputElement>('[name="geneaquilt-isolate-depth"]')
      ?.addEventListener("input", (event) => {
        this.#isolateDepth = Number((event.currentTarget as HTMLInputElement).value);
        const label = host.querySelector<HTMLElement>("[data-geneaquilt-depth-value]");
        if (label) label.textContent = String(this.#isolateDepth);
        this.#renderer.setIsolation(this.#isolateEnabled, this.#isolateDepth);
      });
    host.querySelector(".pin-current")?.addEventListener("click", () => {
      if (this.#selectedId && !this.#pinnedIds.includes(this.#selectedId)) {
        this.#pinnedIds = [...this.#pinnedIds, this.#selectedId];
        this.#applySelection();
      }
    });
    host.querySelector(".clear-method-focus")?.addEventListener("click", () => {
      this.clearSelection();
    });
    host.querySelectorAll<HTMLElement>("[data-remove-pin]").forEach((button) => {
      button.addEventListener("click", () => {
        const id = button.dataset.removePin;
        if (!id) return;
        this.#pinnedIds = this.#pinnedIds.filter((candidate) => candidate !== id);
        this.#applySelection();
      });
    });
    host
      .querySelector<HTMLSelectElement>('[name="geneaquilt-ranker"]')
      ?.addEventListener("change", (event) => {
        this.#switchRanker((event.currentTarget as HTMLSelectElement).value as GeneaQuiltRanker);
      });
    host
      .querySelector<HTMLInputElement>('[name="geneaquilt-zoom-speed"]')
      ?.addEventListener("input", (event) => {
        this.#zoomSpeedValue = Number((event.currentTarget as HTMLInputElement).value);
        this.#renderer.setZoomSpeed(sliderValueToZoomSpeed(this.#zoomSpeedValue));
        const label = host.querySelector<HTMLElement>("[data-geneaquilt-zoom-value]");
        if (label) label.textContent = zoomSpeedLabel(this.#zoomSpeedValue);
      });
    host
      .querySelector<HTMLInputElement>('[name="geneaquilt-rotation"]')
      ?.addEventListener("input", (event) => {
        this.#rotationDegrees = Number((event.currentTarget as HTMLInputElement).value);
        this.#renderer.setRotationDegrees(this.#rotationDegrees, { notify: true });
      });
    host.querySelector(".rotate-preset")?.addEventListener("click", () => {
      this.#rotationDegrees = -15;
      this.#renderer.setRotationDegrees(this.#rotationDegrees, { notify: true });
    });
    host.querySelector(".rotation-reset")?.addEventListener("click", () => {
      this.#rotationDegrees = 0;
      this.#renderer.setRotationDegrees(0, { notify: true });
    });
    host
      .querySelector<HTMLSelectElement>('[name="geneaquilt-timeline-scope"]')
      ?.addEventListener("change", (event) => {
        this.#timelineScope = (event.currentTarget as HTMLSelectElement).value as TimelineScope;
        if (this.#timelineFocus) {
          this.#applyTimelineFocus(this.#timelineFocus.start_year, this.#timelineFocus.end_year);
        } else {
          this.#syncTimeline();
        }
      });
    host
      .querySelector<HTMLSelectElement>('[name="geneaquilt-timeline-action"]')
      ?.addEventListener("change", (event) => {
        this.#timelineAction = (event.currentTarget as HTMLSelectElement).value as
          "highlight" | "fit";
      });
    host.querySelector(".clear-timeline")?.addEventListener("click", () => {
      this.#clearTimelineFocus();
    });
    this.#bindTimelineBrush();
  }

  #bindTimelineBrush(): void {
    const canvas = this.#toolsHost?.querySelector<HTMLCanvasElement>(".geneaquilt-timeline");
    if (!canvas || !this.#timelineSummary?.bins.length) {
      return;
    }
    let anchorYear: number | null = null;
    const yearAt = (offsetX: number): number => {
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.min(1, Math.max(0, offsetX / Math.max(1, rect.width)));
      const span = this.#timelineSummary!.end_year - this.#timelineSummary!.start_year + 1;
      return this.#timelineSummary!.start_year + Math.min(span - 1, Math.floor(ratio * span));
    };
    canvas.addEventListener("pointerdown", (event) => {
      anchorYear = yearAt(event.offsetX);
      canvas.setPointerCapture(event.pointerId);
      this.#applyTimelineFocus(anchorYear, anchorYear, false);
    });
    canvas.addEventListener("pointermove", (event) => {
      if (anchorYear === null) return;
      this.#applyTimelineFocus(anchorYear, yearAt(event.offsetX), false);
    });
    canvas.addEventListener("pointerup", (event) => {
      if (anchorYear === null) return;
      const endYear = yearAt(event.offsetX);
      canvas.releasePointerCapture(event.pointerId);
      this.#applyTimelineFocus(anchorYear, endYear, true);
      anchorYear = null;
    });
    canvas.addEventListener("pointercancel", () => {
      anchorYear = null;
    });
  }

  #drawTimelineCanvas(): void {
    const canvas = this.#toolsHost?.querySelector<HTMLCanvasElement>(".geneaquilt-timeline");
    const summary = this.#timelineSummary;
    if (!canvas?.isConnected || !summary) {
      return;
    }
    const rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) {
      return;
    }
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    const palette = timelinePalette(this.#theme);
    context.fillStyle = palette.background;
    context.fillRect(0, 0, rect.width, rect.height);
    if (!summary.bins.length) {
      return;
    }
    const chartTop = 8;
    const chartHeight = Math.max(18, rect.height - 28);
    const barWidth = rect.width / summary.bins.length;
    const maxTotal = Math.max(1, ...summary.bins.map((bin) => bin.total));
    summary.bins.forEach((bin, index) => {
      const x = index * barWidth;
      const totalHeight = (bin.total / maxTotal) * chartHeight;
      const activeHeight = (bin.active_total / maxTotal) * chartHeight;
      context.fillStyle = palette.total;
      context.fillRect(
        x,
        chartTop + chartHeight - totalHeight,
        Math.max(1, barWidth - 1),
        totalHeight,
      );
      if (bin.families) {
        const familyHeight = (bin.families / maxTotal) * chartHeight;
        context.fillStyle = palette.family;
        context.fillRect(
          x,
          chartTop + chartHeight - familyHeight,
          Math.max(1, barWidth - 1),
          familyHeight,
        );
      }
      if (activeHeight) {
        context.fillStyle = palette.active;
        context.fillRect(
          x,
          chartTop + chartHeight - activeHeight,
          Math.max(1, barWidth - 1),
          activeHeight,
        );
      }
    });
    if (this.#timelineFocus) {
      const years = summary.end_year - summary.start_year + 1;
      const startX = ((this.#timelineFocus.start_year - summary.start_year) / years) * rect.width;
      const endX = ((this.#timelineFocus.end_year - summary.start_year + 1) / years) * rect.width;
      context.fillStyle = palette.focus;
      context.fillRect(startX, chartTop, Math.max(2, endX - startX), chartHeight);
      context.strokeStyle = palette.focusStroke;
      context.strokeRect(
        startX + 0.5,
        chartTop + 0.5,
        Math.max(1, endX - startX - 1),
        chartHeight - 1,
      );
    }
    context.strokeStyle = palette.axis;
    context.beginPath();
    context.moveTo(0, chartTop + chartHeight + 0.5);
    context.lineTo(rect.width, chartTop + chartHeight + 0.5);
    context.stroke();
    context.fillStyle = palette.label;
    context.font = '11px "Avenir Next", sans-serif';
    context.textBaseline = "bottom";
    context.fillText(String(summary.start_year), 0, rect.height - 2);
    const endLabel = String(summary.end_year);
    context.fillText(endLabel, rect.width - context.measureText(endLabel).width, rect.height - 2);
  }

  #labelForId(id: string): string {
    return this.#scene.vertices.find((vertex) => vertex.id === id)?.label ?? id;
  }

  #sectionOpen(id: string): string {
    return this.#openToolSections.has(id) ? "open" : "";
  }

  #toolsAreOpen(): boolean {
    return Boolean(this.#toolsHost?.isConnected);
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function parseScene(json: string): GeneaQuiltScene {
  const value: unknown = JSON.parse(json);
  if (
    typeof value !== "object" ||
    value === null ||
    !("summary" in value) ||
    !("bounds" in value) ||
    !("vertices" in value) ||
    !Array.isArray(value.vertices) ||
    !("edges" in value) ||
    !Array.isArray(value.edges)
  ) {
    throw new Error("The GeneaQuilt engine returned an invalid scene.");
  }
  return value as GeneaQuiltScene;
}

function parseSearchResults(json: string): VisualizationSearchResult[] {
  const value: unknown = JSON.parse(json);
  if (!Array.isArray(value)) {
    throw new Error("The GeneaQuilt engine returned invalid search results.");
  }
  return value.map((entry) => {
    if (
      typeof entry !== "object" ||
      entry === null ||
      !("id" in entry) ||
      typeof entry.id !== "string" ||
      !("label" in entry) ||
      typeof entry.label !== "string" ||
      !("kind" in entry) ||
      (entry.kind !== "person" && entry.kind !== "family")
    ) {
      throw new Error("The GeneaQuilt engine returned an invalid search result.");
    }
    return { id: entry.id, label: entry.label, kind: entry.kind };
  });
}

function parseDetails(json: string): GeneaQuiltRecordDetails {
  const value: unknown = JSON.parse(json);
  if (
    typeof value !== "object" ||
    value === null ||
    !("id" in value) ||
    typeof value.id !== "string" ||
    !("label" in value) ||
    typeof value.label !== "string" ||
    !("kind" in value) ||
    (value.kind !== "person" && value.kind !== "family") ||
    !("parents" in value) ||
    !Array.isArray(value.parents) ||
    !("spouses" in value) ||
    !Array.isArray(value.spouses) ||
    !("children" in value) ||
    !Array.isArray(value.children) ||
    !("layer" in value) ||
    typeof value.layer !== "number" ||
    !("order" in value) ||
    typeof value.order !== "number" ||
    !("component" in value) ||
    typeof value.component !== "number" ||
    !("parent_families" in value) ||
    !Array.isArray(value.parent_families) ||
    !("spouse_families" in value) ||
    !Array.isArray(value.spouse_families) ||
    !("predecessors" in value) ||
    !Array.isArray(value.predecessors) ||
    !("successors" in value) ||
    !Array.isArray(value.successors) ||
    !("properties" in value) ||
    !Array.isArray(value.properties)
  ) {
    throw new Error("The GeneaQuilt engine returned invalid record details.");
  }
  const properties = value.properties.map((entry) => {
    if (
      typeof entry !== "object" ||
      entry === null ||
      !("key" in entry) ||
      typeof entry.key !== "string" ||
      !("values" in entry) ||
      !Array.isArray(entry.values)
    ) {
      throw new Error("The GeneaQuilt engine returned an invalid record property.");
    }
    return { key: entry.key, values: entry.values.map(String) };
  });
  return {
    id: value.id,
    label: value.label,
    kind: value.kind,
    parents: value.parents.map(String),
    spouses: value.spouses.map(String),
    children: value.children.map(String),
    layer: value.layer,
    order: value.order,
    component: value.component,
    parentFamilies: value.parent_families.map(String),
    spouseFamilies: value.spouse_families.map(String),
    predecessors: value.predecessors.map(String),
    successors: value.successors.map(String),
    properties,
    date_start:
      "date_start" in value && typeof value.date_start === "number" ? value.date_start : null,
    date_end: "date_end" in value && typeof value.date_end === "number" ? value.date_end : null,
  };
}

function parseBringAndSlide(json: string): BringAndSlideSummary {
  const value: unknown = JSON.parse(json);
  if (
    typeof value !== "object" ||
    value === null ||
    !("focus_id" in value) ||
    typeof value.focus_id !== "string" ||
    !("direction" in value) ||
    (value.direction !== "left" && value.direction !== "right") ||
    !("candidates" in value) ||
    !Array.isArray(value.candidates)
  ) {
    throw new Error("The GeneaQuilt engine returned invalid Bring-and-Slide controls.");
  }
  const candidates = value.candidates.map((candidate) => {
    if (
      typeof candidate !== "object" ||
      candidate === null ||
      !("id" in candidate) ||
      typeof candidate.id !== "string" ||
      !("label" in candidate) ||
      typeof candidate.label !== "string" ||
      !("relation" in candidate) ||
      typeof candidate.relation !== "string"
    ) {
      throw new Error("The GeneaQuilt engine returned an invalid Bring-and-Slide candidate.");
    }
    return { id: candidate.id, label: candidate.label, relation: candidate.relation };
  });
  return {
    focus_id: value.focus_id,
    direction: value.direction,
    candidates,
  };
}

function parseTimelineSummary(json: string): TimelineSummary {
  const value: unknown = JSON.parse(json);
  if (
    typeof value !== "object" ||
    value === null ||
    !("scope" in value) ||
    !isTimelineScope(value.scope) ||
    !("start_year" in value) ||
    typeof value.start_year !== "number" ||
    !("end_year" in value) ||
    typeof value.end_year !== "number" ||
    !("total_vertices_with_dates" in value) ||
    typeof value.total_vertices_with_dates !== "number" ||
    !("active_vertices_with_dates" in value) ||
    typeof value.active_vertices_with_dates !== "number" ||
    !("bins" in value) ||
    !Array.isArray(value.bins)
  ) {
    throw new Error("The GeneaQuilt engine returned an invalid timeline.");
  }
  const bins = value.bins.map((bin) => {
    if (
      typeof bin !== "object" ||
      bin === null ||
      !("year" in bin) ||
      typeof bin.year !== "number" ||
      !("total" in bin) ||
      typeof bin.total !== "number" ||
      !("people" in bin) ||
      typeof bin.people !== "number" ||
      !("families" in bin) ||
      typeof bin.families !== "number" ||
      !("active_total" in bin) ||
      typeof bin.active_total !== "number"
    ) {
      throw new Error("The GeneaQuilt engine returned an invalid timeline bin.");
    }
    return {
      year: bin.year,
      total: bin.total,
      people: bin.people,
      families: bin.families,
      active_total: bin.active_total,
    };
  });
  return {
    scope: value.scope,
    start_year: value.start_year,
    end_year: value.end_year,
    total_vertices_with_dates: value.total_vertices_with_dates,
    active_vertices_with_dates: value.active_vertices_with_dates,
    active_range: parseYearRange("active_range" in value ? value.active_range : null),
    selected_range: parseYearRange("selected_range" in value ? value.selected_range : null),
    bins,
  };
}

function parseTimelineFocus(json: string): TimelineFocus {
  const value: unknown = JSON.parse(json);
  if (
    typeof value !== "object" ||
    value === null ||
    !("scope" in value) ||
    !isTimelineScope(value.scope) ||
    !("start_year" in value) ||
    typeof value.start_year !== "number" ||
    !("end_year" in value) ||
    typeof value.end_year !== "number" ||
    !("matching_vertices_with_dates" in value) ||
    typeof value.matching_vertices_with_dates !== "number" ||
    !("matching_people" in value) ||
    typeof value.matching_people !== "number" ||
    !("matching_families" in value) ||
    typeof value.matching_families !== "number" ||
    !("vertex_ids" in value) ||
    !Array.isArray(value.vertex_ids)
  ) {
    throw new Error("The GeneaQuilt engine returned an invalid timeline focus.");
  }
  return {
    scope: value.scope,
    start_year: value.start_year,
    end_year: value.end_year,
    matching_vertices_with_dates: value.matching_vertices_with_dates,
    matching_people: value.matching_people,
    matching_families: value.matching_families,
    vertex_ids: value.vertex_ids.map(String),
  };
}

function parseYearRange(value: unknown): [number, number] | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    typeof value[0] !== "number" ||
    typeof value[1] !== "number"
  ) {
    throw new Error("The GeneaQuilt engine returned an invalid timeline range.");
  }
  return [value[0], value[1]];
}

function isTimelineScope(value: unknown): value is TimelineScope {
  return value === "all" || value === "people" || value === "families";
}

function option(value: string, label: string, selected: string): string {
  return `<option value="${escapeMarkup(value)}" ${value === selected ? "selected" : ""}>${escapeMarkup(label)}</option>`;
}

function selectedDetailsMarkup(details: GeneaQuiltRecordDetails): string {
  const graphLinks =
    details.kind === "person"
      ? [
          details.parentFamilies.length
            ? `Parent Families: ${details.parentFamilies.join(", ")}`
            : null,
          details.spouseFamilies.length
            ? `Spouse Families: ${details.spouseFamilies.join(", ")}`
            : null,
        ]
          .filter(Boolean)
          .join(" · ")
      : [
          details.predecessors.length ? `Earlier links: ${details.predecessors.join(", ")}` : null,
          details.successors.length ? `Later links: ${details.successors.join(", ")}` : null,
        ]
          .filter(Boolean)
          .join(" · ");
  const properties = details.properties.length
    ? `<dl class="method-tools-properties">${details.properties
        .map(
          (entry) =>
            `<div><dt>${escapeMarkup(entry.key)}</dt><dd>${escapeMarkup(entry.values.join(", "))}</dd></div>`,
        )
        .join("")}</dl>`
    : '<p class="method-tools-note">No additional Source GEDCOM properties are attached to this record.</p>';
  return `
    <div class="method-tools-record-heading"><strong>${escapeMarkup(details.label)}</strong><span>${escapeMarkup(details.id)}</span></div>
    <dl class="method-tools-metrics">
      <div><dt>Layer</dt><dd>${details.layer}</dd></div>
      <div><dt>Order</dt><dd>${details.order}</dd></div>
      <div><dt>Group</dt><dd>${details.component + 1}</dd></div>
    </dl>
    <p class="method-tools-note">${escapeMarkup(graphLinks || "No additional graph links.")}</p>
    ${properties}
  `;
}

function zoomSpeedLabel(value: number): string {
  if (value < 25) return "Gentle";
  if (value < 50) return "Balanced";
  if (value < 75) return "Responsive";
  return "Very fast";
}

function formatAngle(value: number): string {
  const rounded = Math.round(value);
  return `${rounded > 0 ? "+" : ""}${rounded}°`;
}

function timelinePalette(theme: AppTheme): {
  background: string;
  total: string;
  family: string;
  active: string;
  focus: string;
  focusStroke: string;
  axis: string;
  label: string;
} {
  if (theme === "dark") {
    return {
      background: "#202722",
      total: "#52645a",
      family: "#a77a4a",
      active: "#c87552",
      focus: "rgba(200, 117, 82, 0.22)",
      focusStroke: "#d89572",
      axis: "#75847b",
      label: "#dfe6df",
    };
  }
  return {
    background: "#f6f2e9",
    total: "#9aaca1",
    family: "#c69352",
    active: "#b85f3e",
    focus: "rgba(184, 95, 62, 0.16)",
    focusStroke: "#a54f33",
    axis: "#89978e",
    label: "#33443a",
  };
}

function uniqueIds(ids: Array<string | null | undefined>): string[] {
  return [...new Set(ids.filter((id): id is string => Boolean(id)))];
}

function escapeMarkup(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
