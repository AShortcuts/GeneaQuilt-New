import assert from "node:assert/strict";
import test from "node:test";

import type { CanonicalDocument, CanonicalPerson } from "../../../domain/schema.ts";
import { findPersonNodeOverlaps } from "../../diagram/nodeGeometry.ts";
import { buildAreaAdaptiveScene, buildRootedDescendantTree } from "./AreaAdaptiveAdapter.ts";

const document = fixtureDocument();

test("area-adaptive projection is descendants-only and omits repeated tree edges explicitly", () => {
  const tree = buildRootedDescendantTree(document, "@root@");

  assert.equal(tree.nodesByPerson.size, 10);
  assert.ok(!tree.nodesByPerson.has("@spouse@"));
  assert.ok(tree.excludedSpouseIds.has("@spouse@"));
  assert.equal(tree.omittedEdges.length, 1);
  assert.equal(tree.omittedEdges[0]?.childPersonId, "@shared@child@");
});

test("monotone local folding adapts leaf siblings without folding internal subtrees", () => {
  const wide = buildAreaAdaptiveScene(
    { document, focalPersonId: "@root@", theme: "light" },
    { width: 1200, height: 500 },
  );
  const tall = buildAreaAdaptiveScene(
    { document, focalPersonId: "@root@", theme: "light" },
    { width: 420, height: 900 },
  );
  const widePositions = positionsByRecord(wide);
  const tallPositions = positionsByRecord(tall);
  const rootChildren = Array.from({ length: 8 }, (_, index) => `@child-${index}@`);
  const wideChildRows = new Set(
    wide.nodes.filter((node) => rootChildren.includes(node.recordId ?? "")).map((node) => node.y),
  );
  const tallChildRows = new Set(
    tall.nodes.filter((node) => rootChildren.includes(node.recordId ?? "")).map((node) => node.y),
  );

  assert.notDeepEqual(widePositions, tallPositions);
  assert.ok(tallChildRows.size > wideChildRows.size);
  assert.equal(findPersonNodeOverlaps(wide.nodes).length, 0);
  assert.equal(findPersonNodeOverlaps(tall.nodes).length, 0);
  for (const edge of wide.edges) {
    assert.ok(edge.points[0]!.y < edge.points.at(-1)!.y);
  }
  for (const edge of tall.edges) {
    assert.ok(edge.points[0]!.y < edge.points.at(-1)!.y);
  }
  const tallInternalChildren = ["@child-0@", "@child-1@"].map(
    (personId) => tall.nodes.find((node) => node.recordId === personId)?.y,
  );
  assert.equal(tallInternalChildren[0], tallInternalChildren[1]);
  assert.match(wide.projection.rule, /only consecutive leaf siblings/);
  assert.match(wide.projection.rule, /maximizes fitted node-area use/);
  assert.match(wide.notes.join(" "), /non-leaf branches are never folded/);
  assert.match(wide.notes.join(" "), /requires a tree/);
});

function positionsByRecord(scene: ReturnType<typeof buildAreaAdaptiveScene>) {
  return scene.nodes.map((node) => [node.recordId, node.x, node.y]);
}

function fixtureDocument(): CanonicalDocument {
  const people: CanonicalPerson[] = [
    person("@root@", "Root", "M", [], ["@root-family@"]),
    person("@spouse@", "Spouse", "F", [], ["@root-family@"]),
    ...Array.from({ length: 8 }, (_, index) =>
      person(
        `@child-${index}@`,
        `Child ${index}`,
        index % 2 ? "F" : "M",
        ["@root-family@"],
        [`@branch-${index}@`],
      ),
    ),
    person("@shared@child@", "Shared descendant", "M", ["@branch-0@", "@branch-1@"], []),
    ...Array.from({ length: 8 }, (_, index) =>
      person(
        `@branch-spouse-${index}@`,
        `Branch spouse ${index}`,
        index % 2 ? "M" : "F",
        [],
        [`@branch-${index}@`],
      ),
    ),
  ];
  people.find((entry) => entry.id === "@shared@child@")!.parent_families[1]!.relationship =
    "adopted";
  return {
    schema_version: 1,
    people,
    families: [
      family(
        "@root-family@",
        "@root@",
        "@spouse@",
        Array.from({ length: 8 }, (_, index) => `@child-${index}@`),
      ),
      ...Array.from({ length: 8 }, (_, index) =>
        family(
          `@branch-${index}@`,
          index % 2 ? `@branch-spouse-${index}@` : `@child-${index}@`,
          index % 2 ? `@child-${index}@` : `@branch-spouse-${index}@`,
          index < 2 ? ["@shared@child@"] : [],
        ),
      ),
    ],
    analysis: {
      people: people.length,
      families: 9,
      relationship_links: 28,
      disconnected_family_groups: 1,
      generation_depth: 3,
      widest_generation: 8,
      largest_sibling_group: 8,
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
      family_records: 9,
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
