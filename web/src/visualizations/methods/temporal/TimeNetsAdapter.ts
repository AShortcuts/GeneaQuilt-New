import type {
  CanonicalDocument,
  CanonicalFamily,
  CanonicalPerson,
  RecordedDate,
  RecordedDatePrecision,
} from "../../../domain/schema.ts";
import type { VisualizationContext } from "../../adapter.ts";
import { createDiagramAdapter } from "../../diagram/createDiagramAdapter.ts";
import type {
  DiagramEdge,
  DiagramGuide,
  DiagramNode,
  DiagramPoint,
  DiagramScene,
} from "../../diagram/types.ts";
import { buildRelations, generationRanks } from "../genealogyLayout.ts";

const ROW_GAP = 38;
const BLOCK_GAP = 14;
const LABEL_WIDTH = 190;
const LEFT_INSET = 52;
const TOP_INSET = 48;
const DEFAULT_LIFESPAN = 85;
const GENERATION_YEARS = 27;

export interface TimeNetsTemporalValue {
  year: number;
  recorded: boolean;
  uncertain: boolean;
  precision: RecordedDatePrecision | "estimated";
  source: string;
  originalText: string | null;
}

export interface TimeNetsPersonTime {
  personId: string;
  birth: TimeNetsTemporalValue;
  death: TimeNetsTemporalValue;
}

export interface TimeNetsFamilyTime {
  familyId: string;
  marriage: TimeNetsTemporalValue | null;
  divorce: TimeNetsTemporalValue | null;
}

export interface TimeNetsModel {
  hasTemporalAnchor: boolean;
  people: ReadonlyMap<string, TimeNetsPersonTime>;
  families: ReadonlyMap<string, TimeNetsFamilyTime>;
  recordedValues: number;
  estimatedValues: number;
  qualifiedRecordedValues: number;
  conflicts: readonly string[];
}

export interface TimeNetsBlock {
  id: string;
  personIds: readonly string[];
  orderedPersonIds: readonly string[];
  anchorPersonId: string;
  earliestBirth: number;
}

interface MutablePersonTime {
  personId: string;
  birth: TimeNetsTemporalValue | null;
  death: TimeNetsTemporalValue | null;
}

interface MutableFamilyTime {
  familyId: string;
  marriage: TimeNetsTemporalValue | null;
  divorce: TimeNetsTemporalValue | null;
}

interface LifelineGeometry {
  personId: string;
  baseY: number;
  points: DiagramPoint[];
}

interface WeightedNeighbor {
  personId: string;
  distance: number;
}

export const timeNetsAdapter = createDiagramAdapter("timenets", (context, viewport) =>
  buildTimeNetsScene(context, viewport),
);

