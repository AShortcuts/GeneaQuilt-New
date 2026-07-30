import type { CanonicalDocument, CanonicalFamily } from "../../../domain/schema.ts";
import type { VisualizationContext } from "../../adapter.ts";
import { createDiagramAdapter } from "../../diagram/createDiagramAdapter.ts";
import type {
  DiagramEdge,
  DiagramGuide,
  DiagramNode,
  DiagramPoint,
  DiagramScene,
} from "../../diagram/types.ts";
import {
  buildAncestorMultitree,
  buildDescendantMultitree,
  findDualTreeAxis,
  type AxisPath,
  type Multitree,
  type MultitreeNode,
} from "./DualTreeAdapter.ts";
import { buildPedigreeProjection, type PedigreeOccurrence } from "./FocusedAdapters.ts";
import {
  boundsFromNodes,
  buildRelations,
  labelWidth,
  nodeCenter,
  type GenealogyRelations,
} from "../genealogyLayout.ts";

const PEDIGREE_GENERATIONS = 5;
const FAN_ROOT_RADIUS = 42;
const FAN_RING_SIZE = 78;
const H_NODE_WIDTH = 78;
const H_NODE_HEIGHT = 26;
const OUTLINE_COLUMN_STEP = 176;
const OUTLINE_ROW_STEP = 43;
const LOCAL_RADIAL_DEPTH = 2;

export const fanChartAdapter = createDiagramAdapter("fan", (context) =>
  buildFanChartScene(context),
);

export const hTreeAdapter = createDiagramAdapter("h-tree", (context) => buildHTreeScene(context));

export const localRadialAdapter = createDiagramAdapter("local-radial", (context) =>
  buildLocalRadialScene(context),
);

export const dualOutlineAdapter = createDiagramAdapter("dual-outline", (context) =>
  buildDualOutlineScene(context),
);

