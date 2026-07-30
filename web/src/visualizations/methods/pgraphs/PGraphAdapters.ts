import type { CanonicalDocument, CanonicalFamily } from "../../../domain/schema.ts";
import { createDiagramAdapter } from "../../diagram/createDiagramAdapter.ts";
import type {
  DiagramEdge,
  DiagramEdgeKind,
  DiagramNode,
  DiagramNodeShape,
  DiagramScene,
} from "../../diagram/types.ts";
import type { VisualizationContext } from "../../adapter.ts";
import {
  FAMILY_HEIGHT,
  HORIZONTAL_GAP,
  PERSON_HEIGHT,
  VERTICAL_GAP,
  boundsFromNodes,
  buildRelations,
  familyLabel,
  generationRanks,
  labelWidth,
  verticalElbow,
} from "../genealogyLayout.ts";

interface GraphVertex {
  id: string;
  recordId: string;
  relatedRecordIds: string[];
  label: string;
  shape: DiagramNodeShape;
  sex?: string | null;
  layer: number;
}

interface GraphArc {
  id: string;
  from: string;
  to: string;
  kind: DiagramEdgeKind;
  directed: boolean;
  recordId?: string;
}

interface GraphTransform {
  vertices: GraphVertex[];
  arcs: GraphArc[];
  description: string;
  rule: string;
  notes: string[];
}

export const oreGraphAdapter = createDiagramAdapter("ore", (context) =>
  buildOreGraphScene(context),
);

export const pGraphAdapter = createDiagramAdapter("pgraph", (context) => buildPGraphScene(context));

export const bipartitePGraphAdapter = createDiagramAdapter("bipartite-pgraph", (context) =>
  buildBipartitePGraphScene(context),
);

export function buildOreGraphScene(context: VisualizationContext): DiagramScene {
  return graphScene(context, "Ore graph", buildOreGraph(context.document));
}

export function buildPGraphScene(context: VisualizationContext): DiagramScene {
  return graphScene(context, "p-graph", buildPGraph(context.document));
}

export function buildBipartitePGraphScene(context: VisualizationContext): DiagramScene {
  return graphScene(context, "Bipartite p-graph", buildBipartitePGraph(context.document));
}

export function buildOreGraph(document: CanonicalDocument): GraphTransform {
  const relations = buildRelations(document);
  const ranks = generationRanks(document);
  const vertices = document.people.map<GraphVertex>((person) => ({
    id: `ore-person:${person.id}`,
    recordId: person.id,
    relatedRecordIds: [],
    label: person.display_name,
    shape: "person",
    sex: person.sex,
    layer: ranks.get(person.id) ?? 0,
  }));
  const arcs: GraphArc[] = [];
  for (const family of document.families) {
    if (family.husband_id && family.wife_id) {
      arcs.push({
        id: `ore-marriage:${family.id}`,
        from: `ore-person:${family.husband_id}`,
        to: `ore-person:${family.wife_id}`,
        kind: "marriage",
        directed: false,
        recordId: family.id,
      });
    }
    for (const childId of family.child_ids) {
      const child = relations.peopleById.get(childId);
      if (!child) {
        continue;
      }
      for (const parentId of [family.husband_id, family.wife_id]) {
        if (!parentId || !relations.peopleById.has(parentId)) {
          continue;
        }
        arcs.push({
          id: `ore-parent:${family.id}:${parentId}:${childId}`,
          from: `ore-person:${parentId}`,
          to: `ore-person:${childId}`,
          kind: child.sex === "F" ? "daughter" : child.sex === "M" ? "son" : "descent",
          directed: true,
          recordId: family.id,
        });
      }
    }
  }
  return {
    vertices,
    arcs,
    description:
      "One vertex represents each person, thick lines represent marriages, and a separate directed arc runs from each recorded parent to every child.",
    rule: "The literal Ore transformation from the Source GEDCOM; no parent-child line is merged.",
    notes: ["The repeated descent arcs are accurate to the Ore graph and can become messy."],
  };
}

