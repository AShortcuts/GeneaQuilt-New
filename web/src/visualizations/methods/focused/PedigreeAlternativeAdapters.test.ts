import assert from "node:assert/strict";
import test from "node:test";

import type { CanonicalDocument, CanonicalPerson } from "../../../domain/schema.ts";
import {
  buildDualOutlineScene,
  buildFanChartScene,
  buildHTreeScene,
  buildLocalRadialProjection,
  buildLocalRadialScene,
} from "./PedigreeAlternativeAdapters.ts";

const pedigreeDocument = fixturePedigreeDocument();

test("fan chart preserves binary pedigree slots and marks repeated ancestors", () => {
  const scene = buildFanChartScene({
    document: pedigreeDocument,
    focalPersonId: "@focus@",
    theme: "light",
  });
  const sectors = scene.nodes.filter((node) => node.shape === "sector");
  const occupiedSectors = sectors.filter((node) => !node.guide);
  const slotGuides = sectors.filter((node) => node.guide);
  const repeated = occupiedSectors.filter((node) => node.recordId === "@shared-grandfather@");

  assert.equal(scene.nodes.filter((node) => !node.guide).length, 7);
  assert.equal(occupiedSectors.length, 6);
  assert.equal(slotGuides.length, 62);
  assert.equal(scene.edges.length, 0);
  assert.equal(scene.guides?.length, 5);
  assert.equal(new Set(occupiedSectors.map((node) => node.pathData)).size, occupiedSectors.length);
  assert.equal(repeated.length, 2);
  assert.ok(repeated.every((node) => node.duplicate));
  assert.match(scene.projection.rule, /2\^depth equal slots/);
  assert.match(scene.notes.join(" "), /Pedigree Collapse/);
});

test("PedVis H-tree alternates parent orientation and reserves repeated placements", () => {
  const scene = buildHTreeScene({
    document: pedigreeDocument,
    focalPersonId: "@focus@",
    theme: "light",
  });
  const root = nodeCenter(scene, "@focus@");
  const father = nodeCenter(scene, "@father@");
  const mother = nodeCenter(scene, "@mother@");
  const sharedPlacements = scene.nodes.filter((node) => node.recordId === "@shared-grandfather@");

  assert.deepEqual(root, { x: 0, y: 0 });
  assert.equal(father.x, root.x);
  assert.equal(mother.x, root.x);
  assert.ok(father.y < root.y);
  assert.ok(mother.y > root.y);
  assert.equal(sharedPlacements.length, 2);
  assert.ok(sharedPlacements.every((node) => node.duplicate));
  assert.ok(sharedPlacements.every((node) => nodeCenterOf(node).x < father.x));
  assert.equal(scene.edges.length, 6);
  assert.match(scene.projection.rule, /Orientation alternates/);
});

test("local radial uses shortest relationship hops without dropping boundary relationships", () => {
  const document = fixtureRadialDocument();
  const projection = buildLocalRadialProjection(document, "@focus@", 2);
  const scene = buildLocalRadialScene({
    document,
    focalPersonId: "@focus@",
    theme: "light",
  });

  assert.equal(projection.distanceByPerson.get("@focus@"), 0);
  assert.equal(projection.distanceByPerson.get("@father@"), 1);
  assert.equal(projection.distanceByPerson.get("@sibling@"), 2);
  assert.equal(projection.distanceByPerson.get("@grandfather@"), 2);
  assert.equal(projection.distanceByPerson.has("@aunt@"), false);
  assert.ok(projection.visibleFamilyIds.has("@grandparents@"));
  assert.equal(scene.guides?.length, 2);
  assert.equal(new Set(scene.nodes.map((node) => node.recordId)).size, scene.nodes.length);
  assert.ok(scene.edges.some((edge) => edge.id === "local-radial:marriage:@grandparents@"));
  assert.ok(!scene.edges.some((edge) => edge.id.includes("@aunt@")));
  assert.match(scene.projection.rule, /shortest relationship distance/);
});

