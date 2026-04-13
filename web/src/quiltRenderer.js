const CELL_SIZE = 14;
const INDI_LINE_SPACING = 0.85;
const X_PAD = 10;
const Y_PAD = 10;
const PERSON_FONT = '12px Georgia, "Times New Roman", serif';
const FAMILY_FONT = '10px Georgia, "Times New Roman", serif';
const MIN_SCALE = 0.05;
const MAX_SCALE = 7;
const LAYOUT_ORIGIN_X = 16;
const LAYOUT_ORIGIN_Y = 10;
const FIT_PADDING_X = 24;
const FIT_PADDING_Y = 28;
const SMALL_TEXT_THRESHOLD = 0.42;
const FAMILY_TEXT_THRESHOLD = 0.72;
const WHEEL_PAN_SPEED = 0.55;
const DEFAULT_WHEEL_ZOOM_SPEED = 0.00115;
const MINIMAP_PADDING = 10;
const SLIDE_DISTANCE = 88;
const SLIDE_COMMIT_THRESHOLD = 0.98;
const HIGHLIGHT_COLORS = ["#d73b26", "#0b6e74", "#3555fa", "#9a5d16"];
const FAMILY_BASE_FILL = "rgba(248, 245, 235, 0.98)";
const FAMILY_BASE_STROKE = "rgba(124, 111, 83, 0.92)";
const FAMILY_BASE_TEXT = "#2a261f";

export class QuiltRenderer {
  constructor(canvas, { minimapCanvas = null, onSelect = null } = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.minimapCanvas = minimapCanvas;
    this.minimapCtx = minimapCanvas?.getContext("2d") ?? null;
    this.measureCanvas = document.createElement("canvas");
    this.measureCtx = this.measureCanvas.getContext("2d");
    this.onSelect = onSelect;
    this.scene = null;
    this.geometry = null;
    this.vertexById = new Map();
    this.vertexRects = [];
    this.interaction = null;
    this.highlightedVertices = new Set();
    this.highlightedEdges = new Set();
    this.connectorHighlights = new Map();
    this.highlightSummary = null;
    this.highlightVertexColors = new Map();
    this.highlightEdgeColors = new Map();
    this.highlightConnectorColors = new Map();
    this.doiById = new Map();
    this.searchMatches = new Set();
    this.timelineFocusIds = new Set();
    this.timelineFocusRange = null;
    this.selectedId = null;
    this.isolateEnabled = false;
    this.isolateDepth = 3;
    this.expandedNames = true;
    this.zoomSpeed = DEFAULT_WHEEL_ZOOM_SPEED;
    this.scale = 1;
    this.offsetX = 0;
    this.offsetY = 0;
    this.dragging = false;
    this.minimapDragging = false;
    this.potentialSlide = null;
    this.slideState = null;
    this.bringAndSlide = { left: null, right: null };
    this.pointerDown = null;
    this.lastPointer = null;
    this.minimapTransform = null;
    this.resizeObserver = new ResizeObserver(() => {
      this.resize();
      this.render();
    });
    this.resizeObserver.observe(canvas);
    this.bindEvents();
    this.bindMinimapEvents();
    this.resize();
  }

  bindEvents() {
    this.canvas.addEventListener("pointerdown", (event) => {
      this.canvas.setPointerCapture(event.pointerId);
      this.dragging = true;
      this.pointerDown = { x: event.clientX, y: event.clientY };
      this.lastPointer = { x: event.clientX, y: event.clientY };
      const hit = this.hitTest(event.offsetX, event.offsetY);
      if (hit && hit.id === this.selectedId && hit.kind === "person") {
        this.potentialSlide = hit.id;
      } else {
        this.potentialSlide = null;
      }
    });

    this.canvas.addEventListener("pointermove", (event) => {
      if (!this.dragging || !this.lastPointer) {
        return;
      }

      if (this.slideState) {
        this.updateSlide(event.offsetX, event.offsetY);
        this.lastPointer = { x: event.clientX, y: event.clientY };
        return;
      }

      if (this.potentialSlide === this.selectedId) {
        const focus = this.vertexById.get(this.selectedId);
        const pointer = this.screenToWorld(event.offsetX, event.offsetY);
        if (
          focus &&
          pointer.x < focus.x &&
          this.bringAndSlide.left?.candidates?.length
        ) {
          this.startSlide("left");
          this.updateSlide(event.offsetX, event.offsetY);
          this.lastPointer = { x: event.clientX, y: event.clientY };
          return;
        }
        if (
          focus &&
          pointer.x > focus.x + focus.width &&
          this.bringAndSlide.right?.candidates?.length
        ) {
          this.startSlide("right");
          this.updateSlide(event.offsetX, event.offsetY);
          this.lastPointer = { x: event.clientX, y: event.clientY };
          return;
        }
      }

      if (this.potentialSlide === this.selectedId) {
        this.lastPointer = { x: event.clientX, y: event.clientY };
        return;
      }

      this.offsetX += event.clientX - this.lastPointer.x;
      this.offsetY += event.clientY - this.lastPointer.y;
      this.lastPointer = { x: event.clientX, y: event.clientY };
      this.render();
    });

    this.canvas.addEventListener("pointerup", (event) => {
      this.canvas.releasePointerCapture(event.pointerId);
      const start = this.pointerDown;
      const moved =
        start &&
        Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5;

      if (this.slideState) {
        const destinationId =
          this.slideState.progress >= SLIDE_COMMIT_THRESHOLD
            ? this.slideState.destinationId
            : null;
        const shouldRestore = !destinationId;
        this.finishSlide(shouldRestore);
        if (destinationId) {
          this.onSelect?.(destinationId);
        }
        this.dragging = false;
        this.pointerDown = null;
        this.lastPointer = null;
        this.potentialSlide = null;
        return;
      }

      if (!moved) {
        const hit = this.hitTest(event.offsetX, event.offsetY);
        if (hit) {
          this.onSelect?.(hit.id);
        }
      }

      this.dragging = false;
      this.pointerDown = null;
      this.lastPointer = null;
      this.potentialSlide = null;
    });

    this.canvas.addEventListener("wheel", (event) => {
      event.preventDefault();
      if (event.ctrlKey || event.metaKey) {
        const normalizedDelta = normalizeWheelDelta(event);
        const multiplier = Math.exp(-normalizedDelta * this.zoomSpeed);
        this.zoomAt(event.offsetX, event.offsetY, multiplier);
        return;
      }

      const deltaScale = event.deltaMode === WheelEvent.DOM_DELTA_LINE ? 14 : 1;
      this.panBy(
        -event.deltaX * deltaScale * WHEEL_PAN_SPEED,
        -event.deltaY * deltaScale * WHEEL_PAN_SPEED,
      );
    });
  }

