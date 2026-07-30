import assert from "node:assert/strict";
import test from "node:test";

import type { EditablePerson } from "../domain/editableDocument.ts";
import { renderPersonEditor } from "./personEditor.ts";

test("the person editor offers concise sex choices without discarding imported values", () => {
  const markup = renderPersonEditor(person({ sex: "X" }));

  assert.doesNotMatch(markup, /Nonbinary or another sex/);
  assert.doesNotMatch(markup, />Unknown</);
  assert.match(markup, />Not recorded</);
  assert.match(markup, />Female</);
  assert.match(markup, />Male</);
  assert.match(markup, /Imported GEDCOM value \(kept\)/);
  assert.match(markup, /name="preserved-sex" type="hidden" value="X"/);
  assert.equal(markup.match(/ selected/g)?.length, 1);
  assert.doesNotMatch(markup, /GEDCOM dates/);
});

test("the sibling action only appears after a parent family exists", () => {
  const withoutParent = renderPersonEditor(person());
  const withParent = renderPersonEditor(person({ parent_family_ids: ["@F1@"] }));

  assert.match(withoutParent, />Add parent</);
  assert.match(withoutParent, />Add spouse</);
  assert.match(withoutParent, />Add child</);
  assert.doesNotMatch(withoutParent, />Add sibling</);
  assert.match(withParent, />Add sibling</);
});

function person(overrides: Partial<EditablePerson> = {}): EditablePerson {
  return {
    id: "@I1@",
    display_name: "Miriam Cohen",
    given_names: "Miriam",
    surname: "Cohen",
    sex: "F",
    birth_date: "",
    birth_place: "",
    death_date: "",
    death_place: "",
    parent_family_ids: [],
    spouse_family_ids: [],
    ...overrides,
  };
}
