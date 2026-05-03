import { loadEngineModule } from "./engine.js";
import {
  appSurfaceState,
  matchesPopupState,
  shouldFitAfterSourceLoad,
} from "./appState.js";
import { buildFocusModel, describeFocusModel } from "./focusModel.js";
import { QuiltRenderer } from "./quiltRenderer.js";

const sampleGedcom = `0 @I1@ INDI
1 NAME John /Doe/
1 SEX M
1 FAMS @F1@
1 BIRT
2 DATE 1900
0 @I2@ INDI
1 NAME Jane /Smith/
1 SEX F
1 FAMS @F1@
1 BIRT
2 DATE 1904
0 @I3@ INDI
1 NAME Child /Doe/
1 FAMC @F1@
1 BIRT
2 DATE 1930
0 @I4@ INDI
1 NAME Grandchild /Doe/
1 FAMC @F2@
1 BIRT
2 DATE 1958
0 @I5@ INDI
1 NAME Partner /Lane/
1 FAMS @F2@
0 @I6@ INDI
1 NAME Child /Two/
1 FAMS @F2@
1 BIRT
2 DATE 1932
0 @F1@ FAM
1 HUSB @I1@
1 WIFE @I2@
1 CHIL @I3@
1 CHIL @I6@
1 MARR
2 DATE 1920
0 @F2@ FAM
1 HUSB @I6@
1 WIFE @I5@
1 CHIL @I4@
1 MARR
2 DATE 1954
`;

const THEME_STORAGE_KEY = "geneaquilt-theme";

