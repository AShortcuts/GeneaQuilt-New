import type { CanonicalDocument, CanonicalFamily } from "../../../domain/schema.ts";
import type { VisualizationContext } from "../../adapter.ts";
import { createDiagramAdapter } from "../../diagram/createDiagramAdapter.ts";
import type { DiagramEdge, DiagramNode, DiagramScene } from "../../diagram/types.ts";
import {
  PERSON_HEIGHT,
  boundsFromNodes,
  buildRelations,
  horizontalElbow,
  labelWidth,
  preferredParentFamily,
  verticalElbow,
  type GenealogyRelations,
} from "../genealogyLayout.ts";

const PEDIGREE_GENERATIONS = 5;
const HOURGLASS_GENERATIONS = 3;

export interface PedigreeOccurrence {
  key: string;
  personId: string;
  depth: number;
  slot: number;
  parentKey: string | null;
  familyId: string | null;
  role: "focus" | "husband" | "wife";
}

export interface PedigreeConnection {
  childKey: string;
  parentKey: string;
  familyId: string;
}

export interface PedigreeProjection {
  occurrences: PedigreeOccurrence[];
  connections: PedigreeConnection[];
  familyIds: ReadonlySet<string>;
  uniquePersonIds: ReadonlySet<string>;
  duplicatePlacements: number;
  maxDepth: number;
}

interface DescendantPersonOccurrence {
  key: string;
  personId: string;
  depth: number;
  branches: DescendantFamilyBranch[];
}

interface DescendantFamilyBranch {
  key: string;
  familyId: string;
  parentPersonId: string;
  spouseId: string | null;
  children: DescendantPersonOccurrence[];
}

interface SkippedDescent {
  familyId: string;
  childPersonId: string;
  targetKey: string;
  branchKey: string;
}

interface DescendantProjection {
  root: DescendantPersonOccurrence;
  peopleByOccurrence: ReadonlyMap<string, DescendantPersonOccurrence>;
  personIds: ReadonlySet<string>;
  familyIds: ReadonlySet<string>;
  skipped: SkippedDescent[];
}

export const pedigreeAdapter = createDiagramAdapter("pedigree", (context) =>
  buildPedigreeScene(context),
);

export const hourglassAdapter = createDiagramAdapter("hourglass", (context) =>
  buildHourglassScene(context),
);

export function buildPedigreeProjection(
  document: CanonicalDocument,
  focalPersonId: string,
  maxDepth = PEDIGREE_GENERATIONS,
): PedigreeProjection {
  const relations = buildRelations(document);
  if (!relations.peopleById.has(focalPersonId)) {
    throw new Error(`The focal Person ${focalPersonId} does not exist in this genealogy.`);
  }
  const occurrences: PedigreeOccurrence[] = [];
  const connections: PedigreeConnection[] = [];
  const familyIds = new Set<string>();
  const uniquePersonIds = new Set<string>();

  const visit = (
    personId: string,
    key: string,
    depth: number,
    slot: number,
    parentKey: string | null,
    familyId: string | null,
    role: PedigreeOccurrence["role"],
  ): void => {
    const person = relations.peopleById.get(personId);
    if (!person) {
      return;
    }
    occurrences.push({ key, personId, depth, slot, parentKey, familyId, role });
    uniquePersonIds.add(personId);
    if (depth >= maxDepth) {
      return;
    }
    const parentFamily = preferredParentFamily(relations, person);
    if (!parentFamily) {
      return;
    }
    familyIds.add(parentFamily.id);
    const parents = [
      { id: parentFamily.husband_id, role: "husband" as const, bit: 0 },
      { id: parentFamily.wife_id, role: "wife" as const, bit: 1 },
    ];
    for (const parent of parents) {
      if (!parent.id || !relations.peopleById.has(parent.id)) {
        continue;
      }
      const parentOccurrenceKey = `${key}/${parent.role}`;
      connections.push({
        childKey: key,
        parentKey: parentOccurrenceKey,
        familyId: parentFamily.id,
      });
      visit(
        parent.id,
        parentOccurrenceKey,
        depth + 1,
        slot * 2 + parent.bit,
        key,
        parentFamily.id,
        parent.role,
      );
    }
  };

  visit(focalPersonId, "root", 0, 0, null, null, "focus");
  return {
    occurrences,
    connections,
    familyIds,
    uniquePersonIds,
    duplicatePlacements: occurrences.length - uniquePersonIds.size,
    maxDepth,
  };
}

