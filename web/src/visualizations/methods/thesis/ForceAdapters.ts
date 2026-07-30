import type { CanonicalDocument } from "../../../domain/schema.ts";
import type { VisualizationContext } from "../../adapter.ts";
import { createDiagramAdapter } from "../../diagram/createDiagramAdapter.ts";
import { separateNodesHorizontally } from "../../diagram/nodeGeometry.ts";
import type { DiagramEdge, DiagramNode, DiagramScene } from "../../diagram/types.ts";
import { boundsFromNodes, labelWidth } from "../genealogyLayout.ts";
import { relationshipGenerationRanks } from "../structural/StructuralAdapters.ts";

interface ForceState {
  id: string;
  x: number;
  y: number;
  rank: number;
  sourceOrder: number;
}

interface ForceLink {
  id: string;
  fromId: string;
  toId: string;
  familyId: string;
  kind: "descent" | "marriage";
}

interface SiblingLink {
  leftId: string;
  rightId: string;
}

interface QuadCell {
  x: number;
  y: number;
  size: number;
  mass: number;
  sumX: number;
  sumY: number;
  points: number[];
  children: QuadCell[] | null;
}

export interface ForceLayoutResult {
  states: ForceState[];
  links: ForceLink[];
}

export const genericForceAdapter = createDiagramAdapter("force-default", (context) =>
  buildForceScene(context, false),
);

export const genealogyForceAdapter = createDiagramAdapter("force-genealogy", (context) =>
  buildForceScene(context, true),
);

export const radialForceAdapter = createDiagramAdapter("force-radial", (context) =>
  buildRadialForceScene(context),
);

export function buildForceScene(
  context: VisualizationContext,
  genealogyAdapted: boolean,
): DiagramScene {
  const result = solveForceLayout(context.document, genealogyAdapted);
  const peopleById = new Map(context.document.people.map((person) => [person.id, person]));
  const nodes = result.states.map<DiagramNode>((state) => {
    const person = peopleById.get(state.id);
    const label = person?.display_name ?? state.id;
    const width = labelWidth(label, 104, 172);
    return {
      id: `${genealogyAdapted ? "genealogy" : "generic"}-force:${state.id}`,
      recordId: state.id,
      relatedRecordIds: [],
      label,
      shape: "person",
      ...(person ? { sex: person.sex } : {}),
      x: state.x - width / 2,
      y: state.y - 17,
      width,
      height: 34,
    };
  });
  separateNodesHorizontally(nodes, genealogyAdapted ? 16 : 12);
  const nodesById = new Map(nodes.map((node) => [node.recordId, node]));
  const edges = result.links.flatMap<DiagramEdge>((link) => {
    const from = nodesById.get(link.fromId);
    const to = nodesById.get(link.toId);
    if (!from || !to) return [];
    return [
      {
        id: `${genealogyAdapted ? "genealogy" : "generic"}-force-link:${link.id}`,
        points: [center(from), center(to)],
        kind: link.kind,
        directed: link.kind === "descent",
        recordId: link.familyId,
        curve: genealogyAdapted ? "vertical" : "arc",
      },
    ];
  });
  return {
    methodId: genealogyAdapted ? "force-genealogy" : "force-default",
    title: genealogyAdapted ? "Genealogy-adapted force layout" : "Generic force-directed graph",
    description: genealogyAdapted
      ? "Fruchterman-Reingold repulsion and edge springs are supplemented by sibling cohesion, spouse cohesion, generation springs, and centering."
      : "A deterministic circular start is relaxed with Fruchterman-Reingold repulsion, literal relationship-edge attraction, cooling, and no genealogical hierarchy constraint.",
    nodes,
    edges,
    bounds: boundsFromNodes(nodes),
    projection: {
      visiblePeople: context.document.people.length,
      totalPeople: context.document.people.length,
      visibleFamilies: context.document.families.length,
      totalFamilies: context.document.families.length,
      label: genealogyAdapted
        ? "Whole genealogy with semantic forces"
        : "Whole genealogy force baseline",
      rule: genealogyAdapted
        ? "Thesis Algorithm 3.4: standard forces plus sibling, generation, spouse, and centering terms."
        : "Thesis Algorithm 3.3 with literal spouse and parent-child graph edges but no generation or family grouping force.",
    },
    notes: genealogyAdapted
      ? [
          "Generation bands make this easier to orient than the generic force baseline.",
          "A deterministic rectangle-separation pass preserves the force order while guaranteeing that every Person card has its own space.",
          "The graph still draws a marriage line and a separate arc from each recorded parent to each child, so redundant lines can become messy.",
        ]
      : [
          "This is included as a general graph-layout baseline, not as a readable family-tree hierarchy.",
          "A deterministic rectangle-separation pass preserves vertical force positions while preventing Person cards from covering one another.",
          "Local clusters can be useful, but vertical position has no ancestor or descendant meaning.",
        ],
  };
}

