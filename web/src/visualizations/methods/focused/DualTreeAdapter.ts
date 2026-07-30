import type { CanonicalDocument, CanonicalFamily } from "../../../domain/schema.ts";
import type { VisualizationContext } from "../../adapter.ts";
import { createDiagramAdapter } from "../../diagram/createDiagramAdapter.ts";
import type { DiagramEdge, DiagramNode, DiagramScene } from "../../diagram/types.ts";
import {
  PERSON_HEIGHT,
  boundsFromNodes,
  buildRelations,
  familyParentIds,
  labelWidth,
  verticalElbow,
  type GenealogyRelations,
} from "../genealogyLayout.ts";

export interface AxisPath {
  personIds: string[];
  familyIds: string[];
}

export interface MultitreeNode {
  key: string;
  personId: string;
  depth: number;
  children: MultitreeNode[];
}

export interface MultitreeEdge {
  parentPersonId: string;
  childPersonId: string;
  familyId: string;
}

type SupplementalEdge = MultitreeEdge;

export interface Multitree {
  root: MultitreeNode;
  nodesByPerson: ReadonlyMap<string, MultitreeNode>;
  edges: MultitreeEdge[];
  supplemental: SupplementalEdge[];
}

interface PreliminaryLayout {
  xByPerson: ReadonlyMap<string, number>;
  width: number;
  subtreeSizeByPerson: ReadonlyMap<string, number>;
}

export const dualTreeAdapter = createDiagramAdapter("dual-tree", (context) =>
  buildDualTreeScene(context),
);

export function findDualTreeAxis(
  document: CanonicalDocument,
  ancestorPersonId: string,
  descendantPersonId: string,
): AxisPath | null {
  const relations = buildRelations(document);
  if (
    !relations.peopleById.has(ancestorPersonId) ||
    !relations.peopleById.has(descendantPersonId)
  ) {
    return null;
  }
  const queue = [ancestorPersonId];
  const previous = new Map<string, { personId: string; familyId: string } | null>([
    [ancestorPersonId, null],
  ]);
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const personId = queue[cursor];
    if (!personId || personId === descendantPersonId) {
      break;
    }
    const families = [...(relations.spouseFamiliesByPerson.get(personId) ?? [])].sort(
      (left, right) => left.id.localeCompare(right.id),
    );
    for (const family of families) {
      for (const childId of [...family.child_ids].sort()) {
        if (!relations.peopleById.has(childId) || previous.has(childId)) {
          continue;
        }
        previous.set(childId, { personId, familyId: family.id });
        queue.push(childId);
      }
    }
  }
  if (!previous.has(descendantPersonId)) {
    return null;
  }
  const reversedPeople = [descendantPersonId];
  const reversedFamilies: string[] = [];
  let cursor = descendantPersonId;
  while (cursor !== ancestorPersonId) {
    const step = previous.get(cursor);
    if (!step) {
      return null;
    }
    reversedFamilies.push(step.familyId);
    reversedPeople.push(step.personId);
    cursor = step.personId;
  }
  return {
    personIds: reversedPeople.reverse(),
    familyIds: reversedFamilies.reverse(),
  };
}