export function buildTimeNetsModel(document: CanonicalDocument): TimeNetsModel {
  const relations = buildRelations(document);
  const people = new Map<string, MutablePersonTime>();
  const families = new Map<string, MutableFamilyTime>();
  const recordedYears: number[] = [];

  for (const person of document.people) {
    const birth = recordedTemporalValue(person.birth_date ?? null, "recorded birth");
    const death = recordedTemporalValue(person.death_date ?? null, "recorded death");
    people.set(person.id, { personId: person.id, birth, death });
    collectRecordedYears(recordedYears, person.birth_date ?? null);
    collectRecordedYears(recordedYears, person.death_date ?? null);
  }
  for (const family of document.families) {
    const marriage = recordedTemporalValue(family.marriage_date ?? null, "recorded marriage");
    const divorce = recordedTemporalValue(family.divorce_date ?? null, "recorded divorce");
    families.set(family.id, { familyId: family.id, marriage, divorce });
    collectRecordedYears(recordedYears, family.marriage_date ?? null);
    collectRecordedYears(recordedYears, family.divorce_date ?? null);
  }

  if (!recordedYears.length) {
    return {
      hasTemporalAnchor: false,
      people: new Map(),
      families: new Map(),
      recordedValues: 0,
      estimatedValues: 0,
      qualifiedRecordedValues: 0,
      conflicts: [],
    };
  }

  // The paper defines ordered fallback chains. Repeating the chains lets an
  // estimate derived in one Family become usable by a related Person without
  // making source-array order part of the result.
  for (let pass = 0; pass < 8; pass += 1) {
    let changed = false;
    for (const family of document.families) {
      const time = families.get(family.id)!;
      if (!time.marriage && familyParentIds(family).length >= 2) {
        const oldestChildBirth = minimumKnown(
          family.child_ids.map((childId) => people.get(childId)?.birth ?? null),
        );
        if (oldestChildBirth !== null) {
          time.marriage = estimate(oldestChildBirth, "oldest child's birth");
          changed = true;
        }
      }
    }
    for (const person of document.people) {
      const time = people.get(person.id)!;
      if (!time.birth) {
        const parentMarriage = meanKnown(
          (relations.parentFamiliesByChild.get(person.id) ?? []).map(
            (family) => families.get(family.id)?.marriage ?? null,
          ),
        );
        const siblingBirth = meanKnown(
          siblingIds(person, relations.parentFamiliesByChild).map(
            (siblingId) => people.get(siblingId)?.birth ?? null,
          ),
        );
        const spouseBirth = meanKnown(
          spouseIds(person.id, relations.spouseFamiliesByPerson).map(
            (spouseId) => people.get(spouseId)?.birth ?? null,
          ),
        );
        const parentBirth = meanKnown(
          (relations.parentsByChild.get(person.id) ?? []).map(
            (parentId) => people.get(parentId)?.birth ?? null,
          ),
        );
        const childBirth = meanKnown(
          (relations.childrenByParent.get(person.id) ?? []).map(
            (childId) => people.get(childId)?.birth ?? null,
          ),
        );
        const candidate = firstEstimate([
          parentMarriage === null ? null : ([parentMarriage, "parents' marriage"] as const),
          siblingBirth === null ? null : ([siblingBirth, "mean sibling birth"] as const),
          spouseBirth === null ? null : ([spouseBirth, "mean spouse birth"] as const),
          time.death ? [time.death.year - DEFAULT_LIFESPAN, "death minus 85 years"] : null,
          parentBirth === null
            ? null
            : ([parentBirth + GENERATION_YEARS, "mean parent birth plus 27 years"] as const),
          childBirth === null
            ? null
            : ([childBirth - GENERATION_YEARS, "mean child birth minus 27 years"] as const),
        ]);
        if (candidate) {
          time.birth = estimate(candidate[0], candidate[1]);
          changed = true;
        }
      }
      if (!time.death) {
        const siblingDeath = meanKnown(
          siblingIds(person, relations.parentFamiliesByChild).map(
            (siblingId) => people.get(siblingId)?.death ?? null,
          ),
        );
        const spouseDeath = meanKnown(
          spouseIds(person.id, relations.spouseFamiliesByPerson).map(
            (spouseId) => people.get(spouseId)?.death ?? null,
          ),
        );
        const candidate = firstEstimate([
          siblingDeath === null ? null : ([siblingDeath, "mean sibling death"] as const),
          spouseDeath === null ? null : ([spouseDeath, "mean spouse death"] as const),
          time.birth
            ? ([time.birth.year + DEFAULT_LIFESPAN, "birth plus 85 years"] as const)
            : null,
        ]);
        if (candidate) {
          time.death = estimate(candidate[0], candidate[1]);
          changed = true;
        }
      }
    }
    if (!changed) break;
  }

  const ranks = generationRanks(document);
  const recordedBirths = document.people.flatMap((person) => {
    const value = people.get(person.id)?.birth;
    return value?.recorded ? [{ year: value.year, rank: ranks.get(person.id) ?? 0 }] : [];
  });
  const anchorYear = median(recordedBirths.map((entry) => entry.year)) ?? median(recordedYears)!;
  const anchorRank = median(recordedBirths.map((entry) => entry.rank)) ?? 0;
  for (const person of document.people) {
    const time = people.get(person.id)!;
    time.birth ??= estimate(
      anchorYear + ((ranks.get(person.id) ?? 0) - anchorRank) * GENERATION_YEARS,
      "generation-based default anchored to recorded dates",
    );
    time.death ??= estimate(time.birth.year + DEFAULT_LIFESPAN, "birth plus 85 years");
  }
  for (const family of document.families) {
    const time = families.get(family.id)!;
    if (!time.marriage && familyParentIds(family).length >= 2) {
      const oldestChildBirth = minimumKnown(
        family.child_ids.map((childId) => people.get(childId)?.birth ?? null),
      );
      const parentBirth = meanKnown(
        familyParentIds(family).map((parentId) => people.get(parentId)?.birth ?? null),
      );
      if (oldestChildBirth !== null) {
        time.marriage = estimate(oldestChildBirth, "oldest child's birth");
      } else if (parentBirth !== null) {
        time.marriage = estimate(parentBirth + 20, "mean spouse birth plus 20 years");
      }
    }
    // The TimeNets rule is “assume no divorce.” Absence is therefore retained
    // as no event instead of inventing a date that looks sourced.
  }

  const completePeople = new Map<string, TimeNetsPersonTime>();
  for (const [personId, time] of people) {
    completePeople.set(personId, {
      personId,
      birth: time.birth!,
      death: time.death!,
    });
  }
  const completeFamilies = new Map<string, TimeNetsFamilyTime>();
  for (const [familyId, time] of families) {
    completeFamilies.set(familyId, { ...time });
  }
  const allValues = [
    ...[...completePeople.values()].flatMap((time) => [time.birth, time.death]),
    ...[...completeFamilies.values()].flatMap((time) =>
      [time.marriage, time.divorce].filter(
        (value): value is TimeNetsTemporalValue => value !== null,
      ),
    ),
  ];

  return {
    hasTemporalAnchor: true,
    people: completePeople,
    families: completeFamilies,
    recordedValues: allValues.filter((value) => value.recorded).length,
    estimatedValues: allValues.filter((value) => !value.recorded).length,
    qualifiedRecordedValues: allValues.filter((value) => value.recorded && value.uncertain).length,
    conflicts: detectTemporalConflicts(document, completePeople, completeFamilies),
  };
}