export function buildFanChartScene(context: VisualizationContext): DiagramScene {
  const focalPersonId = requireFocalPerson(context, "Fan chart");
  const projection = buildPedigreeProjection(context.document, focalPersonId, PEDIGREE_GENERATIONS);
  const peopleById = new Map(context.document.people.map((person) => [person.id, person]));
  const center = { x: 0, y: 0 };
  const outerRadius = FAN_ROOT_RADIUS + projection.maxDepth * FAN_RING_SIZE;
  const slotGuides: DiagramNode[] = [];
  for (let depth = 1; depth <= projection.maxDepth; depth += 1) {
    const slots = 2 ** depth;
    const innerRadius = FAN_ROOT_RADIUS + (depth - 1) * FAN_RING_SIZE + 3;
    const radius = FAN_ROOT_RADIUS + depth * FAN_RING_SIZE;
    for (let slot = 0; slot < slots; slot += 1) {
      const startAngle = -Math.PI / 2 + (slot / slots) * Math.PI * 2;
      const endAngle = -Math.PI / 2 + ((slot + 1) / slots) * Math.PI * 2;
      slotGuides.push({
        id: `fan:slot:${depth}:${slot}`,
        recordId: null,
        relatedRecordIds: [],
        label: `Pedigree slot ${slot + 1} of ${slots} in ancestry generation ${depth}`,
        shape: "sector",
        pathData: annularSectorPath(center, innerRadius, radius, startAngle, endAngle, 0),
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        guide: true,
        labelVisible: false,
      });
    }
  }
  const personNodes: DiagramNode[] = [];

  for (const occurrence of projection.occurrences) {
    const person = peopleById.get(occurrence.personId);
    const label = person?.display_name ?? occurrence.personId;
    if (occurrence.depth === 0) {
      personNodes.push({
        id: `fan:${occurrence.key}`,
        recordId: occurrence.personId,
        relatedRecordIds: [],
        label,
        shape: "circle",
        x: -FAN_ROOT_RADIUS,
        y: -FAN_ROOT_RADIUS,
        width: FAN_ROOT_RADIUS * 2,
        height: FAN_ROOT_RADIUS * 2,
        sex: person?.sex ?? null,
        emphasized: true,
      });
      continue;
    }
    const slots = 2 ** occurrence.depth;
    const startAngle = -Math.PI / 2 + (occurrence.slot / slots) * Math.PI * 2;
    const endAngle = -Math.PI / 2 + ((occurrence.slot + 1) / slots) * Math.PI * 2;
    const innerRadius = FAN_ROOT_RADIUS + (occurrence.depth - 1) * FAN_RING_SIZE + 3;
    const radius = FAN_ROOT_RADIUS + occurrence.depth * FAN_RING_SIZE;
    const middleAngle = (startAngle + endAngle) / 2;
    const labelRadius = (innerRadius + radius) / 2;
    const labelPosition = polar(center, labelRadius, middleAngle);
    const angleDegrees = (middleAngle * 180) / Math.PI;
    const uprightRotation =
      angleDegrees > 90 && angleDegrees < 270 ? angleDegrees + 180 : angleDegrees;
    const arcLength = Math.max(28, (Math.PI * 2 * labelRadius) / slots - 12);
    personNodes.push({
      id: `fan:${occurrence.key}`,
      recordId: occurrence.personId,
      relatedRecordIds: [],
      label,
      compactLabel: label,
      shape: "sector",
      pathData: annularSectorPath(center, innerRadius, radius, startAngle, endAngle, 0.006),
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      labelX: labelPosition.x,
      labelY: labelPosition.y,
      labelRotation: uprightRotation,
      labelMaxWidth: Math.min(FAN_RING_SIZE - 12, arcLength),
      sex: person?.sex ?? null,
      duplicate: countOccurrences(projection.occurrences, occurrence.personId) > 1,
    });
  }

  return {
    methodId: "fan",
    title: "Fan chart",
    description:
      "One person's recorded ancestry fills concentric pedigree sectors; father and mother slots remain in a stable binary order.",
    nodes: [...slotGuides, ...personNodes],
    edges: [],
    guides: Array.from({ length: projection.maxDepth }, (_, index): DiagramGuide => ({
      id: `fan-generation:${index + 1}`,
      kind: "circle",
      center,
      radius: FAN_ROOT_RADIUS + (index + 1) * FAN_RING_SIZE,
    })),
    bounds: {
      minX: -outerRadius,
      minY: -outerRadius,
      width: outerRadius * 2,
      height: outerRadius * 2,
    },
    projection: {
      visiblePeople: projection.uniquePersonIds.size,
      totalPeople: context.document.people.length,
      visibleFamilies: projection.familyIds.size,
      totalFamilies: context.document.families.length,
      label: `${projection.maxDepth + 1} ancestry generations`,
      rule: "Each pedigree depth owns one concentric ring split into 2^depth equal slots. The recorded husband role occupies the first half of every branch and the wife role the second; unrecorded ancestors leave their slots empty.",
    },
    notes: [
      "The nested sectors imply parentage, so connecting lines are intentionally absent.",
      projection.duplicatePlacements
        ? `${projection.duplicatePlacements} repeated sector placement${projection.duplicatePlacements === 1 ? "" : "s"} preserve Pedigree Collapse; rust outlines identify repeats.`
        : "No ancestor repeats within this depth.",
      "Partners, descendants, siblings outside direct ancestry, and disconnected groups are outside a fan chart.",
    ],
  };
}