export function buildDualTreeScene(context: VisualizationContext): DiagramScene {
  const descendantPersonId = context.focalPersonId;
  const ancestorPersonId = context.secondaryFocalPersonId;
  if (!descendantPersonId || !ancestorPersonId) {
    throw new Error("Dual tree needs both its descendant end and ancestor end before it can open.");
  }
  const axis = findDualTreeAxis(context.document, ancestorPersonId, descendantPersonId);
  if (!axis) {
    throw new Error("The selected ancestor end is not a recorded ancestor of the descendant end.");
  }
  const relations = buildRelations(context.document);
  const ancestors = buildAncestorMultitree(relations, descendantPersonId, axis);
  const descendants = buildDescendantMultitree(relations, ancestorPersonId, axis);
  const ancestorLayout = preliminaryLayout(ancestors.root, "ancestor-axis-last", axis);
  const descendantLayout = preliminaryLayout(descendants.root, "descendant-axis-first", axis);
  const axisIds = new Set(axis.personIds);
  const horizontalGap = 3;
  const horizontalStride = 205;
  const generationStride = 106;
  const descendantShift = ancestorLayout.width + horizontalGap;
  const axisIndex = new Map(axis.personIds.map((personId, index) => [personId, index]));
  const nodes: DiagramNode[] = [];
  const ancestorDiagramNodes = new Map<string, DiagramNode>();
  const descendantDiagramNodes = new Map<string, DiagramNode>();
  const axisDiagramNodes = new Map<string, DiagramNode>();

  for (const personId of axis.personIds) {
    const ancestorX = ancestorLayout.xByPerson.get(personId) ?? ancestorLayout.width;
    const descendantX = (descendantLayout.xByPerson.get(personId) ?? 0) + descendantShift;
    const ancestorLoad = Math.max(1, ancestorLayout.subtreeSizeByPerson.get(personId) ?? 1);
    const descendantLoad = Math.max(1, descendantLayout.subtreeSizeByPerson.get(personId) ?? 1);
    const centerX =
      ((ancestorLoad * ancestorX + descendantLoad * descendantX) /
        (ancestorLoad + descendantLoad)) *
      horizontalStride;
    const person = relations.peopleById.get(personId);
    const label = person?.display_name ?? personId;
    const width = labelWidth(label, 96, 178);
    const node: DiagramNode = {
      id: `dual-tree:axis:${personId}`,
      recordId: personId,
      relatedRecordIds: [],
      label,
      shape: "person",
      x: centerX - width / 2,
      y: (axisIndex.get(personId) ?? 0) * generationStride,
      width,
      height: PERSON_HEIGHT,
      sex: person?.sex ?? null,
      emphasized: true,
    };
    nodes.push(node);
    axisDiagramNodes.set(personId, node);
    ancestorDiagramNodes.set(personId, node);
    descendantDiagramNodes.set(personId, node);
  }

  for (const treeNode of ancestors.nodesByPerson.values()) {
    if (axisIds.has(treeNode.personId)) {
      continue;
    }
    const centerX = (ancestorLayout.xByPerson.get(treeNode.personId) ?? 0) * horizontalStride;
    const person = relations.peopleById.get(treeNode.personId);
    const label = person?.display_name ?? treeNode.personId;
    const width = labelWidth(label, 96, 178);
    const node: DiagramNode = {
      id: `dual-tree:ancestor:${treeNode.personId}`,
      recordId: treeNode.personId,
      relatedRecordIds: [],
      label,
      shape: "person",
      x: centerX - width / 2,
      y: (axis.personIds.length - 1 - treeNode.depth) * generationStride,
      width,
      height: PERSON_HEIGHT,
      sex: person?.sex ?? null,
    };
    nodes.push(node);
    ancestorDiagramNodes.set(treeNode.personId, node);
  }

  for (const treeNode of descendants.nodesByPerson.values()) {
    if (axisIds.has(treeNode.personId)) {
      continue;
    }
    const centerX =
      ((descendantLayout.xByPerson.get(treeNode.personId) ?? 0) + descendantShift) *
      horizontalStride;
    const person = relations.peopleById.get(treeNode.personId);
    const label = person?.display_name ?? treeNode.personId;
    const width = labelWidth(label, 96, 178);
    const node: DiagramNode = {
      id: `dual-tree:descendant:${treeNode.personId}`,
      recordId: treeNode.personId,
      relatedRecordIds: [],
      label,
      shape: "person",
      x: centerX - width / 2,
      y: treeNode.depth * generationStride,
      width,
      height: PERSON_HEIGHT,
      sex: person?.sex ?? null,
    };
    nodes.push(node);
    descendantDiagramNodes.set(treeNode.personId, node);
  }

  const edges: DiagramEdge[] = [];
  const renderedAxisEdges = new Set<string>();
  appendMultitreeEdges(
    ancestors,
    ancestorDiagramNodes,
    axisIds,
    edges,
    renderedAxisEdges,
    "ancestor",
  );
  appendMultitreeEdges(
    descendants,
    descendantDiagramNodes,
    axisIds,
    edges,
    renderedAxisEdges,
    "descendant",
  );

  const visiblePeople = new Set<string>([
    ...ancestors.nodesByPerson.keys(),
    ...descendants.nodesByPerson.keys(),
  ]);
  const visibleFamilies = new Set<string>([
    ...axis.familyIds,
    ...ancestors.edges.map((edge) => edge.familyId),
    ...descendants.edges.map((edge) => edge.familyId),
    ...ancestors.supplemental.map((edge) => edge.familyId),
    ...descendants.supplemental.map((edge) => edge.familyId),
  ]);
  const supplementalCount = ancestors.supplemental.length + descendants.supplemental.length;
  const ancestorName = relations.peopleById.get(ancestorPersonId)?.display_name ?? ancestorPersonId;
  const descendantName =
    relations.peopleById.get(descendantPersonId)?.display_name ?? descendantPersonId;

  return {
    methodId: "dual-tree",
    title: "Dual tree: node-link",
    description: `${ancestorName}'s descendant tree and ${descendantName}'s ancestor tree share one emphasized root-to-root axis.`,
    nodes,
    edges,
    bounds: boundsFromNodes(nodes),
    projection: {
      visiblePeople: visiblePeople.size,
      totalPeople: context.document.people.length,
      visibleFamilies: visibleFamilies.size,
      totalFamilies: context.document.families.length,
      label: `A(${descendantName}) union D(${ancestorName})`,
      rule: "The complete recorded ancestor multitree of the descendant end and descendant multitree of the ancestor end are embedded separately, aligned by generation, and merged along their shortest recorded axis. Axis positions use the paper's ancestor/descendant load-weighted average.",
    },
    notes: [
      "The rust outline marks the axis shared by both rooted trees; siblings appear only when they belong to the selected descendant tree.",
      supplementalCount
        ? `${supplementalCount} diamond or relinking edge${supplementalCount === 1 ? " is" : "s are"} skipped from the multitree embedding and retained as dashed supplemental lines.`
        : "No edge had to be skipped to form the two multitreelike embeddings.",
      "Partners are not added automatically in this node-link form.",
    ],
  };
}

