import type { CanonicalDocument, CanonicalPerson } from "../../../domain/schema.ts";
import type { VisualizationContext } from "../../adapter.ts";
import { createDiagramAdapter } from "../../diagram/createDiagramAdapter.ts";
import type { DiagramEdge, DiagramGuide, DiagramNode, DiagramScene } from "../../diagram/types.ts";
import { buildRelations } from "../genealogyLayout.ts";

const NODE_WIDTH = 106;
const NODE_HEIGHT = 30;
const SLOT_WIDTH = 122;
const COLUMN_PADDING = 24;
const COLUMN_GAP = 18;
const SUBTREE_GAP_SLOTS = 1;
const GENERATION_GAP = 116;
const UNIQUE_HEIGHT_STEP = 1.5;

export interface ColumnTreeNode {
  personId: string;
  parentPersonId: string | null;
  familyId: string | null;
  depth: number;
  order: number;
  children: ColumnTreeNode[];
}

export interface ColumnTreeProjection {
  root: ColumnTreeNode;
  nodesByPerson: ReadonlyMap<string, ColumnTreeNode>;
  familyIds: ReadonlySet<string>;
  omittedEdges: readonly {
    parentPersonId: string;
    childPersonId: string;
    familyId: string;
  }[];
  excludedSpouseIds: ReadonlySet<string>;
}

export interface ColumnAssignment {
  facet: "birthplace" | "sex";
  fallbackUsed: boolean;
  columnKeys: readonly string[];
  labels: ReadonlyMap<string, string>;
  columnByPerson: ReadonlyMap<string, string>;
}

export interface ColumnSubtree {
  id: string;
  rootPersonId: string;
  columnKey: string;
  incomingDirection: "left" | "right" | "root";
  personIds: readonly string[];
}

export interface ColumnTreeLayout {
  positions: ReadonlyMap<string, { x: number; y: number }>;
  columns: readonly {
    key: string;
    label: string;
    minX: number;
    maxX: number;
  }[];
  subtrees: readonly ColumnSubtree[];
  width: number;
  height: number;
}

export const columnTreeAdapter = createDiagramAdapter("column-tree", (context) =>
  buildColumnTreeScene(context),
);

export function buildColumnTreeProjection(
  document: CanonicalDocument,
  rootPersonId: string,
): ColumnTreeProjection {
  const relations = buildRelations(document);
  if (!relations.peopleById.has(rootPersonId)) {
    throw new Error(`The root Person ${rootPersonId} does not exist in this genealogy.`);
  }
  const nodesByPerson = new Map<string, ColumnTreeNode>();
  const familyIds = new Set<string>();
  const omittedEdges: ColumnTreeProjection["omittedEdges"][number][] = [];
  const spouseIds = new Set<string>();
  let order = 0;

  const visit = (
    personId: string,
    depth: number,
    parentPersonId: string | null,
    familyId: string | null,
  ): ColumnTreeNode => {
    const node: ColumnTreeNode = {
      personId,
      parentPersonId,
      familyId,
      depth,
      order,
      children: [],
    };
    order += 1;
    nodesByPerson.set(personId, node);
    for (const family of relations.spouseFamiliesByPerson.get(personId) ?? []) {
      const spouseId = [family.husband_id, family.wife_id].find(
        (candidateId) => candidateId && candidateId !== personId,
      );
      if (spouseId && relations.peopleById.has(spouseId)) spouseIds.add(spouseId);
      for (const childId of family.child_ids) {
        if (!relations.peopleById.has(childId)) continue;
        if (nodesByPerson.has(childId)) {
          omittedEdges.push({
            parentPersonId: personId,
            childPersonId: childId,
            familyId: family.id,
          });
          continue;
        }
        familyIds.add(family.id);
        node.children.push(visit(childId, depth + 1, personId, family.id));
      }
    }
    return node;
  };

  const root = visit(rootPersonId, 0, null, null);
  return {
    root,
    nodesByPerson,
    familyIds,
    omittedEdges,
    excludedSpouseIds: new Set([...spouseIds].filter((personId) => !nodesByPerson.has(personId))),
  };
}