export function buildHTreeScene(context: VisualizationContext): DiagramScene {
  const focalPersonId = requireFocalPerson(context, "H-tree pedigree");
  const projection = buildPedigreeProjection(context.document, focalPersonId, PEDIGREE_GENERATIONS);
  const peopleById = new Map(context.document.people.map((person) => [person.id, person]));
  const occurrencesByKey = new Map(
    projection.occurrences.map((occurrence) => [occurrence.key, occurrence]),
  );
  const positions = hTreePositions(projection.occurrences, projection.maxDepth);
  const nodes = projection.occurrences.map((occurrence): DiagramNode => {
    const position = positions.get(occurrence.key)!;
    const person = peopleById.get(occurrence.personId);
    return {
      id: `h-tree:${occurrence.key}`,
      recordId: occurrence.personId,
      relatedRecordIds: [],
      label: person?.display_name ?? occurrence.personId,
      shape: "person",
      x: position.x - H_NODE_WIDTH / 2,
      y: position.y - H_NODE_HEIGHT / 2,
      width: H_NODE_WIDTH,
      height: H_NODE_HEIGHT,
      labelMaxWidth: H_NODE_WIDTH,
      sex: person?.sex ?? null,
      emphasized: occurrence.depth === 0,
      duplicate: countOccurrences(projection.occurrences, occurrence.personId) > 1,
    };
  });
  const nodesByKey = new Map(nodes.map((node) => [node.id.slice("h-tree:".length), node]));
  const edges = projection.connections.flatMap((connection): DiagramEdge[] => {
    const child = nodesByKey.get(connection.childKey);
    const parent = nodesByKey.get(connection.parentKey);
    if (!child || !parent) return [];
    return [
      {
        id: `h-tree:${connection.childKey}:${connection.parentKey}`,
        points: [nodeCenter(child), nodeCenter(parent)],
        kind: "descent",
        recordId: connection.familyId,
      },
    ];
  });
  const rootName = peopleById.get(focalPersonId)?.display_name ?? focalPersonId;
  if (!occurrencesByKey.has("root")) {
    throw new Error("The H-tree root disappeared during pedigree layout.");
  }
  return {
    methodId: "h-tree",
    title: "PedVis H-tree pedigree",
    description: `${rootName}'s ancestry alternates vertical and horizontal parent placement around a central root.`,
    nodes,
    edges,
    bounds: boundsFromNodes(nodes),
    projection: {
      visiblePeople: projection.uniquePersonIds.size,
      totalPeople: context.document.people.length,
      visibleFamilies: projection.familyIds.size,
      totalFamilies: context.document.families.length,
      label: `${projection.maxDepth + 1} ancestry generations`,
      rule: "The root is centered. At one level, the recorded husband/father slot is above and wife/mother below; at the next they are left and right. Orientation alternates while offsets double outward to reserve an equal rectangular family region for every pedigree slot.",
    },
    notes: [
      "Empty regions are meaningful: they reserve the stable location of unrecorded ancestors instead of collapsing the chart.",
      projection.duplicatePlacements
        ? `${projection.duplicatePlacements} repeated Person Placement${projection.duplicatePlacements === 1 ? "" : "s"} remove pedigree loops from the binary tree; rust dashed outlines identify them.`
        : "No ancestor repeats within this depth.",
      "The compactness comes with a real cost: bloodlines zigzag and generations are harder to scan than in a conventional pedigree.",
    ],
  };
}

export interface LocalRadialProjection {
  distanceByPerson: ReadonlyMap<string, number>;
  visibleFamilyIds: ReadonlySet<string>;
}

export function buildLocalRadialProjection(
  document: CanonicalDocument,
  focalPersonId: string,
  maximumDepth = LOCAL_RADIAL_DEPTH,
): LocalRadialProjection {
  const relations = buildRelations(document);
  if (!relations.peopleById.has(focalPersonId)) {
    throw new Error(`The focal Person ${focalPersonId} does not exist in this genealogy.`);
  }
  const adjacency = relationshipAdjacency(document, relations);
  const distanceByPerson = new Map<string, number>([[focalPersonId, 0]]);
  const queue = [focalPersonId];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const personId = queue[cursor]!;
    const distance = distanceByPerson.get(personId)!;
    if (distance >= maximumDepth) continue;
    for (const nextId of adjacency.get(personId) ?? []) {
      if (!distanceByPerson.has(nextId)) {
        distanceByPerson.set(nextId, distance + 1);
        queue.push(nextId);
      }
    }
  }
  const visibleFamilyIds = new Set(
    document.families
      .filter((family) => familyHasVisibleRelationship(family, distanceByPerson))
      .map((family) => family.id),
  );
  return { distanceByPerson, visibleFamilyIds };
}