  bindMinimapEvents() {
    if (!this.minimapCanvas) {
      return;
    }

    this.minimapCanvas.addEventListener("pointerdown", (event) => {
      this.minimapCanvas.setPointerCapture(event.pointerId);
      this.minimapDragging = true;
      this.panMinimapToPointer(event);
    });

    this.minimapCanvas.addEventListener("pointermove", (event) => {
      if (!this.minimapDragging) {
        return;
      }
      this.panMinimapToPointer(event);
    });

    this.minimapCanvas.addEventListener("pointerup", (event) => {
      this.minimapCanvas.releasePointerCapture(event.pointerId);
      this.minimapDragging = false;
    });
  }

  resize() {
    const rect = this.canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, Math.round(rect.width * dpr));
    this.canvas.height = Math.max(1, Math.round(rect.height * dpr));
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(dpr, dpr);
    this.width = rect.width;
    this.height = rect.height;

    if (this.minimapCanvas && this.minimapCtx) {
      const minimapRect = this.minimapCanvas.getBoundingClientRect();
      this.minimapCanvas.width = Math.max(1, Math.round(minimapRect.width * dpr));
      this.minimapCanvas.height = Math.max(1, Math.round(minimapRect.height * dpr));
      this.minimapCtx.setTransform(1, 0, 0, 1, 0, 0);
      this.minimapCtx.scale(dpr, dpr);
      this.minimapWidth = minimapRect.width;
      this.minimapHeight = minimapRect.height;
    }
  }

  setScene(scene) {
    this.scene = scene;
    this.geometry = buildGeometry(scene, this.measureCtx);
    this.vertexById = new Map(this.geometry.vertices.map((vertex) => [vertex.id, vertex]));
    this.vertexRects = this.geometry.vertices;
    this.fit();
  }

  setInteraction(interaction) {
    this.interaction = interaction;
    this.selectedId = interaction?.selected_id ?? null;
    this.highlightedVertices = new Set(interaction?.highlighted_vertices ?? []);
    this.highlightedEdges = new Set(interaction?.highlighted_edges ?? []);
    this.connectorHighlights = new Map(
      (interaction?.connector_highlights ?? []).map((connector) => [connector.edge_index, connector]),
    );
    this.doiById = new Map(interaction?.doi ?? []);
    this.render();
  }

  setHighlightSummary(summary) {
    this.highlightSummary = summary;
    this.highlightVertexColors = new Map(
      (summary?.merged_vertices ?? []).map((vertex) => [vertex.id, vertex.color_indices]),
    );
    this.highlightEdgeColors = new Map(
      (summary?.merged_edges ?? []).map((edge) => [edge.edge_index, edge.color_indices]),
    );
    this.highlightConnectorColors = new Map(
      (summary?.merged_connectors ?? []).map((connector) => [connector.edge_index, connector]),
    );
    this.render();
  }

  setBringAndSlide(controls) {
    this.bringAndSlide = controls ?? { left: null, right: null };
    if (this.slideState && this.slideState.focusId !== this.selectedId) {
      this.finishSlide(false);
    } else {
      this.render();
    }
  }

  setSearchMatches(ids) {
    this.searchMatches = new Set(ids);
    this.render();
  }

  setTimelineFocus(summary) {
    this.timelineFocusIds = new Set(summary?.vertex_ids ?? []);
    this.timelineFocusRange = summary
      ? { startYear: summary.start_year, endYear: summary.end_year }
      : null;
    this.render();
  }

  setIsolation(enabled, depth) {
    this.isolateEnabled = enabled;
    this.isolateDepth = depth;
    this.render();
  }

  setExpandedNames(expanded) {
    this.expandedNames = expanded;
    this.render();
  }

  setZoomSpeed(speed) {
    this.zoomSpeed = speed;
  }

  fit() {
    if (!this.geometry) {
      return;
    }

    const bounds = this.geometry.bounds;
    const fitWidth = bounds.width + FIT_PADDING_X * 2;
    const fitHeight = bounds.height + FIT_PADDING_Y * 2;
    this.scale = clamp(
      Math.min(this.width / fitWidth, this.height / fitHeight),
      MIN_SCALE,
      MAX_SCALE,
    );
    this.offsetX = this.width / 2 - (bounds.minX + bounds.width / 2) * this.scale;
    this.offsetY = FIT_PADDING_Y - bounds.minY * this.scale;
    this.render();
  }

  fitToVertexIds(ids) {
    if (!this.geometry || !ids?.length) {
      return;
    }

    const vertices = ids
      .map((id) => this.vertexById.get(id))
      .filter(Boolean);
    if (!vertices.length) {
      return;
    }

    const minX = Math.min(...vertices.map((vertex) => vertex.x));
    const minY = Math.min(...vertices.map((vertex) => vertex.y));
    const maxX = Math.max(...vertices.map((vertex) => vertex.x + vertex.width));
    const maxY = Math.max(...vertices.map((vertex) => vertex.y + vertex.height));
    const bounds = {
      minX,
      minY,
      width: Math.max(1, maxX - minX),
      height: Math.max(1, maxY - minY),
    };

    const fitWidth = bounds.width + FIT_PADDING_X * 2;
    const fitHeight = bounds.height + FIT_PADDING_Y * 2;
    this.scale = clamp(
      Math.min(this.width / fitWidth, this.height / fitHeight),
      MIN_SCALE,
      MAX_SCALE,
    );
    this.offsetX = this.width / 2 - (bounds.minX + bounds.width / 2) * this.scale;
    this.offsetY = FIT_PADDING_Y - bounds.minY * this.scale;
    this.render();
  }

  zoomBy(multiplier) {
    this.zoomAt(this.width / 2, this.height / 2, multiplier);
  }

  panBy(dx, dy) {
    this.offsetX += dx;
    this.offsetY += dy;
    this.render();
  }

  zoomAt(screenX, screenY, multiplier) {
    const worldX = (screenX - this.offsetX) / this.scale;
    const worldY = (screenY - this.offsetY) / this.scale;
    this.scale = clamp(this.scale * multiplier, MIN_SCALE, MAX_SCALE);
    this.offsetX = screenX - worldX * this.scale;
    this.offsetY = screenY - worldY * this.scale;
    this.render();
  }

  screenToWorld(screenX, screenY) {
    return {
      x: (screenX - this.offsetX) / this.scale,
      y: (screenY - this.offsetY) / this.scale,
    };
  }

  hitTest(screenX, screenY) {
    if (!this.geometry) {
      return null;
    }

    const worldX = (screenX - this.offsetX) / this.scale;
    const worldY = (screenY - this.offsetY) / this.scale;

    for (let index = this.vertexRects.length - 1; index >= 0; index -= 1) {
      const vertex = this.vertexRects[index];
      if (!isVertexVisible(vertex, this)) {
        continue;
      }
      if (
        worldX >= vertex.x &&
        worldX <= vertex.x + vertex.width &&
        worldY >= vertex.y &&
        worldY <= vertex.y + vertex.height
      ) {
        return vertex;
      }
    }

    return null;
  }

  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    if (!this.geometry) {
      return;
    }

    drawPaper(ctx, this.width, this.height);

    ctx.save();
    ctx.translate(this.offsetX, this.offsetY);
    ctx.scale(this.scale, this.scale);

    drawGenerationBlocks(ctx, this.geometry, this);
    const ranges = buildConnectionRanges(this.geometry.edges);
    drawGrid(ctx, this.geometry, this, ranges);
    drawHighlightPaths(ctx, this.geometry, this);
    drawEdges(ctx, this.geometry, this);
    drawVertices(ctx, this.geometry, this);
    drawBringAndSlide(ctx, this);

    ctx.restore();
    this.renderMinimap();
  }

  panMinimapToPointer(event) {
    if (!this.minimapTransform) {
      return;
    }

    const rect = this.minimapCanvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    const worldX = (x - this.minimapTransform.offsetX) / this.minimapTransform.scale;
    const worldY = (y - this.minimapTransform.offsetY) / this.minimapTransform.scale;

    this.offsetX = this.width / 2 - worldX * this.scale;
    this.offsetY = this.height / 2 - worldY * this.scale;
    this.render();
  }

  renderMinimap() {
    if (!this.minimapCtx || !this.minimapCanvas) {
      return;
    }

    const ctx = this.minimapCtx;
    ctx.clearRect(0, 0, this.minimapWidth, this.minimapHeight);

    if (!this.geometry) {
      return;
    }

    const bounds = this.geometry.bounds;
    const availableWidth = Math.max(1, this.minimapWidth - MINIMAP_PADDING * 2);
    const availableHeight = Math.max(1, this.minimapHeight - MINIMAP_PADDING * 2);
    const minimapScale = Math.min(availableWidth / bounds.width, availableHeight / bounds.height);
    const offsetX = (this.minimapWidth - bounds.width * minimapScale) / 2 - bounds.minX * minimapScale;
    const offsetY = (this.minimapHeight - bounds.height * minimapScale) / 2 - bounds.minY * minimapScale;
    this.minimapTransform = { scale: minimapScale, offsetX, offsetY };

    ctx.save();
    ctx.fillStyle = "rgba(255, 251, 244, 0.92)";
    ctx.strokeStyle = "rgba(29, 37, 45, 0.14)";
    ctx.lineWidth = 1;
    roundRect(ctx, 0.5, 0.5, this.minimapWidth - 1, this.minimapHeight - 1, 14);
    ctx.fill();
    ctx.stroke();

    for (const generation of this.geometry.generations) {
      if (generation.personBand) {
        fillMinimapRect(ctx, generation.personBand, minimapScale, offsetX, offsetY, "rgba(11, 110, 116, 0.08)");
      }
      if (generation.familyBand) {
        fillMinimapRect(ctx, generation.familyBand, minimapScale, offsetX, offsetY, "rgba(154, 93, 22, 0.1)");
      }
    }

    for (const vertex of this.geometry.vertices) {
      const selected = vertex.id === this.selectedId;
      const highlighted = this.highlightedVertices.has(vertex.id);
      const timelineFocused = this.timelineFocusIds.has(vertex.id);
      fillMinimapRect(
        ctx,
        vertex,
        minimapScale,
        offsetX,
        offsetY,
        selected
          ? "rgba(215, 59, 38, 0.9)"
          : highlighted
            ? "rgba(11, 110, 116, 0.72)"
            : timelineFocused
              ? "rgba(53, 85, 250, 0.72)"
            : vertex.kind === "family"
              ? "rgba(120, 120, 120, 0.42)"
              : "rgba(70, 78, 82, 0.42)",
      );
    }

    const viewport = currentViewportWorldBounds(this);
    ctx.strokeStyle = "rgba(215, 59, 38, 0.92)";
    ctx.lineWidth = 1.5;
    ctx.fillStyle = "rgba(215, 59, 38, 0.08)";
    ctx.beginPath();
    ctx.rect(
      viewport.minX * minimapScale + offsetX,
      viewport.minY * minimapScale + offsetY,
      viewport.width * minimapScale,
      viewport.height * minimapScale,
    );
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  startSlide(direction) {
    const focus = this.vertexById.get(this.selectedId);
    const controls = this.bringAndSlide[direction];
    if (!focus || !controls?.candidates?.length) {
      return;
    }

    const candidates = controls.candidates
      .map((candidate, index) => {
        const actual = this.vertexById.get(candidate.id);
        if (!actual) {
          return null;
        }
        return buildSlideCandidate(direction, focus, actual, candidate.label, index, controls.candidates.length);
      })
      .filter(Boolean);

    if (!candidates.length) {
      return;
    }

    const centerWorld = {
      x: (this.width / 2 - this.offsetX) / this.scale,
      y: (this.height / 2 - this.offsetY) / this.scale,
    };
    const focusAnchor =
      direction === "left"
        ? { x: focus.x, y: focus.centerY }
        : { x: focus.x + focus.width, y: focus.centerY };

    this.slideState = {
      direction,
      focusId: focus.id,
      focusAnchor,
      candidates,
      cursor: { ...focusAnchor },
      destinationId: null,
      progress: 0,
      originOffsetX: this.offsetX,
      originOffsetY: this.offsetY,
      focusOffsetWorld: {
        x: centerWorld.x - focusAnchor.x,
        y: centerWorld.y - focusAnchor.y,
      },
    };
    this.render();
  }

  updateSlide(screenX, screenY) {
    if (!this.slideState) {
      return;
    }

    const pointer = this.screenToWorld(screenX, screenY);
    let closest = null;

    for (const candidate of this.slideState.candidates) {
      const projection = projectOntoSegment(candidate.line, pointer);
      if (!closest || projection.distanceSq < closest.distanceSq) {
        closest = { candidate, ...projection };
      }
    }

    if (!closest) {
      return;
    }

    this.slideState.cursor = {
      x: closest.point.x,
      y: closest.point.y,
    };
    this.slideState.destinationId = closest.candidate.id;
    this.slideState.progress = closest.u;

    const destinationCenter = {
      x: closest.candidate.actual.centerX,
      y: closest.candidate.actual.centerY,
    };
    const viewportCenter = {
      x:
        lerp(
          this.slideState.focusAnchor.x + this.slideState.focusOffsetWorld.x,
          destinationCenter.x + this.slideState.focusOffsetWorld.x,
          closest.u,
        ),
      y:
        lerp(
          this.slideState.focusAnchor.y + this.slideState.focusOffsetWorld.y,
          destinationCenter.y + this.slideState.focusOffsetWorld.y,
          closest.u,
        ),
    };

    this.offsetX = this.width / 2 - viewportCenter.x * this.scale;
    this.offsetY = this.height / 2 - viewportCenter.y * this.scale;
    this.render();
  }

  finishSlide(restoreCamera) {
    if (!this.slideState) {
      return;
    }

    if (restoreCamera) {
      this.offsetX = this.slideState.originOffsetX;
      this.offsetY = this.slideState.originOffsetY;
    }

    this.slideState = null;
    this.render();
  }
}

