import {
  buildGenealogyIndexes,
  type CanonicalDocument,
  type CanonicalFamily,
  type CanonicalPerson,
} from "../../domain/schema.ts";
import type { DiagramBounds, DiagramNode, DiagramPoint } from "../diagram/types.ts";

export const PERSON_HEIGHT = 34;
export const FAMILY_HEIGHT = 30;
export const HORIZONTAL_GAP = 32;
export const VERTICAL_GAP = 56;

export interface GenealogyRelations {
  peopleById: ReadonlyMap<string, CanonicalPerson>;
  familiesById: ReadonlyMap<string, CanonicalFamily>;
  parentFamiliesByChild: ReadonlyMap<string, CanonicalFamily[]>;
  spouseFamiliesByPerson: ReadonlyMap<string, CanonicalFamily[]>;
  childrenByParent: ReadonlyMap<string, string[]>;
  parentsByChild: ReadonlyMap<string, string[]>;
}

export function buildRelations(document: CanonicalDocument): GenealogyRelations {
  const indexes = buildGenealogyIndexes(document);
  const parentFamiliesByChild = new Map<string, CanonicalFamily[]>();
  const spouseFamiliesByPerson = new Map<string, CanonicalFamily[]>();
  const childrenByParent = new Map<string, string[]>();
  const parentsByChild = new Map<string, string[]>();

  for (const family of document.families) {
    const parents = [family.husband_id, family.wife_id].filter((id): id is string =>
      Boolean(id && indexes.peopleById.has(id)),
    );
    for (const parentId of parents) {
      append(spouseFamiliesByPerson, parentId, family);
      for (const childId of family.child_ids) {
        if (indexes.peopleById.has(childId)) {
          appendUnique(childrenByParent, parentId, childId);
        }
      }
    }
    for (const childId of family.child_ids) {
      if (!indexes.peopleById.has(childId)) {
        continue;
      }
      append(parentFamiliesByChild, childId, family);
      for (const parentId of parents) {
        appendUnique(parentsByChild, childId, parentId);
      }
    }
  }

  return {
    peopleById: indexes.peopleById,
    familiesById: indexes.familiesById,
    parentFamiliesByChild,
    spouseFamiliesByPerson,
    childrenByParent,
    parentsByChild,
  };
}

export function personName(relations: GenealogyRelations, id: string | null): string {
  if (!id) {
    return "Unknown";
  }
  return relations.peopleById.get(id)?.display_name ?? id;
}

export function familyLabel(relations: GenealogyRelations, family: CanonicalFamily): string {
  return (
    [family.husband_id, family.wife_id]
      .filter((id): id is string => Boolean(id))
      .map((id) => personName(relations, id))
      .join(" + ") || "Family"
  );
}

export function preferredParentFamily(
  relations: GenealogyRelations,
  person: CanonicalPerson,
): CanonicalFamily | null {
  const explicitLinks = [...person.parent_families].sort((left, right) => {
    const leftBirth = left.relationship.toLocaleLowerCase() === "birth" ? 0 : 1;
    const rightBirth = right.relationship.toLocaleLowerCase() === "birth" ? 0 : 1;
    return leftBirth - rightBirth || left.family_id.localeCompare(right.family_id);
  });
  for (const link of explicitLinks) {
    const family = relations.familiesById.get(link.family_id);
    if (family) {
      return family;
    }
  }
  return (
    [...(relations.parentFamiliesByChild.get(person.id) ?? [])].sort((left, right) =>
      left.id.localeCompare(right.id),
    )[0] ?? null
  );
}

export function familyParentIds(relations: GenealogyRelations, family: CanonicalFamily): string[] {
  return [family.husband_id, family.wife_id].filter((id): id is string =>
    Boolean(id && relations.peopleById.has(id)),
  );
}

export function labelWidth(label: string, minimum = 88, maximum = 210): number {
  return Math.max(minimum, Math.min(maximum, 24 + label.length * 7.1));
}

export function boundsFromNodes(nodes: DiagramNode[]): DiagramBounds {
  if (!nodes.length) {
    return { minX: 0, minY: 0, width: 100, height: 100 };
  }
  const minX = Math.min(...nodes.map((node) => node.x));
  const minY = Math.min(...nodes.map((node) => node.y));
  const maxX = Math.max(...nodes.map((node) => node.x + node.width));
  const maxY = Math.max(...nodes.map((node) => node.y + node.height));
  return { minX, minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
}

export function nodeCenter(node: DiagramNode): DiagramPoint {
  return { x: node.x + node.width / 2, y: node.y + node.height / 2 };
}

export function topCenter(node: DiagramNode): DiagramPoint {
  return { x: node.x + node.width / 2, y: node.y };
}

export function bottomCenter(node: DiagramNode): DiagramPoint {
  return { x: node.x + node.width / 2, y: node.y + node.height };
}

export function leftCenter(node: DiagramNode): DiagramPoint {
  return { x: node.x, y: node.y + node.height / 2 };
}

export function rightCenter(node: DiagramNode): DiagramPoint {
  return { x: node.x + node.width, y: node.y + node.height / 2 };
}

export function verticalElbow(from: DiagramNode, to: DiagramNode): DiagramPoint[] {
  const start = bottomCenter(from);
  const end = topCenter(to);
  const middleY = (start.y + end.y) / 2;
  return [start, { x: start.x, y: middleY }, { x: end.x, y: middleY }, end];
}

export function horizontalElbow(from: DiagramNode, to: DiagramNode): DiagramPoint[] {
  const start = rightCenter(from);
  const end = leftCenter(to);
  const middleX = (start.x + end.x) / 2;
  return [start, { x: middleX, y: start.y }, { x: middleX, y: end.y }, end];
}

export function generationRanks(document: CanonicalDocument): ReadonlyMap<string, number> {
  const relations = buildRelations(document);
  const indegree = new Map(document.people.map((person) => [person.id, 0]));
  for (const [childId, parentIds] of relations.parentsByChild) {
    indegree.set(childId, parentIds.length);
  }
  const queue = [...document.people]
    .filter((person) => (indegree.get(person.id) ?? 0) === 0)
    .map((person) => person.id)
    .sort();
  const rank = new Map(document.people.map((person) => [person.id, 0]));
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const parentId = queue[cursor];
    if (!parentId) {
      continue;
    }
    for (const childId of relations.childrenByParent.get(parentId) ?? []) {
      rank.set(childId, Math.max(rank.get(childId) ?? 0, (rank.get(parentId) ?? 0) + 1));
      const nextIndegree = (indegree.get(childId) ?? 1) - 1;
      indegree.set(childId, nextIndegree);
      if (nextIndegree === 0) {
        queue.push(childId);
      }
    }
  }
  return rank;
}

export function projectionDocument(
  document: CanonicalDocument,
  personIds: ReadonlySet<string>,
  familyIds: ReadonlySet<string>,
): CanonicalDocument {
  return {
    ...document,
    people: document.people.filter((person) => personIds.has(person.id)),
    families: document.families.filter((family) => familyIds.has(family.id)),
  };
}

function append<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const values = map.get(key) ?? [];
  values.push(value);
  map.set(key, values);
}

function appendUnique<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const values = map.get(key) ?? [];
  if (!values.includes(value)) {
    values.push(value);
    map.set(key, values);
  }
}
