import type {
  CanonicalDocument,
  CanonicalFamily,
  CanonicalPerson,
  RecordedDate,
} from "../../../domain/schema.ts";
import type { VisualizationContext } from "../../adapter.ts";
import { createDiagramAdapter } from "../../diagram/createDiagramAdapter.ts";
import type { DiagramEdge, DiagramNode, DiagramScene } from "../../diagram/types.ts";
import {
  HORIZONTAL_GAP,
  PERSON_HEIGHT,
  boundsFromNodes,
  bottomCenter,
  buildRelations,
  familyLabel,
  labelWidth,
  topCenter,
  verticalElbow,
} from "../genealogyLayout.ts";

type TraversalStrategy = "bfs" | "dfs";

interface DescentArc {
  id: string;
  familyId: string;
  parentId: string;
  childId: string;
}

export interface TraversalProjection {
  strategy: TraversalStrategy;
  rootPersonId: string;
  orderedPersonIds: string[];
  depthByPerson: ReadonlyMap<string, number>;
  arcs: DescentArc[];
  familyIds: ReadonlySet<string>;
}

interface RelationshipVertex {
  id: string;
  recordId: string;
  relatedRecordIds: string[];
  label: string;
  secondaryLabel?: string;
  sex?: string | null;
  kind: "person" | "family";
  layer: number;
  sourceOrder: number;
}

interface RelationshipArc {
  id: string;
  from: string;
  to: string;
  recordId: string;
  kind: "family" | "descent";
}

export const relationshipNodeAdapter = createDiagramAdapter("relationship-nodes", (context) =>
  buildRelationshipNodeScene(context),
);

export const bfsAdapter = createDiagramAdapter("bfs", (context) =>
  buildTraversalScene(context, "bfs"),
);

export const dfsAdapter = createDiagramAdapter("dfs", (context) =>
  buildTraversalScene(context, "dfs"),
);

export function buildRelationshipNodeScene(context: VisualizationContext): DiagramScene {
  const document = context.document;
  const relations = buildRelations(document);
  const ranks = relationshipGenerationRanks(document);
  const vertices: RelationshipVertex[] = document.people.map((person, sourceOrder) => {
    const secondaryLabel = relationshipLifeSpan(person);
    return {
      id: personVertexId(person.id),
      recordId: person.id,
      relatedRecordIds: [],
      label: person.display_name,
      ...(secondaryLabel ? { secondaryLabel } : {}),
      sex: person.sex,
      kind: "person",
      layer: (ranks.get(person.id) ?? 0) * 2,
      sourceOrder,
    };
  });
  const arcs: RelationshipArc[] = [];

  document.families.forEach((family, familyIndex) => {
    vertices.push({
      id: familyVertexId(family.id),
      recordId: family.id,
      relatedRecordIds: [family.husband_id, family.wife_id, ...family.child_ids].filter(
        (id): id is string => Boolean(id && relations.peopleById.has(id)),
      ),
      label: `Family: ${familyLabel(relations, family)}`,
      kind: "family",
      layer: relationshipFamilyLayer(family, ranks),
      sourceOrder: document.people.length + familyIndex,
    });
    for (const parentId of [family.husband_id, family.wife_id]) {
      if (!parentId || !relations.peopleById.has(parentId)) continue;
      arcs.push({
        id: `relationship-parent:${family.id}:${parentId}`,
        from: personVertexId(parentId),
        to: familyVertexId(family.id),
        recordId: family.id,
        kind: "family",
      });
    }
    for (const childId of family.child_ids) {
      if (!relations.peopleById.has(childId)) continue;
      arcs.push({
        id: `relationship-child:${family.id}:${childId}`,
        from: familyVertexId(family.id),
        to: personVertexId(childId),
        recordId: family.id,
        kind: "descent",
      });
    }
  });

  const { nodes, edges } = relationshipLayeredLayout(vertices, arcs);
  return {
    methodId: "relationship-nodes",
    title: "Relationship-node hierarchy",
    description:
      "Every person appears once. Each recorded Family is a small junction that joins its husband and wife to only that Family's children.",
    nodes,
    edges,
    bounds: boundsFromNodes(nodes),
    projection: {
      visiblePeople: document.people.length,
      totalPeople: document.people.length,
      visibleFamilies: document.families.length,
      totalFamilies: document.families.length,
      label: "Whole genealogy",
      rule: "One Person node per record and one auxiliary relationship node per binary Family; no direct duplicate parent-to-child edge is added.",
    },
    notes: [
      "Family junctions remove the small undirected cycle created by drawing both parents directly to every child.",
      "Consanguinity and other reconvergent paths remain visible; the method does not pretend the whole genealogy is a tree.",
    ],
  };
}

