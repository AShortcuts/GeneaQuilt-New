import assert from "node:assert/strict";
import test from "node:test";

import type { CanonicalDocument } from "../../../domain/schema.ts";
import {
  buildRelationshipNodeScene,
  buildTraversalProjection,
  relationshipGenerationRanks,
} from "./StructuralAdapters.ts";

const document = fixtureDocument();

test("relationship nodes keep one Person and one explicit junction per Family", () => {
  const scene = buildRelationshipNodeScene({ document, theme: "light" });
  const people = scene.nodes.filter((node) => node.id.startsWith("relationship-person:"));
  const families = scene.nodes.filter((node) => node.id.startsWith("relationship-family:"));

  assert.equal(people.length, document.people.length);
  assert.equal(families.length, document.families.length);
  assert.equal(new Set(people.map((node) => node.recordId)).size, document.people.length);
  assert.equal(scene.edges.filter((edge) => edge.id.startsWith("relationship-parent:")).length, 6);
  assert.equal(scene.edges.filter((edge) => edge.id.startsWith("relationship-child:")).length, 3);
  assert.equal(people.find((node) => node.recordId === "@father@")?.secondaryLabel, "1880–1952");
  assert.match(scene.notes.join(" "), /consanguinity.*remain/i);
});

test("relationship-node ranks align spouses without losing descendant depth", () => {
  const ranks = relationshipGenerationRanks(document);

  assert.equal(ranks.get("@father@"), ranks.get("@mother@"));
  assert.equal(ranks.get("@son@"), ranks.get("@wife-1@"));
  assert.equal(ranks.get("@son@"), ranks.get("@wife-2@"));
  assert.equal(ranks.get("@son@"), (ranks.get("@father@") ?? -1) + 1);
  assert.equal(ranks.get("@grandchild@"), (ranks.get("@son@") ?? -1) + 1);
});

test("BFS uses shortest descent hops and omits spouses outside the traversal", () => {
  const traversal = buildTraversalProjection(document, "@father@", "bfs");

  assert.deepEqual(traversal.orderedPersonIds, ["@father@", "@son@", "@daughter@", "@grandchild@"]);
  assert.equal(traversal.depthByPerson.get("@father@"), 0);
  assert.equal(traversal.depthByPerson.get("@son@"), 1);
  assert.equal(traversal.depthByPerson.get("@grandchild@"), 2);
  assert.ok(!traversal.orderedPersonIds.includes("@mother@"));
  assert.deepEqual([...traversal.familyIds].sort(), ["@family-1@", "@family-2@"]);
});

test("DFS places people in deterministic first-visit order with traversal depth", () => {
  const traversal = buildTraversalProjection(document, "@father@", "dfs");

  assert.deepEqual(traversal.orderedPersonIds, ["@father@", "@son@", "@grandchild@", "@daughter@"]);
  assert.equal(traversal.depthByPerson.get("@grandchild@"), 2);
  assert.equal(traversal.depthByPerson.get("@daughter@"), 1);
  assert.equal(traversal.arcs.length, 3);
});

function fixtureDocument(): CanonicalDocument {
  const person = (id: string, displayName: string, sex: "M" | "F") => ({
    id,
    display_name: displayName,
    sex,
    birth_place: null,
    parent_families: [],
    spouse_families: [],
    date_range: null,
  });
  return {
    schema_version: 1,
    people: [
      {
        ...person("@father@", "Father", "M"),
        birth_date: recordedDate("1880", 1880),
        death_date: recordedDate("1952", 1952),
      },
      person("@mother@", "Mother", "F"),
      person("@son@", "Son", "M"),
      person("@daughter@", "Daughter", "F"),
      person("@wife-1@", "First wife", "F"),
      person("@wife-2@", "Second wife", "F"),
      person("@grandchild@", "Grandchild", "M"),
    ],
    families: [
      {
        id: "@family-1@",
        husband_id: "@father@",
        wife_id: "@mother@",
        child_ids: ["@son@", "@daughter@"],
        date_range: null,
      },
      {
        id: "@family-2@",
        husband_id: "@son@",
        wife_id: "@wife-1@",
        child_ids: ["@grandchild@"],
        date_range: null,
      },
      {
        id: "@family-3@",
        husband_id: "@son@",
        wife_id: "@wife-2@",
        child_ids: [],
        date_range: null,
      },
    ],
    analysis: {
      people: 7,
      families: 3,
      relationship_links: 9,
      disconnected_family_groups: 1,
      generation_depth: 2,
      widest_generation: 2,
      largest_sibling_group: 2,
      people_with_multiple_spouses: 1,
      people_in_multiple_spouse_families: 1,
      half_sibling_structures: 0,
      pedigree_collapse_people: 0,
      reconvergence_points: 0,
      people_with_dates: 0,
      families_with_dates: 0,
      date_coverage_percent: 0,
      findings: [],
      blocks_interactive: false,
    },
    source_profile: {
      line_count: 0,
      person_records: 7,
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

function recordedDate(originalText: string, year: number) {
  return {
    original_text: originalText,
    start_year: year,
    end_year: year,
    precision: "exact" as const,
  };
}
