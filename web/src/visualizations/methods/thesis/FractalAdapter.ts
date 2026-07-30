import type { CanonicalDocument } from "../../../domain/schema.ts";
import type { VisualizationContext } from "../../adapter.ts";
import { createDiagramAdapter } from "../../diagram/createDiagramAdapter.ts";
import type { DiagramNode, DiagramScene } from "../../diagram/types.ts";
import { boundsFromNodes } from "../genealogyLayout.ts";

const MAX_FRACTAL_PLACEMENTS = 50_000;

interface FractalInstance {
  id: string;
  personId: string;
  parentInstanceId: string | null;
  childInstanceIds: string[];
  depth: number;
  weight: number;
  sourceOrder: number;
}

interface FractalRectangle {
  instanceId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FractalModel {
  rootInstanceId: string;
  instances: FractalInstance[];
  rectangles: FractalRectangle[];
  uniquePersonIds: ReadonlySet<string>;
  familyIds: ReadonlySet<string>;
}

export const fractalAdapter = createDiagramAdapter("fractal", (context, viewport) =>
  buildFractalScene(context, viewport),
);

export function buildFractalScene(
  context: VisualizationContext,
  viewport: Readonly<{ width: number; height: number }> = { width: 1200, height: 760 },
): DiagramScene {
  const rootPersonId = requireFocalPerson(context);
  const rootWidth = 1200;
  const rootHeight = Math.max(680, rootWidth * (viewport.height / Math.max(1, viewport.width)));
  const model = buildFractalModel(context.document, rootPersonId, rootWidth, rootHeight);
  const peopleById = new Map(context.document.people.map((person) => [person.id, person]));
  const instanceById = new Map(model.instances.map((instance) => [instance.id, instance]));
  const nodes = model.rectangles.map<DiagramNode>((rectangle) => {
    const instance = instanceById.get(rectangle.instanceId);
    if (!instance) throw new Error(`Missing fractal instance ${rectangle.instanceId}.`);
    const person = peopleById.get(instance.personId);
    const label = person?.display_name ?? instance.personId;
    return {
      id: `fractal:${instance.id}`,
      recordId: instance.personId,
      relatedRecordIds: [],
      label,
      compactLabel: label,
      shape: "person",
      ...(person ? { sex: person.sex } : {}),
      x: rectangle.x,
      y: rectangle.y,
      width: rectangle.width,
      height: rectangle.height,
      labelVisible: rectangle.width >= 52 && rectangle.height >= 24,
      emphasized: instance.parentInstanceId === null,
    };
  });
  const rootName = peopleById.get(rootPersonId)?.display_name ?? rootPersonId;
  return {
    methodId: "fractal",
    title: "Fractal rectangle subdivision",
    description:
      "Each descendant-path instance receives a nested rectangle weighted by its unfolded subtree size; horizontal and vertical subdivision alternate by depth.",
    nodes,
    edges: [],
    bounds: boundsFromNodes(nodes),
    projection: {
      visiblePeople: model.uniquePersonIds.size,
      totalPeople: context.document.people.length,
      visibleFamilies: model.familyIds.size,
      totalFamilies: context.document.families.length,
      label: `Descendant fractal from ${rootName} · ${model.instances.length.toLocaleString()} rectangles`,
      rule: "Algorithm 5.1 with subtree-size weights, center-heavy child ordering, proportional padding, and an iterative work queue.",
    },
    notes: [
      "Containment, not a line, encodes descent: each child rectangle is nested inside its parent rectangle.",
      "Spouses and ancestors are excluded unless they are also reached as descendants from the chosen root.",
      "A reconvergent Person is deliberately repeated once per descendant path, preserving the tree grammar at the cost of redundancy.",
    ],
  };
}

export function buildFractalModel(
  document: CanonicalDocument,
  rootPersonId: string,
  width = 1200,
  height = 760,
): FractalModel {
  const knownPeople = new Set(document.people.map((person) => person.id));
  if (!knownPeople.has(rootPersonId)) {
    throw new Error(`Fractal root ${rootPersonId} is not in the active Genealogy Document.`);
  }
  const { childrenByParent, familiesByArc } = descendantIndexes(document, knownPeople);
  const root: FractalInstance = {
    id: "0",
    personId: rootPersonId,
    parentInstanceId: null,
    childInstanceIds: [],
    depth: 0,
    weight: 1,
    sourceOrder: 0,
  };
  const instances = [root];
  const stack = [root];
  while (stack.length) {
    const current = stack.pop();
    if (!current) continue;
    const children = childrenByParent.get(current.personId) ?? [];
    const nextInstances = children.map<FractalInstance>((childId, childIndex) => {
      if (instances.length + childIndex >= MAX_FRACTAL_PLACEMENTS) {
        throw new Error(
          `This descendant tree unfolds beyond ${MAX_FRACTAL_PLACEMENTS.toLocaleString()} rectangles because reconvergent people repeat by path. Choose a narrower root or GeneaQuilt for a non-repeating whole-tree view.`,
        );
      }
      return {
        id: `${current.id}.${childIndex}`,
        personId: childId,
        parentInstanceId: current.id,
        childInstanceIds: [],
        depth: current.depth + 1,
        weight: 1,
        sourceOrder: instances.length + childIndex,
      };
    });
    current.childInstanceIds = nextInstances.map((instance) => instance.id);
    instances.push(...nextInstances);
    for (let index = nextInstances.length - 1; index >= 0; index -= 1) {
      const child = nextInstances[index];
      if (child) stack.push(child);
    }
  }

  const instanceById = new Map(instances.map((instance) => [instance.id, instance]));
  for (let index = instances.length - 1; index >= 0; index -= 1) {
    const instance = instances[index];
    if (!instance) continue;
    instance.weight =
      1 +
      instance.childInstanceIds.reduce(
        (sum, childId) => sum + (instanceById.get(childId)?.weight ?? 0),
        0,
      );
  }

  const rectangles: FractalRectangle[] = [];
  const layoutQueue: Array<{
    instanceId: string;
    x: number;
    y: number;
    width: number;
    height: number;
    split: "horizontal" | "vertical";
  }> = [{ instanceId: root.id, x: 0, y: 0, width, height, split: "vertical" }];
  for (let cursor = 0; cursor < layoutQueue.length; cursor += 1) {
    const task = layoutQueue[cursor];
    if (!task) continue;
    rectangles.push({
      instanceId: task.instanceId,
      x: task.x,
      y: task.y,
      width: task.width,
      height: task.height,
    });
    const instance = instanceById.get(task.instanceId);
    if (!instance?.childInstanceIds.length) continue;
    const orderedChildren = gaussianWeightOrder(
      instance.childInstanceIds
        .map((id) => instanceById.get(id))
        .filter((child): child is FractalInstance => Boolean(child)),
    );
    const totalWeight = orderedChildren.reduce((sum, child) => sum + child.weight, 0);
    const padding = Math.max(0.35, Math.min(task.width, task.height) * 0.012);
    if (task.split === "horizontal") {
      const usableHeight = Math.max(0.1, task.height - padding * (orderedChildren.length + 1));
      let y = task.y + padding;
      for (const child of orderedChildren) {
        const childHeight = usableHeight * (child.weight / totalWeight);
        layoutQueue.push({
          instanceId: child.id,
          x: task.x + padding,
          y,
          width: Math.max(0.1, task.width - padding * 2),
          height: Math.max(0.1, childHeight),
          split: "vertical",
        });
        y += childHeight + padding;
      }
    } else {
      const usableWidth = Math.max(0.1, task.width - padding * (orderedChildren.length + 1));
      let x = task.x + padding;
      for (const child of orderedChildren) {
        const childWidth = usableWidth * (child.weight / totalWeight);
        layoutQueue.push({
          instanceId: child.id,
          x,
          y: task.y + padding,
          width: Math.max(0.1, childWidth),
          height: Math.max(0.1, task.height - padding * 2),
          split: "horizontal",
        });
        x += childWidth + padding;
      }
    }
  }

  const uniquePersonIds = new Set(instances.map((instance) => instance.personId));
  const familyIds = new Set<string>();
  for (const instance of instances) {
    const parent = instance.parentInstanceId ? instanceById.get(instance.parentInstanceId) : null;
    if (!parent) continue;
    for (const familyId of familiesByArc.get(`${parent.personId}\u0000${instance.personId}`) ??
      []) {
      familyIds.add(familyId);
    }
  }
  return { rootInstanceId: root.id, instances, rectangles, uniquePersonIds, familyIds };
}

function descendantIndexes(
  document: CanonicalDocument,
  knownPeople: ReadonlySet<string>,
): {
  childrenByParent: ReadonlyMap<string, string[]>;
  familiesByArc: ReadonlyMap<string, string[]>;
} {
  const childrenByParent = new Map<string, string[]>();
  const familiesByArc = new Map<string, string[]>();
  for (const family of document.families) {
    for (const parentId of [family.husband_id, family.wife_id]) {
      if (!parentId || !knownPeople.has(parentId)) continue;
      const children = childrenByParent.get(parentId) ?? [];
      for (const childId of family.child_ids) {
        if (!knownPeople.has(childId)) continue;
        if (!children.includes(childId)) children.push(childId);
        const key = `${parentId}\u0000${childId}`;
        const familyIds = familiesByArc.get(key) ?? [];
        if (!familyIds.includes(family.id)) familyIds.push(family.id);
        familiesByArc.set(key, familyIds);
      }
      childrenByParent.set(parentId, children);
    }
  }
  return { childrenByParent, familiesByArc };
}

function gaussianWeightOrder(children: readonly FractalInstance[]): FractalInstance[] {
  const sorted = [...children].sort(
    (left, right) => right.weight - left.weight || left.sourceOrder - right.sourceOrder,
  );
  const result = new Array<FractalInstance>(sorted.length);
  const center = Math.floor((sorted.length - 1) / 2);
  sorted.forEach((child, index) => {
    const distance = Math.ceil(index / 2);
    const position = index === 0 ? center : index % 2 ? center + distance : center - distance;
    result[position] = child;
  });
  return result.filter((child): child is FractalInstance => Boolean(child));
}

function requireFocalPerson(context: VisualizationContext): string {
  if (!context.focalPersonId) {
    throw new Error("Fractal subdivision needs a descendant root Person.");
  }
  return context.focalPersonId;
}