export function buildTraversalScene(
  context: VisualizationContext,
  strategy: TraversalStrategy,
): DiagramScene {
  const rootPersonId = requireFocalPerson(context);
  const traversal = buildTraversalProjection(context.document, rootPersonId, strategy);
  const peopleById = new Map(context.document.people.map((person) => [person.id, person]));
  const nodes = traversalNodes(traversal, peopleById);
  const nodesByRecordId = new Map(nodes.map((node) => [node.recordId, node]));
  const edges = traversal.arcs.flatMap<DiagramEdge>((arc) => {
    const from = nodesByRecordId.get(arc.parentId);
    const to = nodesByRecordId.get(arc.childId);
    if (!from || !to) return [];
    return [
      {
        id: arc.id,
        points: [bottomCenter(from), topCenter(to)],
        kind: "descent",
        directed: false,
        recordId: arc.familyId,
      },
    ];
  });
  const rootName = peopleById.get(rootPersonId)?.display_name ?? rootPersonId;
  const isBfs = strategy === "bfs";
  return {
    methodId: strategy,
    title: isBfs ? "Breadth-first layered tree" : "Depth-first traversal tree",
    description: isBfs
      ? "People are grouped by minimum parent-to-child hop count from the chosen root and spaced evenly inside each layer."
      : "People are placed left to right in first-visit depth-first order, with vertical position equal to traversal depth.",
    nodes,
    edges,
    bounds: boundsFromNodes(nodes),
    projection: {
      visiblePeople: traversal.orderedPersonIds.length,
      totalPeople: context.document.people.length,
      visibleFamilies: traversal.familyIds.size,
      totalFamilies: context.document.families.length,
      label: `${isBfs ? "BFS" : "DFS"} descendants from ${rootName}`,
      rule: isBfs
        ? "Algorithm 3.1: shortest directed descent distance determines the row; source-order traversal determines the stable position within a row."
        : "Algorithm 3.2: first-visit DFS order determines x and traversal depth determines y.",
    },
    notes: [
      "Spouses, ancestors, and records outside the directed descendant traversal are omitted.",
      isBfs
        ? "A row is hop count from the root, not necessarily a strict biological generation; retained descent lines can cross."
        : "Visit order dominates the picture, so people at the same depth may be far apart and generations are difficult to scan.",
    ],
  };
}

