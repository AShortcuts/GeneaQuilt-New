import assert from "node:assert/strict";
import test from "node:test";

import type { CanonicalDocument } from "../../../domain/schema.ts";
import { buildSugiyamaScene } from "./LayeredAdapters.ts";

const document = fixtureDocument();

test("generic Sugiyama omits spouse semantics and routes long arcs through layers", () => {
  const scene = buildSugiyamaScene({ document, theme: "light" }, false);
  const longArc = scene.edges.find((edge) => edge.id.includes("@family-2@:@wife@:@grandchild@"));

  assert.equal(scene.nodes.length, document.people.length);
  assert.equal(
    scene.edges.some((edge) => edge.kind === "marriage"),
    false,
  );
  assert.ok(longArc);
  assert.ok((longArc?.points.length ?? 0) > 2);
  assert.match(scene.notes.join(" "), /no marriage link/i);
});

test("genealogy Sugiyama aligns spouse blocks but keeps literal parent arcs", () => {
  const scene = buildSugiyamaScene({ document, theme: "light" }, true);
  const node = (personId: string) =>
    scene.nodes.find((candidate) => candidate.recordId === personId);
  const son = node("@son@");
  const wife = node("@wife@");
  const grandchildArcs = scene.edges.filter(
    (edge) => edge.id.includes("@family-2@") && edge.id.includes("@grandchild@"),
  );

  assert.ok(son && wife);
  assert.equal(son?.y, wife?.y);
  assert.ok(Math.abs((son?.x ?? 0) - (wife?.x ?? 0)) < 220);
  assert.equal(scene.edges.filter((edge) => edge.kind === "marriage").length, 2);
  assert.equal(grandchildArcs.length, 2);
  assert.match(scene.notes.join(" "), /without a Family junction/i);
});

test("Sugiyama positioning is deterministic", () => {
  const first = buildSugiyamaScene({ document, theme: "light" }, true);
  const second = buildSugiyamaScene({ document, theme: "dark" }, true);

  assert.deepEqual(first.nodes, second.nodes);
  assert.deepEqual(first.edges, second.edges);
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
      person("@father@", "Father", "M"),
      person("@mother@", "Mother", "F"),
      person("@son@", "Son", "M"),
      person("@daughter@", "Daughter", "F"),
      person("@wife@", "Wife", "F"),
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
        wife_id: "@wife@",
        child_ids: ["@grandchild@"],
        date_range: null,
      },
    ],
    analysis: {
      people: 6,
      families: 2,
      relationship_links: 8,
      disconnected_family_groups: 1,
      generation_depth: 2,
      widest_generation: 3,
      largest_sibling_group: 2,
      people_with_multiple_spouses: 0,
      people_in_multiple_spouse_families: 0,
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
      person_records: 6,
      family_records: 2,
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