export function buildAncestorMultitree(
  relations: GenealogyRelations,
  rootPersonId: string,
  axis: AxisPath,
): Multitree {
  const axisParent = new Map<string, string>();
  for (let index = 1; index < axis.personIds.length; index += 1) {
    const child = axis.personIds[index];
    const parent = axis.personIds[index - 1];
    if (child && parent) {
      axisParent.set(child, parent);
    }
  }
  const nodesByPerson = new Map<string, MultitreeNode>();
  const edges: MultitreeEdge[] = [];
  const supplemental: SupplementalEdge[] = [];

  const visit = (personId: string, depth: number): MultitreeNode => {
    const node: MultitreeNode = {
      key: `ancestor:${personId}`,
      personId,
      depth,
      children: [],
    };
    nodesByPerson.set(personId, node);
    const person = relations.peopleById.get(personId);
    if (!person) {
      return node;
    }
    const candidates: Array<{ parentId: string; familyId: string; onAxis: boolean }> = [];
    for (const family of parentFamiliesForPerson(relations, personId)) {
      for (const parentId of familyParentIds(relations, family)) {
        candidates.push({
          parentId,
          familyId: family.id,
          onAxis: axisParent.get(personId) === parentId,
        });
      }
    }
    candidates.sort(
      (left, right) =>
        Number(right.onAxis) - Number(left.onAxis) ||
        left.familyId.localeCompare(right.familyId) ||
        left.parentId.localeCompare(right.parentId),
    );
    const axisChildren: MultitreeNode[] = [];
    const sideChildren: MultitreeNode[] = [];
    for (const candidate of candidates) {
      const existing = nodesByPerson.get(candidate.parentId);
      if (existing) {
        supplemental.push({
          parentPersonId: candidate.parentId,
          childPersonId: personId,
          familyId: candidate.familyId,
        });
        continue;
      }
      const parentNode = visit(candidate.parentId, depth + 1);
      edges.push({
        parentPersonId: candidate.parentId,
        childPersonId: personId,
        familyId: candidate.familyId,
      });
      (candidate.onAxis ? axisChildren : sideChildren).push(parentNode);
    }
    node.children.push(...sideChildren, ...axisChildren);
    return node;
  };
  return { root: visit(rootPersonId, 0), nodesByPerson, edges, supplemental };
}

export function buildDescendantMultitree(
  relations: GenealogyRelations,
  rootPersonId: string,
  axis: AxisPath,
): Multitree {
  const axisChild = new Map<string, string>();
  for (let index = 0; index < axis.personIds.length - 1; index += 1) {
    const parent = axis.personIds[index];
    const child = axis.personIds[index + 1];
    if (parent && child) {
      axisChild.set(parent, child);
    }
  }
  const nodesByPerson = new Map<string, MultitreeNode>();
  const edges: MultitreeEdge[] = [];
  const supplemental: SupplementalEdge[] = [];

  const visit = (personId: string, depth: number): MultitreeNode => {
    const node: MultitreeNode = {
      key: `descendant:${personId}`,
      personId,
      depth,
      children: [],
    };
    nodesByPerson.set(personId, node);
    const candidates: Array<{ childId: string; familyId: string; onAxis: boolean }> = [];
    for (const family of [...(relations.spouseFamiliesByPerson.get(personId) ?? [])].sort(
      (left, right) => left.id.localeCompare(right.id),
    )) {
      for (const childId of [...family.child_ids].sort()) {
        if (!relations.peopleById.has(childId)) {
          continue;
        }
        candidates.push({
          childId,
          familyId: family.id,
          onAxis: axisChild.get(personId) === childId,
        });
      }
    }
    candidates.sort(
      (left, right) =>
        Number(right.onAxis) - Number(left.onAxis) ||
        left.familyId.localeCompare(right.familyId) ||
        left.childId.localeCompare(right.childId),
    );
    const axisChildren: MultitreeNode[] = [];
    const sideChildren: MultitreeNode[] = [];
    for (const candidate of candidates) {
      const existing = nodesByPerson.get(candidate.childId);
      if (existing) {
        supplemental.push({
          parentPersonId: personId,
          childPersonId: candidate.childId,
          familyId: candidate.familyId,
        });
        continue;
      }
      const childNode = visit(candidate.childId, depth + 1);
      edges.push({
        parentPersonId: personId,
        childPersonId: candidate.childId,
        familyId: candidate.familyId,
      });
      (candidate.onAxis ? axisChildren : sideChildren).push(childNode);
    }
    node.children.push(...axisChildren, ...sideChildren);
    return node;
  };
  return { root: visit(rootPersonId, 0), nodesByPerson, edges, supplemental };
}