export function solveForceLayout(
  document: CanonicalDocument,
  genealogyAdapted: boolean,
): ForceLayoutResult {
  const ranks = relationshipGenerationRanks(document);
  const peopleById = new Map(document.people.map((person) => [person.id, person]));
  const count = document.people.length;
  const idealLength = 142;
  const initialRadius = Math.max(idealLength, idealLength * Math.sqrt(Math.max(1, count)) * 0.72);
  const states = document.people.map<ForceState>((person, sourceOrder) => {
    const angle = -Math.PI / 2 + (sourceOrder / Math.max(1, count)) * Math.PI * 2;
    return {
      id: person.id,
      x: Math.cos(angle) * initialRadius,
      y: Math.sin(angle) * initialRadius,
      rank: ranks.get(person.id) ?? 0,
      sourceOrder,
    };
  });
  const stateIndex = new Map(states.map((state, index) => [state.id, index]));
  const links = forceLinks(document, peopleById);
  const siblings = siblingLinks(document, peopleById);
  const marriageLinks = links.filter((link) => link.kind === "marriage");
  const minimumRank = Math.min(0, ...states.map((state) => state.rank));
  const iterations = count <= 250 ? 120 : count <= 900 ? 80 : count <= 3_000 ? 46 : 28;
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    const forces = states.map(() => ({ x: 0, y: 0 }));
    const quad = buildQuadTree(states);
    for (let index = 0; index < states.length; index += 1) {
      applyBarnesHutRepulsion(index, states, quad, idealLength, forces[index]!);
    }
    for (const link of links) {
      applyAttraction(link.fromId, link.toId, 1, idealLength, states, stateIndex, forces);
    }
    if (genealogyAdapted) {
      const siblingCompression = 1.32 ** 3;
      for (const sibling of siblings) {
        applyAttraction(
          sibling.leftId,
          sibling.rightId,
          siblingCompression,
          idealLength,
          states,
          stateIndex,
          forces,
        );
      }
      for (const marriage of marriageLinks) {
        applyAttraction(
          marriage.fromId,
          marriage.toId,
          1.25,
          idealLength,
          states,
          stateIndex,
          forces,
        );
      }
      for (let index = 0; index < states.length; index += 1) {
        const state = states[index];
        const force = forces[index];
        if (!state || !force) continue;
        const targetY = (state.rank - minimumRank) * idealLength * 1.18;
        force.y += idealLength * (targetY - state.y);
        force.x += -state.x * 0.07;
      }
    } else {
      for (let index = 0; index < states.length; index += 1) {
        const state = states[index];
        const force = forces[index];
        if (!state || !force) continue;
        force.x += -state.x * 0.025;
        force.y += -state.y * 0.025;
      }
    }
    const temperature = idealLength * 0.52 * (1 - iteration / iterations) + 0.8;
    for (let index = 0; index < states.length; index += 1) {
      const state = states[index];
      const force = forces[index];
      if (!state || !force) continue;
      const magnitude = Math.max(1e-6, Math.hypot(force.x, force.y));
      const distance = Math.min(temperature, magnitude * 0.015);
      state.x += (force.x / magnitude) * distance;
      state.y += (force.y / magnitude) * distance;
    }
  }
  normalizeForcePositions(states);
  return { states, links };
}

