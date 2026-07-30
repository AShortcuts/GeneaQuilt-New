import assert from "node:assert/strict";
import test from "node:test";

import type { CanonicalDocument } from "../../../domain/schema.ts";
import { relationshipGenerationRanks } from "../structural/StructuralAdapters.ts";
import { buildForceScene, buildRadialForceScene, solveForceLayout } from "./ForceAdapters.ts";

const document = fixtureDocument();

test("force graph keeps literal marriage and two-parent descent links", () => {
  const scene = buildForceScene({ document, theme: "light" }, false);

  assert.equal(scene.nodes.length, document.people.length);
  assert.equal(scene.edges.filter((edge) => edge.kind === "marriage").length, 2);
  assert.equal(scene.edges.filter((edge) => edge.kind === "descent").length, 6);
  assert.match(scene.notes.join(" "), /no ancestor or descendant meaning/i);
});

test("genealogical forces are deterministic and create a generation hierarchy", () => {
  const first = solveForceLayout(document, true);
  const second = solveForceLayout(document, true);
  const state = (id: string) => first.states.find((candidate) => candidate.id === id);

  assert.deepEqual(first, second);
  assert.ok((state("@son@")?.y ?? 0) > (state("@father@")?.y ?? Infinity));
  assert.ok((state("@grandchild@")?.y ?? 0) > (state("@son@")?.y ?? Infinity));
  assert.ok(Math.abs((state("@father@")?.y ?? 0) - (state("@mother@")?.y ?? 0)) < 80);
});

test("radial force satisfies the circumference bound and aligns spouses", () => {
  const scene = buildRadialForceScene({ document, theme: "light" });
  const ranks = relationshipGenerationRanks(document);
  const center = (id: string) => {
    const node = scene.nodes.find((candidate) => candidate.recordId === id);
    assert.ok(node);
    return { x: (node?.x ?? 0) + (node?.width ?? 0) / 2, y: (node?.y ?? 0) + 17 };
  };
  const radius = (id: string) => Math.hypot(center(id).x, center(id).y);

  assert.ok(Math.abs(radius("@father@") - radius("@mother@")) < 1e-6);
  assert.ok(Math.abs(radius("@son@") - radius("@wife@")) < 1e-6);
  assert.ok(radius("@son@") > radius("@father@"));
  for (const rank of new Set(ranks.values())) {
    const ids = document.people
      .filter((person) => ranks.get(person.id) === rank)
      .map((person) => person.id);
    const requiredRadius = (182 * ids.length) / (Math.PI * 2);
    if (ids.length > 1) assert.ok(radius(ids[0]!) + 1e-6 >= requiredRadius);
  }
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
      person("@unconnected@", "Unconnected", "F"),
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
      people: 7,
      families: 2,
      relationship_links: 8,
      disconnected_family_groups: 2,
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
      person_records: 7,
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
