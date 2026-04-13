import { loadEngineModule } from "./engine.js";
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

export async function createApp() {
  const wasm = await loadEngineModule();
  const status = JSON.parse(wasm.engine_status_json());
  const page = document.createElement("main");
  page.className = "page";

  page.innerHTML = `
    <section class="hero">
      <div class="eyebrow">GeneaQuilt for the web</div>
      <div class="hero-grid">
        <div>
          <h1>GEDCOM in, quilt out.</h1>
          <p class="lede">
            This version keeps the genealogy engine in Rust and renders the quilt directly in the browser.
            It already supports file import, zooming, panning, selection, tracing, search, and DOI-based isolation.
          </p>
        </div>
        <div class="hero-card">
          <div class="hero-stat"><span>Parser</span><strong>${status.parser_ready ? "ready" : "offline"}</strong></div>
          <div class="hero-stat"><span>Layout</span><strong>${status.layout_ready ? "ready" : "offline"}</strong></div>
          <div class="hero-stat"><span>Target</span><strong>${status.website_target ? "browser" : "unknown"}</strong></div>
        </div>
      </div>
    </section>
    <section class="studio">
      <section class="source-panel panel">
        <div class="panel-header">
          <div>
            <div class="kicker">Source</div>
            <h2>Controls</h2>
          </div>
          <label class="button button-file">
            <input type="file" accept=".ged,.gedcom,.txt" />
            <span>Load file</span>
          </label>
        </div>
        <button class="source-toggle" type="button" aria-expanded="false">
          <span>GEDCOM input</span>
          <strong>Expand</strong>
        </button>
        <div class="source-body" hidden>
          <textarea spellcheck="false"></textarea>
        </div>
        <div class="row-actions">
          <button class="button load-default-button" type="button">
            <span>Load default GEDCOM</span>
            <strong>Built-in demo tree</strong>
          </button>
          <button class="button button-primary analyze-button">Build quilt</button>
          <button class="button fit-button" type="button">Fit view</button>
          <button class="button zoom-in-button" type="button">Zoom in</button>
          <button class="button zoom-out-button" type="button">Zoom out</button>
          <button class="button expand-button" type="button">Expand names</button>
        </div>
        <section class="matches-panel">
          <div class="search-results-title">Matches</div>
          <div class="search-results"></div>
        </section>
      </section>
      <section class="stage-panel panel">
        <div class="panel-header">
          <div>
            <div class="kicker">Canvas</div>
            <h2>Interactive quilt</h2>
          </div>
          <div class="stage-meta">
            <span class="pill layers-pill">0 layers</span>
            <span class="pill counts-pill">0 vertices</span>
          </div>
        </div>
        <div class="toolbar">
          <label class="field search-field">
            <span>Search</span>
            <input class="search-input" type="search" placeholder="Search names, dates, or attributes" />
            <small class="field-note">Dates are searchable by year or GEDCOM date text in All fields or Attributes.</small>
          </label>
          <label class="field">
            <span>Search scope</span>
            <select class="search-scope-select">
              <option value="all">All fields</option>
              <option value="names">Names</option>
              <option value="attributes">Attributes</option>
              <option value="ids">IDs</option>
            </select>
          </label>
          <label class="field">
            <span>Highlight mode</span>
            <select class="mode-select">
              <option value="all">All</option>
              <option value="predecessors">Predecessors</option>
              <option value="successors">Successors</option>
              <option value="none">None</option>
            </select>
          </label>
          <label class="toggle">
            <input class="isolate-toggle" type="checkbox" />
            <span>Isolate around selection</span>
          </label>
          <label class="field slider-field">
            <span>Isolation depth</span>
            <input class="depth-input" type="range" min="0" max="8" step="1" value="3" />
            <strong class="depth-value">3</strong>
          </label>
          <label class="field slider-field">
            <span>Zoom speed</span>
            <input class="zoom-speed-input" type="range" min="0" max="100" step="1" value="100" />
            <strong class="zoom-speed-value">Very fast</strong>
          </label>
          <label class="field slider-field">
            <span>Graph angle</span>
            <input class="rotation-input" type="range" min="-90" max="90" step="1" value="0" />
            <strong class="rotation-value">0°</strong>
          </label>
          <div class="toolbar-actions">
            <button class="button rotate-preset-button" type="button">Rotate -15°</button>
            <button class="button rotation-reset-button" type="button">Reset angle</button>
            <button class="button export-html-button" type="button">Export interactive file</button>
            <button class="button print-export-button" type="button">Print / PDF</button>
          </div>
        </div>
        <section class="timeline-panel">
          <div class="timeline-header">
            <div class="timeline-title">Timeline</div>
            <div class="timeline-header-actions">
              <div class="timeline-summary">No dated vertices</div>
              <button class="button timeline-clear-button" type="button" hidden>Clear range</button>
            </div>
          </div>
          <div class="timeline-controls">
            <label class="field">
              <span>Timeline scope</span>
              <select class="timeline-scope-select">
                <option value="all">All dated</option>
                <option value="people">People only</option>
                <option value="families">Families only</option>
              </select>
            </label>
            <label class="field">
              <span>On release</span>
              <select class="timeline-action-select">
                <option value="fit">Spotlight</option>
                <option value="dim">Highlight</option>
              </select>
            </label>
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
            <h2>Vertex details</h2>
          </div>
          <div class="detail-actions">
            <button class="button pin-highlight-button" type="button">Pin highlight</button>
            <button class="button clear-highlights-button" type="button">Clear focus</button>
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
  const loadDefaultButton = page.querySelector(".load-default-button");
  const analyzeButton = page.querySelector(".analyze-button");
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
  const layersPill = page.querySelector(".layers-pill");
  const countsPill = page.querySelector(".counts-pill");
  const timelineSummary = page.querySelector(".timeline-summary");
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
  let sourceLabel = "demo-tree";

  const renderer = new QuiltRenderer(canvas, {
    minimapCanvas,
    onSelect: (id) => {
      if (selectedId !== id) {
        selectedId = id;
        syncSelection();
      }
    },
  });
  renderer.setZoomSpeed(sliderValueToZoomSpeed(Number(zoomSpeedInput.value)));
  zoomSpeedValue.textContent = sliderValueToZoomLabel(Number(zoomSpeedInput.value));
  expandButton.textContent = "Compact names";

  function setSourceExpanded(expanded) {
    sourceBody.hidden = !expanded;
    sourceToggle.setAttribute("aria-expanded", String(expanded));
    sourceToggle.querySelector("strong").textContent = expanded ? "Collapse" : "Expand";
  }

  setSourceExpanded(false);

  function renderSearchResults(results) {
    currentSearchResults = results;
    renderer.setSearchMatches(
      searchInput.value.trim() ? results.map((result) => result.id) : [],
    );
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
    renderer.setSearchMatches([]);
    searchResults.innerHTML = `<div class="empty-state">Load a GEDCOM to search and inspect the quilt.</div>`;
  }

  function refreshSearch() {
    if (!engine) {
      renderSearchResults([]);
      return;
    }

    const results = JSON.parse(engine.search_json(searchInput.value, searchScopeSelect.value));
    renderSearchResults(results);
  }

  function renderDetails(details, interaction) {
    detailSummary.innerHTML = `
      <div class="detail-card">
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
          <div><span>DOI reach</span><strong>${interaction.max_distance}</strong></div>
        </div>
      </div>
    `;

    detailRelations.innerHTML = `
      <div class="relation-block">
        <h3>Trace</h3>
        <p>${interaction.highlighted_vertices.length} highlighted vertices, ${interaction.highlighted_edges.length} highlighted edges.</p>
      </div>
      <div class="relation-block">
        <h3>Bring and slide</h3>
        <p>${
          details.kind === "person"
            ? "Drag left from the selected person to navigate to parents and siblings, or drag right to navigate to spouses and children."
            : "Select a person to use bring-and-slide navigation."
        }</p>
      </div>
      <div class="relation-block">
        <h3>Parents</h3>
        <p>${details.parents.length ? details.parents.map(escapeHtml).join(", ") : "None"}</p>
      </div>
      <div class="relation-block">
        <h3>Spouses</h3>
        <p>${details.spouses.length ? details.spouses.map(escapeHtml).join(", ") : "None"}</p>
      </div>
      <div class="relation-block">
        <h3>Children</h3>
        <p>${details.children.length ? details.children.map(escapeHtml).join(", ") : "None"}</p>
      </div>
      <div class="relation-block relation-block-subtle">
        <h3>Graph links</h3>
        <p>${
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
                  ? `predecessors: ${details.predecessors.map(escapeHtml).join(", ")}`
                  : null,
                details.successors.length
                  ? `successors: ${details.successors.map(escapeHtml).join(", ")}`
                  : null,
              ]
                .filter(Boolean)
                .join(" · ") || "None"
        }</p>
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
          : "All dated";
    detailSummary.innerHTML = `
      <div class="detail-card">
        <div class="detail-heading">
          <div>
            <div class="detail-id">Timeline focus</div>
            <h3>${focus.start_year}-${focus.end_year}</h3>
          </div>
          <span class="kind-pill">date range</span>
        </div>
        <div class="detail-grid">
          <div><span>Dated vertices</span><strong>${focus.matching_vertices_with_dates}</strong></div>
          <div><span>People</span><strong>${focus.matching_people}</strong></div>
          <div><span>Families</span><strong>${focus.matching_families}</strong></div>
          <div><span>Scope</span><strong>${scopeLabel}</strong></div>
        </div>
      </div>
    `;

    detailRelations.innerHTML = `
      <div class="relation-block">
        <h3>Range filter</h3>
        <p>${focus.matching_vertices_with_dates ? "Timeline focus is active across the quilt." : "No dated vertices fall inside this year range."}</p>
      </div>
      <div class="relation-block">
        <h3>Interaction</h3>
        <p>Drag across the timeline to brush a wider range, then click a node inside it to combine date focus with tracing.</p>
      </div>
    `;

    detailProperties.innerHTML =
      `<div class="empty-state">Clear the timeline range or select a node to inspect detailed properties.</div>`;
  }

  function renderTimeline(summary) {
    timeline = summary;
    if (!summary || !summary.bins?.length) {
      timelineSummary.textContent = "No dated vertices";
      timelineClearButton.hidden = true;
      return;
    }

    const activeText = summary.active_range
      ? `active ${summary.active_range[0]}-${summary.active_range[1]}`
      : "no active date focus";
    const scopeText =
      summary.scope === "people"
        ? "people"
        : summary.scope === "families"
          ? "families"
          : "all dated";
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

    ctx.fillStyle = "rgba(255, 252, 247, 0.94)";
    ctx.fillRect(0, 0, width, height);

    for (let index = 0; index < summary.bins.length; index += 1) {
      const bin = summary.bins[index];
      const x = index * barWidth;
      const totalHeight = (bin.total / maxTotal) * chartHeight;
      const activeHeight = (bin.active_total / maxTotal) * chartHeight;

      ctx.fillStyle = "rgba(122, 111, 89, 0.22)";
      ctx.fillRect(x, chartTop + chartHeight - totalHeight, Math.max(1, barWidth - 1), totalHeight);

      if (bin.families > 0) {
        ctx.fillStyle = "rgba(11, 110, 116, 0.18)";
        ctx.fillRect(
          x,
          chartTop + chartHeight - (bin.families / maxTotal) * chartHeight,
          Math.max(1, barWidth - 1),
          (bin.families / maxTotal) * chartHeight,
        );
      }

      if (bin.active_total > 0) {
        ctx.fillStyle = "rgba(215, 59, 38, 0.72)";
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
      ctx.fillStyle = "rgba(53, 85, 250, 0.12)";
      ctx.fillRect(startX, chartTop, Math.max(2, endX - startX), chartHeight);
      ctx.strokeStyle = "rgba(53, 85, 250, 0.92)";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(startX + 0.75, chartTop + 0.75, Math.max(0.5, endX - startX - 1.5), chartHeight - 1.5);
    }

    if (summary.selected_range) {
      const [startYear, endYear] = summary.selected_range;
      const totalYears = summary.end_year - summary.start_year + 1;
      const startX = ((startYear - summary.start_year) / totalYears) * width;
      const endX = ((endYear - summary.start_year + 1) / totalYears) * width;
      ctx.fillStyle = "rgba(53, 85, 250, 0.14)";
      ctx.fillRect(startX, chartTop, Math.max(2, endX - startX), chartHeight);
    }

    ctx.strokeStyle = "rgba(29, 37, 45, 0.16)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, chartTop + chartHeight + 0.5);
    ctx.lineTo(width, chartTop + chartHeight + 0.5);
    ctx.stroke();

    ctx.fillStyle = "rgba(95, 104, 95, 0.94)";
    ctx.font = '11px Georgia, "Times New Roman", serif';
    ctx.textBaseline = "bottom";
    ctx.fillText(String(summary.start_year), 0, height - 2);
    const endLabel = String(summary.end_year);
    const endWidth = ctx.measureText(endLabel).width;
    ctx.fillText(endLabel, width - endWidth, height - 2);
  }

  function renderHighlightStack() {
    const ids = [...new Set([selectedId, ...pinnedHighlightIds].filter(Boolean))];
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
    if (!engine) {
      return;
    }

    if (!selectedId) {
      renderer.setInteraction(null);
      renderer.setHighlightSummary(null);
      renderer.setBringAndSlide({ left: null, right: null });
      renderer.setTimelineFocus(timelineFocus);
      renderer.setIsolation(isolateToggle.checked, Number(depthInput.value));
      renderTimeline(JSON.parse(engine.timeline_json(JSON.stringify([]), null, timelineScopeSelect.value)));
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
      const timelineSummaryValue = JSON.parse(
        engine.timeline_json(JSON.stringify(highlightIds), selectedId, timelineScopeSelect.value),
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
      renderer.setTimelineFocus(timelineFocus);
      renderer.setIsolation(isolateToggle.checked, Number(depthInput.value));
      renderTimeline(timelineSummaryValue);
      renderDetails(details, interaction);
      renderHighlightStack();
      refreshSearch();
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

  function analyze() {
    try {
      engine = new wasm.GeneaQuiltEngine(textarea.value);
      scene = JSON.parse(engine.scene_json());
      renderer.setScene(scene);
      layersPill.textContent = `${scene.summary.layers} layers`;
      countsPill.textContent = `${scene.vertices.length} vertices · ${scene.edges.length} edges`;

      selectedId = null;
      pinnedHighlightIds = [];
      timelineFocus = null;
      renderer.setTimelineFocus(null);
      refreshSearch();
      syncSelection();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      detailSummary.innerHTML = `<div class="error-card">${escapeHtml(message)}</div>`;
      detailRelations.innerHTML = "";
      detailProperties.innerHTML = "";
      searchResults.innerHTML = "";
      renderTimeline(null);
    }
  }

  function loadDefaultGedcom() {
    sourceLabel = "demo-tree";
    textarea.value = sampleGedcom;
    analyze();
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
    renderer.setTimelineFocus(timelineFocus);
    if (fit && timelineFocus.vertex_ids.length) {
      renderer.fitToVertexIds(timelineFocus.vertex_ids);
    }
    syncSelection();
  }

  function clearTimelineFocus() {
    timelineFocus = null;
    renderer.setTimelineFocus(null);
    syncSelection();
  }

  function applyRotation(value, fit = false) {
    const normalized = clamp(Number(value), -90, 90);
    rotationInput.value = String(normalized);
    rotationValue.textContent = formatAngleLabel(normalized);
    renderer.setRotationDegrees(normalized);
    if (fit && scene) {
      renderer.fit();
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
  sourceToggle.addEventListener("click", () => {
    setSourceExpanded(sourceBody.hidden);
  });
  fitButton.addEventListener("click", () => renderer.fit());
  zoomInButton.addEventListener("click", () => renderer.zoomBy(1.1));
  zoomOutButton.addEventListener("click", () => renderer.zoomBy(0.9));
  expandButton.addEventListener("click", () => {
    namesExpanded = !namesExpanded;
    renderer.setExpandedNames(namesExpanded);
    expandButton.textContent = namesExpanded ? "Compact names" : "Expand names";
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
    renderer.setTimelineFocus(null);
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
  applyRotation(0);
  return page;
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
