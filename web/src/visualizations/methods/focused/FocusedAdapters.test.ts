import assert from "node:assert/strict";
import test from "node:test";

import type { CanonicalDocument, CanonicalPerson } from "../../../domain/schema.ts";
import { findPersonNodeOverlaps } from "../../diagram/nodeGeometry.ts";
import { buildHourglassScene, buildPedigreeProjection } from "./FocusedAdapters.ts";

const document = fixtureDocument();

test("traditional pedigree repeats a shared ancestor in every binary pedigree slot", () => {
  const projection = buildPedigreeProjection(document, "@focus@", 2);
  const sharedAncestorPlacements = projection.occurrences.filter(
    (occurrence) => occurrence.personId === "@shared-grandfather@",
  );

  assert.equal(projection.occurrences.length, 7);
  assert.equal(projection.uniquePersonIds.size, 6);
  assert.equal(projection.duplicatePlacements, 1);
  assert.equal(sharedAncestorPlacements.length, 2);
  assert.deepEqual(sharedAncestorPlacements.map((occurrence) => occurrence.slot).sort(), [0, 2]);
  assert.equal(projection.connections.length, 6);
});

test("hourglass uses one shared focus and keeps each spouse Family explicit", () => {
  const scene = buildHourglassScene({
    document,
    focalPersonId: "@focus@",
    theme: "light",
  });
  const focusNodes = scene.nodes.filter((node) => node.id === "hourglass:focus");
  const spouseLabels = scene.nodes
    .filter((node) => node.id.startsWith("hourglass:spouse:"))
    .map((node) => node.label)
    .sort();
  const familyJunctions = scene.nodes.filter((node) => node.shape === "family");

  assert.equal(focusNodes.length, 1);
  assert.deepEqual(spouseLabels, ["First spouse", "Second spouse"]);
  assert.ok(familyJunctions.length >= 5);
  assert.ok(familyJunctions.every((node) => node.labelVisible === false));
  assert.match(scene.projection.rule, /A\(x\) union D\(x\)/);
  assert.match(scene.notes.join(" "), /Family junctions/);
});

test("hourglass reserves independent cards for several spouses on the same side", () => {
  const manySpouses = fixtureDocument();
  const focus = manySpouses.people.find((person) => person.id === "@focus@")!;
  for (let index = 3; index <= 5; index += 1) {
    const spouseId = `@spouse-${index}@`;
    const familyId = `@desc-${index}@`;
    manySpouses.people.push(person(spouseId, `Spouse ${index}`, "F", [], [familyId]));
    manySpouses.families.push(family(familyId, "@focus@", spouseId, []));
    focus.spouse_families.push(familyId);
  }
  const scene = buildHourglassScene({
    document: manySpouses,
    focalPersonId: "@focus@",
    theme: "light",
  });

  assert.equal(scene.nodes.filter((node) => node.id.startsWith("hourglass:spouse:")).length, 5);
  assert.equal(findPersonNodeOverlaps(scene.nodes).length, 0);
});

function fixtureDocument(): CanonicalDocument {
  const people = [
    person("@focus@", "Focus", "M", ["@parents@"], ["@desc-1@", "@desc-2@"]),
    person("@father@", "Father", "M", ["@father-parents@"], ["@parents@"]),
    person("@mother@", "Mother", "F", ["@mother-parents@"], ["@parents@"]),
    person(
      "@shared-grandfather@",
      "Shared grandfather",
      "M",
      [],
      ["@father-parents@", "@mother-parents@"],
    ),
    person("@grandmother-1@", "Grandmother one", "F", [], ["@father-parents@"]),
    person("@grandmother-2@", "Grandmother two", "F", [], ["@mother-parents@"]),
    person("@spouse-1@", "First spouse", "F", [], ["@desc-1@"]),
    person("@spouse-2@", "Second spouse", "F", [], ["@desc-2@"]),
    person("@child-1@", "First child", "M", ["@desc-1@"], []),
    person("@child-2@", "Second child", "F", ["@desc-2@"], []),
  ];
  return {
    schema_version: 1,
    people,
    families: [
      family("@parents@", "@father@", "@mother@", ["@focus@"]),
      family("@father-parents@", "@shared-grandfather@", "@grandmother-1@", ["@father@"]),
      family("@mother-parents@", "@shared-grandfather@", "@grandmother-2@", ["@mother@"]),
      family("@desc-1@", "@focus@", "@spouse-1@", ["@child-1@"]),
      family("@desc-2@", "@focus@", "@spouse-2@", ["@child-2@"]),
    ],
    analysis: {
      people: people.length,
      families: 5,
      relationship_links: 15,
      disconnected_family_groups: 1,
      generation_depth: 3,
      widest_generation: 4,
      largest_sibling_group: 1,
      people_with_multiple_spouses: 2,
      people_in_multiple_spouse_families: 2,
      half_sibling_structures: 1,
      pedigree_collapse_people: 1,
      reconvergence_points: 1,
      people_with_dates: 0,
      families_with_dates: 0,
      date_coverage_percent: 0,
      findings: [],
      blocks_interactive: false,
    },
    source_profile: {
      line_count: 0,
      person_records: people.length,
      family_records: 5,
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
    date_range: null,
  };
}

function family(
  id: string,
  husbandId: string,
  wifeId: string,
  childIds: string[],
): CanonicalDocument["families"][number] {
  return {
    id,
    husband_id: husbandId,
    wife_id: wifeId,
    child_ids: childIds,
    date_range: null,
  };
}
