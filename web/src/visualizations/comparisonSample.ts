import {
  buildAvrahamComparisonProjection,
  type GenealogyProjection,
} from "../domain/projection.ts";
import type { CanonicalDocument } from "../domain/schema.ts";
import { projectionToDerivedGedcom } from "../domain/toGedcom.ts";
import { DocumentWorkerClient } from "../workers/documentWorkerClient.ts";
import { loadAdamDocument } from "../workspace/adamDocument.ts";

export interface ComparisonFocuses {
  rootPersonId: string;
  middlePersonId: string;
  deepestPersonId: string;
}

export interface LoadedComparisonSample {
  document: CanonicalDocument;
  projection: GenealogyProjection;
  focuses: ComparisonFocuses;
}

let comparisonPromise: Promise<LoadedComparisonSample> | null = null;

export function loadComparisonSample(): Promise<LoadedComparisonSample> {
  comparisonPromise ??= loadComparisonSampleFiles();
  return comparisonPromise;
}

export function comparisonContextFocus(
  methodId: string,
  focuses: ComparisonFocuses,
): { focalPersonId?: string; secondaryFocalPersonId?: string } {
  switch (methodId) {
    case "pedigree":
    case "fan":
    case "h-tree":
      return { focalPersonId: focuses.deepestPersonId };
    case "hourglass":
    case "local-radial":
      return { focalPersonId: focuses.middlePersonId };
    case "timenets":
      return { focalPersonId: focuses.rootPersonId };
    case "dual-tree":
    case "dual-outline":
      return {
        focalPersonId: focuses.deepestPersonId,
        secondaryFocalPersonId: focuses.rootPersonId,
      };
    case "area-adaptive":
    case "column-tree":
    case "bfs":
    case "dfs":
    case "fractal":
      return { focalPersonId: focuses.rootPersonId };
    case "geneaquilt":
      return {};
    default:
      return {};
  }
}

export function findComparisonFocuses(
  document: CanonicalDocument,
  rootPersonId: string,
): ComparisonFocuses {
  const peopleById = new Map(document.people.map((person) => [person.id, person]));
  if (!peopleById.has(rootPersonId)) {
    throw new Error(`Comparison root ${rootPersonId} is missing from the sample.`);
  }
  const childrenByParent = new Map<string, Set<string>>();
  const parentsByChild = new Map<string, Set<string>>();
  for (const family of document.families) {
    const parents = [family.husband_id, family.wife_id].filter((id): id is string =>
      Boolean(id && peopleById.has(id)),
    );
    for (const childId of family.child_ids) {
      if (!peopleById.has(childId)) {
        continue;
      }
      for (const parentId of parents) {
        appendSet(childrenByParent, parentId, childId);
        appendSet(parentsByChild, childId, parentId);
      }
    }
  }

  const depth = new Map<string, number>([[rootPersonId, 0]]);
  const queue = [rootPersonId];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const personId = queue[cursor];
    if (!personId) {
      continue;
    }
    for (const childId of [...(childrenByParent.get(personId) ?? [])].sort()) {
      const nextDepth = (depth.get(personId) ?? 0) + 1;
      if (!depth.has(childId) || nextDepth < (depth.get(childId) ?? Number.POSITIVE_INFINITY)) {
        depth.set(childId, nextDepth);
        queue.push(childId);
      }
    }
  }

  const reachable = [...depth.keys()];
  const middleCandidates = reachable.filter((personId) => depth.get(personId) === 1);
  const deepestDepth = Math.max(...depth.values());
  const deepestCandidates = reachable.filter((personId) => depth.get(personId) === deepestDepth);
  const middlePersonId = rankCandidates(
    middleCandidates.length ? middleCandidates : [rootPersonId],
    (personId) => reachableCount(personId, childrenByParent),
    peopleById,
  );
  const deepestPersonId = rankCandidates(
    deepestCandidates.length ? deepestCandidates : [rootPersonId],
    (personId) => reachableCount(personId, parentsByChild),
    peopleById,
  );

  return { rootPersonId, middlePersonId, deepestPersonId };
}

async function loadComparisonSampleFiles(): Promise<LoadedComparisonSample> {
  const adam = await loadAdamDocument();
  const projection = buildAvrahamComparisonProjection(
    adam.document,
    adam.manifest.anchors.avrahamPersonId,
  );
  const worker = new DocumentWorkerClient();
  try {
    const analyzedProjection = await worker.analyze(projectionToDerivedGedcom(projection));
    const document: CanonicalDocument = {
      ...analyzedProjection,
      people: projection.people,
      families: projection.families,
    };
    return {
      document,
      projection,
      focuses: findComparisonFocuses(document, projection.root_person_id),
    };
  } finally {
    worker.dispose();
  }
}

function rankCandidates(
  candidates: string[],
  score: (personId: string) => number,
  peopleById: ReadonlyMap<string, CanonicalDocument["people"][number]>,
): string {
  return [...candidates].sort(
    (left, right) =>
      score(right) - score(left) ||
      (peopleById.get(left)?.display_name ?? left).localeCompare(
        peopleById.get(right)?.display_name ?? right,
      ) ||
      left.localeCompare(right),
  )[0]!;
}

function reachableCount(startId: string, adjacency: ReadonlyMap<string, Set<string>>): number {
  const visited = new Set<string>([startId]);
  const queue = [startId];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const personId = queue[cursor];
    if (!personId) {
      continue;
    }
    for (const nextId of adjacency.get(personId) ?? []) {
      if (!visited.has(nextId)) {
        visited.add(nextId);
        queue.push(nextId);
      }
    }
  }
  return visited.size;
}

function appendSet(map: Map<string, Set<string>>, key: string, value: string): void {
  const values = map.get(key) ?? new Set<string>();
  values.add(value);
  map.set(key, values);
}