export function buildTimeNetsSpouseBlocks(
  document: CanonicalDocument,
  model: TimeNetsModel,
  visiblePersonIds: ReadonlySet<string> = new Set(document.people.map((person) => person.id)),
): TimeNetsBlock[] {
  const parent = new Map([...visiblePersonIds].map((personId) => [personId, personId]));
  const find = (personId: string): string => {
    const current = parent.get(personId);
    if (!current || current === personId) return personId;
    const root = find(current);
    parent.set(personId, root);
    return root;
  };
  const union = (left: string, right: string): void => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot === rightRoot) return;
    const [first, second] = [leftRoot, rightRoot].sort();
    parent.set(second!, first!);
  };
  for (const family of document.families) {
    const spouses = familyParentIds(family).filter((personId) => visiblePersonIds.has(personId));
    if (spouses.length === 2) union(spouses[0]!, spouses[1]!);
  }
  const membersByRoot = new Map<string, string[]>();
  for (const personId of [...visiblePersonIds].sort()) {
    append(membersByRoot, find(personId), personId);
  }
  const spouseFamiliesByPerson = spouseFamilyIdsByPerson(document, visiblePersonIds);
  return [...membersByRoot.values()]
    .map((personIds): TimeNetsBlock => {
      const anchorPersonId = [...personIds].sort(
        (left, right) =>
          (spouseFamiliesByPerson.get(right)?.length ?? 0) -
            (spouseFamiliesByPerson.get(left)?.length ?? 0) || left.localeCompare(right),
      )[0]!;
      const orderedPersonIds = personIds
        .filter((personId) => personId !== anchorPersonId)
        .sort(
          (left, right) =>
            firstMarriageYear(left, spouseFamiliesByPerson, model) -
              firstMarriageYear(right, spouseFamiliesByPerson, model) ||
            model.people.get(left)!.birth.year - model.people.get(right)!.birth.year ||
            left.localeCompare(right),
        );
      orderedPersonIds.push(anchorPersonId);
      return {
        id: `timenets-block:${[...personIds].sort()[0]}`,
        personIds: [...personIds].sort(),
        orderedPersonIds,
        anchorPersonId,
        earliestBirth: Math.min(
          ...personIds.map((personId) => model.people.get(personId)!.birth.year),
        ),
      };
    })
    .sort(
      (left, right) => left.earliestBirth - right.earliestBirth || left.id.localeCompare(right.id),
    );
}

export function orderTimeNetsBlocks(
  document: CanonicalDocument,
  blocks: readonly TimeNetsBlock[],
  model: TimeNetsModel,
): TimeNetsBlock[] {
  const blockByPerson = new Map<string, TimeNetsBlock>();
  for (const block of blocks) {
    for (const personId of block.personIds) blockByPerson.set(personId, block);
  }
  const childrenByBlock = new Map<string, Set<string>>();
  const indegree = new Map(blocks.map((block) => [block.id, 0]));
  for (const family of document.families) {
    const parentBlocks = new Set(
      familyParentIds(family).flatMap((personId) => {
        const block = blockByPerson.get(personId);
        return block ? [block.id] : [];
      }),
    );
    for (const childId of family.child_ids) {
      const childBlock = blockByPerson.get(childId);
      if (!childBlock) continue;
      for (const parentBlockId of parentBlocks) {
        if (parentBlockId === childBlock.id) continue;
        const childBlocks = childrenByBlock.get(parentBlockId) ?? new Set<string>();
        if (!childBlocks.has(childBlock.id)) {
          childBlocks.add(childBlock.id);
          childrenByBlock.set(parentBlockId, childBlocks);
          indegree.set(childBlock.id, (indegree.get(childBlock.id) ?? 0) + 1);
        }
      }
    }
  }
  const blocksById = new Map(blocks.map((block) => [block.id, block]));
  const roots = blocks
    .filter((block) => (indegree.get(block.id) ?? 0) === 0)
    .sort(blockChronologicalOrder);
  const ordered: TimeNetsBlock[] = [];
  const visited = new Set<string>();
  const visit = (block: TimeNetsBlock): void => {
    if (visited.has(block.id)) return;
    visited.add(block.id);
    ordered.push(block);
    const children = [...(childrenByBlock.get(block.id) ?? [])]
      .flatMap((blockId) => {
        const child = blocksById.get(blockId);
        return child ? [child] : [];
      })
      .sort(
        (left, right) =>
          youngestBirth(right, model) - youngestBirth(left, model) ||
          blockChronologicalOrder(left, right),
      );
    for (const child of children) visit(child);
  };
  for (const root of roots) visit(root);
  for (const block of [...blocks].sort(blockChronologicalOrder)) visit(block);
  return ordered;
}

export function selectTimeNetsPeople(
  document: CanonicalDocument,
  model: TimeNetsModel,
  focalPersonId: string | undefined,
  maximumVisible: number,
): { personIds: ReadonlySet<string>; focusPersonId: string; filtered: boolean } {
  const allPersonIds = new Set(document.people.map((person) => person.id));
  const focusPersonId = chooseTimeNetsFocus(document, model, focalPersonId);
  if (allPersonIds.size <= maximumVisible) {
    return { personIds: allPersonIds, focusPersonId, filtered: false };
  }
  const adjacency = weightedGenealogyAdjacency(document);
  const distances = new Map<string, number>([[focusPersonId, 0]]);
  const queue = new MinDistanceQueue();
  queue.push({ personId: focusPersonId, distance: 0 });
  while (queue.size) {
    const current = queue.pop()!;
    if (current.distance !== distances.get(current.personId)) continue;
    for (const neighbor of adjacency.get(current.personId) ?? []) {
      const distance = current.distance + neighbor.distance;
      if (distance < (distances.get(neighbor.personId) ?? Number.POSITIVE_INFINITY)) {
        distances.set(neighbor.personId, distance);
        queue.push({ personId: neighbor.personId, distance });
      }
    }
  }
  const ranked = [...document.people].sort(
    (left, right) =>
      (distances.get(left.id) ?? Number.POSITIVE_INFINITY) -
        (distances.get(right.id) ?? Number.POSITIVE_INFINITY) ||
      recordedPersonValueCount(model, right.id) - recordedPersonValueCount(model, left.id) ||
      left.id.localeCompare(right.id),
  );
  return {
    personIds: new Set(ranked.slice(0, maximumVisible).map((person) => person.id)),
    focusPersonId,
    filtered: true,
  };
}