export function buildPedigreeScene(context: VisualizationContext): DiagramScene {
  const focalPersonId = requireFocalPerson(context, "Traditional pedigree");
  const projection = buildPedigreeProjection(context.document, focalPersonId, PEDIGREE_GENERATIONS);
  const relations = buildRelations(context.document);
  const leafStride = 58;
  const fullHeight = leafStride * 2 ** projection.maxDepth;
  const horizontalStride = 238;
  const nodes = projection.occurrences.map<DiagramNode>((occurrence) => {
    const person = relations.peopleById.get(occurrence.personId);
    const label = person?.display_name ?? occurrence.personId;
    const width = labelWidth(label, 100, 188);
    const bandHeight = fullHeight / 2 ** occurrence.depth;
    return {
      id: `pedigree:${occurrence.key}`,
      recordId: occurrence.personId,
      relatedRecordIds: [],
      label,
      shape: "person",
      x: occurrence.depth * horizontalStride,
      y: (occurrence.slot + 0.5) * bandHeight - PERSON_HEIGHT / 2,
      width,
      height: PERSON_HEIGHT,
      sex: person?.sex ?? null,
      emphasized: occurrence.depth === 0,
    };
  });
  const nodesByKey = new Map(
    projection.occurrences.map((occurrence, index) => [occurrence.key, nodes[index]]),
  );
  const edges = projection.connections.flatMap<DiagramEdge>((connection) => {
    const child = nodesByKey.get(connection.childKey);
    const parent = nodesByKey.get(connection.parentKey);
    if (!child || !parent) {
      return [];
    }
    return [
      {
        id: `pedigree-edge:${connection.parentKey}`,
        points: horizontalElbow(child, parent),
        kind: "descent",
        recordId: connection.familyId,
      },
    ];
  });
  const duplicateNote = projection.duplicatePlacements
    ? `${projection.duplicatePlacements} repeated ancestor placement${projection.duplicatePlacements === 1 ? "" : "s"} are deliberately retained; each placement is one pedigree slot, not another real person.`
    : "No repeated ancestor placement occurs within this depth.";
  return {
    methodId: "pedigree",
    title: "Traditional pedigree",
    description:
      "The focal person is at the left; recorded ancestors occupy conventional binary slots to the right.",
    nodes,
    edges,
    bounds: boundsFromNodes(nodes),
    projection: {
      visiblePeople: projection.uniquePersonIds.size,
      totalPeople: context.document.people.length,
      visibleFamilies: projection.familyIds.size,
      totalFamilies: context.document.families.length,
      label: `${PEDIGREE_GENERATIONS}-generation ancestor projection`,
      rule: "For each person, the explicit birth Family is preferred; otherwise the first explicit parent Family is used. Five ancestor generations are expanded, and pedigree collapse repeats the same Person in every required slot.",
    },
    notes: [duplicateNote, "Missing parent roles remain empty; no fictional people are created."],
  };
}

