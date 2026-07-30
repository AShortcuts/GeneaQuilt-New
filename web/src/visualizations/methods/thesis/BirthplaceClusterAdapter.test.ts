import assert from "node:assert/strict";
import test from "node:test";

import type { CanonicalDocument } from "../../../domain/schema.ts";
import {
  buildBirthplaceClusterModel,
  buildBirthplaceClusterScene,
} from "./BirthplaceClusterAdapter.ts";

test("birthplace clustering follows Algorithm 4.1's strict thresholds", () => {
  const document = fixtureDocument();
  const retained = buildBirthplaceClusterModel(document, {
    minimumClusterSize: 2,
    minimumCoParentLinksExclusive: 2,
  });
  const pruned = buildBirthplaceClusterModel(document, {
    minimumClusterSize: 2,
    minimumCoParentLinksExclusive: 3,
  });

  assert.deepEqual(
    retained.clusters.map((cluster) => [cluster.place, cluster.personIds.length]),
    [
      ["Alexandria", 2],
      ["Jerusalem", 2],
    ],
  );
  assert.deepEqual(retained.links, [
    { leftPlace: "Alexandria", rightPlace: "Jerusalem", coParentLinks: 3 },
  ]);
  assert.equal(pruned.links.length, 0);
});

test("birthplace scene sizes aggregate circles and explains co-parent links", () => {
  const document = fixtureDocument();
  const scene = buildBirthplaceClusterScene(
    { document, theme: "light" },
    { minimumClusterSize: 2, minimumCoParentLinksExclusive: 2 },
  );

  assert.equal(scene.nodes.length, 2);
  assert.equal(scene.edges.length, 1);
  assert.equal(scene.projection.visiblePeople, 4);
  assert.match(scene.projection.rule, /strict condition L > 2/);
  assert.match(scene.notes.join(" "), /not a direct route/i);
});

test("birthplace scene is honest when a GEDCOM has no BIRT.PLAC values", () => {
  const document = fixtureDocument();
  document.people.forEach((person) => {
    person.birth_place = null;
  });
  const scene = buildBirthplaceClusterScene({ document, theme: "light" });

  assert.equal(scene.projection.visiblePeople, 0);
  assert.equal(scene.nodes.length, 1);
  assert.match(scene.nodes[0]?.label ?? "", /No BIRT\.PLAC/);
});

function fixtureDocument(): CanonicalDocument {
  const person = (id: string, place: string | null) => ({
    id,
    display_name: id,
    sex: null,
    birth_place: place,
    parent_families: [],
    spouse_families: [],
    date_range: null,
  });
  return {
    schema_version: 1,
    people: [
      person("@a1@", "Jerusalem"),
      person("@a2@", "  Jerusalem  "),
      person("@b1@", "Alexandria"),
      person("@b2@", "Alexandria"),
      person("@c1@", null),
      person("@c2@", null),
      person("@c3@", null),
    ],
    families: [
      {
        id: "@f1@",
        husband_id: "@a1@",
        wife_id: "@b1@",
        child_ids: ["@c1@"],
        date_range: null,
      },
      {
        id: "@f2@",
        husband_id: "@a2@",
        wife_id: "@b1@",
        child_ids: ["@c2@"],
        date_range: null,
      },
      {
        id: "@f3@",
        husband_id: "@a1@",
        wife_id: "@b2@",
        child_ids: ["@c3@"],
        date_range: null,
      },
    ],
    analysis: {
      people: 7,
      families: 3,
      relationship_links: 9,
      disconnected_family_groups: 1,
      generation_depth: 1,
      widest_generation: 4,
      largest_sibling_group: 1,
      people_with_multiple_spouses: 1,
      people_in_multiple_spouse_families: 3,
      half_sibling_structures: 2,
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
