import type { CanonicalDocument } from "../../../domain/schema.ts";
import type { VisualizationContext } from "../../adapter.ts";
import { createDiagramAdapter } from "../../diagram/createDiagramAdapter.ts";
import type { DiagramEdge, DiagramNode, DiagramScene } from "../../diagram/types.ts";
import {
  PERSON_HEIGHT,
  bottomCenter,
  boundsFromNodes,
  buildRelations,
  topCenter,
  verticalElbow,
} from "../genealogyLayout.ts";

const AREA_NODE_WIDTH = 156;
const SIBLING_GAP = 28;
const FAMILY_GAP = 54;
const LEAF_ROW_GAP = 18;
const PARENT_GAP = 58;

export interface RootedDescendantNode {
  personId: string;
  depth: number;
  order: number;
  parentPersonId: string | null;
  familyId: string | null;
  children: RootedDescendantNode[];
}

export interface OmittedTreeEdge {
  parentPersonId: string;
  childPersonId: string;
  familyId: string;
}

export interface RootedDescendantTree {
  root: RootedDescendantNode;
  nodesByPerson: ReadonlyMap<string, RootedDescendantNode>;
  familyIds: ReadonlySet<string>;
  omittedEdges: OmittedTreeEdge[];
  excludedSpouseIds: ReadonlySet<string>;
}

export interface AreaAdaptiveLayout {
  positions: ReadonlyMap<string, { x: number; y: number }>;
  foldRows: number;
  foldedLeafGroups: number;
  estimatedAreaUse: number;
  width: number;
  height: number;
}

interface SubtreeLayout {
  positions: Map<string, { x: number; y: number }>;
  width: number;
  height: number;
  foldedLeafGroups: number;
}

interface LayoutCandidate extends SubtreeLayout {
  foldRows: number;
  estimatedAreaUse: number;
}

export const areaAdaptiveAdapter = createDiagramAdapter("area-adaptive", (context, viewport) =>
  buildAreaAdaptiveScene(context, viewport),
);

