import type { CanonicalDocument } from "../../domain/schema.ts";
import {
  calculateTwoPointerGesture,
  PINCH_ZOOM_DEAD_ZONE_PX,
  stabilizeTwoPointerGesture,
  type GesturePoint,
} from "../../twoPointerGesture.ts";
import {
  TRACKPAD_ZOOM_SPEED,
  trackpadZoomMultiplier,
  WHEEL_PAN_SPEED,
  wheelDeltaPixels,
  wheelGestureMode,
} from "../../zoomInteraction.js";
import type {
  AppTheme,
  SelectedRecordDetails,
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
import { recordDetails } from "./recordDetails.ts";
import type {
  DiagramBounds,
  DiagramEdge,
  DiagramGuide,
  DiagramNode,
  DiagramPoint,
  DiagramScene,
} from "./types.ts";

const SVG_NS = "http://www.w3.org/2000/svg";
const MIN_VIEWBOX_SIZE = 80;
const FIT_INSETS = {
  top: 126,
  right: 24,
  bottom: 96,
  left: 24,
} as const;
const RELATIONSHIP_NODE_MAX_FIT_SCALE = 1.35;

export class SvgDiagramView implements VisualizationInstance {
  readonly methodId: string;
  readonly #host: HTMLElement;
  readonly #document: CanonicalDocument;
  readonly #scene: DiagramScene;
  readonly #shell: HTMLElement;
  readonly #svg: SVGSVGElement;
  readonly #onSelectionChange: ((details: SelectedRecordDetails | null) => void) | undefined;
  readonly #nodeElements = new Map<string, SVGGraphicsElement[]>();
  readonly #nodesById: ReadonlyMap<string, DiagramNode>;
  readonly #fitInsets: Readonly<{ top: number; right: number; bottom: number; left: number }>;
  readonly #activePointers = new Map<number, GesturePoint>();
  readonly #fitToggle = new FitToggleState<DiagramBounds>((bounds) => ({ ...bounds }));
  readonly #resizeObserver: ResizeObserver;
  #viewBox: DiagramBounds;
  #selectedRecordId: string | null = null;
  #dragOrigin: { clientX: number; clientY: number; viewBox: DiagramBounds } | null = null;
  #pinchGesture: {
    firstPointerId: number;
    secondPointerId: number;
    startFirst: GesturePoint;
    startSecond: GesturePoint;
    startViewBox: DiagramBounds;
    worldAnchor: DiagramPoint;
  } | null = null;

  constructor(
    host: HTMLElement,
    document: CanonicalDocument,
    scene: DiagramScene,
    theme: AppTheme,
    onSelectionChange?: (details: SelectedRecordDetails | null) => void,
    fitInsets: Readonly<{ top: number; right: number; bottom: number; left: number }> = FIT_INSETS,
  ) {
    this.methodId = scene.methodId;
    this.#host = host;
    this.#document = document;
    this.#scene = scene;
    this.#nodesById = new Map(scene.nodes.map((node) => [node.id, node]));
    this.#onSelectionChange = onSelectionChange;
    this.#fitInsets = fitInsets;
    this.#viewBox = paddedBounds(scene.bounds);

    host.replaceChildren();
    host.dataset.diagramTheme = theme;
    const shell = documentCreate("div", "diagram-view");
    this.#shell = shell;
    const svg = createSvg("svg");
    svg.classList.add("diagram-view__svg");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", `${scene.title}. ${scene.description}`);
    svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    const title = createSvg("title");
    title.textContent = scene.title;
    const description = createSvg("desc");
    description.textContent = `${scene.description} ${scene.notes.join(" ")}`;
    const defs = createSvg("defs");
    const markerId = `diagram-arrow-${crypto.randomUUID()}`;
    defs.append(createArrowMarker(markerId));
    const viewport = createSvg("g");
    viewport.classList.add("diagram-view__viewport");
    svg.append(title, description, defs, viewport);
    shell.append(svg);
    if (scene.notes.length) {
      const note = documentCreate("details", "diagram-view__note");
      const summary = documentCreate("summary", "diagram-view__note-summary");
      summary.textContent = "Reading key";
      const copy = documentCreate("p", "diagram-view__note-copy");
      copy.textContent = `${scene.description} ${scene.notes.join(" ")}`;
      note.append(summary, copy);
      shell.append(note);
    }
    host.append(shell);
    this.#svg = svg;
    this.#resizeObserver = new ResizeObserver(() => this.#syncCanvasBackground());
    this.#resizeObserver.observe(shell);

    for (const guide of scene.guides ?? []) {
      viewport.append(renderGuide(guide));
    }
    for (const edge of scene.edges) {
      viewport.append(renderEdge(edge, markerId, defs));
    }
    for (const node of scene.nodes) {
      const element = renderNode(node);
      element.addEventListener("click", (event) => {
        event.stopPropagation();
        if (node.recordId) {
          this.select(node.recordId, false);
        }
      });
      element.addEventListener("keydown", (event) => {
        if ((event.key === "Enter" || event.key === " ") && node.recordId) {
          event.preventDefault();
          this.select(node.recordId, true);
        }
      });
      viewport.append(element);
      for (const recordId of [node.recordId, ...node.relatedRecordIds].filter((id): id is string =>
        Boolean(id),
      )) {
        const instances = this.#nodeElements.get(recordId) ?? [];
        instances.push(element);
        this.#nodeElements.set(recordId, instances);
      }
    }

    svg.addEventListener("click", (event) => {
      const target = event.target;
      if (target instanceof Element && target.closest(".diagram-node:not(.is-static)")) {
        return;
      }
      this.clearSelection();
    });
    svg.addEventListener("wheel", this.#handleWheel, { passive: false });
    svg.addEventListener("pointerdown", this.#handlePointerDown);
    svg.addEventListener("pointermove", this.#handlePointerMove);
    svg.addEventListener("pointerup", this.#handlePointerUp);
    svg.addEventListener("pointercancel", this.#handlePointerUp);
    this.fit();
  }

  fit(): void {
    const viewport = this.#svg.getBoundingClientRect();
    this.#viewBox = fitBoundsToViewport(
      this.#scene.bounds,
      viewport.width,
      viewport.height,
      this.#fitInsets,
      this.methodId === "relationship-nodes"
        ? RELATIONSHIP_NODE_MAX_FIT_SCALE
        : Number.POSITIVE_INFINITY,
    );
    this.#applyViewBox();
  }

  toggleFit(): boolean {
    const action = this.#fitToggle.toggle(this.#viewBox);
    if (action.kind === "restore") {
      this.#viewBox = action.state;
      this.#applyViewBox();
    } else {
      this.fit();
    }
    return this.#fitToggle.isFitted;
  }

  zoomBy(multiplier: number): void {
    this.#zoomAt(0.5, 0.5, multiplier);
  }

  setTheme(theme: AppTheme): void {
    this.#host.dataset.diagramTheme = theme;
  }

  setExpandedNames(expanded: boolean): void {
    this.#host.classList.toggle("diagram-names-compact", !expanded);
    for (const label of this.#svg.querySelectorAll<SVGTextElement>("[data-full-label]")) {
      label.textContent = expanded
        ? (label.dataset.fullLabel ?? "")
        : (label.dataset.compactLabel ?? label.dataset.fullLabel ?? "");
    }
  }

  search(query: string): VisualizationSearchResult[] {
    const normalized = query.trim().toLocaleLowerCase();
    this.#host.querySelectorAll(".is-search-match").forEach((element) => {
      element.classList.remove("is-search-match");
    });
    if (!normalized) {
      return [];
    }
    const results = this.#document.people
      .filter(
        (person) =>
          this.#nodeElements.has(person.id) &&
          person.display_name.toLocaleLowerCase().includes(normalized),
      )
      .slice(0, 50)
      .map((person) => ({ id: person.id, label: person.display_name, kind: "person" as const }));
    for (const result of results) {
      for (const element of this.#nodeElements.get(result.id) ?? []) {
        element.classList.add("is-search-match");
      }
    }
    return results;
  }

  select(id: string, center = false): void {
    this.clearSelection(false);
    const elements = this.#nodeElements.get(id) ?? [];
    for (const element of elements) {
      element.classList.add("is-selected");
    }
    this.#selectedRecordId = elements.length ? id : null;
    const details = recordDetails(this.#document, id);
    this.#onSelectionChange?.(details);
    if (center && elements[0]) {
      this.#centerElement(elements[0]);
    }
  }

  clearSelection(notify = true): void {
    if (this.#selectedRecordId) {
      for (const element of this.#nodeElements.get(this.#selectedRecordId) ?? []) {
        element.classList.remove("is-selected");
      }
    }
    this.#selectedRecordId = null;
    if (notify) {
      this.#onSelectionChange?.(null);
    }
  }

  projectionSummary(): VisualizationProjectionSummary {
    return this.#scene.projection;
  }

  async exportPng(mode: VisualizationExportMode = "current"): Promise<Blob> {
    const clone = this.#svg.cloneNode(true) as SVGSVGElement;
    let width = Math.max(1, this.#svg.clientWidth);
    let height = Math.max(1, this.#svg.clientHeight);
    if (mode === "complete") {
      const bounds = paddedBounds(this.#scene.bounds);
      clone.setAttribute(
        "viewBox",
        `${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}`,
      );
      const outputScale = Math.min(1, 8192 / Math.max(bounds.width, bounds.height));
      width = Math.max(1, Math.round(bounds.width * outputScale));
      height = Math.max(1, Math.round(bounds.height * outputScale));
    }
    clone.setAttribute("width", String(width));
    clone.setAttribute("height", String(height));
    clone.prepend(exportStyle(this.#host.dataset.diagramTheme === "dark"));
    return svgToPng(clone, width, height);
  }

  exportInteractiveHtml(title: string): string {
    const clone = this.#svg.cloneNode(true) as SVGSVGElement;
    const bounds = paddedBounds(this.#scene.bounds);
    const dark = this.#host.dataset.diagramTheme === "dark";
    clone.id = "standalone-diagram";
    clone.tabIndex = 0;
    clone.setAttribute("viewBox", `${bounds.minX} ${bounds.minY} ${bounds.width} ${bounds.height}`);
    clone.prepend(exportStyle(dark));
    return buildInteractiveSvgDocument({
      title,
      svgMarkup: new XMLSerializer().serializeToString(clone),
      dark,
    });
  }

  captureViewState(): VisualizationViewState {
    return createVisualizationViewState(this.methodId, this.#viewBox);
  }

  restoreViewState(state: VisualizationViewState): boolean {
    const { minX, minY, width, height } = state.camera;
    if (
      state.methodId !== this.methodId ||
      !isFiniteNumber(minX) ||
      !isFiniteNumber(minY) ||
      !isFiniteNumber(width) ||
      !isFiniteNumber(height) ||
      width < MIN_VIEWBOX_SIZE ||
      height < MIN_VIEWBOX_SIZE
    ) {
      return false;
    }
    this.#viewBox = { minX, minY, width, height };
    this.#applyViewBox();
    return true;
  }

  destroy(): void {
    this.#resizeObserver.disconnect();
    this.#svg.removeEventListener("wheel", this.#handleWheel);
    this.#svg.removeEventListener("pointerdown", this.#handlePointerDown);
    this.#svg.removeEventListener("pointermove", this.#handlePointerMove);
    this.#svg.removeEventListener("pointerup", this.#handlePointerUp);
    this.#svg.removeEventListener("pointercancel", this.#handlePointerUp);
    this.#host.replaceChildren();
  }

  #applyViewBox(): void {
    const { minX, minY, width, height } = this.#viewBox;
    this.#svg.setAttribute("viewBox", `${minX} ${minY} ${width} ${height}`);
    this.#syncCanvasBackground();
  }

  #syncCanvasBackground(): void {
    const viewport = this.#svg.getBoundingClientRect();
    if (!viewport.width || !viewport.height || !this.#viewBox.width || !this.#viewBox.height) {
      return;
    }
    const scale = Math.min(
      viewport.width / this.#viewBox.width,
      viewport.height / this.#viewBox.height,
    );
    const offsetX = (viewport.width - this.#viewBox.width * scale) / 2 - this.#viewBox.minX * scale;
    const offsetY =
      (viewport.height - this.#viewBox.height * scale) / 2 - this.#viewBox.minY * scale;
    this.#shell.style.setProperty("--diagram-canvas-x", `${offsetX}px`);
    this.#shell.style.setProperty("--diagram-canvas-y", `${offsetY}px`);
  }

  #syncPanningClass(): void {
    this.#shell.classList.toggle("is-panning", Boolean(this.#dragOrigin || this.#pinchGesture));
  }

  #zoomAt(relativeX: number, relativeY: number, multiplier: number): void {
    const factor = Math.max(0.2, Math.min(5, 1 / multiplier));
    const width = Math.max(MIN_VIEWBOX_SIZE, this.#viewBox.width * factor);
    const height = Math.max(MIN_VIEWBOX_SIZE, this.#viewBox.height * factor);
    const worldX = this.#viewBox.minX + this.#viewBox.width * relativeX;
    const worldY = this.#viewBox.minY + this.#viewBox.height * relativeY;
    this.#viewBox = {
      minX: worldX - width * relativeX,
      minY: worldY - height * relativeY,
      width,
      height,
    };
    this.#applyViewBox();
  }

  #centerElement(element: SVGGraphicsElement): void {
    const node = this.#nodesById.get(element.dataset.nodeId ?? "");
    if (!node) {
      return;
    }
    const bounds = { x: node.x, y: node.y, width: node.width, height: node.height };
    const viewport = this.#svg.getBoundingClientRect();
    const aspectRatio = viewport.width / Math.max(1, viewport.height);
    const readableWidth = Math.max(720, bounds.width * 8);
    const readableHeight = Math.max(480, bounds.height * 12);
    const width = Math.min(
      this.#viewBox.width,
      Math.max(readableWidth, readableHeight * aspectRatio),
    );
    const height = Math.min(this.#viewBox.height, width / Math.max(0.5, aspectRatio));
    this.#viewBox = {
      minX: bounds.x + bounds.width / 2 - width / 2,
      minY: bounds.y + bounds.height / 2 - height / 2,
      width,
      height,
    };
    this.#applyViewBox();
  }

  #handleWheel = (event: WheelEvent): void => {
    event.preventDefault();
    const bounds = this.#svg.getBoundingClientRect();
    if (wheelGestureMode(event) === "pan") {
      this.#viewBox = panViewBoxByPixels(
        this.#viewBox,
        wheelDeltaPixels(event.deltaX, event.deltaMode, bounds.width) * WHEEL_PAN_SPEED,
        wheelDeltaPixels(event.deltaY, event.deltaMode, bounds.height) * WHEEL_PAN_SPEED,
        bounds.width,
        bounds.height,
      );
      this.#applyViewBox();
      return;
    }

    const relativeX = bounds.width ? (event.clientX - bounds.left) / bounds.width : 0.5;
    const relativeY = bounds.height ? (event.clientY - bounds.top) / bounds.height : 0.5;
    this.#zoomAt(relativeX, relativeY, trackpadZoomMultiplier(event.deltaY, event.deltaMode));
  };

  #handlePointerDown = (event: PointerEvent): void => {
    if (event.button !== 0) {
      return;
    }
    const target = event.target;
    const startedOnRecord =
      target instanceof Element && Boolean(target.closest(".diagram-node:not(.is-static)"));
    this.#activePointers.set(event.pointerId, pointerPoint(event));
    if (shouldCaptureDiagramPointer(startedOnRecord, this.#activePointers.size)) {
      this.#svg.setPointerCapture(event.pointerId);
    }
    if (this.#activePointers.size >= 2) {
      this.#dragOrigin = null;
      if (!this.#pinchGesture) {
        this.#startPinchGesture();
      }
      this.#syncPanningClass();
      return;
    }
    this.#dragOrigin = startedOnRecord
      ? null
      : {
          clientX: event.clientX,
          clientY: event.clientY,
          viewBox: { ...this.#viewBox },
        };
    this.#syncPanningClass();
  };

  #handlePointerMove = (event: PointerEvent): void => {
    if (this.#activePointers.has(event.pointerId)) {
      this.#activePointers.set(event.pointerId, pointerPoint(event));
    }
    if (this.#pinchGesture) {
      this.#updatePinchGesture();
      return;
    }
    if (!this.#dragOrigin) {
      return;
    }
    const bounds = this.#svg.getBoundingClientRect();
    if (!bounds.width || !bounds.height) {
      return;
    }
    this.#viewBox = {
      ...this.#dragOrigin.viewBox,
      minX:
        this.#dragOrigin.viewBox.minX -
        ((event.clientX - this.#dragOrigin.clientX) / bounds.width) *
          this.#dragOrigin.viewBox.width,
      minY:
        this.#dragOrigin.viewBox.minY -
        ((event.clientY - this.#dragOrigin.clientY) / bounds.height) *
          this.#dragOrigin.viewBox.height,
    };
    this.#applyViewBox();
  };

  #handlePointerUp = (event: PointerEvent): void => {
    if (this.#svg.hasPointerCapture(event.pointerId)) {
      this.#svg.releasePointerCapture(event.pointerId);
    }
    const endedPinchPointer =
      event.pointerId === this.#pinchGesture?.firstPointerId ||
      event.pointerId === this.#pinchGesture?.secondPointerId;
    this.#activePointers.delete(event.pointerId);
    if (endedPinchPointer) {
      this.#pinchGesture = null;
      if (this.#activePointers.size >= 2) {
        this.#startPinchGesture();
        return;
      }
      const remaining = [...this.#activePointers.values()][0];
      this.#dragOrigin = remaining
        ? {
            clientX: remaining.x,
            clientY: remaining.y,
            viewBox: { ...this.#viewBox },
          }
        : null;
      this.#syncPanningClass();
      return;
    }
    if (!this.#pinchGesture) {
      this.#dragOrigin = null;
    }
    this.#syncPanningClass();
  };

  #startPinchGesture(): void {
    const pointers = [...this.#activePointers.entries()];
    const firstPointer = pointers[0];
    const secondPointer = pointers[1];
    if (!firstPointer || !secondPointer) {
      return;
    }
    const [firstPointerId, first] = firstPointer;
    const [secondPointerId, second] = secondPointer;
    const gesture = calculateTwoPointerGesture(first, second, first, second);
    const bounds = this.#svg.getBoundingClientRect();
    const relative = relativePoint(gesture.startMidpoint, bounds);
    this.#pinchGesture = {
      firstPointerId,
      secondPointerId,
      startFirst: first,
      startSecond: second,
      startViewBox: { ...this.#viewBox },
      worldAnchor: {
        x: this.#viewBox.minX + this.#viewBox.width * relative.x,
        y: this.#viewBox.minY + this.#viewBox.height * relative.y,
      },
    };
  }

  #updatePinchGesture(): void {
    const pinch = this.#pinchGesture;
    if (!pinch) {
      return;
    }
    const currentFirst = this.#activePointers.get(pinch.firstPointerId);
    const currentSecond = this.#activePointers.get(pinch.secondPointerId);
    if (!currentFirst || !currentSecond) {
      return;
    }
    const gesture = stabilizeTwoPointerGesture(
      calculateTwoPointerGesture(pinch.startFirst, pinch.startSecond, currentFirst, currentSecond),
    );
    const relative = relativePoint(gesture.currentMidpoint, this.#svg.getBoundingClientRect());
    this.#viewBox = pinchViewBox(pinch.startViewBox, pinch.worldAnchor, relative, gesture.scale);
    this.#applyViewBox();
  }
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function shouldCaptureDiagramPointer(
  startedOnRecord: boolean,
  activePointerCount: number,
): boolean {
  return !startedOnRecord || activePointerCount > 1;
}

export function pinchViewBox(
  start: DiagramBounds,
  worldAnchor: DiagramPoint,
  currentRelative: DiagramPoint,
  scale: number,
): DiagramBounds {
  const safeScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
  const factor = Math.max(
    1 / safeScale,
    MIN_VIEWBOX_SIZE / Math.max(1, start.width),
    MIN_VIEWBOX_SIZE / Math.max(1, start.height),
  );
  const width = start.width * factor;
  const height = start.height * factor;
  return {
    minX: worldAnchor.x - width * currentRelative.x,
    minY: worldAnchor.y - height * currentRelative.y,
    width,
    height,
  };
}

export function panViewBoxByPixels(
  start: DiagramBounds,
  deltaX: number,
  deltaY: number,
  viewportWidth: number,
  viewportHeight: number,
): DiagramBounds {
  return {
    ...start,
    minX: start.minX + (viewportWidth ? (deltaX / viewportWidth) * start.width : 0),
    minY: start.minY + (viewportHeight ? (deltaY / viewportHeight) * start.height : 0),
  };
}

function pointerPoint(event: PointerEvent): GesturePoint {
  return { x: event.clientX, y: event.clientY };
}

function relativePoint(
  point: GesturePoint,
  bounds: Pick<DOMRect, "left" | "top" | "width" | "height">,
): DiagramPoint {
  return {
    x: bounds.width ? (point.x - bounds.left) / bounds.width : 0.5,
    y: bounds.height ? (point.y - bounds.top) / bounds.height : 0.5,
  };
}

function renderEdge(edge: DiagramEdge, markerId: string, defs: SVGDefsElement): SVGPathElement {
  const path = createSvg("path");
  path.classList.add("diagram-edge", `diagram-edge--${edge.kind}`);
  if (edge.sex) path.classList.add(`is-${edge.sex.toLocaleLowerCase()}`);
  if (edge.uncertain) path.classList.add("is-uncertain");
  path.setAttribute("d", edgePathData(edge));
  if (edge.fade) {
    const gradientId = `diagram-fade-${crypto.randomUUID()}`;
    defs.append(createEdgeFadeGradient(edge, gradientId));
    path.style.stroke = `url(#${gradientId})`;
  }
  if (edge.directed) {
    path.setAttribute("marker-end", `url(#${markerId})`);
  }
  return path;
}

function createEdgeFadeGradient(edge: DiagramEdge, id: string): SVGLinearGradientElement {
  const gradient = createSvg("linearGradient");
  const start = edge.points[0] ?? { x: 0, y: 0 };
  const end = edge.points.at(-1) ?? start;
  gradient.id = id;
  gradient.setAttribute("gradientUnits", "userSpaceOnUse");
  gradient.setAttribute("x1", String(start.x));
  gradient.setAttribute("y1", String(start.y));
  gradient.setAttribute("x2", String(end.x));
  gradient.setAttribute("y2", String(end.y));
  const color =
    edge.sex === "M"
      ? "var(--accent, #456755)"
      : edge.sex === "F"
        ? "var(--rust, #b85e3f)"
        : "var(--ochre, #a87032)";
  const stops =
    edge.fade === "both"
      ? [
          ["0%", "0.08"],
          ["17%", "1"],
          ["83%", "1"],
          ["100%", "0.08"],
        ]
      : edge.fade === "start"
        ? [
            ["0%", "0.08"],
            ["22%", "1"],
            ["100%", "1"],
          ]
        : [
            ["0%", "1"],
            ["78%", "1"],
            ["100%", "0.08"],
          ];
  for (const [offset, opacity] of stops) {
    const stop = createSvg("stop");
    stop.setAttribute("offset", offset!);
    stop.setAttribute("stop-color", color);
    stop.setAttribute("stop-opacity", opacity!);
    gradient.append(stop);
  }
  return gradient;
}

function renderGuide(guide: DiagramGuide): SVGGElement {
  const group = createSvg("g");
  group.classList.add("diagram-guide", `diagram-guide--${guide.kind}`);
  group.setAttribute("aria-hidden", "true");
  group.dataset.guideId = guide.id;
  if (guide.kind === "circle") {
    const circle = createSvg("circle");
    circle.setAttribute("cx", String(guide.center.x));
    circle.setAttribute("cy", String(guide.center.y));
    circle.setAttribute("r", String(guide.radius));
    group.append(circle);
    if (guide.label) {
      group.append(guideLabel(guide.label, guide.center.x, guide.center.y - guide.radius));
    }
    return group;
  }
  const line = createSvg("line");
  line.setAttribute("x1", String(guide.from.x));
  line.setAttribute("y1", String(guide.from.y));
  line.setAttribute("x2", String(guide.to.x));
  line.setAttribute("y2", String(guide.to.y));
  group.append(line);
  if (guide.label) {
    group.append(guideLabel(guide.label, guide.from.x, guide.from.y));
  }
  return group;
}

function renderNode(node: DiagramNode): SVGGElement {
  const group = createSvg("g");
  group.classList.add("diagram-node", `diagram-node--${node.shape}`);
  if (node.emphasized) {
    group.classList.add("is-emphasized");
  }
  if (node.duplicate) {
    group.classList.add("is-duplicate");
  }
  if (node.guide) {
    group.classList.add("is-guide");
  }
  if (node.uncertain) {
    group.classList.add("is-uncertain");
  }
  group.setAttribute("transform", `translate(${node.x} ${node.y})`);
  if (node.guide) {
    group.setAttribute("aria-hidden", "true");
  } else if (node.recordId) {
    group.setAttribute("tabindex", "0");
    group.setAttribute("role", "button");
  } else {
    group.classList.add("is-static");
    group.setAttribute("role", "img");
  }
  if (!node.guide) {
    group.setAttribute(
      "aria-label",
      node.secondaryLabel ? `${node.label}, ${node.secondaryLabel}` : node.label,
    );
  }
  group.dataset.nodeId = node.id;
  if (node.recordId) {
    group.dataset.recordId = node.recordId;
  }

  if (!node.guide) {
    const title = createSvg("title");
    title.textContent = node.secondaryLabel ? `${node.label}, ${node.secondaryLabel}` : node.label;
    group.append(title);
  }

  const shape = nodeShape(node);
  shape.classList.add("diagram-node__shape");
  group.append(shape);
  if (node.labelVisible !== false) {
    const label = createSvg("text");
    label.classList.add("diagram-node__label");
    const labelX = node.labelX ?? node.width / 2;
    const labelY = node.labelY ?? node.height / 2 - (node.secondaryLabel ? 6 : 0);
    label.setAttribute("x", String(labelX));
    label.setAttribute("y", String(labelY));
    label.setAttribute("text-anchor", node.labelAnchor ?? "middle");
    label.setAttribute("dominant-baseline", "middle");
    if (node.labelRotation) {
      label.setAttribute("transform", `rotate(${node.labelRotation} ${labelX} ${labelY})`);
    }
    const labelWidth = node.labelMaxWidth ?? node.width;
    label.dataset.fullLabel = fitNodeLabel(node.label, labelWidth);
    label.dataset.compactLabel = fitNodeLabel(
      node.compactLabel ?? compactName(node.label),
      labelWidth,
    );
    label.textContent = label.dataset.fullLabel;
    group.append(label);
    if (node.secondaryLabel) {
      const secondaryLabel = createSvg("text");
      secondaryLabel.classList.add("diagram-node__secondary-label");
      secondaryLabel.setAttribute("x", String(labelX));
      secondaryLabel.setAttribute("y", String(labelY + 13));
      secondaryLabel.setAttribute("text-anchor", node.labelAnchor ?? "middle");
      secondaryLabel.setAttribute("dominant-baseline", "middle");
      if (node.labelRotation) {
        secondaryLabel.setAttribute(
          "transform",
          `rotate(${node.labelRotation} ${labelX} ${labelY + 13})`,
        );
      }
      secondaryLabel.textContent = fitNodeLabel(node.secondaryLabel, labelWidth);
      group.append(secondaryLabel);
    }
  }
  return group;
}

export function fitNodeLabel(label: string, width: number): string {
  const maximumCharacters = Math.max(4, Math.floor((width - 16) / 6.3));
  if (label.length <= maximumCharacters) {
    return label;
  }
  return `${label.slice(0, Math.max(1, maximumCharacters - 3)).trimEnd()}...`;
}

function nodeShape(node: DiagramNode): SVGGraphicsElement {
  if (node.shape === "sector") {
    const path = createSvg("path");
    path.setAttribute("d", node.pathData ?? "");
    return path;
  }
  if (node.shape === "label") {
    const rectangle = createSvg("rect");
    rectangle.setAttribute("width", String(node.width));
    rectangle.setAttribute("height", String(node.height));
    rectangle.setAttribute("rx", "2");
    return rectangle;
  }
  if (node.shape === "circle") {
    const circle = createSvg("ellipse");
    circle.setAttribute("cx", String(node.width / 2));
    circle.setAttribute("cy", String(node.height / 2));
    circle.setAttribute("rx", String(node.width / 2));
    circle.setAttribute("ry", String(node.height / 2));
    return circle;
  }
  if (node.shape === "triangle") {
    const polygon = createSvg("polygon");
    polygon.setAttribute(
      "points",
      `${node.width / 2},0 ${node.width},${node.height} 0,${node.height}`,
    );
    return polygon;
  }
  if (node.shape === "diamond") {
    const polygon = createSvg("polygon");
    polygon.setAttribute(
      "points",
      `${node.width / 2},0 ${node.width},${node.height / 2} ${node.width / 2},${node.height} 0,${node.height / 2}`,
    );
    return polygon;
  }
  const rectangle = createSvg("rect");
  rectangle.setAttribute("width", String(node.width));
  rectangle.setAttribute("height", String(node.height));
  rectangle.setAttribute("rx", node.shape === "family" ? "3" : "7");
  return rectangle;
}

function pathData(points: DiagramPoint[]): string {
  return points.map((point, index) => `${index ? "L" : "M"}${point.x} ${point.y}`).join(" ");
}

function edgePathData(edge: DiagramEdge): string {
  if (edge.curve === "smooth" && edge.points.length > 1) {
    return smoothPathData(edge.points);
  }
  if (edge.points.length !== 2 || !edge.curve) return pathData(edge.points);
  const start = edge.points[0];
  const end = edge.points[1];
  if (!start || !end) return pathData(edge.points);
  if (edge.curve === "vertical") {
    const controlOffset = (end.y - start.y) * 0.46;
    return `M${start.x} ${start.y} C${start.x} ${start.y + controlOffset} ${end.x} ${end.y - controlOffset} ${end.x} ${end.y}`;
  }
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const distance = Math.max(1, Math.hypot(dx, dy));
  const direction = stableEdgeDirection(edge.id);
  const bend = Math.min(88, distance * 0.12) * direction;
  const controlX = (start.x + end.x) / 2 - (dy / distance) * bend;
  const controlY = (start.y + end.y) / 2 + (dx / distance) * bend;
  return `M${start.x} ${start.y} Q${controlX} ${controlY} ${end.x} ${end.y}`;
}

function smoothPathData(points: DiagramPoint[]): string {
  const first = points[0];
  if (!first) return "";
  if (points.length === 2) {
    const edge: DiagramEdge = { id: "smooth", kind: "lifeline", points, curve: "vertical" };
    return edgePathData(edge);
  }
  let path = `M${first.x} ${first.y}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index]!;
    const next = points[index + 1]!;
    const previous = points[index - 1] ?? current;
    const after = points[index + 2] ?? next;
    const control1 = {
      x: current.x + (next.x - previous.x) / 6,
      y: current.y + (next.y - previous.y) / 6,
    };
    const control2 = {
      x: next.x - (after.x - current.x) / 6,
      y: next.y - (after.y - current.y) / 6,
    };
    path += ` C${control1.x} ${control1.y} ${control2.x} ${control2.y} ${next.x} ${next.y}`;
  }
  return path;
}

function guideLabel(label: string, x: number, y: number): SVGTextElement {
  const text = createSvg("text");
  text.classList.add("diagram-guide__label");
  text.setAttribute("x", String(x + 5));
  text.setAttribute("y", String(y - 5));
  text.textContent = label;
  return text;
}

function stableEdgeDirection(id: string): number {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) | 0;
  }
  return hash % 2 === 0 ? 1 : -1;
}

export function buildInteractiveSvgDocument({
  title,
  svgMarkup,
  dark,
}: {
  title: string;
  svgMarkup: string;
  dark: boolean;
}): string {
  const safeTitle = escapeText(title);
  const colors = dark
    ? {
        paper: "#171a17",
        panel: "#202620",
        stage: "#171d19",
        border: "#465149",
        ink: "#eef2ed",
        muted: "#b4beb7",
        accent: "#91b29c",
      }
    : {
        paper: "#f3eee5",
        panel: "#fffdf8",
        stage: "#edf1ec",
        border: "#d9d1c4",
        ink: "#2d312b",
        muted: "#6a6f65",
        accent: "#4b6958",
      };

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta
      http-equiv="Content-Security-Policy"
      content="default-src 'none'; img-src data: blob:; style-src 'unsafe-inline'; script-src 'unsafe-inline'"
    />
    <meta name="color-scheme" content="${dark ? "dark" : "light"}" />
    <title>${safeTitle}</title>
    <style>
      :root {
        color-scheme: ${dark ? "dark" : "light"};
        --paper: ${colors.paper};
        --panel: ${colors.panel};
        --stage: ${colors.stage};
        --border: ${colors.border};
        --ink: ${colors.ink};
        --muted: ${colors.muted};
        --accent: ${colors.accent};
      }

      * { box-sizing: border-box; }
      html, body { height: 100%; }
      body {
        margin: 0;
        overflow: hidden;
        color: var(--ink);
        background: var(--paper);
        font-family: "Avenir Next", Avenir, "Segoe UI", Helvetica, Arial, sans-serif;
      }

      .page {
        display: grid;
        grid-template-rows: auto minmax(0, 1fr);
        height: 100%;
        padding: 14px;
        gap: 10px;
      }

      .toolbar {
        display: flex;
        align-items: center;
        gap: 8px;
        min-width: 0;
        padding: 10px;
        border: 1px solid var(--border);
        border-radius: 12px;
        background: var(--panel);
        box-shadow: 0 8px 24px rgba(20, 31, 26, 0.09);
      }

      .title {
        min-width: 0;
        margin-right: auto;
      }

      h1 {
        overflow: hidden;
        margin: 0;
        font: 600 clamp(1rem, 2vw, 1.25rem) Georgia, serif;
        text-overflow: ellipsis;
        white-space: nowrap;
      }

      .title p {
        margin: 2px 0 0;
        color: var(--muted);
        font-size: 0.76rem;
      }

      button {
        flex: none;
        min-height: 38px;
        padding: 7px 11px;
        border: 1px solid var(--border);
        border-radius: 8px;
        color: var(--ink);
        background: var(--panel);
        font: inherit;
        cursor: pointer;
      }

      button:hover { border-color: var(--accent); }
      button:focus-visible, svg:focus-visible {
        outline: 3px solid color-mix(in srgb, var(--accent) 58%, transparent);
        outline-offset: 2px;
      }

      .stage {
        min-height: 0;
        overflow: hidden;
        border: 1px solid var(--border);
        border-radius: 12px;
        background: var(--stage);
        cursor: grab;
        touch-action: none;
      }

      .stage.is-dragging { cursor: grabbing; }
      svg {
        display: block;
        width: 100%;
        height: 100%;
        min-height: 0;
        touch-action: none;
        user-select: none;
      }

      .instructions {
        position: fixed;
        right: 24px;
        bottom: 22px;
        margin: 0;
        padding: 7px 10px;
        border: 1px solid var(--border);
        border-radius: 999px;
        color: var(--muted);
        background: color-mix(in srgb, var(--panel) 94%, transparent);
        font-size: 0.72rem;
        pointer-events: none;
      }

      @media (max-width: 720px) {
        .page { padding: 8px; }
        .toolbar { flex-wrap: wrap; }
        .title { width: 100%; }
        .instructions { display: none; }
      }

      @media print {
        body { overflow: visible; background: white; }
        .page { display: block; height: auto; padding: 0; }
        .toolbar, .instructions { display: none; }
        .stage { border: 0; border-radius: 0; }
        svg { width: 100%; height: auto; max-height: none; }
      }
    </style>
  </head>
  <body>
    <main class="page">
      <div class="toolbar" role="toolbar" aria-label="Visualization controls">
        <div class="title">
          <h1>${safeTitle}</h1>
          <p>Local standalone visualization · contains family information</p>
        </div>
        <button type="button" id="fit-button">Fit</button>
        <button type="button" id="zoom-out-button" aria-label="Zoom out">−</button>
        <button type="button" id="zoom-in-button" aria-label="Zoom in">+</button>
        <button type="button" id="print-button">Print / Save PDF</button>
      </div>
      <div class="stage" id="stage">
        ${svgMarkup}
      </div>
      <p class="instructions">Drag or two-finger scroll to move · pinch or use + / − to zoom · Home to fit</p>
    </main>
    <script>
      (() => {
        "use strict";
        const svg = document.getElementById("standalone-diagram");
        const stage = document.getElementById("stage");
        const fitButton = document.getElementById("fit-button");
        const zoomOutButton = document.getElementById("zoom-out-button");
        const zoomInButton = document.getElementById("zoom-in-button");
        const printButton = document.getElementById("print-button");
        const values = svg.getAttribute("viewBox").trim().split(/\\s+/).map(Number);
        const initialView = { minX: values[0], minY: values[1], width: values[2], height: values[3] };
        let view = { ...initialView };
        const pointers = new Map();
        let drag = null;
        let pinch = null;

        function clamp(value, minimum, maximum) {
          return Math.min(maximum, Math.max(minimum, value));
        }

        function point(event) {
          return { x: event.clientX, y: event.clientY };
        }

        function midpoint(first, second) {
          return { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
        }

        function distance(first, second) {
          return Math.hypot(second.x - first.x, second.y - first.y);
        }

        function relativePoint(clientPoint) {
          const bounds = svg.getBoundingClientRect();
          return {
            x: bounds.width ? clamp((clientPoint.x - bounds.left) / bounds.width, 0, 1) : 0.5,
            y: bounds.height ? clamp((clientPoint.y - bounds.top) / bounds.height, 0, 1) : 0.5,
          };
        }

        function worldPoint(clientPoint, sourceView) {
          const relative = relativePoint(clientPoint);
          return {
            x: sourceView.minX + sourceView.width * relative.x,
            y: sourceView.minY + sourceView.height * relative.y,
          };
        }

        function apply() {
          svg.setAttribute("viewBox", view.minX + " " + view.minY + " " + view.width + " " + view.height);
        }

        function fit() {
          view = { ...initialView };
          apply();
        }

        function zoomAt(clientPoint, multiplier) {
          const relative = relativePoint(clientPoint);
          const anchor = worldPoint(clientPoint, view);
          const factor = clamp(1 / multiplier, 0.2, 5);
          const width = clamp(view.width * factor, 80, initialView.width * 40);
          const height = clamp(view.height * factor, 80, initialView.height * 40);
          view = {
            minX: anchor.x - width * relative.x,
            minY: anchor.y - height * relative.y,
            width,
            height,
          };
          apply();
        }

        function beginPinch() {
          const entries = [...pointers.entries()];
          if (entries.length < 2) {
            pinch = null;
            return;
          }
          const first = entries[0];
          const second = entries[1];
          const startMidpoint = midpoint(first[1], second[1]);
          pinch = {
            firstId: first[0],
            secondId: second[0],
            first: first[1],
            second: second[1],
            startView: { ...view },
            worldAnchor: worldPoint(startMidpoint, view),
          };
          drag = null;
        }

        function updatePinch() {
          if (!pinch) return;
          const first = pointers.get(pinch.firstId);
          const second = pointers.get(pinch.secondId);
          if (!first || !second) return;
          const startDistance = Math.max(0.001, distance(pinch.first, pinch.second));
          const distanceDelta = distance(first, second) - startDistance;
          const intentionalDelta =
            Math.sign(distanceDelta) *
            Math.max(0, Math.abs(distanceDelta) - ${PINCH_ZOOM_DEAD_ZONE_PX});
          const scale = Math.max(0.001, (startDistance + intentionalDelta) / startDistance);
          const currentMidpoint = midpoint(first, second);
          const relative = relativePoint(currentMidpoint);
          const width = clamp(pinch.startView.width / scale, 80, initialView.width * 40);
          const height = clamp(pinch.startView.height / scale, 80, initialView.height * 40);
          view = {
            minX: pinch.worldAnchor.x - width * relative.x,
            minY: pinch.worldAnchor.y - height * relative.y,
            width,
            height,
          };
          apply();
        }

        function endPointer(event) {
          pointers.delete(event.pointerId);
          if (stage.hasPointerCapture(event.pointerId)) {
            stage.releasePointerCapture(event.pointerId);
          }
          if (pointers.size >= 2) {
            beginPinch();
            return;
          }
          pinch = null;
          const remaining = [...pointers.entries()][0];
          drag = remaining
            ? { id: remaining[0], point: remaining[1], startView: { ...view } }
            : null;
          stage.classList.toggle("is-dragging", Boolean(remaining));
        }

        fitButton.addEventListener("click", fit);
        zoomInButton.addEventListener("click", () => {
          const bounds = svg.getBoundingClientRect();
          zoomAt({ x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 }, 1.22);
        });
        zoomOutButton.addEventListener("click", () => {
          const bounds = svg.getBoundingClientRect();
          zoomAt({ x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 }, 0.82);
        });
        printButton.addEventListener("click", () => window.print());

        stage.addEventListener("wheel", (event) => {
          event.preventDefault();
          if (event.ctrlKey || event.metaKey) {
            const modeScale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 120 : 1;
            const delta = clamp(event.deltaY * modeScale, -100, 100);
            zoomAt(point(event), Math.exp(-delta * ${TRACKPAD_ZOOM_SPEED}));
            return;
          }
          const bounds = svg.getBoundingClientRect();
          const scaleX = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? bounds.width : 1;
          const scaleY = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? bounds.height : 1;
          view = {
            ...view,
            minX: view.minX + (bounds.width ? (event.deltaX * scaleX * ${WHEEL_PAN_SPEED} / bounds.width) * view.width : 0),
            minY: view.minY + (bounds.height ? (event.deltaY * scaleY * ${WHEEL_PAN_SPEED} / bounds.height) * view.height : 0),
          };
          apply();
        }, { passive: false });

        stage.addEventListener("pointerdown", (event) => {
          if (event.pointerType === "mouse" && event.button !== 0) return;
          stage.setPointerCapture(event.pointerId);
          pointers.set(event.pointerId, point(event));
          stage.classList.add("is-dragging");
          if (pointers.size >= 2) {
            beginPinch();
          } else {
            drag = { id: event.pointerId, point: point(event), startView: { ...view } };
          }
        });

        stage.addEventListener("pointermove", (event) => {
          if (!pointers.has(event.pointerId)) return;
          pointers.set(event.pointerId, point(event));
          if (pinch) {
            updatePinch();
            return;
          }
          if (!drag || drag.id !== event.pointerId) return;
          const bounds = svg.getBoundingClientRect();
          const dx = bounds.width ? ((event.clientX - drag.point.x) / bounds.width) * drag.startView.width : 0;
          const dy = bounds.height ? ((event.clientY - drag.point.y) / bounds.height) * drag.startView.height : 0;
          view = {
            minX: drag.startView.minX - dx,
            minY: drag.startView.minY - dy,
            width: drag.startView.width,
            height: drag.startView.height,
          };
          apply();
        });

        stage.addEventListener("pointerup", endPointer);
        stage.addEventListener("pointercancel", endPointer);

        svg.addEventListener("keydown", (event) => {
          const horizontal = view.width * 0.08;
          const vertical = view.height * 0.08;
          if (event.key === "ArrowLeft") view.minX -= horizontal;
          else if (event.key === "ArrowRight") view.minX += horizontal;
          else if (event.key === "ArrowUp") view.minY -= vertical;
          else if (event.key === "ArrowDown") view.minY += vertical;
          else if (event.key === "+" || event.key === "=") {
            const bounds = svg.getBoundingClientRect();
            zoomAt({ x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 }, 1.22);
          } else if (event.key === "-" || event.key === "_") {
            const bounds = svg.getBoundingClientRect();
            zoomAt({ x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 }, 0.82);
          } else if (event.key === "Home" || event.key === "0") {
            fit();
          } else {
            return;
          }
          event.preventDefault();
          apply();
        });

        apply();
      })();
    </script>
  </body>
</html>`;
}

export function fitBoundsToViewport(
  bounds: DiagramBounds,
  viewportWidth: number,
  viewportHeight: number,
  insets: Readonly<{ top: number; right: number; bottom: number; left: number }> = FIT_INSETS,
  maximumScale = Number.POSITIVE_INFINITY,
): DiagramBounds {
  const width = Math.max(1, bounds.width);
  const height = Math.max(1, bounds.height);
  const usableWidth = Math.max(1, viewportWidth - insets.left - insets.right);
  const usableHeight = Math.max(1, viewportHeight - insets.top - insets.bottom);
  const naturalScale = Math.max(0.0001, Math.min(usableWidth / width, usableHeight / height));
  const scale = Math.max(0.0001, Math.min(naturalScale, maximumScale));

  if (scale < naturalScale) {
    const horizontalBreathingRoom = Math.max(0, usableWidth / scale - width);
    const verticalBreathingRoom = Math.max(0, usableHeight / scale - height);
    return {
      minX: bounds.minX - insets.left / scale - horizontalBreathingRoom / 2,
      minY: bounds.minY - insets.top / scale - verticalBreathingRoom / 2,
      width: Math.max(80, viewportWidth / scale),
      height: Math.max(80, viewportHeight / scale),
    };
  }

  return {
    minX: bounds.minX - insets.left / scale,
    minY: bounds.minY - insets.top / scale,
    width: Math.max(80, width + (insets.left + insets.right) / scale),
    height: Math.max(80, height + (insets.top + insets.bottom) / scale),
  };
}

function paddedBounds(bounds: DiagramBounds): DiagramBounds {
  const fallbackPadding = 28;
  return {
    minX: bounds.minX - fallbackPadding,
    minY: bounds.minY - fallbackPadding,
    width: Math.max(80, bounds.width + fallbackPadding * 2),
    height: Math.max(80, bounds.height + fallbackPadding * 2),
  };
}

function createArrowMarker(id: string): SVGMarkerElement {
  const marker = createSvg("marker");
  marker.id = id;
  marker.setAttribute("viewBox", "0 0 10 10");
  marker.setAttribute("refX", "9");
  marker.setAttribute("refY", "5");
  marker.setAttribute("markerWidth", "5");
  marker.setAttribute("markerHeight", "5");
  marker.setAttribute("orient", "auto-start-reverse");
  const path = createSvg("path");
  path.setAttribute("d", "M 0 0 L 10 5 L 0 10 z");
  marker.append(path);
  return marker;
}

function exportStyle(dark: boolean): SVGStyleElement {
  const style = createSvg("style");
  style.textContent = `
    svg{background:${dark ? "#171d19" : "#f7f2e8"};font-family:Georgia,serif}
    .diagram-guide circle,.diagram-guide line{fill:none;stroke:${dark ? "#748078" : "#aeb9b1"};stroke-width:1;stroke-dasharray:4 7;opacity:.42;vector-effect:non-scaling-stroke}.diagram-guide__label{fill:${dark ? "#aab4ad" : "#657069"};font-size:10px;stroke:none}
    .diagram-edge{fill:none;stroke:${dark ? "#8d9a91" : "#53645b"};stroke-width:1.5;vector-effect:non-scaling-stroke}
    .diagram-edge--supplemental,.diagram-edge--drop{stroke:#9b958b;stroke-dasharray:5 5}.diagram-edge--marriage,.diagram-edge--lifeline{stroke-width:3}.diagram-edge--lifeline.is-m{stroke:${dark ? "#91b29c" : "#456755"}}.diagram-edge--lifeline.is-f{stroke:${dark ? "#e18868" : "#b85e3f"}}.diagram-edge--lifeline.is-u{stroke:${dark ? "#d2a362" : "#a87032"}}.diagram-edge--uncertain,.diagram-edge.is-uncertain{stroke-dasharray:4 4;opacity:.55}.diagram-edge--daughter{stroke-dasharray:4 4}
    marker path{fill:${dark ? "#8d9a91" : "#53645b"}}
    .diagram-node__shape{fill:${dark ? "#202923" : "#fffaf0"};stroke:${dark ? "#aab9af" : "#355646"};stroke-width:1.3;vector-effect:non-scaling-stroke}.diagram-node--label .diagram-node__shape{fill:transparent;stroke:none}.diagram-node.is-guide .diagram-node__shape{fill:${dark ? "rgba(32,41,35,.18)" : "rgba(255,250,240,.16)"};stroke:${dark ? "rgba(170,185,175,.3)" : "rgba(53,86,70,.24)"};stroke-width:.85}.diagram-node.is-uncertain .diagram-node__shape{stroke-dasharray:3 3;opacity:.72}.diagram-node.is-duplicate .diagram-node__shape{stroke:#c87552;stroke-width:2.4}
    .diagram-node--family .diagram-node__shape,.diagram-node--couple .diagram-node__shape{fill:${dark ? "#313126" : "#f2e4be"};stroke:#a96f32}
    .diagram-node__label{fill:${dark ? "#eef2ed" : "#203b31"};font-size:12px;pointer-events:none}.diagram-node__secondary-label{fill:${dark ? "#aab4ad" : "#657069"};font-size:10px;pointer-events:none}.is-selected .diagram-node__shape{fill:#c87552;stroke:#fff;stroke-width:2.5}.is-selected .diagram-node__secondary-label{fill:#fff}
  `;
  return style;
}

async function svgToPng(svg: SVGSVGElement, width: number, height: number): Promise<Blob> {
  const source = new XMLSerializer().serializeToString(svg);
  const sourceBlob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(sourceBlob);
  try {
    const image = new Image();
    image.decoding = "async";
    image.src = url;
    await image.decode();
    const scale = Math.min(
      2,
      8192 / Math.max(1, width),
      8192 / Math.max(1, height),
      Math.sqrt(32_000_000 / Math.max(1, width * height)),
    );
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("The browser could not prepare the PNG canvas.");
    }
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("The browser could not create the PNG file."));
        }
      }, "image/png");
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function createSvg<K extends keyof SVGElementTagNameMap>(name: K): SVGElementTagNameMap[K] {
  return document.createElementNS(SVG_NS, name);
}

function documentCreate<K extends keyof HTMLElementTagNameMap>(
  name: K,
  className: string,
): HTMLElementTagNameMap[K] {
  const element = document.createElement(name);
  element.className = className;
  return element;
}

function compactName(label: string): string {
  const [first] = label.trim().split(/\s+/);
  return first || label;
}

function escapeText(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    const replacements: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return replacements[character] ?? character;
  });
}