export function buildTraversalProjection(
  document: CanonicalDocument,
  rootPersonId: string,
  strategy: TraversalStrategy,
): TraversalProjection {
  const knownPeople = new Set(document.people.map((person) => person.id));
  if (!knownPeople.has(rootPersonId)) {
    throw new Error(`Traversal root ${rootPersonId} is not in the active Genealogy Document.`);
  }
  const childLinksByParent = new Map<string, Array<{ childId: string; familyId: string }>>();
  const allArcs: DescentArc[] = [];
  for (const family of document.families) {
    for (const parentId of [family.husband_id, family.wife_id]) {
      if (!parentId || !knownPeople.has(parentId)) continue;
      for (const childId of family.child_ids) {
        if (!knownPeople.has(childId)) continue;
        const arc = {
          id: `traversal:${family.id}:${parentId}:${childId}`,
          familyId: family.id,
          parentId,
          childId,
        };
        allArcs.push(arc);
        const links = childLinksByParent.get(parentId) ?? [];
        if (!links.some((link) => link.childId === childId)) {
          links.push({ childId, familyId: family.id });
          childLinksByParent.set(parentId, links);
        }
      }
    }
  }

  const orderedPersonIds: string[] = [];
  const depthByPerson = new Map<string, number>([[rootPersonId, 0]]);
  const visited = new Set<string>();
  if (strategy === "bfs") {
    const queue = [rootPersonId];
    visited.add(rootPersonId);
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const personId = queue[cursor];
      if (!personId) continue;
      orderedPersonIds.push(personId);
      for (const link of childLinksByParent.get(personId) ?? []) {
        if (visited.has(link.childId)) continue;
        visited.add(link.childId);
        depthByPerson.set(link.childId, (depthByPerson.get(personId) ?? 0) + 1);
        queue.push(link.childId);
      }
    }
  } else {
    const stack: Array<{ personId: string; depth: number }> = [
      { personId: rootPersonId, depth: 0 },
    ];
    while (stack.length) {
      const current = stack.pop();
      if (!current || visited.has(current.personId)) continue;
      visited.add(current.personId);
      depthByPerson.set(current.personId, current.depth);
      orderedPersonIds.push(current.personId);
      const children = childLinksByParent.get(current.personId) ?? [];
      for (let index = children.length - 1; index >= 0; index -= 1) {
        const child = children[index];
        if (child && !visited.has(child.childId)) {
          stack.push({ personId: child.childId, depth: current.depth + 1 });
        }
      }
    }
  }

  const arcs = allArcs.filter((arc) => visited.has(arc.parentId) && visited.has(arc.childId));
  return {
    strategy,
    rootPersonId,
    orderedPersonIds,
    depthByPerson,
    arcs,
    familyIds: new Set(arcs.map((arc) => arc.familyId)),
  };
}

function traversalNodes(
  traversal: TraversalProjection,
  peopleById: ReadonlyMap<string, CanonicalDocument["people"][number]>,
): DiagramNode[] {
  const horizontalSpacing = 170;
  const verticalSpacing = 104;
  if (traversal.strategy === "bfs") {
    const idsByDepth = new Map<number, string[]>();
    for (const personId of traversal.orderedPersonIds) {
      const depth = traversal.depthByPerson.get(personId) ?? 0;
      const ids = idsByDepth.get(depth) ?? [];
      ids.push(personId);
      idsByDepth.set(depth, ids);
    }
    return [...idsByDepth.entries()].flatMap(([depth, ids]) =>
      ids.map((personId, index) => {
        const person = peopleById.get(personId);
        const width = labelWidth(person?.display_name ?? personId, 108, 146);
        return {
          id: `bfs-person:${personId}`,
          recordId: personId,
          relatedRecordIds: [],
          label: person?.display_name ?? personId,
          shape: "person",
          ...(person ? { sex: person.sex } : {}),
          x: (index - (ids.length - 1) / 2) * horizontalSpacing - width / 2,
          y: depth * verticalSpacing,
          width,
          height: PERSON_HEIGHT,
        };
      }),
    );
  }
  return traversal.orderedPersonIds.map((personId, index) => {
    const person = peopleById.get(personId);
    const width = labelWidth(person?.display_name ?? personId, 108, 146);
    return {
      id: `dfs-person:${personId}`,
      recordId: personId,
      relatedRecordIds: [],
      label: person?.display_name ?? personId,
      shape: "person",
      ...(person ? { sex: person.sex } : {}),
      x: index * horizontalSpacing,
      y: (traversal.depthByPerson.get(personId) ?? 0) * verticalSpacing,
      width,
      height: PERSON_HEIGHT,
    };
  });
}