export function buildPGraph(document: CanonicalDocument): GraphTransform {
  const relations = buildRelations(document);
  const ranks = generationRanks(document);
  const maxRank = Math.max(0, ...ranks.values());
  const vertices: GraphVertex[] = document.families.map((family) => ({
    id: familyVertexId(family.id),
    recordId: family.id,
    relatedRecordIds: [family.husband_id, family.wife_id].filter((id): id is string => Boolean(id)),
    label: familyLabel(relations, family),
    shape: "couple",
    layer: maxRank - familyRank(family, ranks),
  }));

  for (const person of document.people) {
    if ((relations.spouseFamiliesByPerson.get(person.id) ?? []).length === 0) {
      vertices.push({
        id: individualVertexId(person.id),
        recordId: person.id,
        relatedRecordIds: [],
        label: person.display_name,
        shape: "person",
        sex: person.sex,
        layer: maxRank - (ranks.get(person.id) ?? 0),
      });
    }
  }

  const arcs: GraphArc[] = [];
  for (const person of document.people) {
    const representations = relations.spouseFamiliesByPerson.get(person.id)?.length
      ? (relations.spouseFamiliesByPerson.get(person.id) ?? []).map((family) =>
          familyVertexId(family.id),
        )
      : [individualVertexId(person.id)];
    for (const parentFamily of relations.parentFamiliesByChild.get(person.id) ?? []) {
      for (const representation of representations) {
        if (representation === familyVertexId(parentFamily.id)) {
          continue;
        }
        arcs.push({
          id: `pgraph:${representation}:${parentFamily.id}:${person.id}`,
          from: representation,
          to: familyVertexId(parentFamily.id),
          kind: person.sex === "F" ? "daughter" : person.sex === "M" ? "son" : "descent",
          directed: true,
          recordId: parentFamily.id,
        });
      }
    }
  }

  return {
    vertices,
    arcs: uniqueArcs(arcs),
    description:
      "Each vertex is either an unmarried person or a couple. Directed arcs point from a child's person-or-couple vertex toward the child's recorded parent couple.",
    rule: "Mrvar and Batagelj's p-graph transformation; sons use solid arcs and daughters use dotted arcs.",
    notes: [
      "A person with multiple marriages appears in more than one couple vertex, exactly as the p-graph requires.",
    ],
  };
}

export function buildBipartitePGraph(document: CanonicalDocument): GraphTransform {
  const relations = buildRelations(document);
  const ranks = generationRanks(document);
  const maxRank = Math.max(0, ...ranks.values());
  const vertices: GraphVertex[] = [];
  for (const family of document.families) {
    vertices.push({
      id: familyVertexId(family.id),
      recordId: family.id,
      relatedRecordIds: [family.husband_id, family.wife_id].filter((id): id is string =>
        Boolean(id),
      ),
      label: familyLabel(relations, family),
      shape: "couple",
      layer: (maxRank - familyRank(family, ranks)) * 2,
    });
  }
  for (const person of document.people) {
    vertices.push({
      id: individualVertexId(person.id),
      recordId: person.id,
      relatedRecordIds: [],
      label: person.display_name,
      shape: person.sex === "M" ? "triangle" : person.sex === "F" ? "circle" : "diamond",
      sex: person.sex,
      layer: (maxRank - (ranks.get(person.id) ?? 0)) * 2 + 1,
    });
  }

  const arcs: GraphArc[] = [];
  for (const family of document.families) {
    for (const spouseId of [family.husband_id, family.wife_id]) {
      const spouse = spouseId ? relations.peopleById.get(spouseId) : null;
      if (!spouse) {
        continue;
      }
      arcs.push({
        id: `bipartite-spouse:${family.id}:${spouse.id}`,
        from: familyVertexId(family.id),
        to: individualVertexId(spouse.id),
        kind: spouse.sex === "F" ? "daughter" : spouse.sex === "M" ? "son" : "descent",
        directed: true,
        recordId: family.id,
      });
    }
  }
  for (const person of document.people) {
    for (const parentFamily of relations.parentFamiliesByChild.get(person.id) ?? []) {
      arcs.push({
        id: `bipartite-parent:${person.id}:${parentFamily.id}`,
        from: individualVertexId(person.id),
        to: familyVertexId(parentFamily.id),
        kind: person.sex === "F" ? "daughter" : person.sex === "M" ? "son" : "descent",
        directed: true,
        recordId: parentFamily.id,
      });
    }
  }

  return {
    vertices,
    arcs: uniqueArcs(arcs),
    description:
      "Couples are rectangles and people are separate sex-shaped vertices. Arcs alternate from couple to person and from person to recorded parent couple.",
    rule: "Mrvar and Batagelj's bipartite p-graph transformation; every person is explicit even when married more than once.",
    notes: ["The extra person layer removes the ordinary p-graph's remarriage ambiguity."],
  };
}

function graphScene(
  context: VisualizationContext,
  title: string,
  transform: GraphTransform,
): DiagramScene {
  const { nodes, edges } = layeredLayout(transform.vertices, transform.arcs);
  return {
    methodId: contextMethodId(title),
    title,
    description: transform.description,
    nodes,
    edges,
    bounds: boundsFromNodes(nodes),
    projection: {
      visiblePeople: context.document.people.length,
      totalPeople: context.document.people.length,
      visibleFamilies: context.document.families.length,
      totalFamilies: context.document.families.length,
      label: "Whole genealogy",
      rule: transform.rule,
    },
    notes: transform.notes,
  };
}