function buildGeometry(scene, measureCtx) {
  const familyFirst = scene.vertices.some(
    (vertex) => vertex.kind === "family" && vertex.layer === 0,
  );
  const grouped = groupGenerations(scene.vertices, familyFirst, measureCtx);
  let x = LAYOUT_ORIGIN_X;
  let y = LAYOUT_ORIGIN_Y;
  const generationLayouts = [];
  const vertices = [];

  for (const generation of grouped) {
    const layout = {
      index: generation.index,
      familyBand: null,
      personBand: null,
    };

    if (familyFirst) {
      if (generation.families.length) {
        layout.familyBand = layoutFamilyBand(generation.families, x, y);
        x += layout.familyBand.width + X_PAD * 0.5;
        y += layout.familyBand.height + Y_PAD;
      }
      if (generation.people.length) {
        layout.personBand = layoutPersonBand(generation.people, x, y);
        x += layout.personBand.width + X_PAD * 0.5;
        y += layout.personBand.height + Y_PAD;
      }
    } else {
      if (generation.people.length) {
        layout.personBand = layoutPersonBand(generation.people, x, y);
        x += layout.personBand.width + X_PAD * 0.5;
        y += layout.personBand.height + Y_PAD;
      }
      if (generation.families.length) {
        layout.familyBand = layoutFamilyBand(generation.families, x, y);
        x += layout.familyBand.width + X_PAD;
        y += layout.familyBand.height + Y_PAD;
      }
    }

    if (layout.familyBand) {
      vertices.push(...layout.familyBand.vertices);
    }
    if (layout.personBand) {
      vertices.push(...layout.personBand.vertices);
    }

    generationLayouts.push(layout);
  }

  const vertexById = new Map(vertices.map((vertex) => [vertex.id, vertex]));
  const edges = scene.edges
    .map((edge) => layoutEdge(edge, vertexById))
    .filter(Boolean);
  const edgeByIndex = new Map(edges.map((edge) => [edge.index, edge]));

  const bounds = computeBounds(vertices, generationLayouts);

  return {
    familyFirst,
    generations: generationLayouts,
    vertices,
    edges,
    edgeByIndex,
    vertexById,
    bounds,
  };
}