function relationshipLayeredLayout(
  vertices: RelationshipVertex[],
  arcs: RelationshipArc[],
): { nodes: DiagramNode[]; edges: DiagramEdge[] } {
  const byLayer = new Map<number, RelationshipVertex[]>();
  for (const vertex of vertices) {
    const layer = byLayer.get(vertex.layer) ?? [];
    layer.push(vertex);
    byLayer.set(vertex.layer, layer);
  }
  const adjacency = new Map<string, Set<string>>();
  for (const arc of arcs) {
    addNeighbor(adjacency, arc.from, arc.to);
    addNeighbor(adjacency, arc.to, arc.from);
  }
  const layers = [...byLayer.entries()].sort(([left], [right]) => left - right);
  for (const [, layer] of layers) {
    layer.sort(
      (left, right) => left.sourceOrder - right.sourceOrder || left.id.localeCompare(right.id),
    );
  }
  for (let sweep = 0; sweep < 8; sweep += 1) {
    const positions = new Map<string, number>();
    for (const [, layer] of layers) {
      layer.forEach((vertex, index) => positions.set(vertex.id, index));
    }
    const visit = sweep % 2 === 0 ? layers : [...layers].reverse();
    for (const [, layer] of visit) {
      layer.sort((left, right) => {
        const difference =
          neighborBarycenter(left.id, adjacency, positions) -
          neighborBarycenter(right.id, adjacency, positions);
        return (
          difference || left.sourceOrder - right.sourceOrder || left.id.localeCompare(right.id)
        );
      });
    }
  }

  const layerWidths = layers.map(([, layer]) =>
    layer.reduce(
      (sum, vertex) => sum + relationshipVertexWidth(vertex) + HORIZONTAL_GAP,
      -HORIZONTAL_GAP,
    ),
  );
  const widest = Math.max(1, ...layerWidths);
  const nodes: DiagramNode[] = [];
  layers.forEach(([layerNumber, layer], layerIndex) => {
    let x = (widest - (layerWidths[layerIndex] ?? 0)) / 2;
    for (const vertex of layer) {
      const width = relationshipVertexWidth(vertex);
      const height = vertex.kind === "family" ? 16 : vertex.secondaryLabel ? 46 : PERSON_HEIGHT;
      nodes.push({
        id: vertex.id,
        recordId: vertex.recordId,
        relatedRecordIds: vertex.relatedRecordIds,
        label: vertex.label,
        ...(vertex.secondaryLabel ? { secondaryLabel: vertex.secondaryLabel } : {}),
        ...(vertex.sex ? { sex: vertex.sex } : {}),
        shape: vertex.kind === "family" ? "family" : "person",
        x,
        y: layerNumber * 58,
        width,
        height,
        labelVisible: vertex.kind !== "family",
      });
      x += width + HORIZONTAL_GAP;
    }
  });
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const edges = arcs.flatMap<DiagramEdge>((arc) => {
    const from = nodesById.get(arc.from);
    const to = nodesById.get(arc.to);
    if (!from || !to) return [];
    return [
      {
        id: arc.id,
        points: from.y <= to.y ? verticalElbow(from, to) : [...verticalElbow(to, from)].reverse(),
        kind: arc.kind,
        directed: false,
        recordId: arc.recordId,
      },
    ];
  });
  return { nodes, edges };
}

/**
 * Relationship-node drawings conventionally align every recorded spouse pair.
 * We first contract those spouse links, then collapse any remaining directed
 * cycles before assigning longest-path ranks to the resulting acyclic graph.
 */
