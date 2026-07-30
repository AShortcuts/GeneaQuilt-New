import assert from "node:assert/strict";
import test from "node:test";

import type {
  CanonicalDocument,
  CanonicalFamily,
  CanonicalPerson,
} from "../../../domain/schema.ts";
import {
  assignColumnTreeFacet,
  buildColumnTreeLayout,
  buildColumnTreeProjection,
  buildColumnTreeScene,
} from "./ColumnTreeAdapter.ts";

const document = fixtureDocument();

test("column tree creates a descendant spanning tree and reports reconvergence", () => {
  const projection = buildColumnTreeProjection(document, "@root@");

  assert.equal(projection.nodesByPerson.size, 6);
  assert.ok(!projection.nodesByPerson.has("@spouse@"));
  assert.ok(projection.excludedSpouseIds.has("@spouse@"));
  assert.equal(projection.omittedEdges.length, 1);
  assert.equal(projection.omittedEdges[0]?.childPersonId, "@shared@");
});

test("column facet uses recorded birthplace and preserves a separate missing column", () => {
  const assignment = assignColumnTreeFacet(
    document,
    new Set(document.people.map((person) => person.id)),
  );

  assert.equal(assignment.facet, "birthplace");
  assert.equal(assignment.fallbackUsed, false);
  assert.ok(assignment.columnKeys.includes("place:alpha"));
  assert.ok(assignment.columnKeys.includes("place:beta"));
  assert.ok(assignment.columnKeys.includes("place:unknown"));
  assert.equal(assignment.labels.get("place:unknown"), "Place not recorded");
});

test("column facet falls back to the GEDCOM SEX value without inventing places", () => {
  const noPlaces = fixtureDocument();
  noPlaces.people.forEach((person) => {
    person.birth_place = null;
  });
  const assignment = assignColumnTreeFacet(
    noPlaces,
    new Set(noPlaces.people.map((person) => person.id)),
  );

  assert.equal(assignment.facet, "sex");
  assert.equal(assignment.fallbackUsed, true);
  assert.deepEqual(assignment.columnKeys, ["sex:F", "sex:M"]);
});

test("V1 layout keeps incoming roots on the source-facing edge of each column subtree", () => {
  const projection = buildColumnTreeProjection(document, "@root@");
  const assignment = assignColumnTreeFacet(document, new Set(projection.nodesByPerson.keys()));
  const layout = buildColumnTreeLayout(projection, assignment);

  for (const subtree of layout.subtrees) {
    if (subtree.incomingDirection === "root") continue;
    const rootX = layout.positions.get(subtree.rootPersonId)!.x;
    const subtreeXs = subtree.personIds.map((personId) => layout.positions.get(personId)!.x);
    if (subtree.incomingDirection === "left") {
      assert.equal(rootX, Math.min(...subtreeXs));
    } else {
      assert.equal(rootX, Math.max(...subtreeXs));
    }
  }
});

test("rectangular-cladogram edges have at most one bend at the parent's height", () => {
  const scene = buildColumnTreeScene({ document, theme: "light", focalPersonId: "@root@" });
  const nodes = new Map(
    scene.nodes.flatMap((node) => (node.recordId ? [[node.recordId, node]] : [])),
  );

  for (const edge of scene.edges) {
    assert.ok(edge.points.length === 2 || edge.points.length === 3);
    const [parentId, childId] = edge.id.replace("column-tree:edge:", "").split(":");
    const parent = nodes.get(`@${parentId!.replaceAll("@", "")}@`) ?? nodes.get(parentId!);
    const child = nodes.get(`@${childId!.replaceAll("@", "")}@`) ?? nodes.get(childId!);
    assert.ok(parent);
    assert.ok(child);
    assert.ok(child.y > parent.y);
    if (edge.points.length === 3) {
      assert.equal(edge.points[1]?.y, edge.points[0]?.y);
    }
  }
  assert.match(scene.projection.rule, /at most one bend/);
  assert.match(scene.notes.join(" "), /does not claim.*minimum-crossing/);
});

function fixtureDocument(): CanonicalDocument {
  const people: CanonicalPerson[] = [
    person("@root@", "Root", "M", "Alpha", [], ["@root-family@"]),
    person("@spouse@", "Spouse", "F", "Beta", [], ["@root-family@"]),
    person("@left@", "Left", "F", "Beta", ["@root-family@"], ["@left-family@"]),
    person("@right@", "Right", "M", "Alpha", ["@root-family@"], ["@right-family@"]),
    person("@missing@", "Missing place", "F", null, ["@root-family@"], []),
    person(
      "@shared@",
      "Shared",
      "M",
      "Beta",
      ["@left-family@", "@right-family@"],
      ["@deep-family@"],
    ),
    person("@deep@", "Deep", "F", "Beta", ["@deep-family@"], []),
    person("@branch-spouse@", "Branch spouse", "F", "Alpha", [], ["@left-family@"]),
    person("@right-spouse@", "Right spouse", "F", "Beta", [], ["@right-family@"]),
    person("@deep-spouse@", "Deep spouse", "M", "Alpha", [], ["@deep-family@"]),
  ];
  return {
    schema_version: 1,
    people,
    families: [
      family("@root-family@", "@root@", "@spouse@", ["@left@", "@right@", "@missing@"]),
      family("@left-family@", "@left@", "@branch-spouse@", ["@shared@"]),
      family("@right-family@", "@right@", "@right-spouse@", ["@shared@"]),
      family("@deep-family@", "@deep-spouse@", "@shared@", ["@deep@"]),
    ],
    analysis: {
      people: people.length,
      families: 4,
      relationship_links: 14,
      disconnected_family_groups: 1,
      generation_depth: 4,
      widest_generation: 3,
      largest_sibling_group: 3,
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
      family_records: 4,
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
  birthPlace: string | null,
  parentFamilies: string[],
  spouseFamilies: string[],
): CanonicalPerson {
  return {
    id,
    display_name: displayName,
    sex,
    birth_place: birthPlace,
    parent_families: parentFamilies.map((familyId, index) => ({
      family_id: familyId,
      relationship: index ? "adopted" : "birth",
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
): CanonicalFamily {
  return {
    id,
    husband_id: husbandId,
    wife_id: wifeId,
    child_ids: childIds,
    date_range: null,
  };
}