function groupGenerations(vertices, familyFirst, measureCtx) {
  const generations = new Map();

  for (const vertex of vertices) {
    const generationIndex = familyFirst
      ? vertex.kind === "family"
        ? Math.floor(vertex.layer / 2)
        : Math.floor((vertex.layer - 1) / 2)
      : vertex.kind === "person"
        ? Math.floor(vertex.layer / 2)
        : Math.floor((vertex.layer - 1) / 2);

    const entry = generations.get(generationIndex) ?? {
      index: generationIndex,
      people: [],
      families: [],
    };
    entry[vertex.kind === "person" ? "people" : "families"].push(
      withMeasuredWidth(vertex, measureCtx),
    );
    generations.set(generationIndex, entry);
  }

  return [...generations.values()]
    .sort((left, right) => left.index - right.index)
    .map((generation) => ({
      ...generation,
      people: generation.people.sort((left, right) => left.order - right.order),
      families: generation.families.sort((left, right) => left.order - right.order),
    }));
}

function withMeasuredWidth(vertex, measureCtx) {
  measureCtx.font = vertex.kind === "person" ? PERSON_FONT : FAMILY_FONT;
  const measured = measureCtx.measureText(vertex.label || vertex.id).width;
  return {
    ...vertex,
    measuredWidth: Math.max(8, measured),
  };
}

