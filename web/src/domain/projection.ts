import {
  buildGenealogyIndexes,
  type CanonicalDocument,
  type CanonicalFamily,
  type CanonicalPerson,
} from "./schema.ts";

export interface GenealogyProjection {
  id: string;
  title: string;
  rule: string;
  root_person_id: string;
  focus_person_id: string;
  descendant_generations: number;
  people: CanonicalPerson[];
  families: CanonicalFamily[];
  total_people: number;
  total_families: number;
}

interface PathStep {
  personId: string;
  familyId: string | null;
}

export function buildAdamHomeProjection(
  document: CanonicalDocument,
  adamPersonId: string,
  yaakovPersonId: string,
): GenealogyProjection {
  const descendantGenerations = 1;
  const path = findShortestDescendantPath(document, adamPersonId, yaakovPersonId);
  if (!path) {
    throw new Error("Adam and Ya'akov are not connected by a recorded parent-to-child path.");
  }

  const indexes = buildGenealogyIndexes(document);
  const people = new Set<string>();
  const families = new Set<string>();
  for (const step of path) {
    people.add(step.personId);
    if (step.familyId) {
      families.add(step.familyId);
      addFamilyMembers(indexes.familiesById.get(step.familyId), people);
    }
  }
  addDescendantGenerations(document, yaakovPersonId, descendantGenerations, people, families);

  return {
    id: "adam-to-yaakov-and-children",
    title: "Adam HaRishon's Tree",
    rule: "The shortest recorded lineage from Adam to Ya'akov, including the spouse in each lineage Family, then every recorded spouse and child Family of Ya'akov. Ya'akov's children are the terminal generation; no grandchild Families are included.",
    root_person_id: adamPersonId,
    focus_person_id: yaakovPersonId,
    descendant_generations: descendantGenerations,
    people: document.people.filter((person) => people.has(person.id)),
    families: document.families.filter((family) => families.has(family.id)),
    total_people: document.people.length,
    total_families: document.families.length,
  };
}

export function buildAvrahamComparisonProjection(
  document: CanonicalDocument,
  avrahamPersonId: string,
): GenealogyProjection {
  const descendantGenerations = 3;
  const people = new Set<string>([avrahamPersonId]);
  const families = new Set<string>();
  addDescendantGenerations(document, avrahamPersonId, descendantGenerations, people, families);
  return {
    id: "avraham-three-descendant-generations",
    title: "Avraham comparison sample",
    rule: "Avraham, connected spouses, and descendant Families through three descendant generations.",
    root_person_id: avrahamPersonId,
    focus_person_id: avrahamPersonId,
    descendant_generations: descendantGenerations,
    people: document.people.filter((person) => people.has(person.id)),
    families: document.families.filter((family) => families.has(family.id)),
    total_people: document.people.length,
    total_families: document.families.length,
  };
}

function findShortestDescendantPath(
  document: CanonicalDocument,
  startPersonId: string,
  targetPersonId: string,
): PathStep[] | null {
  const indexes = buildGenealogyIndexes(document);
  if (!indexes.peopleById.has(startPersonId) || !indexes.peopleById.has(targetPersonId)) {
    return null;
  }
  const familiesByParent = indexFamiliesByParent(document.families);
  const queue = [startPersonId];
  const predecessor = new Map<string, { personId: string; familyId: string } | null>([
    [startPersonId, null],
  ]);

  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const parentId = queue[cursor];
    if (!parentId) {
      continue;
    }
    if (parentId === targetPersonId) {
      break;
    }
    const families = [...(familiesByParent.get(parentId) ?? [])].sort((left, right) =>
      left.id.localeCompare(right.id),
    );
    for (const family of families) {
      const childIds = [...family.child_ids].sort((left, right) => left.localeCompare(right));
      for (const childId of childIds) {
        if (!indexes.peopleById.has(childId) || predecessor.has(childId)) {
          continue;
        }
        predecessor.set(childId, { personId: parentId, familyId: family.id });
        queue.push(childId);
      }
    }
  }

  if (!predecessor.has(targetPersonId)) {
    return null;
  }
  const reversed: PathStep[] = [{ personId: targetPersonId, familyId: null }];
  let currentId = targetPersonId;
  while (currentId !== startPersonId) {
    const previous = predecessor.get(currentId);
    if (!previous) {
      return null;
    }
    reversed[reversed.length - 1] = { personId: currentId, familyId: previous.familyId };
    reversed.push({ personId: previous.personId, familyId: null });
    currentId = previous.personId;
  }
  return reversed.reverse();
}

function addDescendantGenerations(
  document: CanonicalDocument,
  rootPersonId: string,
  descendantGenerations: number,
  people: Set<string>,
  families: Set<string>,
): void {
  const indexes = buildGenealogyIndexes(document);
  if (!indexes.peopleById.has(rootPersonId)) {
    throw new Error(`Projection root ${rootPersonId} does not exist.`);
  }
  const familiesByParent = indexFamiliesByParent(document.families);
  let currentGeneration = new Set<string>([rootPersonId]);
  people.add(rootPersonId);

  for (let generation = 0; generation < descendantGenerations; generation += 1) {
    const nextGeneration = new Set<string>();
    for (const parentId of [...currentGeneration].sort()) {
      const parentFamilies = [...(familiesByParent.get(parentId) ?? [])].sort((left, right) =>
        left.id.localeCompare(right.id),
      );
      for (const family of parentFamilies) {
        if (family.child_ids.length === 0) {
          continue;
        }
        const visibleChildren = family.child_ids.filter((childId) =>
          indexes.peopleById.has(childId),
        );
        if (visibleChildren.length === 0) {
          continue;
        }
        families.add(family.id);
        addFamilyMembers(family, people);
        for (const childId of visibleChildren) {
          nextGeneration.add(childId);
        }
      }
    }
    currentGeneration = nextGeneration;
  }
}

function addFamilyMembers(family: CanonicalFamily | undefined, people: Set<string>): void {
  if (!family) {
    return;
  }
  if (family.husband_id) {
    people.add(family.husband_id);
  }
  if (family.wife_id) {
    people.add(family.wife_id);
  }
  for (const childId of family.child_ids) {
    people.add(childId);
  }
}

function indexFamiliesByParent(
  families: CanonicalFamily[],
): ReadonlyMap<string, CanonicalFamily[]> {
  const result = new Map<string, CanonicalFamily[]>();
  for (const family of families) {
    for (const parentId of [family.husband_id, family.wife_id]) {
      if (!parentId) {
        continue;
      }
      const parentFamilies = result.get(parentId) ?? [];
      parentFamilies.push(family);
      result.set(parentId, parentFamilies);
    }
  }
  return result;
}