export function relationshipGenerationRanks(
  document: CanonicalDocument,
): ReadonlyMap<string, number> {
  const knownPeople = new Set(document.people.map((person) => person.id));
  const sourceOrder = new Map(document.people.map((person, index) => [person.id, index]));
  const parents = new Map(document.people.map((person) => [person.id, person.id]));

  for (const family of document.families) {
    if (
      family.husband_id &&
      family.wife_id &&
      knownPeople.has(family.husband_id) &&
      knownPeople.has(family.wife_id)
    ) {
      unionPeople(parents, sourceOrder, family.husband_id, family.wife_id);
    }
  }

  const groupByPerson = new Map<string, string>();
  const groups: string[] = [];
  const seenGroups = new Set<string>();
  for (const person of document.people) {
    const group = findPersonGroup(parents, person.id);
    groupByPerson.set(person.id, group);
    if (!seenGroups.has(group)) {
      seenGroups.add(group);
      groups.push(group);
    }
  }

  const graph = new Map(groups.map((group) => [group, new Set<string>()]));
  const reverseGraph = new Map(groups.map((group) => [group, new Set<string>()]));
  for (const family of document.families) {
    const parentGroups = [family.husband_id, family.wife_id]
      .filter((id): id is string => Boolean(id && knownPeople.has(id)))
      .map((id) => groupByPerson.get(id))
      .filter((id): id is string => Boolean(id));
    for (const childId of family.child_ids) {
      const childGroup = groupByPerson.get(childId);
      if (!childGroup) continue;
      for (const parentGroup of parentGroups) {
        if (parentGroup === childGroup) continue;
        graph.get(parentGroup)?.add(childGroup);
        reverseGraph.get(childGroup)?.add(parentGroup);
      }
    }
  }

  const components = iterativeStrongComponents(groups, graph, reverseGraph);
  const componentByGroup = new Map<string, number>();
  components.forEach((component, componentIndex) => {
    component.forEach((group) => componentByGroup.set(group, componentIndex));
  });
  const componentGraph = new Map<number, Set<number>>(
    components.map((_, componentIndex) => [componentIndex, new Set<number>()]),
  );
  const indegree = new Map<number, number>(
    components.map((_, componentIndex) => [componentIndex, 0]),
  );
  for (const [fromGroup, targets] of graph) {
    const fromComponent = componentByGroup.get(fromGroup);
    if (fromComponent == null) continue;
    for (const targetGroup of targets) {
      const targetComponent = componentByGroup.get(targetGroup);
      if (targetComponent == null || targetComponent === fromComponent) continue;
      const outgoing = componentGraph.get(fromComponent);
      if (!outgoing?.has(targetComponent)) {
        outgoing?.add(targetComponent);
        indegree.set(targetComponent, (indegree.get(targetComponent) ?? 0) + 1);
      }
    }
  }

  const componentRanks = new Map<number, number>(
    components.map((_, componentIndex) => [componentIndex, 0]),
  );
  const queue = [...indegree.entries()]
    .filter(([, degree]) => degree === 0)
    .map(([component]) => component)
    .sort((left, right) => left - right);
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const component = queue[cursor];
    if (component == null) continue;
    for (const target of componentGraph.get(component) ?? []) {
      componentRanks.set(
        target,
        Math.max(componentRanks.get(target) ?? 0, (componentRanks.get(component) ?? 0) + 1),
      );
      const nextIndegree = (indegree.get(target) ?? 1) - 1;
      indegree.set(target, nextIndegree);
      if (nextIndegree === 0) queue.push(target);
    }
  }

  return new Map(
    document.people.map((person) => {
      const group = groupByPerson.get(person.id);
      const component = group ? componentByGroup.get(group) : undefined;
      return [person.id, component == null ? 0 : (componentRanks.get(component) ?? 0)];
    }),
  );
}

function iterativeStrongComponents(
  nodes: readonly string[],
  graph: ReadonlyMap<string, ReadonlySet<string>>,
  reverseGraph: ReadonlyMap<string, ReadonlySet<string>>,
): string[][] {
  const visited = new Set<string>();
  const finishOrder: string[] = [];
  for (const start of nodes) {
    if (visited.has(start)) continue;
    visited.add(start);
    const stack: Array<{ node: string; neighbors: string[]; cursor: number }> = [
      { node: start, neighbors: [...(graph.get(start) ?? [])], cursor: 0 },
    ];
    while (stack.length) {
      const frame = stack[stack.length - 1];
      if (!frame) break;
      const neighbor = frame.neighbors[frame.cursor];
      if (neighbor != null) {
        frame.cursor += 1;
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          stack.push({ node: neighbor, neighbors: [...(graph.get(neighbor) ?? [])], cursor: 0 });
        }
        continue;
      }
      finishOrder.push(frame.node);
      stack.pop();
    }
  }

  const assigned = new Set<string>();
  const components: string[][] = [];
  for (let index = finishOrder.length - 1; index >= 0; index -= 1) {
    const start = finishOrder[index];
    if (!start || assigned.has(start)) continue;
    const component: string[] = [];
    const stack = [start];
    assigned.add(start);
    while (stack.length) {
      const node = stack.pop();
      if (!node) continue;
      component.push(node);
      for (const neighbor of reverseGraph.get(node) ?? []) {
        if (!assigned.has(neighbor)) {
          assigned.add(neighbor);
          stack.push(neighbor);
        }
      }
    }
    components.push(component);
  }
  return components;
}

