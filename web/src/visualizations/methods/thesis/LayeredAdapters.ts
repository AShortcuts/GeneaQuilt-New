import type { CanonicalDocument } from "../../../domain/schema.ts";
import type { VisualizationContext } from "../../adapter.ts";
import { createDiagramAdapter } from "../../diagram/createDiagramAdapter.ts";
import type { DiagramEdge, DiagramNode, DiagramPoint, DiagramScene } from "../../diagram/types.ts";
import {
  PERSON_HEIGHT,
  bottomCenter,
  boundsFromNodes,
  generationRanks,
  labelWidth,
  topCenter,
} from "../genealogyLayout.ts";
import { relationshipGenerationRanks } from "../structural/StructuralAdapters.ts";

interface LayerVertex {
  id: string;
  recordId: string | null;
  label: string;
  rank: number;
  sourceOrder: number;
  width: number;
  height: number;
  blockId: string;
  dummy: boolean;
}

interface DescentArc {
  id: string;
  fromId: string;
  toId: string;
  familyId: string;
}

interface RoutedArc extends DescentArc {
  routeIds: string[];
}

export const genericSugiyamaAdapter = createDiagramAdapter("sugiyama-default", (context) =>
  buildSugiyamaScene(context, false),
);

export const genealogySugiyamaAdapter = createDiagramAdapter("sugiyama-genealogy", (context) =>
  buildSugiyamaScene(context, true),
);

export function buildSugiyamaScene(
  context: VisualizationContext,
  genealogyAdapted: boolean,
): DiagramScene {
  const document = context.document;
  const ranks = genealogyAdapted
    ? relationshipGenerationRanks(document)
    : generationRanks(document);
  const spouseBlocks = genealogyAdapted ? spouseBlockIds(document) : new Map<string, string>();
  const peopleById = new Map(document.people.map((person) => [person.id, person]));
  const vertices: LayerVertex[] = document.people.map((person, sourceOrder) => ({
    id: person.id,
    recordId: person.id,
    label: person.display_name,
    rank: ranks.get(person.id) ?? 0,
    sourceOrder,
    width: labelWidth(person.display_name, 104, 172),
    height: PERSON_HEIGHT,
    blockId: genealogyAdapted ? (spouseBlocks.get(person.id) ?? person.id) : person.id,
    dummy: false,
  }));
  const descentArcs = directDescentArcs(document, peopleById);
  const routedArcs = addDummyVertices(vertices, descentArcs, ranks);
  const positioned = positionLayerVertices(vertices, routedArcs, genealogyAdapted);
  const positionedById = new Map(positioned.map((vertex) => [vertex.id, vertex]));
  const nodes = positioned
    .filter((vertex) => !vertex.dummy && vertex.recordId)
    .map<DiagramNode>((vertex) => {
      const person = peopleById.get(vertex.recordId ?? "");
      return {
        id: `${genealogyAdapted ? "genealogy" : "generic"}-sugiyama:${vertex.id}`,
        recordId: vertex.recordId,
        relatedRecordIds: [],
        label: vertex.label,
        shape: "person",
        ...(person ? { sex: person.sex } : {}),
        x: vertex.x - vertex.width / 2,
        y: vertex.y - vertex.height / 2,
        width: vertex.width,
        height: vertex.height,
      };
    });
  const nodesByRecordId = new Map(nodes.map((node) => [node.recordId, node]));
  const edges = routedArcs.flatMap<DiagramEdge>((arc) => {
    const from = nodesByRecordId.get(arc.fromId);
    const to = nodesByRecordId.get(arc.toId);
    if (!from || !to) return [];
    const dummyPoints = arc.routeIds
      .slice(1, -1)
      .map((id) => positionedById.get(id))
      .filter((vertex): vertex is PositionedLayerVertex => Boolean(vertex))
      .map((vertex) => ({ x: vertex.x, y: vertex.y }));
    return [
      {
        id: arc.id,
        points: [bottomCenter(from), ...dummyPoints, topCenter(to)],
        kind: "descent",
        directed: true,
        recordId: arc.familyId,
      },
    ];
  });
  if (genealogyAdapted) {
    for (const family of document.families) {
      if (!family.husband_id || !family.wife_id) continue;
      const husband = nodesByRecordId.get(family.husband_id);
      const wife = nodesByRecordId.get(family.wife_id);
      if (!husband || !wife) continue;
      edges.push({
        id: `genealogy-sugiyama-marriage:${family.id}`,
        points: [nodeSideCenter(husband, wife), nodeSideCenter(wife, husband)],
        kind: "marriage",
        directed: false,
        recordId: family.id,
      });
    }
  }

  return {
    methodId: genealogyAdapted ? "sugiyama-genealogy" : "sugiyama-default",
    title: genealogyAdapted ? "Genealogy-adapted Sugiyama hierarchy" : "Generic Sugiyama hierarchy",
    description: genealogyAdapted
      ? "Generation layers, spouse blocks, sibling-aware barycentric ordering, and direct parent-to-child arcs implement the thesis adaptations without inventing Family junctions."
      : "The four-stage Sugiyama framework assigns parent-child vertices to layers, inserts routing points for long arcs, applies barycentric crossing reduction, and then assigns coordinates.",
    nodes,
    edges,
    bounds: boundsFromNodes(nodes),
    projection: {
      visiblePeople: document.people.length,
      totalPeople: document.people.length,
      visibleFamilies: document.families.length,
      totalFamilies: document.families.length,
      label: genealogyAdapted
        ? "Whole genealogy with spouse constraints"
        : "Whole genealogy baseline",
      rule: genealogyAdapted
        ? "Parents stay above children, spouses share a layer and remain adjacent, and siblings inherit a common parent barycenter."
        : "Only directed parent-to-child arcs control the general layered layout; spouse relationships are not encoded.",
    },
    notes: genealogyAdapted
      ? [
          "A thick horizontal link identifies each recorded husband-wife Family.",
          "Children still receive literal arcs from each recorded parent. Without a Family junction, dense overlaps can make child ownership unclear.",
        ]
      : [
          "This is the intentionally generic baseline: it has no marriage link or spouse grouping.",
          "Layers communicate direction, but they do not by themselves identify nuclear families.",
        ],
  };
}