export function buildRadialForceScene(context: VisualizationContext): DiagramScene {
  const document = context.document;
  const peopleById = new Map(document.people.map((person) => [person.id, person]));
  const ranks = relationshipGenerationRanks(document);
  const orderedLayers = radialLayerOrder(document, ranks);
  const positions = new Map<string, { x: number; y: number; radius: number; angle: number }>();
  let previousRadius = -190;
  const minimumSeparation = 182;
  for (const [rank, personIds] of orderedLayers) {
    const requiredRadius = (minimumSeparation * personIds.length) / (Math.PI * 2);
    const radius = Math.max(
      rank * 190,
      previousRadius + 190,
      personIds.length > 1 ? requiredRadius : 0,
    );
    previousRadius = radius;
    personIds.forEach((personId, index) => {
      const angle = -Math.PI / 2 + (index / Math.max(1, personIds.length)) * Math.PI * 2;
      positions.set(personId, {
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
        radius,
        angle,
      });
    });
  }
  const nodes = document.people.map<DiagramNode>((person) => {
    const position = positions.get(person.id) ?? { x: 0, y: 0 };
    const width = labelWidth(person.display_name, 104, 166);
    return {
      id: `radial-force:${person.id}`,
      recordId: person.id,
      relatedRecordIds: [],
      label: person.display_name,
      shape: "person",
      sex: person.sex,
      x: position.x - width / 2,
      y: position.y - 17,
      width,
      height: 34,
    };
  });
  const nodesById = new Map(nodes.map((node) => [node.recordId, node]));
  const links = forceLinks(document, peopleById);
  const edges = links.flatMap<DiagramEdge>((link) => {
    const from = nodesById.get(link.fromId);
    const to = nodesById.get(link.toId);
    if (!from || !to) return [];
    return [
      {
        id: `radial-force-link:${link.id}`,
        points: [center(from), center(to)],
        kind: link.kind,
        directed: link.kind === "descent",
        recordId: link.familyId,
        curve: "arc",
      },
    ];
  });
  return {
    methodId: "force-radial",
    title: "Radial genealogy force layout",
    description:
      "Spouse-aligned generations occupy concentric circles whose radii satisfy the thesis circumference bound; family-aware ordering keeps spouse and sibling blocks together where possible.",
    nodes,
    edges,
    guides: orderedLayers
      .map(([, personIds]) => positions.get(personIds[0] ?? "")?.radius ?? 0)
      .filter((radius, index, values) => radius > 0 && values.indexOf(radius) === index)
      .map((radius, index) => ({
        id: `radial-generation:${index}`,
        kind: "circle" as const,
        center: { x: 0, y: 0 },
        radius,
      })),
    bounds: boundsFromNodes(nodes),
    projection: {
      visiblePeople: document.people.length,
      totalPeople: document.people.length,
      visibleFamilies: document.families.length,
      totalFamilies: document.families.length,
      label: `Whole genealogy · ${orderedLayers.length} concentric generation layers`,
      rule: "For each generation g, radius r(g) is at least s·n(g)/(2π), while successive circles remain separated by one node band.",
    },
    notes: [
      "Radius encodes generation layer, not elapsed time or genealogical distance from one selected root.",
      "The circumference grows with wide generations, and literal parent and marriage lines can still cross through the center.",
    ],
  };
}

function forceLinks(
  document: CanonicalDocument,
  peopleById: ReadonlyMap<string, CanonicalDocument["people"][number]>,
): ForceLink[] {
  const links: ForceLink[] = [];
  for (const family of document.families) {
    if (
      family.husband_id &&
      family.wife_id &&
      peopleById.has(family.husband_id) &&
      peopleById.has(family.wife_id)
    ) {
      links.push({
        id: `marriage:${family.id}`,
        fromId: family.husband_id,
        toId: family.wife_id,
        familyId: family.id,
        kind: "marriage",
      });
    }
    for (const parentId of [family.husband_id, family.wife_id]) {
      if (!parentId || !peopleById.has(parentId)) continue;
      for (const childId of family.child_ids) {
        if (!peopleById.has(childId)) continue;
        links.push({
          id: `descent:${family.id}:${parentId}:${childId}`,
          fromId: parentId,
          toId: childId,
          familyId: family.id,
          kind: "descent",
        });
      }
    }
  }
  return links;
}

function siblingLinks(
  document: CanonicalDocument,
  peopleById: ReadonlyMap<string, CanonicalDocument["people"][number]>,
): SiblingLink[] {
  const links: SiblingLink[] = [];
  for (const family of document.families) {
    const children = family.child_ids.filter((childId) => peopleById.has(childId));
    for (let leftIndex = 0; leftIndex < children.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < children.length; rightIndex += 1) {
        const leftId = children[leftIndex];
        const rightId = children[rightIndex];
        if (leftId && rightId) links.push({ leftId, rightId });
      }
    }
  }
  return links;
}