function findPersonGroup(parents: Map<string, string>, personId: string): string {
  let root = personId;
  while (parents.get(root) && parents.get(root) !== root) {
    root = parents.get(root) ?? root;
  }
  let cursor = personId;
  while (parents.get(cursor) && parents.get(cursor) !== root) {
    const next = parents.get(cursor);
    parents.set(cursor, root);
    if (!next) break;
    cursor = next;
  }
  return root;
}

function unionPeople(
  parents: Map<string, string>,
  sourceOrder: ReadonlyMap<string, number>,
  left: string,
  right: string,
): void {
  const leftRoot = findPersonGroup(parents, left);
  const rightRoot = findPersonGroup(parents, right);
  if (leftRoot === rightRoot) return;
  const leftOrder = sourceOrder.get(leftRoot) ?? Number.MAX_SAFE_INTEGER;
  const rightOrder = sourceOrder.get(rightRoot) ?? Number.MAX_SAFE_INTEGER;
  if (leftOrder <= rightOrder) parents.set(rightRoot, leftRoot);
  else parents.set(leftRoot, rightRoot);
}

function relationshipFamilyLayer(
  family: CanonicalFamily,
  ranks: ReadonlyMap<string, number>,
): number {
  const parentRanks = [family.husband_id, family.wife_id]
    .filter((id): id is string => Boolean(id))
    .map((id) => ranks.get(id) ?? 0);
  if (parentRanks.length) return Math.max(...parentRanks) * 2 + 1;
  const childRanks = family.child_ids.map((id) => ranks.get(id) ?? 0);
  return childRanks.length ? Math.max(0, Math.min(...childRanks) * 2 - 1) : 0;
}

function relationshipVertexWidth(vertex: RelationshipVertex): number {
  return vertex.kind === "family" ? 16 : labelWidth(vertex.label, 104, 174);
}

function relationshipLifeSpan(person: CanonicalPerson): string | undefined {
  const birthYear = recordedYear(person.birth_date);
  const deathYear = recordedYear(person.death_date);
  if (birthYear == null && deathYear == null) {
    return undefined;
  }
  return `${birthYear ?? ""}–${deathYear ?? ""}`;
}

function recordedYear(date: RecordedDate | null | undefined): number | null {
  if (!date) {
    return null;
  }
  return date.start_year ?? date.end_year;
}

function neighborBarycenter(
  id: string,
  adjacency: ReadonlyMap<string, Set<string>>,
  positions: ReadonlyMap<string, number>,
): number {
  const values = [...(adjacency.get(id) ?? [])]
    .map((neighbor) => positions.get(neighbor))
    .filter((value): value is number => value != null);
  if (!values.length) return positions.get(id) ?? 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function addNeighbor(map: Map<string, Set<string>>, from: string, to: string): void {
  const values = map.get(from) ?? new Set<string>();
  values.add(to);
  map.set(from, values);
}

function requireFocalPerson(context: VisualizationContext): string {
  const focalPersonId = context.focalPersonId;
  if (!focalPersonId) {
    throw new Error("This traversal needs a starting Person Record.");
  }
  return focalPersonId;
}

function personVertexId(personId: string): string {
  return `relationship-person:${personId}`;
}

function familyVertexId(familyId: string): string {
  return `relationship-family:${familyId}`;
}