export function buildLocalRadialScene(context: VisualizationContext): DiagramScene {
  const focalPersonId = requireFocalPerson(context, "Fixed-depth radial neighborhood");
  const projection = buildLocalRadialProjection(context.document, focalPersonId);
  const relations = buildRelations(context.document);
  const rings = groupIdsByDistance(projection.distanceByPerson);
  const positions = new Map<string, DiagramPoint>([[focalPersonId, { x: 0, y: 0 }]]);
  const guides: DiagramGuide[] = [];
  let outerRadius = 0;
  for (let distance = 1; distance < rings.length; distance += 1) {
    const ids = rings[distance] ?? [];
    const radius = Math.max(distance * 152, (ids.length * 132) / (Math.PI * 2));
    outerRadius = Math.max(outerRadius, radius);
    guides.push({
      id: `local-radial:ring:${distance}`,
      kind: "circle",
      center: { x: 0, y: 0 },
      radius,
      label: `${distance} hop${distance === 1 ? "" : "s"}`,
    });
    ids.forEach((personId, index) => {
      const angle = -Math.PI / 2 + (index / Math.max(1, ids.length)) * Math.PI * 2;
      positions.set(personId, polar({ x: 0, y: 0 }, radius, angle));
    });
  }
  const nodes = [...projection.distanceByPerson.keys()].map((personId): DiagramNode => {
    const person = relations.peopleById.get(personId)!;
    const position = positions.get(personId)!;
    const width = labelWidth(person.display_name, 96, 148);
    return {
      id: `local-radial:${personId}`,
      recordId: personId,
      relatedRecordIds: [],
      label: person.display_name,
      shape: "person",
      x: position.x - width / 2,
      y: position.y - 17,
      width,
      height: 34,
      sex: person.sex,
      emphasized: personId === focalPersonId,
    };
  });
  const nodesById = new Map(nodes.map((node) => [node.recordId!, node]));
  const edges: DiagramEdge[] = [];
  for (const family of context.document.families) {
    if (!projection.visibleFamilyIds.has(family.id)) continue;
    const husband = family.husband_id ? nodesById.get(family.husband_id) : undefined;
    const wife = family.wife_id ? nodesById.get(family.wife_id) : undefined;
    if (husband && wife) {
      edges.push({
        id: `local-radial:marriage:${family.id}`,
        points: [nodeCenter(husband), nodeCenter(wife)],
        kind: "marriage",
        recordId: family.id,
        curve: "arc",
      });
    }
    for (const childId of family.child_ids) {
      const child = nodesById.get(childId);
      if (!child) continue;
      for (const parentId of [family.husband_id, family.wife_id]) {
        const parent = parentId ? nodesById.get(parentId) : undefined;
        if (!parent) continue;
        edges.push({
          id: `local-radial:descent:${family.id}:${parentId}:${childId}`,
          points: [nodeCenter(parent), nodeCenter(child)],
          kind: "descent",
          directed: true,
          recordId: family.id,
          curve: "arc",
        });
      }
    }
  }
  const focalName = relations.peopleById.get(focalPersonId)?.display_name ?? focalPersonId;
  return {
    methodId: "local-radial",
    title: "Fixed-depth radial neighborhood",
    description: `Recorded relatives within ${LOCAL_RADIAL_DEPTH} relationship hops surround ${focalName}.`,
    nodes,
    edges,
    guides,
    bounds: boundsFromNodes(nodes),
    projection: {
      visiblePeople: projection.distanceByPerson.size,
      totalPeople: context.document.people.length,
      visibleFamilies: projection.visibleFamilyIds.size,
      totalFamilies: context.document.families.length,
      label: `${LOCAL_RADIAL_DEPTH}-hop relationship neighborhood`,
      rule: "Breadth-first search over recorded parent, child, and husband-wife relationships places each Person once on the ring for their shortest relationship distance from the focus.",
    },
    notes: [
      "Rings encode relationship hops, not generations or time.",
      "Every recorded marriage and parent-child link whose two endpoints are inside the neighborhood remains visible.",
      `${context.document.people.length - projection.distanceByPerson.size} Person Record${context.document.people.length - projection.distanceByPerson.size === 1 ? " is" : "s are"} outside the fixed depth and intentionally hidden.`,
    ],
  };
}