export function buildHourglassScene(context: VisualizationContext): DiagramScene {
  const focalPersonId = requireFocalPerson(context, "Hourglass");
  const relations = buildRelations(context.document);
  const ancestors = buildPedigreeProjection(context.document, focalPersonId, HOURGLASS_GENERATIONS);
  const descendants = buildDescendantProjection(
    context.document,
    focalPersonId,
    HOURGLASS_GENERATIONS,
  );
  const nodes: DiagramNode[] = [];
  const edges: DiagramEdge[] = [];
  const personIds = new Set<string>(ancestors.uniquePersonIds);
  const familyIds = new Set<string>(ancestors.familyIds);
  for (const id of descendants.personIds) {
    personIds.add(id);
  }
  for (const id of descendants.familyIds) {
    familyIds.add(id);
  }

  const ancestorWidth = 132 * 2 ** HOURGLASS_GENERATIONS;
  const ancestorNodeByKey = new Map<string, DiagramNode>();
  for (const occurrence of ancestors.occurrences) {
    const person = relations.peopleById.get(occurrence.personId);
    const label = person?.display_name ?? occurrence.personId;
    const width = labelWidth(label, 96, 176);
    const bandWidth = ancestorWidth / 2 ** occurrence.depth;
    const centerX = (occurrence.slot + 0.5) * bandWidth - ancestorWidth / 2;
    const node: DiagramNode = {
      id: occurrence.depth === 0 ? "hourglass:focus" : `hourglass:ancestor:${occurrence.key}`,
      recordId: occurrence.personId,
      relatedRecordIds: [],
      label,
      shape: "person",
      x: centerX - width / 2,
      y: -occurrence.depth * 146 - PERSON_HEIGHT / 2,
      width,
      height: PERSON_HEIGHT,
      sex: person?.sex ?? null,
      emphasized: occurrence.depth === 0,
    };
    nodes.push(node);
    ancestorNodeByKey.set(occurrence.key, node);
  }

  const ancestorConnectionsByChild = groupConnectionsByChild(ancestors.connections);
  for (const [childKey, connections] of ancestorConnectionsByChild) {
    const child = ancestorNodeByKey.get(childKey);
    const parents = connections
      .map((connection) => ancestorNodeByKey.get(connection.parentKey))
      .filter((node): node is DiagramNode => Boolean(node));
    const familyId = connections[0]?.familyId;
    if (!child || !parents.length || !familyId) {
      continue;
    }
    const centerX =
      parents.reduce((sum, parent) => sum + parent.x + parent.width / 2, 0) / parents.length;
    const familyNode: DiagramNode = {
      id: `hourglass:ancestor-family:${childKey}`,
      recordId: familyId,
      relatedRecordIds: [child.recordId, ...parents.map((parent) => parent.recordId)].filter(
        (id): id is string => Boolean(id),
      ),
      label: "Family",
      labelVisible: false,
      shape: "family",
      x: centerX - 9,
      y: child.y - 65,
      width: 18,
      height: 13,
    };
    nodes.push(familyNode);
    for (const parent of parents) {
      edges.push({
        id: `hourglass:ancestor-parent:${childKey}:${parent.id}`,
        points: verticalElbow(parent, familyNode),
        kind: "family",
        recordId: familyId,
      });
    }
    edges.push({
      id: `hourglass:ancestor-child:${childKey}`,
      points: verticalElbow(familyNode, child),
      kind: "family",
      recordId: familyId,
    });
  }

  appendHourglassDescendants(descendants, relations, nodes, edges, personIds);
  const repeatedAncestors = ancestors.duplicatePlacements;
  return {
    methodId: "hourglass",
    title: "Hourglass chart",
    description:
      "Recorded ancestors expand above one focal person while spouses, Family junctions, and descendants expand below it.",
    nodes,
    edges,
    bounds: boundsFromNodes(nodes),
    projection: {
      visiblePeople: personIds.size,
      totalPeople: context.document.people.length,
      visibleFamilies: familyIds.size,
      totalFamilies: context.document.families.length,
      label: `${HOURGLASS_GENERATIONS} generations each way`,
      rule: "This is A(x) union D(x) around the chosen person x. Three ancestor generations use the preferred recorded parent Family; three descendant generations retain separate spouse Families and their children.",
    },
    notes: [
      "Family junctions keep each spouse and their children together.",
      repeatedAncestors
        ? `${repeatedAncestors} repeated ancestor placement${repeatedAncestors === 1 ? "" : "s"} preserve pedigree collapse.`
        : "No ancestor is repeated within this depth.",
      descendants.skipped.length
        ? `${descendants.skipped.length} reconvergent descent edge${descendants.skipped.length === 1 ? " is" : "s are"} shown as supplemental dashed lines.`
        : "No reconvergent descendant edge is skipped within this depth.",
    ],
  };
}

