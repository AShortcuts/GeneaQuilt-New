import assert from "node:assert/strict";
import test from "node:test";

import type { CanonicalDocument } from "../domain/schema.ts";
import { comparisonContextFocus, findComparisonFocuses } from "./comparisonSample.ts";

const document: CanonicalDocument = {
  schema_version: 1,
  people: ["root", "wide", "narrow", "leaf-a", "leaf-b"].map((id) => ({
    id,
    display_name: id,
    sex: null,
    birth_place: null,
    parent_families: [],
    spouse_families: [],
    date_range: null,
  })),
  families: [
    {
      id: "f1",
      husband_id: "root",
      wife_id: null,
      child_ids: ["wide", "narrow"],
      date_range: null,
    },
    {
      id: "f2",
      husband_id: "wide",
      wife_id: null,
      child_ids: ["leaf-a", "leaf-b"],
      date_range: null,
    },
  ],
  analysis: {
    people: 5,
    families: 2,
    relationship_links: 4,
    disconnected_family_groups: 1,
    generation_depth: 3,
    widest_generation: 2,
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
    person_records: 5,
    family_records: 2,
    note_records: 0,
    source_records: 0,
    object_records: 0,
    other_record_types: {},
    custom_tag_counts: {},
    media_files: [],
    producer: null,
    producer_version: null,
    gedcom_version: null,
    character_encoding: null,
  },
};

test("comparison focus choices are deterministic and exercise each focused method", () => {
  const focuses = findComparisonFocuses(document, "root");
  assert.deepEqual(focuses, {
    rootPersonId: "root",
    middlePersonId: "wide",
    deepestPersonId: "leaf-a",
  });
  assert.deepEqual(comparisonContextFocus("pedigree", focuses), { focalPersonId: "leaf-a" });
  assert.deepEqual(comparisonContextFocus("fan", focuses), { focalPersonId: "leaf-a" });
  assert.deepEqual(comparisonContextFocus("h-tree", focuses), { focalPersonId: "leaf-a" });
  assert.deepEqual(comparisonContextFocus("local-radial", focuses), { focalPersonId: "wide" });
  assert.deepEqual(comparisonContextFocus("dual-tree", focuses), {
    focalPersonId: "leaf-a",
    secondaryFocalPersonId: "root",
  });
  assert.deepEqual(comparisonContextFocus("dual-outline", focuses), {
    focalPersonId: "leaf-a",
    secondaryFocalPersonId: "root",
  });
  assert.deepEqual(comparisonContextFocus("pgraph", focuses), {});
});
