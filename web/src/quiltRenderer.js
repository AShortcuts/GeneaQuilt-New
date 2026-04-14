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
const LINE_HIT_SLOP_PX = 10;
const HIGHLIGHT_COLORS = ["#d73b26", "#0b6e74", "#3555fa", "#9a5d16"];

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
    this.theme = "light";
    this.palette = rendererPalette("light");
    this.rotationDegrees = 0;
    this.rotationRadians = 0;
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
        this.finishSlide({
          restoreCamera: shouldRestore,
          centerOnDestination: Boolean(destinationId),
        });
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
      this.finishSlide();
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

  setTheme(theme) {
    this.theme = theme === "dark" ? "dark" : "light";
    this.palette = rendererPalette(this.theme);
    this.render();
  }

  setRotationDegrees(degrees) {
    const next = clamp(Number.isFinite(degrees) ? degrees : 0, -90, 90);
    this.rotationDegrees = next;
    this.rotationRadians = (next * Math.PI) / 180;
    this.render();
  }

  exportInteractiveHtml({ title = "GeneaQuilt export", autoPrint = false } = {}) {
    if (!this.geometry) {
      return null;
    }

    return buildInteractiveHtmlDocument(this, {
      title,
      autoPrint,
    });
  }

  fit() {
    if (!this.geometry) {
      return;
    }

    const bounds = computeRotatedBounds(
      [this.geometry.bounds],
      this.rotationRadians,
      sceneCenter(this.geometry),
    );
    this.fitBounds(bounds);
  }

  fitBounds(bounds) {
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

    const bounds = computeRotatedBounds(vertices, this.rotationRadians, sceneCenter(this.geometry));
    this.fitBounds(bounds);
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
    const world = this.screenToWorld(screenX, screenY);
    this.scale = clamp(this.scale * multiplier, MIN_SCALE, MAX_SCALE);
    const rotated = rotatePoint(world, sceneCenter(this.geometry), this.rotationRadians);
    this.offsetX = screenX - rotated.x * this.scale;
    this.offsetY = screenY - rotated.y * this.scale;
    this.render();
  }

  screenToWorld(screenX, screenY) {
    return screenToWorldPoint(screenX, screenY, this.sceneTransform());
  }

  sceneTransform(scale = this.scale, offsetX = this.offsetX, offsetY = this.offsetY) {
    return {
      scale,
      offsetX,
      offsetY,
      rotationRadians: this.rotationRadians,
      center: sceneCenter(this.geometry),
    };
  }

  centerOnWorldPoint(worldX, worldY) {
    const rotated = rotatePoint({ x: worldX, y: worldY }, sceneCenter(this.geometry), this.rotationRadians);
    this.offsetX = this.width / 2 - rotated.x * this.scale;
    this.offsetY = this.height / 2 - rotated.y * this.scale;
    this.render();
  }

  hitTest(screenX, screenY) {
    if (!this.geometry) {
      return null;
    }
    const transform = this.sceneTransform();

    for (let index = this.vertexRects.length - 1; index >= 0; index -= 1) {
      const vertex = this.vertexRects[index];
      if (!isVertexVisible(vertex, this)) {
        continue;
      }
      const quad = rectCorners(vertex).map((corner) => worldToScreenPoint(corner, transform));
      if (pointInPolygon({ x: screenX, y: screenY }, quad)) {
        return vertex;
      }
    }

    const lineHit = this.hitTestLines(screenX, screenY, transform);
    if (lineHit) {
      return lineHit;
    }

    return null;
  }

  hitTestLines(screenX, screenY, transform) {
    const point = { x: screenX, y: screenY };
    let best = null;

    for (let index = this.vertexRects.length - 1; index >= 0; index -= 1) {
      const vertex = this.vertexRects[index];
      if (!isVertexVisible(vertex, this)) {
        continue;
      }

      const segments = buildVertexLineSegments(vertex, this.geometry.connectionRanges);
      for (const segment of segments) {
        const start = worldToScreenPoint(segment.start, transform);
        const end = worldToScreenPoint(segment.end, transform);
        const distance = pointToSegmentDistance(point, start, end);
        if (distance > LINE_HIT_SLOP_PX) {
          continue;
        }
        if (!best || distance < best.distance) {
          best = { vertex, distance };
        }
      }
    }

    return best?.vertex ?? null;
  }

  render() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    if (!this.geometry) {
      return;
    }

    ctx.__geneaquiltPalette = this.palette;
    drawPaper(ctx, this.width, this.height);

    ctx.save();
    applySceneTransform(ctx, this.sceneTransform());

    drawGenerationBlocks(ctx, this.geometry, this);
    drawGrid(ctx, this.geometry, this, this.geometry.connectionRanges);
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
    const world = screenToWorldPoint(x, y, this.minimapTransform);
    this.centerOnWorldPoint(world.x, world.y);
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

    const bounds = computeRotatedBounds(
      [this.geometry.bounds],
      this.rotationRadians,
      sceneCenter(this.geometry),
    );
    const availableWidth = Math.max(1, this.minimapWidth - MINIMAP_PADDING * 2);
    const availableHeight = Math.max(1, this.minimapHeight - MINIMAP_PADDING * 2);
    const minimapScale = Math.min(availableWidth / bounds.width, availableHeight / bounds.height);
    const offsetX = (this.minimapWidth - bounds.width * minimapScale) / 2 - bounds.minX * minimapScale;
    const offsetY = (this.minimapHeight - bounds.height * minimapScale) / 2 - bounds.minY * minimapScale;
    this.minimapTransform = {
      scale: minimapScale,
      offsetX,
      offsetY,
      rotationRadians: this.rotationRadians,
      center: sceneCenter(this.geometry),
    };

    ctx.save();
    ctx.fillStyle = this.palette.minimapBackground;
    ctx.strokeStyle = this.palette.minimapBorder;
    ctx.lineWidth = 1;
    roundRect(ctx, 0.5, 0.5, this.minimapWidth - 1, this.minimapHeight - 1, 14);
    ctx.fill();
    ctx.stroke();

    applySceneTransform(ctx, this.minimapTransform);

    for (const generation of this.geometry.generations) {
      if (generation.personBand) {
        ctx.fillStyle = this.palette.minimapPersonBand;
        ctx.fillRect(
          generation.personBand.x,
          generation.personBand.y,
          generation.personBand.width,
          generation.personBand.height,
        );
      }
      if (generation.familyBand) {
        ctx.fillStyle = this.palette.minimapFamilyBand;
        ctx.fillRect(
          generation.familyBand.x,
          generation.familyBand.y,
          generation.familyBand.width,
          generation.familyBand.height,
        );
      }
    }

    for (const vertex of this.geometry.vertices) {
      const selected = vertex.id === this.selectedId;
      const highlighted = this.highlightedVertices.has(vertex.id);
      const timelineFocused = this.timelineFocusIds.has(vertex.id);
      ctx.fillStyle = selected
        ? "rgba(215, 59, 38, 0.9)"
        : highlighted
          ? "rgba(11, 110, 116, 0.72)"
          : timelineFocused
            ? "rgba(53, 85, 250, 0.72)"
            : vertex.kind === "family"
              ? this.palette.minimapFamily
              : this.palette.minimapPerson;
      ctx.fillRect(vertex.x, vertex.y, vertex.width, vertex.height);
    }

    ctx.restore();

    const viewport = currentViewportWorldQuad(this);
    ctx.strokeStyle = this.palette.minimapViewportStroke;
    ctx.lineWidth = 1.5;
    ctx.fillStyle = this.palette.minimapViewportFill;
    ctx.beginPath();
    viewport.forEach((point, index) => {
      const projected = worldToScreenPoint(point, this.minimapTransform);
      if (index === 0) {
        ctx.moveTo(projected.x, projected.y);
      } else {
        ctx.lineTo(projected.x, projected.y);
      }
    });
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
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
        return buildSlideCandidate(direction, focus, actual, candidate, index, controls.candidates.length);
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
    this.render();
  }

  finishSlide({ restoreCamera = false, centerOnDestination = false } = {}) {
    if (!this.slideState) {
      return;
    }

    const destinationId = centerOnDestination ? this.slideState.destinationId : null;
    const originOffsetX = this.slideState.originOffsetX;
    const originOffsetY = this.slideState.originOffsetY;
    if (restoreCamera) {
      this.offsetX = originOffsetX;
      this.offsetY = originOffsetY;
    }

    this.slideState = null;
    if (destinationId) {
      const destination = this.vertexById.get(destinationId);
      if (destination) {
        this.centerOnWorldPoint(destination.centerX, destination.centerY);
        return;
      }
    }
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
  const connectionRanges = buildConnectionRanges(edges);

  const bounds = computeBounds(vertices, generationLayouts);

  return {
    familyFirst,
    generations: generationLayouts,
    vertices,
    edges,
    edgeByIndex,
    connectionRanges,
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

function sceneCenter(geometry) {
  const bounds = geometry?.bounds ?? { minX: 0, minY: 0, width: 0, height: 0 };
  return {
    x: bounds.minX + bounds.width / 2,
    y: bounds.minY + bounds.height / 2,
  };
}

function rotatePoint(point, center, radians) {
  if (!radians) {
    return { x: point.x, y: point.y };
  }

  const dx = point.x - center.x;
  const dy = point.y - center.y;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  };
}

function worldToScreenPoint(point, transform) {
  const rotated = rotatePoint(point, transform.center, transform.rotationRadians);
  return {
    x: rotated.x * transform.scale + transform.offsetX,
    y: rotated.y * transform.scale + transform.offsetY,
  };
}

function screenToWorldPoint(screenX, screenY, transform) {
  const world = {
    x: (screenX - transform.offsetX) / transform.scale,
    y: (screenY - transform.offsetY) / transform.scale,
  };
  return rotatePoint(world, transform.center, -transform.rotationRadians);
}

function applySceneTransform(ctx, transform) {
  ctx.translate(transform.offsetX, transform.offsetY);
  ctx.scale(transform.scale, transform.scale);
  ctx.translate(transform.center.x, transform.center.y);
  ctx.rotate(transform.rotationRadians);
  ctx.translate(-transform.center.x, -transform.center.y);
}

function rectCorners(rect) {
  const x = rect.x ?? rect.minX ?? 0;
  const y = rect.y ?? rect.minY ?? 0;
  return [
    { x, y },
    { x: x + rect.width, y },
    { x: x + rect.width, y: y + rect.height },
    { x, y: y + rect.height },
  ];
}

function boundsFromPoints(points) {
  const minX = Math.min(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxX = Math.max(...points.map((point) => point.x));
  const maxY = Math.max(...points.map((point) => point.y));
  return {
    minX,
    minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

function computeRotatedBounds(rects, radians, center = sceneCenter({ bounds: computeBoundsFromRects(rects) })) {
  if (!rects.length) {
    return { minX: 0, minY: 0, width: 1, height: 1 };
  }

  const points = rects.flatMap((rect) =>
    rectCorners(rect).map((corner) => rotatePoint(corner, center, radians)),
  );
  return boundsFromPoints(points);
}

function computeBoundsFromRects(rects) {
  if (!rects.length) {
    return { minX: 0, minY: 0, width: 1, height: 1 };
  }

  const minX = Math.min(...rects.map((rect) => rect.x ?? rect.minX ?? 0));
  const minY = Math.min(...rects.map((rect) => rect.y ?? rect.minY ?? 0));
  const maxX = Math.max(...rects.map((rect) => (rect.x ?? rect.minX ?? 0) + rect.width));
  const maxY = Math.max(...rects.map((rect) => (rect.y ?? rect.minY ?? 0) + rect.height));
  return {
    minX,
    minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
}

function rendererPalette(theme) {
  if (theme === "dark") {
    return {
      paperGradientStart: "#1b2531",
      paperGradientMiddle: "#131b24",
      paperGradientEnd: "#18202a",
      generationPerson: "rgba(151, 162, 171, 0.16)",
      generationPersonDense: "rgba(151, 162, 171, 0.34)",
      generationFamily: "rgba(197, 166, 123, 0.16)",
      generationFamilyDense: "rgba(197, 166, 123, 0.28)",
      grid: "rgba(212, 220, 228, 0.22)",
      edgeDefault: "rgba(171, 183, 193, 0.74)",
      edgeHighlightStroke: "rgba(245, 249, 255, 0.88)",
      personDense: "rgba(152, 162, 173, 0.74)",
      personText: "#edf2f7",
      familyBaseFill: "rgba(31, 41, 53, 0.98)",
      familyBaseStroke: "rgba(188, 168, 135, 0.88)",
      familyBaseText: "#f3e1bf",
      familyPatternStroke: "rgba(188, 168, 135, 0.22)",
      minimapBackground: "rgba(14, 20, 28, 0.94)",
      minimapBorder: "rgba(227, 234, 242, 0.14)",
      minimapPersonBand: "rgba(87, 180, 189, 0.14)",
      minimapFamilyBand: "rgba(214, 154, 83, 0.14)",
      minimapFamily: "rgba(173, 179, 187, 0.48)",
      minimapPerson: "rgba(116, 128, 140, 0.5)",
      minimapViewportStroke: "rgba(255, 126, 110, 0.94)",
      minimapViewportFill: "rgba(255, 126, 110, 0.12)",
    };
  }

  return {
    paperGradientStart: "#faf2e3",
    paperGradientMiddle: "#f1e6d2",
    paperGradientEnd: "#f8f1e4",
    generationPerson: "rgba(120, 120, 120, 0.14)",
    generationPersonDense: "rgba(160, 160, 160, 0.45)",
    generationFamily: "rgba(170, 170, 170, 0.14)",
    generationFamilyDense: "rgba(188, 188, 188, 0.48)",
    grid: "rgba(120, 120, 120, 0.32)",
    edgeDefault: "rgba(56, 63, 67, 0.78)",
    edgeHighlightStroke: "rgba(255,255,255,0.88)",
    personDense: "rgba(150, 150, 150, 0.72)",
    personText: "#12181d",
    familyBaseFill: "rgba(248, 245, 235, 0.98)",
    familyBaseStroke: "rgba(124, 111, 83, 0.92)",
    familyBaseText: "#2a261f",
    familyPatternStroke: "rgba(124, 111, 83, 0.28)",
    minimapBackground: "rgba(255, 251, 244, 0.92)",
    minimapBorder: "rgba(29, 37, 45, 0.14)",
    minimapPersonBand: "rgba(11, 110, 116, 0.08)",
    minimapFamilyBand: "rgba(154, 93, 22, 0.1)",
    minimapFamily: "rgba(120, 120, 120, 0.42)",
    minimapPerson: "rgba(70, 78, 82, 0.42)",
    minimapViewportStroke: "rgba(215, 59, 38, 0.92)",
    minimapViewportFill: "rgba(215, 59, 38, 0.08)",
  };
}

function currentRendererPalette(ctx) {
  return ctx.__geneaquiltPalette ?? rendererPalette("light");
}

function drawPaper(ctx, width, height) {
  const palette = currentRendererPalette(ctx);
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, palette.paperGradientStart);
  gradient.addColorStop(0.5, palette.paperGradientMiddle);
  gradient.addColorStop(1, palette.paperGradientEnd);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

function drawGenerationBlocks(ctx, geometry, renderer) {
  ctx.save();

  for (const generation of geometry.generations) {
    if (generation.personBand) {
      ctx.fillStyle =
        renderer.scale < 0.15
          ? renderer.palette.generationPersonDense
          : renderer.palette.generationPerson;
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
          ? renderer.palette.generationFamilyDense
          : renderer.palette.generationFamily;
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
    pushRange(familyLookup, edge.familyId, edge.centerY, edge.centerY);
    pushRange(personLookup, edge.personId, edge.x, edge.x + edge.width);
  }

  return { familyLookup, personLookup };
}

function buildVertexLineSegments(vertex, ranges) {
  if (vertex.kind === "person") {
    const range = ranges.personLookup.get(vertex.id);
    const minX = Math.min(vertex.x, range?.min ?? vertex.x);
    const maxX = Math.max(vertex.x + vertex.width, range?.max ?? vertex.x + vertex.width);
    const segments = [
      {
        start: { x: minX, y: vertex.y },
        end: { x: maxX, y: vertex.y },
      },
    ];
    if (!range) {
      segments.push({
        start: { x: vertex.x, y: vertex.y + vertex.height },
        end: { x: vertex.x + vertex.width, y: vertex.y + vertex.height },
      });
    }
    return segments;
  }

  const range = ranges.familyLookup.get(vertex.id);
  const minY = Math.min(vertex.y, range?.min ?? vertex.y);
  const maxY = Math.max(vertex.y + vertex.height, range?.max ?? vertex.y + vertex.height);
  return [
    {
      start: { x: vertex.x, y: minY },
      end: { x: vertex.x, y: maxY },
    },
    {
      start: { x: vertex.x + vertex.width, y: minY },
      end: { x: vertex.x + vertex.width, y: maxY },
    },
  ];
}

function drawGrid(ctx, geometry, renderer, ranges) {
  ctx.save();
  ctx.strokeStyle = renderer.palette.grid;
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

    ctx.strokeStyle = highlightConnectorStrokeColor(connector.color_indices);
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

    ctx.fillStyle = active ? "rgba(55, 64, 200, 1)" : "rgba(84, 92, 101, 0.94)";
    ctx.font = '9px Georgia, "Times New Roman", serif';
    ctx.textBaseline = "top";
    ctx.fillText(candidate.relationLabel, candidate.overlay.x + 4 / renderer.scale, candidate.overlay.y + 3 / renderer.scale);

    ctx.fillStyle = active ? "rgba(55, 64, 200, 1)" : "#1d252d";
    ctx.font = PERSON_FONT;
    ctx.textBaseline = "top";
    ctx.fillText(candidate.label, candidate.overlay.x + 4 / renderer.scale, candidate.overlay.y + 13 / renderer.scale);
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
        : renderer.palette.edgeDefault;
    ctx.strokeStyle = renderer.palette.edgeHighlightStroke;
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
          : renderer.palette.personDense;
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
        : renderer.palette.personText;
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
  ctx.fillStyle = renderer.palette.familyBaseFill;
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
          : renderer.palette.familyBaseStroke;
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
            : renderer.palette.familyBaseText;
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

function buildSlideCandidate(direction, focus, actual, candidate, index, total) {
  const angle = Math.PI / (total + 1);
  const i = index + 1;
  const distance =
    direction === "right"
      ? Math.max((2 * focus.height) / angle, SLIDE_DISTANCE)
      : SLIDE_DISTANCE;
  const overlayWidth = Math.max(actual.width + 12, (candidate.label.length * 6.5) + 18);
  const overlayHeight = Math.max(actual.height + 12, 28);
  const overlayX =
    direction === "left"
      ? focus.x - Math.sin(angle * i) * distance - overlayWidth
      : focus.x + focus.width + Math.sin(angle * i) * distance;
  const overlayY = focus.y - Math.cos(angle * i) * distance;
  const line =
    direction === "left"
      ? {
        x1: focus.x,
        y1: focus.centerY,
        x2: overlayX + overlayWidth,
        y2: overlayY + overlayHeight / 2,
      }
      : {
        x1: focus.x + focus.width,
        y1: focus.centerY,
        x2: overlayX,
        y2: overlayY + overlayHeight / 2,
      };

  return {
    id: actual.id,
    label: candidate.label,
    relationLabel: slideRelationLabel(candidate.relation),
    actual,
    overlay: {
      x: overlayX,
      y: overlayY,
      width: overlayWidth,
      height: overlayHeight,
      centerX: overlayX + overlayWidth / 2,
      centerY: overlayY + overlayHeight / 2,
    },
    line,
  };
}

function slideRelationLabel(relation) {
  switch (relation) {
    case "parent":
      return "Parent";
    case "sibling":
      return "Sibling";
    case "spouse":
      return "Spouse";
    case "child":
      return "Child";
    default:
      return "Related";
  }
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

function highlightConnectorStrokeColor(colorIndices) {
  if (!colorIndices?.length) {
    return "rgba(215, 59, 38, 0.45)";
  }
  if (colorIndices.length > 1) {
    return "rgba(65, 51, 120, 0.45)";
  }
  return hexToRgba(HIGHLIGHT_COLORS[colorIndices[0] % HIGHLIGHT_COLORS.length], 0.45);
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
  const palette = currentRendererPalette(ctx);
  ctx.save();
  ctx.beginPath();
  ctx.rect(vertex.x, vertex.y, vertex.width, vertex.height);
  ctx.clip();
  ctx.strokeStyle = palette.familyPatternStroke;
  ctx.lineWidth = Math.max(0.6, 1 / Math.max(scale, 0.5));

  for (let offset = -vertex.height; offset < vertex.width + vertex.height; offset += stripePitch) {
    ctx.beginPath();
    ctx.moveTo(vertex.x + offset, vertex.y + vertex.height);
    ctx.lineTo(vertex.x + offset + vertex.height, vertex.y);
    ctx.stroke();
  }

  ctx.restore();
}

function currentViewportWorldQuad(renderer) {
  return [
    renderer.screenToWorld(0, 0),
    renderer.screenToWorld(renderer.width, 0),
    renderer.screenToWorld(renderer.width, renderer.height),
    renderer.screenToWorld(0, renderer.height),
  ];
}

function buildInteractiveHtmlDocument(renderer, { title, autoPrint }) {
  const geometry = renderer.geometry;
  const summary = renderer.scene?.summary ?? null;
  const svg = buildExportSvgMarkup(renderer, title);
  const subtitle = summary
    ? `${summary.layers} layers · ${renderer.scene.vertices.length} vertices · ${renderer.scene.edges.length} edges`
    : "Portable GeneaQuilt snapshot";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeMarkup(title)}</title>
    <style>
      :root {
        color-scheme: light;
        --paper: #f7efe1;
        --panel: rgba(255, 251, 244, 0.92);
        --line: rgba(29, 37, 45, 0.14);
        --ink: #1d252d;
        --muted: #67727d;
        --accent: #d73b26;
      }

      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        font-family: Georgia, "Times New Roman", serif;
        color: var(--ink);
        background:
          radial-gradient(circle at top left, rgba(215, 59, 38, 0.1), transparent 34%),
          linear-gradient(160deg, #f3eadb, #efe4d0 60%, #f9f3e8);
      }

      .page {
        width: min(96vw, 1480px);
        margin: 0 auto;
        padding: 24px 0 32px;
      }

      .hero, .shell {
        border: 1px solid var(--line);
        border-radius: 24px;
        background: var(--panel);
        backdrop-filter: blur(12px);
        box-shadow: 0 24px 60px rgba(31, 41, 48, 0.12);
      }

      .hero {
        display: flex;
        justify-content: space-between;
        gap: 16px;
        padding: 20px 24px;
        margin-bottom: 16px;
        align-items: end;
      }

      h1 {
        margin: 0 0 6px;
        font-size: clamp(1.6rem, 2vw, 2.25rem);
      }

      .lede, .meta { margin: 0; color: var(--muted); }
      .shell { padding: 18px; }
      .controls {
        display: flex;
        gap: 10px;
        flex-wrap: wrap;
        align-items: center;
        margin-bottom: 14px;
      }

      button, input[type="range"] {
        accent-color: var(--accent);
      }

      button {
        border: 1px solid var(--line);
        border-radius: 999px;
        padding: 10px 14px;
        background: rgba(255, 255, 255, 0.88);
        color: var(--ink);
        font: inherit;
        cursor: pointer;
      }

      .field {
        display: inline-grid;
        grid-template-columns: auto 180px auto;
        gap: 10px;
        align-items: center;
        padding: 0 4px;
      }

      .stage {
        border: 1px solid var(--line);
        border-radius: 20px;
        overflow: hidden;
        background: rgba(255, 255, 255, 0.6);
        cursor: grab;
      }

      .stage.is-dragging {
        cursor: grabbing;
      }

      svg {
        display: block;
        width: 100%;
        height: min(78vh, 980px);
      }

      @media print {
        body { background: white; }
        .page { width: auto; padding: 0; }
        .hero, .shell, .stage { box-shadow: none; border: none; }
        .controls { display: none; }
        svg { height: auto; max-height: none; }
      }

      @media (max-width: 860px) {
        .hero { flex-direction: column; align-items: start; }
        .field {
          width: 100%;
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <main class="page">
      <section class="hero">
        <div>
          <h1>${escapeMarkup(title)}</h1>
          <p class="lede">${escapeMarkup(subtitle)}</p>
        </div>
        <p class="meta">Drag to pan, use the wheel to zoom, adjust the angle, or print to save a PDF.</p>
      </section>
      <section class="shell">
        <div class="controls">
          <button type="button" id="fit-button">Fit</button>
          <button type="button" id="zoom-out-button">Zoom out</button>
          <button type="button" id="zoom-in-button">Zoom in</button>
          <button type="button" id="angle-preset-button">Rotate -15°</button>
          <button type="button" id="angle-reset-button">Reset angle</button>
          <label class="field">
            <span>Angle</span>
            <input id="angle-input" type="range" min="-90" max="90" step="1" value="${formatExportNumber(renderer.rotationDegrees)}" />
            <strong id="angle-value">${escapeMarkup(formatAngle(renderer.rotationDegrees))}</strong>
          </label>
          <button type="button" id="print-button">Print / Save PDF</button>
        </div>
        <div class="stage" id="stage">
          ${svg}
        </div>
      </section>
    </main>
    <script>
      (() => {
        const svg = document.getElementById("snapshot-svg");
        const viewport = document.getElementById("snapshot-viewport");
        const rotationLayer = document.getElementById("snapshot-rotation");
        const stage = document.getElementById("stage");
        const fitButton = document.getElementById("fit-button");
        const zoomInButton = document.getElementById("zoom-in-button");
        const zoomOutButton = document.getElementById("zoom-out-button");
        const anglePresetButton = document.getElementById("angle-preset-button");
        const angleResetButton = document.getElementById("angle-reset-button");
        const angleInput = document.getElementById("angle-input");
        const angleValue = document.getElementById("angle-value");
        const printButton = document.getElementById("print-button");
        const viewBox = svg.getAttribute("viewBox").split(/\\s+/).map(Number);
        const viewBoxWidth = viewBox[2];
        const viewBoxHeight = viewBox[3];
        const centerX = Number(svg.dataset.centerX);
        const centerY = Number(svg.dataset.centerY);
        let zoom = 1;
        let panX = 0;
        let panY = 0;
        let angle = Number(svg.dataset.angle || 0);
        let dragState = null;

        function clamp(value, min, max) {
          return Math.min(max, Math.max(min, value));
        }

        function formatAngle(value) {
          const rounded = Math.round(value);
          return rounded === 0 ? "0°" : rounded > 0 ? "+" + rounded + "°" : rounded + "°";
        }

        function apply() {
          viewport.setAttribute("transform", "matrix(" + zoom + " 0 0 " + zoom + " " + panX + " " + panY + ")");
          rotationLayer.setAttribute("transform", "rotate(" + angle + " " + centerX + " " + centerY + ")");
          angleInput.value = String(Math.round(angle));
          angleValue.textContent = formatAngle(angle);
        }

        function resetView() {
          zoom = 1;
          panX = 0;
          panY = 0;
          apply();
        }

        fitButton.addEventListener("click", resetView);
        zoomInButton.addEventListener("click", () => {
          zoom = clamp(zoom * 1.15, 0.45, 8);
          apply();
        });
        zoomOutButton.addEventListener("click", () => {
          zoom = clamp(zoom / 1.15, 0.45, 8);
          apply();
        });
        anglePresetButton.addEventListener("click", () => {
          angle = -15;
          apply();
        });
        angleResetButton.addEventListener("click", () => {
          angle = 0;
          apply();
        });
        angleInput.addEventListener("input", () => {
          angle = Number(angleInput.value);
          apply();
        });
        printButton.addEventListener("click", () => window.print());

        stage.addEventListener("wheel", (event) => {
          event.preventDefault();
          zoom = clamp(zoom * Math.exp(-event.deltaY * 0.0014), 0.45, 8);
          apply();
        }, { passive: false });

        stage.addEventListener("pointerdown", (event) => {
          stage.setPointerCapture(event.pointerId);
          stage.classList.add("is-dragging");
          dragState = { x: event.clientX, y: event.clientY };
        });

        stage.addEventListener("pointermove", (event) => {
          if (!dragState) {
            return;
          }
          const dx = ((event.clientX - dragState.x) / stage.clientWidth) * viewBoxWidth;
          const dy = ((event.clientY - dragState.y) / stage.clientHeight) * viewBoxHeight;
          panX += dx;
          panY += dy;
          dragState = { x: event.clientX, y: event.clientY };
          apply();
        });

        function stopDrag(event) {
          if (!dragState) {
            return;
          }
          stage.releasePointerCapture(event.pointerId);
          stage.classList.remove("is-dragging");
          dragState = null;
        }

        stage.addEventListener("pointerup", stopDrag);
        stage.addEventListener("pointercancel", stopDrag);
        apply();

        if (${autoPrint ? "true" : "false"}) {
          window.setTimeout(() => window.print(), 220);
        }
      })();
    </script>
  </body>
</html>`;
}

function buildExportSvgMarkup(renderer, title) {
  const geometry = renderer.geometry;
  const center = sceneCenter(geometry);
  const bounds = computeRotatedBounds([geometry.bounds], renderer.rotationRadians, center);
  const padding = 28;
  const viewBox = {
    minX: bounds.minX - padding,
    minY: bounds.minY - padding,
    width: bounds.width + padding * 2,
    height: bounds.height + padding * 2,
  };
  const ranges = buildConnectionRanges(geometry.edges);

  return `<svg
  id="snapshot-svg"
  xmlns="http://www.w3.org/2000/svg"
  viewBox="${formatExportNumber(viewBox.minX)} ${formatExportNumber(viewBox.minY)} ${formatExportNumber(viewBox.width)} ${formatExportNumber(viewBox.height)}"
  data-center-x="${formatExportNumber(center.x)}"
  data-center-y="${formatExportNumber(center.y)}"
  data-angle="${formatExportNumber(renderer.rotationDegrees)}"
  aria-label="${escapeMarkup(title)}"
  role="img"
>
  <defs>
    <linearGradient id="paper-gradient" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#faf2e3" />
      <stop offset="50%" stop-color="#f1e6d2" />
      <stop offset="100%" stop-color="#f8f1e4" />
    </linearGradient>
    <pattern id="family-stripe-pattern" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <line x1="0" y1="0" x2="0" y2="6" stroke="rgba(124, 111, 83, 0.28)" stroke-width="1" />
    </pattern>
  </defs>
  <rect x="${formatExportNumber(viewBox.minX)}" y="${formatExportNumber(viewBox.minY)}" width="${formatExportNumber(viewBox.width)}" height="${formatExportNumber(viewBox.height)}" fill="url(#paper-gradient)" />
  <g id="snapshot-viewport">
    <g id="snapshot-rotation" transform="rotate(${formatExportNumber(renderer.rotationDegrees)} ${formatExportNumber(center.x)} ${formatExportNumber(center.y)})">
      ${buildExportGenerationMarkup(geometry)}
      ${buildExportGridMarkup(geometry, renderer, ranges)}
      ${buildExportHighlightMarkup(geometry, renderer)}
      ${buildExportEdgeMarkup(geometry, renderer)}
      ${buildExportVertexMarkup(geometry, renderer)}
    </g>
  </g>
</svg>`;
}

function buildExportGenerationMarkup(geometry) {
  return geometry.generations
    .map((generation) => {
      const parts = [];
      if (generation.personBand) {
        parts.push(
          `<rect x="${formatExportNumber(generation.personBand.x - 1)}" y="${formatExportNumber(generation.personBand.y)}" width="${formatExportNumber(generation.personBand.width + 2)}" height="${formatExportNumber(generation.personBand.height)}" fill="rgba(120, 120, 120, 0.14)" />`,
        );
      }
      if (generation.familyBand) {
        parts.push(
          `<rect x="${formatExportNumber(generation.familyBand.x)}" y="${formatExportNumber(generation.familyBand.y - 1)}" width="${formatExportNumber(generation.familyBand.width)}" height="${formatExportNumber(generation.familyBand.height + 2)}" fill="rgba(170, 170, 170, 0.14)" />`,
        );
      }
      return parts.join("");
    })
    .join("");
}

function buildExportGridMarkup(geometry, renderer, ranges) {
  return geometry.vertices
    .filter((vertex) => isVertexVisible(vertex, renderer))
    .map((vertex) => {
      if (vertex.kind === "person") {
        const range = ranges.personLookup.get(vertex.id);
        const minX = Math.min(vertex.x, range?.min ?? vertex.x);
        const maxX = Math.max(vertex.x + vertex.width, range?.max ?? vertex.x + vertex.width);
        const top = `<line x1="${formatExportNumber(minX)}" y1="${formatExportNumber(vertex.y)}" x2="${formatExportNumber(maxX)}" y2="${formatExportNumber(vertex.y)}" stroke="rgba(120, 120, 120, 0.32)" stroke-width="1" />`;
        const bottom = range
          ? ""
          : `<line x1="${formatExportNumber(vertex.x)}" y1="${formatExportNumber(vertex.y + vertex.height)}" x2="${formatExportNumber(vertex.x + vertex.width)}" y2="${formatExportNumber(vertex.y + vertex.height)}" stroke="rgba(120, 120, 120, 0.32)" stroke-width="1" />`;
        return `${top}${bottom}`;
      }

      const range = ranges.familyLookup.get(vertex.id);
      const minY = Math.min(vertex.y, range?.min ?? vertex.y);
      const maxY = Math.max(vertex.y + vertex.height, range?.max ?? vertex.y + vertex.height);
      return `<line x1="${formatExportNumber(vertex.x)}" y1="${formatExportNumber(minY)}" x2="${formatExportNumber(vertex.x)}" y2="${formatExportNumber(maxY)}" stroke="rgba(120, 120, 120, 0.32)" stroke-width="1" />
<line x1="${formatExportNumber(vertex.x + vertex.width)}" y1="${formatExportNumber(minY)}" x2="${formatExportNumber(vertex.x + vertex.width)}" y2="${formatExportNumber(maxY)}" stroke="rgba(120, 120, 120, 0.32)" stroke-width="1" />`;
    })
    .join("");
}

function buildExportHighlightMarkup(geometry, renderer) {
  if (!renderer.selectedId || !renderer.highlightConnectorColors.size) {
    return "";
  }

  return [...renderer.highlightConnectorColors.values()]
    .map((connector) => {
      const edge = geometry.edgeByIndex.get(connector.edge_index);
      if (!edge || !isEdgeVisible(edge, renderer)) {
        return "";
      }

      const from = geometry.vertexById.get(edge.from);
      const to = geometry.vertexById.get(edge.to);
      if (!from || !to || !isVertexVisible(from, renderer) || !isVertexVisible(to, renderer)) {
        return "";
      }

      const lines = [];
      const stroke = highlightConnectorStrokeColor(connector.color_indices);
      if (connector.show_from_connector) {
        lines.push(
          `<line x1="${formatExportNumber(from.centerX)}" y1="${formatExportNumber(from.centerY)}" x2="${formatExportNumber(edge.centerX)}" y2="${formatExportNumber(edge.centerY)}" stroke="${stroke}" stroke-width="4.25" stroke-linecap="round" />`,
        );
      }
      if (connector.show_to_connector) {
        lines.push(
          `<line x1="${formatExportNumber(edge.centerX)}" y1="${formatExportNumber(edge.centerY)}" x2="${formatExportNumber(to.centerX)}" y2="${formatExportNumber(to.centerY)}" stroke="${stroke}" stroke-width="4.25" stroke-linecap="round" />`,
        );
      }
      return lines.join("");
    })
    .join("");
}

function buildExportEdgeMarkup(geometry, renderer) {
  return geometry.edges
    .map((edge) => {
      const person = geometry.vertexById.get(edge.personId);
      const family = geometry.vertexById.get(edge.familyId);
      if (!person || !family || !isEdgeVisible(edge, renderer)) {
        return "";
      }

      const alpha = edgeAlpha(edge, renderer);
      if (alpha <= 0.01) {
        return "";
      }

      const highlightColors = renderer.highlightEdgeColors.get(edge.index);
      const highlighted = Boolean(highlightColors?.length);
      const searchRelated =
        renderer.searchMatches.has(edge.personId) || renderer.searchMatches.has(edge.familyId);
      const timelineRelated =
        renderer.timelineFocusIds.has(edge.personId) || renderer.timelineFocusIds.has(edge.familyId);
      const fill = highlighted
        ? highlightFillColor(highlightColors)
        : timelineRelated
          ? "rgba(53, 85, 250, 0.84)"
          : searchRelated
            ? "rgba(154, 93, 22, 0.88)"
            : "rgba(56, 63, 67, 0.78)";
      const size = Math.min(Math.min(edge.width, edge.height) * 0.62, 8.5);
      const x = edge.centerX - size / 2;
      const y = edge.centerY - size / 2;
      const stroke = highlighted ? ` stroke="rgba(255,255,255,0.88)" stroke-width="1.4"` : "";

      if (edge.sex === "M") {
        return `<rect x="${formatExportNumber(x)}" y="${formatExportNumber(y)}" width="${formatExportNumber(size)}" height="${formatExportNumber(size)}" fill="${fill}" opacity="${formatExportNumber(alpha)}"${stroke} />`;
      }
      if (edge.sex === "F") {
        return `<ellipse cx="${formatExportNumber(edge.centerX)}" cy="${formatExportNumber(edge.centerY)}" rx="${formatExportNumber(size / 2)}" ry="${formatExportNumber(size / 2)}" fill="${fill}" opacity="${formatExportNumber(alpha)}"${stroke} />`;
      }
      return `<polygon points="${formatExportNumber(edge.centerX)},${formatExportNumber(y)} ${formatExportNumber(x + size)},${formatExportNumber(y + size)} ${formatExportNumber(x)},${formatExportNumber(y + size)}" fill="${fill}" opacity="${formatExportNumber(alpha)}"${stroke} />`;
    })
    .join("");
}

function buildExportVertexMarkup(geometry, renderer) {
  return geometry.vertices
    .filter((vertex) => isVertexVisible(vertex, renderer))
    .map((vertex) => {
      const alpha = vertexAlpha(vertex, renderer);
      if (alpha <= 0.01) {
        return "";
      }
      return vertex.kind === "person"
        ? buildExportPersonMarkup(vertex, renderer, alpha)
        : buildExportFamilyMarkup(vertex, renderer, alpha);
    })
    .join("");
}

function buildExportPersonMarkup(vertex, renderer, alpha) {
  const selected = renderer.selectedId === vertex.id;
  const highlightColors = renderer.highlightVertexColors.get(vertex.id);
  const highlighted = Boolean(highlightColors?.length);
  const searched = renderer.searchMatches.has(vertex.id);
  const timelineFocused = renderer.timelineFocusIds.has(vertex.id);
  const highlightColor = highlightTextColor(highlightColors);
  const background = selected
    ? "rgba(255, 236, 232, 0.92)"
    : timelineFocused
      ? "rgba(232, 238, 255, 0.94)"
      : searched || highlighted
        ? "rgba(250, 244, 228, 0.88)"
        : null;
  const fill = selected
    ? "#d73b26"
    : timelineFocused
      ? "#3555fa"
      : highlighted
        ? highlightColor
        : searched
          ? "#9a5d16"
          : "#12181d";

  return `${background ? `<rect x="${formatExportNumber(vertex.x - 2)}" y="${formatExportNumber(vertex.y + 1)}" width="${formatExportNumber(vertex.width + 4)}" height="${formatExportNumber(vertex.height - 2)}" fill="${background}" opacity="${formatExportNumber(alpha)}" />` : ""}
<text x="${formatExportNumber(vertex.x)}" y="${formatExportNumber(vertex.y + 10.5)}" fill="${fill}" opacity="${formatExportNumber(alpha)}" font-family="Georgia, 'Times New Roman', serif" font-size="12">${escapeMarkup(vertex.label)}</text>`;
}

function buildExportFamilyMarkup(vertex, renderer, alpha) {
  const selected = renderer.selectedId === vertex.id;
  const highlightColors = renderer.highlightVertexColors.get(vertex.id);
  const highlighted = Boolean(highlightColors?.length);
  const searched = renderer.searchMatches.has(vertex.id);
  const timelineFocused = renderer.timelineFocusIds.has(vertex.id);
  const highlightColor = highlightTextColor(highlightColors);
  const overlay = selected
    ? "rgba(215, 59, 38, 0.28)"
    : timelineFocused
      ? "rgba(53, 85, 250, 0.18)"
      : searched
        ? "rgba(154, 93, 22, 0.2)"
        : highlighted
          ? highlightFillColorOverlay(highlightColors)
          : null;
  const stroke = selected
    ? "rgba(255,255,255,0.94)"
    : timelineFocused
      ? "rgba(53, 85, 250, 0.94)"
      : searched
        ? "rgba(255, 244, 226, 0.94)"
        : highlighted
          ? highlightStrokeColor(highlightColors)
          : FAMILY_BASE_STROKE;
  const labelFill = selected
    ? "white"
    : timelineFocused
      ? "#3555fa"
      : highlighted
        ? highlightColor
        : FAMILY_BASE_TEXT;
  const showLabel = renderer.expandedNames || selected || searched || timelineFocused || highlighted;

  return `<rect x="${formatExportNumber(vertex.x)}" y="${formatExportNumber(vertex.y)}" width="${formatExportNumber(vertex.width)}" height="${formatExportNumber(vertex.height)}" fill="${FAMILY_BASE_FILL}" opacity="${formatExportNumber(alpha)}" />
<rect x="${formatExportNumber(vertex.x)}" y="${formatExportNumber(vertex.y)}" width="${formatExportNumber(vertex.width)}" height="${formatExportNumber(vertex.height)}" fill="url(#family-stripe-pattern)" opacity="${formatExportNumber(alpha)}" />
${overlay ? `<rect x="${formatExportNumber(vertex.x)}" y="${formatExportNumber(vertex.y)}" width="${formatExportNumber(vertex.width)}" height="${formatExportNumber(vertex.height)}" fill="${overlay}" opacity="${formatExportNumber(alpha)}" />` : ""}
<rect x="${formatExportNumber(vertex.x)}" y="${formatExportNumber(vertex.y)}" width="${formatExportNumber(vertex.width)}" height="${formatExportNumber(vertex.height)}" fill="none" stroke="${stroke}" stroke-width="1" opacity="${formatExportNumber(alpha)}" />
${showLabel ? `<text x="${formatExportNumber(vertex.x + 2)}" y="${formatExportNumber(vertex.y + 10)}" fill="${labelFill}" opacity="${formatExportNumber(alpha)}" font-family="Georgia, 'Times New Roman', serif" font-size="10">${escapeMarkup(vertex.label)}</text>` : ""}`;
}

function formatExportNumber(value) {
  return Number.parseFloat(value.toFixed(2)).toString();
}

function formatAngle(value) {
  const rounded = Math.round(value);
  return rounded === 0 ? "0°" : rounded > 0 ? `+${rounded}°` : `${rounded}°`;
}

function escapeMarkup(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
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

function pointInPolygon(point, polygon) {
  let inside = false;

  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const current = polygon[index];
    const prior = polygon[previous];
    const intersects =
      current.y > point.y !== prior.y > point.y &&
      point.x <
        ((prior.x - current.x) * (point.y - current.y)) / ((prior.y - current.y) || Number.EPSILON) +
          current.x;

    if (intersects) {
      inside = !inside;
    }
  }

  return inside;
}

function pointToSegmentDistance(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSq = dx * dx + dy * dy || 1;
  const t = clamp(((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSq, 0, 1);
  const projectedX = start.x + dx * t;
  const projectedY = start.y + dy * t;
  return Math.hypot(point.x - projectedX, point.y - projectedY);
}