function applyAttraction(
  fromId: string,
  toId: string,
  strength: number,
  idealLength: number,
  states: readonly ForceState[],
  stateIndex: ReadonlyMap<string, number>,
  forces: Array<{ x: number; y: number }>,
): void {
  const fromIndex = stateIndex.get(fromId);
  const toIndex = stateIndex.get(toId);
  if (fromIndex == null || toIndex == null) return;
  const from = states[fromIndex];
  const to = states[toIndex];
  const fromForce = forces[fromIndex];
  const toForce = forces[toIndex];
  if (!from || !to || !fromForce || !toForce) return;
  const dx = to.x - from.x || 0.001;
  const dy = to.y - from.y || 0.001;
  const distance = Math.max(0.1, Math.hypot(dx, dy));
  const componentFactor = strength * (distance / idealLength);
  const x = dx * componentFactor;
  const y = dy * componentFactor;
  fromForce.x += x;
  fromForce.y += y;
  toForce.x -= x;
  toForce.y -= y;
}

function buildQuadTree(states: readonly ForceState[]): QuadCell {
  if (!states.length) return newQuad(-1, -1, 2);
  const minX = Math.min(...states.map((state) => state.x));
  const maxX = Math.max(...states.map((state) => state.x));
  const minY = Math.min(...states.map((state) => state.y));
  const maxY = Math.max(...states.map((state) => state.y));
  const size = Math.max(2, maxX - minX, maxY - minY) * 1.001;
  const root = newQuad(minX, minY, size);
  states.forEach((_, index) => insertQuad(root, index, states, 0));
  return root;
}

function newQuad(x: number, y: number, size: number): QuadCell {
  return { x, y, size, mass: 0, sumX: 0, sumY: 0, points: [], children: null };
}

function insertQuad(
  cell: QuadCell,
  pointIndex: number,
  states: readonly ForceState[],
  depth: number,
): void {
  const point = states[pointIndex];
  if (!point) return;
  cell.mass += 1;
  cell.sumX += point.x;
  cell.sumY += point.y;
  if (!cell.children && (cell.points.length === 0 || depth >= 24)) {
    cell.points.push(pointIndex);
    return;
  }
  if (!cell.children) {
    cell.children = subdivide(cell);
    const existing = cell.points.splice(0);
    for (const existingIndex of existing) {
      const existingPoint = states[existingIndex];
      if (existingPoint) {
        insertQuad(
          quadForPoint(cell.children, cell, existingPoint),
          existingIndex,
          states,
          depth + 1,
        );
      }
    }
  }
  insertQuad(quadForPoint(cell.children, cell, point), pointIndex, states, depth + 1);
}

function subdivide(cell: QuadCell): QuadCell[] {
  const half = cell.size / 2;
  return [
    newQuad(cell.x, cell.y, half),
    newQuad(cell.x + half, cell.y, half),
    newQuad(cell.x, cell.y + half, half),
    newQuad(cell.x + half, cell.y + half, half),
  ];
}

function quadForPoint(
  children: QuadCell[],
  parent: QuadCell,
  point: Readonly<{ x: number; y: number }>,
): QuadCell {
  const east = point.x >= parent.x + parent.size / 2 ? 1 : 0;
  const south = point.y >= parent.y + parent.size / 2 ? 1 : 0;
  return children[south * 2 + east]!;
}

function applyBarnesHutRepulsion(
  pointIndex: number,
  states: readonly ForceState[],
  root: QuadCell,
  idealLength: number,
  force: { x: number; y: number },
): void {
  const point = states[pointIndex];
  if (!point) return;
  const stack = [root];
  while (stack.length) {
    const cell = stack.pop();
    if (!cell || cell.mass === 0) continue;
    if (!cell.children) {
      for (const otherIndex of cell.points) {
        if (otherIndex === pointIndex) continue;
        const other = states[otherIndex];
        if (!other) continue;
        addRepulsion(point, other.x, other.y, 1, idealLength, force);
      }
      continue;
    }
    const centerX = cell.sumX / cell.mass;
    const centerY = cell.sumY / cell.mass;
    const distance = Math.max(0.1, Math.hypot(point.x - centerX, point.y - centerY));
    const containsPoint =
      point.x >= cell.x &&
      point.x <= cell.x + cell.size &&
      point.y >= cell.y &&
      point.y <= cell.y + cell.size;
    if (!containsPoint && cell.size / distance < 0.72) {
      addRepulsion(point, centerX, centerY, cell.mass, idealLength, force);
    } else {
      stack.push(...cell.children);
    }
  }
}