function layoutPersonBand(vertices, x, y) {
  const rowHeight = CELL_SIZE;
  const rowPitch = CELL_SIZE * INDI_LINE_SPACING;
  const bandWidth = Math.max(...vertices.map((vertex) => vertex.measuredWidth), 16);

  const laidOut = vertices.map((vertex, index) => ({
    ...vertex,
    x,
    y: y + index * rowPitch,
    width: bandWidth,
    height: rowHeight,
    centerX: x + bandWidth / 2,
    centerY: y + index * rowPitch + rowHeight / 2,
  }));

  return {
    kind: "person",
    x,
    y,
    width: bandWidth,
    height:
      vertices.length > 0
        ? (vertices.length - 1) * rowPitch + rowHeight
        : rowHeight,
    vertices: laidOut,
  };
}

function layoutFamilyBand(vertices, x, y) {
  const height = CELL_SIZE;
  let cursor = x;
  const laidOut = vertices.map((vertex) => {
    const width = Math.max(vertex.measuredWidth + 4, 12);
    const laidOutVertex = {
      ...vertex,
      x: cursor,
      y,
      width,
      height,
      centerX: cursor + width / 2,
      centerY: y + height / 2,
    };
    cursor += width;
    return laidOutVertex;
  });

  return {
    kind: "family",
    x,
    y,
    width: Math.max(0, cursor - x),
    height,
    vertices: laidOut,
  };
}

function layoutEdge(edge, vertexById) {
  const from = vertexById.get(edge.from);
  const to = vertexById.get(edge.to);
  if (!from || !to) {
    return null;
  }

  const family = from.kind === "family" ? from : to.kind === "family" ? to : null;
  const person = from.kind === "person" ? from : to.kind === "person" ? to : null;
  if (!family || !person) {
    return null;
  }

  return {
    ...edge,
    familyId: family.id,
    personId: person.id,
    x: family.x,
    y: person.y,
    width: family.width,
    height: person.height,
    centerX: family.centerX,
    centerY: person.centerY,
    sex: person.sex ?? null,
  };
}

