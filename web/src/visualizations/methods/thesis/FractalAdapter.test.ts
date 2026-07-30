import assert from "node:assert/strict";
import test from "node:test";

import type { CanonicalDocument } from "../../../domain/schema.ts";
import { buildFractalModel, buildFractalScene } from "./FractalAdapter.ts";

const document = fixtureDocument();

test("fractal subdivision repeats reconvergent people by descendant path", () => {
  const model = buildFractalModel(document, "@root@", 1000, 700);

  assert.equal(model.uniquePersonIds.size, 4);
  assert.equal(model.instances.length, 5);
  assert.equal(model.instances.filter((instance) => instance.personId === "@joined@").length, 2);
  assert.equal(
    model.instances.some((instance) => instance.personId === "@spouse@"),
    false,
  );
});

test("fractal rectangles remain inside their parent with alternating subdivision", () => {
  const model = buildFractalModel(document, "@root@", 1000, 700);
  const instanceById = new Map(model.instances.map((instance) => [instance.id, instance]));
  const rectangleById = new Map(
    model.rectangles.map((rectangle) => [rectangle.instanceId, rectangle]),
  );

  for (const rectangle of model.rectangles) {
    const parentId = instanceById.get(rectangle.instanceId)?.parentInstanceId;
    if (!parentId) continue;
    const parent = rectangleById.get(parentId);
    assert.ok(parent);
    assert.ok(rectangle.x >= (parent?.x ?? 0));
    assert.ok(rectangle.y >= (parent?.y ?? 0));
    assert.ok(rectangle.x + rectangle.width <= (parent?.x ?? 0) + (parent?.width ?? 0) + 1e-6);
    assert.ok(rectangle.y + rectangle.height <= (parent?.y ?? 0) + (parent?.height ?? 0) + 1e-6);
  }
});

test("fractal scene discloses its rooted, spouse-free, redundant grammar", () => {
  const scene = buildFractalScene(
    { document, theme: "light", focalPersonId: "@root@" },
    { width: 1200, height: 760 },
  );

  assert.equal(scene.edges.length, 0);
  assert.equal(scene.projection.visiblePeople, 4);
  assert.match(scene.projection.label, /5 rectangles/);
  assert.match(scene.notes.join(" "), /Spouses.*excluded/i);
  assert.match(scene.notes.join(" "), /repeated once per descendant path/i);
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
      person("@root@", "Root", "M"),
      person("@left@", "Left", "M"),
      person("@right@", "Right", "F"),
      person("@joined@", "Joined", "M"),
      person("@spouse@", "Unreached spouse", "F"),
    ],
    families: [
      {
        id: "@family-1@",
        husband_id: "@root@",
        wife_id: "@spouse@",
        child_ids: ["@left@", "@right@"],
        date_range: null,
      },
      {
        id: "@family-2@",
        husband_id: "@left@",
        wife_id: "@right@",
        child_ids: ["@joined@"],
        date_range: null,
      },
    ],
    analysis: {
      people: 5,
      families: 2,
      relationship_links: 8,
      disconnected_family_groups: 1,
      generation_depth: 2,
      widest_generation: 2,
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
      gedcom_version: "5.5.1",
      character_encoding: "UTF-8",
    },
  };
}