function addRepulsion(
  point: Readonly<{ x: number; y: number }>,
  otherX: number,
  otherY: number,
  mass: number,
  idealLength: number,
  force: { x: number; y: number },
): void {
  const dx = point.x - otherX || 0.001;
  const dy = point.y - otherY || 0.001;
  const distanceSquared = Math.max(0.01, dx * dx + dy * dy);
  const factor = (idealLength * idealLength * mass) / distanceSquared;
  force.x += dx * factor;
  force.y += dy * factor;
}

function normalizeForcePositions(states: ForceState[]): void {
  if (!states.length) return;
  const minX = Math.min(...states.map((state) => state.x));
  const minY = Math.min(...states.map((state) => state.y));
  for (const state of states) {
    state.x -= minX;
    state.y -= minY;
  }
}

function radialLayerOrder(
  document: CanonicalDocument,
  ranks: ReadonlyMap<string, number>,
): Array<[number, string[]]> {
  const byRank = new Map<number, string[]>();
  for (const person of document.people) {
    const rank = ranks.get(person.id) ?? 0;
    const ids = byRank.get(rank) ?? [];
    ids.push(person.id);
    byRank.set(rank, ids);
  }
  const layers = [...byRank.entries()].sort(([left], [right]) => left - right);
  const sourceOrder = new Map(document.people.map((person, index) => [person.id, index]));
  const parentPositions = new Map<string, number>();
  const parentsByChild = new Map<string, string[]>();
  for (const family of document.families) {
    const parents = [family.husband_id, family.wife_id].filter((id): id is string => Boolean(id));
    for (const childId of family.child_ids) {
      const values = parentsByChild.get(childId) ?? [];
      for (const parentId of parents) if (!values.includes(parentId)) values.push(parentId);
      parentsByChild.set(childId, values);
    }
  }
  const spouseBlocks = radialSpouseBlocks(document, sourceOrder);
  for (const [, layer] of layers) {
    const blocks = new Map<string, string[]>();
    for (const personId of layer) {
      const blockId = spouseBlocks.get(personId) ?? personId;
      const values = blocks.get(blockId) ?? [];
      values.push(personId);
      blocks.set(blockId, values);
    }
    const orderedBlocks = [...blocks.values()].sort((left, right) => {
      const leftScore = parentBarycenter(left, parentsByChild, parentPositions, sourceOrder);
      const rightScore = parentBarycenter(right, parentsByChild, parentPositions, sourceOrder);
      return leftScore - rightScore;
    });
    layer.splice(
      0,
      layer.length,
      ...orderedBlocks.flatMap((block) =>
        block.sort((left, right) => (sourceOrder.get(left) ?? 0) - (sourceOrder.get(right) ?? 0)),
      ),
    );
    layer.forEach((personId, index) => parentPositions.set(personId, index));
  }
  return layers;
}

function radialSpouseBlocks(
  document: CanonicalDocument,
  sourceOrder: ReadonlyMap<string, number>,
): ReadonlyMap<string, string> {
  const parent = new Map(document.people.map((person) => [person.id, person.id]));
  for (const family of document.families) {
    if (!family.husband_id || !family.wife_id) continue;
    const left = findRoot(parent, family.husband_id);
    const right = findRoot(parent, family.wife_id);
    if (left === right || !parent.has(left) || !parent.has(right)) continue;
    if ((sourceOrder.get(left) ?? Infinity) <= (sourceOrder.get(right) ?? Infinity)) {
      parent.set(right, left);
    } else {
      parent.set(left, right);
    }
  }
  return new Map(document.people.map((person) => [person.id, findRoot(parent, person.id)]));
}

function findRoot(parent: Map<string, string>, id: string): string {
  let root = id;
  while (parent.get(root) && parent.get(root) !== root) root = parent.get(root) ?? root;
  return root;
}

function parentBarycenter(
  personIds: readonly string[],
  parentsByChild: ReadonlyMap<string, string[]>,
  positions: ReadonlyMap<string, number>,
  sourceOrder: ReadonlyMap<string, number>,
): number {
  const parentValues = personIds.flatMap((personId) =>
    (parentsByChild.get(personId) ?? [])
      .map((parentId) => positions.get(parentId))
      .filter((value): value is number => value != null),
  );
  if (parentValues.length) {
    return parentValues.reduce((sum, value) => sum + value, 0) / parentValues.length;
  }
  return Math.min(...personIds.map((personId) => sourceOrder.get(personId) ?? Infinity));
}

function center(node: DiagramNode): { x: number; y: number } {
  return { x: node.x + node.width / 2, y: node.y + node.height / 2 };
}