export function buildRootedDescendantTree(
  document: CanonicalDocument,
  rootPersonId: string,
): RootedDescendantTree {
  const relations = buildRelations(document);
  if (!relations.peopleById.has(rootPersonId)) {
    throw new Error(`The root Person ${rootPersonId} does not exist in this genealogy.`);
  }
  const nodesByPerson = new Map<string, RootedDescendantNode>();
  const familyIds = new Set<string>();
  const omittedEdges: OmittedTreeEdge[] = [];
  const spouseIds = new Set<string>();
  let order = 0;

  const visit = (
    personId: string,
    depth: number,
    parentPersonId: string | null,
    familyId: string | null,
  ): RootedDescendantNode => {
    const node: RootedDescendantNode = {
      personId,
      depth,
      order,
      parentPersonId,
      familyId,
      children: [],
    };
    order += 1;
    nodesByPerson.set(personId, node);
    const families = [...(relations.spouseFamiliesByPerson.get(personId) ?? [])].sort(
      (left, right) => left.id.localeCompare(right.id),
    );
    for (const family of families) {
      const spouseId = spouseInFamily(family.husband_id, family.wife_id, personId);
      if (spouseId && relations.peopleById.has(spouseId)) spouseIds.add(spouseId);
      for (const childId of [...family.child_ids].sort()) {
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
  const excludedSpouseIds = new Set(
    [...spouseIds].filter((personId) => !nodesByPerson.has(personId)),
  );
  return { root, nodesByPerson, familyIds, omittedEdges, excludedSpouseIds };
}

export function buildAreaAdaptiveScene(
  context: VisualizationContext,
  viewport: { width: number; height: number },
): DiagramScene {
  const rootPersonId = context.focalPersonId;
  if (!rootPersonId) {
    throw new Error("Area-adaptive tree needs a root person before it can open.");
  }
  const tree = buildRootedDescendantTree(context.document, rootPersonId);
  const relations = buildRelations(context.document);
  const layout = buildMonotoneLocalFoldingLayout(tree.root, viewport);
  const nodes: DiagramNode[] = [];
  const nodesByPerson = new Map<string, DiagramNode>();
  for (const treeNode of tree.nodesByPerson.values()) {
    const position = layout.positions.get(treeNode.personId);
    if (!position) continue;
    const person = relations.peopleById.get(treeNode.personId);
    const node: DiagramNode = {
      id: `area-adaptive:${treeNode.personId}`,
      recordId: treeNode.personId,
      relatedRecordIds: [],
      label: person?.display_name ?? treeNode.personId,
      shape: "person",
      x: position.x,
      y: position.y,
      width: AREA_NODE_WIDTH,
      height: PERSON_HEIGHT,
      sex: person?.sex ?? null,
      emphasized: treeNode.depth === 0,
    };
    nodes.push(node);
    nodesByPerson.set(treeNode.personId, node);
  }

  const edges: DiagramEdge[] = [];
  for (const treeNode of tree.nodesByPerson.values()) {
    if (!treeNode.parentPersonId || !treeNode.familyId) continue;
    const parent = nodesByPerson.get(treeNode.parentPersonId);
    const child = nodesByPerson.get(treeNode.personId);
    if (!parent || !child) continue;
    const siblingNodes = (tree.nodesByPerson.get(treeNode.parentPersonId)?.children ?? [])
      .filter((sibling) => sibling.familyId === treeNode.familyId)
      .flatMap((sibling) => {
        const siblingNode = nodesByPerson.get(sibling.personId);
        return siblingNode ? [siblingNode] : [];
      });
    edges.push({
      id: `area-adaptive:${treeNode.parentPersonId}:${treeNode.personId}`,
      points: areaAdaptiveEdgePoints(parent, child, siblingNodes),
      kind: "descent",
      recordId: treeNode.familyId,
    });
  }

  const rootName = relations.peopleById.get(rootPersonId)?.display_name ?? rootPersonId;
  const percentUse = Math.round(layout.estimatedAreaUse * 100);
  return {
    methodId: "area-adaptive",
    title: "Area-adaptive rooted tree",
    description: `${rootName}'s descendant spanning tree uses monotone local folding to fit the current viewport shape.`,
    nodes,
    edges,
    bounds: boundsFromNodes(nodes),
    projection: {
      visiblePeople: tree.nodesByPerson.size,
      totalPeople: context.document.people.length,
      visibleFamilies: tree.familyIds.size,
      totalFamilies: context.document.families.length,
      label: `Rooted descendants · ${layout.foldRows} leaf row${layout.foldRows === 1 ? "" : "s"} per fold · ${percentUse}% estimated node-area use`,
      rule: "The first stable parent-to-child encounter forms a rooted descendant spanning tree. Internal subtrees retain a conventional top-down hierarchy; only consecutive leaf siblings from the same Family may fold into a serpentine column sequence. The selected fold height maximizes fitted node-area use for the current viewport.",
    },
    notes: [
      layout.foldedLeafGroups
        ? `${layout.foldedLeafGroups} sibling leaf group${layout.foldedLeafGroups === 1 ? " uses" : "s use"} local folding; non-leaf branches are never folded as if they were terminals.`
        : "No sibling leaf group needs local folding at this viewport shape.",
      `${tree.excludedSpouseIds.size} spouse${tree.excludedSpouseIds.size === 1 ? " is" : "s are"} outside this descendants-only rooted-tree method.`,
      tree.omittedEdges.length
        ? `${tree.omittedEdges.length} reconvergent parent-child edge${tree.omittedEdges.length === 1 ? " is" : "s are"} omitted because the method requires a tree; the Person remains in the first stable position.`
        : "No reconvergent parent-child edge had to be omitted.",
      "Resizing can select a different leaf-fold height while preserving Person order, Family grouping, and downward parent-child direction.",
    ],
  };
}

export function buildMonotoneLocalFoldingLayout(
  root: RootedDescendantNode,
  viewport: { width: number; height: number },
): AreaAdaptiveLayout {
  const target = {
    width: Math.max(1, viewport.width),
    height: Math.max(1, viewport.height),
  };
  const maximumFoldRows = maximumFoldableLeafRun(root);
  const targetAspect = target.width / target.height;
  const cache = new Map<number, LayoutCandidate>();

  const candidateFor = (foldRows: number): LayoutCandidate => {
    const normalizedRows = Math.max(1, Math.min(maximumFoldRows, Math.round(foldRows)));
    const cached = cache.get(normalizedRows);
    if (cached) return cached;
    const layout = layoutSubtree(root, normalizedRows);
    const scale = Math.min(target.width / layout.width, target.height / layout.height);
    const nodeArea = countTreeNodes(root) * AREA_NODE_WIDTH * PERSON_HEIGHT;
    const estimatedAreaUse = Math.min(
      1,
      (nodeArea * scale * scale) / (target.width * target.height),
    );
    const candidate = { ...layout, foldRows: normalizedRows, estimatedAreaUse };
    cache.set(normalizedRows, candidate);
    return candidate;
  };

  const candidateRows = new Set<number>([1, maximumFoldRows]);
  let lower = 1;
  let upper = maximumFoldRows;
  while (lower <= upper) {
    const middle = Math.floor((lower + upper) / 2);
    const candidate = candidateFor(middle);
    candidateRows.add(middle);
    if (candidate.width / Math.max(1, candidate.height) > targetAspect) {
      lower = middle + 1;
    } else {
      upper = middle - 1;
    }
  }
  for (let offset = -2; offset <= 2; offset += 1) {
    candidateRows.add(Math.max(1, Math.min(maximumFoldRows, lower + offset)));
    candidateRows.add(Math.max(1, Math.min(maximumFoldRows, upper + offset)));
  }
  for (let power = 1; power < maximumFoldRows; power *= 2) candidateRows.add(power);

  const candidates = [...candidateRows].map(candidateFor);
  const best = candidates.sort(
    (left, right) =>
      right.estimatedAreaUse - left.estimatedAreaUse ||
      Math.abs(Math.log(left.width / left.height / targetAspect)) -
        Math.abs(Math.log(right.width / right.height / targetAspect)) ||
      left.foldRows - right.foldRows,
  )[0];
  if (!best) throw new Error("Area-adaptive layout could not select a leaf-fold height.");
  return best;
}

function layoutSubtree(node: RootedDescendantNode, foldRows: number): SubtreeLayout {
  if (!node.children.length) {
    return {
      positions: new Map([[node.personId, { x: 0, y: 0 }]]),
      width: AREA_NODE_WIDTH,
      height: PERSON_HEIGHT,
      foldedLeafGroups: 0,
    };
  }

  const groups = childFamilyGroups(node).map((children) => layoutChildGroup(children, foldRows));
  const childrenWidth = groups.reduce(
    (sum, group, index) => sum + group.width + (index ? FAMILY_GAP : 0),
    0,
  );
  const width = Math.max(AREA_NODE_WIDTH, childrenWidth);
  const childOffsetX = (width - childrenWidth) / 2;
  const childOffsetY = PERSON_HEIGHT + PARENT_GAP;
  const positions = new Map<string, { x: number; y: number }>([
    [node.personId, { x: width / 2 - AREA_NODE_WIDTH / 2, y: 0 }],
  ]);
  let groupX = childOffsetX;
  let maximumChildHeight = 0;
  let foldedLeafGroups = 0;
  for (const group of groups) {
    mergePositions(positions, group.positions, groupX, childOffsetY);
    maximumChildHeight = Math.max(maximumChildHeight, group.height);
    foldedLeafGroups += group.foldedLeafGroups;
    groupX += group.width + FAMILY_GAP;
  }
  return {
    positions,
    width,
    height: childOffsetY + maximumChildHeight,
    foldedLeafGroups,
  };
}

function layoutChildGroup(
  children: readonly RootedDescendantNode[],
  foldRows: number,
): SubtreeLayout {
  const items: SubtreeLayout[] = [];
  for (let index = 0; index < children.length;) {
    const child = children[index];
    if (!child) break;
    if (child.children.length) {
      items.push(layoutSubtree(child, foldRows));
      index += 1;
      continue;
    }
    const leaves: RootedDescendantNode[] = [];
    while (index < children.length && children[index]?.children.length === 0) {
      leaves.push(children[index]!);
      index += 1;
    }
    items.push(layoutLeafRun(leaves, foldRows));
  }

  const width = items.reduce((sum, item, index) => sum + item.width + (index ? SIBLING_GAP : 0), 0);
  const height = Math.max(PERSON_HEIGHT, ...items.map((item) => item.height));
  const positions = new Map<string, { x: number; y: number }>();
  let itemX = 0;
  let foldedLeafGroups = 0;
  for (const item of items) {
    mergePositions(positions, item.positions, itemX, 0);
    foldedLeafGroups += item.foldedLeafGroups;
    itemX += item.width + SIBLING_GAP;
  }
  return { positions, width, height, foldedLeafGroups };
}

function layoutLeafRun(leaves: readonly RootedDescendantNode[], foldRows: number): SubtreeLayout {
  const rowCount = Math.max(1, Math.min(foldRows, leaves.length));
  const columnCount = Math.ceil(leaves.length / rowCount);
  const positions = new Map<string, { x: number; y: number }>();
  leaves.forEach((leaf, index) => {
    const column = Math.floor(index / rowCount);
    const positionInColumn = index % rowCount;
    const entriesInColumn = Math.min(rowCount, leaves.length - column * rowCount);
    const row = column % 2 === 0 ? positionInColumn : entriesInColumn - 1 - positionInColumn;
    positions.set(leaf.personId, {
      x: column * (AREA_NODE_WIDTH + SIBLING_GAP),
      y: row * (PERSON_HEIGHT + LEAF_ROW_GAP),
    });
  });
  return {
    positions,
    width: columnCount * AREA_NODE_WIDTH + Math.max(0, columnCount - 1) * SIBLING_GAP,
    height: rowCount * PERSON_HEIGHT + Math.max(0, rowCount - 1) * LEAF_ROW_GAP,
    foldedLeafGroups: rowCount > 1 && leaves.length > 1 ? 1 : 0,
  };
}

function mergePositions(
  target: Map<string, { x: number; y: number }>,
  source: ReadonlyMap<string, { x: number; y: number }>,
  offsetX: number,
  offsetY: number,
): void {
  for (const [personId, position] of source) {
    target.set(personId, { x: position.x + offsetX, y: position.y + offsetY });
  }
}

function maximumFoldableLeafRun(root: RootedDescendantNode): number {
  let maximum = 1;
  const stack = [root];
  while (stack.length) {
    const node = stack.pop()!;
    for (const group of childFamilyGroups(node)) {
      let run = 0;
      for (const child of group) {
        if (child.children.length === 0) {
          run += 1;
          maximum = Math.max(maximum, run);
        } else {
          run = 0;
        }
      }
    }
    stack.push(...node.children);
  }
  return maximum;
}

function countTreeNodes(root: RootedDescendantNode): number {
  let count = 0;
  const stack = [root];
  while (stack.length) {
    const node = stack.pop()!;
    count += 1;
    stack.push(...node.children);
  }
  return count;
}

function childFamilyGroups(parent: RootedDescendantNode): RootedDescendantNode[][] {
  const groups = new Map<string, RootedDescendantNode[]>();
  for (const child of parent.children) {
    const key = child.familyId ?? `person:${child.personId}`;
    const siblings = groups.get(key) ?? [];
    siblings.push(child);
    groups.set(key, siblings);
  }
  return [...groups.values()];
}

function areaAdaptiveEdgePoints(parent: DiagramNode, child: DiagramNode, siblings: DiagramNode[]) {
  const rows = new Set(siblings.map((sibling) => sibling.y));
  if (rows.size <= 1) return verticalElbow(parent, child);
  const start = bottomCenter(parent);
  const end = topCenter(child);
  const spineX = Math.min(...siblings.map((sibling) => sibling.x)) - 22;
  const entryY = Math.min(...siblings.map((sibling) => sibling.y)) - 22;
  const branchY = end.y - 12;
  return [
    start,
    { x: start.x, y: entryY },
    { x: spineX, y: entryY },
    { x: spineX, y: branchY },
    { x: end.x, y: branchY },
    end,
  ];
}

function spouseInFamily(
  husbandId: string | null,
  wifeId: string | null,
  personId: string,
): string | null {
  if (husbandId === personId) return wifeId;
  if (wifeId === personId) return husbandId;
  return null;
}