export function buildDualOutlineScene(context: VisualizationContext): DiagramScene {
  const descendantPersonId = context.focalPersonId;
  const ancestorPersonId = context.secondaryFocalPersonId;
  if (!descendantPersonId || !ancestorPersonId) {
    throw new Error(
      "Dual outline needs both its descendant end and ancestor end before it can open.",
    );
  }
  const axis = findDualTreeAxis(context.document, ancestorPersonId, descendantPersonId);
  if (!axis) {
    throw new Error("The selected ancestor end is not a recorded ancestor of the descendant end.");
  }
  const relations = buildRelations(context.document);
  const ancestorTree = buildAncestorMultitree(relations, descendantPersonId, axis);
  const descendantTree = buildDescendantMultitree(relations, ancestorPersonId, axis);
  const ancestorLayout = outlinePrelayout(ancestorTree, axis, "ancestor");
  const descendantLayout = outlinePrelayout(descendantTree, axis, "descendant");
  const finalAxisRows = stretchedAxisRows(axis, ancestorLayout.rows, descendantLayout.rows);
  const ancestorRows = stretchOutlineRows(ancestorLayout, finalAxisRows);
  const descendantRows = stretchOutlineRows(descendantLayout, finalAxisRows);
  const axisIds = new Set(axis.personIds);
  const axisIndex = new Map(axis.personIds.map((id, index) => [id, index]));
  const nodes: DiagramNode[] = [];
  const nodesByPerson = new Map<string, DiagramNode>();

  const appendTreeNodes = (
    tree: Multitree,
    rows: ReadonlyMap<string, number>,
    side: "ancestor" | "descendant",
  ): void => {
    for (const treeNode of tree.nodesByPerson.values()) {
      if (nodesByPerson.has(treeNode.personId)) continue;
      const person = relations.peopleById.get(treeNode.personId);
      const label = person?.display_name ?? treeNode.personId;
      const generation =
        side === "ancestor" ? axis.personIds.length - 1 - treeNode.depth : treeNode.depth;
      const width = labelWidth(label, 88, 156);
      const node: DiagramNode = {
        id: `dual-outline:${side}:${treeNode.personId}`,
        recordId: treeNode.personId,
        relatedRecordIds: [],
        label,
        shape: "person",
        x: generation * OUTLINE_COLUMN_STEP - width / 2,
        y: (rows.get(treeNode.personId) ?? 0) * OUTLINE_ROW_STEP,
        width,
        height: 27,
        sex: person?.sex ?? null,
        emphasized: axisIds.has(treeNode.personId),
      };
      if (axisIds.has(treeNode.personId)) {
        node.x = (axisIndex.get(treeNode.personId) ?? generation) * OUTLINE_COLUMN_STEP - width / 2;
      }
      nodes.push(node);
      nodesByPerson.set(treeNode.personId, node);
    }
  };
  appendTreeNodes(ancestorTree, ancestorRows, "ancestor");
  appendTreeNodes(descendantTree, descendantRows, "descendant");
  reserveDistinctOutlineRows(nodes);

  const edges: DiagramEdge[] = [];
  const edgeKeys = new Set<string>();
  appendOutlineEdges(ancestorTree, nodesByPerson, edges, edgeKeys, axisIds, "ancestor");
  appendOutlineEdges(descendantTree, nodesByPerson, edges, edgeKeys, axisIds, "descendant");
  const visibleFamilies = new Set(edges.map((edge) => edge.recordId).filter(Boolean));
  const ancestorName = relations.peopleById.get(ancestorPersonId)?.display_name ?? ancestorPersonId;
  const descendantName =
    relations.peopleById.get(descendantPersonId)?.display_name ?? descendantPersonId;
  return {
    methodId: "dual-outline",
    title: "Dual tree: indented outline",
    description: `${descendantName}'s ancestor outline and ${ancestorName}'s descendant outline are stretched together along one shared axis.`,
    nodes,
    edges,
    bounds: boundsFromNodes(nodes),
    projection: {
      visiblePeople: nodesByPerson.size,
      totalPeople: context.document.people.length,
      visibleFamilies: visibleFamilies.size,
      totalFamilies: context.document.families.length,
      label: `A(${descendantName}) union D(${ancestorName})`,
      rule: "Each rooted tree first receives a deterministic indented-outline embedding. Consecutive matching axis nodes are then stretched by the larger of the two row gaps, preserving generation columns while clearing the space between the opposing outlines.",
    },
    notes: [
      "Indentation and the L-shaped left-child/right-sibling edge convention carry the hierarchy; this is intentionally much taller and narrower than the node-link dual tree.",
      "The emphasized nodes are the single merged ancestor-to-descendant axis.",
      "Opposing branches that request the same outline cell are deterministically assigned the nearest free row, so no Person can be hidden behind another.",
      "Skipped diamond and relinking edges remain as dashed supplemental lines rather than being hidden.",
    ],
  };
}