interface PositionedLayerVertex extends LayerVertex {
  x: number;
  y: number;
}

function directDescentArcs(
  document: CanonicalDocument,
  peopleById: ReadonlyMap<string, CanonicalDocument["people"][number]>,
): DescentArc[] {
  const arcs: DescentArc[] = [];
  for (const family of document.families) {
    for (const parentId of [family.husband_id, family.wife_id]) {
      if (!parentId || !peopleById.has(parentId)) continue;
      for (const childId of family.child_ids) {
        if (!peopleById.has(childId)) continue;
        arcs.push({
          id: `sugiyama-descent:${family.id}:${parentId}:${childId}`,
          fromId: parentId,
          toId: childId,
          familyId: family.id,
        });
      }
    }
  }
  return arcs;
}

function addDummyVertices(
  vertices: LayerVertex[],
  arcs: readonly DescentArc[],
  ranks: ReadonlyMap<string, number>,
): RoutedArc[] {
  return arcs.map((arc, arcIndex) => {
    const fromRank = ranks.get(arc.fromId) ?? 0;
    const toRank = ranks.get(arc.toId) ?? fromRank + 1;
    const routeIds = [arc.fromId];
    if (toRank > fromRank + 1) {
      for (let rank = fromRank + 1; rank < toRank; rank += 1) {
        const id = `sugiyama-dummy:${arcIndex}:${rank}`;
        vertices.push({
          id,
          recordId: null,
          label: "",
          rank,
          sourceOrder: vertices.length,
          width: 0,
          height: 0,
          blockId: id,
          dummy: true,
        });
        routeIds.push(id);
      }
    }
    routeIds.push(arc.toId);
    return { ...arc, routeIds };
  });
}

function positionLayerVertices(
  vertices: readonly LayerVertex[],
  arcs: readonly RoutedArc[],
  keepSpouseBlocks: boolean,
): PositionedLayerVertex[] {
  const byLayer = new Map<number, LayerVertex[]>();
  for (const vertex of vertices) {
    const layer = byLayer.get(vertex.rank) ?? [];
    layer.push(vertex);
    byLayer.set(vertex.rank, layer);
  }
  const layers = [...byLayer.entries()].sort(([left], [right]) => left - right);
  for (const [, layer] of layers) {
    layer.sort(
      (left, right) => left.sourceOrder - right.sourceOrder || left.id.localeCompare(right.id),
    );
  }
  const adjacency = new Map<string, Set<string>>();
  for (const arc of arcs) {
    for (let index = 0; index < arc.routeIds.length - 1; index += 1) {
      const from = arc.routeIds[index];
      const to = arc.routeIds[index + 1];
      if (!from || !to) continue;
      addNeighbor(adjacency, from, to);
      addNeighbor(adjacency, to, from);
    }
  }
  for (let sweep = 0; sweep < 10; sweep += 1) {
    const position = new Map<string, number>();
    for (const [, layer] of layers) {
      layer.forEach((vertex, index) => position.set(vertex.id, index));
    }
    const orderedLayers = sweep % 2 === 0 ? layers : [...layers].reverse();
    for (const [, layer] of orderedLayers) {
      sortLayer(layer, adjacency, position, keepSpouseBlocks);
    }
  }

  const layerWidths = layers.map(([, layer]) => measuredLayerWidth(layer, keepSpouseBlocks));
  const widest = Math.max(1, ...layerWidths);
  const positioned: PositionedLayerVertex[] = [];
  layers.forEach(([rank, layer], layerIndex) => {
    let x = (widest - (layerWidths[layerIndex] ?? 0)) / 2;
    layer.forEach((vertex, index) => {
      positioned.push({
        ...vertex,
        x: x + vertex.width / 2,
        y: rank * 116 + vertex.height / 2,
      });
      x += vertex.width + layerGap(layer, index, keepSpouseBlocks);
    });
  });
  return positioned;
}

