import assert from "node:assert/strict";
import test from "node:test";

import type {
  CanonicalDocument,
  CanonicalFamily,
  CanonicalPerson,
  RecordedDate,
} from "../../../domain/schema.ts";
import {
  buildTimeNetsModel,
  buildTimeNetsScene,
  buildTimeNetsSpouseBlocks,
  orderTimeNetsBlocks,
} from "./TimeNetsAdapter.ts";

const document = fixtureDocument();

test("TimeNets preserves recorded dates and marks every rule-derived value", () => {
  const model = buildTimeNetsModel(document);
  const anchor = model.people.get("@anchor@")!;
  const firstSpouse = model.people.get("@spouse-1@")!;
  const secondMarriage = model.families.get("@marriage-2@")!;

  assert.equal(model.hasTemporalAnchor, true);
  assert.equal(anchor.birth.year, 1900);
  assert.equal(anchor.birth.recorded, true);
  assert.equal(anchor.birth.uncertain, false);
  assert.equal(firstSpouse.death.year, 1980);
  assert.equal(firstSpouse.death.recorded, false);
  assert.match(firstSpouse.death.source, /mean spouse death/);
  assert.equal(secondMarriage.marriage?.year, 1950);
  assert.equal(secondMarriage.marriage?.recorded, false);
  assert.equal(secondMarriage.divorce, null);
  assert.ok(model.estimatedValues > 0);
});

test("qualified source dates remain recorded while their uncertainty stays visible", () => {
  const model = buildTimeNetsModel(document);
  const child = model.people.get("@child-1@")!;

  assert.equal(child.birth.year, 1925);
  assert.equal(child.birth.recorded, true);
  assert.equal(child.birth.precision, "approximate");
  assert.equal(child.birth.uncertain, true);
  assert.ok(model.qualifiedRecordedValues >= 1);
});

test("spouse blocks are transitive and keep spouses in first-marriage order", () => {
  const model = buildTimeNetsModel(document);
  const blocks = buildTimeNetsSpouseBlocks(document, model);
  const marriageBlock = blocks.find((block) => block.personIds.includes("@anchor@"));

  assert.ok(marriageBlock);
  assert.deepEqual(
    new Set(marriageBlock.personIds),
    new Set(["@anchor@", "@spouse-1@", "@spouse-2@"]),
  );
  assert.equal(marriageBlock.anchorPersonId, "@spouse-1@");
  assert.deepEqual(marriageBlock.orderedPersonIds, ["@anchor@", "@spouse-2@", "@spouse-1@"]);
});

test("global TimeNets block order puts descendant blocks after their parent block", () => {
  const model = buildTimeNetsModel(document);
  const blocks = buildTimeNetsSpouseBlocks(document, model);
  const ordered = orderTimeNetsBlocks(document, blocks, model);
  const parentIndex = ordered.findIndex((block) => block.personIds.includes("@anchor@"));
  const childIndex = ordered.findIndex((block) => block.personIds.includes("@child-1@"));

  assert.ok(parentIndex >= 0);
  assert.ok(childIndex > parentIndex);
});

test("drop lines end at the child's metric birth position and preserve each recorded parent", () => {
  const scene = buildTimeNetsScene(
    { document, theme: "light", focalPersonId: "@anchor@" },
    { width: 1280, height: 800 },
  );
  const childDrops = scene.edges.filter(
    (edge) => edge.kind === "drop" && edge.id.endsWith(":@child-1@"),
  );
  const childLine = scene.edges.find((edge) => edge.id === "timenets:lifeline:@child-1@")!;

  assert.equal(childDrops.length, 2);
  assert.ok(childDrops.every((edge) => edge.kind === "drop" && edge.directed));
  assert.ok(childDrops.every((edge) => edge.points.at(-1)?.x === childLine.points[0]?.x));
  assert.ok(scene.edges.some((edge) => edge.kind === "lifeline" && edge.curve === "smooth"));
  assert.match(scene.projection.rule, /metric year/);
});