function reserveDistinctOutlineRows(nodes: readonly DiagramNode[]): void {
  const nodesByColumn = new Map<number, DiagramNode[]>();
  for (const node of nodes) {
    if (node.shape !== "person") continue;
    const column = Math.round((node.x + node.width / 2) / OUTLINE_COLUMN_STEP);
    const values = nodesByColumn.get(column) ?? [];
    values.push(node);
    nodesByColumn.set(column, values);
  }

  for (const columnNodes of nodesByColumn.values()) {
    const occupiedRows = new Set<number>();
    const ordered = [...columnNodes].sort(
      (left, right) =>
        Number(Boolean(right.emphasized)) - Number(Boolean(left.emphasized)) ||
        left.y - right.y ||
        left.id.localeCompare(right.id),
    );
    for (const node of ordered) {
      const preferredRow = Math.round(node.y / OUTLINE_ROW_STEP);
      const row = nearestFreeRow(preferredRow, occupiedRows, node.id);
      occupiedRows.add(row);
      node.y = row * OUTLINE_ROW_STEP;
    }
  }
}

function nearestFreeRow(
  preferred: number,
  occupied: ReadonlySet<number>,
  stableId: string,
): number {
  if (!occupied.has(preferred)) return preferred;
  const preferLowerRow = stableHash(stableId) % 2 === 0;
  for (let distance = 1; distance <= occupied.size + 1; distance += 1) {
    const first = preferred + (preferLowerRow ? distance : -distance);
    const second = preferred - (preferLowerRow ? distance : -distance);
    if (!occupied.has(first)) return first;
    if (!occupied.has(second)) return second;
  }
  throw new Error("Dual-outline layout could not reserve a distinct row.");
}

function stableHash(value: string): number {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash;
}

interface OutlinePrelayout {
  rows: ReadonlyMap<string, number>;
  anchorByPerson: ReadonlyMap<string, string>;
}

function outlinePrelayout(
  tree: Multitree,
  axis: AxisPath,
  side: "ancestor" | "descendant",
): OutlinePrelayout {
  const axisIds = new Set(axis.personIds);
  const rows = new Map<string, number>();
  const anchorByPerson = new Map<string, string>();
  let nextRow = 0;
  const stack: Array<{ node: MultitreeNode; anchor: string }> = [
    {
      node: tree.root,
      anchor: axisIds.has(tree.root.personId) ? tree.root.personId : axis.personIds[0]!,
    },
  ];
  while (stack.length) {
    const current = stack.pop()!;
    const anchor = axisIds.has(current.node.personId) ? current.node.personId : current.anchor;
    rows.set(current.node.personId, nextRow);
    anchorByPerson.set(current.node.personId, anchor);
    nextRow += 1;
    const children = [...current.node.children].sort((left, right) => {
      const leftAxis = axisIds.has(left.personId);
      const rightAxis = axisIds.has(right.personId);
      if (leftAxis !== rightAxis) {
        return side === "ancestor"
          ? Number(leftAxis) - Number(rightAxis)
          : Number(rightAxis) - Number(leftAxis);
      }
      return left.personId.localeCompare(right.personId);
    });
    for (let index = children.length - 1; index >= 0; index -= 1) {
      stack.push({ node: children[index]!, anchor });
    }
  }
  if (side === "ancestor") {
    const maximum = Math.max(0, ...rows.values());
    for (const [personId, row] of rows) rows.set(personId, maximum - row);
  }
  return { rows, anchorByPerson };
}