export async function createApp() {
  const wasm = await loadEngineModule();
  const page = document.createElement("main");
  page.className = "page";
  let theme = getInitialTheme();
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;

  page.innerHTML = `
    <section class="hero">
      <div class="hero-topline">
        <div class="eyebrow">GeneaQuilt</div>
        <div class="appearance-controls" aria-label="Appearance">
          <button class="button icon-button theme-toggle-button" type="button" aria-pressed="${theme === "dark" ? "true" : "false"}" aria-label="${theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}">
            ${iconSvg(theme === "dark" ? "sun" : "moon")}
          </button>
        </div>
      </div>
      <div class="hero-grid">
        <div>
          <h1>GEDCOM viewer</h1>
          <p class="lede">
            Load a family tree, inspect the quilt layout, search people, and export a working snapshot.
          </p>
        </div>
      </div>
    </section>
    <section class="studio">
      <section class="source-panel panel">
        <div class="panel-header">
          <div>
            <div class="kicker">Source</div>
            <h2>Input</h2>
          </div>
          <label class="button button-file">
            <input type="file" accept=".ged,.gedcom,.txt" />
            ${iconSvg("upload")}
            <span>Load file</span>
          </label>
        </div>
        <button class="button load-default-button" type="button">
          <span>${iconSvg("folder-open")}Load sample tree</span>
        </button>
        <button class="source-toggle" type="button" aria-expanded="false">
          <span>GEDCOM input</span>
          <strong>Expand</strong>
        </button>
        <div class="source-body" hidden>
          <textarea spellcheck="false"></textarea>
        </div>
        <div class="row-actions">
          <label class="field ranker-field">
            <span>Layout style</span>
            <select class="ranker-select">
              <option value="original">Standard</option>
              <option value="v2">Experimental</option>
            </select>
          </label>
          <button class="button button-primary analyze-button">${iconSvg("sparkles")}Build quilt</button>
          <button class="button fit-button" type="button">${iconSvg("maximize")}Fit view</button>
          <button class="button zoom-in-button" type="button" aria-label="Zoom in">${iconSvg("zoom-in")}<span>Zoom in</span></button>
          <button class="button zoom-out-button" type="button" aria-label="Zoom out">${iconSvg("zoom-out")}<span>Zoom out</span></button>
          <button class="button expand-button" type="button">${iconSvg("text")}Expand names</button>
          <small class="field-note names-toggle-note">
            Compact names shortens labels when the quilt is crowded. Expand names shows the fuller names again.
          </small>
        </div>
        <div class="toolbar interactive-controls">
          <label class="field search-field">
            <span>Search</span>
            <input class="search-input" type="search" placeholder="Search names, dates, or attributes" />
            <small class="field-note">Search by name, year, family ID, or file detail.</small>
          </label>
          <section class="matches-panel search-popup" aria-live="polite">
            <div class="search-results-title">Matches</div>
            <div class="search-results"></div>
          </section>
          <label class="field">
            <span>Search in</span>
            <select class="search-scope-select">
              <option value="all">All fields</option>
              <option value="names">Names</option>
              <option value="attributes">File details</option>
              <option value="ids">Family IDs</option>
            </select>
          </label>
          <label class="field">
            <span>Show relationships</span>
            <select class="mode-select">
              <option value="all">All</option>
              <option value="predecessors">Parents and earlier</option>
              <option value="successors">Children and later</option>
              <option value="none">None</option>
            </select>
          </label>
          <label class="toggle">
            <input class="isolate-toggle" type="checkbox" />
            <span>Focus on selection</span>
          </label>
          <label class="field slider-field">
            <span>Focus depth</span>
            <input class="depth-input" type="range" min="0" max="8" step="1" value="3" />
            <strong class="depth-value">3</strong>
          </label>
          <label class="field slider-field">
            <span>Zoom speed</span>
            <input class="zoom-speed-input" type="range" min="0" max="100" step="1" value="100" />
            <strong class="zoom-speed-value">Very fast</strong>
          </label>
          <label class="field slider-field">
            <span>Tilt</span>
            <input class="rotation-input" type="range" min="-90" max="90" step="1" value="0" />
            <strong class="rotation-value">0°</strong>
          </label>
          <div class="toolbar-actions">
            <button class="button rotate-preset-button" type="button">Rotate -15°</button>
            <button class="button rotation-reset-button" type="button">Reset angle</button>
            <button class="button export-html-button" type="button">${iconSvg("download")}Export file</button>
            <button class="button print-export-button" type="button">${iconSvg("printer")}Print / PDF</button>
          </div>
        </div>
      </section>
      <section class="stage-panel panel">
        <div class="panel-header">
          <div>
            <div class="kicker">Quilt</div>
            <h2>Quilt view</h2>
          </div>
          <div class="stage-meta">
            <span class="pill layers-pill">0 generations</span>
            <span class="pill counts-pill">0 items</span>
          </div>
        </div>
        <section class="timeline-panel">
          <div class="timeline-header">
            <div class="timeline-title">Timeline</div>
            <div class="timeline-header-actions">
              <div class="focus-status">No active focus</div>
              <div class="timeline-summary">No dates yet</div>
              <button class="button timeline-clear-button" type="button" hidden>Clear range</button>
            </div>
          </div>
          <div class="timeline-controls">
            <label class="field">
              <span>Show dates for</span>
              <select class="timeline-scope-select">
                <option value="all">Everything</option>
                <option value="people">People only</option>
                <option value="families">Families only</option>
              </select>
            </label>
            <div class="field timeline-action-field">
              <label for="timeline-action-select">After dragging</label>
              <select id="timeline-action-select" class="timeline-action-select" aria-describedby="timeline-action-help">
                <option value="fit">Spotlight</option>
                <option value="dim">Highlight</option>
              </select>
              <small id="timeline-action-help" class="field-note timeline-mode-note">
                Spotlight moves the quilt to the dates you drag over. Highlight keeps your view and softly fades everything outside that date range.
              </small>
            </div>
          </div>
          <canvas class="timeline-canvas"></canvas>
        </section>
        <div class="stage-shell">
          <canvas class="quilt-canvas"></canvas>
          <div class="minimap-shell">
            <div class="minimap-label">Overview</div>
            <canvas class="minimap-canvas"></canvas>
          </div>
        </div>
      </section>
      <section class="detail-panel panel">
        <div class="panel-header">
          <div>
            <div class="kicker">Selection</div>
            <h2>Details</h2>
          </div>
          <div class="detail-actions">
            <button class="button pin-highlight-button" type="button">${iconSvg("pin")}Pin highlight</button>
            <button class="button clear-highlights-button" type="button">${iconSvg("x")}Clear focus</button>
          </div>
        </div>
        <div class="highlight-stack"></div>
        <div class="detail-summary"></div>
        <div class="detail-relations"></div>
        <div class="detail-properties"></div>
      </section>
    </section>
  `;

  const textarea = page.querySelector("textarea");
  const fileInput = page.querySelector('input[type="file"]');
  const sourceToggle = page.querySelector(".source-toggle");
  const sourceBody = page.querySelector(".source-body");
  const sourcePanel = page.querySelector(".source-panel");
  const stagePanel = page.querySelector(".stage-panel");
  const detailPanel = page.querySelector(".detail-panel");
  const interactiveControls = page.querySelector(".interactive-controls");
  const matchesPanel = page.querySelector(".matches-panel");
  const loadDefaultButton = page.querySelector(".load-default-button");
  const analyzeButton = page.querySelector(".analyze-button");
  const rankerSelect = page.querySelector(".ranker-select");
  const fitButton = page.querySelector(".fit-button");
  const zoomInButton = page.querySelector(".zoom-in-button");
  const zoomOutButton = page.querySelector(".zoom-out-button");
  const expandButton = page.querySelector(".expand-button");
  const searchInput = page.querySelector(".search-input");
  const searchScopeSelect = page.querySelector(".search-scope-select");
  const modeSelect = page.querySelector(".mode-select");
  const isolateToggle = page.querySelector(".isolate-toggle");
  const depthInput = page.querySelector(".depth-input");
  const depthValue = page.querySelector(".depth-value");
  const zoomSpeedInput = page.querySelector(".zoom-speed-input");
  const zoomSpeedValue = page.querySelector(".zoom-speed-value");
  const rotationInput = page.querySelector(".rotation-input");
  const rotationValue = page.querySelector(".rotation-value");
  const rotatePresetButton = page.querySelector(".rotate-preset-button");
  const rotationResetButton = page.querySelector(".rotation-reset-button");
  const exportHtmlButton = page.querySelector(".export-html-button");
  const printExportButton = page.querySelector(".print-export-button");
  const themeToggleButton = page.querySelector(".theme-toggle-button");
  const layersPill = page.querySelector(".layers-pill");
  const countsPill = page.querySelector(".counts-pill");
  const timelineSummary = page.querySelector(".timeline-summary");
  const focusStatus = page.querySelector(".focus-status");
  const timelineCanvas = page.querySelector(".timeline-canvas");
  const timelineScopeSelect = page.querySelector(".timeline-scope-select");
  const timelineActionSelect = page.querySelector(".timeline-action-select");
  const timelineClearButton = page.querySelector(".timeline-clear-button");
  const searchResults = page.querySelector(".search-results");
  const detailSummary = page.querySelector(".detail-summary");
  const detailRelations = page.querySelector(".detail-relations");
  const detailProperties = page.querySelector(".detail-properties");
  const detailActions = page.querySelector(".detail-actions");
  const pinHighlightButton = page.querySelector(".pin-highlight-button");
  const clearHighlightsButton = page.querySelector(".clear-highlights-button");
  const highlightStack = page.querySelector(".highlight-stack");
  const canvas = page.querySelector(".quilt-canvas");
  const minimapCanvas = page.querySelector(".minimap-canvas");

  let engine = null;
  let scene = null;
  let timeline = null;
  let timelineFocus = null;
  let selectedId = null;
  let currentSearchResults = [];
  let namesExpanded = true;
  let pinnedHighlightIds = [];
  let visibleVertexIds = [];
  let isBuildingScene = false;
  let sourceLabel = "demo-tree";
  let activeRanker = rankerSelect.value;

  const renderer = new QuiltRenderer(canvas, {
    minimapCanvas,
    onSelect: (id) => {
      if (selectedId !== id) {
        selectedId = id;
        syncSelection();
      }
    },
    onRotationChange: (degrees) => {
      rotationInput.value = String(Math.round(degrees));
      rotationValue.textContent = formatAngleLabel(degrees);
    },
    onViewportChange: (ids) => {
      visibleVertexIds = ids;
      if (engine && !timelineFocus && !isBuildingScene) {
        syncTimeline();
      }
    },
  });
  renderer.setTheme(theme);
  renderer.setZoomSpeed(sliderValueToZoomSpeed(Number(zoomSpeedInput.value)));
  zoomSpeedValue.textContent = sliderValueToZoomLabel(Number(zoomSpeedInput.value));
  expandButton.innerHTML = `${iconSvg("text")}Compact names`;

  function applyTheme(nextTheme) {
    theme = nextTheme === "dark" ? "dark" : "light";
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    localStorage.setItem(THEME_STORAGE_KEY, theme);
    themeToggleButton.innerHTML = iconSvg(theme === "dark" ? "sun" : "moon");
    themeToggleButton.setAttribute(
      "aria-label",
      theme === "dark" ? "Switch to light mode" : "Switch to dark mode",
    );
    themeToggleButton.setAttribute("aria-pressed", String(theme === "dark"));
    renderer.setTheme(theme);
    renderTimeline(timeline);
  }

  function setSourceExpanded(expanded) {
    sourceBody.hidden = !expanded;
    sourceToggle.setAttribute("aria-expanded", String(expanded));
    sourceToggle.querySelector("strong").textContent = expanded ? "Collapse" : "Expand";
  }

  setSourceExpanded(false);

  function syncSurfaceState() {
    const focusModel = currentFocusModel();
    const surface = appSurfaceState({
      hasScene: Boolean(scene),
      hasSelection: focusModel.hasSelectionContext || focusModel.hasTimelineContext,
    });
    page.dataset.state = surface.state;
    sourcePanel.hidden = !surface.showSource;
    stagePanel.hidden = !surface.showStage;
    detailPanel.hidden = !surface.showDetails;
    interactiveControls.hidden = !surface.showControls;
    syncMatchesPopup();
  }

  function syncMatchesPopup() {
    const popup = matchesPopupState({
      hasScene: Boolean(scene),
      query: searchInput.value,
      resultCount: currentSearchResults.length,
    });
    matchesPanel.hidden = !popup.showPopup;
    matchesPanel.dataset.state = popup.state;
  }

  function renderSearchResults(results) {
    currentSearchResults = results;
    syncFocusModel();
    syncMatchesPopup();
    searchResults.innerHTML = "";

    if (!results.length) {
      searchResults.innerHTML = `<div class="empty-state">No matches</div>`;
      return;
    }

    for (const result of results) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `search-hit${result.id === selectedId ? " is-active" : ""}`;
      button.innerHTML = `
        <strong>${escapeHtml(result.label)}</strong>
        <span>${escapeHtml(result.kind === "person" ? "person" : "family")} · layer ${result.layer}</span>
      `;
      button.addEventListener("click", () => {
        selectedId = result.id;
        syncSelection();
      });
      searchResults.append(button);
    }
  }

  function renderIdleSearchState() {
    currentSearchResults = [];
    syncFocusModel();
    syncMatchesPopup();
    searchResults.innerHTML = `<div class="empty-state">Load a GEDCOM to search and inspect the quilt.</div>`;
  }

  function refreshSearch() {
    if (!engine) {
      renderSearchResults([]);
      return;
    }

    if (!searchInput.value.trim()) {
      currentSearchResults = [];
      syncFocusModel();
      syncMatchesPopup();
      searchResults.innerHTML = `<div class="empty-state">Search names, dates, or attributes to list matches.</div>`;
      return;
    }

    const results = JSON.parse(engine.search_json(searchInput.value, searchScopeSelect.value));
    renderSearchResults(results);
  }

  function renderDetails(details, interaction) {
    detailSummary.innerHTML = `
      <div class="detail-compact">
        <div class="detail-heading">
          <div>
            <div class="detail-id">${escapeHtml(details.id)}</div>
            <h3>${escapeHtml(details.label)}</h3>
          </div>
          <span class="kind-pill">${escapeHtml(details.kind)}</span>
        </div>
        <div class="detail-grid">
          <div><span>Layer</span><strong>${details.layer}</strong></div>
          <div><span>Order</span><strong>${details.order}</strong></div>
          <div><span>Component</span><strong>${details.component}</strong></div>
          <div><span>Focus reach</span><strong>${interaction.max_distance}</strong></div>
        </div>
      </div>
    `;

    detailRelations.innerHTML = `
      <div class="relation-list">
        <div class="relation-row">
          <span>Trace</span>
          <strong>${interaction.highlighted_vertices.length} items · ${interaction.highlighted_edges.length} links</strong>
        </div>
        <div class="relation-row">
          <span>Bring and slide</span>
          <strong>${
          details.kind === "person"
            ? "Drag left for parents/siblings, right for spouses/children."
            : "Select a person to use bring-and-slide navigation."
        }</strong>
        </div>
        <div class="relation-row">
          <span>Parents</span>
          <strong>${details.parents.length ? details.parents.map(escapeHtml).join(", ") : "None"}</strong>
        </div>
        <div class="relation-row">
          <span>Spouses</span>
          <strong>${details.spouses.length ? details.spouses.map(escapeHtml).join(", ") : "None"}</strong>
        </div>
        <div class="relation-row">
          <span>Children</span>
          <strong>${details.children.length ? details.children.map(escapeHtml).join(", ") : "None"}</strong>
        </div>
        <div class="relation-row">
          <span>Graph links</span>
          <strong>${
          details.kind === "person"
            ? [
                details.parent_families.length
                  ? `parent families: ${details.parent_families.map(escapeHtml).join(", ")}`
                  : null,
                details.spouse_families.length
                  ? `spouse families: ${details.spouse_families.map(escapeHtml).join(", ")}`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ") || "None"
            : [
                details.predecessors.length
                  ? `earlier links: ${details.predecessors.map(escapeHtml).join(", ")}`
                  : null,
                details.successors.length
                  ? `later links: ${details.successors.map(escapeHtml).join(", ")}`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ") || "None"
        }</strong>
        </div>
      </div>
    `;

    detailProperties.innerHTML = `
      <h3>Properties</h3>
      ${
        details.properties.length
          ? details.properties
              .map(
                (entry) => `
                <div class="property-row">
                  <span>${escapeHtml(entry.key)}</span>
                  <strong>${escapeHtml(entry.values.join(", "))}</strong>
                </div>
              `,
              )
              .join("")
          : `<div class="empty-state">No structured properties on this vertex.</div>`
      }
    `;
  }

  function renderEmptyDetails() {
    detailSummary.innerHTML = `<div class="empty-state">No selection</div>`;
    detailRelations.innerHTML =
      `<div class="empty-state">Click a person or family to inspect relationships and tracing.</div>`;
    detailProperties.innerHTML =
      `<div class="empty-state">Structured properties appear here after selecting a node.</div>`;
  }

  function renderTimelineFocusDetails(focus) {
    const scopeLabel =
      focus.scope === "people"
        ? "People"
        : focus.scope === "families"
          ? "Families"
          : "All items";
    detailSummary.innerHTML = `
      <div class="detail-compact">
        <div class="detail-heading">
          <div>
            <div class="detail-id">Timeline focus</div>
            <h3>${focus.start_year}-${focus.end_year}</h3>
          </div>
          <span class="kind-pill">date range</span>
        </div>
        <div class="detail-grid">
          <div><span>Dated items</span><strong>${focus.matching_vertices_with_dates}</strong></div>
          <div><span>People</span><strong>${focus.matching_people}</strong></div>
          <div><span>Families</span><strong>${focus.matching_families}</strong></div>
          <div><span>Scope</span><strong>${scopeLabel}</strong></div>
        </div>
      </div>
    `;

    detailRelations.innerHTML = `
      <div class="relation-list">
        <div class="relation-row">
          <span>Range filter</span>
          <strong>${focus.matching_vertices_with_dates ? "Active across the quilt" : "No items in this range"}</strong>
        </div>
        <div class="relation-row">
          <span>Interaction</span>
          <strong>Drag the timeline, then click a node to combine date focus with tracing.</strong>
        </div>
      </div>
    `;

    detailProperties.innerHTML =
      `<div class="empty-state">Clear the timeline range or select a node to inspect detailed properties.</div>`;
  }

  function renderTimeline(summary) {
    timeline = summary;
    const palette = timelinePalette(theme);
    if (!summary || !summary.bins?.length) {
      timelineSummary.textContent = "No dates yet";
      timelineClearButton.hidden = true;
      const rect = timelineCanvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      timelineCanvas.width = Math.max(1, Math.round(rect.width * dpr));
      timelineCanvas.height = Math.max(1, Math.round(rect.height * dpr));
      const emptyCtx = timelineCanvas.getContext("2d");
      emptyCtx.setTransform(1, 0, 0, 1, 0, 0);
      emptyCtx.scale(dpr, dpr);
      emptyCtx.clearRect(0, 0, rect.width, rect.height);
      emptyCtx.fillStyle = palette.background;
      emptyCtx.fillRect(0, 0, rect.width, rect.height);
      return;
    }

    const activeLabel =
      selectedId || pinnedHighlightIds.length ? "active" : "visible";
    const activeText = summary.active_range
      ? `${activeLabel} ${summary.active_range[0]}-${summary.active_range[1]}`
      : "no active date focus";
    const scopeText =
      summary.scope === "people"
        ? "people"
        : summary.scope === "families"
          ? "families"
          : "items";
    const focusText = timelineFocus
      ? `range ${timelineFocus.start_year}-${timelineFocus.end_year} · ${timelineFocus.matching_vertices_with_dates} ${scopeText}`
      : activeText;
    timelineSummary.textContent =
      `${summary.start_year}-${summary.end_year} · ${summary.total_vertices_with_dates} ${scopeText} · ${focusText}`;
    timelineClearButton.hidden = !timelineFocus;

    const rect = timelineCanvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    timelineCanvas.width = Math.max(1, Math.round(rect.width * dpr));
    timelineCanvas.height = Math.max(1, Math.round(rect.height * dpr));
    const ctx = timelineCanvas.getContext("2d");
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, rect.width, rect.height);

    const width = rect.width;
    const height = rect.height;
    const maxTotal = Math.max(...summary.bins.map((bin) => bin.total), 1);
    const chartTop = 8;
    const chartHeight = height - 26;
    const barWidth = width / summary.bins.length;

    ctx.fillStyle = palette.background;
    ctx.fillRect(0, 0, width, height);

    for (let index = 0; index < summary.bins.length; index += 1) {
      const bin = summary.bins[index];
      const x = index * barWidth;
      const totalHeight = (bin.total / maxTotal) * chartHeight;
      const activeHeight = (bin.active_total / maxTotal) * chartHeight;

      ctx.fillStyle = palette.totalBar;
      ctx.fillRect(x, chartTop + chartHeight - totalHeight, Math.max(1, barWidth - 1), totalHeight);

      if (bin.families > 0) {
        ctx.fillStyle = palette.familyBar;
        ctx.fillRect(
          x,
          chartTop + chartHeight - (bin.families / maxTotal) * chartHeight,
          Math.max(1, barWidth - 1),
          (bin.families / maxTotal) * chartHeight,
        );
      }

      if (bin.active_total > 0) {
        ctx.fillStyle = palette.activeBar;
        ctx.fillRect(
          x,
          chartTop + chartHeight - activeHeight,
          Math.max(1, barWidth - 1),
          activeHeight,
        );
      }
    }

    if (timelineFocus) {
      const totalYears = summary.end_year - summary.start_year + 1;
      const startX = ((timelineFocus.start_year - summary.start_year) / totalYears) * width;
      const endX = ((timelineFocus.end_year - summary.start_year + 1) / totalYears) * width;
      ctx.fillStyle = palette.focusFill;
      ctx.fillRect(startX, chartTop, Math.max(2, endX - startX), chartHeight);
      ctx.strokeStyle = palette.focusStroke;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(startX + 0.75, chartTop + 0.75, Math.max(0.5, endX - startX - 1.5), chartHeight - 1.5);
    }

    if (summary.selected_range) {
      const [startYear, endYear] = summary.selected_range;
      const totalYears = summary.end_year - summary.start_year + 1;
      const startX = ((startYear - summary.start_year) / totalYears) * width;
      const endX = ((endYear - summary.start_year + 1) / totalYears) * width;
      ctx.fillStyle = palette.selectionFill;
      ctx.fillRect(startX, chartTop, Math.max(2, endX - startX), chartHeight);
    }

    ctx.strokeStyle = palette.axis;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, chartTop + chartHeight + 0.5);
    ctx.lineTo(width, chartTop + chartHeight + 0.5);
    ctx.stroke();

    ctx.fillStyle = palette.label;
    ctx.font = '11px Georgia, "Times New Roman", serif';
    ctx.textBaseline = "bottom";
    ctx.fillText(String(summary.start_year), 0, height - 2);
    const endLabel = String(summary.end_year);
    const endWidth = ctx.measureText(endLabel).width;
    ctx.fillText(endLabel, width - endWidth, height - 2);
  }

  function currentFocusModel() {
    return buildFocusModel({
      selectedId,
      pinnedIds: pinnedHighlightIds,
      searchMatchIds: searchInput.value.trim()
        ? currentSearchResults.map((result) => result.id)
        : [],
      visibleIds: visibleVertexIds,
      timelineFocus,
    });
  }

  function syncFocusModel() {
    const model = currentFocusModel();
    focusStatus.textContent = describeFocusModel(model);
    renderer.setFocusModel(model);
    return model;
  }

  function syncTimeline() {
    if (!engine) {
      renderTimeline(null);
      return;
    }
    const focusModel = syncFocusModel();
    renderTimeline(
      JSON.parse(
        engine.timeline_json(
          JSON.stringify(focusModel.timelineActiveIds),
          selectedId ?? undefined,
          timelineScopeSelect.value,
        ),
      ),
    );
  }

  function renderHighlightStack() {
    const ids = currentFocusModel().highlightIds;
    highlightStack.innerHTML = "";

    if (!ids.length) {
      highlightStack.innerHTML = `<div class="empty-state">No active highlights.</div>`;
      return;
    }

    ids.forEach((id, index) => {
      const item = document.createElement("div");
      item.className = `highlight-chip${id === selectedId ? " is-primary" : ""}`;
      const result =
        currentSearchResults.find((entry) => entry.id === id) ??
        scene?.vertices?.find((entry) => entry.id === id);
      const label = result?.label ?? id;
      item.innerHTML = `
        <span class="highlight-swatch swatch-${index % 4}"></span>
        <strong>${escapeHtml(label)}</strong>
        <button type="button">${id === selectedId ? "Primary" : "Remove"}</button>
      `;

      const button = item.querySelector("button");
      if (id === selectedId) {
        button.disabled = true;
      } else {
        button.addEventListener("click", () => {
          pinnedHighlightIds = pinnedHighlightIds.filter((candidate) => candidate !== id);
          syncSelection();
        });
      }

      highlightStack.append(item);
    });
  }

  function syncSelection() {
    syncSurfaceState();
    if (!engine) {
      return;
    }

    if (!selectedId) {
      renderer.setInteraction(null);
      renderer.setHighlightSummary(null);
      renderer.setBringAndSlide({ left: null, right: null });
      syncFocusModel();
      renderer.setIsolation(isolateToggle.checked, Number(depthInput.value));
      syncTimeline();
      if (timelineFocus) {
        renderTimelineFocusDetails(timelineFocus);
      } else {
        renderEmptyDetails();
      }
      renderHighlightStack();
      refreshSearch();
      return;
    }

    try {
      const interaction = JSON.parse(engine.interaction_json(selectedId, modeSelect.value));
      const highlightIds = [...new Set([selectedId, ...pinnedHighlightIds].filter(Boolean))];
      const highlightSummary = JSON.parse(
        engine.highlight_summary_json(JSON.stringify(highlightIds), modeSelect.value),
      );
      const details = JSON.parse(engine.vertex_details_json(selectedId));
      const bringAndSlide =
        details.kind === "person"
          ? {
              left: JSON.parse(engine.bring_and_slide_json(selectedId, "left")),
              right: JSON.parse(engine.bring_and_slide_json(selectedId, "right")),
            }
          : { left: null, right: null };
      renderer.setInteraction(interaction);
      renderer.setHighlightSummary(highlightSummary);
      renderer.setBringAndSlide(bringAndSlide);
      syncFocusModel();
      renderer.setIsolation(isolateToggle.checked, Number(depthInput.value));
      syncTimeline();
      renderDetails(details, interaction);
      renderHighlightStack();
      refreshSearch();
      syncSurfaceState();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      detailSummary.innerHTML = `<div class="error-card">${escapeHtml(message)}</div>`;
      detailRelations.innerHTML = "";
      detailProperties.innerHTML = "";
      highlightStack.innerHTML = "";
      renderTimeline(null);
      renderer.setBringAndSlide({ left: null, right: null });
    }
  }

  function scheduleFitView() {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => renderer.fit());
    });
  }

  function analyze({ fitAfterReveal = false } = {}) {
    try {
      activeRanker = rankerSelect.value;
      engine = wasm.GeneaQuiltEngine.with_ranker(textarea.value, activeRanker);
      scene = JSON.parse(engine.scene_json());
      layersPill.textContent = `${scene.summary.layers} generations`;
      countsPill.textContent =
        `${scene.vertices.length} items · ${scene.edges.length} links`;
      isBuildingScene = true;
      try {
        renderer.setScene(scene);
      } finally {
        isBuildingScene = false;
      }

      selectedId = null;
      pinnedHighlightIds = [];
      timelineFocus = null;
      visibleVertexIds = [];
      syncFocusModel();
      refreshSearch();
      syncSelection();
      syncSurfaceState();
      if (fitAfterReveal) {
        scheduleFitView();
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      detailSummary.innerHTML = `<div class="error-card">${escapeHtml(message)}</div>`;
      detailRelations.innerHTML = "";
      detailProperties.innerHTML = "";
      searchResults.innerHTML = `<div class="error-card">${escapeHtml(message)}</div>`;
      renderTimeline(null);
      syncSurfaceState();
    }
  }

  function loadDefaultGedcom() {
    sourceLabel = "demo-tree";
    textarea.value = sampleGedcom;
    analyze({ fitAfterReveal: shouldFitAfterSourceLoad("sample") });
  }

  function timelineYearAtOffset(offsetX) {
    if (!timeline || !timeline.bins?.length) {
      return null;
    }

    const rect = timelineCanvas.getBoundingClientRect();
    if (!rect.width) {
      return timeline.start_year;
    }

    const ratio = clamp01(offsetX / rect.width);
    const span = timeline.end_year - timeline.start_year + 1;
    return timeline.start_year + Math.min(span - 1, Math.floor(ratio * span));
  }

  function applyTimelineFocus(startYear, endYear, fit = false) {
    if (!engine) {
      return;
    }

    const normalizedStart = Math.min(startYear, endYear);
    const normalizedEnd = Math.max(startYear, endYear);
    timelineFocus = JSON.parse(
      engine.timeline_focus_json(normalizedStart, normalizedEnd, timelineScopeSelect.value),
    );
    syncFocusModel();
    if (fit && timelineFocus.vertex_ids.length) {
      renderer.fitToVertexIds(timelineFocus.vertex_ids, { animated: true });
    }
    syncSelection();
  }

  function clearTimelineFocus() {
    timelineFocus = null;
    syncFocusModel();
    syncSelection();
  }

  function applyRotation(value, fit = false) {
    const normalized = clamp(Number(value), -90, 90);
    rotationInput.value = String(normalized);
    rotationValue.textContent = formatAngleLabel(normalized);
    renderer.setRotationDegrees(normalized);
    if (fit && scene) {
      renderer.fit({ animated: true });
    }
  }

  function exportDocumentTitle() {
    return `${sourceLabel || "geneaquilt"} snapshot`;
  }

  function exportFileStem() {
    return sanitizeFileName(`${sourceLabel || "geneaquilt"}-snapshot`);
  }

  function downloadTextFile(fileName, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = fileName;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function openHtmlDocument(content) {
    const blob = new Blob([content], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const opened = window.open(url, "_blank", "noopener,noreferrer");
    if (!opened) {
      downloadTextFile(`${exportFileStem()}.html`, content, "text/html;charset=utf-8");
    }
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }

  function exportInteractiveSnapshot(autoPrint = false) {
    if (!scene) {
      return;
    }
    const html = renderer.exportInteractiveHtml({
      title: exportDocumentTitle(),
      autoPrint,
    });
    if (!html) {
      return;
    }
    if (autoPrint) {
      openHtmlDocument(html);
      return;
    }
    downloadTextFile(`${exportFileStem()}.html`, html, "text/html;charset=utf-8");
  }

  loadDefaultButton.addEventListener("click", loadDefaultGedcom);
  analyzeButton.addEventListener("click", analyze);
  rankerSelect.addEventListener("change", () => {
    if (!textarea.value.trim()) {
      activeRanker = rankerSelect.value;
      return;
    }
    analyze();
  });
  sourceToggle.addEventListener("click", () => {
    setSourceExpanded(sourceBody.hidden);
  });
  fitButton.addEventListener("click", () => renderer.fit({ animated: true }));
  zoomInButton.addEventListener("click", () => renderer.zoomBy(1.1));
  zoomOutButton.addEventListener("click", () => renderer.zoomBy(0.9));
  expandButton.addEventListener("click", () => {
    namesExpanded = !namesExpanded;
    renderer.setExpandedNames(namesExpanded);
    expandButton.innerHTML = `${iconSvg("text")}${namesExpanded ? "Compact names" : "Expand names"}`;
  });
  searchInput.addEventListener("input", refreshSearch);
  searchScopeSelect.addEventListener("change", refreshSearch);
  modeSelect.addEventListener("change", syncSelection);
  pinHighlightButton.addEventListener("click", () => {
    if (!selectedId || pinnedHighlightIds.includes(selectedId)) {
      return;
    }
    pinnedHighlightIds = [...pinnedHighlightIds, selectedId];
    syncSelection();
  });
  clearHighlightsButton.addEventListener("click", () => {
    selectedId = null;
    pinnedHighlightIds = [];
    timelineFocus = null;
    syncFocusModel();
    syncSelection();
  });
  timelineClearButton.addEventListener("click", clearTimelineFocus);
  timelineScopeSelect.addEventListener("change", () => {
    if (timelineFocus) {
      applyTimelineFocus(timelineFocus.start_year, timelineFocus.end_year, false);
      return;
    }
    syncSelection();
  });
  isolateToggle.addEventListener("change", () => {
    renderer.setIsolation(isolateToggle.checked, Number(depthInput.value));
    renderer.render();
  });
  depthInput.addEventListener("input", () => {
    depthValue.textContent = depthInput.value;
    renderer.setIsolation(isolateToggle.checked, Number(depthInput.value));
  });
  zoomSpeedInput.addEventListener("input", () => {
    const value = Number(zoomSpeedInput.value);
    zoomSpeedValue.textContent = sliderValueToZoomLabel(value);
    renderer.setZoomSpeed(sliderValueToZoomSpeed(value));
  });
  rotationInput.addEventListener("input", () => {
    applyRotation(Number(rotationInput.value));
  });
  rotatePresetButton.addEventListener("click", () => {
    applyRotation(-15, true);
  });
  rotationResetButton.addEventListener("click", () => {
    applyRotation(0, true);
  });
  exportHtmlButton.addEventListener("click", () => {
    exportInteractiveSnapshot(false);
  });
  printExportButton.addEventListener("click", () => {
    exportInteractiveSnapshot(true);
  });
  themeToggleButton.addEventListener("click", () => {
    applyTheme(theme === "dark" ? "light" : "dark");
  });
  fileInput.addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    sourceLabel = file.name.replace(/\.[^.]+$/, "") || "geneaquilt";
    textarea.value = await file.text();
    analyze();
  });

  let timelineBrush = null;
  timelineCanvas.addEventListener("pointerdown", (event) => {
    const year = timelineYearAtOffset(event.offsetX);
    if (year == null) {
      return;
    }
    timelineCanvas.setPointerCapture(event.pointerId);
    timelineBrush = {
      anchorYear: year,
      moved: false,
    };
    applyTimelineFocus(year, year, false);
  });
  timelineCanvas.addEventListener("pointermove", (event) => {
    if (!timelineBrush) {
      return;
    }
    const year = timelineYearAtOffset(event.offsetX);
    if (year == null) {
      return;
    }
    timelineBrush.moved = timelineBrush.moved || year !== timelineBrush.anchorYear;
    applyTimelineFocus(timelineBrush.anchorYear, year, false);
  });
  timelineCanvas.addEventListener("pointerup", (event) => {
    if (!timelineBrush) {
      return;
    }
    timelineCanvas.releasePointerCapture(event.pointerId);
    const year = timelineYearAtOffset(event.offsetX);
    const endYear = year ?? timelineBrush.anchorYear;
    applyTimelineFocus(
      timelineBrush.anchorYear,
      endYear,
      timelineActionSelect.value === "fit",
    );
    timelineBrush = null;
  });
  timelineCanvas.addEventListener("pointercancel", () => {
    timelineBrush = null;
  });

  renderIdleSearchState();
  renderEmptyDetails();
  renderHighlightStack();
  renderTimeline(null);
  applyTheme(theme);
  applyRotation(0);
  syncSurfaceState();
  return page;
}

