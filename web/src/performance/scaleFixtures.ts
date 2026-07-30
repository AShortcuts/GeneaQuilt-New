import {
  CANONICAL_DOCUMENT_SCHEMA_VERSION,
  type CanonicalDocument,
  type CanonicalFamily,
  type CanonicalPerson,
  type DocumentAnalysis,
  type RecordedDate,
} from "../domain/schema.ts";

export interface ScaleFixture {
  document: CanonicalDocument;
  rootPersonId: string;
  deepestDescendantId: string;
}

interface MutablePerson extends CanonicalPerson {
  generation: number;
}

const PLACES = ["Jerusalem", "Hebron", "Beersheba", "Damascus", "Haran"] as const;

export function createScaleFixture(peopleCount: number): ScaleFixture {
  if (!Number.isInteger(peopleCount) || peopleCount < 1) {
    throw new Error("A scale fixture needs a positive whole number of people.");
  }

  const people: MutablePerson[] = [];
  const families: CanonicalFamily[] = [];
  const parentQueue: number[] = [];
  let nextPersonIndex = 0;
  let deepestDescendantId = personId(0);

  const addPerson = (generation: number, parentFamilyId: string | null): number => {
    const index = nextPersonIndex;
    nextPersonIndex += 1;
    const id = personId(index);
    const birthYear = 1700 + generation * 27 + (index % 7);
    const birthDate = exactYear(birthYear);
    const deathDate = exactYear(birthYear + 72 + (index % 9));
    people.push({
      id,
      display_name: `Fixture Person ${String(index + 1).padStart(5, "0")}`,
      sex: index % 2 === 0 ? "M" : "F",
      birth_place: PLACES[index % PLACES.length] ?? null,
      parent_families: parentFamilyId
        ? [{ family_id: parentFamilyId, relationship: "birth", relationship_was_explicit: true }]
        : [],
      spouse_families: [],
      birth_date: birthDate,
      death_date: deathDate,
      date_range: { start_year: birthYear, end_year: birthYear + 72 + (index % 9) },
      generation,
    });
    return index;
  };

  const rootIndex = addPerson(0, null);
  parentQueue.push(rootIndex);

  while (nextPersonIndex < peopleCount && parentQueue.length) {
    const primaryIndex = parentQueue.shift();
    if (primaryIndex == null) break;
    const primary = people[primaryIndex];
    if (!primary) continue;
    const familyId = `@F${families.length + 1}@`;
    const spouseIndex = addPerson(primary.generation, null);
    const spouse = people[spouseIndex];
    if (!spouse) throw new Error("The deterministic fixture lost a spouse record.");
    const childIds: string[] = [];
    for (let child = 0; child < 2 && nextPersonIndex < peopleCount; child += 1) {
      const childIndex = addPerson(primary.generation + 1, familyId);
      const childPerson = people[childIndex];
      if (!childPerson) throw new Error("The deterministic fixture lost a child record.");
      childIds.push(childPerson.id);
      parentQueue.push(childIndex);
      deepestDescendantId = childPerson.id;
    }
    primary.spouse_families.push(familyId);
    spouse.spouse_families.push(familyId);
    const primaryIsHusband = primary.sex === "M";
    const marriageYear =
      Math.max(primary.birth_date?.start_year ?? 1700, spouse.birth_date?.start_year ?? 1700) + 21;
    families.push({
      id: familyId,
      husband_id: primaryIsHusband ? primary.id : spouse.id,
      wife_id: primaryIsHusband ? spouse.id : primary.id,
      child_ids: childIds,
      marriage_date: exactYear(marriageYear),
      divorce_date: null,
      date_range: { start_year: marriageYear, end_year: marriageYear },
    });
  }

  const canonicalPeople: CanonicalPerson[] = people.map((person) => ({
    id: person.id,
    display_name: person.display_name,
    sex: person.sex,
    birth_place: person.birth_place,
    parent_families: person.parent_families,
    spouse_families: person.spouse_families,
    birth_date: person.birth_date ?? null,
    death_date: person.death_date ?? null,
    date_range: person.date_range,
  }));
  const analysis = analyzeFixture(canonicalPeople, families, people);
  return {
    document: {
      schema_version: CANONICAL_DOCUMENT_SCHEMA_VERSION,
      people: canonicalPeople,
      families,
      analysis,
      source_profile: {
        line_count: canonicalPeople.length * 8 + families.length * 7,
        person_records: canonicalPeople.length,
        family_records: families.length,
        note_records: 0,
        source_records: 0,
        object_records: 0,
        other_record_types: {},
        custom_tag_counts: {},
        media_files: [],
        producer: "GeneaQuilt deterministic scale fixture",
        producer_version: "1",
        gedcom_version: "7.0",
        character_encoding: "UTF-8",
      },
    },
    rootPersonId: people[rootIndex]?.id ?? personId(0),
    deepestDescendantId,
  };
}

function analyzeFixture(
  people: readonly CanonicalPerson[],
  families: readonly CanonicalFamily[],
  mutablePeople: readonly MutablePerson[],
): DocumentAnalysis {
  const relationshipLinks = families.reduce(
    (sum, family) =>
      sum +
      Number(Boolean(family.husband_id)) +
      Number(Boolean(family.wife_id)) +
      family.child_ids.length,
    0,
  );
  const generationCounts = new Map<number, number>();
  for (const person of mutablePeople) {
    generationCounts.set(person.generation, (generationCounts.get(person.generation) ?? 0) + 1);
  }
  return {
    people: people.length,
    families: families.length,
    relationship_links: relationshipLinks,
    disconnected_family_groups: 1,
    generation_depth: generationCounts.size,
    widest_generation: Math.max(1, ...generationCounts.values()),
    largest_sibling_group: Math.max(0, ...families.map((family) => family.child_ids.length)),
    people_with_multiple_spouses: 0,
    people_in_multiple_spouse_families: 0,
    half_sibling_structures: 0,
    pedigree_collapse_people: 0,
    reconvergence_points: 0,
    people_with_dates: people.length,
    families_with_dates: families.length,
    date_coverage_percent: 100,
    findings: [],
    blocks_interactive: false,
  };
}

function exactYear(year: number): RecordedDate {
  return {
    original_text: String(year),
    start_year: year,
    end_year: year,
    precision: "exact",
  };
}

function personId(index: number): string {
  return `@I${index + 1}@`;
}