function layeredLayout(
  vertices: GraphVertex[],
  arcs: GraphArc[],
): { nodes: DiagramNode[]; edges: DiagramEdge[] } {
  const byLayer = new Map<number, GraphVertex[]>();
  for (const vertex of vertices) {
    const layer = Math.max(0, vertex.layer);
    const values = byLayer.get(layer) ?? [];
    values.push(vertex);
    byLayer.set(layer, values);
  }
  const adjacency = new Map<string, Set<string>>();
  for (const arc of arcs) {
    addNeighbor(adjacency, arc.from, arc.to);
    addNeighbor(adjacency, arc.to, arc.from);
  }
  const layers = [...byLayer.entries()].sort(([left], [right]) => left - right);
  for (const [, layer] of layers) {
    layer.sort(
      (left, right) => left.label.localeCompare(right.label) || left.id.localeCompare(right.id),
    );
  }
  for (let sweep = 0; sweep < 6; sweep += 1) {
    const orderedLayers = sweep % 2 === 0 ? layers : [...layers].reverse();
    const positions = new Map<string, number>();
    for (const [, layer] of layers) {
      layer.forEach((vertex, index) => positions.set(vertex.id, index));
    }
    for (const [, layer] of orderedLayers) {
      layer.sort((left, right) => {
        const leftScore = barycenter(left.id, adjacency, positions);
        const rightScore = barycenter(right.id, adjacency, positions);
        return leftScore - rightScore || left.id.localeCompare(right.id);
      });
    }
  }

  const widest = Math.max(
    1,
    ...layers.map(([, layer]) =>
      layer.reduce((width, vertex) => width + vertexWidth(vertex) + HORIZONTAL_GAP, 0),
    ),
  );
  const nodes: DiagramNode[] = [];
  for (const [layerNumber, layer] of layers) {
    const layerWidth = layer.reduce(
      (width, vertex) => width + vertexWidth(vertex) + HORIZONTAL_GAP,
      -HORIZONTAL_GAP,
    );
    let x = (widest - layerWidth) / 2;
    for (const vertex of layer) {
      const width = vertexWidth(vertex);
      const height = vertex.shape === "couple" ? FAMILY_HEIGHT : PERSON_HEIGHT;
      nodes.push({
        id: vertex.id,
        recordId: vertex.recordId,
        relatedRecordIds: vertex.relatedRecordIds,
        label: vertex.label,
        shape: vertex.shape,
        ...(vertex.sex !== undefined ? { sex: vertex.sex } : {}),
        x,
        y: layerNumber * (PERSON_HEIGHT + VERTICAL_GAP),
        width,
        height,
      });
      x += width + HORIZONTAL_GAP;
    }
  }
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const edges = arcs.flatMap<DiagramEdge>((arc) => {
    const from = nodesById.get(arc.from);
    const to = nodesById.get(arc.to);
    if (!from || !to) {
      return [];
    }
    return [
      {
        id: arc.id,
        points: from.y <= to.y ? verticalElbow(from, to) : verticalElbow(to, from).reverse(),
        kind: arc.kind,
        directed: arc.directed,
        recordId: arc.recordId ?? null,
      },
    ];
  });
  return { nodes, edges };
}

function familyRank(family: CanonicalFamily, ranks: ReadonlyMap<string, number>): number {
  return Math.max(
    0,
    ...[family.husband_id, family.wife_id]
      .filter((id): id is string => Boolean(id))
      .map((id) => ranks.get(id) ?? 0),
  );
}

function vertexWidth(vertex: GraphVertex): number {
  if (vertex.shape === "circle" || vertex.shape === "triangle" || vertex.shape === "diamond") {
    return Math.max(54, Math.min(126, labelWidth(vertex.label, 54, 126)));
  }
  return labelWidth(vertex.label, 94, vertex.shape === "couple" ? 230 : 190);
}

function barycenter(
  id: string,
  adjacency: ReadonlyMap<string, Set<string>>,
  positions: ReadonlyMap<string, number>,
): number {
  const neighbors = [...(adjacency.get(id) ?? [])]
    .map((neighbor) => positions.get(neighbor))
    .filter((position): position is number => position != null);
  if (!neighbors.length) {
    return positions.get(id) ?? 0;
  }
  return neighbors.reduce((sum, position) => sum + position, 0) / neighbors.length;
}

function addNeighbor(map: Map<string, Set<string>>, id: string, neighbor: string): void {
  const values = map.get(id) ?? new Set<string>();
  values.add(neighbor);
  map.set(id, values);
}

function familyVertexId(id: string): string {
  return `family:${id}`;
}

function individualVertexId(id: string): string {
  return `person:${id}`;
}

function uniqueArcs(arcs: GraphArc[]): GraphArc[] {
  const seen = new Set<string>();
  return arcs.filter((arc) => {
    const key = `${arc.from}|${arc.to}|${arc.kind}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function contextMethodId(title: string): string {
  if (title === "Ore graph") {
    return "ore";
  }
  return title === "p-graph" ? "pgraph" : "bipartite-pgraph";
}