export function assignColumnTreeFacet(
  document: CanonicalDocument,
  personIds: ReadonlySet<string>,
): ColumnAssignment {
  const people = document.people.filter((person) => personIds.has(person.id));
  const recordedPlaces = new Set(
    people.flatMap((person) => {
      const place = normalizeCategory(person.birth_place);
      return place ? [place] : [];
    }),
  );
  const useBirthplace = recordedPlaces.size >= 2;
  const columnByPerson = new Map<string, string>();
  const labels = new Map<string, string>();
  for (const person of people) {
    const key = useBirthplace ? birthplaceKey(person) : sexKey(person);
    columnByPerson.set(person.id, key);
    labels.set(key, useBirthplace ? birthplaceLabel(person) : sexLabel(person));
  }
  const columnKeys = [...new Set(columnByPerson.values())].sort((left, right) => {
    const leftMissing = left.endsWith(":unknown") ? 1 : 0;
    const rightMissing = right.endsWith(":unknown") ? 1 : 0;
    return (
      leftMissing - rightMissing ||
      (labels.get(left) ?? left).localeCompare(labels.get(right) ?? right)
    );
  });
  return {
    facet: useBirthplace ? "birthplace" : "sex",
    fallbackUsed: !useBirthplace,
    columnKeys,
    labels,
    columnByPerson,
  };
}

export function buildColumnTreeLayout(
  projection: ColumnTreeProjection,
  assignment: ColumnAssignment,
): ColumnTreeLayout {
  const columnIndex = new Map(assignment.columnKeys.map((key, index) => [key, index]));
  const subtrees = identifyColumnSubtrees(projection, assignment, columnIndex);
  const subtreesByColumn = new Map<string, ColumnSubtree[]>();
  for (const subtree of subtrees) append(subtreesByColumn, subtree.columnKey, subtree);
  const columnWidths = new Map<string, number>();
  for (const columnKey of assignment.columnKeys) {
    const columnSubtrees = subtreesByColumn.get(columnKey) ?? [];
    const slots = Math.max(
      1,
      columnSubtrees.reduce(
        (sum, subtree) => sum + subtree.personIds.length + SUBTREE_GAP_SLOTS,
        -SUBTREE_GAP_SLOTS,
      ),
    );
    columnWidths.set(columnKey, slots * SLOT_WIDTH + COLUMN_PADDING * 2);
  }
  const columns: ColumnTreeLayout["columns"][number][] = [];
  let columnX = 0;
  for (const key of assignment.columnKeys) {
    const width = columnWidths.get(key)!;
    columns.push({
      key,
      label: assignment.labels.get(key) ?? key,
      minX: columnX,
      maxX: columnX + width,
    });
    columnX += width + COLUMN_GAP;
  }

  const positions = new Map<string, { x: number; y: number }>();
  for (const column of columns) {
    const columnSubtrees = subtreesByColumn.get(column.key) ?? [];
    const left = columnSubtrees
      .filter((subtree) => subtree.incomingDirection === "left")
      .sort(subtreeHeightOrder(projection));
    const right = columnSubtrees
      .filter((subtree) => subtree.incomingDirection === "right")
      .sort(subtreeHeightOrder(projection));
    const roots = columnSubtrees
      .filter((subtree) => subtree.incomingDirection === "root")
      .sort(subtreeHeightOrder(projection));
    let leftSlot = 0;
    for (const subtree of [...left, ...roots]) {
      assignSubtreeSlots(subtree, projection, assignment, positions, column, leftSlot, false);
      leftSlot += subtree.personIds.length + SUBTREE_GAP_SLOTS;
    }
    let rightSlot = 0;
    for (const subtree of [...right].reverse()) {
      assignSubtreeSlots(subtree, projection, assignment, positions, column, rightSlot, true);
      rightSlot += subtree.personIds.length + SUBTREE_GAP_SLOTS;
    }
  }
  for (const node of projection.nodesByPerson.values()) {
    const position = positions.get(node.personId);
    if (!position) {
      throw new Error(`Column-tree V1 placement is missing ${node.personId}.`);
    }
    position.y = node.depth * GENERATION_GAP + node.order * UNIQUE_HEIGHT_STEP + 58;
  }
  const height = Math.max(
    120,
    ...[...projection.nodesByPerson.values()].map(
      (node) => node.depth * GENERATION_GAP + node.order * UNIQUE_HEIGHT_STEP + 120,
    ),
  );
  return {
    positions,
    columns,
    subtrees,
    width: Math.max(1, columnX - COLUMN_GAP),
    height,
  };
}

