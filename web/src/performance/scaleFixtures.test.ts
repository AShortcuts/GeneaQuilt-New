import assert from "node:assert/strict";
import test from "node:test";

import { createScaleFixture } from "./scaleFixtures.ts";

for (const size of [100, 1_000, 10_000]) {
  test(`the ${size.toLocaleString()}-person scale fixture is exact and internally linked`, () => {
    const fixture = createScaleFixture(size);
    const knownPeople = new Set(fixture.document.people.map((person) => person.id));
    const knownFamilies = new Set(fixture.document.families.map((family) => family.id));

    assert.equal(fixture.document.people.length, size);
    assert.equal(fixture.document.analysis.people, size);
    assert.ok(knownPeople.has(fixture.rootPersonId));
    assert.ok(knownPeople.has(fixture.deepestDescendantId));
    for (const family of fixture.document.families) {
      assert.ok(!family.husband_id || knownPeople.has(family.husband_id));
      assert.ok(!family.wife_id || knownPeople.has(family.wife_id));
      assert.ok(family.child_ids.every((childId) => knownPeople.has(childId)));
    }
    for (const person of fixture.document.people) {
      assert.ok(person.parent_families.every((link) => knownFamilies.has(link.family_id)));
      assert.ok(person.spouse_families.every((familyId) => knownFamilies.has(familyId)));
    }
  });
}

test("scale fixture generation is deterministic", () => {
  assert.deepEqual(createScaleFixture(250), createScaleFixture(250));
});