test("a document with no temporal anchor gets an honest empty state", () => {
  const empty = fixtureDocument();
  empty.people.forEach((person) => {
    person.birth_date = null;
    person.death_date = null;
  });
  empty.families.forEach((family) => {
    family.marriage_date = null;
    family.divorce_date = null;
  });
  const model = buildTimeNetsModel(empty);
  const scene = buildTimeNetsScene(
    { document: empty, theme: "light" },
    { width: 800, height: 600 },
  );

  assert.equal(model.hasTemporalAnchor, false);
  assert.equal(scene.projection.visiblePeople, 0);
  assert.equal(scene.edges.length, 0);
  assert.match(scene.description, /at least one recorded date/);
});

function fixtureDocument(): CanonicalDocument {
  const people: CanonicalPerson[] = [
    person("@anchor@", "Anchor", "M", [], ["@marriage-1@"], exact(1900), exact(1980)),
    person(
      "@spouse-1@",
      "First spouse",
      "F",
      [],
      ["@marriage-1@", "@marriage-2@"],
      exact(1902),
      null,
    ),
    person("@spouse-2@", "Second spouse", "M", [], ["@marriage-2@"], exact(1920), null),
    person(
      "@child-1@",
      "First child",
      "F",
      ["@marriage-1@"],
      [],
      approximate(1924, 1926),
      exact(2005),
    ),
    person("@child-2@", "Second child", "M", ["@marriage-2@"], [], exact(1950), null),
  ];
  const families: CanonicalFamily[] = [
    family("@marriage-1@", "@anchor@", "@spouse-1@", ["@child-1@"], exact(1920), exact(1930)),
    family("@marriage-2@", "@spouse-2@", "@spouse-1@", ["@child-2@"], null, null),
  ];
  return {
    schema_version: 1,
    people,
    families,
    analysis: {
      people: people.length,
      families: families.length,
      relationship_links: 8,
      disconnected_family_groups: 1,
      generation_depth: 2,
      widest_generation: 2,
      largest_sibling_group: 1,
      people_with_multiple_spouses: 1,
      people_in_multiple_spouse_families: 1,
      half_sibling_structures: 1,
      pedigree_collapse_people: 0,
      reconvergence_points: 0,
      people_with_dates: 5,
      families_with_dates: 1,
      date_coverage_percent: 71,
      findings: [],
      blocks_interactive: false,
    },
    source_profile: {
      line_count: 0,
      person_records: people.length,
      family_records: families.length,
      note_records: 0,
      source_records: 0,
      object_records: 0,
      other_record_types: {},
      custom_tag_counts: {},
      media_files: [],
      producer: null,
      producer_version: null,
      gedcom_version: "5.5.1",
      character_encoding: "UTF-8",
    },
  };
}

function person(
  id: string,
  displayName: string,
  sex: "M" | "F",
  parentFamilies: string[],
  spouseFamilies: string[],
  birthDate: RecordedDate | null,
  deathDate: RecordedDate | null,
): CanonicalPerson {
  return {
    id,
    display_name: displayName,
    sex,
    birth_place: null,
    parent_families: parentFamilies.map((familyId) => ({
      family_id: familyId,
      relationship: "birth",
      relationship_was_explicit: true,
    })),
    spouse_families: spouseFamilies,
    birth_date: birthDate,
    death_date: deathDate,
    date_range: null,
  };
}

function family(
  id: string,
  husbandId: string,
  wifeId: string,
  childIds: string[],
  marriageDate: RecordedDate | null,
  divorceDate: RecordedDate | null,
): CanonicalFamily {
  return {
    id,
    husband_id: husbandId,
    wife_id: wifeId,
    child_ids: childIds,
    marriage_date: marriageDate,
    divorce_date: divorceDate,
    date_range: null,
  };
}

function exact(year: number): RecordedDate {
  return {
    original_text: String(year),
    start_year: year,
    end_year: year,
    precision: "exact",
  };
}

function approximate(startYear: number, endYear: number): RecordedDate {
  return {
    original_text: `BET ${startYear} AND ${endYear}`,
    start_year: startYear,
    end_year: endYear,
    precision: "approximate",
  };
}