function iconSvg(name) {
  const paths = {
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/>',
    moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/>',
    "folder-open": '<path d="m6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6A2 2 0 0 1 18.46 20H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2A2 2 0 0 0 12.09 6H18a2 2 0 0 1 2 2v2"/>',
    sparkles: '<path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/>',
    maximize: '<path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>',
    "zoom-in": '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/><path d="M11 8v6"/><path d="M8 11h6"/>',
    "zoom-out": '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/><path d="M8 11h6"/>',
    text: '<path d="M15 18H3"/><path d="M17 6H3"/><path d="M21 12H3"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/>',
    printer: '<path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><path d="M6 9V3h12v6"/><rect x="6" y="14" width="12" height="8" rx="1"/>',
    pin: '<path d="M12 17v5"/><path d="M9 10.76 5.24 7 7 5.24 10.76 9"/><path d="M14 3l7 7-5 5-7-7z"/>',
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  };
  return `<svg class="icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths[name] ?? ""}</svg>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function sliderValueToZoomSpeed(value) {
  const ratio = clamp01(value / 100);
  return 0.00015 * Math.pow(2, ratio * 7.2);
}

function sliderValueToZoomLabel(value) {
  if (value <= 12) {
    return "Very slow";
  }
  if (value <= 28) {
    return "Precise";
  }
  if (value >= 88) {
    return "Very fast";
  }
  if (value >= 55) {
    return "Fast";
  }
  return "Balanced";
}

function formatAngleLabel(value) {
  const rounded = Math.round(value);
  if (rounded === 0) {
    return "0°";
  }
  return rounded > 0 ? `+${rounded}°` : `${rounded}°`;
}

function sanitizeFileName(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "geneaquilt";
}

function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getInitialTheme() {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  if (stored === "light" || stored === "dark") {
    return stored;
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function timelinePalette(theme) {
  if (theme === "dark") {
    return {
      background: "rgba(17, 24, 22, 0.98)",
      totalBar: "rgba(148, 163, 156, 0.28)",
      familyBar: "rgba(242, 184, 74, 0.42)",
      activeBar: "rgba(255, 122, 95, 0.9)",
      focusFill: "rgba(20, 184, 166, 0.16)",
      focusStroke: "rgba(45, 212, 191, 0.9)",
      selectionFill: "rgba(20, 184, 166, 0.18)",
      axis: "rgba(226, 232, 228, 0.2)",
      label: "rgba(226, 232, 228, 0.92)",
    };
  }

  return {
    background: "rgba(250, 251, 248, 0.98)",
    totalBar: "rgba(82, 96, 88, 0.2)",
    familyBar: "rgba(196, 127, 16, 0.28)",
    activeBar: "rgba(213, 82, 55, 0.82)",
    focusFill: "rgba(0, 137, 123, 0.14)",
    focusStroke: "rgba(0, 137, 123, 0.95)",
    selectionFill: "rgba(0, 137, 123, 0.15)",
    axis: "rgba(23, 32, 29, 0.16)",
    label: "rgba(82, 96, 88, 0.94)",
  };
}