function sortLayer(
  layer: LayerVertex[],
  adjacency: ReadonlyMap<string, Set<string>>,
  positions: ReadonlyMap<string, number>,
  keepBlocks: boolean,
): void {
  if (!keepBlocks) {
    layer.sort((left, right) => compareByBarycenter(left, right, adjacency, positions));
    return;
  }
  const blockMap = new Map<string, LayerVertex[]>();
  for (const vertex of layer) {
    const block = blockMap.get(vertex.blockId) ?? [];
    block.push(vertex);
    blockMap.set(vertex.blockId, block);
  }
  const blocks = [...blockMap.values()];
  blocks.sort((left, right) => {
    const leftCenter = average(left.map((vertex) => barycenter(vertex.id, adjacency, positions)));
    const rightCenter = average(right.map((vertex) => barycenter(vertex.id, adjacency, positions)));
    return (
      leftCenter - rightCenter ||
      Math.min(...left.map((vertex) => vertex.sourceOrder)) -
        Math.min(...right.map((vertex) => vertex.sourceOrder))
    );
  });
  layer.splice(
    0,
    layer.length,
    ...blocks.flatMap((block) =>
      block.sort(
        (left, right) => left.sourceOrder - right.sourceOrder || left.id.localeCompare(right.id),
      ),
    ),
  );
}

function compareByBarycenter(
  left: LayerVertex,
  right: LayerVertex,
  adjacency: ReadonlyMap<string, Set<string>>,
  positions: ReadonlyMap<string, number>,
): number {
  return (
    barycenter(left.id, adjacency, positions) - barycenter(right.id, adjacency, positions) ||
    left.sourceOrder - right.sourceOrder ||
    left.id.localeCompare(right.id)
  );
}

function barycenter(
  id: string,
  adjacency: ReadonlyMap<string, Set<string>>,
  positions: ReadonlyMap<string, number>,
): number {
  const neighbors = [...(adjacency.get(id) ?? [])]
    .map((neighbor) => positions.get(neighbor))
    .filter((value): value is number => value != null);
  return neighbors.length ? average(neighbors) : (positions.get(id) ?? 0);
}

function spouseBlockIds(document: CanonicalDocument): ReadonlyMap<string, string> {
  const sourceOrder = new Map(document.people.map((person, index) => [person.id, index]));
  const parent = new Map(document.people.map((person) => [person.id, person.id]));
  for (const family of document.families) {
    if (!family.husband_id || !family.wife_id) continue;
    union(parent, sourceOrder, family.husband_id, family.wife_id);
  }
  return new Map(document.people.map((person) => [person.id, find(parent, person.id)]));
}

function find(parent: Map<string, string>, id: string): string {
  let root = id;
  while (parent.get(root) && parent.get(root) !== root) root = parent.get(root) ?? root;
  let cursor = id;
  while (parent.get(cursor) && parent.get(cursor) !== root) {
    const next = parent.get(cursor);
    parent.set(cursor, root);
    if (!next) break;
    cursor = next;
  }
  return root;
}

function union(
  parent: Map<string, string>,
  sourceOrder: ReadonlyMap<string, number>,
  left: string,
  right: string,
): void {
  if (!parent.has(left) || !parent.has(right)) return;
  const leftRoot = find(parent, left);
  const rightRoot = find(parent, right);
  if (leftRoot === rightRoot) return;
  if ((sourceOrder.get(leftRoot) ?? Infinity) <= (sourceOrder.get(rightRoot) ?? Infinity)) {
    parent.set(rightRoot, leftRoot);
  } else {
    parent.set(leftRoot, rightRoot);
  }
}

function measuredLayerWidth(layer: readonly LayerVertex[], keepBlocks: boolean): number {
  return layer.reduce(
    (sum, vertex, index) => sum + vertex.width + layerGap(layer, index, keepBlocks),
    0,
  );
}

function layerGap(layer: readonly LayerVertex[], index: number, keepBlocks: boolean): number {
  if (index >= layer.length - 1) return 0;
  const current = layer[index];
  const next = layer[index + 1];
  if (keepBlocks && current && next && current.blockId === next.blockId) return 14;
  return 44;
}

function nodeSideCenter(node: DiagramNode, toward: DiagramNode): DiagramPoint {
  return toward.x >= node.x
    ? { x: node.x + node.width, y: node.y + node.height / 2 }
    : { x: node.x, y: node.y + node.height / 2 };
}

function addNeighbor(map: Map<string, Set<string>>, from: string, to: string): void {
  const neighbors = map.get(from) ?? new Set<string>();
  neighbors.add(to);
  map.set(from, neighbors);
}

function average(values: readonly number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}