function stretchedAxisRows(
  axis: AxisPath,
  ancestorRows: ReadonlyMap<string, number>,
  descendantRows: ReadonlyMap<string, number>,
): ReadonlyMap<string, number> {
  const rows = new Map<string, number>();
  rows.set(axis.personIds[0]!, 0);
  for (let index = 1; index < axis.personIds.length; index += 1) {
    const previous = axis.personIds[index - 1]!;
    const personId = axis.personIds[index]!;
    const ancestorGap = Math.abs(
      (ancestorRows.get(personId) ?? 0) - (ancestorRows.get(previous) ?? 0),
    );
    const descendantGap = Math.abs(
      (descendantRows.get(personId) ?? 0) - (descendantRows.get(previous) ?? 0),
    );
    rows.set(personId, (rows.get(previous) ?? 0) + Math.max(1, ancestorGap, descendantGap));
  }
  return rows;
}

function stretchOutlineRows(
  layout: OutlinePrelayout,
  finalAxisRows: ReadonlyMap<string, number>,
): ReadonlyMap<string, number> {
  const result = new Map<string, number>();
  for (const [personId, row] of layout.rows) {
    const anchor = layout.anchorByPerson.get(personId)!;
    const shift = (finalAxisRows.get(anchor) ?? 0) - (layout.rows.get(anchor) ?? 0);
    result.set(personId, row + shift);
  }
  const minimum = Math.min(0, ...result.values());
  if (minimum < 0) {
    for (const [personId, row] of result) result.set(personId, row - minimum);
  }
  return result;
}

function appendOutlineEdges(
  tree: Multitree,
  nodesByPerson: ReadonlyMap<string, DiagramNode>,
  edges: DiagramEdge[],
  edgeKeys: Set<string>,
  axisIds: ReadonlySet<string>,
  side: "ancestor" | "descendant",
): void {
  for (const edge of [...tree.edges, ...tree.supplemental]) {
    const key = `${edge.parentPersonId}:${edge.childPersonId}`;
    if (edgeKeys.has(key)) continue;
    const parent = nodesByPerson.get(edge.parentPersonId);
    const child = nodesByPerson.get(edge.childPersonId);
    if (!parent || !child) continue;
    edgeKeys.add(key);
    const start = nodeCenter(parent);
    const end = nodeCenter(child);
    edges.push({
      id: `dual-outline:${side}:${key}`,
      points: [start, { x: start.x, y: end.y }, end],
      kind: tree.supplemental.includes(edge)
        ? "supplemental"
        : axisIds.has(edge.parentPersonId) && axisIds.has(edge.childPersonId)
          ? "axis"
          : "descent",
      recordId: edge.familyId,
    });
  }
}

function hTreePositions(
  occurrences: PedigreeOccurrence[],
  maximumDepth: number,
): ReadonlyMap<string, DiagramPoint> {
  const positions = new Map<string, DiagramPoint>([["root", { x: 0, y: 0 }]]);
  const byKey = new Map(occurrences.map((occurrence) => [occurrence.key, occurrence]));
  for (const occurrence of [...occurrences].sort((left, right) => left.depth - right.depth)) {
    if (!occurrence.parentKey) continue;
    const parent = byKey.get(occurrence.parentKey);
    const parentPosition = positions.get(occurrence.parentKey);
    if (!parent || !parentPosition) continue;
    const factor = 2 ** Math.floor(Math.max(0, maximumDepth - parent.depth - 1) / 2);
    const firstRole = occurrence.role === "husband";
    if (parent.depth % 2 === 0) {
      positions.set(occurrence.key, {
        x: parentPosition.x,
        y: parentPosition.y + (firstRole ? -1 : 1) * factor * 62,
      });
    } else {
      positions.set(occurrence.key, {
        x: parentPosition.x + (firstRole ? -1 : 1) * factor * 102,
        y: parentPosition.y,
      });
    }
  }
  return positions;
}