function buildDescendantProjection(
  document: CanonicalDocument,
  focalPersonId: string,
  maxDepth: number,
): DescendantProjection {
  const relations = buildRelations(document);
  const rootPerson = relations.peopleById.get(focalPersonId);
  if (!rootPerson) {
    throw new Error(`The focal Person ${focalPersonId} does not exist in this genealogy.`);
  }
  const personIds = new Set<string>();
  const familyIds = new Set<string>();
  const peopleByOccurrence = new Map<string, DescendantPersonOccurrence>();
  const occurrenceKeyByPerson = new Map<string, string>();
  const skipped: SkippedDescent[] = [];

  const visit = (personId: string, key: string, depth: number): DescendantPersonOccurrence => {
    const occurrence: DescendantPersonOccurrence = { key, personId, depth, branches: [] };
    peopleByOccurrence.set(key, occurrence);
    occurrenceKeyByPerson.set(personId, key);
    personIds.add(personId);
    if (depth >= maxDepth) {
      return occurrence;
    }
    const families = [...(relations.spouseFamiliesByPerson.get(personId) ?? [])].sort(
      (left, right) => left.id.localeCompare(right.id),
    );
    for (const family of families) {
      const spouseId = spouseInFamily(family, personId);
      const visibleChildren = family.child_ids.filter((id) => relations.peopleById.has(id));
      if (!spouseId && !visibleChildren.length) {
        continue;
      }
      const branch: DescendantFamilyBranch = {
        key: `${key}/family:${family.id}`,
        familyId: family.id,
        parentPersonId: personId,
        spouseId,
        children: [],
      };
      occurrence.branches.push(branch);
      familyIds.add(family.id);
      if (spouseId) {
        personIds.add(spouseId);
      }
      for (const childId of [...visibleChildren].sort()) {
        const existingKey = occurrenceKeyByPerson.get(childId);
        if (existingKey) {
          skipped.push({
            familyId: family.id,
            childPersonId: childId,
            targetKey: existingKey,
            branchKey: branch.key,
          });
          continue;
        }
        branch.children.push(visit(childId, `${branch.key}/child:${childId}`, depth + 1));
      }
    }
    return occurrence;
  };

  return {
    root: visit(focalPersonId, "root", 0),
    peopleByOccurrence,
    personIds,
    familyIds,
    skipped,
  };
}

function appendHourglassDescendants(
  projection: DescendantProjection,
  relations: GenealogyRelations,
  nodes: DiagramNode[],
  edges: DiagramEdge[],
  personIds: Set<string>,
): void {
  const centers = new Map<string, number>();
  const branchCenters = new Map<string, number>();
  const totalUnits = descendantLeafUnits(projection.root);
  assignDescendantCenters(projection.root, 0, centers, branchCenters);
  const slotWidth = 205;
  const centerOffset = totalUnits / 2;
  const nodeByOccurrence = new Map<string, DiagramNode>();
  const nodeByBranch = new Map<string, DiagramNode>();

  for (const occurrence of projection.peopleByOccurrence.values()) {
    if (occurrence.depth === 0) {
      const focus = nodes.find((node) => node.id === "hourglass:focus");
      if (focus) {
        nodeByOccurrence.set(occurrence.key, focus);
      }
      continue;
    }
    const person = relations.peopleById.get(occurrence.personId);
    const label = person?.display_name ?? occurrence.personId;
    const width = labelWidth(label, 96, 176);
    const center = ((centers.get(occurrence.key) ?? centerOffset) - centerOffset) * slotWidth;
    const node: DiagramNode = {
      id: `hourglass:descendant:${occurrence.key}`,
      recordId: occurrence.personId,
      relatedRecordIds: [],
      label,
      shape: "person",
      x: center - width / 2,
      y: occurrence.depth * 154 - PERSON_HEIGHT / 2,
      width,
      height: PERSON_HEIGHT,
      sex: person?.sex ?? null,
    };
    nodes.push(node);
    nodeByOccurrence.set(occurrence.key, node);
  }

  for (const occurrence of projection.peopleByOccurrence.values()) {
    const parentNode = nodeByOccurrence.get(occurrence.key);
    if (!parentNode) {
      continue;
    }
    const parentCenter = parentNode.x + parentNode.width / 2;
    let leftSpouseExtent = parentNode.width / 2;
    let rightSpouseExtent = parentNode.width / 2;
    occurrence.branches.forEach((branch, index) => {
      const branchCenter =
        ((branchCenters.get(branch.key) ?? centerOffset) - centerOffset) * slotWidth;
      const family = relations.familiesById.get(branch.familyId);
      const familyNode: DiagramNode = {
        id: `hourglass:descendant-family:${branch.key}`,
        recordId: branch.familyId,
        relatedRecordIds: [
          branch.parentPersonId,
          branch.spouseId,
          ...branch.children.map((child) => child.personId),
        ].filter((id): id is string => Boolean(id)),
        label: "Family",
        labelVisible: false,
        shape: "family",
        x: branchCenter - 9,
        y: occurrence.depth * 154 + 50,
        width: 18,
        height: 13,
      };
      nodes.push(familyNode);
      nodeByBranch.set(branch.key, familyNode);
      edges.push({
        id: `hourglass:descendant-parent:${branch.key}`,
        points: verticalElbow(parentNode, familyNode),
        kind: "family",
        recordId: branch.familyId,
      });
      if (branch.spouseId) {
        const spouse = relations.peopleById.get(branch.spouseId);
        const label = spouse?.display_name ?? branch.spouseId;
        const width = labelWidth(label, 96, 176);
        const direction =
          branchCenter > parentCenter || (branchCenter === parentCenter && index % 2 === 0)
            ? 1
            : -1;
        const occupiedExtent = direction > 0 ? rightSpouseExtent : leftSpouseExtent;
        const spouseCenter = parentCenter + direction * (occupiedExtent + 28 + width / 2);
        if (direction > 0) {
          rightSpouseExtent += width + 28;
        } else {
          leftSpouseExtent += width + 28;
        }
        const spouseNode: DiagramNode = {
          id: `hourglass:spouse:${branch.key}`,
          recordId: branch.spouseId,
          relatedRecordIds: [branch.parentPersonId],
          label,
          shape: "person",
          x: spouseCenter - width / 2,
          y: occurrence.depth * 154 - PERSON_HEIGHT / 2,
          width,
          height: PERSON_HEIGHT,
          sex: spouse?.sex ?? null,
        };
        nodes.push(spouseNode);
        personIds.add(branch.spouseId);
        edges.push({
          id: `hourglass:descendant-spouse:${branch.key}`,
          points: verticalElbow(spouseNode, familyNode),
          kind: "marriage",
          recordId: branch.familyId,
        });
      }
      for (const child of branch.children) {
        const childNode = nodeByOccurrence.get(child.key);
        if (!childNode) {
          continue;
        }
        edges.push({
          id: `hourglass:descendant-child:${branch.key}:${child.key}`,
          points: verticalElbow(familyNode, childNode),
          kind: "family",
          recordId: branch.familyId,
        });
      }
      if (!family) {
        throw new Error(`Family ${branch.familyId} disappeared during hourglass layout.`);
      }
    });
  }

  for (const skipped of projection.skipped) {
    const familyNode = nodeByBranch.get(skipped.branchKey);
    const target = nodeByOccurrence.get(skipped.targetKey);
    if (!familyNode || !target) {
      continue;
    }
    edges.push({
      id: `hourglass:supplemental:${skipped.branchKey}:${skipped.childPersonId}`,
      points: verticalElbow(familyNode, target),
      kind: "supplemental",
      recordId: skipped.familyId,
    });
  }
}