test("dual outline merges its axis and uses stretched L-shaped hierarchy edges", () => {
  const scene = buildDualOutlineScene({
    document: fixtureDualDocument(),
    focalPersonId: "@focus@",
    secondaryFocalPersonId: "@ancestor@",
    theme: "light",
  });
  const axisNodes = scene.nodes.filter((node) => node.emphasized);
  const axisEdges = scene.edges.filter((edge) => edge.kind === "axis");
  const supplementalEdges = scene.edges.filter((edge) => edge.kind === "supplemental");
  const axisCenters = ["@ancestor@", "@middle@", "@focus@"].map(
    (personId) => nodeCenter(scene, personId).x,
  );

  assert.equal(axisNodes.length, 3);
  assert.equal(new Set(axisNodes.map((node) => node.recordId)).size, 3);
  assert.equal(axisEdges.length, 2);
  assert.ok(supplementalEdges.length >= 1);
  assert.deepEqual(axisCenters, [0, 176, 352]);
  assert.ok(scene.edges.every((edge) => edge.points.length === 3));
  assert.match(scene.projection.rule, /stretched by the larger/);
});

function fixturePedigreeDocument(): CanonicalDocument {
  const people = [
    person("@focus@", "Focus", "M", ["@parents@"], []),
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
  ];
  return document(people, [
    family("@parents@", "@father@", "@mother@", ["@focus@"]),
    family("@father-parents@", "@shared-grandfather@", "@grandmother-1@", ["@father@"]),
    family("@mother-parents@", "@shared-grandfather@", "@grandmother-2@", ["@mother@"]),
  ]);
}

function fixtureRadialDocument(): CanonicalDocument {
  const people = [
    person("@focus@", "Focus", "M", ["@parents@"], []),
    person("@father@", "Father", "M", ["@grandparents@"], ["@parents@"]),
    person("@mother@", "Mother", "F", [], ["@parents@"]),
    person("@sibling@", "Sibling", "F", ["@parents@"], []),
    person("@grandfather@", "Grandfather", "M", [], ["@grandparents@"]),
    person("@grandmother@", "Grandmother", "F", [], ["@grandparents@"]),
    person("@aunt@", "Aunt", "F", ["@grandparents@"], []),
  ];
  return document(people, [
    family("@parents@", "@father@", "@mother@", ["@focus@", "@sibling@"]),
    family("@grandparents@", "@grandfather@", "@grandmother@", ["@father@", "@aunt@"]),
  ]);
}

function fixtureDualDocument(): CanonicalDocument {
  const people = [
    person("@ancestor@", "Ancestor", "M", [], ["@family-1@"]),
    person("@ancestor-spouse@", "Ancestor spouse", "F", [], ["@family-1@"]),
    person("@middle@", "Middle", "M", ["@family-1@"], ["@family-2@"]),
    person("@other@", "Other branch", "F", ["@family-1@"], ["@family-3@"]),
    person("@middle-spouse@", "Middle spouse", "F", [], ["@family-2@"]),
    person("@other-spouse@", "Other spouse", "M", [], ["@family-3@"]),
    person("@focus@", "Focus", "M", ["@family-2@", "@family-3@"], []),
  ];
  people.find((entry) => entry.id === "@focus@")!.parent_families[1]!.relationship = "adopted";
  return document(people, [
    family("@family-1@", "@ancestor@", "@ancestor-spouse@", ["@middle@", "@other@"]),
    family("@family-2@", "@middle@", "@middle-spouse@", ["@focus@"]),
    family("@family-3@", "@other-spouse@", "@other@", ["@focus@"]),
  ]);
}

function document(
  people: CanonicalPerson[],
  families: CanonicalDocument["families"],
): CanonicalDocument {
  return {
    schema_version: 1,
    people,
    families,
    analysis: {
      people: people.length,
      families: families.length,
      relationship_links: 0,
      disconnected_family_groups: 1,
      generation_depth: 3,
      widest_generation: 4,
      largest_sibling_group: 2,
      people_with_multiple_spouses: 0,
      people_in_multiple_spouse_families: 0,
      half_sibling_structures: 0,
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

function nodeCenter(scene: ReturnType<typeof buildHTreeScene>, personId: string) {
  const node = scene.nodes.find((entry) => entry.recordId === personId);
  assert.ok(node, `Expected ${personId} in the scene.`);
  return nodeCenterOf(node);
}

function nodeCenterOf(node: ReturnType<typeof buildHTreeScene>["nodes"][number]) {
  return { x: node.x + node.width / 2, y: node.y + node.height / 2 };
}