function computeBounds(vertices, generations) {
  if (!vertices.length) {
    return { minX: 0, minY: 0, width: 1, height: 1 };
  }

  const minX = Math.min(...vertices.map((vertex) => vertex.x));
  const minY = Math.min(...vertices.map((vertex) => vertex.y));
  const maxX = Math.max(...vertices.map((vertex) => vertex.x + vertex.width));
  const maxY = Math.max(...vertices.map((vertex) => vertex.y + vertex.height));

  for (const generation of generations) {
    if (generation.familyBand) {
      generation.familyBand.minX = generation.familyBand.x;
      generation.familyBand.maxX = generation.familyBand.x + generation.familyBand.width;
      generation.familyBand.minY = generation.familyBand.y;
      generation.familyBand.maxY = generation.familyBand.y + generation.familyBand.height;
    }
    if (generation.personBand) {
      generation.personBand.minX = generation.personBand.x;
      generation.personBand.maxX = generation.personBand.x + generation.personBand.width;
      generation.personBand.minY = generation.personBand.y;
      generation.personBand.maxY = generation.personBand.y + generation.personBand.height;
    }
  }

  return {
    minX,
    minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function drawPaper(ctx, width, height) {
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, "#faf2e3");
  gradient.addColorStop(0.5, "#f1e6d2");
  gradient.addColorStop(1, "#f8f1e4");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

function drawGenerationBlocks(ctx, geometry, renderer) {
  ctx.save();

  for (const generation of geometry.generations) {
    if (generation.personBand) {
      ctx.fillStyle =
        renderer.scale < 0.15
          ? "rgba(160, 160, 160, 0.45)"
          : "rgba(120, 120, 120, 0.14)";
      ctx.fillRect(
        generation.personBand.x - 1,
        generation.personBand.y,
        generation.personBand.width + 2,
        generation.personBand.height,
      );
    }

    if (generation.familyBand) {
      ctx.fillStyle =
        renderer.scale < 0.15
          ? "rgba(188, 188, 188, 0.48)"
          : "rgba(170, 170, 170, 0.14)";
      ctx.fillRect(
        generation.familyBand.x,
        generation.familyBand.y - 1,
        generation.familyBand.width,
        generation.familyBand.height + 2,
      );
    }
  }

  ctx.restore();
}

function buildConnectionRanges(edges) {
  const familyLookup = new Map();
  const personLookup = new Map();

  for (const edge of edges) {
    pushRange(familyLookup, edge.familyId, edge.y, edge.y + edge.height);
    pushRange(personLookup, edge.personId, edge.x, edge.x + edge.width);
  }

  return { familyLookup, personLookup };
}

function drawGrid(ctx, geometry, renderer, ranges) {
  ctx.save();
  ctx.strokeStyle = "rgba(120, 120, 120, 0.32)";
  ctx.lineWidth = 1 / renderer.scale;

  for (const vertex of geometry.vertices) {
    if (!isVertexVisible(vertex, renderer)) {
      continue;
    }

    if (vertex.kind === "person") {
      const range = ranges.personLookup.get(vertex.id);
      const minX = Math.min(vertex.x, range?.min ?? vertex.x);
      const maxX = Math.max(vertex.x + vertex.width, range?.max ?? vertex.x + vertex.width);
      const top = vertex.y;
      const bottom = vertex.y + vertex.height;
      ctx.beginPath();
      ctx.moveTo(minX, top);
      ctx.lineTo(maxX, top);
      ctx.stroke();
      if (!range) {
        ctx.beginPath();
        ctx.moveTo(vertex.x, bottom);
        ctx.lineTo(vertex.x + vertex.width, bottom);
        ctx.stroke();
      }
    } else {
      const range = ranges.familyLookup.get(vertex.id);
      const minY = Math.min(vertex.y, range?.min ?? vertex.y);
      const maxY = Math.max(vertex.y + vertex.height, range?.max ?? vertex.y + vertex.height);
      ctx.beginPath();
      ctx.moveTo(vertex.x, minY);
      ctx.lineTo(vertex.x, maxY);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(vertex.x + vertex.width, minY);
      ctx.lineTo(vertex.x + vertex.width, maxY);
      ctx.stroke();
    }
  }

  ctx.restore();
}

function drawHighlightPaths(ctx, geometry, renderer) {
  if (!renderer.selectedId || !renderer.highlightConnectorColors.size) {
    return;
  }

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "rgba(215, 59, 38, 0.9)";
  ctx.lineWidth = 4.25 / renderer.scale;

  for (const connector of renderer.highlightConnectorColors.values()) {
    const edge = geometry.edgeByIndex.get(connector.edge_index);
    if (!edge || !isEdgeVisible(edge, renderer)) {
      continue;
    }

    const from = geometry.vertexById.get(edge.from);
    const to = geometry.vertexById.get(edge.to);
    if (!from || !to || !isVertexVisible(from, renderer) || !isVertexVisible(to, renderer)) {
      continue;
    }

    ctx.strokeStyle = highlightStrokeColor(connector.color_indices);
    if (connector.show_from_connector) {
      ctx.beginPath();
      ctx.moveTo(from.centerX, from.centerY);
      ctx.lineTo(edge.centerX, edge.centerY);
      ctx.stroke();
    }

    if (connector.show_to_connector) {
      ctx.beginPath();
      ctx.moveTo(edge.centerX, edge.centerY);
      ctx.lineTo(to.centerX, to.centerY);
      ctx.stroke();
    }
  }

  ctx.restore();
}

function drawBringAndSlide(ctx, renderer) {
  if (!renderer.slideState) {
    return;
  }

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  for (const candidate of renderer.slideState.candidates) {
    const active = candidate.id === renderer.slideState.destinationId;

    ctx.strokeStyle = active ? "rgba(80, 96, 250, 0.98)" : "rgba(80, 96, 250, 0.68)";
    ctx.lineWidth = (active ? 2.4 : 1.4) / renderer.scale;
    ctx.beginPath();
    ctx.moveTo(candidate.line.x1, candidate.line.y1);
    ctx.lineTo(candidate.line.x2, candidate.line.y2);
    ctx.stroke();

    ctx.fillStyle = "rgba(255, 255, 255, 0.95)";
    ctx.strokeStyle = active ? "rgba(80, 96, 250, 0.92)" : "rgba(29, 37, 45, 0.16)";
    ctx.lineWidth = 1 / renderer.scale;
    ctx.fillRect(candidate.overlay.x, candidate.overlay.y, candidate.overlay.width, candidate.overlay.height);
    ctx.strokeRect(
      candidate.overlay.x,
      candidate.overlay.y,
      candidate.overlay.width,
      candidate.overlay.height,
    );

    ctx.fillStyle = active ? "rgba(55, 64, 200, 1)" : "#1d252d";
    ctx.font = PERSON_FONT;
    ctx.textBaseline = "top";
    ctx.fillText(candidate.label, candidate.overlay.x, candidate.overlay.y);
  }

  ctx.fillStyle = "rgba(80, 96, 250, 0.96)";
  ctx.beginPath();
  ctx.arc(renderer.slideState.cursor.x, renderer.slideState.cursor.y, 4 / renderer.scale, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawEdges(ctx, geometry, renderer) {
  ctx.save();

  for (const edge of geometry.edges) {
    const person = geometry.vertexById.get(edge.personId);
    const family = geometry.vertexById.get(edge.familyId);
    if (!person || !family || !isEdgeVisible(edge, renderer)) {
      continue;
    }

    const highlightColors = renderer.highlightEdgeColors.get(edge.index);
    const highlighted = Boolean(highlightColors?.length);
    const searchRelated =
      renderer.searchMatches.has(edge.personId) || renderer.searchMatches.has(edge.familyId);
    const timelineRelated =
      renderer.timelineFocusIds.has(edge.personId) || renderer.timelineFocusIds.has(edge.familyId);
    const alpha = edgeAlpha(edge, renderer);
    if (alpha <= 0.01) {
      continue;
    }

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = highlighted
      ? highlightFillColor(highlightColors)
      : timelineRelated
        ? "rgba(53, 85, 250, 0.84)"
      : searchRelated
        ? "rgba(154, 93, 22, 0.88)"
        : "rgba(56, 63, 67, 0.78)";
    ctx.strokeStyle = "rgba(255,255,255,0.88)";
    ctx.lineWidth = highlighted ? 1.4 / renderer.scale : 0;

    const size = Math.min(Math.min(edge.width, edge.height) * 0.62, 8.5);
    const x = edge.centerX - size / 2;
    const y = edge.centerY - size / 2;

    if (edge.sex === "M") {
      ctx.fillRect(x, y, size, size);
      if (highlighted) {
        ctx.strokeRect(x, y, size, size);
      }
    } else if (edge.sex === "F") {
      ctx.beginPath();
      ctx.ellipse(edge.centerX, edge.centerY, size / 2, size / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      if (highlighted) {
        ctx.stroke();
      }
    } else {
      ctx.beginPath();
      ctx.moveTo(edge.centerX, y);
      ctx.lineTo(x + size, y + size);
      ctx.lineTo(x, y + size);
      ctx.closePath();
      ctx.fill();
      if (highlighted) {
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  ctx.restore();
}

function drawVertices(ctx, geometry, renderer) {
  ctx.save();

  for (const vertex of geometry.vertices) {
    if (!isVertexVisible(vertex, renderer)) {
      continue;
    }

    const alpha = vertexAlpha(vertex, renderer);
    if (alpha <= 0.01) {
      continue;
    }

    ctx.save();
    ctx.globalAlpha = alpha;

    if (vertex.kind === "person") {
      drawPerson(ctx, vertex, renderer);
    } else {
      drawFamily(ctx, vertex, renderer);
    }

    ctx.restore();
  }

  ctx.restore();
}

function drawPerson(ctx, vertex, renderer) {
  const selected = renderer.selectedId === vertex.id;
  const highlightColors = renderer.highlightVertexColors.get(vertex.id);
  const highlighted = Boolean(highlightColors?.length);
  const searched = renderer.searchMatches.has(vertex.id);
  const timelineFocused = renderer.timelineFocusIds.has(vertex.id);
  const worldFontVisible = renderer.scale >= SMALL_TEXT_THRESHOLD;
  const highlightColor = highlightTextColor(highlightColors);

  if (!worldFontVisible) {
    ctx.fillStyle = selected
      ? "rgba(215, 59, 38, 0.9)"
      : timelineFocused
        ? "rgba(53, 85, 250, 0.72)"
      : searched
        ? "rgba(154, 93, 22, 0.72)"
        : highlighted
          ? highlightColor
          : "rgba(150, 150, 150, 0.72)";
    ctx.fillRect(vertex.x, vertex.y + vertex.height * 0.12, vertex.width, vertex.height * 0.76);
    return;
  }

  if (searched || highlighted || selected || timelineFocused) {
    ctx.fillStyle = selected
      ? "rgba(255, 236, 232, 0.92)"
      : timelineFocused
        ? "rgba(232, 238, 255, 0.94)"
      : "rgba(250, 244, 228, 0.88)";
    ctx.fillRect(vertex.x - 2, vertex.y + 1, vertex.width + 4, vertex.height - 2);
  }

  ctx.fillStyle = selected
    ? "#d73b26"
    : timelineFocused
      ? "#3555fa"
    : highlighted
      ? highlightColor
      : searched
        ? "#9a5d16"
        : "#12181d";
  ctx.font = PERSON_FONT;
  ctx.textBaseline = "top";
  ctx.fillText(vertex.label, vertex.x, vertex.y);
}

function drawFamily(ctx, vertex, renderer) {
  const selected = renderer.selectedId === vertex.id;
  const highlightColors = renderer.highlightVertexColors.get(vertex.id);
  const highlighted = Boolean(highlightColors?.length);
  const searched = renderer.searchMatches.has(vertex.id);
  const timelineFocused = renderer.timelineFocusIds.has(vertex.id);
  const textVisible = renderer.scale >= SMALL_TEXT_THRESHOLD;
  const highlightColor = highlightTextColor(highlightColors);

  ctx.fillRect(vertex.x, vertex.y, vertex.width, vertex.height);
  ctx.fillStyle = FAMILY_BASE_FILL;
  ctx.fillRect(vertex.x, vertex.y, vertex.width, vertex.height);
  fillFamilyPattern(ctx, vertex, renderer.scale);

  if (selected || searched || highlighted || timelineFocused) {
    ctx.fillStyle = selected
      ? "rgba(215, 59, 38, 0.28)"
      : timelineFocused
        ? "rgba(53, 85, 250, 0.18)"
      : searched
        ? "rgba(154, 93, 22, 0.2)"
        : highlightFillColorOverlay(highlightColors);
    ctx.fillRect(vertex.x, vertex.y, vertex.width, vertex.height);
  }

  ctx.strokeStyle =
    selected
      ? "rgba(255,255,255,0.94)"
      : timelineFocused
        ? "rgba(53, 85, 250, 0.94)"
      : searched
        ? "rgba(255, 244, 226, 0.94)"
        : highlighted
          ? highlightStrokeColor(highlightColors)
          : FAMILY_BASE_STROKE;
  ctx.lineWidth = 1 / renderer.scale;
  ctx.strokeRect(vertex.x, vertex.y, vertex.width, vertex.height);

  if (
    textVisible &&
    (renderer.expandedNames || selected || searched || timelineFocused) &&
    renderer.scale >= FAMILY_TEXT_THRESHOLD
  ) {
    ctx.fillStyle =
      selected
        ? "white"
        : timelineFocused
          ? "#3555fa"
          : highlighted
            ? highlightColor
            : FAMILY_BASE_TEXT;
    ctx.font = FAMILY_FONT;
    ctx.textBaseline = "top";
    ctx.fillText(vertex.label, vertex.x + 2, vertex.y + 2);
  }
}

function pushRange(map, key, min, max) {
  const current = map.get(key);
  if (!current) {
    map.set(key, { min, max });
    return;
  }
  current.min = Math.min(current.min, min);
  current.max = Math.max(current.max, max);
}

function isVertexVisible(vertex, renderer) {
  if (!renderer.selectedId || !renderer.isolateEnabled) {
    return true;
  }
  const distance = renderer.doiById.get(vertex.id);
  return distance != null && distance <= renderer.isolateDepth;
}

function isEdgeVisible(edge, renderer) {
  if (!renderer.selectedId || !renderer.isolateEnabled) {
    return true;
  }
  const personDistance = renderer.doiById.get(edge.personId);
  const familyDistance = renderer.doiById.get(edge.familyId);
  return (
    personDistance != null &&
    familyDistance != null &&
    personDistance <= renderer.isolateDepth &&
    familyDistance <= renderer.isolateDepth
  );
}

function vertexAlpha(vertex, renderer) {
  const timelineActive = renderer.timelineFocusRange !== null;
  const timelineFocused = renderer.timelineFocusIds.has(vertex.id);

  if (!renderer.selectedId) {
    if (timelineActive) {
      return timelineFocused ? 1 : 0.14;
    }
    return 1;
  }
  if (renderer.selectedId === vertex.id) {
    return 1;
  }
  if (renderer.highlightVertexColors.has(vertex.id)) {
    return 0.98;
  }
  if (timelineActive && timelineFocused) {
    return 0.92;
  }
  if (renderer.isolateEnabled) {
    const distance = renderer.doiById.get(vertex.id);
    if (distance == null || distance > renderer.isolateDepth) {
      return 0.05;
    }
  }
  if (timelineActive && !timelineFocused) {
    return 0.1;
  }
  return 0.18;
}

function edgeAlpha(edge, renderer) {
  const timelineActive = renderer.timelineFocusRange !== null;
  const timelineFocused =
    renderer.timelineFocusIds.has(edge.personId) || renderer.timelineFocusIds.has(edge.familyId);

  if (!renderer.selectedId) {
    if (timelineActive) {
      return timelineFocused ? 0.94 : 0.08;
    }
    return 0.92;
  }
  if (renderer.highlightEdgeColors.has(edge.index)) {
    return 1;
  }
  if (timelineActive && timelineFocused) {
    return 0.88;
  }
  if (renderer.isolateEnabled) {
    const personDistance = renderer.doiById.get(edge.personId);
    const familyDistance = renderer.doiById.get(edge.familyId);
    if (
      personDistance == null ||
      familyDistance == null ||
      personDistance > renderer.isolateDepth ||
      familyDistance > renderer.isolateDepth
    ) {
      return 0.04;
    }
  }
  if (timelineActive && !timelineFocused) {
    return 0.08;
  }
  return 0.16;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function buildSlideCandidate(direction, focus, actual, label, index, total) {
  const angle = Math.PI / (total + 1);
  const i = index + 1;
  const distance =
    direction === "right"
      ? Math.max((2 * focus.height) / angle, SLIDE_DISTANCE)
      : SLIDE_DISTANCE;
  const overlayX =
    direction === "left"
      ? focus.x - Math.sin(angle * i) * distance - actual.width
      : focus.x + focus.width + Math.sin(angle * i) * distance;
  const overlayY = focus.y - Math.cos(angle * i) * distance;
  const line =
    direction === "left"
      ? {
        x1: focus.x,
        y1: focus.centerY,
        x2: overlayX + actual.width,
        y2: overlayY + actual.height / 2,
      }
      : {
        x1: focus.x + focus.width,
        y1: focus.centerY,
        x2: overlayX,
        y2: overlayY + actual.height / 2,
      };

  return {
    id: actual.id,
    label,
    actual,
    overlay: {
      x: overlayX,
      y: overlayY,
      width: actual.width,
      height: actual.height,
      centerX: overlayX + actual.width / 2,
      centerY: overlayY + actual.height / 2,
    },
    line,
  };
}

function projectOntoSegment(line, point) {
  const dx = line.x2 - line.x1;
  const dy = line.y2 - line.y1;
  const lengthSq = dx * dx + dy * dy || 1;
  const raw = ((point.x - line.x1) * dx + (point.y - line.y1) * dy) / lengthSq;
  const u = clamp(raw, 0, 1);
  const projected = {
    x: line.x1 + dx * u,
    y: line.y1 + dy * u,
  };
  return {
    u,
    point: projected,
    distanceSq: (point.x - projected.x) ** 2 + (point.y - projected.y) ** 2,
  };
}

function lerp(a, b, u) {
  return a + (b - a) * u;
}

function highlightStrokeColor(colorIndices) {
  if (!colorIndices?.length) {
    return "rgba(215, 59, 38, 0.9)";
  }
  if (colorIndices.length > 1) {
    return "rgba(65, 51, 120, 0.96)";
  }
  return hexToRgba(HIGHLIGHT_COLORS[colorIndices[0] % HIGHLIGHT_COLORS.length], 0.94);
}

function highlightFillColor(colorIndices) {
  if (!colorIndices?.length) {
    return "rgba(11, 110, 116, 0.84)";
  }
  if (colorIndices.length > 1) {
    return "rgba(90, 76, 170, 0.86)";
  }
  return hexToRgba(HIGHLIGHT_COLORS[colorIndices[0] % HIGHLIGHT_COLORS.length], 0.84);
}

function highlightFillColorOverlay(colorIndices) {
  if (!colorIndices?.length) {
    return "rgba(11, 110, 116, 0.18)";
  }
  if (colorIndices.length > 1) {
    return "rgba(90, 76, 170, 0.18)";
  }
  return hexToRgba(HIGHLIGHT_COLORS[colorIndices[0] % HIGHLIGHT_COLORS.length], 0.18);
}

function highlightTextColor(colorIndices) {
  if (!colorIndices?.length) {
    return "#0b6e74";
  }
  if (colorIndices.length > 1) {
    return "#4a3c91";
  }
  return HIGHLIGHT_COLORS[colorIndices[0] % HIGHLIGHT_COLORS.length];
}

function hexToRgba(hex, alpha) {
  const normalized = hex.replace("#", "");
  const value = Number.parseInt(normalized, 16);
  const red = (value >> 16) & 255;
  const green = (value >> 8) & 255;
  const blue = value & 255;
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function normalizeWheelDelta(event) {
  const deltaModeScale =
    event.deltaMode === WheelEvent.DOM_DELTA_LINE
      ? 16
      : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
        ? 120
        : 1;
  const normalized = event.deltaY * deltaModeScale;
  return clamp(normalized, -90, 90);
}

function fillFamilyPattern(ctx, vertex, scale) {
  const stripePitch = Math.max(2.2, 5 / Math.max(scale, 0.35));
  ctx.save();
  ctx.beginPath();
  ctx.rect(vertex.x, vertex.y, vertex.width, vertex.height);
  ctx.clip();
  ctx.strokeStyle = "rgba(124, 111, 83, 0.28)";
  ctx.lineWidth = Math.max(0.6, 1 / Math.max(scale, 0.5));

  for (let offset = -vertex.height; offset < vertex.width + vertex.height; offset += stripePitch) {
    ctx.beginPath();
    ctx.moveTo(vertex.x + offset, vertex.y + vertex.height);
    ctx.lineTo(vertex.x + offset + vertex.height, vertex.y);
    ctx.stroke();
  }

  ctx.restore();
}

function currentViewportWorldBounds(renderer) {
  const minX = (-renderer.offsetX) / renderer.scale;
  const minY = (-renderer.offsetY) / renderer.scale;
  return {
    minX,
    minY,
    width: renderer.width / renderer.scale,
    height: renderer.height / renderer.scale,
  };
}

function fillMinimapRect(ctx, rect, scale, offsetX, offsetY, fillStyle) {
  ctx.fillStyle = fillStyle;
  ctx.fillRect(
    rect.x * scale + offsetX,
    rect.y * scale + offsetY,
    Math.max(1, rect.width * scale),
    Math.max(1, rect.height * scale),
  );
}

function roundRect(ctx, x, y, width, height, radius) {
  const clampedRadius = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + clampedRadius, y);
  ctx.arcTo(x + width, y, x + width, y + height, clampedRadius);
  ctx.arcTo(x + width, y + height, x, y + height, clampedRadius);
  ctx.arcTo(x, y + height, x, y, clampedRadius);
  ctx.arcTo(x, y, x + width, y, clampedRadius);
  ctx.closePath();
}