export function buildColumnTreeScene(context: VisualizationContext): DiagramScene {
  const rootPersonId = context.focalPersonId;
  if (!rootPersonId) {
    throw new Error("Column tree needs a root person before it can open.");
  }
  const projection = buildColumnTreeProjection(context.document, rootPersonId);
  const assignment = assignColumnTreeFacet(
    context.document,
    new Set(projection.nodesByPerson.keys()),
  );
  const layout = buildColumnTreeLayout(projection, assignment);
  const relations = buildRelations(context.document);
  const nodes: DiagramNode[] = [];
  const personNodes = new Map<string, DiagramNode>();
  for (const column of layout.columns) {
    nodes.push({
      id: `column-tree:column-label:${column.key}`,
      recordId: null,
      relatedRecordIds: [],
      label: column.label,
      shape: "label",
      x: column.minX + 8,
      y: 4,
      width: column.maxX - column.minX - 16,
      height: 24,
      guide: true,
      labelMaxWidth: column.maxX - column.minX - 24,
    });
  }
  for (const treeNode of projection.nodesByPerson.values()) {
    const person = relations.peopleById.get(treeNode.personId);
    const position = layout.positions.get(treeNode.personId)!;
    const node: DiagramNode = {
      id: `column-tree:person:${treeNode.personId}`,
      recordId: treeNode.personId,
      relatedRecordIds: [],
      label: person?.display_name ?? treeNode.personId,
      shape: "person",
      x: position.x,
      y: position.y,
      width: NODE_WIDTH,
      height: NODE_HEIGHT,
      sex: person?.sex ?? null,
      emphasized: treeNode.depth === 0,
    };
    nodes.push(node);
    personNodes.set(treeNode.personId, node);
  }
  const edges: DiagramEdge[] = [];
  for (const treeNode of projection.nodesByPerson.values()) {
    if (!treeNode.parentPersonId || !treeNode.familyId) continue;
    const parent = personNodes.get(treeNode.parentPersonId)!;
    const child = personNodes.get(treeNode.personId)!;
    const parentCenter = { x: parent.x + parent.width / 2, y: parent.y + parent.height / 2 };
    const childCenter = { x: child.x + child.width / 2, y: child.y + child.height / 2 };
    edges.push({
      id: `column-tree:edge:${treeNode.parentPersonId}:${treeNode.personId}`,
      points:
        parentCenter.x === childCenter.x
          ? [parentCenter, childCenter]
          : [parentCenter, { x: childCenter.x, y: parentCenter.y }, childCenter],
      kind: "descent",
      recordId: treeNode.familyId,
    });
  }
  const guides: DiagramGuide[] = [];
  for (const column of layout.columns) {
    guides.push({
      id: `column-tree:border:${column.key}`,
      kind: "line",
      from: { x: column.minX, y: 34 },
      to: { x: column.minX, y: layout.height },
    });
  }
  const lastColumn = layout.columns.at(-1);
  if (lastColumn) {
    guides.push({
      id: "column-tree:border:end",
      kind: "line",
      from: { x: lastColumn.maxX, y: 34 },
      to: { x: lastColumn.maxX, y: layout.height },
    });
  }
  const rootName = relations.peopleById.get(rootPersonId)?.display_name ?? rootPersonId;
  const facetDescription =
    assignment.facet === "birthplace"
      ? "one column per recorded birthplace"
      : "birthplace had fewer than two recorded values, so columns use the GEDCOM SEX value";
  return {
    methodId: "column-tree",
    title: "Tree drawing with columns",
    description: `${rootName}'s descendant spanning tree uses ${facetDescription}.`,
    nodes,
    edges,
    guides,
    bounds: { minX: 0, minY: 0, width: layout.width, height: layout.height },
    projection: {
      visiblePeople: projection.nodesByPerson.size,
      totalPeople: context.document.people.length,
      visibleFamilies: projection.familyIds.size,
      totalFamilies: context.document.families.length,
      label: `Rooted descendants · ${assignment.columnKeys.length} ${assignment.facet} column${assignment.columnKeys.length === 1 ? "" : "s"}`,
      rule: "The first stable parent-to-child encounter forms a rooted descendant spanning tree. Each vertex has a strictly lower height than its parent and belongs to one categorical column. Edges use rectangular-cladogram routing with at most one bend at the parent's height. Under V1, every incoming inter-column edge places its target column subtree against the border nearest the source column, so it does not intersect an intra-edge of that target subtree.",
    },
    notes: [
      assignment.fallbackUsed
        ? "The Source GEDCOM does not contain at least two distinct recorded birthplaces in this projection. The method therefore uses the independent GEDCOM SEX field and does not invent places."
        : "Birthplace columns use exact normalized BIRT.PLAC text; missing values remain in a separate Place not recorded column.",
      `${projection.excludedSpouseIds.size} spouse${projection.excludedSpouseIds.size === 1 ? " is" : "s are"} outside this descendants-only tree.`,
      projection.omittedEdges.length
        ? `${projection.omittedEdges.length} reconvergent parent-child edge${projection.omittedEdges.length === 1 ? " is" : "s are"} omitted because the column method requires a tree; the Person remains in the first stable position.`
        : "No reconvergent parent-child edge had to be omitted.",
      "The V1 placement invariant is enforced. Child and column-subtree order is stable and deterministic, but this web version does not claim the paper's factorial minimum-crossing optimization for high-degree trees.",
    ],
  };
}