function descendantLeafUnits(node: DescendantPersonOccurrence): number {
  if (!node.branches.length) {
    return 1;
  }
  return Math.max(
    1,
    node.branches.reduce(
      (sum, branch) =>
        sum +
        Math.max(
          1,
          branch.children.reduce((total, child) => total + descendantLeafUnits(child), 0),
        ),
      0,
    ),
  );
}

function assignDescendantCenters(
  node: DescendantPersonOccurrence,
  start: number,
  centers: Map<string, number>,
  branchCenters: Map<string, number>,
): number {
  if (!node.branches.length) {
    centers.set(node.key, start + 0.5);
    return start + 1;
  }
  let cursor = start;
  const branchMidpoints: number[] = [];
  for (const branch of node.branches) {
    const branchStart = cursor;
    if (!branch.children.length) {
      cursor += 1;
    } else {
      for (const child of branch.children) {
        cursor = assignDescendantCenters(child, cursor, centers, branchCenters);
      }
    }
    const midpoint = (branchStart + cursor) / 2;
    branchCenters.set(branch.key, midpoint);
    branchMidpoints.push(midpoint);
  }
  centers.set(
    node.key,
    branchMidpoints.reduce((sum, midpoint) => sum + midpoint, 0) / branchMidpoints.length,
  );
  return cursor;
}

function groupConnectionsByChild(
  connections: PedigreeConnection[],
): ReadonlyMap<string, PedigreeConnection[]> {
  const result = new Map<string, PedigreeConnection[]>();
  for (const connection of connections) {
    const values = result.get(connection.childKey) ?? [];
    values.push(connection);
    result.set(connection.childKey, values);
  }
  return result;
}

function spouseInFamily(family: CanonicalFamily, personId: string): string | null {
  if (family.husband_id === personId) {
    return family.wife_id;
  }
  if (family.wife_id === personId) {
    return family.husband_id;
  }
  return null;
}

function requireFocalPerson(context: VisualizationContext, methodName: string): string {
  if (!context.focalPersonId) {
    throw new Error(`${methodName} needs a focal person before it can open.`);
  }
  return context.focalPersonId;
}
