import assert from "node:assert/strict";
import test from "node:test";

import type { CanonicalDocument } from "../../../domain/schema.ts";
import { buildBipartitePGraph, buildOreGraph, buildPGraph } from "./PGraphAdapters.ts";

const document = fixtureDocument();

test("Ore graph keeps one vertex per person and literal, redundant parent arcs", () => {
  const graph = buildOreGraph(document);

  assert.equal(graph.vertices.length, document.people.length);
  assert.equal(graph.vertices.filter((vertex) => vertex.shape === "person").length, 7);
  assert.equal(graph.arcs.filter((arc) => arc.kind === "marriage").length, 3);
  assert.equal(graph.arcs.filter((arc) => arc.kind !== "marriage").length, 6);
  assert.ok(
    graph.arcs.some((arc) => arc.from === "ore-person:@father@" && arc.to === "ore-person:@son@"),
  );
  assert.ok(
    graph.arcs.some((arc) => arc.from === "ore-person:@mother@" && arc.to === "ore-person:@son@"),
  );
  assert.match(graph.notes.join(" "), /repeated descent arcs.*messy/i);
});

test("p-graph represents couples as vertices and repeats a remarried person by couple", () => {
  const graph = buildPGraph(document);
  const sonCouples = graph.vertices.filter((vertex) => vertex.relatedRecordIds.includes("@son@"));

  assert.equal(graph.vertices.filter((vertex) => vertex.shape === "couple").length, 3);
  assert.equal(graph.vertices.filter((vertex) => vertex.shape === "person").length, 2);
  assert.deepEqual(sonCouples.map((vertex) => vertex.recordId).sort(), [
    "@family-2@",
    "@family-3@",
  ]);
  assert.ok(
    graph.arcs.some((arc) => arc.from === "family:@family-2@" && arc.to === "family:@family-1@"),
  );
  assert.ok(
    graph.arcs.some((arc) => arc.from === "family:@family-3@" && arc.to === "family:@family-1@"),
  );
  assert.ok(
    graph.arcs.some(
      (arc) => arc.from === "person:@daughter@" && arc.kind === "daughter" && arc.directed,
    ),
  );
});

test("bipartite p-graph keeps every person explicit and alternates couple/person arcs", () => {
  const graph = buildBipartitePGraph(document);
  const sonVertices = graph.vertices.filter((vertex) => vertex.recordId === "@son@");

  assert.equal(graph.vertices.filter((vertex) => vertex.shape === "couple").length, 3);
  assert.equal(graph.vertices.filter((vertex) => vertex.shape !== "couple").length, 7);
  assert.equal(sonVertices.length, 1);
  assert.equal(sonVertices[0]?.shape, "triangle");
  assert.equal(graph.arcs.filter((arc) => arc.id.startsWith("bipartite-spouse:")).length, 6);
  assert.equal(graph.arcs.filter((arc) => arc.id.startsWith("bipartite-parent:")).length, 3);
  assert.ok(
    graph.arcs.some((arc) => arc.from === "family:@family-2@" && arc.to === "person:@son@"),
  );
  assert.ok(
    graph.arcs.some((arc) => arc.from === "person:@son@" && arc.to === "family:@family-1@"),
  );
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
