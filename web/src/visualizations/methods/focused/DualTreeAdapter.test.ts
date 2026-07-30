import assert from "node:assert/strict";
import test from "node:test";

import type { CanonicalDocument, CanonicalPerson } from "../../../domain/schema.ts";
import { buildDualTreeScene, findDualTreeAxis } from "./DualTreeAdapter.ts";

const document = fixtureDocument();

test("dual tree finds a deterministic recorded ancestor-to-descendant axis", () => {
  const axis = findDualTreeAxis(document, "@ancestor@", "@focus@");

  assert.deepEqual(axis?.personIds, ["@ancestor@", "@middle@", "@focus@"]);
  assert.deepEqual(axis?.familyIds, ["@family-1@", "@family-2@"]);
  assert.equal(findDualTreeAxis(document, "@unrelated@", "@focus@"), null);
});

test("dual-tree scene merges the axis once and preserves skipped diamond edges", () => {
  const scene = buildDualTreeScene({
    document,
    focalPersonId: "@focus@",
    secondaryFocalPersonId: "@ancestor@",
    theme: "light",
  });
  const axisNodes = scene.nodes.filter((node) => node.id.startsWith("dual-tree:axis:"));
  const axisEdges = scene.edges.filter((edge) => edge.kind === "axis");
  const supplementalEdges = scene.edges.filter((edge) => edge.kind === "supplemental");
  const ancestorNode = axisNodes.find((node) => node.recordId === "@ancestor@");
  const focusNode = axisNodes.find((node) => node.recordId === "@focus@");

  assert.equal(axisNodes.length, 3);
  assert.equal(axisEdges.length, 2);
  assert.ok(supplementalEdges.length >= 1);
  assert.ok((ancestorNode?.y ?? Infinity) < (focusNode?.y ?? -Infinity));
  assert.match(scene.projection.rule, /load-weighted average/);
  assert.match(scene.notes.join(" "), /dashed supplemental/);
});

function fixtureDocument(): CanonicalDocument {
  const people = [
    person("@ancestor@", "Ancestor", "M", [], ["@family-1@"]),
    person("@ancestor-spouse@", "Ancestor spouse", "F", [], ["@family-1@"]),
    person("@middle@", "Middle", "M", ["@family-1@"], ["@family-2@"]),
    person("@other@", "Other branch", "F", ["@family-1@"], ["@family-3@"]),
    person("@middle-spouse@", "Middle spouse", "F", [], ["@family-2@"]),
    person("@other-spouse@", "Other spouse", "M", [], ["@family-3@"]),
    person("@focus@", "Focus", "M", ["@family-2@", "@family-3@"], []),
    person("@unrelated@", "Unrelated", "F", [], []),
  ];
  people.find((entry) => entry.id === "@focus@")!.parent_families[1]!.relationship = "adopted";
  return {
    schema_version: 1,
    people,
    families: [
      family("@family-1@", "@ancestor@", "@ancestor-spouse@", ["@middle@", "@other@"]),
      family("@family-2@", "@middle@", "@middle-spouse@", ["@focus@"]),
      family("@family-3@", "@other-spouse@", "@other@", ["@focus@"]),
    ],
    analysis: {
      people: people.length,
      families: 3,
      relationship_links: 10,
      disconnected_family_groups: 2,
      generation_depth: 3,
      widest_generation: 3,
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
      family_records: 3,
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