function relationshipAdjacency(
  document: CanonicalDocument,
  relations: GenealogyRelations,
): ReadonlyMap<string, string[]> {
  const adjacency = new Map(document.people.map((person) => [person.id, new Set<string>()]));
  for (const family of document.families) {
    const parents = [family.husband_id, family.wife_id].filter((id): id is string =>
      Boolean(id && relations.peopleById.has(id)),
    );
    if (parents.length === 2) {
      adjacency.get(parents[0]!)?.add(parents[1]!);
      adjacency.get(parents[1]!)?.add(parents[0]!);
    }
    for (const childId of family.child_ids) {
      if (!relations.peopleById.has(childId)) continue;
      for (const parentId of parents) {
        adjacency.get(parentId)?.add(childId);
        adjacency.get(childId)?.add(parentId);
      }
    }
  }
  return new Map(
    [...adjacency].map(([personId, ids]) => [
      personId,
      [...ids].sort((left, right) => left.localeCompare(right)),
    ]),
  );
}

function groupIdsByDistance(distanceByPerson: ReadonlyMap<string, number>): string[][] {
  const rings: string[][] = [];
  for (const [personId, distance] of distanceByPerson) {
    const ring = rings[distance] ?? [];
    ring.push(personId);
    rings[distance] = ring;
  }
  for (const ring of rings) ring.sort((left, right) => left.localeCompare(right));
  return rings;
}

function familyHasVisibleRelationship(
  family: CanonicalFamily,
  visiblePeople: ReadonlyMap<string, number>,
): boolean {
  const husbandVisible = Boolean(family.husband_id && visiblePeople.has(family.husband_id));
  const wifeVisible = Boolean(family.wife_id && visiblePeople.has(family.wife_id));
  if (husbandVisible && wifeVisible) return true;
  return family.child_ids.some(
    (childId) =>
      visiblePeople.has(childId) &&
      ((husbandVisible && Boolean(family.husband_id)) || (wifeVisible && Boolean(family.wife_id))),
  );
}

function countOccurrences(occurrences: PedigreeOccurrence[], personId: string): number {
  return occurrences.reduce(
    (count, occurrence) => count + Number(occurrence.personId === personId),
    0,
  );
}

function polar(center: DiagramPoint, radius: number, angle: number): DiagramPoint {
  return {
    x: center.x + Math.cos(angle) * radius,
    y: center.y + Math.sin(angle) * radius,
  };
}

function annularSectorPath(
  center: DiagramPoint,
  innerRadius: number,
  outerRadius: number,
  rawStartAngle: number,
  rawEndAngle: number,
  gap: number,
): string {
  const startAngle = rawStartAngle + gap;
  const endAngle = rawEndAngle - gap;
  const outerStart = polar(center, outerRadius, startAngle);
  const outerEnd = polar(center, outerRadius, endAngle);
  const innerEnd = polar(center, innerRadius, endAngle);
  const innerStart = polar(center, innerRadius, startAngle);
  const largeArc = endAngle - startAngle > Math.PI ? 1 : 0;
  return [
    `M${outerStart.x} ${outerStart.y}`,
    `A${outerRadius} ${outerRadius} 0 ${largeArc} 1 ${outerEnd.x} ${outerEnd.y}`,
    `L${innerEnd.x} ${innerEnd.y}`,
    `A${innerRadius} ${innerRadius} 0 ${largeArc} 0 ${innerStart.x} ${innerStart.y}`,
    "Z",
  ].join(" ");
}

function requireFocalPerson(context: VisualizationContext, methodName: string): string {
  if (!context.focalPersonId) {
    throw new Error(`${methodName} needs a focal person before it can open.`);
  }
  return context.focalPersonId;
}