export function buildTimeNetsScene(
  context: VisualizationContext,
  viewport: { width: number; height: number },
): DiagramScene {
  const model = buildTimeNetsModel(context.document);
  if (!model.hasTemporalAnchor) return noTemporalDataScene(context.document);

  const maximumVisible = Math.max(
    16,
    Math.min(140, Math.floor((Math.max(320, viewport.height) - 80) / (ROW_GAP + BLOCK_GAP / 2))),
  );
  const selection = selectTimeNetsPeople(
    context.document,
    model,
    context.focalPersonId,
    maximumVisible,
  );
  const blocks = orderTimeNetsBlocks(
    context.document,
    buildTimeNetsSpouseBlocks(context.document, model, selection.personIds),
    model,
  );
  const peopleById = new Map(context.document.people.map((person) => [person.id, person]));
  const baseYByPerson = new Map<string, number>();
  let nextY = TOP_INSET;
  for (const block of blocks) {
    for (const personId of block.orderedPersonIds) {
      baseYByPerson.set(personId, nextY);
      nextY += ROW_GAP;
    }
    nextY += BLOCK_GAP;
  }

  const visibleFamilies = context.document.families.filter((family) =>
    familyTouchesVisiblePeople(family, selection.personIds),
  );
  const temporalValues = [
    ...[...selection.personIds].flatMap((personId) => {
      const time = model.people.get(personId)!;
      return [time.birth.year, time.death.year];
    }),
    ...visibleFamilies.flatMap((family) => {
      const time = model.families.get(family.id)!;
      return [time.marriage?.year, time.divorce?.year].filter(
        (year): year is number => year !== undefined,
      );
    }),
  ];
  const minimumYear = Math.min(...temporalValues);
  const maximumYear = Math.max(...temporalValues);
  const span = Math.max(1, maximumYear - minimumYear);
  const targetWidth = Math.max(900, Math.min(5600, viewport.width * 2.35));
  const pixelsPerYear = Math.max(2.2, Math.min(12, targetWidth / span));
  const xForYear = (year: number): number => LEFT_INSET + (year - minimumYear) * pixelsPerYear;

  const familyLanes = buildFamilyLanes(visibleFamilies, blocks, baseYByPerson, model);
  const lifelines = new Map<string, LifelineGeometry>();
  const edges: DiagramEdge[] = [];
  const nodes: DiagramNode[] = [];
  for (const personId of selection.personIds) {
    const person = peopleById.get(personId)!;
    const time = model.people.get(personId)!;
    const baseY = baseYByPerson.get(personId)!;
    const points = lifelinePoints(
      personId,
      baseY,
      time,
      visibleFamilies,
      model,
      familyLanes,
      xForYear,
    );
    lifelines.set(personId, { personId, baseY, points });
    const fade = lifelineFade(time);
    edges.push({
      id: `timenets:lifeline:${personId}`,
      points,
      kind: "lifeline",
      recordId: personId,
      curve: "smooth",
      sex: person.sex,
      ...(fade ? { fade } : {}),
    });
    nodes.push(personTimelineLabel(person, time, baseY, xForYear(time.birth.year)));
  }

  const representedFamilyIds = new Set<string>();
  const eventLabelPositions: { x: number; y: number }[] = [];
  for (const family of visibleFamilies) {
    const familyTime = model.families.get(family.id)!;
    const visibleParents = familyParentIds(family).filter((personId) =>
      selection.personIds.has(personId),
    );
    const visibleChildren = family.child_ids.filter((personId) =>
      selection.personIds.has(personId),
    );
    if (familyTime.marriage && visibleParents.length) {
      representedFamilyIds.add(family.id);
      const eventY = familyEventY(family, familyLanes, baseYByPerson);
      appendFamilyEventNodes(
        nodes,
        family,
        "marriage",
        familyTime.marriage,
        xForYear,
        eventY,
        placeEventLabel(xForYear(familyTime.marriage.year), eventY, eventLabelPositions),
      );
    }
    if (familyTime.divorce && visibleParents.length) {
      representedFamilyIds.add(family.id);
      const eventY = familyEventY(family, familyLanes, baseYByPerson);
      appendFamilyEventNodes(
        nodes,
        family,
        "divorce",
        familyTime.divorce,
        xForYear,
        eventY,
        placeEventLabel(xForYear(familyTime.divorce.year), eventY, eventLabelPositions),
      );
    }
    for (const childId of visibleChildren) {
      const childTime = model.people.get(childId)!;
      const childLine = lifelines.get(childId);
      if (!childLine) continue;
      const childX = xForYear(childTime.birth.year);
      for (const parentId of visibleParents) {
        const parentLine = lifelines.get(parentId);
        if (!parentLine) continue;
        representedFamilyIds.add(family.id);
        edges.push({
          id: `timenets:drop:${family.id}:${parentId}:${childId}`,
          points: [
            { x: childX, y: yAlongLifeline(parentLine.points, childX) },
            { x: childX, y: childLine.baseY },
          ],
          kind: "drop",
          directed: true,
          recordId: family.id,
        });
      }
    }
  }

  const top = TOP_INSET - 42;
  const bottom = Math.max(TOP_INSET + 100, nextY - BLOCK_GAP + 28);
  const guides = timelineGuides(minimumYear, maximumYear, top, bottom, xForYear);
  const width = xForYear(maximumYear) - xForYear(minimumYear) + LABEL_WIDTH + 28;
  const filteredCount = context.document.people.length - selection.personIds.size;
  const notes = [
    `${model.recordedValues} date value${model.recordedValues === 1 ? " is" : "s are"} recorded; ${model.estimatedValues} missing value${model.estimatedValues === 1 ? " is" : "s are"} visibly estimated for layout.`,
    `A tilde, faded lifeline end, or dashed event marker means the date is estimated or qualified in the Source GEDCOM; recorded values are never replaced.`,
    `Spouse-connected people form local blocks. Within a block, spouses follow first-marriage order; descendant blocks use youngest-to-oldest preorder, with stable record IDs breaking ties.`,
    filteredCount
      ? `${filteredCount} lower-interest people are currently elided. Spouses cost less than parent-child hops in the deterministic focus filter; choose or search for another person to recenter the view.`
      : "The complete current Genealogy Document fits this TimeNets view, so no degree-of-interest filtering is applied.",
    model.conflicts.length
      ? `${model.conflicts.length} recorded chronological conflict${model.conflicts.length === 1 ? " is" : "s are"} preserved and flagged; event geometry is constrained to each visible lifespan only where drawing requires it.`
      : "No recorded birth, death, marriage, or divorce order conflicts were found.",
  ];
  return {
    methodId: "timenets",
    title: "TimeNets",
    description:
      "Metric time runs left to right. Lifelines converge at marriage, diverge at divorce, and directional drop lines end at each child's birth.",
    nodes,
    edges,
    guides,
    bounds: {
      minX: xForYear(minimumYear) - 24,
      minY: top,
      width,
      height: bottom - top,
    },
    projection: {
      visiblePeople: selection.personIds.size,
      totalPeople: context.document.people.length,
      visibleFamilies: representedFamilyIds.size,
      totalFamilies: context.document.families.length,
      label: selection.filtered
        ? `Time focus · ${selection.personIds.size} highest-interest people`
        : "Complete metric timeline",
      rule: "Horizontal position is metric year. A Person's first and last points are birth and death; marriage/divorce events change only vertical position. Binary Family links create one directional drop per recorded parent at the child's birth. Large documents are filtered by weighted relationship distance from a stable focus, with spouses ranked ahead of equally distant parent-child hops.",
    },
    notes,
  };
}

