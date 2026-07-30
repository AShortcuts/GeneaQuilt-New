import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildAdamHomeProjection } from "./projection.ts";
import { parseCanonicalDocumentJson } from "./schemaValidation.ts";
import { projectionToDerivedGedcom } from "./toGedcom.ts";

test("the browser-derived projection GEDCOM contains only visualization records", async () => {
  const document = parseCanonicalDocumentJson(
    await readFile(
      new URL("../../public/data/adam-harishon.document.json", import.meta.url),
      "utf8",
    ),
  );
  const projection = buildAdamHomeProjection(document, "@73594872@", "@88484800@");
  const gedcom = projectionToDerivedGedcom(projection);

  assert.equal((gedcom.match(/ INDI$/gm) ?? []).length, 58);
  assert.equal((gedcom.match(/ FAM$/gm) ?? []).length, 23);
  assert.doesNotMatch(gedcom, /\bNOTE\b|\bOBJE\b|\bSOUR MacFamilyTree\b|19026626/);
  assert.match(gedcom, /1 NAME Adam/);
  assert.match(gedcom, /1 NAME Ya'akov Israel/);
  assert.match(gedcom, /0 TRLR\n$/);
});