function preliminaryLayout(
  root: MultitreeNode,
  order: "ancestor-axis-last" | "descendant-axis-first",
  axis: AxisPath,
): PreliminaryLayout {
  const xByPerson = new Map<string, number>();
  const subtreeSizeByPerson = new Map<string, number>();
  const axisIds = new Set(axis.personIds);
  let nextLeaf = 0;
  const place = (node: MultitreeNode): { center: number; size: number } => {
    const children = [...node.children].sort((left, right) => {
      const leftAxis = axisIds.has(left.personId);
      const rightAxis = axisIds.has(right.personId);
      if (leftAxis !== rightAxis) {
        if (order === "ancestor-axis-last") {
          return Number(leftAxis) - Number(rightAxis);
        }
        return Number(rightAxis) - Number(leftAxis);
      }
      return left.personId.localeCompare(right.personId);
    });
    if (!children.length) {
      const center = nextLeaf;
      nextLeaf += 1;
      xByPerson.set(node.personId, center);
      subtreeSizeByPerson.set(node.personId, 1);
      return { center, size: 1 };
    }
    const placements = children.map(place);
    const center = (placements[0]!.center + placements.at(-1)!.center) / 2;
    const size = 1 + placements.reduce((sum, placement) => sum + placement.size, 0);
    xByPerson.set(node.personId, center);
    subtreeSizeByPerson.set(node.personId, size);
    return { center, size };
  };
  place(root);
  return {
    xByPerson,
    width: Math.max(1, nextLeaf - 1),
    subtreeSizeByPerson,
  };
}

function appendMultitreeEdges(
  tree: Multitree,
  nodes: ReadonlyMap<string, DiagramNode>,
  axisIds: ReadonlySet<string>,
  output: DiagramEdge[],
  renderedAxisEdges: Set<string>,
  prefix: string,
): void {
  for (const edge of tree.edges) {
    const parent = nodes.get(edge.parentPersonId);
    const child = nodes.get(edge.childPersonId);
    if (!parent || !child) {
      continue;
    }
    const isAxis = axisIds.has(edge.parentPersonId) && axisIds.has(edge.childPersonId);
    const axisKey = `${edge.parentPersonId}|${edge.childPersonId}`;
    if (isAxis && renderedAxisEdges.has(axisKey)) {
      continue;
    }
    if (isAxis) {
      renderedAxisEdges.add(axisKey);
    }
    output.push({
      id: `dual-tree:${prefix}:${edge.parentPersonId}:${edge.childPersonId}`,
      points: verticalElbow(parent, child),
      kind: isAxis ? "axis" : "descent",
      recordId: edge.familyId,
    });
  }
  for (const edge of tree.supplemental) {
    const parent = nodes.get(edge.parentPersonId);
    const child = nodes.get(edge.childPersonId);
    if (!parent || !child) {
      continue;
    }
    output.push({
      id: `dual-tree:${prefix}:supplemental:${edge.parentPersonId}:${edge.childPersonId}:${edge.familyId}`,
      points: verticalElbow(parent, child),
      kind: "supplemental",
      recordId: edge.familyId,
    });
  }
}

function parentFamiliesForPerson(
  relations: GenealogyRelations,
  personId: string,
): CanonicalFamily[] {
  const person = relations.peopleById.get(personId);
  if (!person) {
    return [];
  }
  const explicit = person.parent_families
    .map((link) => relations.familiesById.get(link.family_id))
    .filter((family): family is CanonicalFamily => Boolean(family));
  const fallback = relations.parentFamiliesByChild.get(personId) ?? [];
  return [
    ...new Map([...explicit, ...fallback].map((family) => [family.id, family])).values(),
  ].sort((left, right) => left.id.localeCompare(right.id));
}