function noTemporalDataScene(document: CanonicalDocument): DiagramScene {
  const message =
    "TimeNets needs at least one recorded date before it can estimate a metric timeline.";
  return {
    methodId: "timenets",
    title: "TimeNets",
    description: message,
    nodes: [
      {
        id: "timenets:no-dates",
        recordId: null,
        relatedRecordIds: [],
        label: message,
        shape: "label",
        x: 0,
        y: 24,
        width: 430,
        height: 34,
        labelMaxWidth: 420,
      },
    ],
    edges: [],
    bounds: { minX: 0, minY: 0, width: 430, height: 90 },
    projection: {
      visiblePeople: 0,
      totalPeople: document.people.length,
      visibleFamilies: 0,
      totalFamilies: document.families.length,
      label: "No metric timeline",
      rule: "TimeNets does not invent an entire chronology when the Source GEDCOM contains no temporal anchor at all.",
    },
    notes: [
      "Add at least one recorded birth, death, marriage, or divorce date in the source genealogy program and reopen the GEDCOM.",
    ],
  };
}

function recordedTemporalValue(
  date: RecordedDate | null,
  source: string,
): TimeNetsTemporalValue | null {
  if (!date) return null;
  const values = [date.start_year, date.end_year].filter((year): year is number => year !== null);
  if (!values.length) return null;
  const year = Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
  return {
    year,
    recorded: true,
    uncertain:
      date.precision !== "exact" ||
      date.start_year === null ||
      date.end_year === null ||
      date.start_year !== date.end_year,
    precision: date.precision,
    source,
    originalText: date.original_text,
  };
}

function estimate(year: number, source: string): TimeNetsTemporalValue {
  return {
    year: Math.round(year),
    recorded: false,
    uncertain: true,
    precision: "estimated",
    source,
    originalText: null,
  };
}

function collectRecordedYears(years: number[], date: RecordedDate | null): void {
  if (date?.start_year !== null && date?.start_year !== undefined) years.push(date.start_year);
  if (date?.end_year !== null && date?.end_year !== undefined) years.push(date.end_year);
}

function firstEstimate(
  candidates: readonly (readonly [number, string] | null)[],
): readonly [number, string] | null {
  return (
    candidates.find((candidate): candidate is readonly [number, string] => candidate !== null) ??
    null
  );
}

function meanKnown(values: readonly (TimeNetsTemporalValue | null)[]): number | null {
  const years = values.flatMap((value) => (value ? [value.year] : []));
  return years.length ? years.reduce((sum, year) => sum + year, 0) / years.length : null;
}

function minimumKnown(values: readonly (TimeNetsTemporalValue | null)[]): number | null {
  const years = values.flatMap((value) => (value ? [value.year] : []));
  return years.length ? Math.min(...years) : null;
}

