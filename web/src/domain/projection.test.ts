import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildAdamHomeProjection, buildAvrahamComparisonProjection } from "./projection.ts";
import { parseCanonicalDocumentJson } from "./schemaValidation.ts";

const ADAM_ID = "@73594872@";
const AVRAHAM_ID = "@38103754@";
const YAAKOV_ID = "@88484800@";

async function loadAdamDocument() {
  const source = await readFile(
    new URL("../../public/data/adam-harishon.document.json", import.meta.url),
    "utf8",
  );
  return parseCanonicalDocumentJson(source);
}

test("the built-in canonical document matches its audited counts", async () => {
  const document = await loadAdamDocument();

  assert.equal(document.people.length, 535);
  assert.equal(document.families.length, 243);
  assert.equal(document.analysis.disconnected_family_groups, 3);
  assert.equal(document.analysis.generation_depth, 53);
  assert.equal(document.analysis.blocks_interactive, false);
  assert.deepEqual(document.source_profile.media_files, []);
});

test("the home projection follows a documented lineage rule and retains real records", async () => {
  const document = await loadAdamDocument();
  const projection = buildAdamHomeProjection(document, ADAM_ID, YAAKOV_ID);
  const visiblePeople = new Set(projection.people.map((person) => person.id));
  const visibleFamilies = new Set(projection.families.map((family) => family.id));
  const yaakovChildIds = new Set(
    document.families
      .filter((family) => family.husband_id === YAAKOV_ID || family.wife_id === YAAKOV_ID)
      .flatMap((family) => family.child_ids),
  );
  const grandchildFamilies = document.families.filter(
    (family) =>
      (family.husband_id && yaakovChildIds.has(family.husband_id)) ||
      (family.wife_id && yaakovChildIds.has(family.wife_id)),
  );
  const grandchildIds = new Set(grandchildFamilies.flatMap((family) => family.child_ids));

  assert.equal(projection.total_people, 535);
  assert.equal(projection.people.length, 58);
  assert.equal(projection.families.length, 23);
  assert.equal(projection.descendant_generations, 1);
  assert.equal(projection.focus_person_id, YAAKOV_ID);
  assert.ok(visiblePeople.has(ADAM_ID));
  assert.ok(visiblePeople.has(AVRAHAM_ID));
  assert.ok(visiblePeople.has(YAAKOV_ID));
  assert.ok([...yaakovChildIds].every((childId) => visiblePeople.has(childId)));
  assert.ok([...grandchildIds].every((grandchildId) => !visiblePeople.has(grandchildId)));
  assert.ok(grandchildFamilies.every((family) => !visibleFamilies.has(family.id)));
  assert.match(projection.rule, /shortest recorded lineage/i);
  assert.match(projection.rule, /children are the terminal generation/i);
});

test("the Avraham comparison sample is deterministic and limited to three generations", async () => {
  const document = await loadAdamDocument();
  const first = buildAvrahamComparisonProjection(document, AVRAHAM_ID);
  const second = buildAvrahamComparisonProjection(document, AVRAHAM_ID);

  assert.deepEqual(first, second);
  assert.equal(first.descendant_generations, 3);
  assert.ok(first.people.some((person) => person.display_name === "Avraham"));
  assert.ok(first.people.length < document.people.length);
});