function identifyColumnSubtrees(
  projection: ColumnTreeProjection,
  assignment: ColumnAssignment,
  columnIndex: ReadonlyMap<string, number>,
): ColumnSubtree[] {
  const result: ColumnSubtree[] = [];
  const visited = new Set<string>();
  const roots = [...projection.nodesByPerson.values()]
    .filter((node) => {
      if (!node.parentPersonId) return true;
      return (
        assignment.columnByPerson.get(node.parentPersonId) !==
        assignment.columnByPerson.get(node.personId)
      );
    })
    .sort((left, right) => left.order - right.order);
  for (const root of roots) {
    const columnKey = assignment.columnByPerson.get(root.personId)!;
    const personIds: string[] = [];
    const stack = [root];
    while (stack.length) {
      const node = stack.pop()!;
      if (visited.has(node.personId)) continue;
      visited.add(node.personId);
      personIds.push(node.personId);
      for (const child of [...node.children].reverse()) {
        if (assignment.columnByPerson.get(child.personId) === columnKey) stack.push(child);
      }
    }
    const parentColumn = root.parentPersonId
      ? assignment.columnByPerson.get(root.parentPersonId)
      : null;
    const incomingDirection = !parentColumn
      ? "root"
      : (columnIndex.get(parentColumn) ?? 0) < (columnIndex.get(columnKey) ?? 0)
        ? "left"
        : "right";
    result.push({
      id: `column-subtree:${root.personId}`,
      rootPersonId: root.personId,
      columnKey,
      incomingDirection,
      personIds,
    });
  }
  return result;
}

function subtreeHeightOrder(
  projection: ColumnTreeProjection,
): (left: ColumnSubtree, right: ColumnSubtree) => number {
  return (left, right) => {
    const leftRoot = projection.nodesByPerson.get(left.rootPersonId)!;
    const rightRoot = projection.nodesByPerson.get(right.rootPersonId)!;
    return leftRoot.depth - rightRoot.depth || leftRoot.order - rightRoot.order;
  };
}

function assignSubtreeSlots(
  subtree: ColumnSubtree,
  projection: ColumnTreeProjection,
  assignment: ColumnAssignment,
  positions: Map<string, { x: number; y: number }>,
  column: ColumnTreeLayout["columns"][number],
  startingSlot: number,
  mirror: boolean,
): void {
  const ordered = sameColumnPreorder(
    projection.nodesByPerson.get(subtree.rootPersonId)!,
    assignment.columnByPerson,
    subtree.columnKey,
  );
  ordered.forEach((node, index) => {
    const slot = startingSlot + (mirror ? ordered.length - 1 - index : index);
    const centerX = mirror
      ? column.maxX - COLUMN_PADDING - slot * SLOT_WIDTH - NODE_WIDTH / 2
      : column.minX + COLUMN_PADDING + slot * SLOT_WIDTH + NODE_WIDTH / 2;
    positions.set(node.personId, { x: centerX - NODE_WIDTH / 2, y: 0 });
  });
}

function sameColumnPreorder(
  root: ColumnTreeNode,
  columnByPerson: ReadonlyMap<string, string>,
  columnKey: string,
): ColumnTreeNode[] {
  const ordered: ColumnTreeNode[] = [];
  const stack = [root];
  while (stack.length) {
    const node = stack.pop()!;
    ordered.push(node);
    for (const child of [...node.children].reverse()) {
      if (columnByPerson.get(child.personId) === columnKey) stack.push(child);
    }
  }
  return ordered;
}

function normalizeCategory(value: string | null): string | null {
  const normalized = value?.trim().replace(/\s+/g, " ");
  return normalized || null;
}

function birthplaceKey(person: CanonicalPerson): string {
  const place = normalizeCategory(person.birth_place);
  return place ? `place:${place.toLocaleLowerCase()}` : "place:unknown";
}

function birthplaceLabel(person: CanonicalPerson): string {
  return normalizeCategory(person.birth_place) ?? "Place not recorded";
}

function sexKey(person: CanonicalPerson): string {
  const value = person.sex?.trim().toLocaleUpperCase();
  return value === "M" || value === "F" ? `sex:${value}` : "sex:unknown";
}

function sexLabel(person: CanonicalPerson): string {
  const value = person.sex?.trim().toLocaleUpperCase();
  if (value === "M") return "GEDCOM SEX: M";
  if (value === "F") return "GEDCOM SEX: F";
  return "GEDCOM SEX not recorded";
}

function append<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const values = map.get(key) ?? [];
  values.push(value);
  map.set(key, values);
}