function median(values: readonly number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function familyParentIds(family: CanonicalFamily): string[] {
  return [family.husband_id, family.wife_id].filter((personId): personId is string =>
    Boolean(personId),
  );
}

function siblingIds(
  person: CanonicalPerson,
  parentFamiliesByChild: ReadonlyMap<string, CanonicalFamily[]>,
): string[] {
  return [
    ...new Set(
      (parentFamiliesByChild.get(person.id) ?? [])
        .flatMap((family) => family.child_ids)
        .filter((personId) => personId !== person.id),
    ),
  ].sort();
}

function spouseIds(
  personId: string,
  spouseFamiliesByPerson: ReadonlyMap<string, CanonicalFamily[]>,
): string[] {
  return [
    ...new Set(
      (spouseFamiliesByPerson.get(personId) ?? []).flatMap((family) =>
        familyParentIds(family).filter((candidateId) => candidateId !== personId),
      ),
    ),
  ].sort();
}

function detectTemporalConflicts(
  document: CanonicalDocument,
  people: ReadonlyMap<string, TimeNetsPersonTime>,
  families: ReadonlyMap<string, TimeNetsFamilyTime>,
): string[] {
  const conflicts = new Set<string>();
  for (const person of document.people) {
    const time = people.get(person.id)!;
    if (time.birth.recorded && time.death.recorded && time.death.year < time.birth.year) {
      conflicts.add(`${person.id}: recorded death precedes recorded birth`);
    }
  }
  for (const family of document.families) {
    const time = families.get(family.id)!;
    if (time.marriage?.recorded) {
      for (const parentId of familyParentIds(family)) {
        const personTime = people.get(parentId);
        if (!personTime) continue;
        if (personTime.birth.recorded && time.marriage.year < personTime.birth.year) {
          conflicts.add(`${family.id}: recorded marriage precedes ${parentId}'s recorded birth`);
        }
        if (personTime.death.recorded && time.marriage.year > personTime.death.year) {
          conflicts.add(`${family.id}: recorded marriage follows ${parentId}'s recorded death`);
        }
      }
    }
    if (
      time.marriage?.recorded &&
      time.divorce?.recorded &&
      time.divorce.year < time.marriage.year
    ) {
      conflicts.add(`${family.id}: recorded divorce precedes recorded marriage`);
    }
  }
  return [...conflicts].sort();
}

function spouseFamilyIdsByPerson(
  document: CanonicalDocument,
  visiblePersonIds: ReadonlySet<string>,
): ReadonlyMap<string, string[]> {
  const familiesByPerson = new Map<string, string[]>();
  for (const family of document.families) {
    for (const personId of familyParentIds(family)) {
      if (visiblePersonIds.has(personId)) append(familiesByPerson, personId, family.id);
    }
  }
  return familiesByPerson;
}

function firstMarriageYear(
  personId: string,
  familyIdsByPerson: ReadonlyMap<string, string[]>,
  model: TimeNetsModel,
): number {
  return Math.min(
    Number.POSITIVE_INFINITY,
    ...(familyIdsByPerson.get(personId) ?? []).map(
      (familyId) => model.families.get(familyId)?.marriage?.year ?? Number.POSITIVE_INFINITY,
    ),
  );
}

function blockChronologicalOrder(left: TimeNetsBlock, right: TimeNetsBlock): number {
  return left.earliestBirth - right.earliestBirth || left.id.localeCompare(right.id);
}

function youngestBirth(block: TimeNetsBlock, model: TimeNetsModel): number {
  return Math.max(...block.personIds.map((personId) => model.people.get(personId)!.birth.year));
}

function chooseTimeNetsFocus(
  document: CanonicalDocument,
  model: TimeNetsModel,
  requested: string | undefined,
): string {
  if (requested && model.people.has(requested)) return requested;
  const spouseDegree = spouseFamilyIdsByPerson(
    document,
    new Set(document.people.map((person) => person.id)),
  );
  return [...document.people].sort(
    (left, right) =>
      recordedPersonValueCount(model, right.id) - recordedPersonValueCount(model, left.id) ||
      (spouseDegree.get(right.id)?.length ?? 0) - (spouseDegree.get(left.id)?.length ?? 0) ||
      left.id.localeCompare(right.id),
  )[0]!.id;
}

function recordedPersonValueCount(model: TimeNetsModel, personId: string): number {
  const time = model.people.get(personId);
  return time ? Number(time.birth.recorded) + Number(time.death.recorded) : 0;
}

function weightedGenealogyAdjacency(
  document: CanonicalDocument,
): ReadonlyMap<string, WeightedNeighbor[]> {
  const adjacency = new Map<string, WeightedNeighbor[]>();
  for (const family of document.families) {
    const parents = familyParentIds(family);
    if (parents.length === 2) {
      append(adjacency, parents[0]!, { personId: parents[1]!, distance: 0.5 });
      append(adjacency, parents[1]!, { personId: parents[0]!, distance: 0.5 });
    }
    for (const childId of family.child_ids) {
      for (const parentId of parents) {
        append(adjacency, parentId, { personId: childId, distance: 1 });
        append(adjacency, childId, { personId: parentId, distance: 1 });
      }
    }
  }
  return adjacency;
}

class MinDistanceQueue {
  readonly #values: WeightedNeighbor[] = [];

  get size(): number {
    return this.#values.length;
  }

  push(value: WeightedNeighbor): void {
    this.#values.push(value);
    let index = this.#values.length - 1;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (compareWeighted(this.#values[parent]!, value) <= 0) break;
      this.#values[index] = this.#values[parent]!;
      index = parent;
    }
    this.#values[index] = value;
  }

  pop(): WeightedNeighbor | null {
    const first = this.#values[0];
    const last = this.#values.pop();
    if (!first || !last || !this.#values.length) return first ?? null;
    let index = 0;
    this.#values[0] = last;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      if (left >= this.#values.length) break;
      const smaller =
        right < this.#values.length &&
        compareWeighted(this.#values[right]!, this.#values[left]!) < 0
          ? right
          : left;
      if (compareWeighted(this.#values[index]!, this.#values[smaller]!) <= 0) break;
      [this.#values[index], this.#values[smaller]] = [this.#values[smaller]!, this.#values[index]!];
      index = smaller;
    }
    return first;
  }
}

function compareWeighted(left: WeightedNeighbor, right: WeightedNeighbor): number {
  return left.distance - right.distance || left.personId.localeCompare(right.personId);
}

function familyTouchesVisiblePeople(
  family: CanonicalFamily,
  visiblePersonIds: ReadonlySet<string>,
): boolean {
  return [...familyParentIds(family), ...family.child_ids].some((personId) =>
    visiblePersonIds.has(personId),
  );
}

function buildFamilyLanes(
  families: readonly CanonicalFamily[],
  blocks: readonly TimeNetsBlock[],
  baseYByPerson: ReadonlyMap<string, number>,
  model: TimeNetsModel,
): ReadonlyMap<string, ReadonlyMap<string, number>> {
  const blockByPerson = new Map<string, TimeNetsBlock>();
  for (const block of blocks) {
    for (const personId of block.personIds) blockByPerson.set(personId, block);
  }
  const directFamiliesByAnchor = new Map<string, CanonicalFamily[]>();
  for (const family of families) {
    const parents = familyParentIds(family).filter((personId) => baseYByPerson.has(personId));
    if (parents.length !== 2) continue;
    const block = blockByPerson.get(parents[0]!);
    if (block && parents.includes(block.anchorPersonId)) {
      append(directFamiliesByAnchor, block.anchorPersonId, family);
    }
  }
  for (const anchorFamilies of directFamiliesByAnchor.values()) {
    anchorFamilies.sort(
      (left, right) =>
        (model.families.get(left.id)?.marriage?.year ?? Number.POSITIVE_INFINITY) -
          (model.families.get(right.id)?.marriage?.year ?? Number.POSITIVE_INFINITY) ||
        left.id.localeCompare(right.id),
    );
  }
  const lanes = new Map<string, ReadonlyMap<string, number>>();
  for (const family of families) {
    const parents = familyParentIds(family).filter((personId) => baseYByPerson.has(personId));
    const familyLanes = new Map<string, number>();
    if (parents.length === 1) {
      familyLanes.set(parents[0]!, baseYByPerson.get(parents[0]!)!);
    } else if (parents.length === 2) {
      const block = blockByPerson.get(parents[0]!);
      const anchorId =
        block && parents.includes(block.anchorPersonId) ? block.anchorPersonId : null;
      if (anchorId) {
        const otherId = parents.find((personId) => personId !== anchorId)!;
        const ordinal = (directFamiliesByAnchor.get(anchorId) ?? []).findIndex(
          (entry) => entry.id === family.id,
        );
        familyLanes.set(anchorId, baseYByPerson.get(anchorId)!);
        familyLanes.set(otherId, baseYByPerson.get(anchorId)! - 7 * (Math.max(0, ordinal) + 1));
      } else {
        const center = (baseYByPerson.get(parents[0]!)! + baseYByPerson.get(parents[1]!)!) / 2;
        familyLanes.set(parents[0]!, center - 3.5);
        familyLanes.set(parents[1]!, center + 3.5);
      }
    }
    lanes.set(family.id, familyLanes);
  }
  return lanes;
}

function lifelinePoints(
  personId: string,
  baseY: number,
  personTime: TimeNetsPersonTime,
  families: readonly CanonicalFamily[],
  model: TimeNetsModel,
  familyLanes: ReadonlyMap<string, ReadonlyMap<string, number>>,
  xForYear: (year: number) => number,
): DiagramPoint[] {
  const relevantFamilies = families
    .filter((family) => familyParentIds(family).includes(personId))
    .flatMap((family) => {
      const time = model.families.get(family.id);
      return time?.marriage ? [{ family, time }] : [];
    })
    .sort(
      (left, right) =>
        left.time.marriage!.year - right.time.marriage!.year ||
        left.family.id.localeCompare(right.family.id),
    );
  const startYear = personTime.birth.year;
  const endYear = Math.max(startYear + 1, personTime.death.year);
  const transitionYears = Math.max(0.5, Math.min(3, (endYear - startYear) * 0.025));
  const temporalPoints: { year: number; y: number; order: number }[] = [
    { year: startYear, y: baseY, order: 0 },
  ];
  let currentY = baseY;
  let order = 1;
  for (const { family, time } of relevantFamilies) {
    const targetY = familyLanes.get(family.id)?.get(personId) ?? baseY;
    const marriageYear = clamp(time.marriage!.year, startYear, endYear);
    temporalPoints.push(
      { year: Math.max(startYear, marriageYear - transitionYears), y: currentY, order },
      { year: marriageYear, y: targetY, order: order + 1 },
    );
    order += 2;
    currentY = targetY;
    if (time.divorce) {
      const divorceYear = clamp(time.divorce.year, marriageYear, endYear);
      temporalPoints.push(
        { year: divorceYear, y: targetY, order },
        { year: Math.min(endYear, divorceYear + transitionYears), y: baseY, order: order + 1 },
      );
      order += 2;
      currentY = baseY;
    }
  }
  temporalPoints.push({ year: endYear, y: currentY, order });
  temporalPoints.sort((left, right) => left.year - right.year || left.order - right.order);
  const points: DiagramPoint[] = [];
  for (const point of temporalPoints) {
    const next = { x: xForYear(point.year), y: point.y };
    const previous = points.at(-1);
    if (previous?.x === next.x && previous.y === next.y) continue;
    points.push(next);
  }
  return points;
}

function lifelineFade(time: TimeNetsPersonTime): DiagramEdge["fade"] {
  const birth = time.birth.uncertain;
  const death = time.death.uncertain;
  if (birth && death) return "both";
  if (birth) return "start";
  if (death) return "end";
  return undefined;
}

function personTimelineLabel(
  person: CanonicalPerson,
  time: TimeNetsPersonTime,
  baseY: number,
  birthX: number,
): DiagramNode {
  const label = `${person.display_name} ${formatTemporalYear(time.birth)}–${formatTemporalYear(time.death)}`;
  return {
    id: `timenets:person-label:${person.id}`,
    recordId: person.id,
    relatedRecordIds: [],
    label,
    compactLabel: `${person.display_name} ${formatTemporalYear(time.birth)}–${formatTemporalYear(time.death)}`,
    shape: "label",
    x: birthX,
    y: baseY - 25,
    width: LABEL_WIDTH,
    height: 20,
    sex: person.sex,
    uncertain: time.birth.uncertain || time.death.uncertain,
    labelX: 2,
    labelY: 10,
    labelAnchor: "start",
    labelMaxWidth: LABEL_WIDTH,
  };
}

function appendFamilyEventNodes(
  nodes: DiagramNode[],
  family: CanonicalFamily,
  kind: "marriage" | "divorce",
  value: TimeNetsTemporalValue,
  xForYear: (year: number) => number,
  y: number,
  labelY: number,
): void {
  const x = xForYear(value.year);
  const prefix = kind === "marriage" ? "m." : "d.";
  nodes.push({
    id: `timenets:${kind}-marker:${family.id}`,
    recordId: family.id,
    relatedRecordIds: familyParentIds(family),
    label: `${kind === "marriage" ? "Marriage" : "Divorce"} ${formatTemporalYear(value)} (${value.source})`,
    shape: "diamond",
    x: x - 5,
    y: y - 5,
    width: 10,
    height: 10,
    uncertain: value.uncertain,
    labelVisible: false,
  });
  nodes.push({
    id: `timenets:${kind}-label:${family.id}`,
    recordId: family.id,
    relatedRecordIds: familyParentIds(family),
    label: `${prefix}${formatTemporalYear(value)}`,
    shape: "label",
    x: x + 7,
    y: labelY,
    width: 72,
    height: 18,
    uncertain: value.uncertain,
    labelX: 0,
    labelY: 9,
    labelAnchor: "start",
    labelMaxWidth: 72,
  });
}

function placeEventLabel(x: number, markerY: number, occupied: { x: number; y: number }[]): number {
  const candidates = [markerY - 18, markerY + 8, markerY - 34, markerY + 24, markerY - 50];
  const y =
    candidates.find((candidateY) =>
      occupied.every(
        (position) => Math.abs(position.x - x) >= 82 || Math.abs(position.y - candidateY) >= 18,
      ),
    ) ?? markerY + 40;
  occupied.push({ x, y });
  return y;
}

function familyEventY(
  family: CanonicalFamily,
  familyLanes: ReadonlyMap<string, ReadonlyMap<string, number>>,
  baseYByPerson: ReadonlyMap<string, number>,
): number {
  const lanes = [...(familyLanes.get(family.id)?.values() ?? [])];
  if (lanes.length) return lanes.reduce((sum, y) => sum + y, 0) / lanes.length;
  const parentYs = familyParentIds(family).flatMap((personId) => {
    const y = baseYByPerson.get(personId);
    return y === undefined ? [] : [y];
  });
  return parentYs.length ? parentYs.reduce((sum, y) => sum + y, 0) / parentYs.length : TOP_INSET;
}

function yAlongLifeline(points: readonly DiagramPoint[], x: number): number {
  const first = points[0];
  if (!first) return 0;
  for (let index = 1; index < points.length; index += 1) {
    const left = points[index - 1]!;
    const right = points[index]!;
    if (x <= right.x) {
      const width = right.x - left.x;
      const progress = width ? clamp((x - left.x) / width, 0, 1) : 1;
      return left.y + (right.y - left.y) * progress;
    }
  }
  return points.at(-1)?.y ?? first.y;
}

function timelineGuides(
  minimumYear: number,
  maximumYear: number,
  top: number,
  bottom: number,
  xForYear: (year: number) => number,
): DiagramGuide[] {
  const step = niceYearStep(maximumYear - minimumYear);
  const first = Math.floor(minimumYear / step) * step;
  const guides: DiagramGuide[] = [];
  for (let year = first; year <= maximumYear + step; year += step) {
    if (year < minimumYear) continue;
    const x = xForYear(year);
    guides.push({
      id: `timenets:year:${year}`,
      kind: "line",
      from: { x, y: top },
      to: { x, y: bottom },
      label: String(year),
    });
  }
  return guides;
}

function niceYearStep(span: number): number {
  if (span <= 80) return 10;
  if (span <= 180) return 25;
  if (span <= 420) return 50;
  if (span <= 900) return 100;
  if (span <= 2200) return 250;
  if (span <= 5000) return 500;
  return 1000;
}

function formatTemporalYear(value: TimeNetsTemporalValue): string {
  if (!value.recorded) return `~${value.year}`;
  switch (value.precision) {
    case "before":
      return `<${value.year}`;
    case "after":
      return `>${value.year}`;
    case "exact":
      return String(value.year);
    default:
      return `~${value.year}`;
  }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function append<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const values = map.get(key) ?? [];
  values.push(value);
  map.set(key, values);
}
